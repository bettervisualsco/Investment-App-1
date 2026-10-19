# 22 more ETFs, gold, and a searchable, grouped watchlist (notes)

Built 19 Oct 2026. Nothing committed. The watchlist now has 33 ETFs (11 before + 22 new) and 4
indexes. (The request said 26 ETFs, but the list had 22 tickers; all 22 are added.)

## What was added

All 22 are still listed on the ASX, trade in A$, and are on Yahoo as `<code>.AX` (checked 19 Oct 2026
against the ASX's own company data).

| Group | ETF | Long-run proxy (before its real history) | Warning in `monthly.json` |
|---|---|---|---|
| Global shares | IWLD | developed-world shares (A$) | yes: ESG screens |
| Global shares | BGBL | developed-world shares (A$) | |
| Global shares | WXOZ | developed-world shares (A$) | yes: carbon tilt |
| Global shares | VEU | **shares outside the US** (new `intl_shares` series, A$) | yes: mostly developed markets; no data before 1975 |
| Global shares | VTS | US shares (A$) | |
| Global shares | ETHI | developed-world shares (A$) | yes: concentrated ethical fund, rough stand-in |
| Global shares | VESG | developed-world shares (A$) | yes: ethical screens |
| Global shares | QUAL | developed-world shares (A$) | yes: quality tilt |
| Global shares | MOAT | US shares (A$) | yes: ~40-50 stocks |
| Australian shares | IOZ, STW | Australian shares | |
| Australian shares | VHY | Australian shares (stand-in) | yes: no high-dividend series |
| Australian shares | VAP | Australian shares (stand-in) | yes: no listed-property series; property fell much further in 2007-09 |
| Currency-hedged | VGAD, HGBL | developed-world shares, hedged | |
| Currency-hedged | IHVV | US shares, hedged | |
| Diversified | VDGR | 28% Aus shares, 29.5% world (A$), 12.5% world hedged, 9% Aus bonds, 21% US 10-yr bonds hedged | yes: bonds and small/emerging stand-ins |
| Diversified | VDBA | 20 / 21 / 9 / 15 / 35 (same parts) | yes |
| Diversified | VDCO | 12 / 12.5 / 5.5 / 18 / 42, plus 10% Australian cash | yes |
| Bonds | VBND | US 10-year Treasuries, hedged (stand-in for global aggregate bonds) | yes |
| Bonds | IAF | Australian bonds | |
| Gold | GOLD | **gold** (new series: World Bank monthly gold price, A$) | yes: monthly averages |

The diversified weights are Vanguard's strategic allocations from the 30 Sep 2026 fact sheets (same
as the 1 Sep 2026 PDS); a test checks the proxy weights add up to each fund's published allocation.
How well each proxy tracked the real ETF (correlation and yearly growth over the overlap) is in
DATA_SOURCES.md section 3 and in `monthly.json` (`proxyCheck`). Weakest: GOLD 0.63 (monthly
averages), VBND 0.81, MOAT 0.82, VAP 0.83, ETHI 0.87, QUAL 0.88, VDCO 0.90.

Every ETF (old and new) now has a `category` ("Australian shares", "Global shares", "Currency-hedged",
"Diversified", "Bonds", "Gold", "US-listed") in `pipeline/tickers.json`, copied into `data/etfs.json`
and typed as `EtfInfo.category?: string` in `src/data/types.ts`. IVV and NDQ are "Global shares"
(overseas shares listed on the ASX); VOO, VTI, QQQ are "US-listed".

## Decisions

