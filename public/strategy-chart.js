'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StrategyChart=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 function radius(btc){return 22*Math.sqrt(Math.abs(btc)/55500);}
 function windowData(history,prices,days=0,today=new Date().toISOString().slice(0,10)){
  const ledger=history.filter(p=>p.date<=today&&Number.isFinite(p.btc)&&p.btc!==0&&Number.isFinite(p.price)&&p.price>0).sort((a,b)=>a.date.localeCompare(b.date));
  if(!ledger.length)return {rows:[],prices:[]};
  const market=prices.filter(p=>p.date>=ledger[0].date&&p.date<=today&&Number.isFinite(p.value)&&p.value>0).sort((a,b)=>a.date.localeCompare(b.date));
  const end=[ledger.at(-1).date,market.at(-1)?.date||''].sort().at(-1);
  const start=days?new Date(Date.parse(end)-days*86400000).toISOString().slice(0,10):ledger[0].date;
  return {rows:ledger.filter(p=>p.date>=start),prices:market.filter(p=>p.date>=start),start,end};
 }
 return {radius,windowData};
});

function strategyPanel(){
 const s=data('strategy');
 return `${section('Strategy’s Bitcoin purchases')}<article class="card chart-card strategy-card"><div class="card-head"><div><p class="kicker">MICROSTRATEGY · MSTR</p><h2>The orange dots</h2><p class="fine-print">Each dot tells the story of another reported acquisition.</p></div><span class="badge quiet">${s?'Saved ledger snapshot':'Loading ledger'}</span></div>
 <div class="model-options"><div class="segmented" aria-label="Strategy chart period">${[[365,'1Y'],[1095,'3Y'],[0,'ALL']].map(([n,l])=>`<button data-strategy-period="${n}" class="${state.strategyPeriod===n?'selected':''}" aria-pressed="${state.strategyPeriod===n}">${l}</button>`).join('')}</div><label class="toggle"><input id="strategy-log" type="checkbox" ${state.strategyLog?'checked':''}> Log scale</label></div>
 <div id="strategy-chart" class="chart strategy-chart"></div>
 <div class="chart-legend"><span><i class="legend-dot" style="background:#768dac"></i>Bitcoin daily price</span><span><i class="legend-dot" style="background:#ef8b2c"></i>Reported acquisition</span><span><i class="legend-dot" style="background:transparent;border:1px solid #b75e50"></i>Negative acquisition entry</span></div>
 <div class="strategy-size-key" aria-label="Dot size legend">${[1000,10000,50000].map(n=>`<span><svg width="48" height="46" aria-hidden="true"><circle cx="24" cy="23" r="${StrategyChart.radius(n)}" fill="#ef8b2c" fill-opacity=".7"/></svg>${num(n)} BTC</span>`).join('')}</div>
 <p class="fine-print">Dot area is proportional to reported BTC acquired; vertical position is the reported average acquisition price. Dates are disclosure dates, not individual trade dates. Ledger rows may summarize net activity within a reporting period. Hollow red dots preserve negative entries.</p>
 ${s?`<div class="source-line"><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.source)} ↗</a> · Saved ${date(s.capturedAt)} · Reports through ${date(s.asOf)}</div><p class="fine-print">Purchase data is a saved snapshot and does not update with Refresh data. The Bitcoin price line uses the dashboard’s separate price feed.</p>`:empty('strategy','Strategy ledger unavailable')}
 </article>`;
}

