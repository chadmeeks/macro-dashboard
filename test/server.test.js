const test=require('node:test');const assert=require('node:assert/strict');const {createServer}=require('../server');
test('serves the dashboard, health endpoint and safe error responses',async t=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await (await fetch(url+'/api/health')).json()).version,2);
 const page=await fetch(url);assert.equal(page.status,200);assert.match(await page.text(),/A little perspective/);
 assert.equal((await fetch(url+'/missing')).status,404);
 assert.equal((await fetch(url+'/api/missing')).status,404);
 assert.equal((await fetch(url+'/%2e%2e%2fserver.js')).status,403);
 assert.equal((await fetch(url,{method:'POST'})).status,405);
});
