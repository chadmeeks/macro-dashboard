'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const feeds=require('./lib/data');
const {NarrativeStore}=require('./lib/narratives');
const narratives=new NarrativeStore({directory:process.env.MACRO_CACHE_DIR});
const PUBLIC=path.join(__dirname,'public');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(payload));}
async function readJson(req){
  let body='';
  for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>600000)throw new Error('Import is too large.');}
  try{return JSON.parse(body);}catch{throw new Error('Invalid JSON import.');}
}
function createServer(){return http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/etf/import'&&req.method==='POST'){
      const origin=req.headers.origin;
      if(origin&&origin!==`http://${req.headers.host}`)return json(res,403,{error:'Import from this dashboard only.'});
      if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON required.'});
      try{return json(res,200,await feeds.importEtf(await readJson(req)));}catch(error){return json(res,400,{error:error.message});}
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed'});
    if(url.pathname==='/api/health')return json(res,200,{ok:true,version:2});
    if(url.pathname==='/api/strategy')return json(res,200,{status:'snapshot',retrievedAt:'2026-10-11T00:00:00Z',data:require('./data/strategy-purchases.json')});
    if(url.pathname==='/api/narratives'){
      const days=Number(url.searchParams.get('days')||7),sort=url.searchParams.get('sort')||'attention';
      if(![1,7,30].includes(days)||!['attention','rising'].includes(sort))return json(res,400,{error:'Choose days=1,7,30 and sort=attention,rising.'});
      return json(res,200,await narratives.get({days,sort,force:url.searchParams.get('refresh')==='1'}));
    }
    const route=url.pathname.match(/^\/api\/(bitcoin|spot|sentiment|adoption|macro|calendar|valuation|etf|history|supply|globalm2)$/);
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
