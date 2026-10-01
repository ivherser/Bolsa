import math

import pytest
from _greeks import bs_greeks, prob_above, year_fraction

S, K, T, R, SIGMA = 100.0, 100.0, 1.0, 0.05, 0.2


def test_call_greeks():
    g = bs_greeks(S, K, T, R, SIGMA, "call")
    assert g.delta == pytest.approx(0.6368, abs=1e-3)
    assert g.gamma == pytest.approx(0.01876, abs=1e-3)
    assert g.vega == pytest.approx(0.3752, abs=1e-3)
    assert g.theta == pytest.approx(-6.414 / 365.0, abs=1e-5)


def test_put_greeks():
    g = bs_greeks(S, K, T, R, SIGMA, "put")
    assert g.delta == pytest.approx(-0.3632, abs=1e-3)
    assert g.gamma == pytest.approx(0.01876, abs=1e-3)
    assert g.theta == pytest.approx(-1.658 / 365.0, abs=1e-5)


def test_prob_above():
    p = prob_above(S, K, T, R, SIGMA)
    assert 0 < p < 1
    assert prob_above(S, 110, T, R, SIGMA) < prob_above(S, 90, T, R, SIGMA)


def test_year_fraction():
    assert year_fraction(30) == pytest.approx(30 / 365)
    assert year_fraction(0) == pytest.approx(1 / 365)


def test_invalid_inputs():
    with pytest.raises(ValueError):
        bs_greeks(S, K, T, R, 0.0, "call")
    with pytest.raises(ValueError):
        bs_greeks(0, K, T, R, SIGMA, "call")
    with pytest.raises(ValueError):
        bs_greeks(S, K, T, R, math.nan, "put")
