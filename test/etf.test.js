const test=require('node:test');const assert=require('node:assert/strict');const {parseEtfCsv,summarize}=require('../lib/etf');
const header='date,net_flow_usd,reported_funds,expected_funds,status\n';
test('ETF imports reject incomplete rows labeled complete, bad dates, duplicates and wrong units',()=>{
 assert.throws(()=>parseEtfCsv(header+'2026-09-25,,11,11,complete'),/complete/);
 assert.throws(()=>parseEtfCsv(header+'2026-09-25,1,10,11,complete'),/complete/);
 assert.throws(()=>parseEtfCsv(header+'2026-02-30,1,11,11,complete'),/date/);
 assert.throws(()=>parseEtfCsv(header+'2026-09-26,1,11,11,complete'),/weekend/);
 assert.throws(()=>parseEtfCsv(header+'2026-09-25,1,11,11,complete\n2026-09-25,2,11,11,complete'),/duplicate/);
 assert.throws(()=>parseEtfCsv(header+'2026-09-25,100M,11,11,complete'),/amount/);
 assert.throws(()=>parseEtfCsv(header+'2099-09-25,1,11,11,complete'),/future/);
});
test('ETF totals include genuine zeros, withhold partial windows and never skip them',()=>{
 const rows=parseEtfCsv(header+['2026-09-21,"1,000",11,11,complete','2026-09-22,-200,11,11,complete','2026-09-23,0,11,11,complete','2026-09-24,300,11,11,complete','2026-09-25,400,11,11,complete'].join('\n'));
 assert.equal(summarize(rows).flow5,1500);assert.equal(summarize(rows).flow20,null);
 assert.equal(summarize([...rows.slice(0,4),{...rows[4],status:'partial',reported:10}]).flow5,null);
 assert.equal(summarize([...rows.slice(0,4),{...rows[4],expected:12,reported:12}]).flow5,null);
 assert.equal(parseEtfCsv(header+'2026-09-25,,0,11,pending')[0].total,null);
});

test('per-fund imports distinguish inactive funds from missing reports and validate sums',()=>{
 const header='date,net_flow_usd,reported_funds,expected_funds,status,fund_ibit_usd,fund_gbtc_usd,fund_btc_usd\n';
 const p=parseEtfCsv(header+'2026-09-01,500000,2,2,complete,1000000,-500000,not_active')[0];assert.deepEqual(p.funds,{IBIT:1000000,GBTC:-500000});
 const partial=parseEtfCsv(header+'2026-09-01,1000000,1,2,partial,1000000,,not_active')[0];assert.equal(partial.funds.GBTC,null);
 assert.throws(()=>parseEtfCsv(header+'2026-09-01,5000000,2,2,complete,1000000,-500000,not_active'),/reconcile/);
 assert.throws(()=>parseEtfCsv(header+'2026-09-01,500000,1,2,partial,1000000,-500000,not_active'),/coverage/);
});
