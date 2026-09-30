import { mkdirSync,readFileSync,writeFileSync,renameSync } from 'node:fs';
import { dirname } from 'node:path';
export class JsonStore<T> {
 readonly state:T;
 constructor(readonly path:string, initial:T) {try{this.state=JSON.parse(readFileSync(path,'utf8')) as T;}catch{this.state=initial;} }
 save():void {mkdirSync(dirname(this.path),{recursive:true});writeFileSync(`${this.path}.tmp`,JSON.stringify(this.state));renameSync(`${this.path}.tmp`,this.path);}
}
export const delay=(ms:number):Promise<void>=>new Promise(resolve=>setTimeout(resolve,ms));
