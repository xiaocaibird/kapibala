import type { Frame, JSHandle, Page, WebSocket } from '@playwright/test';
import { BlockedError } from '../../harness/security.js';

export interface ContinuityPoint {
  url: string;
  navigations: number;
  socketChanges: number;
  scopeReady: number;
  scopeMarkers: number;
  staleScopeReady: number;
  scopeEstablished: boolean;
}

/** Only ARC-UI-015 opts in, using its actual request and 200 response callbacks.
 * A post-response marker may describe the now-presented resource; it cannot
 * explain the earlier successful read. Pending acknowledgements never prove PASS.
 */
export interface ResponseScopeSync {
  requestAt: number;
  responseAt: number;
  requireReady?: boolean;
}
type ScopeFrame = { at: number; socketId: number; requestId?: string; startSeq?: number };

/** Public observations only; does not read or write the product's internal scope. */
export class ContinuityLedger {
  constructor(private readonly now: () => number = () => performance.now()) {}
  readonly events: { at: number; kind: string; url?: string }[] = [];
  readonly scopeMarkers: ScopeFrame[] = [];
  readonly scopeReplies: ScopeFrame[] = [];
  readonly checks: {
    at: number;
    before: ContinuityPoint;
    after: ContinuityPoint;
    sameDocument: boolean;
  }[] = [];
  private navigations = 0;
  private socketChanges = 0;
  private scopeReady = 0;
  private staleScopeReady = 0;
  private scopeEstablished = false;
  private nextSocketId = 0;
  private activeSocketId: number | undefined;
  navigation(url: string) {
    this.navigations++;
    this.events.push({ at: this.now(), kind: 'main-frame-navigation', url });
  }
  socket(kind: 'open' | 'close', socketId = this.activeSocketId) {
    this.socketChanges++;
    if (kind === 'open') {
      socketId = ++this.nextSocketId;
      this.activeSocketId = socketId;
      this.scopeEstablished = false;
    } else if (socketId === this.activeSocketId) {
      this.activeSocketId = undefined;
      this.scopeEstablished = false;
    }
    this.events.push({ at: this.now(), kind: `socket-${kind}` });
    return socketId;
  }
  sent(payload: string | Buffer, socketId = this.activeSocketId) {
    let value: unknown;
    try {
      value = JSON.parse(String(payload));
    } catch {
      return;
    }
    if (value && typeof value === 'object' && 'type' in value && value.type === 'scope_marker') {
      if (socketId === undefined || socketId !== this.activeSocketId) return;
      this.scopeMarkers.push({
        at: this.now(),
        socketId,
        ...('requestId' in value && typeof value.requestId === 'string'
          ? { requestId: value.requestId }
          : {}),
      });
    }
  }
  frame(payload: string | Buffer, socketId = this.activeSocketId) {
    let value: unknown;
    try {
      value = JSON.parse(String(payload));
    } catch {
      return;
    }
    if (value && typeof value === 'object' && 'type' in value && value.type === 'scope_ready') {
      if (socketId === undefined || socketId !== this.activeSocketId) {
        this.staleScopeReady++;
        this.events.push({ at: this.now(), kind: 'stale-socket-scope_ready' });
        return;
      }
      this.scopeReady++;
      this.scopeReplies.push({
        at: this.now(),
        socketId,
        ...('requestId' in value && typeof value.requestId === 'string'
          ? { requestId: value.requestId }
          : {}),
        ...('startSeq' in value &&
        Number.isSafeInteger(value.startSeq) &&
        Number(value.startSeq) >= 0
          ? { startSeq: Number(value.startSeq) }
          : {}),
      });
      if (
        'startSeq' in value &&
        Number.isSafeInteger(value.startSeq) &&
        Number(value.startSeq) >= 0
      )
        this.scopeEstablished = true;
      this.events.push({ at: this.now(), kind: 'scope_ready' });
    }
  }
  snapshot(url: string): ContinuityPoint {
    return {
      url,
      navigations: this.navigations,
      socketChanges: this.socketChanges,
      scopeReady: this.scopeReady,
      scopeMarkers: this.scopeMarkers.length,
      staleScopeReady: this.staleScopeReady,
      scopeEstablished: this.scopeEstablished,
    };
  }
  private assertResponseScopeSync(before: ContinuityPoint, sync: ResponseScopeSync) {
    if (
      !Number.isFinite(sync.requestAt) ||
      !Number.isFinite(sync.responseAt) ||
      sync.requestAt >= sync.responseAt
    )
      throw new BlockedError('缺少真实请求开始及成功响应的单调时钟顺序');
    const markers = this.scopeMarkers.slice(before.scopeMarkers);
    const replies = this.scopeReplies.slice(before.scopeReady);
    if (!markers.length && !replies.length) return;
    const baseline = this.scopeReplies[before.scopeReady - 1];
    const marker = markers[0];
    if (
      markers.length !== 1 ||
      replies.length > 1 ||
      baseline?.startSeq === undefined ||
      marker.socketId !== baseline.socketId ||
      marker.socketId !== this.activeSocketId ||
      !marker.requestId ||
      marker.at <= sync.responseAt ||
      this.scopeMarkers.filter((entry) => entry.requestId === marker.requestId).length !== 1
    )
      throw new BlockedError('scope同步缺少同一连接、成功响应之后的唯一真实marker');
    const reply = replies[0];
    if (!reply) {
      if (sync.requireReady)
        throw new BlockedError('成功响应后的marker尚无真实匹配scope_ready，不能判通过');
      return;
    }
    if (
      reply.socketId !== marker.socketId ||
      reply.requestId !== marker.requestId ||
      reply.at < marker.at ||
      reply.startSeq !== baseline.startSeq
    )
      throw new BlockedError('scope_ready与本次后置marker身份、时序或既有水位不匹配');
  }
  assertUnchanged(
    before: ContinuityPoint,
    url: string,
    sameDocument: boolean,
    sync?: ResponseScopeSync,
  ) {
    const after = this.snapshot(url);
    this.checks.push({ at: this.now(), before, after, sameDocument });
    if (!before.scopeEstablished)
      throw new BlockedError('未观察到公开scope_ready，无法建立动作前的scope基线');
    if (
      !sameDocument ||
      Object.keys(before).some(
        (key) =>
          !(sync && (key === 'scopeReady' || key === 'scopeMarkers')) &&
          before[key as keyof ContinuityPoint] !== after[key as keyof ContinuityPoint],
      )
    )
      throw new BlockedError(
        '动作窗口出现document/URL/主frame导航/WS连接或scope_ready变化，不能把范围重建当作原页面确认或恢复',
      );
    if (sync) this.assertResponseScopeSync(before, sync);
  }
}

