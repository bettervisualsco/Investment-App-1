"""Inflation, interest rates and exchange rates (data/inflation.json, data/rates.json, data/fx.json),
plus the long-run share/bond inputs cached in pipeline/cache/proxies.json."""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Tuple

from .meta import Meta
from .safety import atomic_write_text, save_validated, validate_levels
from .sources import official
from .static_build import read_static
from .util import DATA_DIR, PIPELINE_DIR, dumps, iso, load_json

CACHE = PIPELINE_DIR / "cache" / "proxies.json"


def _series(points, digits=4) -> dict:
    return {"t": [p[0] for p in points], "v": [round(p[1], digits) for p in points]}


def _month_end_to_month(points) -> List[Tuple[str, float]]:
    """[(YYYY-MM-DD, v)] -> [(YYYY-MM, v)], keeping the last value in each month."""
    out: Dict[str, float] = {}
    for d, v in points:
        out[d[:7]] = v
    return sorted(out.items())


def period_end_month(t: str) -> str:
    """The last month a period covers, so mixed periods compare correctly:
    "2026-Q2" -> "2026-06", "2026-09" -> "2026-09", "2026-09-30" -> "2026-09"."""
    if "-Q" in t:
        y, q = t.split("-Q")
        return f"{y}-{int(q) * 3:02d}"
    return t[:7]


def latest_period(periods: List[str]) -> str:
    """The newest of several periods written in different ways (quarters, months), as YYYY-MM.
    (A plain max() would pick "2026-Q2" over "2026-09", because "Q" sorts after the digits.)"""
    return max(period_end_month(t) for t in periods)


def build_inflation(meta: Meta, now: datetime) -> bool:
    changed = False
    au = us = None
    try:
        au = official.abs_cpi()
        meta.source_ok("abs", now)
    except Exception as e:
        meta.source_failed("abs", e, now)
    try:
        us = official.fred_monthly("CPIAUCNS")
        meta.source_ok("fred", now)
    except Exception as e:
        meta.source_failed("fred", e, now)
    if au is None and us is None:
        return False
    old = load_json(DATA_DIR / "inflation.json", {}) or {}
    series = dict(old.get("series", {}))
    if au is not None:
        series["au_cpi_q"] = _series(au["Q"], 2)
        series["au_cpi_m"] = _series(au["M"], 2)
    if us is not None:
        # US CPI before 1913 comes from Shiller's data (same base as the BLS series from 1913).
        shiller = [(r["month"], float(r["cpi"])) for r in read_static("shiller_1871_1953.csv") if r["month"] < "1913-01"]
        series["us_cpi_m"] = _series(shiller + us, 3)
    last = [s["t"][-1] for s in series.values()]
    f = {
        "asOf": latest_period(last),
        "series": series,
        "info": {
            "au_cpi_q": "Australia, All groups CPI, index, quarterly, weighted average of the eight capital cities (ABS). Base: Sep 2025 = 100.",
            "au_cpi_m": "Australia, All groups CPI, index, monthly (ABS complete Monthly CPI, which starts April 2024). Base: Sep 2025 = 100.",
            "us_cpi_m": "US CPI for All Urban Consumers (CPI-U), not seasonally adjusted, 1982-84 = 100 (BLS via FRED; 1871-1912 from Shiller).",
        },
    }
    if save_validated("inflation.json", f, validate_levels(20, 0.1, 100000)) == "written":
        changed = True
    return changed


def _month_ends(points, before: str) -> List[Tuple[str, float]]:
    """Daily (YYYY-MM-DD, v) -> last value of each finished month (months before `before`)."""
    return [p for p in _month_end_to_month(points) if p[0] < before]


