# Investment Planner App: Full Spec

This document is the single source of truth for the app. Read all of it before building anything. If a decision changes, update this file.

---

## 1. What the app is

A personal investment planner and market tracker for Soham and his dad, used on an **iPhone and a Mac**, built in Australia, priced in **AUD** by default.

Most calculators assume one interest rate, one timeframe and one deposit. This app lets you build a **real, changing life timeline** of phases (different deposits, frequencies and durations). It then projects it two ways:

- **Manual mode:** you type the rates of return yourself.
- **Prediction mode:** the app runs your exact timeline through real market history thousands of times and shows **worst / likely / best** outcomes.

Both modes have **Fees**, **Tax** and **Inflation** switches you can toggle on or off independently, so results can be as realistic as you like.

The app also has a full **Markets** tab (live-ish ETF prices, detailed charts, prediction lines) and an **Inflation** tab (history plus predictions).

**Not** an App Store product (for now). Personal use only. Budget: **$0**.

---

## 2. Platform and cost decisions (already made)

| Decision | Choice | Why |
|---|---|---|
| App type | **Progressive Web App (PWA)**: one web app | Works on iPhone (Safari → Share → Add to Home Screen) and Mac (Safari → File → Add to Dock). It looks like a normal app, never expires, needs no Apple Developer fee, and has nothing to reinstall. |
| Hosting | **GitHub Pages** (free, public repo) | Free, so the iPhone can reach the app from anywhere. |
| Market data | **GitHub Actions** scheduled job running Python + `yfinance`, saving JSON files into the repo | Free. A browser app can't call Yahoo directly (CORS), so a scheduled job fetches the data and the app reads the saved files. |
| Saved data | On-device (IndexedDB), with export/import to a file | Free, private, works offline. |
| Cost | **$0** | Anything that would cost money must be raised with Soham **before** being used. |

The calculation engine must be plain TypeScript with **no UI code in it**, so it could be ported to a native Swift app later if wanted.

---

## 3. Data

### 3.1 What we track
- **ETFs are the focus** (no need for individual-stock features).
- Default watchlist, editable in a config file `pipeline/tickers.json`:
  - ASX-listed, grouped by type (33 ETFs since 19 Oct 2026):
    - Australian shares: VAS, A200, IOZ, STW, VHY, VAP
    - Global shares: VGS, IVV (ASX), NDQ, IWLD, BGBL, WXOZ, VEU, VTS, ETHI, VESG, QUAL, MOAT
    - Currency-hedged: VGAD, IHVV, HGBL
    - Diversified: VDHG, DHHF, VDGR, VDBA, VDCO
    - Bonds: VAF, VBND, IAF
    - Gold: GOLD
  - US-listed: VOO, VTI, QQQ
  - Where an ETF's long-run stand-in history tracks it only loosely (e.g. VAP, VHY, GOLD, VBND), the app says so (`warning` in monthly.json).
  - Indexes for the dashboard: ASX 200, All Ordinaries, S&P 500, Nasdaq 100, plus AUD/USD
- Adding a new ETF means adding it to `tickers.json` (Claude Code can do this when asked); the next pipeline run fetches its full history.
- For each ETF, keep a small info file: name, what index it tracks, management fee (MER), typical distribution yield, franking % (Australian share ETFs), listing exchange and currency, inception date. Mark each value with the date it was checked.

