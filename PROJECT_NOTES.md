# Project handoff — September 25, 2026

## Product intent

A place to quickly understand Bitcoin adoption, sentiment, fundamentals, useful technicals and the surrounding macro economy. Favor visible evidence and observation dates over a single bullish/bearish score.

## V2 changes

Rebuilt the interface with five views, independent loading and responsive SVG charts. Corrected liquidity alignment and units (now WALCL minus RRPONTSYD minus WDTGAL, billions), replaced observation-count comparisons with calendar comparisons, used true completed weekly observations, and removed future extension of observed indicators. Added network fundamentals, corporate holdings, credit/inflation/labor series, and a transparent daily reading. Removed estimated calendar dates and destructive startup behavior. V1 is recoverable from Git history; the existing modified macro-cache file was preserved.

## Next feedback to collect

1. Is the overview sufficient for a one-minute daily check?
2. Which metric explanations are useful, and which create clutter?
3. Does corporate ownership meet the adoption need, or should payment adoption and ETF flows lead?
4. What timeframe should be the default: daily monitoring or weekly/monthly allocation context?

## Follow-up work

- Select a reliable, accessible ETF-flow source and preserve each day's reporting completeness.
- Add realized price/MVRV once an authenticated or otherwise verified data source is selected.
- Capture and reconcile corporate filing dates before labeling changes as purchases.
- Add derivatives positioning only with clear venue coverage and consistent funding units.
- Optionally ingest official CPI/jobs calendars when provider access is reliable.

Avoid inferring activity from dollar AUM, unique users from addresses, or global liquidity from US M2. The app exposes source gaps rather than filling them with estimated numbers.


## Research update — September 28, 2026

Implemented all five research priorities: browser-local last-visit comparisons, historical percentiles, a sourced ETF CSV tracker with incomplete-session handling, Coin Metrics MVRV plus derived realized price, and corporate snapshot history. Precise chart inspection, date comparisons, historical FOMC markers, persistent observations and source revision/failure records are also included.

The user has no ETF-data provider access. No paid service or API key was created. The manual importer works without a subscription; live ETF ingestion remains the one external-source limitation. Coin Metrics `CapMVRVCur` is available publicly and removed the prior valuation-data blocker. Snapshot differences do not imply purchases.

The prior next steps concerning realized price/MVRV and snapshot capture are now implemented. The next data task is selecting an automated ETF provider and obtaining authorized credentials, then reconciling corporate snapshots with dated filings.

## Models workspace

Added `/#models`, `public/models.js` (shared deterministic calculation module), `public/model-view.js`, and `/api/supply`. Models are deliberately separate from the daily market assessment. Default Power Law cutoff is 2023-12-31; frozen fits, source dates, original S2F coefficients, reconstruction differences, matched-price deviations, monthly error coverage, and conditional projections are visible in the interface. Model tests cover no lookahead, known coefficient recovery, supply gaps, monthly scoring, realized-price alignment, and expiration of weekly references. No provider subscription is required.

## Narratives preview — October 9, 2026

Branch: `feature/bitcoin-narratives`. Added a separate `/#narratives` workspace with bull/bear columns, real article-count rankings, source drilldowns, editorial arguments and counterarguments, date windows, partial-coverage disclosure, feed health and a persistent local news archive. Live public feeds from CoinDesk, Cointelegraph and Decrypt were retrieved successfully. No subscriptions or API credentials were added. Existing working changes were retained.

This is a news-only prototype with deterministic topic matching, not an LLM or social-listening integration. It does not automatically discover new topics or assign truth/confidence scores. Matching gaps are exposed through unclassified Bitcoin headlines. Security-related cross-crypto coverage is labeled as such in the methodology; software-scanning news is not classified as a cryptographic break. Momentum is withheld until two full windows of consistent collection exist. The default 7D view therefore needs 14 days of collection before ranking rising coverage.

Validation: 45 Node tests passed; browser checks covered live rankings, source links, filters, refresh, detail persistence, show-more, internal navigation, keyboard help, 390/768/1440px layouts and unavailable/request-failure states. A separate review server uses port 3002 because the existing dashboard is running on port 3001. Start normally with `PORT=3002 node server.js` if that review process is no longer running.

Useful next review decisions: whether the topic matching feels accurate enough; preferred publisher mix; whether to add authenticated social coverage; and whether to add source-grounded AI topic discovery and summaries. Preserve the separation between measured attention, author stance and independently assessed evidence in subsequent versions.

### Narrative review: fundamentals over trading

The user prefers news, network developments and real-world fundamentals over trading/technical narratives. Removed recovery and leverage/downside topics. Added protocol development, network resilience, mining economics, policy and holder safety. Price-led roundups must match a real-world topic in their headline to contribute; unmatched technical recaps are excluded from the discovery list. Existing archives are reclassified at read time, preserving collected history.
