import type {
  GroupDirectoryItem,
  GroupDirectoryOrder,
  GroupDirectoryPage,
  GroupStatus,
} from "../../../../packages/contracts/src/index";

export interface DirectoryQuery {
  q: string;
  order: GroupDirectoryOrder;
  status?: GroupStatus;
  agentEnabled?: boolean;
  cursor?: string;
}
export interface DirectoryPosition {
  groupId: string;
  offset: number;
  scrollY: number;
}
type RequestKind = "initial" | "refresh" | "more" | "probe";
export interface DirectoryState {
  input: string;
  q: string;
  order: GroupDirectoryOrder;
  status?: GroupStatus;
  agentEnabled?: boolean;
  composing: boolean;
  items: GroupDirectoryItem[];
  pages: number;
  nextCursor: string | null;
  initialized: boolean;
  loading: RequestKind | null;
  stale: boolean;
  error: { kind: "initial" | "refresh" | "more"; value: unknown } | null;
  position: DirectoryPosition | null;
  notice: string | null;
  /** Only a successfully applied first-page read can confirm a range refresh. */
  snapshot: { seq: number; revision: number; path: string } | null;
}
export interface DirectoryScheduler {
  set(callback: () => void, delay: number): unknown;
  clear(timer: unknown): void;
}
const scheduler: DirectoryScheduler = {
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};
const initialState = (): DirectoryState => ({
  input: "",
  q: "",
  order: "desc",
  composing: false,
  items: [],
  pages: 0,
  nextCursor: null,
  initialized: false,
  loading: null,
  stale: false,
  error: null,
  position: null,
  notice: null,
  snapshot: null,
});
function signature(page: GroupDirectoryPage): string {
  // Opaque cursors need not have a stable encoding. Compare their presence and
  // the actual first-page contents, never splice a probe into a cached tail.
  return JSON.stringify({ items: page.items, more: page.nextCursor !== null });
}
function mergeById(
  existing: GroupDirectoryItem[],
  incoming: GroupDirectoryItem[],
): GroupDirectoryItem[] {
  const items = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) items.set(item.id, item);
  return [...items.values()];
}

