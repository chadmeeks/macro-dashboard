/* Shared research calculations, used by the browser and regression tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.Research=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DAY=86400000;
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  function quantile(values,q){const i=(values.length-1)*q,lo=Math.floor(i),hi=Math.ceil(i);return values[lo]+(values[hi]-values[lo])*(i-lo);}
  function context(rows,value,{days=1095,asOf,minSamples=20}={}){
    if(!finite(value)||!asOf)return null;
    const end=Date.parse(asOf),start=end-days*DAY;
    const sample=rows.filter(p=>finite(p.value)&&Date.parse(p.date)>=start&&Date.parse(p.date)<=end).sort((a,b)=>a.date.localeCompare(b.date));
    if(sample.length<minSamples)return null;
    const values=sample.map(p=>p.value).sort((a,b)=>a-b);
    const below=values.filter(v=>v<value).length,equal=values.filter(v=>v===value).length;
    return {percentile:(below+equal/2)/values.length*100,count:values.length,from:sample[0].date,to:sample.at(-1).date,min:values[0],max:values.at(-1),median:quantile(values,.5),p10:quantile(values,.1),p90:quantile(values,.9),requestedDays:days};
  }
  function visitChanges(previous,current){
    if(!previous?.items)return [];
    const output=[];
    for(const [key,item] of Object.entries(current.items||{})){
      const old=previous.items[key];if(!old)continue;
      if(item.status!==old.status){output.push({key,kind:'availability',label:item.label,from:old.status,to:item.status});}
      if(item.status!=='current'||old.status!=='current')continue;
      if(item.source!==old.source){output.push({key,kind:'source',label:item.label});continue;}
      if(item.asOf&&old.asOf&&item.asOf<old.asOf)continue;
      if(item.kind==='category'){
        if(item.value!==old.value)output.push({key,kind:'category',label:item.label,from:old.value,to:item.value,asOf:item.asOf});
      }else if(finite(item.value)&&finite(old.value)&&Math.abs(item.value-old.value)>Math.max(1e-8,Math.abs(old.value)*1e-10)){
        output.push({key,kind:'value',label:item.label,from:old.value,to:item.value,delta:item.value-old.value,percent:old.value?(item.value/old.value-1)*100:null,unit:item.unit,asOf:item.asOf,revised:item.asOf===old.asOf&&Boolean(item.asOf)});
      }
    }
    return output;
  }
  return {context,visitChanges};
});
