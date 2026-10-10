'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const companyKey=c=>c.symbol?`ticker:${c.symbol}`:`name:${c.name}`;
function companyChanges(previous,current){
  const before=new Map(previous.map(c=>[companyKey(c),c]));
  const after=new Map(current.map(c=>[companyKey(c),c]));
  const changes=[];
  for(const [id,c] of after){const old=before.get(id);if(!old)changes.push({name:c.name,symbol:c.symbol,type:'added',before:null,after:c.btc,delta:null});else if(Math.abs(c.btc-old.btc)>1e-8)changes.push({name:c.name,symbol:c.symbol,type:'changed',before:old.btc,after:c.btc,delta:c.btc-old.btc});}
  for(const [id,c] of before)if(!after.has(id))changes.push({name:c.name,symbol:c.symbol,type:'removed',before:c.btc,after:null,delta:null});
  return changes.sort((a,b)=>Math.abs(b.delta||0)-Math.abs(a.delta||0));
}
function observationRows(key,data){
  if(key.startsWith('fred-'))return data.map(p=>({date:p.date,value:p.value}));
  if(key==='bitcoin'||key==='supply')return data.history.map(p=>({date:p.date,value:p.value}));
  if(key==='sentiment')return data.history;
  if(key==='valuation')return data.history.map(p=>({date:p.date,value:{price:p.price,mvrv:p.mvrv,realizedPrice:p.realizedPrice}}));
  if(key==='etf')return data.history.map(p=>({date:p.date,value:{total:p.total,reported:p.reported,expected:p.expected,status:p.status,...(p.funds?{funds:p.funds}:{})}}));
  return [];
}
class History {
  constructor(directory){this.directory=directory;this.loaded=new Map();this.lastError=null;}
  read(key){
    if(this.loaded.has(key))return this.loaded.get(key);
    let data={observations:{},events:[],snapshots:[]};
    try{const parsed=JSON.parse(fs.readFileSync(path.join(this.directory,`${key}.json`),'utf8'));if(parsed.observations&&Array.isArray(parsed.events)&&Array.isArray(parsed.snapshots))data=parsed;}catch(error){if(error.code!=='ENOENT')this.lastError='Some saved history could not be read.';}
    this.loaded.set(key,data);return data;
  }
  save(key,state){
    fs.mkdirSync(this.directory,{recursive:true});const file=path.join(this.directory,`${key}.json`);
    fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);this.lastError=null;
  }
  record(key,data,fetchedAt){
    if(key==='spot'||key==='calendar')return;
    try{
      const state=this.read(key),at=new Date(fetchedAt).toISOString(),source=data.source||key;
      if(state.lastSuccess&&at<=state.lastSuccess)return;
      // Do not attribute a switch of price provider to a revision by the previous provider.
      if(state.source&&state.source!==source){state.events.push({type:'source-change',at,from:state.source,to:source});state.observations={};}
      if(key==='adoption'){
        const last=state.snapshots.at(-1),hash=fingerprint({total:data.total,companies:data.companies});
        if(last&&at<last.at)return;
        if(!last||last.hash!==hash||last.at.slice(0,10)!==at.slice(0,10)){
          const changes=last?companyChanges(last.companies,data.companies):[];
          const snapshot={at,hash,total:data.total,companies:data.companies,source,changes};
          state.snapshots.push(snapshot);
          if(last&&last.hash!==hash)state.events.push({type:'snapshot-change',at,from:last.at,totalDelta:data.total-last.total,changes});
        }
      }else{
        let revisions=[];
        for(const row of observationRows(key,data)){
          if(!row.date||row.value===null)continue;
          const old=state.observations[row.date];
          if(old&&fingerprint(old.value)!==fingerprint(row.value))revisions.push({date:row.date,before:old.value,after:row.value});
          state.observations[row.date]={value:row.value,firstSeen:old?.firstSeen||at,lastChanged:!old||fingerprint(old.value)!==fingerprint(row.value)?at:old.lastChanged};
        }
        if(revisions.length)state.events.push({type:'revision',at,count:revisions.length,changes:revisions});
      }
      state.source=source;state.lastSuccess=at;state.events=state.events.slice(-200);this.save(key,state);
    }catch(error){this.lastError='History could not be saved to disk.';console.error('History write failed:',error.message);}
  }
  summary(keys){return {storageError:this.lastError,feeds:keys.map(key=>{const s=this.read(key);return {key,source:s.source,lastSuccess:s.lastSuccess||null,observations:Object.keys(s.observations).length,snapshots:s.snapshots.length,revisions:s.events.filter(e=>e.type==='revision').reduce((n,e)=>n+e.count,0),events:s.events.slice(-8).reverse().map(e=>({...e,changes:e.changes?.slice(0,8)}))};})};}
  adoption(){
    const s=this.read('adoption');
    return {startedAt:s.snapshots[0]?.at||null,lastAt:s.snapshots.at(-1)?.at||null,snapshots:s.snapshots.map(p=>({at:p.at,total:p.total,companies:p.companies.length})),changes:s.events.filter(e=>e.type==='snapshot-change').slice(-20).reverse(),storageError:this.lastError};
  }
}
module.exports={History,companyChanges};
