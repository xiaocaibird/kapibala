import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import type { PlatformEvent } from "../api/schemas";
import { useLive } from "../state/live";
import { AttentionCandidates, type SnapshotEvidence } from "./model";
import { isDefinitiveBusinessEvent } from "./events";
import {
  canFullyFitViewport,
  isPresented,
  ownBrowserAttention,
  pageHasAttention,
} from "./browser";
export type { SnapshotEvidence } from "./model";
export { isDefinitiveBusinessEvent } from "./events";

interface ScopedEvent {
  event: PlatformEvent;
  backgroundSeq: number;
}
function retainLatest(items: ScopedEvent[], next: ScopedEvent): ScopedEvent[] {
  const identity = (event: PlatformEvent) =>
    JSON.stringify([
      event.type,
      event.payload.id ??
        event.payload.accountId ??
        event.payload.jobId ??
        event.payload.runId ??
        event.payload.sequenceId ??
        event.payload.groupId ??
        event.seq,
      event.payload.ordinal ?? event.payload.stepIndex ?? "",
      event.payload.changeKind ?? "",
    ]);
  const key = identity(next.event);
  const index = items.findIndex((item) => identity(item.event) === key);
  if (index < 0) return [...items, next];
  const previous = items[index]!;
  const changedFields = [
    ...new Set([
      ...(Array.isArray(previous.event.payload.changedFields)
        ? previous.event.payload.changedFields
        : []),
      ...(Array.isArray(next.event.payload.changedFields)
        ? next.event.payload.changedFields
        : []),
    ]),
  ];
  const merged = {
    event: {
      ...next.event,
      payload: {
        ...next.event.payload,
        ...(changedFields.length ? { changedFields } : {}),
      },
    },
    backgroundSeq: Math.max(previous.backgroundSeq, next.backgroundSeq),
  };
  return [...items.slice(0, index), ...items.slice(index + 1), merged];
}
interface ScopeState {
  events: readonly ScopedEvent[];
  startSeq: number | null;
  setPending: (owner: symbol, pending: boolean | null) => void;
  manualIds: Set<string>;
}
const ScopeContext = createContext<ScopeState | null>(null);

export function PageAttentionScope(props: {
  scopeKey: string;
  title: string;
  acceptEvent?: (event: PlatformEvent) => boolean;
  children: ReactNode;
}) {
  return <ScopeLifetime key={props.scopeKey} {...props} />;
}

