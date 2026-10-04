"""Acceso a datos de mercado vía yfinance con caché en memoria.

La caché es un dict a nivel de módulo: en serverless solo persiste
entre invocaciones calientes de la misma instancia.
"""

from __future__ import annotations

import concurrent.futures
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


_STATUS_MEMO_TTL = 60.0
_status_memo: tuple[float, tuple[bool, int | None]] | None = None


def clear_cache() -> None:
    global _status_memo
    with _lock:
        _cache.clear()
        _status_memo = None


def _cached(key: tuple[Any, ...], fetch, ttl: float = CACHE_TTL_SECONDS):
    now = time.monotonic()
    with _lock:
        entry = _cache.get(key)
        if entry is not None and now - entry[0] < ttl:
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


def get_quote(ticker: str) -> tuple[dict, bool]:
    """Cotización rápida (last, previous_close, volume) con TTL de 60 s."""

    def fetch() -> dict:
        info = yf.Ticker(ticker).fast_info
        last = float("nan")
        try:
            last = float(info["last_price"])
        except Exception:
            logger.info("fast_info falló para %s, usando history", ticker)
        if not math.isfinite(last) or last <= 0:
            hist = yf.Ticker(ticker).history(period="5d")
            if not hist.empty:
                last = float(hist["Close"].iloc[-1])
        if not math.isfinite(last) or last <= 0:
            raise ValueError(f"Precio no disponible para {ticker}")

        def _opt(key, cast):
            try:
                v = info[key]
            except Exception:
                return None
            if v is None or (isinstance(v, float) and not math.isfinite(v)):
                return None
            return cast(v)

        return {
            "last": last,
            "previous_close": _opt("previous_close", float),
            "volume": _opt("last_volume", int),
        }

    return _cached(("quote", ticker), fetch, ttl=60)


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


def check_yahoo(timeout_s: float = 5.0) -> tuple[bool, int | None]:
    """Comprueba si Yahoo responde (options de SPY). Sin usar `_cache`;
    el resultado se memoiza 60 s para no golpear Yahoo en cada poll."""
    global _status_memo
    now = time.monotonic()
    with _lock:
        if _status_memo is not None and now - _status_memo[0] < _STATUS_MEMO_TTL:
            return _status_memo[1]

    start = time.monotonic()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        fut = executor.submit(lambda: tuple(yf.Ticker("SPY").options))
        options = fut.result(timeout=timeout_s)
        latency_ms = int((time.monotonic() - start) * 1000)
        result: tuple[bool, int | None] = (bool(options), latency_ms if options else None)
    except Exception:
        logger.info("check_yahoo falló o agotó el timeout")
        result = (False, None)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    with _lock:
        _status_memo = (time.monotonic(), result)
    return result


def get_daily_history(ticker: str) -> tuple[list[dict], bool]:
    """Histórico diario de 2 años: lista de dicts con date/open/high/low/close."""

    def fetch() -> list[dict]:
        df = yf.Ticker(ticker).history(period="2y", interval="1d", auto_adjust=False)
        records = []
        for ts, row in df.iterrows():
            records.append(
                {
                    "date": ts.date(),
                    "open": row["Open"],
                    "high": row["High"],
                    "low": row["Low"],
                    "close": row["Close"],
                    "volume": row["Volume"],
                }
            )
        return records

    return _cached(("daily_history", ticker), fetch)


_HISTORY_PERIODS = {"1h": "60d", "1d": "1y", "1wk": "5y"}
_HISTORY_TTL = {"1h": 300, "1d": CACHE_TTL_SECONDS, "1wk": CACHE_TTL_SECONDS}


def get_history(ticker: str, interval: str) -> tuple[list[dict], bool]:
    """Velas OHLCV: [{time, open, high, low, close, volume}]."""

    def fetch() -> list[dict]:
        df = yf.Ticker(ticker).history(
            period=_HISTORY_PERIODS[interval], interval=interval, auto_adjust=False
        )
        candles = []
        for ts, row in df.iterrows():
            if (
                pd.isna(row["Open"])
                or pd.isna(row["High"])
                or pd.isna(row["Low"])
                or pd.isna(row["Close"])
            ):
                continue
            candles.append(
                {
                    "time": int(ts.timestamp()),
                    "open": round(float(row["Open"]), 4),
                    "high": round(float(row["High"]), 4),
                    "low": round(float(row["Low"]), 4),
                    "close": round(float(row["Close"]), 4),
                    "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
                }
            )
        return candles

    return _cached(("history", ticker, interval), fetch, ttl=_HISTORY_TTL[interval])


def get_chain(ticker: str, expiration: str) -> tuple[dict, bool]:
    def fetch() -> dict:
        chain = yf.Ticker(ticker).option_chain(expiration)
        return {
            "calls": _df_to_records(chain.calls),
            "puts": _df_to_records(chain.puts),
        }

    return _cached(("chain", ticker, expiration), fetch)
