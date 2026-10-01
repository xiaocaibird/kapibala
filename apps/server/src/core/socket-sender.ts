import type { WebSocket } from "ws";

export interface RealtimeLimits {
  /** One in-flight frame may exceed this watermark; no following frame may. */
  maxBufferedBytes?: number;
  sendTimeoutMs?: number;
  closeGraceMs?: number;
}

export type SocketCloseTrigger =
  | "application"
  | "buffer-high-water"
  | "send-timeout"
  | "pending-overflow"
  | "send-error";
export interface SocketTransportObservation {
  kind: "configured" | "close-requested" | "terminate-requested" | "closed";
  at: string;
  monotonicMs: number;
  limits: Required<RealtimeLimits>;
  readyState: number;
  bufferedBytes: number;
  maxObservedBufferedBytes: number;
  admittedFrames: number;
  maxAdmittedFrames: number;
  pendingWaiters: number;
  attemptedFrames: number;
  attemptedBytes: number;
  successfulCallbacks: number;
  maxCallbackWaitMs: number;
  currentSendWaitMs: number;
  currentFrameBytes: number;
  code?: number;
  reason?: string;
  trigger?: SocketCloseTrigger;
}

/** Does not acknowledge delivery: reconnect always resumes from the client's cursor. */
export function boundedSocketSender(
  socket: WebSocket,
  limits: RealtimeLimits = {},
  observe?: (event: SocketTransportObservation) => void,
) {
  const maxBufferedBytes = limits.maxBufferedBytes ?? 1024 * 1024;
  const sendTimeoutMs = limits.sendTimeoutMs ?? 5000;
  const closeGraceMs = limits.closeGraceMs ?? 1000;
  let stopped = false;
  let termination: NodeJS.Timeout | undefined;
  const pending = new Set<() => void>();
  let serial = Promise.resolve(false);
  let admitted = 0;
  let maxAdmitted = 0;
  let maxBuffered = 0;
  let attemptedFrames = 0;
  let attemptedBytes = 0;
  let successfulCallbacks = 0;
  let maxCallbackWaitMs = 0;
  let current: { started: number; bytes: number } | undefined;
  let initiated:
    { code: number; reason: string; trigger: SocketCloseTrigger } | undefined;

  function diagnose(
    kind: SocketTransportObservation["kind"],
    details: Partial<
      Pick<SocketTransportObservation, "code" | "reason" | "trigger">
    > = {},
  ): void {
    if (!observe) return;
    const monotonicMs = performance.now();
    maxBuffered = Math.max(maxBuffered, socket.bufferedAmount);
    try {
      observe({
        kind,
        at: new Date().toISOString(),
        monotonicMs,
        limits: { maxBufferedBytes, sendTimeoutMs, closeGraceMs },
        readyState: socket.readyState,
        bufferedBytes: socket.bufferedAmount,
        maxObservedBufferedBytes: maxBuffered,
        admittedFrames: admitted,
        maxAdmittedFrames: maxAdmitted,
        pendingWaiters: pending.size,
        attemptedFrames,
        attemptedBytes,
        successfulCallbacks,
        maxCallbackWaitMs,
        currentSendWaitMs: current ? monotonicMs - current.started : 0,
        currentFrameBytes: current?.bytes ?? 0,
        ...details,
      });
    } catch {
      /* Read-only diagnostics must never change transport progress. */
    }
  }

  function close(
    code: number,
    reason: string,
    trigger: SocketCloseTrigger = "application",
  ): void {
    if (stopped) return;
    initiated = { code, reason, trigger };
    diagnose("close-requested", initiated);
    stopped = true;
    for (const finish of pending) finish();
    socket.close(code, reason);
    // A peer that is not reading may never complete the close handshake.
    if (socket.readyState !== 3) {
      termination = setTimeout(() => {
        diagnose("terminate-requested", initiated);
        socket.terminate();
      }, closeGraceMs);
      termination.unref();
    }
  }
  socket.once("close", (code: number, reason: Buffer) => {
    diagnose("closed", {
      code,
      reason: reason?.toString(),
      trigger: initiated?.trigger,
    });
    stopped = true;
    clearTimeout(termination);
    for (const finish of pending) finish();
  });
  diagnose("configured");

  async function transmit(value: unknown): Promise<boolean> {
    if (stopped || socket.readyState !== 1) return false;
    // Event and control frames share the same serialized writer.
    // A large single frame is allowed when drained, preventing a permanent
    // reconnect loop solely because one durable event exceeds the watermark.
    if (socket.bufferedAmount > maxBufferedBytes) {
      close(1013, "Slow consumer; reconnect to resume", "buffer-high-water");
      return false;
    }
    const encoded = JSON.stringify(value);
    const frame = {
      started: performance.now(),
      bytes: Buffer.byteLength(encoded),
    };
    current = frame;
    attemptedFrames++;
    attemptedBytes += frame.bytes;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (sent = false): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        pending.delete(cancel);
        resolve(sent);
      };
      const cancel = () => finish();
      const timeout = setTimeout(() => {
        close(1013, "Slow consumer; reconnect to resume", "send-timeout");
      }, sendTimeoutMs);
      timeout.unref();
      pending.add(cancel);
      try {
        socket.send(encoded, (error?: Error) => {
          maxCallbackWaitMs = Math.max(
            maxCallbackWaitMs,
            performance.now() - frame.started,
          );
          if (!error) successfulCallbacks++;
          if (error)
            close(
              1011,
              "Stream interrupted; reconnect to resume",
              "send-error",
            );
          if (current === frame) current = undefined;
          finish(!error && !stopped);
        });
        maxBuffered = Math.max(maxBuffered, socket.bufferedAmount);
      } catch {
        close(1011, "Stream interrupted; reconnect to resume", "send-error");
      }
    });
  }
  function send(value: unknown): Promise<boolean> {
    if (stopped || socket.readyState !== 1) return Promise.resolve(false);
    // Replay, authentication and marker loops each await their send. Permit at
    // most one frame on the wire plus two bounded control waiters; this also
    // prevents a control reply from aborting an allowed oversized event frame.
    if (admitted >= 3) {
      close(
        1013,
        "Too many pending frames; reconnect to resume",
        "pending-overflow",
      );
      return Promise.resolve(false);
    }
    admitted++;
    maxAdmitted = Math.max(maxAdmitted, admitted);
    const result = serial
      .then(() => transmit(value))
      .catch(() => {
        close(1011, "Stream interrupted; reconnect to resume", "send-error");
        return false;
      })
      .finally(() => {
        admitted--;
      });
    serial = result;
    return result;
  }
  return {
    send,
    close,
    get stopped() {
      return stopped;
    },
  };
}
