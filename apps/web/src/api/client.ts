import { z } from "zod";
import { tokenSchema } from "./schemas";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly requestId: string | null = null,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}
let accessToken: string | null = null;
let refreshFlight: {
  generation: number;
  promise: Promise<string>;
} | null = null;
let sessionGeneration = 0;
let cookieWork: Promise<unknown> | null = null;
function serializeCookieMutation<T>(work: () => Promise<T>): Promise<T> {
  // Set-Cookie is applied by the browser before JavaScript can reject a stale
  // response. Finish each cookie-changing request before starting the next one.
  const task = cookieWork ? cookieWork.then(work, work) : work();
  cookieWork = task;
  const release = () => {
    if (cookieWork === task) cookieWork = null;
  };
  void task.then(release, release);
  return task;
}
export const getAccessToken = (): string | null => accessToken;
export const getSessionGeneration = (): number => sessionGeneration;
export function clearSession(): void {
  sessionGeneration++;
  accessToken = null;
  window.dispatchEvent(new Event("session-expired"));
}
export function setAccessToken(token: string): void {
  sessionGeneration++;
  accessToken = token;
}
function requireSession(generation: number): void {
  if (generation !== sessionGeneration)
    throw new ApiError("SESSION_CHANGED", "会话已变更，请重新确认操作。", 401);
}
const errorSchema = z.object({
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      requestId: z.string().optional(),
    })
    .catchall(z.unknown()),
});

async function exchange(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "include",
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError("NETWORK_ERROR", "暂时无法连接服务，请稍后重试。", 0);
  }
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    throw new ApiError(
      "INVALID_RESPONSE",
      "服务响应格式异常，请根据请求记录排查。",
      response.status,
    );
  }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, requestId, ...details } = parsed.data.error;
      throw new ApiError(
        code,
        message,
        response.status,
        requestId ?? null,
        details,
      );
    }
    throw new ApiError(
      "HTTP_ERROR",
      `请求失败（HTTP ${response.status}）。`,
      response.status,
    );
  }
  return body;
}

async function refreshWithinCookieMutation(
  generation: number,
): Promise<string> {
  // A queued refresh for the previous identity must not touch the new cookie.
  requireSession(generation);
  try {
    const body = await exchange("/api/auth/refresh", { method: "POST" }, null);
    const result = tokenSchema.parse(body);
    requireSession(generation);
    accessToken = result.accessToken;
    return result.accessToken;
  } catch (error) {
    if (
      generation === sessionGeneration &&
      error instanceof ApiError &&
      error.status === 401
    )
      clearSession();
    throw error;
  }
}

export function refreshAccessToken(): Promise<string> {
  // A refresh token is one-use. Every request and the WebSocket share this flight.
  if (refreshFlight?.generation === sessionGeneration)
    return refreshFlight.promise;
  const generation = sessionGeneration;
  const promise = serializeCookieMutation(() =>
    refreshWithinCookieMutation(generation),
  ).finally(() => {
    // A previous session's late response must not release the current flight.
    if (refreshFlight?.promise === promise) refreshFlight = null;
  });
  refreshFlight = { generation, promise };
  return promise;
}

export function loginSession(
  username: string,
  password: string,
): Promise<void> {
  return serializeCookieMutation(async () => {
    // Start a new identity boundary only after earlier auth responses settled.
    // Old REST errors must not clear this login while its response is pending.
    const generation = ++sessionGeneration;
    accessToken = null;
    const result = tokenSchema.parse(
      await exchange(
        "/api/auth/login",
        { method: "POST", body: JSON.stringify({ username, password }) },
        null,
      ),
    );
    requireSession(generation);
    accessToken = result.accessToken;
  });
}

export function logoutSession(): Promise<void> {
  const tokenAtRequest = accessToken;
  return serializeCookieMutation(async () => {
    // A preceding refresh may have renewed access or already invalidated it.
    // Keep the originally requested token as a fallback to revoke that session.
    let token = accessToken ?? tokenAtRequest;
    try {
      const renewedBeforeLogout = !token;
      if (!token) token = await refreshWithinCookieMutation(sessionGeneration);
      try {
        await exchange("/api/auth/logout", { method: "POST" }, token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        if (renewedBeforeLogout) throw error;
        // Already inside the queue: do not enqueue a refresh behind ourselves.
        // The cookie may have rotated even if an old generation discarded access.
        token = await refreshWithinCookieMutation(sessionGeneration);
        await exchange("/api/auth/logout", { method: "POST" }, token);
      }
    } catch (error) {
      // Missing/revoked refresh or access means logout has already taken effect.
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
    }
    clearSession();
  });
}

export async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const generation = sessionGeneration;
  const originalToken = accessToken;
  let body: unknown;
  try {
    body = await exchange(path, init, originalToken);
  } catch (error) {
    // Only renewal within the same session may replay the original operation.
    // A different token alone cannot distinguish renewal from another login.
    requireSession(generation);
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      path.startsWith("/api/auth/login")
    )
      throw error;
    // A slower 401 may arrive after another request refreshed successfully.
    const token =
      accessToken && accessToken !== originalToken
        ? accessToken
        : await refreshAccessToken();
    requireSession(generation);
    try {
      body = await exchange(path, init, token);
    } catch (retryError) {
      requireSession(generation);
      if (retryError instanceof ApiError && retryError.status === 401)
        clearSession();
      throw retryError;
    }
  }
  // Late successful reads must not populate a page belonging to a new identity.
  requireSession(generation);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      "INVALID_RESPONSE",
      "服务返回了不符合约定的数据，请检查接口版本。",
      502,
      null,
      { issues: parsed.error.issues.map((issue) => issue.path.join(".")) },
    );
  return parsed.data;
}
export function post<T>(
  path: string,
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<T> {
  return request(path, schema, {
    method: "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
export function patch<T>(
  path: string,
  schema: z.ZodType<T>,
  body: unknown,
): Promise<T> {
  return request(path, schema, { method: "PATCH", body: JSON.stringify(body) });
}
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "操作未完成，请重试。";
}