function renderStrategyChart(){
 const el=$('strategy-chart');if(!el)return;
 const s=data('strategy'),b=data('bitcoin');
 if(!s?.history?.length){el.innerHTML=empty('strategy','Strategy ledger unavailable');return;}
 const {rows,prices,start,end}=StrategyChart.windowData(s.history,b?.history||[],state.strategyPeriod);
 if(!rows.length&&!prices.length){el.innerHTML='<p class="empty">No observations in this period.</p>';return;}
 const W=Math.max(260,el.clientWidth),H=340,L=25,R=66,T=28,B=32;
 const from=Date.parse(start),to=Math.max(from+86400000,Date.parse(end));
 const x=d=>L+(Date.parse(d)-from)/(to-from)*(W-L-R);
 const transform=v=>state.strategyLog?Math.log10(v):v;
 const values=[...rows.map(p=>p.price),...prices.map(p=>p.value)].map(transform);
 let lo=Math.min(...values),hi=Math.max(...values);const pad=(hi-lo||1)*.12;lo=state.strategyLog?lo-pad:Math.max(0,lo-pad);hi+=pad;
 const y=v=>T+(hi-transform(v))/(hi-lo)*(H-T-B);
 const grid=Array.from({length:5},(_,i)=>{const t=lo+(hi-lo)*i/4,v=state.strategyLog?10**t:t;return `<line class="chart-grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-axis" x="${W-R+8}" y="${y(v)+4}">${money(v/1000,0)}k</text>`;}).join('');
 // A missing daily observation breaks the line instead of bridging the gap.
 const path=prices.map((p,i)=>`${i&&Date.parse(p.date)-Date.parse(prices[i-1].date)===86400000?'L':'M'}${x(p.date).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
 const describe=p=>`Reported ${date(p.date)} · ${p.btc>0?'Acquired':'Negative acquisition'}: ${num(p.btc)} BTC · Average price: ${money(p.price)} · Reported cost: ${money(p.costUsd/1e6)}M (rounded) · Holdings: ${num(p.holdings)} BTC`;
 const dots=rows.map((p,i)=>`<g data-purchase="${i}"><circle cx="${x(p.date)}" cy="${y(p.price)}" r="${StrategyChart.radius(p.btc)}" fill="${p.btc>0?'#ef8b2c':'none'}" fill-opacity=".75" stroke="${p.btc>0?'#cf6e17':'#b75e50'}" stroke-width="${p.btc>0?.6:1.5}"/><circle cx="${x(p.date)}" cy="${y(p.price)}" r="${Math.max(7,StrategyChart.radius(p.btc))}" fill="transparent"><title>${esc(describe(p))}</title></circle></g>`).join('');
 const ticks=[0,.5,1].map((n,i)=>{const d=new Date(from+(to-from)*n).toISOString().slice(0,10);return `<text class="chart-axis" x="${x(d)}" y="${H-6}" text-anchor="${['start','middle','end'][i]}">${new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'})}</text>`;}).join('');
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Strategy Bitcoin acquisitions sized by BTC, over Bitcoin daily price"><title>Strategy acquisitions · ${rows.length} ledger entries</title>${grid}<path d="${path}" fill="none" stroke="#768dac" stroke-width="1.7"/>${dots}<circle id="strategy-selected" r="5" fill="none" stroke="var(--ink)" stroke-width="2" visibility="hidden" pointer-events="none"/>${ticks}</svg>${rows.length?`<input class="chart-range" type="range" min="0" max="${rows.length-1}" value="${rows.length-1}" aria-label="Inspect Strategy acquisitions"><p class="fine-print strategy-inspection" role="status"></p>`:''}<p class="fine-print">${prices.length?`Bitcoin price: ${date(prices[0].date)}–${date(prices.at(-1).date)}${fresh('bitcoin')?'':' · delayed / stale price data'}`:'Bitcoin price history unavailable; only ledger entries are shown.'} · ${rows.length} ledger entries in view.</p>`;
 if(!rows.length)return;
 const range=el.querySelector('input'),details=el.querySelector('.strategy-inspection'),selected=el.querySelector('#strategy-selected');
 function inspect(i){const p=rows[i];range.value=i;range.setAttribute('aria-valuetext',describe(p));details.textContent=describe(p);selected.setAttribute('cx',x(p.date));selected.setAttribute('cy',y(p.price));selected.setAttribute('r',Math.max(5,StrategyChart.radius(p.btc)+3));selected.setAttribute('visibility','visible');}
 inspect(rows.length-1);
 range.addEventListener('input',()=>inspect(Number(range.value)));
 const svg=el.querySelector('svg');
 function point(event){const box=svg.getBoundingClientRect(),px=(event.clientX-box.left)/box.width*W,py=(event.clientY-box.top)/box.height*H;let best=0,distance=Infinity;rows.forEach((p,i)=>{const d=(x(p.date)-px)**2+(y(p.price)-py)**2;if(d<distance){best=i;distance=d;}});inspect(best);}
 svg.addEventListener('pointermove',point);svg.addEventListener('click',point);
}
if(typeof document!=='undefined'){
 document.addEventListener('click',event=>{const button=event.target.closest('[data-strategy-period]');if(button){state.strategyPeriod=Number(button.dataset.strategyPeriod);render();}});
 document.addEventListener('change',event=>{if(event.target.id==='strategy-log'){state.strategyLog=event.target.checked;renderStrategyChart();}});
}
