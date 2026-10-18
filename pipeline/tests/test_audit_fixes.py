"""Fixes from the October 2026 accuracy audit: each check here failed before its fix."""

from datetime import datetime, timedelta, timezone

import pytest

import run
from datapipe import macro, prices
from datapipe.config import Ticker
from datapipe.etfs import build as build_etfs
from datapipe.meta import Meta
from datapipe.sources.yahoo import DailyHistory

NOW = datetime(2026, 10, 18, 9, 0, tzinfo=timezone.utc)


def etf(id="IVV", market="asx", info=None):
    return Ticker(id=id, yahoo=f"{id}.AX", name=f"{id} ETF", kind="etf", market=market, currency="AUD", info=info or {})


def hist(dates, close, adj=None):
    return DailyHistory("X", dates=list(dates), close=list(close), adj=list(adj or close))


# ---- inflation.json asOf -----------------------------------------------------------------


def test_as_of_compares_quarters_and_months_by_their_last_month():
    # "Q" sorts after the digits, so a plain max() said 2026-Q2 was newer than Sep 2026.
    assert max(["2026-Q2", "2026-08", "2026-09"]) == "2026-Q2"
    assert macro.latest_period(["2026-Q2", "2026-08", "2026-09"]) == "2026-09"
    assert macro.latest_period(["2026-Q3", "2026-08"]) == "2026-09"
    assert macro.period_end_month("2026-Q4") == "2026-12"
    assert macro.period_end_month("2026-09-30") == "2026-09"


# ---- daily job "done" date ----------------------------------------------------------------


def test_daily_job_is_done_only_when_every_etf_has_the_close():
    # An index closed on Friday but one ETF still only has Thursday: not done yet.
    assert prices.latest_complete(["2026-10-16", "2026-10-15"], ["2026-10-16"]) == "2026-10-15"
    assert prices.latest_complete(["2026-10-16", "2026-10-16"], ["2026-10-15"]) == "2026-10-16"
    assert prices.latest_complete(["2026-10-16", ""], []) is None  # an ETF with no file at all
    assert prices.latest_complete([], ["2026-10-14", "2026-10-16"]) == "2026-10-16"


# ---- AUD/USD daily --------------------------------------------------------------------------


def test_weekend_fx_rows_are_dropped():
    h = hist(["2026-10-15", "2026-10-16", "2026-10-18"], [0.6978, 0.6947, 0.6949])  # 18 Oct 2026 is a Sunday
    assert prices.drop_weekends(h) == ["2026-10-18"]
    assert h.dates == ["2026-10-15", "2026-10-16"] and h.close == [0.6978, 0.6947] and h.adj == h.close


def test_fx_history_comes_from_the_rba_with_yahoo_only_for_newer_weekdays(monkeypatch, tmp_path):
    from datapipe.sources import official

    monkeypatch.setattr(prices, "read_static", lambda name: [{"date": "2022-12-29", "audusd": "0.6751"}, {"date": "2022-12-30", "audusd": "0.6775"}])
    rba = [(f"2023-{m:02d}-{d:02d}", 0.68) for m in range(1, 7) for d in range(1, 21)]  # enough rows to pass the size check
    rba += [("2026-10-15", 0.6978), ("2026-10-16", 0.6947)]
    monkeypatch.setattr(official, "rba_table", lambda table: {"FXRUSD": rba})
    yahoo_rows = hist(["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-19"], [0.69783, 0.69185, 0.69, 0.6951])
    monkeypatch.setattr(prices.yahoo, "daily", lambda sym: (yahoo_rows, None))
    t = Ticker(id="AUDUSD", yahoo="AUDUSD=X", name="AUD/USD", kind="fx", market="asx", currency="USD")
    h, approx_from = prices.rba_fx_history(t, Meta(tmp_path), NOW)
    assert h.dates[0] == "2022-12-29"
    assert dict(zip(h.dates, h.close))["2026-10-16"] == 0.6947  # RBA's 4pm rate, not Yahoo's 0.69185
    assert h.dates[-1] == "2026-10-19" and approx_from == "2026-10-19"  # Saturday 17th dropped
    f = prices.daily_file(t, h, approx_from)
    assert f["approxFrom"] == "2026-10-19" and "RBA" in f["source"] and "a" not in f


# ---- task notes -----------------------------------------------------------------------------


def test_task_note_is_cleared_by_a_run_without_one(tmp_path):
    m = Meta(tmp_path)
    m.task_done("daily_asx", NOW, forDate="2026-01-26", note="no close for 2026-01-26 (public holiday?)")
    assert m.tasks["daily_asx"]["note"]
    m.task_done("daily_asx", NOW + timedelta(days=1), forDate="2026-01-27")
    assert "note" not in m.tasks["daily_asx"]
    assert m.tasks["daily_asx"]["forDate"] == "2026-01-27"


# ---- ETF rows before listing, corrections, stuck prices ----------------------------------------------


def test_rows_before_the_listing_date_are_dropped():
    t = etf("VAS", info={"listed": {"value": "2009-05-08"}})
    h = hist(["2009-05-01", "2009-05-04", "2009-05-08", "2009-05-11"], [50.0, 50.0, 50.61, 51.0])
    h.dividends = [("2009-05-04", 0.1), ("2009-07-01", 0.5)]
    notes = prices.trim_before_listing(t, h)
    assert h.dates == ["2009-05-08", "2009-05-11"] and h.close == [50.61, 51.0]
    assert h.dividends == [("2009-07-01", 0.5)]
    assert "2009-05-01 to 2009-05-04" in notes[0]
    assert prices.trim_before_listing(etf("VOO"), h) == []  # no listing date recorded: nothing dropped


