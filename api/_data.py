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


def _num(v) -> float:
    return 0.0 if v is None or pd.isna(v) else float(v)


def _int(v) -> int:
    return 0 if v is None or pd.isna(v) else int(v)


def _df_to_records(df: pd.DataFrame) -> list[dict]:
    records = df.reindex(columns=list(_CHAIN_COLUMNS)).to_dict("records")
    return [
        {
            "contractSymbol": (
                ""
                if rec["contractSymbol"] is None or pd.isna(rec["contractSymbol"])
                else str(rec["contractSymbol"])
            ),
            "strike": float(rec["strike"]),
            "bid": _num(rec["bid"]),
            "ask": _num(rec["ask"]),
            "lastPrice": _num(rec["lastPrice"]),
            "volume": _int(rec["volume"]),
            "openInterest": _int(rec["openInterest"]),
            "impliedVolatility": (
                float("nan")
                if rec["impliedVolatility"] is None
                else float(rec["impliedVolatility"])
            ),
        }
        for rec in records
    ]


def get_chain(ticker: str, expiration: str) -> tuple[dict, bool]:
    def fetch() -> dict:
        chain = yf.Ticker(ticker).option_chain(expiration)
        return {
            "calls": _df_to_records(chain.calls),
            "puts": _df_to_records(chain.puts),
        }

    return _cached(("chain", ticker, expiration), fetch)
