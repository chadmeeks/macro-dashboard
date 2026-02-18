const btcPriceEl = document.getElementById("btcPrice");
const priceMetaEl = document.getElementById("priceMeta");
const returnsRowEl = document.getElementById("returnsRow");
const refreshBtn = document.getElementById("refreshBtn");
const rangeSelect = document.getElementById("rangeSelect");
const btcRangeControl = document.getElementById("btcRangeControl");
const liquidityMetaEl = document.getElementById("liquidityMeta");
const fearGreedValueEl = document.getElementById("fearGreedValue");
const fearGreedClassEl = document.getElementById("fearGreedClass");
const fearGreedMetaEl = document.getElementById("fearGreedMeta");
const fearGreedBarEl = document.getElementById("fearGreedBar");
const m2BtcMetaEl = document.getElementById("m2BtcMeta");

const priceChartCanvas = document.getElementById("priceChart");
const liquidityChartCanvas = document.getElementById("liquidityChart");
const m2BtcChartCanvas = document.getElementById("m2BtcChart");

const liquidityMetricsEl = document.getElementById("liquidityMetrics");
const ratesMetricsEl = document.getElementById("ratesMetrics");
const regimePillsEl = document.getElementById("regimePills");
const regimeRationaleEl = document.getElementById("regimeRationale");

const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".tab-panel");

const calPrevBtn = document.getElementById("calPrevBtn");
const calNextBtn = document.getElementById("calNextBtn");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const calendarGrid = document.getElementById("calendarGrid");
const calendarUpcoming = document.getElementById("calendarUpcoming");

let priceChart;
let liquidityChart;
let m2BtcChart;
let calendarEvents = [];
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function formatUsd(value, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits
  }).format(value);
}

function formatBillions(value) {
  if (!Number.isFinite(Number(value))) return "N/A";
  return `${Number(value).toFixed(0)}B`;
}

function formatMillions(value) {
  if (!Number.isFinite(Number(value))) return "N/A";
  return `${Number(value).toFixed(0)}M`;
}

function formatPercent(value, digits = 2) {
  if (!Number.isFinite(value)) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatDate(value) {
  if (!value) return "N/A";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function toIsoDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString().slice(0, 10);
}

async function api(path, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function setActiveTab(tabName) {
  tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.tab === tabName));
  panels.forEach(panel => panel.classList.toggle("active", panel.id === `panel-${tabName}`));
  btcRangeControl.classList.toggle("hidden", tabName !== "bitcoin");
}

