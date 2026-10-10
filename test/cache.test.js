const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {Cache}=require('../lib/cache');
test('failed refresh preserves last good data and its original timestamp',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macro-cache-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let now=100000;const c=new Cache(dir,()=>now);
 const first=await c.get('x',100,async()=>({value:42}));now+=500;
 const stale=await c.get('x',100,async()=>{throw new Error('provider offline');},true);
 assert.equal(stale.data.value,42);assert.equal(stale.status,'stale');assert.equal(stale.retrievedAt,first.retrievedAt);
 assert.equal(new Cache(dir,()=>now).read('x').data.value,42);
});
test('concurrent requests share one provider request',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macro-cache-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const c=new Cache(dir);let count=0;
 const loader=async()=>{count++;await new Promise(r=>setTimeout(r,10));return {value:1};};
 await Promise.all([c.get('x',1000,loader),c.get('x',1000,loader)]);assert.equal(count,1);
});
test('no previous data produces unavailable, never zero',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macro-cache-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const c=new Cache(dir);const result=await c.get('x',1,async()=>{throw new Error('offline');});assert.equal(result.data,null);assert.equal(result.status,'unavailable');assert.equal(c.read('x'),null);
});
test('failed source health survives restart until a successful refresh',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macro-health-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const c=new Cache(dir);await c.get('sample',10000,async()=>({value:1}));await c.get('sample',10000,async()=>{throw new Error('source offline');},true);
 const reloaded=new Cache(dir);const stale=await reloaded.get('sample',10000,async()=>({value:2}));assert.equal(stale.status,'stale');assert.equal(stale.error,'source offline');const current=await reloaded.get('sample',10000,async()=>({value:2}),true);assert.equal(current.status,'current');assert.equal(current.error,undefined);
});