### 3.2 Historical data: all built in, no manual downloading
- **Each ETF:** full daily history since inception: close, adjusted close (for total return incl. distributions), and distributions/dividends.
- **Long-run history for predictions:** most ETFs are young (e.g. VAS started 2009), and 15 years isn't enough to model crashes properly. Each ETF maps to a **long-run proxy series** (monthly total return of the index or asset class it tracks), for example:
  - US large companies: S&P 500 total return (e.g. Robert Shiller's free monthly dataset goes back to 1871)
  - Australian shares: ASX 200 / All Ordinaries accumulation index (as far back as free data allows)
  - Global shares, bonds, cash: best free long-run sources available
  - Splice the proxy onto the ETF's real history, and subtract the ETF's fee from proxy periods.
- **Currency:** AUD/USD history (so US-listed ETFs can be shown and simulated in AUD).
- **Gold:** World Bank "Pink Sheet" monthly gold price (US$, from 1968, converted to A$) as GOLD's long-run history.
- **Inflation:** Australian CPI (ABS) and US CPI (BLS/FRED), as far back as available. Check whether ABS now publishes a full monthly CPI or only quarterly, and handle both.
- **Cash rate:** RBA cash rate history (for a "cash / savings account" asset).
- Claude Code must research free sources, check they're free for personal use, and record every source, date range and gap in `DATA_SOURCES.md`.
- *(Found in stage 2: free monthly Australian share data starts in 1975 and AUD/USD in 1969, so "full history" for Australian ETFs effectively starts in 1975. Global shares before 1990 are approximate. Details in `DATA_SOURCES.md`.)*

### 3.3 Automatic updates (the pipeline)
A GitHub Actions workflow runs on a schedule, with no one needing to touch it:

- **Intraday prices** (latest quote + 5-minute bars for the 1-day chart): every ~15 minutes during ASX hours (10:00–16:10 Sydney time) and US hours (NYSE 9:30–16:00 New York time). Cron runs in UTC, so handle daylight saving in **both** Sydney and New York. *(Stage 2: intraday files go to the website only, not into git, to keep the repo small. Daily, monthly and macro data are committed.)*
- **Daily history:** append each day's close after each market closes.
- **Inflation / cash rate:** check daily; update when a new figure is released.
- Writes compact JSON files to `/data`, plus `data/meta.json` with "last updated" times and the health status of each source.
- **Safety:** never overwrite good data with empty or broken data. If a fetch fails, keep the last good file and record the error in `meta.json`.
- **Known GitHub limits to handle:** scheduled runs can start late (accepted). GitHub can switch off scheduled workflows in public repos after 60 days with no repo activity, so verify whether the pipeline's own data commits prevent that, and add a fix if they don't. *(Stage 2: GitHub's docs confirm the 60-day rule but don't say whether the workflow's own commits count. The pipeline commits every trading day, which should count. No keep-alive tricks (GitHub disabled the popular one). If 45 days pass without a commit, `meta.json` gets a warning the app can show, with steps to re-enable.)*
- Plan a **fallback data source** in case Yahoo changes and `yfinance` breaks.

### 3.4 How the app uses the data
- **Every time the app is opened or brought back to the screen:** fetch `meta.json` → download only the files that changed → save to IndexedDB → **recalculate all predictions automatically** (in a Web Worker so the screen never freezes).
- Show a small "Prices as of 3:42pm · updated 6 min ago" label everywhere data appears.
- Pull-to-refresh on iPhone.
- Works offline using the last saved data (and says so).
- If data is more than 2 days old on a weekday, show a gentle warning.
- No background updating when the app is closed (accepted).

---

## 4. App structure

Bottom tab bar on iPhone and sidebar on Mac: **Planner · Markets · Inflation · Saved · Settings**

### 4.1 Planner tab: the timeline builder

**Plan basics:** plan name, start date, money you have now, currency (AUD default).

**Money you have now** (added 19 Oct 2026): one amount (with what it's invested in, and optionally what you paid and when), or a list of holdings (what each is in, today's value, what you paid incl. brokerage, roughly when you bought it, and in Manual mode its expected return). Anything bought in several goes can list each purchase (when, what was paid); each is its own tax lot, and today's value is split between them from price history (units bought), or by what was paid when there's no history. Holdings in something different from the first phase are either kept as they are (own investment, returns, fee and distributions for the whole plan) or moved into the plan's investments on the start date (CGT with Tax on, trading costs with Fees on). Deposits and events follow the phases; withdrawals, and sales to pay tax or fees, take from all investments pro-rata (waiting cash first). Holdings keep their real cost base and purchase date for CGT (12-month discount, 1 July 2027 split). In Prediction mode each kept holding replays its own history from the same sampled months.

**Phases:** unlimited, can be added, reordered (drag), duplicated or deleted. Each phase has:
- Name (e.g. "Uni days", "First job", "Promotion")
- **Duration:** number + unit: days, weeks, fortnights, months, years, decades
- **Deposit:** amount + how often: daily, weekly, fortnightly, monthly, quarterly, yearly (separate from the duration unit)
- **Deposit step-up (optional):** ramp from a start amount to an end amount over the phase or a chosen part of it, with a curve shape: straight line, slow-then-fast, fast-then-slow, or custom steps (e.g. +$20 every 6 months)
- **What it's invested in:** one ETF, a custom mix (e.g. 70% VGS / 30% VAS, with yearly rebalancing), cash/savings account, or a **Custom asset** (see below)
- **Manual return rate** (used in Manual mode): a fixed % or a ramp from one % to another, with the same curve options
- **Tax info for this phase** (used when Tax is on): see 4.3
- **Grow deposits with inflation** (on/off)

**One-off events:** lump-sum deposits or withdrawals on a specific date (e.g. "+$2,000 birthday money", "−$15,000 car").

**Goal (optional):** target amount + target date.

#### Mode switch: Manual | Prediction

**Manual mode**
- Uses the rates you typed. One clear growth line.
- Inflation in Manual mode: type a rate (or a ramp), or tap "use historical average".

**Prediction mode** (the main feature)
- Phases, deposits, durations and events stay exactly as entered; **only the returns (and inflation and AUD/USD) vary**, and not in a straight line. They follow real historical ups and downs.
- **Method:** block bootstrap of historical monthly data. Pick random chunks of real history (default 12-month blocks, adjustable) and chain them together. Each sampled month takes the asset returns, inflation and AUD/USD **from the same real month**, so real-world relationships stay intact (e.g. high-inflation years, crashes hitting several assets at once).
- **History window:** full history (default), since 1950, since 1990, last 20 years, or a custom range.
- **Simulations:** default 2,000 (adjustable 500–10,000). Use a fixed random seed so results don't jump around each time the app opens; they should only change when the data or inputs change. Add a "re-roll" button.
- **Outputs:**
  - Fan chart: **Worst (10th percentile), Likely (median), Best (90th percentile)** lines with shaded bands. Percentiles adjustable (e.g. 5/50/95).
  - Toggle to show a handful of individual simulated paths.
  - Goal probability: "In 1,624 of 2,000 simulations (81%) you reached $500,000 by 2040." Always worded as an estimate based on history, never as a guarantee. *(Stage 3: counts the balance on the goal date, in today's dollars when Inflation is on.)*
  - Chance of ending below total money deposited.
  - Typical worst drop along the way (max drawdown) for the median path. *(Stage 3: measured on the value of each invested dollar in the simulation with the median final amount, so deposits and withdrawals don't hide or fake a drop.)*
  - *(Stage 3: with Fees off, Prediction returns are before the ETF's fee; the fee already inside history is added back so it is never counted twice.)*
- **Custom asset:** enter an average yearly return + how bumpy it is (volatility), optionally crash frequency. Simulate with fat tails (e.g. Student-t), not a smooth bell curve, so crashes are realistic. *(Stage 3: average = long-run compound growth; volatility = standard deviation of yearly returns; monthly Student-t with 5 degrees of freedom plus optional one-month crashes.)*
- **Cash phases** use the fixed savings rate, or RBA cash-rate history in Prediction mode.

#### Realism switches (apply to BOTH modes, each independent)
- **Fees** on/off (4.2)
- **Tax** on/off (4.3)
- **Inflation** on/off (4.4): shows all values in today's dollars
- **"Show the cost" comparison:** overlay the result with all switches off, so you can see how much fees, tax and inflation each take.
- Every switch change recalculates instantly.

#### Results panel (both modes)
- Final balance (each percentile in Prediction mode)
- Total deposited · investment growth · total fees paid · total tax paid · value in today's dollars
- Stacked chart of deposits vs growth over time
- Year-by-year table (Australian financial years, 1 July – 30 June)
- Export results as CSV

### 4.2 Fees switch
- **ETF management fee (MER)**, % per year: auto-filled from the ETF info file, editable. Deducted gradually (monthly), the way it really works.
- **Brokerage** per buy: flat $, %, or tiered. Editable presets; mark presets "check current fees".
- **Buying frequency:** how often deposits are actually invested (e.g. deposit weekly but buy monthly to save brokerage). Cash waiting to be invested earns a chosen savings rate (or 0).
- **Currency conversion fee** % for US-listed ETFs.
- **Account/platform fee** ($ per month or year).
- Optional buy/sell spread %.

### 4.3 Tax switch (Australian rules)
- **Tax tables:** preset current ATO resident individual tax rates, plus any already-legislated future changes. All rates are editable. **Verify every rate against ato.gov.au and show the "rates checked on" date.** Medicare levy toggle.
- **Future brackets:** choose "brackets stay the same" (bracket creep) or "brackets rise with inflation".
- **Income over time:** each phase can set the person's other taxable income (job etc.), which works out the marginal tax rate. Quick option: just pick a tax bracket / marginal rate per phase. Brackets can change from phase to phase.
- **Distributions:** each ETF has a distribution yield and franking %. Distributions are taxed every financial year at the marginal rate, and franking credits are applied. Optional: foreign tax offset for US ETFs. Choose to reinvest distributions (after tax) or take them as cash.
- **Capital gains tax:** track each purchase separately (cost base per lot). Apply the 50% CGT discount for holdings kept at least 12 months. *(Updated 18 Oct 2026: a 2026 law replaces the discount for gains from 1 July 2027 with cost base indexation plus a minimum 30% tax; the app models both, with a switch to keep the old discount. See notes/stage-4.md.)* At the end, choose:
  - "Sell everything at the end": show the after-tax amount
  - "Don't sell": show the value plus the tax that would be owed if sold
- **Owner of the investment:** adult / under 18. Under-18s pay special higher tax on investment income above a small threshold. Implement this from current ATO rules and verify.
- Label all tax results as simplified estimates.

### 4.4 Inflation switch + Inflation tab
**Switch (in Planner):**
- Shows all results in today's dollars.
- Option to grow deposits with inflation automatically.
- In Prediction mode, inflation comes from the same sampled historical months as returns (see 4.1).

**Inflation tab (its own full page):**
- Historical CPI charts for Australia and the US: yearly inflation %, with ranges up to Max (decades).
- Highlight any window to get the average inflation for that period.
- **Inflation predictions:** worst / likely / best fan chart for future inflation (bootstrap from history), with the RBA's 2–3% target band shown. *(Stage 6: default history window is since 1993, when the RBA began inflation targeting; adjustable. The Planner's "use historical average" uses the same window. Australia has quarterly CPI since 1948 and monthly CPI since April 2024; the history chart shows quarterly by default, with a switch.)*
- **Purchasing power calculator:** what $X in year A is worth in year B (past and predicted future).
- **Real returns:** each ETF's returns after inflation.
- Updates automatically when new CPI data is released.

### 4.5 Markets tab: the full version (not cut down)
**Dashboard**
- Major indexes and watchlist ETFs: price, $ and % change, mini sparkline, "as of" time, market open/closed badge.
- Sort/reorder; star favourites (saved on device).

**ETF detail page**
- Large interactive chart. Ranges: **1D, 1W, 1M, 3M, 6M, YTD, 1Y, 5Y, 10Y, Max**. Smooth switching. Crosshair showing date and price on touch/hover. *(Stage 5: scroll/zoom on charts is replaced by the range buttons, so a finger never fights the page scroll. Highlight a period by mouse drag, or with "Pick a period" on touch.)*
- Toggles: price only vs total return (with distributions); show in AUD.
- **Prediction lines:** stemming from today's price, three dotted lines (worst / likely / best) with a shaded band, from the same bootstrap engine using the ETF's long-run proxy history. Horizon: 1, 5, 10 or 20 years.
- **Historical rate puller:** drag to highlight any period (e.g. 2010–2020). The app shows average yearly return (price and total return), volatility, biggest drop, and best and worst year. A **"Use in Planner"** button sends that rate (or that history window) to a phase. *(Merged batch 3: the history-window option puts that ETF in the phase and switches the plan to Prediction mode over those whole calendar years; the window applies to the whole plan.)*
- Key facts: what it tracks, fee, distribution yield, franking, inception date.
- **Compare:** overlay 2+ ETFs on one chart (as % growth).
- Everything updates automatically on open with the latest data.

### 4.6 Saved tab
- Save, rename, duplicate and delete plans.
- Compare up to 3 plans side by side.
- **Export / import** a backup file. Data is stored per device, so this is how a plan moves between the iPhone and the Mac.

### 4.7 Settings
- Data status: last update time for each source, any errors.
- Default percentiles, number of simulations, random seed.
- Tax table "checked on" date.
- Light / dark / automatic.
- Disclaimer (also shown once on first open): *"General information only, not financial advice. Predictions are estimates based on past data, and the future can be different."*

---

## 5. Design
- Clean, modern, Apple-like. Feels like a real app, not a website. Light and dark mode.
- Designed for iPhone first; uses the extra space nicely on Mac.
- Big, clear numbers. Smooth animations. Fast.
- Plain-English labels. Every technical term (MER, CGT, percentile, volatility, franking, etc.) has a small ⓘ button explaining it in one or two sentences.
- Market charts: TradingView Lightweight Charts (free; keep its required attribution) or similar. Planner fan charts: whichever library looks best.

---

## 6. Accuracy rules (important)
- Money maths must avoid floating-point errors (work in cents or use a decimal library).
- Be consistent about how compounding works and when deposits land (state it in the ⓘ notes).
- Write automated tests for the calculation engine: compare against hand-checked examples and known calculator results, and test edge cases (zero deposits, one-day phases, withdrawals bigger than the balance, etc.).
- Never word a prediction as certain. Always "estimate", "based on history".
- Every number that comes from outside (tax rates, fees, data) has a recorded source and date.

---

## 7. Suggested tech stack (Claude Code can improve on this; explain any change)
- **App:** Vite + TypeScript + React, PWA plugin (installable and offline), IndexedDB (e.g. Dexie), Web Worker for simulations, Vitest for tests.
- **Engine:** `/src/engine`: pure TypeScript, no UI code.
- **Pipeline:** `/pipeline`: Python + yfinance (+ other free sources), run by `.github/workflows/update-data.yml`.
- **Hosting:** GitHub Pages, deployed automatically by GitHub Actions.

---

## 8. Build order: in batches, check with Soham after each batch

1. **Setup + Planner, Manual mode.** Phases, durations, deposit frequencies, step-ups, events, results chart. Runs on the Mac.
2. **Data pipeline + hosting.** Historical data built in, scheduled updates, deployed to GitHub Pages, installed on the iPhone home screen and the Mac Dock.
3. **Prediction mode.** Bootstrap Monte Carlo, worst/likely/best, goal probability, auto-recalculation when data updates.
4. **Fees, Tax and Inflation switches.**
5. **Markets tab (full).**
6. **Inflation tab.**
7. **Saved tab, compare, export/import, polish, final accuracy check.**

Each stage must work on its own before moving on.

**Batches (decided 18 Oct 2026, to go faster):** stages that don't depend on each other are built at the same time in separate sessions, then merged and tested together.
- Batch 1: stage 1 (done).
- Batch 2: stages 2, 4 and 7 in parallel. Stage 2 stops before anything that needs Soham's GitHub account.
- Batch 3: stages 3, 5 and 6 (they need stage 2's data, and stage 3 builds on stage 4's engine changes).

---

## 9. Known, accepted limitations
- Prices are delayed (about 15–20 minutes, sometimes more). Scheduled updates can run late.
- `yfinance` uses Yahoo's unofficial data. It's for personal use only and can break without warning (hence the fallback plan).
- The GitHub repo is public (needed for free hosting), so the code and data files are visible to anyone who finds it. Don't put anything private in it.
- Saved plans live on each device separately; use export/import to move them.
- Predictions are estimates from history, not guarantees. Tax is a simplified estimate.
