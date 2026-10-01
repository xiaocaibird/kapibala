import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exec } from '../../harness/process.js';
import { secondRoundRoot } from './scope.js';
import type { QaEnvironment } from '../../harness/environment.js';
import type { RoundResult } from './result.js';
import { BlockedError } from '../../harness/security.js';
import { readmeIsolatedDelivery } from './delivery-isolated.js';
import { buildDeliveryTraceability } from './delivery-traceability.js';

const signedReports: Record<string,string>={
  'reports/acceptance/20261002-current-delivery/report.md':'aa119fea808ee72d38eb21ef7f0022f3d7c36c69014dd204bb6d3bd5449d17c2',
  'reports/followup/20261002-dispatched-kick-budget/report.md':'acfecfffa8e05140f6198aa4bb23f50a0090874fb09909908e359af53e444e9f',
  'reports/followup/20261002-first-round-observation-retest/report.md':'abea5db2561b7bac53ab12c16967893321d739580c9ea5aa669555a71eb6a07d',
  'reports/followup/20261002-kick-work-retest/report.md':'f3326ca4eff572d4b0134bff70dcfb450c6d2b3dcf90506af99dc9758ddcf17a',
};
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
function businessAssertion(error:unknown):assert.AssertionError|undefined {
  if(error instanceof assert.AssertionError)return error;
  if(error instanceof AggregateError)for(const child of error.errors){const found=businessAssertion(child);if(found)return found;}
  return undefined;
}
type MutationName='audit-fail-bypass'|'same-key-repeat-audit';
const mutationTests={
  'audit-fail-bypass':'guard effects: audit fail creates no message/key and makes no remote send',
  'same-key-repeat-audit':'guard effects: same key reuses original identity without a second audit or remote send',
} as const;
function needEvidence(value:unknown,message:string):asserts value {
  if(!value)throw new BlockedError(`Mutation review evidence incomplete: ${message}`);
}
function tapSummary(tap:string,passes:number,failures:number) {
  for(const [name,value] of Object.entries({tests:2,pass:passes,fail:failures,cancelled:0,skipped:0,todo:0}))
    needEvidence(new RegExp(`^# ${name} ${value}$`,'m').test(tap),`exact TAP ${name}=${value}`);
  needEvidence(!/^Bail out!/m.test(tap),'TAP bailout cannot count as a detected business mutation');
}
function subtest(tap:string,title:string) {
  const marker=`# Subtest: ${title}\n`,start=tap.indexOf(marker);
  needEvidence(start>=0&&tap.indexOf(marker,start+marker.length)<0,`one named subtest: ${title}`);
  const next=tap.indexOf('# Subtest:',start+marker.length),block=tap.slice(start,next<0?undefined:next);
  const result=block.match(/^(not ok|ok) \d+ - (.+)$/m);
  needEvidence(result&&result[2]===title,'named subtest result and title must correspond');
  return {block,passed:result[1]==='ok'};
}
function diagnostic(block:string,guard:'audit-fail'|'same-key') {
  const values:Record<string,unknown>[]=[];
  for(const line of block.split('\n'))if(line.startsWith('# {')) {
    let value:unknown;
    try {value=JSON.parse(line.slice(2));} catch {throw new BlockedError('Mutation JSON diagnostic cannot be parsed');}
    if(value&&typeof value==='object'&&(value as Record<string,unknown>).guard===guard)values.push(value as Record<string,unknown>);
  }
  needEvidence(values.length===1,`one actual ${guard} count diagnostic in its own subtest`);
  const value=values[0]!;
  for(const key of ['audits','remoteSends','messages','keys'])needEvidence(Number.isSafeInteger(value[key])&&Number(value[key])>=0,`${guard}.${key}`);
  const db=block.match(/^# Independent database: (kapibala_test_[a-f0-9]+)$/m);
  needEvidence(db,'actual independent database identity accompanying the diagnostic');
  return {value,database:db[1]!};
}
function sameIdentity(value:Record<string,unknown>) {
  needEvidence(Array.isArray(value.results)&&value.results.length===2,'two actual tool result records for same-key');
  const results=value.results as Record<string,unknown>[];
  needEvidence(results.every(r=>r&&typeof r==='object'&&typeof r.clientMsgId==='string'&&r.clientMsgId.length>0),'actual client message IDs');
  assert.equal(results[0]!.clientMsgId,results[1]!.clientMsgId,'same-key diagnostic must concern the same logical message');
  return results[0]!.clientMsgId;
}
function baselineCounts(value:Record<string,unknown>,guard:'audit-fail'|'same-key') {
  assert.equal(value.audits,1);
  for(const key of ['remoteSends','messages','keys'])assert.equal(value[key],guard==='audit-fail'?0:1);
  if(guard==='audit-fail')assert.equal(value.errorCode,'AUDIT_REJECTED');
  else sameIdentity(value);
}
/** Independent review of the delivered TAP and JSON diagnostics. No product
 * code is imported/executed, and historic results never become current runs. */
export function reviewMutationDiagnostics(name:MutationName,baseline:string,changed:string,testSource:string) {
  tapSummary(baseline,2,0);tapSummary(changed,1,1);
  const baselineRows=[];
  for(const [kind,title] of Object.entries(mutationTests) as [MutationName,string][]) {
    const row=subtest(baseline,title);assert.equal(row.passed,true);
    const guard=kind==='audit-fail-bypass'?'audit-fail':'same-key';
    const observed=diagnostic(row.block,guard);baselineCounts(observed.value,guard);
    baselineRows.push({kind,...observed});
  }
  const failed=subtest(changed,mutationTests[name]);assert.equal(failed.passed,false);
  const otherName:MutationName=name==='audit-fail-bypass'?'same-key-repeat-audit':'audit-fail-bypass';
  const other=subtest(changed,mutationTests[otherName]);assert.equal(other.passed,true);
  const otherGuard=otherName==='audit-fail-bypass'?'audit-fail':'same-key';
  const unaffected=diagnostic(other.block,otherGuard);baselineCounts(unaffected.value,otherGuard);
  for(const [field,value] of Object.entries({failureType:'testCodeFailure',code:'ERR_ASSERTION',name:'AssertionError',operator:'strictEqual'}))
    needEvidence(new RegExp(`^  ${field}: '${value}'$`,'m').test(failed.block),`named business failure ${field}`);
  const stack=failed.block.slice(failed.block.indexOf('  stack: |-'));
  const site=stack.match(/automation-guard-effects\.test\.ts:(\d+):(\d+)/);
  needEvidence(site,'actual named failure stack location');
  const lineNumber=Number(site[1]),line=testSource.split('\n')[lineNumber-1];
  needEvidence(line,'failure location resolves to pinned developer test source');
  const guard=name==='audit-fail-bypass'?'audit-fail':'same-key';
  const observed=diagnostic(failed.block,guard);
  assert.notEqual(observed.database,unaffected.database,'two guard tests use distinct recorded databases');
  if(name==='audit-fail-bypass') {
    needEvidence(/\.error_code,\s*"AUDIT_REJECTED"/.test(line),'failure is the specific audit-rejection assertion, not fixture setup');
    needEvidence(/^  expected: 'AUDIT_REJECTED'$/m.test(failed.block)&&/^  actual: ~$/m.test(failed.block),'actual audit assertion expected/actual');
    assert.equal(observed.value.errorCode,null);assert.equal(observed.value.audits,1);
    assert.ok(Number(observed.value.remoteSends)>0,'developer counter observed an actual forbidden HTTP send');
    assert.ok(Number(observed.value.messages)>0&&Number(observed.value.keys)>0,'developer DB diagnostics independently show forbidden durable effects');
  } else {
    needEvidence(/assert\.equal\(f\.audits\.length,\s*1,\s*"same key must not repeat audit"\)/.test(line),'failure is the specific repeated-audit business assertion');
    needEvidence(/^  expected: 1$/m.test(failed.block),'same-key expected count is one');
    const actual=failed.block.match(/^  actual: (\d+)$/m);needEvidence(actual,'same-key actual numeric count');
    assert.equal(Number(actual[1]),observed.value.audits);assert.ok(Number(observed.value.audits)>1);
    sameIdentity(observed.value);
    for(const key of ['remoteSends','messages','keys'])assert.equal(observed.value[key],1,'this mutation repeats audit while preserving one logical send identity');
    const start=testSource.indexOf(`test("${mutationTests[name]}"`);
    needEvidence(start>=0,'pinned same-key developer test source');
    const body=testSource.slice(start);
    needEvidence((body.match(/const id = await f\.start\(\)/g)??[]).length===1&&/f\.steps\(id\)/.test(body),'one actual run in the pinned developer test');
    needEvidence(/f\.turns\.length <= 2/.test(body)&&/idempotency_key: "reused-key"/.test(body),'both turn proposals use the same declared key');
  }
  return {name,testName:mutationTests[name],baseline:baselineRows,changed:observed,unaffected,
    assertion:{file:'tests/integration/automation-guard-effects.test.ts',lineNumber,line,sourceSha256:sha(testSource)},
    evidenceLayer:'delivered developer TAP plus JSON counters and pinned test source, independently reviewed; no current SUT execution',
    limits:'Diagnostics expose actual aggregate HTTP/DB counts and repeated tool identity, not a full raw transport capture. Run/key correlation is checked against the pinned single-run test body; it is not inferred from aggregate counts alone.'};
}
export async function runDeliveryCase(caseId:string,input:{sutDirectory:string;outputDir:string;manifest:Record<string,unknown>;qa?:QaEnvironment}):Promise<RoundResult> {
  const {sutDirectory,outputDir,manifest,qa}=input;
  const evidence=resolve(outputDir,'delivery-evidence.json');
  const uncoveredVariants:string[]=[];
  const facts:Record<string,unknown>={caseId,reviewedAt:new Date().toISOString(),kind:'QA independent delivery evidence review'};
  if(caseId==='SR-BE-DEL-001'||caseId==='SR-BE-DEL-002') {
    const originals=[];
    for(const [file,expected] of Object.entries(signedReports)) {
      const bytes=await readFile(resolve(secondRoundRoot,'..',file));assert.equal(sha(bytes),expected,'historical signed report must remain immutable');
      originals.push({file,sha256:expected,bytes:bytes.length});
    }
    const scope=JSON.parse(await readFile(resolve(secondRoundRoot,'config/execution-scope.json'),'utf8'));
    facts.originals=originals;facts.disposition=scope.firstRoundDisposition;
    facts.exclusions=scope.excluded;
    const diff=await exec('git',['diff','--name-status','7d53ee1f054961c9c997ff79dcb30e5a7e89ac46',String(manifest.sutRevision),'--',':(exclude)qa-acceptance'],{cwd:sutDirectory,maxBuffer:5*1024*1024});
    facts.currentProductDiff=diff.stdout;facts.historyInterpretation='First-round historical FAIL/BLOCKED remain historical. Work-budget five-case pass closes only its actual fixed-source sample; new enhancements do not waive original limitations.';
    if(caseId.endsWith('001')) facts.impactMap={media:['C1','media migration/storage/lifecycle'],model:['C2','P1-05'],
      frontend:['P0-03','P0-04','P1-02'],guards:['P0-05','P1-04'],diagnostics:['P1-03'],timeline:['P1-01'],knownLocalPolicyBudgetFix:['P1-04 crossed with original kick work/settlement budget']};
    if(caseId==='SR-BE-DEL-001')facts.requirementTraceability=await buildDeliveryTraceability({sutDirectory,outputDir,manifest});
  } else if(caseId==='SR-BE-DEL-003') {
    const original=await readFile(resolve(sutDirectory,'docs/original-interview-question.md'));
    assert.equal(sha(original),'c837475ae6b6564bc46c2e6c7f17756e375ec903cf67938a438ef81c18ec9c75');
    assert.equal((await exec('git',['rev-parse','HEAD'],{cwd:sutDirectory})).stdout.trim(),manifest.sutRevision);
    assert.equal((await exec('git',['status','--porcelain','--untracked-files=all'],{cwd:sutDirectory})).stdout.trim(),'');
    facts.candidate=manifest;facts.originalSha256=sha(original);facts.lockSha256=sha(await readFile(resolve(sutDirectory,'package-lock.json')));
    facts.evidenceLayers=['historical developer evidence is input only','current offline provider actual wire protocol','current real paid provider excluded until separate authority'];
  } else if(caseId==='SR-BE-DEL-004') {
    assert.ok(qa,'actual owned environment required');
    const install=manifest.installation as {exitCode?:number;evidence?:string};
    const build=manifest.build as {exitCode?:number;evidence?:string};
    assert.equal(install?.exitCode,0,'fresh npm ci must have completed');assert.equal(build?.exitCode,0);
    await qa.api.login();const health=await qa.api.get('/api/health');assert.equal(health.status,200);
    const accounts=await qa.api.accounts();assert.ok(accounts.length);
    const created=await qa.api.createGroup(1);assert.equal(created.group.status,'active');
    facts.installation=install;facts.build=build;facts.health=health.body;facts.accounts=accounts;facts.group=created.group;
    facts.resources=await qa.ownedStorage().database;facts.cleanup='runner finally closes this exact QA environment; resource cleanup failure downgrades this case';
    try {
      facts.publicReadmeEntry=await readmeIsolatedDelivery({sutDirectory,outputDir,revision:String(manifest.sutRevision),qa});
    } catch(error) {
      facts.publicReadmeEntryError=String(error);
      await writeFile(evidence,JSON.stringify(facts,null,2)+'\n');
      const assertion=businessAssertion(error);if(assertion)throw assertion;
      uncoveredVariants.push(`QA自有环境安装/迁移/API通过；公开README入口或其精确清理尚未形成完整通过证据：${String(error)}`);
    }
  } else if(caseId.startsWith('SR-BE-MUT-')) {
    const base=resolve(sutDirectory,'docs/evidence/final-enhancement-backend-20261002/mutations');
    const m=JSON.parse(await readFile(resolve(base,'manifest.json'),'utf8'));
    assert.equal(m.temporaryCopyRemoved,true);assert.equal(m.credentialsIncluded,false);
    const baseline=await readFile(resolve(base,'baseline.tap'),'utf8');
    assert.match(baseline,/# pass 2/);assert.match(baseline,/# fail 0/);
    facts.developerManifest=m;facts.baseline={sha256:sha(baseline),text:baseline};
    if(caseId==='SR-BE-MUT-003') {
      const violation=await readFile(resolve(base,'controlled-boundary-violation.log'),'utf8');
      const normal=await readFile(resolve(base,'../boundaries.log'),'utf8');
      const packageJson=JSON.parse(await readFile(resolve(sutDirectory,'package.json'),'utf8'));
      assert.match(packageJson.scripts.typecheck,/verify:boundaries/);
      assert.match(violation,/controlled-boundary-violation/);assert.match(violation,/direct write to an automation-owned table/);
      const gateway=await readFile(resolve(sutDirectory,'apps/server/src/modules/gateway/index.ts'),'utf8');
      assert.match(gateway,/requestGroupAgentCancellation\(tx,\s*(?:groupId|id)\)/);
      facts.controlledViolation=violation;facts.normal=normal;
      facts.limit='Independent static delivery review; limited SQL literal scanner is not whole-program ownership proof. Transaction failure is separately tested.';
    } else {
      const name=caseId.endsWith('001')?'audit-fail-bypass':'same-key-repeat-audit';
      const patch=JSON.parse(await readFile(resolve(base,`${name}.patch.json`),'utf8'));
      const tap=await readFile(resolve(base,`${name}.tap`),'utf8');
      const entry=m.records.find((r:{name:string})=>r.name===name);
      needEvidence(entry,'named mutation manifest record');
      assert.equal(entry.exitCode,1);assert.match(tap,/# fail 1/);assert.match(tap,/# pass 1/);assert.match(tap,/ERR_ASSERTION/);
      assert.equal(patch.file,'apps/server/src/modules/automation/tool-execution.ts');
      const original=(await exec('git',['show',`${m.revision}:${patch.file}`],{cwd:sutDirectory,maxBuffer:4*1024*1024})).stdout;
      assert.equal(sha(original),m.records.find((r:{name:string})=>r.name==='baseline').sourceSha256);
      assert.equal(original.split(patch.from).length,2,'mutation must have exactly one intended site');
      assert.equal(sha(original.replace(patch.from,patch.to)),entry.sourceSha256);
      const baselineEntry=m.records.find((r:{name:string})=>r.name==='baseline');
      assert.deepEqual(entry.command,baselineEntry.command,'only the specified product mutation changes; same named developer test command');
      assert.equal(entry.detectedBy,mutationTests[name]);
      const testFile='tests/integration/automation-guard-effects.test.ts';
      const testSource=(await exec('git',['show',`${m.revision}:${testFile}`],{cwd:sutDirectory,maxBuffer:4*1024*1024})).stdout;
      facts.patch=patch;facts.mutation={entry,tap,sha256:sha(tap)};
      try {facts.businessDetection=reviewMutationDiagnostics(name,baseline,tap,testSource);}
      catch(error) {facts.incompleteOrInvalidDetection=String(error);await writeFile(evidence,JSON.stringify(facts,null,2)+'\n');throw error;}
      facts.resultScope='Current QA independently checked the delivered historical mutation, exact source and patch, specified business assertion and cleanup; this is not a new current-SUT runtime PASS.';
    }
  } else throw new Error(`Delivery case needs another driver: ${caseId}`);
  await writeFile(evidence,JSON.stringify(facts,null,2)+'\n');
  const variants:RoundResult['variants']=[{id:caseId==='SR-BE-DEL-004'?'qa-environment-install-migrate-api':'independent-delivery-review',status:'PASS',evidence:[evidence]}];
  if(caseId==='SR-BE-DEL-004'&&facts.publicReadmeEntry)variants.push({id:'public-readme-entry-and-exact-cleanup',status:'PASS',evidence:[(facts.publicReadmeEntry as {evidencePath:string}).evidencePath]});
  return {caseId,status:uncoveredVariants.length?'BLOCKED':'PASS',variants,uncoveredVariants};
}
