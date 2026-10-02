#!/usr/bin/env node
/** Optional local SSE DEMO. This is a mock event source, not an AI-provider proxy.
 * Start: npm run demo:server
 * Connect from the app console as described in docs/INTEGRATION.md.
 */
import http from 'node:http';
const port=Number(process.env.DEMO_PORT??8787);
const allowed=new Set(['http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173',process.env.DEMO_ORIGIN].filter(Boolean));
const clients=new Map();
const server=http.createServer((req,res)=>{
  const origin=req.headers.origin;
  if(origin&&!allowed.has(origin)){res.writeHead(403);res.end('Origin is not allowed. Set DEMO_ORIGIN for your local development URL.');return;}
  if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, OPTIONS'});res.end();return;}
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true,mode:'mock-events',clients:clients.size}));return;}
  if(url.pathname!=='/events'){res.writeHead(404);res.end('Use /events?agentId=app-creator-0');return;}
  const id=url.searchParams.get('agentId')??'app-creator-0';
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id)){res.writeHead(400);res.end('Invalid agentId');return;}
  if(clients.size>=32){res.writeHead(429);res.end('Too many demo streams');return;}
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.write('retry: 3000\n\n');
  let step=0;
  const send=()=>{
    const cycle=step%72;
    const status=cycle<38?'working':cycle<45?'completed':cycle<58?'coffee':'working';
    const event={agentId:id,status,model:'Mock SSE server',task:'Demo: validate the release checklist',tokens:2142+step*83,progress:cycle<38?Math.min(100,cycle*2.6):cycle<58?100:Math.min(100,(cycle-58)*3),tasksCompleted:Math.floor(step/72),energy:cycle<38?88-cycle:Math.min(100,50+(cycle-38)*2)};
    res.write(`id: ${step}\ndata: ${JSON.stringify(event)}\n\n`);step++;
  };
  send();const timer=setInterval(send,1000);clients.set(res,timer);
  res.on('close',()=>{clearInterval(timer);clients.delete(res);});
});
server.listen(port,'127.0.0.1',()=>console.log(`Mock agent events: http://127.0.0.1:${port}/events?agentId=app-creator-0\nHealth: http://127.0.0.1:${port}/health\nLocal demonstration only. No AI services are called.`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const[res,timer]of clients){clearInterval(timer);res.end();}server.close(()=>process.exit(0));});
