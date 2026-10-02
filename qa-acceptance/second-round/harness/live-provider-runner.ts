import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, lstat, realpath, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OwnedProcess, exec, isolatedEnv, ownedListener } from '../../harness/process.js';
import { availablePort } from '../../harness/network.js';
import { BlockedError, redact } from '../../harness/security.js';
import { assertTurnResponse, assertAuditResponse, turnRequest } from '../tests/media-provider.js';
import { classifyError, combineVariants, type RoundResult, type VariantResult } from './result.js';
import { LIVE_MODEL, LIVE_PRICING, validateLivePermission, type LivePermission, type LiveEvent } from './live-provider-budget.js';

const qaRoot = fileURLToPath(new URL('../../', import.meta.url));
const sutRevision = '0be8575f326f709fe674e20033843d950385043d';
const hash = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
export function livePermissionFromCloseout(scope: Record<string, any>, startedAt: number): LivePermission {
  assert.equal(scope.active, true); assert.equal(scope.sutRevision, sutRevision);
  assert.equal(scope.authorization?.executionAuthorized, true); assert.equal(scope.authorization?.realProviderAuthorized, true);
  assert.equal(scope.realProvider?.caseId, 'SR-C2-017'); assert.equal(scope.realProvider?.plannedPaidCalls, 2);
  assert.equal(scope.realProvider?.allowAutomaticRetry, false); assert.equal(scope.realProvider?.allowModelFallback, false);
  assert.equal(scope.realProvider?.maximumSpend?.currency, 'USD'); assert.equal(scope.finalExecutionBoundary?.automaticRetries, 0);
  const p: LivePermission = { explicitlyAuthorized: true,
    authorizationReference: `thread:${scope.authorization.sourceThreadId}/message:${scope.authorization.realProviderApprovalMessageId};scope-message:${scope.authorization.humanApprovalMessageId}`,
    stopInstructionReference: `thread:${scope.authorization.sourceThreadId}/message:${scope.authorization.stopMessageId}`,
    credentialReference: scope.realProvider.credentialReference, model: scope.realProvider.model,
    maximumPaidCalls: scope.realProvider.maximumPaidCalls, maximumSpendUsd: scope.realProvider.maximumSpend.amount,
    expiresAt: new Date(startedAt + 30 * 60 * 1000).toISOString() };
  assert.ok(scope.authorization.sourceThreadId && scope.authorization.realProviderApprovalMessageId && scope.authorization.humanApprovalMessageId && scope.authorization.stopMessageId);
  validateLivePermission(p, startedAt); return p;
}
export function verifyLiveTransportLedger(events: LiveEvent[], expected = 2) {
  const reserved = events.filter(e => e.kind === 'fetch-reserved'), created = events.filter(e => e.kind === 'upstream-created');
  const sent = events.filter(e => e.kind === 'upstream-before-first-byte');
  if (events.some(e => e.kind === 'fetch-denied' || e.kind === 'diagnostic-guard-denied')) throw new BlockedError('Independent live transport guard denied an unexpected call; retain original ledger');
  if (reserved.length < expected || created.length < expected || sent.length < expected) throw new BlockedError('Actual native provider send evidence incomplete; connection failure or unobserved dispatch cannot pass');
  assert.equal(reserved.length, expected); assert.equal(created.length, expected); assert.equal(sent.length, expected);
  assert.equal(new Set(sent.map(e => e.attempt)).size, expected);
  for (let attempt = 1; attempt <= expected; attempt++) {
    const r = reserved.find(e => e.attempt === attempt), c = created.find(e => e.attempt === attempt), s = sent.find(e => e.attempt === attempt);
    assert.ok(r && c && s); assert.ok(Number(r.seq) < Number(c.seq) && Number(c.seq) < Number(s.seq));
    assert.equal(s.tls, true); assert.equal(s.remotePort, 443);
    assert.equal(r.reservedMicroUsd, attempt * LIVE_PRICING.reservationMicroUsdPerAttempt);
  }
  return { admittedCalls: reserved.length, nativeRequestCreations: created.length, actualSendBoundaries: sent.length,
    maximumAuthorizedCalls: 8, maximumPlannedCalls: 2, reservedUsd: reserved.length * LIVE_PRICING.reservationMicroUsdPerAttempt / 1000000,
    billingClaim: 'Conservative reservation; cancellation or missing usage does not prove zero charge. This is not a provider invoice.' };
}
export function assertLivePublicResponse(status: number, body: unknown, check: (body: unknown) => unknown) {
  const code = body && typeof body === 'object' && 'code' in body ? String(body.code) : '';
  if (['MODEL_AUTH_ERROR', 'MODEL_RATE_LIMITED', 'MODEL_UNAVAILABLE', 'MODEL_TIMEOUT', 'GEMINI_KEY_MISSING'].includes(code))
    throw new BlockedError(`Real provider prerequisite unavailable: HTTP ${status}, ${code}; retain actual failed attempt and its fee reservation`);
  assert.equal(status, 200, `Actual public Agent call returned HTTP ${status}${code ? ', ' + code : ''}`); check(body);
}

