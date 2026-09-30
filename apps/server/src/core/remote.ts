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
  ): Promise<T> {
    const operationSignal = currentOperationSignal();
    operationSignal?.throwIfAborted();
    const timeout = AbortSignal.timeout(timeoutMs);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: operationSignal ? AbortSignal.any([timeout, operationSignal]) : timeout,
    });
    const raw = await response.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) as unknown : {};
    } catch {
      throw new RemoteError(response.status, "BAD_JSON", { raw });
    }
    operationSignal?.throwIfAborted();
    if (!response.ok) {
      const envelope = isRecord(data) ? data : { raw };
      const nested = isRecord(envelope.error) ? envelope.error : undefined;
      const code = typeof envelope.code === "string" ? envelope.code
        : typeof nested?.code === "string" ? nested.code : `HTTP_${response.status}`;
      throw new RemoteError(
        response.status,
        code,
        envelope,
      );
    }
    return data as T;
  }
}
