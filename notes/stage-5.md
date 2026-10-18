# Stage 5: Markets tab (notes)

Branch: `claude/stage-5-markets-1de038`. Built 18 Oct 2026. Not merged yet.

## What's done

**Dashboard** (Markets tab)
- The indexes (ASX 200, All Ords, S&P 500, Nasdaq 100, AUD/USD) and the 11 watchlist ETFs, each with:
  - price
  - $ and % change, with ▲/▼ and +/− (so colour is never the only clue)
  - a mini chart of the last month
  - when the price is from ("Fri 16 Oct close", or "2:05pm" during the day)
  - an open/closed badge for its market
- At the top: "ASX Closed · opens Mon 10:00am" and "NYSE Closed · opens Tue 12:30am", in your own time zone.
  - Daylight saving is handled in Sydney and New York.
  - Public holidays and early closes come from the ASX and NYSE calendars, checked 18 Oct 2026. ASX is covered to the end of 2027, NYSE to the end of 2028; after that only weekends are known.
- Sort by: my order, biggest rise, biggest fall, or name. "Reorder" moves ETFs up and down. ☆ keeps favourites at the top. All of this is remembered on the device.
- "Prices as of … · updated … ago" for ASX and US prices.
- Notices:
  - "You're offline" (still shows the saved prices).
  - A gentle "prices haven't updated for a few days" warning (more than 2 trading days old, on a weekday).
- Pull down to refresh (iPhone), or tap Refresh (Mac).

**ETF page** (tap any ETF or index)
- Big chart (TradingView Lightweight Charts).
  - Ranges: 1D, 1W, 1M, 3M, 6M, YTD, 1Y, 5Y, 10Y and Max, with a smooth glide between them.
  - Hover (Mac), or touch and hold (iPhone), to see the date and price.
  - The big number at the top follows your finger and shows the change since the start of the range.
- Switches:
  - **Total return** (with distributions).
  - **Show in Australian dollars**, for VOO, VTI and QQQ. It uses the exchange rate on each day: daily rates from 2006, month-end rates before that.
  - **Prediction lines.**
- **1D**: today's 5-minute prices. These only exist on the website, so on the Mac it says "No 1-day prices yet" and shows the latest close instead. I tested it with a temporary fake file, then deleted it.
- **Prediction lines**: worst / likely / best as dotted lines with a shaded band, starting from today's price.
  - Looks ahead 1, 5, 10 or 20 years.
  - Uses the shared bootstrap (`src/engine/bootstrap.ts`): 2,000 replays of 12-month chunks of the ETF's long-run history (`data/monthly.json`, the real ETF plus the index it follows before it existed). Fixed seed, so the lines only change when the data changes.
  - Listed underneath as dollars and % a year, labelled "An estimate based on history, not a promise".
  - The future part of the chart is drawn to scale.
  - Turning predictions on widens the history shown to match (e.g. 10Y history for a 10-year prediction).
- **Pull a rate from history**: highlight a period in any of three ways:
  - drag across the chart (Mac);
  - tap "Pick a period" and slide a finger (iPhone);
  - type the dates.

  It shows:
  - average yearly return (total return, and price only)
  - volatility
  - biggest drop, with when it happened
  - best and worst full calendar year
- **Use in Planner**: choose a phase; that period's total return goes into the phase's return rate.
  - The fund's fee is added back, because the Planner takes it off itself when Fees is on.
  - Optionally it also sets the phase's fee to the ETF's.
  - Indexes can't be sent (their prices leave out dividends).
- **Key facts** from `data/etfs.json`: what it tracks, fee, yield, franking, how often it pays, start date, exchange, what's inside.
  - Each fact shows its checked-on date and a source link.
  - Facts the pipeline marks as unconfirmed say "estimate".

**Compare**: pick 2 to 5 ETFs or indexes on one chart, as % growth from the same starting day.
- Price or total return; US-listed in A$ or US$.
- Each line has its own colour and dash pattern.
- Underneath: total growth and average a year.

**Settings → Data status**
- When the app last checked for data, and when the data was built.
- Each source (Yahoo, ABS, FRED, RBA, French): working or not, last success, any error.
- Each update job (ASX/US closes, prices during the day, inflation, long-run history).
- Recent problems.
- GitHub's 60-day warning from `meta.json`, with the 3 steps to switch the schedule back on.

**Tests**: 55 new (203 in total; `npm test`). They cover:
- % changes
- chart range starts
- compound average yearly return (hand-checked: $100 → $121 over 2 years = 10%)
- volatility (hand-checked: √0.0336)
- biggest drop, with dates
- best/worst calendar year, checked against the real S&P 500: 2008 −38.5%, 2013 +29.6%
- adding the fee back for the Planner
- US$ → A$ conversion
- latest price (5-minute vs close)
- market open/closed on both sides of both cities' daylight-saving changes, plus holidays, early closes and next-open times
- prediction lines: same result every time; exact for a steady return; A$ conversion; price only; sensible on real data
- the 60-day warning
- watchlist order

`npm run build`, `npm test` and `npm run lint` all pass.

**Checked in the browser** with the real data at phone size (375 wide) and Mac size, in light and dark mode:
- dashboard, sorting, reorder and favourites
- VAS, VOO (in A$) and ASX 200 pages
- every range
- predictions
- dragging a period, by mouse and by simulated finger
- Use in Planner: "Uni days" changed to 8.86% in the Planner
- Compare
- offline notice
- pull to refresh (simulated touches)
- Data status
- 1D with a temporary fake 5-minute file

## How Soham can try it (Mac)

