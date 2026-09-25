'use strict';
const DAY = 86400000;
const number = value => value === null || value === undefined || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const iso = time => new Date(time).toISOString().slice(0, 10);
const last = rows => rows.at(-1) || null;
function clean(rows) {
  const map = new Map();
  for (const row of rows) {
    const value = number(row.value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Date.parse(row.date)) && value !== null) map.set(row.date, value);
  }
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({date, value}));
}
function atOrBefore(rows, date, maxDays = Infinity) {
  const point = rows.findLast(p => p.date <= date);
  return point && (Date.parse(date) - Date.parse(point.date)) / DAY <= maxDays ? point : null;
}
const pct = (value, base) => number(value) !== null && number(base) !== null && base !== 0 ? (value / base - 1) * 100 : null;
function change(rows, days, mode = 'percent', tolerance = 4) {
  const end = last(rows);
  if (!end) return null;
  const start = atOrBefore(rows, iso(Date.parse(end.date) - days * DAY), tolerance);
  return start ? mode === 'difference' ? end.value - start.value : pct(end.value, start.value) : null;
}
function monthlyChange(rows) {
  const end=last(rows);
  if(!end)return null;
  const d=new Date(end.date);
  const previous=iso(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1));
  const start=atOrBefore(rows,previous,0);
  return start?end.value-start.value:null;
}
function sma(rows, size, interval = 1) {
  let sum = 0;
  return rows.map((point, i) => {
    sum += point.value;
    if (i >= size) sum -= rows[i - size].value;
    const full = i >= size - 1 && Date.parse(point.date) - Date.parse(rows[i - size + 1].date) === (size - 1) * interval * DAY;
    return {date: point.date, value: full ? sum / size : null};
  });
}
function weeklyCloses(rows, today = iso(Date.now())) {
  // Only completed UTC weeks. Each Sunday must have an actual observation.
  return rows.filter(p => new Date(p.date).getUTCDay() === 0 && p.date < today);
}
function rsi(rows, period = 14, interval = 7) {
  if (rows.length <= period) return null;
  let gain = 0, loss = 0, count = 0;
  for (let i = 1; i < rows.length; i++) {
    if (Date.parse(rows[i].date) - Date.parse(rows[i - 1].date) !== interval * DAY) {gain = 0; loss = 0; count = 0; continue;}
    const d = rows[i].value - rows[i - 1].value;
    if (count < period) {gain += Math.max(d, 0) / period; loss += Math.max(-d, 0) / period;}
    else {gain = (gain * (period - 1) + Math.max(d, 0)) / period; loss = (loss * (period - 1) + Math.max(-d, 0)) / period;}
    count++;
  }
  return count < period ? null : loss === 0 ? gain === 0 ? 50 : 100 : 100 - 100 / (1 + gain / loss);
}
function technicals(rows, today) {
  const end = last(rows);
  if (!end) throw new Error('No daily Bitcoin prices');
  const ma50 = sma(rows, 50), ma200 = sma(rows, 200);
  const weeks = weeklyCloses(rows, today), ma200w = sma(weeks, 200, 7);
  const weeklyRsi = rsi(weeks);
  const year = Number(end.date.slice(0, 4));
  const yearEnd = atOrBefore(rows, `${year - 1}-12-31`, 1);
  const daily = rows.slice(-31);
  const logs = daily.slice(1).map((p,i) => Math.log(p.value / daily[i].value));
  const mean = logs.reduce((a,b)=>a+b,0) / logs.length;
  const complete = daily.length === 31 && Date.parse(daily.at(-1).date) - Date.parse(daily[0].date) === 30 * DAY;
  const volatility = complete ? Math.sqrt(logs.reduce((a,b)=>a+(b-mean)**2,0) / (logs.length-1)) * Math.sqrt(365) * 100 : null;
  const peak = rows.reduce((a,b) => b.value > a.value ? b : a);
  return {asOf:end.date, close:end.value, ma50:last(ma50)?.value, ma200:last(ma200)?.value, ma200w:last(ma200w)?.value,
    weeklyAsOf:last(weeks)?.date, weeklyRsi, volatility, drawdown:pct(end.value, peak.value), peak,
    returns:{day1:change(rows,1,'percent',0),day7:change(rows,7,'percent',0),day30:change(rows,30,'percent',0),ytd:yearEnd ? pct(end.value,yearEnd.value):null},
    history: rows.map((p,i)=>({...p,ma50:ma50[i].value,ma200:ma200[i].value})), weekly:ma200w};
}
function liquidity(walcl, rrp, tga) {
  // WALCL and WDTGAL are millions of USD; RRPONTSYD is billions.
  return walcl.flatMap(p => {
    const r = atOrBefore(rrp, p.date, 3), t = atOrBefore(tga, p.date, 0);
    return r && t ? [{date:p.date,value:p.value/1000-r.value-t.value/1000}] : [];
  });
}
function parseFred(csv) {
  if (!csv.startsWith('observation_date,') && !csv.startsWith('DATE,')) throw new Error('FRED returned an unexpected format');
  const points = clean(csv.trim().split(/\r?\n/).slice(1).map(line=>{const [date,value]=line.split(',');return {date,value};}));
  if (!points.length) throw new Error('No FRED observations');
  return points;
}
function parseFomc(html) {
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const headings=[...html.matchAll(/(20\d{2}) FOMC Meetings/g)];
  const events=[];
  for (let i=0;i<headings.length;i++) {
    const section=html.slice(headings[i].index,headings[i+1]?.index ?? html.length);
    const re=/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g;
    for(const match of section.matchAll(re)) {
      const month=months.indexOf(match[1].trim());
      const day=Number(match[2].trim().replace(/\*/g,'').split('-').at(-1));
      if(month<0 || !Number.isInteger(day) || day<1 || day>31) continue;
      events.push({date:`${headings[i][1]}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,title:'FOMC decision',note:match[2].includes('*')?'Meeting includes economic projections':'Scheduled decision day',url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'});
    }
  }
  if (!events.length) throw new Error('Official calendar format changed');
  return events.sort((a,b)=>a.date.localeCompare(b.date));
}
module.exports={DAY,number,iso,last,clean,atOrBefore,pct,change,monthlyChange,sma,weeklyCloses,rsi,technicals,liquidity,parseFred,parseFomc};
