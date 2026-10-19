"""Free official and academic sources (no account or key needed). See DATA_SOURCES.md for terms.

- ABS Data API: Australian CPI (quarterly since 1948, complete monthly CPI since April 2024)
- FRED (St. Louis Fed): US CPI, US 10-year Treasury yield
- RBA statistical tables (CSV): cash rate, bank bill rate, bond yields, AUD/USD
- Kenneth French Data Library: monthly total returns for US, developed-world and Australian shares
"""

from __future__ import annotations

import csv
import io
import re
import time
import zipfile
from datetime import datetime
from typing import Dict, List, Tuple

import requests

from ..util import USER_AGENT

Point = Tuple[str, float]  # ("YYYY-MM" or "YYYY-MM-DD" or "YYYY-Qn", value)


def http_get(url: str, *, accept: str = "*/*", tries: int = 3, timeout: int = 60, user_agent: str = USER_AGENT) -> bytes:
    last: Exception = RuntimeError("no attempt")
    for i in range(tries):
        try:
            r = requests.get(url, headers={"User-Agent": user_agent, "Accept": accept}, timeout=timeout)
            r.raise_for_status()
            return r.content
        except Exception as e:  # network blips are common on shared runners
            last = e
            time.sleep(2 * (i + 1))
    raise last


# ---- ABS ---------------------------------------------------------------------------
# Dataflow "CPI" (version 2.0.0, from November 2025) holds both frequencies.
# Key = MEASURE.INDEX.TSEST.REGION.FREQ: 1 = index numbers, 10001 = All groups CPI,
# 10 = original (not seasonally adjusted), 50 = Australia (weighted average of 8 capital cities).
ABS_URL = "https://data.api.abs.gov.au/rest/data/ABS,CPI/1.10001.10.50.{freq}?format=csv"


def abs_cpi() -> Dict[str, object]:
    out: Dict[str, object] = {}
    for freq in ("Q", "M"):
        raw = http_get(ABS_URL.format(freq=freq), accept="text/csv").decode("utf-8-sig")
        rows = list(csv.DictReader(io.StringIO(raw)))
        pts = sorted((r["TIME_PERIOD"], float(r["OBS_VALUE"])) for r in rows if r.get("OBS_VALUE"))
        out[freq] = pts
        bases = {r.get("BASE_PERIOD") for r in rows}
        out[f"{freq}_base"] = ",".join(sorted(b for b in bases if b))
    return out


# ---- FRED --------------------------------------------------------------------------
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={id}"
# FRED's bot protection (checked 19 Oct 2026) drops connections from unfamiliar program names, including
# ours, but accepts the standard Python requests library's name. We keep our own name after it.
FRED_USER_AGENT = f"python-requests/{requests.__version__} investment-planner/1.0"


def fred_points(series_id: str) -> List[Point]:
    """[(YYYY-MM-DD, value)]; FRED marks missing values with '.' or a blank, which are skipped."""
    raw = http_get(FRED_URL.format(id=series_id), accept="text/csv", user_agent=FRED_USER_AGENT).decode("utf-8-sig")
    out: List[Point] = []
    for row in csv.reader(io.StringIO(raw)):
        if len(row) < 2 or not re.match(r"\d{4}-\d{2}-\d{2}", row[0]):
            continue
        if row[1].strip() in ("", "."):
            continue
        out.append((row[0], float(row[1])))
    if not out:
        raise ValueError(f"FRED {series_id}: no data rows")
    return out


def fred_monthly(series_id: str) -> List[Point]:
    """A monthly FRED series as [(YYYY-MM, value)]."""
    return [(d[:7], v) for d, v in fred_points(series_id)]


# ---- RBA ---------------------------------------------------------------------------
RBA_CSV = "https://www.rba.gov.au/statistics/tables/csv/{table}-data.csv"


