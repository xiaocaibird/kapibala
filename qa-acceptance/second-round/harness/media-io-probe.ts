import { open, mkdir, mkdtemp, readFile, rm, realpath, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installOwnedUnlinkDenial } from './media-unlink.js';
/** Tests the OS mechanism on QA's own fresh file, never on product data. A flag
 * that blocks unlink does not necessarily revoke write access of an open FD. */
export async function probeImmutableOpenWrite(base:string){
  await mkdir(base,{recursive:true,mode:0o700});const root=await realpath(await mkdtemp(resolve(base,'open-write-probe-'))),path=resolve(root,'probe.part');
  const handle=await open(path,'wx',0o600);let denial:Awaited<ReturnType<typeof installOwnedUnlinkDenial>>|undefined;
  try{
    await handle.write(Buffer.from('prefix'));const before=await lstat(path);denial=await installOwnedUnlinkDenial(root,path);let errorCode:string|null=null,writeBytes:number|null=null;
    try{writeBytes=(await handle.write(Buffer.from('-tail'))).bytesWritten;}catch(error){errorCode=(error as NodeJS.ErrnoException).code??'UNKNOWN';}
    const after=await readFile(path,'utf8'),denied=['EPERM','EACCES'].includes(errorCode??'')&&after==='prefix';
    return {denied,errorCode,writeBytes,before:{inode:before.ino,size:before.size},after,mechanism:denial.evidence,scope:'QA-owned probe only; no product syscall result claimed'};
  }finally{await handle.close();await denial?.restore();await rm(root,{recursive:true,force:true});}
}
