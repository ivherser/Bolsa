"""Lógica del screener: métricas de estrategia, filtros, ordenación."""

from __future__ import annotations

import concurrent.futures
import logging
import math
import os
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from typing import Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import _data
from _greeks import bs_greeks, prob_above, year_fraction
from _models import (
    OptionResult,
    ScreenerMeta,
    ScreenerParams,
    ScreenerResponse,
    SortField,
)

logger = logging.getLogger(__name__)


class DataProvider(Protocol):
    def get_spot(self, ticker: str) -> tuple[float, bool]: ...

    def get_expirations(self, ticker: str) -> tuple[tuple[str, ...], bool]: ...

    def get_chain(self, ticker: str, expiration: str) -> tuple[dict, bool]: ...


def _env_float(name: str, default: float, lo: float, hi: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        logger.warning("%s=%r no es un número, usando %.4f", name, raw, default)
        return default
    if not lo <= value <= hi:
        logger.warning("%s=%r fuera de [%.2f, %.2f], usando %.4f", name, raw, lo, hi, default)
        return default
    return value


def _market_today() -> date:
    try:
        return datetime.now(ZoneInfo("America/New_York")).date()
    except ZoneInfoNotFoundError:
        return datetime.now(UTC).date()


def _round(x: float | None, ndigits: int = 2) -> float | None:
    return None if x is None else round(x, ndigits)


def run_screener(
    params: ScreenerParams,
    *,
    provider: DataProvider | None = None,
    today: date | None = None,
    deadline_s: float | None = None,
) -> ScreenerResponse:
    if provider is None:
        provider = _data
    r = _env_float("RISK_FREE_RATE", 0.045, 0.0, 0.2)
    if deadline_s is None:
        deadline_s = _env_float("SCREENER_DEADLINE_SECONDS", 8.0, 0.1, 60.0)
    if today is None:
        today = _market_today()

    start = time.monotonic()
    warnings: list[str] = []
    cache_hits = 0
    truncated = False
    spots: dict[str, float] = {}
    expirations_scanned = 0
    results: list[OptionResult] = []

    executor = ThreadPoolExecutor(max_workers=5)
    try:
        # Fase 1: spot + expiraciones por ticker.
        spot_futs = {t: executor.submit(provider.get_spot, t) for t in params.tickers}
        exp_futs = {t: executor.submit(provider.get_expirations, t) for t in params.tickers}
        per_ticker_exp: dict[str, list[tuple[str, date, int]]] = {}
        for t in params.tickers:
            try:
                spot, hit = spot_futs[t].result()
                cache_hits += 1 if hit else 0
                spots[t] = spot
            except Exception:
                logger.exception("Error obteniendo spot de %s", t)
                warnings.append(f"{t}: no se pudieron obtener datos de Yahoo")
                continue
            try:
                expirations, hit = exp_futs[t].result()
                cache_hits += 1 if hit else 0
            except Exception:
                logger.exception("Error obteniendo expiraciones de %s", t)
                warnings.append(f"{t}: no se pudieron obtener datos de Yahoo")
                continue
            if not expirations:
                warnings.append(f"{t}: sin opciones listadas")
                continue
            in_window = []
            for exp_str in expirations:
                try:
                    exp_date = date.fromisoformat(exp_str)
                except ValueError:
                    continue
                dte = (exp_date - today).days
                if params.dte_min <= dte <= params.dte_max:
                    in_window.append((exp_str, exp_date, dte))
            in_window.sort(key=lambda x: x[1])
            per_ticker_exp[t] = in_window[: params.max_expirations]
            expirations_scanned += len(per_ticker_exp[t])

        # Fase 2: cadenas de opciones, sobre el mismo executor para que el
        # shutdown(wait=False) del finally no bloquee esperando a rezagadas.
        chain_futs: dict[tuple[str, str], concurrent.futures.Future] = {}
        for t, exps in per_ticker_exp.items():
            for exp_str, _, _ in exps:
                chain_futs[(t, exp_str)] = executor.submit(provider.get_chain, t, exp_str)
        remaining = deadline_s - (time.monotonic() - start)
        if remaining <= 0:
            done, not_done = set(), set(chain_futs.values())
        else:
            done, not_done = concurrent.futures.wait(chain_futs.values(), timeout=remaining)
        for fut in not_done:
            fut.cancel()
        if not_done:
            truncated = True
            warnings.append(
                "Tiempo límite alcanzado: resultados parciales "
                f"({len(not_done)} cadenas sin procesar)"
            )
        chains: dict[tuple[str, str], dict] = {}
        for key, fut in chain_futs.items():
            if fut in not_done:
                continue
            t, exp_str = key
            try:
                chain, hit = fut.result()
                cache_hits += 1 if hit else 0
                chains[key] = chain
            except Exception:
                logger.exception("Error obteniendo cadena %s %s", t, exp_str)
                warnings.append(f"{t} {exp_str}: cadena no disponible")

        # Fase 3: evaluar contratos.
        option_types = ("put", "call") if params.option_type == "both" else (params.option_type,)
        for t, exps in per_ticker_exp.items():
            spot = spots[t]
            for exp_str, _, dte in exps:
                chain = chains.get((t, exp_str))
                if chain is None:
                    continue
                T = year_fraction(dte)
                for otype in option_types:
                    leg_key = "puts" if otype == "put" else "calls"
                    contracts = chain.get(leg_key, [])
                    for c in contracts:
                        try:
                            res = _evaluate_contract(
                                c, contracts, params, otype, spot, t, exp_str, dte, T, r
                            )
                        except ValueError:
                            logger.debug(
                                "Contrato omitido por datos inválidos: %s %s",
                                t,
                                c.get("contractSymbol"),
                            )
                            continue
                        if res is not None:
                            results.append(res)
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    # None siempre al final, en ambos órdenes.
    if params.sort_order == "desc":
        results.sort(key=lambda o: _sort_key_desc(o, params.sort_by), reverse=True)
    else:
        results.sort(key=lambda o: _sort_key(o, params.sort_by))
    results = results[: params.limit]

    return ScreenerResponse(
        results=results,
        meta=ScreenerMeta(
            tickers=params.tickers,
            spots={t: round(s, 2) for t, s in spots.items()},
            risk_free_rate=r,
            generated_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            expirations_scanned=expirations_scanned,
            cache_hits=cache_hits,
            truncated=truncated,
            warnings=warnings,
            count=len(results),
        ),
    )


_SORT_ACCESSORS: dict[SortField, Callable[[OptionResult], float | str | None]] = {
    "ror_day": lambda o: o.ror_day,
    "ror": lambda o: o.ror,
    "pop": lambda o: o.pop,
    "iv": lambda o: o.iv,
    "delta": lambda o: abs(o.greeks.delta),
    "oi": lambda o: o.open_interest,
    "volume": lambda o: o.volume,
    "dte": lambda o: o.dte,
    "strike": lambda o: o.strike,
    "spread_pct": lambda o: o.spread_pct,
    "mid": lambda o: o.mid,
    "expiration": lambda o: o.expiration,
    "ticker": lambda o: o.ticker,
}


def _sort_val(opt: OptionResult, sort_by: str):
    return _SORT_ACCESSORS[sort_by](opt)


def _sort_key(opt: OptionResult, sort_by: str):
    val = _sort_val(opt, sort_by)
    return (val is None, 0 if val is None else val)


def _sort_key_desc(opt: OptionResult, sort_by: str):
    # Comparables en orden inverso manteniendo los None al final.
    val = _sort_val(opt, sort_by)
    return (val is not None, val)


def _evaluate_contract(
    c: dict,
    contracts: list[dict],
    params: ScreenerParams,
    otype: str,
    spot: float,
    ticker: str,
    exp_str: str,
    dte: int,
    T: float,
    r: float,
) -> OptionResult | None:
    bid, ask, iv = c["bid"], c["ask"], c["impliedVolatility"]
    if ask <= 0 or bid < 0 or ask < bid:
        return None
    if not math.isfinite(iv) or iv < 0.01 or iv > 5:
        return None
    mid = (bid + ask) / 2.0
    if mid <= 0:
        return None
    if params.strategy in ("short", "credit_spread") and bid <= 0:
        return None
    K = c["strike"]

    greeks = bs_greeks(spot, K, T, r, iv, otype)
    spread_pct = (ask - bid) / mid * 100.0

    long_strike: float | None = None
    width: float | None = None
    max_profit: float | None = None
    max_loss: float | None = None

    if params.strategy == "short":
        premium = mid
        if otype == "put":
            if K - premium < 0.01:
                return None  # riesgo < $1/contrato: fila degenerada
            breakeven = K - premium
            max_profit = premium * 100
            max_loss = (K - premium) * 100
            pop = prob_above(spot, K, T, r, iv)
        else:
            breakeven = K + premium
            max_profit = premium * 100
            max_loss = None
            pop = 1.0 - prob_above(spot, K, T, r, iv)
    elif params.strategy == "credit_spread":
        target = K - params.spread_width if otype == "put" else K + params.spread_width
        candidates = [
            lc
            for lc in contracts
            if lc["ask"] > 0
            and (lc["bid"] + lc["ask"]) / 2.0 > 0
            and (lc["strike"] < K if otype == "put" else lc["strike"] > K)
        ]
        if not candidates:
            return None
        long_leg = min(candidates, key=lambda lc: abs(lc["strike"] - target))
        long_strike = long_leg["strike"]
        long_mid = (long_leg["bid"] + long_leg["ask"]) / 2.0
        width = abs(K - long_strike)
        if abs(width - params.spread_width) > 0.5 * params.spread_width:
            return None
        premium = mid - long_mid
        if premium <= 0 or width - premium < 0.01:
            return None
        if otype == "put":
            breakeven = K - premium
            pop = prob_above(spot, K, T, r, iv)
        else:
            breakeven = K + premium
            pop = 1.0 - prob_above(spot, K, T, r, iv)
        max_profit = premium * 100
        max_loss = (width - premium) * 100
    else:  # long
        premium = mid
        if otype == "call":
            breakeven = K + premium
            max_profit = None
        else:
            breakeven = K - premium
            max_profit = (K - premium) * 100
        max_loss = premium * 100

    if breakeven <= 0:
        return None
    if params.strategy == "long":
        if otype == "call":
            pop = prob_above(spot, breakeven, T, r, iv)
        else:
            pop = 1.0 - prob_above(spot, breakeven, T, r, iv)

    if not (params.delta_min <= abs(greeks.delta) <= params.delta_max):
        return None
    if c["openInterest"] < params.oi_min or c["volume"] < params.volume_min:
        return None
    if params.spread_max_pct is not None and spread_pct > params.spread_max_pct:
        return None
    if iv * 100.0 < params.iv_min or pop * 100.0 < params.pop_min:
        return None

    ror = (
        max_profit / max_loss * 100.0
        if max_profit is not None and max_loss is not None and max_loss > 0
        else None
    )
    ror_day = ror / max(dte, 1) if ror is not None else None

    return OptionResult(
        ticker=ticker,
        contract_symbol=c["contractSymbol"],
        option_type=otype,
        strategy=params.strategy,
        expiration=exp_str,
        dte=dte,
        spot=round(spot, 2),
        strike=K,
        long_strike=long_strike,
        width=_round(width),
        bid=round(bid, 2),
        ask=round(ask, 2),
        mid=round(mid, 2),
        last=round(c["lastPrice"], 2),
        spread_pct=round(spread_pct, 2),
        volume=c["volume"],
        open_interest=c["openInterest"],
        iv=round(iv * 100.0, 2),
        greeks=greeks.model_copy(
            update={
                "delta": round(greeks.delta, 4),
                "gamma": round(greeks.gamma, 4),
                "theta": round(greeks.theta, 4),
                "vega": round(greeks.vega, 4),
            }
        ),
        premium=round(premium, 2),
        breakeven=round(breakeven, 2),
        max_profit=_round(max_profit),
        max_loss=_round(max_loss),
        pop=round(pop * 100.0, 2),
        ror=_round(ror),
        ror_day=_round(ror_day, 4),
    )
