"""Griegas Black-Scholes puras (sin dividendos) usando scipy.stats.norm."""

from __future__ import annotations

import math
from typing import Literal

from _models import Greeks
from scipy.stats import norm


def year_fraction(dte: int) -> float:
    return max(dte, 1) / 365.0


def bs_greeks(
    S: float,
    K: float,
    T: float,
    r: float,
    sigma: float,
    option_type: Literal["put", "call"],
) -> Greeks:
    if not (S > 0 and K > 0 and T > 0 and sigma > 0):
        raise ValueError("S, K, T y sigma deben ser positivos")
    sqrt_t = math.sqrt(T)
    d1 = (math.log(S / K) + (r + sigma * sigma / 2.0) * T) / (sigma * sqrt_t)
    d2 = d1 - sigma * sqrt_t
    pdf = norm.pdf(d1)

    if option_type == "call":
        delta = norm.cdf(d1)
        theta = (
            -(S * pdf * sigma) / (2.0 * sqrt_t) - r * K * math.exp(-r * T) * norm.cdf(d2)
        ) / 365.0
    else:
        delta = norm.cdf(d1) - 1.0
        theta = (
            -(S * pdf * sigma) / (2.0 * sqrt_t) + r * K * math.exp(-r * T) * norm.cdf(-d2)
        ) / 365.0

    return Greeks(
        delta=delta,
        gamma=pdf / (S * sigma * sqrt_t),
        theta=theta,
        vega=S * pdf * sqrt_t / 100.0,
    )


def prob_above(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """Probabilidad lognormal neutral al riesgo de que S_T > K."""
    sqrt_t = math.sqrt(T)
    d2 = (math.log(S / K) + (r - sigma * sigma / 2.0) * T) / (sigma * sqrt_t)
    return norm.cdf(d2)
