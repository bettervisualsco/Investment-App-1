"""data/etfs.json: the watchlist and the facts about each ETF (fee, yield, franking...),
copied from pipeline/tickers.json and pipeline/etf_info/*.json. No network needed."""

from __future__ import annotations

from typing import List

from .config import Ticker
from .safety import ValidationError, save_validated

INFO_FIELDS = ["index", "mer", "yield", "franking", "exchange", "listed", "inception", "distributions", "allocation", "duration"]


def _check(new: dict, old) -> None:
    if not new.get("etfs"):
        raise ValidationError("etfs.json: no ETFs")


def build(tickers: List[Ticker]) -> dict:
    etfs, indexes = [], []
    checked = []
    for t in tickers:
        if t.kind == "etf":
            entry = {"id": t.id, "symbol": t.yahoo, "market": t.market, "currency": t.currency, "name": t.name, "category": t.category}
            if isinstance(t.info.get("name"), dict):
                entry["nameInfo"] = t.info["name"]  # the name as a checked fact (note, date, source)
            for k in INFO_FIELDS:
                if k in t.info:
                    entry[k] = t.info[k]
                    if isinstance(t.info[k], dict) and t.info[k].get("checkedOn"):
                        checked.append(t.info[k]["checkedOn"])
            entry["proxy"] = [{"series": c.series, "weight": c.weight, "hedged": c.hedged} for c in t.proxy]
            etfs.append(entry)
        elif t.kind in ("index", "fx"):
            indexes.append({"id": t.id, "symbol": t.yahoo, "name": t.name, "kind": t.kind, "market": t.market, "currency": t.currency})
    return {
        "asOf": max(checked) if checked else None,
        "note": "Each fact has the date it was last checked and where it came from. Fees and yields change; check the issuer's website before relying on them.",
        "etfs": etfs,
        "indexes": indexes,
    }


def update(tickers: List[Ticker]) -> str:
    return save_validated("etfs.json", build(tickers), _check)
