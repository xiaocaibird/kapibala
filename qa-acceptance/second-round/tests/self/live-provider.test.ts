import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, isolatedEnv } from '../../../harness/process.js';
import { LiveBudgetGuard, guardedLiveFetch, LIVE_MODEL, LIVE_ORIGIN, LIVE_PATH, LIVE_PRICING, type LiveEvent, type LivePermission } from '../../harness/live-provider-budget.js';
import { livePermissionFromCloseout, verifyLiveTransportLedger, assertLivePublicResponse } from '../../harness/live-provider-runner.js';

const permission = (): LivePermission => ({ explicitlyAuthorized: true, authorizationReference: 'actual-human', stopInstructionReference: 'actual-stop', credentialReference: '/Users/zcm/Desktop/kapibala/.env', model: LIVE_MODEL, maximumPaidCalls: 8, maximumSpendUsd: 1, expiresAt: new Date(Date.now() + 60000).toISOString() });
const body = () => ({ systemInstruction: { parts: [{ text: 'synthetic system' }] }, contents: [{ role: 'user', parts: [{ text: 'synthetic text only' }] }],
  generationConfig: { candidateCount: 1, maxOutputTokens: 2048, temperature: 0, thinkingConfig: { thinkingLevel: 'MINIMAL' }, responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: {} } } } });
