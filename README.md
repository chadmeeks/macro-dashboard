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

- **Overview:** daily market perspective, transparent rules-based short read, macro pulse, ownership concentration and upcoming published FOMC decisions.
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

- ETF flows are linked to Farside, not ingested: its site challenged automated requests during verification.
- Realized price and MVRV are not displayed: Coin Metrics' realized-cap metric was not available through the tested community access.
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

- `server.js`: local HTTP/static server and six independent feed endpoints.
- `lib/data.js`: provider adapters, source metadata and derived macro readings.
- `lib/analytics.js`: pure calculations and parsers.
- `lib/cache.js`: per-source memory/disk caching and in-flight deduplication.
- `public/`: responsive interface and interactive SVG charts.
- `test/`: dependency-free automated regression checks.

Runtime data under `data/cache-v2/` is ignored by Git. No trades, alerts, account connections or paid services are configured.
