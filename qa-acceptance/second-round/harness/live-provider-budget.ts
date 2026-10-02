import { createHash } from 'node:crypto';

export const LIVE_MODEL = 'gemini-3.1-flash-lite';
export const LIVE_ORIGIN = 'https://generativelanguage.googleapis.com';
export const LIVE_PATH = `/v1beta/models/${LIVE_MODEL}:generateContent`;
export const LIVE_PRICING = {
  checkedAt: '2026-10-02', currency: 'USD', inputTokens: 1048576, outputTokensIncludingThinking: 65536,
  inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.50,
  // The whole model envelope, not byte/token estimates or expected usage.
  reservationMicroUsdPerAttempt: 360448,
  pricingSource: 'https://ai.google.dev/gemini-api/docs/pricing',
  limitsSource: 'https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite',
  diagnosticsSource: 'https://github.com/nodejs/undici/blob/main/docs/docs/api/DiagnosticsChannel.md',
} as const;
export interface LivePermission {
  explicitlyAuthorized: true;
  authorizationReference: string;
  stopInstructionReference: string;
  credentialReference: '/Users/zcm/Desktop/kapibala/.env';
  model: typeof LIVE_MODEL;
  maximumPaidCalls: number;
  maximumSpendUsd: number;
  expiresAt: string;
}
export interface LiveEvent { kind: string; [key: string]: unknown }
export class LiveGuardError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'LiveGuardError'; }
}
export function validateLivePermission(p: LivePermission, now = Date.now()) {
  if (p.explicitlyAuthorized !== true || !p.authorizationReference || !p.stopInstructionReference ||
    p.credentialReference !== '/Users/zcm/Desktop/kapibala/.env' || p.model !== LIVE_MODEL ||
    !Number.isSafeInteger(p.maximumPaidCalls) || p.maximumPaidCalls < 2 || p.maximumPaidCalls > 8 ||
    !Number.isFinite(p.maximumSpendUsd) || p.maximumSpendUsd < 0.720896 || p.maximumSpendUsd > 1 ||
    !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= now)
    throw new LiveGuardError('LIVE_AUTHORIZATION_INVALID_OR_EXPIRED');
}

/** Pure reservation and fixed transport gate. Never reads credentials or headers.
 * Every admitted fetch permanently spends its full reservation, even if native
 * fetch rejects, times out, or receives no billable usage metadata. */
export class LiveBudgetGuard {
  attempts = 0;
  reservedMicroUsd = 0;
  private inFlight = false;
  private terminal = false;
  constructor(readonly permission: LivePermission, readonly emit: (event: LiveEvent) => void) { validateLivePermission(permission); }
  reserve(input: RequestInfo | URL, init?: RequestInit): number {
    const deny = (code: string): never => { this.emit({ kind: 'fetch-denied', code, attempts: this.attempts, reservedMicroUsd: this.reservedMicroUsd }); throw new LiveGuardError(code); };
    try { validateLivePermission(this.permission); } catch { return deny('LIVE_AUTHORIZATION_EXPIRED'); }
    if (this.terminal || this.attempts >= Math.min(2, this.permission.maximumPaidCalls)) return deny('LIVE_CALL_LIMIT');
    if (this.inFlight) return deny('LIVE_CONCURRENT_CALL_FORBIDDEN');
    if (typeof input !== 'string' || input !== LIVE_ORIGIN + LIVE_PATH || init?.method !== 'POST' || init.redirect !== 'error' || typeof init.body !== 'string') return deny('LIVE_TRANSPORT_SCOPE');
    let body: Record<string, any>;
    try { body = JSON.parse(init.body); } catch { return deny('LIVE_REQUEST_BODY_INVALID'); }
    const keys = (v: object) => Object.keys(v).sort().join(',');
    if (keys(body) !== 'contents,generationConfig,systemInstruction' || !body.generationConfig ||
      body.generationConfig.candidateCount !== 1 || ![1024,2048].includes(body.generationConfig.maxOutputTokens) ||
      keys(body.generationConfig) !== 'candidateCount,maxOutputTokens,responseFormat,temperature,thinkingConfig' ||
      body.generationConfig.temperature !== 0 || body.generationConfig.thinkingConfig?.thinkingLevel !== 'MINIMAL' ||
      keys(body.generationConfig.thinkingConfig) !== 'thinkingLevel' ||
      body.generationConfig.responseFormat?.text?.mimeType !== 'APPLICATION_JSON' ||
      !Array.isArray(body.contents) || body.contents.length !== 1 || body.contents[0]?.role !== 'user' ||
      !Array.isArray(body.contents[0]?.parts) || body.contents[0].parts.length !== 1 ||
      keys(body.contents[0].parts[0]) !== 'text' || typeof body.contents[0].parts[0].text !== 'string' ||
      !Array.isArray(body.systemInstruction?.parts) || body.systemInstruction.parts.length !== 1 ||
      keys(body.systemInstruction.parts[0]) !== 'text' || typeof body.systemInstruction.parts[0].text !== 'string') return deny('LIVE_TEXT_ONLY_FIXED_GENERATION_REQUIRED');
    const reserved = this.reservedMicroUsd + LIVE_PRICING.reservationMicroUsdPerAttempt;
    if (reserved > Math.floor(this.permission.maximumSpendUsd * 1000000)) return deny('LIVE_SPEND_LIMIT');
    // This append must succeed synchronously before native fetch can be called.
    const attempt = this.attempts + 1;
    this.emit({ kind: 'fetch-reserved', attempt, origin: LIVE_ORIGIN, path: LIVE_PATH, method: 'POST',
      requestBytes: Buffer.byteLength(init.body), requestSha256: createHash('sha256').update(init.body).digest('hex'),
      maximumOutputTokens: body.generationConfig.maxOutputTokens, reservedMicroUsd: reserved, chargedEvenIfNoUsage: true });
    this.attempts = attempt; this.reservedMicroUsd = reserved; this.inFlight = true;
    return attempt;
  }
  settle(attempt: number) { if (attempt === this.attempts) this.inFlight = false; }
  close() { this.terminal = true; }
}

export function guardedLiveFetch(native: typeof fetch, guard: LiveBudgetGuard): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const attempt = guard.reserve(input, init);
    try {
      return native(input, init).then(response => {
        guard.emit({ kind: 'fetch-response', attempt, status: response.status }); return response;
      }, error => {
        guard.emit({ kind: 'fetch-failed', attempt, code: 'NATIVE_FETCH_FAILED' }); throw error;
      }).finally(() => guard.settle(attempt));
    } catch (error) { guard.settle(attempt); throw error; }
  }) as typeof fetch;
}
