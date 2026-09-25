'use strict';
const fs=require('node:fs');
const path=require('node:path');
class Cache {
  constructor(directory, clock=Date.now) {this.directory=directory;this.clock=clock;this.memory=new Map();this.pending=new Map();this.errors=new Map();}
  read(key) {
    if(this.memory.has(key)) return this.memory.get(key);
    try {const row=JSON.parse(fs.readFileSync(path.join(this.directory,`${key}.json`),'utf8'));if(row.version===2 && Number.isFinite(row.fetchedAt) && row.data != null){this.memory.set(key,row);return row;}}catch{}
    return null;
  }
  async refresh(key, loader) {
    if(this.pending.has(key)) return this.pending.get(key);
    const task=(async()=>{
      const data=await loader();
      if(data==null) throw new Error('Empty response');
      const row={version:2,fetchedAt:this.clock(),data};
      this.memory.set(key,row);this.errors.delete(key);
      try {fs.mkdirSync(this.directory,{recursive:true});const target=path.join(this.directory,`${key}.json`);fs.writeFileSync(`${target}.tmp`,JSON.stringify(row));fs.renameSync(`${target}.tmp`,target);}catch(error){console.error(`Cache write failed (${key}): ${error.message}`);}
      return row;
    })().catch(error=>{this.errors.set(key,{message:error.message,at:this.clock()});throw error;}).finally(()=>this.pending.delete(key));
    this.pending.set(key,task);return task;
  }
  async get(key,ttl,loader,force=false) {
    let row=this.read(key);
    const expired=!row || this.clock()-row.fetchedAt>ttl;
    const recentError=this.errors.get(key)?.at>this.clock()-60000;
    if(force || !row) {
      try {row=await this.refresh(key,loader);}catch(error){if(!row) return {data:null,status:'unavailable',error:error.message,retrievedAt:null};}
    } else if(expired && !recentError) {this.refresh(key,loader).catch(()=>{});}
    const error=this.errors.get(key)?.message;
    return {data:row.data,status:error || this.clock()-row.fetchedAt>ttl?'stale':'current',retrievedAt:new Date(row.fetchedAt).toISOString(),refreshing:this.pending.has(key),...(error?{error}: {})};
  }
}
module.exports={Cache};
