"""Small shared helpers: paths, JSON, dates and months. Standard library only."""

from __future__ import annotations

import json
import math
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

PIPELINE_DIR = Path(__file__).resolve().parent.parent
ROOT = PIPELINE_DIR.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", str(ROOT / "data")))
STATIC_DIR = PIPELINE_DIR / "static"

USER_AGENT = "investment-planner-data-pipeline/1.0 (personal, non-commercial use)"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """UTC timestamp like 2026-10-18T05:12:00Z."""
    return dt.astimezone(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def dumps(obj: Any) -> str:
    """Compact, stable JSON (keys keep insertion order, no spaces)."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def load_json(path: Path, default: Any = None) -> Any:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


# ---- months -----------------------------------------------------------------
# A month is written "YYYY-MM". Month numbers count months since year 0 so we can do arithmetic.


def month_num(ym: str) -> int:
    y, m = ym.split("-")
    return int(y) * 12 + int(m) - 1


def month_str(n: int) -> str:
    return f"{n // 12:04d}-{n % 12 + 1:02d}"


def month_of(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def add_months(ym: str, k: int) -> str:
    return month_str(month_num(ym) + k)


# ---- numbers ----------------------------------------------------------------


def is_num(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def round_price(x: float) -> float:
    """Keep about 6-7 significant figures: plenty for prices, much smaller files."""
    ax = abs(x)
    if ax >= 1000:
        return round(x, 2)
    if ax >= 10:
        return round(x, 3)
    if ax >= 1:
        return round(x, 4)
    return round(x, 6)
