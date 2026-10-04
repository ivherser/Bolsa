import json
import math
import threading
import time
import urllib.request
from datetime import date, timedelta
from http.server import ThreadingHTTPServer

import chain
import pytest
from _chain import run_chain
from _models import ChainParams, OverviewParams
from _overview import hv_from_closes, hv_percentile, range_position, run_overview
from pydantic import ValidationError

TODAY = date(2025, 1, 1)
SPOT = 100.0


def contract(strike, bid=1.0, ask=1.4, iv=0.3, last=0.0):
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
    def __init__(self, quotes=None, expirations=None, chains=None, histories=None):
        self.quotes = quotes or {}
        self.expirations = expirations or {}
        self.chains = chains or {}
        self.histories = histories or {}

    def get_quote(self, ticker):
        return self.quotes.get(
            ticker, {"last": SPOT, "previous_close": 98.0, "volume": 1000}
        ), False

    def get_expirations(self, ticker):
        return self.expirations.get(ticker, ()), False

    def get_chain(self, ticker, expiration):
        return self.chains[(ticker, expiration)], False

    def get_daily_history(self, ticker):
        return self.histories.get(ticker, []), False


def exp(days):
    return (TODAY + timedelta(days=days)).isoformat()


def params(**kw):
    kw.setdefault("ticker", "AAA")
    return ChainParams(**kw)


# --- funciones puras de HV / rango ---


def test_hv_from_closes_constant_growth_near_zero():
    closes = [math.exp(0.001 * i) for i in range(60)]
    hv = hv_from_closes(closes)
    assert hv is not None
    assert hv < 0.5  # retornos idénticos → varianza ~0


def test_hv_from_closes_matches_hand_value():
    base = [100.0, 102.0, 99.0, 101.5, 98.7, 103.2, 100.4, 97.9, 101.1, 105.0]
    sample = [95.0 + i * 0.3 for i in range(21)] + base  # 31 cierres
    rets = [math.log(b / a) for a, b in zip(sample, sample[1:], strict=False)]
    mean = sum(rets) / len(rets)
    var = sum((x - mean) ** 2 for x in rets) / (len(rets) - 1)
    expected = round(math.sqrt(var * 252) * 100.0, 2)
    assert hv_from_closes(sample) == expected


def test_hv_from_closes_too_few():
    assert hv_from_closes([float(i) for i in range(30)]) is None


def test_hv_percentile_rising_vol_high():
    # volatilidad baja al principio, muy alta al final → percentil alto
    closes = [100.0]
    for _ in range(200):
        closes.append(closes[-1] * math.exp(0.001))
    for i in range(40):
        closes.append(closes[-1] * math.exp(0.05 * (1 if i % 2 == 0 else -1)))
    pct = hv_percentile(closes)
    assert pct is not None
    assert pct > 80


def test_hv_percentile_too_few():
    assert hv_percentile([float(i) for i in range(40)]) is None


def test_range_position():
    assert range_position(50.0, [100.0, 80.0], [20.0, 40.0]) == (37.5, 100.0, 20.0)
    # clamping: spot fuera del rango
    assert range_position(150.0, [100.0], [20.0])[0] == 100.0
    assert range_position(10.0, [100.0], [20.0])[0] == 0.0
    assert range_position(50.0, [100.0], [100.0]) is None
    assert range_position(50.0, [], [20.0]) is None


def test_overview_history_fields():
    closes = [100.0 * math.exp(0.001 * i) for i in range(120)]
    hist = [
        {"date": TODAY, "open": c, "high": c * 1.05, "low": c * 0.95, "close": c, "volume": 1}
        for c in closes
    ]
    p = FakeProvider(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): {"calls": [contract(100)], "puts": [contract(100)]}},
        histories={"AAA": hist},
    )
    item = run_overview(OverviewParams(tickers=["AAA"]), provider=p, today=TODAY).items[0]
    assert item.hv30 is not None and item.hv30 < 1.0
    assert item.range52w_pct is not None
    assert item.high_52w is not None and item.low_52w is not None
    assert item.hv_percentile_52w is not None


def test_overview_history_failure_isolated():
    class NoHist(FakeProvider):
        def get_daily_history(self, ticker):
            raise RuntimeError("no hist")

    p = NoHist(
        expirations={"AAA": (exp(30),)},
        chains={("AAA", exp(30)): {"calls": [contract(100)], "puts": [contract(100)]}},
    )
    item = run_overview(OverviewParams(tickers=["AAA"]), provider=p, today=TODAY).items[0]
    assert item.error is None
    assert item.call is not None
    assert item.hv30 is None
    assert item.range52w_pct is None
    assert item.hv_percentile_52w is None


# --- run_chain ---


def test_chain_no_expiration_lists():
    p = FakeProvider(expirations={"AAA": (exp(10), exp(0), exp(30))})
    resp = run_chain(params(), provider=p, today=TODAY)
    assert resp.expiration is None and resp.dte is None
    assert resp.rows == []
    assert [e.dte for e in resp.expirations] == [10, 30]  # dte>=1, ordenados


