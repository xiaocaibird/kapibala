import Fastify from 'fastify';
import { z } from 'zod';
import { JsonStore,delay } from './store.js';
interface ScriptReply {status?:number;raw?:string;body?:unknown;delayMs?:number;}
interface AgentState {turns:Record<string,number>;calls:{runId:string;body:unknown;at:string}[];audits:{text:string;groupId:string}[];turnScript:ScriptReply[];auditScript:ScriptReply[];turnDelayMs:number;auditDelayMs:number;}
const script=z.object({status:z.number().int().optional(),raw:z.string().optional(),body:z.unknown().optional(),delayMs:z.number().nonnegative().optional()});
export function createAgentSimulator(path='.runtime/agent.json') {
 const app=Fastify({logger:false});const store=new JsonStore<AgentState>(path,{turns:{},calls:[],audits:[],turnScript:[],auditScript:[],turnDelayMs:0,auditDelayMs:0});const s=store.state;
 app.post('/agent/turn',async(req,reply)=>{
  const body=z.object({runId:z.string(),tools:z.array(z.object({name:z.string(),description:z.string(),input_schema:z.record(z.string(),z.unknown())})),messages:z.array(z.unknown()).min(1)}).parse(req.body);
  const required:Record<string,string[]>={get_recent_messages:['limit'],send_message:['text','idempotency_key'],kick_user:['platform_user_id','reason'],finish:['summary']};
  if(body.tools.length!==4||new Set(body.tools.map(t=>t.name)).size!==4||body.tools.some(t=>!required[t.name]||!required[t.name]!.every(k=>Array.isArray(t.input_schema.required)&&t.input_schema.required.includes(k))||t.input_schema.type!=='object'))return reply.code(400).send({code:'TOOLS_INVALID'});
  const turn=s.turns[body.runId]??0;s.turns[body.runId]=turn+1;s.calls.push({runId:body.runId,body,at:new Date().toISOString()});store.save();
  const custom=s.turnScript[turn];await delay(custom?.delayMs??s.turnDelayMs);
  if(custom){reply.code(custom.status??200);if(custom.raw!==undefined)return reply.type('application/json').send(custom.raw);return custom.body;}
  if(turn===0)return{stop_reason:'tool_use',content:[{type:'tool_use',id:'recent-1',name:'get_recent_messages',input:{limit:10}}]};
  if(turn===1)return{stop_reason:'tool_use',content:[{type:'tool_use',id:'send-1',name:'send_message',input:{text:'收到消息，已记录。',idempotency_key:'reply-1'}}]};
  return{stop_reason:'tool_use',content:[{type:'tool_use',id:`finish-${turn}`,name:'finish',input:{summary:'已查看群消息并完成回复。'}}]};
 });
 app.post('/agent/audit',async(req,reply)=>{const body=z.object({text:z.string(),groupId:z.string()}).parse(req.body);s.audits.push(body);const custom=s.auditScript.shift();store.save();await delay(custom?.delayMs??s.auditDelayMs);if(custom){reply.code(custom.status??200);if(custom.raw!==undefined)return reply.type('application/json').send(custom.raw);return custom.body;}return{verdict:body.text.includes('[reject]')?'fail':'pass',reason:body.text.includes('[reject]')?'内容不符合群策略':'允许执行'};});
 app.get('/__control',async()=>s);
 app.post('/__control/config',async req=>{const data=z.object({turnScript:z.array(script).optional(),auditScript:z.array(script).optional(),turnDelayMs:z.number().nonnegative().optional(),auditDelayMs:z.number().nonnegative().optional()}).parse(req.body);Object.assign(s,data);store.save();return{ok:true};});
 app.setErrorHandler((error,_req,reply)=>reply.code(400).send({code:'VALIDATION_ERROR',message:String(error)}));return app;
}
