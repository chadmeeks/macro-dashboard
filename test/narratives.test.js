'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {parseFeed,canonicalUrl,deduplicate,summarize,NarrativeStore}=require('../lib/narratives');
const {classify}=require('../lib/narrative-topics');
const NOW=Date.parse('2026-10-09T18:00:00Z'),DAY=86400000,HOUR=3600000;
const source={id:'one',name:'One',url:'https://one.example/rss'},other={id:'two',name:'Two',url:'https://two.example/rss'};
function rss(items){return `<?xml version="1.0"?><rss><channel>${items.map(i=>`<item><title><![CDATA[${i.title}]]></title><link>${i.url||'https://one.example/story'}</link><pubDate>${i.date||'Fri, 09 Oct 2026 12:00:00 GMT'}</pubDate><description>${i.description||''}</description></item>`).join('')}</channel></rss>`;}
const article=(id,title,age=0,extra={})=>({id,title,url:`https://one.example/${id}`,sourceId:'one',source:'One',publishedAt:new Date(NOW-age*DAY).toISOString(),firstSeen:new Date(NOW).toISOString(),excerpt:'',...extra});
const archive=articles=>({articles,health:{one:{lastSuccess:NOW,lastAttempt:NOW,samples:[NOW]}},startedAt:new Date(NOW).toISOString(),refreshedAt:NOW});
test('RSS parser decodes feed text, removes markup, strips tracking and rejects unusable links/dates',()=>{
 const items=parseFeed(rss([{title:'Bitcoin &amp; ETF flows',url:'https://one.example/story?utm_source=rss&amp;id=4#section',description:'&lt;p&gt;Net &lt;b&gt;inflows&lt;/b&gt; &amp;amp; demand&lt;/p&gt;'},
 {title:'Unsafe',url:'javascript:alert(1)'},{title:'Future',date:'Fri, 09 Oct 2026 22:00:00 GMT'},{title:'Bad date',date:'not a date'}]),source,NOW);
 assert.equal(items.length,1);assert.equal(items[0].title,'Bitcoin & ETF flows');assert.equal(items[0].excerpt,'Net inflows & demand');assert.equal(items[0].url,'https://one.example/story?id=4');
 assert.equal(canonicalUrl('data:text/html,abc'),null);assert.equal(canonicalUrl('https://user:secret@example.com'),null);
 assert.throws(()=>parseFeed('<html>Access denied</html>',source,NOW),/RSS/);assert.throws(()=>parseFeed(rss([{title:'Too old',date:'01 Jan 2020'}]),source,NOW),/usable/);
});
test('duplicates do not inflate coverage, but source breadth is retained',()=>{
 const a=article('a','Bitcoin ETF inflows rise'),b=article('b','Bitcoin ETF inflows rise',0,{sourceId:'two',source:'Two'}),c=article('c','Another title',0,{url:a.url});
 const rows=deduplicate([a,b,c]);assert.equal(rows.length,1);assert.deepEqual(rows[0].outlets.sort(),['one','two']);
});
test('security topics distinguish AI cryptography, quantum and custody without counting generic AI news',()=>{
 const ids=title=>classify({title}).map(t=>t.id);
 assert.ok(ids('AI could break crypto signatures before quantum computers').includes('ai-cryptography'));
 assert.ok(ids('AI could break crypto signatures before quantum computers').includes('quantum-security'));
 assert.deepEqual(ids('AI startup raises cash for a video game'),[]);
 assert.ok(!ids('Crypto projects apply for a new AI security scanner that finds vulnerabilities').includes('ai-cryptography'));
 const split=classify({title:'Bitcoin rebounds, while crypto researchers push back on bunker mode'});
 assert.ok(!split.some(t=>t.id==='bullish-momentum'));
 assert.equal(split.find(t=>t.id==='ai-cryptography').stance,'counterpoint');
 assert.ok(!ids('Bitcoin miner MARA transfers funds as strategy pivots to AI').includes('ai-cryptography'));
 assert.ok(ids('Ledger wallet tampering exposes stolen crypto').includes('custody-security'));
 assert.ok(!ids('Ledger wallet tampering exposes stolen crypto').includes('ai-cryptography'));
 const rebuttal=classify({title:'Researcher rejects crypto bunker mode doomerism'}).find(t=>t.id==='ai-cryptography');assert.equal(rebuttal.stance,'counterpoint');
});
test('counts use publication windows, keep rebuttals, and do not invent momentum on first collection',()=>{
 const data=summarize(archive([article('a','AI may break crypto signatures',.1),article('b','Researcher rejects crypto bunker mode',.2),article('old','AI may break crypto signatures in future',10),article('future','Bitcoin ETF inflows',-1)]),{days:7,now:NOW,sources:[source]});
 const topic=data.topics.find(t=>t.id==='ai-cryptography');assert.equal(topic.count,2);assert.equal(topic.previousCount,null);assert.equal(topic.change,null);assert.equal(topic.momentum,'Building history');assert.equal(topic.articles.filter(a=>a.stance==='counterpoint').length,1);assert.equal(data.coverage.matched,2);assert.equal(data.comparable,false);
});
test('momentum requires complete collection history across all sources and compares equal windows',()=>{
 const saved=archive([article('a','Bitcoin ETF inflows rise',.2),article('b','Bitcoin funds see inflows',.3),article('c','Bitcoin ETF inflows return',1.5)]);
 saved.health.one.samples=Array.from({length:50},(_,i)=>NOW-(49-i)*HOUR);
 let data=summarize(saved,{days:1,sort:'rising',now:NOW,sources:[source]});assert.equal(data.comparable,true);const t=data.topics.find(t=>t.id==='etf-inflows');assert.equal(t.count,2);assert.equal(t.previousCount,1);assert.equal(t.change,1);assert.equal(data.sort,'rising');
 saved.health.one.samples=saved.health.one.samples.filter(t=>t<NOW-15*HOUR||t>NOW-8*HOUR);
 data=summarize(saved,{days:1,sort:'rising',now:NOW,sources:[source]});assert.equal(data.comparable,false);assert.equal(data.sort,'attention');
 saved.health.one.samples=Array.from({length:50},(_,i)=>NOW-(49-i)*HOUR);
 assert.equal(summarize(saved,{days:1,now:NOW,sources:[source,other]}).comparable,false);
});
test('ranking descends by real article counts and preserves topic discovery dates across windows',()=>{
 const saved=archive([article('a','Bitcoin ETFs record outflows',.1),article('b','Bitcoin fund redemptions accelerate',.2),article('c','Bitcoin ETF inflows return',.3)]);
 saved.topicFirstSeen={'etf-outflows':'2026-09-01T00:00:00.000Z'};
 const data=summarize(saved,{days:1,now:NOW,sources:[source]});assert.equal(data.topics[0].id,'etf-outflows');assert.equal(data.topics[0].count,2);assert.ok(!data.newlyTracked.includes('etf-outflows'));assert.equal(data.topics[0].histogram.reduce((sum,b)=>sum+b.count,0),2);
});
test('collector shares requests, persists observations and keeps good data through partial/total failures',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macro-narratives-'));let now=NOW,calls=0,failed=new Set();
 const fetcher=async url=>{calls++;if(failed.has(url))throw new Error('Source offline');return new Response(rss([{title:'Bitcoin ETF inflows rise',url:url.replace('/rss','/article')}]),{status:200});};
 const store=new NarrativeStore({directory:dir,fetcher,clock:()=>now,sources:[source,other]});t.after(()=>{store.stop();fs.rmSync(dir,{recursive:true,force:true});});
 const first=await Promise.all([store.get(),store.get()]);assert.equal(calls,2);assert.equal(first[0].status,'current');assert.equal(first[0].data.coverage.matched,1);assert.equal(first[0].data.topics[0].outletCount,2);
 const start=store.archive.startedAt;now+=2*HOUR;failed.add(other.url);const partial=await store.get();assert.equal(partial.status,'stale');assert.equal(partial.data.sources.find(s=>s.id==='two').error,'Source offline');assert.equal(partial.data.coverage.matched,1);
 failed.add(source.url);now+=2*HOUR;const offline=await store.get();assert.equal(offline.status,'stale');assert.equal(offline.data.coverage.matched,1);assert.equal(store.archive.startedAt,start);
 const reloaded=new NarrativeStore({directory:dir,fetcher,clock:()=>now,sources:[source,other]});t.after(()=>reloaded.stop());assert.equal(reloaded.archive.articles.length,2);assert.equal(reloaded.archive.startedAt,start);
 failed.clear();now+=HOUR;const recovered=await reloaded.get();assert.equal(recovered.status,'current');assert.equal(recovered.data.sources[0].error,null);
});
test('empty, malformed and oversized feeds remain unavailable rather than becoming fabricated coverage',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'macro-narratives-empty-'));
 let body='<html>blocked</html>';const store=new NarrativeStore({directory:dir,clock:()=>NOW,sources:[source],fetcher:async()=>new Response(body)});t.after(()=>{store.stop();fs.rmSync(dir,{recursive:true,force:true});});
 let result=await store.get();assert.equal(result.status,'unavailable');assert.equal(result.data.topics.length,0);assert.equal(result.data.startedAt,null);
 body='x'.repeat(2_000_001);result=await store.get({force:true});assert.equal(result.status,'unavailable');assert.match(result.data.sources[0].error,/size limit/);
});

