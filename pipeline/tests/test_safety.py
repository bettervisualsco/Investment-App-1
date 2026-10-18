"""The safety rules: good data must never be replaced by empty, short, old or broken data."""

import json
from datetime import date, datetime, timedelta, timezone

import pytest

from datapipe import safety
from datapipe.config import Ticker
from datapipe.meta import Meta
from datapipe.prices import daily_file, intraday_file, repair_history
from datapipe.safety import ValidationError, save_validated, validate_daily, validate_intraday, validate_monthly
from datapipe.schedule import ASX
from datapipe.sources.yahoo import Bars, DailyHistory

ETF = Ticker(id="TEST", yahoo="TEST.AX", name="Test ETF", kind="etf", market="asx", currency="AUD")


def history(n=300, start="2020-01-01", price=100.0, step=0.1):
    d0 = date.fromisoformat(start)
    dates, close = [], []
    day = d0
    while len(dates) < n:
        if day.weekday() < 5:
            dates.append(day.isoformat())
            close.append(price + step * len(close))
        day += timedelta(days=1)
    return DailyHistory("TEST.AX", dates=dates, close=close, adj=list(close))


def test_daily_file_round_trips_dates():
    h = history(50)
    f = daily_file(ETF, h)
    assert safety.daily_dates(f) == h.dates
    validate_daily(f, None)


@pytest.mark.parametrize(
    "breaker, message",
    [
        (lambda f: f.update(c=[], d=[]), "empty"),
        (lambda f: f["c"].__setitem__(5, float("nan")), "bad price"),
        (lambda f: f["c"].__setitem__(5, -1.0), "bad price"),
        (lambda f: f["c"].__setitem__(5, 0), "bad price"),
        (lambda f: f["d"].__setitem__(3, 0), "not in order"),
        (lambda f: f["c"].pop(), "different lengths"),
    ],
)
def test_broken_daily_files_are_rejected(breaker, message):
    f = daily_file(ETF, history(50))
    breaker(f)
    with pytest.raises(ValidationError, match=message):
        validate_daily(f, None)


def test_new_data_must_not_be_older_or_shorter_than_saved():
    old = daily_file(ETF, history(300))
    older = daily_file(ETF, history(200))  # same start, ends earlier
    with pytest.raises(ValidationError, match="older than saved"):
        validate_daily(older, old)
    cut = daily_file(ETF, history(250, start="2020-03-02"))  # history starting much later
    with pytest.raises(ValidationError):
        validate_daily(cut, old)
    validate_daily(daily_file(ETF, history(301)), old)  # one more day is fine


def test_changed_history_is_rejected_unless_a_split_explains_it():
    old = daily_file(ETF, history(300))
    h = history(301)
    h.close = [c * 2 for c in h.close]
    with pytest.raises(ValidationError, match="changed by more than 3%"):
        validate_daily(daily_file(ETF, h), old)
    h.splits = [(h.dates[-1], 0.5)]
    validate_daily(daily_file(ETF, h), old)


def test_save_validated_keeps_the_old_file_when_the_new_one_is_bad(tmp_path):
    good = daily_file(ETF, history(100))
    assert save_validated("daily/TEST.json", good, validate_daily, data_dir=tmp_path) == "written"
    before = (tmp_path / "daily/TEST.json").read_text()
    bad = daily_file(ETF, history(100))
    bad["c"][10] = -5
    with pytest.raises(ValidationError):
        save_validated("daily/TEST.json", bad, validate_daily, data_dir=tmp_path)
    with pytest.raises(ValidationError):
        save_validated("daily/TEST.json", None, validate_daily, data_dir=tmp_path)
    assert (tmp_path / "daily/TEST.json").read_text() == before
    assert save_validated("daily/TEST.json", good, validate_daily, data_dir=tmp_path) == "unchanged"
    assert not [p for p in (tmp_path / "daily").iterdir() if p.name.startswith(".tmp")]


def test_monthly_validation():
    ok = {"scale": 100000, "series": {"x": {"kind": "return", "values": [100, None, -2000]}}}
    validate_monthly(ok, None)
    with pytest.raises(ValidationError, match="out of range"):
        validate_monthly({"scale": 100000, "series": {"x": {"kind": "return", "values": [90000]}}}, None)
    with pytest.raises(ValidationError, match="empty"):
        validate_monthly({"scale": 100000, "series": {"x": {"kind": "return", "values": []}}}, None)
    old = {"scale": 100000, "series": {"x": {"kind": "return", "values": [1] * 100}, "y": {"kind": "fx", "values": [1]}}}
    with pytest.raises(ValidationError, match="disappeared"):
        validate_monthly({"scale": 100000, "series": {"x": {"kind": "return", "values": [1] * 100}}}, old)
    shorter = {"scale": 100000, "series": {"x": {"kind": "return", "values": [1] * 90}, "y": {"kind": "fx", "values": [1]}}}
    with pytest.raises(ValidationError, match="shorter"):
        validate_monthly(shorter, old)


