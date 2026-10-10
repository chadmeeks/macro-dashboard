# Project handoff — October 10, 2026

## Start here next session

- Repository: `/Users/chadmeeks/Development/macro-dashboard`; origin is `git@github.com:chadmeeks/macro-dashboard.git`.
- Current branch is `main`. The reviewed narratives/research work was fast-forward merged and pushed in `813ecfc` (`Add Bitcoin narratives and research dashboard enhancements`). The old `feature/bitcoin-narratives` branch remains at that commit; no outstanding feature merge is needed. This handoff and the Overview timestamp are the follow-up commit; check `git log -3` for its hash.
- The user likes the Bitcoin Narratives page. Its scope must remain news, fundamentals, adoption, policy, security, mining, network development and real-world events. The user explicitly rejected chart/trading narratives such as recovery trends and liquidation-driven downside. ETF flows and institutional/corporate adoption remain relevant.
- The latest UI request is complete: Overview shows **Last refreshed** in its source-status row, with local date/time, seconds and timezone. It updates after the dashboard feed cycle and observation-archive request finish, including automatic checks. It means the last completed check, not the publication date or guaranteed successful refresh of every source. Individual stale/unavailable indicators remain authoritative. It is browser-session state, initially “Waiting for first refresh…”, shown only on Overview and wrapped onto its own line on mobile. Implementation: `state.lastRefreshed`, `load()` and `renderStatus()` in `public/app.js`; `.last-refreshed` in `public/styles.css`.
- **Research check-in:** “Mark reviewed” resets the browser snapshot baseline and hides the panel when there are no changes. New comparable readings or source-status changes bring it back. Unchanged reloads/navigation keep it hidden after loading. A browser-storage failure keeps the warning visible. An accessible confirmation is announced through `#checkin-feedback`; keyboard focus moves to main. Snapshot storage is `macro.visit.v1`. Refreshes preserve the in-memory comparison baseline while saving the latest snapshot for the next page visit.
- **Metric help:** `public/metric-help.js` supplies discreet info buttons with definitions and Bitcoin interpretation, supporting hover, click/tap, focus, Escape and outside dismissal. A shared viewport-positioned tooltip avoids card/table clipping. Labels are matched to a glossary; add a matching entry when introducing a new metric label.
- **Next possible feature:** Bitcoin X Narratives is a saved brainstorm, not implemented. The user rejected Bitcoin Voices/blogs, Bluesky and manual X imports. Their latest interest is reading their own X feed through a logged-in headless browser. See the saved idea and latest decision below. No X credentials, browser session, paid integration or AI summarizer has been configured.

## Run, review and preserve data

Node.js 22+, no npm dependencies needed for the app. `npm start` runs `node server.js` on `127.0.0.1:3001`; `PORT=3002 node server.js` starts a separate preview. The reviewed page is `http://localhost:3002/#narratives`. At handoff there are listeners on both 3001 and 3002; process IDs are ephemeral, so inspect before restarting. Port 3001 predates the feature work and may still have old server modules loaded. Static frontend edits load on page refresh; backend changes require restarting the intended process. Do not stop another process just because the port is busy.

The tracked legacy `data/macro-cache.json` has a pre-existing generated change that is intentionally left uncommitted and unpushed. It is not used by the current feeds; preserve it. Runtime `data/cache-v2/` is ignored, including imported ETF data, source histories and `narratives.json`. Do not overwrite or commit those archives. `MACRO_CACHE_DIR` can isolate a test/preview instance. No API keys or login sessions belong in Git.

## Current validation

On October 10, `npm test` passes all **46 tests**, covering calculations, ingestion, persistence, models, narratives and HTTP behavior. `node --check public/app.js` and `git diff --check` passed. Timestamp rendering was checked for initial waiting state, semantic datetime output and exclusion from other views.

