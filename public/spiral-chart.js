'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BitcoinSpiral=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const DAY=86400000,GENESIS=Date.parse('2009-01-03'),CYCLE_DAYS=1461;
 function build(history,asOf){
  const byDate=new Map();
  for(const p of history||[]){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date)||!Number.isFinite(p.value)||p.value<=0||p.date>asOf)continue;
   const time=Date.parse(p.date);if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==p.date||time<GENESIS)continue;
   byDate.set(p.date,{date:p.date,value:p.value,time});
  }
  const prices=[...byDate.values()].sort((a,b)=>a.time-b.time);
  if(!prices.length)return {points:[],rings:[],loops:[]};
  const logs=prices.map(p=>Math.log10(p.value)),min=Math.floor(Math.min(...logs))-.5,max=Math.max(Math.ceil(Math.max(...logs)),min+1);
  const radius=value=>(Math.log10(value)-min)/(max-min);
  const points=prices.map(p=>{const age=(p.time-GENESIS)/DAY,loop=Math.floor(age/CYCLE_DAYS),day=age%CYCLE_DAYS,angle=day/CYCLE_DAYS*Math.PI*2-Math.PI/2,r=radius(p.value);return {...p,loop,day,angle,r,x:r*Math.cos(angle),y:r*Math.sin(angle)};});
  const rings=Array.from({length:Math.floor(max)-Math.ceil(min)+1},(_,i)=>{const value=10**(Math.ceil(min)+i);return {value,r:radius(value)};});
  const loops=[...new Set(points.map(p=>p.loop))].map(index=>({index,start:new Date(GENESIS+index*CYCLE_DAYS*DAY).toISOString().slice(0,10),end:new Date(GENESIS+(index+1)*CYCLE_DAYS*DAY).toISOString().slice(0,10)}));
  return {points,rings,loops};
 }
 return {build,CYCLE_DAYS};
});

