import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { secondRoundRoot, secondRoundCases } from './scope.js';

type Row = Record<string, any>;
const digest=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const read=async(p:string)=>JSON.parse(await readFile(p,'utf8'));
const qaRoot=resolve(secondRoundRoot,'..');
const oldRoot='reports/acceptance/20261001-2716abd-business';
const signedRoots=['reports/acceptance/20261002-current-delivery','reports/followup/20261002-dispatched-kick-budget','reports/followup/20261002-first-round-observation-retest','reports/followup/20261002-kick-work-retest'];
const developerTopics:Record<string,string[]>={
 C1:['docs/c1-c2-delivery-20261001.md','docs/qa-media-scenarios-20261002.md'],
 C2:['docs/c1-c2-delivery-20261001.md','docs/qa-offline-model-entry-20261002.md'],
 'P0-01':['docs/second-round-execution-20261002.md'],
 'P0-02':['docs/second-round-execution-20261002.md','README.md'],
 'P0-03':['docs/final-enhancement-delivery-20261002.md'],
 'P0-04':['docs/final-enhancement-delivery-20261002.md'],
 'P0-05':['docs/final-enhancement-backend-20261002.md'],
 'P1-01':['docs/final-enhancement-measurement-20261002.md'],
 'P1-02':['docs/final-enhancement-delivery-20261002.md'],
 'P1-03':['docs/final-enhancement-backend-20261002.md'],
 'P1-04':['docs/final-enhancement-backend-20261002.md','docs/second-round-managed-rejection-20261002.md'],
 'P1-05':['docs/final-enhancement-measurement-20261002.md'],
 AUTH:['docs/second-round-execution-20261002.md'],
};
export function traceabilityTopic(id:string):string {
 const match=/^SR-(C[12]|P[01]-\d{2}|AUTH)-/.exec(id);
 assert.ok(match&&developerTopics[match[1]!],`unmapped requirement ${id}`);return match[1]!;
}
/** Every row keeps its own time/version. Availability of a row is not execution
 * or closure: the final report, not this early review, aggregates current runs. */
