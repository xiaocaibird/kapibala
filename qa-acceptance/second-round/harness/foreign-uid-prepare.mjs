// Container-only dependency preparation. No product entry is executed here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
assert.equal(process.version,'v24.21.0');
const lock=()=>createHash('sha256').update(readFileSync('/work/source/package-lock.json')).digest('hex');
const before=lock();
function run(command,args){const r=spawnSync(command,args,{stdio:'inherit',cwd:'/work/source',timeout:250000});if(r.error)throw r.error;assert.equal(r.signal,null);assert.equal(r.status,0);}
run('npm',['install','--prefix','/work/npm','--package-lock=false','--ignore-scripts','--no-audit','--no-fund','npm@12.1.0']);
const npm='/work/npm/node_modules/npm/bin/npm-cli.js';
const version=spawnSync(process.execPath,[npm,'--version'],{encoding:'utf8'});assert.equal(version.status,0);assert.equal(version.stdout.trim(),'12.1.0');
run(process.execPath,[npm,'ci','--ignore-scripts','--no-audit','--no-fund']);assert.equal(lock(),before);
process.stdout.write(JSON.stringify({event:'qa-foreign-uid-dependencies-ready',node:process.version,npm:version.stdout.trim(),platform:process.platform,arch:process.arch,packageLockSha256:before,productEntryExecuted:false})+'\n');
