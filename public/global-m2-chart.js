'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GlobalM2Chart=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 function prepare(money,bitcoin,days=1095,indexed=false){
  const clean=rows=>rows.filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&Number.isFinite(p.value)&&p.value>0).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const m=clean(money),b=clean(bitcoin);if(!m.length||!b.length)return {rows:[],money:[],bitcoin:[]};
  const end=[m.at(-1).date,b.at(-1).date].sort().at(-1),first=[m[0].date,b[0].date].sort().at(-1);
  let start=days?[first,new Date(Date.parse(end)-days*86400000).toISOString().slice(0,10)].sort().at(-1):first;
  let mm=m.filter(p=>p.date>=start),bb=b.filter(p=>p.date>=start),base=null;
  if(indexed){const bm=new Map(bb.map(p=>[p.date,p.value]));const match=mm.find(p=>bm.has(p.date));if(!match)return {rows:[],money:[],bitcoin:[]};base={date:match.date,m2:match.value,btc:bm.get(match.date)};start=base.date;mm=mm.filter(p=>p.date>=start).map(p=>({...p,plot:p.value/base.m2*100}));bb=bb.filter(p=>p.date>=start).map(p=>({...p,plot:p.value/base.btc*100}));}
  else{mm=mm.map(p=>({...p,plot:p.value}));bb=bb.map(p=>({...p,plot:p.value}));}
  const map=new Map();for(const [key,points] of [['m2',mm],['btc',bb]])for(const p of points){if(!map.has(p.date))map.set(p.date,{date:p.date});map.get(p.date)[key]=p.value;}
  return {rows:[...map.values()].sort((a,b)=>a.date.localeCompare(b.date)),money:mm,bitcoin:bb,start,end,base};
 }
 return {prepare};
});

function globalM2Panel(){
 const m=data('globalm2');
 return `<article class="card chart-card global-m2-card"><div class="card-head"><div><p class="kicker">GLOBAL MONEY & BITCOIN</p><h2 style="margin-top:9px">Global M2 & Bitcoin price</h2><p class="fine-print">Global M2 proxy · 21 economies · converted to US dollars</p></div>${badge(state.feeds.globalm2?.status)}</div>
 <div class="model-options"><div class="segmented" aria-label="Global M2 chart period">${[[365,'1Y'],[1095,'3Y'],[0,'ALL']].map(([n,l])=>`<button data-global-m2-period="${n}" class="${state.globalM2Period===n?'selected':''}" aria-pressed="${state.globalM2Period===n}">${l}</button>`).join('')}</div><div class="segmented" aria-label="Global M2 chart scale">${[['levels','Dollar levels'],['indexed','Indexed to 100']].map(([v,l])=>`<button data-global-m2-mode="${v}" class="${state.globalM2Mode===v?'selected':''}" aria-pressed="${state.globalM2Mode===v}">${l}</button>`).join('')}</div></div>
 <div class="chart-legend"><span><i class="legend-dot" style="background:#75916f"></i>Global M2 · ${state.globalM2Mode==='levels'?'USD trillions · left axis':'index'}</span><span><i class="legend-dot" style="background:#cd783e"></i>Bitcoin · ${state.globalM2Mode==='levels'?'USD · right axis':'index'}</span></div><div id="global-m2-chart" class="chart"></div>
 <p class="fine-print">${state.globalM2Mode==='levels'?'Each axis scales independently; matching line heights do not mean equal values or establish correlation.':'Both series start at 100 on the first shared observation date in the selected window.'} Dates are aligned without a lead or lag. Lines stop at each source’s last observation.</p>
 ${source('globalm2')}${m?`<p class="fine-print">${esc(m.coverage)} ${esc(m.method)} Weekly source observations may include older monthly releases. Observation dates are not publication dates.</p>`:''}${source('bitcoin')}
 </article>`;
}

