import { z } from 'zod';
import { tokenSchema } from './schemas';

export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number, public readonly requestId: string | null = null, public readonly details: Record<string, unknown> = {}) { super(message); this.name = 'ApiError'; }
}
let accessToken: string | null = null;
let refreshFlight: Promise<string> | null = null;
let sessionGeneration = 0;
export const getAccessToken = (): string | null => accessToken;
export function clearSession(): void { sessionGeneration++; accessToken = null; window.dispatchEvent(new Event('session-expired')); }
export function setAccessToken(token: string): void { sessionGeneration++; accessToken = token; }
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional() }).catchall(z.unknown()) });

async function exchange(path: string, init: RequestInit, token: string | null): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: 'include', signal: init.signal ?? AbortSignal.timeout(20_000), headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw error; throw new ApiError('NETWORK_ERROR', '暂时无法连接服务，请稍后重试。', 0); }
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) as unknown : null; } catch { throw new ApiError('INVALID_RESPONSE', '服务响应格式异常，请根据请求记录排查。', response.status); }
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    if (parsed.success) { const { code, message, requestId, ...details } = parsed.data.error; throw new ApiError(code, message, response.status, requestId ?? null, details); }
    throw new ApiError('HTTP_ERROR', `请求失败（HTTP ${response.status}）。`, response.status);
  }
  return body;
}

export function refreshAccessToken(): Promise<string> {
  // A refresh token is one-use. Every request and the WebSocket share this flight.
  if (refreshFlight) return refreshFlight;
  const generation = sessionGeneration;
  refreshFlight = exchange('/api/auth/refresh', { method: 'POST' }, null).then(body => {
    const result = tokenSchema.parse(body);
    if (generation !== sessionGeneration) throw new ApiError('SESSION_CHANGED', '会话已变更，请重新登录。', 401);
    accessToken = result.accessToken;
    return result.accessToken;
  }).catch((error: unknown) => {
    if (generation === sessionGeneration && error instanceof ApiError && error.status === 401) clearSession();
    throw error;
  }).finally(() => { refreshFlight = null; });
  return refreshFlight;
}

export async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const originalToken = accessToken;
  let body: unknown;
  try { body = await exchange(path, init, originalToken); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || path.startsWith('/api/auth/login') || path.startsWith('/api/auth/logout')) throw error;
    // A slower 401 may arrive after another request refreshed successfully.
    const token = accessToken && accessToken !== originalToken ? accessToken : await refreshAccessToken();
    try { body = await exchange(path, init, token); }
    catch (retryError) { if (retryError instanceof ApiError && retryError.status === 401) clearSession(); throw retryError; }
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('INVALID_RESPONSE', '服务返回了不符合约定的数据，请检查接口版本。', 502, null, { issues: parsed.error.issues.map(issue => issue.path.join('.')) });
  return parsed.data;
}
export function post<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> { return request(path, schema, { method: 'POST', ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
export function patch<T>(path: string, schema: z.ZodType<T>, body: unknown): Promise<T> { return request(path, schema, { method: 'PATCH', body: JSON.stringify(body) }); }
export function describeError(error: unknown): string { return error instanceof Error ? error.message : '操作未完成，请重试。'; }
