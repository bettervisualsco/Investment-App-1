# Data sources

Every number the app shows comes from one of the sources below. All are free and need no account
or key. This file records where each series comes from, what dates it covers, the gaps, and the
terms of use. Checked on **18 October 2026**.

**Important:** all of this is for **personal use**. Some sources (especially Yahoo) only allow
personal use, and the GitHub repo and website are public (see "Terms" below).

---

## 1. Sources at a glance

| Source | What we take | Dates | How often it updates | Terms |
|---|---|---|---|---|
| **Yahoo Finance** via the `yfinance` Python library | Daily close, adjusted close, distributions and splits for every ETF and index in `pipeline/tickers.json`; 5-minute bars during trading hours | Each ETF's Yahoo history (see table 2) | Every ~15 min in market hours; daily closes after each close | Unofficial. Yahoo's data is for **personal use only**; yfinance says it is "intended for research and educational purposes" |
| **ABS Data API** (`data.api.abs.gov.au`, dataflow `CPI`) | Australian CPI, All groups, weighted average of the 8 capital cities, original (not seasonally adjusted) | Quarterly: Sep qtr 1948 to Jun qtr 2026. Monthly: Apr 2024 to Aug 2026 | Checked daily | CC BY 4.0, attribute "Australian Bureau of Statistics" |
| **FRED** (St. Louis Fed) | US CPI-U `CPIAUCNS` (monthly, 1913+); US 10-year Treasury yield `GS10` (monthly average, 1953+) and `DGS10` (daily, 1962+) | 1913-01 to latest | Checked daily | BLS and Federal Reserve data are public domain; FRED asks for a citation |
| **Reserve Bank of Australia** statistical tables (CSV) | Cash rate target decisions (A2), monthly cash/bank-bill rates (F1.1), government bond yields (F2 daily, F2.1), AUD/USD (F11) | 1969 onwards (see section 3) | Checked daily | RBA website material is CC BY 4.0, but **statistical data is "Excluded Material"** with its own terms (use at your own risk, can change without notice). AUD/USD since July 2008 is the WM/Reuters 4pm fix (third-party data). Fine for personal use |
| **Kenneth French Data Library** (Dartmouth) | Monthly total returns: all US stocks (1926+), developed markets (1990+), Australia and an all-country ex-US index (1975+) | US & developed: to Aug 2026. International: to Dec 2025 (updated about once a year) | Checked weekly | Freely published for research and teaching; no formal licence. Cite "Kenneth R. French Data Library" |
| **Robert Shiller's data** (`ie_data.xls`, Yale) | S&P Composite prices and dividends, US CPI and long-term interest rate for **1871 to 1953 only** | 1871-01 to 1953-12 (frozen copy) | Never (frozen in `pipeline/static/`) | Freely published by Prof. Shiller for research |
| **RBA historical spreadsheets** | AUD/USD monthly 1969-2009, bond yields monthly 1969-2013 and daily 1995-2013 | Frozen | Never (frozen in `pipeline/static/`) | As RBA above |

The frozen copies are made by `python pipeline/run.py build-static`. They are small CSV files kept
in git, so the scheduled job never depends on old spreadsheets still being online.

---

## 2. Daily prices (Yahoo) and what we found

| ID | Yahoo symbol | Yahoo history | Notes |
|---|---|---|---|
| VAS | VAS.AX | 2009-05-01 → | **No distributions on Yahoo before Jan 2013.** Total return is only used from 2013 (`trFrom`); earlier months use the proxy |
| VGS | VGS.AX | 2014-11-18 → | |
| IVV | IVV.AX | 2008-01-02 → | ASX listing was Oct 2007 (missing first months). **Yahoo's prices before 4 Jan 2011 weren't adjusted for the Dec 2022 15-for-1 unit split** and 28 Dec 2015 was a bad price: the pipeline repairs both automatically and records it in the file (`repairs`). No distributions before Mar 2013 |
| NDQ | NDQ.AX | 2015-05-26 → | |
| A200 | A200.AX | 2018-05-07 → | |
| VDHG | VDHG.AX | 2017-11-20 → | |
| DHHF | DHHF.AX | 2019-12-03 → | Its current all-growth strategy only started 15 Dec 2020 |
| VAF | VAF.AX | 2012-10-29 → | |
| VOO | VOO | 2010-09-09 → | |
| VTI | VTI | 2001-06-15 → | Fund started 24 May 2001 (first 3 weeks missing) |
| QQQ | QQQ | 1999-03-10 → | First dividend Dec 2003 (it genuinely paid none before) |
| ASX200 | ^AXJO | 1992-11-23 → | Price index (no dividends) |
| ALLORDS | ^AORD | 1984-08-03 → | Price index |
| SP500 | ^GSPC | 1927-12-30 → | Price index |
| NDX | ^NDX | 1985-10-01 → | Price index |
| AUDUSD | AUDUSD=X | 2006-05-16 → | Daily. The long monthly history comes from the RBA instead |
| NASDAQCOMP | ^IXIC | 1971-02-05 → | Helper only: used for the tech proxy before 1985 |

