import { createServer, request, type ClientRequest } from 'node:http';
import type { AddressInfo } from 'node:net';

/** Stable QA-owned address across a real service restart; forwards unchanged
 * bytes and never supplies a successful response or retries a request. */
export class ServiceRelay {
  private upstream='';
  private pending=new Set<ClientRequest>();
  readonly ledger: {method:string;path:string;upstream:string;at:string;status?:number;closedAt?:string}[]=[];
  private server=createServer((req,res)=>{
    const target=new URL(req.url??'/',this.upstream);
    if(target.origin!==this.upstream){res.writeHead(400);res.end();return;}
    const entry={method:req.method??'',path:req.url??'',upstream:this.upstream,at:new Date().toISOString()} as typeof this.ledger[number];
    this.ledger.push(entry);
    const outgoing=request(target,{method:req.method,headers:{...req.headers,host:target.host}},incoming=>{
      entry.status=incoming.statusCode;res.writeHead(incoming.statusCode??502,incoming.headers);incoming.pipe(res);
      res.once('close',()=>incoming.destroy());
    });
    this.pending.add(outgoing);outgoing.once('close',()=>this.pending.delete(outgoing));
    outgoing.once('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
    res.once('close',()=>{entry.closedAt=new Date().toISOString();outgoing.destroy();});req.pipe(outgoing);
  });
  url='';
  pointTo(value:string){const u=new URL(value);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw new Error('Relay requires owned loopback origin');this.upstream=u.origin;}
  async start(value:string){this.pointTo(value);await new Promise<void>((ok,bad)=>{this.server.once('error',bad);this.server.listen(0,'127.0.0.1',ok);});this.url=`http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;}
  async close(){for(const p of this.pending)p.destroy();this.server.closeAllConnections();await new Promise<void>((ok,bad)=>this.server.close(e=>e?bad(e):ok()));}
}