1. Double-click `Start app.command` (or ask Claude to start the preview), then click **Markets** on the left.
2. Look at the top: whether the ASX and New York markets are open, and the indexes. Click **Reorder**, move an ETF, and tap ☆ on one you like.
3. Click **VAS**:
   - Try the range buttons (1W … Max) and hover over the chart.
   - Turn on **Total return**: the line includes distributions.
   - Turn on **Prediction lines** and try 1, 5, 10 and 20 years.
4. Scroll to **Pull a rate from history**, drag across the chart (e.g. 2013 to 2023), and read the numbers. Click **Use in Planner**, pick a phase, and click **Use … a year**, then **Open the Planner** to see it.
5. Go back and click **VOO**. Switch **Show in Australian dollars** on and off.
6. Back on Markets, click **Compare ETFs on one chart**, and pick a few.
7. Open **Settings** → **Data status**.

On the iPhone (after the app is online): pull down on Markets to refresh. On a chart, touch and hold to see prices. Tap **Pick a period**, then slide your finger across the chart.

## Decisions

- **Chart library**: TradingView Lightweight Charts 5.2.1 (free, Apache 2.0).
  - Its licence asks for the notice "TradingView Lightweight Charts™ Copyright (c) 2025 TradingView, Inc." plus a link to tradingview.com on the page.
  - The small TradingView logo on each chart is the link. The notice and a text link are also under the dashboard, the ETF page and Compare.
- **Scroll and zoom are off** on the charts: the range buttons choose what's shown, so a finger on a chart never fights the page scroll. Mouse drag highlights a period. On touch, you tap "Pick a period" first.
- **Predictions**:
  - Worst, likely and best are the 10th, 50th and 90th percentiles. Stage 3 may add a Settings choice for these; this page doesn't read one yet.
  - "Price only" lines take the ETF's usual distribution yield off each month, since the price drops when a distribution is paid.
  - In A$, each month's US$ return is converted with that same month's AUD/USD move. That limits history to 1969 on, when AUD/USD data starts.
  - They’re worked out on the screen (about 40 ms for 20 years), not in a Web Worker.
- **Volatility** is worked out from day-to-day changes, scaled to a year (×√252). The average yearly return is compound (the steady yearly rate).
- **"Use in Planner" adds the fee back**: market prices are after the fund's fee, and the Planner takes the fee off itself when Fees is on.
- **"Since the start" change on a range** is measured from the close on or just before the range start, like most market apps.
- **Lazy loading**: the ETF page and Compare (and the chart library, about 175 kB) load the first time they're opened. They're still in the offline copy. The main app file grew by only 34 kB.

## Problems and things to know

1. **No 1-day chart on the Mac**: the 5-minute files only exist on the website (stage 2's choice). The page says so and shows the latest close.
2. **Yahoo has no VAS distribution records before 2013** (and similar gaps for other ASX ETFs, see `trFrom` in each daily file). Total return before then is really the price only. The app warns wherever that matters.
3. **Long-run predictions include the high-inflation 1970s–80s**, so "likely" for Australian shares is about 8.5% a year (price only) or about 12% (total return), before inflation. That's what history says, labelled as an estimate. Stage 6's Inflation tab is the place to show real (after-inflation) returns.
4. Holidays after 2027 (ASX) and 2028 (NYSE) aren't known yet. Add next year's dates to `src/markets/hours.ts` each year: the source links are in that file.
5. On the dashboard, US-listed ETFs show US$ prices; the A$ switch is on their own page and in Compare.

## Notes for merging (for the coordinating session)

- **Files**: everything is in `src/markets/` (new), plus:
  - `src/App.tsx`: the Markets line `<MarketsPage plan={plan} setPlan={setPlan} />` and its import.
  - `src/pages/OtherPages.tsx`: `<DataStatus />` in SettingsPage, plus its import.
  - `package.json` / `package-lock.json`: new dependency `lightweight-charts` 5.2.1, pinned exactly.
  - `notes/stage-5.md`.

  Nothing in src/engine, src/data, src/planner, src/saved, src/state or the pipeline.
- **Stage 3 hook ("use this history window")**: `MarketsPage` takes an optional prop `onUseHistoryWindow(req: HistoryWindowRequest)` (type in `src/markets/UseInPlanner.tsx`).
  - `req` has `phaseId`, `etfId`, `from`/`to` ("YYYY-MM-DD"), `fromMonth`/`toMonth` ("YYYY-MM") and `inAud`.
  - When the prop is passed, the Use in Planner sheet shows a button "Or replay this period's history in Prediction mode".
  - Until then it says "Coming with Prediction mode".
  - After merging stage 3, wire it in App.tsx with `setPlan` writing stage 3's new phase fields (e.g. the phase's asset = `etfId` and its history window = `fromMonth`..`toMonth`).
- **Small gap in `src/data/sync.ts`** (not changed here): when a file disappears from `meta.json`, it's deleted from the device, but `version` doesn't go up, so open screens keep showing it until they're reopened. That doesn't matter today (the website's intraday files never disappear), but `version` should probably also go up when `gone.length > 0`.
- The Markets tab keeps its own small store in localStorage (`markets-prefs-v1`: favourites, order, sort, chart choices), with try/catch. It doesn't touch `src/state/db.ts`.
- Colours: new tokens `--mk-price`, `--mk-predict`, `--mk-c1`…`--mk-c5` in `src/markets/markets.css`, checked with a colour-blindness simulator (notes at the top of that file).
- Suggested SPEC.md update (4.5): "Scroll/zoom on charts is replaced by the range buttons; highlight a period by mouse drag, or with 'Pick a period' on touch."
