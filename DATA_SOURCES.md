# Data sources

Every number the app shows comes from one of the sources below. All are free and need no account
or key. This file records where each series comes from, what dates it covers, the gaps, and the
terms of use. Checked on **18 October 2026** (22 more ETFs, gold and the "outside the US" series
added and checked **19 October 2026**, see notes/etfs-added.md).

**Important:** all of this is for **personal use**. Some sources (especially Yahoo) only allow
personal use, and the GitHub repo and website are public (see "Terms" below).

---

## 1. Sources at a glance

| Source | What we take | Dates | How often it updates | Terms |
|---|---|---|---|---|
| **Yahoo Finance** via the `yfinance` Python library | Daily close, adjusted close, distributions and splits for every ETF and index in `pipeline/tickers.json`; 5-minute bars during trading hours | Each ETF's Yahoo history (see table 2) | Every ~15 min in market hours; daily closes after each close | Unofficial. Yahoo's data is for **personal use only**; yfinance says it is "intended for research and educational purposes" |
| **ABS Data API** (`data.api.abs.gov.au`, dataflow `CPI`) | Australian CPI, All groups, weighted average of the 8 capital cities, original (not seasonally adjusted) | Quarterly: Sep qtr 1948 to Jun qtr 2026. Monthly: Apr 2024 to Aug 2026 | Checked daily | CC BY 4.0, attribute "Australian Bureau of Statistics" |
| **FRED** (St. Louis Fed) | US CPI-U `CPIAUCNS` (monthly, 1913+); US 10-year Treasury yield `GS10` (monthly average, 1953+) and `DGS10` (daily, 1962+) | 1913-01 to latest | Checked daily | BLS and Federal Reserve data are public domain; FRED asks for a citation |
| **Reserve Bank of Australia** statistical tables (CSV) | Cash rate target decisions (A2), monthly cash/bank-bill rates (F1.1), government bond yields (F2 daily, F2.1), AUD/USD month-end (F11) and daily (F11.1) | 1969 onwards (see section 3) | Checked daily | RBA website material is CC BY 4.0, but **statistical data is "Excluded Material"** with its own terms (use at your own risk, can change without notice). AUD/USD since July 2008 is the WM/Reuters 4pm fix (third-party data). Fine for personal use |
| **Kenneth French Data Library** (Dartmouth) | Monthly total returns: all US stocks (1926+), developed markets (1990+), Australia and an all-country ex-US index (1975+) | US & developed: to Aug 2026. International: to Dec 2025 (updated about once a year) | Checked weekly | Freely published for research and teaching; no formal licence. Cite "Kenneth R. French Data Library" |
| **Robert Shiller's data** (`ie_data.xls`, Yale) | S&P Composite prices and dividends, US CPI and long-term interest rate for **1871 to 1953 only** | 1871-01 to 1953-12 (frozen copy) | Never (frozen in `pipeline/static/`) | Freely published by Prof. Shiller for research |
| **World Bank Commodity Price Data ("Pink Sheet")** | Gold price, US$ per troy ounce, monthly average of daily prices (London afternoon fixing; spot from June 2025), for the long-run `gold` series | 1960-01 to 2026-09 (frozen copy; used from 1968-04) | Never (frozen in `pipeline/static/worldbank_gold_monthly.csv`; rebuild with `build-static` to extend) | CC BY 4.0 (World Bank datasets), attribute "World Bank Commodity Price Data (The Pink Sheet)" |
| **Issuers' own data files** (Vanguard, BlackRock, Betashares, VanEck, State Street, Global X) | Not read by the scheduled job. Used once, by hand, to check Yahoo's closes and distributions and to write the fixes in `pipeline/static/corrections.json` (NAV histories, distribution histories, VanEck's "last traded price") | Each fund's whole history | Checked 19 Oct 2026 | Published for investors; a handful of figures are quoted with their source |
| **RBA historical spreadsheets** | AUD/USD monthly 1969-2009 and daily 2003-2022, bond yields monthly 1969-2013 and daily 1995-2013 | Frozen | Never (frozen in `pipeline/static/`) | As RBA above |

The frozen copies are made by `python pipeline/run.py build-static`. They are small CSV files kept
in git, so the scheduled job never depends on old spreadsheets still being online.

---

## 2. Daily prices (Yahoo) and what we found

| ID | Yahoo symbol | Yahoo history | Notes |
|---|---|---|---|
| VAS | VAS.AX | 2009-05-08 → | **No distributions on Yahoo before Jan 2013.** Total return is only used from 2013 (`trFrom`); earlier months use the proxy |
| VGS | VGS.AX | 2014-11-20 → | |
| IVV | IVV.AX | 2008-01-02 → | ASX listing was Oct 2007 (missing first months). **Yahoo's prices before 4 Jan 2011 weren't adjusted for the Dec 2022 15-for-1 unit split** and 28 Dec 2015 was a bad price: the pipeline repairs both automatically and records it in the file (`repairs`). **Yahoo's close is stuck at 39.35 from 7 Dec 2022 to 3 Jan 2023** (it missed the deferred-settlement trading, code IVVDB, around the split): the 16 wrong closes are replaced from an independent source (`pipeline/static/corrections.json`). No distributions before Mar 2013 |
| NDQ | NDQ.AX | 2015-05-26 → | |
| A200 | A200.AX | 2018-05-08 → | |
| VDHG | VDHG.AX | 2017-11-22 → | |
| DHHF | DHHF.AX | 2019-12-05 → | Its current all-growth strategy only started 15 Dec 2020. Two stretches in 2020 where the close doesn't move for 5-6 days (Sep and Oct-Nov 2020) are flagged in `meta.json` for checking; no free source for 2020 daily prices was found to confirm them |
| VAF | VAF.AX | 2012-10-31 → | |
| VOO | VOO | 2010-09-09 → | |
| VTI | VTI | 2001-06-15 → | Fund started 24 May 2001 (first 3 weeks missing) |
| QQQ | QQQ | 1999-03-10 → | First dividend Dec 2003 (it genuinely paid none before) |
| IWLD | IWLD.AX | 2016-04-28 → | One Yahoo distribution (1 Jul 2016) differs 5% from BlackRock's: corrected |
| BGBL | BGBL.AX | 2023-05-11 → | Yahoo's 1 Jul 2026 distribution is Betashares' early estimate (2% low): corrected |
| WXOZ | WXOZ.AX | 2013-03-19 → | One bad close (18 Feb 2025, 53.50 between 50.45 and 50.69): corrected from State Street's NAV. Thinly traded |
| VEU | VEU.AX | 2009-05-08 → | US-domiciled Vanguard fund, ASX CDIs priced in A$; Yahoo's distributions are the A$ amounts. **No distributions on Yahoo before Mar 2013** (`trFrom`). One bad close (4 Oct 2011, 45.86): replaced with an estimate from the NYSE close and the RBA rate |
| VTS | VTS.AX | 2009-05-08 → | As VEU (US-domiciled; no distributions before Mar 2013). **Yahoo didn't have VTS's 28 Sep 2026 distribution yet on 19 Oct 2026** (US$0.9555 a unit, about A$1.35; the A$ amount is set at the payment date, 26 Oct): Yahoo normally adds it once paid; total return is about 0.25% too low until then |
| ETHI | ETHI.AX | 2017-01-09 → | |
| VESG | VESG.AX | 2018-09-13 → | |
| QUAL | QUAL.AX | 2014-10-31 → | One bad close (1 Dec 2016): corrected. Closes match VanEck's published last traded price within 0.5% on 99.7% of days since 2017 |
| MOAT | MOAT.AX | 2015-06-26 → | Pays one large distribution a year (e.g. $11.61 in Jul 2026), so the price drops 7-9% each 1 July. Closes match VanEck's last traded price within 0.5% on 98.7% of days since 2017 (the rest are closing-auction vs last-trade differences, up to 2.2%) |
| IOZ | IOZ.AX | 2010-12-09 → | No distributions on Yahoo before Apr 2013 (`trFrom`). Two bad closes (10 Feb 2012, 13 Dec 2013): corrected from BlackRock's NAV |
| STW | STW.AX | 2008-01-02 → | **Yahoo starts in 2008**; STW listed 27 Aug 2001 (Australia's first ETF), so 2001-2007 are missing. No distributions before Jun 2013 (`trFrom`). Four bad closes in 2009: corrected from State Street's NAV |
| VHY | VHY.AX | 2011-05-26 → | No distributions before 2013 (`trFrom`) |
| VAP | VAP.AX | 2010-10-15 → | No distributions before 2013 (`trFrom`). Its big March 2020 swings (−17% in a day) are real (the A-REIT index moved the same way) |
| VGAD | VGAD.AX | 2014-11-20 → | Paid nothing until Jul 2016 (Vanguard's records), so total return is complete from listing (`trFrom` set in tickers.json). Yahoo's 1 Jul 2026 distribution was an early estimate 20% too low: corrected |
| IHVV | IHVV.AX | 2014-12-18 → | **Yahoo's close is stuck at 37.43 (no volume) from 8 Dec 2022 to 3 Jan 2023**, around its 10-for-1 unit split (like IVV): the 16 closes are replaced with BlackRock's NAV for the day before (the best stand-in: ASX closes are typically within 0.4% of it). One bad close on 17 Mar 2020 (35.25) also replaced. Pays once a year |
| HGBL | HGBL.AX | 2023-05-18 → | |
| VDGR | VDGR.AX | 2017-11-22 → | |
| VDBA | VDBA.AX | 2017-11-22 → | A tiny distribution Vanguard never paid (8 Dec 2020) is removed |
| VDCO | VDCO.AX | 2017-11-22 → | Thinly traded at first: several runs of identical closes in 2017-2018 are days with no trades (checked) |
| VBND | VBND.AX | 2017-10-12 → | As VDCO (no-trade days in 2017-2018) |
| IAF | IAF.AX | 2012-03-14 → | Yahoo was missing its Jul and Dec 2012 distributions, dated one 8 days early (Oct 2020) and had one BlackRock never paid (Feb 2022): all corrected, so total return is complete from listing |
| GOLD | GOLD.AX | 2008-01-02 → | Physical gold (Global X); **no distributions**, so price = total return. **Yahoo starts in 2008** (listed 28 Mar 2003). Yahoo's prices before 2011 weren't adjusted for the Jun 2022 10-for-1 split (repaired automatically). Its close is stuck at 24.07 (no volume) 10-17 Jun 2022, just after that split: replaced with Global X's NAV. One bad close (10 Jul 2013) replaced |
| ASX200 | ^AXJO | 1992-11-23 → | Price index (no dividends) |
| ALLORDS | ^AORD | 1984-08-03 → | Price index |
| SP500 | ^GSPC | 1927-12-30 → | Price index |
| NDX | ^NDX | 1985-10-01 → | Price index |
| AUDUSD | RBA (F11.1) | 2003-01-02 → | **Daily AUD/USD comes from the RBA** (official 4pm Sydney rate; WM/Reuters since 2008), not Yahoo: Yahoo's daily FX closes differed from the RBA's by about 0.2% on a typical day (2% or more on a few days) and could include a weekend row. Yahoo (`AUDUSD=X`) is used only for the newest weekdays the RBA hasn't published yet; those rows are approximate and marked (`approxFrom`). The long monthly history (`fx.json`) is RBA too |
| NASDAQCOMP | ^IXIC | 1971-02-05 → | Helper only: used for the tech proxy before 1985 |

Yahoo's "Close" is adjusted for splits; "Adj Close" is also adjusted for distributions, so it
measures total return. Prices are delayed about 15-20 minutes. ASX ETF histories start on the ASX
listing day (from the ASX's company listing, recorded as `listed` in `pipeline/etf_info`): Yahoo has a
few placeholder rows (often 50.00) before some of them listed, which are dropped.

**Known Yahoo limitation:** for some end-of-financial-year (June) distributions Yahoo keeps the
issuer's early estimate instead of the final amount. Differences over 1% are now corrected in
`pipeline/static/corrections.json` (`distributions`): VGS ex 1 Jul 2026 (Yahoo 0.799838, Vanguard's
final 0.815432), VGAD (2.337 vs 2.935), BGBL (0.5949 vs 0.6073). Smaller ones are left as Yahoo has
them (a few hundredths of a percent of total return in that year): VAS 0.489963 vs 0.48829897; DHHF
0.213373 vs 0.21268; A200 0.98188 vs 0.98102; IVV ex 28 Mar 2025 0.160375 vs 0.1601609; VDGR, VDBA,
VDCO, VHY, ETHI and VESG (Jul 2026, 0.1-0.8%). Yahoo also has a few tiny distributions the issuers
never paid (VDHG 2 Nov 2020, VDBA 8 Dec 2020, VDCO/VHY/VAP 9 Nov 2020, IAF 18 Feb 2022): removed.

**How the new ETFs were checked (19 Oct 2026):** every ASX listing date from the ASX; the latest close
of each against the ASX's own last price; every close against the issuer's daily NAV where one is
published (BlackRock, State Street, Betashares, VanEck, Global X: Yahoo's closes are typically within
0.05% of NAV for the Australian-share funds and within 0.2-0.5% for overseas funds, whose NAV is struck
at a different time), VanEck's published last traded prices (QUAL, MOAT), every distribution against
the issuer's full history (Vanguard, BlackRock, Betashares) or the latest four (VanEck, State Street),
a scan for one-day spikes that come straight back, and the stuck-price check. What was wrong is
corrected in `pipeline/static/corrections.json`, each with its source; runs of identical closes that
are genuine no-trade days are listed there under `checkedFlatRuns` (including DHHF's two 2020 runs:
no trades on those days).

**Automatic checks on Yahoo data** (`pipeline/datapipe/prices.py`, `safety.py`):
- a one-day spike that comes straight back (3x or more) is dropped;
- a sudden near-whole-number jump that stays (an unrecorded split) rescales the older prices;
- any remaining daily move over +60% / −40% is logged in `meta.json` for a person to check;
- an ETF close stuck at the same value for 5+ trading days while its market's index (ASX 200 or
  S&P 500) moves is logged in `meta.json` once, for a person to check;
- checked fixes in `pipeline/static/corrections.json` (each with the right close, the wrong value it
  replaces, its source and the date checked) are re-applied after every download, so a new Yahoo
  download can't undo them; the adjusted close is scaled by the same ratio. If Yahoo's value has
  changed since (e.g. Yahoo fixed it, or a later split rescaled it), the fix is skipped and reported;
- a new download is rejected if it is empty, shorter, older, or rewrites old closes by more than 3%.

---

## 3. Long-run monthly series (for Prediction mode)

All in `data/monthly.json`, lined up by calendar month (see docs/DATA_FORMAT.md).

| Series | Currency | From | Built from |
|---|---|---|---|
| `us_shares` | USD | 1871-02 | Shiller S&P Composite (price + dividends) to Jun 1926 → French all-US-stocks Jul 1926 to Aug 2026 → VTI (Vanguard Morningstar Total Stock Market ETF) after |
| `global_shares` | USD | 1871-02 | **Stand-in: US shares only** to 1974 → rough 50% US + 50% French all-country ex-US index 1975 to Jun 1990 → French developed markets Jul 1990 to Aug 2026 → VGS (converted to US$) after |
| `au_shares` | AUD | 1975-01 | French "Australia" market portfolio in A$ (dividends included; MSCI data before 2007) to Dec 2025 → VAS after |
| `us_tech` | USD | 1971-03 | Nasdaq Composite price index to Oct 1985 → Nasdaq-100 price index, **plus an assumed 0.7% a year dividend** |
| `intl_shares` | USD | 1975-01 | French "all countries" international index (the markets outside the US in its data) to Dec 2025 → VEU (converted to US$) after. Used for VEU |
| `gold` | USD | 1968-04 | World Bank monthly average gold price (frozen copy) to Sep 2026 → GOLD (converted to US$) after |
| `au_bonds` | AUD | 1969-08 | Worked out from RBA government bond yields: 85% 5-year + 15% 10-year (gives about VAF's 4.8-year duration). 10-year only before 1972. May-Sep 2013 partly estimated (see gaps) |
| `us_bonds` | USD | 1871-02 | Worked out from the US 10-year yield (Shiller → FRED GS10 → FRED DGS10) |
| `cash_au` | AUD | 1969-06 | RBA: 3-month bank bills to Apr 1976, interbank cash rate to Jul 1990, cash rate target after (monthly average ÷ 12) |
| `cash_us` | USD | 1926-07 | 1-month US Treasury bills (French library) |
| `au_cpi` | — | 1948-09 | ABS quarterly CPI to Mar 2024 (each quarter's index placed at its middle month, months in between growing evenly) → ABS monthly CPI from Apr 2024 |
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
- **US bond yields before 1962 are monthly averages** (no daily data exists in these free sources);
  from 1962 we use true end-of-month yields. **Australian yields are end of month throughout**: before
  1995 the RBA's historical table F2 records the last business day of each month (its notes say so;
  from 1995 that table switches to monthly averages, so we use the last daily value instead).
- **No Australian 5-year yield from 20 May to 23 Sep 2013** (a gap in the RBA's F2 tables), so there are
  no end-of-month 5-year yields for May-Aug 2013. Those four are estimated as the 10-year yield plus the
  5-year/10-year gap, drawn in a straight line between April and September 2013 (the months either
  side). The `au_bonds` returns for May-Sep 2013 use them and are listed in `monthly.json`
  (`interpolated`). `rates.json` keeps the gap as published.
- **Australian bonds are government bonds only.** VAF also holds semi-government and some corporate
  bonds, which pay a little more: over 2012-2026 the proxy returned about 0.8% a year less than VAF.
- **Australian CPI before April 2024 is quarterly.** A quarterly index is the average of its three
  months, so for the monthly series each quarter's index is placed at its middle month (Feb, May, Aug,
  Nov) and the months in between grow evenly (compounded). From April 2024 the monthly CPI is used; its
  first month is measured from the quarterly chain's level for March 2024 (both ABS series use the same
  Sep 2025 = 100 base), so the chain matches the published index exactly: Dec qtr 1992 (41.71) to Aug
  2026 (103.50) is +148.1% both ways. (The app's `monthlyChain` in `src/inflation/cpi.ts` uses the same
  method; a test checks they match month by month.) The ABS started the complete Monthly CPI as the
  headline measure on 26 Nov 2025 (Oct 2025 data), with history back to April 2024; it keeps
  publishing a quarterly series too. The pipeline reads both.
- **US CPI for October 2025 was never published** (US government shutdown). That month is filled by
  spreading Sep→Nov evenly, and listed in `monthly.json` (`interpolated`).
- **The tech proxy is a price index** plus an assumed dividend yield (QQQ yields about 0.44-0.7%).
- **French international data is updated about once a year** (currently to Dec 2025); the months
  after that come from VAS/VGS. US and developed-market French data are updated monthly.
- **Gold** starts in April 1968, when the free London market price began (the London Gold Pool held
  it near US$35 before; the World Bank file goes back to 1960 at that fixed price). The World Bank
  figures are **monthly averages** of daily prices, which smooth the moves: over 2008-2026 they were
  about 10% less bumpy month to month than GOLD's real month-end prices and match them only loosely
  month by month (correlation 0.63), but the long-run growth matched (9.8% a year proxy vs 9.3% real,
  in A$). They are also **whole dollars**, so months before about 1973 (gold under US$100) are rounded
  by up to 1-2%. No free month-end gold price was found: FRED removed the LBMA series in 2022, and the
  Bundesbank's gold series stop in 1998 (DM). Gold pays no income.
- **`intl_shares`** covers mostly developed markets; VEU also holds emerging markets. Over 2013-2025 it
  tracked VEU with correlation 0.93 (10.5% a year real vs 11.3% proxy), far better than developed-world
  shares including the US (0.86; 14.5% a year, because the US did much better than the rest).
- **The Shiller file at Yale stopped at Sept 2023** (Prof. Shiller moved his data to shillerdata.com).
  We only use it up to 1953, so this doesn't matter.

### Each ETF's long-run history
Each ETF uses its own real total return from `realFrom`, and its proxy **minus its management fee**
(spread monthly) before that, converted to the ETF's currency with AUD/USD where needed.

| ETF | Proxy | Real data from | Proxy check (overlap, correlation, yearly return real vs proxy) |
|---|---|---|---|
| VAS | 100% au_shares | 2013-01 | 156 months to Dec 2025, 0.995, 9.2% vs 9.4% |
| VGS | 100% global_shares (in A$) | 2014-12 | 141 months to Aug 2026, 0.94, 12.9% vs 12.5% |
| IVV | 100% us_shares (in A$) | 2013-03 | 162 months to Aug 2026, 0.93, 17.6% vs 17.7% |
| NDQ | 100% us_tech (in A$) | 2015-06 | 136 months to Sep 2026, 0.94, 19.7% vs 19.6% |
| A200 | 100% au_shares | 2018-06 | 91 months to Dec 2025, 0.994, 9.2% vs 9.3% |
| VDHG | 36% au_shares, 38% global (A$), 16% global hedged, 3% au_bonds, 7% us_bonds hedged | 2017-12 | 97 months to Dec 2025, 0.97, 9.7% vs 9.8% |
| DHHF | 37% au_shares, 63% global (A$) | 2020-01 | 72 months to Dec 2025, 0.97, 10.8% vs 11.6% |
| VAF | 100% au_bonds | 2012-11 | 167 months to Sep 2026, 0.97, 2.4% vs 1.6% |
| VOO | 100% us_shares | 2010-10 | 191 months to Aug 2026, 0.995, 14.7% vs 14.6% |
| VTI | 100% us_shares | 2001-07 | 302 months to Aug 2026, 0.999, 9.7% vs 9.8% |
| QQQ | 100% us_tech | 1999-04 | 330 months to Sep 2026, 0.999, 10.8% vs 10.8% |
| IWLD | 100% global_shares (A$) | 2016-05 | 124 months to Aug 2026, 0.92, 14.1% vs 13.3% (ESG screens) |
| BGBL | 100% global_shares (A$) | 2023-06 | 39 months to Aug 2026, 0.93, 17.6% vs 16.7% (short) |
| WXOZ | 100% global_shares (A$) | 2013-04 | 161 months to Aug 2026, 0.94, 14.4% vs 14.5% |
| VEU | 100% intl_shares (A$) | 2013-03 | 154 months to Dec 2025, 0.93, 10.5% vs 11.3% |
| VTS | 100% us_shares (A$) | 2013-03 | 162 months to Aug 2026, 0.94, 17.3% vs 17.7% |
| ETHI | 100% global_shares (A$) | 2017-02 | 115 months to Aug 2026, 0.87, 16.1% vs 12.7% (rough stand-in: concentrated ethical fund) |
| VESG | 100% global_shares (A$) | 2018-10 | 95 months to Aug 2026, 0.90, 13.4% vs 12.0% (ethical screens) |
| QUAL | 100% global_shares (A$) | 2014-11 | 142 months to Aug 2026, 0.88, 14.9% vs 12.6% (quality tilt) |
| MOAT | 100% us_shares (A$) | 2015-07 | 134 months to Aug 2026, 0.82, 14.5% vs 14.3% (concentrated, ~40-50 stocks) |
| IOZ | 100% au_shares | 2013-04 | 153 months to Dec 2025, 0.99, 8.6% vs 8.9% |
| STW | 100% au_shares | 2013-06 | 151 months to Dec 2025, 0.99, 8.9% vs 9.1% |
| VHY | 100% au_shares (stand-in) | 2013-01 | 156 months to Dec 2025, 0.95, 9.2% vs 9.2% (high-dividend shares: no own series) |
| VAP | 100% au_shares (stand-in) | 2013-01 | 156 months to Dec 2025, 0.83, 9.6% vs 9.2% (listed property: no own series; tracking error 11% a year) |
| VGAD | 100% global_shares hedged | 2014-12 | 141 months to Aug 2026, 0.94, 11.4% vs 11.0% |
| IHVV | 100% us_shares hedged | 2015-01 | 140 months to Aug 2026, 0.95, 12.2% vs 13.7% |
| HGBL | 100% global_shares hedged | 2023-06 | 39 months to Aug 2026, 0.92, 19.9% vs 19.7% (short) |
| VDGR | 28% au_shares, 29.5% global (A$), 12.5% global hedged, 9% au_bonds, 21% us_bonds hedged | 2017-12 | 97 months to Dec 2025, 0.97, 7.8% vs 7.8% |
| VDBA | 20% au_shares, 21% global (A$), 9% global hedged, 15% au_bonds, 35% us_bonds hedged | 2017-12 | 97 months to Dec 2025, 0.95, 5.9% vs 5.7% |
| VDCO | 12% au_shares, 12.5% global (A$), 5.5% global hedged, 18% au_bonds, 42% us_bonds hedged, 10% cash_au | 2017-12 | 97 months to Dec 2025, 0.90, 4.1% vs 3.8% |
| VBND | 100% us_bonds hedged (stand-in) | 2017-11 | 106 months to Aug 2026, 0.81, 0.9% vs 0.0% |
| IAF | 100% au_bonds | 2012-04 | 174 months to Sep 2026, 0.96, 2.7% vs 2.0% |
| GOLD | 100% gold (A$) | 2008-02 | 224 months to Sep 2026, 0.63, 9.3% vs 9.8% (monthly averages, see gaps) |

**The proxy check only uses months where the proxy comes from independent index data.** Once the
French data runs out, `au_shares` is made from VAS (from Jan 2026), `global_shares` from VGS and
`us_shares` from VTI (from Sep 2026); comparing an ETF with those months would partly compare it with
itself (or a near twin), so they are left out. That is why the Australian checks end in Dec 2025.
The ASX-listed ETFs of US/global shares show lower correlation (0.93-0.94) mainly because the ASX
closes before New York opens, so month-end prices are taken about 15 hours apart; the long-run
averages still line up well. These checks are recalculated on every run (`proxyCheck` in `monthly.json`).
The Vanguard diversified funds' small-company and emerging-market parts use `global_shares` as a
stand-in. **Hedged parts** (VGAD, IHVV, HGBL, and the hedged parts of VDHG/VDGR/VDBA/VDCO/VBND) use the
underlying return in its own currency **plus the gap between the Australian and US cash rates**
(`cash_au` − `cash_us`, month by month): a currency hedge is a rolling forward contract, and forwards
are priced at that gap. (Before 19 Oct 2026 the gap was ignored. It is not small over the long run:
Australian cash rates were about 3% a year above US rates in 1975-2008, which hedged investors
earned; in 2022-2024 it went the other way. Over the real overlap since 2015 the gap was small and the
checks above barely change.) Hedged ETF histories therefore start in mid-1969, when `cash_au` starts.
**International bonds** (VBND, and the hedged international bond part of VDHG 7%, VDGR 21%, VDBA 35%
and VDCO 42%: Vanguard's global aggregate bond fund, which tracks the Bloomberg Global Aggregate index
hedged to A$) are approximated with `us_bonds` (US 10-year Treasuries, hedged), because there is no
free long-run global bond series. Global aggregate bonds are shorter (VBND's duration is about 6 years,
a 10-year Treasury's about 8) and include corporate and non-US government bonds, so this part is
rougher than the rest (VBND: correlation 0.81). **VHY and VAP** use all Australian shares as a
stand-in (no free long-run high-dividend or listed-property series); VAP's tracking error is large
(listed property fell much further in 2007-09). Every ETF whose proxy is only a stand-in has a
plain-English `warning` in `monthly.json` (from `proxyWarning` in `pipeline/tickers.json`).

---

## 4. ETF facts (`pipeline/etf_info/*.json`)

Each ETF's group in the app (`category`: Australian shares, Global shares, Currency-hedged,
Diversified, Bonds, Gold, US-listed) is set in `pipeline/tickers.json` and copied into `data/etfs.json`.

**The 22 ETFs added on 19 Oct 2026** were checked that day on the issuer's site, fact sheet, PDS or data
feed (Vanguard's API, BlackRock's product pages and data downloads, Betashares, VanEck, State Street,
Global X). Values marked `"verified": false`: franking for VDGR (~15%), VDBA (~9%), VDCO (~5%) and VAP
(~10.7%) (worked out from Vanguard's FY2026 tax components, as for VDHG), STW (~65%, from State
Street's per-unit franking credits), and BGBL/HGBL/ETHI/QUAL/MOAT (0%, not stated; overseas shares).
Yields are each issuer's own definition (stated in each note): Vanguard's are trailing 12 months of
cash distributions / NAV (VEU and VTS worked out in US$), BlackRock's "12m Trailing Yield",
Betashares' and VanEck's 12-month distribution yield, State Street's 1-year "Fund Distribution
Return". Several are inflated by one unusually large 2026 payout (VBND 9.6%, VDBA/VDCO 5.5-5.7%,
IHVV 4.0%, MOAT 10%, WXOZ 6.1%; mostly currency-hedging gains or realised capital gains); the notes
say so. Names changed recently: VTS (now "Vanguard Morningstar US Total Market Shares Index ETF"),
STW and WXOZ ("State Street SPDR ..." since 19 Dec 2025; WXOZ is now "Carbon Aware"), IWLD ("iShares
Core MSCI World ex Australia ESG ETF"; was "World All Cap" until June 2021), GOLD ("Global X Physical
Gold Structured"; was ETFS Physical Gold).

Name, fee, yield, franking, exchange, ASX listing date (`listed`, from the ASX's company listing),
inception and (for VDHG/DHHF) asset allocation, each with the date checked and the source link: mostly
the issuer's own fact sheet or data feed (Vanguard, BlackRock, Betashares, Invesco). `data/etfs.json`
copies them, including the name's own note and source (`nameInfo`). Values marked `"verified": false` couldn't be confirmed from the issuer:
VDHG franking (our estimate ~24%), DHHF franking (not published), QQQ yield/exchange/frequency
(secondary source; Invesco's site blocks automated reading), IVV/NDQ franking (not stated; nil
expected for US shares). Recent changes noticed: VAS fee is now 0.07% (was 0.10%); QQQ is 0.18%
(was 0.20%, since Dec 2025); VTI was renamed "Vanguard Morningstar Total Stock Market ETF" (29 Jul
2026); VGS is "Vanguard MSCI International Shares Index ETF" on Vanguard's 30 Sep 2026 fact sheet (was
"Vanguard MSCI Index International Shares ETF", which the ASX company list still showed on 18 Oct
2026). IVV's yield is BlackRock's "12m Trailing Yield" from its fact sheet (1.25% at 30 Sep 2026);
those 12 months happened to include five quarterly distributions, and the latest four come to about
1.0% of the price.

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
   - **Alpha Vantage** (free tier ~25 requests a day: no longer enough for the 33 ETFs' daily closes, and no intraday),
   - **EODHD** (free tier 20 requests a day, includes ASX; also too few for 33 ETFs),
   - **Twelve Data** (free tier 800 a day, enough for daily closes; ASX coverage needs checking).
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
