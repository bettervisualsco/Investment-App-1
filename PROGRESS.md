# Progress

Stages are built in batches (see SPEC.md section 8). Full notes for each stage are in `notes/`.

## Done

### Batch 1: Stage 1, Planner in Manual mode (18 Oct 2026)
- Project set up: Vite + React + TypeScript, git. Node.js 24 LTS installed in `~/.local/node` (no admin password needed).
- **Calculation engine** in `src/engine` (plain TypeScript, no screen code): phases of any length, deposits daily to yearly, step-ups (ramp or steps, whole phase or part), one-off events, goal, Australian financial-year table.
- **Planner screen**: big result number, "your money" vs "growth" chart, life-timeline ribbon, drag to reorder phases, events, goal, year-by-year table, CSV download, ⓘ explanations, light/dark mode, first-open disclaimer. The current plan saves itself on the device.

### Batch 2: Stages 2, 4 and 7 (built in parallel, merged 18 Oct 2026)
- **Stage 2, data pipeline + hosting prep** (`notes/stage-2.md`): Python pipeline (`pipeline/`) with real data in `data/` (as of 16 Oct 2026): daily history for 11 ETFs, 4 indexes and AUD/USD; long-run monthly history lined up by real month for Prediction mode (US shares since 1871, Australian since 1975); Australian and US CPI; RBA cash rate; ETF facts with checked-on dates. Safety checks so bad downloads never replace good data. GitHub workflows written for scheduled updates and website deploys (**not tested yet: needs Soham's GitHub account**). App side: data loader with offline copy (`src/data`), and the app installs as a PWA and opens offline.
- **Stage 4, Fees, Tax and Inflation switches** (`notes/stage-4.md`): brokerage presets, buying less often than depositing, MER, currency fee, platform fee, spread; Australian tax per financial year (brackets, Medicare, low income offset, franking refunds, foreign tax offset, CGT per purchase lot, under-18 rules); **the new CGT law from 1 July 2027** (indexation + minimum 30% tax, checked against the Act, its Supplementary Explanatory Memorandum and the ATO site); the Working Australians tax offset from 2027–28; inflation and today's dollars; "Show the cost". Every rate has a source and a checked-on date (18 Oct 2026).
- **Stage 7 (part 1), Saved tab** (`notes/stage-7.md`): save, rename, duplicate, delete, open plans; compare up to 3; backup file export/import between iPhone and Mac.
- **Joined up after merging:** Compare shows which switches each plan uses, its fees, tax and today's-dollars value, and warns when plans aren't like for like. Settings shows the date the tax rates were checked.
- **Tests:** 148 app tests (`npm test`) and 55 pipeline tests (`npm run test:pipeline`, needs the Python setup in `pipeline/.venv`).

### Batch 3: Stages 3, 5 and 6 (built in parallel, merged 18 Oct 2026)
- **Shared foundation (built first, on main):** `src/engine/bootstrap.ts`, the one "replay chunks of real history" sampler (circular block bootstrap with a fixed seed), percentiles and biggest-drop maths, used by all three stages.
- **Stage 3, Prediction mode** (`notes/stage-3.md`): each phase can be invested in an ETF, a mix (rebalanced yearly), cash or a custom fat-tailed asset; picking an ETF fills its fee, yield and franking. Prediction mode replays real history 2,000 times (same real month for every asset, inflation, AUD/USD and cash rate), with worst/likely/best fan chart, goal chance, chance of ending below what you put in, and the middle simulation's biggest drop. Runs in a background worker. Fees, Tax and Inflation work the same in both modes; a constant history gives exactly the Manual answer (tested).
- **Stage 5, Markets tab** (`notes/stage-5.md`): dashboard with indexes, watchlist, sparklines, open/closed badges (daylight saving and holidays), favourites; ETF pages with TradingView Lightweight Charts, ranges 1D to Max, price vs total return, A$ view, prediction lines, a past-return "rate puller" with Use in Planner, key facts, Compare; data status in Settings.
- **Stage 6, Inflation tab** (`notes/stage-6.md`): Australian and US inflation history with drag-to-average, predictions with the RBA's 2–3% band (default window since 1993), buying-power calculator, returns after inflation; the Planner's "Use historical average" button now works (2.72%, Australia 1993–2026).
- **Joined up after merging:** Markets' "replay this period in Prediction mode" now works (puts the ETF in the phase and sets the plan's history years); Compare says when a plan is in Prediction mode (Compare still uses typed rates); open screens refresh when a data file is removed; clearer "waiting for inflation data" text.
- **Tests:** 281 app tests and 55 pipeline tests pass; type-check, lint and build are clean.

