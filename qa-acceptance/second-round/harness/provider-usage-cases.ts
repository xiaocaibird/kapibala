import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, lstat, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { redact } from '../../harness/security.js';
import { C2_CAPABILITIES as P, PreparationBlocked, type Json, type ProviderDriver, type ProviderFault, type UsageRecord } from '../contracts/media-provider.js';
import { withOwnedDriver, turnRequest, assertTurnResponse, assertAuditResponse, providerPendingAndLock, providerCompletedReuse, providerUsageQueue } from '../tests/media-provider.js';
import type { DriverContext } from './driver-factories.js';
import { runUsageKeyFileIsolation, runUsageCapacitySupplement } from './provider-usage-supplement.js';
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
export async function runUsageCase(id: string, driver: ProviderDriver, context?:DriverContext): Promise<void> {
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
  if (id === 'SR-BE-USG-004') { await run(driver, id, async (d) => {
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
  }); return providerUsageQueue(driver); }
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
    const errors:unknown[]=[];
    for(const [name,body] of [['completed',providerCompletedReuse],['pending',providerPendingAndLock],['queued',providerQueuedWriteCrash]] as const)try{await body(driver);}catch(e){errors.push(e);await driver.evidence(`usage-crash-${name}-result`,{status:e instanceof PreparationBlocked?'BLOCKED':'FAIL',error:String(e)});}
    if(errors.length)throw errors.find(e=>!(e instanceof PreparationBlocked))??errors[0];return;
  }
  if (id === 'SR-BE-USG-006' || id === 'SR-BE-USG-010') {
    const obligations:[string,()=>Promise<void>][]=[...([true,false] as const).map(enabled=>[`${id}-${enabled}`,()=>run(driver, `${id}-${enabled}`, async (d) => {
      await d.enqueue(successPlan()); assert.equal((await d.exchange('/agent/turn', turnRequest())).status, 200); await d.settleUsage(); const files = await d.usageFiles(), value = await d.usage();
      assert.equal(value.records.length, enabled ? 1 : 0);
      if (enabled) {
        assert.equal((await lstat(files.root)).mode & 0o777, 0o700);for(const path of files.files)assert.equal((await lstat(path)).mode&0o777,0o600);
        const prior=value.records;assert.equal((await d.restart('SIGTERM',{usageEnabled:false})).started,true);assert.equal(d.usageContract?.enabled,false);
        await d.enqueue(successPlan());assert.equal((await d.exchange('/agent/turn',turnRequest())).status,200);await d.settleUsage();assert.deepEqual((await d.usage()).records,prior,'disabled inference keeps prior journal without adding rows');
      }else assert.equal(files.files.length,0);
      await d.evidence('usage-main-enable-disable-permissions',{enabled,files,value});
    },{usageEnabled:enabled})] as [string,()=>Promise<void>]),
      ['entry-or-private-temp',()=>id.endsWith('006')?providerUsageTemporaryFiles(driver):providerUsageEntryMatrix(driver)],
      ['key-file-import',async()=>{if(!context)throw new PreparationBlocked('Key-file isolation needs fixed authorized DriverContext');await runUsageKeyFileIsolation(context);}],
    ];
    if(id.endsWith('006'))obligations.push(['foreign-uid-proof',async()=>{throw new PreparationBlocked('Foreign UID evidence runs in a separately frozen Linux supplement; whole-case acceptance requires explicit same-candidate sub-obligation review, no inferred pass');}]);
    await allUsageObligations(driver,obligations,context,id);return;
  }
  if (id === 'SR-BE-USG-011') {
    const obligations:[string,()=>Promise<void>][]=[...([1,2] as const).map(limit=>[`${id}-records-${limit}`,()=>run(driver,`${id}-records-${limit}`,async d=>{
      for(let i=0;i<limit+2;i++){await d.enqueue(successPlan(i));assert.equal((await d.exchange('/agent/turn',turnRequest())).status,200);}
      await d.settleUsage();const actual=await d.usage();assert.equal(actual.records.length,limit);assert.ok(actual.actualBytes<=4096);await d.evidence('usage-actual-record-byte-bound',{configured:{records:limit,bytes:4096},actual});
    },{usageMaxRecords:limit,usageMaxBytes:4096})] as [string,()=>Promise<void>]),
      ['configuration',()=>providerUsageConfigurationMatrix(driver)],['retention-input',()=>providerUsageRetention(driver)],['actual-capacity',()=>runUsageCapacitySupplement(driver)],
    ];
    await allUsageObligations(driver,obligations,context,id);return;
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


export async function allUsageObligations(driver:ProviderDriver,obligations:[string,()=>Promise<void>][],context:DriverContext|undefined,caseId:string) {
  if(!context)throw new PreparationBlocked('Usage obligation report needs the fixed candidate and owned output context');
  const names=obligations.map(([name])=>name);assert.ok(names.length>0);assert.equal(new Set(names).size,names.length);assert.ok(names.every(name=>/^[A-Za-z0-9-]+$/.test(name)));
  const out=resolve(context.outputDir,'usage-obligations');await mkdir(out,{recursive:true});
  const files=async()=>new Set((await readdir(context.outputDir,{recursive:true,withFileTypes:true})).filter(item=>item.isFile()).map(item=>resolve(item.parentPath,item.name)));
  const errors:unknown[]=[],rows:{name:string;status:'PASS'|'FAIL'|'BLOCKED';reason?:string;startedAt:string;completedAt:string;evidence:string[]}[]=[];
  for(const [name,body] of obligations){
    const startedAt=new Date().toISOString();let primary:unknown,prior=new Set<string>(),executionEvidence:string[]=[];
    try{prior=await files();}catch(error){primary=error;}
    try{await body();}catch(error){if(error instanceof assert.AssertionError||!primary)primary=error;}
    try{executionEvidence=[...await files()].filter(path=>!prior.has(path)).sort();if(!primary&&!executionEvidence.length)primary=new PreparationBlocked('Obligation produced no new execution evidence');}catch(error){primary??=error;}
    const status: 'PASS'|'FAIL'|'BLOCKED'=primary?(primary instanceof assert.AssertionError?'FAIL':'BLOCKED'):'PASS',path=resolve(out,`${name}.json`);
    const row={name,status,...(primary?{reason:String(primary)}:{}),startedAt,completedAt:new Date().toISOString(),evidence:[path,...executionEvidence]};rows.push(row);if(primary)errors.push(primary);
    try{await writeFile(path,redact({schemaVersion:1,caseId,sutRevision:context.target.sut.revision,contractReference:driver.contractReference,...row,executionEvidence}),{flag:'wx'});}catch(error){errors.push(error);if(row.status!=='FAIL')row.status='BLOCKED';row.reason=[row.reason,`result evidence write failed: ${String(error)}`].filter(Boolean).join('; ');}
  }
  const status=rows.some(row=>row.status==='FAIL')?'FAIL':rows.some(row=>row.status!=='PASS')?'BLOCKED':'PASS';
  await writeFile(resolve(context.outputDir,'usage-obligations-summary.json'),redact({schemaVersion:1,caseId,sutRevision:context.target.sut.revision,contractReference:driver.contractReference,status,exactNames:names,obligations:rows,counts:{PASS:rows.filter(r=>r.status==='PASS').length,FAIL:rows.filter(r=>r.status==='FAIL').length,BLOCKED:rows.filter(r=>r.status==='BLOCKED').length},externalSupplementMayAddressOnly:names.includes('foreign-uid-proof')?['foreign-uid-proof']:[],mergeRule:'Only same-candidate reviewed foreign UID evidence may satisfy that single obligation; all other exact names require their own PASS evidence. Existing attempt records are immutable.'}),{flag:'wx'});
  if(errors.length)throw errors.find(e=>e instanceof assert.AssertionError)??errors[0];
}

export async function providerQueuedWriteCrash(driver:ProviderDriver) {
  return withOwnedDriver(driver,[P.protocol,P.upstream,P.usage,P.usageQueue,P.restart],'usage-held-write-crash',async d=>{
    const gate=await d.holdUsageWrites();
    try {
      const request=turnRequest();await d.enqueue(successPlan());const initial=await d.exchange('/agent/turn',request);assert.equal(initial.status,200);
      const reached=await gate.reached();await d.evidence('usage-crash-real-held-window',reached);
      const before=await d.usage(),calls=(await d.calls()).length;assert.equal(before.records.length,0,'held first batch is not persisted');
      const stopped=await d.restart('SIGKILL');await d.evidence('usage-crash-actual-restart',stopped);
      const lock=await d.lockState();await d.evidence('usage-crash-actual-lock',lock);
      if(!stopped.started){assert.ok(lock.exists&&!lock.actualOwnerAlive&&lock.ownedDirectoryVerified);await d.evidence('usage-crash-manual-owned-lock-reclaim',await d.reclaimOwnedStaleLock());assert.equal((await d.restart('SIGTERM')).started,true);}
      const after=await d.usage();assert.equal(after.records.length,0,'actual pre-write kill loses unpersisted telemetry');
      assert.deepEqual((await d.exchange('/agent/turn',request)).body,initial.body);assert.equal((await d.calls()).length,calls,'completed session cache must not repurchase inference');
      await d.evidence('usage-crash-best-effort-result',{before,after,stopped,lock,limitation:'Manual owned stale-lock reclaim is explicitly recorded; this scenario does not satisfy strong automatic recovery or waive C2-012'});
    }finally{await gate.release();}
  });
}
export async function providerUsageTemporaryFiles(driver:ProviderDriver) {
  return run(driver,'usage-private-temporary-cleanup',async d=>{
    const first=await observedOne(d,successPlan());const sessions=await d.sessionFiles();
    const sessionBytes=await Promise.all(sessions.records.map(async path=>({path,bytes:await readFile(path)})));
    await d.evidence('usage-private-temporary-cleanup',await d.usageTemporaryCleanup());
    for(const prior of sessionBytes)assert.deepEqual(await readFile(prior.path),prior.bytes,'session replay file preserved');
    const count=(await d.calls()).length;assert.deepEqual((await d.exchange('/agent/turn',first.request)).body,first.response.body);assert.equal((await d.calls()).length,count);
  });
}
export async function providerUsageEntryMatrix(driver:ProviderDriver) {
  const variants:Record<string,Json>[]=[{}, {usageEnabled:false}, {usageEnabled:'False'}, {usageEnabled:'0'}, {usageEntry:'factory',factoryUsageSupplied:false,usageEnabled:true}, {usageEntry:'factory',factoryUsageSupplied:true,usageEnabled:false}];
  for(const [i,options] of variants.entries())await run(driver,`usage-entry-${i}`,async d=>{
    const profile=d.usageContract!;const expected=options.usageEntry==='factory'?options.factoryUsageSupplied===true:String(options.usageEnabled)!=='false';assert.equal(profile.enabled,expected);
    await d.enqueue(successPlan());assert.equal((await d.exchange('/agent/turn',turnRequest())).status,200);await d.settleUsage();const actual=await d.usage();assert.equal(actual.records.length,expected?1:0);
    if(!expected)assert.equal((await d.usageFiles()).files.length,0);
    await d.evidence('usage-entry-matrix',{options,profile,actual});
  },options);
}
export async function providerUsageConfigurationMatrix(driver:ProviderDriver) {
  const valid:Record<string,Json>[]=[{}, {usageMaxRecords:1,usageMaxBytes:4096,usageMaxAgeDays:1},{usageMaxRecords:10000,usageMaxBytes:16777216,usageMaxAgeDays:365}];
  const invalid:Record<string,Json>[]=[];
  for(const [key,lo,hi] of [['usageMaxRecords',1,10000],['usageMaxBytes',4096,16777216],['usageMaxAgeDays',1,365]] as const)
    for(const value of [lo-1,hi+1,lo+0.5,'not-a-number'])invalid.push({[key]:value});
  const errors:unknown[]=[];
  for(const [i,options] of [...valid,...invalid].entries())try{await run(driver,`usage-config-${i}`,async d=>{
    const bad=i>=valid.length,seen=await d.usageObservation();assert.equal(seen.snapshot.usage.initialized,!bad);await d.enqueue(successPlan());assert.equal((await d.exchange('/agent/turn',turnRequest())).status,200);await d.settleUsage();const actual=await d.usage();assert.equal(actual.records.length,bad?0:1);
    if(bad){const lines=(await d.logs()).flatMap(x=>x.split('\n'));assert.ok(lines.some(x=>x.includes('USAGE_STORE_UNAVAILABLE')));await d.evidence('usage-invalid-configuration',{options,seen,actual,diagnostic:'USAGE_STORE_UNAVAILABLE'});}
    else {assert.ok(actual.actualBytes<=Number(options.usageMaxBytes??2097152));await d.evidence('usage-valid-configuration',{options,seen,actual});}
  },options);}catch(e){errors.push(e);await driver.evidence(`usage-config-${i}-result`,{options,error:String(e),status:e instanceof PreparationBlocked?'BLOCKED':'FAIL'});}
  if(errors.length)throw errors.find(e=>!(e instanceof PreparationBlocked))??errors[0];
}
/** Full C2-018 finite procedure; true age expiration remains a separate case. */
export async function providerUsageConfiguration(driver:ProviderDriver) {
  const errors:unknown[]=[];
  for(const [name,body] of [['tokens',()=>runUsageCase('SR-BE-USG-013',driver)],['config',()=>providerUsageConfigurationMatrix(driver)],['temp',()=>providerUsageTemporaryFiles(driver)]] as const)try{await body();}catch(e){errors.push(e);await driver.evidence(`usage-configuration-${name}-result`,{error:String(e),status:e instanceof PreparationBlocked?'BLOCKED':'FAIL'});}
  if(errors.length)throw errors.find(e=>!(e instanceof PreparationBlocked))??errors[0];
}

export async function providerUsageRetention(driver:ProviderDriver){
  const errors:unknown[]=[];
  for(const mode of ['startup','write'] as const)try{await run(driver,`usage-retention-${mode}`,async d=>{
    await observedOne(d,successPlan());const input=await d.installUsageAgeFixture(mode==='startup'?-86400000:8000);await d.evidence('usage-explicit-persistent-age-input',input);
    const before=await d.usage();assert.ok(before.records.some(r=>r.attemptId===input.oldestEligibleRecordId));assert.equal((await d.restart('SIGTERM')).started,true);
    if(mode==='write'){
      const loaded=await d.usage();if(!loaded.records.some(r=>r.attemptId===input.oldestEligibleRecordId))throw new PreparationBlocked('Near-boundary old record expired during actual startup; write-time fixture not established');
      while(Date.now()<=Date.parse(input.expiresAt)+50)await new Promise(r=>setTimeout(r,Math.min(100,Math.max(1,Date.parse(input.expiresAt)+51-Date.now()))));
      const beforeWrite=await d.usage();if(!beforeWrite.records.some(r=>r.attemptId===input.oldestEligibleRecordId))throw new PreparationBlocked('Write-time retention prerequisite already expired/trimmed before actual new write');
      await d.enqueue(successPlan(19));assert.equal((await d.exchange('/agent/turn',turnRequest())).status,200);await d.settleUsage();
      await d.evidence('usage-expiration-write-real-clock',{input,beforeWrite,actualWallTime:new Date().toISOString(),actualFile:await d.usage()});
    }
    const final=await d.usage();assert.ok(!final.records.some(r=>r.attemptId===input.oldestEligibleRecordId));assert.equal(final.records.length,mode==='startup'?0:1);await d.evidence('usage-retention-actual-final',{mode,input,final});
  },{usageMaxAgeDays:1});}catch(error){errors.push(error);await driver.evidence(`usage-retention-${mode}-result`,{status:error instanceof PreparationBlocked?'BLOCKED':'FAIL',error:String(error)});}
  if(errors.length)throw errors.find(e=>!(e instanceof PreparationBlocked))??errors[0];
}
