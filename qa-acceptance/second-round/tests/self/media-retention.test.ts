import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { mediaRetention } from '../media-provider.js';
import { C1_CAPABILITIES as M, PreparationBlocked, type MediaDriver, type MessageRef } from '../../contracts/media-provider.js';

const evidence = (raw: unknown = {}) => ({ reference: 'self-only://retention-driver-double', raw });
type Scenario = 'ordinary' | 'already-deleting' | 'already-deleted' | 'still-downloading' | 'cleanup-not-deleted' | 'file-left';
async function retentionDouble(scenario: Scenario, body: (driver: MediaDriver, events: string[]) => Promise<void>) {
  const base = resolve(fileURLToPath(new URL('../..', import.meta.url)), '.runtime'); await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, 'retention-tool-self-'));
  type Item = { ref: MessageRef; id: string; text: string; bytes: Uint8Array; url: string; state: string; age: number; downloaded: string | null; path: string | null };
  let limit = 30, variant = 0, dir = ''; const items = new Map<string, Item>(), sources = new Map<string, { bytes: Uint8Array; url: string }>(), events: string[] = [];
  const file = (row: Item) => join(dir, `media-${row.id}.bin`);
  const publicRow = (row: Item) => ({ ...row.ref, text: row.text, localFilePath: row.path, raw: {} });
  const snapshots = () => [...items.values()].map(row => ({ id: row.id, group_id: row.ref.groupId, msg_id: row.ref.msgId, state: row.state, downloaded_at: row.downloaded, storage_root: dir, local_file_path: row.path }));
  const publish = async (row: Item) => { await writeFile(file(row), row.bytes, { mode: 0o600 }); row.path = file(row); row.state = 'ready'; row.downloaded = new Date().toISOString(); };
  const remove = async (row: Item, leaveFile = false) => { if (!leaveFile) await rm(file(row)); row.path = null; row.state = 'deleted'; };
  const driver = {
    contractReference: 'self-only', capabilities: [M.basic, M.age, M.cleanup], retentionContract: { reference: 'self-only', zeroDaysSupported: true },
    async open(options?: { retentionDays?: number }) {
      limit = options?.retentionDays ?? 30; items.clear(); sources.clear(); dir = join(root, `v${++variant}`); await mkdir(dir, { mode: 0o700 });
      return { sessionId: 'self', sutRevision: 'a'.repeat(40), contractReference: 'self-only', reviewedSourceContracts: ['c1-media-files'], resourceRoot: root, applicationPids: [process.pid], endpoints: [], evidence: evidence() };
    },
    async cleanup() { return { failures: [], evidence: evidence() }; }, async evidence() {},
    async mediaDirectory() { return { path: dir, effectiveRetentionDays: limit, evidence: evidence() }; },
    async createGroup() { return randomUUID(); },
    async source(input: { id: string; bytes: Uint8Array }) { const source = { bytes: input.bytes, url: `self-only://media/${input.id}` }; sources.set(input.id, source); return { url: source.url, evidence: evidence() }; },
    async emit(input: MessageRef & { text: string }) { const source = sources.get(input.msgId)!; items.set(input.msgId, { ref: input, id: randomUUID(), text: input.text, ...source, state: 'pending', age: 0, downloaded: null, path: null }); return evidence(); },
    async read(ref: MessageRef) { return publicRow(items.get(ref.msgId)!); },
    async awaitMessage(ref: MessageRef) { const row = items.get(ref.msgId)!; await publish(row); return publicRow(row); },
    async age(ref: MessageRef, days: number) { items.get(ref.msgId)!.age = days; return { actualAgeDays: [days, days], basis: 'completed-file', evidence: evidence() }; },
    async sourceRequests() { return [...items.values()].map(row => ({ url: row.url, responseStatus: 200, responseBytes: row.bytes.length, evidence: evidence() })); },
    async cycle(kind: 'download' | 'cleanup') {
      if (limit === 0) events.push(kind);
      if (kind === 'download') {
        for (const row of items.values()) {
          if (scenario === 'still-downloading') { row.state = 'downloading'; continue; }
          await publish(row); if (scenario === 'already-deleted') await remove(row);
          if (scenario === 'already-deleting') { row.path = null; row.state = 'deleting'; }
        }
      } else {
        if (limit === 0) assert.equal(events.at(-2), 'download', 'never infer download from initial null');
        for (const row of items.values()) {
          if (limit === 0 && scenario === 'cleanup-not-deleted') { row.path = null; row.state = 'downloading'; }
          else if ((row.state === 'ready' || row.state === 'deleting') && (limit === 0 || row.age > limit)) await remove(row, limit === 0 && scenario === 'file-left');
        }
      }
      return evidence({ rows: snapshots() });
    },
  } as unknown as MediaDriver;
  try { await body(driver, events); } finally { await rm(root, { recursive: true, force: true }); }
}

test('retention waits for actual completed download then deleted state and physical removal, retaining default/2/0 cases', async () => {
  await retentionDouble('ordinary', async (driver, events) => { await mediaRetention(driver); assert.deepEqual(events, ['download', 'cleanup']); });
});
test('zero-day file may already be deleted before API observes a published path', async () => {
  for (const scenario of ['already-deleting', 'already-deleted'] as const) await retentionDouble(scenario, async driver => { await mediaRetention(driver); });
});
test('scheduler progress with downloading/null cannot establish zero-day download or cleanup', async () => {
  await retentionDouble('still-downloading', async (driver, events) => { await assert.rejects(mediaRetention(driver), PreparationBlocked); assert.deepEqual(events, ['download']); });
  await retentionDouble('cleanup-not-deleted', async driver => { await assert.rejects(mediaRetention(driver), PreparationBlocked); });
});
test('claimed deleted state and null public path do not hide a remaining physical file', async () => {
  await retentionDouble('file-left', async driver => { await assert.rejects(mediaRetention(driver), assert.AssertionError); });
});