### Batch 4: Stage 7 part 2, polish and final accuracy check (18–19 Oct 2026)
- **Polish:** one shared ⓘ button on every tab; Markets, Inflation and Saved load on first open (start-up file 303 KB → 237 KB compressed); sentence-case labels everywhere; long switch labels wrap on iPhone (one was pushing the page sideways); backups check the shape of every newer setting before importing.
- **Accuracy check:** four independent reviews (engine and tax; Prediction mode; data and pipeline; Markets, Inflation and Compare). They re-checked every tax rate on ato.gov.au and the 2026 CGT law, rebuilt Prediction mode in Python (exact match), and compared the data with ABS, RBA, FRED/BLS, ASX, Nasdaq and the fund issuers. Everything they could show evidence for is fixed, with tests. The main fixes:
  - **Tax from 1 July 2027:** the 30% minimum also covers gains held under 12 months; losses come off pre-2027 gains first; brackets index from 1 July 2027 whatever the start date; under-18 top-slice rule; Working Australians tax offset.
  - **Prediction mode:** cash dividends count as money back in "ending below what you put in"; VGS/IVV/NDQ get their foreign income (and foreign tax credits); the historical cash rate matches Manual's convention.
  - **Data:** IVV's frozen Dec 2022 prices corrected; daily AUD/USD now from the RBA; pre-listing placeholder prices dropped; Australian inflation joined correctly at the switch to monthly CPI (historical average now 2.73%).
  - **Labels and warnings:** the GitHub "updates may stop" warning now actually works; correct "as of" labels in the first ASX hour and after failed downloads; clearer wording in Markets, Inflation and Compare.
- **Tests:** 312 app tests and 69 pipeline tests pass; type-check, lint and build are clean.

## How the maths works (decided in stage 1)
- Return rates are yearly *total* returns (price growth + distributions). Growth is added daily, and each calendar month counts as exactly 1/12 of a year, so 12 months at 7% is exactly 7%.
- Deposits and events land at the start of their day. The first deposit lands on a phase's first day.
- Monthly deposits keep the same day of the month (the 31st becomes the last day in shorter months). Weekly deposits follow the real calendar, so a year can have 53.
- Ramps: the first deposit is exactly the start amount and the last is exactly the end amount.
- Money in and out is stored in whole cents. Growth is tracked to a fraction of a cent and only rounded when shown.
- Plans can be up to 100 years long.

## Next
- **Put it online (finishes stage 2):** Soham makes a free GitHub account (steps in `notes/stage-2.md`), then Claude pushes the app, turns on the website and the scheduled data updates, and Soham installs it on the iPhone and Mac.
- After that, the app is complete. Each year: add next year's market holidays to `src/markets/hours.ts`, and re-check the tax rates when the ATO publishes the new year's tables.

## Problems / notes
- The GitHub workflows can't be tested until the GitHub account exists.
- Yahoo data is "personal use only", and a public repo makes the data files visible to anyone. Low risk for a small personal app (SPEC section 9).
- There's no free no-signup backup if Yahoo breaks (Stooq now blocks robots). A backup that needs a free account (e.g. Alpha Vantage) would need Soham's OK.
- The 2027 CGT law is passed. Only its optional "apportionment method" (a way to value assets held on 1 July 2027 without a valuation) is still being made by the government; the app uses market value. The exemption for people on certain government payments (s119-15) is law but not modelled. Tax is labelled a simplified estimate throughout.
- Two 2020 runs of identical DHHF prices are flagged in Settings → Data status for a person to check; no free source could confirm them.
- Yahoo sometimes stores estimated end-of-June distributions instead of the final amounts (differences under 2%); the effect on total return is tiny.
- The iPhone share sheet and file picker for backups can only be fully tested once the app is online.
- **Two different "history" defaults, both labelled:** Prediction mode replays full history by default (SPEC 4.1), which includes the 1970s–80s high inflation (about 4.6% a year since 1975). The Inflation tab and the Planner's historical-average button default to since 1993 (RBA targeting, 2.72%). With Inflation on, Prediction mode's "today's dollars" result can look much lower than people expect. "Since 1990" in Prediction settings is closer to recent times.
- Simulations on the iPhone may take a few seconds (progress bar shown); 1,000 simulations in Settings is fine if it feels slow.
- Market holiday lists run to 2027 (ASX) and 2028 (NYSE); add next year's dates to `src/markets/hours.ts` each year.
- No 1-day chart on the Mac preview: 5-minute prices only exist on the website once it's online.
