/* Shared, deterministic model calculations. No network or current-clock inputs. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BitcoinModels=factory();})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const DAY=86400000,GENESIS=Date.parse('2009-01-03'),PUBLICATION='2019-03-22';
 const positive=v=>Number.isFinite(v)&&v>0;
 const iso=t=>new Date(t).toISOString().slice(0,10);
 const age=date=>(Date.parse(date)-GENESIS)/DAY;
 function quantile(values,q){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),i=(a.length-1)*q,l=Math.floor(i);return a[l]+(a[Math.ceil(i)]-a[l])*(i-l);}
 function fit(prices,cutoff){
  const rows=prices.filter(p=>p.date<=cutoff&&positive(p.value)&&age(p.date)>0);
  if(rows.length<365||Date.parse(rows.at(-1).date)-Date.parse(rows[0].date)<364*DAY)return null;
  const xs=rows.map(p=>Math.log10(age(p.date))),ys=rows.map(p=>Math.log10(p.value)),mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
  const x=mean(xs),y=mean(ys),den=xs.reduce((s,v)=>s+(v-x)**2,0);if(!den)return null;
  const b=xs.reduce((s,v,i)=>s+(v-x)*(ys[i]-y),0)/den,a=y-b*x;
  const residuals=xs.map((v,i)=>ys[i]-a-b*v);
  return {a,b,start:rows[0].date,end:rows.at(-1).date,n:rows.length,lower:quantile(residuals,.1),upper:quantile(residuals,.9)};
 }
 const power=(date,model)=>model&&age(date)>0?10**(model.a+model.b*Math.log10(age(date))):null;
 function stockToFlow(supply){
  const map=new Map(supply.filter(p=>positive(p.value)).map(p=>[p.date,p.value]));
  return new Map(supply.flatMap(p=>{const previous=map.get(iso(Date.parse(p.date)-30*DAY)),flow=(p.value-previous)*365.25/30,stock=p.value-1000000;
   if(!positive(flow)||!positive(stock))return [];
   const sf=stock/flow,value=Math.exp(14.6)*sf**3.3/p.value;
   return positive(value)?[[p.date,value]]:[];
  }));
 }
 function errors(rows,key,start,end){
  // Equal weight per completed calendar month. Never use a partial latest month.
  const samples=rows.filter(p=>p.date>=start&&p.date<=end&&new Date(Date.parse(p.date)+DAY).getUTCDate()===1&&positive(p.price)&&positive(p[key]));
  return {n:samples.length,value:quantile(samples.map(p=>Math.abs(p[key]/p.price-1)*100),.5),start:samples[0]?.date,end:samples.at(-1)?.date};
 }
 function build({prices=[],supply=[],valuation=[],weekly=[],cutoff,projection=false}){
  prices=prices.filter(p=>positive(p.value)).sort((a,b)=>a.date.localeCompare(b.date));if(!prices.length)return null;
  const asOf=prices.at(-1).date,fitEnd=cutoff&&cutoff<asOf?cutoff:asOf,model=fit(prices,fitEnd),s2f=stockToFlow(supply),real=new Map(valuation.map(p=>[p.date,p])),weeks=new Map(weekly.map(p=>[p.date,p.value]));
  let week=null,weekDate=null;
  const rows=prices.map(p=>{if(weeks.has(p.date)){week=weeks.get(p.date);weekDate=p.date;}const pl=power(p.date,model),v=real.get(p.date);return {date:p.date,price:p.value,power:pl,lower:pl?pl*10**model.lower:null,upper:pl?pl*10**model.upper:null,s2f:s2f.get(p.date)??null,realized:v?.realizedPrice??null,referencePrice:v?.price??null,ma200w:weekDate&&Date.parse(p.date)-Date.parse(weekDate)<7*DAY?week:null};});
  const last=rows.at(-1),latest=key=>rows.findLast(p=>positive(p[key]));
  const score=(key,name,start,end,after)=>{const p=latest(key),price=key==='realized'?p?.referencePrice:p?.price;return {key,name,value:p?.[key]??null,date:p?.date,price,deviation:positive(price)&&p?(price/p[key]-1)*100:null,fit:start?errors(rows,key,start,end):null,subsequent:after?errors(rows,key,after,asOf):null};};
  const scores=[score('power','Power Law',model?.start,model?.end,model?iso(Date.parse(model.end)+DAY):null),score('s2f','PlanB S2F · 2019','2009-12-01','2019-02-28',PUBLICATION),score('realized','Realized price'),score('ma200w','200-week average')];
  if(projection&&model){last.projection=last.power;for(let d=7;d<=364;d+=7){const date=iso(Date.parse(asOf)+d*DAY);rows.push({date,projection:power(date,model)});}const date=iso(Date.parse(asOf)+365*DAY);rows.push({date,projection:power(date,model)});}
  return {model,rows,scores,asOf,price:last.price,cutoff:fitEnd};
 }
 // Calendar-year horizons clamp leap day to the last day of February.
 function horizon(date,years){const d=new Date(date),year=d.getUTCFullYear()+years,month=d.getUTCMonth(),day=Math.min(d.getUTCDate(),new Date(Date.UTC(year,month+1,0)).getUTCDate());return iso(Date.UTC(year,month,day));}
 // Infer an approximate subsidy epoch from issued supply, then assume 144 blocks/day.
 // This deliberately does not claim to know future block times or exact chain height.
 function nextSupply(stock){
  let blocks=144;
  for(let epoch=0;epoch<33&&blocks>0;epoch++){
   const reward=Math.floor(50*1e8/2**epoch)/1e8,ceiling=210000*Array.from({length:epoch+1},(_,i)=>Math.floor(50*1e8/2**i)/1e8).reduce((a,b)=>a+b,0);
   if(!reward)break;if(stock>=ceiling)continue;
   const mined=Math.min(blocks,(ceiling-stock)/reward);stock+=mined*reward;blocks-=mined;
  }
  return stock;
 }
 function extend(result,{key,years=0,prices=[],supply=[]}){
  if(!result||![1,5].includes(years))return {rows:result?.rows||[],reason:null};
  const rows=result.rows.filter(p=>p.date<=result.asOf).map(p=>({...p})),last=rows.at(-1),end=horizon(result.asOf,years);
  if(!positive(last[key]))return {rows,reason:'Extension unavailable: this reference has no observation at the latest daily price date.'};
  let evaluate;
  if(key==='power')evaluate=date=>power(date,result.model);
  else if(key==='s2f'){
   const stocks=new Map(supply.filter(p=>p.date<=result.asOf&&positive(p.value)).map(p=>[p.date,p.value]));let stock=stocks.get(result.asOf);
   if(!positive(stock)||stock>=21000000)return {rows,reason:'Extension unavailable: matching supply is missing.'};
   evaluate=date=>{stock=nextSupply(stock);stocks.set(date,stock);const old=stocks.get(iso(Date.parse(date)-30*DAY)),flow=(stock-old)*365.25/30;return positive(flow)?Math.exp(14.6)*((stock-1000000)/flow)**3.3/stock:null;};
  }else if(key==='realized'){
   const window=rows.filter(p=>p.date>=horizon(result.asOf,-4)&&positive(p.realized));
   if(window.length<365||Date.parse(window.at(-1).date)-Date.parse(window[0].date)<364*DAY)return {rows,reason:'Extension unavailable: at least one year of realized-price history is required.'};
   const xs=window.map(p=>(Date.parse(p.date)-Date.parse(result.asOf))/DAY),ys=window.map(p=>Math.log(p.realized)),mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
   const slope=xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0)/xs.reduce((a,x)=>a+(x-mx)**2,0);
   evaluate=date=>last.realized*Math.exp(slope*(Date.parse(date)-Date.parse(result.asOf))/DAY);
  }else if(key==='ma200w'){
   const weeks=prices.filter(p=>p.date<=result.asOf&&new Date(p.date).getUTCDay()===0).slice(-200);
   if(weeks.length!==200||weeks.some((p,i)=>!positive(p.value)||(i&&Date.parse(p.date)-Date.parse(weeks[i-1].date)!==7*DAY)))return {rows,reason:'Extension unavailable: 200 consecutive Sunday closes are required.'};
   let value=last.ma200w;const values=weeks.map(p=>p.value);
   evaluate=date=>{if(new Date(date).getUTCDay()===0){values.shift();values.push(last.price);value=values.reduce((a,b)=>a+b,0)/200;}return value;};
  }else return {rows,reason:'Unknown reference.'};
  last.scenario=last[key];
  for(let t=Date.parse(result.asOf)+DAY;t<=Date.parse(end);t+=DAY){const date=iso(t),value=evaluate(date);rows.push({date,scenario:positive(value)?value:null});}
  return {rows,reason:null};
 }
 return {fit,power,stockToFlow,errors,build,extend,horizon,nextSupply};
});