/** Only root invokes this after freezing QA. No discovery/reading of key values.
 * The ordinary SUT main alone resolves GEMINI_ENV_FILE; it is explicitly run
 * with the recorded QA outbound fetch budget wrapper and native diagnostics. */
export async function runLiveProviderAcceptance(options: { sutDirectory: string; revision: string }) {
  const sut = await realpath(options.sutDirectory), workspace = dirname(qaRoot);
  assert.equal(options.revision, sutRevision); assert.equal((await exec('git', ['rev-parse', 'HEAD'], { cwd: sut })).stdout.trim(), sutRevision);
  assert.equal((await exec('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: sut })).stdout.trim(), '', 'SUT tracked files must be frozen');
  const dirty = (await exec('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: workspace })).stdout.split('\n').filter(Boolean).filter(line => !line.startsWith('?? qa-acceptance/second-round/reports/runs/'));
  assert.deepEqual(dirty, [], 'Freeze all QA source before any live provider-capable process');
  assert.equal(process.version, 'v24.21.0'); assert.equal(process.versions.undici, '7.29.1');
  const qaRevision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: workspace })).stdout.trim();
  const scope = JSON.parse(await readFile(resolve(qaRoot, 'second-round/config/bounded-closeout.json'), 'utf8'));
  const started = Date.now(), permission = livePermissionFromCloseout(scope, started);
  const credentialStat = await lstat(permission.credentialReference); assert.ok(credentialStat.isFile() && !credentialStat.isSymbolicLink());
  const id = new Date(started).toISOString().replaceAll(':', '-') + '-live-' + randomUUID().slice(0, 8);
  const out = resolve(qaRoot, 'second-round/reports/runs', id), runtimeRoot = resolve(qaRoot, '.runtime/live-provider');
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  // One marker for this human authorization, independent of the generated run ID.
  // It deliberately remains after cleanup; the same approval cannot auto-retry.
  const onceMarker = resolve(runtimeRoot, hash(permission.authorizationReference) + '.started.json');
  await writeFile(onceMarker, JSON.stringify({ id, qaRevision, sutRevision, startedAt: new Date(started).toISOString(), stopInstructionReference: permission.stopInstructionReference }), { flag: 'wx', mode: 0o600 });
  await mkdir(out, { recursive: true }); const runtime = resolve(runtimeRoot, id); await mkdir(runtime, { mode: 0o700 });
  const session = resolve(runtime, 'session'), ledgerPath = resolve(out, 'live-transport.ndjson'), configPath = resolve(runtime, 'guard-config.json');
  const permissionPath = resolve(out, 'authorization-and-cost-guard.json');
  const sourceFiles = (await exec('git', ['ls-files', 'apps/gemini-agent/src', 'package.json', 'package-lock.json'], { cwd: sut })).stdout.trim().split('\n');
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async path => [path, hash(await readFile(resolve(sut, path)))])));
  const manifest: Record<string, any> = { runId: id, caseId: 'SR-C2-017', startedAt: new Date(started).toISOString(), sutRevision, qaRevision,
    scope, permission, sourceHashes, pricing: LIVE_PRICING, autoRetries: 0, entry: 'apps/gemini-agent/src/main.ts',
    transportInstrumentation: 'QA standard global fetch wrapper denies before native fetch; native undici diagnostics record real requests. No request/response rewriting, no product imports.',
    data: 'Only synthetic direct turn/audit. No backend, Gateway, DB, real groups or users; generated tools are inspected, never executed.',
    preparationCredentialHandling: 'Only file metadata checked; original product main reads the referenced key. Key excluded from QA environment, command arguments, fixtures, logs and evidence.', productionReadiness: 'NOT_ASSESSED' };
  await writeFile(permissionPath, redact({ permission, pricing: LIVE_PRICING, plannedCalls: 2, totalReservedMaximumUsd: 0.720896, oneAttemptMarker: onceMarker }) + '\n');
  await writeFile(configPath, JSON.stringify({ permission, ledgerPath, sutRevision }), { mode: 0o600 });
  const port = await availablePort(), base = `http://127.0.0.1:${port}`;
  const owner = new OwnedProcess({ command: process.execPath, args: ['--import', 'tsx', '--import', resolve(qaRoot, 'second-round/harness/live-provider-preload.ts'), 'apps/gemini-agent/src/main.ts'] }, sut,
    isolatedEnv({ GEMINI_ENV_FILE: permission.credentialReference, GEMINI_MODEL: LIVE_MODEL, GEMINI_AGENT_PORT: String(port), GEMINI_SESSION_DIR: session,
      GEMINI_USAGE_ENABLED: 'true', QA_LIVE_GUARD_CONFIG: configPath }), resolve(out, 'provider.log'));
  const variants: VariantResult[] = [], cleanupErrors: string[] = [];
  const saveManifest = () => writeFile(resolve(out, 'manifest.json'), redact(manifest) + '\n');
  console.log(JSON.stringify({ event: 'live-run-created', runId: id, out, sutRevision, qaRevision, maximumPlannedCalls: 2, maximumReservedUsd: 0.720896 }));
  await saveManifest();
  try {
    await owner.start();
    const until = Date.now() + 30000; let ready = false;
    while (Date.now() < until) {
      owner.assertRunning();
      const log = await readFile(owner.log, 'utf8').catch(() => '');
      if (log.split('\n').some(line => { try { const e = JSON.parse(line); return e.event === 'gemini-agent-ready' && e.address === base && e.model === LIVE_MODEL; } catch { return false; } })) { ready = true; break; }
      await new Promise(ok => setTimeout(ok, 50));
    }
    if (!ready || !await ownedListener(port, owner)) throw new BlockedError('Actual owned live provider readiness not established');
    manifest.guardianPid = owner.pid; await saveManifest();
    const runId = 'qa-live-synthetic-' + randomUUID();
    for (const spec of [
      { id: 'real-synthetic-turn', path: '/agent/turn', body: turnRequest(runId), check: assertTurnResponse },
      { id: 'real-synthetic-audit', path: '/agent/audit', body: { groupId: 'qa-live-synthetic', text: '请回复合成测试已完成。' }, check: assertAuditResponse },
    ]) {
      const evidence = resolve(out, spec.id + '.json'); let observed = false;
      try {
        owner.assertRunning(); validateLivePermission(permission);
        const guardEvents = (await readFile(ledgerPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        if (guardEvents.some(e => e.kind === 'fetch-denied' || e.kind === 'diagnostic-guard-denied')) throw new BlockedError('Live guard has denied a call; no further public operation');
        const began = new Date().toISOString();
        const reply = await fetch(base + spec.path, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify(spec.body), signal: AbortSignal.timeout(15000) });
        const rawBody = await reply.text(); let body: unknown; try { body = JSON.parse(rawBody); } catch { body = null; }
        await writeFile(evidence, redact({ began, completedAt: new Date().toISOString(), path: spec.path, request: spec.body, status: reply.status, body, rawBody }) + '\n');
        observed = true;
        assertLivePublicResponse(reply.status, body, spec.check);
        variants.push({ id: spec.id, status: 'PASS', evidence: [evidence] });
      } catch (error) {
        const failure = resolve(out, spec.id + '-error.json'); await writeFile(failure, redact({ name: error instanceof Error ? error.name : 'unknown', message: String(error) }) + '\n');
        variants.push({ id: spec.id, status: classifyError(error), reason: String(error), evidence: observed ? [evidence, failure] : [failure] });
      }
    }
  } catch (error) {
    const evidence = resolve(out, 'startup-error.json'); await writeFile(evidence, redact({ error: String(error) }) + '\n');
    variants.push({ id: 'live-environment', status: classifyError(error), reason: String(error), evidence: [evidence] });
  } finally {
    try { await owner.stop('SIGTERM'); manifest.exitOutcome = owner.exitOutcome; } catch (error) { cleanupErrors.push(String(error)); }
    // Graceful app.close drains the real journal; no arbitrary sleep as proof.
    try {
      const journal = await readFile(resolve(session, 'usage/usage.jsonl'), 'utf8'); await writeFile(resolve(out, 'actual-usage.jsonl'), journal, { mode: 0o600 });
      const usage = journal.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      manifest.usage = { records: usage.length, distinctAttempts: new Set(usage.map(row => row.attemptId)).size,
        purposeCounts: Object.fromEntries(['turn', 'audit'].map(purpose => [purpose, usage.filter(row => row.purpose === purpose).length])) };
      assert.equal(usage.length, 2); assert.equal(manifest.usage.distinctAttempts, 2); assert.deepEqual(manifest.usage.purposeCounts, { turn: 1, audit: 1 });
      assert.ok(usage.every(row => row.model === LIVE_MODEL && row.stage === 'validated-generation'));
      variants.push({ id: 'actual-usage-attempt-accounting', status: 'PASS', evidence: [resolve(out, 'actual-usage.jsonl')] });
    } catch (error) { variants.push({ id: 'actual-usage-attempt-accounting', status: 'BLOCKED', reason: String(error), evidence: [permissionPath] }); }
    try {
      const events = (await readFile(ledgerPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
      manifest.costAndCalls = verifyLiveTransportLedger(events);
      assert.ok(events.some(e => e.kind === 'guard-installed') && events.some(e => e.kind === 'guard-process-exit'));
      variants.push({ id: 'actual-native-outbound-and-cost-guard', status: 'PASS', evidence: [ledgerPath, permissionPath] });
    } catch (error) { variants.push({ id: 'actual-native-outbound-and-cost-guard', status: classifyError(error), reason: String(error), evidence: [permissionPath, ledgerPath] }); }
    try {
      if (owner.running || (manifest.guardianPid && !owner.exitOutcome)) throw new BlockedError('Owned provider exit not proved; preserve runtime for exact cleanup');
      await rm(runtime, { recursive: true }); manifest.ownedRuntimeRemoved = true;
    } catch (error) { cleanupErrors.push(String(error)); }
  }
  const result: RoundResult = { caseId: 'SR-C2-017', status: combineVariants(variants, cleanupErrors), variants, cleanupErrors,
    startedAt: new Date(started).toISOString(), completedAt: new Date().toISOString(), durationMs: Date.now() - started, attempt: 1, phase: 'acceptance' };
  manifest.completedAt = result.completedAt; manifest.status = result.status; manifest.cleanupErrors = cleanupErrors; await saveManifest();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  await writeFile(resolve(out, 'report.md'), `# SR-C2-017 bounded real-provider acceptance\n\nResult: **${result.status}**. SUT \`${sutRevision}\`; QA \`${qaRevision}\`.\n\nOne authorized attempt; two planned public requests, no automatic retry or model fallback. Actual native TLS send boundaries and full failed-attempt reservations are retained. Maximum reserved cost is $0.720896, not an invoice. Only synthetic inputs; no generated tools executed.\n\n${variants.map(v => `- ${v.id}: ${v.status}${v.reason ? ' — ' + v.reason.replaceAll('\n',' ') : ''}`).join('\n')}\n\nSee result.json, manifest.json, live-transport.ndjson and actual-usage.jsonl. Production readiness is not assessed.\n`);
  console.log(JSON.stringify({ event: 'live-run-complete', out, status: result.status, variants: variants.map(v => ({ id: v.id, status: v.status })) }));
  return { out, result };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), sut = args.indexOf('--sut'), revision = args.indexOf('--revision');
  if (sut < 0 || revision < 0 || args.length !== 4 || !args[sut + 1] || !args[revision + 1]) throw new Error('Usage: live-provider-runner.ts --sut ABS --revision SHA');
  await runLiveProviderAcceptance({ sutDirectory: args[sut + 1]!, revision: args[revision + 1]! });
}
