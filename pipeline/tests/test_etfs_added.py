"""The October 2026 watchlist additions: categories, the gold series, distribution corrections, and
checks that every ETF in pipeline/tickers.json is set up completely."""

import io
import json
from datetime import date

import pytest

from datapipe import monthly, prices
from datapipe.config import CATEGORIES, PROXY_SERIES, Ticker, load_tickers
from datapipe.etfs import build as build_etfs
from datapipe.sources.yahoo import DailyHistory
from datapipe.static_build import read_static
from datapipe.util import PIPELINE_DIR, month_num


def etf(id="VTS", info=None, category="Global shares"):
    return Ticker(id=id, yahoo=f"{id}.AX", name=f"{id} ETF", kind="etf", market="asx", currency="AUD", info=info or {}, category=category)


# ---- every ETF in tickers.json ------------------------------------------------------------------


def test_every_etf_has_a_category_a_valid_proxy_and_checked_facts():
    tickers = [t for t in load_tickers() if t.kind == "etf"]
    assert len(tickers) >= 33
    for t in tickers:
        assert t.category in CATEGORIES, t.id
        assert t.proxy and abs(sum(c.weight for c in t.proxy) - 1) < 1e-9, t.id
        assert all(c.series in PROXY_SERIES for c in t.proxy), t.id
        assert t.mer is not None, f"{t.id}: no management fee in etf_info"
        for key in ("name", "index", "mer", "yield", "franking", "exchange", "currency", "inception", "distributions"):
            fact = t.info.get(key)
            assert isinstance(fact, dict) and "value" in fact and fact.get("checkedOn") and fact.get("source", "").startswith("http"), f"{t.id}.{key}"
        if t.market == "asx":
            listed = t.info["listed"]["value"]
            assert date.fromisoformat(listed) and "markitdigital" in t.info["listed"]["source"], t.id
        if t.category == "Currency-hedged":
            assert all(c.hedged for c in t.proxy if c.series != "au_shares"), t.id
        if "allocation" in t.info:
            assert abs(sum(t.info["allocation"]["value"].values()) - 100) < 1e-6, t.id


def test_vanguard_diversified_proxies_match_their_published_allocations():
    """Shares: Australian -> au_shares; international unhedged + small companies + emerging markets ->
    global_shares; hedged international -> global_shares hedged. Bonds: Australian -> au_bonds,
    international (hedged) -> us_bonds hedged; cash -> cash_au."""
    t = {x.id: x for x in load_tickers()}
    for id in ("VDHG", "VDGR", "VDBA", "VDCO"):
        a = t[id].info["allocation"]["value"]
        w = {}
        for c in t[id].proxy:
            k = (c.series, c.hedged)
            w[k] = w.get(k, 0) + c.weight * 100
        assert w.get(("au_shares", False), 0) == pytest.approx(a["Australian shares"]), id
        unhedged = a["International shares (unhedged)"] + a["International small companies"] + a["Emerging markets shares"]
        assert w.get(("global_shares", False), 0) == pytest.approx(unhedged), id
        assert w.get(("global_shares", True), 0) == pytest.approx(a["International shares (hedged to AUD)"]), id
        assert w.get(("au_bonds", False), 0) == pytest.approx(a["Australian bonds"]), id
        assert w.get(("us_bonds", True), 0) == pytest.approx(a["International bonds (hedged to AUD)"]), id
        assert w.get(("cash_au", False), 0) == pytest.approx(a.get("Cash", 0)), id


def test_a_missing_or_unknown_category_is_refused(tmp_path):
    cfg = json.loads((PIPELINE_DIR / "tickers.json").read_text())
    cfg["etfs"] = [dict(cfg["etfs"][0])]
    cfg["etfs"][0].pop("category")
    p = tmp_path / "tickers.json"
    p.write_text(json.dumps(cfg))
    with pytest.raises(RuntimeError, match="needs a category"):
        load_tickers(p)
    cfg["etfs"][0]["category"] = "Shares"
    p.write_text(json.dumps(cfg))
    with pytest.raises(RuntimeError, match="needs a category"):
        load_tickers(p)
    cfg["etfs"][0].update(category="Gold", proxy=[{"series": "silver", "weight": 1}])
    p.write_text(json.dumps(cfg))
    with pytest.raises(RuntimeError, match="unknown proxy series silver"):
        load_tickers(p)


def test_etfs_json_carries_the_category():
    out = build_etfs([etf("GOLD", category="Gold")])
    assert out["etfs"][0]["category"] == "Gold"


