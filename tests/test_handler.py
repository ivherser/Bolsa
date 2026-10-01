import json
import threading
import urllib.request
from http.server import ThreadingHTTPServer

import pytest
import screener
from _models import ScreenerMeta, ScreenerResponse


@pytest.fixture()
def server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), screener.handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


def get(url):
    try:
        return urllib.request.urlopen(url)
    except urllib.error.HTTPError as e:
        return e


def fake_response():
    return ScreenerResponse(
        results=[],
        meta=ScreenerMeta(
            tickers=["SPY"],
            spots={"SPY": 100.0},
            risk_free_rate=0.045,
            generated_at="2025-01-01T00:00:00Z",
            expirations_scanned=0,
            cache_hits=0,
            truncated=False,
            warnings=[],
            count=0,
        ),
    )


def test_200_and_cache_header(server, monkeypatch):
    monkeypatch.setattr(screener, "run_screener", lambda params: fake_response())
    resp = get(f"{server}/api/screener?tickers=SPY")
    assert resp.status == 200
    body = json.loads(resp.read())
    assert body["meta"]["tickers"] == ["SPY"]
    assert "s-maxage=300" in resp.headers["Cache-Control"]
    assert resp.headers["X-Content-Type-Options"] == "nosniff"


def test_400_no_input_echo(server, monkeypatch):
    monkeypatch.setattr(screener, "run_screener", lambda params: fake_response())
    resp = get(f"{server}/api/screener?tickers=<script>alert(1)</script>")
    assert resp.status == 400
    body = json.loads(resp.read())
    assert body["error"] == "Parámetros inválidos"
    assert "details" in body
    assert "<script>" not in json.dumps(body)


def test_500_no_leak(server, monkeypatch):
    def boom(params):
        raise RuntimeError("secret internal")

    monkeypatch.setattr(screener, "run_screener", boom)
    resp = get(f"{server}/api/screener?tickers=SPY")
    assert resp.status == 500
    assert resp.read() == b'{"error": "Error interno"}'


def test_post_405(server):
    req = urllib.request.Request(f"{server}/api/screener", data=b"{}", method="POST")
    try:
        urllib.request.urlopen(req)
        raise AssertionError("expected 405")
    except urllib.error.HTTPError as e:
        assert e.code == 405