Yahoo's "Close" is adjusted for splits; "Adj Close" is also adjusted for distributions, so it
measures total return. Prices are delayed about 15-20 minutes.

**Automatic checks on Yahoo data** (`pipeline/datapipe/prices.py`, `safety.py`):
- a one-day spike that comes straight back (3x or more) is dropped;
- a sudden near-whole-number jump that stays (an unrecorded split) rescales the older prices;
- any remaining daily move over +60% / −40% is logged in `meta.json` for a person to check;
- a new download is rejected if it is empty, shorter, older, or rewrites old closes by more than 3%.

---

## 3. Long-run monthly series (for Prediction mode)

All in `data/monthly.json`, lined up by calendar month (see docs/DATA_FORMAT.md).

| Series | Currency | From | Built from |
|---|---|---|---|
| `us_shares` | USD | 1871-02 | Shiller S&P Composite (price + dividends) to Jun 1926 → French all-US-stocks Jul 1926 to Aug 2026 → VTI after |
| `global_shares` | USD | 1871-02 | **Stand-in: US shares only** to 1974 → rough 50% US + 50% French all-country ex-US index 1975 to Jun 1990 → French developed markets Jul 1990 to Aug 2026 → VGS (converted to US$) after |
| `au_shares` | AUD | 1975-01 | French "Australia" market portfolio in A$ (dividends included; MSCI data before 2007) to Dec 2025 → VAS after |
| `us_tech` | USD | 1971-03 | Nasdaq Composite price index to Oct 1985 → Nasdaq-100 price index, **plus an assumed 0.7% a year dividend** |
| `au_bonds` | AUD | 1969-08 | Worked out from RBA government bond yields: 85% 5-year + 15% 10-year (gives about VAF's 4.8-year duration). 10-year only before 1972 |
| `us_bonds` | USD | 1871-02 | Worked out from the US 10-year yield (Shiller → FRED GS10 → FRED DGS10) |
| `cash_au` | AUD | 1969-06 | RBA: 3-month bank bills to Apr 1976, interbank cash rate to Jul 1990, cash rate target after (monthly average ÷ 12) |
| `cash_us` | USD | 1926-07 | 1-month US Treasury bills (French library) |
| `au_cpi` | — | 1948-10 | ABS quarterly CPI (each quarter's rise spread evenly over its 3 months) to Apr 2024 → ABS monthly CPI from May 2024 |
| `us_cpi` | — | 1871-02 | Shiller to 1912 → BLS CPI-U from 1913 |
| `audusd` | — | 1969-08 | RBA end-of-month AUD/USD |

**Bond returns** are calculated the standard way (as Shiller does): buy a bond at par at the start
of the month, earn the coupon, and revalue it at the end-of-month yield.

### Gaps and approximations (read these)
- **No free monthly Australian share data before 1975**, and no AUD/USD before July 1969. Prediction
  mode's "full history" for Australian ETFs therefore starts in 1975 (the months where every core
  series exists: `allSeriesFrom` = 1975-01).
- **Global shares before 1990 are rough**: US-only before 1975, a fixed 50/50 mix 1975-1990.
- **Shiller's prices (before 1926) are monthly averages**, which smooths out short-term swings a little.
- **Bond yields before 1995 (Australia) and before 1962 (US) are monthly averages** (no daily data
  exists in these free sources). After that we use true end-of-month yields.
- **Australian bonds are government bonds only.** VAF also holds semi-government and some corporate
  bonds, which pay a little more: over 2012-2026 the proxy returned about 1% a year less than VAF.
- **Australian CPI before May 2024 is quarterly**, spread evenly across each quarter's months. The
  ABS started the complete Monthly CPI as the headline measure on 26 Nov 2025 (Oct 2025 data), with
  history back to April 2024; it keeps publishing a quarterly series too. The pipeline reads both.
- **US CPI for October 2025 was never published** (US government shutdown). That month is filled by
  spreading Sep→Nov evenly, and listed in `monthly.json` (`interpolated`).
- **The tech proxy is a price index** plus an assumed dividend yield (QQQ yields about 0.44-0.7%).
- **French international data is updated about once a year** (currently to Dec 2025); the months
  after that come from VAS/VGS. US and developed-market French data are updated monthly.
- **The Shiller file at Yale stopped at Sept 2023** (Prof. Shiller moved his data to shillerdata.com).
  We only use it up to 1953, so this doesn't matter.

### Each ETF's long-run history
Each ETF uses its own real total return from `realFrom`, and its proxy **minus its management fee**
(spread monthly) before that, converted to the ETF's currency with AUD/USD where needed.

| ETF | Proxy | Real data from | Proxy check (overlap, correlation, yearly return real vs proxy) |
|---|---|---|---|
| VAS | 100% au_shares | 2013-01 | 165 months, 0.995, 8.9% vs 9.1% |
| VGS | 100% global_shares (in A$) | 2014-12 | 142 months, 0.94, 13.0% vs 12.6% |
| IVV | 100% us_shares (in A$) | 2013-03 | 163 months, 0.92, 17.8% vs 17.7% |
| NDQ | 100% us_tech (in A$) | 2015-06 | 136 months, 0.94, 19.7% vs 19.6% |
| A200 | 100% au_shares | 2018-06 | 100 months, 0.994, 8.8% vs 8.9% |
| VDHG | 36% au_shares, 38% global (A$), 16% global hedged, 3% au_bonds, 7% us_bonds hedged | 2017-12 | 106 months, 0.97, 9.5% vs 9.7% |
| DHHF | 37% au_shares, 63% global (A$) | 2020-01 | 81 months, 0.97, 10.6% vs 11.2% |
| VAF | 100% au_bonds | 2012-11 | 167 months, 0.955, 2.4% vs 1.4% |
| VOO | 100% us_shares | 2010-10 | 192 months, 0.995, 14.6% vs 14.5% |
| VTI | 100% us_shares | 2001-07 | 303 months, 0.999, 9.7% vs 9.8% |
| QQQ | 100% us_tech | 1999-04 | 330 months, 0.999, 10.8% vs 10.8% |

The ASX-listed ETFs of US/global shares show lower correlation (0.92-0.94) mainly because the ASX
closes before New York opens, so month-end prices are taken about 15 hours apart; the long-run
averages still line up well. These checks are recalculated on every run (`proxyCheck` in `monthly.json`).
VDHG's small-company and emerging-market parts use `global_shares` as a stand-in, and hedged parts
use the underlying return without the currency move (ignoring the small interest-rate difference).

---

## 4. ETF facts (`pipeline/etf_info/*.json`)

Fee, yield, franking, exchange, inception and (for VDHG/DHHF) asset allocation, each with the date
checked and the source link: mostly the issuer's own fact sheet or data feed (Vanguard, BlackRock,
Betashares, Invesco). Values marked `"verified": false` couldn't be confirmed from the issuer:
VDHG franking (our estimate ~24%), DHHF franking (not published), QQQ yield/exchange/frequency
(secondary source; Invesco's site blocks automated reading), IVV/NDQ franking (not stated; nil
expected for US shares). Recent changes noticed: VAS fee is now 0.07% (was 0.10%); QQQ is 0.18%
(was 0.20%, since Dec 2025); VTI was renamed "Vanguard Morningstar Total Stock Market ETF" (Jul 2026).