function renderPriceCard(current, returns) {
  const price = Number(current?.usd || 0);
  const dayChange = Number(current?.usd_24h_change || 0);
  const updatedAtMs = Number(current?.last_updated_at || 0) * 1000;

  btcPriceEl.textContent = formatUsd(price, price >= 1000 ? 0 : 2);

  const updatedLabel = updatedAtMs
    ? new Date(updatedAtMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : "unknown";

  priceMetaEl.textContent = `${formatPercent(dayChange)} (24h) · Updated ${updatedLabel}`;
  priceMetaEl.classList.remove("positive", "negative");
  priceMetaEl.classList.add(dayChange >= 0 ? "positive" : "negative");

  const chips = [
    { label: "24H", value: returns.day1 },
    { label: "7D", value: returns.day7 },
    { label: "30D", value: returns.day30 },
    { label: "YTD", value: returns.ytd }
  ];

  returnsRowEl.innerHTML = chips.map(item => {
    const numeric = Number(item.value);
    if (!Number.isFinite(numeric)) return `<span class="chip">${item.label}: N/A</span>`;
    const tone = numeric >= 0 ? "positive" : "negative";
    return `<span class="chip ${tone}">${item.label}: ${formatPercent(numeric)}</span>`;
  }).join("");
}


function renderFearGreed(payload) {
  const value = Number(payload?.value);
  const classification = String(payload?.classification || "Unknown");
  const updatedAt = payload?.updatedAt || null;

  if (!Number.isFinite(value)) {
    fearGreedValueEl.textContent = "N/A";
    fearGreedClassEl.textContent = "Unavailable";
    fearGreedClassEl.classList.remove("fg-fear", "fg-neutral", "fg-greed");
    fearGreedMetaEl.textContent = "Source unavailable";
    fearGreedBarEl.style.width = "0%";
    return;
  }

  fearGreedValueEl.textContent = `${Math.round(value)}`;
  fearGreedClassEl.textContent = classification;
  fearGreedClassEl.classList.remove("fg-fear", "fg-neutral", "fg-greed");

  const lower = classification.toLowerCase();
  if (lower.includes("fear")) {
    fearGreedClassEl.classList.add("fg-fear");
  } else if (lower.includes("greed")) {
    fearGreedClassEl.classList.add("fg-greed");
  } else {
    fearGreedClassEl.classList.add("fg-neutral");
  }

  fearGreedBarEl.style.width = `${Math.max(0, Math.min(100, value))}%`;
  fearGreedMetaEl.textContent = updatedAt
    ? `Updated ${new Date(updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · Source: Alternative.me`
    : "Source: Alternative.me";
}

function renderPriceChart(points) {
  const labels = points.map(([ts]) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const values = points.map(([, value]) => Number(value));

  if (priceChart) priceChart.destroy();

  priceChart = new Chart(priceChartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "BTC / USD",
        data: values,
        borderColor: "#1a73e8",
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.22,
        fill: true,
        backgroundColor: "rgba(26, 115, 232, 0.14)"
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: {
          grid: { color: "rgba(95, 99, 104, 0.16)" },
          ticks: { callback: value => formatUsd(value) }
        }
      }
    }
  });
}

function renderM2BtcChart(points) {
  if (m2BtcChart) { m2BtcChart.destroy(); m2BtcChart = null; }

  if (!Array.isArray(points) || !points.length) {
    if (m2BtcMetaEl) m2BtcMetaEl.textContent = "M2/BTC series unavailable";
    return;
  }

  const labels = points.map(item => new Date(item.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" }));
  const btcValues = points.map(item => Number(item.btc));
  const m2Values = points.map(item => Number(item.m2) / 1000);

  m2BtcChart = new Chart(m2BtcChartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "BTC / USD",
          data: btcValues,
          borderColor: "#1a73e8",
          backgroundColor: "rgba(26, 115, 232, 0.12)",
          borderWidth: 2.2,
          pointRadius: 0,
          tension: 0.2,
          yAxisID: "yBtc"
        },
        {
          label: "M2 (USD Trillions)",
          data: m2Values,
          borderColor: "#34a853",
          backgroundColor: "rgba(52, 168, 83, 0.14)",
          borderWidth: 2.2,
          pointRadius: 0,
          tension: 0.2,
          yAxisID: "yM2"
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: { boxWidth: 12, boxHeight: 12 }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
        yBtc: {
          position: "left",
          grid: { color: "rgba(95, 99, 104, 0.14)" },
          ticks: { callback: value => formatUsd(value) }
        },
        yM2: {
          position: "right",
          grid: { display: false },
          ticks: { callback: value => `$${Number(value).toFixed(1)}T` }
        }
      }
    }
  });

  if (m2BtcMetaEl) {
    const start = points[0]?.date;
    const end = points[points.length - 1]?.date;
    m2BtcMetaEl.textContent = `M2SL (FRED) vs BTC/USD · ${formatDate(start)} to ${formatDate(end)}`;
  }
}

function metricHtml({ name, value, date }) {
  return `<article class="metric"><p class="name">${name}</p><p class="value">${value ?? "N/A"}</p><p class="date">${date ? `As of ${formatDate(date)}` : ""}</p></article>`;
}

