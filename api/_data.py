"""Acceso a datos de mercado vía yfinance con caché en memoria.

La caché es un dict a nivel de módulo: en serverless solo persiste
entre invocaciones calientes de la misma instancia.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from typing import Any

import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 900

_cache: dict[tuple[Any, ...], tuple[float, Any]] = {}
_lock = threading.Lock()


def clear_cache() -> None:
    with _lock:
        _cache.clear()


def _cached(key: tuple[Any, ...], fetch):
    now = time.monotonic()
    with _lock:
        entry = _cache.get(key)
        if entry is not None and now - entry[0] < CACHE_TTL_SECONDS:
            return entry[1], True
    value = fetch()
    with _lock:
        _cache[key] = (time.monotonic(), value)
    return value, False


def get_spot(ticker: str) -> tuple[float, bool]:
    def fetch() -> float:
        spot = float("nan")
        try:
            spot = float(yf.Ticker(ticker).fast_info["last_price"])
        except Exception:
            logger.info("fast_info falló para %s, usando history", ticker)
        if not math.isfinite(spot) or spot <= 0:
            hist = yf.Ticker(ticker).history(period="5d")
            if not hist.empty:
                spot = float(hist["Close"].iloc[-1])
        if not math.isfinite(spot) or spot <= 0:
            raise ValueError(f"Spot no disponible para {ticker}")
        return spot

    return _cached(("spot", ticker), fetch)


def get_expirations(ticker: str) -> tuple[tuple[str, ...], bool]:
    def fetch() -> tuple[str, ...]:
        return tuple(yf.Ticker(ticker).options)

    return _cached(("expirations", ticker), fetch)


_CHAIN_COLUMNS = (
    "contractSymbol",
    "strike",
    "bid",
    "ask",
    "lastPrice",
    "volume",
    "openInterest",
    "impliedVolatility",
)


def _df_to_records(df: pd.DataFrame) -> list[dict]:
    records: list[dict] = []
    for row in df.itertuples(index=False):
        rec = {}
        for col in _CHAIN_COLUMNS:
            val = getattr(row, col, None)
            if col in ("volume", "openInterest"):
                rec[col] = 0 if val is None or pd.isna(val) else int(val)
            elif col in ("bid", "ask", "lastPrice"):
                rec[col] = 0.0 if val is None or pd.isna(val) else float(val)
            elif col == "impliedVolatility":
                rec[col] = float("nan") if val is None else float(val)
            elif col == "contractSymbol":
                rec[col] = "" if val is None else str(val)
            else:
                rec[col] = float(val)
        records.append(rec)
    return records


def get_chain(ticker: str, expiration: str) -> tuple[dict, bool]:
    def fetch() -> dict:
        chain = yf.Ticker(ticker).option_chain(expiration)
        return {
            "calls": _df_to_records(chain.calls),
            "puts": _df_to_records(chain.puts),
        }

    return _cached(("chain", ticker, expiration), fetch)
