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


def test_quarterly_cpi_sits_mid_quarter_and_months_between_grow_evenly():
    # Quarterly index = average of its 3 months, so it is placed at the quarter's middle month.
    inflation = {
        "series": {
            "au_cpi_q": {"t": ["2000-Q1", "2000-Q2", "2000-Q3"], "v": [100.0, 103.0, 103.0]},
            "au_cpi_m": {"t": ["2000-08", "2000-09"], "v": [104.0, 105.04]},
        }
    }
    s, monthly_from = mo.au_cpi_monthly(inflation)
    assert monthly_from == "2000-08"
    assert min(s) == "2000-03"  # first change: Feb (Q1's middle month) -> Mar
    step = [s["2000-03"], s["2000-04"], s["2000-05"]]  # Feb -> May, Q1 -> Q2
    assert step[0] == step[1] == step[2]
    assert math.prod(1 + x for x in step) == pytest.approx(1.03)
    assert s["2000-06"] == pytest.approx(0.0) and s["2000-07"] == pytest.approx(0.0)  # May -> Aug is flat (103 -> 103)
    # The first monthly month is measured from the chain's own level for the month before (Jul = 103),
    # not from the last monthly change: 104 / 103 - 1.
    assert s["2000-08"] == pytest.approx(104.0 / 103.0 - 1)
    assert s["2000-09"] == pytest.approx(0.01)
    # So the chain lands exactly on the published monthly index: Feb (Q1 = 100) -> Sep = 105.04.
    assert math.prod(1 + v for m, v in s.items() if m <= "2000-09") == pytest.approx(1.0504)


def test_monthly_cpi_switch_keeps_the_whole_quarterly_rise():
    # The audit case: the old method put Q1 2024 at March, so April only got a third of the rise.
    # Here the chain from the Q1 average (at Feb) to April equals the published ratio.
    inflation = {
        "series": {
            "au_cpi_q": {"t": ["2023-Q4", "2024-Q1", "2024-Q2"], "v": [97.0, 98.0, 99.0]},
            "au_cpi_m": {"t": ["2024-04", "2024-05"], "v": [99.02, 99.2]},
        }
    }
    s, monthly_from = mo.au_cpi_monthly(inflation)
    assert monthly_from == "2024-04"
    assert (1 + s["2024-03"]) * (1 + s["2024-04"]) == pytest.approx(99.02 / 98.0)
    assert "2024-06" not in s  # nothing after the monthly series ends


def test_fill_spread_gaps_uses_the_longer_yield_plus_an_interpolated_spread():
    short = [("2013-04", 2.0), ("2013-08", 3.0)]
    long = [("2013-04", 2.5), ("2013-05", 2.6), ("2013-06", 2.7), ("2013-07", 2.8), ("2013-08", 3.3)]
    filled, est = mo.fill_spread_gaps(short, long)
    assert est == ["2013-05", "2013-06", "2013-07"]
    # spread goes -0.5 -> -0.3 over 4 months: -0.45, -0.40, -0.35
    got = dict(filled)
    assert got["2013-05"] == pytest.approx(2.6 - 0.45)
    assert got["2013-06"] == pytest.approx(2.7 - 0.40)
    assert got["2013-07"] == pytest.approx(2.8 - 0.35)
    assert got["2013-04"] == 2.0 and got["2013-08"] == 3.0
    # no long yield for the hole -> left alone
    assert mo.fill_spread_gaps(short, [("2013-04", 2.5), ("2013-08", 3.3)]) == (short, [])


def test_proxy_check_on_identical_series():
    s = {f"20{10 + i // 12:02d}-{i % 12 + 1:02d}": 0.01 * ((i % 5) - 2) for i in range(36)}
    c = mo.proxy_check(s, s)
    assert c["correlation"] == pytest.approx(1.0) and c["trackingError"] == pytest.approx(0.0)
    assert mo.proxy_check({"2020-01": 0.1}, {"2020-01": 0.1}) is None  # too short to judge


def test_fee_is_taken_off_proxy_months():
    # 0.12% a year = 0.01% a month: a 1% month becomes 1.01 * 0.9999 - 1
    r, fee = 0.01, 0.0012 / 12
    assert (1 + r) * (1 - fee) - 1 == pytest.approx(0.0098990)