function renderLiquidity(macro) {
  const m = macro.metrics || {};
  liquidityMetricsEl.innerHTML = [
    metricHtml({ name: "Fed Balance Sheet", value: formatMillions(m.fedBalanceSheet?.value), date: m.fedBalanceSheet?.date }),
    metricHtml({ name: "Reverse Repo", value: formatBillions(m.reverseRepo?.value), date: m.reverseRepo?.date }),
    metricHtml({ name: "Treasury General Account", value: formatBillions(m.treasuryGeneralAccount?.value), date: m.treasuryGeneralAccount?.date }),
    metricHtml({ name: "Net Liquidity Index", value: Number.isFinite(Number(m.netLiquidityIndex?.value)) ? Number(m.netLiquidityIndex.value).toFixed(2) : "N/A", date: m.netLiquidityIndex?.date })
  ].join("");

  const cacheState = macro.cacheState || "unknown";
  const age = Number.isFinite(Number(macro.cacheAgeMinutes)) ? ` · cache ${macro.cacheAgeMinutes}m` : "";
  const okSummary = Number.isFinite(Number(macro.okSeriesCount)) ? ` · ${macro.okSeriesCount}/${macro.totalSeriesCount || 0} series` : "";
  liquidityMetaEl.textContent = `Composite = normalized Fed balance sheet - RRP - TGA · ${cacheState}${age}${okSummary}`;

  const series = Array.isArray(macro.liquiditySeries) ? macro.liquiditySeries : [];
  const labels = series.map(item => new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const values = series.map(item => item.netLiquidityIndex);

  if (liquidityChart) { liquidityChart.destroy(); liquidityChart = null; }
  if (!values.length) return;

  liquidityChart = new Chart(liquidityChartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Net Liquidity Index",
        data: values,
        borderColor: "#34a853",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.18,
        fill: true,
        backgroundColor: "rgba(52, 168, 83, 0.12)"
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        y: { grid: { color: "rgba(95, 99, 104, 0.14)" } }
      }
    }
  });
}

function renderRates(macro) {
  const m = macro.metrics || {};
  ratesMetricsEl.innerHTML = [
    metricHtml({ name: "10Y Treasury", value: Number.isFinite(Number(m.tenYearYield?.value)) ? `${Number(m.tenYearYield.value).toFixed(2)}%` : "N/A", date: m.tenYearYield?.date }),
    metricHtml({ name: "10Y Real Yield", value: Number.isFinite(Number(m.realTenYearYield?.value)) ? `${Number(m.realTenYearYield.value).toFixed(2)}%` : "N/A", date: m.realTenYearYield?.date }),
    metricHtml({ name: "DXY Broad", value: Number.isFinite(Number(m.dxyBroad?.value)) ? Number(m.dxyBroad.value).toFixed(2) : "N/A", date: m.dxyBroad?.date }),
    metricHtml({ name: "2s10s Curve", value: Number.isFinite(Number(m.curveSpread?.value)) ? `${Number(m.curveSpread.value).toFixed(2)}%` : "N/A", date: m.curveSpread?.date })
  ].join("");
}

function renderRegime(macro) {
  const regime = macro.regime || { liquidity: "Unknown", rates: "Unknown", macroRisk: "Unknown", rationale: [] };
  const tone = value => {
    if (value === "Low" || value === "Expanding" || value === "Easing") return "ok";
    if (value === "Medium" || value === "Unknown") return "warn";
    return "risk";
  };

  regimePillsEl.innerHTML = [
    `<span class="pill ${tone(regime.liquidity)}">Liquidity: ${regime.liquidity}</span>`,
    `<span class="pill ${tone(regime.rates)}">Rates: ${regime.rates}</span>`,
    `<span class="pill ${tone(regime.macroRisk)}">Macro Risk: ${regime.macroRisk}</span>`
  ].join("");

  regimeRationaleEl.innerHTML = (regime.rationale || []).map(item => `<li>${item}</li>`).join("");
}

