import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec, isolatedEnv, OwnedProcess } from '../../harness/process.js';
import { BlockedError, requireAuthorization, redact } from '../../harness/security.js';
import type { TargetConfig } from '../../harness/types.js';
import type { VariantResult } from './result.js';

export const foreignUidBaseImage='sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
export const foreignUidDockerHost='unix:///var/run/docker.sock';
const label='org.kapibala.independent-qa.foreign-uid';
const paths=['package.json','package-lock.json','tsconfig.json','apps','packages','scripts'];
export interface ForeignUidContext {target:TargetConfig;runtimeDir:string;outputDir:string}
export interface ForeignUidSupplement {status:'PASS'|'FAIL'|'BLOCKED';variants:VariantResult[];cleanupErrors:string[];[key:string]:unknown}

/** Container ownership must match an unpredictable per-call label and the exact
 * ID returned by create. No lookup by prefix, no project mounts, no prune. */
export function assertForeignContainer(info:unknown,id:string,owner:string,image:string,phase:'prepare'|'execute') {
 const row=info as {Id:string;Image:string;Config:{Labels:Record<string,string>};Mounts:unknown[];HostConfig:{NetworkMode:string;Privileged:boolean;ReadonlyRootfs:boolean;Binds:unknown[]|null;PortBindings:unknown}};
 const mounted=(row.Mounts??[]) as {Type:string;Name?:string;Destination:string}[];
 if(row.Id!==id||row.Image!==image||row.Config?.Labels?.[label]!==owner||row.HostConfig?.Privileged||row.HostConfig?.Binds?.length||mounted.some(m=>m.Type!=='tmpfs'&&!(phase==='execute'&&m.Type==='volume'&&m.Name===`qa-foreign-${owner}`&&m.Destination==='/qa')))throw new BlockedError('Foreign UID container ownership/isolation mismatch');
 if(Object.keys(row.HostConfig.PortBindings??{}).length)throw new BlockedError('Foreign UID containers cannot publish ports');
 if(phase==='prepare'&&row.HostConfig.NetworkMode!=='bridge')throw new BlockedError('Unexpected dependency preparation network');
 if(phase==='execute'&&(row.HostConfig.NetworkMode!=='none'||!row.HostConfig.ReadonlyRootfs))throw new BlockedError('Foreign UID execution requires network none, read-only root, no published ports');
 if(phase==='execute'&&mounted.filter(m=>m.Type==='volume'&&m.Name===`qa-foreign-${owner}`&&m.Destination==='/qa').length!==1)throw new BlockedError('Foreign UID execution requires exact independently owned evidence volume');
 return row;
}
export function foreignRuntimeArguments(name:string,owner:string,image:string):string[] {
 if(!/^qa-foreign-[a-f0-9-]{36}$/.test(name)||!/^sha256:[a-f0-9]{64}$/.test(image))throw new BlockedError('Invalid foreign UID resource identity');
 return ['create','--name',name,'--label',`${label}=${owner}`,'--network','none','--read-only','--init','--pids-limit','64','--memory','512m',
 '--security-opt','no-new-privileges','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','SETUID','--cap-add','SETGID','--cap-add','DAC_OVERRIDE','--cap-add','KILL',
 '--mount',`type=volume,source=qa-foreign-${owner},target=/qa`,'--tmpfs','/tmp:rw,noexec,nosuid,size=64m,mode=1777',image,'node','/work/foreign-uid-container.mjs'];
}
function status(error:unknown):'FAIL'|'BLOCKED' {return error instanceof assert.AssertionError?'FAIL':'BLOCKED';}

/** Standalone supplement. No SUT import, production credential, host project
 * mount, host DB or published port. Dependency preparation alone has bridge
 * networking; only lockfile packages with scripts disabled run there. Actual
 * SUT+QA run inside a second network-none container with an immutable source.
 * Linux is explicitly supplemental to the Darwin host; both use Node 24.21.
 * The base image's older npm is not used for the product lock installation. */
