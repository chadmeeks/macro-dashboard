'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {topics,classify,isMarketRecap}=require('./narrative-topics');
const DAY=86400000,HOUR=3600000,RETENTION=65*DAY;
const SOURCES=[
 {id:'coindesk',name:'CoinDesk',url:'https://www.coindesk.com/arc/outboundfeeds/rss/'},
 {id:'cointelegraph',name:'Cointelegraph',url:'https://cointelegraph.com/rss'},
 {id:'decrypt',name:'Decrypt',url:'https://decrypt.co/feed'}
];
const iso=ms=>new Date(ms).toISOString();
function decode(text){return String(text||'').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash);/gi,(all,key)=>{
 const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—'};
 if(key[0]!=='#')return named[key.toLowerCase()]||all;
 const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
 return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'';
});}
function plain(text){return decode(decode(String(text||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1'))).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function canonicalUrl(value){try{const url=new URL(decode(value).trim());if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return null;url.hash='';for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$|ref$)/i.test(key))url.searchParams.delete(key);url.searchParams.sort();url.hostname=url.hostname.toLowerCase();return url.toString().replace(/\/$/,'');}catch{return null;}}
const titleKey=title=>title.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
function parseFeed(xml,source,now=Date.now()){
 if(typeof xml!=='string'||xml.length>2_000_000||!/<rss\b/i.test(xml))throw new Error('Source did not return a supported RSS feed');
 const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
 if(!items.length)throw new Error('Source returned no RSS items');
 const result=[];
 for(const [,item] of items){
  const field=name=>(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i'))||[])[1]||'';
  const title=plain(field('title')).slice(0,500),url=canonicalUrl(plain(field('link'))),published=Date.parse(plain(field('pubDate')));
  // Undated and future publications cannot enter an attention window.
  if(!title||!url||!Number.isFinite(published)||published>now||published<now-RETENTION)continue;
  result.push({id:crypto.createHash('sha256').update(url).digest('hex').slice(0,20),title,url,publishedAt:iso(published),excerpt:plain(field('description')).slice(0,1400),sourceId:source.id,source:source.name});
 }
 if(!result.length)throw new Error('Source returned no usable dated articles');
 return result;
}
function deduplicate(articles){
 const result=[],byUrl=new Map(),byTitle=new Map();
 for(const article of [...articles].sort((a,b)=>a.publishedAt.localeCompare(b.publishedAt)||a.id.localeCompare(b.id))){
  const key=titleKey(article.title),existing=byUrl.get(article.url)||byTitle.get(key);
  if(existing){
   existing.outlets=[...new Set([...existing.outlets,article.sourceId])];
   if(article.firstSeen<existing.firstSeen)existing.firstSeen=article.firstSeen;
   byUrl.set(article.url,existing);byTitle.set(key,existing);
  }else{const row={...article,outlets:[article.sourceId]};result.push(row);byUrl.set(row.url,row);byTitle.set(key,row);}
 }
 return result;
}
function continuous(samples,from,to){
 const times=(samples||[]).filter(t=>t>=from-4*HOUR&&t<=to).sort((a,b)=>a-b);
 if(!times.length||times[0]>from||times.at(-1)<to-4*HOUR)return false;
 return times.every((t,i)=>!i||t-times[i-1]<=4*HOUR);
}
function summarize(archive,{days=7,sort='attention',now=Date.now(),sources=SOURCES}={}){
 const window=days*DAY,start=now-window,previousStart=start-window;
 const rows=deduplicate((archive.articles||[]).filter(a=>Date.parse(a.publishedAt)<=now&&Date.parse(a.publishedAt)>=previousStart));
 const health=sources.map(source=>{const h=archive.health?.[source.id]||{},last=h.lastSuccess;
  return {...source,...h,status:!last?'unavailable':h.error||now-last>2*HOUR?'stale':'current'};
 });
 const comparable=health.every(h=>h.status==='current'&&continuous(h.samples,previousStart,now));
 const active=rows.filter(a=>Date.parse(a.publishedAt)>=start),matchedIds=new Set(),assignments=new Map(rows.map(a=>[a.id,classify(a)]));
 const ranked=topics.map(topic=>{
  const matches=rows.filter(a=>assignments.get(a.id).some(m=>m.id===topic.id));
  const current=matches.filter(a=>Date.parse(a.publishedAt)>=start),previous=matches.filter(a=>Date.parse(a.publishedAt)<start);
  for(const a of current)matchedIds.add(a.id);
  const sourcesForTopic=[...new Set(current.flatMap(a=>a.outlets))];
  const count=current.length,previousCount=comparable?previous.length:null;
  const change=comparable?count-previous.length:null;
  const oldest=archive.topicFirstSeen?.[topic.id]||matches.reduce((value,a)=>!value||a.firstSeen<value?a.firstSeen:value,null);
  const publicTopic={...topic};delete publicTopic.match;
  const binCount=days===1?24:days,binWidth=window/binCount;
  const histogram=Array.from({length:binCount},(_,i)=>({from:iso(start+i*binWidth),to:iso(start+(i+1)*binWidth),count:current.filter(a=>Date.parse(a.publishedAt)>=start+i*binWidth&&Date.parse(a.publishedAt)<start+(i+1)*binWidth).length}));
  return {...publicTopic,count,outletCount:sourcesForTopic.length,outlets:sourcesForTopic.map(id=>sources.find(s=>s.id===id)?.name||id),previousCount,change,
   momentum:!comparable?'Building history':change>0?'Gaining coverage':change<0?'Fading coverage':'Steady coverage',
   firstSeen:oldest,lastPublishedAt:current.at(-1)?.publishedAt||null,histogram,
   articles:[...current].reverse().map(a=>({id:a.id,title:a.title,url:a.url,publishedAt:a.publishedAt,source:a.source,outlets:a.outlets.map(id=>sources.find(s=>s.id===id)?.name||id),stance:assignments.get(a.id).find(m=>m.id===topic.id).stance}))};
 }).filter(t=>t.count>0);
 const order=(a,b)=>(sort==='rising'&&comparable?(b.change-a.change):0)||b.count-a.count||b.outletCount-a.outletCount||a.title.localeCompare(b.title);
 ranked.sort(order);
 const eligible=active.filter(a=>assignments.get(a.id).length||(!isMarketRecap(a)&&/\b(bitcoin|btc|bitcoiners)\b/i.test(a.title+' '+a.excerpt)));
 return {asOf:iso(now),days,sort:sort==='rising'&&comparable?'rising':'attention',comparable,
  startedAt:archive.startedAt||null,refreshedAt:archive.refreshedAt?iso(archive.refreshedAt):null,
  coverage:{articles:active.length,relevant:eligible.length,matched:matchedIds.size,outlets:health.filter(h=>h.lastSuccess).length,totalOutlets:sources.length,oldestPublication:active[0]?.publishedAt||null,
   mode:'News coverage only',classification:'News, fundamentals and network topics matched against RSS headlines and excerpts. Price-led recaps require a matching real-world topic in the headline; no AI model or social feed is connected.',
   limitation:'RSS feeds contain a limited recent selection. Archives build while the server runs; 7D and 30D are filters, not guarantees of complete coverage. Counts include discussion and rebuttals, not votes or endorsements.'},
  sources:health.map(({samples,...h})=>({...h,lastSuccess:h.lastSuccess?iso(h.lastSuccess):null,lastAttempt:h.lastAttempt?iso(h.lastAttempt):null})),
  topics:ranked,
  newlyTracked:ranked.filter(t=>t.firstSeen&&Date.parse(t.firstSeen)>=now-DAY).slice(0,3).map(t=>t.id),
  unclassified:eligible.filter(a=>!assignments.get(a.id).length).reverse().slice(0,12).map(({id,title,url,source,publishedAt})=>({id,title,url,source,publishedAt})),
  storageError:archive.storageError||null};
}
class NarrativeStore{
 constructor({directory=path.join(__dirname,'..','data','cache-v2'),fetcher=fetch,clock=Date.now,sources=SOURCES}={}){
  this.file=path.join(directory,'narratives.json');this.fetcher=fetcher;this.clock=clock;this.sources=sources;this.pending=null;this.timer=null;
  this.archive={version:1,articles:[],health:{},startedAt:null,refreshedAt:null};
  try{const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));if(saved.version===1&&Array.isArray(saved.articles)&&saved.health)this.archive=saved;}catch{}
 }
 start(){if(!this.timer){this.timer=setInterval(()=>this.refresh().catch(()=>{}),HOUR);this.timer.unref();}}
 stop(){clearInterval(this.timer);this.timer=null;}
 save(){try{fs.mkdirSync(path.dirname(this.file),{recursive:true});delete this.archive.storageError;fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.archive));fs.renameSync(this.file+'.tmp',this.file);}catch{this.archive.storageError='The news archive could not be saved. History may not survive a server restart.';}}
 async refresh(){
  if(this.pending)return this.pending;
  this.pending=this.collect().finally(()=>{this.pending=null;});return this.pending;
 }
 async collect(){
  const now=this.clock(),nowIso=iso(now),byUrl=new Map(this.archive.articles.map(a=>[a.sourceId+':'+a.url,a]));let successes=0;
  const results=await Promise.allSettled(this.sources.map(async source=>{
   const response=await this.fetcher(source.url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/rss+xml, application/xml, text/xml','User-Agent':'MacroDashboard/2.1 (personal narrative reader)'}});
   if(!response.ok)throw new Error(`Source returned HTTP ${response.status}`);
   if(Number(response.headers?.get('content-length'))>2_000_000)throw new Error('RSS response exceeded size limit');
   // Bound the streamed body as well as Content-Length, which is often absent.
   let xml='';if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw new Error('RSS response exceeded size limit');xml+=decoder.decode(value,{stream:true});}xml+=decoder.decode();}finally{await reader.cancel().catch(()=>{});}
   }else xml=await response.text();
   return parseFeed(xml,source,now);
  }));
  results.forEach((result,index)=>{
   const source=this.sources[index],prior=this.archive.health[source.id]||{};
   if(result.status==='fulfilled'){
    successes++;
    for(const article of result.value){const key=source.id+':'+article.url,old=byUrl.get(key);byUrl.set(key,{...article,firstSeen:old?.firstSeen||nowIso});}
    this.archive.health[source.id]={lastAttempt:now,lastSuccess:now,error:null,items:result.value.length,latestPublication:result.value.map(a=>a.publishedAt).sort().at(-1),samples:[...(prior.samples||[]).filter(t=>t>=now-RETENTION),now]};
   }else this.archive.health[source.id]={...prior,lastAttempt:now,error:result.reason?.name==='TimeoutError'?'Source timed out':String(result.reason?.message||'Source could not be reached').slice(0,160)};
  });
  if(successes){this.archive.startedAt||=nowIso;this.archive.refreshedAt=now;}
  this.archive.lastAttempt=now;
  this.archive.articles=[...byUrl.values()].filter(a=>Date.parse(a.publishedAt)>=now-RETENTION).sort((a,b)=>a.publishedAt.localeCompare(b.publishedAt)).slice(-20000);
  this.archive.topicFirstSeen||={};
  for(const article of this.archive.articles)for(const match of classify(article)){const prior=this.archive.topicFirstSeen[match.id];if(!prior||article.firstSeen<prior)this.archive.topicFirstSeen[match.id]=article.firstSeen;}
  this.save();
 }
 async get({days=7,sort='attention',force=false}={}){
  this.start();
  const now=this.clock();if(force||!this.archive.lastAttempt||now-this.archive.lastAttempt>=HOUR)await this.refresh();
  const data=summarize(this.archive,{days,sort,now:this.clock(),sources:this.sources});
  return {status:data.sources.every(s=>s.status==='current')?'current':this.archive.refreshedAt?'stale':'unavailable',data};
 }
}
module.exports={NarrativeStore,SOURCES,parseFeed,canonicalUrl,deduplicate,summarize,continuous};