function renderCalendar() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  calendarMonthLabel.textContent = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const eventMap = new Map();
  for (const event of calendarEvents) {
    const key = event.dateISO;
    if (!eventMap.has(key)) eventMap.set(key, []);
    eventMap.get(key).push(event);
  }

  const todayIso = toIsoDate(new Date());
  const cells = [];

  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toIsoDate(d);
    const isCurrentMonth = d.getMonth() === month;
    const dayEvents = eventMap.get(iso) || [];

    cells.push(`
      <div class="calendar-day ${isCurrentMonth ? "" : "muted"} ${iso === todayIso ? "today" : ""}">
        <p class="day-num">${d.getDate()}</p>
        <div class="day-events">
          ${dayEvents.slice(0, 2).map(event => `<span class="dot ${event.type === "earnings" ? "earnings" : "macro"}">${event.title}</span>`).join("")}
        </div>
      </div>
    `);
  }

  calendarGrid.innerHTML = cells.join("");

  const nowIso = toIsoDate(new Date());
  const upcoming = calendarEvents.filter(event => event.dateISO >= nowIso).slice(0, 12);
  calendarUpcoming.innerHTML = upcoming.map(event => `
    <article class="upcoming-item">
      <p class="upcoming-title">${event.title}${event.subtitle ? ` · ${event.subtitle}` : ""}</p>
      <p class="upcoming-date">${event.date}</p>
      <p class="upcoming-note">${event.note}</p>
    </article>
  `).join("");
}

async function loadCalendar() {
  try {
    const payload = await api("/api/calendar", 12000);
    calendarEvents = Array.isArray(payload.events) ? payload.events : [];
    renderCalendar();
  } catch {
    calendarEvents = [];
    renderCalendar();
  }
}

async function loadDashboard() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  const macroPromise = api("/api/macro/v1", 14000);
  const [currentRes, historyRes, returnsRes, fearGreedRes, calendarRes, m2BtcRes] = await Promise.allSettled([
    api("/api/btc/current", 9000),
    api(`/api/btc/history?days=${encodeURIComponent(rangeSelect.value)}`, 11000),
    api("/api/btc/returns", 11000),
    api("/api/bitcoin/fear-greed", 9000),
    api("/api/calendar", 12000),
    api("/api/bitcoin/m2-vs-btc", 12000)
  ]);

  const currentPayload = currentRes.status === "fulfilled" ? currentRes.value : null;
  const historyPayload = historyRes.status === "fulfilled" ? historyRes.value : null;
  const returnsPayload = returnsRes.status === "fulfilled" ? returnsRes.value : null;

  if (currentPayload?.bitcoin) {
    renderPriceCard(currentPayload.bitcoin, returnsPayload?.returns || { day1: null, day7: null, day30: null, ytd: null });
  } else {
    btcPriceEl.textContent = "Unavailable";
    priceMetaEl.textContent = "BTC price feed unavailable";
    priceMetaEl.classList.remove("positive", "negative");
    returnsRowEl.innerHTML = "";
  }

  if (historyPayload?.prices?.length) renderPriceChart(historyPayload.prices);

  const fearGreedPayload = fearGreedRes.status === "fulfilled" ? fearGreedRes.value : null;
  renderFearGreed(fearGreedPayload);

  const m2BtcPayload = m2BtcRes.status === "fulfilled" ? m2BtcRes.value : null;
  renderM2BtcChart(m2BtcPayload?.points || []);


  if (calendarRes.status === "fulfilled") {
    calendarEvents = Array.isArray(calendarRes.value.events) ? calendarRes.value.events : [];
  } else {
    calendarEvents = [];
  }
  renderCalendar();

  const macroRes = await Promise.allSettled([macroPromise]);
  const macroPayload = macroRes[0].status === "fulfilled" ? macroRes[0].value : null;

  if (macroPayload) {
    renderLiquidity(macroPayload);
    renderRates(macroPayload);
    renderRegime(macroPayload);
  } else {
    liquidityMetaEl.textContent = "Macro feeds unavailable or timed out";
  }

  refreshBtn.disabled = false;
  refreshBtn.textContent = "Refresh";
}

for (const tab of tabs) {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
}

calPrevBtn.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});

calNextBtn.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});

refreshBtn.addEventListener("click", loadDashboard);
rangeSelect.addEventListener("change", loadDashboard);

setActiveTab("bitcoin");
loadDashboard();
