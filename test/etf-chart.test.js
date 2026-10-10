const test=require('node:test'),assert=require('node:assert/strict'),{aggregate}=require('../public/etf-chart');
const row=(date,total,status='complete',expected=2)=>({date,total,status,reported:status==='complete'?expected:1,expected});
test('flow candles use cumulative daily balances including opening zero',()=>{
 const rows=[row('2026-09-28',100),row('2026-09-29',-150),row('2026-09-30',80)];
 const w=aggregate(rows,'weekly','2026-10-05')[0];assert.equal(w.date,'2026-09-28');assert.equal(w.end,'2026-10-04');assert.deepEqual([w.open,w.high,w.low,w.close],[0,100,-50,30]);assert.equal(w.ongoing,false);
 const d=aggregate(rows,'daily');assert.deepEqual(d.map(p=>[p.high,p.low,p.close]),[[100,0,100],[0,-150,-150],[80,0,80]]);
});
test('weekly and monthly buckets respect year changes and leap day',()=>{
 const rows=[row('2024-02-29',1),row('2024-03-01',2),row('2024-12-31',3),row('2025-01-01',4)];
 assert.equal(aggregate(rows,'monthly')[0].end,'2024-02-29');assert.deepEqual(aggregate(rows,'monthly').map(p=>p.close),[1,2,3,4]);
 const week=aggregate(rows.slice(-2),'weekly','2025-01-02')[0];assert.equal(week.date,'2024-12-30');assert.equal(week.close,7);assert.equal(week.ongoing,true);
});
test('incomplete rows and unstable fund coverage withhold entire candles; zero stays valid',()=>{
 const rows=[row('2026-09-28',100),row('2026-09-29',null,'pending')];assert.equal(aggregate(rows,'weekly')[0].close,null);assert.match(aggregate(rows,'weekly')[0].reason,/Partial/);
 assert.match(aggregate([rows[0],row('2026-09-29',10,'complete',3)],'weekly')[0].reason,/coverage/);
 assert.equal(aggregate([row('2026-09-28',0)],'daily')[0].close,0);assert.deepEqual(aggregate([]),[]);
 const gaps=aggregate([row('2026-09-01',2),row('2026-09-30',3)],'monthly')[0];assert.equal(gaps.count,2);assert.equal(gaps.first,'2026-09-01');assert.equal(gaps.last,'2026-09-30');assert.equal(gaps.close,5);
});

test('ETF stacks net each product separately and allow documented new fund coverage',()=>{
 const a={...row('2026-09-01',50),funds:{IBIT:100,GBTC:-50}};
 const b={...row('2026-09-02',70,'complete',3),funds:{IBIT:20,GBTC:-10,BTC:60}};
 const p=aggregate([a,b],'monthly')[0];assert.equal(p.stackReason,null);assert.deepEqual(p.funds,{IBIT:120,GBTC:-60,BTC:60});assert.equal(p.positive,180);assert.equal(p.negative,-60);assert.equal(p.reportedTotal,120);
 assert.match(aggregate([row('2026-09-01',50)],'monthly')[0].stackReason,/unavailable/);
 assert.match(aggregate([{...a,status:'partial',funds:{IBIT:100,GBTC:null}}],'monthly')[0].stackReason,/Partial/);
});