const init = (): RequestInit => ({ method: 'POST', redirect: 'error', body: JSON.stringify(body()) });
const url = LIVE_ORIGIN + LIVE_PATH;
test('full official model envelope reserves 0.720896 USD for two attempts, never expected/zero usage', () => {
  assert.equal((LIVE_PRICING.inputTokens * LIVE_PRICING.inputUsdPerMillion + LIVE_PRICING.outputTokensIncludingThinking * LIVE_PRICING.outputUsdPerMillion), LIVE_PRICING.reservationMicroUsdPerAttempt);
  const guard = new LiveBudgetGuard(permission(), () => {});
  guard.reserve(url, init()); guard.settle(1); guard.reserve(url, init()); guard.settle(2);
  assert.equal(guard.reservedMicroUsd, 720896); assert.throws(() => guard.reserve(url, init()), /LIVE_CALL_LIMIT/);
});
test('failed and cancelled native calls consume reservations before native dispatch; never retry', async () => {
  const events: LiveEvent[] = []; let calls = 0;
  const guard = new LiveBudgetGuard(permission(), e => events.push(e));
  const wrapped = guardedLiveFetch((async () => { assert.equal(events.at(-1)?.kind, 'fetch-reserved'); calls++; throw new Error('synthetic transport failure'); }) as typeof fetch, guard);
  for (let i = 0; i < 2; i++) await assert.rejects(wrapped(url, init()), /synthetic/);
  assert.throws(() => wrapped(url, init()), /LIVE_CALL_LIMIT/); assert.equal(calls, 2); assert.equal(guard.reservedMicroUsd, 720896);
});
test('wrapper retains exact input/init/response objects and never touches credential headers', async () => {
  const request = init(), response = new Response('synthetic');
  Object.defineProperty(request, 'headers', { get: () => { throw new Error('credentials must not be read'); } });
  const wrapped = guardedLiveFetch((async (input, options) => { assert.equal(input, url); assert.equal(options, request); return response; }) as typeof fetch, new LiveBudgetGuard(permission(), () => {}));
  assert.equal(await wrapped(url, request), response);
});
test('concurrent call, changed model, redirects, media, tools, extended output and expired authority never reach native fetch', async () => {
  const guard = new LiveBudgetGuard(permission(), () => {}); guard.reserve(url, init());
  assert.throws(() => guard.reserve(url, init()), /LIVE_CONCURRENT/); guard.settle(1);
  let dispatched = 0; const wrapped = guardedLiveFetch((async () => { dispatched++; return new Response(); }) as typeof fetch, guard);
  for (const [target, request] of [
    [url + '?key=DO-NOT-READ', init()], [url.replace(LIVE_MODEL, 'other-model'), init()], [url, { ...init(), redirect: 'follow' }],
    [url, { ...init(), body: JSON.stringify({ ...body(), tools: [] }) }],
    [url, { ...init(), body: JSON.stringify({ ...body(), contents: [{ role: 'user', parts: [{ inlineData: 'media' }] }] }) }],
    [url, { ...init(), body: JSON.stringify({ ...body(), generationConfig: { ...body().generationConfig, maxOutputTokens: 65536 } }) }],
  ] as [string, RequestInit][]) assert.throws(() => wrapped(target, request));
  guard.permission.expiresAt = '2000-01-01T00:00:00.000Z'; assert.throws(() => wrapped(url, init()), /EXPIRED/); assert.equal(dispatched, 0);
});
test('reservation journal failure prevents native fetch; no lost pre-call accounting', () => {
  let dispatched = 0;
  const wrapped = guardedLiveFetch((async () => { dispatched++; return new Response(); }) as typeof fetch, new LiveBudgetGuard(permission(), () => { throw new Error('synthetic journal unavailable'); }));
  assert.throws(() => wrapped(url, init()), /journal unavailable/); assert.equal(dispatched, 0);
});
test('real TLS ledger needs paired distinct sends and reserves; missing or repeated sends never pass', () => {
  const events: LiveEvent[] = [1,2].flatMap(attempt => [
    { kind: 'fetch-reserved', attempt, seq: attempt * 3, reservedMicroUsd: attempt * 360448 },
    { kind: 'upstream-created', attempt, seq: attempt * 3 + 1 },
    { kind: 'upstream-before-first-byte', attempt, seq: attempt * 3 + 2, tls: true, remotePort: 443 },
  ]);
  assert.equal(verifyLiveTransportLedger(events).reservedUsd, 0.720896);
  assert.throws(() => verifyLiveTransportLedger(events.slice(0,-1)));
  assert.throws(() => verifyLiveTransportLedger([...events, events[2]!]));
  assert.throws(() => verifyLiveTransportLedger(events.map(e => e.kind === 'upstream-before-first-byte' ? { ...e, tls: false } : e)));
});
test('closeout authority creates one short live window while enforcing fixed scope and original human references', () => {
  const scope = { active: true, sutRevision: '0be8575f326f709fe674e20033843d950385043d', authorization: {
    executionAuthorized: true, realProviderAuthorized: true, sourceThreadId: 'thread', realProviderApprovalMessageId: 'human-key', humanApprovalMessageId: 'human-scope', stopMessageId: 'human-stop' },
    realProvider: { caseId: 'SR-C2-017', plannedPaidCalls: 2, maximumPaidCalls: 8, maximumSpend: { currency: 'USD', amount: 1 }, model: LIVE_MODEL, credentialReference: '/Users/zcm/Desktop/kapibala/.env', allowAutomaticRetry: false, allowModelFallback: false },
    finalExecutionBoundary: { automaticRetries: 0 } };
  const now = Date.now(), p = livePermissionFromCloseout(scope, now);
  assert.equal(Date.parse(p.expiresAt) - now, 1800000); assert.match(p.authorizationReference, /human-key/); assert.match(p.stopInstructionReference, /human-stop/);
  assert.throws(() => livePermissionFromCloseout({ ...scope, realProvider: { ...scope.realProvider, plannedPaidCalls: 8 } }, now));
});
test('missing provider prerequisite is BLOCKED while an observed malformed protocol stays FAIL', () => {
  for (const code of ['MODEL_AUTH_ERROR','MODEL_RATE_LIMITED','MODEL_UNAVAILABLE','MODEL_TIMEOUT'])
    assert.throws(() => assertLivePublicResponse(502, { code }, () => {}), /\[BLOCKED\]/);
  assert.throws(() => assertLivePublicResponse(502, { code: 'MODEL_INVALID_OUTPUT' }, () => {}), assert.AssertionError);
  assert.throws(() => assertLivePublicResponse(200, {}, () => assert.fail('malformed response')), assert.AssertionError);
});
test('actual QA-only preload installs and denies foreign target before networking without reading any key', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'qa-live-guard-self-'));
  try {
    const ledgerPath = resolve(directory, 'ledger.ndjson'), config = resolve(directory, 'config.json');
    await writeFile(config, JSON.stringify({ permission: permission(), ledgerPath, sutRevision: 'qa-self-test-only' }));
    const qa = fileURLToPath(new URL('../../../', import.meta.url));
    const preload = fileURLToPath(new URL('../../harness/live-provider-preload.ts', import.meta.url));
    const code = `let denied=false;try{await fetch('https://invalid.example/not-authorized?key=SELFTEST-NOT-A-CREDENTIAL')}catch(e){denied=e.code==='LIVE_TRANSPORT_SCOPE'}if(!denied)process.exitCode=1`;
    await exec(process.execPath, ['--import','tsx','--import',preload,'--input-type=module','-e',code], { cwd: qa, env: isolatedEnv({ QA_LIVE_GUARD_CONFIG: config }), timeout: 10000 });
    const raw = await readFile(ledgerPath, 'utf8'), events = raw.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events[0].kind, 'guard-installed'); assert.equal(events.at(-1).kind, 'guard-process-exit');
    assert.equal(events.at(-1).attempts, 0); assert.equal(events.at(-1).sendBoundaries, 0);
    assert.ok(events.some(e => e.kind === 'fetch-denied')); assert.ok(!raw.includes('SELFTEST-NOT-A-CREDENTIAL'));
  } finally { await rm(directory, { recursive: true }); }
});
