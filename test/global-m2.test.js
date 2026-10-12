const test=require('node:test'),assert=require('node:assert/strict');
const {parseGlobalM2}=require('../lib/global-m2');
const {prepare}=require('../public/global-m2-chart');
test('Global M2 parses USD without rescaling, orders dates and excludes future observations',()=>{
 const d=parseGlobalM2([[Date.parse('2026-10-05'),125e12],[Date.parse('2026-09-28'),124e12],[Date.parse('2026-10-19'),126e12]],'2026-10-12');
 assert.equal(d.asOf,'2026-10-05');assert.deepEqual(d.history,[{date:'2026-09-28',value:124e12},{date:'2026-10-05',value:125e12}]);
 for(const bad of [[],{},[[0,null]],[[0,-1]],[[0,1],[0,2]],[[1e20,2]]])assert.throws(()=>parseGlobalM2(bad));
});
test('overlay retains separate dates and never extends money supply to the latest Bitcoin date',()=>{
 const m=[{date:'2026-09-01',value:100},{date:'2026-09-08',value:110}],b=[{date:'2026-09-01',value:10},{date:'2026-09-02',value:12},{date:'2026-10-01',value:15}];
 const d=prepare(m,b,0);assert.equal(d.end,'2026-10-01');assert.equal(d.money.at(-1).date,'2026-09-08');assert.equal(d.rows.find(p=>p.date==='2026-09-02').m2,undefined);
 const indexed=prepare(m,b,0,true);assert.equal(indexed.base.date,'2026-09-01');assert.equal(indexed.money[0].plot,100);assert.equal(indexed.bitcoin[0].plot,100);assert.equal(indexed.bitcoin[1].plot,120);
 assert.deepEqual(prepare(m,[{date:'2026-09-03',value:10}],0,true).rows,[]);
 assert.deepEqual(prepare([],b).rows,[]);
 assert.equal(m[0].plot,undefined);
});
test('overlay range uses elapsed days and common initial coverage',()=>{
 const m=[{date:'2020-01-01',value:100},{date:'2025-10-01',value:110},{date:'2026-10-01',value:120}],b=[{date:'2025-10-01',value:10},{date:'2026-10-02',value:20}];
 const d=prepare(m,b,365);assert.equal(d.money.length,1);assert.equal(d.start,'2025-10-02');
 assert.equal(prepare(m,b,0).start,'2025-10-01');
});
