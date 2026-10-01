import pytest
from _models import ScreenerParams
from pydantic import ValidationError


def test_comma_string_parsing():
    p = ScreenerParams(tickers="spy, aapl ,SPY,,msft")
    assert p.tickers == ["SPY", "AAPL", "MSFT"]


def test_list_parsing_and_dedupe():
    p = ScreenerParams(tickers=[" spy ", "AAPL", "spy"])
    assert p.tickers == ["SPY", "AAPL"]


def test_index_ticker():
    p = ScreenerParams(tickers="^VIX,BRK-B,BF.B")
    assert p.tickers == ["^VIX", "BRK-B", "BF.B"]


def test_max_five_tickers():
    with pytest.raises(ValidationError):
        ScreenerParams(tickers="A,B,C,D,E,F")


def test_bad_ticker_chars_rejected():
    with pytest.raises(ValidationError):
        ScreenerParams(tickers="AAPL;rm")
    with pytest.raises(ValidationError):
        ScreenerParams(tickers="<script>")


def test_empty_tickers_rejected():
    with pytest.raises(ValidationError):
        ScreenerParams(tickers="")
    with pytest.raises(ValidationError):
        ScreenerParams(tickers=[])


def test_dte_range_invalid():
    with pytest.raises(ValidationError):
        ScreenerParams(tickers="SPY", dte_min=50, dte_max=30)


def test_delta_range_invalid():
    with pytest.raises(ValidationError):
        ScreenerParams(tickers="SPY", delta_min=0.8, delta_max=0.2)


def test_extra_param_rejected():
    with pytest.raises(ValidationError):
        ScreenerParams(tickers="SPY", hack="yes")


def test_defaults():
    p = ScreenerParams(tickers="SPY")
    assert p.option_type == "both"
    assert p.strategy == "short"
    assert p.dte_max == 60
    assert p.max_expirations == 4
    assert p.sort_by == "ror_day"
    assert p.sort_order == "desc"
    assert p.limit == 200