Earlier browser verification passed for narratives (live rankings, source links, filters, refresh, details, errors, routing and 390/768/1440px layouts), metric help (hover/click/keyboard/mobile), and check-in dismissal/reappearance/reload/storage failure. Temporary scripts are `/tmp/check-macro-narratives.cjs`, `/tmp/check-macro-info.cjs` and `/tmp/check-macro-checkin.cjs`; they may not survive sessions and use Playwright installed in the sibling music-time-machine project plus local Chrome. The durable automated tests are under `test/`. Tests that bind localhost and headless Chrome may require sandbox escalation.

## Historical implementation notes

The sections below record the earlier work. Current behavior and user decisions above supersede outdated next-step suggestions.

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

## Saved idea — Bitcoin X Narratives (October 10, 2026)

Status: brainstorm saved for later; implementation and paid services are not authorized by this note.

Create a companion to Bitcoin Narratives based on a curated panel of roughly 30–40 public X accounts. Include developers/security researchers, mining/network specialists, institutional adoption observers, policy/macro voices and informed skeptics. Selection should prioritize relevant expertise and perspective over follower count. Let the user add, remove, mute and filter accounts.

Keep the user's preferred focus: news, adoption, fundamentals, security, policy, protocol/network development and real-world events. Exclude trading calls, price targets, technical chart analysis and promotions. Collect new posts periodically, combine author threads, preserve quote/reply context, and distinguish original commentary from plain repost amplification.

Use source-grounded AI clustering if an appropriate service is later configured. Identify emerging themes, author stance (support/dispute/question/report), Bitcoin implications and cited evidence. Keep uncertain material unclassified. Rank primarily by distinct tracked accounts discussing a topic, with separate most-discussed, fastest-spreading and most-debated views. Engagement is supplementary. Show bull/bear narratives plus emerging or unresolved discussions, source posts, disagreements, account coverage and collection gaps. Connect related narratives across news and X. Do not treat rebuttals as endorsements, popularity as truth, or panel results as all of X.

Cost concern: user asked for free alternatives. The official X API currently charges for reads; any future integration should use an explicit budget and measured pilot. Illustrative October 2026 rate was $0.005/post, excluding additional lookups and summarization; verify current pricing before implementation: https://docs.x.com/x-api/getting-started/pricing . No API purchase or account connection has been made.

Alternatives considered and subsequently rejected by the user: (1) a Bitcoin Voices page combining publicly available expert blogs/newsletters and developer discussions, including Bitcoin Optech and Delving Bitcoin; (2) a curated Bluesky panel using public APIs where relevant voices are active; (3) manually pasted X post text plus author/date/link, ranked only within the imported collection. These do not reproduce comprehensive X coverage. Avoid claiming web-search snippets or unstable scraping offer complete account timelines. For zero added API spend, use transparent topic rules/manual labeling initially, or evaluate a local model if the user's hardware supports it. Local inference has hardware/energy costs and needs quality evaluation. Paid AI summaries are a separate cost from source access.


### Latest X decision — browser collection remains a brainstorm

After rejecting all three free alternatives, the user asked whether a headless browser could scrape their own X feed. Explained the technical design: a dedicated local browser profile, user-completed login in a visible window, subsequent read-only collection of a bounded number of visible posts, text/author/time/link extraction, deduplication and narrative grouping. Login challenges or access blocks should pause collection for user attention. No browser login or collector was started, and no implementation has been requested after that discussion.

The unresolved product choice is **For You** (personalized narratives appearing in this user's feed) versus **Following/a curated Bitcoin List** (more consistent monitored-account coverage). Neither should be presented as all-X popularity. Explained that avoiding the X API bill does not eliminate optional AI summarization costs. The official X terms checked during this discussion prohibit scraping without prior written consent, so account restriction/reliability concerns were disclosed: https://x.com/en/tos . This is an external platform constraint to reassess, not evidence that the user provided credentials or approved spending. If the user resumes this idea, continue from browser collection rather than recommending the alternatives they rejected.