export function createGroupDirectoryController(
  loadPage: (
    query: DirectoryQuery,
    signal: AbortSignal,
  ) => Promise<GroupDirectoryPage>,
  timers: DirectoryScheduler = scheduler,
  readSequence: () => number = () => 0,
) {
  let state = initialState();
  let running = false;
  let visible = false;
  let generation = 0;
  let invalidation = 0;
  let firstSignature = "";
  let debounce: unknown;
  let flight: {
    kind: RequestKind;
    controller: AbortController;
    promise: Promise<void>;
  } | null = null;
  const listeners = new Set<() => void>();
  const update = (changes: Partial<DirectoryState>) => {
    state = { ...state, ...changes };
    for (const listener of listeners) listener();
  };
  const pendingQuery = () => state.composing || state.input.trim() !== state.q;
  const currentQuery = (): DirectoryQuery => ({
    q: state.q,
    order: state.order,
    ...(state.status !== undefined ? { status: state.status } : {}),
    ...(state.agentEnabled !== undefined
      ? { agentEnabled: state.agentEnabled }
      : {}),
  });
  const clearDebounce = () => {
    if (debounce !== undefined) timers.clear(debounce);
    debounce = undefined;
  };
  const cancel = () => {
    generation++;
    flight?.controller.abort();
    flight = null;
    if (state.loading) update({ loading: null });
  };

  async function load(kind: RequestKind): Promise<void> {
    if (!running || !visible || pendingQuery()) return;
    if (flight) return flight.promise;
    if (kind === "more" && (state.stale || !state.nextCursor)) return;
    const requestGeneration = ++generation;
    const beforeInvalidation = invalidation;
    const coversSeq = readSequence();
    const cursor = kind === "more" ? state.nextCursor! : undefined;
    const query: DirectoryQuery = {
      ...currentQuery(),
      ...(cursor ? { cursor } : {}),
    };
    const controller = new AbortController();
    update({ loading: kind });
    let followUp = false;
    const promise = (async () => {
      try {
        // Install the flight before invoking even a synchronously failing loader.
        await Promise.resolve();
        if (controller.signal.aborted) return;
        const page = await loadPage(query, controller.signal);
        if (
          !running ||
          generation !== requestGeneration ||
          controller.signal.aborted
        )
          return;
        if (beforeInvalidation !== invalidation) {
          // A relevant change arrived after this read began. Keep the whole
          // cached pagination intact until one fresh first-page read succeeds.
          followUp = true;
          return;
        }
        if (kind === "probe") {
          if (signature(page) !== firstSignature) update({ stale: true });
          if (state.error?.kind === "refresh") update({ error: null });
        } else if (kind === "more") {
          if (page.nextCursor !== null && page.nextCursor === cursor)
            throw new Error("分页游标没有推进，请刷新列表后重试。");
          update({
            items: mergeById(state.items, page.items),
            pages: state.pages + 1,
            nextCursor: page.nextCursor,
            error: null,
          });
        } else {
          firstSignature = signature(page);
          update({
            items: mergeById([], page.items),
            pages: 1,
            nextCursor: page.nextCursor,
            initialized: true,
            error: null,
            stale: false,
            snapshot: {
              seq: coversSeq,
              revision: (state.snapshot?.revision ?? 0) + 1,
              path: groupDirectoryPath(query),
            },
            notice:
              state.position &&
              !page.items.some((item) => item.id === state.position!.groupId)
                ? "原群未出现在当前已加载结果中，可继续加载或调整条件。"
                : null,
          });
        }
      } catch (value) {
        if (
          running &&
          generation === requestGeneration &&
          !controller.signal.aborted &&
          !(kind === "probe" && state.error?.kind === "more")
        )
          update({
            error: {
              kind:
                kind === "more"
                  ? "more"
                  : state.initialized
                    ? "refresh"
                    : "initial",
              value,
            },
          });
      } finally {
        if (generation === requestGeneration) {
          flight = null;
          update({ loading: null });
          if (followUp && running && visible) void load("refresh");
        }
      }
    })();
    flight = { kind, controller, promise };
    return promise;
  }

  const apply = (query: Omit<DirectoryQuery, "cursor">) => {
    if (directoryQueryIdentity(query) === directoryQueryIdentity(state)) {
      if (!state.initialized) void load("initial");
      return;
    }
    cancel();
    firstSignature = "";
    update({
      q: query.q,
      order: query.order,
      status: query.status,
      agentEnabled: query.agentEnabled,
      items: [],
      pages: 0,
      nextCursor: null,
      initialized: false,
      stale: false,
      error: null,
      position: null,
      notice: null,
      snapshot: null,
    });
    void load("initial");
  };
  const changeConditions = (
    changes: Partial<Pick<DirectoryQuery, "order" | "status" | "agentEnabled">>,
  ) => {
    clearDebounce();
    apply({
      ...currentQuery(),
      q: state.composing ? state.q : state.input.trim(),
      ...changes,
    });
  };
  const poll = (): Promise<void> => {
    if (
      !running ||
      !visible ||
      pendingQuery() ||
      flight ||
      (state.stale && state.pages > 1)
    )
      return Promise.resolve();
    if (!state.initialized)
      return state.error ? Promise.resolve() : load("initial");
    return load(state.pages > 1 ? "probe" : "refresh");
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      running = true;
      if (visible) void poll();
    },
    stop() {
      running = false;
      clearDebounce();
      cancel();
    },
    setVisible(value: boolean) {
      visible = value;
      if (!value) cancel();
      else if (!pendingQuery()) void poll();
    },
    setInput(input: string, composing = false) {
      clearDebounce();
      update({ input, composing });
      if (pendingQuery()) cancel();
      if (composing) return;
      if (input.trim() === state.q) {
        if (!state.initialized) void load("initial");
        return;
      }
      debounce = timers.set(() => {
        debounce = undefined;
        apply({ ...currentQuery(), q: state.input.trim() });
      }, 250);
    },
    setOrder(order: GroupDirectoryOrder) {
      changeConditions({ order });
    },
    setStatus(status: GroupStatus | undefined) {
      changeConditions({ status });
    },
    setAgentEnabled(agentEnabled: boolean | undefined) {
      changeConditions({ agentEnabled });
    },
    clearSearch() {
      clearDebounce();
      update({ input: "", composing: false });
      apply({ ...currentQuery(), q: "" });
    },
    resetConditions() {
      clearDebounce();
      update({ input: "", composing: false });
      apply({ q: "", order: "desc" });
    },
    refresh(): Promise<void> {
      if (pendingQuery()) return Promise.resolve();
      if (flight?.kind === "more" || flight?.kind === "probe") cancel();
      return load(state.initialized ? "refresh" : "initial");
    },
    loadMore: () => load("more"),
    poll,
    invalidate() {
      invalidation++;
      if (state.initialized) update({ stale: true });
      if (flight?.kind === "more" || flight?.kind === "probe") cancel();
      if (visible && state.pages <= 1 && !flight)
        void load(state.initialized ? "refresh" : "initial");
    },
    rememberPosition(position: DirectoryPosition | null) {
      update({ position });
    },
    setNotice(notice: string | null) {
      update({ notice });
    },
  };
}
export type GroupDirectoryController = ReturnType<
  typeof createGroupDirectoryController
>;

const directoryPageSize = 20;
/** Identity of the complete server query, independent of pagination or requests. */
export function directoryQueryIdentity(query: DirectoryQuery): string {
  return JSON.stringify({
    q: query.q.trim(),
    order: query.order,
    status: query.status ?? null,
    agentEnabled: query.agentEnabled ?? null,
    pageSize: directoryPageSize,
  });
}

export function groupDirectoryPath(query: DirectoryQuery): string {
  const params = new URLSearchParams({
    pageSize: String(directoryPageSize),
    order: query.order,
    q: query.q.trim(),
  });
  if (query.status !== undefined) params.set("status", query.status);
  if (query.agentEnabled !== undefined)
    params.set("agentEnabled", String(query.agentEnabled));
  if (query.cursor) params.set("cursor", query.cursor);
  return `/api/group-directory?${params}`;
}
export function affectsGroupDirectory(type: string): boolean {
  return [
    "group_changed",
    "account_terminal",
    "agent_run",
    "sequence_run",
  ].includes(type);
}
