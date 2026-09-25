'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const A=require('../lib/analytics');
const rows=(start,count,fn=i=>i+1)=>Array.from({length:count},(_,i)=>({date:A.iso(Date.parse(start)+i*A.DAY),value:fn(i)}));
test('missing observations stay missing, including FRED gaps',()=>{assert.equal(A.number(null),null);assert.equal(A.number(''),null);assert.equal(A.number('.'),null);assert.equal(A.number('0'),0);assert.deepEqual(A.parseFred('observation_date,X\n2026-01-01,.\n2026-01-02,4\n'),[{date:'2026-01-02',value:4}]);assert.throws(()=>A.parseFred('<html>Denied</html>'));});
test('liquidity aligns dates and units, and refuses old or unmatched inputs',()=>{
 const fed=[{date:'2026-01-07',value:7000000},{date:'2026-01-14',value:7100000},{date:'2026-01-21',value:7200000}];
 const tga=[{date:'2026-01-07',value:800000},{date:'2026-01-14',value:900000}];
 const rrp=[{date:'2026-01-06',value:100},{date:'2026-01-08',value:999},{date:'2026-01-14',value:200}];
 assert.deepEqual(A.liquidity(fed,rrp,tga),[{date:'2026-01-07',value:6100},{date:'2026-01-14',value:6000}]);
 assert.deepEqual(A.liquidity(fed,[{date:'2025-12-31',value:100}],tga),[]);
});
test('30-day change uses calendar time rather than observation count',()=>{
 const p=[{date:'2026-01-01',value:100},{date:'2026-01-08',value:110},{date:'2026-01-31',value:125}];
 assert.equal(A.change(p,30),25);assert.equal(A.change(p,30,'difference'),25);assert.equal(A.change(p,365),null);
});
test('daily and weekly averages require consecutive observations',()=>{
 const daily=rows('2026-01-01',201);assert.equal(A.last(A.sma(daily,200)).value,101.5);
 assert.equal(A.last(A.sma(daily.filter((_,i)=>i!==100),200)).value,null);
 const many=rows('2020-01-01',1500);const weeks=A.weeklyCloses(many,'2024-02-09');
 assert.ok(weeks.every(p=>new Date(p.date).getUTCDay()===0));
 assert.equal(A.last(A.sma(weeks,200,7)).value,weeks.slice(-200).reduce((s,p)=>s+p.value,0)/200);
 assert.ok(A.weeklyCloses([{date:'2026-01-04',value:1}],'2026-01-04').length===0);
});
test('RSI handles upward, downward, flat and incomplete histories',()=>{
 const weekly=Array.from({length:20},(_,i)=>({date:A.iso(Date.parse('2025-01-05')+i*7*A.DAY),value:i+1}));
 assert.equal(A.rsi(weekly),100);assert.equal(A.rsi(weekly.map(p=>({...p,value:-p.value}))),0);
 assert.equal(A.rsi(weekly.map(p=>({...p,value:10}))),50);assert.equal(A.rsi(weekly.slice(0,5)),null);
 assert.equal(A.rsi(weekly.filter((_,i)=>i!==15)),null);
});
test('returns, YTD and volatility use completed history without inventing zero',()=>{
 const p=rows('2024-01-01',740,i=>100*Math.exp(i*.001));const stats=A.technicals(p);
 assert.ok(Math.abs(stats.volatility)<1e-10);assert.ok(stats.returns.ytd>0);assert.equal(stats.drawdown,0);
 assert.equal(A.technicals(rows('2026-01-01',3)).returns.ytd,null);
 assert.equal(A.technicals(rows('2026-01-01',3)).ma200,null);
 assert.equal(A.technicals(rows('2026-01-01',3)).volatility,null);
 assert.equal(stats.weekly.at(-1).date<=stats.asOf,true);
});
test('FOMC parser uses final published meeting day, handles years and rejects changed markup',()=>{
 const html='<h4>2026 FOMC Meetings</h4><div class="fomc-meeting__month x"><strong>October</strong></div><div class="fomc-meeting__date x">27-28*</div><h4>2027 FOMC Meetings</h4><div class="fomc-meeting__month x"><strong>January</strong></div><div class="fomc-meeting__date x">26-27</div>';
 const e=A.parseFomc(html);assert.equal(e[0].date,'2026-10-28');assert.equal(e[1].date,'2027-01-27');assert.match(e[0].note,/projections/);assert.throws(()=>A.parseFomc('blocked'));
});
test('monthly comparisons handle February, 30-day months and year boundaries',()=>{
 for(const [previous,current] of [['2026-02-01','2026-03-01'],['2026-04-01','2026-05-01'],['2025-12-01','2026-01-01']])assert.equal(A.monthlyChange([{date:previous,value:100},{date:current,value:110}]),10);
 assert.equal(A.monthlyChange([{date:'2026-01-01',value:100},{date:'2026-03-01',value:110}]),null);
});
