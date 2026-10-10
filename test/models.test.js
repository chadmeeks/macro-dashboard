const test=require('node:test'),assert=require('node:assert/strict'),M=require('../public/models');
const DAY=86400000,iso=t=>new Date(t).toISOString().slice(0,10);
function fixture(n=1000){return Array.from({length:n},(_,i)=>{const date=iso(Date.parse('2015-01-01')+i*DAY),days=(Date.parse(date)-Date.parse('2009-01-03'))/DAY;return {date,value:10**(-12+4.5*Math.log10(days))};});}
test('power-law fit recovers coefficients and never learns from later prices',()=>{
 const prices=fixture(),cutoff=prices[599].date,a=M.fit(prices,cutoff);
 assert.ok(Math.abs(a.a+12)<1e-9);assert.ok(Math.abs(a.b-4.5)<1e-9);assert.equal(a.n,600);
 const changed=prices.map(p=>p.date>cutoff?{...p,value:p.value*500}:p);
 assert.deepEqual(M.fit(changed,cutoff),a);assert.equal(M.fit(prices,prices[100].date),null);
 assert.ok(Math.abs(M.power(prices[800].date,a)/prices[800].value-1)<1e-10);
});
test('S2F uses backward observed issuance, original coefficients and lost-coin adjustment',()=>{
 const supply=Array.from({length:70},(_,i)=>({date:iso(Date.parse('2020-01-01')+i*DAY),value:18000000+i*1800})),map=M.stockToFlow(supply),p=supply[30];
 assert.equal(map.has(supply[29].date),false);
 assert.ok(Math.abs(map.get(p.date)/(Math.exp(14.6)*((p.value-1000000)/(1800*365.25))**3.3/p.value)-1)<1e-12);
 assert.equal(M.stockToFlow(supply.filter((_,i)=>i!==0)).has(p.date),false);
 assert.equal(M.stockToFlow(supply.map(p=>({...p,value:18000000}))).size,0);
});
test('scorecard uses complete month ends and excludes fitting dates from subsequent scores',()=>{
 const rows=[{date:'2020-01-31',price:100,power:120},{date:'2020-02-29',price:100,power:150},{date:'2020-03-15',price:100,power:1000}];
 assert.deepEqual(M.errors(rows,'power','2020-02-01','2020-03-15'),{n:1,value:50,start:'2020-02-29',end:'2020-02-29'});
 const b=M.build({prices:fixture(),cutoff:'2016-01-01'});assert.ok(b.scores[0].fit.end< b.scores[0].subsequent.start);
 assert.equal(M.build({prices:fixture()}).scores[0].subsequent.n,0);
});
test('projections contain no invented observations; realized-price ratios match source and date',()=>{
 const prices=fixture(),last=prices.at(-1),previous=prices.at(-2),b=M.build({prices,cutoff:'2016-01-01',projection:true,valuation:[{date:previous.date,price:100,realizedPrice:50}]});
 const future=b.rows.filter(p=>p.date>last.date);assert.equal(future.at(-1).date,iso(Date.parse(last.date)+365*DAY));
 assert.ok(future.every(p=>p.projection>0&&p.price===undefined&&p.s2f===undefined&&p.realized===undefined&&p.ma200w===undefined));
 assert.equal(b.scores[2].deviation,100);assert.equal(b.scores[2].date,previous.date);assert.equal(b.rows.find(p=>p.date===last.date).realized,null);
 assert.equal(b.scores[1].value,null);assert.equal(M.build({prices:[]}),null);
});
test('weekly references expire, and missing week does not forward fill',()=>{
 const prices=fixture(),sunday=prices.find(p=>new Date(p.date).getUTCDay()===0),start=prices.findIndex(p=>p.date===sunday.date);
 const b=M.build({prices,weekly:[{date:sunday.date,value:123}]});assert.equal(b.rows[start+6].ma200w,123);assert.equal(b.rows[start+7].ma200w,null);
});

test('calendar horizons clamp leap day and support five years',()=>{
 assert.equal(M.horizon('2024-02-29',1),'2025-02-28');assert.equal(M.horizon('2026-10-04',5),'2031-10-04');
});
test('every reference extends independently without changing history or scores',()=>{
 const prices=fixture(1800),supply=prices.map((p,i)=>({date:p.date,value:18000000+i*900})),valuation=prices.map((p,i)=>({date:p.date,price:p.value,realizedPrice:1000*Math.exp(i*.001)}));
 const weekly=prices.filter(p=>new Date(p.date).getUTCDay()===0).map(p=>({date:p.date,value:2000}));
 const b=M.build({prices,supply,valuation,weekly}),before=JSON.stringify(b);
 for(const key of ['power','s2f','realized','ma200w'])for(const years of [1,5]){
  const e=M.extend(b,{key,years,prices,supply});assert.equal(e.reason,null,key);assert.equal(e.rows.at(-1).date,M.horizon(b.asOf,years));assert.ok(e.rows.at(-1).scenario>0,key);
  assert.ok(e.rows.filter(p=>p.date>b.asOf).every(p=>p.price===undefined&&p.power===undefined&&p.s2f===undefined&&p.realized===undefined&&p.ma200w===undefined));
 }
 assert.equal(JSON.stringify(b),before);
 const trend=M.extend(b,{key:'realized',years:1,prices,supply});assert.ok(Math.abs(trend.rows.at(-1).scenario/(valuation.at(-1).realizedPrice*Math.exp((Date.parse(trend.rows.at(-1).date)-Date.parse(b.asOf))/DAY*.001))-1)<1e-10);
 const average=M.extend(b,{key:'ma200w',years:5,prices,supply});assert.ok(Math.abs(average.rows.at(-1).scenario/prices.at(-1).value-1)<1e-10);
});
test('issuance scenario respects subsidy transition and refuses missing inputs',()=>{
 // End of the 6.25 BTC epoch: first 100 blocks at 6.25, remaining 44 at 3.125.
 assert.equal(M.nextSupply(19687500-625),19687500+44*3.125);
 const prices=fixture(1800),b=M.build({prices});assert.match(M.extend(b,{key:'s2f',years:5,prices}).reason,/unavailable/);
 assert.match(M.extend(b,{key:'realized',years:5,prices}).reason,/unavailable/);
 assert.equal(M.extend(b,{key:'power',years:0}).rows,b.rows);
});
