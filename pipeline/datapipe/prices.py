"""Daily price history files (data/daily/<ID>.json) and intraday files (data/intraday/<market>.json)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Dict, List, Optional, Tuple

from .config import Ticker
from .meta import Meta
from .safety import ValidationError, daily_dates, save_validated, validate_daily, validate_intraday
from .schedule import MARKETS, Market, latest_closed_session
from .sources import yahoo
from .static_build import read_static
from .util import DATA_DIR, STATIC_DIR, iso, load_json, round_price

# ---- daily -------------------------------------------------------------------------

CORRECTIONS_FILE = STATIC_DIR / "corrections.json"
RBA_FX_DAILY_STATIC = "rba_audusd_daily_2003_2022.csv"
FLAT_RUN_DAYS = 5  # this many identical closes in a row, while the market moved, looks like missing data
MARKET_INDEX = {"asx": ("ASX200", "ASX 200"), "us": ("SP500", "S&P 500")}


def _drop_rows(h: yahoo.DailyHistory, keep) -> List[str]:
    """Remove rows whose date fails keep(date); returns the dropped dates."""
    dropped = [d for d in h.dates if not keep(d)]
    if dropped:
        rows = [(d, c, a) for d, c, a in zip(h.dates, h.close, h.adj) if keep(d)]
        h.dates, h.close, h.adj = [r[0] for r in rows], [r[1] for r in rows], [r[2] for r in rows]
    return dropped


def drop_unfinished(h: yahoo.DailyHistory, market: Market, now: datetime) -> List[str]:
    """Drop rows for trading days that haven't closed yet. During trading hours Yahoo's daily history
    includes today's price so far; saving it would label a midday price as the day's close."""
    latest = latest_closed_session(market, now).isoformat()
    return _drop_rows(h, lambda d: d <= latest)


def drop_weekends(h: yahoo.DailyHistory) -> List[str]:
    """Exchange rates trade around the clock, and Yahoo sometimes adds a Saturday/Sunday row from
    its live quote. Daily history is one row per weekday, so weekend rows are dropped."""
    return _drop_rows(h, lambda d: date.fromisoformat(d).weekday() < 5)


def trim_before_listing(t: Ticker, h: yahoo.DailyHistory) -> List[str]:
    """Yahoo has a few placeholder rows (often a flat 50.00) before some ASX ETFs actually listed.
    Rows before the listing date recorded in pipeline/etf_info (fact "listed") are dropped."""
    listed = (t.info.get("listed") or {}).get("value")
    if not listed:
        return []
    dropped = _drop_rows(h, lambda d: d >= listed)
    if not dropped:
        return []
    h.dividends = [(d, v) for d, v in h.dividends if d >= listed]
    h.splits = [(d, v) for d, v in h.splits if d >= listed]
    return [f"dropped {len(dropped)} row(s) from {dropped[0]} to {dropped[-1]}, before the ETF listed on {listed} (Yahoo placeholder prices)"]


def load_corrections() -> dict:
    return load_json(CORRECTIONS_FILE, {}) or {}


def apply_corrections(t: Ticker, h: yahoo.DailyHistory, corrections: List[dict]) -> Tuple[List[str], List[str]]:
    """Re-apply checked fixes from pipeline/static/corrections.json after every download, so a new
    Yahoo download can't undo them. Each entry gives the right close, the wrong value it replaces,
    and its source. The adjusted close on that day is scaled by the same ratio as the close.
    A correction is only applied while Yahoo still shows the wrong value it was written for;
    otherwise (Yahoo changed the history, e.g. after a split) it is skipped and reported.
    Returns (notes for the file's "repairs", problems for meta.json)."""
    notes: List[str] = []
    problems: List[str] = []
    where = {d: i for i, d in enumerate(h.dates)}
    fixed: List[str] = []
    for c in corrections:
        if c.get("id") != t.id:
            continue
        i = where.get(c["date"])
        if i is None:
            problems.append(f"{t.id}: correction for {c['date']} not applied (that day isn't in Yahoo's data); please check pipeline/static/corrections.json")
            continue
        y = h.close[i]
        if abs(y / c["close"] - 1) < 0.0005:
            continue  # Yahoo already has the right close
        if abs(y / c["replaces"] - 1) > 0.005:
            problems.append(
                f"{t.id}: correction for {c['date']} not applied: Yahoo's close is now {y:g}, not the {c['replaces']:g} it was written for; "
                "please check pipeline/static/corrections.json"
            )
            continue
        ratio = c["close"] / y
        h.close[i] = c["close"]
        h.adj[i] = h.adj[i] * ratio
        fixed.append(c["date"])
    if fixed:
        notes.append(f"{len(fixed)} close(s) from {fixed[0]} to {fixed[-1]} corrected from an independent source (pipeline/static/corrections.json)")
    return notes, problems


def flat_runs(close: List[float], min_days: int = FLAT_RUN_DAYS) -> List[Tuple[int, int]]:
    """(first, last) row indexes of every run of at least min_days identical closes."""
    out: List[Tuple[int, int]] = []
    i = 0
    while i < len(close):
        j = i
        while j + 1 < len(close) and close[j + 1] == close[i]:
            j += 1
        if j - i + 1 >= min_days:
            out.append((i, j))
        i = j + 1
    return out


def check_flat_runs(t: Ticker, h: yahoo.DailyHistory, index_close: Dict[str, float], index_name: str, checked: List[dict]) -> List[str]:
    """An ETF's close stuck at one value for FLAT_RUN_DAYS+ trading days while its market's index
    moved usually means Yahoo missed real trades (IVV in Dec 2022). Returns messages for meta.json.
    Runs a person has already checked are listed under "checkedFlatRuns" in corrections.json."""
    ok = {(c.get("id"), c.get("from")) for c in checked}
    out: List[str] = []
    for i, j in flat_runs(h.close):
        if (t.id, h.dates[i]) in ok:
            continue
        iv = [index_close[d] for d in h.dates[i : j + 1] if d in index_close]
        if len(iv) < 2:
            continue
        moved = max(iv) / min(iv) - 1
        if moved > 0.005:
            out.append(
                f"{t.id}: close stuck at {h.close[i]:g} for {j - i + 1} trading days ({h.dates[i]} to {h.dates[j]}) while the {index_name} "
                f"moved {moved:.1%}. Yahoo may have missed trades; please check (fixes go in pipeline/static/corrections.json)"
            )
    return out


def rba_fx_history(t: Ticker, meta: Meta, now: datetime) -> Tuple[yahoo.DailyHistory, Optional[str]]:
    """Daily AUD/USD from the RBA (official 4pm Sydney rate; WM/Reuters since 2008): a frozen copy
    for 2003-2022 (pipeline/static) plus the RBA's current table F11.1. Yahoo is used only for the
    newest weekdays the RBA hasn't published yet; those rows are approximate (Yahoo's own end-of-day
    quote, not the 4pm rate). Returns (history, first Yahoo-filled date or None)."""
    from .sources import official

    pts: Dict[str, float] = {r["date"]: float(r["audusd"]) for r in read_static(RBA_FX_DAILY_STATIC) if r["audusd"]}
    current = official.rba_table("f11.1").get("FXRUSD") or []
    if len(current) < 100:
        raise ValidationError(f"RBA F11.1: only {len(current)} AUD/USD rows")
    pts.update(dict(current))
    last_rba = max(pts)
    extra: List[Tuple[str, float]] = []
    try:
        yh, main_error = yahoo.daily(t.yahoo)
        if main_error:
            meta.problem("yahoo", f"{t.yahoo}: yfinance failed ({main_error}); used the backup route", now)
        drop_weekends(yh)
        extra = [(d, c) for d, c in zip(yh.dates, yh.close) if d > last_rba]
    except Exception as e:  # the RBA history is still good without Yahoo's newest day
        meta.problem("yahoo", f"{t.yahoo}: {type(e).__name__}: {e} (AUD/USD kept to the RBA's latest day)", now)
    rows = sorted(pts.items()) + extra
    h = yahoo.DailyHistory(t.yahoo, dates=[d for d, _ in rows], close=[v for _, v in rows], adj=[v for _, v in rows], route="rba")
    return h, (extra[0][0] if extra else None)


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


def daily_file(t: Ticker, h: yahoo.DailyHistory, approx_from: Optional[str] = None) -> dict:
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
    if t.kind == "fx":
        f["source"] = "RBA daily exchange rates (tables F11.1; 4pm Sydney, WM/Reuters), with Yahoo only for days the RBA hasn't published yet"
        if approx_from:
            f["approxFrom"] = approx_from
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
    """Fetch full daily history for each ticker. Returns (any file changed, latest complete date):
    the OLDEST latest close among the ETFs (so one early index close can't mark the day as done
    while ETFs are still missing it). A failed ETF counts with its saved file's last date."""
    changed = False
    etf_last: List[str] = []
    index_last: List[str] = []
    failures = 0
    used_backup = []
    fixes = load_corrections()
    for t in tickers:
        rel = f"daily/{t.id}.json"
        try:
            approx_from = None
            repairs: List[str] = []
            if t.kind == "fx":
                h, approx_from = rba_fx_history(t, meta, now)
            else:
                h, main_error = yahoo.daily(t.yahoo)
                if main_error:
                    used_backup.append(t.id)
                    meta.problem("yahoo", f"{t.yahoo}: yfinance failed ({main_error}); used the backup route")
            # AUD/USD follows Sydney: the RBA's official rate is set at 4pm Sydney time.
            drop_unfinished(h, MARKETS["asx"] if t.kind == "fx" else MARKETS[t.market], now)
            if not h.dates:
                raise ValidationError(f"{t.yahoo}: no data returned")
            if t.kind == "etf":
                repairs = trim_before_listing(t, h) + repair_history(h)
                notes, problems = apply_corrections(t, h, fixes.get("closes", []))
                repairs += notes
                for msg in problems:
                    meta.problem_once("corrections", msg, now)
                # Anything still jumping this much is suspicious; flag it so a person can check.
                for a, b, d in zip(h.close, h.close[1:], h.dates[1:]):
                    if b / a - 1 < -0.4 or b / a - 1 > 0.6:
                        if not any(s[0] == d for s in h.splits):
                            meta.problem("yahoo", f"{t.id}: price moved {b / a - 1:+.0%} on {d}; please check", now)
                idx_id, idx_name = MARKET_INDEX.get(t.market, (None, ""))
                idx = load_json(DATA_DIR / f"daily/{idx_id}.json") if idx_id else None
                if idx:
                    for msg in check_flat_runs(t, h, dict(zip(daily_dates(idx), idx["c"])), idx_name, fixes.get("checkedFlatRuns", [])):
                        meta.problem_once("yahoo", msg, now)
            f = daily_file(t, h, approx_from)
            if repairs:
                f["repairs"] = repairs
            if save_validated(rel, f, validate_daily) == "written":
                changed = True
            if t.kind == "etf":
                etf_last.append(h.dates[-1])
            elif t.kind == "index":
                index_last.append(h.dates[-1])
        except Exception as e:
            failures += 1
            meta.problem("yahoo", f"{t.id}: {type(e).__name__}: {e} (kept the last good file)", now)
            if t.kind == "etf":
                etf_last.append((load_json(DATA_DIR / rel) or {}).get("last") or "")
    if failures == len(tickers):
        meta.source_failed("yahoo", f"all {failures} daily downloads failed", now)
    else:
        note = f"{failures} of {len(tickers)} tickers failed" if failures else None
        if used_backup:
            note = (note + "; " if note else "") + "backup route used for " + ", ".join(used_backup)
        meta.source_ok("yahoo", now, note)
    latest = latest_complete(etf_last, index_last)
    return changed, latest


def latest_complete(etf_last: List[str], index_last: List[str]) -> Optional[str]:
    """The date every ETF has a close for (the oldest of their latest dates). Indexes only count
    when there are no ETFs at all."""
    if etf_last:
        return min(etf_last) or None
    return max(index_last) if index_last else None


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
