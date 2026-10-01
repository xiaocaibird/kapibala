import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, readFile, writeFile, symlink, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sentinelSnapshot, ownedCleanupDirectory } from '../../harness/delivery-recovery.js';
import { verifyLegacyLedger } from '../../harness/delivery-migration.js';
import { secondRoundRoot } from '../../harness/scope.js';
import { createHash } from 'node:crypto';
test('legacy ledger verifies actual historical bytes and refuses guessed/backfilled entries',async()=>{
 const migrations=resolve(secondRoundRoot,'../../db/migrations');
 const names=['001_core.sql','002_automation.sql','003_agent_activity.sql','004_message_event_order.sql','005_group_metadata.sql','006_group_directory.sql','007_message_sent_observation.sql','008_message_sent_receipts.sql'];
 const ledger=await Promise.all(names.map(async(name,i)=>({version:i+1,name,checksum:createHash('sha256').update(await readFile(resolve(migrations,name))).digest('hex'),checksum_origin:'executed'})));
 verifyLegacyLedger(ledger);
 assert.throws(()=>verifyLegacyLedger(ledger.slice(0,7)),assert.AssertionError);
 assert.throws(()=>verifyLegacyLedger(ledger.map((r,i)=>i? r:{...r,checksum_origin:'legacy_schema_baseline'})),assert.AssertionError);
 assert.throws(()=>verifyLegacyLedger(ledger.map((r,i)=>i? r:{...r,checksum:'0'.repeat(64)})),assert.AssertionError);
});
test('exact owned cleanup unlinks foreign link without traversing it; changed marker is retained',async()=>{
 const parent=resolve(secondRoundRoot,'..','.runtime','self');await mkdir(parent,{recursive:true});
 const root=await mkdtemp(resolve(parent,'delivery-recovery-'));
 try {
  const a=await ownedCleanupDirectory(root,`delivery-owned-${randomUUID()}`),b=await ownedCleanupDirectory(root,`delivery-foreign-${randomUUID()}`);
  await writeFile(resolve(b.path,'sentinel'),'must remain');await symlink(b.path,resolve(a.path,'foreign'));
  const before=await sentinelSnapshot(b.path);await a.remove();assert.deepEqual(await sentinelSnapshot(b.path),before);
  await assert.rejects(lstat(a.path),{code:'ENOENT'});
  await writeFile(resolve(b.path,'.qa-delivery-owner.json'),'{}');await assert.rejects(b.remove(),assert.AssertionError);
  assert.equal(await readFile(resolve(b.path,'sentinel'),'utf8'),'must remain');
 } finally {await rm(root,{recursive:true,force:true});}
});

test('migration result retains a real assertion failure when cleanup is also blocked',async()=>{
 const {classifyMigrationError}=await import('../../harness/media-migration-case.js');
 const {BlockedError}=await import('../../../harness/security.js');
 const violation=new assert.AssertionError({actual:2,expected:1,operator:'strictEqual'});
 assert.equal(classifyMigrationError(new AggregateError([violation,new BlockedError('cleanup')])),'FAIL');
 assert.equal(classifyMigrationError(new AggregateError([new BlockedError('missing premise')])),'BLOCKED');
});