function spiralPanel(){
 return `${section('Bitcoin spiral')}<article class="card spaced spiral-card"><div class="card-head"><div><p class="kicker">FOUR-YEAR CYCLES · A DIFFERENT VIEW OF PRICE</p><h2>Bitcoin Spiral Chart</h2><p class="fine-print">Time turns clockwise. Higher prices move outward.</p></div>${badge(state.feeds.bitcoin?.status)}</div><div class="model-options"><div class="segmented" aria-label="Spiral history">${[['all','All history'],['latest','Latest loop']].map(([v,l])=>`<button data-spiral-period="${v}" class="${state.spiralPeriod===v?'selected':''}" aria-pressed="${state.spiralPeriod===v}">${l}</button>`).join('')}</div><span class="fine-print">One turn = 1,461 days · logarithmic USD rings</span></div><div id="bitcoin-spiral"></div><p class="chart-foot">Each rotation is a fixed four-year interval from January 3, 2009. These are time loops, not exact halving-to-halving periods. Equal distances between price rings represent a 10× change. Only available daily closes are shown; gaps stay open. The spiral reorganizes historical prices and does not project future prices.</p>${source('bitcoin')}<details class="spiral-method"><summary>How the spiral is calculated</summary><p class="fine-print">Angle = days since January 3, 2009 ÷ 1,461 × 360°, starting at the top and moving clockwise. Radius is proportional to log₁₀(USD price), offset so sub-dollar history stays inside the chart. Ring spacing is fixed across the All history and Latest loop views. This chart uses its own history control, independent of the model charts above.</p></details></article>`;
}
function renderBitcoinSpiral(){
 const el=$('bitcoin-spiral');if(!el)return;
 const b=data('bitcoin');if(!b?.history?.length){el.innerHTML=empty('bitcoin','Bitcoin price history is unavailable.');return;}
 const model=BitcoinSpiral.build(b.history,b.asOf),all=model.points;
 if(!all.length){el.innerHTML='<div class="empty">No positive daily prices are available.</div>';return;}
 const latest=all.at(-1),points=state.spiralPeriod==='latest'?all.filter(p=>p.loop===latest.loop):all;
 const palette=['#789386','#5f8fa8','#9a78a5','#c39149','#e57e30','#b75e50'],color=i=>palette[i%palette.length];
 const size=680,center=340,outer=268,x=p=>center+p.x*outer,y=p=>center+p.y*outer;
 const ringLabel=v=>v<1?'$'+num(v,v<.1?3:2):'$'+compact(v);
 const rings=model.rings.map(p=>`<circle cx="${center}" cy="${center}" r="${p.r*outer}" class="spiral-ring"/><text x="${center+7}" y="${center-p.r*outer-5}" class="spiral-ring-label">${ringLabel(p.value)}</text>`).join('');
 const spokes=Array.from({length:16},(_,i)=>{const a=i/16*2*Math.PI-Math.PI/2;return `<line x1="${center}" y1="${center}" x2="${center+outer*Math.cos(a)}" y2="${center+outer*Math.sin(a)}" class="spiral-spoke"/>`;}).join('');
 const labels=[['Loop start',340,32],['+1 year',635,344],['+2 years',340,657],['+3 years',45,344]].map(([t,xx,yy])=>`<text x="${xx}" y="${yy}" text-anchor="middle" class="spiral-angle-label">${t}</text>`).join('');
 const paths=model.loops.map(loop=>{let previous=null;const d=points.map(p=>{if(p.loop!==loop.index){previous=null;return '';}const move=!previous||p.time-previous.time!==86400000;previous=p;return `${move?'M':'L'}${x(p).toFixed(2)},${y(p).toFixed(2)}`;}).join(' ').trim();return d?`<path data-spiral-loop="${loop.index}" d="${d}" fill="none" stroke="${color(loop.index)}" stroke-width="2.1" stroke-linejoin="round"/>`:'';}).join('');
 const visibleLoops=model.loops.filter(l=>state.spiralPeriod==='all'||l.index===latest.loop);
 el.innerHTML=`<div class="spiral-layout"><div class="spiral-plot"><svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Bitcoin historical price spiral. Clockwise four-year loops and logarithmic dollar price rings."><title>Bitcoin Spiral Chart · ${date(points[0].date)}–${date(latest.date)}</title>${spokes}${rings}${labels}${paths}<circle cx="${x(latest)}" cy="${y(latest)}" r="6" fill="${color(latest.loop)}" stroke="white" stroke-width="2"><title>Latest daily close: ${date(latest.date)} · ${money(latest.value,2)}</title></circle><circle class="spiral-cursor" r="7" fill="none" stroke="var(--ink)" stroke-width="2" pointer-events="none"/></svg></div><div class="spiral-reading"><p class="kicker">INSPECT A DAILY CLOSE</p><div class="spiral-inspection" role="status"></div><label for="spiral-range" class="fine-print">Move through history</label><input id="spiral-range" class="chart-range" type="range" min="0" max="${points.length-1}" value="${points.length-1}" aria-label="Inspect Bitcoin spiral by date"><p class="fine-print">Hover or tap the curve, or use the slider’s arrow keys.</p><div class="spiral-legend">${visibleLoops.map(l=>`<span><i style="background:${color(l.index)}"></i>${l.start.slice(0,4)}–${l.end.slice(0,4)}${l.index===latest.loop?' · latest loop':''}</span>`).join('')}</div><p class="fine-print">${num(points.length)} daily observations<br>${date(points[0].date)}–${date(latest.date)}</p></div></div>`;
 const svg=el.querySelector('svg'),cursor=el.querySelector('.spiral-cursor'),range=el.querySelector('input'),details=el.querySelector('.spiral-inspection');
 function inspect(i){const p=points[i],loop=model.loops.find(l=>l.index===p.loop);range.value=String(i);range.setAttribute('aria-valuetext',`${date(p.date)}, ${money(p.value,2)}, loop ${loop.start.slice(0,4)}–${loop.end.slice(0,4)}, day ${p.day+1} of 1461`);details.innerHTML=`<strong>${money(p.value,p.value<1?4:2)}</strong><span>${date(p.date)}${i===points.length-1?' · latest close':''}</span><span>Loop ${loop.start.slice(0,4)}–${loop.end.slice(0,4)} · day ${num(p.day+1)} / 1,461</span>`;cursor.setAttribute('cx',x(p));cursor.setAttribute('cy',y(p));}
 inspect(points.length-1);range.addEventListener('input',()=>inspect(Number(range.value)));
 function inspectPointer(event){const matrix=svg.getScreenCTM();if(!matrix)return;const pt=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());let best=0,distance=Infinity;points.forEach((p,i)=>{const d=(x(p)-pt.x)**2+(y(p)-pt.y)**2;if(d<distance){best=i;distance=d;}});inspect(best);}
 svg.addEventListener('pointermove',inspectPointer);svg.addEventListener('click',inspectPointer);
}
if(typeof document!=='undefined')document.addEventListener('click',event=>{const button=event.target.closest('[data-spiral-period]');if(button){state.spiralPeriod=button.dataset.spiralPeriod;render();}});
