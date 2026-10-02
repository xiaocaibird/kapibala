import { createHash, randomUUID } from 'node:crypto';
import { appendFile, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { exec } from '../../harness/process.js';
import { BlockedError, loadTarget, requireAuthorization, targetFingerprint, redact } from '../../harness/security.js';
import { secondRoundRoot, secondRoundFingerprint } from './scope.js';
import { runForeignUidSupplement, foreignUidBaseImage, foreignUidDockerHost, type ForeignUidSupplement } from './foreign-uid.js';
import { classifyError, type VariantResult } from './result.js';

const relatedCaseIds=['SR-C2-008','SR-BE-USG-006'];
const expectedVariants=['linux-owned-positive-control','SR-C2-008-foreign-uid-record','SR-BE-USG-006-safe-temp-positive-control','SR-BE-USG-006-foreign-uid-preservation'];
const sha=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const xml=(s:unknown)=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));

export function foreignRunnerArguments(args:string[]) {
 const names=['--target','--authorization','--revision'];const values:Record<string,string>={};
 if(args.length!==6)throw new BlockedError('Required exactly --target FILE --authorization FILE --revision FULL_SHA');
 for(let i=0;i<args.length;i+=2){const name=args[i]!,value=args[i+1];if(!names.includes(name)||values[name]!==undefined||!value||value.startsWith('--')||value.includes('\0'))throw new BlockedError('Unknown, repeated or missing foreign UID runner argument');values[name]=value;}
 if(names.some(n=>!values[n])||!/^[a-f0-9]{40}$/.test(values['--revision']!))throw new BlockedError('Foreign UID runner requires a full frozen SUT SHA');
 return {target:values['--target']!,authorization:values['--authorization']!,revision:values['--revision']!};
}
export function assertForeignQaClean(porcelain:string) {
 const dirty=porcelain.split('\0').filter(Boolean).filter(line=>!/^\?\? qa-acceptance\/second-round\/reports\/runs\//.test(line));
 if(dirty.length)throw new BlockedError(`QA must be committed before this run; only new reports/runs files are allowed: ${dirty.join('; ')}`);
}
export function foreignSubobligationResults(input:ForeignUidSupplement) {
 const seen=new Set<string>();for(const row of input.variants){if(seen.has(row.id))throw new BlockedError('Duplicate supplement variant result');seen.add(row.id);}
 const rows:VariantResult[]=expectedVariants.map(id=>input.variants.find(row=>row.id===id)??{id,status:'NOT_RUN',reason:'This Linux sub-obligation was not reached; no inferred result',evidence:[]});
 rows.push(...input.variants.filter(row=>!expectedVariants.includes(row.id)));
 for(const row of rows)if(row.status==='PASS'&&!row.evidence.length)throw new BlockedError('Supplement PASS requires actual evidence');
 const verdict=rows.some(row=>row.status==='FAIL')?'FAIL':input.cleanupErrors.length||rows.some(row=>row.status!=='PASS')?'BLOCKED':'PASS';
 return {rows,verdict};
}
export async function writeForeignSupplementReport(out:string,manifest:Record<string,unknown>,input:ForeignUidSupplement) {
 const {rows,verdict}=foreignSubobligationResults(input),counts={PASS:0,FAIL:0,BLOCKED:0,NOT_RUN:0};for(const row of rows)counts[row.status]++;
 const report={schemaVersion:1,phase:'SECOND_ROUND_LINUX_UID_SUPPLEMENT',generatedAt:new Date().toISOString(),manifest,relatedCaseIds,
  counts,subObligationVerdict:verdict,wholeCaseVerdicts:Object.fromEntries(relatedCaseIds.map(id=>[id,'NOT_ASSESSED_BY_SUPPLEMENT'])),
  productionReadiness:'NOT_ASSESSED',subObligations:rows,cleanupErrors:input.cleanupErrors,
  conclusionLimits:['Only four explicitly named Linux sub-obligations are reported. No complete case or 112-case verdict is issued here.',
   'Actual Node 24.21 and npm 12.1 run in Linux; Darwin behavior and other declared variants require their own evidence.',
   'No real paid model, database, browser or production environment is used. No automatic retries. Existing reports remain immutable.',
   'An untouched fake key sentinel is not evidence of production key-file configuration import isolation.']};
 await writeFile(resolve(out,'result.json'),JSON.stringify(input,null,2)+'\n');await writeFile(resolve(out,'results.json'),JSON.stringify(report,null,2)+'\n');
 const cell=(v:unknown)=>String(v??'').replaceAll('|','\\|').replaceAll('\n',' ');
 await writeFile(resolve(out,'report.md'),['# Linux 文件归属独立补证','',`子义务结论：**${verdict}**。关联整例 SR-C2-008 / SR-BE-USG-006：本报告不作整例通过判定。上线准备度：未评估。`,'',
  `SUT：\`${manifest.sutRevision}\`；QA：\`${manifest.qaRevision}\`；run：\`${manifest.runId}\`。`,
  '固定 Node 24.21.0 / npm 12.1.0；Linux 双真实 UID 10001/10002。与 Darwin 宿主证据分开；不修改原 112 条结果。','',
  '| 子义务 | 状态 | 原因 / 证据 |','|---|---|---|',...rows.map(row=>`| ${cell(row.id)} | ${row.status} | ${cell(row.reason??row.evidence.join('; '))} |`),'',
  '范围：真实生成会话的不同 UID 拒绝与不重购；安全临时文件正控；不同 UID 临时文件/独立目录/假凭据哨兵保留、可选记录失败时真实业务继续。',
  '不覆盖：整例其余变体、生产 Key 文件配置导入、真实付费模型、真实人类输入法或系统焦点、上线门禁。','',
  `资源清理：${input.cleanupErrors.length?input.cleanupErrors.map(cell).join('; '):'入口已保存逐资源清理证明；见 cleanup-verification.json 与 foreign-uid/foreign-uid-cleanup.json。'}`,''].join('\n'));
 const lines=['<?xml version="1.0" encoding="UTF-8"?>',`<testsuite name="linux-uid-subobligations-only" tests="${rows.length+input.cleanupErrors.length}" failures="${counts.FAIL}" errors="${counts.BLOCKED+input.cleanupErrors.length}" skipped="${counts.NOT_RUN}">`];
 for(const row of rows){lines.push(`<testcase classname="foreign-uid-supplement" name="${xml(row.id)}">`);if(row.status==='FAIL')lines.push(`<failure message="${xml(row.reason)}"/>`);if(row.status==='BLOCKED')lines.push(`<error type="BLOCKED" message="${xml(row.reason)}"/>`);if(row.status==='NOT_RUN')lines.push('<skipped type="NOT_RUN"/>');lines.push(`<system-out>${xml(JSON.stringify(row))}</system-out>`,'</testcase>');}
 for(const [index,reason] of input.cleanupErrors.entries())lines.push(`<testcase classname="foreign-uid-cleanup" name="resource-cleanup-${index+1}"><error type="BLOCKED" message="${xml(reason)}"/></testcase>`);
 lines.push('</testsuite>');await writeFile(resolve(out,'junit.xml'),lines.join('\n')+'\n');
 const hashes:Record<string,string>={};for(const name of ['manifest.json','target.json','authorization.json','events.ndjson','result.json','report.md','results.json','junit.xml','cleanup-verification.json'])hashes[name]=sha(await readFile(resolve(out,name)));
 await writeFile(resolve(out,'report-hashes.json'),JSON.stringify(hashes,null,2)+'\n');return report;
}

export async function runForeignUidEntry(argv:string[]) {
 const args=foreignRunnerArguments(argv),qaRoot=resolve(secondRoundRoot,'..'),workspace=await realpath(resolve(qaRoot,'..'));
 const git=async(cwd:string,...a:string[])=>(await exec('git',a,{cwd,maxBuffer:8*1024*1024})).stdout;
 const targetPath=await realpath(resolve(args.target)),authPath=await realpath(resolve(args.authorization));
 for(const path of [targetPath,authPath]){const stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw new BlockedError('Target/authorization must resolve to existing regular files');}
 const originalTarget=await readFile(targetPath),originalAuthorization=await readFile(authPath),target=await loadTarget(targetPath,qaRoot);
 if(target.sut.revision!==args.revision||target.sut.cwd===workspace)throw new BlockedError('Exact independent SUT target and complete SHA required');
 const assertFrozen=async()=>{
  if((await git(target.sut.cwd,'rev-parse','HEAD')).trim()!==args.revision)throw new BlockedError('Frozen SUT HEAD changed');
  if((await git(target.sut.cwd,'status','--porcelain','-z','--untracked-files=all'))!=='')throw new BlockedError('Frozen SUT must be entirely clean');
  assertForeignQaClean(await git(workspace,'status','--porcelain','-z','--untracked-files=all'));
 };
 await assertFrozen();const qaRevision=(await git(workspace,'rev-parse','HEAD')).trim(),scopeHash=await secondRoundFingerprint();
 const scope=JSON.parse(await readFile(resolve(secondRoundRoot,'config/execution-scope.json'),'utf8'));
 if(scope.authorization?.executionAuthorized!==true||scope.authorization.realProviderAuthorized!==false)throw new BlockedError('Expected offline second-round authority unavailable');
 for(const name of ['QA_EXECUTION_SUITE_ID','QA_EXECUTION_SUITE_SHA256','QA_EXECUTION_BUSINESS_SHA256','QA_EXECUTION_MANUAL_SHA256'])delete process.env[name];
 process.env.QA_EXECUTION_KIND='second-round';process.env.QA_EXECUTION_SECOND_ROUND_SHA256=scopeHash;process.env.QA_EXECUTION_AUTHORIZATION=authPath;
 const authorization=await requireAuthorization(target);if(authorization.targetSha256!==targetFingerprint(target))throw new BlockedError('Authorization target hash mismatch');
 if(!originalTarget.equals(await readFile(targetPath))||!originalAuthorization.equals(await readFile(authPath)))throw new BlockedError('Input target/authorization changed during preflight');
 const runId=`${new Date().toISOString().replaceAll(':','-')}-${randomUUID().slice(0,8)}`,out=resolve(secondRoundRoot,'reports/runs',runId),runtime=resolve(qaRoot,'.runtime/second-round',runId);
 await mkdir(resolve(secondRoundRoot,'reports/runs'),{recursive:true});await mkdir(resolve(qaRoot,'.runtime/second-round'),{recursive:true,mode:0o700});
 await mkdir(out,{recursive:false});await mkdir(runtime,{recursive:false,mode:0o700});
 await writeFile(resolve(out,'target.json'),originalTarget);await writeFile(resolve(out,'authorization.json'),originalAuthorization,{mode:0o600});
 await writeFile(resolve(runtime,'target.json'),originalTarget,{mode:0o600});await writeFile(resolve(runtime,'authorization.json'),originalAuthorization,{mode:0o600});
 // Subsequent helper checks use the exact frozen copy, not a mutable source path.
 process.env.QA_EXECUTION_AUTHORIZATION=resolve(runtime,'authorization.json');
 const manifest:Record<string,unknown>={schemaVersion:1,runId,phase:'SECOND_ROUND_LINUX_UID_SUPPLEMENT',relatedCaseIds,selectedSubObligations:expectedVariants,
  wholeCaseVerdicts:'NOT_ASSESSED_BY_SUPPLEMENT',sutRevision:args.revision,qaRevision,sutDirectory:target.sut.cwd,qaDirectory:qaRoot,
  secondRoundSha256:scopeHash,targetSha256:targetFingerprint(target),inputTargetFileSha256:sha(originalTarget),inputAuthorizationFileSha256:sha(originalAuthorization),
  sourceTargetPath:targetPath,sourceAuthorizationPath:authPath,authority:scope.authorization,finalExecutionBoundary:scope.finalExecutionBoundary,startedAt:new Date().toISOString(),autoRetries:0,
  environment:{host:{node:process.version,platform:process.platform,arch:process.arch},container:{node:'24.21.0',npm:'12.1.0',platform:'linux',image:foreignUidBaseImage,dockerHost:foreignUidDockerHost}},
  realProviderAuthorized:false,productionReadiness:'NOT_ASSESSED',originalReportsModified:false,runnerErrors:[]};
 const saveManifest=()=>writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const event=(value:Record<string,unknown>)=>appendFile(resolve(out,'events.ndjson'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');
 await saveManifest();await event({event:'supplement-start',runId,relatedCaseIds});console.log(JSON.stringify({event:'run-created',runId,out,runtime}));
 let result:ForeignUidSupplement;
 try {await assertFrozen();await requireAuthorization(target);result=await runForeignUidSupplement({target,runtimeDir:resolve(runtime,'foreign-uid'),outputDir:resolve(out,'foreign-uid')});}
 catch(error){const evidence=resolve(out,'runner-error.json');await writeFile(evidence,redact({error:String(error),stack:error instanceof Error?error.stack:undefined})+'\n');const status=classifyError(error);
  result={status,variants:[{id:'supplement-execution',status,reason:String(error),evidence:[evidence]}],cleanupErrors:[]};(manifest.runnerErrors as string[]).push(String(error));}
 try {await assertFrozen();if((await git(workspace,'rev-parse','HEAD')).trim()!==qaRevision||await secondRoundFingerprint()!==scopeHash)throw new BlockedError('QA revision/scope changed during execution');}
 catch(error){const reason=String(error);(manifest.runnerErrors as string[]).push(reason);result.variants.push({id:'frozen-version-integrity',status:'BLOCKED',reason,evidence:[resolve(out,'manifest.json')]});}
 let cleanup:unknown;try{cleanup=JSON.parse(await readFile(resolve(out,'foreign-uid/foreign-uid-cleanup.json'),'utf8'));const ledgerErrors=(cleanup as {cleanupErrors?:unknown}).cleanupErrors;if(!Array.isArray(ledgerErrors)||!ledgerErrors.every(v=>typeof v==='string'))throw new Error('Missing cleanup failure ledger');for(const reason of ledgerErrors)if(!result.cleanupErrors.includes(reason))result.cleanupErrors.push(reason);}
 catch(error){result.cleanupErrors.push(`No complete helper cleanup proof: ${String(error)}`);cleanup={verified:false,error:String(error)};}
 await writeFile(resolve(out,'cleanup-verification.json'),JSON.stringify({source:'foreign-uid/foreign-uid-cleanup.json',cleanup,errors:result.cleanupErrors},null,2)+'\n');
 result.status=foreignSubobligationResults(result).verdict as ForeignUidSupplement['status'];manifest.completedAt=new Date().toISOString();await event({event:'supplement-complete',status:result.status,cleanupErrors:result.cleanupErrors});await saveManifest();
 const report=await writeForeignSupplementReport(out,manifest,result);console.log(JSON.stringify({event:'report-complete',out,runId,subObligationVerdict:report.subObligationVerdict,wholeCaseVerdicts:report.wholeCaseVerdicts}));return {out,runtime,report};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await runForeignUidEntry(process.argv.slice(2));