test('narratives prioritize real-world developments over charts, forecasts and incidental roundup mentions',()=>{
 const ids=article=>classify(typeof article==='string'?{title:article}:article).map(t=>t.id);
 for(const title of ['Bitcoin recovery could develop into a stronger trend','Bitcoin price forecast: RSI breakout above resistance','Bitcoin liquidations accelerate as traders see more downside'])assert.deepEqual(ids(title),[]);
 assert.deepEqual(ids({title:'Bitcoin rebounds above its moving average',excerpt:'Analysts also discussed AI cracking crypto signatures and Bitcoin ETF outflows.'}),[]);
 assert.ok(ids('Bitcoin rebounds as Trump rules out Iran strikes').includes('de-escalation'));
 assert.ok(ids('Bitcoin Core releases a new protocol upgrade for node operators').includes('protocol-development'));
 assert.ok(ids('Bitcoin mining pool concentration raises censorship concerns').includes('network-resilience'));
 assert.ok(ids('Bitcoin miners shut down operations as energy costs rise').includes('mining-economics'));
 assert.ok(ids('France is the most dangerous place for Bitcoiners after physical attacks').includes('holder-safety'));
 assert.ok(ids('UK sanctions three crypto exchanges').includes('policy-restrictions'));
 assert.ok(ids('Lawmakers approve Bitcoin tax exemption bill').includes('policy-clarity'));
 assert.ok(ids('Bitcoin ETFs record net inflows').includes('etf-inflows'));
 assert.ok(!ids('Dormant Bitcoin whale moves coins as traders fear selling').includes('supply-overhang'));
 const saved=archive([article('chart','Bitcoin price forecast: RSI breakout'),article('recap','Crypto crumbles as flash crash anniversary nears',0,{excerpt:'Bitcoin fell sharply.'}),article('network','Bitcoin Core releases a protocol upgrade'),article('news','Bitcoin charity opens a school')]);
 const data=summarize(saved,{days:7,now:NOW,sources:[source]});
 assert.equal(data.coverage.relevant,2);assert.deepEqual(data.unclassified.map(a=>a.id),['news']);
 assert.ok(!data.topics.some(t=>['bullish-momentum','leverage-downside'].includes(t.id)));
});
