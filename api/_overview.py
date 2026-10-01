"""Resumen por ticker: cotización + griegas ATM de la expiración más cercana al DTE objetivo."""

from __future__ import annotations

import concurrent.futures
import logging
import math
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from typing import Protocol

import _data
from _greeks import bs_greeks, year_fraction
from _models import (
    AtmLeg,
    Greeks,
    OverviewMeta,
    OverviewParams,
    OverviewResponse,
    TickerOverview,
)
from _screener import _env_float, _market_today

logger = logging.getLogger(__name__)


class OverviewProvider(Protocol):
    def get_quote(self, ticker: str) -> tuple[dict, bool]: ...

    def get_expirations(self, ticker: str) -> tuple[tuple[str, ...], bool]: ...

    def get_chain(self, ticker: str, expiration: str) -> tuple[dict, bool]: ...


def _atm_leg(contract: dict, spot: float, T: float, r: float, otype: str) -> AtmLeg | None:
    bid, ask, last, iv = (
        contract["bid"],
        contract["ask"],
        contract["lastPrice"],
        contract["impliedVolatility"],
    )
    if bid > 0 and ask > 0:
        mid = (bid + ask) / 2.0
    elif last > 0:
        mid = last
    else:
        return None
    if not math.isfinite(iv) or iv <= 0.01:
        return None
    g = bs_greeks(spot, contract["strike"], T, r, iv, otype)
    return AtmLeg(
        strike=contract["strike"],
        bid=round(bid, 2),
        ask=round(ask, 2),
        mid=round(mid, 2),
        iv=round(iv * 100.0, 2),
        greeks=Greeks(
            delta=round(g.delta, 4),
            gamma=round(g.gamma, 4),
            theta=round(g.theta, 4),
            vega=round(g.vega, 4),
        ),
    )


def _overview_item(
    ticker: str,
    params: OverviewParams,
    provider: OverviewProvider,
    today: date,
    r: float,
) -> TickerOverview:
    quote, _ = provider.get_quote(ticker)
    spot = quote["last"]
    prev = quote["previous_close"]
    change = round(spot - prev, 2) if prev is not None else None
    change_pct = round((spot - prev) / prev * 100.0, 2) if prev and prev > 0 else None
    base = {
        "ticker": ticker,
        "spot": round(spot, 2),
        "previous_close": round(prev, 2) if prev is not None else None,
        "change": change,
        "change_pct": change_pct,
        "volume": quote["volume"],
    }

    expirations, _ = provider.get_expirations(ticker)
    if not expirations:
        return TickerOverview(**base, error="Sin opciones listadas")

    candidates = []
    for exp_str in expirations:
        try:
            exp_date = date.fromisoformat(exp_str)
        except ValueError:
            continue
        dte = (exp_date - today).days
        if dte >= 1:
            candidates.append((abs(dte - params.dte), exp_date, exp_str, dte))
    if not candidates:
        return TickerOverview(**base, error="Sin opciones listadas")
    candidates.sort(key=lambda x: (x[0], x[1]))
    _, _, exp_str, dte = candidates[0]

    chain, _ = provider.get_chain(ticker, exp_str)
    calls = {c["strike"]: c for c in chain.get("calls", [])}
    puts = {c["strike"]: c for c in chain.get("puts", [])}
    common = sorted(set(calls) & set(puts))
    if not common:
        return TickerOverview(**base, expiration=exp_str, dte=dte, error="Sin strikes comunes")

    atm_strike = min(common, key=lambda k: (abs(k - spot), k))
    T = year_fraction(dte)
    call_leg = _atm_leg(calls[atm_strike], spot, T, r, "call")
    put_leg = _atm_leg(puts[atm_strike], spot, T, r, "put")
    ivs = [leg.iv for leg in (call_leg, put_leg) if leg is not None]
    return TickerOverview(
        **base,
        expiration=exp_str,
        dte=dte,
        atm_strike=atm_strike,
        atm_iv=round(sum(ivs) / len(ivs), 2) if ivs else None,
        call=call_leg,
        put=put_leg,
    )


def run_overview(
    params: OverviewParams,
    *,
    provider: OverviewProvider | None = None,
    today: date | None = None,
    deadline_s: float | None = None,
) -> OverviewResponse:
    if provider is None:
        provider = _data
    r = _env_float("RISK_FREE_RATE", 0.045, 0.0, 0.2)
    if deadline_s is None:
        deadline_s = _env_float("SCREENER_DEADLINE_SECONDS", 8.0, 0.1, 60.0)
    if today is None:
        today = _market_today()

    start = time.monotonic()
    warnings: list[str] = []
    truncated = False

    executor = ThreadPoolExecutor(max_workers=5)
    try:
        futs = {
            t: executor.submit(_overview_item, t, params, provider, today, r)
            for t in params.tickers
        }
        remaining = deadline_s - (time.monotonic() - start)
        done, not_done = concurrent.futures.wait(futs.values(), timeout=max(remaining, 0))
        for fut in not_done:
            fut.cancel()
        if not_done:
            truncated = True
            warnings.append("Tiempo límite alcanzado: resultados parciales")

        items = []
        for t in params.tickers:
            fut = futs[t]
            if fut in not_done:
                items.append(TickerOverview(ticker=t, spot=0.0, error="Tiempo límite alcanzado"))
                continue
            try:
                items.append(fut.result())
            except Exception:
                logger.exception("Error obteniendo resumen de %s", t)
                items.append(
                    TickerOverview(
                        ticker=t,
                        spot=0.0,
                        error="No se pudieron obtener datos de Yahoo",
                    )
                )
    finally:
        executor.shutdown(wait=False, cancel_futures=True)

    return OverviewResponse(
        items=items,
        meta=OverviewMeta(
            risk_free_rate=r,
            generated_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            truncated=truncated,
            warnings=warnings,
        ),
    )
