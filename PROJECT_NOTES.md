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