# ---- gold -------------------------------------------------------------------------------------


def test_frozen_world_bank_gold_file_is_complete():
    rows = read_static(monthly.GOLD_STATIC)
    months = [r["month"] for r in rows]
    assert months[0] == "1960-01" and months[-1] >= "2026-09"
    assert all(month_num(b) == month_num(a) + 1 for a, b in zip(months, months[1:])), "a month is missing"
    v = {r["month"]: float(r["usd_per_oz"]) for r in rows}
    assert all(x > 0 for x in v.values())
    # Known monthly averages (London PM fix): US$35 under Bretton Woods; Jan 1980 spike ~US$675;
    # Aug 2011 ~US$1,760; Dec 2015 low ~US$1,068.
    assert v["1965-06"] == 35
    assert v["1980-01"] == pytest.approx(675, abs=3)
    assert v["2011-08"] == pytest.approx(1760, rel=0.01)
    assert v["2015-12"] == pytest.approx(1068, rel=0.01)


def test_gold_series_starts_with_the_free_market_and_uses_the_etf_after_the_frozen_copy():
    rows = [{"month": m, "usd_per_oz": p} for m, p in [("1968-02", "35"), ("1968-03", "37"), ("1968-04", "38"), ("1968-05", "41"), ("1968-06", "41")]]
    etf_usd = {"1968-05": 0.5, "1968-06": 0.5, "1968-07": 0.02}
    s, end = monthly.gold_series(rows, etf_usd)
    assert end == "1968-06"
    assert list(s) == ["1968-04", "1968-05", "1968-06", "1968-07"]  # nothing before GOLD_FROM (1968-04)
    assert s["1968-04"] == pytest.approx(38 / 37 - 1)
    assert s["1968-06"] == 0  # World Bank months win over the ETF
    assert s["1968-07"] == 0.02  # then the ETF


def test_gold_rows_reads_the_pink_sheet_layout():
    openpyxl = pytest.importorskip("openpyxl")
    from datapipe.static_build import gold_rows

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Monthly Prices"
    ws.append(["World Bank Commodity Price Data (The Pink Sheet)"])
    ws.append([None, "Crude oil, average", "Gold", "Silver"])
    ws.append([None, "($/bbl)", "($/troy oz)", "($/troy oz)"])
    for i in range(700):
        ws.append([f"{1960 + i // 12}M{i % 12 + 1:02d}", 1.6, 35 + i, 0.9])
    buf = io.BytesIO()
    wb.save(buf)
    rows = gold_rows(buf.getvalue())
    assert rows[0] == ["1960-01", 35] and rows[-1][1] == 734 and len(rows) == 700


# ---- distribution corrections ------------------------------------------------------------------


def hist(dates, close, adj, divs):
    return DailyHistory("X", dates=list(dates), close=list(close), adj=list(adj), dividends=list(divs))


def test_a_missing_distribution_is_added_and_older_adjusted_closes_rescaled():
    h = hist(["2026-09-25", "2026-09-26", "2026-09-29", "2026-09-30"], [100, 100, 98, 99], [90, 90, 98, 99], [("2026-06-26", 1.49)])
    notes, problems = prices.apply_distribution_corrections(etf(), h, [{"id": "VTS", "date": "2026-09-29", "amount": 2.0, "replaces": None}])
    assert problems == [] and len(notes) == 1
    f = 1 - 2.0 / 100  # Yahoo's factor: 1 - distribution / the close the day before the ex-date
    assert h.adj[:2] == pytest.approx([90 * f, 90 * f])
    assert h.adj[2:] == [98, 99]
    assert h.dividends == [("2026-06-26", 1.49), ("2026-09-29", 2.0)]


def test_a_wrong_distribution_amount_is_replaced():
    h = hist(["2026-06-30", "2026-07-01"], [130.0, 128.0], [120.0, 128.0], [("2026-07-01", 2.337369)])
    notes, problems = prices.apply_distribution_corrections(etf("VGAD"), h, [{"id": "VGAD", "date": "2026-07-01", "amount": 2.93507751, "replaces": 2.337369}])
    assert problems == [] and notes
    assert h.adj[0] == pytest.approx(120.0 * (1 - 2.93507751 / 130) / (1 - 2.337369 / 130))
    assert h.dividends == [("2026-07-01", 2.93507751)]


