'use strict';
const A=require('./analytics');
function valuationRows(payload,today=A.iso(Date.now())){
  if(!Array.isArray(payload.data)||payload.next_page_url)throw new Error('Incomplete valuation response.');
  const seen=new Map();
  for(const p of payload.data){
    const date=String(p.time||'').slice(0,10),mvrv=A.number(p.CapMVRVCur),price=A.number(p.PriceUSD);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>=today||!(price>0)||!(mvrv>0))continue;
    seen.set(date,{date,price,mvrv,realizedPrice:price/mvrv});
  }
  const rows=[...seen.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length)throw new Error('No aligned MVRV and price observations.');
  return rows;
}
module.exports={valuationRows};
