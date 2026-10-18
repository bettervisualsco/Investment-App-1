# Stage 6: Inflation tab

Built 18 Oct 2026 on branch `claude/stage-6-inflation-075b20`. Not merged yet.

## What's done
- **Latest figures** at the top: Australia 4.0% (year to Aug 2026, monthly CPI; quarterly CPI 3.9% to Jun qtr 2026) and the US 3.7% (year to Sep 2026), with whether Australia is inside the RBA's 2–3% target.
- **Inflation history chart** (yearly inflation: the rise over the 12 months to each date, the way the ABS and BLS quote it):
  - Australia, US, or both on one chart. Ranges 1Y, 5Y, 10Y, 20Y, 50Y, Max (Australia from 1949, the US from 1872).
  - Australia has two CPIs and you choose: **Quarterly** (default, since 1948) or **Monthly** (the ABS "complete Monthly CPI", which starts April 2024, so its yearly figures start April 2025). The chart says which one is shown, with an ⓘ explaining why.
  - The RBA's 2–3% target band is shaded whenever Australia is shown.
  - **Highlight any period**: drag across the chart (mouse, or a sideways finger drag on the iPhone; up/down still scrolls the page). Or pick From/To years. It shows how much prices rose and the **compound** average a year, from the CPI at the two ends (e.g. "prices rose 145% from Dec qtr 1992 to Jun qtr 2026 (33½ years): 2.71% a year"). With both countries shown you get one answer for each.
  - "Year by year (to December)" table under the chart (also the accessible version of the chart).
- **Inflation ahead: an estimate** (fan chart): worst (90th percentile, high inflation), likely (median), best (10th percentile) for Australia or the US, 1–30 years ahead.
  - Uses the shared bootstrap (`src/engine/bootstrap.ts`): 2,000 futures built from random 12-month chunks of real monthly inflation, fixed seed (the same data and choices always give the same answer).
  - Two views: **Each year** (inflation in each future year) and **Average from now** (the average a year from today, which narrows over longer periods).
  - Three tiles (likely / worst / best average a year over the chosen years) and a plain sentence, always worded "might… based on history… not a forecast".
  - RBA 2–3% band for Australia; the Fed's 2% goal as a dotted line for the US.
  - **Which years to learn from**: since 1993 (default), last 20 years, since 1990, since 1950, full history, or your own years. Remembered on the device.
- **Buying power calculator**: amount + year A + year B (with Swap), for Australia or the US. Past years and "now" are exact from the CPI; future years (up to 50 years ahead) give a likely value and a range from the same simulated futures as the fan chart.
- **ETF returns after inflation**: every ETF's yearly return, inflation and return after inflation for 1Y, 3Y, 5Y, 10Y, 20Y, "Since start" (the ETF's own history) or "Longest" (with index history before the ETF). US ETFs can be shown in A$ after Australian inflation (default) or in US$ after US inflation. Rows that include index history from before the ETF existed are marked *.
- **Planner "Use historical average" button now works**: it gives "2.72%" with the label "Australia, 1993–2026 average (ABS CPI). You can change the years on the Inflation tab."
- **Updates by itself**: everything reads `inflation.json` and `monthly.json` through the `src/data` hooks, so when new CPI figures arrive the charts, predictions, calculator, table and the Planner button all recalculate.
- Phone and Mac layouts, light and dark mode (checked in the preview at 375 px and 1280 px wide).

## How Soham can try it
1. Start the app as usual (double-click `Start app.command`), or ask Claude to start the preview.
2. Tap **Inflation** in the tab bar (sidebar on the Mac).
3. In **Inflation history**, tap **Both** to see Australia and the US together, and try the ranges (**20Y**, **Max**).
4. **Drag sideways across the chart** (finger or mouse). The box below shows how much prices rose over that period and the average a year. Try the 1970s, then 2010–2019.
5. Tap **Monthly** to see Australia's new monthly CPI (only since 2025).
6. In **Inflation ahead**, try **30Y**, then **Average from now**. Change **History** to **Full history** and watch the estimate jump from about 2.7% to about 4.8% a year (the 1970s are back in).
7. In **Buying power**, try $100 in 1990 → Now (about $259), then pick a future year like **2036 (estimate)**.
8. In **ETF returns after inflation**, try **Since start** and switch **US ETFs in A$ / in US$**.
9. Go to **Planner**, turn on **Inflation**, scroll to **Fees, tax and inflation → Inflation** and tap **Use historical average (2.72%)**.

