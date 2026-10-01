import time
from datetime import date, timedelta

import pytest
from _models import ScreenerParams
from _screener import run_screener

TODAY = date(2025, 1, 1)
SPOT = 100.0


def contract(strike, bid, ask, iv=0.3, volume=50, oi=500, symbol=None, last=None):
    return {
        "contractSymbol": symbol or f"TEST{int(strike)}",
        "strike": float(strike),
        "bid": float(bid),
        "ask": float(ask),
        "lastPrice": float(last if last is not None else (bid + ask) / 2),
        "volume": int(volume),
        "openInterest": int(oi),
        "impliedVolatility": float(iv),
    }


class FakeProvider:
    def __init__(self, spots=None, expirations=None, chains=None, fail=()):
        self.spots = spots or {}
        self.expirations = expirations or {}
        self.chains = chains or {}
        self.fail = set(fail)

    def get_spot(self, ticker):
        if ticker in self.fail:
            raise RuntimeError("boom")
        return self.spots.get(ticker, SPOT), False

    def get_expirations(self, ticker):
        if ticker in self.fail:
            raise RuntimeError("boom")
        return self.expirations.get(ticker, ()), False

    def get_chain(self, ticker, expiration):
        if ticker in self.fail:
            raise RuntimeError("boom")
        return self.chains[(ticker, expiration)], False


def exp(days):
    return (TODAY + timedelta(days=days)).isoformat()


def base_params(**kw):
    kw.setdefault("tickers", ["AAA"])
    return ScreenerParams(**kw)


def puts_chain():
    return {
        "puts": [
            contract(90, 1.0, 1.4, symbol="P90"),
            contract(85, 0.5, 0.7, symbol="P85"),
        ],
        "calls": [],
    }


def test_short_put_metrics():
    p = FakeProvider(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): puts_chain()},
    )
    resp = run_screener(base_params(option_type="put", strategy="short"), provider=p, today=TODAY)
    r = [x for x in resp.results if x.strike == 90][0]
    assert r.premium == pytest.approx(1.2)
    assert r.breakeven == pytest.approx(88.8)
    assert r.max_profit == pytest.approx(120.0)
    assert r.max_loss == pytest.approx(8880.0)
    assert r.ror == pytest.approx(round(120.0 / 8880.0 * 100.0, 2))
    assert r.ror_day == pytest.approx(round(r.ror / 30, 4))
    assert r.dte == 30
    assert 0 < r.pop < 100


def test_short_call_unlimited_loss():
    p = FakeProvider(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): {"puts": [], "calls": [contract(110, 1.0, 1.4)]}},
    )
    resp = run_screener(base_params(option_type="call", strategy="short"), provider=p, today=TODAY)
    r = resp.results[0]
    assert r.max_loss is None
    assert r.ror is None
    assert r.breakeven == pytest.approx(111.2)


def test_credit_spread_pairs_long_leg():
    p = FakeProvider(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): puts_chain()},
    )
    resp = run_screener(
        base_params(option_type="put", strategy="credit_spread", spread_width=5),
        provider=p,
        today=TODAY,
    )
    assert len(resp.results) == 1  # solo el strike 90 tiene pata larga en 85
    r = resp.results[0]
    assert r.strike == 90
    assert r.long_strike == 85
    assert r.width == pytest.approx(5.0)
    assert r.premium == pytest.approx(1.2 - 0.6)
    assert r.breakeven == pytest.approx(90 - 0.6)
    assert r.max_profit == pytest.approx(60.0)
    assert r.max_loss == pytest.approx(440.0)


def test_credit_spread_skips_without_long_leg():
    p = FakeProvider(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): {"puts": [contract(90, 1.0, 1.4)], "calls": []}},
    )
    resp = run_screener(
        base_params(option_type="put", strategy="credit_spread"), provider=p, today=TODAY
    )
    assert resp.results == []


def test_long_call_metrics():
    p = FakeProvider(
        expirations={"AAA": (exp(60),)},
        chains={("AAA", exp(60)): {"puts": [], "calls": [contract(100, 2.0, 2.4)]}},
    )
    resp = run_screener(base_params(option_type="call", strategy="long"), provider=p, today=TODAY)
    r = resp.results[0]
    assert r.premium == pytest.approx(2.2)
    assert r.breakeven == pytest.approx(102.2)
    assert r.max_profit is None
    assert r.max_loss == pytest.approx(220.0)
    assert r.ror is None
    assert 0 < r.pop < 100


