import { RemoteError } from "./errors.js";
export class RemoteClient {
  constructor(readonly baseUrl: string) {}
  async request<T>(
    path: string,
    body?: unknown,
    timeoutMs = 15000,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await response.text();
    let data: Record<string, unknown>;
    try {
      data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      throw new RemoteError(response.status, "BAD_JSON", { raw });
    }
    if (!response.ok) {
      const nested = data.error as Record<string, unknown> | undefined;
      throw new RemoteError(
        response.status,
        String(data.code ?? nested?.code ?? `HTTP_${response.status}`),
        data,
      );
    }
    return data as T;
  }
}
