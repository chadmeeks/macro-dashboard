const test=require('node:test'),assert=require('node:assert/strict');
const {build,CYCLE_DAYS}=require('../public/spiral-chart');
test('one 1461-day rotation returns to the same angle with a new loop',()=>{
 const m=build([{date:'2009-01-03',value:1},{date:'2010-01-03',value:1},{date:'2013-01-03',value:1}],'2013-01-03');
 assert.equal(CYCLE_DAYS,1461);assert.equal(m.points[0].loop,0);assert.equal(m.points[2].loop,1);
 assert.equal(m.points[0].angle,m.points[2].angle);assert.equal(m.points[2].day,0);
 assert.ok(m.points[1].x>0);assert.ok(Math.abs(m.points[1].y)<.002);
 assert.deepEqual(m.loops.map(l=>l.start),['2009-01-03','2013-01-03']);
});
test('logarithmic radii preserve sub-dollar prices and equal spacing for tenfold price moves',()=>{
 const values=[.001,.01,.1,1,10,100000],m=build(values.map((value,i)=>({date:`2010-01-0${i+1}`,value})),'2010-01-06');
 const r=m.points.map(p=>p.r);assert.ok(r.every(v=>v>0&&v<=1));
 assert.ok(Math.abs((r[1]-r[0])-(r[4]-r[3]))<1e-12);
 assert.ok(m.rings.some(r=>r.value===.001));assert.ok(m.rings.some(r=>r.value===100000));
});
test('spiral orders and deduplicates dates, rejects invalid prices and never fills gaps or includes future prices',()=>{
 const m=build([{date:'2010-01-03',value:5},{date:'2010-01-01',value:1},{date:'2010-01-01',value:2},{date:'2010-01-02',value:0},{date:'2010-02-30',value:4},{date:'2008-01-01',value:1},{date:'2011-01-01',value:99},{date:'2010-01-04',value:null}],'2010-12-31');
 assert.deepEqual(m.points.map(p=>[p.date,p.value]),[['2010-01-01',2],['2010-01-03',5]]);
 assert.deepEqual(build([],'2026-10-12'),{points:[],rings:[],loops:[]});
});
