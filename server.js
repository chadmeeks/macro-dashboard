const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const FRED_API_KEY = process.env.FRED_API_KEY || "";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const CACHE_FILE = path.join(DATA_DIR, "macro-cache.json");
const MACRO_CACHE_TTL_MS = 15 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const FRED_SERIES = {
  fedBalanceSheet: "WALCL",
  reverseRepo: "RRPONTSYD",
  treasuryGeneralAccount: "WTREGEN",
  tenYearYield: "DGS10",
  twoYearYield: "DGS2",
  realTenYearYield: "DFII10",
  dxyBroad: "DTWEXBGS"
};

let macroRefreshPromise = null;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function serveFile(filePath, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function latest(points) {
  return points.length ? points[points.length - 1] : null;
}

function rollingAverage(values, size) {
  if (values.length < size || size <= 0) return null;
  const slice = values.slice(-size);
  return slice.reduce((sum, n) => sum + n, 0) / slice.length;
}

function normalizeWindow(values) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map(v => ((v - min) / span) * 100);
}

function computeLiquiditySeries({ walcl, rrp, tga }) {
  const length = Math.min(walcl.length, rrp.length, tga.length);
  if (!length) return [];

  const walclTail = walcl.slice(-length).map(item => item.value);
  const rrpTail = rrp.slice(-length).map(item => item.value);
  const tgaTail = tga.slice(-length).map(item => item.value);
  const dates = walcl.slice(-length).map(item => item.date);

  const walclNorm = normalizeWindow(walclTail);
  const rrpNorm = normalizeWindow(rrpTail);
  const tgaNorm = normalizeWindow(tgaTail);

  return dates.map((date, idx) => {
    const net = walclNorm[idx] - rrpNorm[idx] - tgaNorm[idx];
    return {
      date,
      netLiquidityIndex: Number(net.toFixed(2)),
      walcl: walclTail[idx],
      rrp: rrpTail[idx],
      tga: tgaTail[idx]
    };
  });
}

function classifyRegime({ liquidityIndex, tenYearYield, realYield, dxy }) {
  if (
    !Number.isFinite(liquidityIndex.current) ||
    !Number.isFinite(liquidityIndex.avg30) ||
    !Number.isFinite(tenYearYield.current) ||
    !Number.isFinite(tenYearYield.avg30) ||
    !Number.isFinite(realYield.current) ||
    !Number.isFinite(realYield.avg30) ||
    !Number.isFinite(dxy.current) ||
    !Number.isFinite(dxy.avg30)
  ) {
    return {
      liquidity: "Unknown",
      rates: "Unknown",
      macroRisk: "Unknown",
      rationale: ["Not enough macro inputs yet. Configure FRED and refresh."]
    };
  }

  const liqTrend = liquidityIndex.current - liquidityIndex.avg30;
  const ratesTrend = tenYearYield.current - tenYearYield.avg30;
  const realTrend = realYield.current - realYield.avg30;
  const dxyTrend = dxy.current - dxy.avg30;

  const liquidity = liqTrend >= 0 ? "Expanding" : "Contracting";
  const rates = ratesTrend <= 0 ? "Easing" : "Tightening";

  let riskScore = 0;
  if (liqTrend < 0) riskScore += 1;
  if (ratesTrend > 0) riskScore += 1;
  if (realTrend > 0) riskScore += 1;
  if (dxyTrend > 0) riskScore += 1;

  const macroRisk = riskScore <= 1 ? "Low" : riskScore <= 2 ? "Medium" : "High";

  return {
    liquidity,
    rates,
    macroRisk,
    rationale: [
      `Liquidity trend vs 30D: ${liqTrend >= 0 ? "+" : ""}${liqTrend.toFixed(2)} index pts`,
      `10Y nominal trend vs 30D: ${ratesTrend >= 0 ? "+" : ""}${ratesTrend.toFixed(2)}%`,
      `10Y real trend vs 30D: ${realTrend >= 0 ? "+" : ""}${realTrend.toFixed(2)}%`,
      `DXY trend vs 30D: ${dxyTrend >= 0 ? "+" : ""}${dxyTrend.toFixed(2)}`
    ]
  };
}