type RecordedError = { name: string; message: string };
const recordedError = (error: unknown): RecordedError =>
  error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'ThrownValue', message: String(error) };
export interface ContinuityOutcome {
  outcome: 'completed' | 'confirmed-business-failure' | 'blocked-continuity' | 'action-error';
  primary?: RecordedError;
  confirmedBusinessFailure?: RecordedError;
  boundaryErrors: { stage: string; error: RecordedError }[];
  assertions: { label: string; error?: RecordedError; continuityAfter: boolean }[];
}

/** A later contaminated boundary must not erase a failure already proved in a valid window.
 * A title/locator timeout spanning navigation is not such proof: retain it, then BLOCKED.
 */
export async function withContinuityEvidence(
  continuity: () => Promise<void>,
  action: (
    check: (label: string, assertion: () => unknown | Promise<unknown>) => Promise<void>,
  ) => Promise<void>,
  record: (outcome: ContinuityOutcome) => void,
): Promise<void> {
  let primary: { error: unknown } | undefined;
  let confirmed: { error: unknown } | undefined;
  const boundaries: { stage: string; error: unknown }[] = [];
  const assertions: ContinuityOutcome['assertions'] = [];
  const boundary = async (stage: string) => {
    try {
      await continuity();
      return undefined;
    } catch (error) {
      const failure = { stage, error };
      boundaries.push(failure);
      return failure;
    }
  };
  try {
    await action(async (label, assertion) => {
      const before = await boundary(`${label}:before`);
      if (before) throw before.error;
      let failed: { error: unknown } | undefined;
      try {
        await assertion();
      } catch (error) {
        failed = { error };
      }
      const after = await boundary(`${label}:after`);
      assertions.push({
        label,
        ...(failed ? { error: recordedError(failed.error) } : {}),
        continuityAfter: !after,
      });
      if (failed && !after && !(failed.error instanceof BlockedError)) confirmed ??= failed;
      if (after) throw after.error;
      if (failed) throw failed.error;
    });
  } catch (error) {
    primary = { error };
  }
  await boundary('action:final');
  const selected = confirmed ?? boundaries[0] ?? primary;
  record({
    outcome: confirmed
      ? 'confirmed-business-failure'
      : boundaries.length
        ? 'blocked-continuity'
        : primary
          ? 'action-error'
          : 'completed',
    ...(primary ? { primary: recordedError(primary.error) } : {}),
    ...(confirmed ? { confirmedBusinessFailure: recordedError(confirmed.error) } : {}),
    boundaryErrors: boundaries.map(({ stage, error }) => ({ stage, error: recordedError(error) })),
    assertions,
  });
  if (selected) throw selected.error;
}

/** Attach before login to observe the existing socket; callbacks never fabricate events. */
export function observePageContinuity(page: Page) {
  const ledger = new ContinuityLedger();
  const handles = new Set<JSHandle<Document>>();
  const sockets = new Map<
    WebSocket,
    {
      frame: (event: { payload: string | Buffer }) => void;
      sent: (event: { payload: string | Buffer }) => void;
      close: () => void;
    }
  >();
  const navigation = (frame: Frame) => {
    if (frame === page.mainFrame()) ledger.navigation(frame.url());
  };
  const opened = (socket: WebSocket) => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    const socketId = ledger.socket('open')!;
    const frame = ({ payload }: { payload: string | Buffer }) => ledger.frame(payload, socketId);
    const sent = ({ payload }: { payload: string | Buffer }) => ledger.sent(payload, socketId);
    const close = () => {
      ledger.socket('close', socketId);
    };
    sockets.set(socket, { frame, sent, close });
    socket.on('framereceived', frame);
    socket.on('framesent', sent);
    socket.on('close', close);
  };
  page.on('framenavigated', navigation);
  page.on('websocket', opened);
  return {
    ledger,
    capture: async () => {
      const document = await page.evaluateHandle(() => window.document);
      handles.add(document);
      const point = ledger.snapshot(page.url());
      ledger.assertUnchanged(point, page.url(), true);
      return { point, document };
    },
    unchanged: async (
      baseline: { point: ContinuityPoint; document: JSHandle<Document> },
      sync?: ResponseScopeSync,
    ) => {
      let sameDocument = false;
      try {
        sameDocument = await page.evaluate((old) => old === document, baseline.document);
      } catch {
        /* Destroyed context is not continuity. */
      }
      ledger.assertUnchanged(baseline.point, page.url(), sameDocument, sync);
    },
    dispose: async () => {
      page.off('framenavigated', navigation);
      page.off('websocket', opened);
      for (const [socket, handler] of sockets) {
        socket.off('framereceived', handler.frame);
        socket.off('framesent', handler.sent);
        socket.off('close', handler.close);
      }
      await Promise.all([...handles].map((handle) => handle.dispose()));
    },
  };
}
