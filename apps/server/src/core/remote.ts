import { RemoteError } from "./errors.js";
import { currentOperationSignal } from "./db.js";
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export class RemoteClient {
  constructor(readonly baseUrl: string) {}
  async request<T>(
    path: string,
    body?: unknown,
    timeoutMs = 15000,
    signal?: AbortSignal,
    assertDispatchAllowed?: () => void,
  ): Promise<T> {
    const operationSignal = currentOperationSignal();
    operationSignal?.throwIfAborted();
    assertDispatchAllowed?.();
    signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(timeoutMs);
    const requestSignal = AbortSignal.any([
      timeout,
      ...(operationSignal ? [operationSignal] : []),
      ...(signal ? [signal] : []),
    ]);
    const url = `${this.baseUrl}${path}`;
    const init = {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: requestSignal,
    };
    // A timer cannot fire while synchronous work or microtasks keep the event
    // loop busy. Check the original deadline after serialization, without an
    // await between this assertion and dispatch.
    assertDispatchAllowed?.();
    const response = await fetch(url, init);
    const raw = await response.text();
    let data: unknown;
    try {
      data = raw ? (JSON.parse(raw) as unknown) : {};
    } catch {
      throw new RemoteError(response.status, "BAD_JSON", { raw });
    }
    requestSignal.throwIfAborted();
    if (!response.ok) {
      const envelope = isRecord(data) ? data : { raw };
      const nested = isRecord(envelope.error) ? envelope.error : undefined;
      const code =
        typeof envelope.code === "string"
          ? envelope.code
          : typeof nested?.code === "string"
            ? nested.code
            : `HTTP_${response.status}`;
      throw new RemoteError(response.status, code, envelope);
    }
    return data as T;
  }
}
