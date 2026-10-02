import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { channel } from 'node:diagnostics_channel';
import { LiveBudgetGuard, guardedLiveFetch, LIVE_ORIGIN, LIVE_PATH, LIVE_PRICING, type LiveEvent, type LivePermission } from './live-provider-budget.js';

// This explicit QA transport wrapper is loaded before the unchanged product
// main. It does not import business code or inspect any credential/header.
const path = process.env.QA_LIVE_GUARD_CONFIG;
if (!path) throw new Error('LIVE_GUARD_CONFIG_REQUIRED');
const config = JSON.parse(readFileSync(path, 'utf8')) as { permission: LivePermission; ledgerPath: string; sutRevision: string };
const fd = openSync(config.ledgerPath, 'wx', 0o600);
let seq = 0;
const emit = (event: LiveEvent) => writeSync(fd, JSON.stringify({ seq: ++seq, at: new Date().toISOString(), monoMs: performance.now(), pid: process.pid, ...event }) + '\n');
const guard = new LiveBudgetGuard(config.permission, emit);
const requests = new WeakMap<object, number>(), sent = new Set<number>();
const die = (code: string): never => { try { emit({ kind: 'diagnostic-guard-denied', code }); } finally { process.exit(87); } };
channel('undici:request:create').subscribe((message: any) => {
  const request = message.request;
  if (!request || String(request.origin) !== LIVE_ORIGIN || request.path !== LIVE_PATH || request.method !== 'POST' || !guard.attempts) die('UNRESERVED_OR_FOREIGN_REQUEST');
  requests.set(request, guard.attempts);
  emit({ kind: 'upstream-created', attempt: guard.attempts, origin: LIVE_ORIGIN, path: LIVE_PATH, method: 'POST' });
});
channel('undici:client:sendHeaders').subscribe((message: any) => {
  const attempt = requests.get(message.request);
  // Diagnostics subscribers are synchronous; this is a secondary hard stop,
  // while the primary cost gate runs before calling native fetch at all.
  if (!attempt || sent.has(attempt)) die('UNRESERVED_OR_REPEATED_SEND');
  sent.add(attempt!);
  emit({ kind: 'upstream-before-first-byte', attempt, tls: message.socket?.encrypted === true,
    remoteAddress: message.socket?.remoteAddress ?? null, remotePort: message.socket?.remotePort ?? null });
});
channel('undici:request:bodySent').subscribe((message: any) => emit({ kind: 'upstream-body-sent', attempt: requests.get(message.request) ?? null }));
channel('undici:request:headers').subscribe((message: any) => emit({ kind: 'upstream-response-headers', attempt: requests.get(message.request) ?? null, status: message.response?.statusCode ?? null }));
channel('undici:request:error').subscribe((message: any) => emit({ kind: 'upstream-error', attempt: requests.get(message.request) ?? null, code: 'UNDICI_REQUEST_ERROR' }));
globalThis.fetch = guardedLiveFetch(globalThis.fetch.bind(globalThis), guard);
emit({ kind: 'guard-installed', node: process.version, undici: process.versions.undici, sutRevision: config.sutRevision,
  permittedOrigin: LIVE_ORIGIN, permittedPath: LIVE_PATH, plannedCalls: 2, authorizationCallCeiling: config.permission.maximumPaidCalls,
  maximumSpendUsd: config.permission.maximumSpendUsd, pricing: LIVE_PRICING, transparency: 'QA wraps standard global fetch before unchanged product main; diagnostics observe actual native transport. Not uninstrumented networking.' });
process.once('exit', () => { guard.close(); try { emit({ kind: 'guard-process-exit', attempts: guard.attempts, reservedMicroUsd: guard.reservedMicroUsd, sendBoundaries: sent.size }); closeSync(fd); } catch {} });
