'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const feeds=require('./lib/data');
const PUBLIC=path.join(__dirname,'public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
function createServer(){return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
    if(url.pathname==='/api/health')return json(res,200,{ok:true,version:2});
    const route=url.pathname.match(/^\/api\/(bitcoin|spot|sentiment|adoption|macro|calendar)$/);
    if(route)return json(res,200,await feeds[route[1]](url.searchParams.get('refresh')==='1'));
    if(url.pathname.startsWith('/api/'))return json(res,404,{error:'Unknown API route'});
    const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const target=path.resolve(PUBLIC,`.${relative}`);
    if(!target.startsWith(PUBLIC+path.sep))return json(res,403,{error:'Forbidden'});
    let stat;try{stat=await fs.promises.stat(target);}catch{return json(res,404,{error:'Not found'});}
    if(!stat.isFile())return json(res,404,{error:'Not found'});
    res.writeHead(200,{'Content-Type':MIME[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});
    if(req.method==='HEAD')return res.end();
    fs.createReadStream(target).on('error',()=>res.destroy()).pipe(res);
  }catch(error){console.error(error.message);if(!res.headersSent)json(res,500,{error:'Data could not be loaded. Try refreshing.'});else res.end();}
});}
if(require.main===module){const port=Number(process.env.PORT||3001);const server=createServer();server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Set PORT to another number; no existing process was stopped.`:error.message);process.exitCode=1;});server.listen(port,'127.0.0.1',()=>console.log(`Macro Dashboard → http://localhost:${port}`));}
module.exports={createServer};
