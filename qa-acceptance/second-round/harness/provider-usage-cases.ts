import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, lstat } from 'node:fs/promises';
import { C2_CAPABILITIES as P, PreparationBlocked, type Json, type ProviderDriver, type ProviderFault, type UsageRecord } from '../contracts/media-provider.js';
import { withOwnedDriver, turnRequest, assertTurnResponse, assertAuditResponse, providerPendingAndLock, providerCompletedReuse } from '../tests/media-provider.js';
import { decodeProviderWire } from './provider-wire.js';
import { assertUsageRecord, expectedTokens, USAGE_FIELDS } from './backend-oracles.js';
type Plan = Parameters<ProviderDriver['enqueue']>[0];
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const tokens = (value: Plan) => {
  const raw = (value as Plan & { rawUsage?: Record<string, Json> }).rawUsage;
  if (raw) return raw;
  return value.actualUsage == null ? null : { promptTokenCount: value.actualUsage.inputTokens, candidatesTokenCount: value.actualUsage.outputTokens, totalTokenCount: value.actualUsage.totalTokens };
};
async function observedOne(d: ProviderDriver, plan: Plan, marker?: string) {
  const request = turnRequest(), purpose = plan.purpose;
  if (marker) request.messages[0]!.content.push({ type: 'text', text: marker });
  const before = await d.usage(), ids = new Set(before.records.map((r) => r.attemptId)), callCount = (await d.calls()).length;
  await d.enqueue(plan);
  const response = await d.exchange(purpose === 'turn' ? '/agent/turn' : '/agent/audit', purpose === 'turn' ? request : { groupId: `qa-usage-${randomUUID()}`, text: marker ?? 'QA synthetic audit' });
  await d.settleUsage();
  const after = await d.usage(), records = after.records.filter((r) => !ids.has(r.attemptId));
  assert.equal((await d.calls()).length, callCount + 1, 'one actual inference, no silent retry'); assert.equal(records.length, 1, 'one new retained attempt in controlled serial sample');
  const record = records[0]!, success = response.status === 200;
  if (success) { if (purpose === 'turn') assertTurnResponse(response.body); else assertAuditResponse(response.body); }
  const fault = plan.fault as string | undefined;
  const status = fault?.startsWith('http-') ? Number(fault.slice(5)) : fault === 'network-error' || fault === 'timeout' || (plan.delayResponseMs ?? 0) > 9000 ? null : 200;
  // Bad JSON cannot yield parsed usage metadata. Other successful-HTTP invalid
  // output variants retain independently known valid fields.
  const expected = expectedTokens(status, fault === 'bad-json' ? null : tokens(plan));
  assertUsageRecord(record.raw, { purpose, runId: purpose === 'turn' ? request.runId : null, outcome: success ? 'success' : 'failure', tokens: expected, sentinels: marker ? [marker] : [] });
  await d.evidence('usage-serial-request-proof', { purpose, runId: purpose === 'turn' ? request.runId : null, requestHash: hash(request), actualPlan: { ...plan, proposal: plan.proposal ? { kind: plan.proposal.kind } : undefined }, responseStatus: response.status, previousAttempts: [...ids], newAttempt: record, upstreamCountBefore: callCount, upstreamCountAfter: callCount + 1, correlation: 'new unique local attempt after one controlled real request; no invented upstream ID' });
  return { record, response, request, after };
}
const successPlan = (inputTokens = 7): Plan => ({ purpose: 'turn', proposal: { kind: 'text', text: 'QA usage completion' }, actualUsage: { inputTokens, outputTokens: 3, totalTokens: inputTokens + 3 } });
const run = (driver: ProviderDriver, id: string, body: (d: ProviderDriver) => Promise<void>, options?: Record<string, Json>) => withOwnedDriver(driver, [P.protocol, P.upstream, P.usage], id, body, options);

