import json
import threading
import time
import urllib.request
from datetime import date, timedelta
from http.server import ThreadingHTTPServer

import _data
import overview
import pytest
from _models import OverviewParams
from _overview import run_overview
from pydantic import ValidationError

TODAY = date(2025, 1, 1)
SPOT = 100.0


def contract(strike, bid, ask, iv=0.3, last=0.0):
    return {
        "contractSymbol": f"T{int(strike)}",
        "strike": float(strike),
        "bid": float(bid),
        "ask": float(ask),
        "lastPrice": float(last),
        "volume": 10,
        "openInterest": 100,
        "impliedVolatility": float(iv),
    }


class FakeProvider:
    def __init__(self, quotes=None, expirations=None, chains=None, fail=()):
        self.quotes = quotes or {}
        self.expirations = expirations or {}
        self.chains = chains or {}
        self.fail = set(fail)

    def get_quote(self, ticker):
        if ticker in self.fail:
            raise RuntimeError("boom")
        return self.quotes.get(
            ticker, {"last": SPOT, "previous_close": 98.0, "volume": 1000}
        ), False

    def get_expirations(self, ticker):
        if ticker in self.fail:
            raise RuntimeError("boom")
        return self.expirations.get(ticker, ()), False

    def get_chain(self, ticker, expiration):
        if ticker in self.fail:
            raise RuntimeError("boom")
        return self.chains[(ticker, expiration)], False

    def get_daily_history(self, ticker):
        if ticker in self.fail:
            raise RuntimeError("boom")
        return [], False


def exp(days):
    return (TODAY + timedelta(days=days)).isoformat()


def params(**kw):
    kw.setdefault("tickers", ["AAA"])
    return OverviewParams(**kw)


def chain_with(strikes, **kw):
    kw.setdefault("bid", 1.0)
    kw.setdefault("ask", 1.4)
    return {
        "calls": [contract(s, **kw) for s in strikes],
        "puts": [contract(s, **kw) for s in strikes],
    }


def test_closest_expiration_and_tie():
    # objetivo 30: exp(10) y exp(50) empatan a distancia 20 → gana la más temprana.
    exps = (exp(10), exp(50), exp(0))
    p = FakeProvider(
        expirations={"AAA": exps},
        chains={("AAA", e): chain_with([100]) for e in exps},
    )
    resp = run_overview(params(dte=30), provider=p, today=TODAY)
    item = resp.items[0]
    assert item.expiration == exp(10)
    assert item.dte == 10  # DTE 0 excluido, empate → la más temprana


def test_atm_strike_closest_in_both_sides():
    chain = {
        "calls": [
            contract(95, 1.0, 1.4),
            contract(100, 1.0, 1.4),
            contract(105, 1.0, 1.4),
            contract(97, 1.0, 1.4),
        ],
        "puts": [contract(95, 1.0, 1.4), contract(105, 1.0, 1.4)],
    }
    p = FakeProvider(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): chain},
    )
    resp = run_overview(params(), provider=p, today=TODAY)
    item = resp.items[0]
    assert item.atm_strike == 95  # 97 solo existe en calls; 95 vs 105 → 95


def test_atm_tie_lower_strike():
    class P(FakeProvider):
        def get_quote(self, ticker):
            return {"last": 100.0, "previous_close": 100.0, "volume": 1}, False

    chain = {
        "calls": [contract(95, 1.0, 1.4), contract(105, 1.0, 1.4)],
        "puts": [contract(95, 1.0, 1.4), contract(105, 1.0, 1.4)],
    }
    p = P(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): chain})
    resp = run_overview(params(), provider=p, today=TODAY)
    assert resp.items[0].atm_strike == 95  # empate a distancia 5 → menor


def test_greeks_and_atm_iv():
    chain = {
        "calls": [contract(100, 2.0, 2.4, iv=0.3)],
        "puts": [contract(100, 2.0, 2.4, iv=0.5)],
    }
    p = FakeProvider(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): chain})
    item = run_overview(params(), provider=p, today=TODAY).items[0]
    assert 0 < item.call.greeks.delta < 1
    assert -1 < item.put.greeks.delta < 0
    assert item.call.greeks.gamma > 0
    assert item.call.greeks.theta < 0
    assert item.put.greeks.theta < 0
    assert item.atm_iv == pytest.approx(40.0)  # media de 30 y 50 (en %)


def test_invalid_iv_leg_none():
    chain = {
        "calls": [contract(100, 2.0, 2.4, iv=float("nan"))],
        "puts": [contract(100, 2.0, 2.4, iv=0.4)],
    }
    p = FakeProvider(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): chain})
    item = run_overview(params(), provider=p, today=TODAY).items[0]
    assert item.call is None
    assert item.put is not None
    assert item.atm_iv == pytest.approx(40.0)


def test_mid_fallback_to_last_price():
    chain = {
        "calls": [contract(100, 0.0, 0.0, iv=0.3, last=3.0)],
        "puts": [contract(100, 0.0, 0.0, iv=0.3, last=3.0)],
    }
    p = FakeProvider(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): chain})
    item = run_overview(params(), provider=p, today=TODAY).items[0]
    assert item.call is not None
    assert item.call.mid == pytest.approx(3.0)


