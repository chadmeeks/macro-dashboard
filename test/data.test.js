const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macro-data-test-'));process.env.MACRO_CACHE_DIR=dir;delete process.env.FRED_API_KEY;
const original=global.fetch;test.after(()=>{global.fetch=original;fs.rmSync(dir,{recursive:true,force:true});});
const {macro}=require('../lib/data');
test('macro refresh isolates failed series and preserves its last good data',async()=>{
 let fail=false;
 global.fetch=async url=>{const id=new URL(url).searchParams.get('id');if(fail&&id==='DGS10')throw new Error('Provider offline');return new Response(`observation_date,${id}\n2026-01-07,100\n2026-01-14,110\n2026-02-04,120\n`);};
 const first=await macro(true);assert.equal(first.metrics.nominal.value,120);fail=true;
 const second=await macro(true);assert.equal(second.metrics.nominal.value,120);assert.equal(second.metrics.nominal.status,'stale');assert.match(second.metrics.nominal.error,/offline/);assert.equal(second.metrics.real.value,120);assert.equal(second.metrics.real.error,undefined);
 assert.ok(Math.abs(second.metrics.liquidity.value-(-120))<1e-8);
});