export async function runForeignUidSupplement(context:ForeignUidContext):Promise<ForeignUidSupplement> {
 await requireAuthorization(context.target);assert.match(context.target.sut.revision,/^[a-f0-9]{40}$/);
 await mkdir(context.runtimeDir,{recursive:true,mode:0o700});await mkdir(context.outputDir,{recursive:true});
 const owner=randomUUID(),root=resolve(context.runtimeDir,`foreign-uid-${owner}`);await mkdir(root,{mode:0o700});
 const canonical=await realpath(root),identity=await lstat(root);await writeFile(resolve(root,'.owner'),owner,{mode:0o600,flag:'wx'});
 const cleanupErrors:string[]=[],variants:VariantResult[]=[];let childResult:ForeignUidSupplement|undefined,imageId:string|undefined,volumeCreated=false;
 const volumeName=`qa-foreign-${owner}`;
 const containers:{id:string;image:string;phase:'prepare'|'execute'}[]=[];
 const save=async(name:string,value:unknown)=>{const path=resolve(context.outputDir,name);await writeFile(path,redact(value)+'\n');return path;};
 let daemon:{ID:string;ServerVersion:string;OSType:string}|undefined;
 const verifyDaemon=async()=>{
  const info=JSON.parse((await exec('docker',['--host',foreignUidDockerHost,'info','--format','{{json .}}'],{timeout:20000,maxBuffer:8*1024*1024,env:isolatedEnv({})})).stdout);
  const actual={ID:info.ID,ServerVersion:info.ServerVersion,OSType:info.OSType};
  if(!actual.ID||!actual.ServerVersion||actual.OSType!=='linux')throw new BlockedError('Explicit Docker daemon identity/version/Linux OS unavailable');
  if(daemon&&JSON.stringify(actual)!==JSON.stringify(daemon))throw new BlockedError('Explicit Docker daemon changed during foreign UID execution; stop before operating on ambiguous resources');
  if(!daemon){daemon=actual;await save('foreign-uid-daemon.json',{host:foreignUidDockerHost,...actual});}
  return actual;
 };
 const docker=async(args:string[])=>{await verifyDaemon();return exec('docker',['--host',foreignUidDockerHost,...args],{timeout:20000,maxBuffer:8*1024*1024,env:isolatedEnv({})});};
 const runCommand=async(args:string[],log:string,timeout:number)=>{
  await verifyDaemon();const command=new OwnedProcess({command:'docker',args:['--host',foreignUidDockerHost,...args]},root,isolatedEnv({}),resolve(context.outputDir,log));
  try{await command.runOnce(timeout);await verifyDaemon();}finally{await command.stop();}
 };
 const inspect=async(item:{id:string;image:string;phase:'prepare'|'execute'})=>{const rows=JSON.parse((await docker(['inspect',item.id])).stdout);assert.equal(rows.length,1);return assertForeignContainer(rows[0],item.id,owner,item.image,item.phase);};
 try {
  const image=JSON.parse((await docker(['image','inspect',foreignUidBaseImage])).stdout)[0];assert.equal(image.Id,foreignUidBaseImage);assert.equal(image.Os,'linux');
  const tree=(await exec('git',['ls-tree','-r',context.target.sut.revision,'--',...paths],{cwd:context.target.sut.cwd,maxBuffer:8*1024*1024})).stdout;
  if(tree.trim().split('\n').some(line=>!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(line)))throw new BlockedError('Source export contains a nonregular tracked entry');
  const archive=resolve(root,'source.tar');await exec('git',['archive','--format=tar',`--output=${archive}`,context.target.sut.revision,'--',...paths],{cwd:context.target.sut.cwd});
  const source=resolve(root,'source');await mkdir(source);await exec('tar',['-xf',archive,'-C',source]);
  const entry=resolve(root,'foreign-uid-container.mjs');await copyFile(fileURLToPath(new URL('./foreign-uid-container.mjs',import.meta.url)),entry);
  const prepareEntry=resolve(root,'foreign-uid-prepare.mjs');await copyFile(fileURLToPath(new URL('./foreign-uid-prepare.mjs',import.meta.url)),prepareEntry);
  await save('foreign-uid-source-provenance.json',{sutRevision:context.target.sut.revision,sourceTree:tree,archiveSha256:createHash('sha256').update(await readFile(archive)).digest('hex'),
   packageLockSha256:createHash('sha256').update(await readFile(resolve(source,'package-lock.json'))).digest('hex'),entrySha256:createHash('sha256').update(await readFile(entry)).digest('hex'),baseImage:image,
   preparationEntrySha256:createHash('sha256').update(await readFile(prepareEntry)).digest('hex'),
   differences:{host:{platform:process.platform,node:process.version},container:{platform:'linux',node:'24.21.0',npm:'12.1.0',basis:'Supported Node/npm; Linux UID supplement, not a Darwin run'}},network:'dependency preparation bridge; actual product execution none'});
  const prepId=(await docker(['create','--name',`qa-foreign-prepare-${owner}`,'--label',`${label}=${owner}`,'--network','bridge','--workdir','/work/source',foreignUidBaseImage,
   'node','/work/foreign-uid-prepare.mjs'])).stdout.trim();
  if(!/^[a-f0-9]{64}$/.test(prepId))throw new BlockedError('No exact dependency container identity');
  const prep={id:prepId,image:foreignUidBaseImage,phase:'prepare' as const};containers.push(prep);await inspect(prep);
  await docker(['cp',`${source}/.`,`${prepId}:/work/source`]);await docker(['cp',entry,`${prepId}:/work/foreign-uid-container.mjs`]);await docker(['cp',prepareEntry,`${prepId}:/work/foreign-uid-prepare.mjs`]);
  await runCommand(['start','--attach',prepId],'foreign-uid-npm-ci.log',300000);
  const prepDone=JSON.parse((await docker(['inspect',prepId])).stdout)[0];await inspect(prep);assert.equal(prepDone.State.Running,false);assert.equal(prepDone.State.ExitCode,0);
  const committed=(await docker(['commit',prepId])).stdout.trim();if(!/^sha256:[a-f0-9]{64}$/.test(committed))throw new BlockedError('No exact committed Linux dependency image');imageId=committed;
  const preparedImage=JSON.parse((await docker(['image','inspect',imageId])).stdout)[0];assert.equal(preparedImage.Config.Labels[label],owner);await save('foreign-uid-prepared-image.json',preparedImage);
  // Random name plus absence check prevents adopting an existing unowned volume.
  const prior=(await docker(['volume','ls','--filter',`name=^${volumeName}$`,'--format','{{.Name}}'])).stdout.trim();if(prior)throw new BlockedError('Evidence volume name already exists');
  const created=(await docker(['volume','create','--label',`${label}=${owner}`,volumeName])).stdout.trim();assert.equal(created,volumeName);volumeCreated=true;
  const volume=JSON.parse((await docker(['volume','inspect',volumeName])).stdout)[0];if(volume.Name!==volumeName||volume.Labels?.[label]!==owner||volume.Driver!=='local'||Object.keys(volume.Options??{}).length)throw new BlockedError('New evidence volume identity/options unexpected');await save('foreign-uid-volume.json',volume);
  const id=(await docker(foreignRuntimeArguments(`qa-foreign-${owner}`,owner,imageId))).stdout.trim();if(!/^[a-f0-9]{64}$/.test(id))throw new BlockedError('No exact test container identity');
  const item={id,image:imageId,phase:'execute' as const};containers.push(item);await save('foreign-uid-container-before.json',await inspect(item));
  await runCommand(['start','--attach',id],'foreign-uid-container.log',150000);
  await inspect(item);const ended=JSON.parse((await docker(['inspect',id])).stdout)[0];await save('foreign-uid-container-after.json',ended);assert.equal(ended.State.Running,false);assert.equal(ended.State.ExitCode,0);
  const evidence=resolve(context.outputDir,'foreign-uid-container-evidence');await mkdir(evidence);await docker(['cp',`${id}:/qa/.`,evidence]);
  childResult=JSON.parse(await readFile(resolve(evidence,'result.json'),'utf8')) as ForeignUidSupplement;
  for(const variant of childResult.variants)variants.push({...variant,evidence:variant.evidence.map(path=>{if(!/^\/qa\/[^/]+\.json$/.test(path))throw new BlockedError('Unexpected container evidence reference');return resolve(evidence,path.slice(4));})});
  cleanupErrors.push(...childResult.cleanupErrors);
 }catch(error){const path=await save('foreign-uid-error.json',{error:String(error),stack:error instanceof Error?error.stack:undefined});variants.push({id:'linux-foreign-uid-environment-or-execution',status:status(error),reason:String(error),evidence:[path]});}
 finally {
  for(const item of [...containers].reverse())try{await inspect(item);const rows=JSON.parse((await docker(['inspect',item.id])).stdout);if(rows[0].State.Running)await docker(['kill',item.id]);
   // Keep partial process/file evidence even when a diagnostic budget elapsed.
   if(item.phase==='execute'&&!childResult){const partial=resolve(context.outputDir,'foreign-uid-partial-evidence');await mkdir(partial);try{await docker(['cp',`${item.id}:/qa/.`,partial]);}catch(error){await save('foreign-uid-partial-copy-error.json',{error:String(error)});}}
   await save(`foreign-uid-${item.phase}-final-inspect.json`,JSON.parse((await docker(['inspect',item.id])).stdout));await docker(['rm',item.id]);
   const remaining=(await docker(['ps','-a','--filter',`id=${item.id}`,'--format','{{.ID}}'])).stdout.trim();assert.equal(remaining,'');
  }catch(error){cleanupErrors.push(`Owned ${item.phase} container ${item.id}: ${String(error)}`);}
  if(imageId)try{const row=JSON.parse((await docker(['image','inspect',imageId])).stdout)[0];if(row.Id!==imageId||row.Config?.Labels?.[label]!==owner)throw new BlockedError('Prepared image ownership changed');await docker(['image','rm',imageId]);}catch(error){cleanupErrors.push(String(error));}
  if(volumeCreated)try{const volume=JSON.parse((await docker(['volume','inspect',volumeName])).stdout)[0];if(volume.Name!==volumeName||volume.Labels?.[label]!==owner||volume.Driver!=='local'||Object.keys(volume.Options??{}).length)throw new BlockedError('Evidence volume ownership changed');await docker(['volume','rm',volumeName]);}catch(error){cleanupErrors.push(String(error));}
  if(!cleanupErrors.length)try{const now=await lstat(root);if(now.isSymbolicLink()||now.ino!==identity.ino||now.dev!==identity.dev||now.uid!==identity.uid||await realpath(root)!==canonical||await readFile(resolve(root,'.owner'),'utf8')!==owner)throw new BlockedError('Host export cleanup ownership changed');await rm(root,{recursive:true});}catch(error){cleanupErrors.push(String(error));}
  await save('foreign-uid-cleanup.json',{owner,daemon,dockerHost:foreignUidDockerHost,containers,imageId,volumeName,volumeCreated,cleanupErrors,hostExportRetained:cleanupErrors.length>0?root:null});
 }
 const final:ForeignUidSupplement={status:variants.some(v=>v.status==='FAIL')?'FAIL':cleanupErrors.length||!childResult||variants.length!==4||variants.some(v=>v.status!=='PASS')?'BLOCKED':'PASS',variants,cleanupErrors,
  environment:childResult?.environment,daemon,dockerHost:foreignUidDockerHost,sourceRevision:context.target.sut.revision,scope:'Sub-obligation supplement only: SR-C2-008 foreign UID record and SR-BE-USG-006 foreign temp preservation. Does not close remaining case obligations; supported Node 24.21/npm12.1 on Linux is separate from Darwin host evidence.'};
 await save('foreign-uid-supplement.json',final);return final;
}