def test_change_and_previous_close():
    p = FakeProvider(
        quotes={
            "AAA": {"last": 110.0, "previous_close": 100.0, "volume": 5000},
            "BBB": {"last": 50.0, "previous_close": None, "volume": None},
        },
        expirations={"AAA": (), "BBB": ()},
    )
    resp = run_overview(params(tickers=["AAA", "BBB"]), provider=p, today=TODAY)
    a, b = resp.items
    assert a.change == pytest.approx(10.0)
    assert a.change_pct == pytest.approx(10.0)
    assert a.volume == 5000
    assert b.previous_close is None
    assert b.change is None
    assert b.change_pct is None
    assert b.volume is None


def test_ticker_failure_isolated():
    p = FakeProvider(
        expirations={"BBB": (exp(30),)},
        chains={("BBB", exp(30)): chain_with([200])},
        fail={"AAA"},
    )
    resp = run_overview(params(tickers=["AAA", "BBB"]), provider=p, today=TODAY)
    a, b = resp.items
    assert a.error == "No se pudieron obtener datos de Yahoo"
    assert b.error is None
    assert b.atm_strike == 200


def test_no_expirations():
    p = FakeProvider(expirations={"AAA": ()})
    item = run_overview(params(), provider=p, today=TODAY).items[0]
    assert item.error == "Sin opciones listadas"
    assert item.spot == pytest.approx(SPOT)


def test_deadline_truncates():
    class SlowProvider(FakeProvider):
        def get_quote(self, ticker):
            time.sleep(2.0)
            return super().get_quote(ticker)

    p = SlowProvider(expirations={"AAA": (exp(30),)})
    t0 = time.monotonic()
    resp = run_overview(params(), provider=p, today=TODAY, deadline_s=0.2)
    assert time.monotonic() - t0 < 1.0
    assert resp.meta.truncated is True
    assert resp.items[0].error == "Tiempo límite alcanzado"
    assert any("límite" in w for w in resp.meta.warnings)


def test_order_preserved():
    p = FakeProvider(expirations={"AAA": (), "BBB": (), "CCC": ()})
    resp = run_overview(params(tickers=["CCC", "AAA", "BBB"]), provider=p, today=TODAY)
    assert [i.ticker for i in resp.items] == ["CCC", "AAA", "BBB"]


def test_overview_params_validation():
    assert OverviewParams(tickers=" spy ,aapl").tickers == ["SPY", "AAPL"]
    assert OverviewParams(tickers="SPY").dte == 30
    with pytest.raises(ValidationError):
        OverviewParams(tickers="SPY", dte=0)
    with pytest.raises(ValidationError):
        OverviewParams(tickers="SPY", dte=400)
    with pytest.raises(ValidationError):
        OverviewParams(tickers="SPY", extra_param=1)
    with pytest.raises(ValidationError):
        OverviewParams(tickers="BAD;rm")
    with pytest.raises(ValidationError):
        OverviewParams(tickers="A,B,C,D,E,F")


@pytest.fixture()
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), overview.handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def get(url):
    try:
        return urllib.request.urlopen(url)
    except urllib.error.HTTPError as e:
        return e


def test_handler_200_and_headers(server, monkeypatch):
    from _models import OverviewMeta, OverviewResponse, TickerOverview

    monkeypatch.setattr(
        overview,
        "run_overview",
        lambda params: OverviewResponse(
            items=[TickerOverview(ticker="SPY", spot=100.0)],
            meta=OverviewMeta(
                risk_free_rate=0.045,
                generated_at="2025-01-01T00:00:00Z",
                truncated=False,
                warnings=[],
            ),
        ),
    )
    resp = get(f"{server}/api/overview?tickers=SPY")
    assert resp.status == 200
    body = json.loads(resp.read())
    assert body["items"][0]["ticker"] == "SPY"
    assert resp.headers["Cache-Control"] == "no-cache"
    assert resp.headers["Vercel-CDN-Cache-Control"] == "max-age=60, stale-while-revalidate=120"


def test_handler_400(server):
    resp = get(f"{server}/api/overview?tickers=bad!!")
    assert resp.status == 400
    body = json.loads(resp.read())
    assert body["error"] == "Parámetros inválidos"
    assert resp.headers["Cache-Control"] == "no-store"
    assert resp.headers.get("Vercel-CDN-Cache-Control") is None


def test_handler_405(server):
    req = urllib.request.Request(f"{server}/api/overview", data=b"{}", method="POST")
    assert get(req).status == 405


def test_handler_500(server, monkeypatch):
    def boom(params):
        raise RuntimeError("secret internal")

    monkeypatch.setattr(overview, "run_overview", boom)
    resp = get(f"{server}/api/overview?tickers=SPY")
    assert resp.status == 500
    assert resp.read() == b'{"error": "Error interno"}'


@pytest.fixture(autouse=True)
def clean_cache():
    _data.clear_cache()
    yield
    _data.clear_cache()


def test_get_quote(monkeypatch):
    class FakeFastInfo(dict):
        pass

    calls = []

    class FakeTicker:
        def __init__(self, t):
            calls.append(t)
            self.fast_info = FakeFastInfo(
                last_price=101.5, previous_close=float("nan"), last_volume=12345
            )

    monkeypatch.setattr(_data.yf, "Ticker", FakeTicker)
    quote, hit = _data.get_quote("SPY")
    assert quote == {"last": 101.5, "previous_close": None, "volume": 12345}
    assert hit is False
    _, hit = _data.get_quote("SPY")
    assert hit is True  # TTL de 60 s
    assert len(calls) == 1
