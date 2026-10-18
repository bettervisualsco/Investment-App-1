"""Safety rules: never replace good data with empty or broken data.

Every data file is checked before it is written. If the check fails, the old file stays exactly
as it was and the problem is recorded in meta.json. Files are written atomically (to a temporary
file first, then renamed) so a crash can never leave half a file behind. Standard library only.
"""

from __future__ import annotations

import os
import tempfile
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .util import DATA_DIR, dumps, is_num, load_json


class ValidationError(Exception):
    pass


Validator = Callable[[Any, Any], None]


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-", suffix=path.suffix)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def save_validated(rel: str, obj: Any, validator: Optional[Validator] = None, data_dir: Optional[Path] = None) -> str:
    """Write data/<rel> if `obj` passes `validator(new, old)`. Returns "written" or "unchanged".
    Raises ValidationError (and leaves the old file alone) if the new data looks wrong."""
    path = (data_dir or DATA_DIR) / rel
    old = load_json(path)
    if obj is None:
        raise ValidationError(f"{rel}: nothing to write")
    if validator is not None:
        validator(obj, old)
    text = dumps(obj)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return "unchanged"
    atomic_write_text(path, text)
    return "written"


# ---- daily price history -------------------------------------------------------


def daily_dates(f: dict) -> List[str]:
    """Rebuild the list of dates from a daily file (first date + day gaps)."""
    d0 = date.fromisoformat(f["first"])
    out = []
    cur = d0
    for i, gap in enumerate(f["d"]):
        cur = d0 if i == 0 else cur + timedelta(days=gap)
        out.append(cur.isoformat())
    return out


def validate_daily(new: dict, old: Optional[dict]) -> None:
    rel = new.get("id", "?")
    c, d = new.get("c"), new.get("d")
    if not c or not d:
        raise ValidationError(f"{rel}: empty price history")
    if len(c) != len(d):
        raise ValidationError(f"{rel}: dates and prices have different lengths")
    if "a" in new and len(new["a"]) != len(c):
        raise ValidationError(f"{rel}: adjusted prices have a different length")
    for series in (c, new.get("a") or []):
        for x in series:
            if not is_num(x) or x <= 0:
                raise ValidationError(f"{rel}: bad price {x!r}")
    if d[0] != 0 or any((not isinstance(g, int)) or g <= 0 for g in d[1:]):
        raise ValidationError(f"{rel}: dates are not in order")
    dates = daily_dates(new)
    if dates[-1] != new.get("last"):
        raise ValidationError(f"{rel}: 'last' doesn't match the dates")
    if not old or not old.get("c"):
        return
    # Compared with what we already have:
    if new["last"] < old["last"]:
        raise ValidationError(f"{rel}: new data ends {new['last']}, older than saved data ({old['last']})")
    if new["first"] > (date.fromisoformat(old["first"]) + timedelta(days=10)).isoformat():
        raise ValidationError(f"{rel}: new history starts {new['first']}, saved history starts {old['first']} (history cut short)")
    if len(c) < 0.98 * len(old["c"]) - 5:
        raise ValidationError(f"{rel}: new history has {len(c)} days, saved history has {len(old['c'])}")
    # Closing prices on dates both versions share should agree, unless a new share split
    # rescaled the history (Yahoo's close prices are split-adjusted).
    new_splits = {s[0] for s in new.get("splits", [])} - {s[0] for s in old.get("splits", [])}
    if new_splits:
        return
    old_close = dict(zip(daily_dates(old), old["c"]))
    common = [(old_close[dt], px) for dt, px in zip(dates, c) if dt in old_close][-500:]
    if not common:
        raise ValidationError(f"{rel}: new and saved histories don't overlap at all")
    bad = sum(1 for a, b in common if abs(b / a - 1) > 0.03)
    if bad > max(3, 0.05 * len(common)):
        raise ValidationError(f"{rel}: {bad} of the last {len(common)} closes changed by more than 3%")


# ---- monthly table ----------------------------------------------------------------

# Biggest believable monthly move. US shares rose 38% in April 1933 and fell 30% in October 1929.
MONTHLY_LIMITS: Dict[str, float] = {"return": 0.75, "inflation": 0.15, "fx": 0.30}


def validate_monthly(new: dict, old: Optional[dict]) -> None:
    series = new.get("series") or {}
    if not series:
        raise ValidationError("monthly: no series")
    scale = new["scale"]
    for key, s in series.items():
        vals = s.get("values") or []
        if not vals:
            raise ValidationError(f"monthly/{key}: empty")
        limit = MONTHLY_LIMITS[s["kind"]] * scale
        for v in vals:
            if v is not None and (not isinstance(v, int) or abs(v) > limit):
                raise ValidationError(f"monthly/{key}: value {v!r} out of range")
    if not old:
        return
    for key, s in (old.get("series") or {}).items():
        if key not in series:
            raise ValidationError(f"monthly/{key}: series disappeared")
        if len(series[key]["values"]) < len(s["values"]) - 3:
            raise ValidationError(f"monthly/{key}: series got shorter ({len(s['values'])} -> {len(series[key]['values'])} months)")


# ---- simple level series (CPI, rates, exchange rates) ---------------------------------


def validate_levels(min_points: int, lo: float, hi: float) -> Validator:
    """Checks a file of the form {"series": {name: {"t": [...], "v": [...]}}}."""

    def check(new: dict, old: Optional[dict]) -> None:
        for name, s in new["series"].items():
            t, v = s.get("t") or [], s.get("v") or []
            if len(t) != len(v) or len(v) < min_points:
                raise ValidationError(f"{name}: too few points ({len(v)})")
            if any(not is_num(x) or not (lo <= x <= hi) for x in v):
                raise ValidationError(f"{name}: value out of range")
            if any(a >= b for a, b in zip(t, t[1:])):
                raise ValidationError(f"{name}: dates not in order")
            if old and name in old.get("series", {}):
                ot = old["series"][name]["t"]
                if len(t) < len(ot) - 2 or t[-1] < ot[-1]:
                    raise ValidationError(f"{name}: new data is shorter or older than saved data")

    return check


# ---- intraday ---------------------------------------------------------------------


def validate_intraday(new: dict, old: Optional[dict]) -> None:
    quotes = new.get("quotes") or {}
    if not quotes:
        raise ValidationError("intraday: no quotes")
    for sym, q in quotes.items():
        if not is_num(q.get("price")) or q["price"] <= 0:
            raise ValidationError(f"intraday/{sym}: bad price")
    if old and old.get("session") and new.get("session") and new["session"] < old["session"]:
        raise ValidationError("intraday: older trading day than saved data")
