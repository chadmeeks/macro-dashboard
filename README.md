# Macro Dashboard

A local Bitcoin and macro research workspace. The overview summarizes trend, sentiment, corporate ownership and monetary conditions; detail pages expose history, definitions and sources.

## Run

Requires Node.js 22 or newer. No dependencies or API keys are needed for the default public feeds.

```sh
npm start
```

Open **http://localhost:3001**. The server binds to localhost only. It never stops another process; use `PORT=3002 npm start` if the port is busy.

Optional environment variables:

- `PORT`: server port (default 3001).
- `FRED_API_KEY`: prefer the FRED JSON API; the public CSV feed remains a fallback.
- `MACRO_CACHE_DIR`: cache directory (default `data/cache-v2/`).

## What is included

- **Overview:** local “Last refreshed” timestamp for the last completed dashboard check (source observation dates and failures remain separate), daily market perspective, transparent rules-based short read, macro pulse, ownership concentration and upcoming published FOMC decisions.
- **Bitcoin:** spot quote, daily price with 50/200-day means, 3M/1Y/4Y/all-history and log views; weekly RSI and 200-week mean, returns, volatility, drawdown; supply, smoothed hashrate, active addresses and transactions; sentiment history.
- **Adoption:** corporate treasury snapshot, concentration, maximum-supply share and searchable company holdings, plus direct ETF-flow and issuer links.
- **Macro:** interactive explorer, date-aligned dollar-liquidity proxy, rates, dollar, credit, inflation, unemployment and US M2.
- **Sources:** per-source health, observation dates, stale states and complete calculation notes.

Charts support pointer inspection and a keyboard-accessible date slider. Layouts adapt to desktop and phone screens. The interface has no third-party scripts, chart libraries or font downloads.

## Source behavior

Primary sources are Coin Metrics Community, Coinbase, CoinGecko, FRED, Alternative.me and the Federal Reserve. Bitcoin history can fall back to Blockchain.com; this fallback does not invent network metrics. Source requests have a 12-second timeout and caches are independent.

Each cache preserves its last successful response. Expired data is visibly stale while refreshing in the background; the **Refresh data** button waits for a fresh attempt. The client reloads once after 18 seconds to pick up initial background refreshes, then once per minute when visible. Observation-age checks are separate from cache age.

Treasury data has no per-company reporting timestamps. A current retrieval is **not** confirmation that a holding was reported today. All dates and coverage limitations remain visible.

## Deliberate limits

- Automated ETF access is not configured. Reported-flow CSV imports are supported; see the research update below.
- Realized price is derived from price / public MVRV; it is not a separately observed investor acquisition price.
- CPI and jobs schedules link to BLS rather than guessing release dates; automated calendar retrieval was denied.
- Corporate snapshots measure ownership, not net purchases, and are not independently reconciled with filings.
- The earlier stock-to-flow projection and dual-axis M2/BTC overlay were removed from the default experience. US M2 remains in the macro explorer.
- The old `data/macro-cache.json` is left intact but not used by V2. It contains the prior methodology and must not be mixed into corrected calculations.

## Verification

```sh
npm test
```

Uses Node's built-in test runner. Tests cover date and unit alignment, missing observations, daily/weekly windows, RSI, returns, volatility, monthly boundaries, calendar parsing, cache persistence and failure isolation, plus HTTP routes and path containment. HTTP tests need permission to bind a temporary localhost port.

Manual browser checks: navigate all five views; change chart periods/log scale; inspect with mouse and keyboard; filter company names and toggle the full list; select macro indicators; refresh; inspect at 390px and desktop widths. Verify offline and stale data don't appear current. `PROJECT_NOTES.md` records the current handoff.

## Structure

- `server.js`: local HTTP/static server and independent feed endpoints.
- `lib/data.js`: provider adapters, source metadata and derived macro readings.
- `lib/analytics.js`: pure calculations and parsers.
- `lib/cache.js`: per-source memory/disk caching and in-flight deduplication.
- `public/`: responsive interface and interactive SVG charts.
- `test/`: dependency-free automated regression checks.

Runtime data under `data/cache-v2/` is ignored by Git. No trades, alerts, account connections or paid services are configured.

## Research update (2.1)

The new research layer adds:

