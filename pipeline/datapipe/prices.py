"""Daily price history files (data/daily/<ID>.json) and intraday files (data/intraday/<market>.json)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Dict, List, Optional, Tuple

from .config import Ticker
from .meta import Meta
from .safety import ValidationError, daily_dates, save_validated, validate_daily, validate_intraday
from .schedule import MARKETS, Market
from .sources import yahoo
from .util import DATA_DIR, iso, load_json, round_price

# ---- daily -------------------------------------------------------------------------


def repair_history(h: yahoo.DailyHistory) -> List[str]:
    """Fix two known kinds of Yahoo glitch in ETF histories, and say what was changed:
    1. a single bad day (price jumps 3x or more and comes straight back the next day): dropped;
    2. an unrecorded split (e.g. IVV's 15-for-1 split in 2022 is missing from Yahoo's data before
       2011): the price suddenly changes by a near-whole-number factor and stays there, so the
       older prices (and distributions) are divided by that whole number."""
    notes: List[str] = []
    k = 1
    while k < len(h.close) - 1:
        r, back = h.close[k] / h.close[k - 1], h.close[k + 1] / h.close[k - 1]
        if (r > 3 or r < 1 / 3) and 0.8 < back < 1.25:
            notes.append(f"dropped bad price on {h.dates[k]} ({h.close[k]:g}, between {h.close[k - 1]:g} and {h.close[k + 1]:g})")
            for lst in (h.dates, h.close, h.adj):
                del lst[k]
            continue
        k += 1
    split_days = {d for d, _ in h.splits}
    for k in range(1, len(h.close)):
        r = h.close[k] / h.close[k - 1]
        if h.dates[k] in split_days or 1 / 1.8 < r < 1.8:
            continue
        n = round(1 / r) if r < 1 else 1 / round(r)
        if abs(r * n - 1) > 0.06:
            continue
        for lst in (h.close, h.adj):
            for j in range(k):
                lst[j] = lst[j] / n
        h.dividends = [(d, v / n if d < h.dates[k] else v) for d, v in h.dividends]
        notes.append(f"prices before {h.dates[k]} divided by {n:g} (unrecorded split in Yahoo's data)")
    return notes


def daily_file(t: Ticker, h: yahoo.DailyHistory) -> dict:
    """Compact format: first date + gaps in days, then the prices. See docs/DATA_FORMAT.md."""
    days = [date.fromisoformat(d) for d in h.dates]
    gaps = [0] + [(b - a).days for a, b in zip(days, days[1:])]
    f = {
        "id": t.id,
        "symbol": t.yahoo,
        "name": t.name,
        "kind": t.kind,
        "currency": t.currency,
        "asOf": h.dates[-1],
        "first": h.dates[0],
        "last": h.dates[-1],
        "d": gaps,
        "c": [round_price(x) for x in h.close],
    }
    # Indexes and exchange rates have no distributions, so their adjusted close equals the close.
    if t.kind == "etf":
        # Yahoo has no distribution records for ASX ETFs before about 2013. Where the records start
        # well after the first trading day, adjusted closes before that are really price-only.
        f["trFrom"] = h.dates[0]
        if t.market == "asx" and h.dividends and (date.fromisoformat(h.dividends[0][0]) - days[0]).days > 400:
            f["trFrom"] = h.dividends[0][0]
            f["trNote"] = f"Yahoo has no distribution records before {h.dividends[0][0]}, so total return (adjusted close) before then leaves distributions out."
        f["a"] = [round_price(x) for x in h.adj]
        f["div"] = [[d, round(v, 6)] for d, v in h.dividends]
        f["splits"] = [[d, v] for d, v in h.splits]
    return f


def update_daily(tickers: List[Ticker], meta: Meta, now: datetime) -> Tuple[bool, Optional[str]]:
    """Fetch full daily history for each ticker; returns (any file changed, latest date seen)."""
    changed = False
    latest: Optional[str] = None
    failures = 0
    used_backup = []
    for t in tickers:
        rel = f"daily/{t.id}.json"
        try:
            h, main_error = yahoo.daily(t.yahoo)
            if main_error:
                used_backup.append(t.id)
                meta.problem("yahoo", f"{t.yahoo}: yfinance failed ({main_error}); used the backup route")
            if not h.dates:
                raise ValidationError(f"{t.yahoo}: no data returned")
            repairs: List[str] = []
            if t.kind == "etf":
                repairs = repair_history(h)
                # Anything still jumping this much is suspicious; flag it so a person can check.
                for a, b, d in zip(h.close, h.close[1:], h.dates[1:]):
                    if b / a - 1 < -0.4 or b / a - 1 > 0.6:
                        if not any(s[0] == d for s in h.splits):
                            meta.problem("yahoo", f"{t.id}: price moved {b / a - 1:+.0%} on {d}; please check", now)
            f = daily_file(t, h)
            if repairs:
                f["repairs"] = repairs
            if save_validated(rel, f, validate_daily) == "written":
                changed = True
            if t.kind in ("etf", "index"):
                latest = max(latest or h.dates[-1], h.dates[-1])
        except Exception as e:
            failures += 1
            meta.problem("yahoo", f"{t.id}: {type(e).__name__}: {e} (kept the last good file)", now)
    if failures == len(tickers):
        meta.source_failed("yahoo", f"all {failures} daily downloads failed", now)
    else:
        note = f"{failures} of {len(tickers)} tickers failed" if failures else None
        if used_backup:
            note = (note + "; " if note else "") + "backup route used for " + ", ".join(used_backup)
        meta.source_ok("yahoo", now, note)
    return changed, latest


# ---- intraday ----------------------------------------------------------------------


def previous_close(t: Ticker, session: str) -> Optional[float]:
    f = load_json(DATA_DIR / f"daily/{t.id}.json")
    if not f:
        return None
    prev = None
    for d, c in zip(daily_dates(f), f["c"]):
        if d < session:
            prev = c
        else:
            break
    return prev


def intraday_file(market: Market, tickers: List[Ticker], bars: Dict[str, yahoo.Bars], now: datetime) -> Optional[dict]:
    """Today's 5-minute bars and latest prices. Returns None when the market had no session today."""
    today = now.astimezone(market.zone).date().isoformat()
    quotes, series = {}, {}
    for t in tickers:
        b = bars.get(t.yahoo)
        if not b:
            continue
        # keep only bars from the latest local trading day
        local_days = [datetime.fromtimestamp(x, timezone.utc).astimezone(market.zone).date().isoformat() for x in b.times]
        day = local_days[-1]
        if day != today:
            continue
        times = [x for x, d in zip(b.times, local_days) if d == day]
        closes = [c for c, d in zip(b.close, local_days) if d == day]
        start = times[0]
        slots: List[Optional[float]] = [None] * ((times[-1] - start) // 300 + 1)
        for x, c in zip(times, closes):
            slots[(x - start) // 300] = round_price(c)
        prev = previous_close(t, day)
        price = closes[-1]
        q = {"price": round_price(price), "time": iso(datetime.fromtimestamp(times[-1], timezone.utc))}
        if prev:
            q.update(prevClose=prev, change=round_price(price - prev), changePct=round((price / prev - 1) * 100, 3))
        quotes[t.id] = q
        series[t.id] = {"t0": start, "step": 300, "c": slots}
    main = [t.id for t in tickers if t.kind != "fx"]
    if not any(i in quotes for i in main):
        return None  # weekend, public holiday, or no bars yet
    last_time = max(q["time"] for i, q in quotes.items() if i in main)
    return {
        "market": market.key,
        "exchange": market.name,
        "tz": market.tz,
        "session": today,
        "asOf": last_time,
        "generatedAt": iso(now),
        "note": "Prices are delayed by about 15-20 minutes. Bar times are when each 5-minute bar starts.",
        "quotes": quotes,
        "bars": series,
    }


def update_intraday(market_key: str, tickers: List[Ticker], meta: Meta, now: datetime) -> str:
    market = MARKETS[market_key]
    bars, main_error = yahoo.intraday([t.yahoo for t in tickers])
    if main_error and bars:
        meta.problem("yahoo", f"intraday {market.name}: yfinance failed ({main_error}); used the backup route", now)
    f = intraday_file(market, tickers, bars, now)
    if f is None:
        if not bars:
            meta.source_failed("yahoo", f"intraday {market.name}: no bars returned", now)
            return "failed"
        return "no-session"
    result = save_validated(f"intraday/{market.key}.json", f, validate_intraday)
    meta.source_ok("yahoo", now)
    return result
