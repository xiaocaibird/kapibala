import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { decodeProviderWire } from '../harness/provider-wire.js';
import { mediaUrlRejectionMatrix } from '../harness/media-source-url-cases.js';
import {
  C1_CAPABILITIES as M, C2_CAPABILITIES as P, PreparationBlocked,
  type DriverBase, type Ownership, type MediaDriver, type MediaMessage, type MessageRef,
  type ProviderDriver, type HttpFact, type TurnRequest, type ToolDeclaration,
  type Message, type Json, type ProviderFault, type Evidence,
} from '../contracts/media-provider.js';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const bytes = () => Uint8Array.from({ length: 8193 }, (_, i) => (i * 43 + 19) % 256);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function need(value: unknown, message: string): asserts value {
  if (!value) throw new PreparationBlocked(message);
}
function proof(e: Evidence): void {
  need(e && typeof e.reference === 'string' && e.reference.length > 0 && e.raw !== undefined,
    '真实动作缺原始证据引用；准备描述不能充当命中');
}
/** Does not load a default target, inspect local keys, or construct an adapter. */
export async function withOwnedDriver<D extends DriverBase>(
  driver: D | undefined, capabilities: readonly string[], name: string,
  body: (d: D, owner: Ownership) => Promise<void>, options?: Record<string, Json>,
): Promise<void> {
  need(driver, `${name}: 独立工程driver尚未接入`);
  need(driver.contractReference && capabilities.every((c) => driver.capabilities.includes(c)),
    `${name}: 最终公开契约/必需真实观测能力尚未接齐`);
  let primary: unknown;
  try {
    const owner = await driver.open(options);
    need(/^[a-f0-9]{40}$/.test(owner.sutRevision) && owner.sessionId && owner.contractReference &&
      isAbsolute(owner.resourceRoot) && owner.applicationPids.length > 0 &&
      owner.applicationPids.every((pid) => Number.isSafeInteger(pid) && pid > 0),
    '未核对冻结版本及本例实际进程/目录归属');
    proof(owner.evidence);
    need(owner.reviewedSourceContracts.includes(name.startsWith('media-') ? 'c1-media-files' : 'c2-gemini-agent'),
      '缺最终候选与冻结公开C1/C2约定的逐项适配复核，不沿用未确认私有模式或错误码');
    await driver.evidence(`${name}-ownership`, owner);
    await body(driver, owner);
  } catch (error) { primary = error; throw error; }
  finally {
    try {
      const cleaned = await driver.cleanup();
      proof(cleaned.evidence);
      await driver.evidence(`${name}-cleanup`, cleaned);
      if (cleaned.failures.length) throw new PreparationBlocked('本例资源清理未全部证实');
    } catch (cleanup) {
      try { await driver.evidence(`${name}-secondary-cleanup-error`, { name: cleanup instanceof Error ? cleanup.name : 'unknown', primaryPresent: primary !== undefined }); }
      catch { process.stderr.write('QA secondary cleanup evidence unavailable\n'); }
      if (!primary) throw cleanup;
    }
  }
}
export async function assertOwnedBytes(path: string | null | undefined, mediaRoot: string, expected: Uint8Array) {
  assert.ok(path && isAbsolute(path), '消息应投影本地绝对文件路径');
  const root = await realpath(mediaRoot), actual = await realpath(path!);
  const rel = relative(root, actual);
  assert.ok(rel && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), '文件必须位于本例MEDIA_DIR内部');
  const meta = await lstat(path!);
  assert.ok(meta.isFile() && !meta.isSymbolicLink(), '路径不能指向符号链接/目录');
  assert.equal(meta.mode & 0o777, 0o600, '公开私有文件约定');
  const content = await readFile(actual);
  assert.equal(content.length, expected.length, '不发布截断或半文件');
  assert.equal(digest(content), digest(expected), '真实磁盘字节必须与独立HTTP源一致');
  return { path: actual, bytes: content.length, sha256: digest(content) };
}
async function absent(path: string): Promise<void> {
  try { await lstat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  assert.fail('应清理的真实文件仍存在');
}
async function attachment(d: MediaDriver, options: { fault?: Parameters<MediaDriver['source']>[0]['fault']; groupId?: string; isOwn?: boolean } = {}) {
  const content = bytes(), groupId = options.groupId ?? await d.createGroup();
  const ref = { groupId, msgId: `qa-media-${randomUUID()}` };
  const source = await d.source({ id: ref.msgId, bytes: content, fault: options.fault });
  proof(source.evidence);
  proof(await d.emit({ ...ref, text: `text:${ref.msgId}`, mediaUrl: source.url, isOwn: options.isOwn }));
  return { ref, source, content };
}
async function published(d: MediaDriver, ref: MessageRef, content: Uint8Array) {
  const row = await d.awaitMessage(ref, 'path-published', 30_000);
  assert.equal(row.msgId, ref.msgId); assert.equal(row.groupId, ref.groupId);
  const dir = await d.mediaDirectory(); proof(dir.evidence);
  const file = await assertOwnedBytes(row.localFilePath, dir.path, content);
  await d.evidence('media-real-file', { ref, row, file, dir });
  return row;
}
function cleared(row: MediaMessage): void { assert.equal(row.localFilePath, null, '已删除/不可用附件不能留下旧路径'); }
async function age(d: MediaDriver, ref: MessageRef, days: number) {
  const value = await d.age(ref, days); proof(value.evidence);
  need(value.basis === 'completed-file' && value.actualAgeDays[0] <= days && value.actualAgeDays[1] >= days,
    '保留期夹具未绑定完整文件时间及实测年龄区间');
  await d.evidence('media-age-fixture', { ref, requestedDays: days, ...value });
  return value.actualAgeDays;
}
export function assertAgeSide(bounds: [number, number], threshold: number, side: 'younger' | 'expired') {
  need(bounds.every(Number.isFinite) && bounds[0] >= 0 && bounds[0] <= bounds[1], '年龄区间无效');
  need(side === 'younger' ? bounds[1] < threshold : bounds[0] > threshold, '年龄区间跨越保留阈值，不能判删除/保留');
}
async function expire(d: MediaDriver, ref: MessageRef, days = 31) {
  assertAgeSide(await age(d, ref, days), (await d.mediaDirectory()).effectiveRetentionDays, 'expired');
}
async function cleanupPreserving(d: DriverBase, action: () => Promise<void>, body: () => Promise<void>) {
  let primary: unknown;
  try { await body(); } catch (e) { primary = e; throw e; }
  finally {
    try { await action(); } catch (secondary) {
      try { await d.evidence('secondary-fixture-cleanup', { primary: primary instanceof Error ? primary.message : null, error: String(secondary) }); }
      catch { process.stderr.write('QA secondary fixture evidence unavailable\n'); }
      if (!primary) throw secondary;
    }
  }
}
export function observeOperation<T>(pending: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return pending.then((value) => ({ ok: true, value }), (error: unknown) => ({ ok: false, error }));
}

export async function mediaDownload(driver?: MediaDriver) {
  await withOwnedDriver(driver, [M.basic], 'media-download', async (d) => {
    const a = await attachment(d); const row = await published(d, a.ref, a.content);
    assert.equal(row.text, `text:${a.ref.msgId}`);
    const dir = await d.mediaDirectory(); assert.equal((await lstat(dir.path)).mode & 0o777, 0o700);
    const plain = { groupId: a.ref.groupId, msgId: `plain-${randomUUID()}` };
    proof(await d.emit({ ...plain, text: 'plain unchanged' }));
    const text = await d.read(plain); assert.equal(text.text, 'plain unchanged');
    assert.ok(text.localFilePath === null || text.localFilePath === undefined);
  });
}
export async function mediaDuplicateReplay(driver?: MediaDriver) {
  await withOwnedDriver(driver, [M.basic, M.multi], 'media-duplicate', async (d) => {
    const a = await attachment(d); const original = await published(d, a.ref, a.content);
    const before = (await d.sourceRequests()).filter((r) => r.url === a.source.url).length;
    const second = await d.secondInstance('same-physical'); proof(second.evidence); assert.equal(second.started, true);
    for (let i = 0; i < 3; i++) proof(await d.emit({ ...a.ref, text: `text:${a.ref.msgId}`, mediaUrl: a.source.url }));
    const changed = await d.source({ id: 'changed-source', bytes: Uint8Array.of(99) });
    proof(await d.emit({ ...a.ref, text: 'duplicate changed source', mediaUrl: changed.url }));
    const marker = { groupId: a.ref.groupId, msgId: `duplicate-ingress-marker-${randomUUID()}` };
    proof(await d.emit({ ...marker, text: 'ordered ingress marker' })); await d.read(marker);
    proof(await d.cycle('download'));
    const after = await published(d, a.ref, a.content);
    assert.equal(after.localFilePath, original.localFilePath);
    const requests = await d.sourceRequests();
    assert.equal(requests.filter((r) => r.url === a.source.url).length, before, '已完成附件重放不重新下载');
    assert.equal(requests.filter((r) => r.url === changed.url).length, 0, '重放不能覆盖首次来源');
    const page = await d.timeline(a.ref.groupId);
    assert.equal(page.messages.filter((row) => row.msgId === a.ref.msgId).length, 1);
  });
}
export async function mediaSourceFailures(driver?: MediaDriver) {
  await withOwnedDriver(driver, [M.basic, M.sourceFaults, M.egress], 'media-source-errors', async (d) => {
    for (const fault of ['404', 'redirect-foreign', 'declared-oversize', 'stream-oversize'] as const) {
      const a = await attachment(d, { fault }); await d.read(a.ref); proof(await d.cycle('download'));
      const actualRequests=(await d.sourceRequests()).filter(r=>r.url===a.source.url);
      need(actualRequests.length>0, '来源故障必须由本文件真实HTTP请求触发');
      assert.equal(actualRequests[0]!.responseStatus, fault==='404'?404:fault==='redirect-foreign'?302:200);
      if(fault==='stream-oversize')need(Number(actualRequests[0]!.responseBytes)>20*1024*1024,'真实流超限字节尚未写出');
      await d.evidence('source-fault-'+fault,actualRequests);
      const row = await d.awaitMessage(a.ref, 'path-null', 30_000); cleared(row);
      assert.equal(row.text, `text:${a.ref.msgId}`);
    }
    const groupId = await d.createGroup(), baseline = await d.egress(); proof(baseline.evidence);
    const validSource = await d.source({ id: 'denied-url-controls', bytes: bytes() });
    const urlResults:{id:string;status:'PASS'|'FAIL'|'BLOCKED';error?:unknown}[]=[];
    for (const variant of mediaUrlRejectionMatrix(validSource.url)) {
      const ref = { groupId, msgId: randomUUID() }, text=`unsafe source remains text:${variant.id}`;
      const facts:Record<string,unknown>={variant,ref,expectedText:text,startedAt:new Date().toISOString()};
      try {
        const before=await d.egress();proof(before.evidence);facts.egressBefore=before;
        const event=await d.emit({...ref,text,mediaUrl:variant.url});proof(event);facts.actualGatewayEvent=event;
        const ingested=await d.read(ref);facts.actualIngestedMessage=ingested;
        assert.equal(ingested.msgId,ref.msgId);assert.equal(ingested.text,text);
        const cycle=await d.cycle('download');proof(cycle);facts.actualCompletedCycle=cycle;
        const after=await d.egress();proof(after.evidence);facts.egressAfter=after;
        facts.newAttempts=after.attempts.filter(row=>!before.attempts.some(prior=>prior.id===row.id));
        const row=await d.read(ref);facts.messageAfter=row;
        cleared(row);assert.equal(row.msgId,ref.msgId);assert.equal(row.text,text);
        assert.deepEqual(after.attempts,before.attempts,'This exact invalid URL must not dispatch an actual HTTP request');
        urlResults.push({id:variant.id,status:'PASS'});
      } catch(error) {
        const status=error instanceof assert.AssertionError?'FAIL':'BLOCKED';urlResults.push({id:variant.id,status,error});facts.status=status;facts.error=String(error);
        // Preserve useful raw outcomes even if ingestion/cycle premises failed.
        try{facts.egressAtFailure=await d.egress();}catch(secondary){facts.egressFailure=String(secondary);}
      } finally {
        facts.completedAt=new Date().toISOString();await d.evidence(`media-url-${variant.id}`,facts);
      }
    }
    await d.evidence('media-url-subscenario-results',urlResults.map(({id,status,error})=>({id,status,...(error?{error:String(error)}:{})})));
    const failed=urlResults.find(row=>row.status==='FAIL');if(failed)throw failed.error;
    const blocked=urlResults.filter(row=>row.status==='BLOCKED');if(blocked.length)throw new PreparationBlocked(`Actual URL rejection premises incomplete: ${blocked.map(row=>row.id).join(', ')}`);
    const after = await d.egress(); proof(after.evidence);
    assert.deepEqual(after.attempts, baseline.attempts, '独立出口不得收到非法来源请求');
    assert.ok(!after.attempts.some((r) => new URL(r.url).hostname === 'qa-foreign.invalid'), '重定向也不得发往外部目标');
  }, { egress: true });
}
export async function mediaRetryRecovery(driver?: MediaDriver) {
  await withOwnedDriver(driver, [M.basic, M.sourceFaults, M.barriers, M.restart], 'media-retry', async (d) => {
    for (const fault of ['503-once', '408-once', '429-once', 'disconnect-once'] as const) {
      const ref = { groupId: await d.createGroup(), msgId: randomUUID() }, content = bytes();
      const source = await d.source({ id: ref.msgId, bytes: content, fault });
      const gate = await d.hold('failed-before-retry', ref);
      await cleanupPreserving(d, () => gate.release(), async () => {
      proof(await d.emit({ ...ref, text: 'retry preserves text', mediaUrl: source.url }));
      proof(await gate.reached()); cleared(await d.read(ref));
      const restart = await d.restart('SIGTERM'); proof(restart.evidence);
      assert.notEqual(restart.beforePid, restart.afterPid);
      assert.ok(restart.directoryPreserved && restart.databasePreserved);
      await d.setSourceFault(source.url, 'none'); await gate.release();
      await published(d, ref, content);
      assert.ok((await d.sourceRequests()).filter((r) => r.url === source.url).length >= 2);
      });
    }
  });
}
export async function mediaRetention(driver?: MediaDriver) {
  // A scheduler tick alone does not establish this file's download/deletion.
  // Read the owned fixture's actual persisted observation, never infer terminal
  // state from an initially null public path (zero-day paths may be transient).
  const observed = (cycle: Evidence, ref: MessageRef, states: string[]) => {
    proof(cycle);
    need(object(cycle.raw) && Array.isArray(cycle.raw.rows), '媒体周期缺目标持久状态证据');
    const rows = cycle.raw.rows.filter((row) => object(row) && row.group_id === ref.groupId && row.msg_id === ref.msgId);
    need(rows.length === 1 && object(rows[0]), '媒体周期未唯一定位本例目标');
    const row = rows[0];
    need(states.includes(String(row.state)) && typeof row.downloaded_at === 'string' && Number.isFinite(Date.parse(row.downloaded_at)),
      '目标完整下载或删除终态尚未真实建立，不能用调度tick/初始null路径代替');
    return row;
  };
  for (const retentionDays of [undefined, 2, 0]) {
    if (retentionDays === 0) need(driver?.retentionContract?.reference && driver.retentionContract.zeroDaysSupported,
      '零天边界缺最终公开接受范围；已完成default30/合法2天结果须分别留证，不猜零天合法');
    await withOwnedDriver(driver, [M.basic, M.age, M.cleanup], `media-retention-${retentionDays ?? 'default'}`, async (d) => {
      const configured = await d.mediaDirectory(); assert.equal(configured.effectiveRetentionDays, retentionDays ?? 30);
      const a = await attachment(d);
      const limit = retentionDays ?? 30;
      if (limit === 0) {
        await d.read(a.ref);
        const download = await d.cycle('download'), completed = observed(download, a.ref, ['ready', 'deleting', 'deleted']);
        need(typeof completed.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(completed.id),
          '目标真实文件身份缺失');
        assert.equal(completed.storage_root, configured.path);
        // docs/qa-media-scenarios-20261002.md declares this stable filename.
        const actualFile = `${configured.path}${sep}media-${completed.id}.bin`;
        const requests = (await d.sourceRequests()).filter((r) => r.url === a.source.url);
        assert.equal(requests.length, 1); assert.equal(requests[0]!.responseStatus, 200); assert.equal(requests[0]!.responseBytes, a.content.length);
        const cleanup = await d.cycle('cleanup'), deleted = observed(cleanup, a.ref, ['deleted']);
        assert.equal(deleted.id, completed.id); assert.equal(deleted.local_file_path, null);
        const publicMessage = await d.read(a.ref); cleared(publicMessage); await absent(actualFile);
        await d.evidence('media-zero-day-boundary', { configured, requests, download, cleanup, completed, deleted,
          actualFile, physicallyAbsent: true, publicMessage, publicationNeedNotRemainVisible: true });
        return;
      }
      const row = await published(d, a.ref, a.content);
      if (limit > 0) {
        assertAgeSide(await age(d, a.ref, limit - 0.001), limit, 'younger');
        const control = await attachment(d), controlRow = await published(d, control.ref, control.content);
        await expire(d, control.ref, limit + 1); const cleanup = await d.cycle('cleanup'); observed(cleanup, control.ref, ['deleted']);
        cleared(await d.read(control.ref)); await absent(controlRow.localFilePath!);
        await assertOwnedBytes((await d.read(a.ref)).localFilePath, configured.path, a.content);
      }
      assertAgeSide(await age(d, a.ref, limit + 0.001), limit, 'expired');
      const cleanup = await d.cycle('cleanup'); observed(cleanup, a.ref, ['deleted']);
      cleared(await d.read(a.ref)); await absent(row.localFilePath!);
    }, retentionDays === undefined ? {} : { retentionDays });
  }
}
export async function mediaDeletedPaths(driver?: MediaDriver) {
  await withOwnedDriver(driver, [M.basic, M.age, M.cleanup], 'media-deleted-paths', async (d) => {
    const a = await attachment(d, { isOwn: true }), row = await published(d, a.ref, a.content);
    // Populate a real next page through public ingress; the API returns no
    // separate snapshot token for a single-item page.
    for (let i = 0; i < 51; i++) {
      const newer = { groupId: a.ref.groupId, msgId: `snapshot-anchor-${randomUUID()}` };
      proof(await d.emit({ ...newer, text: 'newer cursor anchor' }));
      if (i === 50) await d.read(newer);
    }
    const oldPage = await d.timeline(a.ref.groupId), count = (await d.sourceRequests()).length;
    need(oldPage.snapshotCursor, '真实旧分页游标尚未建立，不能用空串冒称旧snapshot');
    await expire(d, a.ref); proof(await d.cycle('cleanup'));
    cleared(await d.read(a.ref)); await absent(row.localFilePath!);
    const replayed = await d.timeline(a.ref.groupId, oldPage.snapshotCursor);
    const same = replayed.messages.find((m) => m.msgId === a.ref.msgId); assert.ok(same); cleared(same);
    proof(await d.emit({ ...a.ref, text: `text:${a.ref.msgId}`, mediaUrl: a.source.url, isOwn: true }));
    proof(await d.cycle('download')); cleared(await d.read(a.ref));
    assert.equal((await d.sourceRequests()).length, count, '删除后历史重放不能复活附件');
  });
}
export async function mediaActiveReferences(driver?: MediaDriver) {
  for (const via of ['trigger', 'get_recent_messages', 'pending-download'] as const) {
    await withOwnedDriver(driver, [M.basic, M.age, M.cleanup, M.references, M.barriers], `media-reference-${via}`, async (d) => {
      const message = { groupId: await d.createGroup(), msgId: randomUUID() }, content = bytes();
      const source = await d.source({ id: message.msgId, bytes: content });
      const gate = via === 'pending-download' ? await d.hold('partial-written', message) : undefined;
      await cleanupPreserving(d, async () => { await gate?.release(); }, async () => {
      proof(await d.emit({ ...message, text: 'real active reference', mediaUrl: source.url }));
      if (gate) proof(await gate.reached());
      const a = { ref: message, content }, ref = await d.startReference(a.ref, via); proof(ref.evidence);
      const active = await d.run(ref.runId); assert.equal(active.status, 'running');
      if (via === 'get_recent_messages') assert.ok(active.steps.some((s) => s.name === 'get_recent_messages'));
      await gate?.release();
      const row = await published(d, a.ref, a.content);
      const traffic = await d.agentRequests(); proof(traffic.evidence);
      need(traffic.requests.length > 0, '未实际触发Agent请求，不能判模型上下文隔离');
      assert.ok(!JSON.stringify(traffic.requests).includes(row.localFilePath!), '服务端文件路径不自动加入模型上下文');
      const control = await attachment(d, { groupId: a.ref.groupId, isOwn: true });
      const controlRow = await published(d, control.ref, control.content);
      await expire(d, a.ref); await expire(d, control.ref); proof(await d.cycle('cleanup'));
      cleared(await d.read(control.ref)); await absent(controlRow.localFilePath!);
      await assertOwnedBytes((await d.read(a.ref)).localFilePath, (await d.mediaDirectory()).path, a.content);
      proof(await d.finishReference(ref.runId)); assert.notEqual((await d.run(ref.runId)).status, 'running');
      proof(await d.cycle('cleanup')); cleared(await d.read(a.ref)); await absent(row.localFilePath!);
      });
    }, { referenceMode: via });
  }
}
export async function mediaReferenceCleanupRace(driver?: MediaDriver) {
  for (const first of ['reference-before-cleanup', 'cleanup-before-reference'] as const) {
    await withOwnedDriver(driver, [M.basic, M.age, M.cleanup, M.references, M.barriers], `media-race-${first}`, async (d) => {
      const a = await attachment(d); await published(d, a.ref, a.content); await expire(d, a.ref);
      const gate = await d.hold(first, a.ref);
      const operations: Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>[] = [];
      await cleanupPreserving(d, async () => {
        try { await gate.release(); }
        finally { await d.evidence('media-race-settled-operations', await Promise.all(operations)); }
      }, async () => {
        need(gate.competingReached, '缺同文件第二真实操作到达竞争窗口见证，不把串行运行冒称race');
        const pending = observeOperation<Evidence | Awaited<ReturnType<MediaDriver['startReference']>>>(first === 'reference-before-cleanup' ? d.startReference(a.ref, 'get_recent_messages') : d.cycle('cleanup'));
        operations.push(pending);
        proof(await gate.reached());
        const other = observeOperation<Evidence | Awaited<ReturnType<MediaDriver['startReference']>>>(first === 'reference-before-cleanup' ? d.cycle('cleanup') : d.startReference(a.ref, 'get_recent_messages'));
        operations.push(other);
        proof(await gate.competingReached(first === 'reference-before-cleanup' ? 'cleanup' : 'reference'));
        await gate.release(); const settled = await Promise.all(operations);
        for (const result of settled) if (!result.ok) throw result.error;
        const row = await d.read(a.ref);
        if (first === 'reference-before-cleanup') await assertOwnedBytes(row.localFilePath, (await d.mediaDirectory()).path, a.content);
        else cleared(row);
      });
    });
  }
}
export async function mediaCrashRecovery(driver?: MediaDriver) {
  const failures: { phase: string; error: unknown }[] = [];
  for (const phase of ['partial-written', 'complete-before-path-commit', 'path-cleared-before-unlink', 'unlinked-before-completion'] as const) {
    try { await withOwnedDriver(driver, [M.basic, M.sourceFaults, M.age, M.cleanup, M.barriers, M.restart], `media-crash-${phase}`, async (d) => {
      const groupId = await d.createGroup(), ref = { groupId, msgId: randomUUID() }, content = bytes();
      const source = await d.source({ id: ref.msgId, bytes: content });
      const gate = await d.hold(phase, ref);
      await cleanupPreserving(d, () => gate.release(), async () => {
        proof(await d.emit({ ...ref, text: 'crash retained text', mediaUrl: source.url }));
        let deletedPath: string | undefined;
        if ((phase === 'path-cleared-before-unlink' || phase === 'unlinked-before-completion')) { deletedPath = (await published(d, ref, content)).localFilePath!; await expire(d, ref); }
        const cycle = d.cycle((phase === 'path-cleared-before-unlink' || phase === 'unlinked-before-completion') ? 'cleanup' : 'download').then(
          (value) => ({ evidence: value }), (error: unknown) => ({ interruptedRequest: String(error) }));
        proof(await gate.reached());
        const before = (await d.sourceRequests()).filter((r) => r.url === source.url).length;
        if (phase === 'complete-before-path-commit') await d.setSourceFault(source.url, '404');
        const restarted = await d.restart('SIGKILL'); proof(restarted.evidence);
        assert.notEqual(restarted.beforePid, restarted.afterPid);
        assert.ok(restarted.directoryPreserved && restarted.databasePreserved);
        await gate.release(); await d.evidence('pre-crash-cycle-observation', await cycle);
        if ((phase === 'path-cleared-before-unlink' || phase === 'unlinked-before-completion')) { proof(await d.cycle('cleanup')); cleared(await d.read(ref)); await absent(deletedPath!); }
        else {
          await published(d, ref, content);
          if (phase === 'complete-before-path-commit') assert.equal((await d.sourceRequests()).filter((r) => r.url === source.url).length, before,
            '已完整落盘的文件应复用，来源404不能使已得附件丢失');
          if (phase === 'partial-written') assert.ok((await d.sourceRequests()).filter((r) => r.url === source.url).length > before, '不完整下载恢复需要新真实请求');
        }
      });
    }); } catch (error) { failures.push({ phase, error }); await driver?.evidence(`media-crash-${phase}-variant-result`, { phase, status: error instanceof PreparationBlocked ? 'BLOCKED' : 'FAIL', error: error instanceof Error ? error.message : String(error) }); }
  }
  if (failures.length) {
    const realFailure = failures.find((item) => !(item.error instanceof PreparationBlocked));
    if (realFailure) throw realFailure.error;
    throw new PreparationBlocked(`媒体崩溃子场景缺失真实窗口: ${failures.map((item) => item.phase).join(', ')}`);
  }
}
export async function mediaDeletionFailure(driver?: MediaDriver) {
  await withOwnedDriver(driver, [M.basic, M.age, M.cleanup, M.unlink], 'media-unlink-failure', async (d) => {
    const a = await attachment(d), b = await attachment(d);
    const ar = await published(d, a.ref, a.content), br = await published(d, b.ref, b.content);
    const fault = await d.failUnlink(a.ref);
    await cleanupPreserving(d, () => fault.restore(), async () => {
      await expire(d, a.ref); await expire(d, b.ref);
      // A is deliberately unable to settle while its OS denial is installed.
      // The real failed unlink plus B's physical deletion establish progress.
      proof(await fault.failure());
      const deadline=performance.now()+15000;let bAbsent=false;
      do { bAbsent=await lstat(br.localFilePath!).then(()=>false,(error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return true;throw error;});if(bAbsent)break;await new Promise(r=>setTimeout(r,30)); } while(performance.now()<deadline);
      need(bAbsent,'Other eligible file deletion not observed while the exact first-file unlink denial remains installed');
      cleared(await d.read(a.ref)); cleared(await d.read(b.ref)); await absent(br.localFilePath!);
      await d.evidence('unlink-failure-other-candidate-completed',{failedFile:ar.localFilePath,otherFile:br.localFilePath,otherPhysicallyAbsent:bAbsent});
    });
    proof(await d.cycle('cleanup')); await absent(ar.localFilePath!); cleared(await d.read(a.ref));
  });
}
export async function mediaSharedDirectory(driver?: MediaDriver) {
  await withOwnedDriver(driver, [M.basic, M.multi, M.restart], 'media-shared-directory', async (d) => {
    const a = await attachment(d); await published(d, a.ref, a.content);
    const same = await d.secondInstance('same-physical'); proof(same.evidence); assert.equal(same.started, true);
    assert.equal(same.actualMediaRealPath, await realpath((await d.mediaDirectory()).path));
    const wrong = await d.secondInstance('new-owned-directory'); proof(wrong.evidence); assert.equal(wrong.started, false);
    const restarted = await d.restart('SIGTERM'); proof(restarted.evidence);
    assert.ok(restarted.directoryPreserved && restarted.databasePreserved); await published(d, a.ref, a.content);
  });
}
export async function mediaMigration(driver?: MediaDriver) {
  await withOwnedDriver(driver, [M.basic, M.migration, M.references, M.age, M.cleanup], 'media-migration', async (d) => {
    need(d.finalSchemaContract?.reference, '最终迁移集合/schema尚未冻结，不猜仍为9');
    const legacy = await d.legacyFixture(); proof(legacy.evidence);
    need(legacy.messages.some((m) => m.expectedBytes) && legacy.messages.some((m) => m.sourceExpired) &&
      legacy.messages.some((m) => !m.expectedBytes && !m.sourceExpired), '旧schema夹具应同时含可得媒体/过期来源/普通历史消息');
    const refused = await d.startWithoutMigration(); proof(refused.evidence); assert.equal(refused.started, false);
    const one = await d.migrate(), two = await d.migrate(); proof(one.evidence); proof(two.evidence);
    assert.equal(one.actualSchemaVersion, d.finalSchemaContract.expectedVersion);
    assert.equal(two.actualSchemaVersion, one.actualSchemaVersion);
    assert.equal((await d.run(legacy.activeRunId)).status, 'running');
    for (let i = 0; i < legacy.messages.length; i++) {
      const item = legacy.messages[i]!, ref = item.ref; proof(await d.cycle('download'));
      const row = await d.read(ref); assert.equal(row.text, item.text);
      if (item.expectedBytes) await published(d, ref, item.expectedBytes);
      else if (item.sourceExpired) cleared(row);
      else assert.ok(row.localFilePath === null || row.localFilePath === undefined);
      const current = await d.read(ref);
      if (current.localFilePath) {
        await expire(d, ref); proof(await d.cycle('cleanup'));
        assert.equal((await d.read(ref)).localFilePath, current.localFilePath, '旧running群保守引用不得丢失');
      }
    }
    proof(await d.finishReference(legacy.activeRunId)); proof(await d.cycle('cleanup'));
  }, { legacySchema: true });
}

export function requiredTools(): ToolDeclaration[] {
  return [
    ['get_recent_messages', { limit: { type: 'number' } }],
    ['send_message', { text: { type: 'string' }, idempotency_key: { type: 'string' } }],
    ['kick_user', { platform_user_id: { type: 'string' }, reason: { type: 'string' } }],
    ['finish', { summary: { type: 'string' } }],
  ].map(([name, properties]) => ({ name: name as string, description: `QA ${name}`,
    input_schema: { type: 'object', properties: properties as Record<string, Json>, required: Object.keys(properties!) } }));
}
export function turnRequest(runId = `qa-provider-${randomUUID()}`): TurnRequest {
  return { runId, tools: requiredTools(), messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify({
    groupId: 'qa-group', triggerMessages: [{ msgId: 'qa-trigger', senderPlatformUserId: 'qa-external', text: 'synthetic request', sentAt: '2026-10-02T00:00:00.000Z' }],
    policy: { autoKickEnabled: false }, ownPlatformUserIds: ['qa-managed'],
  }) }] }] };
}
export function assertTurnResponse(value: unknown): Record<string, unknown> {
  assert.ok(object(value) && Array.isArray(value.content) && value.content.length === 1, '每轮必须恰好一个内容块');
  const block = value.content[0]; assert.ok(object(block));
  if (value.stop_reason === 'end_turn') assert.ok(block.type === 'text' && typeof block.text === 'string');
  else {
    assert.equal(value.stop_reason, 'tool_use');
    assert.ok(block.type === 'tool_use' && typeof block.id === 'string' && !!block.id &&
      typeof block.name === 'string' && object(block.input));
  }
  return block;
}
export function assertAuditResponse(value: unknown): void {
  assert.ok(object(value)); assert.ok(value.verdict === 'pass' || value.verdict === 'fail');
  assert.equal(typeof value.reason, 'string');
}
function success(reply: HttpFact) { proof(reply.evidence); assert.equal(reply.status, 200); return assertTurnResponse(reply.body); }
function failure(reply: HttpFact) { proof(reply.evidence); assert.ok(reply.status < 200 || reply.status >= 300); }
async function next(d: ProviderDriver, request: TurnRequest, name: string, input: Record<string, Json>) {
  await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name, input } });
  const block = success(await d.exchange('/agent/turn', request)); assert.equal(block.name, name); assert.deepEqual(block.input, input);
  return block;
}