function ScopeLifetime({
  title,
  acceptEvent,
  children,
}: {
  title: string;
  acceptEvent?: (event: PlatformEvent) => boolean;
  children: ReactNode;
}) {
  const { subscribe, markScope } = useLive();
  const [events, setEvents] = useState<ScopedEvent[]>([]);
  const [startSeq, setStartSeq] = useState<number | null>(null);
  const [markerError, setMarkerError] = useState(false);
  const pending = useRef(new Map<symbol, boolean>());
  const manualIds = useRef(new Set<string>());
  const chrome = useRef<ReturnType<typeof ownBrowserAttention> | null>(null);
  const start = useRef<number | null>(null);
  const accepts = useRef(acceptEvent);
  accepts.current = acceptEvent;
  const setPending = useCallback((owner: symbol, value: boolean | null) => {
    if (value === null) pending.current.delete(owner);
    else pending.current.set(owner, value);
    chrome.current?.update([...pending.current.values()].some(Boolean));
  }, []);
  useLayoutEffect(() => {
    chrome.current = ownBrowserAttention(title);
    chrome.current.update([...pending.current.values()].some(Boolean));
    return () => {
      chrome.current?.dispose();
      chrome.current = null;
    };
  }, [title]);
  useEffect(
    () =>
      subscribe((event) => {
        if (accepts.current && !accepts.current(event)) return;
        if (start.current !== null && event.seq <= start.current) return;
        setEvents((items) =>
          retainLatest(items, {
            event,
            backgroundSeq: !pageHasAttention() ? event.seq : -1,
          }),
        );
      }),
    [subscribe],
  );
  useEffect(() => {
    if (start.current !== null) return;
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    const establish = () => {
      void markScope(controller.signal)
        .then((seq) => {
          if (controller.signal.aborted) return;
          start.current = seq;
          setStartSeq(seq);
          setEvents((items) => items.filter((item) => item.event.seq > seq));
          setMarkerError(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setMarkerError(true);
          retry = setTimeout(establish, 3000);
        });
    };
    establish();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [markScope]);
  const value = useMemo(
    () => ({ events, startSeq, setPending, manualIds: manualIds.current }),
    [events, startSeq, setPending],
  );
  return (
    <ScopeContext.Provider value={value}>
      {markerError && (
        <p className="attention-status" role="status">
          实时提醒起点暂未建立；页面数据仍会更新，连接恢复后重新建立提醒。
        </p>
      )}
      {children}
    </ScopeContext.Provider>
  );
}

function useScope(): ScopeState {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("PageAttentionScope is required");
  return scope;
}

export function useManualMessageExclusion() {
  const { manualIds } = useScope();
  return useMemo(
    () => ({
      register: (clientMsgId: string) => {
        manualIds.add(clientMsgId);
      },
      isExcluded: (event: PlatformEvent) =>
        typeof event.payload.clientMsgId === "string" &&
        manualIds.has(event.payload.clientMsgId),
    }),
    [manualIds],
  );
}

interface CollectionOptions {
  targetId: string;
  label: string;
  eventKey: (event: PlatformEvent) => string | null;
  definitiveEvent?: (event: PlatformEvent) => boolean;
  versions: Readonly<Record<string, string>>;
  evidence: SnapshotEvidence | null;
  ready: boolean;
  refresh?: () => Promise<void>;
  /** Removed/filtered records can be confirmed as a RANGE update after a fresh
   * successful result and its visible summary, never as individual records read. */
  rangeFallback?: boolean;
  renderRangeSummary?: () => ReactNode;
  /** A finite summary for oversized current content. It needs a SECOND explicit
   * confirmation after rendering; it never claims the whole text was read. */
  renderSummary?: (key: string) => ReactNode;
}

interface ViewIntent {
  seq: number;
  revision: number;
  key: string | null;
  refreshed: boolean;
}

export function useAttentionCollection(options: CollectionOptions) {
  const scope = useScope();
  const model = useRef(new AttentionCandidates());
  const owner = useRef(Symbol(options.targetId));
  const elements = useRef(new Map<string, HTMLElement>());
  const refCallbacks = useRef(
    new Map<string, (element: HTMLElement | null) => void>(),
  );
  const summary = useRef<HTMLDivElement>(null);
  const rangeSummary = useRef<HTMLDivElement>(null);
  const current = useRef(options);
  current.current = options;
  const [revision, render] = useState(0);
  const [busy, setBusy] = useState(false);
  const [intent, setIntent] = useState<ViewIntent | null>(null);
  const [preview, setPreview] = useState<{ key: string; seq: number } | null>(
    null,
  );
  const [rangePreview, setRangePreview] = useState<{
    seq: number;
    revision: number;
    path: string;
    keys: string[];
  } | null>(null);
  const alive = useRef(true);
  const visibility = useRef("");
  const previousVersions = useRef<Readonly<Record<string, string>>>({});
  const notify = useCallback(() => render((value) => value + 1), []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (scope.startSeq === null) return;
    let changed = false;
    for (const item of scope.events) {
      const key = options.eventKey(item.event);
      if (key !== null)
        changed =
          model.current.receive(
            key,
            item.event.seq,
            scope.startSeq,
            item.backgroundSeq >
              Math.max(scope.startSeq, model.current.seenThrough(key)),
            previousVersions.current[key],
            (options.definitiveEvent ?? isDefinitiveBusinessEvent)(item.event),
          ) || changed;
    }
    if (options.ready) {
      changed =
        model.current.reconcile(options.versions, options.evidence) || changed;
      previousVersions.current = options.versions;
    }
    if (changed) notify();
  }, [
    scope.events,
    scope.startSeq,
    options.eventKey,
    options.definitiveEvent,
    options.ready,
    options.versions,
    options.evidence,
    notify,
  ]);

  const tabPending = model.current.tabPending;
  useLayoutEffect(() => {
    scope.setPending(owner.current, tabPending);
  }, [scope.setPending, tabPending]);
  useLayoutEffect(() => {
    const id = owner.current;
    return () => scope.setPending(id, null);
  }, [scope.setPending]);

  // Geometry changes update only presentation, never confirmation. In particular,
  // focus, automatic scrolling and IntersectionObserver cannot consume a candidate.
  useEffect(() => {
    let frame = 0;
    const check = () => {
      if (!pageHasAttention() && model.current.promoteBackground()) notify();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const signature = [...model.current.pending.keys()]
          .filter((key) => isPresented(elements.current.get(key)))
          .join("|");
        if (signature !== visibility.current) {
          visibility.current = signature;
          notify();
        }
      });
    };
    window.addEventListener("focus", check);
    window.addEventListener("blur", check);
    window.addEventListener("resize", check);
    document.addEventListener("scroll", check, true);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("focus", check);
      window.removeEventListener("blur", check);
      window.removeEventListener("resize", check);
      document.removeEventListener("scroll", check, true);
      document.removeEventListener("visibilitychange", check);
    };
  }, [notify]);

  const interaction = useCallback(
    (key: string, event: SyntheticEvent<HTMLElement>) => {
      if (!event.nativeEvent.isTrusted || !current.current.ready) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input,textarea,select,[contenteditable=true],[data-attention-ignore]",
        )
      )
        return;
      if (
        event.type === "keydown" &&
        !(
          "key" in event &&
          [
            "Enter",
            " ",
            "ArrowDown",
            "ArrowUp",
            "PageDown",
            "PageUp",
            "Home",
            "End",
          ].includes(String(event.key))
        )
      )
        return;
      if (!isPresented(elements.current.get(key))) return;
      if (
        model.current.confirm(
          key,
          current.current.evidence,
          Number.MAX_SAFE_INTEGER,
        )
      )
        notify();
    },
    [notify],
  );

  const itemProps = useCallback(
    (key: string) => {
      let ref = refCallbacks.current.get(key);
      if (!ref) {
        ref = (element: HTMLElement | null) => {
          if (element) elements.current.set(key, element);
          else elements.current.delete(key);
        };
        refCallbacks.current.set(key, ref);
      }
      return {
        ref,
        onClickCapture: (event: SyntheticEvent<HTMLElement>) =>
          interaction(key, event),
        onKeyDownCapture: (event: SyntheticEvent<HTMLElement>) =>
          interaction(key, event),
        onWheelCapture: (event: SyntheticEvent<HTMLElement>) =>
          interaction(key, event),
      };
    },
    [interaction],
  );

  const locate = useCallback(async () => {
    if (busy || !pageHasAttention()) return;
    const candidates = [...model.current.pending.values()];
    if (!candidates.length) return;
    const key =
      candidates.find((value) => elements.current.has(value.key))?.key ?? null;
    const next: ViewIntent = {
      seq: Math.max(...candidates.map((value) => value.seq)),
      revision: current.current.evidence?.revision ?? -1,
      key,
      refreshed: false,
    };
    setBusy(true);
    try {
      if (current.current.refresh) {
        await current.current.refresh();
        next.refreshed = true;
      }
      if (alive.current) setIntent(next);
    } finally {
      if (alive.current) setBusy(false);
    }
  }, [busy]);

  useEffect(() => {
    if (!intent) return;
    let frame = 0;
    const key =
      intent.key ??
      [...model.current.pending.keys()].find((candidate) =>
        elements.current.has(candidate),
      ) ??
      null;
    const target = key ? elements.current.get(key) : null;
    const oversized = !!target && !canFullyFitViewport(target);
    if (!oversized)
      target?.scrollIntoView({ block: "center", behavior: "instant" });
    frame = requestAnimationFrame(() => {
      if (!alive.current) return;
      if (!pageHasAttention()) {
        setIntent(null);
        return;
      }
      if (
        !current.current.ready ||
        !current.current.evidence ||
        (intent.refreshed &&
          current.current.evidence.revision <= intent.revision)
      ) {
        setIntent(null);
        return;
      }
      let changed = false;
      if (
        key &&
        !(options.rangeFallback && key === options.targetId) &&
        isPresented(elements.current.get(key))
      ) {
        changed = model.current.confirm(
          key,
          current.current.evidence,
          intent.seq,
        );
      } else if (
        key &&
        oversized &&
        options.renderSummary &&
        current.current.evidence.seq >=
          (model.current.pending.get(key)?.seq ?? Infinity)
      ) {
        setPreview({ key, seq: intent.seq });
        summary.current?.scrollIntoView({
          block: "center",
          behavior: "instant",
        });
      }
      if (
        options.rangeFallback &&
        intent.refreshed &&
        options.renderRangeSummary
      ) {
        const keys = [...model.current.pending.values()]
          .filter(
            (value) =>
              value.seq <= intent.seq &&
              value.seq <= current.current.evidence!.seq &&
              (!elements.current.has(value.key) ||
                value.key === options.targetId),
          )
          .map((value) => value.key);
        if (keys.length) {
          setRangePreview({
            seq: intent.seq,
            revision: current.current.evidence.revision,
            path: current.current.evidence.path,
            keys,
          });
          summary.current?.scrollIntoView({
            block: "center",
            behavior: "instant",
          });
        }
      }
      if (changed) notify();
      setIntent(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    intent,
    options.ready,
    options.evidence,
    options.rangeFallback,
    options.renderSummary,
    options.renderRangeSummary,
    options.targetId,
    notify,
  ]);

  const candidates = [...model.current.pending.values()];
  const pending = candidates.length > 0;
  const needsEntry =
    pending &&
    (tabPending ||
      candidates.some(
        (value) =>
          !options.ready ||
          !options.evidence ||
          options.evidence.seq < value.seq ||
          !isPresented(elements.current.get(value.key)),
      ));
  const previewContent = preview ? options.renderSummary?.(preview.key) : null;
  const rangeContent = rangePreview ? options.renderRangeSummary?.() : null;
  const notice = needsEntry ? (
    <div
      className="attention-notice"
      ref={summary}
      role="status"
      data-attention-ignore
    >
      <span>
        {options.label.replace(/[。；]+$/, "")}
        {!/(更新|变化)/.test(options.label) && "有更新"}
        {options.rangeFallback ? "；刷新后确认当前范围。" : "。"}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={(event) => {
          if (!event.nativeEvent.isTrusted) return;
          void locate().catch(() => {
            /* Existing page error remains the source of truth. */
          });
        }}
      >
        {busy ? "正在核对…" : options.refresh ? "刷新并查看更新" : "查看更新"}
      </button>
      {preview &&
        previewContent != null &&
        previewContent !== false &&
        model.current.pending.has(preview.key) && (
          <div className="attention-summary">
            {previewContent}
            <button
              type="button"
              onClick={(event) => {
                if (!event.nativeEvent.isTrusted) return;
                if (
                  current.current.ready &&
                  isPresented(summary.current) &&
                  model.current.confirm(
                    preview.key,
                    current.current.evidence,
                    preview.seq,
                  )
                ) {
                  setPreview(null);
                  notify();
                }
              }}
            >
              确认这条更新摘要
            </button>
          </div>
        )}
      {rangePreview &&
        rangeContent != null &&
        rangeContent !== false &&
        rangePreview.keys.some((key) => model.current.pending.has(key)) && (
          <div className="attention-summary" ref={rangeSummary}>
            {rangeContent}
            <button
              type="button"
              disabled={!options.ready}
              onClick={(event) => {
                const evidence = current.current.evidence;
                if (
                  !event.nativeEvent.isTrusted ||
                  !current.current.ready ||
                  !evidence ||
                  evidence.path !== rangePreview.path ||
                  evidence.revision < rangePreview.revision ||
                  !isPresented(rangeSummary.current)
                )
                  return;
                let changed = false;
                for (const key of rangePreview.keys)
                  changed =
                    model.current.confirm(key, evidence, rangePreview.seq) ||
                    changed;
                if (changed) {
                  setRangePreview(null);
                  notify();
                }
              }}
            >
              确认当前范围更新
            </button>
          </div>
        )}
    </div>
  ) : null;
  // Reading revision keeps model mutations tied to the React render that owns DOM.
  void revision;
  return { itemProps, notice, pending, locate };
}

export interface AttentionRegionProps {
  targetId: string;
  label: string;
  matchEvent: (event: PlatformEvent) => boolean;
  definitiveEvent?: (event: PlatformEvent) => boolean;
  version: string;
  evidence: SnapshotEvidence | null;
  ready: boolean;
  refresh?: () => Promise<void>;
  rangeFallback?: boolean;
  renderRangeSummary?: () => ReactNode;
  children: ReactNode;
}

export function AttentionRegion({
  children,
  matchEvent,
  version,
  ...options
}: AttentionRegionProps) {
  const attention = useAttentionCollection({
    ...options,
    eventKey: (event) => (matchEvent(event) ? options.targetId : null),
    versions: { [options.targetId]: version },
  });
  return (
    <section className="attention-region">
      {attention.notice}
      <div {...attention.itemProps(options.targetId)}>{children}</div>
    </section>
  );
}
