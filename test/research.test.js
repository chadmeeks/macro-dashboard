const test=require('node:test');const assert=require('node:assert/strict');const {context,visitChanges}=require('../public/research');
const rows=Array.from({length:31},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,value:i}));
test('historical context excludes future data and reports actual sample coverage',()=>{
 const c=context([...rows,{date:'2027-01-01',value:999}],15,{days:365,asOf:'2026-01-31'});assert.equal(c.count,31);assert.equal(c.percentile,50);assert.equal(c.median,15);assert.equal(c.from,'2026-01-01');assert.equal(c.to,'2026-01-31');assert.equal(c.p10,3);assert.equal(c.p90,27);
 assert.equal(context(rows,15,{days:5,asOf:'2026-01-31'}),null);assert.equal(context(rows,null,{asOf:'2026-01-31'}),null);
 assert.equal(context(rows.map(p=>({...p,value:1})),1,{asOf:'2026-01-31'}).percentile,50);
});
const point=(value,extra={})=>({value,status:'current',label:'Metric',asOf:'2026-01-01',source:'primary',unit:'USD',...extra});
test('last visit separates revisions, new observations and source availability',()=>{
 const before={items:{a:point(100),b:point(1),c:point(4),d:point(8),e:point(10)}};
 const after={items:{a:point(105),b:point(2,{asOf:'2026-01-02'}),c:point(0,{status:'stale'}),d:point(80,{source:'fallback'}),e:point(99,{asOf:'2025-12-31'})}};
 const changes=visitChanges(before,after);assert.equal(changes.length,4);assert.equal(changes[0].revised,true);assert.equal(changes[1].revised,false);assert.equal(changes[2].kind,'availability');assert.equal(changes[3].kind,'source');
 assert.deepEqual(visitChanges(null,after),[]);assert.deepEqual(visitChanges({items:{a:point(null)}},{items:{a:point(0)}}),[]);
});
