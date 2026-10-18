"""Prices from Yahoo Finance.

Main route: the yfinance library. Backup route: Yahoo's chart endpoint called directly (the
same data, but it keeps working when a yfinance release breaks, which has happened several
times). Both are unofficial and for personal use only (see DATA_SOURCES.md).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence, Tuple


@dataclass
class DailyHistory:
    symbol: str
    dates: List[str] = field(default_factory=list)  # YYYY-MM-DD, exchange-local trading dates
    close: List[float] = field(default_factory=list)  # split-adjusted close
    adj: List[float] = field(default_factory=list)  # split + dividend adjusted close (total return)
    dividends: List[Tuple[str, float]] = field(default_factory=list)
    splits: List[Tuple[str, float]] = field(default_factory=list)
    route: str = "yfinance"


@dataclass
class Bars:
    symbol: str
    times: List[int] = field(default_factory=list)  # bar start, unix seconds (UTC)
    close: List[float] = field(default_factory=list)
    route: str = "yfinance"


def _ok(x) -> bool:
    try:
        return x is not None and math.isfinite(float(x)) and float(x) > 0
    except (TypeError, ValueError):
        return False


# ---- main route: yfinance ----------------------------------------------------------


def daily_yfinance(symbol: str) -> DailyHistory:
    import yfinance as yf

    df = yf.Ticker(symbol).history(period="max", interval="1d", auto_adjust=False, actions=True, raise_errors=True)
    out = DailyHistory(symbol)
    if df is None or df.empty:
        return out
    for ts, row in df.iterrows():
        day = ts.date().isoformat()  # index is in the exchange's own time zone
        if _ok(row.get("Close")):
            adj = row.get("Adj Close")
            if out.dates and out.dates[-1] == day:
                continue
            out.dates.append(day)
            out.close.append(float(row["Close"]))
            out.adj.append(float(adj) if _ok(adj) else float(row["Close"]))
        div = row.get("Dividends")
        if div is not None and float(div) > 0:
            out.dividends.append((day, float(div)))
        spl = row.get("Stock Splits")
        if spl is not None and float(spl) > 0:
            out.splits.append((day, float(spl)))
    return out


def intraday_yfinance(symbols: Sequence[str]) -> Dict[str, Bars]:
    import yfinance as yf

    out: Dict[str, Bars] = {}
    for sym in symbols:
        try:
            df = yf.Ticker(sym).history(period="1d", interval="5m", auto_adjust=False, prepost=False)
        except Exception:  # one bad symbol shouldn't stop the others
            continue
        if df is None or df.empty:
            continue
        b = Bars(sym)
        for ts, row in df.iterrows():
            if _ok(row.get("Close")):
                b.times.append(int(ts.timestamp()))
                b.close.append(float(row["Close"]))
        if b.times:
            out[sym] = b
    return out


# ---- backup route: Yahoo chart endpoint ------------------------------------------------

CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"


def _chart(symbol: str, params: dict) -> dict:
    # curl_cffi (installed with yfinance) looks like a normal browser to Yahoo; plain requests is often refused.
    from curl_cffi import requests as creq

    r = creq.get(CHART_URL.format(symbol=symbol), params=params, impersonate="chrome", timeout=30)
    r.raise_for_status()
    js = r.json()
    err = js.get("chart", {}).get("error")
    if err:
        raise RuntimeError(f"Yahoo chart error for {symbol}: {err}")
    return js["chart"]["result"][0]


def daily_direct(symbol: str) -> DailyHistory:
    now = int(datetime.now(timezone.utc).timestamp())
    res = _chart(symbol, {"period1": 0, "period2": now, "interval": "1d", "events": "div,splits", "includeAdjustedClose": "true"})
    offset = timedelta(seconds=res["meta"].get("gmtoffset", 0))
    out = DailyHistory(symbol, route="yahoo-direct")
    ts = res.get("timestamp") or []
    q = res["indicators"]["quote"][0]
    adj = (res["indicators"].get("adjclose") or [{}])[0].get("adjclose") or q["close"]

    def day(t: int) -> str:
        return (datetime.fromtimestamp(t, timezone.utc) + offset).date().isoformat()

    for t, c, a in zip(ts, q["close"], adj):
        if _ok(c):
            d = day(t)
            if out.dates and out.dates[-1] == d:
                continue
            out.dates.append(d)
            out.close.append(float(c))
            out.adj.append(float(a) if _ok(a) else float(c))
    ev = res.get("events") or {}
    out.dividends = sorted((day(int(v["date"])), float(v["amount"])) for v in (ev.get("dividends") or {}).values())
    out.splits = sorted(
        (day(int(v["date"])), float(v["numerator"]) / float(v["denominator"])) for v in (ev.get("splits") or {}).values()
    )
    return out


def intraday_direct(symbols: Sequence[str]) -> Dict[str, Bars]:
    out: Dict[str, Bars] = {}
    for sym in symbols:
        try:
            res = _chart(sym, {"range": "1d", "interval": "5m"})
        except Exception:
            continue
        b = Bars(sym, route="yahoo-direct")
        for t, c in zip(res.get("timestamp") or [], res["indicators"]["quote"][0]["close"]):
            if _ok(c):
                b.times.append(int(t))
                b.close.append(float(c))
        if b.times:
            out[sym] = b
    return out


# ---- with automatic fallback ---------------------------------------------------------


def daily(symbol: str) -> Tuple[DailyHistory, Optional[str]]:
    """Returns (history, error from the main route if the backup had to be used)."""
    first_error: Optional[str] = None
    try:
        h = daily_yfinance(symbol)
        if h.dates:
            return h, None
        first_error = "yfinance returned no rows"
    except Exception as e:  # yfinance can break in many ways
        first_error = f"{type(e).__name__}: {e}"
    return daily_direct(symbol), first_error


def intraday(symbols: Sequence[str]) -> Tuple[Dict[str, Bars], Optional[str]]:
    first_error: Optional[str] = None
    try:
        got = intraday_yfinance(symbols)
        if got:
            return got, None
        first_error = "yfinance returned no intraday bars"
    except Exception as e:
        first_error = f"{type(e).__name__}: {e}"
    return intraday_direct(symbols), first_error
