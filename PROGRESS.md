# Progress

## Done

### Stage 1: Setup + Planner, Manual mode (18 Oct 2026)
- Project set up: Vite + React + TypeScript, git. Node.js 24 LTS installed in `~/.local/node` (no admin password needed).
- **Calculation engine** in `src/engine` (plain TypeScript, no screen code):
  - Phases with any length (days to decades), deposits daily to yearly, or none.
  - Step-ups for deposits and return rates: ramp (straight line, slow-then-fast, fast-then-slow) or steps (e.g. +$20 every 6 months), over the whole phase or part of it.
  - One-off deposits and withdrawals (a withdrawal can't take the balance below $0; you get a warning).
  - Optional goal: checks the balance at the end of the goal date.
  - Year-by-year table in Australian financial years (1 July to 30 June).
  - 27 automated tests, checked against the standard compound-interest formulas (`npm test`).
- **Planner screen**: big result number, chart of "your money" vs "growth", life-timeline ribbon under the chart (tap a phase to edit it), drag to reorder phases, duplicate/delete, events, goal, year-by-year table, CSV download, ⓘ explanations, light/dark mode, first-open disclaimer.
- The current plan saves itself on the device (IndexedDB).
- Other tabs show what's coming and in which stage.

## How the maths works (decided in stage 1)
- Return rates are yearly. Growth is added daily, and each calendar month counts as exactly 1/12 of a year, so 12 months at 7% is exactly 7%.
- Deposits and events land at the start of their day. The first deposit lands on a phase's first day.
- Monthly deposits keep the same day of the month (the 31st becomes the last day in shorter months).
- Weekly deposits follow the real calendar, so a year can have 53 of them.
- Ramps: the first deposit is exactly the start amount and the last is exactly the end amount.
- Money in and out is stored in whole cents. Growth is tracked to a fraction of a cent and only rounded when shown.
- Plans can be up to 100 years long.

## Next
- **Stage 2:** data pipeline (GitHub Actions + yfinance), historical data, hosting on GitHub Pages, install on iPhone and Mac. Needs a free GitHub account.

## Not done yet in stage 1 (on purpose, later stages)
- Choosing an ETF or mix for a phase (needs market data, stage 2/3).
- Fees, tax, inflation switches and "grow deposits with inflation" (stage 4).

## Problems / notes
- The app's code bundle is about 230 KB zipped, mostly the chart library. Fine for now; can be split up later if loading feels slow.
