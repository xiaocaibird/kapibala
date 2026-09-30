import type { WebSocket } from "ws";

export interface RealtimeLimits {
  /** One in-flight frame may exceed this watermark; no following frame may. */
  maxBufferedBytes?: number;
  sendTimeoutMs?: number;
  closeGraceMs?: number;
}

/** Does not acknowledge delivery: reconnect always resumes from the client's cursor. */
export function boundedSocketSender(
  socket: WebSocket,
  limits: RealtimeLimits = {},
) {
  const maxBufferedBytes = limits.maxBufferedBytes ?? 1024 * 1024;
  const sendTimeoutMs = limits.sendTimeoutMs ?? 5000;
  const closeGraceMs = limits.closeGraceMs ?? 1000;
  let stopped = false;
  let termination: NodeJS.Timeout | undefined;
  const pending = new Set<() => void>();
  let serial = Promise.resolve(false);
  let admitted = 0;

  function close(code: number, reason: string): void {
    if (stopped) return;
    stopped = true;
    for (const finish of pending) finish();
    socket.close(code, reason);
    // A peer that is not reading may never complete the close handshake.
    if (socket.readyState !== 3) {
      termination = setTimeout(() => socket.terminate(), closeGraceMs);
      termination.unref();
    }
  }
  socket.once("close", () => {
    stopped = true;
    clearTimeout(termination);
    for (const finish of pending) finish();
  });

  async function transmit(value: unknown): Promise<boolean> {
    if (stopped || socket.readyState !== 1) return false;
    // Event and control frames share the same serialized writer.
    // A large single frame is allowed when drained, preventing a permanent
    // reconnect loop solely because one durable event exceeds the watermark.
    if (socket.bufferedAmount > maxBufferedBytes) {
      close(1013, "Slow consumer; reconnect to resume");
      return false;
    }
    const encoded = JSON.stringify(value);
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
        close(1013, "Slow consumer; reconnect to resume");
      }, sendTimeoutMs);
      timeout.unref();
      pending.add(cancel);
      try {
        socket.send(encoded, (error?: Error) => {
          if (error) close(1011, "Stream interrupted; reconnect to resume");
          finish(!error && !stopped);
        });
      } catch {
        close(1011, "Stream interrupted; reconnect to resume");
      }
    });
  }
  function send(value: unknown): Promise<boolean> {
    if (stopped || socket.readyState !== 1) return Promise.resolve(false);
    // Replay, authentication and marker loops each await their send. Permit at
    // most one frame on the wire plus two bounded control waiters; this also
    // prevents a control reply from aborting an allowed oversized event frame.
    if (admitted >= 3) {
      close(1013, "Too many pending frames; reconnect to resume");
      return Promise.resolve(false);
    }
    admitted++;
    const result = serial
      .then(() => transmit(value))
      .catch(() => {
        close(1011, "Stream interrupted; reconnect to resume");
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
