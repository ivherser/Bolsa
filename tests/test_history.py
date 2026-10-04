import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

import _data
import history
import pandas as pd
import pytest
from _models import HistoryParams
from pydantic import ValidationError


def _df(rows):
    idx = pd.to_datetime([r[0] for r in rows])
    return pd.DataFrame(
        {
            "Open": [r[1] for r in rows],
            "High": [r[2] for r in rows],
            "Low": [r[3] for r in rows],
            "Close": [r[4] for r in rows],
            "Volume": [r[5] for r in rows],
        },
        index=idx,
    )


ROWS = [
    ("2025-01-02 10:00", 100.0, 101.0, 99.0, 100.5, 1000),
    ("2025-01-02 11:00", float("nan"), 1.0, 1.0, 1.0, 10),  # NaN → descartada
    ("2025-01-02 12:00", 101.0, 102.0, 100.0, 101.5, 2000),
]


def test_get_history_drops_nan_and_int_time(monkeypatch):
    calls = []

    class FakeTicker:
        def __init__(self, t):
            pass

        def history(self, period, interval, auto_adjust):
            calls.append((period, interval))
            return _df(ROWS)

    monkeypatch.setattr(_data.yf, "Ticker", FakeTicker)
    candles, hit = _data.get_history("SPY", "1h")
    assert hit is False
    assert calls == [("60d", "1h")]
    assert len(candles) == 2
    c = candles[0]
    assert isinstance(c["time"], int)
    assert c["open"] == 100.0 and c["volume"] == 1000


@pytest.mark.parametrize(("interval", "period"), [("1h", "60d"), ("1d", "1y"), ("1wk", "5y")])
def test_period_mapping(monkeypatch, interval, period):
    seen = []

    class FakeTicker:
        def __init__(self, t):
            pass

        def history(self, period, interval, auto_adjust):
            seen.append(period)
            return _df(ROWS[:1])

    monkeypatch.setattr(_data.yf, "Ticker", FakeTicker)
    _data.get_history("SPY", interval)
    assert seen == [period]


def test_history_params():
    assert HistoryParams(ticker="spy").ticker == "SPY"
    assert HistoryParams(ticker="SPY").interval == "1d"
    assert HistoryParams(ticker="SPY", interval="1wk").interval == "1wk"
    with pytest.raises(ValidationError):
        HistoryParams(ticker="SPY", interval="5m")
    with pytest.raises(ValidationError):
        HistoryParams(ticker="BAD;x")
    with pytest.raises(ValidationError):
        HistoryParams(ticker="SPY", extra=1)


@pytest.fixture()
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), history.handler)
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
    candles = [
        {"time": 1735821600, "open": 1.0, "high": 2.0, "low": 0.5, "close": 1.5, "volume": 5}
    ]
    monkeypatch.setattr(history, "get_history", lambda t, i: (candles, False))
    resp = get(f"{server}/api/history?ticker=SPY&interval=1d")
    assert resp.status == 200
    body = json.loads(resp.read())
    assert body["candles"][0]["time"] == 1735821600
    assert resp.headers["Cache-Control"] == "no-cache"
    assert resp.headers["Vercel-CDN-Cache-Control"] == "max-age=300, stale-while-revalidate=600"


def test_handler_400_interval(server):
    resp = get(f"{server}/api/history?ticker=SPY&interval=5m")
    assert resp.status == 400
    assert resp.headers["Cache-Control"] == "no-store"
    assert resp.headers.get("Vercel-CDN-Cache-Control") is None


def test_handler_405(server):
    req = urllib.request.Request(f"{server}/api/history", data=b"{}", method="POST")
    assert get(req).status == 405


def test_handler_504(server, monkeypatch):
    import time as _time

    def slow(t, i):
        _time.sleep(2.0)
        return [], False

    monkeypatch.setattr(history, "get_history", slow)
    monkeypatch.setattr(history, "_env_float", lambda *a, **k: 0.2)
    resp = get(f"{server}/api/history?ticker=SPY")
    assert resp.status == 504


@pytest.fixture(autouse=True)
def clean_cache():
    _data.clear_cache()
    yield
    _data.clear_cache()
