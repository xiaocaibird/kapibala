import { createGatewaySimulator } from './gateway.js';
import { createAgentSimulator } from './agent.js';
const gateway=createGatewaySimulator(process.env.GATEWAY_STATE_PATH);const agent=createAgentSimulator(process.env.AGENT_STATE_PATH);
await gateway.listen({port:Number(process.env.GATEWAY_PORT??3101),host:'127.0.0.1'});
await agent.listen({port:Number(process.env.AGENT_PORT??3102),host:'127.0.0.1'});
console.log('Gateway simulator http://127.0.0.1:3101; Agent simulator http://127.0.0.1:3102');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void Promise.all([gateway.close(),agent.close()]).then(()=>process.exit(0));});
