const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {History,companyChanges}=require('../lib/history');
function make(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macro-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,h:new History(dir)};}
test('revision archive survives restart and separates new observations from revisions',t=>{
 const {dir,h}=make(t);h.record('fred-X',[{date:'2026-01-01',value:1}],1000);h.record('fred-X',[{date:'2026-01-01',value:2},{date:'2026-01-02',value:3}],2000);
 const saved=new History(dir).read('fred-X');assert.equal(saved.events.length,1);assert.equal(saved.events[0].count,1);assert.equal(saved.events[0].changes[0].before,1);assert.equal(saved.observations['2026-01-02'].value,3);
 h.record('fred-X',[{date:'2026-01-01',value:1}],1000);assert.equal(h.read('fred-X').observations['2026-01-01'].value,2);
});
test('price provider changes are not mislabeled as revisions',t=>{
 const {h}=make(t);h.record('bitcoin',{source:'A',history:[{date:'2026-01-01',value:10}]},1000);h.record('bitcoin',{source:'B',history:[{date:'2026-01-01',value:12}]},2000);assert.equal(h.read('bitcoin').events[0].type,'source-change');
});
test('corporate snapshots distinguish balance changes and coverage changes',t=>{
 const {dir,h}=make(t);const a={source:'Provider',total:10,companies:[{name:'A',symbol:'A',btc:10}]};h.record('adoption',a,1000);h.record('adoption',a,2000);assert.equal(h.adoption().snapshots.length,1);
 const b={source:'Provider',total:25,companies:[{name:'A',symbol:'A',btc:12},{name:'B',symbol:'B',btc:13}]};h.record('adoption',b,3000);
 const saved=new History(dir).adoption();assert.equal(saved.snapshots.length,2);assert.equal(saved.changes[0].changes[0].delta,2);assert.equal(saved.changes[0].changes[1].type,'added');assert.equal(saved.changes[0].changes[1].delta,null);
 assert.equal(companyChanges(b.companies,a.companies).find(c=>c.symbol==='B').type,'removed');
});

test('supply observations are archived and revised like price history',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'macro-supply-'));
 try{const h=new History(directory);h.record('supply',{source:'Coin Metrics',history:[{date:'2026-09-01',value:20000000}]},Date.parse('2026-09-02'));h.record('supply',{source:'Coin Metrics',history:[{date:'2026-09-01',value:20000001}]},Date.parse('2026-09-03'));const summary=h.summary(['supply']).feeds[0];assert.equal(summary.observations,1);assert.equal(summary.revisions,1);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