function nextFirstFriday(from = new Date()) {
  const d = new Date(from);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d;
}

function nextMonthlyDay(dayOfMonth, from = new Date()) {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  d.setDate(dayOfMonth);
  return d;
}

function nextFomcEstimate(from = new Date()) {
  const anchor = new Date("2026-01-28T00:00:00Z");
  const msPerDay = 24 * 60 * 60 * 1000;
  const cycleDays = 42;
  const deltaDays = Math.ceil((from - anchor) / msPerDay);
  const cycles = Math.max(0, Math.ceil(deltaDays / cycleDays));
  const next = new Date(anchor);
  next.setUTCDate(anchor.getUTCDate() + cycles * cycleDays);
  return next;
}

function fmtEventDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toIsoDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
}

function buildEvents() {
  const releases = [
    {
      id: "cpi",
      title: "CPI Release",
      dateObj: nextMonthlyDay(12),
      note: "Estimated calendar date"
    },
    {
      id: "nfp",
      title: "Nonfarm Payrolls",
      dateObj: nextFirstFriday(),
      note: "Estimated calendar date"
    },
    {
      id: "fomc",
      title: "FOMC Decision",
      dateObj: nextFomcEstimate(),
      note: "Approx. 6-week cadence"
    }
  ];

  return releases.map(item => ({
    id: item.id,
    type: "macro",
    title: item.title,
    dateISO: toIsoDate(item.dateObj),
    date: fmtEventDate(item.dateObj),
    note: item.note
  }));
}

function nextScheduledDate(months, day, from = new Date()) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let y = start.getFullYear(); y <= start.getFullYear() + 1; y += 1) {
    for (const monthIndex of months) {
      const d = new Date(y, monthIndex, day);
      if (d >= start) return d;
    }
  }
  return new Date(start.getFullYear() + 1, months[0], day);
}

function buildKeyEarningsEvents() {
  const schedules = [
    { ticker: "AAPL", company: "Apple", months: [0, 3, 6, 9], day: 30 },
    { ticker: "MSFT", company: "Microsoft", months: [0, 3, 6, 9], day: 25 },
    { ticker: "GOOGL", company: "Alphabet", months: [1, 3, 6, 9], day: 2 },
    { ticker: "AMZN", company: "Amazon", months: [1, 3, 6, 9], day: 6 },
    { ticker: "META", company: "Meta", months: [1, 3, 6, 9], day: 1 },
    { ticker: "NVDA", company: "NVIDIA", months: [1, 4, 7, 10], day: 21 },
    { ticker: "TSLA", company: "Tesla", months: [0, 3, 6, 9], day: 23 }
  ];

  return schedules.map(item => {
    const d = nextScheduledDate(item.months, item.day);
    return {
      id: `earnings-${item.ticker.toLowerCase()}`,
      type: "earnings",
      title: `${item.ticker} Earnings`,
      subtitle: item.company,
      dateISO: toIsoDate(d),
      date: fmtEventDate(d),
      note: "Estimated earnings date"
    };
  });
}

function buildCalendarEvents() {
  return [...buildEvents(), ...buildKeyEarningsEvents()]
    .sort((a, b) => (a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : 0));
}

function calcReturnPct(points, daysBack) {
  if (!points.length) return null;
  const last = points[points.length - 1][1];
  const lastTs = points[points.length - 1][0];
  const targetTs = lastTs - (daysBack * 24 * 60 * 60 * 1000);

  let base = points[0][1];
  for (let i = points.length - 1; i >= 0; i -= 1) {
    if (points[i][0] <= targetTs) {
      base = points[i][1];
      break;
    }
  }

  if (!base) return null;
  return ((last - base) / base) * 100;
}

function calcYtdReturn(points) {
  if (!points.length) return null;
  const lastTs = points[points.length - 1][0];
  const now = new Date(lastTs);
  const ytdStart = new Date(now.getFullYear(), 0, 1).getTime();

  let start = points[0][1];
  for (const [ts, value] of points) {
    if (ts >= ytdStart) {
      start = value;
      break;
    }
  }

  const end = points[points.length - 1][1];
  if (!start) return null;
  return ((end - start) / start) * 100;
}