- **Gold:** added a `gold` series (US$) from the **World Bank Commodity Price Data ("Pink Sheet")**,
  free under CC BY 4.0: monthly average gold price 1960-2026, frozen in
  `pipeline/static/worldbank_gold_monthly.csv` by `python pipeline/run.py build-static` (the
  spreadsheet's address changes monthly, so it's found on the World Bank's Commodity Markets page).
  Used from April 1968 (the free market price; before that gold was held near US$35), converted to A$
  like other US$ series, then GOLD's own prices once the frozen copy ends. It's a monthly *average*,
  so it smooths the moves (about 10% less bumpy than GOLD's real month-end prices) and matches month
  by month only loosely, but long-run growth matched (9.8% vs 9.3% a year, 2008-2026). No free
  month-end gold source exists (FRED dropped LBMA gold in 2022; the Bundesbank's series stop in 1998).
- **VEU:** the request suggested developed-world shares, but those are ~70% US, and the US beat the
  rest by a wide margin: that proxy tracked VEU at 0.86 with 14.5% a year vs VEU's real 10.7%. The
  French data already cached has an "outside the US" index from 1975, so a new `intl_shares` series
  uses it (0.93 correlation, 11.3% vs 10.5%). Easy to switch back in `pipeline/tickers.json` if you
  prefer.
- **Hedged parts now earn the interest-rate gap.** A hedged part's monthly return is its own-currency
  return × (1 + Australian cash rate) / (1 + US cash rate) − 1, which is what a currency hedge (a
  rolling forward contract) earns or costs. Before, hedged parts ignored it, which understated hedged
  returns by about 3% a year in 1975-2008 (Australian rates were much higher). This also changes
  **VDHG**'s proxy months (its 16% hedged shares and 7% hedged bonds): its proxy check moves from
  9.9% to 9.8% a year vs 9.7% real. Hedged ETFs' monthly history now starts in 1969-06 (when
  `cash_au` starts) instead of 1871.
- **Distribution fixes:** `pipeline/static/corrections.json` now also has `distributions`: the
  issuer's amount for an ex-date where Yahoo is missing it, has an early estimate more than 1% off, or
  has one the issuer never paid (amount 0). The adjusted closes before the ex-date are rescaled the
  way Yahoo builds them, after every download. Applied to VGAD, BGBL, IWLD, IAF (4), VDBA, VDCO, VHY,
  VAP, and two older ETFs: VGS (Jul 2026 estimate 2% low, documented before as "not corrected") and
  VDHG (a 2020 distribution Vanguard never paid).
- **Close fixes** (from the issuers' NAV histories, used as a stand-in where no independent close
  exists, with how close NAV and close normally are): IHVV (16 frozen days in Dec 2022 around its
  10-for-1 split, plus one bad day in Mar 2020), GOLD (5 frozen days after its Jun 2022 split, one bad
  day in 2013), STW (4 bad days in 2009), IOZ (2), WXOZ (1), QUAL (1), VEU (1, estimated from the NYSE
  close and the RBA rate).
- **Checked flat runs:** the no-trade days in thinly traded new funds (VTS 2009, MOAT and IHVV
  2014-15, VDCO and VBND 2017-18, ETHI 2017) and DHHF's two 2020 runs (which `meta.json` had flagged:
  no trades those days) are in `checkedFlatRuns`, so the stuck-price check stops reporting them.
- **`trFrom` override:** `"trFrom": "listing"` in `pipeline/tickers.json` says the issuer confirmed
  Yahoo's distribution records are complete from listing (VGAD paid nothing until Jul 2016, so the
  guess from the first record would have thrown away 19 months of real history).
- **Distribution frequency words** are normalised to "quarterly", "twice a year", "yearly" or "none"
  (the Planner's `frequencyOf` in `src/predict/etfFacts.ts` reads them; "semi-annual" would have been
  read as yearly).
- **Polite request rate:** a 0.4 s pause between Yahoo requests (daily and intraday). Timed locally:
  the ASX daily job (30 ETFs + 2 indexes + AUD/USD, full histories) takes ~45 s, the ASX intraday job
  ~25 s. The workflow's 20-minute limit is far away; no workflow change was needed.
- **Sizes:** `data/daily` grows from ~1.4 MB to ~2.4 MB (0.73 MB gzipped); `etfs.json` 22 → 84 KB
  (12 KB gzipped, mostly the checked notes); `monthly.json` 118 → 213 KB (82 KB gzipped). A first
  install downloads about 0.9 MB compressed. Daily commits only append a row per file, which git
  stores as small deltas.

## Markets tab

- **Search** (by code, name words or group; e.g. "vas", "s&p hedged", "bond", "gold"): one list of
  matches, favourites first, then exact/starting codes. Escape clears it; "No ETFs match" when empty.
- **Groups**: Favourites first, then Australian shares, Global shares, Currency-hedged, Diversified,
  Bonds, Gold, US-listed, each with a count; tap a group heading to fold it (remembered). A "Group by
  type" switch turns groups off (remembered; `grouped` and `collapsed` in the `markets-prefs-v1` store).