function renderGlobalM2Chart(){
 const el=$('global-m2-chart');if(!el)return;
 const m=data('globalm2'),b=data('bitcoin');
 if(!m?.history?.length||!b?.history?.length){el.innerHTML=empty(!m?.history?.length?'globalm2':'bitcoin','Both Global M2 and Bitcoin history are needed for this chart.');return;}
 const indexed=state.globalM2Mode==='indexed',d=GlobalM2Chart.prepare(m.history,b.history,state.globalM2Period,indexed),{rows}=d;
 if(!rows.length||!d.money.length||!d.bitcoin.length){el.innerHTML='<div class="empty">No overlapping observations in this window.</div>';return;}
 const W=Math.max(260,el.clientWidth),H=310,L=58,R=65,T=22,B=30,first=Date.parse(d.start),span=Date.parse(d.end)-first||1;
 const x=date=>L+(Date.parse(date)-first)/span*(W-L-R);
 function scale(values){let lo=Math.min(...values),hi=Math.max(...values),pad=(hi-lo||Math.abs(hi)||1)*.09;lo=Math.max(0,lo-pad);hi+=pad;return {lo,hi,y:v=>T+(hi-v)/(hi-lo)*(H-T-B)};}
 const shared=indexed?scale([...d.money,...d.bitcoin].map(p=>p.plot)):null,left=shared||scale(d.money.map(p=>p.plot)),right=shared||scale(d.bitcoin.map(p=>p.plot));
 const grids=Array.from({length:5},(_,i)=>{const a=left.lo+(left.hi-left.lo)*i/4,c=right.lo+(right.hi-right.lo)*i/4,yy=left.y(a);return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}"/><text class="chart-axis" x="${L-9}" y="${yy+4}" text-anchor="end" style="fill:#75916f">${indexed?num(a):money(a/1e12,1)+'T'}</text>${indexed?'':`<text class="chart-axis" x="${W-R+8}" y="${yy+4}" style="fill:#cd783e">${money(c/1000,0)}k</text>`}`;}).join('');
 function path(points,axis,gap,color){const line=points.map((p,i)=>`${i&&Date.parse(p.date)-Date.parse(points[i-1].date)<=gap*86400000?'L':'M'}${x(p.date).toFixed(2)},${axis.y(p.plot).toFixed(2)}`).join(' ');return `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;}
 const ticks=[0,.5,1].map((n,i)=>{const day=new Date(first+span*n).toISOString().slice(0,10);return `<text class="chart-axis" x="${x(day)}" y="${H-6}" text-anchor="${['start','middle','end'][i]}">${new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'})}</text>`;}).join('');
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Global M2 and Bitcoin price ${indexed?'indexed to 100':'on separate dollar axes'}"><title>Global M2 and Bitcoin, same dates</title>${grids}${path(d.money,left,10,'#75916f')}${path(d.bitcoin,right,1,'#cd783e')}${ticks}<line class="chart-cross" y1="${T}" y2="${H-B}"/></svg><input class="chart-range" type="range" min="0" max="${rows.length-1}" value="${rows.length-1}" aria-label="Inspect Global M2 and Bitcoin by date"><p class="fine-print global-m2-inspection" role="status"></p><p class="fine-print">${d.base?`Index baseline: ${date(d.base.date)}. `:''}M2 coverage: ${date(d.money[0].date)}–${date(d.money.at(-1).date)} · Bitcoin: ${date(d.bitcoin[0].date)}–${date(d.bitcoin.at(-1).date)}.</p>`;
 const range=el.querySelector('input'),details=el.querySelector('.global-m2-inspection'),cross=el.querySelector('.chart-cross');
 function inspect(i){const p=rows[i];range.value=i;const label=`${date(p.date)} · Global M2: ${valid(p.m2)?money(p.m2/1e12,3)+'T':'no observation on this date'} · Bitcoin: ${valid(p.btc)?money(p.btc,2):'no observation on this date'}${indexed?` · Index M2 / BTC: ${valid(p.m2)?num(p.m2/d.base.m2*100,2):'—'} / ${valid(p.btc)?num(p.btc/d.base.btc*100,2):'—'}`:''}`;range.setAttribute('aria-valuetext',label);details.textContent=label;cross.setAttribute('x1',x(p.date));cross.setAttribute('x2',x(p.date));cross.style.opacity='1';}
 inspect(Math.max(0,rows.findIndex(p=>p.date===d.money.at(-1).date)));
 range.addEventListener('input',()=>inspect(Number(range.value)));
 const svg=el.querySelector('svg');function point(event){const box=svg.getBoundingClientRect(),target=first+((event.clientX-box.left)/box.width*W-L)/(W-L-R)*span;let best=0;rows.forEach((p,i)=>{if(Math.abs(Date.parse(p.date)-target)<Math.abs(Date.parse(rows[best].date)-target))best=i;});inspect(best);}
 svg.addEventListener('pointermove',point);svg.addEventListener('click',point);
}
if(typeof document!=='undefined')document.addEventListener('click',event=>{const period=event.target.closest('[data-global-m2-period]'),mode=event.target.closest('[data-global-m2-mode]');if(period){state.globalM2Period=Number(period.dataset.globalM2Period);render();}if(mode){state.globalM2Mode=mode.dataset.globalM2Mode;render();}});