## Tests (40 new, all in `src/inflation/*.test.ts`)
- Compound average against hand-worked examples (100 → 121 in 2 years = 10%; +10% then −10% = −0.50% a year, not 0%; 100 → 150 in 10 years = 4.138%, not 5%), and highlighting in either drag direction.
- **Against published figures** (checked on abs.gov.au and in the BLS data):
  - Australia 7.8% in the year to Dec qtr 2022, the 2022 peak, and the "highest since 1990" claim (Mar qtr 1990 was higher; nothing in between was).
  - Australia 6.1% (Jun qtr 2022) and 7.3% (Sep qtr 2022).
  - Australia's complete Monthly CPI: 3.6% to Sep 2025 and 3.8% to Oct 2025 (its first release, 26 Nov 2025).
  - US 9.1% to June 2022 and 6.5% to Dec 2022.
- **Quarterly vs monthly**:
  - The quarterly index is the average of its three months.
  - Quarters are spread evenly over their months until the monthly CPI starts (May 2024 is the first monthly change).
  - Our monthly series matches the pipeline's `au_cpi`/`us_cpi` in `monthly.json` month by month (over 900 Australian and 1,800 US months).
  - The missing US month (Oct 2025) is filled evenly and flagged.
- **Buying power both ways**:
  - Hand-worked, plus a real-data round trip.
  - Year averages.
  - "Now".
  - Future years: likely value plus a range, and going back in time swaps worst/best.
- **Real return maths**:
  - 10% return with 3% inflation = 6.80%.
  - Monthly compounding.
  - A$ conversion (when the A$ rises as much as the share, the return is 0).
  - VAS 5 years checked by hand against the data.
  - DHHF 20 years flagged as using index history.
- **Prediction**:
  - A flat history gives exactly that rate.
  - It starts from the latest real figure.
  - It's **repeatable**: same input, identical output; a different seed gives a different output.
  - Worst ≥ likely ≥ best.
  - The 10-year likely average is near the target.
  - The range narrows for averages.
- `npm test` (200 tests), `npm run build` and `npm run lint` all pass.