def test_distribution_fixes_step_aside_once_yahoo_changes():
    base = dict(id="VGAD", date="2026-07-01", amount=2.935, replaces=2.337)
    # Yahoo now has the right amount: nothing to do, nothing to report
    h = hist(["2026-06-30", "2026-07-01"], [130.0, 128.0], [120.0, 128.0], [("2026-07-01", 2.935)])
    assert prices.apply_distribution_corrections(etf("VGAD"), h, [base]) == ([], [])
    assert h.adj[0] == 120.0
    # Yahoo shows something else: skipped and reported
    h = hist(["2026-06-30", "2026-07-01"], [130.0, 128.0], [120.0, 128.0], [("2026-07-01", 2.5)])
    notes, problems = prices.apply_distribution_corrections(etf("VGAD"), h, [base])
    assert notes == [] and "not applied" in problems[0] and h.adj[0] == 120.0
    # A "missing" distribution Yahoo has since added under a nearby date: skipped and reported
    h = hist(["2026-09-26", "2026-09-29"], [100.0, 98.0], [90.0, 98.0], [("2026-09-30", 2.0)])
    notes, problems = prices.apply_distribution_corrections(etf(), h, [{"id": "VTS", "date": "2026-09-29", "amount": 2.0, "replaces": None}])
    assert notes == [] and "2026-09-30" in problems[0]


def test_a_distribution_the_issuer_never_paid_is_removed():
    h = hist(["2022-02-17", "2022-02-18", "2022-02-21"], [100.0, 99.9, 100.0], [90.0, 99.9, 100.0], [("2022-02-18", 0.15)])
    notes, problems = prices.apply_distribution_corrections(etf("IAF"), h, [{"id": "IAF", "date": "2022-02-18", "amount": 0, "replaces": 0.15}])
    assert problems == [] and "removed" in notes[0]
    assert h.dividends == []
    assert h.adj[0] == pytest.approx(90.0 / (1 - 0.15 / 100))
    # once Yahoo drops it too, nothing happens
    assert prices.apply_distribution_corrections(etf("IAF"), h, [{"id": "IAF", "date": "2022-02-18", "amount": 0, "replaces": 0.15}]) == ([], [])


def test_corrections_file_entries_are_well_formed():
    fixes = prices.load_corrections()
    ids = {t.id for t in load_tickers()}
    for c in fixes.get("closes", []):
        assert c["id"] in ids and c["close"] > 0 and c["replaces"] > 0 and c["source"].startswith("http") and c["checkedOn"]
    for c in fixes.get("distributions", []):
        assert c["id"] in ids and c["amount"] >= 0 and (c["replaces"] is None or c["replaces"] > 0) and c["source"].startswith("http") and c["checkedOn"]
        assert c["amount"] > 0 or c["replaces"], "a removal must say which Yahoo amount it removes"
    for c in fixes.get("checkedFlatRuns", []):
        assert c["id"] in ids and date.fromisoformat(c["from"]) and c.get("note")


def test_checked_tr_from_overrides_the_guess_from_the_first_distribution():
    h = hist(["2014-11-20", "2015-06-01", "2016-07-01"], [50.0, 52.0, 55.0], [50.0, 52.0, 55.0], [("2016-07-01", 0.72)])
    guessed = prices.daily_file(etf("VGAD"), h)
    assert guessed["trFrom"] == "2016-07-01" and "trNote" in guessed  # more than 400 days after the first row
    t = etf("VGAD")
    t.tr_from = "listing"
    checked = prices.daily_file(t, h)
    assert checked["trFrom"] == "2014-11-20" and "trNote" not in checked


def test_hedged_return_adds_the_gap_between_the_two_cash_rates():
    r = {"1990-01": 0.01, "1990-02": -0.02}
    cash_au = {"1990-01": 0.014, "1990-02": 0.014}  # ~17% a year
    cash_us = {"1990-01": 0.0066, "1990-02": 0.0066}  # ~8% a year
    h = monthly.hedged_return(r, cash_au, cash_us, "USD", "AUD")
    assert h["1990-01"] == pytest.approx(1.01 * 1.014 / 1.0066 - 1)
    assert h["1990-02"] == pytest.approx(0.98 * 1.014 / 1.0066 - 1)
    # the other way round (an A$ asset hedged into US$) loses the gap
    assert monthly.hedged_return({"1990-01": 0.0}, cash_au, cash_us, "AUD", "USD")["1990-01"] == pytest.approx(1.0066 / 1.014 - 1)
    # months without both cash rates are left out
    assert monthly.hedged_return({"1990-03": 0.01}, cash_au, cash_us, "USD", "AUD") == {}
