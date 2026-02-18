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
    sendJson(res, 500, { error: error.message || "Failed to fetch current BTC price" });
  }
}

async function handleBtcHistory(url, res) {
  const days = String(url.searchParams.get("days") || "30");

  try {
    const historyUrl = new URL("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart");
    historyUrl.searchParams.set("vs_currency", "usd");
    historyUrl.searchParams.set("days", days);

    const data = await fetchJson(historyUrl, 12000);
    sendJson(res, 200, { prices: data.prices || [] });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Failed to fetch BTC history" });
  }
}

async function handleBtcReturns(_url, res) {
  try {
    const historyUrl = new URL("https://api.coingecko.com/api/v3/coins/bitcoin/market_chart");
    historyUrl.searchParams.set("vs_currency", "usd");
    historyUrl.searchParams.set("days", "730");

    const data = await fetchJson(historyUrl, 12000);
    const prices = data.prices || [];

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