/** Each backend usage ID performs its own current-version observations. Missing
 * subscenarios are explicitly BLOCKED after runnable evidence is retained. */
export async function runUsageCase(id: string, driver: ProviderDriver): Promise<void> {
  if (id === 'SR-BE-USG-001') return run(driver, id, async (d) => {
    const a = await observedOne(d, successPlan(0)); assert.equal(a.record.outcome, 'success');
    for (const verdict of ['pass', 'fail'] as const) { const b = await observedOne(d, { purpose: 'audit', proposal: { kind: 'audit', verdict, reason: 'QA content verdict' }, actualUsage: verdict === 'pass' ? { inputTokens: 2, outputTokens: 1, totalTokens: 3 } : null }); assert.equal(b.record.outcome, 'success'); assert.equal((b.response.body as { verdict: string }).verdict, verdict); }
  });
  if (id === 'SR-BE-USG-002' || id === 'SR-BE-USG-012') return run(driver, id, async (d) => {
    const faults: ProviderFault[] = id.endsWith('002') ? ['http-500', 'bad-json', 'native-function-call', 'network-error', 'timeout'] : ['http-500', 'native-function-call', 'multiple-candidates', 'safety-blocked', 'network-error', 'timeout'];
    for (const fault of faults) { const sample = await observedOne(d, { purpose: 'turn', fault, actualUsage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 } }); assert.notEqual(sample.response.status, 200); assert.equal(sample.record.outcome, 'failure'); }
    const late = await observedOne(d, { ...successPlan(), delayResponseMs: 10_000 }); assert.notEqual(late.response.status, 200); assert.equal(late.record.errorCode, 'MODEL_TIMEOUT');
    const normal = await observedOne(d, successPlan(5)); assert.equal(normal.response.status, 200);
  });
  if (id === 'SR-BE-USG-003') return run(driver, id, async (d) => {
    const first = await observedOne(d, successPlan()), count = (await d.calls()).length;
    for (let i = 0; i < 3; i++) assert.deepEqual((await d.exchange('/agent/turn', first.request)).body, first.response.body);
    await d.settleUsage(); assert.equal((await d.calls()).length, count); assert.deepEqual((await d.usage()).records, first.after.records);
    await observedOne(d, successPlan(9)); assert.equal((await d.calls()).length, count + 1);
  });
  if (id === 'SR-BE-USG-004') return run(driver, id, async (d) => {
    const requests = [turnRequest(), turnRequest()];
    for (const n of [31, 41]) await d.enqueue(successPlan(n));
    await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: 'pass', reason: 'parallel audit' }, actualUsage: { inputTokens: 51, outputTokens: 1 } });
    const replies = await Promise.all([...requests.map((r) => d.exchange('/agent/turn', r)), d.exchange('/agent/audit', { groupId: 'qa-parallel', text: 'parallel' })]);
    replies.forEach((r) => assert.equal(r.status, 200)); await d.settleUsage(); const actual = await d.usage();
    assert.equal(actual.records.length, 3); assert.equal(new Set(actual.records.map((r) => r.attemptId)).size, 3);
    assert.deepEqual(actual.records.filter((r) => r.purpose === 'turn').map((r) => r.runId).sort(), requests.map((r) => r.runId).sort());
    assert.deepEqual(actual.records.filter((r) => r.purpose === 'turn').map((r) => (r.raw as Record<string, Json>).inputTokens).sort(), [31, 41]);
    for (const record of actual.records.filter((r) => r.purpose === 'turn')) {
      const matches = (await d.calls()).filter((call) => call.purpose === 'turn' && decodeProviderWire(`/v1beta/models/${call.model}:generateContent`, call.rawWire).payload.runId === record.runId);
      assert.equal(matches.length, 1); assert.equal((record.raw as Record<string, Json>).inputTokens, matches[0]!.actualUsage?.inputTokens);
    }
    assert.equal(actual.records.find((r) => r.purpose === 'audit')!.runId, null); assert.equal((actual.records.find((r) => r.purpose === 'audit')!.raw as Record<string, Json>).inputTokens, 51); await d.evidence('usage-concurrent-actual-records', actual);
    throw new PreparationBlocked('Concurrent identity sample executed; writer-held queue overflow/64+64 capacity has no actual fixture, not inferred from low load');
  });
  if (id === 'SR-BE-USG-005' || id === 'SR-BE-USG-009') return run(driver, id, async (d) => {
    await observedOne(d, successPlan()); const fault = await d.usageWriteFault();
    try {
      for (let i = 0; i < 3; i++) { const purpose = i === 1 ? 'audit' : 'turn'; await d.enqueue(purpose === 'turn' ? successPlan() : { purpose, proposal: { kind: 'audit', verdict: 'pass', reason: 'writer failure independent' } }); const result = await d.exchange(purpose === 'turn' ? '/agent/turn' : '/agent/audit', purpose === 'turn' ? turnRequest() : { groupId: 'qa-writer', text: 'nonsecret writer canary' }); assert.equal(result.status, 200); }
      const failure = await fault.observed(); await d.evidence('usage-actual-io-failure', failure);
      const lines = (await d.logs()).flatMap((text) => text.split('\n')).filter((line) => /USAGE_(WRITE_FAILED|STORE_UNAVAILABLE|QUEUE_FULL|RECORD_INVALID)/.test(line));
      assert.ok(lines.length > 0); for (const code of ['USAGE_WRITE_FAILED', 'USAGE_STORE_UNAVAILABLE', 'USAGE_QUEUE_FULL', 'USAGE_RECORD_INVALID']) assert.ok(lines.filter((line) => line.includes(code)).length <= 1, 'one diagnostic category per current instance');
      for (const line of lines) assert.ok(!/nonsecret writer canary|QA-NOT-A-REAL-KEY|postgres:\/\/|\/sessions\/usage/.test(line));
      await d.evidence('usage-fixed-diagnostics', { categories: lines.map((line) => /USAGE_[A-Z_]+/.exec(line)?.[0]), rawLineHashes: lines.map(hash) });
    } finally { await fault.restore(); }
    // Store remains best effort after actual drops. Compare an independently
    // new successful record; do not demand recovery of lost observations.
    await d.enqueue(successPlan(19)); const request = turnRequest(); assert.equal((await d.exchange('/agent/turn', request)).status, 200);
    const deadline = performance.now() + 5000;
    do { const actual = await d.usage(); if (actual.records.some((r) => r.runId === request.runId)) { await d.evidence('usage-restored-new-record', actual); return; } await new Promise((resolve) => setTimeout(resolve, 30)); } while (performance.now() < deadline);
    throw new PreparationBlocked('Restored write path has not produced a new actual record within diagnostic budget');
  });
  if (id === 'SR-BE-USG-007') return run(driver, id, async (d) => {
    const canaries = [0, 1, 2].map(() => `QA-PRIVATE-${randomUUID()}`);
    await observedOne(d, { ...successPlan(), proposal: { kind: 'text', text: canaries[0]! } }, canaries[0]);
    await observedOne(d, { purpose: 'audit', proposal: { kind: 'audit', verdict: 'fail', reason: canaries[1]! } }, canaries[1]);
    await observedOne(d, { purpose: 'turn', fault: 'http-500', proposal: { kind: 'text', text: canaries[2]! } }, canaries[2]);
    const files = await d.usageFiles(); for (const path of files.files) { const bytes = await readFile(path); for (const marker of canaries) assert.ok(!bytes.includes(marker)); await d.evidence('usage-no-body-file-scan', { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), forbiddenMarkerHashes: canaries.map(hash) }); }
    for (const record of (await d.usage()).records) assert.deepEqual(Object.keys(record.raw as object).sort(), [...USAGE_FIELDS].sort());
    const logs = (await d.logs()).join('\n'); for (const marker of canaries) assert.ok(!logs.includes(marker)); assert.ok(!logs.includes('qa-offline-synthetic-key'));
  });
  if (id === 'SR-BE-USG-008') {
    await providerCompletedReuse(driver); await providerPendingAndLock(driver);
    throw new PreparationBlocked('Normal completed reuse and provider-pending hard kill executed; actual queued-usage-write hard-kill window remains unbound');
  }
  if (id === 'SR-BE-USG-006' || id === 'SR-BE-USG-010') {
    for (const enabled of [true, false]) await run(driver, `${id}-${enabled}`, async (d) => {
      await d.enqueue(successPlan()); assert.equal((await d.exchange('/agent/turn', turnRequest())).status, 200); await d.settleUsage(); const files = await d.usageFiles(), value = await d.usage();
      assert.equal(value.records.length, enabled ? 1 : 0); if (enabled) { assert.equal((await lstat(files.root)).mode & 0o777, 0o700); for (const path of files.files) assert.equal((await lstat(path)).mode & 0o777, 0o600); const prior = value.records; assert.equal((await d.restart('SIGTERM', { usageEnabled: false })).started, true); assert.deepEqual((await d.usage()).records, prior); }
      else assert.equal(files.files.length, 0);
      await d.evidence('usage-main-enable-disable-permissions', { enabled, files, value });
    }, { usageEnabled: enabled });
    throw new PreparationBlocked(id.endsWith('006') ? 'Main toggle/private permissions executed; exact stopped-owner temp/foreign-owner cleanup and key-file isolation subvariants lack an independent host fixture' : 'Main default/false executed; factory absent/explicit usage and key-file-only config isolation have no independent delivered host');
  }
  if (id === 'SR-BE-USG-011') {
    for (const limit of [1, 2]) await run(driver, `${id}-records-${limit}`, async (d) => {
      for (let i = 0; i < limit + 2; i++) { await d.enqueue(successPlan(i)); assert.equal((await d.exchange('/agent/turn', turnRequest())).status, 200); }
      await d.settleUsage(); const actual = await d.usage(); assert.equal(actual.records.length, limit); assert.ok(actual.actualBytes <= 4096); await d.evidence('usage-actual-record-byte-bound', { configured: { records: limit, bytes: 4096 }, actual });
    }, { usageMaxRecords: limit, usageMaxBytes: 4096 });
    throw new PreparationBlocked('Actual records limit and UTF-8 file bound samples executed; complete 10000/16MiB edge, illegal configuration and trusted age clock matrices remain unbound');
  }
  if (id === 'SR-BE-USG-013') return run(driver, id, async (d) => {
    const base: Record<string, Json> = { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 99 };
    const fields = Object.keys(base);
    for (const field of fields) for (const value of [undefined, null, -1, 0.5, '0', true, Number.MAX_SAFE_INTEGER + 1, 0, 17, Number.MAX_SAFE_INTEGER]) {
      const rawUsage = { ...base }; if (value === undefined) delete rawUsage[field]; else rawUsage[field] = value;
      const plan = { ...successPlan(), actualUsage: undefined, rawUsage } as Plan;
      const result = await observedOne(d, plan); assert.equal(result.response.status, 200);
    }
    for (const rawUsage of [{ promptTokenCount: 3, candidatesTokenCount: 4 }, { candidatesTokenCount: 4, totalTokenCount: 7 }, base]) await observedOne(d, { ...successPlan(), actualUsage: undefined, rawUsage } as Plan);
    const mixed = await observedOne(d, { purpose: 'turn', fault: 'native-function-call', rawUsage: { promptTokenCount: 3, candidatesTokenCount: null, totalTokenCount: 99 } } as Plan); assert.notEqual(mixed.response.status, 200);
  });
  throw new PreparationBlocked(`No reviewed usage operation mapping for ${id}`);
}
