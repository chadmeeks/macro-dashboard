const test=require('node:test');
const assert=require('node:assert/strict');
const {radius,windowData}=require('../public/strategy-chart');
const snapshot=require('../data/strategy-purchases.json');
test('dot area represents BTC quantity, including negative entries',()=>{
 assert.ok(Math.abs(radius(4000)**2/radius(1000)**2-4)<1e-12);
 assert.equal(radius(-1000),radius(1000));
 assert.equal(radius(0),0);
});
test('chart windows use calendar time, preserve negative entries and exclude future or invalid data',()=>{
 const history=[{date:'2020-08-10',btc:100,price:10000},{date:'2026-09-01',btc:-50,price:60000},{date:'2026-12-01',btc:10,price:90000}];
 const prices=[{date:'2020-01-01',value:9000},{date:'2026-10-10',value:80000},{date:'2026-10-11',value:null}];
 const result=windowData(history,prices,365,'2026-10-11');
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].btc,-50);
 assert.equal(result.prices.length,1);assert.equal(result.end,'2026-10-10');
 assert.equal(windowData(history,[],0,'2026-10-11').rows.length,2);
 assert.deepEqual(windowData([],prices),{rows:[],prices:[]});
});
test('saved ledger covers all 122 source rows with valid dates, signed costs and prices',()=>{
 assert.equal(snapshot.history.length,122);
 assert.equal(snapshot.history[0].date,'2020-08-10');
 assert.equal(snapshot.history.at(-1).date,snapshot.asOf);
 assert.equal(new Set(snapshot.history.map(p=>p.id)).size,122);
 for(const [i,p] of snapshot.history.entries()){
  assert.equal(p.id,i+1);
  assert.equal(new Date(p.date).toISOString().slice(0,10),p.date);
  assert.ok(p.price>0&&p.holdings>0&&p.btc!==0);
  assert.ok(p.costUsd===0||Math.sign(p.costUsd)===Math.sign(p.btc));
 }
});
