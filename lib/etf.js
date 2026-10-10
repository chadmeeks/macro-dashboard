'use strict';
// Aggregate reported ETF flows. Missing/incomplete sessions never contribute to rolling totals.
function parseCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('CSV contains an unclosed quote.');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
function parseEtfCsv(text,{now=Date.now()}={}){
  if(typeof text!=='string'||Buffer.byteLength(text)>500000)throw new Error('Choose a CSV smaller than 500 KB.');
  const table=parseCsv(text.replace(/^\uFEFF/,''));
  const headers=table.shift()?.map(s=>s.trim().toLowerCase());
  const required=['date','net_flow_usd','reported_funds','expected_funds','status'];
  if(!headers||required.some(k=>!headers.includes(k)))throw new Error(`CSV requires: ${required.join(', ')}.`);
  if(!table.length||table.length>5000)throw new Error('Include between 1 and 5,000 reported sessions.');
  const fundHeaders=headers.filter(h=>/^fund_[a-z0-9]+_usd$/.test(h));
  const seen=new Set();
  const history=table.map((cells,i)=>{
    const get=k=>(cells[headers.indexOf(k)]||'').trim();
    const date=get('date'),status=get('status').toLowerCase();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>new Date(now).toISOString().slice(0,10))throw new Error(`Row ${i+2}: invalid or future date.`);
    if(seen.has(date))throw new Error(`Row ${i+2}: duplicate session date.`);seen.add(date);
    if([0,6].includes(new Date(date).getUTCDay()))throw new Error(`Row ${i+2}: US trading sessions cannot fall on a weekend.`);
    const reported=Number(get('reported_funds')),expected=Number(get('expected_funds'));
    if(!get('reported_funds')||!get('expected_funds')||!Number.isInteger(reported)||!Number.isInteger(expected)||reported<0||expected<1||reported>expected||expected>100)throw new Error(`Row ${i+2}: invalid fund coverage.`);
    if(!['complete','partial','pending'].includes(status))throw new Error(`Row ${i+2}: status must be complete, partial, or pending.`);
    const raw=get('net_flow_usd').replace(/,/g,'');
    const total=raw===''?null:Number(raw);
    if(total!==null&&(!Number.isFinite(total)||Math.abs(total)>1e12))throw new Error(`Row ${i+2}: invalid USD amount.`);
    if(status==='complete'&&(total===null||reported!==expected))throw new Error(`Row ${i+2}: complete sessions need a total and all expected funds.`);
    const funds={};
    for(const header of fundHeaders){
      const raw=get(header),ticker=header.slice(5,-4).toUpperCase();
      if(raw==='not_active')continue;
      const value=raw===''?null:Number(raw.replace(/,/g,''));
      if(value!==null&&(!Number.isFinite(value)||Math.abs(value)>1e12))throw new Error(`Row ${i+2}: invalid fund amount.`);
      funds[ticker]=value;
    }
    if(fundHeaders.length){
      const values=Object.values(funds),known=values.filter(v=>v!==null);
      if(values.length!==expected||known.length!==reported)throw new Error(`Row ${i+2}: fund detail does not match coverage.`);
      if(total!==null&&Math.abs(known.reduce((a,b)=>a+b,0)-total)>(known.length+1)*50000)throw new Error(`Row ${i+2}: fund details do not reconcile with total within source rounding.`);
    }
    return {date,total,reported,expected,status,...(fundHeaders.length?{funds}:{})};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  return history;
}
function summarize(history){
  const last=history.at(-1);
  function rolling(n){const rows=history.slice(-n);return rows.length===n&&rows.every(p=>p.status==='complete'&&p.reported===p.expected&&p.total!==null)&&rows.every(p=>p.expected===rows[0].expected)?rows.reduce((sum,p)=>sum+p.total,0):null;}
  return {history,asOf:last.date,latest:last,flow5:rolling(5),flow20:rolling(20),complete:history.filter(p=>p.status==='complete').length};
}
module.exports={parseEtfCsv,summarize};
