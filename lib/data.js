'use strict';
const path=require('node:path');
const {Cache}=require('./cache');
const A=require('./analytics');
const cache=new Cache(process.env.MACRO_CACHE_DIR || path.join(__dirname,'..','data','cache-v2'));
const HOUR=3600000;
async function request(url,json=true) {
  const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'User-Agent':'MacroDashboard/2.0 (personal research)','Accept':json?'application/json':'text/csv,text/html;q=0.9'}});
  if(!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return json?response.json():response.text();
}
const SPECS={
  fed:{id:'WALCL',name:'Fed balance sheet',unit:'billions',scale:0.001,maxAge:10,description:'Total Federal Reserve assets. The direction matters more than a single weekly reading.'},
  rrp:{id:'RRPONTSYD',name:'Overnight reverse repo',unit:'billions',scale:1,maxAge:5,description:'Cash parked at the Fed’s overnight reverse-repo facility.'},
  tga:{id:'WDTGAL',name:'Treasury General Account',unit:'billions',scale:0.001,maxAge:10,description:'Treasury cash held at the Fed, measured on Wednesday. Rebuilding it can absorb reserves.'},
  nominal:{id:'DGS10',name:'10-year Treasury',unit:'percent',scale:1,maxAge:5,description:'Long-term nominal borrowing costs; falling yields can also reflect weaker growth.'},
  real:{id:'DFII10',name:'10-year real yield',unit:'percent',scale:1,maxAge:5,description:'Inflation-adjusted Treasury yield, a reference for the opportunity cost of holding non-yielding assets.'},
  twoYear:{id:'DGS2',name:'2-year Treasury',unit:'percent',scale:1,maxAge:5,description:'Shorter-term yields are sensitive to expectations for monetary policy.'},
  dollar:{id:'DTWEXBGS',name:'Broad US dollar',unit:'index',scale:1,maxAge:7,description:'The Fed’s trade-weighted broad dollar index (January 2006 = 100).'},
  credit:{id:'BAMLH0A0HYM2',name:'High-yield credit spread',unit:'percent',scale:1,maxAge:5,description:'ICE BofA US high-yield option-adjusted spread. Widening spreads indicate greater credit stress.'},
  inflation:{id:'CPIAUCSL',name:'Consumer inflation',unit:'yoy',scale:1,maxAge:65,description:'Year-over-year change in seasonally adjusted CPI. Observation dates refer to the measured month.'},
  unemployment:{id:'UNRATE',name:'Unemployment',unit:'percent',scale:1,maxAge:65,description:'Monthly unemployment rate; a lagging measure of labor-market conditions.'},
  m2:{id:'M2SL',name:'US M2 money supply',unit:'billions',scale:1,maxAge:75,description:'US broad money, released monthly. This measures US money supply, not global liquidity.'}
};
async function fred(id) {
  const start=new Date();start.setUTCFullYear(start.getUTCFullYear()-6);
  if(process.env.FRED_API_KEY) {
    try {
      const url=new URL('https://api.stlouisfed.org/fred/series/observations');
      for(const [k,v] of Object.entries({series_id:id,api_key:process.env.FRED_API_KEY,file_type:'json',observation_start:A.iso(start)}))url.searchParams.set(k,v);
      const payload=await request(url);const rows=A.clean((payload.observations||[]).map(p=>({date:p.date,value:p.value})));
      if(rows.length)return rows;
    }catch{}
  }
  return A.parseFred(await request(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${A.iso(start)}`,false));
}
function ageStatus(envelope,date,maxDays) {
  const now=date?.length===10?Date.parse(A.iso(Date.now())):Date.now();
  if(envelope.data && date && now-Date.parse(date)>maxDays*A.DAY)return {...envelope,status:'stale',observationDelayed:true};
  return envelope;
}
async function bitcoin(force) {
  let result=await cache.get('bitcoin',HOUR*6,async()=>{
    try {
      const url='https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD,SplyCur,HashRate,AdrActCnt,TxCnt&frequency=1d&page_size=10000&start_time=2010-01-01';
      const payload=await request(url);
      if(!payload.data?.length || payload.next_page_url)throw new Error('Incomplete Bitcoin network history');
      const today=A.iso(Date.now());
      const rows=payload.data.filter(p=>p.time.slice(0,10)<today);
      const series=key=>A.clean(rows.map(p=>({date:p.time.slice(0,10),value:p[key]})));
      const prices=series('PriceUSD').filter(p=>p.value>0);
      const stats=A.technicals(prices,today);
      const network={};
      for(const [key,metric] of Object.entries({supply:'SplyCur',hashrate:'HashRate',addresses:'AdrActCnt',transactions:'TxCnt'})) {
        const values=series(metric);const smoothed=key==='supply'?values:A.sma(values,30).filter(p=>p.value!==null);
        network[key]={...A.last(smoothed),change30:A.change(smoothed,30,'percent',0),history:smoothed.slice(-365)};
      }
      return {...stats,network,source:'Coin Metrics',url:'https://coinmetrics.io/community-network-data/'};
    } catch(primaryError) {
      const payload=await request('https://api.blockchain.info/charts/market-price?timespan=all&format=json&sampled=false');
      const rows=A.clean((payload.values||[]).map(p=>({date:A.iso(p.x*1000),value:p.y}))).filter(p=>p.value>0&&p.date<A.iso(Date.now()));
      if(rows.length<201)throw new Error('Bitcoin history unavailable');
      return {...A.technicals(rows),network:null,source:'Blockchain.com (price fallback)',url:'https://www.blockchain.com/explorer/charts/market-price',networkError:'Network metrics unavailable from Coin Metrics.'};
    }
  },force);
  return ageStatus(result,result.data?.asOf,3);
}
async function spot(force) {
  return cache.get('spot',60000,async()=>{
    try {
      const payload=await request('https://api.coinbase.com/v2/prices/BTC-USD/spot');
      const price=A.number(payload.data?.amount);if(!(price>0))throw new Error('Invalid spot price');
      return {price,asOf:new Date().toISOString(),source:'Coinbase',url:'https://www.coinbase.com/price/bitcoin',timestampKind:'retrieved'};
    }catch {
      const payload=await request('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true');
      const price=A.number(payload.bitcoin?.usd);const time=A.number(payload.bitcoin?.last_updated_at);
      if(!(price>0)||!time)throw new Error('Spot price unavailable');
      return {price,asOf:new Date(time*1000).toISOString(),source:'CoinGecko',url:'https://www.coingecko.com/en/coins/bitcoin',timestampKind:'observed'};
    }
  },force).then(p=>ageStatus(p,p.data?.asOf,5/1440));
}
async function sentiment(force) {
  const result=await cache.get('sentiment',HOUR,async()=>{
    const payload=await request('https://api.alternative.me/fng/?limit=180');
    const rows=A.clean((payload.data||[]).map(p=>({date:A.iso(Number(p.timestamp)*1000),value:p.value}))).filter(p=>p.value>=0&&p.value<=100);
    if(!rows.length)throw new Error('Sentiment history unavailable');
    const value=A.last(rows).value;
    return {value,asOf:A.last(rows).date,change7:A.change(rows,7,'difference',0),classification:value<25?'Extreme fear':value<45?'Fear':value<=55?'Neutral':value<75?'Greed':'Extreme greed',history:rows,source:'Alternative.me',url:'https://alternative.me/crypto/fear-and-greed-index/'};
  },force);
  return ageStatus(result,result.data?.asOf,3);
}
async function adoption(force) {
  return cache.get('adoption',HOUR*12,async()=>{
    const payload=await request('https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin');
    const total=A.number(payload.total_holdings);
    const companies=(payload.companies||[]).filter(c=>A.number(c.total_holdings)>0).map(c=>({name:String(c.name),symbol:String(c.symbol||''),country:String(c.country||''),btc:Number(c.total_holdings)})).sort((a,b)=>b.btc-a.btc);
    if(!(total>0)||!companies.length)throw new Error('Treasury holdings unavailable');
    return {total,companies,maxSupplyShare:total/21000000*100,concentration:companies[0].btc/total*100,asOf:null,source:'CoinGecko',url:'https://www.coingecko.com/en/public-companies-bitcoin',note:'Provider snapshot. Individual reporting dates are not supplied; holdings may lag filings. Company totals measure ownership, not recent purchases.'};
  },force);
}
async function macro(force) {
  const entries=await Promise.all(Object.entries(SPECS).map(async([key,spec])=>{
    let row=await cache.get(`fred-${spec.id}`,HOUR,()=>fred(spec.id),force);
    if(!row.data)return [key,{...row,...spec,history:[],value:null,asOf:null}];
    let points=row.data.map(p=>({date:p.date,value:p.value*spec.scale}));
    if(spec.unit==='yoy')points=points.flatMap(p=>{const date=`${Number(p.date.slice(0,4))-1}${p.date.slice(4)}`;const prior=A.atOrBefore(points,date,0);return prior?[{date:p.date,value:A.pct(p.value,prior.value)}]:[];});
    const end=A.last(points);
    row=ageStatus(row,end?.date,spec.maxAge);
    return [key,{...spec,status:row.status,retrievedAt:row.retrievedAt,refreshing:row.refreshing,error:row.error,value:end?.value??null,asOf:end?.date??null,change30:spec.maxAge>30?A.monthlyChange(points):A.change(points,30,'difference',8),history:points.slice(-400),url:`https://fred.stlouisfed.org/series/${spec.id}`,source:'FRED'}];
  }));
  const metrics=Object.fromEntries(entries);
  const raw=key=>cache.read(`fred-${SPECS[key].id}`)?.data||[];
  const net=A.liquidity(raw('fed'),raw('rrp'),raw('tga'));
  const end=A.last(net);
  metrics.liquidity={name:'Dollar liquidity proxy',unit:'billions',value:end?.value??null,asOf:end?.date??null,change30:A.change(net,28,'difference',0),history:net.slice(-156),status:!end?'unavailable':['fed','rrp','tga'].some(k=>metrics[k].status!=='current')||Date.now()-Date.parse(end.date)>10*A.DAY?'stale':'current',source:'Calculated from FRED',url:'https://fred.stlouisfed.org/series/WALCL',description:'Fed assets − Treasury cash − overnight reverse repo, in billions of USD. Wednesday levels aligned by date; RRP may carry back at most 3 days for holidays. A reserve-liquidity proxy, not total global liquidity.',comparison:'4 weeks'};
  const curve=raw('nominal').flatMap(p=>{const two=A.atOrBefore(raw('twoYear'),p.date,0);return two?[{date:p.date,value:p.value-two.value}]:[];});
  metrics.curve={name:'10Y − 2Y yield curve',unit:'percent',value:A.last(curve)?.value??null,asOf:A.last(curve)?.date??null,change30:A.change(curve,30,'difference',4),history:curve.slice(-400),status:!curve.length?'unavailable':[metrics.nominal,metrics.twoYear].some(m=>m.status!=='current')?'stale':'current',source:'Calculated from FRED',url:'https://fred.stlouisfed.org/series/T10Y2Y',description:'10-year minus 2-year Treasury yields on matching dates. Curve steepening can reflect either growth optimism or stress.'};
  return {metrics,generatedAt:new Date().toISOString()};
}
async function calendar(force) {
  const result=await cache.get('calendar',HOUR*24,async()=>({events:A.parseFomc(await request('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',false)),source:'Federal Reserve',url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'}),force);
  if(result.data)result.data={...result.data,events:result.data.events.filter(e=>e.date>=A.iso(Date.now())).slice(0,6)};
  return result;
}
module.exports={bitcoin,spot,sentiment,adoption,macro,calendar,SPECS};