function parseIsoDate(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

function dayFromTs(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function alignBtcToDates(btcPrices, isoDates) {
  if (!Array.isArray(btcPrices) || !btcPrices.length || !Array.isArray(isoDates) || !isoDates.length) {
    return [];
  }

  const btcByDay = new Map();
  for (const [ts, value] of btcPrices) {
    const v = Number(value);
    if (!Number.isFinite(ts) || !Number.isFinite(v)) continue;
    btcByDay.set(dayFromTs(ts), v);
  }

  const knownDays = Array.from(btcByDay.keys()).sort();
  const aligned = [];
  let idx = 0;
  let last = null;

  for (const isoDate of isoDates) {
    while (idx < knownDays.length && knownDays[idx] <= isoDate) {
      last = btcByDay.get(knownDays[idx]);
      idx += 1;
    }
    aligned.push(last);
  }

  return aligned;
}

function alignSeriesToDates(points, isoDates) {
  if (!Array.isArray(points) || !points.length || !Array.isArray(isoDates) || !isoDates.length) {
    return [];
  }

  const sorted = points
    .map(item => ({ date: item?.date, value: Number(item?.value) }))
    .filter(item => item.date && Number.isFinite(item.value))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const aligned = [];
  let idx = 0;
  let last = null;

  for (const isoDate of isoDates) {
    while (idx < sorted.length && sorted[idx].date <= isoDate) {
      last = sorted[idx].value;
      idx += 1;
    }
    aligned.push(last);
  }

  return aligned;
}

function dedupeByDate(points) {
  const map = new Map();
  for (const point of points || []) {
    if (!point?.date || !Number.isFinite(Number(point.value))) continue;
    map.set(point.date, Number(point.value));
  }
  return Array.from(map.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

async function fetchBtcDailySeries() {
  const sources = [];

  try {
    const fredRows = FRED_API_KEY
      ? await fetchFredSeries("CBBTCUSD")
      : await fetchFredSeriesCsvFallback("CBBTCUSD");
    if (Array.isArray(fredRows) && fredRows.length) sources.push(...fredRows);
  } catch {}

  try {
    const historyUrl = new URL("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart");
    historyUrl.searchParams.set("vs_currency", "usd");
    historyUrl.searchParams.set("days", "max");
    const payload = await fetchJson(historyUrl, 14000);
    const rows = (payload?.prices || [])
      .map(([ts, value]) => ({ date: dayFromTs(ts), value: Number(value) }))
      .filter(item => item.date && Number.isFinite(item.value));
    if (rows.length) sources.push(...rows);
  } catch {}

  try {
    const chainUrl = new URL("https://api.blockchain.info/charts/market-price");
    chainUrl.searchParams.set("timespan", "all");
    chainUrl.searchParams.set("format", "json");
    chainUrl.searchParams.set("sampled", "false");
    const payload = await fetchJson(chainUrl, 14000);
    const rows = (payload?.values || [])
      .map(item => ({
        date: dayFromTs(Number(item?.x || 0) * 1000),
        value: Number(item?.y)
      }))
      .filter(item => item.date && Number.isFinite(item.value));
    if (rows.length) sources.push(...rows);
  } catch {}

  if (!sources.length) {
    throw new Error("Missing BTC daily history from all sources");
  }

  const merged = dedupeByDate(sources);
  // Ensure deterministic long-history floor for downstream charts.
  const floor = "2011-01-01";
  if (!merged.some(row => row.date <= floor)) {
    throw new Error("BTC history available but missing pre-2011 coverage");
  }
  return merged;
}

function computeMonthlyCloses(dailySeries) {
  const byMonth = new Map();
  for (const point of dailySeries) {
    const month = point.date.slice(0, 7);
    byMonth.set(month, point);
  }
  return Array.from(byMonth.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function computeRsi(values, period = 14) {
  if (!Array.isArray(values) || values.length < period + 1) return values.map(() => null);

  const output = new Array(values.length).fill(null);
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum += Math.abs(delta);
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  output[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    output[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  return output.map(value => (Number.isFinite(value) ? Number(value.toFixed(2)) : null));
}

function computeRollingSma(values, windowSize) {
  const output = new Array(values.length).fill(null);
  if (!Array.isArray(values) || values.length < windowSize || windowSize <= 0) return output;

  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= windowSize) sum -= values[i - windowSize];
    if (i >= windowSize - 1) output[i] = sum / windowSize;
  }
  return output;
}

function buildDailyValueMap(dailySeries) {
  const map = new Map();
  for (const point of dailySeries) {
    map.set(point.date, Number(point.value));
  }
  return map;
}

function fillMonthlyFromDaily(monthlyDates, dailyMap) {
  const knownDates = Array.from(dailyMap.keys()).sort();
  const output = [];
  let idx = 0;
  let last = null;
  for (const date of monthlyDates) {
    while (idx < knownDates.length && knownDates[idx] <= date) {
      last = dailyMap.get(knownDates[idx]);
      idx += 1;
    }
    output.push(last);
  }
  return output;
}

const HALVING_EPOCHS = [
  { start: "2009-01-03", end: "2012-11-28", reward: 50 },
  { start: "2012-11-28", end: "2016-07-09", reward: 25 },
  { start: "2016-07-09", end: "2020-05-11", reward: 12.5 },
  { start: "2020-05-11", end: "2024-04-20", reward: 6.25 },
  { start: "2024-04-20", end: "2028-04-20", reward: 3.125 },
  { start: "2028-04-20", end: "2032-04-20", reward: 1.5625 }
];

function daysBetweenIso(startIso, endIso) {
  return Math.max(0, Math.floor((parseIsoDate(endIso) - parseIsoDate(startIso)) / (24 * 60 * 60 * 1000)));
}

function estimatedStockAt(isoDate) {
  const target = parseIsoDate(isoDate);
  let stock = 0;
  for (const epoch of HALVING_EPOCHS) {
    const epochStart = parseIsoDate(epoch.start);
    const epochEnd = parseIsoDate(epoch.end);
    if (target <= epochStart) break;
    const segmentEnd = target < epochEnd ? target : epochEnd;
    const days = Math.max(0, Math.floor((segmentEnd - epochStart) / (24 * 60 * 60 * 1000)));
    stock += days * 144 * epoch.reward;
    if (target < epochEnd) break;
  }
  return stock;
}

function epochForDate(isoDate) {
  for (const epoch of HALVING_EPOCHS) {
    if (isoDate >= epoch.start && isoDate < epoch.end) return epoch;
  }
  return HALVING_EPOCHS[HALVING_EPOCHS.length - 1];
}

function computeS2FSeries(monthlyDates) {
  const a = -2.68;
  const b = 3.3;
  return monthlyDates.map(date => {
    const epoch = epochForDate(date);
    const annualFlow = epoch.reward * 144 * 365;
    const stock = estimatedStockAt(date);
    const sf = annualFlow > 0 ? stock / annualFlow : null;
    const modelPrice = Number.isFinite(sf) && sf > 0
      ? Math.exp(a + (b * Math.log(sf)))
      : null;
    return {
      date,
      value: Number.isFinite(modelPrice) ? Number(modelPrice.toFixed(2)) : null,
      epoch: `${epoch.start}..${epoch.end}`
    };
  });
}

function rsiToColor(rsi) {
  if (!Number.isFinite(rsi)) return "#8aa0c4";
  const min = 45;
  const max = 85;
  const clamped = Math.max(min, Math.min(max, rsi));
  const t = (clamped - min) / (max - min);
  const hue = 220 - (210 * t);
  return `hsl(${hue.toFixed(0)} 88% 56%)`;
}

function monthKey(isoDate) {
  return String(isoDate || "").slice(0, 7);
}

function buildMonthTimeline(startMonth, endMonth) {
  const [startY, startM] = startMonth.split("-").map(Number);
  const [endY, endM] = endMonth.split("-").map(Number);
  const out = [];

  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function toPriceRowsFromDaily(daily) {
  return (daily || [])
    .filter(item => item?.date && Number.isFinite(Number(item.value)))
    .map(point => [new Date(`${point.date}T00:00:00Z`).getTime(), Number(point.value)]);
}

function slicePriceRowsByDays(prices, days) {
  if (!Array.isArray(prices) || !prices.length) return [];
  if (days === "max") return prices;

  const daysInt = Number(days);
  if (!Number.isFinite(daysInt) || daysInt <= 0) return prices;

  const endTs = prices[prices.length - 1][0];
  const startTs = endTs - (daysInt * 24 * 60 * 60 * 1000);
  return prices.filter(([ts]) => ts >= startTs);
}

function readMacroCache() {
  try {
    ensureDataDir();
    if (!fs.existsSync(CACHE_FILE)) return null;
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeMacroCache(payload) {
  ensureDataDir();
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({ cachedAt: Date.now(), payload }, null, 2)
  );
}

async function fetchFredSeries(seriesId) {
  if (!FRED_API_KEY) {
    throw new Error("Missing FRED_API_KEY");
  }

  const start = new Date();
  start.setFullYear(start.getFullYear() - 6);

  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", FRED_API_KEY);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "asc");
  url.searchParams.set("observation_start", start.toISOString().slice(0, 10));

  const data = await fetchJson(url, 12000);
  const observations = data.observations || [];

  return observations
    .map(item => ({ date: item.date, value: Number(item.value) }))
    .filter(item => item.date && Number.isFinite(item.value));
}

async function fetchFredSeriesCsvFallback(seriesId) {
  const url = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
  url.searchParams.set("id", seriesId);

  const csv = await fetchText(url, 12000);
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const points = [];
  for (let i = 1; i < lines.length; i += 1) {
    const [dateRaw, valueRaw] = lines[i].split(",");
    if (!dateRaw || !valueRaw) continue;
    const value = Number(valueRaw);
    if (!Number.isFinite(value)) continue;
    points.push({ date: dateRaw.trim(), value });
  }
  return points;
}

function buildMacroPayload(seriesMap, statusMap) {
  const walcl = seriesMap.fedBalanceSheet || [];
  const rrp = seriesMap.reverseRepo || [];
  const tga = seriesMap.treasuryGeneralAccount || [];
  const dgs10 = seriesMap.tenYearYield || [];
  const dgs2 = seriesMap.twoYearYield || [];
  const dfii10 = seriesMap.realTenYearYield || [];
  const dxy = seriesMap.dxyBroad || [];

  const liq = computeLiquiditySeries({ walcl, rrp, tga });
  const liqValues = liq.map(item => item.netLiquidityIndex);

  const tenCurrent = latest(dgs10)?.value;
  const twoCurrent = latest(dgs2)?.value;
  const realCurrent = latest(dfii10)?.value;
  const dxyCurrent = latest(dxy)?.value;

  const regime = classifyRegime({
    liquidityIndex: {
      current: liqValues[liqValues.length - 1],
      avg30: rollingAverage(liqValues, 30)
    },
    tenYearYield: {
      current: tenCurrent,
      avg30: rollingAverage(dgs10.map(x => x.value), 30)
    },
    realYield: {
      current: realCurrent,
      avg30: rollingAverage(dfii10.map(x => x.value), 30)
    },
    dxy: {
      current: dxyCurrent,
      avg30: rollingAverage(dxy.map(x => x.value), 30)
    }
  });

  const statusEntries = Object.values(statusMap);
  const okCount = statusEntries.filter(item => item.ok).length;

  return {
    metrics: {
      fedBalanceSheet: latest(walcl),
      reverseRepo: latest(rrp),
      treasuryGeneralAccount: latest(tga),
      tenYearYield: latest(dgs10),
      twoYearYield: latest(dgs2),
      realTenYearYield: latest(dfii10),
      dxyBroad: latest(dxy),
      curveSpread: {
        date: latest(dgs10)?.date || null,
        value: Number.isFinite(tenCurrent) && Number.isFinite(twoCurrent)
          ? Number((tenCurrent - twoCurrent).toFixed(2))
          : null
      },
      netLiquidityIndex: {
        date: liq[liq.length - 1]?.date || null,
        value: liqValues.length ? Number(liqValues[liqValues.length - 1].toFixed(2)) : null
      }
    },
    liquiditySeries: liq.slice(-260),
    regime,
    events: buildEvents(),
    seriesStatus: statusMap,
    okSeriesCount: okCount,
    totalSeriesCount: statusEntries.length,
    generatedAt: new Date().toISOString()
  };
}

function emptyMacroPayload(reason) {
  return {
    metrics: {
      fedBalanceSheet: null,
      reverseRepo: null,
      treasuryGeneralAccount: null,
      tenYearYield: null,
      twoYearYield: null,
      realTenYearYield: null,
      dxyBroad: null,
      curveSpread: { date: null, value: null },
      netLiquidityIndex: { date: null, value: null }
    },
    liquiditySeries: [],
    regime: {
      liquidity: "Unknown",
      rates: "Unknown",
      macroRisk: "Unknown",
      rationale: [reason || "Macro data unavailable"]
    },
    events: buildEvents(),
    seriesStatus: {},
    okSeriesCount: 0,
    totalSeriesCount: Object.keys(FRED_SERIES).length,
    generatedAt: new Date().toISOString()
  };
}

async function refreshMacroCache() {
  if (macroRefreshPromise) return macroRefreshPromise;

  macroRefreshPromise = (async () => {
    const entries = await Promise.all(
      Object.entries(FRED_SERIES).map(async ([key, seriesId]) => {
        try {
          const points = await fetchFredSeries(seriesId);
          return [key, { points, status: { ok: true } }];
        } catch (error) {
          return [key, { points: [], status: { ok: false, error: error.message || "Fetch failed" } }];
        }
      })
    );

    const seriesMap = {};
    const statusMap = {};

    for (const [key, result] of entries) {
      seriesMap[key] = result.points;
      statusMap[key] = result.status;
    }

    const payload = buildMacroPayload(seriesMap, statusMap);
    payload.cacheState = "fresh";

    if (payload.okSeriesCount > 0) {
      writeMacroCache(payload);
    }

    return payload;
  })().finally(() => {
    macroRefreshPromise = null;
  });

  return macroRefreshPromise;
}

async function getMacroPayload() {
  const cache = readMacroCache();

  if (cache?.payload && Number.isFinite(cache.cachedAt)) {
    const ageMs = Date.now() - cache.cachedAt;
    if (ageMs <= MACRO_CACHE_TTL_MS) {
      return {
        ...cache.payload,
        cacheState: "fresh",
        cacheAgeMinutes: Number((ageMs / 60000).toFixed(1))
      };
    }

    refreshMacroCache().catch(() => {});
    return {
      ...cache.payload,
      cacheState: "stale",
      cacheAgeMinutes: Number((ageMs / 60000).toFixed(1))
    };
  }

  try {
    return await refreshMacroCache();
  } catch (error) {
    return {
      ...emptyMacroPayload(error.message || "Macro data unavailable"),
      cacheState: "error"
    };
  }
}

async function handleBtcCurrent(_url, res) {
  try {
    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", "bitcoin");
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_24hr_change", "true");
    url.searchParams.set("include_last_updated_at", "true");

    const data = await fetchJson(url, 10000);
    sendJson(res, 200, { bitcoin: data.bitcoin || null });
  } catch (error) {
    try {
      const daily = await fetchBtcDailySeries();
      const latestRow = daily[daily.length - 1];
      const prevRow = daily[daily.length - 2];
      const latest = Number(latestRow?.value);
      const prev = Number(prevRow?.value);
      const change = Number.isFinite(latest) && Number.isFinite(prev) && prev !== 0
        ? ((latest - prev) / prev) * 100
        : null;
      sendJson(res, 200, {
        bitcoin: {
          usd: Number.isFinite(latest) ? latest : null,
          usd_24h_change: Number.isFinite(change) ? Number(change.toFixed(4)) : null,
          last_updated_at: latestRow?.date ? Math.floor(new Date(`${latestRow.date}T00:00:00Z`).getTime() / 1000) : null
        },
        source: "fallback-merged-series"
      });
    } catch (fallbackError) {
      sendJson(res, 500, { error: fallbackError.message || error.message || "Failed to fetch current BTC price" });
    }
  }
}

async function handleBtcHistory(url, res) {
  const days = String(url.searchParams.get("days") || "30");

  try {
    const shouldUseLocal = days === "max";
    if (shouldUseLocal) {
      const daily = await fetchBtcDailySeries();
      const prices = slicePriceRowsByDays(toPriceRowsFromDaily(daily), days);
      sendJson(res, 200, { prices, source: "merged-series" });
      return;
    }

    try {
      const historyUrl = new URL("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart");
      historyUrl.searchParams.set("vs_currency", "usd");
      historyUrl.searchParams.set("days", days);

      const data = await fetchJson(historyUrl, 12000);
      sendJson(res, 200, { prices: data.prices || [], source: "coingecko" });
    } catch {
      const daily = await fetchBtcDailySeries();
      const prices = slicePriceRowsByDays(toPriceRowsFromDaily(daily), days);
      sendJson(res, 200, { prices, source: "fallback-merged-series" });
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to fetch BTC history" });
  }
}

async function handleBtcReturns(_url, res) {
  try {
    let prices = [];
    try {
      const historyUrl = new URL("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart");
      historyUrl.searchParams.set("vs_currency", "usd");
      historyUrl.searchParams.set("days", "730");
      const data = await fetchJson(historyUrl, 12000);
      prices = data.prices || [];
    } catch {
      const daily = await fetchBtcDailySeries();
      prices = slicePriceRowsByDays(toPriceRowsFromDaily(daily), "730");
    }

    sendJson(res, 200, {
      returns: {
        day1: calcReturnPct(prices, 1),
        day7: calcReturnPct(prices, 7),
        day30: calcReturnPct(prices, 30),
        ytd: calcYtdReturn(prices)
      }
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to fetch BTC returns" });
  }
}

async function handleMacroV1(_url, res) {
  const payload = await getMacroPayload();
  sendJson(res, 200, payload);
}

async function handleFearGreed(_url, res) {
  try {
    const url = new URL("https://api.alternative.me/fng/");
    url.searchParams.set("limit", "1");
    url.searchParams.set("format", "json");

    const payload = await fetchJson(url, 9000);
    const item = payload?.data?.[0] || null;
    const value = Number(item?.value);

    sendJson(res, 200, {
      value: Number.isFinite(value) ? value : null,
      classification: item?.value_classification || "Unknown",
      updatedAt: item?.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : null,
      source: "alternative.me"
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to fetch Fear & Greed" });
  }
}

async function handleM2VsBtc(_url, res) {
  try {
    const [m2SeriesRaw, btcSeriesRaw] = await Promise.all([
      (async () => {
        if (FRED_API_KEY) {
          try {
            return await fetchFredSeries("M2SL");
          } catch {
            return fetchFredSeriesCsvFallback("M2SL");
          }
        }
        return fetchFredSeriesCsvFallback("M2SL");
      })(),
      (async () => {
        if (FRED_API_KEY) {
          try {
            return await fetchFredSeries("CBBTCUSD");
          } catch {
            return fetchFredSeriesCsvFallback("CBBTCUSD");
          }
        }
        return fetchFredSeriesCsvFallback("CBBTCUSD");
      })()
    ]);

    const m2Series = (m2SeriesRaw || []).slice(-220);
    const m2Tail = m2Series.slice(-120);
    const dates = m2Tail.map(point => point.date);
    const btcAligned = alignSeriesToDates(btcSeriesRaw || [], dates);

    const points = m2Tail
      .map((point, i) => {
        const btc = Number(btcAligned[i]);
        if (!Number.isFinite(point?.value) || !Number.isFinite(btc)) return null;
        return {
          date: point.date,
          m2: Number(point.value),
          btc
        };
      })
      .filter(Boolean);

    if (!points.length) {
      sendJson(res, 500, { error: "No overlapping M2/BTC data points available" });
      return;
    }

    sendJson(res, 200, {
      points,
      source: {
        m2Series: "FRED M2SL",
        btc: "FRED CBBTCUSD"
      }
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to fetch M2 vs BTC data" });
  }
}

async function handlePlanBModel(_url, res) {
  try {
    const btcDaily = await fetchBtcDailySeries();
    if (!btcDaily.length) {
      sendJson(res, 500, { error: "Missing BTC history for model" });
      return;
    }

    const monthly = computeMonthlyCloses(btcDaily);
    const monthlyDatesRaw = monthly.map(item => item.date);
    const monthlyPrices = monthly.map(item => item.value);
    const monthlyRsi = computeRsi(monthlyPrices, 14);
    const timeline = buildMonthTimeline("2011-01", "2027-12");

    const dailySma1400 = computeRollingSma(btcDaily.map(item => item.value), 1400);
    const dailySmaSeries = btcDaily
      .map((item, i) => ({ date: item.date, value: dailySma1400[i] }))
      .filter(item => Number.isFinite(item.value));
    const maAligned = fillMonthlyFromDaily(timeline, buildDailyValueMap(dailySmaSeries));
    const s2fSeries = computeS2FSeries(timeline);

    const priceByMonth = new Map(monthly.map(item => [monthKey(item.date), Number(item.value)]));
    const rsiByMonth = new Map(monthlyDatesRaw.map((date, idx) => [monthKey(date), monthlyRsi[idx]]));

    const points = timeline.map(date => {
      const k = monthKey(date);
      const price = priceByMonth.get(k);
      const rsi = rsiByMonth.get(k);
      return {
        date,
        price: Number.isFinite(price) ? Number(price.toFixed(2)) : null,
        rsi14m: Number.isFinite(rsi) ? Number(rsi.toFixed(2)) : null,
        rsiColor: rsiToColor(rsi)
      };
    });

    const ma200wSeries = timeline
      .map((date, idx) => ({
        date,
        value: Number.isFinite(maAligned[idx]) ? Number(maAligned[idx].toFixed(2)) : null
      }))
      .filter(item => Number.isFinite(item.value));

    const s2fClean = s2fSeries.filter(item => Number.isFinite(item.value));

    sendJson(res, 200, {
      monthlyPoints: points,
      ma200wSeries,
      s2fSeries: s2fClean,
      meta: {
        formulaVersion: "s2f-log-v1",
        coefficients: { a: -2.68, b: 3.3 },
        includesRealizedPrice: false,
        note: "Realized price deferred to a future version",
        btcDataRange: {
          firstDate: btcDaily[0]?.date || null,
          lastDate: btcDaily[btcDaily.length - 1]?.date || null
        },
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to build PlanB model" });
  }
}


const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  if (url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      fredConfigured: Boolean(FRED_API_KEY)
    });
  }

  if (url.pathname === "/api/btc/current") {
    return handleBtcCurrent(url, res);
  }

  if (url.pathname === "/api/btc/history") {
    return handleBtcHistory(url, res);
  }

  if (url.pathname === "/api/btc/returns") {
    return handleBtcReturns(url, res);
  }

  if (url.pathname === "/api/bitcoin/fear-greed") {
    return handleFearGreed(url, res);
  }

  if (url.pathname === "/api/bitcoin/m2-vs-btc") {
    return handleM2VsBtc(url, res);
  }

  if (url.pathname === "/api/bitcoin/planb-model") {
    return handlePlanBModel(url, res);
  }

  if (url.pathname === "/api/macro/v1") {
    return handleMacroV1(url, res);
  }

  if (url.pathname === "/api/calendar") {
    return sendJson(res, 200, { events: buildCalendarEvents() });
  }

  const urlPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(urlPath).replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  serveFile(filePath, res);
});

server.listen(PORT, () => {
  console.log(`Macro Dashboard running on http://localhost:${PORT}`);
});
