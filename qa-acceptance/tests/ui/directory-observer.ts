import type { Page, Request, WebSocket } from '@playwright/test';
import { BlockedError } from '../../harness/security.js';

export const directoryPeriodMs = 5_000;
export interface DirectoryRead {
  at: number;
  url: string;
  endedAt?: number;
  status?: number;
  body?: unknown;
  error?: string;
}
interface SocketState {
  id: number;
  authenticated: boolean;
  closed: boolean;
  startSeq?: number;
  lastSeq?: number;
  sequences: number[];
}
export interface DirectoryFrame {
  at: number;
  socket: number;
  type: string;
  seq?: number;
  msgId?: string;
}
/** Passive evidence ledger. It never sends a marker, changes a cursor, or drops an event. */
export class DirectoryLedger {
  readonly reads: DirectoryRead[] = [];
  readonly sockets: SocketState[] = [];
  readonly frames: DirectoryFrame[] = [];
  readonly protocolErrors: { at: number; socket: number; previousSeq: number; seq: number }[] = [];
  boundaryAt = 0;
  boundaryVersion = 0;
  private boundary(at: number): void {
    this.boundaryAt = at;
    this.boundaryVersion++;
  }
  open(at: number): number {
    const id = this.sockets.length;
    this.sockets.push({ id, authenticated: false, closed: false, sequences: [] });
    this.boundary(at);
    return id;
  }
  close(id: number, at: number): void {
    this.sockets[id]!.closed = true;
    this.boundary(at);
  }
  receive(id: number, raw: string, at: number): void {
    let frame: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      frame = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    const socket = this.sockets[id]!;
    const type = typeof frame.type === 'string' ? frame.type : '';
    const seq =
      Number.isSafeInteger(frame.seq) && Number(frame.seq) > 0 ? Number(frame.seq) : undefined;
    if (type === 'auth' && frame.success === true) socket.authenticated = true;
    if (
      type === 'scope_ready' &&
      Number.isSafeInteger(frame.startSeq) &&
      Number(frame.startSeq) >= 0
    )
      socket.startSeq = Number(frame.startSeq);
    if (seq !== undefined) {
      if (socket.authenticated) {
        if (socket.lastSeq !== undefined && seq <= socket.lastSeq)
          this.protocolErrors.push({ at, socket: id, previousSeq: socket.lastSeq, seq });
        socket.lastSeq = Math.max(socket.lastSeq ?? 0, seq);
      }
      socket.sequences.push(seq);
    }
    const payload = frame.payload as Record<string, unknown> | undefined;
    this.frames.push({
      at,
      socket: id,
      type,
      seq,
      msgId: payload && typeof payload.msgId === 'string' ? payload.msgId : undefined,
    });
    // Conservative: all non-message business events can disturb preparation.
    if (type === 'auth' || type === 'scope_ready' || (seq !== undefined && type !== 'message'))
      this.boundary(at);
  }
  replayObserved(): boolean {
    if (this.protocolErrors.length > 0) return false;
    const active = this.sockets.filter((socket) => !socket.closed);
    if (active.length !== 1) return false;
    const socket = active[0]!;
    // Sequence gaps can be legitimate. Observing the actual marker event is
    // stronger than max(seq)>=marker and does not invent gap-free numbering.
    return (
      socket.authenticated &&
      socket.startSeq !== undefined &&
      (socket.startSeq === 0 || socket.sequences.includes(socket.startSeq))
    );
  }
  settled(now: number, periodMs = directoryPeriodMs): boolean {
    this.assertProtocol();
    return (
      this.replayObserved() &&
      now - this.boundaryAt >= periodMs &&
      this.reads.length > 0 &&
      this.reads.every((read) => read.endedAt !== undefined) &&
      this.reads.at(-1)?.status === 200 &&
      this.reads.at(-1)?.body !== undefined &&
      this.reads.at(-1)?.error === undefined
    );
  }
  assertProtocol(): void {
    if (this.protocolErrors.length > 0)
      throw new Error(
        `WS 同连接 seq 未严格递增，已观察到明确协议违约：${JSON.stringify(this.protocolErrors)}`,
      );
  }
}

/** Parse public card links, without consulting application DOM or routing internals. */
export function directoryGroupIds(hrefs: (string | null)[], baseUrl: string): string[] {
  return hrefs.map((href) => {
    if (!href) throw new Error('目录卡片缺少公开群详情链接');
    const url = new URL(href, baseUrl);
    const match = /^#\/groups\/([^/?#]+)$/.exec(url.hash);
    if (url.origin !== new URL(baseUrl).origin || !match)
      throw new Error(`目录卡片链接不是同源公开群详情路由：${href}`);
    return decodeURIComponent(match[1]!);
  });
}

/** Bounded evidence wait; expiration establishes no product success/failure. */
export async function directoryPremise(
  check: () => boolean,
  label: string,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!check()) {
    if (performance.now() >= deadline) throw new BlockedError(`目录测试前提未建立：${label}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

export function observeDirectory(page: Page) {
  const ledger = new DirectoryLedger();
  const requests = new Map<Request, DirectoryRead>();
  const handlers = new Map<
    WebSocket,
    {
      frame: (event: { payload: string | Buffer }) => void;
      close: () => void;
    }
  >();
  const onSocket = (socket: WebSocket) => {
    if (new URL(socket.url()).pathname !== '/ws') return;
    const id = ledger.open(performance.now());
    const frame = ({ payload }: { payload: string | Buffer }) =>
      ledger.receive(id, String(payload), performance.now());
    const close = () => ledger.close(id, performance.now());
    handlers.set(socket, { frame, close });
    socket.on('framereceived', frame);
    socket.on('close', close);
  };
  const onRequest = (request: Request) => {
    if (request.method() !== 'GET' || new URL(request.url()).pathname !== '/api/group-directory')
      return;
    const read = { at: performance.now(), url: request.url() };
    ledger.reads.push(read);
    requests.set(request, read);
  };
  const onResponse = async (response: import('@playwright/test').Response) => {
    const read = requests.get(response.request());
    if (!read) return;
    read.status = response.status();
    try {
      read.body = await response.json();
    } catch (error) {
      read.error = String(error);
    } finally {
      read.endedAt = performance.now();
    }
  };
  const onFailed = (request: Request) => {
    const read = requests.get(request);
    if (!read) return;
    read.error = request.failure()?.errorText ?? 'request failed';
    read.endedAt = performance.now();
  };
  page.on('websocket', onSocket);
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  return {
    ledger,
    settle: () =>
      directoryPremise(
        () => ledger.settled(performance.now()),
        '真实scope水位、回放、完整成功目录响应及一个原5秒周期内无相关事件/重连',
      ),
    unchanged: (version: number) => {
      ledger.assertProtocol();
      if (!ledger.replayObserved() || ledger.boundaryVersion !== version)
        throw new BlockedError(
          '目录测量窗口混入相关事件、scope变化或连接变化；不能归因于定时器/无关消息',
        );
    },
    assertProtocol: () => ledger.assertProtocol(),
    dispose: () => {
      page.off('websocket', onSocket);
      page.off('request', onRequest);
      page.off('response', onResponse);
      page.off('requestfailed', onFailed);
      for (const [socket, h] of handlers) {
        socket.off('framereceived', h.frame);
        socket.off('close', h.close);
      }
    },
  };
}