def test_chain_rows_union_sorted():
    ch = {
        "calls": [contract(95), contract(105)],
        "puts": [contract(100), contract(105)],
    }
    p = FakeProvider(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): ch})
    resp = run_chain(params(expiration=date.fromisoformat(exp(30))), provider=p, today=TODAY)
    assert resp.expiration == exp(30)
    assert resp.dte == 30
    strikes = [r.strike for r in resp.rows]
    assert strikes == [95.0, 100.0, 105.0]
    row100 = resp.rows[1]
    assert row100.call is None and row100.put is not None


def test_chain_invalid_iv_prices_kept():
    ch = {
        "calls": [contract(100, bid=2.0, ask=2.4, iv=float("nan"), last=1.5)],
        "puts": [contract(100, bid=2.0, ask=2.4, iv=0.4)],
    }
    p = FakeProvider(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): ch})
    resp = run_chain(params(expiration=date.fromisoformat(exp(30))), provider=p, today=TODAY)
    call = resp.rows[0].call
    assert call.iv is None and call.greeks is None and call.pop_short is None
    assert call.bid == 2.0 and call.ask == 2.4
    put = resp.rows[0].put
    assert put.iv == pytest.approx(40.0)
    assert put.pop_short + put.itm_prob == pytest.approx(100.0)
    assert put.greeks.delta < 0


def test_chain_pop_itm_consistency():
    ch = {"calls": [contract(100)], "puts": [contract(100)]}
    p = FakeProvider(expirations={"AAA": (exp(30),)}, chains={("AAA", exp(30)): ch})
    resp = run_chain(params(expiration=date.fromisoformat(exp(30))), provider=p, today=TODAY)
    call, put = resp.rows[0].call, resp.rows[0].put
    assert call.pop_short + call.itm_prob == pytest.approx(100.0)
    # put ITM prob = 1 - prob_above; ATM → cada lado ~50
    assert 0 < call.itm_prob < 100
    assert 0 < put.itm_prob < 100


def test_chain_bad_expiration():
    from _chain import ExpirationNotFound

    p = FakeProvider(expirations={"AAA": (exp(30),)})
    with pytest.raises(ExpirationNotFound):
        run_chain(params(expiration=date(2020, 1, 17)), provider=p, today=TODAY)


def test_chain_params_validation():
    assert ChainParams(ticker=" spy ").ticker == "SPY"
    with pytest.raises(ValidationError):
        ChainParams(ticker="BAD;rm")
    with pytest.raises(ValidationError):
        ChainParams(ticker="SPY", expiration="not-a-date")
    with pytest.raises(ValidationError):
        ChainParams(ticker="SPY", unknown=1)


# --- handler ---


@pytest.fixture()
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), chain.handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def get(url):
    try:
        return urllib.request.urlopen(url)
    except urllib.error.HTTPError as e:
        return e


def _fake_response():
    from _models import ChainMeta, ChainResponse

    return ChainResponse(
        ticker="SPY",
        spot=100.0,
        expirations=[],
        meta=ChainMeta(risk_free_rate=0.045, generated_at="2025-01-01T00:00:00Z"),
    )


def test_handler_200_and_headers(server, monkeypatch):
    monkeypatch.setattr(chain, "run_chain", lambda params: _fake_response())
    resp = get(f"{server}/api/chain?ticker=SPY")
    assert resp.status == 200
    assert json.loads(resp.read())["ticker"] == "SPY"
    assert resp.headers["Cache-Control"] == "no-cache"
    assert resp.headers["Vercel-CDN-Cache-Control"] == "max-age=60, stale-while-revalidate=120"


def test_handler_400_bad_ticker(server):
    resp = get(f"{server}/api/chain?ticker=bad!!")
    assert resp.status == 400
    assert resp.headers["Cache-Control"] == "no-store"
    assert resp.headers.get("Vercel-CDN-Cache-Control") is None


def test_handler_400_expiration(server, monkeypatch):
    from _chain import ExpirationNotFound

    def raise_nf(params):
        raise ExpirationNotFound

    monkeypatch.setattr(chain, "run_chain", raise_nf)
    resp = get(f"{server}/api/chain?ticker=SPY&expiration=2020-01-17")
    assert resp.status == 400
    assert json.loads(resp.read())["error"] == "Expiración no disponible"


def test_handler_405(server):
    req = urllib.request.Request(f"{server}/api/chain", data=b"{}", method="POST")
    assert get(req).status == 405


def test_handler_504(server, monkeypatch):
    import concurrent.futures

    def timeout(params):
        raise concurrent.futures.TimeoutError

    monkeypatch.setattr(chain, "run_chain", timeout)
    resp = get(f"{server}/api/chain?ticker=SPY")
    assert resp.status == 504
    assert resp.headers["Cache-Control"] == "no-store"


def test_run_chain_deadline():
    class Slow(FakeProvider):
        def get_quote(self, ticker):
            time.sleep(2.0)
            return super().get_quote(ticker)

    t0 = time.monotonic()
    with pytest.raises(TimeoutError):
        run_chain(params(), provider=Slow(), today=TODAY, deadline_s=0.2)
    assert time.monotonic() - t0 < 1.0
