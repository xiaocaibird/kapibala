import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { SecondRoundEnvironment } from './environment.js';
import { actualListenerIdentity } from './environment.js';
import { PreparationBlocked, type Barrier, type Evidence, type Json, type MediaDriver, type MessageRef } from '../contracts/media-provider.js';
const proof = (reference: string, raw: unknown): Evidence => ({ reference, raw: JSON.parse(JSON.stringify(raw)) as Json });
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Versioned engineering fixture: only an owned downloaded file's documented
 * age field is changed. Business state/outcomes and run references are not set. */
export class MediaDatabaseFixtures {
  private leases = new Set<{ release(): Promise<void> }>();
  constructor(readonly environment: () => SecondRoundEnvironment, readonly contractReference: string) {}
  private async client() {
    const owned = this.environment().ownedStorage();
    if (!owned.cluster.ownsDatabase(owned.database)) throw new PreparationBlocked('Media fixture database not owned');
    const client = new Client({ connectionString: owned.cluster.url(owned.database), application_name: 'qa-media-fixture', connectionTimeoutMillis: 2000, query_timeout: 5000 });
    await client.connect(); return client;
  }
  private async query(sql: string, values?: unknown[]) { const c = await this.client(); try { return await c.query(sql, values); } finally { await c.end(); } }
  async snapshot(ref?: MessageRef) {
    const query = await this.query(`SELECT f.*, EXISTS(SELECT 1 FROM agent_media_references p JOIN agent_runs r ON r.id=p.run_id WHERE p.media_id=f.id AND r.status='running') AS active_reference, EXTRACT(epoch FROM (clock_timestamp()-f.downloaded_at))/86400 AS age_days FROM media_files f ${ref ? 'WHERE group_id=$1 AND msg_id=$2' : ''} ORDER BY f.id`, ref ? [ref.groupId, ref.msgId] : undefined);
    return query.rows as Record<string, unknown>[];
  }
  async age(ref: MessageRef, days: number): ReturnType<MediaDriver['age']> {
    if (!Number.isFinite(days) || days < 0 || days > 36600) throw new Error('Invalid finite fixture age');
    const before = await this.snapshot(ref);
    if (before.length !== 1 || before[0]!.state !== 'ready' || typeof before[0]!.local_file_path !== 'string') throw new PreparationBlocked('Age fixture requires actually published file');
    const actual = await realpath(before[0]!.local_file_path as string), root = await realpath(this.environment().mediaDirectory);
    if (!actual.startsWith(`${root}/`) || !(await lstat(actual)).isFile()) throw new PreparationBlocked('Age target file is not owned/present');
    const began = performance.now();
    const changed = await this.query("UPDATE media_files SET downloaded_at=clock_timestamp()-$3::double precision*interval '1 day' WHERE group_id=$1 AND msg_id=$2 AND state='ready' AND local_file_path=$4 RETURNING id,state,downloaded_at,local_file_path,EXTRACT(epoch FROM (clock_timestamp()-downloaded_at))/86400 AS age_days", [ref.groupId, ref.msgId, days, actual]);
    if (changed.rowCount !== 1) throw new PreparationBlocked('Age target changed during fixture installation');
    const after = await this.snapshot(ref); const elapsed = performance.now() - began;
    const upper = Math.max(Number(after[0]?.age_days ?? days), days + elapsed / 86400000);
    const evidence = proof(`media:age:${ref.msgId}`, { contractReference: this.contractReference, ref, requestedDays: days, before, changed: changed.rows, after, completedFile: actual, localObservedMs: elapsed, writes: ['media_files.downloaded_at'] });
    await this.environment().evidence('media-age-fixture', evidence);
    return { actualAgeDays: [days, upper], basis: 'completed-file', evidence };
  }
  async cycle(kind: 'download' | 'cleanup'): Promise<Evidence> {
    const env = this.environment();
    const diagnostics = async () => {
      const response = await env.api.get<{ modules: Record<string, unknown>[] }>('/api/diagnostics/background');
      if (response.status !== 200 || !Array.isArray(response.body.modules)) throw new PreparationBlocked('Public media cycle diagnostic unavailable');
      const module = response.body.modules.find((m) => m.name === 'gateway');
      if (!module) throw new PreparationBlocked('Final public gateway cycle mapping not present');
      return module;
    };
    const before = await diagnostics(), beforeRows = await this.snapshot(); const deadline = performance.now() + 15000;
    let last: unknown;
    do {
      const after = await diagnostics(), rows = await this.snapshot();
      last = { after, rows };
      const progressed = Number(after.ticks) > Number(before.ticks) && typeof after.lastSucceededAt === 'string' && after.lastSucceededAt !== before.lastSucceededAt;
      const eligible = rows.some((r) => kind === 'download' ? ['pending', 'downloading'].includes(String(r.state)) && Date.parse(String(r.next_attempt_at)) <= Date.now() :
        !r.active_reference && ((r.state === 'deleting' && Date.parse(String(r.next_attempt_at)) <= Date.now()) || (r.state === 'ready' && Number(r.age_days) > Number(env.mediaOptions.retentionDays ?? 30))));
      if (progressed && !eligible) { const evidence = proof(`media:actual-${kind}-cycle`, { before, beforeRows, after, rows, mapping: 'C1 media work runs in gateway tick; settled rows and independent file/source assertions remain necessary' }); await env.evidence(`media-${kind}-cycle`, evidence); return evidence; }
      await sleep(50);
    } while (performance.now() < deadline);
    await env.evidence('media-cycle-not-established', { kind, before, beforeRows, last });
    throw new PreparationBlocked('Media background cycle did not reach observed settled state within diagnostic budget');
  }
  async hold(phase: Parameters<MediaDriver['hold']>[0], ref: MessageRef): Promise<Barrier> {
    if (phase === 'partial-written') {
      const source = this.environment().mediaSource; if (!source) throw new PreparationBlocked('Missing owned media source');
      const gate = source.holdPartial(ref.msgId);
      const lease = { release: async () => { await gate.release(); this.leases.delete(lease); } }; this.leases.add(lease);
      return { id: gate.id, release: lease.release, reached: async () => {
        const upstream = await gate.reached(), deadline = performance.now() + 8000;
        do {
          const rows = await this.snapshot(ref), row = rows[0];
          if (row?.state === 'downloading' && typeof row.partial_name === 'string' && row.local_file_path === null) {
            const path = join(this.environment().mediaDirectory, row.partial_name);
            try { const stat = await lstat(path); if (stat.isFile() && stat.size > 0) { const evidence = proof(`media:partial-file:${gate.id}`, { upstream, row, path, bytes: stat.size }); await this.environment().evidence('media-partial-file-reached', evidence); return evidence; } }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
          }
          await sleep(20);
        } while (performance.now() < deadline);
        throw new PreparationBlocked('HTTP partial response did not establish actual partial-written file');
      } };
    }
    if (phase !== 'complete-before-path-commit' && phase !== 'unlinked-before-completion') throw new PreparationBlocked(`Real ${phase} media fixture not connected`);
    const client = await this.client(), id = `qa_media_${randomUUID().replaceAll('-', '')}`, marker = `${id}_${phase}`, lock = Math.floor(Math.random() * 0x7fffffff);
    const desired = phase === 'complete-before-path-commit' ? 'ready' : 'deleted';
    await client.query('SELECT pg_advisory_lock($1)', [lock]);
    await client.query(`CREATE FUNCTION ${id}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.group_id=${literal(ref.groupId)} AND NEW.msg_id=${literal(ref.msgId)} AND NEW.state=${literal(desired)} THEN PERFORM set_config('application_name',${literal(marker)},true); PERFORM pg_advisory_xact_lock(${lock}); END IF; RETURN NEW; END $$`);
    await client.query(`CREATE TRIGGER ${id} BEFORE UPDATE ON media_files FOR EACH ROW EXECUTE FUNCTION ${id}()`);
    let released = false; let timer: NodeJS.Timeout;
    const release = async () => {
      if (released) return; released = true; clearTimeout(timer);
      try { await client.query('SELECT pg_advisory_unlock($1)', [lock]); await client.query(`DROP TRIGGER IF EXISTS ${id} ON media_files`); await client.query(`DROP FUNCTION IF EXISTS ${id}()`); }
      finally { await client.end(); this.leases.delete(lease); }
    };
    const lease = { release }; this.leases.add(lease);
    timer = setTimeout(() => { void release().catch((error: unknown) => envEvidence(this.environment(), 'media-barrier-expiry-error', String(error))); }, 30000);
    return { id, release, reached: async () => {
      const deadline = performance.now() + 20000;
      do {
        const blocked = await this.query("SELECT pid,application_name,state,wait_event_type,wait_event,query FROM pg_stat_activity WHERE datname=current_database() AND application_name=$1 AND wait_event_type='Lock' AND wait_event='advisory'", [marker]);
        const rows = await this.snapshot(ref);
        if (blocked.rowCount && rows.length === 1) {
          const row = rows[0]!, path = join(this.environment().mediaDirectory, `${row.id}.bin`); let exists = true, size: number | null = null;
          try { size = (await lstat(path)).size; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false; else throw error; }
          if (phase === 'complete-before-path-commit' ? exists && row.local_file_path === null && row.state === 'downloading' : !exists && row.state === 'deleting' && row.local_file_path === null) {
            const evidence = proof(`media:real-barrier:${id}`, { contractReference: this.contractReference, id, phase, ref, pg: blocked.rows, row, file: { path, exists, size } }); await this.environment().evidence('media-barrier-reached', evidence); return evidence;
          }
        }
        await sleep(30);
      } while (performance.now() < deadline && !released);
      throw new PreparationBlocked('Actual media transaction/file crash window not observed');
    } };
  }
  async startReference(ref: MessageRef, via: 'trigger' | 'get_recent_messages' | 'pending-download' | 'legacy-running-group'): ReturnType<MediaDriver['startReference']> {
    const env = this.environment(), group = await env.api.group(ref.groupId), name = `media-reference-${ref.groupId}`;
    if (via === 'legacy-running-group') throw new PreparationBlocked('Versioned pre-C1 running fixture not loaded');
    if (via === 'get_recent_messages') {
      env.agent.enqueueTurns({ body: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `qa-media-read-${randomUUID()}`, name: 'get_recent_messages', input: { limit: 50 } }] } },
        { body: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'reference finished' }] }, barrier: { phase: 'request', name } });
      await env.api.require(env.api.patch(`/api/groups/${ref.groupId}`, { agentEnabled: true }));
      env.gateway.emitMessage({ groupId: group.gatewayGroupId, msgId: `qa-reference-trigger-${randomUUID()}`, senderPlatformUserId: 'qa-external-media', text: 'read recent media' });
    } else if (!group.agentEnabled) throw new PreparationBlocked('Original media trigger was not prepared before event delivery');
    const hit = await env.agent.barriers.waitFor(name, 10000), request = (hit.context as { body?: { runId?: string } }).body;
    if (!request?.runId) throw new PreparationBlocked('Actual Agent request did not identify run');
    const run = await env.api.agentRun(request.runId), rows = await this.snapshot(ref);
    const evidence = proof(`media:actual-reference:${request.runId}`, { via, hit, run, rows });
    await env.evidence('media-reference-start', evidence); return { runId: request.runId, evidence };
  }
  async run(runId: string): ReturnType<MediaDriver['run']> { const run = await this.environment().api.agentRun(runId); return { id: run.id, status: run.status, steps: run.steps.map((step) => ({ name: step.name })), evidence: proof(`media:public-run:${runId}`, run) }; }
  async agentRequests(): ReturnType<MediaDriver['agentRequests']> { const snapshot = this.environment().agent.snapshot(); return { requests: snapshot.turns.map((r) => r.body as Json), evidence: proof('media:actual-agent-wire', snapshot) }; }
  async finishReference(runId: string): ReturnType<MediaDriver['finishReference']> {
    const env = this.environment(), before = await env.api.agentRun(runId);
    env.agent.barriers.release(`media-reference-${before.groupId}`);
    const deadline = performance.now() + 10000;
    do { const after = await env.api.agentRun(runId); if (after.status !== 'running') return proof(`media:reference-finished:${runId}`, { before, after }); await sleep(30); } while (performance.now() < deadline);
    throw new PreparationBlocked('Actual referenced Agent run did not finish within diagnostic budget');
  }
  async cleanup() { await Promise.all([...this.leases].map((lease) => lease.release())); }
  async secondInstance(directory: 'same-physical' | 'new-owned-directory'): ReturnType<MediaDriver['secondInstance']> {
    if (directory !== 'same-physical') throw new PreparationBlocked('Independent changed-directory startup fixture not bound');
    const env = this.environment(), api = await env.startSecondInstance(); const identities = await actualListenerIdentity(api.baseUrl), path = await realpath(env.mediaDirectory);
    return { started: true, pid: identities[0]!.pid, actualMediaRealPath: path, evidence: proof('media:second-instance', { identities, publicHealth: await api.get('/api/health'), sharedConfiguredPhysicalPath: path }) };
  }
}
async function envEvidence(env: SecondRoundEnvironment, name: string, value: unknown) { await env.evidence(name, value); }
