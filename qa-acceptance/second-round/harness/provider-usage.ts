import { readFile, lstat, readdir, realpath, chmod } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { PreparationBlocked, type Evidence, type Json, type ProviderCall, type ProviderDriver, type UsageContract, type UsageRecord } from '../contracts/media-provider.js';
import { parseUsageJsonl, USAGE_FIELDS } from './backend-oracles.js';
const proof = (reference: string, raw: unknown): Evidence => ({ reference, raw: JSON.parse(JSON.stringify(raw)) as Json });
export interface ProviderUsageHost {
  sessionDirectory: string; resourceRoot: string; options: Record<string, Json>;
  stopGracefully(): Promise<{ code: number | null; signal: string | null; evidence: Evidence }>;
  start(): Promise<Evidence>;
  logs(): Promise<string[]>;
}
export class ProviderUsageFiles {
  private recoveredAfter: number | null = null;
  constructor(readonly host: () => ProviderUsageHost, readonly calls: () => Promise<ProviderCall[]>, readonly contractReference: string) {}
  contract(): UsageContract {
    const h = this.host(), options = h.options;
    if (options.usageEntry === 'factory') throw new PreparationBlocked('Factory-only optional usage entry has no independent delivered process binding');
    return { reference: this.contractReference, rawAllowedFields: [...USAGE_FIELDS], maximumRecords: Number(options.usageMaxRecords ?? 1000), maximumBytes: Number(options.usageMaxBytes ?? 2097152), maximumAgeDays: Number(options.usageMaxAgeDays ?? 30), enabled: options.usageEnabled !== false, entry: 'main', configurationEvidence: proof('provider:actual-usage-launch-config', options) };
  }
  private async ownedRoot(allowAbsent = false) {
    const h = this.host(), root = await realpath(h.resourceRoot), sessions = await realpath(h.sessionDirectory), rel = relative(root, sessions);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new PreparationBlocked('Usage sessions directory is not owned');
    const dir = join(sessions, 'usage');
    try { const st = await lstat(dir); if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid?.()) throw new PreparationBlocked('Unsafe usage directory'); }
    catch (error) { if (!(allowAbsent && (error as NodeJS.ErrnoException).code === 'ENOENT')) throw error; }
    return dir;
  }
  async usage(): ReturnType<ProviderDriver['usage']> {
    const root = await this.ownedRoot(true), path = join(root, 'usage.jsonl'); let bytes: Buffer;
    try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.size > 16777216) throw new PreparationBlocked('Unsafe or out-of-contract usage file'); bytes = await readFile(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; bytes = Buffer.alloc(0); }
    const raw = parseUsageJsonl(bytes);
    const records = raw.map((row): UsageRecord => {
      const tokens = Object.fromEntries(['inputTokens', 'outputTokens', 'totalTokens'].filter((key) => row[key] !== null).map((key) => [key, row[key]]));
      return { serviceCallId: String(row.attemptId), requestId: String(row.requestId), attemptId: String(row.attemptId), runId: row.runId as string | null, stage: String(row.stage), errorCode: row.errorCode as string | null, observedAt: String(row.observedAt), purpose: row.purpose as 'turn' | 'audit', model: String(row.model), elapsedMs: Number(row.elapsedMs), outcome: String(row.outcome), usage: Object.keys(tokens).length ? tokens as Record<string, number> : null, raw: row as Json };
    });
    return { records, actualBytes: bytes.byteLength, evidence: proof('provider:actual-usage-file', { path, bytes: bytes.byteLength, records: raw, callIdNormalization: 'local attemptId; not upstream identity' }) };
  }
  async usageFiles(): ReturnType<ProviderDriver['usageFiles']> {
    const root = await this.ownedRoot(true); let files: string[];
    try { files = (await readdir(root)).map((name) => join(root, name)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; files = []; }
    return { root, files, evidence: proof('provider:usage-files', { root, files }) };
  }
  async settleUsage(): ReturnType<ProviderDriver['settleUsage']> {
    const host = this.host(), stopped = await host.stopGracefully();
    if (stopped.code !== 0 || stopped.signal !== null) throw new PreparationBlocked('Usage drain lacks genuine graceful exit 0');
    const value = await this.usage(), profile = this.contract(), calls = await this.calls();
    const expectedMaximum = profile.enabled ? Math.min(calls.length, profile.maximumRecords) : 0;
    const diagnostics = (await host.logs()).filter((line) => /USAGE_(QUEUE_FULL|RECORD_INVALID)/.test(line));
    const dropped = Math.max(0, expectedMaximum - value.records.length);
    const evidence = proof('provider:graceful-usage-drain', { stopped, actualFile: value, actualInferenceCalls: calls.length, retainedCountUpperBound: expectedMaximum, droppedLowerBound: dropped, diagnostics, pendingAfterActualExit: 0 });
    await host.start();
    if (diagnostics.length || dropped > 0) throw new PreparationBlocked('Low-load usage completeness is not established; exact raw missing/overflow facts retained');
    return { dropped: 0, queued: 0, activeBatch: 0, evidence };
  }
  async usageWriteFault(): ReturnType<ProviderDriver['usageWriteFault']> {
    const dir = await this.ownedRoot(), before = await lstat(dir); let restored = false;
    await chmod(dir, 0o500);
    return { restore: async () => { if (!restored) { restored = true; await chmod(dir, before.mode & 0o777); this.recoveredAfter = Date.now(); } }, observed: async () => {
      const deadline = performance.now() + 5000;
      do { const lines = await this.host().logs(); if (lines.some((line) => /USAGE_WRITE_FAILED|USAGE_STORE_UNAVAILABLE/.test(line))) return proof('provider:actual-usage-write-fault', { dir, installedMode: '0500', originalMode: before.mode & 0o777, lines }); await new Promise((resolve) => setTimeout(resolve, 30)); } while (performance.now() < deadline);
      throw new PreparationBlocked('Owned directory fault did not cause an observed actual usage write failure');
    } };
  }
  async diagnostics(): ReturnType<ProviderDriver['diagnostics']> {
    const lines = await this.host().logs(), usage = await this.usage();
    const failureObserved = lines.some((line) => /USAGE_WRITE_FAILED|USAGE_STORE_UNAVAILABLE|USAGE_QUEUE_FULL/.test(line));
    const recovered = this.recoveredAfter !== null && usage.records.some((r) => Date.parse(r.observedAt) >= this.recoveredAfter!);
    const raw = { lines, recoveredAfter: this.recoveredAfter, recoveredObservedByActualRecord: recovered } as Json;
    return { failureObserved, recovered, raw, evidence: proof('provider:usage-diagnostics', raw) };
  }
}
