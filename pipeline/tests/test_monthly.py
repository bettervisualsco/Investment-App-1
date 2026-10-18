"""The maths behind data/monthly.json, checked against hand-worked examples."""

import math

import pytest

from datapipe import monthly as mo


def test_changes_from_levels_needs_consecutive_months():
    s = mo.changes_from_levels([("2020-01", 100), ("2020-02", 110), ("2020-04", 121)])
    assert s == {"2020-02": pytest.approx(0.10)}


def test_fill_gaps_spreads_the_change_evenly():
    levels, filled = mo.fill_gaps([("2025-09", 100.0), ("2025-11", 121.0), ("2025-12", 121.0)])
    assert filled == ["2025-10"]
    assert dict(levels)["2025-10"] == pytest.approx(110.0)  # 10% then 10%
    ch = mo.changes_from_levels(levels)
    assert ch["2025-10"] == pytest.approx(0.1) and ch["2025-11"] == pytest.approx(0.1)


def test_par_bond_return_flat_yields_earns_the_coupon():
    # Yield unchanged at 6%: one month earns about 0.5% (6% / 12).
    r = mo.par_bond_return(6.0, 6.0, 10)
    assert r == pytest.approx(0.005, abs=0.0001)


def test_par_bond_return_falls_when_yields_rise():
    # A 1 percentage-point jump on a ~10-year bond (duration about 7.4) loses roughly 7%.
    r = mo.par_bond_return(5.0, 6.0, 10)
    assert -0.075 < r < -0.065
    assert mo.par_bond_return(5.0, 4.0, 10) > 0.07
    # A 5-year bond is less sensitive
    assert -0.045 < mo.par_bond_return(5.0, 6.0, 5) < -0.035


def test_currency_conversion():
    fx = {"2020-02": 0.05}  # A$ rose 5% against the US$
    usd = {"2020-02": 0.10}
    aud = mo.to_currency(usd, fx, "USD", "AUD")
    assert aud["2020-02"] == pytest.approx(1.10 / 1.05 - 1)
    back = mo.to_currency(aud, fx, "AUD", "USD")
    assert back["2020-02"] == pytest.approx(0.10)
    assert mo.to_currency({"2019-01": 0.1}, fx, "USD", "AUD") == {}  # no exchange rate, no value


def test_splice_takes_each_piece_only_in_its_range():
    a = {"2000-01": 1.0, "2000-02": 1.0, "2000-03": 1.0}
    b = {"2000-02": 2.0, "2000-03": 2.0, "2000-04": 2.0}
    assert mo.splice((a, None, "2000-02"), (b, "2000-03", None)) == {"2000-01": 1.0, "2000-02": 1.0, "2000-03": 2.0, "2000-04": 2.0}


def test_encode_marks_gaps():
    start, vals = mo.encode({"2000-01": 0.01234, "2000-03": -0.5})
    assert start == "2000-01" and vals == [1234, None, -50000]


def test_quarterly_cpi_is_spread_over_three_months():
    inflation = {
        "series": {
            "au_cpi_q": {"t": ["2000-Q1", "2000-Q2"], "v": [100.0, 103.0]},
            "au_cpi_m": {"t": ["2024-04", "2024-05"], "v": [150.0, 151.5]},
        }
    }
    s, monthly_from = mo.au_cpi_monthly(inflation)
    assert monthly_from == "2024-05"
    q2 = [s["2000-04"], s["2000-05"], s["2000-06"]]
    assert q2[0] == q2[1] == q2[2]
    assert math.prod(1 + x for x in q2) == pytest.approx(1.03)
    assert s["2024-05"] == pytest.approx(0.01)


def test_proxy_check_on_identical_series():
    s = {f"20{10 + i // 12:02d}-{i % 12 + 1:02d}": 0.01 * ((i % 5) - 2) for i in range(36)}
    c = mo.proxy_check(s, s)
    assert c["correlation"] == pytest.approx(1.0) and c["trackingError"] == pytest.approx(0.0)
    assert mo.proxy_check({"2020-01": 0.1}, {"2020-01": 0.1}) is None  # too short to judge


def test_fee_is_taken_off_proxy_months():
    # 0.12% a year = 0.01% a month: a 1% month becomes 1.01 * 0.9999 - 1
    r, fee = 0.01, 0.0012 / 12
    assert (1 + r) * (1 - fee) - 1 == pytest.approx(0.0098990)
