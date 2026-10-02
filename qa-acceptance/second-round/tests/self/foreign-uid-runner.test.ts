import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertForeignQaClean, foreignRunnerArguments, foreignSubobligationResults, writeForeignSupplementReport } from '../../harness/foreign-uid-runner.js';
import type { ForeignUidSupplement } from '../../harness/foreign-uid.js';

const ids=['linux-owned-positive-control','SR-C2-008-foreign-uid-record','SR-BE-USG-006-safe-temp-positive-control','SR-BE-USG-006-foreign-uid-preservation'];
const passed=():ForeignUidSupplement=>({status:'PASS',cleanupErrors:[],variants:ids.map(id=>({id,status:'PASS',evidence:[`/owned/${id}.json`]}))});
test('foreign supplement parser rejects incomplete SHA, duplicates and broadened arguments',()=>{
 const valid=['--target','/owned/target.json','--authorization','/owned/auth.json','--revision','a'.repeat(40)];assert.equal(foreignRunnerArguments(valid).revision,'a'.repeat(40));
 for(const invalid of [valid.slice(0,-1),[...valid,'--cases','all'],['--target','x','--target','y','--revision','a'.repeat(40)],[...valid.slice(0,-1),'main']])assert.throws(()=>foreignRunnerArguments(invalid),/\[BLOCKED\]/);
});
test('QA source must be committed; only new run reports are exempt',()=>{
 assert.doesNotThrow(()=>assertForeignQaClean('?? qa-acceptance/second-round/reports/runs/uuid/report.md\0'));
 for(const dirty of [' M qa-acceptance/second-round/harness/foreign-uid.ts\0','?? qa-acceptance/second-round/harness/new.ts\0',' M qa-acceptance/second-round/reports/runs/old/report.md\0','R  qa-acceptance/second-round/reports/runs/a\0another-path\0'])assert.throws(()=>assertForeignQaClean(dirty),/\[BLOCKED\]/);
});
test('sub-obligation aggregation preserves failure, missing variants and cleanup blocks',()=>{
 assert.equal(foreignSubobligationResults(passed()).verdict,'PASS');
 const partial=passed();partial.variants.pop();assert.equal(foreignSubobligationResults(partial).verdict,'BLOCKED');assert.equal(foreignSubobligationResults(partial).rows.at(-1)?.status,'NOT_RUN');
 partial.variants[0]!.status='FAIL';partial.cleanupErrors.push('cleanup');assert.equal(foreignSubobligationResults(partial).verdict,'FAIL');
 const dup=passed();dup.variants.push(dup.variants[0]!);assert.throws(()=>foreignSubobligationResults(dup),/Duplicate/);
 const hollow=passed();hollow.variants[0]!.evidence=[];assert.throws(()=>foreignSubobligationResults(hollow),/actual evidence/);
});
test('supplement report is archive-compatible and cannot issue whole-case PASS',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'qa-foreign-report-'));
 try{
  for(const name of ['manifest.json','target.json','authorization.json','cleanup-verification.json'])await writeFile(join(directory,name),'{}\n');await writeFile(join(directory,'events.ndjson'),'{}\n');
  const input=passed();input.variants[1]!.status='FAIL';input.variants[1]!.reason='<actual> violation';input.cleanupErrors.push('owned resource still running');
  const report=await writeForeignSupplementReport(directory,{runId:'self-only',sutRevision:'a'.repeat(40),qaRevision:'b'.repeat(40)},input);
  assert.equal(report.subObligationVerdict,'FAIL');assert.deepEqual(report.wholeCaseVerdicts,{'SR-C2-008':'NOT_ASSESSED_BY_SUPPLEMENT','SR-BE-USG-006':'NOT_ASSESSED_BY_SUPPLEMENT'});
  const xml=await readFile(join(directory,'junit.xml'),'utf8');assert.ok(xml.includes('tests="5"'));assert.ok(xml.includes('&lt;actual&gt; violation'));assert.ok(xml.includes('resource-cleanup-1'));
  const hashes=JSON.parse(await readFile(join(directory,'report-hashes.json'),'utf8'));for(const [name,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(join(directory,name))).digest('hex'),hash);
  assert.ok(hashes['manifest.json']);assert.ok(hashes['results.json']);assert.ok(hashes['cleanup-verification.json']);
 }finally{await rm(directory,{recursive:true});}
});
