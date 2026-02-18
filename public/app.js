const btcPriceEl = document.getElementById("btcPrice");
const priceMetaEl = document.getElementById("priceMeta");
const returnsRowEl = document.getElementById("returnsRow");
const refreshBtn = document.getElementById("refreshBtn");
const rangeSelect = document.getElementById("rangeSelect");
const liquidityMetaEl = document.getElementById("liquidityMeta");

const priceChartCanvas = document.getElementById("priceChart");
const liquidityChartCanvas = document.getElementById("liquidityChart");

const liquidityMetricsEl = document.getElementById("liquidityMetrics");
const ratesMetricsEl = document.getElementById("ratesMetrics");
const regimePillsEl = document.getElementById("regimePills");
const regimeRationaleEl = document.getElementById("regimeRationale");
const eventsRowEl = document.getElementById("eventsRow");

let priceChart;
let liquidityChart;

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

async function api(path, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
    if (!Number.isFinite(numeric)) {
      return `<span class="chip">${item.label}: N/A</span>`;
    }
    const tone = numeric >= 0 ? "positive" : "negative";
    return `<span class="chip ${tone}">${item.label}: ${formatPercent(numeric)}</span>`;
  }).join("");
}

function renderPriceChart(points) {
  const labels = points.map(([ts]) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const values = points.map(([, value]) => Number(value));

  if (priceChart) priceChart.destroy();

  priceChart = new Chart(priceChartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "BTC / USD",
          data: values,
          borderColor: "#1a73e8",
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.22,
          fill: true,
          backgroundColor: "rgba(26, 115, 232, 0.14)"
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 8 }
        },
        y: {
          grid: { color: "rgba(95, 99, 104, 0.16)" },
          ticks: {
            callback: value => formatUsd(value)
          }
        }
      }
    }
  });
}

function metricHtml({ name, value, date }) {
  return `
    <article class="metric">
      <p class="name">${name}</p>
      <p class="value">${value ?? "N/A"}</p>
      <p class="date">${date ? `As of ${formatDate(date)}` : ""}</p>
    </article>
  `;
}

function renderLiquidity(macro) {
  const m = macro.metrics || {};
  liquidityMetricsEl.innerHTML = [
    metricHtml({ name: "Fed Balance Sheet", value: formatMillions(m.fedBalanceSheet?.value), date: m.fedBalanceSheet?.date }),
    metricHtml({ name: "Reverse Repo", value: formatBillions(m.reverseRepo?.value), date: m.reverseRepo?.date }),
    metricHtml({ name: "Treasury General Account", value: formatBillions(m.treasuryGeneralAccount?.value), date: m.treasuryGeneralAccount?.date }),
    metricHtml({
      name: "Net Liquidity Index",
      value: Number.isFinite(Number(m.netLiquidityIndex?.value)) ? Number(m.netLiquidityIndex.value).toFixed(2) : "N/A",
      date: m.netLiquidityIndex?.date
    })
  ].join("");

  const cacheState = macro.cacheState || "unknown";
  const age = Number.isFinite(Number(macro.cacheAgeMinutes)) ? ` · cache ${macro.cacheAgeMinutes}m old` : "";
  const okSummary = Number.isFinite(Number(macro.okSeriesCount))
    ? ` · ${macro.okSeriesCount}/${macro.totalSeriesCount || 0} series`
    : "";
  liquidityMetaEl.textContent = `Composite = normalized Fed balance sheet - RRP - TGA · ${cacheState}${age}${okSummary}`;

  const series = Array.isArray(macro.liquiditySeries) ? macro.liquiditySeries : [];
  const labels = series.map(item => new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const values = series.map(item => item.netLiquidityIndex);

  if (liquidityChart) {
    liquidityChart.destroy();
    liquidityChart = null;
  }

  if (!values.length) {
    return;
  }

  liquidityChart = new Chart(liquidityChartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Net Liquidity Index",
          data: values,
          borderColor: "#34a853",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.18,
          fill: true,
          backgroundColor: "rgba(52, 168, 83, 0.12)"
        }
      ]
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
    metricHtml({
      name: "10Y Treasury",
      value: Number.isFinite(Number(m.tenYearYield?.value)) ? `${Number(m.tenYearYield.value).toFixed(2)}%` : "N/A",
      date: m.tenYearYield?.date
    }),
    metricHtml({
      name: "10Y Real Yield",
      value: Number.isFinite(Number(m.realTenYearYield?.value)) ? `${Number(m.realTenYearYield.value).toFixed(2)}%` : "N/A",
      date: m.realTenYearYield?.date
    }),
    metricHtml({
      name: "DXY Broad",
      value: Number.isFinite(Number(m.dxyBroad?.value)) ? Number(m.dxyBroad.value).toFixed(2) : "N/A",
      date: m.dxyBroad?.date
    }),
    metricHtml({
      name: "2s10s Curve",
      value: Number.isFinite(Number(m.curveSpread?.value)) ? `${Number(m.curveSpread.value).toFixed(2)}%` : "N/A",
      date: m.curveSpread?.date
    })
  ].join("");
}

function renderRegime(macro) {
  const regime = macro.regime;

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

  regimeRationaleEl.innerHTML = regime.rationale.map(item => `<li>${item}</li>`).join("");
}

function renderEvents(events) {
  eventsRowEl.innerHTML = events.map(event => `
    <article class="event">
      <p class="title">${event.title}</p>
      <p class="date">${event.date}</p>
      <p class="note">${event.note}</p>
    </article>
  `).join("");
}

async function loadDashboard() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  const macroPromise = api("/api/macro/v1", 14000);

  const [currentRes, historyRes, returnsRes] = await Promise.allSettled([
    api("/api/btc/current", 9000),
    api(`/api/btc/history?days=${encodeURIComponent(rangeSelect.value)}`, 11000),
    api("/api/btc/returns", 11000)
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

  if (historyPayload?.prices?.length) {
    renderPriceChart(historyPayload.prices);
  }

  const macroRes = await Promise.allSettled([macroPromise]);
  const macroPayload = macroRes[0].status === "fulfilled" ? macroRes[0].value : null;

  if (macroPayload) {
    renderLiquidity(macroPayload);
    renderRates(macroPayload);
    renderRegime(macroPayload);
    renderEvents(macroPayload.events || []);
  } else {
    liquidityMetaEl.textContent = "Macro feeds unavailable or timed out";
  }

  refreshBtn.disabled = false;
  refreshBtn.textContent = "Refresh";
}

refreshBtn.addEventListener("click", loadDashboard);
rangeSelect.addEventListener("change", loadDashboard);

loadDashboard();