- Sort and favourites work as before inside each group. **Reorder** now moves an ETF next to the one
  shown above/below it in its group without shuffling the ETFs in between (`moveIdNextTo` in
  `prefs.ts`); hidden while searching. On phones the sparkline hides while reordering so the ↑ ↓
  buttons fit.
- **Compare**'s picker is grouped the same way, plus "Indexes and AUD/USD".
- ETF pages, prediction lines and key facts checked for GOLD, IHVV, HGBL, VEU, VTS, VDCO, VBND (no
  console errors). Checked in the browser at 375 px and 1280 px, light and dark.
- Logic in `src/markets/watchlist.ts` (pure, tested in `watchlist.test.ts`).

## Limitations (documented in DATA_SOURCES.md)

- **STW and GOLD history on Yahoo starts in 2008** (they listed in 2001 and 2003); earlier months use
  the proxy.
- **No distribution records on Yahoo before 2013** for VEU, VTS, IOZ, STW, VHY, VAP (as for VAS):
  `trFrom` marks it and the proxy is used before.
- **VTS's 28 Sep 2026 distribution wasn't on Yahoo yet** (19 Oct). Its A$ amount is set when it's paid
  (26 Oct); Yahoo normally adds it then. Not corrected, because the A$ amount isn't published yet.
- A few closes for QUAL/MOAT differ from VanEck's "last traded price" by up to 2% (closing auction vs
  last trade; can't tell which is right); left as Yahoo has them.
- IHVV, GOLD, STW, IOZ, WXOZ, QUAL fixes use the issuer's NAV as a stand-in close, not a real ASX
  close (no free source of historical ASX closes that doesn't block automated access was found).
- VAP and VHY have no proxy of their own; VBND's proxy (US 10-year Treasuries) swings more than
  global aggregate bonds.

## Tests

- Pipeline: 84 pass (70 before + 14 new in `pipeline/tests/test_etfs_added.py`: every ETF
  has a category, valid proxy and checked facts; diversified weights = published allocations;
  unknown categories/series refused; etfs.json carries the category; gold file complete and spot
  values right; gold series splice; Pink Sheet parsing (skipped where openpyxl isn't installed);
  distribution add/replace/remove/step-aside; corrections file well-formed; `trFrom` override;
  hedged return).
- App: 11 new in `src/markets/watchlist.test.ts` (search, ranking, groups, favourites first,
  ungrouped view, unknown category, every ticker has a known group, moving within a group).
  `npm test`: 355 tests; with my locally rebuilt data 354 pass and the one in `src/data/data.test.ts`
  fails as explained below (it passes with the committed data). `npm run lint` and `npm run build` pass.

## What the coordinating session must do

1. **Update `src/data/data.test.ts` before the next code push after the robot rebuilds the data.** Its
   test "each ETF uses its real history from realFrom, and a fee-adjusted proxy before" requires every
   proxy correlation > 0.9; with the new ETFs these are lower: GOLD 0.63, VBND 0.81, MOAT 0.82, VAP
   0.83, ETHI 0.87, QUAL 0.88, VDCO 0.898. All of them have a `warning`, so suggested change (line 76):
   `if (e.proxyCheck) expect(e.proxyCheck.correlation as number, id).toBeGreaterThan(e.warning ? 0.6 : 0.9)`.
   (With the current committed data it still passes; it fails once `data/monthly.json` has the new ETFs.)
2. **Optional type update in `src/data/types.ts`**: add `'intl_shares' | 'gold'` to `AssetSeriesKey`
   (the file now has those series; nothing breaks without it). `MonthlyEtf.warning` already exists:
   the Planner/Markets could show it next to predictions for stand-in proxies.
3. **Planner investment picker:** `EtfInfo.category` can group its ETF list the same way
   (`CATEGORY_ORDER` and `categoryOf()` are exported from `src/markets/watchlist.ts`). With 33 ETFs a
   flat list is long.
4. Discard my local `data/` changes as planned; the robot's next run rebuilds everything from the
   pipeline (tested from the committed data: no problems logged). Also discard the extra entry I added
   to `.claude/launch.json` ("etfs-preview", port 5181) if you don't want it.
5. Suggested SPEC.md 3.1 update: the watchlist is 33 ETFs in 7 groups (list them or point to
   `pipeline/tickers.json`), plus "gold" among the long-run series in 3.2.
