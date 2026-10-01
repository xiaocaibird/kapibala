import type { Frame, JSHandle, Page, WebSocket } from '@playwright/test';
import { BlockedError } from '../../harness/security.js';

export interface ContinuityPoint {
  url: string;
  navigations: number;
  socketChanges: number;
  scopeReady: number;
  scopeEstablished: boolean;
}

/** Public observations only; does not read or write the product's internal scope. */
export class ContinuityLedger {
  readonly events: { at: number; kind: string; url?: string }[] = [];
  readonly checks: {
    at: number;
    before: ContinuityPoint;
    after: ContinuityPoint;
    sameDocument: boolean;
  }[] = [];
  private navigations = 0;
  private socketChanges = 0;
  private scopeReady = 0;
  private scopeEstablished = false;
  private nextSocketId = 0;
  private activeSocketId: number | undefined;
  navigation(url: string) {
    this.navigations++;
    this.events.push({ at: performance.now(), kind: 'main-frame-navigation', url });
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
    this.events.push({ at: performance.now(), kind: `socket-${kind}` });
    return socketId;
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
        this.events.push({ at: performance.now(), kind: 'stale-socket-scope_ready' });
        return;
      }
      this.scopeReady++;
      if (
        'startSeq' in value &&
        Number.isSafeInteger(value.startSeq) &&
        Number(value.startSeq) >= 0
      )
        this.scopeEstablished = true;
      this.events.push({ at: performance.now(), kind: 'scope_ready' });
    }
  }
  snapshot(url: string): ContinuityPoint {
    return {
      url,
      navigations: this.navigations,
      socketChanges: this.socketChanges,
      scopeReady: this.scopeReady,
      scopeEstablished: this.scopeEstablished,
    };
  }
  assertUnchanged(before: ContinuityPoint, url: string, sameDocument: boolean) {
    const after = this.snapshot(url);
    this.checks.push({ at: performance.now(), before, after, sameDocument });
    if (!before.scopeEstablished)
      throw new BlockedError('未观察到公开scope_ready，无法建立动作前的scope基线');
    if (
      !sameDocument ||
      Object.keys(before).some(
        (key) => before[key as keyof ContinuityPoint] !== after[key as keyof ContinuityPoint],
      )
    )
      throw new BlockedError(
        '动作窗口出现document/URL/主frame导航/WS连接或scope_ready变化，不能把范围重建当作原页面确认或恢复',
      );
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
    { frame: (event: { payload: string | Buffer }) => void; close: () => void }
  >();
  const navigation = (frame: Frame) => {
    if (frame === page.mainFrame()) ledger.navigation(frame.url());
  };
  const opened = (socket: WebSocket) => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    const socketId = ledger.socket('open')!;
    const frame = ({ payload }: { payload: string | Buffer }) => ledger.frame(payload, socketId);
    const close = () => {
      ledger.socket('close', socketId);
    };
    sockets.set(socket, { frame, close });
    socket.on('framereceived', frame);
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
    unchanged: async (baseline: { point: ContinuityPoint; document: JSHandle<Document> }) => {
      let sameDocument = false;
      try {
        sameDocument = await page.evaluate((old) => old === document, baseline.document);
      } catch {
        /* Destroyed context is not continuity. */
      }
      ledger.assertUnchanged(baseline.point, page.url(), sameDocument);
    },
    dispose: async () => {
      page.off('framenavigated', navigation);
      page.off('websocket', opened);
      for (const [socket, handler] of sockets) {
        socket.off('framereceived', handler.frame);
        socket.off('close', handler.close);
      }
      await Promise.all([...handles].map((handle) => handle.dispose()));
    },
  };
}
