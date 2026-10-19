"""data/monthly.json: one table of monthly changes, lined up by real calendar month.

Prediction mode picks random blocks of real months. Because every series here is keyed by the
same calendar months, a sampled month carries that month's share returns, bond returns, cash
rate, inflation and AUD/USD move together (e.g. October 1987 or March 2020 for everything).

Each watchlist ETF also gets a long series: its own real monthly total return where it existed,
and before that its long-run proxy (the asset class it tracks, converted to the ETF's currency)
with the ETF's management fee taken off. Everything here is built from files already on disk
(data/*.json, pipeline/cache, pipeline/static), so it never needs the network.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from .config import Ticker
from .safety import daily_dates, save_validated, validate_monthly
from .static_build import read_static
from .util import DATA_DIR, PIPELINE_DIR, add_months, load_json, month_num, month_str

SCALE = 100_000
AU_BOND_W5 = 0.85
TECH_DIVIDEND_YIELD = 0.007  # values are stored as whole numbers: 0.01234 (1.234%) -> 1234
GOLD_STATIC = "worldbank_gold_monthly.csv"  # World Bank Pink Sheet, frozen by static_build.py
# The London Gold Pool held gold at about US$35 until March 1968; the free market price starts in April.
GOLD_FROM = "1968-04"
Series = Dict[str, float]  # "YYYY-MM" -> change during that month, as a fraction


# ---- small helpers ------------------------------------------------------------------


def changes_from_levels(levels: List[Tuple[str, float]]) -> Series:
    """Month-on-month change from a list of (YYYY-MM, level). Skips gaps (needs consecutive months)."""
    out: Series = {}
    for (m0, a), (m1, b) in zip(levels, levels[1:]):
        if month_num(m1) == month_num(m0) + 1 and a > 0:
            out[m1] = b / a - 1
    return out


def fill_gaps(levels: List[Tuple[str, float]], max_gap: int = 3) -> Tuple[List[Tuple[str, float]], List[str]]:
    """Fill short holes in a monthly level series by spreading the change evenly (compounded).
    Example: the US government shutdown meant no US CPI for October 2025."""
    out: List[Tuple[str, float]] = []
    filled: List[str] = []
    for (m0, a), (m1, b) in zip(levels, levels[1:]):
        out.append((m0, a))
        gap = month_num(m1) - month_num(m0)
        if 1 < gap <= max_gap + 1:
            step = (b / a) ** (1 / gap)
            for k in range(1, gap):
                m = month_str(month_num(m0) + k)
                out.append((m, a * step**k))
                filled.append(m)
    out.append(levels[-1])
    return out, filled


def month_end_levels(daily: dict, key: str = "a") -> List[Tuple[str, float]]:
    """Last value in each calendar month from a data/daily file."""
    vals = daily.get(key) or daily["c"]
    last: Dict[str, float] = {}
    for d, v in zip(daily_dates(daily), vals):
        last[d[:7]] = v
    return sorted(last.items())


def complete_months(s: Series, before: str) -> Series:
    """Drop the current (unfinished) month and anything after it."""
    return {m: v for m, v in s.items() if m < before}


def par_bond_return(y0: float, y1: float, years: float = 10.0) -> float:
    """One month's total return on a bond bought at par when the yield was y0 (% p.a.) and
    valued a month later at yield y1, with semi-annual coupons. Same idea Shiller uses for his
    bond return series: the coupon earned plus the change in price."""
    c, y = y0 / 100, y1 / 100
    n = (years - 1 / 12) * 2  # half-year periods left
    if abs(y) < 1e-12:
        price = c / 2 * n + 1
    else:
        price = c / 2 * (1 - (1 + y / 2) ** -n) / (y / 2) + (1 + y / 2) ** -n
    return c / 12 + price - 1


def bond_returns(yields: List[Tuple[str, float]], years: float) -> Series:
    out: Series = {}
    for (m0, a), (m1, b) in zip(yields, yields[1:]):
        if month_num(m1) == month_num(m0) + 1:
            out[m1] = par_bond_return(a, b, years)
    return out


def fill_spread_gaps(short: List[Tuple[str, float]], long: List[Tuple[str, float]], max_gap: int = 12) -> Tuple[List[Tuple[str, float]], List[str]]:
    """Fill holes (up to max_gap months) inside a bond yield series from a longer-maturity yield
    that has those months: yield = long yield + the spread between the two, interpolated in a
    straight line between the last month before the hole and the first month after it.
    Returns (filled series, the months that were estimated)."""
    s, lg = dict(short), dict(long)
    out = dict(s)
    filled: List[str] = []
    months = sorted(s)
    for a, b in zip(months, months[1:]):
        gap = month_num(b) - month_num(a)
        missing = [month_str(month_num(a) + k) for k in range(1, gap)]
        if not missing or len(missing) > max_gap or a not in lg or b not in lg or any(m not in lg for m in missing):
            continue
        sa, sb = s[a] - lg[a], s[b] - lg[b]
        for k, m in enumerate(missing, 1):
            out[m] = lg[m] + sa + (sb - sa) * k / gap
            filled.append(m)
    return sorted(out.items()), filled


def pct_points(points) -> Series:
    return {m: v / 100 for m, v in points}


def to_currency(r: Series, fx_change: Series, src: str, dst: str) -> Series:
    """Convert monthly returns between USD and AUD. fx_change = monthly change in US$ per A$1."""
    if src == dst:
        return dict(r)
    if (src, dst) == ("USD", "AUD"):
        return {m: (1 + v) / (1 + fx_change[m]) - 1 for m, v in r.items() if m in fx_change}
    if (src, dst) == ("AUD", "USD"):
        return {m: (1 + v) * (1 + fx_change[m]) - 1 for m, v in r.items() if m in fx_change}
    raise ValueError(f"can't convert {src} to {dst}")


def splice(*parts: Tuple[Series, Optional[str], Optional[str]]) -> Series:
    """Join pieces: each (series, from_month, to_month) contributes only months in its range."""
    out: Series = {}
    for s, lo, hi in parts:
        for m, v in s.items():
            if (lo is None or m >= lo) and (hi is None or m <= hi) and m not in out:
                out[m] = v
    return dict(sorted(out.items()))


def first_month(s: Series) -> str:
    return min(s)


def last_month(s: Series) -> str:
    return max(s)


def encode(s: Series) -> Tuple[str, List[Optional[int]]]:
    """(start month, list of integers) with None for any gap."""
    start, end = min(s), max(s)
    vals: List[Optional[int]] = []
    for n in range(month_num(start), month_num(end) + 1):
        v = s.get(month_str(n))
        vals.append(None if v is None else int(round(v * SCALE)))
    return start, vals


def proxy_check(real: Series, proxy: Series) -> Optional[dict]:
    """How well the proxy (after fees) tracked the real ETF over months where both exist."""
    common = sorted(set(real) & set(proxy))
    if len(common) < 24:
        return None
    a = [real[m] for m in common]
    b = [proxy[m] for m in common]
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va = sum((x - ma) ** 2 for x in a)
    vb = sum((y - mb) ** 2 for y in b)
    diff = [x - y for x, y in zip(a, b)]
    md = sum(diff) / len(diff)
    te = math.sqrt(sum((d - md) ** 2 for d in diff) / (len(diff) - 1)) * math.sqrt(12)
    growth_real = math.prod(1 + x for x in a) ** (12 / len(a)) - 1
    growth_proxy = math.prod(1 + y for y in b) ** (12 / len(b)) - 1
    return {
        "months": len(common),
        "from": common[0],
        "to": common[-1],
        "correlation": round(cov / math.sqrt(va * vb), 4) if va > 0 and vb > 0 else None,
        "realYearly": round(growth_real, 5),
        "proxyYearly": round(growth_proxy, 5),
        "trackingError": round(te, 5),
    }


# ---- inputs ---------------------------------------------------------------------------


def _levels(f: dict, name: str) -> List[Tuple[str, float]]:
    s = f["series"][name]
    return list(zip(s["t"], s["v"]))


def _daily(tid: str) -> Optional[dict]:
    return load_json(DATA_DIR / f"daily/{tid}.json")


def au_cpi_monthly(inflation: dict) -> Tuple[Series, str]:
    """Australian monthly inflation, as one chain of month-on-month changes.

    Before the complete Monthly CPI (April 2024) only quarterly figures exist. A quarterly index is
    the AVERAGE of its three months, so it describes prices in the middle of the quarter: each
    quarter's index is placed at its middle month (Feb, May, Aug, Nov), and each month between two
    middle months grows by the same amount (the geometric third of that step).

    From the first month of the monthly CPI on, the monthly index's own changes are used. That
    first month's change is level-based: monthly index / the chain's level for the month before - 1.
    Both ABS series are on the same base (Sep 2025 = 100), so the chain then lands exactly on the
    published monthly index (no level is lost at the switch). Returns (changes, first monthly month)."""
    q = _levels(inflation, "au_cpi_q")
    mid: List[Tuple[int, float]] = []
    for t, v in q:
        y, n = t.split("-Q")
        mid.append((int(y) * 12 + (int(n) - 1) * 3 + 1, v))  # month number of the quarter's middle month
    level: Dict[int, float] = {mid[0][0]: mid[0][1]}  # chain level for each month, on the ABS base
    per_month: Dict[int, float] = {}
    for (m0, a), (m1, b) in zip(mid, mid[1:]):
        gap = m1 - m0
        step = (b / a) ** (1 / gap)
        for k in range(1, gap + 1):
            level[m0 + k] = a * step**k
            per_month[m0 + k] = step - 1
    monthly_levels = _levels(inflation, "au_cpi_m")
    first = month_num(monthly_levels[0][0])
    if first - 1 not in level:
        raise ValueError(f"au_cpi: no quarterly level for {month_str(first - 1)}, the month before the monthly CPI starts")
    out: Series = {month_str(m): v for m, v in per_month.items() if m < first}
    out[month_str(first)] = monthly_levels[0][1] / level[first - 1] - 1
    out.update(changes_from_levels(monthly_levels))
    return dict(sorted(out.items())), month_str(first)


HEDGE_CARRY = False


def hedged_return(r: Series, cash_au: Series, cash_us: Series, src: str, dst: str) -> Series:
    """A currency-hedged return: the asset's return in its own currency, plus the gap between the two
    currencies' cash rates. A hedge is a rolling forward contract, and forwards are priced at that
    gap, so e.g. hedging US$ back to A$ earned about 3% a year extra in 1975-2008, when Australian
    rates were much higher, and cost a little in 2022-2024. (Ignores the hedge's small costs.)"""
    home, away = (cash_au, cash_us) if dst == "AUD" else (cash_us, cash_au)
    return {m: (1 + v) * (1 + home[m]) / (1 + away[m]) - 1 for m, v in r.items() if m in home and m in away}


def gold_series(wb_rows: List[dict], etf_usd: Series) -> Tuple[Series, str]:
    """Monthly change in the US$ gold price: the World Bank's monthly averages (rows of month,
    usd_per_oz) from GOLD_FROM, then the GOLD ETF's own monthly total return in US$ for the months
    after the frozen World Bank copy ends. Returns (series, last World Bank month)."""
    levels = [(r["month"], float(r["usd_per_oz"])) for r in wb_rows if r["month"] >= add_months(GOLD_FROM, -1)]
    wb = changes_from_levels(levels)
    end = last_month(wb)
    return splice((wb, None, None), (etf_usd, add_months(end, 1), None)), end


# ---- the build ---------------------------------------------------------------------------


def build(tickers: List[Ticker], now: datetime) -> dict:
    inflation = load_json(DATA_DIR / "inflation.json")
    rates = load_json(DATA_DIR / "rates.json")
    fxf = load_json(DATA_DIR / "fx.json")
    cache = load_json(PIPELINE_DIR / "cache" / "proxies.json")
    if not (inflation and rates and fxf and cache):
        raise RuntimeError("monthly: inputs missing (run the macro and proxies jobs first)")
    shiller = read_static("shiller_1871_1953.csv")
    this_month = now.strftime("%Y-%m")

    def etf_tr(tid: str) -> Series:
        """Monthly total return from adjusted closes, only from when Yahoo's distribution
        records begin (before that its 'adjusted' prices leave distributions out)."""
        d = _daily(tid)
        if not d:
            return {}
        s = complete_months(changes_from_levels(month_end_levels(d)), this_month)
        tr_from = d.get("trFrom", d["first"])[:7]
        return {m: v for m, v in s.items() if m >= tr_from}

    def index_price(tid: str) -> Series:
        d = _daily(tid)
        return complete_months(changes_from_levels(month_end_levels(d, "c")), this_month) if d else {}

    fx = changes_from_levels(_levels(fxf, "audusd_monthly"))

    # US shares: Shiller (monthly average prices + dividends) to June 1926, then the whole US market
    # from CRSP via the French library, then VTI once the French data runs out.
    sh_levels = [(r["month"], float(r["sp_price"]), float(r["dividend_annual"])) for r in shiller]
    shiller_tr = {
        m1: (p1 + d1 / 12) / p0 - 1
        for (m0, p0, _), (m1, p1, d1) in zip(sh_levels, sh_levels[1:])
        if month_num(m1) == month_num(m0) + 1
    }
    french_us = pct_points(cache["us_mkt"])
    fr_us_end = last_month(french_us)
    us_shares = splice((shiller_tr, None, "1926-06"), (french_us, "1926-07", None), (etf_tr("VTI"), add_months(fr_us_end, 1), None))

    # Developed-world shares in US$: US stand-in before 1975; 50/50 US and the French all-country
    # ex-US index 1975 to June 1990; French developed markets from July 1990; then VGS (converted to US$).
    intl = pct_points(cache["intl_usd"])
    mix_75_90 = {m: 0.5 * us_shares[m] + 0.5 * intl[m] for m in intl if m in us_shares}
    developed = pct_points(cache["developed"])
    vgs_usd = to_currency(etf_tr("VGS"), fx, "AUD", "USD")
    global_shares = splice(
        (us_shares, None, "1974-12"),
        (mix_75_90, "1975-01", "1990-06"),
        (developed, "1990-07", None),
        (vgs_usd, add_months(last_month(developed), 1), None),
    )

    # Shares outside the US in US$ (for VEU): French "all countries" international index (the non-US
    # markets in the French data, from 1975), then VEU (converted to US$) once that runs out.
    intl_shares = splice((intl, None, None), (to_currency(etf_tr("VEU"), fx, "AUD", "USD"), add_months(last_month(intl), 1), None))

    # Australian shares in A$: French (MSCI-based, local currency) from 1975, then VAS.
    aus = pct_points(cache["aus_local"])
    au_shares = splice((aus, None, None), (etf_tr("VAS"), add_months(last_month(aus), 1), None))

    # US tech (Nasdaq): price index plus an assumed dividend yield (no free total-return series).
    ixic = {m: v + TECH_DIVIDEND_YIELD / 12 for m, v in index_price("NASDAQCOMP").items()}
    ndx = {m: v + TECH_DIVIDEND_YIELD / 12 for m, v in index_price("NDX").items()}
    us_tech = splice((ixic, None, "1985-10"), (ndx, "1985-11", None))

    # Gold in US$: the World Bank's monthly average price (frozen copy), then the GOLD ETF (in US$) for
    # the months after the frozen copy ends.
    gold, wb_gold_end = gold_series(read_static(GOLD_STATIC), to_currency(etf_tr("GOLD"), fx, "AUD", "USD"))

    # Bonds: 10-year US Treasury. Australian government bonds: 85% 5-year + 15% 10-year, which gives
    # about the same interest-rate sensitivity (duration ~4.8 years) as the AusBond Composite index
    # VAF tracks. Before 1972 only the 10-year yield exists.
    # The RBA has no 5-year yield from 20 May to 23 Sep 2013 (no month-end values May-Aug 2013):
    # those months are estimated from the 10-year yield plus the 5y-10y spread (interpolated).
    us_bonds = bond_returns(_levels(rates, "us_bond_10y"), 10)
    au10_yields = _levels(rates, "au_bond_10y")
    au5_yields, au5_estimated = fill_spread_gaps(_levels(rates, "au_bond_5y"), au10_yields)
    au10 = bond_returns(au10_yields, 10)
    au5 = bond_returns(au5_yields, 5)
    au_bonds = {m: (AU_BOND_W5 * au5[m] + (1 - AU_BOND_W5) * v) if m in au5 else v for m, v in au10.items()}
    # a month's bond return uses the yields at the end of that month and of the month before
    au_bonds_estimated = sorted({add_months(m, k) for m in au5_estimated for k in (0, 1)} & set(au_bonds))

    cash_au = {m: v / 100 / 12 for m, v in _levels(rates, "cash_monthly")}
    cash_au = complete_months(cash_au, this_month)
    cash_us = pct_points(cache["us_rf"])

    au_cpi, au_monthly_from = au_cpi_monthly(inflation)
    us_cpi_levels, us_cpi_filled = fill_gaps(_levels(inflation, "us_cpi_m"))
    us_cpi = changes_from_levels(us_cpi_levels)

    asset_series: Dict[str, Tuple[Series, dict]] = {
        "au_shares": (au_shares, {"label": "Australian shares (total return)", "kind": "return", "currency": "AUD",
            "segments": [["1975-01", last_month(aus), "Kenneth French Data Library: Australia market portfolio, local currency, dividends included (MSCI data before 2007)"],
                         [add_months(last_month(aus), 1), None, "VAS (Vanguard Australian Shares ETF) adjusted close, Yahoo"]],
            "gap": "No free monthly total-return data before 1975."}),
        "us_shares": (us_shares, {"label": "US shares (total return)", "kind": "return", "currency": "USD",
            "segments": [["1871-02", "1926-06", "Shiller: S&P Composite, monthly average prices + dividends"],
                         ["1926-07", fr_us_end, "Kenneth French Data Library: all US stocks (CRSP), dividends included"],
                         [add_months(fr_us_end, 1), None, "VTI (Vanguard Morningstar Total Stock Market ETF, called Vanguard Total Stock Market ETF before 29 Jul 2026) adjusted close, Yahoo"]]}),
        "global_shares": (global_shares, {"label": "Developed-world shares (total return)", "kind": "return", "currency": "USD",
            "segments": [["1871-02", "1974-12", "STAND-IN: US shares only (no free world data this early)"],
                         ["1975-01", "1990-06", "Rough mix: 50% US shares + 50% French all-country ex-US index"],
                         ["1990-07", last_month(developed), "Kenneth French Data Library: developed markets, US$"],
                         [add_months(last_month(developed), 1), None, "VGS adjusted close, converted to US$"]]}),
        "us_tech": (us_tech, {"label": "US tech-heavy shares (Nasdaq)", "kind": "return", "currency": "USD",
            "segments": [["1971-03", "1985-10", "Nasdaq Composite price index + assumed 0.7% a year dividends"],
                         ["1985-11", None, "Nasdaq-100 price index + assumed 0.7% a year dividends"]],
            "gap": "Price index only; dividends are an assumption (QQQ yields about 0.5-0.7% a year)."}),
        "au_bonds": (au_bonds, {"label": "Australian government bonds", "kind": "return", "currency": "AUD",
            "segments": [["1969-08", None, "Calculated from RBA government bond yields: 85% 5-year + 15% 10-year (10-year only before 1972). End-of-month yields: the RBA's last-business-day figures before 1995, the last daily value from 1995."]],
            "interpolated": au_bonds_estimated,
            "gap": "Government bonds only; VAF also holds semi-government and corporate bonds, which pay a bit more."
                   + (" The RBA has no 5-year yield for the end of " + ", ".join(au5_estimated) + " (no figures 20 May to 23 Sep 2013): those 5-year yields are estimated as the 10-year yield plus the 5-year/10-year gap, drawn in a straight line between the months either side, so the returns for "
                      + ", ".join(au_bonds_estimated) + " are partly estimated." if au5_estimated else "")}),
        "us_bonds": (us_bonds, {"label": "US 10-year Treasury bonds", "kind": "return", "currency": "USD",
            "segments": [["1871-02", "1953-03", "Calculated from Shiller's long-term interest rate (monthly average)"],
                         ["1953-04", "1961-12", "Calculated from FRED GS10 (monthly average)"],
                         ["1962-01", None, "Calculated from FRED DGS10, end of month"]]}),
        "intl_shares": (intl_shares, {"label": "Shares outside the US (total return)", "kind": "return", "currency": "USD",
            "segments": [["1975-01", last_month(intl), "Kenneth French Data Library: international 'all countries' index (the markets outside the US in its data), US$, dividends included"],
                         [add_months(last_month(intl), 1), None, "VEU (Vanguard All-World ex-US Shares ETF) adjusted close, converted to US$, Yahoo"]],
            "gap": "No free data before 1975. Mostly developed markets; emerging markets are only partly covered, so it is a stand-in for VEU's all-world-ex-US index."}),
        "gold": (gold, {"label": "Gold (US$ price)", "kind": "return", "currency": "USD",
            "segments": [[first_month(gold), wb_gold_end, "World Bank Commodity Price Data (Pink Sheet): gold, US$ per troy ounce, average of each month's daily prices (London afternoon fixing; spot from June 2025)"],
                         [add_months(wb_gold_end, 1), None, "GOLD (Global X Physical Gold) adjusted close, converted to US$, Yahoo"]],
            "gap": "Starts April 1968, when the free market price began (gold was held at about US$35 before). The World Bank figures are monthly averages, which smooth the month-to-month moves a little (true month-end prices swing more), and are whole dollars, so months before about 1973 (gold under US$100) are rounded by up to 1-2%. No income: gold pays nothing."}),
        "cash_au": (cash_au, {"label": "Australian cash rate", "kind": "return", "currency": "AUD",
            "segments": [["1969-06", None, "RBA: bank bills to 1976, interbank cash rate to 1990, cash rate target after (monthly average / 12)"]]}),
        "cash_us": (cash_us, {"label": "US 1-month Treasury bills", "kind": "return", "currency": "USD",
            "segments": [["1926-07", None, "Kenneth French Data Library (Ibbotson, then ICE BofA)"]]}),
        "au_cpi": (au_cpi, {"label": "Australian inflation (CPI)", "kind": "inflation", "currency": "AUD",
            "segments": [[first_month(au_cpi), add_months(au_monthly_from, -1), "ABS quarterly CPI: each quarter's index (the average of its 3 months) placed at its middle month, with the months in between growing evenly"],
                         [au_monthly_from, None, "ABS complete Monthly CPI (the first month is measured from the quarterly chain's level for the month before)"]],
            "gap": "No CPI before 1948 in the ABS series."}),
        "us_cpi": (us_cpi, {"label": "US inflation (CPI-U)", "kind": "inflation", "currency": "USD",
            "segments": [["1871-02", "1912-12", "Shiller (Warren-Pearson price index)"], ["1913-01", None, "BLS CPI-U via FRED"]],
            "interpolated": us_cpi_filled,
            "gap": ("Missing months filled by spreading the change evenly: " + ", ".join(us_cpi_filled) + " (no CPI was published, e.g. the Oct 2025 US government shutdown).") if us_cpi_filled else None}),
        "audusd": (fx, {"label": "AUD/USD (change in US$ per A$1)", "kind": "fx", "currency": "USD",
            "segments": [["1969-08", None, "RBA tables F11, end of month"]],
            "gap": "Starts July 1969. The A$ was pegged to the British pound until December 1971, then to the US$ until September 1974, then to a basket of currencies until it was floated in December 1983, so most months before the float barely move."}),
    }
    assets = {k: v[0] for k, v in asset_series.items()}

    # Months where an asset series is itself made from an ETF's prices (once the index data runs
    # out). Comparing an ETF with such months would partly compare it with itself (or a near twin),
    # so the proxy check below leaves them out.
    from_etf: Dict[str, set] = {k: set() for k in asset_series}
    from_etf["us_shares"] = {m for m in us_shares if m > fr_us_end}
    from_etf["au_shares"] = {m for m in au_shares if m > last_month(aus)}
    from_etf["gold"] = {m for m in gold if m > wb_gold_end}
    from_etf["intl_shares"] = {m for m in intl_shares if m > last_month(intl)}
    from_etf["global_shares"] = {m for m in global_shares if m > last_month(developed) or (m <= "1990-06" and m in from_etf["us_shares"])}

    out_series = {}
    for key, (s, info) in asset_series.items():
        start, vals = encode(s)
        info = dict(info)
        info["segments"] = [{"from": a, "to": b, "source": c} for a, b, c in info["segments"]]
        info = {k: v for k, v in info.items() if v is not None}
        out_series[key] = {**info, "start": start, "values": vals}

    # ---- each ETF: real history, with its proxy (minus fees) before it existed --------------
    out_etfs = {}
    for t in tickers:
        if t.kind != "etf":
            continue
        real = etf_tr(t.id)
        mer = t.mer
        proxy: Series = {}
        if t.proxy:
            parts = []
            for c in t.proxy:
                s = assets[c.series]
                src = asset_series[c.series][1]["currency"]
                if src != t.currency:
                    s = hedged_return(s, cash_au, cash_us, src, t.currency) if c.hedged else to_currency(s, fx, src, t.currency)
                parts.append((c.weight, s))
            months = set.intersection(*(set(p[1]) for p in parts))
            fee = (mer or 0) / 12
            proxy = {m: (1 + sum(w * s[m] for w, s in parts)) * (1 - fee) - 1 for m in sorted(months)}
        if not real and not proxy:
            continue
        real_from = first_month(real) if real else None
        spliced = splice((proxy, None, add_months(real_from, -1) if real_from else None), (real, real_from, None))
        start, vals = encode(spliced)
        out_etfs[t.id] = {
            "label": t.name,
            "currency": t.currency,
            "start": start,
            "realFrom": real_from,
            "fee": None if mer is None else round(mer, 6),
            "proxy": [{"series": c.series, "weight": c.weight, "hedged": c.hedged} for c in t.proxy],
            "proxyCheck": proxy_check(real, {m: v for m, v in proxy.items() if not any(m in from_etf[c.series] for c in t.proxy)}) if real and proxy else None,
            "values": vals,
        }
        warnings = []
        if t.proxy_warning:
            warnings.append(t.proxy_warning)
        if mer is None:
            warnings.append("Management fee unknown, so no fee was taken off the proxy months.")
        if warnings:
            out_etfs[t.id]["warning"] = " ".join(warnings)

    core = ["au_shares", "us_shares", "global_shares", "au_bonds", "cash_au", "au_cpi", "us_cpi", "audusd"]
    last_full = min(last_month(assets[k]) for k in core)
    first_full = max(first_month(assets[k]) for k in core)
    return {
        "schema": 1,
        "asOf": last_full,
        "scale": SCALE,
        "allSeriesFrom": first_full,
        "allSeriesTo": last_full,
        "note": "Each value is the change during that calendar month (a total return, inflation, or AUD/USD move) times scale. null = no data. Month m is at index (m - start) in values.",
        "series": out_series,
        "etfs": out_etfs,
    }


def update(tickers: List[Ticker], now: datetime) -> str:
    return save_validated("monthly.json", build(tickers, now), validate_monthly)
