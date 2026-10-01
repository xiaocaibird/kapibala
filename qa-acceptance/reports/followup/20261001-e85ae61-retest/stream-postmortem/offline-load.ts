// Pure generated data only; no sockets, databases, child processes or product.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertUniqueMessages, assertMessageSubset, assertReceiptGroup, assertHistoryTextHashes, messageIdentity } from './harness/stream-invariants.js';
const count=8208;
const items=Array.from({length:count},(_,i)=>({msgId:`slow-stream-${i}`,clientMsgId:null,text:`slow-stream-${i}:`+'x'.repeat(128),sentAt:'2026-10-01T00:00:00.000Z'}));
const frames=items.map((m,i)=>({seq:i+1,type:'message',msgId:m.msgId,groupId:'self-only-group',isOwn:false}));
const expected=new Map(items.map((m)=>[messageIdentity(m),{text:m.text,sentAt:m.sentAt}]));
const hashes=new Map(items.map((m)=>[m.msgId,createHash('sha256').update(m.text).digest('hex')]));
const cpuStart=process.cpuUsage(),started=performance.now();
let receiptSamples=0,receiptItems=0,historySamples=0,historyItems=0;
for(let end=32;end<count+32;end+=32){
 const selected=frames.slice(0,Math.min(end,count));
 // Same complete sample remains checked twice, as the original read + invariant.
 for(let pass=0;pass<2;pass++){assertReceiptGroup(selected,'self-only-group',false);receiptSamples++;receiptItems+=selected.length;}
}
for(let end=50;end<count+50;end+=50){
 const page=items.slice(0,Math.min(end,count));
 assertUniqueMessages(page);assertMessageSubset(page,expected);historySamples++;historyItems+=page.length;
}
assertHistoryTextHashes(items,hashes);
const elapsedMs=performance.now()-started,cpu=process.cpuUsage(cpuStart);
const corrupted=[...items];corrupted[0]={...items[0]!,text:'earliest item corrupted after prior validation'};
assert.throws(()=>assertMessageSubset(corrupted,expected),/text differs/);
const record={kind:'qa-tool-only-offline-load',at:new Date().toISOString(),productExecuted:false,networkOpened:false,
 generatedMessages:count,receiptSamples,receiptItemsChecked:receiptItems,historySamples,cumulativeHistoryItemsChecked:historyItems,
 fullTextHashesChecked:count,elapsedMs,cpuMicroseconds:cpu,negativeEarliestItemDetected:true,
 limitation:'One local synthetic QA-helper measurement only, not SUT performance or a production SLA'};
await writeFile(fileURLToPath(new URL('./offline-load.json',import.meta.url)),JSON.stringify(record,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(record));