## Decisions (and why)
- **Default history window: since 1993.**
  - That's when the RBA began targeting 2–3% inflation. Since then Australia's inflation has averaged 2.72% a year.
  - The US has had similar low inflation since then too (the Fed's formal 2% target dates from 2012).
  - Full history includes the 1950s Korean-War wool boom (25% in 1951) and the 1970s (10–17% a year), under a different system. It pushes the estimate to about 4.8% a year, which seems too pessimistic as a default.
  - People can pick Full history, since 1950/1990, the last 20 years, or their own years. It's one shared setting for the Inflation tab and the Planner button, remembered on the device (`localStorage`, key `inflation-window-v1`, with try/catch).
- **The Planner button** uses Australia, the same window, compounded from the monthly series (Jan 1993 → latest month, Aug 2026). The label names the years and the source. Using the quarterly index instead (Dec qtr 1992 → Jun qtr 2026) gives 2.71%; there's a test that the two agree within 0.05.
- **One monthly series per country** (`monthlyChain` in `cpi.ts`) for predictions, real returns and the Planner average. It's built from `inflation.json`'s index levels, the same way the pipeline builds `monthly.json`: each quarter's rise is spread evenly over its 3 months until April 2024, then the monthly CPI. The history chart and the highlight use the published index levels directly, so they match ABS/BLS figures.
- **Fan chart points are one per year.** Australia's new monthly CPI jumps around month to month (seasonal, not seasonally adjusted). Monthly points in the first year mixed those real lumpy months with smooth simulated ones and zig-zagged for no real reason. The engine still works month by month.
- **The prediction starts from today's real yearly figure:** the first simulated year's 12-month figure includes the real recent months. Otherwise it's a plain replay of history and doesn't know today's interest rates or events. The page says so.
- **Worst = high inflation, best = low** (from the point of view of what your money buys).
- **Buying power:**
  - A past year means that year's average CPI (four quarters for Australia, twelve months for the US). "Now" is the latest figure.
  - A future year is counted from the latest figure, so 2036 means Aug 2036. The calculator says so.
  - Past years start at 1949 for Australia (1948 has only two quarters) and 1871 for the US.
- **Real returns** use `monthly.json`'s ETF series (total return, fee taken off, proxy before the ETF existed). All rows end at the same month (Aug 2026 now). "After inflation" = (1 + return) ÷ (1 + inflation) − 1, compounded.
- **Colours:** Australia orange-red (#c4512b light / #d9714c dark), US blue (the existing `--series-mine` values). They passed the colour-blind palette validator (protan/deutan/tritan separation, lightness band, 3:1 contrast) on both surfaces. The target band is a neutral tint, not a status colour. The tokens are in `src/inflation/inflation.css`.
- **Own ⓘ texts and ⓘ button** (`src/inflation/words.ts`, `Tip.tsx`), like the Saved tab, to avoid clashing edits to `src/components/glossary.ts`. They can be folded in during polish.

## Problems / limits
- The ABS's headline figures were worked out from its old index, rounded to 1 decimal place. Today's index is rebased (Sep 2025 = 100) with 2 decimals, so a few historical figures differ by up to about 0.1 point: Dec qtr 2022 shows 7.9% here vs the published 7.8%. The tests allow for this.
- Very old Australian figures are coarse: the 1948 index is 2.59 on today's base, so early yearly figures are only accurate to a few tenths of a percent.
- The prediction runs on the screen's thread. It takes about 0.1 s per country and window, done once and cached. It could move into stage 3's Web Worker later.
- The app bundle grew from 871 KB to 917 KB before compression (+46 KB for this tab). Vite's "chunk over 500 KB" warning was already there before this stage (Recharts is most of it). Code-splitting could be a polish item.

## Notes for merging (for the coordinating session)
- **Files:** everything is in the new `src/inflation/` folder, plus `src/App.tsx`:
  - imports `InflationPage` and `useHistoricalInflation`
  - adds `const historicalInflation = useHistoricalInflation()`
  - passes `historicalInflation={historicalInflation}` to `PlannerPage`
  - replaces the Inflation `ComingSoon` line with `<InflationPage />`

  Nothing in `src/engine`, `src/planner`, `src/data`, `src/markets`, `src/saved`, `db.ts` or the pipeline was changed.
- `App.tsx` conflicts are likely with stage 5 (Markets line) and stage 3. Keep all three changes; mine are the 4 lines above.
- The Planner's disabled-button text (in `src/planner/RealismPanel.tsx`) still says "Needs the price history from the data update (stage 2)…". It now only shows for a moment while the CPI file loads (or if it never downloaded). It could be reworded in polish, e.g. "Waiting for the inflation data…".
- **For stage 3 (Prediction mode):**
  - If it wants the same "since 1993" default for inflation, `windowMonths` / `useWindowChoice` in `src/inflation/window.ts` can be reused.
  - `monthlyChain(file, 'au')` gives the same monthly inflation as `monthly.json`'s `au_cpi` (tested).
  - The inflation seed is `hashSeed(20261018, 'inflation', country|window)`. If Settings later gets a user seed, change `BASE_SEED` in `src/inflation/predict.ts`.
- **For stage 5 (Markets):** its drag-to-highlight "rate puller" is separate. Mine is in `HistorySection.tsx` (pointer events on the chart box, `touch-action: pan-y`) if a shared version is wanted during polish.
- **Suggested SPEC.md updates:**
  - 4.4: default history window for inflation predictions is since 1993 (inflation targeting), adjustable.
  - The Planner's historical average follows that window.
  - Australia has both quarterly (since 1948) and monthly (since April 2024) CPI; the history chart shows quarterly by default, with a switch.
