'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {History}=require('./history');
class Cache {
  constructor(directory, clock=Date.now) {this.directory=directory;this.clock=clock;this.memory=new Map();this.pending=new Map();this.errors=new Map();this.health=new Map();this.history=new History(path.join(directory,'history'));}
  readHealth(key) {
    if(this.health.has(key))return this.health.get(key);
    let health={};try{health=JSON.parse(fs.readFileSync(path.join(this.directory,`${key}.health.json`),'utf8'));}catch{}
    this.health.set(key,health);
    if(health.error)this.errors.set(key,{message:health.error,at:health.lastAttempt});
    return health;
  }
  saveHealth(key,health){
    this.health.set(key,health);
    try{fs.mkdirSync(this.directory,{recursive:true});const file=path.join(this.directory,`${key}.health.json`);fs.writeFileSync(file+'.tmp',JSON.stringify(health));fs.renameSync(file+'.tmp',file);}catch(error){console.error('Source health could not be saved:',error.message);}
  }
  read(key) {
    this.readHealth(key);
    if(this.memory.has(key)) return this.memory.get(key);
    try {const row=JSON.parse(fs.readFileSync(path.join(this.directory,`${key}.json`),'utf8'));if(row.version===2 && Number.isFinite(row.fetchedAt) && row.data != null){this.memory.set(key,row);this.history.record(key,row.data,row.fetchedAt);return row;}}catch{}
    return null;
  }
  async refresh(key, loader) {
    if(this.pending.has(key)) return this.pending.get(key);
    const task=(async()=>{
      const data=await loader();
      if(data==null) throw new Error('Empty response');
      const row={version:2,fetchedAt:this.clock(),data};
      this.memory.set(key,row);this.errors.delete(key);
      this.saveHealth(key,{lastAttempt:row.fetchedAt,lastSuccess:row.fetchedAt,error:null});
      this.history.record(key,data,row.fetchedAt);
      try {fs.mkdirSync(this.directory,{recursive:true});const target=path.join(this.directory,`${key}.json`);fs.writeFileSync(`${target}.tmp`,JSON.stringify(row));fs.renameSync(`${target}.tmp`,target);}catch(error){console.error(`Cache write failed (${key}): ${error.message}`);}
      return row;
    })().catch(error=>{this.errors.set(key,{message:error.message,at:this.clock()});this.saveHealth(key,{...this.readHealth(key),lastAttempt:this.clock(),error:error.message});throw error;}).finally(()=>this.pending.delete(key));
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
    return {data:row.data,status:error || this.clock()-row.fetchedAt>ttl?'stale':'current',retrievedAt:new Date(row.fetchedAt).toISOString(),refreshing:this.pending.has(key),lastAttempt:this.readHealth(key).lastAttempt?new Date(this.readHealth(key).lastAttempt).toISOString():null,...(error?{error}: {})};
  }
}
module.exports={Cache};