def test_filters():
    chain = {
        "puts": [
            contract(90, 1.0, 1.4, oi=500, volume=50, symbol="OK"),
            contract(91, 1.0, 1.4, oi=5, symbol="LOW_OI"),
            contract(92, 1.0, 1.4, volume=1, symbol="LOW_VOL"),
            contract(93, 1.0, 10.0, symbol="WIDE"),
            contract(94, 1.0, 1.4, iv=0.001, symbol="LOW_IV"),
            contract(95, 0.0, 1.4, symbol="NO_BID"),
            contract(96, 2.0, 1.0, symbol="CROSSED"),
        ],
        "calls": [],
    }
    p = FakeProvider(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): chain})
    resp = run_screener(
        base_params(
            option_type="put", strategy="short", oi_min=100, volume_min=10, spread_max_pct=50
        ),
        provider=p,
        today=TODAY,
    )
    symbols = {r.contract_symbol for r in resp.results}
    assert symbols == {"OK"}


def test_delta_filter():
    # Put muy ITM (|delta| ~1) queda excluido por delta_max=0.5
    p = FakeProvider(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): {"puts": [contract(200, 100.0, 100.4)], "calls": []}},
    )
    resp = run_screener(
        base_params(option_type="put", strategy="short", delta_max=0.5), provider=p, today=TODAY
    )
    assert resp.results == []


def test_dte_window_and_max_expirations():
    exps = (exp(5), exp(10), exp(20), exp(30), exp(40), exp(100))
    chain = {"puts": [contract(90, 1.0, 1.4)], "calls": []}
    p = FakeProvider(
        expirations={"AAA": exps},
        chains={("AAA", e): chain for e in exps},
    )
    resp = run_screener(
        base_params(
            option_type="put",
            strategy="short",
            dte_min=10,
            dte_max=60,
            max_expirations=2,
        ),
        provider=p,
        today=TODAY,
    )
    assert {r.dte for r in resp.results} == {10, 20}
    assert resp.meta.expirations_scanned == 2


def test_sort_none_last_both_orders():
    chain = {
        "puts": [contract(90, 1.0, 1.4)],
        "calls": [contract(110, 1.0, 1.4)],  # short call → ror None
    }
    p = FakeProvider(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): chain})
    for order in ("asc", "desc"):
        resp = run_screener(
            base_params(option_type="both", strategy="short", sort_by="ror", sort_order=order),
            provider=p,
            today=TODAY,
        )
        rors = [r.ror for r in resp.results]
        assert rors[-1] is None
        assert rors[0] is not None


def test_provider_failure_warns_and_continues():
    p = FakeProvider(
        spots={"BBB": 200.0},
        expirations={"BBB": (exp(30),)},
        chains={("BBB", exp(30)): {"puts": [contract(190, 1.0, 1.4)], "calls": []}},
        fail={"AAA"},
    )
    resp = run_screener(base_params(tickers=["AAA", "BBB"]), provider=p, today=TODAY)
    assert any("AAA" in w for w in resp.meta.warnings)
    assert all(r.ticker == "BBB" for r in resp.results)
    assert len(resp.results) == 1


def test_deadline_truncates():
    class SlowProvider(FakeProvider):
        def get_chain(self, ticker, expiration):
            time.sleep(1.0)
            return super().get_chain(ticker, expiration)

    p = SlowProvider(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): puts_chain()},
    )
    resp = run_screener(
        base_params(option_type="put", strategy="short"),
        provider=p,
        today=TODAY,
        deadline_s=0.2,
    )
    assert resp.meta.truncated is True
    assert any("parciales" in w for w in resp.meta.warnings)


def test_invalid_risk_free_rate_env(monkeypatch):
    monkeypatch.setenv("RISK_FREE_RATE", "notanumber")
    p = FakeProvider(expirations={"AAA": ()})
    resp = run_screener(base_params(), provider=p, today=TODAY)
    assert resp.meta.risk_free_rate == pytest.approx(0.045)


def test_no_expirations_warning():
    p = FakeProvider(expirations={"AAA": ()})
    resp = run_screener(base_params(), provider=p, today=TODAY)
    assert resp.meta.warnings == ["AAA: sin opciones listadas"]
