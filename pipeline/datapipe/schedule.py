"""When should each job run? Standard library only.

GitHub's cron runs in UTC and knows nothing about daylight saving. So the workflow wakes up
every 15 minutes across the widest UTC range either city could need, and this file decides,
using the real local time in Sydney and New York (zoneinfo handles daylight saving), whether
there is anything to do right now.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Dict, List, Optional
from zoneinfo import ZoneInfo

from .util import parse_iso


@dataclass(frozen=True)
class Market:
    key: str  # "asx" or "us"
    name: str
    tz: str
    open: time
    close: time
    # Keep fetching intraday bars a little after the close so we catch the closing price
    # (Yahoo's data is delayed, and scheduled runs often start late).
    grace_minutes: int = 30
    # Daily closes are collected once this long after the close.
    daily_after_minutes: int = 45
    # If the day's close still isn't there this long after the close, assume a public holiday.
    holiday_after_minutes: int = 240

    @property
    def zone(self) -> ZoneInfo:
        return ZoneInfo(self.tz)


ASX = Market("asx", "ASX", "Australia/Sydney", time(10, 0), time(16, 10))
NYSE = Market("us", "NYSE", "America/New_York", time(9, 30), time(16, 0))
MARKETS = {"asx": ASX, "us": NYSE}

MACRO_EVERY = timedelta(hours=20)
MACRO_RETRY_AFTER_FAIL = timedelta(hours=2)
PROXIES_EVERY = timedelta(days=6)


def local(market: Market, now: datetime) -> datetime:
    return now.astimezone(market.zone)


def is_weekday(d: date) -> bool:
    return d.weekday() < 5


def _at(market: Market, d: date, t: time) -> datetime:
    return datetime.combine(d, t, tzinfo=market.zone)


def market_open_now(market: Market, now: datetime) -> bool:
    """True during the trading session (local time, weekdays). Public holidays aren't known here;
    on a holiday Yahoo just returns no bars for today and nothing is written."""
    loc = local(market, now)
    if not is_weekday(loc.date()):
        return False
    return market.open <= loc.time() <= market.close


def intraday_due(market: Market, now: datetime) -> bool:
    loc = local(market, now)
    if not is_weekday(loc.date()):
        return False
    start = _at(market, loc.date(), market.open)
    end = _at(market, loc.date(), market.close) + timedelta(minutes=market.grace_minutes)
    return start <= loc <= end


def latest_closed_session(market: Market, now: datetime) -> date:
    """The most recent weekday whose close (plus a settling margin) has passed."""
    loc = local(market, now)
    d = loc.date()
    while True:
        if is_weekday(d) and _at(market, d, market.close) + timedelta(minutes=market.daily_after_minutes) <= loc:
            return d
        d -= timedelta(days=1)


def assume_holiday(market: Market, session: date, now: datetime) -> bool:
    """Has so much time passed since `session`'s close that a missing close means a holiday?"""
    return local(market, now) >= _at(market, session, market.close) + timedelta(minutes=market.holiday_after_minutes)


def _older_than(stamp: Optional[str], now: datetime, age: timedelta) -> bool:
    t = parse_iso(stamp)
    return t is None or now - t >= age


def due_tasks(now: datetime, tasks: Dict[str, dict]) -> List[str]:
    """Which jobs should run now, given what meta.json says ran before."""
    due: List[str] = []
    for m in (ASX, NYSE):
        if intraday_due(m, now):
            due.append(f"intraday_{m.key}")
        done_for = tasks.get(f"daily_{m.key}", {}).get("forDate")
        if done_for is None or done_for < latest_closed_session(m, now).isoformat():
            due.append(f"daily_{m.key}")
    macro = tasks.get("macro", {})
    if _older_than(macro.get("lastSuccess"), now, MACRO_EVERY) and (
        macro.get("lastError") is None or _older_than(macro.get("lastAttempt"), now, MACRO_RETRY_AFTER_FAIL)
    ):
        due.append("macro")
    proxies = tasks.get("proxies", {})
    if _older_than(proxies.get("lastSuccess"), now, PROXIES_EVERY) and (
        proxies.get("lastError") is None or _older_than(proxies.get("lastAttempt"), now, MACRO_RETRY_AFTER_FAIL)
    ):
        due.append("proxies")
    return due
