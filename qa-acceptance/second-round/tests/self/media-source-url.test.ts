import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaUrlRejectionMatrix } from '../../harness/media-source-url-cases.js';
const source='http://127.0.0.1:41234/media/denied-url-controls';
test('URL negative partitions isolate same-origin path and userinfo guards',()=>{
 const rows=mediaUrlRejectionMatrix(source),map=new Map(rows.map(row=>[row.id,row]));
 assert.equal(rows.length,18);assert.equal(map.size,rows.length);
 assert.equal(new URL(map.get('same-origin-nonmedia-path')!.url).origin,new URL(source).origin);
 const user=new URL(map.get('same-origin-userinfo')!.url);assert.equal(user.origin,new URL(source).origin);assert.equal(user.pathname,new URL(source).pathname);assert.ok(user.username&&user.password);
 assert.equal(map.get('raw-dot-segment-original')!.url,`${source}/../escape`);
 assert.ok(rows.every(row=>!row.url.includes('/events')&&!row.url.includes('/groups')));
});
test('raw control/traversal negatives genuinely normalize onto an existing source',()=>{
 const rows=mediaUrlRejectionMatrix(source),normalizing=['raw-backslash-traversal','raw-tab-inside-id','raw-cr-inside-id','raw-lf-inside-id','leading-cr','trailing-lf','encoded-dot-segment'];
 for(const id of normalizing){const raw=rows.find(row=>row.id===id)!.url;assert.notEqual(raw,source);assert.equal(new URL(raw).href,source,`The ${id} input must expose normalization masking rather than a foreign-origin rejection`);}
 const nul=rows.find(row=>row.id==='raw-nul-inside-id')!;assert.ok(nul.url.includes('\0'));assert.equal(rows.at(-1)?.id,nul.id);
 assert.ok(rows.find(row=>row.id==='encoded-forward-slash')!.url.includes('%2F'));assert.ok(rows.find(row=>row.id==='encoded-backslash')!.url.includes('%5C'));
});
