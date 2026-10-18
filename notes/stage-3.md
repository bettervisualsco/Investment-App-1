# Stage 3: Prediction mode

Built 18 Oct 2026 on branch `claude/stage-3-predict-9b6919`. Not merged yet.

## What's done
- **Manual | Prediction switch** at the top of the Planner. The plan remembers which mode it's in.
- **"What it's invested in"** in every phase (both modes):
  - **One ETF** from the watchlist. Picking it fills in its fee (MER), distribution yield, franking and how often it pays, from `data/etfs.json`, with the "checked on" date. You can still change them. US-listed ETFs (VOO, VTI, QQQ) also switch on "Listed in the US", so the currency fee applies.
  - **A mix of ETFs**, e.g. 70% VGS / 30% VAS. It's put back to those shares once a year. Fee, yield and franking are worked out from the mix.
  - **Cash / savings account.** Manual mode uses the savings rate you type. Prediction mode uses the RBA cash rate from history. No MER or brokerage, and all of it is interest, taxed as income.
  - **Custom asset**: average yearly return, volatility, and optional sudden crashes ("about once every 10 years, falling 30% in a month").
  - **Old plans keep working exactly as before.** A phase with nothing chosen uses its return rate in Manual mode, as it always has. Prediction mode asks you to choose, and has a one-tap "use VAS for those phases" button.
- **Prediction mode:**
  - Phases, deposits, durations and events stay exactly as you typed them. Only returns, inflation and AUD/USD vary.
  - Real history from `data/monthly.json`, using the shared block bootstrap (`src/engine/bootstrap.ts`). Every sampled month gives asset returns, inflation, AUD/USD and the cash rate **from the same real month**.
  - Settings for each plan:
    - which history: full, since 1950, since 1990, last 20 years, or your own years. It's cut to where all the data the plan needs exists, and it says so, e.g. "starts in Jan 1975 because that's as far back as the data for VAS goes".
    - chunk length (default 12 months)
    - number of simulations (default 2,000; 500–10,000)
    - percentiles (10/50/90, 5/50/95, 25/50/75, 1/50/99 or your own)
    - seed, with a Re-roll button
  - US-listed ETFs are turned into A$ with the same month's AUD/USD move. A US$ plan works the other way round, using US inflation and US cash.
  - **Fees, Tax and Inflation switches work exactly as in Manual mode.** Each simulation runs through the same stage-4 `simulate()`. "Show the cost" works too, using the middle result.
- **Results:**
  - Fan chart: Worst, Likely and Best lines with two shades of band, the phase ribbon and the goal dot.
  - A switch to show 5 single simulations.
  - The final amount at each percentile.
  - The goal, e.g. "In 1,802 of 2,000 simulations (90%) you reached $150,000 by 1 Oct 2042", always called an estimate.
  - The chance of ending below what you put in.
  - The biggest drop along the way for the middle simulation.
  - Totals, fee/tax breakdown, the year-by-year table and CSV for the middle ("likely") simulation.
  - Warnings grouped by kind, e.g. "In 14 of 2,000 simulations: 'First car' wanted $15,000 but only $12,618 was there".
- **Runs in a Web Worker** (`src/predict/worker.ts`), so the screen never freezes. There's a progress bar. It recalculates by itself 0.25 s after the plan changes, and when new market data arrives.
- **Settings → Predictions:** default percentiles, number of simulations and random seed (with "New seed" and "Back to the usual settings").
- ⓘ explanations for every new term.

## How Soham can try it (Mac)
1. Start the app (double-click `Start app.command`), or ask Claude to start the preview.
2. In the Planner, tap **Prediction** at the top.
3. The example plan doesn't say what it's invested in yet. Tap **Use for those 3 phases** (VAS is picked). In a moment you'll see the fan chart and three numbers: **Worst, Likely, Best**.
4. Scroll down. Read the goal sentence ("In … of 2,000 simulations …"), the chance of ending below what you put in, and the biggest drop.
5. Tap **Show single simulations** to see 5 of the replays. Tap **Re-roll** to see how much the numbers move just by chance.
6. Turn on **Fees**, **Tax** and **Inflation**, then **Show the cost**. Everything works as in Manual mode, with a dashed "all switches off" line.
7. Open a phase (tap its name). Under **What it's invested in**, try:
   - **A mix of ETFs**: watch the fee and franking change.
   - **Cash / savings account**.
   - **Custom asset**: try 7% average, 15% volatility, then turn on crashes.
8. In **Prediction settings** (right side on the Mac, below the results on the iPhone), change **History to replay** to **Since 1950**. The note explains it can only start in 1975 for VAS.
9. In **Settings**, look at the new **Predictions** section.
10. Tap **Manual** again: the plan works exactly as before.

