"""Rebuild the frozen historical snapshots in pipeline/static/ (run by hand, rarely).

These sources no longer change, so we convert them once into small CSV files that are kept in
git. The scheduled job then never depends on these old Excel files still being online.

    python pipeline/run.py build-static      (needs: pip install -r pipeline/requirements-dev.txt)
"""

from __future__ import annotations

import csv
import io

from .sources.official import http_get
from .util import STATIC_DIR

SHILLER_URL = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"
RBA_FX_HIST = "https://www.rba.gov.au/statistics/tables/xls-hist/f11hist-1969-2009.xls"
RBA_BONDS_HIST = "https://www.rba.gov.au/statistics/tables/xls-hist/f02histhist.xls"
RBA_BONDS_DAILY_HIST = "https://www.rba.gov.au/statistics/tables/xls-hist/f02dhist.xls"


def _write(name: str, header, rows) -> None:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    with open(STATIC_DIR / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"wrote pipeline/static/{name}: {len(rows)} rows")


def shiller() -> None:
    import xlrd

    sh = xlrd.open_workbook(file_contents=http_get(SHILLER_URL)).sheet_by_name("Data")
    rows = []
    for r in range(8, sh.nrows):
        d = sh.cell_value(r, 0)
        if not isinstance(d, float):
            continue
        y, m = f"{d:.2f}".split(".")
        ym = f"{y}-{m}"
        if ym > "1953-12":
            break
        p, div, cpi, gs10 = (sh.cell_value(r, c) for c in (1, 2, 4, 6))
        rows.append([ym, p, div, cpi, gs10])
    _write("shiller_1871_1953.csv", ["month", "sp_price", "dividend_annual", "cpi", "gs10"], rows)


def _rba_xls(url: str, cols: dict, first_row: int) -> list:
    import xlrd

    sh = xlrd.open_workbook(file_contents=http_get(url)).sheet_by_name("Data")
    idx = {}
    for r in range(first_row):
        for c in range(sh.ncols):
            if sh.cell_value(r, c) in cols:
                idx[cols[sh.cell_value(r, c)]] = c
    rows = []
    for r in range(first_row, sh.nrows):
        d = sh.cell_value(r, 0)
        if not isinstance(d, float):
            continue
        day = xlrd.xldate_as_datetime(d, 0).date().isoformat()
        vals = [sh.cell_value(r, idx[k]) for k in sorted(idx)]
        rows.append([day] + ["" if v == "" else v for v in vals])
    return [sorted(idx)] + rows


def rba() -> None:
    fx = _rba_xls(RBA_FX_HIST, {"FXRUSD": "audusd"}, 11)
    _write("rba_audusd_monthly_1969_2009.csv", ["date"] + fx[0], fx[1:])
    bonds = _rba_xls(RBA_BONDS_HIST, {"FCMYGBAG5": "y05", "FCMYGBAG10": "y10"}, 11)
    _write("rba_bond_yields_monthly_1969_2013.csv", ["date"] + bonds[0], bonds[1:])
    # The monthly table above holds monthly AVERAGES. From 1995 the RBA has daily yields, so we
    # keep the last daily value in each month (a true end-of-month yield, better for returns).
    daily = _rba_xls(RBA_BONDS_DAILY_HIST, {"FCMYGBAG5D": "y05", "FCMYGBAG10D": "y10"}, 11)
    last = {}
    for row in daily[1:]:
        month = row[0][:7]
        cur = last.setdefault(month, [row[0], "", ""])
        for i in (1, 2):
            if row[i] != "":
                cur[0] = row[0]
                cur[i] = row[i]
    _write("rba_bond_yields_monthend_1995_2013.csv", ["date"] + daily[0], [last[m] for m in sorted(last)])


def main() -> None:
    shiller()
    rba()


def read_static(name: str) -> list:
    with open(STATIC_DIR / name, encoding="utf-8") as f:
        return list(csv.DictReader(io.StringIO(f.read())))