def test_corrections_replace_the_close_and_scale_the_adjusted_close():
    t = etf("IVV")
    h = hist(["2022-12-07", "2022-12-08", "2022-12-09"], [39.35, 39.35, 39.35], [37.49, 37.49, 37.49])
    fixes = [
        {"id": "IVV", "date": "2022-12-08", "close": 39.10, "replaces": 39.35},
        {"id": "IVV", "date": "2022-12-09", "close": 39.09, "replaces": 39.35},
        {"id": "VAS", "date": "2022-12-09", "close": 1.0, "replaces": 2.0},  # other ETF: ignored
    ]
    notes, problems = prices.apply_corrections(t, h, fixes)
    assert h.close == [39.35, 39.10, 39.09]
    assert h.adj[1] == pytest.approx(37.49 * 39.10 / 39.35)
    assert notes and not problems
    # Re-applied after the next download: the same result, still only once per day.
    again = hist(h.dates, [39.35, 39.35, 39.35], [37.49, 37.49, 37.49])
    prices.apply_corrections(t, again, fixes)
    assert again.close == h.close


def test_corrections_are_skipped_when_yahoo_no_longer_shows_the_wrong_value():
    t = etf("IVV")
    fixes = [{"id": "IVV", "date": "2022-12-08", "close": 39.10, "replaces": 39.35}]
    fixed_by_yahoo = hist(["2022-12-08"], [39.10])
    assert prices.apply_corrections(t, fixed_by_yahoo, fixes) == ([], [])
    rescaled = hist(["2022-12-08"], [19.675])  # e.g. a later 2-for-1 split rescaled Yahoo's history
    notes, problems = prices.apply_corrections(t, rescaled, fixes)
    assert rescaled.close == [19.675] and not notes and "not applied" in problems[0]


def test_stuck_closes_are_flagged_only_while_the_index_moves():
    dates = [f"2022-12-{d:02d}" for d in (5, 6, 7, 8, 9, 12, 13)]
    h = hist(dates, [39.7, 39.35, 39.35, 39.35, 39.35, 39.35, 39.42])
    index_moving = dict(zip(dates, [7300, 7310, 7250, 7200, 7150, 7210, 7280]))
    msgs = prices.check_flat_runs(etf("IVV"), h, index_moving, "ASX 200", [])
    assert len(msgs) == 1 and "5 trading days (2022-12-06 to 2022-12-12)" in msgs[0]
    index_flat = {d: 7000.0 for d in dates}
    assert prices.check_flat_runs(etf("IVV"), h, index_flat, "ASX 200", []) == []
    checked = [{"id": "IVV", "from": "2022-12-06", "to": "2022-12-12"}]
    assert prices.check_flat_runs(etf("IVV"), h, index_moving, "ASX 200", checked) == []
    assert prices.flat_runs([1, 1, 1, 1, 2]) == []  # 4 in a row is fine


def test_problem_once_does_not_repeat_the_same_message(tmp_path):
    m = Meta(tmp_path)
    assert m.problem_once("yahoo", "IVV: close stuck", NOW)
    assert not m.problem_once("yahoo", "IVV: close stuck", NOW + timedelta(hours=1))
    assert len(m.problems) == 1


# ---- GitHub 60-day warning -------------------------------------------------------------------------


def test_quiet_repo_warning_is_logged_once_per_quiet_spell(tmp_path):
    m = Meta(tmp_path)
    last = NOW - timedelta(days=50)
    for k in range(60):  # a day of runs
        run.record_repo_activity(m, NOW + timedelta(minutes=15 * k), last)
    warnings = [p for p in m.problems if p["where"] == "github"]
    assert len(warnings) == 1
    assert m.repo == {"lastCommit": "2026-08-29T09:00:00Z", "daysSinceCommit": 50}
    # other problems in between don't bring it back
    m.problem("yahoo", "something else", NOW)
    run.record_repo_activity(m, NOW + timedelta(days=1), last)
    assert len([p for p in m.problems if p["where"] == "github"]) == 1
    # a commit, then a new quiet spell: warned again
    later_last = NOW + timedelta(days=10)
    run.record_repo_activity(m, later_last + timedelta(days=46), later_last)
    assert len([p for p in m.problems if p["where"] == "github"]) == 2
    # under 45 days: no warning, but lastCommit is still written
    m2 = Meta(tmp_path / "x")
    run.record_repo_activity(m2, NOW, NOW - timedelta(days=3))
    assert m2.problems == [] and m2.repo == {"lastCommit": "2026-10-15T09:00:00Z", "daysSinceCommit": 3}


# ---- etfs.json ---------------------------------------------------------------------------------------


def test_etfs_json_keeps_the_name_fact_and_listing_date():
    name = {"value": "New Name ETF", "note": "Renamed from Old Name ETF", "checkedOn": "2026-10-18", "source": "https://example.org"}
    listed = {"value": "2014-11-20", "checkedOn": "2026-10-18", "source": "https://example.org/asx"}
    t = etf("VGS", info={"name": name, "listed": listed})
    t.name = "New Name ETF"
    e = build_etfs([t])["etfs"][0]
    assert e["name"] == "New Name ETF" and e["nameInfo"] == name and e["listed"] == listed