- **Since your last visit:** a browser-local snapshot of price/trend, sentiment, key macro readings, corporate holdings and MVRV. Refreshes keep the comparison baseline fixed. **Mark reviewed** explicitly starts a new baseline and dismisses the check-in until new comparable readings or source-status changes appear. Numerical comparisons exclude stale values, older observations and provider changes. Same-date updates are identified as revisions. No login or cross-device synchronization is implied.
- **Historical context:** selectable 1/3/5-year empirical percentiles, 10th/median/90th readings, actual coverage dates and sample counts. Ties receive midpoint ranks. At least 20 observations are required. This includes macro readings, sentiment, valuation, weekly RSI, volatility and distance from the 200-day mean.
- **Valuation:** the public Coin Metrics `CapMVRVCur` series is available even though `CapRealUSD` was not. Realized price is derived from exactly aligned `PriceUSD / CapMVRVCur` observations; incomplete days, missing values and nonpositive inputs are excluded.
- **Chart inspection:** full-precision tooltips, two-date price comparisons, macro chart windows and optional historical FOMC markers. Dates establish context, not causal attribution.
- **Corporate history:** successful snapshots persist on disk. New coverage, removed coverage and balance changes are distinct. None is automatically called a purchase or sale.
- **Source history:** observed dates and values are retained; same-date revisions and provider switches are tracked separately. Source failures survive server restarts and clear after success. Sources & methods shows the latest revision batches and request failures.

### ETF imports

No ETF API subscription or credentials are required. Since automated sources tested were blocked or authenticated, Adoption includes a validated **CSV importer**, with source attribution and reporting completeness. This is a manual dataset; it does not update itself.

Download the blank column template in the app and populate it from a trusted reported-flow dataset. Columns:

```text
date,net_flow_usd,reported_funds,expected_funds,status
```

- Dates must be unique ISO dates on weekdays and cannot be in the future.
- Amounts are signed **USD**, not USD millions. Zero is a valid reported flow; a blank amount is unknown.
- `reported_funds` and `expected_funds` describe the covered universe. Name that universe explicitly in the form.
- Status is `complete`, `partial`, or `pending`. A complete row requires a finite total and matching fund counts.
- Rolling 5/20 totals use the last supplied rows, require all of them complete, and require a stable expected fund count. Incomplete rows are never skipped. The aggregate format cannot independently detect omitted trading sessions or membership changes behind an unchanged fund count; the app states that limitation.
- An import replaces the displayed series. Detected changes to overlapping dates are archived; switching source names is tracked as a provider change. A failed import preserves the existing data.
- Up to 500 KB / 5,000 rows. HTTPS source URLs only. No arbitrary URLs are fetched by the importer.

A future automated provider can use this same normalized row format. No unverified connector or credential UI is shipped.

### Retention

`data/cache-v2/history/` contains observed values, revision batches and corporate snapshots. Existing V2 caches seed the archive with their original retrieval timestamp; earlier history is not invented. Observation dates and corporate snapshots are retained; revision batches are capped at the latest 200 per source. Source health is saved alongside each cache. These local files remain ignored by Git. Back up `data/cache-v2/` if you want to preserve your research history.

The running server records on successful retrievals; it is not a scheduler when stopped. Visits to this app drive source refreshes.

### Price models

Open `/#models` for separate logarithmic charts pairing Bitcoin price with Power Law, PlanB's original 2019 S2F reconstruction, realized price, and the completed 200-week average. The charts share a date-range control and use independent price scales. The default range shows the full available price history beginning in 2010. Each chart has independent No extension / +1 year / +5 years controls. Power Law also offers historical residual boundaries. A shared scorecard compares the references.

Power Law uses OLS on log10(price) against log10(days since 2009-01-03). The default fit ends 2023-12-31; selectable earlier cutoffs show subsequent performance without refitting. The displayed coefficients and fitting dates identify each fit. This is a retrospective calculation on today's data, not a preserved vintage forecast or Santostasi's exact calibration.

S2F retains `market cap = exp(14.6) * SF^3.3`, with `SF = (circulating supply - 1,000,000) / annualized issuance`. Annualized issuance is the exact-date 30-day supply increase times 365.25/30. Model price divides model market cap by circulating supply. This differs from PlanB's monthly block-production inputs and is explicitly labeled a reconstruction. `GET /api/supply` provides completed Coin Metrics daily supply history with the existing six-hour cache, stale handling and source-health reporting. Missing 30-day endpoints produce no S2F estimate.

The scorecard reports median absolute percentage error at completed calendar month ends, with dates and counts separately for fitting and subsequent periods. S2F's latter period starts at publication (2019-03-22) and uses observed supply, not forecast supply. Realized price and moving averages are references, not scored forecasts. Every deviation uses a matching observation date; realized price uses its own provider's daily price. Bands use only fitting-period residuals and are not forecast probabilities. Future rows contain scenario values only, never observed prices or reference readings.


#### Extension assumptions

All horizons use calendar years (February 29 clamps to February 28), start at the latest completed price date, and appear dashed. Future rows are excluded from fitting and the scorecard. Missing matching-date inputs withhold the affected scenario.

- Power Law holds the selected fit coefficients fixed.
- S2F assumes 144 blocks/day and infers approximate subsidy epochs from circulating supply. It applies 210,000-block subsidy halvings and recomputes rolling 30-day issuance using observed supply before the boundary and simulated supply afterward. This is an approximation, not an exact height-based halving forecast. Protocol reference: https://github.com/bitcoin/bitcoin/blob/master/src/kernel/chainparams.cpp
- Realized price extrapolates the log-linear daily trend from the last four years of available history, anchored to the last observation (minimum one year). It does not model future on-chain spending or coin cost bases.
- The 200-week average assumes all future Sunday Bitcoin prices equal the last daily price and rolls the 200-week window forward. It converges to that assumed flat price after 200 weeks.