export async function buildDeliveryTraceability(input:{sutDirectory:string;outputDir:string;manifest:Row}) {
 const {sutDirectory,outputDir,manifest}=input;
 const sourceIndex:Record<string,{sha256:string;bytes:number;lines:number}>={};
 const index=async(path:string)=>{
  if(!sourceIndex[path]) {const b=await readFile(path);sourceIndex[path]={sha256:digest(b),bytes:b.length,lines:b.toString('utf8').split('\n').length};}
  return {path,...sourceIndex[path]};
 };
 const requirements=await read(resolve(secondRoundRoot,'requirements/catalog.json')) as Row[],cases=await secondRoundCases();
 assert.equal(requirements.length,73);assert.equal(new Set(requirements.map(r=>r.id)).size,73);
 const scope=await read(resolve(secondRoundRoot,'config/execution-scope.json'));
 const contracts=await read(resolve(secondRoundRoot,'requirements/contract-mappings.json')) as Row[];
 const pending=[];
 for(const root of signedRoots) {
  const report=await index(resolve(qaRoot,root,'report.md'));
  const path=resolve(qaRoot,root,'pending-items.json');
  let contents:unknown;
  try {contents=await read(path); await index(path);} catch(e) {if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;contents={note:'This signed report has no separate pending-items; its report and final later pending list remain the sources.'};}
  pending.push({report,pendingPath:path,contents,disposition:scope.firstRoundDisposition,owner:'QA evidence; engineering treatment already decided; no repeated request to user'});
 }
 const current=await Promise.all(cases.map(async c=>{
  const path=resolve(dirname(outputDir),c.id,'result.json');
  let result:unknown;
  try{result=await read(path);await index(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  return {id:c.id,requirements:c.requirements,automation:c.automation??null,mode:c.mode,evidencePath:path,
   statusAtReview:result?(result as Row).status:'NOT_RUN_AT_REVIEW',result:result??null,
   ownership:'QA independent execution; final issued report must refresh the mapping after all cases settle'};
 }));
 const rows=[];
 for(const r of requirements) {
  const linked=cases.filter(c=>c.requirements.includes(r.id));assert.ok(linked.length,`no cases: ${r.id}`);
  const locations=[];
  for(const loc of r.sourceLocations??[]) {
   const file=await index(resolve(secondRoundRoot,loc.path));
   assert.ok(loc.startLine>=1&&loc.endLine>=loc.startLine&&loc.endLine<=file.lines,`invalid source location ${r.id}`);
   locations.push({...loc,...file});
  }
  assert.ok(locations.length,`missing source ${r.id}`);
  const topic=traceabilityTopic(r.id);
  rows.push({id:r.id,title:r.title,expectation:r.expectation,nature:r.nature,sourceLocations:locations,
   approvalSources:await Promise.all((r.approvalSources??[]).map((p:string)=>index(resolve(secondRoundRoot,p)))),
   sourceContractHistory:r.contractSources??[],contractMappings:contracts.filter(c=>c.requirements.includes(r.id)),
   developerMaterials:await Promise.all(developerTopics[topic]!.map(p=>index(resolve(sutDirectory,p)))),
   developerEvidenceLimit:'Delivery/developer self-test references describe the frozen change, never substitute for independent QA execution.',
   candidate:{sutRevision:manifest.sutRevision,qaRevision:manifest.qaRevision,runId:manifest.runId},
   currentCases:current.filter(c=>c.requirements.includes(r.id)),
   disposition:topic==='P0-01'?'Read-only historical delivery obligation; does not reopen first-round remediations or add product denominator.':
    topic==='AUTH'?'Current explicit execution scope; real paid provider and production remain separately excluded.':'Current second-round case result is authoritative only for its own frozen version; uncovered variants stay BLOCKED.',
   owner:'QA verifies current cases and retains evidence; development owns product corrections; only changed business guarantees require owner decision'});
 }
 const original=await read(resolve(qaRoot,'requirements/catalog.json')) as Row[];
 const originalCases:Row[]=[];
 for(const file of (await readdir(resolve(qaRoot,'cases'))).filter(f=>f.endsWith('.json'))) {
  const value=await read(resolve(qaRoot,'cases',file));if(Array.isArray(value))originalCases.push(...value);
 }
 const historical=await read(resolve(qaRoot,oldRoot,'adjudicated-results.json'));
 await index(resolve(qaRoot,oldRoot,'adjudicated-results.json'));
 const originals=original.map(r=>({id:r.id,title:r.title,expectation:r.expectation,source:r.source,scope:r.scope,
  cases:originalCases.filter(c=>c.requirements?.includes(r.id)).map(c=>({id:c.id,automation:c.automation??null,mode:c.mode})),
  historicalResults:historical.results.filter((v:Row)=>v.requirements?.includes(r.id)),
  historicalBinding:historical.basis,historicalEvidence:resolve(qaRoot,oldRoot,'adjudicated-results.json'),
  historicalArchiveIndex:historical.sourceIndex,
  currentDisposition:r.scope==='candidate'?'C1/C2 selected in current scope; see 73-row mapping':r.scope==='release'?'Production not assessed':
   'Original expectation retained. First-round result is historical only; four subsequent reports and exact pending dispositions govern follow-up. No inherited current PASS.',
  owner:r.scope==='release'?'Separate production assessment':'QA evidence and development remediation; decided direction is not a waiver'}));
 assert.ok(originals.every(r=>r.cases.length), 'every original requirement retains a test entry');
 const document={reviewedAt:new Date().toISOString(),kind:'traceability-completeness review; not product conformity conclusion',
  currentCandidate:manifest,counts:{originalRequirements:originals.length,secondRoundRequirements:rows.length,currentCases:current.length},
  firstRoundSignedReports:pending,firstRoundDisposition:scope.firstRoundDisposition,excluded:scope.excluded,
  currentRequirements:rows,originalRequirements:originals,sourceIndex,
  conclusion:'Every scoped requirement has versioned source, approved expectation, developer material, independent case/evidence destination and responsible next action. No historical FAIL/BLOCKED or human obligation is closed by this mapping.'};
 const path=resolve(outputDir,'delivery-traceability.json');await writeFile(path,JSON.stringify(document,null,2)+'\n');
 const md=['# 独立交付追踪核查','',`核查时间 ${document.reviewedAt}。此表核对材料完整性；不签发产品通过。完整逐项证据、原 128 条要求及遗留原文见 [JSON](delivery-traceability.json)。`,
  '', '| 需求 | 原预期 | 独立用例与核查时状态 | 责任/去向 |','| --- | --- | --- | --- |',
  ...rows.map(r=>`| ${r.id} ${r.title} | ${r.expectation.replaceAll('|','／')} | ${r.currentCases.map(c=>`${c.id}: ${c.statusAtReview}`).join('<br>')} | QA独立执行／研发修复；已有决定不重问 |`),
  '', '四份历史签发报告的版本与 FAIL/BLOCKED 保留；本次运行尚未到达的用例为 NOT_RUN_AT_REVIEW，最终报告需由实际结果重建。真实人工体验、严格五秒后续安排、真实提供方与上线评估按已批准边界分别保留。',''];
 await writeFile(resolve(outputDir,'delivery-traceability.md'),md.join('\n'));
 return {path,counts:document.counts,sourceIndex,conclusion:document.conclusion};
}
