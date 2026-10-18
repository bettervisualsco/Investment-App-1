"""Market hours and daylight saving. Sydney and New York change clocks on different dates,
and GitHub's cron only knows UTC, so these are easy to get wrong."""

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from datapipe import schedule as sch

UTC = timezone.utc


def utc(*a):
    return datetime(*a, tzinfo=UTC)


# ---- ASX: 10:00-16:10 Sydney --------------------------------------------------------------
# Sydney summer time (AEDT, UTC+11) ran until Sun 5 Apr 2026 and restarted Sun 4 Oct 2026.


@pytest.mark.parametrize(
    "when, expected",
    [
        (utc(2026, 1, 15, 23, 2), True),  # Fri 16 Jan 10:02 AEDT
        (utc(2026, 1, 15, 22, 47), False),  # 09:47 AEDT, before the open
        (utc(2026, 1, 16, 5, 9), True),  # 16:09 AEDT
        (utc(2026, 7, 15, 23, 2), False),  # Thu 16 Jul 09:02 AEST (winter) - not open yet
        (utc(2026, 7, 16, 0, 2), True),  # 10:02 AEST
        (utc(2026, 7, 16, 6, 9), True),  # 16:09 AEST
        (utc(2026, 7, 16, 6, 11), False),  # 16:11 AEST, after the close
        (utc(2026, 1, 17, 0, 2), False),  # Saturday in Sydney
        (utc(2026, 1, 18, 23, 2), True),  # Sunday in UTC but Monday 10:02 in Sydney
        (utc(2026, 4, 2, 23, 2), True),  # Fri 3 Apr, still AEDT
        (utc(2026, 4, 5, 23, 2), False),  # Mon 6 Apr 09:02 AEST (clocks went back the day before)
        (utc(2026, 4, 6, 0, 2), True),  # Mon 6 Apr 10:02 AEST
        (utc(2026, 10, 4, 23, 2), True),  # Mon 5 Oct 10:02 AEDT (clocks went forward on 4 Oct)
    ],
)
def test_asx_open(when, expected):
    assert sch.market_open_now(sch.ASX, when) is expected


# ---- NYSE: 9:30-16:00 New York -------------------------------------------------------------
# New York daylight time (EDT, UTC-4) runs 8 Mar 2026 - 1 Nov 2026.


@pytest.mark.parametrize(
    "when, expected",
    [
        (utc(2026, 1, 15, 14, 32), True),  # 09:32 EST
        (utc(2026, 1, 15, 13, 32), False),  # 08:32 EST
        (utc(2026, 1, 15, 20, 59), True),  # 15:59 EST
        (utc(2026, 7, 15, 13, 32), True),  # 09:32 EDT
        (utc(2026, 7, 15, 20, 1), False),  # 16:01 EDT
        (utc(2026, 3, 6, 13, 32), False),  # Fri 6 Mar 08:32 EST
        (utc(2026, 3, 9, 13, 32), True),  # Mon 9 Mar 09:32 EDT (clocks went forward on 8 Mar)
        (utc(2026, 11, 2, 13, 32), False),  # Mon 2 Nov 08:32 EST (clocks went back on 1 Nov)
        (utc(2026, 11, 2, 14, 32), True),
        (utc(2026, 1, 17, 15, 0), False),  # Saturday
    ],
)
def test_nyse_open(when, expected):
    assert sch.market_open_now(sch.NYSE, when) is expected


def test_three_weeks_where_only_new_york_has_changed_clocks():
    # 9-27 March 2026: New York is on EDT but Sydney is still on AEDT, so the gap is 15 hours not 16.
    now = utc(2026, 3, 10, 13, 35)
    assert sch.market_open_now(sch.NYSE, now)
    assert sch.local(sch.ASX, now).hour == 0  # 00:35 Wednesday in Sydney


