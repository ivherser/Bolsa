"""Cadena de opciones por expiración con POP."""

from __future__ import annotations

import math
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from typing import Protocol

import _data
from _greeks import bs_greeks, prob_above, year_fraction
from _models import (
    ChainExpiration,
    ChainLeg,
    ChainMeta,
    ChainParams,
    ChainResponse,
    ChainRow,
    Greeks,
)
from _screener import _env_float, _market_today


class ExpirationNotFound(Exception):
    pass


class ChainProvider(Protocol):
    def get_quote(self, ticker: str) -> tuple[dict, bool]: ...

    def get_expirations(self, ticker: str) -> tuple[tuple[str, ...], bool]: ...

    def get_chain(self, ticker: str, expiration: str) -> tuple[dict, bool]: ...


def _leg(contract: dict, spot: float, T: float, r: float, otype: str) -> ChainLeg:
    bid, ask, last, iv = (
        contract["bid"],
        contract["ask"],
        contract["lastPrice"],
        contract["impliedVolatility"],
    )
    mid = (bid + ask) / 2.0 if bid > 0 and ask > 0 else last
    valid_iv = math.isfinite(iv) and iv > 0.01
    greeks = None
    pop_short = None
    itm_prob = None
    if valid_iv:
        K = contract["strike"]
        g = bs_greeks(spot, K, T, r, iv, otype)
        greeks = Greeks(
            delta=round(g.delta, 4),
            gamma=round(g.gamma, 4),
            theta=round(g.theta, 4),
            vega=round(g.vega, 4),
        )
        p = prob_above(spot, K, T, r, iv)
        itm = p if otype == "call" else 1.0 - p
        itm_prob = round(itm * 100.0, 1)
        pop_short = round(100.0 - itm * 100.0, 1)
    return ChainLeg(
        contract_symbol=contract["contractSymbol"],
        bid=round(bid, 2),
        ask=round(ask, 2),
        mid=round(mid, 2),
        last=round(last, 2),
        volume=contract["volume"],
        open_interest=contract["openInterest"],
        iv=round(iv * 100.0, 2) if valid_iv else None,
        greeks=greeks,
        pop_short=pop_short,
        itm_prob=itm_prob,
    )


def run_chain(
    params: ChainParams,
    *,
    provider: ChainProvider | None = None,
    today: date | None = None,
    deadline_s: float | None = None,
) -> ChainResponse:
    if provider is None:
        provider = _data
    r = _env_float("RISK_FREE_RATE", 0.045, 0.0, 0.2)
    if deadline_s is None:
        deadline_s = _env_float("SCREENER_DEADLINE_SECONDS", 8.0, 0.1, 60.0)
    if today is None:
        today = _market_today()

    start = time.monotonic()

    def work() -> ChainResponse:
        quote, _ = provider.get_quote(params.ticker)
        spot = quote["last"]
        exp_list, _ = provider.get_expirations(params.ticker)
        expirations = []
        for exp_str in exp_list:
            try:
                dte = (date.fromisoformat(exp_str) - today).days
            except ValueError:
                continue
            if dte >= 1:
                expirations.append(ChainExpiration(date=exp_str, dte=dte))
        expirations.sort(key=lambda e: e.dte)

        exp_str = params.expiration.isoformat() if params.expiration else None
        rows: list[ChainRow] = []
        dte_out = None
        if exp_str is not None:
            if exp_str not in {e.date for e in expirations}:
                raise ExpirationNotFound
            dte_out = (params.expiration - today).days
            chain, _ = provider.get_chain(params.ticker, exp_str)
            calls = {c["strike"]: c for c in chain.get("calls", [])}
            puts = {c["strike"]: c for c in chain.get("puts", [])}
            T = year_fraction(dte_out)
            for K in sorted(set(calls) | set(puts)):
                rows.append(
                    ChainRow(
                        strike=K,
                        call=_leg(calls[K], spot, T, r, "call") if K in calls else None,
                        put=_leg(puts[K], spot, T, r, "put") if K in puts else None,
                    )
                )
        return ChainResponse(
            ticker=params.ticker,
            spot=round(spot, 2),
            expirations=expirations,
            expiration=exp_str,
            dte=dte_out,
            rows=rows,
            meta=ChainMeta(
                risk_free_rate=r,
                generated_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            ),
        )

    executor = ThreadPoolExecutor(max_workers=1)
    try:
        fut = executor.submit(work)
        return fut.result(timeout=deadline_s - (time.monotonic() - start))
    finally:
        executor.shutdown(wait=False, cancel_futures=True)