---

## 5. If Yahoo / yfinance breaks (fallback plan)

1. **Automatic backup route (built in):** if the yfinance library fails, the pipeline calls Yahoo's
   chart endpoint directly (same data, independent of the library). `meta.json` notes when this happens.
2. **Safety net (built in):** if both fail, nothing is overwritten; the app keeps showing the last good
   prices with their "as of" time and a staleness warning, and `meta.json` records the errors.
3. **Exchange rates and long-run data don't depend on Yahoo** (RBA, ABS, FRED, French), so Prediction
   mode keeps working on its monthly data.
4. **If Yahoo stops working for good**, the free no-account options have run out: Stooq (a common
   alternative) now blocks automated downloads with a bot check (checked 18 Oct 2026), and we won't try
   to get around that. The next options all need a **free account and key** (ask Soham first):
   - **Alpha Vantage** (free tier ~25 requests a day: enough for daily closes of ~11 ETFs, not intraday),
   - **EODHD** (free tier 20 requests a day, includes ASX),
   - **Twelve Data** (free tier 800 a day; ASX coverage needs checking).
   These would slot in as a third route in `pipeline/datapipe/sources/yahoo.py`'s `daily()`.

---

## 6. Terms of use (plain English)

- **Yahoo (via yfinance):** personal use only. The SPEC's plan stores these prices in a **public**
  GitHub repo and website (needed for free hosting), which technically makes the files publicly
  downloadable. In practice the risk is low for a small personal project, but Soham should know.
  The free way to reduce it would be keeping only recent prices public; the paid way is a private
  repo with GitHub Pages (needs GitHub Pro, about US$4/month), which is **not** being used.
- **ABS:** CC BY 4.0, free to reuse with attribution.
- **RBA:** statistical data is free to use but provided as-is; AUD/USD since 2008 is WM/Reuters data.
- **FRED / BLS:** public domain US government data.
- **Kenneth French, Shiller:** published free for research and education; cite the source.
