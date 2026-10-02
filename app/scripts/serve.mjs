#!/usr/bin/env node
/** Dependency-free static server for the production build. Run npm run build first. */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, access } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../dist');
const port=Number(process.env.PORT??4173),host=process.env.HOST??'127.0.0.1';
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer between 1 and 65535.');
try{await access(resolve(root,'index.html'));}catch{console.error('No production build exists. First run: npm install && npm run build');process.exit(1);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.map':'application/json','.svg':'image/svg+xml','.png':'image/png','.glb':'model/gltf-binary','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  try{
    const url=new URL(req.url,'http://localhost');const pathname=decodeURIComponent(url.pathname);
    if(pathname.includes('\0'))throw new Error('Invalid path');
    const file=resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403);res.end('Forbidden');return;}
    const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
    res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Length':info.size,'X-Content-Type-Options':'nosniff','Cache-Control':extname(file)==='.html'?'no-cache':'public, max-age=3600'});
    if(req.method==='HEAD')res.end();else{const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);}
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,host,()=>console.log(`Cozy Office: http://${host}:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