def _rba_date(s: str) -> str:
    s = s.strip()
    for fmt in ("%d/%m/%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError(f"unrecognised RBA date {s!r}")


def rba_table(table: str) -> Dict[str, List[Point]]:
    """Returns {series_id: [(YYYY-MM-DD, value), ...]} for an RBA statistical table."""
    raw = http_get(RBA_CSV.format(table=table), accept="text/csv").decode("utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(raw.replace("\r\n", "\n").replace("\r", "\n"))))
    ids = next((r for r in rows if r and r[0] == "Series ID"), None)
    if ids is None:
        raise ValueError(f"RBA {table}: no 'Series ID' row (format changed?)")
    out: Dict[str, List[Point]] = {sid: [] for sid in ids[1:] if sid}
    for r in rows:
        if not r or not re.match(r"\d", r[0]):
            continue
        d = _rba_date(r[0])
        for sid, v in zip(ids[1:], r[1:]):
            v = v.strip()
            if sid and v:
                try:
                    out[sid].append((d, float(v)))
                except ValueError:
                    pass
    return out


def rba_cash_rate_changes() -> List[Tuple[str, float]]:
    """Cash rate target decisions since 1990 from table A2: [(effective date, new target %)].
    Early rows show a range like '17.00 to 17.50'; we keep the midpoint."""
    raw = http_get(RBA_CSV.format(table="a2"), accept="text/csv").decode("utf-8-sig", errors="replace")
    out = []
    for r in csv.reader(io.StringIO(raw.replace("\r\n", "\n").replace("\r", "\n"))):
        if len(r) < 3 or not re.match(r"\d", r[0]) or not r[2].strip():
            continue
        nums = [float(x) for x in re.findall(r"\d+\.\d+|\d+", r[2])]
        if nums:
            out.append((_rba_date(r[0]), round(sum(nums) / len(nums), 3)))
    out.sort()
    return out


# ---- Kenneth French Data Library ---------------------------------------------------------
FRENCH = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/{name}"


def _zip_text(name: str) -> Dict[str, str]:
    z = zipfile.ZipFile(io.BytesIO(http_get(FRENCH.format(name=name))))
    return {n: z.read(n).decode("latin-1") for n in z.namelist()}


def _french_csv_monthly(text: str) -> Dict[str, List[Point]]:
    """Parse the first (monthly) table of a French factors CSV: {column: [(YYYY-MM, % value)]}."""
    cols: List[str] = []
    out: Dict[str, List[Point]] = {}
    for line in text.splitlines():
        cells = [c.strip() for c in line.split(",")]
        if not cols:
            if len(cells) > 2 and cells[0] == "" and "Mkt-RF" in cells:
                cols = cells[1:]
                out = {c: [] for c in cols}
            continue
        if not re.fullmatch(r"\d{6}", cells[0]):
            if out[cols[0]]:
                break  # end of the monthly table (annual table follows)
            continue
        ym = f"{cells[0][:4]}-{cells[0][4:]}"
        for c, v in zip(cols, cells[1:]):
            if v and float(v) > -99:
                out[c].append((ym, float(v)))
    return out


def french_us_market() -> Dict[str, List[Point]]:
    """US stock market (all CRSP firms) monthly total return in %, and the 1-month T-bill, since July 1926."""
    files = _zip_text("F-F_Research_Data_Factors_CSV.zip")
    t = _french_csv_monthly(next(iter(files.values())))
    rf = dict(t["RF"])
    mkt = [(ym, v + rf[ym]) for ym, v in t["Mkt-RF"] if ym in rf]
    return {"mkt": mkt, "rf": t["RF"]}


def french_developed_market() -> List[Point]:
    """Developed markets (incl. US and Australia) monthly total return in USD %, since July 1990."""
    files = _zip_text("Developed_3_Factors_CSV.zip")
    t = _french_csv_monthly(next(iter(files.values())))
    rf = dict(t["RF"])
    return [(ym, v + rf[ym]) for ym, v in t["Mkt-RF"] if ym in rf]


def _french_dat_section(text: str, want: str) -> List[Point]:
    """From a French international .Dat file, the 'Mkt' column of the first monthly section whose
    title contains `want` (e.g. 'Local  Returns' or 'Dollar Returns')."""
    out: List[Point] = []
    in_section = False
    for line in text.splitlines():
        if "Returns" in line and "Data Items" in line:
            if out:
                break
            in_section = want in line and "Not Reqd" in line
            continue
        if in_section:
            parts = line.split()
            if parts and re.fullmatch(r"\d{6}", parts[0]):
                v = float(parts[1])
                if v > -99:
                    out.append((f"{parts[0][:4]}-{parts[0][4:]}", v))
    return out


def french_international() -> Dict[str, List[Point]]:
    """Australia (local-currency and USD) and the all-country ex-US index (USD), monthly %, since 1975."""
    countries = _zip_text("F-F_International_Countries.zip")
    indices = _zip_text("F-F_International_Indices.zip")
    aus = next(v for k, v in countries.items() if k.lower().startswith("austrlia"))
    allc = next(v for k, v in indices.items() if k.lower().startswith("ind_all"))
    return {
        "aus_local": _french_dat_section(aus, "Local  Returns"),
        "aus_usd": _french_dat_section(aus, "Dollar Returns"),
        "intl_usd": _french_dat_section(allc, "Dollar Returns"),
    }
