import { chmod, lstat, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { OwnedProcess, isolatedEnv, ownedListener } from '../../harness/process.js';
import { availablePort } from '../../harness/network.js';
import type { TargetConfig } from '../../harness/types.js';
import { actualListenerIdentity } from './environment.js';

type Kind = 'runtime'|'capacity'|'message';
/** Explicit engineering controllers, not product result substitutes. Registry
 * sockets use a short owned /tmp path due to the Unix socket address limit.
 * All durable manifests/logs live under qa-acceptance. */
export class OwnedControllers {
  private resources: {kind:Kind; registry:string; inode:number; device:number; marker:string; process:OwnedProcess; url:string}[]=[];
  constructor(readonly sut:string, readonly revision:string, readonly output:string) {}
  async start(): Promise<NonNullable<TargetConfig['adapters']>> {
    const adapters: NonNullable<TargetConfig['adapters']>={};
    for(const kind of ['runtime','capacity','message'] as const) {
      const registry=await mkdtemp(join(await realpath('/tmp'),`qa-r2-${kind[0]}-`));
      await chmod(registry,0o700);
      const stat=await lstat(registry),marker=JSON.stringify({owner:randomUUID(),sut:this.sut,revision:this.revision,runnerPid:process.pid});
      await writeFile(join(registry,'.qa-owner.json'),marker,{flag:'wx',mode:0o600});
      const port=await availablePort(),url=`http://127.0.0.1:${port}`;
      const key=kind.toUpperCase();
      const filename=kind==='capacity'?'qa-capacity-controller.ts':`qa-${kind}-observation-controller.ts`;
      const processOwner=new OwnedProcess({command:process.execPath,args:['--import','tsx',`scripts/${filename}`]},this.sut,
        isolatedEnv({[`QA_${key}_REGISTRY_DIR`]:registry,[`QA_${key}_PORT`]:String(port)}),resolve(this.output,`${kind}.log`));
      this.resources.push({kind,registry,inode:stat.ino,device:stat.dev,marker,process:processOwner,url});
      await processOwner.start();
      const until=performance.now()+30000;let ready=false;
      while(performance.now()<until) {if(await ownedListener(port,processOwner)){ready=true;break;} await new Promise(r=>setTimeout(r,50));}
      if(!ready)throw new Error(`Owned ${kind} controller not ready`);
      const identity=await actualListenerIdentity(url);
      await writeFile(resolve(this.output,`${kind}-identity.json`),JSON.stringify({kind,registry,inode:stat.ino,device:stat.dev,url,identity,guardianPid:processOwner.pid},null,2));
      const binding={url,registryDirectory:registry,contractReference:`${this.revision}:docs/${kind==='capacity'?'qa-capacity-control-handoff.md':kind==='message'?'qa-message-observation-handoff-20261001.md':'qa-runtime-observation-adapter.md'}`};
      if(kind==='capacity')adapters.capacityControl=binding;
      else if(kind==='message')adapters.messageObservation=binding;
      else adapters.runtimeObservation={...binding,diagnostics:{module:'gateway',modulesPointer:'/modules',namePointer:'/name',statePointer:'/status',
        consecutiveFailuresPointer:'/consecutiveFailures',lastFailureAtPointer:'/lastFailedAt',lastSuccessAtPointer:'/lastSucceededAt',
        currentDurationMsPointer:'/runningForMs',tickCountPointer:'/ticks',states:{failed:'failed',running:'running',healthy:'idle'}}};
    }
    return adapters;
  }
  async close() {
    const cleanup:unknown[]=[],errors:unknown[]=[];
    for(const r of [...this.resources].reverse()) {
      try {
        await r.process.stop();
        const stat=await lstat(r.registry);
        if(!stat.isDirectory()||stat.isSymbolicLink()||stat.uid!==process.getuid?.()||stat.ino!==r.inode||stat.dev!==r.device||
          await readFile(join(r.registry,'.qa-owner.json'),'utf8')!==r.marker)throw new Error('Registry owner changed');
        const registrations=[];
        for(const file of await readdir(r.registry)) {
          if(!/^[0-9a-f-]{36}\.json$/.test(file))continue;
          const item=JSON.parse(await readFile(join(r.registry,file),'utf8'));
          if(!Number.isSafeInteger(item.appPid)||item.appPid<=0)throw new Error('Unrecognized live registration');
          try {process.kill(item.appPid,0);throw new Error(`Registered app ${item.appPid} still alive; preserve registry`);}
          catch(e) {if((e as NodeJS.ErrnoException).code!=='ESRCH')throw e;}
          registrations.push({file,appPid:item.appPid,exited:true});
        }
        await rm(r.registry,{recursive:true});
        cleanup.push({kind:r.kind,registry:r.registry,registrations,removed:true});
      }catch(e){errors.push(String(e));cleanup.push({kind:r.kind,error:String(e),removed:false});}
    }
    await writeFile(resolve(this.output,'cleanup.json'),JSON.stringify({at:new Date().toISOString(),cleanup,errors},null,2));
    if(errors.length)throw new AggregateError(errors,'Owned controller cleanup incomplete');
  }
}
