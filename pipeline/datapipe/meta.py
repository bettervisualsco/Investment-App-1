"""data/meta.json: what files exist (with a fingerprint so the app downloads only changed ones),
when each was updated, and the health of every data source. Standard library only."""

from __future__ import annotations

import hashlib
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from .safety import atomic_write_text
from .util import DATA_DIR, dumps, iso, load_json, now_utc

SCHEMA = 1
MAX_PROBLEMS = 40

# Human-readable names shown in the app's Settings > Data status.
SOURCE_LABELS = {
    "yahoo": "Yahoo Finance (ETF and index prices, via yfinance)",
    "yahoo-direct": "Yahoo Finance direct (backup route if yfinance breaks)",
    "abs": "Australian Bureau of Statistics (Australian CPI)",
    "fred": "FRED, St. Louis Fed (US CPI, US 10-year yield)",
    "rba": "Reserve Bank of Australia (cash rate, AUD/USD, bond yields)",
    "french": "Kenneth French Data Library (long-run share returns)",
    "static": "Frozen historical snapshots (Shiller, RBA history)",
}


class Meta:
    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or DATA_DIR
        self.path = self.data_dir / "meta.json"
        m = load_json(self.path, {}) or {}
        self.sources: Dict[str, dict] = m.get("sources", {})
        self.tasks: Dict[str, dict] = m.get("tasks", {})
        self.files: Dict[str, dict] = m.get("files", {})
        self.problems: list = m.get("problems", [])
        self.generated_at: Optional[str] = m.get("generatedAt")
        self.repo: dict = m.get("repo", {})

    # ---- sources -----------------------------------------------------------------
    def _source(self, name: str) -> dict:
        s = self.sources.setdefault(name, {})
        s["label"] = SOURCE_LABELS.get(name, name)
        return s

    def source_ok(self, name: str, now: Optional[datetime] = None, note: Optional[str] = None) -> None:
        s = self._source(name)
        t = iso(now or now_utc())
        s.update(status="ok", lastAttempt=t, lastSuccess=t, failures=0, lastError=None)
        if note:
            s["note"] = note
        else:
            s.pop("note", None)

    def source_failed(self, name: str, error: Any, now: Optional[datetime] = None) -> None:
        s = self._source(name)
        t = iso(now or now_utc())
        s.update(status="error", lastAttempt=t, failures=int(s.get("failures") or 0) + 1, lastError=_short(error))
        s.setdefault("lastSuccess", None)
        self.problem(name, error, now)

    # ---- tasks -------------------------------------------------------------------
    def task_started(self, name: str, now: datetime) -> None:
        self.tasks.setdefault(name, {})["lastAttempt"] = iso(now)

    def task_done(self, name: str, now: datetime, error: Any = None, **extra: Any) -> None:
        t = self.tasks.setdefault(name, {})
        t["lastAttempt"] = iso(now)
        if error is None:
            t["lastSuccess"] = iso(now)
            t["lastError"] = None
        else:
            t["lastError"] = _short(error)
        t.update(extra)

    # ---- problems log ----------------------------------------------------------------
    def problem(self, where: str, error: Any, now: Optional[datetime] = None) -> None:
        self.problems.insert(0, {"at": iso(now or now_utc()), "where": where, "message": _short(error)})
        del self.problems[MAX_PROBLEMS:]

    # ---- files -------------------------------------------------------------------
    def refresh_files(self, now: Optional[datetime] = None) -> None:
        """Fingerprint every data file. A file's updatedAt only changes when its content changes."""
        t = iso(now or now_utc())
        found: Dict[str, dict] = {}
        for p in sorted(self.data_dir.rglob("*.json")):
            rel = p.relative_to(self.data_dir).as_posix()
            if rel == "meta.json" or p.name.startswith("."):
                continue
            raw = p.read_bytes()
            h = hashlib.sha256(raw).hexdigest()[:16]
            prev = self.files.get(rel, {})
            entry = {"hash": h, "bytes": len(raw), "updatedAt": prev.get("updatedAt") if prev.get("hash") == h else t}
            if entry["updatedAt"] is None:
                entry["updatedAt"] = t
            try:
                as_of = load_json(p, {}).get("asOf")
            except AttributeError:
                as_of = None
            if as_of:
                entry["asOf"] = as_of
            found[rel] = entry
        self.files = found

    def to_json(self, now: datetime) -> dict:
        return {
            "schema": SCHEMA,
            "generatedAt": iso(now),
            "files": self.files,
            "sources": self.sources,
            "tasks": self.tasks,
            "problems": self.problems,
            "repo": self.repo,
        }

    def save(self, now: Optional[datetime] = None) -> None:
        now = now or now_utc()
        self.refresh_files(now)
        self.generated_at = iso(now)
        atomic_write_text(self.path, dumps(self.to_json(now)))


def _short(error: Any) -> str:
    if isinstance(error, BaseException):
        text = f"{type(error).__name__}: {error}"
        if not str(error):
            text += " " + traceback.format_exc(limit=1).strip().splitlines()[-1]
    else:
        text = str(error)
    return text[:300]
