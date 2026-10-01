import _data


def test_cache_hit_and_expiry(monkeypatch):
    _data.clear_cache()
    calls = []

    def fetch():
        calls.append(1)
        return "v"

    t = [1000.0]
    monkeypatch.setattr(_data.time, "monotonic", lambda: t[0])

    val, hit = _data._cached(("k",), fetch)
    assert (val, hit) == ("v", False)
    val, hit = _data._cached(("k",), fetch)
    assert (val, hit) == ("v", True)
    assert len(calls) == 1

    t[0] += _data.CACHE_TTL_SECONDS + 1
    val, hit = _data._cached(("k",), fetch)
    assert (val, hit) == ("v", False)
    assert len(calls) == 2