export async function providerProtocol(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream], 'provider-protocol', async (d) => {
    const samples: { name: string; input: Record<string, Json> }[] = [
      { name: 'get_recent_messages', input: { limit: 10 } }, { name: 'send_message', input: { text: 'reply', idempotency_key: 'qa-key' } },
      { name: 'kick_user', input: { platform_user_id: 'qa-external', reason: 'neutral' } }, { name: 'finish', input: { summary: 'done' } },
    ];
    for (const { name, input } of samples) {
      await next(d, turnRequest(), name, input);
    }
    for (const dialect of ['http://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft/2019-09/schema', 'https://json-schema.org/draft/2020-12/schema']) {
      const request = turnRequest(); request.tools.forEach((t) => { t.input_schema.$schema = dialect; });
      await next(d, request, 'finish', { summary: 'valid declared dialect' });
    }
    await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: 'pass', reason: 'synthetic neutral content' } });
    const audit = await d.exchange('/agent/audit', { groupId: 'qa-group', text: 'neutral reply' }); assert.equal(audit.status, 200); assertAuditResponse(audit.body);
    for (const invalid of [[], requiredTools().slice(1), [...requiredTools(), requiredTools()[0]!],
      requiredTools().map((tool, i) => i ? tool : { ...tool, input_schema: { ...tool.input_schema, required: [] } })]) {
      const before = (await d.calls()).length;
      const result = await d.exchange('/agent/turn', { ...turnRequest(), tools: invalid });
      assert.equal(result.status, 400); assert.ok(/TOOLS_INVALID/.test(result.rawBody));
      assert.equal((await d.calls()).length, before, '非法工具在提供方调用前拒绝');
    }
    for (const invalid of [null, {}, { runId: '', tools: requiredTools(), messages: [] }]) failure(await d.exchange('/agent/turn', invalid));
    for (const schema of [{ type: 'not-a-json-schema-type' }, { $schema: 'https://qa.invalid/unknown-dialect' }]) {
      const request = turnRequest(); Object.assign(request.tools[0]!.input_schema, schema);
      const before = (await d.calls()).length; failure(await d.exchange('/agent/turn', request));
      assert.equal((await d.calls()).length, before);
    }
  });
}
export async function providerDefaultAndSwitch(driver?: ProviderDriver) {
  for (const selectedAgent of ['mock', 'independent'] as const) {
    await withOwnedDriver(driver, [P.protocol, P.upstream, P.backend], `provider-switch-${selectedAgent}`, async (d) => {
      const binding = await d.deploymentBinding(); proof(binding.evidence); assert.equal(binding.selectedAgent, selectedAgent);
      if (selectedAgent === 'mock') {
        const group = await d.backendGroup({ autoKickEnabled: false, executor: 'admin' });
        const run = await d.backendRun(await d.triggerBackend(group.groupId), 75_000);
        assert.notEqual(run.status, 'running');
        const after = await d.deploymentBinding(); proof(after.evidence);
        assert.equal(after.upstreamCalls, 0, '实际run在默认mock下不能因合成key自动调用提供方');
      }
      else assert.deepEqual(binding.changedBackendSettings, ['AGENT_URL']);
    }, { selectedAgent, syntheticCredentialCanary: 'QA-NOT-A-REAL-KEY' });
  }
}
export async function providerHistory(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.history], 'provider-history', async (d) => {
    const request = turnRequest(), block = await next(d, request, 'send_message', { text: 'same text', idempotency_key: 'same-key' });
    const continuation: Message[] = [...request.messages,
      { role: 'assistant', content: [block as Json] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id as string, is_error: true, content: JSON.stringify({ code: 'SEND_TIMEOUT', message: 'synthetic unresolved', hint: 'keep key' }) }] },
      { role: 'user', content: [{ type: 'text', text: 'PROTOCOL_ERROR BAD_JSON: synthetic' }] }];
    const second = await next(d, { ...request, messages: continuation }, 'send_message', { text: 'same text', idempotency_key: 'same-key' });
    assert.notEqual(second.id, block.id);
    const calls = await d.calls(); assert.deepEqual(calls.at(-1)!.messages, continuation);
    const other = turnRequest(); await next(d, other, 'finish', { summary: 'other run' });
    assert.deepEqual((await d.calls()).at(-1)!.messages, other.messages, '交错run不能复用前一个历史');
  });
}
export async function providerCompletedReuse(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.restart], 'provider-completed-reuse', async (d) => {
    const request = turnRequest(); await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'stable committed response' } });
    const initial = await d.exchange('/agent/turn', request); success(initial);
    const count = (await d.calls()).length;
    assert.deepEqual((await d.exchange('/agent/turn', request)).body, initial.body);
    const restarted = await d.restart('SIGTERM'); proof(restarted.evidence); assert.equal(restarted.started, true);
    assert.notEqual(restarted.beforePid, restarted.afterPid);
    assert.deepEqual((await d.exchange('/agent/turn', request)).body, initial.body);
    assert.equal((await d.calls()).length, count, '同一已提交请求及正常重启后不购买新推理');
  });
}
export async function providerConcurrency(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.pending], 'provider-concurrency', async (d) => {
    const request = turnRequest(); await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'original' } });
    const held = await d.holdNextUpstream('turn'); let first: Promise<HttpFact> | undefined;
    await cleanupPreserving(d, async () => { await held.release(); await first?.catch(() => undefined); }, async () => {
      first = d.exchange('/agent/turn', request); first.catch(() => undefined); proof(await held.reached());
      const busy = await d.exchange('/agent/turn', request); failure(busy); assert.ok(/RUN_BUSY/.test(busy.rawBody));
      await held.release(); success(await first);
      const conflict = await d.exchange('/agent/turn', { ...request, messages: [{ role: 'user', content: [{ type: 'text', text: 'forked history' }] }] });
      failure(conflict); assert.ok(/RUN_HISTORY_CONFLICT/.test(conflict.rawBody));
      assert.equal((await d.calls()).length, 1);
    });
  });
}
export async function providerFailures(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream], 'provider-errors', async (d) => {
    const faults: ProviderFault[] = ['http-401', 'http-429', 'network-error', 'timeout', 'bad-json', 'multiple-candidates', 'native-function-call', 'truncated', 'safety-blocked'];
    for (const fault of faults) {
      for (const purpose of ['turn', 'audit'] as const) {
        const before = (await d.calls()).length;
        await d.enqueue({ purpose, fault });
        const response = await d.exchange(purpose === 'turn' ? '/agent/turn' : '/agent/audit',
          purpose === 'turn' ? turnRequest() : { groupId: randomUUID(), text: 'QA-neutral' });
        failure(response); assert.equal((await d.calls()).length, before + 1, '不能自动重试购买推理或静默换模型');
        assert.ok(!(object(response.body) && response.body.verdict === 'pass'), '错误不得补造审核pass');
      }
    }
  });
}
export async function providerPendingAndLock(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.pending, P.restart], 'provider-pending-lock', async (d) => {
    const request = turnRequest(); await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'response withheld' } });
    const held = await d.holdNextUpstream('turn'); let pending: Promise<HttpFact> | undefined;
    await cleanupPreserving(d, async () => { await held.release(); await pending?.catch(() => undefined); }, async () => {
      pending = d.exchange('/agent/turn', request); pending.catch(() => undefined); proof(await held.reached());
      const count = (await d.calls()).length;
      const restart = await d.restart('SIGKILL'); proof(restart.evidence);
      const lock = await d.lockState(); proof(lock.evidence);
      if (!restart.started) {
        assert.ok(lock.exists && !lock.actualOwnerAlive && lock.ownedDirectoryVerified);
        proof(await d.reclaimOwnedStaleLock());
        const started = await d.restart('SIGTERM'); proof(started.evidence); assert.equal(started.started, true);
      }
      const uncertain = await d.exchange('/agent/turn', request); failure(uncertain);
      assert.ok(/TURN_OUTCOME_UNCERTAIN/.test(uncertain.rawBody));
      assert.equal((await d.calls()).length, count, '未知轮次不盲目重发');
      await d.evidence('provider-known-recovery-limit', { requestRunId: request.runId, uncertain,
        strongRecovery: 'NOT_ESTABLISHED', limitation: '这里只验证公开未决/锁安全行为；原任意崩溃同run正常完成义务不豁免，不能据此给完整C2或A5.8通过' });
    });
  });
}
export async function providerPrivateStorage(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.storage], 'provider-private-storage', async (d, owner) => {
    const request = turnRequest(); await next(d, request, 'finish', { summary: 'private session' });
    const files = await d.sessionFiles(); proof(files.evidence);
    assert.equal((await lstat(files.root)).mode & 0o777, 0o700);
    assert.ok(relative(await realpath(owner.resourceRoot), await realpath(files.root)).split(sep)[0] !== '..');
    assert.ok(files.records.length > 0);
    for (const file of files.records) { const st = await lstat(file); assert.ok(st.isFile() && !st.isSymbolicLink()); assert.equal(st.mode & 0o777, 0o600); }
    const results: { variant: string; error?: unknown }[] = [];
    try { const second = await d.competingSessionOwner(); proof(second.evidence); assert.equal(second.started, false); results.push({ variant: 'competing-owner' }); }
    catch (error) { results.push({ variant: 'competing-owner', error }); }
    for (const kind of ['corrupt', 'symlink', 'wide-permissions', 'foreign-owner'] as const) {
      try {
        const fault = await d.installPrivateStateFault(kind); proof(fault.evidence);
        await cleanupPreserving(d, () => fault.restore(), async () => {
          const before = (await d.calls()).length;
          failure(await d.exchange('/agent/turn', request)); assert.equal((await d.calls()).length, before, '异常私有状态在购买新推理前拒绝');
        });
        results.push({ variant: kind });
      } catch (error) { results.push({ variant: kind, error }); }
    }
    await d.evidence('provider-private-storage-subscenario-results', results.map(({ variant, error }) => ({ variant,
      status: error === undefined ? 'PASS' : error instanceof assert.AssertionError ? 'FAIL' : 'BLOCKED',
      ...(error === undefined ? {} : { error: String(error) }) })));
    assert.ok(!(await d.logs()).join('\n').includes('QA-NOT-A-REAL-KEY'));
    const failures = results.filter((r) => r.error !== undefined), failureObserved = failures.find((r) => r.error instanceof assert.AssertionError);
    if (failureObserved) throw failureObserved.error;
    if (failures.length) throw new PreparationBlocked(`Private storage subscenarios lack actual fixtures: ${failures.map((r) => r.variant).join(', ')}`);
  }, { syntheticCredentialCanary: 'QA-NOT-A-REAL-KEY' });
}
export async function providerBackendPolicies(driver?: ProviderDriver) {
  for (const policy of [
    { autoKickEnabled: false, executor: 'admin' as const, code: 'POLICY_DENIED' },
    { autoKickEnabled: true, executor: 'none' as const, code: 'NO_AVAILABLE_ACCOUNT' },
    { autoKickEnabled: true, executor: 'member' as const, code: 'NO_AVAILABLE_ACCOUNT' },
    { autoKickEnabled: true, executor: 'admin' as const, managedTarget: true, code: 'POLICY_DENIED' },
  ]) {
    await withOwnedDriver(driver, [P.protocol, P.upstream, P.backend], `provider-policy-${policy.code}-${policy.executor}`, async (d) => {
      const group = await d.backendGroup(policy); proof(group.evidence);
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'kick_user', input: { platform_user_id: group.target, reason: 'neutral management' } } });
      await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: 'pass', reason: 'content only' } });
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'finish after refusal' } });
      const run = await d.backendRun(await d.triggerBackend(group.groupId), 70_000), facts = await d.backendFacts(group.groupId);
      assert.ok(run.steps.some((step) => step.name === 'kick_user' && step.errorCode === policy.code));
      assert.equal(facts.kicks.length, 0); assert.equal(facts.effects.length, 0);
    });
  }
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.backend], 'provider-audit-reuse', async (d) => {
    const group = await d.backendGroup({ autoKickEnabled: true, executor: 'admin' });
    for (let i = 0; i < 2; i++) await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'send_message', input: { text: 'same-key-message', idempotency_key: 'provider-reuse-key' } } });
    await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: 'pass', reason: 'allowed text' } });
    await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'done' } });
    const run = await d.backendRun(await d.triggerBackend(group.groupId), 70_000), facts = await d.backendFacts(group.groupId);
    assert.equal(run.status, 'finished'); assert.equal(facts.sends.length, 1); assert.equal(facts.audits.length, 1);
    assert.equal(facts.effects.filter((e) => e.kind === 'send').length, 1);
    assert.equal(facts.publicMessages.length, 1);
  });
}
export async function providerBackendBudgets(driver?: ProviderDriver) {
 for (const delayResponseMs of [0, 7_000]) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.backend, P.activity], 'provider-backend-budgets', async (d) => {
    const group = await d.backendGroup({ autoKickEnabled: true, executor: 'admin' });
    for (let i = 0; i < 14; i++) await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'get_recent_messages', input: { limit: i + 1 } }, delayResponseMs });
    const runId = await d.triggerBackend(group.groupId), run = await d.backendRun(runId, 75_000), facts = await d.backendFacts(group.groupId);
    assert.notEqual(run.status, 'running'); assert.ok(run.steps.length > 1, '必须实际执行多次合法只读工具');
    assert.ok(facts.turns.filter((t) => t.runId === runId).length <= 12);
    const timing = await d.activity(runId); proof(timing.evidence);
    assertActivityLowerBounds(timing, runId);
    need(timing.complete && timing.continuous && timing.epochIds.length === 1 && timing.activeElapsedMs && timing.actualDecisionElapsedMs &&
      timing.decisionAttemptId && timing.decisionAttemptId === timing.committedAttemptId,
    '缺真实连续活动/实际决定与同attempt COMMIT，不能把在线或持久采样当预算');
    need(timing.activeElapsedMs[1] <= 60_000 && timing.actualDecisionElapsedMs[1] <= 60_000, '60秒区间跨界，不增加容差');
    need(run.endReason === (delayResponseMs ? 'wall_clock' : 'budget_exhausted'),
      '有限合法早停不等于已触发预算耗尽；不增设必须运行60秒的下限');
  });
 }
}
export function assertActivityLowerBounds(timing: import('../contracts/media-provider.js').ActivityProof, expectedRunId: string) {
  need(timing.runId === expectedRunId, '活动见证不属于当前真实run');
  const values = [timing.activeElapsedMs, timing.actualDecisionElapsedMs];
  const valid = (x: [number, number] | null): x is [number, number] => !!x && x.every(Number.isFinite) && x[0] >= 0 && x[0] <= x[1];
  for (const v of values) if (valid(v)) assert.ok(v[0] <= 60_000, '已证实际活动/停止决定超限；缺COMMIT不能遮蔽');
  need(values.every((v) => v === null || valid(v)), '活动区间不是有限非负有序真值包围');
}
export async function providerBackendAudit(driver?: ProviderDriver) {
 for (const scenario of ['fail', 'three-errors', 'pass'] as const) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.backend], `provider-audit-${scenario}`, async (d) => {
    const group = await d.backendGroup({ autoKickEnabled: true, executor: 'admin' });
    await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'send_message', input: { text: 'audit-bound-text', idempotency_key: 'audit-key' } } });
    if (scenario === 'three-errors') for (let i = 0; i < 3; i++) await d.enqueue({ purpose: 'audit', fault: 'bad-json' });
    else await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: scenario, reason: 'synthetic policy result' } });
    await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'finish' } });
    const run = await d.backendRun(await d.triggerBackend(group.groupId), 75_000), facts = await d.backendFacts(group.groupId);
    assert.equal(facts.audits.length, scenario === 'three-errors' ? 3 : 1);
    assert.ok(facts.audits.every((a) => a.text === 'audit-bound-text'));
    assert.equal(facts.sends.length, scenario === 'pass' ? 1 : 0);
    assert.equal(facts.effects.filter((e) => e.kind === 'send').length, scenario === 'pass' ? 1 : 0);
    if (scenario === 'three-errors') { assert.equal(run.status, 'blocked'); assert.equal(run.endReason, 'audit_blocked'); }
    if (scenario === 'fail') assert.ok(run.steps.some((s) => s.errorCode === 'AUDIT_REJECTED'));
  });
 }
}
export async function providerStrongRecovery(driver?: ProviderDriver) {
 await withOwnedDriver(driver, [P.protocol, P.upstream, P.backend, P.pending, P.restart], 'provider-strong-recovery', async (d) => {
   const group = await d.backendGroup({ autoKickEnabled: false, executor: 'admin' });
   await d.enqueue({ purpose: 'turn', proposal: { kind: 'tool', name: 'send_message', input: { text: 'recover once', idempotency_key: 'recover-original-key' } } });
   await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: 'pass', reason: 'valid text' } });
   await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'finished' } });
   const gate = await d.holdNextUpstream('turn');
   await cleanupPreserving(d, () => gate.release(), async () => {
     const id = await d.triggerBackend(group.groupId); proof(await gate.reached());
     const restart = await d.restart('SIGKILL'); proof(restart.evidence);
     await d.evidence('strong-recovery-service-restart', restart);
     assert.equal(restart.started, true, '原强恢复不豁免硬崩溃后必须人工清owner.lock才能继续');
     await gate.release(); const run = await d.backendRun(id, 90_000), facts = await d.backendFacts(group.groupId);
     assert.equal(run.id, id); assert.equal(run.status, 'finished', '安全未决暂停不能代替原run正常完成');
     assert.equal(facts.sends.length, 1); assert.equal(facts.effects.filter((e) => e.kind === 'send').length, 1);
   });
 });
}
function usageProfile(d: ProviderDriver) {
  const profile = d.usageContract;
  need(profile && profile.reference && profile.rawAllowedFields.length &&
    Number.isSafeInteger(profile.maximumRecords) && profile.maximumRecords > 0 &&
    Number.isSafeInteger(profile.maximumBytes) && profile.maximumBytes >= 4096 && profile.maximumBytes <= 16777216 &&
    profile.maximumRecords <= 10_000 && Number.isInteger(profile.maximumAgeDays) && profile.maximumAgeDays >= 1 && profile.maximumAgeDays <= 365,
  '缺aa41fc8公开usage契约与最终配置映射，不能猜测产品字段');
  assert.deepEqual([...profile.rawAllowedFields].sort(), ['requestId', 'attemptId', 'runId', 'observedAt', 'stage', 'purpose', 'model',
    'elapsedMs', 'outcome', 'errorCode', 'inputTokens', 'outputTokens', 'totalTokens'].sort());
  proof(profile.configurationEvidence); return profile;
}
export function assertServiceUuid(value: string) { assert.match(value, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i); }
export function assertUsageOutcome(outcome: string, errorCode: string | null, validOutput: boolean) {
  assert.ok(outcome.length > 0);
  if (validOutput) assert.equal(outcome, 'success', '合法审计fail仍是有效模型结果');
  else { assert.notEqual(outcome, 'success', '真实调用/输出错误不能记success'); assert.ok(errorCode); }
}
export function assertUsageTokens(actual: Record<string, number> | null, expected: Record<string, number> | null) {
  assert.deepEqual(actual, expected, '失败与用量已知性独立；保留已取得字段，未知不补0/不推算');
}
export async function providerUsage(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.usage], 'provider-usage', async (d) => {
    const profile = usageProfile(d), request = turnRequest();
    request.messages[0]!.content.push({ type: 'text', text: 'QA-PROMPT-BODY-CANARY' });
    await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'QA-PROMPT-BODY-CANARY' }, actualUsage: { inputTokens: 17, outputTokens: 9 } });
    success(await d.exchange('/agent/turn', request)); await d.exchange('/agent/turn', request);
    await d.enqueue({ purpose: 'audit', proposal: { kind: 'audit', verdict: 'fail', reason: 'valid refusal is still model success' }, actualUsage: null });
    const audit = await d.exchange('/agent/audit', { groupId: 'qa-usage', text: 'QA-TOOL-BODY-CANARY' }); assertAuditResponse(audit.body);
    const failedRequest = turnRequest();
    await d.enqueue({ purpose: 'turn', fault: 'http-429', actualUsage: { inputTokens: 99 } }); failure(await d.exchange('/agent/turn', failedRequest));
    const malformedOutputRequest = turnRequest();
    await d.enqueue({ purpose: 'turn', fault: 'native-function-call', actualUsage: { inputTokens: 23, outputTokens: 5 } });
    failure(await d.exchange('/agent/turn', malformedOutputRequest));
    const settled = await d.settleUsage(); proof(settled.evidence);
    need(settled.queued === 0 && settled.activeBatch === 0 && settled.dropped === 0, '本低载样例存在未落盘/丢观察，不能当完整用量证据');
    const calls = await d.calls(), usage = await d.usage(); proof(usage.evidence);
    assert.equal(calls.length, 4); assert.equal(usage.records.length, 4, '缓存复用不是新的模型调用');
    assert.equal(new Set(usage.records.map((r) => r.serviceCallId)).size, 4);
    const expectedCalls = [
      { runId: request.runId, validOutput: true, usage: { inputTokens: 17, outputTokens: 9 } },
      { runId: null, validOutput: true, usage: null },
      { runId: failedRequest.runId, validOutput: false, usage: null },
      { runId: malformedOutputRequest.runId, validOutput: false, usage: { inputTokens: 23, outputTokens: 5 } },
    ];
    for (const record of usage.records) {
      // Google wire has no service-local UUID. Correlate actual received
      // runId/purpose; this controlled sample has exactly one audit invocation.
      const matching = calls.filter((call) => {
        if (call.purpose !== record.purpose) return false;
        const decoded = decodeProviderWire(`/v1beta/models/${call.model}:generateContent`, call.rawWire);
        return record.purpose === 'audit' ? record.runId === null : decoded.payload.runId === record.runId;
      });
      assert.equal(matching.length, 1, '唯一实际runId/用途关联；不能把服务UUID当上游ID或按数组猜关联');
      const call = matching[0]!;
      const expected = expectedCalls.find((item) => item.runId === record.runId)!;
      assert.ok(expected);
      await d.evidence('usage-observed-correlation', { serviceRequestId: record.requestId, serviceAttemptId: record.attemptId, independentWireLedgerId: call.id, runId: record.runId, purpose: record.purpose, basis: record.purpose === 'audit' ? 'only-audit-call-in-controlled-serial-sample' : 'unique-actual-wire-runId-and-purpose', crossServiceIdEqualityAsserted: false });
      assert.equal(record.purpose, call.purpose); assert.equal(record.model, call.model);
      assertUsageTokens(record.usage, expected.usage);
      assert.ok(Number.isFinite(record.elapsedMs) && record.elapsedMs >= 0);
      assert.ok(object(record.raw)); assert.ok(Object.keys(record.raw).every((key) => profile.rawAllowedFields.includes(key)));
      assert.equal(record.stage, 'validated-generation');
      assertServiceUuid(record.requestId); assertServiceUuid(record.attemptId);
      assert.ok(Number.isFinite(Date.parse(record.observedAt)));
      assert.equal(record.runId, expected.runId);
      assertUsageOutcome(record.outcome, record.errorCode, expected.validOutput);
      for (const key of ['requestId', 'attemptId', 'runId', 'stage', 'purpose', 'model', 'elapsedMs', 'outcome', 'errorCode', 'observedAt'] as const)
        assert.equal(record.raw[key], record[key], '归一化字段须与原JSONL相符');
      for (const key of ['inputTokens', 'outputTokens', 'totalTokens']) assert.equal(record.raw[key], (expected.usage as Record<string, number> | null)?.[key] ?? null);
    }
    const recorded = JSON.stringify({ usage, logs: await d.logs() });
    for (const canary of ['QA-PROMPT-BODY-CANARY', 'QA-TOOL-BODY-CANARY', 'QA-NOT-A-REAL-KEY']) assert.ok(!recorded.includes(canary));
    assert.ok(usage.actualBytes <= profile.maximumBytes && usage.records.length <= profile.maximumRecords);
  }, { syntheticCredentialCanary: 'QA-NOT-A-REAL-KEY' });
}
export async function providerUsageFailureBounds(driver?: ProviderDriver) {
  await withOwnedDriver(driver, [P.protocol, P.upstream, P.usage, P.usageFault, P.restart], 'provider-usage-failure', async (d) => {
    const profile = usageProfile(d), fault = await d.usageWriteFault();
    need(profile.maximumRecords <= 20, '有界工具实验需实际小条数配置≤20；不是产品容量门槛');
    await cleanupPreserving(d, () => fault.restore(), async () => {
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'business remains available' } });
      success(await d.exchange('/agent/turn', turnRequest())); proof(await fault.observed());
      const diagnostic = await d.diagnostics(); proof(diagnostic.evidence); assert.equal(diagnostic.failureObserved, true);
    });
    for (let i = 0; i <= profile.maximumRecords; i++) {
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: `bounded-${i}` } });
      success(await d.exchange('/agent/turn', turnRequest()));
    }
    proof((await d.settleUsage()).evidence);
    const usage = await d.usage(); assert.ok(usage.records.length <= profile.maximumRecords && usage.actualBytes <= profile.maximumBytes);
    const restarted = await d.restart('SIGTERM'); proof(restarted.evidence); assert.equal(restarted.started, true);
    await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'write recovered' } });
    success(await d.exchange('/agent/turn', turnRequest())); proof((await d.settleUsage()).evidence);
    const recovered = await d.usage(); assert.ok(recovered.records.length > 0); proof(recovered.evidence);
  }, { usageMaxRecords: 2, usageMaxBytes: 4096 });
}
export async function providerUsageLifecycle(driver?: ProviderDriver) {
 const failures: { variant: string; error: unknown }[] = [];
 for (const option of [ { entry: 'main', enabled: true }, { entry: 'main', enabled: false },
   { entry: 'factory', enabled: false }, { entry: 'factory', enabled: true } ]) {
  try { await withOwnedDriver(driver, [P.protocol, P.upstream, P.usage, P.restart], 'provider-usage-lifecycle', async (d) => {
    const profile = usageProfile(d); assert.equal(profile.enabled, option.enabled); assert.equal(profile.entry, option.entry);
    assert.equal(profile.maximumRecords, 1000); assert.equal(profile.maximumBytes, 2097152); assert.equal(profile.maximumAgeDays, 30);
    await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'zero usage is real zero' }, actualUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
    success(await d.exchange('/agent/turn', turnRequest())); proof((await d.settleUsage()).evidence);
    const value = await d.usage(), files = await d.usageFiles(); proof(value.evidence); proof(files.evidence);
    if (!option.enabled) { assert.equal(value.records.length, 0); assert.equal(files.files.length, 0); return; }
    assert.equal(value.records.length, 1); assert.deepEqual(value.records[0]!.usage, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
    const disabled = await d.restart('SIGTERM', option.entry === 'factory' ? { factoryUsageSupplied: false } : { usageEnabled: false }); proof(disabled.evidence); assert.equal(disabled.started, true);
    assert.equal(usageProfile(d).enabled, false, '实际新进程的 usage 已关闭');
    await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'disabled usage still serves' } });
    success(await d.exchange('/agent/turn', turnRequest())); proof((await d.settleUsage()).evidence);
    assert.deepEqual((await d.usage()).records, value.records, '关闭留存不能删除既有记录或新增调用记录');
    const enabled = await d.restart('SIGTERM', option.entry === 'factory' ? { factoryUsageSupplied: true } : { usageEnabled: true }); proof(enabled.evidence); assert.equal(enabled.started, true);
    assert.equal(usageProfile(d).enabled, true, '实际新进程的 usage 已重新启用');
    assert.equal((await lstat(files.root)).mode & 0o777, 0o700);
    for (const file of files.files) { const stat = await lstat(file); assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.mode & 0o777, 0o600); }
    const age = await d.advanceUsageRetention(); proof(age.evidence);
    const before = await d.usage(); assert.ok(before.records.some((r) => r.serviceCallId === age.oldestEligibleRecordId), '显式老化输入在停止后的原文件中保留，启动裁剪尚未执行');
    const restart = await d.restart('SIGTERM'); proof(restart.evidence); assert.equal(restart.started, true);
    assert.ok(!(await d.usage()).records.some((r) => r.serviceCallId === age.oldestEligibleRecordId), '启动按实际年龄清理');
    const closed = await d.shutdownUsageWriter(); proof(closed.evidence); assert.equal(closed.rejectedAfterClose, true);
  }, { usageEntry: option.entry, ...(option.entry === 'factory' ? { factoryUsageSupplied: option.enabled } : { usageEnabled: option.enabled }) }); } catch (error) { const variant = `${option.entry}-${option.enabled}`; failures.push({ variant, error }); await driver?.evidence(`provider-usage-lifecycle-${variant}-result`, { variant, status: error instanceof PreparationBlocked ? 'BLOCKED' : 'FAIL', error: error instanceof Error ? error.message : String(error) }); }
 }
 if (failures.length) { const realFailure = failures.find((item) => !(item.error instanceof PreparationBlocked)); if (realFailure) throw realFailure.error; throw new PreparationBlocked(`Usage lifecycle subscenarios not established: ${failures.map((item) => item.variant).join(', ')}`); }
}
export async function providerUsageQueue(driver?: ProviderDriver) {
 await withOwnedDriver(driver, [P.protocol, P.upstream, P.usage, P.usageQueue], 'provider-usage-queue', async (d) => {
  usageProfile(d); const gate = await d.holdUsageWrites();
  await cleanupPreserving(d, () => gate.release(), async () => {
    await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: 'first pending write' } });
    success(await d.exchange('/agent/turn', turnRequest())); proof(await gate.reached());
    for (let i = 0; i < 140; i++) {
      await d.enqueue({ purpose: 'turn', proposal: { kind: 'text', text: `finite-offline-pressure-${i}` } });
      success(await d.exchange('/agent/turn', turnRequest()));
    }
    const queue = await d.usageQueue(); proof(queue.evidence);
    assert.ok(queue.queued <= 64 && queue.activeBatch <= 64, '真实等待队列及在写批次分别有界');
    need(queue.dropped > 0, '未真正触发队列溢出，不能仅以低载证明溢出诊断');
    assert.ok(queue.diagnosticCodes.includes('USAGE_QUEUE_FULL'));
    assert.equal((await d.calls()).length, 141, '日志写屏障不能阻塞正常离线推理响应');
    const observed=await d.usageObservation(); proof(observed.evidence); assert.equal(observed.snapshot.usage.truncatedEvents,0);
    const accepted=observed.snapshot.usage.events.filter(e=>e.kind==='enqueued').map(e=>e.attemptId!);
    const rejected=observed.snapshot.usage.events.filter(e=>e.kind==='rejected-queue-full').map(e=>e.attemptId!);
    assert.equal(accepted.length+rejected.length,141); assert.equal(rejected.length,queue.dropped);
    assert.equal(new Set([...accepted,...rejected]).size,141,'accepted/dropped must identify distinct actual attempts');
    await gate.release(); const settled=await d.settleUsage(); proof(settled.evidence); assert.equal(settled.dropped,queue.dropped);
    const persisted=await d.usage(); proof(persisted.evidence);
    assert.deepEqual(persisted.records.map(r=>r.attemptId).sort(),accepted.sort(),'all accepted finite-batch records settle, rejected attempts are not invented');
  });
 });
}
export function validateRealPermission(permission: ProviderDriver['realPermission']): asserts permission is NonNullable<ProviderDriver['realPermission']> {
  need(permission?.explicitlyAuthorized === true && permission.authorizationReference && permission.credentialReference && permission.model &&
    Number.isSafeInteger(permission.maximumPaidCalls) && permission.maximumPaidCalls >= 2 &&
    Number.isSafeInteger(permission.maximumOutputTokens) && permission.maximumOutputTokens > 0 &&
    Number.isFinite(permission.maximumSpend.amount) && permission.maximumSpend.amount > 0 && permission.maximumSpend.currency &&
    Date.parse(permission.expiresAt) > Date.now(),
  '真实提供方缺本轮有限收费授权/凭据引用/模型/调用与费用上限；不读取本机Key、不调用');
}
export async function providerReal(driver?: ProviderDriver) {
  const permission = driver?.realPermission;
  validateRealPermission(permission);
  need(driver?.verifyRealCostGuard, '未在真实调用前接入费用/调用/token限额守卫');
  proof(await driver.verifyRealCostGuard(permission));
  await withOwnedDriver(driver, [P.protocol, P.real], 'provider-real', async (d) => {
    need(d.realGenerationCount, '真实调用计数与费用熔断未接入');
    const before = await d.realGenerationCount();
    const turn = await d.exchange('/agent/turn', turnRequest()); success(turn);
    const audit = await d.exchange('/agent/audit', { groupId: 'qa-paid-synthetic', text: '请回复合成测试已完成。' });
    assert.equal(audit.status, 200); assertAuditResponse(audit.body);
    const count = await d.realGenerationCount() - before;
    assert.ok(count > 0 && count <= permission.maximumPaidCalls);
    await d.evidence('real-provider-scope', { model: permission.model, calls: count,
      authorizationReference: permission.authorizationReference, scope: '仅本次真实提供方连通及协议，不代表所有工具/任意未来模型输出或费用为零' });
  }, { explicitRealProvider: true });
}

/** Self-test-only protocol stand-in. It never runs tools, accesses files/keys,
 * opens sockets, or claims to implement Gemini HTTP. Product adapters must not
 * substitute it for the independent service under test. */
export class IndependentProtocolDouble {
  readonly received: { path: string; body: unknown }[] = [];
  private responses: unknown[] = [];
  enqueue(response: unknown): void { this.responses.push(structuredClone(response)); }
  exchange(path: '/agent/turn' | '/agent/audit', body: unknown): unknown {
    this.received.push({ path, body: structuredClone(body) });
    need(this.responses.length, 'QA协议替身没有脚本响应；禁止隐式成功');
    return structuredClone(this.responses.shift());
  }
}
