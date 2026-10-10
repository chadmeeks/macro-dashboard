const test=require('node:test');const assert=require('node:assert/strict');const {valuationRows}=require('../lib/valuation');
test('valuation uses only positive, completed and exactly aligned source rows',()=>{
 const data=[{time:'2026-01-01',PriceUSD:'100',CapMVRVCur:'2'},{time:'2026-01-02',PriceUSD:'200',CapMVRVCur:null},{time:'2026-01-03',PriceUSD:null,CapMVRVCur:'2'},{time:'2026-01-04',PriceUSD:'100',CapMVRVCur:'0'},{time:'2026-01-05',PriceUSD:'110',CapMVRVCur:'2'}];
 assert.deepEqual(valuationRows({data},'2026-01-05'),[{date:'2026-01-01',price:100,mvrv:2,realizedPrice:50}]);assert.throws(()=>valuationRows({data,next_page_url:'page2'}),/Incomplete/);
});
