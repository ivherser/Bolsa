import json
import threading
import time
import urllib.request
from http.server import ThreadingHTTPServer

import _data
import pytest
import status


@pytest.fixture()
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), status.handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def get(url):
    try:
        return urllib.request.urlopen(url)
    except urllib.error.HTTPError as e:
        return e


def test_status_connected(server, monkeypatch):
    monkeypatch.setattr(status, "check_yahoo", lambda: (True, 42))
    resp = get(f"{server}/api/status")
    assert resp.status == 200
    body = json.loads(resp.read())
    assert body["source"] == "yahoo"
    assert body["connected"] is True
    assert body["latency_ms"] == 42
    assert body["checked_at"].endswith("Z")
    assert resp.headers["Cache-Control"] == "no-store"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"


def test_status_disconnected(server, monkeypatch):
    monkeypatch.setattr(status, "check_yahoo", lambda: (False, None))
    resp = get(f"{server}/api/status")
    assert resp.status == 200
    body = json.loads(resp.read())
    assert body["connected"] is False
    assert body["latency_ms"] is None


def test_status_405(server):
    req = urllib.request.Request(f"{server}/api/status", data=b"{}", method="POST")
    resp = get(req)
    assert resp.status == 405


def test_status_500_generic(server, monkeypatch):
    def boom():
        raise RuntimeError("secret internal")

    monkeypatch.setattr(status, "check_yahoo", boom)
    resp = get(f"{server}/api/status")
    assert resp.status == 500
    assert resp.read() == b'{"error": "Error interno"}'


@pytest.fixture(autouse=True)
def clean_cache():
    _data.clear_cache()
    yield
    _data.clear_cache()


def test_check_yahoo_connected(monkeypatch):
    class FakeTicker:
        def __init__(self, t):
            pass

        @property
        def options(self):
            return ("2025-01-17", "2025-02-21")

    monkeypatch.setattr(_data.yf, "Ticker", FakeTicker)
    connected, latency = _data.check_yahoo()
    assert connected is True
    assert isinstance(latency, int)


def test_check_yahoo_raises(monkeypatch):
    def boom(t):
        raise RuntimeError("down")

    monkeypatch.setattr(_data.yf, "Ticker", boom)
    assert _data.check_yahoo() == (False, None)


def test_check_yahoo_empty(monkeypatch):
    class FakeTicker:
        def __init__(self, t):
            pass

        options = ()

    monkeypatch.setattr(_data.yf, "Ticker", FakeTicker)
    assert _data.check_yahoo() == (False, None)


def test_check_yahoo_slow_returns_fast(monkeypatch):
    class FakeTicker:
        def __init__(self, t):
            pass

        @property
        def options(self):
            time.sleep(2.0)
            return ("x",)

    monkeypatch.setattr(_data.yf, "Ticker", FakeTicker)
    t0 = time.monotonic()
    connected, latency = _data.check_yahoo(timeout_s=0.2)
    assert time.monotonic() - t0 < 1.0
    assert connected is False
    assert latency is None


def test_check_yahoo_memo(monkeypatch):
    calls = []

    class FakeTicker:
        def __init__(self, t):
            calls.append(t)

        options = ("x",)

    monkeypatch.setattr(_data.yf, "Ticker", FakeTicker)
    connected, _ = _data.check_yahoo()
    assert connected is True
    assert len(calls) == 1
    _data.check_yahoo()
    assert len(calls) == 1  # memo de 60 s
    _data.clear_cache()
    _data.check_yahoo()
    assert len(calls) == 2
