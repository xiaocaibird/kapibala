import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProviderUsageFiles, type ProviderUsageHost } from '../../harness/provider-usage.js';
const row = () => ({ requestId: randomUUID(), attemptId: randomUUID(), runId: 'qa-run', observedAt: new Date().toISOString(), stage: 'validated-generation', purpose: 'turn', model: 'gemini-3.1-flash-lite', elapsedMs: 4.25, outcome: 'success', errorCode: null, inputTokens: null, outputTokens: 0, totalTokens: null });
async function fixture() {
  const runtime = resolve('.runtime/second-round-self'); await mkdir(runtime, { recursive: true }); const root = await mkdtemp(join(runtime, 'usage-'));
  const sessionDirectory = join(root, 'sessions'); await mkdir(join(sessionDirectory, 'usage'), { recursive: true, mode: 0o700 });
  let stops = 0, starts = 0;
  const host: ProviderUsageHost = { sessionDirectory, resourceRoot: root, options: {}, logs: async () => [], stopGracefully: async () => { stops++; return { code: 0, signal: null, evidence: { reference: 'qa-only-exit', raw: { simulated: true } } }; }, start: async () => { starts++; return { reference: 'qa-only-start', raw: { simulated: true } }; } };
  const helper = new ProviderUsageFiles(() => host, async () => [], 'qa-self-only');
  return { root, host, helper, file: join(sessionDirectory, 'usage', 'usage.jsonl'), counts: () => ({ stops, starts }), close: () => rm(root, { recursive: true, force: true }) };
}
test('actual JSONL projection preserves unknown/zero and local identity without upstream fabrication', async () => {
  const f = await fixture(); try {
    const original = row(); await writeFile(f.file, `${JSON.stringify(original)}\n`, { mode: 0o600 });
    const result = await f.helper.usage(); assert.deepEqual(result.records[0]!.usage, { outputTokens: 0 }); assert.equal(result.records[0]!.serviceCallId, original.attemptId); assert.deepEqual(result.records[0]!.raw, original);
    assert.equal(result.actualBytes, Buffer.byteLength(`${JSON.stringify(original)}\n`)); assert.equal((await f.helper.usageFiles()).files.length, 1);
  } finally { await f.close(); }
});
test('usage evidence rejects partial JSONL and symlinks instead of forgiving corrupt bytes', async () => {
  const f = await fixture(); try {
    await writeFile(f.file, JSON.stringify(row())); await assert.rejects(f.helper.usage(), /complete JSONL/);
    await rm(f.file); const other = join(f.root, 'other'); await writeFile(other, ''); await symlink(other, f.file); await assert.rejects(f.helper.usage(), /Unsafe/);
  } finally { await f.close(); }
});
test('usage factory defaults cannot be inferred from a main-entry process', async () => {
  const f = await fixture(); try { f.host.options.usageEntry = 'factory'; assert.throws(() => f.helper.contract(), /Factory-only/); assert.deepEqual(f.counts(), { starts: 0, stops: 0 }); }
  finally { await f.close(); }
});
test('usage drain needs actual graceful exit evidence, not a sleep', async () => {
  const f = await fixture(); try {
    f.host.stopGracefully = async () => ({ code: null, signal: 'SIGKILL', evidence: { reference: 'qa-only-kill', raw: {} } });
    await assert.rejects(f.helper.settleUsage(), /graceful exit/); assert.equal(f.counts().starts, 0);
  } finally { await f.close(); }
});