def test_latest_closed_session():
    # Monday morning in Sydney: the last finished ASX session is Friday.
    assert sch.latest_closed_session(sch.ASX, utc(2026, 1, 18, 22, 0)).isoformat() == "2026-01-16"
    # 16:30 AEST: today's close isn't "settled" until 16:55.
    assert sch.latest_closed_session(sch.ASX, utc(2026, 7, 16, 6, 30)).isoformat() == "2026-07-15"
    assert sch.latest_closed_session(sch.ASX, utc(2026, 7, 16, 7, 2)).isoformat() == "2026-07-16"
    # New York 16:47 EST
    assert sch.latest_closed_session(sch.NYSE, utc(2026, 1, 15, 21, 47)).isoformat() == "2026-01-15"


def test_due_tasks():
    t = utc(2026, 7, 16, 0, 2)  # ASX open
    assert "intraday_asx" in sch.due_tasks(t, {})
    assert "intraday_us" not in sch.due_tasks(t, {})
    done = {
        "daily_asx": {"forDate": "2026-07-15"},
        "daily_us": {"forDate": "2026-07-15"},
        "macro": {"lastSuccess": "2026-07-15T23:00:00Z"},
        "proxies": {"lastSuccess": "2026-07-14T00:00:00Z"},
    }
    assert sch.due_tasks(t, done) == ["intraday_asx"]
    # macro failed recently: wait 2 hours before retrying
    failed = dict(done, macro={"lastSuccess": "2026-07-14T00:00:00Z", "lastAttempt": "2026-07-15T23:30:00Z", "lastError": "x"})
    assert "macro" not in sch.due_tasks(t, failed)
    assert "macro" in sch.due_tasks(t + timedelta(hours=2), failed)


# ---- the cron lines in the workflow cover every session, all year ------------------------------

WORKFLOW = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "update-data.yml"


def _field(spec, lo, hi):
    out = set()
    for part in spec.split(","):
        if part == "*":
            out |= set(range(lo, hi + 1))
        elif "-" in part:
            a, b = part.split("-")
            out |= set(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return out


def _crons():
    text = WORKFLOW.read_text()
    out = []
    for expr in re.findall(r"cron:\s*'([^']+)'", text):
        mi, hr, dom, mon, dow = expr.split()
        assert dom == "*" and mon == "*"
        out.append((_field(mi, 0, 59), _field(hr, 0, 23), _field(dow, 0, 6)))
    return out


def _fires(t, crons):
    cron_dow = (t.weekday() + 1) % 7  # cron: 0 = Sunday
    return any(t.minute in m and t.hour in h and cron_dow in d for m, h, d in crons)


def test_crons_cover_every_trading_session_all_year():
    crons = _crons()
    assert crons, "no cron lines found"
    fire_times = []
    t = utc(2025, 12, 31)
    while t < utc(2027, 1, 2):
        if _fires(t, crons):
            fire_times.append(t)
        t += timedelta(minutes=1)
    for market in (sch.ASX, sch.NYSE):
        day = datetime(2026, 1, 1).date()
        while day.year == 2026:
            if sch.is_weekday(day):
                open_ = datetime.combine(day, market.open, tzinfo=market.zone).astimezone(UTC)
                close = datetime.combine(day, market.close, tzinfo=market.zone).astimezone(UTC)
                runs = [f for f in fire_times if open_ <= f <= close + timedelta(minutes=market.grace_minutes)]
                assert runs, f"{market.name} {day}: no runs at all"
                assert runs[0] - open_ <= timedelta(minutes=16), f"{market.name} {day}: first run too late"
                gaps = [b - a for a, b in zip(runs, runs[1:])]
                assert max(gaps) <= timedelta(minutes=15), f"{market.name} {day}: gap in runs"
                # a run after the closing auction, still inside the intraday window
                assert any(close < f for f in runs), f"{market.name} {day}: no run after the close"
                # and a run once the day's close has settled (to save the daily close)
                settle = close + timedelta(minutes=market.daily_after_minutes)
                assert any(settle <= f <= settle + timedelta(hours=3) for f in fire_times), f"{market.name} {day}: no daily-close run"
            day += timedelta(days=1)