def build_rates_and_fx(meta: Meta, now: datetime) -> bool:
    this_month = now.strftime("%Y-%m")
    try:
        f11 = official.rba_table("f1.1")
        a2 = official.rba_cash_rate_changes()
        f2d = official.rba_table("f2")  # daily bond yields (we want end-of-month values)
        fx = official.rba_table("f11")
    except Exception as e:
        meta.source_failed("rba", e, now)
        return False
    meta.source_ok("rba", now)
    saved = (load_json(DATA_DIR / "rates.json", {}) or {}).get("series", {})
    try:
        gs10 = official.fred_monthly("GS10")  # monthly average, used 1953-1961 only
        dgs10 = _month_ends(official.fred_points("DGS10"), this_month)  # daily from 1962
    except Exception as e:
        meta.source_failed("fred", e, now)
        old = saved.get("us_bond_10y")
        if not old:
            return False
        gs10, dgs10 = [p for p in zip(old["t"], old["v"]) if p[0] >= "1953-04"], []

    # Cash: 3-month bank bills (1969-1976), then the interbank overnight cash rate (1976-1990),
    # then the official cash rate target (monthly average) from August 1990.
    target = _month_end_to_month(f11["FIRMMCRT"])
    interbank = [p for p in _month_end_to_month(f11["FIRMMCRI"]) if p[0] < target[0][0]]
    bills = [p for p in _month_end_to_month(f11["FIRMMBAB90"]) if p[0] < interbank[0][0]]
    cash_monthly = bills + interbank + target

    # Bond yields at the END of each month (what returns need). Daily data exists from 1995 (we take
    # the last daily value in each month); before 1995 the RBA's historical table F2 gives
    # last-business-day (end-of-month) values. (From 1995 that table holds monthly averages, so
    # it is only used before 1995.)
    avg = read_static("rba_bond_yields_monthly_1969_2013.csv")
    me = [r for r in read_static("rba_bond_yields_monthend_1995_2013.csv") if int(r["date"][8:]) >= 24]

    def au_yield(col: str, daily_id: str) -> List[Tuple[str, float]]:
        new = _month_ends(f2d[daily_id], this_month)
        mid = [(r["date"][:7], float(r[col])) for r in me if r[col] and r["date"][:7] < new[0][0]]
        old = [(r["date"][:7], float(r[col])) for r in avg if r[col] and r["date"][:7] < "1995-01"]
        return old + mid + new

    au5 = au_yield("y05", "FCMYGBAG5D")
    au10 = au_yield("y10", "FCMYGBAG10D")
    us_start = dgs10[0][0] if dgs10 else "9999-99"
    us10 = [(m, v) for m, v in gs10 if m < us_start] + dgs10
    shiller_gs10 = [(r["month"], float(r["gs10"])) for r in read_static("shiller_1871_1953.csv") if r["month"] < us10[0][0]]

    rates = {
        "asOf": max(cash_monthly[-1][0], a2[-1][0][:7]),
        "series": {
            "cash_target": {"t": [d for d, _ in a2], "v": [v for _, v in a2]},
            "cash_monthly": _series(cash_monthly, 3),
            "au_bond_5y": _series(au5, 3),
            "au_bond_10y": _series(au10, 3),
            "us_bond_10y": _series(shiller_gs10 + us10, 3),
        },
        "info": {
            "cash_target": "RBA cash rate target (%), one point per decision, dated when it took effect. Before 1990 there was no target.",
            "cash_monthly": "Monthly average (%): 3-month bank bills Jul 1969-Apr 1976, interbank overnight cash rate May 1976-Jul 1990, cash rate target from Aug 1990 (RBA table F1.1).",
            "au_bond_5y": "Australian Government 5-year bond yield (%), RBA tables F2, from Jan 1972, end of month: the RBA's last-business-day figures before 1995, the last daily value from 1995. Gap: the RBA has no 5-year yield from 20 May to 23 Sep 2013, so there are no end-of-month values for May-Aug 2013 (monthly.json estimates them from the 10-year yield).",
            "au_bond_10y": "Australian Government 10-year bond yield (%), RBA tables F2, from Jul 1969, end of month: the RBA's last-business-day figures before 1995, the last daily value from 1995.",
            "us_bond_10y": "US 10-year Treasury yield (%): Shiller 1871-Mar 1953 and FRED GS10 1953-1961 (monthly averages), then end of month from FRED DGS10 (daily) from 1962.",
        },
    }
    changed = save_validated("rates.json", rates, validate_levels(10, -5, 60)) == "written"

    old_fx = [(r["date"][:7], float(r["audusd"])) for r in read_static("rba_audusd_monthly_1969_2009.csv")]
    new_fx = _month_end_to_month(fx["FXRUSD"])
    fx_points = [p for p in old_fx if p[0] < new_fx[0][0]] + new_fx
    fxf = {
        "asOf": fx_points[-1][0],
        "series": {"audusd_monthly": _series(fx_points, 4)},
        "info": {"audusd_monthly": "US dollars per Australian dollar on the last business day of each month, 4pm Sydney (RBA tables F11). Starts July 1969. The A$ was pegged to the British pound until December 1971, then to the US dollar until September 1974, then to a basket of currencies until it was floated in December 1983."},
    }
    if save_validated("fx.json", fxf, validate_levels(100, 0.2, 2.0)) == "written":
        changed = True
    return changed


def fetch_proxies(meta: Meta, now: datetime) -> bool:
    """Long-run monthly returns from the Kenneth French Data Library, cached for the monthly build."""
    try:
        us = official.french_us_market()
        dev = official.french_developed_market()
        intl = official.french_international()
    except Exception as e:
        meta.source_failed("french", e, now)
        return False
    old = load_json(CACHE, {}) or {}
    new = {
        "fetchedAt": iso(now),
        "us_mkt": us["mkt"],
        "us_rf": us["rf"],
        "developed": dev,
        "aus_local": intl["aus_local"],
        "intl_usd": intl["intl_usd"],
    }
    for k in ("us_mkt", "developed", "aus_local", "intl_usd"):
        if len(new[k]) < len(old.get(k, [])) - 2 or len(new[k]) < 100:
            meta.source_failed("french", f"{k}: fewer months than before ({len(new[k])}); kept the saved copy", now)
            return False
    atomic_write_text(CACHE, dumps(new))
    meta.source_ok("french", now)
    return True