## Tests (all pass: `npm test` 195, `npm run build`, `npm run lint`)
New tests are in `src/engine/prediction.test.ts` and `src/predict/predict.test.ts`:
- **Constant history = Manual answer:** a history where every month is the same gives exactly Manual mode's answer, to the cent. This is checked with every switch on, with every switch off, and for "Show the cost". It also covers an ETF phase, a cash phase, a ramped deposit, a withdrawal and a goal.
- **Repeatable:** the same seed gives the same answer, and a different seed gives a different one.
- **Percentiles in order** at every chart point.
- **Counting:** the goal count and the "below what you put in" count are correct.
- **Same month:** every series is read from the same real month.
- **Cash:** a cash phase's return is all interest.
- **Biggest drop:** checked against the shared `maxDrawdown`.
- **Custom assets:**
  - the average and volatility come out close to what you typed (7%/15% gives about 7.0%/15.0%, with or without crashes)
  - fat tails are there (monthly excess kurtosis above 2, with many more 4-standard-deviation months than a bell curve)
  - a warning appears when crashes alone are bumpier than the volatility
  - 0% volatility gives exactly the typed rate
- **Mixes:** drift and the yearly rebalance are hand-checked.
- **AUD conversion** (both directions) and the **fee added back** (so the MER isn't counted twice).
- **History windows** on the real data: VAS full = Jan 1975; "since 1950" is cut to 1975 and says so; since 1990; the last 20 years = 240 months; VOO in A$ from Aug 1969 (AUD/USD) and in US$ from 1871; custom windows refused or cut.
- **Real data, end to end:** $10,000 in VAS for 30 years with Fees on. The middle result grows 12.1% a year, against history's own 11.9% after VAS's fee.
- **Speed:** 2,000 runs of a 40-year weekly-deposit plan with every switch on takes **about 2.3 s** on this Mac (in the background worker).
- **Old plans:** a plan with no investment chosen gives exactly the same Manual answer.

Also checked in the browser preview (port 5178):
- light and dark mode, and phone width (no sideways scrolling)
- the quick fix, the mix, cash and custom editors
- Fees + Tax + Inflation + Show the cost in Prediction mode
- the Settings section

## Decisions (and why)
- **The MER is never counted twice.** ETF months in `monthly.json` are after the fund's fee. The app adds the fee back (`(1 + r) / (1 − fee/12) − 1`, using the fee in `monthly.json`), then the Fees switch takes off the MER in your phase. This is the same as Manual mode, where the typed rate is before fees. **With Fees off, Prediction returns are before the fund's fee.** This is said in the fine print and an ⓘ.
- **What "average return" means for a custom asset:** the long-run compound growth (the middle outcome grows at about this rate), like the Manual rate.
- **Volatility** is the spread (standard deviation) of yearly returns, crashes included.
- **How custom months are made:** each month's log return is a Student-t with 5 degrees of freedom (fat tails), plus optional one-month crashes. Freak draws are capped at 12 standard deviations.
- **Goal chance** counts your balance **on the goal date** (the same test as Manual mode's goal), in today's dollars when Inflation is on.
- **"Ending below what you put in"** compares the final amount with starting balance + deposits − withdrawals. With Inflation on, both are in today's dollars.
- **Biggest drop** is measured on what each invested dollar is worth (before fees) in the middle simulation, at month ends. That way deposits and withdrawals (like the car) don't hide or fake a drop. The "middle simulation" is the actual simulation with the median final amount, not the median line.
- **The year table, CSV and totals in Prediction mode** are for that middle simulation, and are labelled that way.
- **Each simulation has its own random stream** (seed + simulation number), so changing a deposit replays the same histories. You see only the effect of your change. Making the plan longer only adds months to the end of each history.
- **Seed:** the plan stores its own seed only after Re-roll. Otherwise it uses the Settings seed (default 1).
- **Waiting cash** (Fees on, buying less often) still earns the cash rate you typed in Fees, not the historical cash rate, so your setting is respected.
- **Mixes and switching investments:** yearly rebalancing and moving the balance into a new phase's investment don't charge brokerage or capital gains tax. This is the same simplification stage 4 made: holdings carry on from phase to phase.
- **A mix pays the currency fee** if at least half of it is US-listed. You can change this.
- **History needs at least 24 months** after the window is applied.
- **Engine changes, all backward compatible:**
  - `simulate()` skips trading costs for cash phases
  - it takes an optional `path.income` (interest for cash months)
  - results now include `cpis` (price level at each chart point)
  - `withPhaseInfo` is exported
  - `chartTicks.ts` was split out of `GrowthChart.tsx`
  - `CostPanel`, `Breakdown` and `EndSaleNote` are exported from `Results.tsx`, and `YearTable` takes an optional `note`
- **Colours:** the fan uses the existing `--series-mine` blue, one hue at two strengths, with a solid middle line and dashed edges, so it doesn't rely on colour. Single simulations use the existing `--series-growth` gold. Both tokens were already checked for colour-blind safety in light and dark mode. No new colours.

## Problems / things to know
- **Full history includes the high inflation of the 1970s and 80s.** For the example plan with Inflation on, the likely result in today's dollars is about half the nominal one. That's history's average inflation (4.6% a year since 1975), not the RBA's 2–3% target. "Since 1990" averages 2.7%. Worth explaining to Soham.
- **Franking refunds can make "Tax" a gain.** With $0 other income and VAS (80% franked), tax is a refund, so "Show the cost" shows "Tax add +$…". That's correct under the rules, but it can surprise people.
- **Before 1975 (Australian shares) and 1969 (AUD/USD) there is no free monthly data** (stage 2), so "since 1950" for Australian ETFs is cut to 1975. Global shares before 1990 are rough (DATA_SOURCES.md).
- **Simulations on the iPhone are slower than on the Mac** (maybe 2–4×). 2,000 runs of a long plan may take several seconds there, with a progress bar. If it feels slow, 1,000 simulations in Settings is still fine.
- **Speed test limit:** the test allows up to 30 s, so a busy Mac doesn't fail it (it once took 20 s while other sessions were running). It's normally 2.3 s.

## Notes for merging (for the coordinating session)
- **Files touched:**
  - `src/engine`: new `assets.ts`, `prediction.ts`, `prediction.test.ts`; small additions to `types.ts`, `defaults.ts`, `path.ts`, `simulate.ts`, `validate.ts`, `manual.ts`, `index.ts`
  - `src/planner`: new `InvestmentPicker.tsx`, `FanChart.tsx`, `PredictionResults.tsx`, `PredictionSettingsBlock.tsx`, `chartTicks.ts`, `prediction.css`; edits to `PlannerPage.tsx`, `PhaseList.tsx`, `PhaseRealism.tsx`, `Results.tsx`, `GrowthChart.tsx`, `words.ts`
  - new `src/predict/` folder
  - `src/pages/OtherPages.tsx`: one import + one line (`<PredictionSettings />`)
  - `src/components/glossary.ts`: one text change, the `manualMode` entry no longer says "coming soon"
  - Nothing in `App.tsx`, `src/data`, `src/state`, `src/saved`, `src/markets`, `src/inflation`, or the pipeline.
- **ⓘ texts** for Prediction mode are in `src/predict/words.ts` with their own `HelpTip` (same look as `InfoTip`), so they don't clash with other stages' glossary edits. They can be merged into `glossary.ts` during polish.
- **Plan data:** new optional `Plan.prediction` (mode and settings) and `Phase.investment`. They're plain data, so the Saved tab's backups carry them. `investmentProblem()` in `validate.ts` copes with damaged values from a backup file. `planShapeProblem` in `src/saved/backup.ts` could call it too.
- **Settings storage:** prediction defaults are in localStorage under `investment-planner.prediction-defaults` (`src/predict/settingsStore.ts`), not in `db.ts`.
- **Saved tab Compare: should it show prediction results?** For now it always uses Manual mode (`runManual` in `src/saved/compare.ts`), even for a plan saved in Prediction mode. My suggestion:
  - keep Compare on Manual numbers for the lines (fast, like for like)
  - add a "Prediction mode" note for plans saved in that mode, and later maybe the likely / worst / best finals
  - the engine is ready: `buildHistory()` (src/predict/history.ts) + `preparePrediction()` + `runPrediction()`, but it should run in the worker (2,000 runs × 3 plans ≈ 7 s on a Mac)
  - this is Soham's call
- **For stage 5 (Markets: prediction lines from today's price):**
  - `buildHistory()` gives a fee-adjusted, A$-converted monthly history for any ETF
  - or use `alignedMonths` + `blockBootstrap` directly
  - the "Use in Planner" button can set a phase's `investment` to `{ kind: 'etf', etf: 'VAS' }` and the history window (`plan.prediction.window = 'custom'`, `windowFrom`, `windowTo`)
- **For stage 6 (Inflation tab):** the same sampled-month idea; the `au_cpi` column is what Prediction mode uses for inflation.
- **The `historicalInflation` hook** from stage 4 is still not wired up (`App.tsx`). It's unrelated to this stage.

## Suggested SPEC.md updates (for the coordinating session)
- 4.1 Prediction mode: "Goal probability counts the balance on the goal date." "Max drawdown is measured on the value of each invested dollar in the middle simulation." "With Fees off, returns are before the ETF's fee (the fee in history is added back so it isn't counted twice)."
- 4.1 Custom asset: "average = long-run compound growth; volatility = standard deviation of yearly returns; Student-t (5 degrees of freedom) months plus optional crashes."
