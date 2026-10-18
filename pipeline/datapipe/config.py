"""Reads pipeline/tickers.json (the watchlist) and pipeline/etf_info/*.json (facts about each ETF)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .util import PIPELINE_DIR, load_json


@dataclass
class Component:
    series: str  # an asset-class series in monthly.json, e.g. "au_shares"
    weight: float
    hedged: bool = False  # True = currency-hedged: no AUD/USD conversion


@dataclass
class Ticker:
    id: str  # our short name, used in file names (e.g. "VAS", "SP500")
    yahoo: str  # Yahoo symbol (e.g. "VAS.AX", "^GSPC")
    name: str
    kind: str  # "etf", "index", "fx" or "helper"
    market: str  # "asx" or "us" (which trading session it follows)
    currency: str
    proxy: List[Component] = field(default_factory=list)
    info: dict = field(default_factory=dict)

    @property
    def mer(self) -> Optional[float]:
        v = (self.info.get("mer") or {}).get("value")
        return None if v is None else float(v) / 100


def load_tickers(path=None) -> List[Ticker]:
    cfg = load_json(path or PIPELINE_DIR / "tickers.json")
    if not cfg:
        raise RuntimeError("pipeline/tickers.json is missing or not valid JSON")
    out: List[Ticker] = []
    for kind_key, kind in (("etfs", "etf"), ("indexes", "index"), ("fx", "fx"), ("helpers", "helper")):
        for t in cfg.get(kind_key, []):
            info = load_json(PIPELINE_DIR / "etf_info" / f"{t['id']}.json", {}) if kind == "etf" else {}
            out.append(
                Ticker(
                    id=t["id"],
                    yahoo=t["yahoo"],
                    name=t.get("name") or info.get("name", {}).get("value") or t["id"],
                    kind=kind,
                    market=t["market"],
                    currency=t["currency"],
                    proxy=[Component(c["series"], float(c["weight"]), bool(c.get("hedged"))) for c in t.get("proxy", [])],
                    info=info or {},
                )
            )
    ids = [t.id for t in out]
    if len(ids) != len(set(ids)):
        raise RuntimeError("pipeline/tickers.json: the same id is used twice")
    for t in out:
        if t.kind == "etf" and t.proxy and abs(sum(c.weight for c in t.proxy) - 1) > 1e-6:
            raise RuntimeError(f"pipeline/tickers.json: {t.id} proxy weights don't add up to 1")
    return out


def by_market(tickers: List[Ticker], market: str) -> List[Ticker]:
    """Tickers fetched with a market's jobs. AUD/USD trades around the clock, so it goes with both."""
    return [t for t in tickers if t.market == market or t.kind == "fx"]
