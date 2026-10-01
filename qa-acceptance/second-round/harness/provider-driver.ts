import assert from 'node:assert/strict';
import { readdir, lstat, readFile, realpath, unlink } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { C2_CAPABILITIES as P, PreparationBlocked, type Evidence, type HttpFact, type Json, type Ownership, type ProviderDriver } from '../contracts/media-provider.js';
import { ProviderWireStub } from './provider-wire.js';
import { installOwnedPrivateStateFault } from './provider-storage.js';
const proof = (reference: string, raw: unknown): Evidence => ({ reference, raw: JSON.parse(JSON.stringify(raw)) as Json });
export interface ProviderHost { ownership: Ownership; agentUrl: string; sessionDirectory: string }
export interface ProviderLifecycle {
  contractReference: string;
  capabilities?: string[];
  /** Install reviewed offline transport before launch; synthetic key only. */
  open(options: Record<string, Json>, upstreamUrl: string): Promise<ProviderHost>;
  restart(signal: 'SIGTERM' | 'SIGKILL', options?: { usageEnabled?: boolean; factoryUsageSupplied?: boolean }): Promise<Awaited<ReturnType<ProviderDriver['restart']>> & { agentUrl?: string }>;
  /** Compare PID and start identity, not only kill(pid, 0). */
  verifyExited(pid: number): Promise<Evidence>;
  stop?(mode:'SIGTERM'|'SIGKILL'):ReturnType<ProviderDriver['stopProvider']>;
  cleanup(): ReturnType<ProviderDriver['cleanup']>;
  evidence(name: string, value: unknown): Promise<void>;
  logs(): Promise<string[]>;
  operations?: Partial<ProviderDriver>;
}
function checkedOrigin(input: string) {
  const url = new URL(input);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/') throw new PreparationBlocked('Provider endpoint must be the owned loopback HTTP origin');
  return url.origin;
}
export function createProviderHttpDriver(binding: ProviderLifecycle): ProviderDriver {
  let wire: ProviderWireStub | undefined, host: ProviderHost | undefined;
  let lastKilledPid: number | undefined;
  const stateFaults = new Set<{ restore(): Promise<void> }>();
  const active = () => { if (!wire || !host) throw new PreparationBlocked('Provider process not opened'); return { wire, host }; };
  const core: Partial<ProviderDriver> = {
    contractReference: binding.contractReference,
    capabilities: [P.protocol, P.upstream, P.history, P.restart, P.pending, P.storage, ...(binding.capabilities ?? [])], usageContract: null,
    async upstreamFacts(){const snapshot=active().wire.snapshot();const evidence=proof('provider:actual-upstream-lifecycle',snapshot);await binding.evidence('provider-upstream-lifecycle',evidence);return {records:snapshot.records,evidence};},
    async stopProvider(mode){if(!binding.stop)throw new PreparationBlocked('Actual provider stop not connected');const result=await binding.stop(mode);if(mode==='SIGKILL')lastKilledPid=result.beforePid;return result;},
    async open(options) { wire = new ProviderWireStub(); await wire.start(); host = await binding.open(options ?? {}, wire.url); checkedOrigin(host.agentUrl); return host.ownership; },
    evidence: binding.evidence,
    async cleanup() {
      let original: unknown; let result: Awaited<ReturnType<ProviderDriver['cleanup']>> | undefined;
      // Stop the real service first so the final ledger includes every request
      // it actually dispatched, including requests made during graceful close.
      try { result = await binding.cleanup(); } catch (error) { original = error; }
      for (const fault of [...stateFaults]) try { await fault.restore(); } catch (error) { original ??= error; }
      try {
        if (wire) {
          const snapshot = wire.snapshot();
          await binding.evidence('provider-wire-complete-ledger', snapshot);
          const observations = snapshot.records.map(({ call }) => ({
            requestId: call.id,
            offlineAuthMatched: (call.evidence.raw as Record<string, Json>).offlineAuthMatched === true,
          }));
          const mismatches = observations.filter((item) => !item.offlineAuthMatched);
          // Persist the independent boolean outcome before asserting so an
          // earlier business error cannot erase this secondary failure evidence.
          await binding.evidence('provider-offline-auth-validation', {
            actualRequests: observations.length, matchedRequests: observations.length - mismatches.length,
            status: mismatches.length ? 'FAIL' : observations.length ? 'PASS' : 'NO_REQUESTS', observations,
            basis: 'actual upstream HTTP header compared with authorized synthetic value; no value retained',
          });
          assert.equal(mismatches.length, 0, 'Every actual offline service request must use the authorized synthetic authentication value');
        }
      } catch (error) { original ??= error; }
      finally { try { if (wire) await wire.close(); } catch (error) { original ??= error; } wire = undefined; host = undefined; }
      if (original) throw original;
      if (!result) throw new PreparationBlocked('Provider cleanup has no ownership evidence'); return result;
    },
    async enqueue(plan) { active().wire.enqueue(plan); },
    async holdNextUpstream(purpose) { return active().wire.holdNext(purpose); },
    async calls() { return active().wire.calls(); },
    async exchange(path, body): Promise<HttpFact> {
      const { host: h } = active(); const url = `${checkedOrigin(h.agentUrl)}${path}`;
      const startedAt = new Date().toISOString(), startedMono = performance.now();
      const reply = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000), redirect: 'error' });
      const rawBody = await reply.text(); let parsed: unknown; try { parsed = JSON.parse(rawBody); } catch { parsed = null; }
      const fact = { status: reply.status, body: parsed, rawBody, evidence: proof(`provider-http:${path}:${startedAt}`, { url, path, request: body, status: reply.status, rawBody, startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - startedMono }) };
      await binding.evidence('provider-public-exchange', fact); return fact;
    },
    async restart(signal, options) {
      const { host: h } = active(); const result = await binding.restart(signal, options);
      if (signal === 'SIGKILL') lastKilledPid = result.beforePid;
      if (result.agentUrl) { checkedOrigin(result.agentUrl); h.agentUrl = result.agentUrl; } return result;
    },
    async lockState() {
      const { host: h } = active(); const root = await realpath(h.ownership.resourceRoot), dir = await realpath(h.sessionDirectory), rel = relative(root, dir);
      const ownedDirectoryVerified = !!rel && !rel.startsWith('..') && !isAbsolute(rel);
      let data: unknown; try { data = JSON.parse(await readFile(join(dir, 'owner.lock'), 'utf8')); } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false, actualOwnerAlive: false, ownedDirectoryVerified, evidence: proof('provider:lock-absent', { dir }) }; throw error;
      }
      const pid = (data as { pid?: unknown }).pid;
      if (typeof pid !== 'number' || !Number.isSafeInteger(pid)) throw new PreparationBlocked('Unreviewed session owner lock format');
      let actualOwnerAlive = true;
      if (pid === lastKilledPid) { await binding.verifyExited(pid); actualOwnerAlive = false; }
      return { exists: true, actualOwnerAlive, ownedDirectoryVerified, evidence: proof('provider:lock-state', { dir, lock: data, lastKilledPid, actualOwnerAlive, ownedDirectoryVerified }) };
    },
    async reclaimOwnedStaleLock() {
      const state = await core.lockState!();
      if (!state.exists || state.actualOwnerAlive || !state.ownedDirectoryVerified || !lastKilledPid) throw new PreparationBlocked('Refuse unproven stale/foreign/live owner lock');
      const { host: h } = active(); const path = join(h.sessionDirectory, 'owner.lock'); const before = await lstat(path);
      if (!before.isFile() || before.isSymbolicLink() || before.uid !== process.getuid?.()) throw new PreparationBlocked('Unsafe owner lock');
      const original = await readFile(path, 'utf8'); const actual = JSON.parse(original) as { pid?: number };
      if (actual.pid !== lastKilledPid) throw new PreparationBlocked('Lock owner changed');
      const exit = await binding.verifyExited(actual.pid); const same = await lstat(path);
      if (same.ino !== before.ino || await readFile(path, 'utf8') !== original) throw new PreparationBlocked('Lock changed before reclaim');
      await unlink(path); return proof('provider:owned-stale-lock-reclaimed', { before: state, exit, pid: actual.pid, inode: before.ino });
    },
    async installPrivateStateFault(kind) {
      const { host: h } = active();
      const files = (await readdir(h.sessionDirectory)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name));
      if (files.length !== 1) throw new PreparationBlocked('Storage fault requires exactly one actual owned session record');
      const fault = await installOwnedPrivateStateFault(h.ownership.resourceRoot, join(h.sessionDirectory, files[0]!), kind);
      const lease = { restore: async () => { await fault.restore(); stateFaults.delete(lease); } }; stateFaults.add(lease);
      await binding.evidence(`provider-private-state-${kind}-installed`, fault.evidence);
      return { evidence: fault.evidence, restore: lease.restore };
    },
    async sessionFiles() { const { host: h } = active(); const records = (await readdir(h.sessionDirectory)).filter((name) => /^[a-f0-9]{64}\.json$/.test(name)).map((name) => join(h.sessionDirectory, name)); return { root: h.sessionDirectory, records, evidence: proof('provider:session-files', { root: h.sessionDirectory, records }) }; },
    logs: binding.logs,
  };
  const implementation = { ...core, ...binding.operations };
  return new Proxy(implementation, { get(target, property, receiver) {
    if (property === 'then') return undefined;
    if (property in target) return Reflect.get(target, property, receiver);
    return async () => { throw new PreparationBlocked(`Provider operation ${String(property)} lacks reviewed real fixture`); };
  } }) as ProviderDriver;
}