def test_intraday_validation():
    with pytest.raises(ValidationError):
        validate_intraday({"quotes": {}}, None)
    with pytest.raises(ValidationError):
        validate_intraday({"quotes": {"VAS": {"price": 0}}}, None)
    with pytest.raises(ValidationError, match="older trading day"):
        validate_intraday({"session": "2026-01-01", "quotes": {"VAS": {"price": 1}}}, {"session": "2026-01-02"})


def test_repair_drops_single_bad_day_and_rescales_unrecorded_split():
    h = history(30, price=150.0, step=0)
    h.close[10] = h.adj[10] = 2000.0  # one glitch day
    for k in range(20, 30):  # an unrecorded 15-for-1 split from day 20
        h.close[k] = h.adj[k] = 10.0
    notes = repair_history(h)
    assert len(h.close) == 29
    assert all(abs(c - 10.0) < 1e-9 for c in h.close)
    assert any("dropped" in n for n in notes) and any("divided by 15" in n for n in notes)


def test_repair_leaves_normal_moves_and_recorded_splits_alone():
    h = history(30, price=100.0, step=0)
    for k in range(15, 30):
        h.close[k] = h.adj[k] = 70.0  # a 30% crash is real, not a glitch
    assert repair_history(h) == [] and h.close[20] == 70.0
    h = history(30, price=100.0, step=0)
    for k in range(15, 30):
        h.close[k] = h.adj[k] = 50.0
    h.splits = [(h.dates[15], 2.0)]
    assert repair_history(h) == []


def test_asx_distribution_gap_is_flagged():
    h = history(800, start="2009-05-01")
    h.dividends = [(h.dates[700], 0.5)]  # Yahoo's records start ~2.7 years after listing
    f = daily_file(ETF, h)
    assert f["trFrom"] == h.dates[700] and "trNote" in f


def test_intraday_only_writes_today(tmp_path, monkeypatch):
    monkeypatch.setattr("datapipe.prices.DATA_DIR", tmp_path)
    now = datetime(2026, 7, 16, 2, 0, tzinfo=timezone.utc)  # 12:00 Sydney Thursday
    start = int(datetime(2026, 7, 16, 0, 0, tzinfo=timezone.utc).timestamp())  # 10:00 Sydney
    today = Bars("TEST.AX", times=[start, start + 300, start + 900], close=[10.0, 10.1, 10.2])
    f = intraday_file(ASX, [ETF], {"TEST.AX": today}, now)
    assert f["session"] == "2026-07-16" and f["quotes"]["TEST"]["price"] == 10.2
    assert f["bars"]["TEST"]["c"] == [10.0, 10.1, None, 10.2]  # missing 10:10 bar left empty
    yesterday = Bars("TEST.AX", times=[start - 86400], close=[9.0])
    assert intraday_file(ASX, [ETF], {"TEST.AX": yesterday}, now) is None


def test_meta_keeps_update_time_when_file_is_unchanged(tmp_path):
    (tmp_path / "a.json").write_text(json.dumps({"asOf": "2026-01-01"}))
    t1 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    m = Meta(tmp_path)
    m.save(t1)
    m2 = Meta(tmp_path)
    m2.save(t1 + timedelta(hours=1))
    saved = json.loads((tmp_path / "meta.json").read_text())
    assert saved["files"]["a.json"]["updatedAt"] == "2026-01-01T00:00:00Z"
    assert saved["files"]["a.json"]["asOf"] == "2026-01-01"
    (tmp_path / "a.json").write_text(json.dumps({"asOf": "2026-01-02"}))
    Meta(tmp_path).save(t1 + timedelta(hours=2))
    saved = json.loads((tmp_path / "meta.json").read_text())
    assert saved["files"]["a.json"]["updatedAt"] == "2026-01-01T02:00:00Z"


def test_source_failure_is_recorded_without_losing_last_success(tmp_path):
    m = Meta(tmp_path)
    t = datetime(2026, 1, 1, tzinfo=timezone.utc)
    m.source_ok("abs", t)
    m.source_failed("abs", RuntimeError("timeout"), t + timedelta(days=1))
    s = m.sources["abs"]
    assert s["status"] == "error" and s["lastSuccess"] == "2026-01-01T00:00:00Z" and s["failures"] == 1
    assert "timeout" in m.problems[0]["message"]