The Bitcoin network launched in January 2009; the available market-price dataset starts in 2010. The 200-week curve begins only after 200 complete weeks; no early references are fabricated.

### ETF flow candles

The Adoption view includes Daily / Weekly / Monthly net-flow candles, using the existing CSV import. These are cumulative-flow candles, not fund-price OHLC: each period opens at zero, closes at its supplied net-flow sum, and its high/low include zero and the cumulative balances at each supplied daily close. A daily candle therefore has no invented intraday wick. Weeks start Monday; months follow UTC calendar boundaries.

A candle is withheld when any supplied row is partial/pending, has no total, or has inconsistent fund coverage within the period. Withheld candles have orange markers. Zero-flow sessions remain valid. Tooltips and keyboard inspection expose the calendar period, actual supplied date span, session count, reporting issues, and whether the calendar period is still open. Calendar completeness cannot be inferred from this CSV: absent trading days, holidays and truncated edge periods are not fabricated. The chart shows up to the latest 60 supplied periods. No live ETF provider or sample dataset is installed.

### Per-ETF history and stacked bars

The Adoption chart defaults to monthly **By ETF** bars over **Since launch**, exposing the sourced history from January 11, 2024. Daily and weekly intervals, net-flow candles, and Latest 60 periods remain available. Each product's period net flow is stacked above or below zero separately; this is net fund demand, not trading volume. Legends and keyboard/hover inspection identify tickers and dollar totals. Incomplete reported periods are withheld rather than silently treating missing funds as zero.

CSV imports optionally include `fund_<ticker>_usd` columns. `not_active` excludes a fund before its first reported date; blank means an active fund has not reported. Numeric counts must reconcile with reported/expected coverage, and per-fund sums must match published totals within independent rounding to $0.1 million. Valid new fund coverage can appear inside a stacked period; aggregate candle coverage rules remain unchanged. Saved source revisions now include per-fund values. The October 5, 2026 Farside snapshot contains 685 supplied dates and up to 12 products. Data remains a sourced snapshot, not an automatic feed.

## Bitcoin narratives preview

Open `/#narratives` for bull and bear arguments ranked by **captured news coverage**, with 24-hour, 7-day and 30-day publication windows. This preview reads public RSS from CoinDesk, Cointelegraph and Decrypt; it requires no paid account or API key. Social discussion and AI-generated clustering are not connected.

Each narrative exposes its editorial thesis, Bitcoin implications, counterargument, related dashboard view and dated source links. Headline/excerpt rules associate articles with a topic. Explicit rebuttal wording is flagged when matched to the topic; other coverage is not treated as endorsement. AI cryptographic risk, quantum risk and operational wallet/custody failures are separate topics. Unmatched Bitcoin headlines remain visible so gaps in the topic map can be reviewed.

`GET /api/narratives?days=7&sort=attention` returns the view; `days` supports 1/7/30, `sort` supports `attention`/`rising`, and `refresh=1` requests a fresh collection. The collector starts on first access and runs hourly while the server remains running. It preserves observations for 65 days (up to 20,000 articles) in the ignored `data/cache-v2/narratives.json`, or under `MACRO_CACHE_DIR`. Duplicate URLs and identical normalized headlines count once; separate reporting of the same event can still count separately, and one article can match more than one topic.

RSS only exposes a limited recent selection. The longer windows do not imply a complete historical backfill. Momentum compares counts in equal consecutive windows only after all sources have continuous collection coverage across both, with no gap exceeding four hours. Until then, “Fastest rising” is disabled and the interface says “History building.” “New to this tracker” refers to first capture, not the true birth of a narrative.

Source failures retain previously captured stories and show delayed/unavailable states. Failed or malformed feeds never generate sample rankings. Evidence is explicitly not independently assessed; article counts measure attention within the tracked publishers, not truth, social popularity or a trading signal.

Implementation: `lib/narrative-topics.js` contains the editorial topic map; `lib/narratives.js` handles collection, persistence, ranking and source health; `public/narratives.js` and `public/narratives.css` contain the interface. `test/narratives.test.js` verifies safe RSS handling, topic boundaries, rebuttals, deduplication, publication windows, collection continuity, persistence and recovery.

Narrative scope now prioritizes news, fundamentals and real-world/network developments. Technical-analysis, price-recovery and liquidation theses are excluded. A price-led recap only contributes when its headline itself matches a substantive topic; incidental mentions in an excerpt do not count. The map includes protocol development, network concentration/disruption, mining operations, policy clarity/restrictions and holder safety. ETF flows and disclosed corporate/government actions remain in scope. Unmatched trading recaps are also excluded from the discovery list.
