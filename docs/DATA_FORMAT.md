# Data file formats

The pipeline (`pipeline/`) writes these files to `data/`. The website serves them at
`<site>/data/...`. TypeScript types for every file are in `src/data/types.ts`; the app reads them
through `src/data` (never fetch them directly; the loader handles caching and offline use).

Conventions: times are UTC ISO strings (`2026-10-18T05:12:00Z`), dates `YYYY-MM-DD` (the
exchange's local trading date), months `YYYY-MM`. Files are compact JSON (no spaces). Every file
that has data in time has an `asOf` field: the latest date/time/month it covers.

| File | What | Changes |
|---|---|---|
| `meta.json` | List of files with fingerprints, update times, source health, problems | every run |
| `etfs.json` | Watchlist + ETF facts (fee, yield, franking...) with checked-on dates | when facts are edited |
| `daily/<ID>.json` | Full daily price history of one ETF / index / AUDUSD | each trading day |
| `intraday/asx.json`, `intraday/us.json` | Today's 5-minute bars and latest prices (not in git, website only) | every ~15 min in market hours |
| `monthly.json` | Long-run monthly changes, lined up by month, for Prediction mode | monthly (and when inputs change) |
| `inflation.json` | CPI index levels: Australia quarterly + monthly, US monthly | when ABS/BLS publish |
| `rates.json` | Cash rate decisions, monthly cash rate, bond yields | when the RBA/FRED publish |
| `fx.json` | AUD/USD month-end since 1969 | monthly |

---

## meta.json

```jsonc
{
  "schema": 1,
  "generatedAt": "2026-10-18T09:10:04Z",
  "files": {
    "daily/VAS.json": { "hash": "a711881a624d5c23", "bytes": 67488, "updatedAt": "2026-10-18T09:06:55Z", "asOf": "2026-10-16" }
  },
  "sources": {
    "yahoo": { "label": "Yahoo Finance (...)", "status": "ok", "lastAttempt": "...", "lastSuccess": "...", "lastError": null, "failures": 0, "note": "optional" }
  },
  "tasks": {
    "daily_asx": { "lastAttempt": "...", "lastSuccess": "...", "lastError": null, "forDate": "2026-10-16" },
    "intraday_asx": { "...": "...", "result": "written | unchanged | no-session | failed" }
  },
  "problems": [ { "at": "...", "where": "yahoo", "message": "..." } ],   // newest first, last 40
  "repo": { "lastCommit": "...", "daysSinceCommit": 0 }
}
```

- `hash` changes exactly when the file's content changes; the app downloads a file only when its
  hash differs from the copy it already has. `updatedAt` is when the content last changed.
- `sources[*].status` is `"error"` when the most recent attempt failed. The old data is still being
  served; `lastSuccess` says how old it is. Source names: `yahoo`, `abs`, `fred`, `rba`, `french`.
- Tasks: `daily_asx`, `daily_us`, `intraday_asx`, `intraday_us`, `macro`, `proxies`. A task's
  `note` (e.g. "no close for … (public holiday?)") belongs to its latest run only and is removed by
  the next run that has none. A daily task is done for a date (`forDate`) only when **every** ETF in
  that market has its close (the oldest of the ETFs' latest dates), not when the first index has one.
- `repo.lastCommit`: UTC time of the newest git commit (`YYYY-MM-DDTHH:MM:SSZ`), written every run;
  the app works out the age from it. `daysSinceCommit` is the age when the pipeline last ran. After 45
  quiet days a `"github"` problem is logged once per quiet spell (not on every run).
- Checks that would find the same thing every run (e.g. an ETF close stuck for days) log each
  message once.

## daily/&lt;ID&gt;.json

```jsonc
{
  "id": "VAS", "symbol": "VAS.AX", "name": "...", "kind": "etf", "currency": "AUD",
  "asOf": "2026-10-16", "first": "2009-05-01", "last": "2026-10-16",
  "d": [0, 3, 1, 1, 1, ...],      // days since the previous row (first is 0)
  "c": [44.9, 45.2, ...],         // close, split-adjusted
  "a": [30.1, 30.3, ...],         // ETFs only: adjusted close (includes distributions = total return)
  "div": [["2013-01-02", 0.5123], ...],   // ETFs only: ex-date, amount per unit
  "splits": [["2022-12-05", 0.0667]],     // ETFs only (Yahoo's ratio)
  "trFrom": "2013-01-02",         // ETFs only: total return is reliable from this date
  "trNote": "...",                // why, if trFrom is later than first
  "repairs": ["..."],             // fixes made to Yahoo's data, if any (bad days, unrecorded splits,
                                  // placeholder rows before listing, corrections from pipeline/static/corrections.json)
  "source": "...",                // AUDUSD only: where the rates come from
  "approxFrom": "2026-10-19"      // AUDUSD only, optional: rows from here are Yahoo's approximate rate (RBA not published yet)
}
```

Rebuild dates with `decodeDaily()` from `src/data`. Indexes and AUDUSD have no `a` (adjusted
equals close). Prices keep about 6-7 significant figures. ASX ETF files start on the ASX listing
day. `AUDUSD.json` is the RBA's daily rate (US$ per A$1, 4pm Sydney, weekdays only, from 2003), with
Yahoo filling only the newest weekdays the RBA hasn't published yet (marked by `approxFrom`).

## intraday/&lt;market&gt;.json

```jsonc
{
  "market": "asx", "exchange": "ASX", "tz": "Australia/Sydney",
  "session": "2026-10-16",                  // the trading day these bars belong to
  "asOf": "2026-10-16T05:05:00Z",           // start of the latest bar
  "generatedAt": "...",
  "quotes": { "VAS": { "price": 106.7, "time": "...", "prevClose": 106.2, "change": 0.5, "changePct": 0.471 } },
  "bars": { "VAS": { "t0": 1792105200, "step": 300, "c": [106.2, 106.3, null, ...] } }
}
```

Bar `i` starts at `t0 + i * step` (unix seconds); `null` = no trade in that 5 minutes. The file
keeps the last session's data after the close and over weekends (check `session` and the market
hours to show "Closed"). These files are only on the website, not in git.

## monthly.json

```jsonc
{
  "schema": 1, "asOf": "2026-08", "scale": 100000,
  "allSeriesFrom": "1975-01", "allSeriesTo": "2026-08",   // every core series has data in this range
  "series": {
    "au_shares": {
      "label": "Australian shares (total return)", "kind": "return", "currency": "AUD",
      "start": "1975-01",
      "values": [19170, 520, ...],          // change during each month × scale; null = no data
      "segments": [ { "from": "1975-01", "to": "2025-12", "source": "..." }, ... ],
      "gap": "optional note", "interpolated": ["2025-10"]   // optional: months that are filled in or partly estimated
    }
  },
  "etfs": {
    "VAS": {
      "label": "...", "currency": "AUD", "start": "1975-01",
      "realFrom": "2013-01",                // real ETF total returns from here; proxy (minus fee) before
      "fee": 0.0007,                        // yearly fee taken off proxy months
      "proxy": [ { "series": "au_shares", "weight": 1, "hedged": false } ],
      "proxyCheck": { "months": 156, "from": "...", "to": "...", "correlation": 0.995, "realYearly": 0.092, "proxyYearly": 0.094, "trackingError": 0.013 },
      "values": [ ... ]
    }
  }
}
```

- **Value for month m** = `values[m − start] / scale`, a fraction (0.01234 = +1.234%). For `kind`
  `"return"` it is the total return in that month (in the series' currency); `"inflation"` is the CPI
  change; `"fx"` (`audusd`) is the change in US$ per A$1 (positive = the Australian dollar rose).
- **Same real month across everything**: all series share the same calendar. Prediction mode should
  pick month indexes and read every series at that month, e.g. with
  `alignedMonths(file, ['etf:VAS', 'au_cpi', 'audusd'], from, to)` from `src/data`, which returns only
  months where every requested series has data.
- **Currency**: ETF columns are already in the ETF's trading currency (A$ for ASX ETFs). To show a
  US-dollar series in A$: `(1 + r_usd) / (1 + audusd) − 1`.
- Series: `au_shares`, `us_shares`, `global_shares`, `us_tech`, `au_bonds`, `us_bonds`, `cash_au`,
  `cash_us`, `au_cpi`, `us_cpi`, `audusd`. See DATA_SOURCES.md for sources, gaps and stand-ins.
  `interpolated` lists filled months (`us_cpi`: Oct 2025) or partly estimated ones (`au_bonds`:
  May-Sep 2013, when the RBA had no 5-year yield).
- `au_cpi`: before April 2024 each ABS quarterly index (the average of its 3 months) is placed at the
  quarter's middle month and the months in between grow evenly; from April 2024 the monthly CPI, its
  first month measured from the chain's level for the month before. The chain lands exactly on the
  published index levels. `src/inflation/cpi.ts` `monthlyChain` gives the same numbers (tested).
- `proxyCheck` (how well the proxy tracked the real ETF) only uses months where the proxy came from
  independent index data, not months where the proxy series is itself made from an ETF (e.g.
  `au_shares` from VAS after Dec 2025).

## inflation.json, rates.json, fx.json

```jsonc
{ "asOf": "2026-09", "series": { "au_cpi_q": { "t": ["1948-Q3", ...], "v": [2.59, ...] } }, "info": { "au_cpi_q": "what it is, in words" } }
```

- `asOf` is the newest month any series covers; a quarter counts as its last month ("2026-Q2" =
  Jun 2026), so a monthly series to Sep 2026 gives "2026-09".

- `inflation.json`: `au_cpi_q` (ABS quarterly index), `au_cpi_m` (ABS monthly, Apr 2024 on),
  `us_cpi_m` (US CPI-U monthly, 1871 on). Index levels; inflation = ratio of levels − 1. Australia's
  base is Sep 2025 = 100, the US 1982-84 = 100. Gaps stay gaps here (e.g. US Oct 2025).
- `rates.json`: `cash_target` (RBA decisions, `t` = effective date), `cash_monthly` (% p.a., monthly
  average), `au_bond_5y`, `au_bond_10y`, `us_bond_10y` (% p.a.; see `info` for average vs end of month:
  Australian yields are end of month throughout, US yields are monthly averages before 1962).
  `au_bond_5y` has a published gap (no values May-Aug 2013); it stays a gap here.
- `fx.json`: `audusd_monthly` (US$ per A$1, last business day of each month, from Jul 1969).

## etfs.json

```jsonc
{
  "asOf": "2026-10-18",
  "etfs": [ {
    "id": "VAS", "symbol": "VAS.AX", "market": "asx", "currency": "AUD", "name": "...",
    "mer": { "value": 0.07, "unit": "% p.a.", "note": "...", "checkedOn": "2026-10-18", "source": "https://..." },
    "index": {...}, "yield": {...}, "franking": {...}, "exchange": {...}, "inception": {...},
    "listed": {...},                    // ASX listing date (ASX ETFs), a "fact" like mer
    "distributions": {...}, "allocation": {...}, "duration": {...},     // each a "fact" like mer
    "nameInfo": { "value": "...", "note": "renamed from ...", "checkedOn": "...", "source": "..." },  // the name as a fact
    "proxy": [ ... ]
  } ],
  "indexes": [ { "id": "ASX200", "symbol": "^AXJO", "name": "S&P/ASX 200", "kind": "index", "market": "asx", "currency": "AUD" } ]
}
```

A fact with `"verified": false` is an estimate or from a secondary source: say so in the app.
Edit facts in `pipeline/etf_info/<ID>.json` (with a new `checkedOn` date), not in `data/`.
