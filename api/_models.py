"""Modelos pydantic para el screener de opciones.

Todos los campos porcentuales se expresan en números de porcentaje
(por ejemplo, iv_min=25 significa 25 %). Los deltas se filtran por
valor absoluto.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

OptionTypeFilter = Literal["put", "call", "both"]
Strategy = Literal["short", "credit_spread", "long"]
SortField = Literal[
    "ror_day",
    "ror",
    "pop",
    "iv",
    "delta",
    "oi",
    "volume",
    "dte",
    "strike",
    "spread_pct",
    "mid",
    "expiration",
    "ticker",
]

TICKER_RE = r"^\^?[A-Z0-9][A-Z0-9.\-]{0,9}$"
MAX_TICKERS = 5

_TICKER_PATTERN = re.compile(TICKER_RE)


def parse_tickers(value: object) -> list[str]:
    if isinstance(value, str):
        raw = value.split(",")
    elif isinstance(value, list):
        raw = []
        for item in value:
            if isinstance(item, str):
                raw.extend(item.split(","))
            else:
                raw.append(item)
    else:
        raw = [value]
    seen: set[str] = set()
    tickers: list[str] = []
    for item in raw:
        ticker = str(item).strip().upper()
        if not ticker or ticker in seen:
            continue
        if not _TICKER_PATTERN.match(ticker):
            raise ValueError(f"Ticker inválido: {ticker!r}")
        seen.add(ticker)
        tickers.append(ticker)
    return tickers


class ScreenerParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tickers: Annotated[list[str], Field(min_length=1, max_length=MAX_TICKERS)]
    option_type: OptionTypeFilter = "both"
    strategy: Strategy = "short"
    spread_width: float = Field(5.0, gt=0, le=100)
    dte_min: int = Field(0, ge=0, le=730)
    dte_max: int = Field(60, ge=0, le=730)
    delta_min: float = Field(0.0, ge=0, le=1)
    delta_max: float = Field(1.0, ge=0, le=1)
    oi_min: int = Field(0, ge=0)
    volume_min: int = Field(0, ge=0)
    spread_max_pct: float | None = Field(None, gt=0, le=1000)
    iv_min: float = Field(0.0, ge=0, le=1000)
    pop_min: float = Field(0.0, ge=0, le=100)
    max_expirations: int = Field(4, ge=1, le=12)
    sort_by: SortField = "ror_day"
    sort_order: Literal["asc", "desc"] = "desc"
    limit: int = Field(200, ge=1, le=1000)

    @field_validator("tickers", mode="before")
    @classmethod
    def _parse_tickers(cls, value: object) -> list[str]:
        return parse_tickers(value)

    @model_validator(mode="after")
    def _check_ranges(self) -> ScreenerParams:
        if self.dte_min > self.dte_max:
            raise ValueError("dte_min no puede ser mayor que dte_max")
        if self.delta_min > self.delta_max:
            raise ValueError("delta_min no puede ser mayor que delta_max")
        return self


class Greeks(BaseModel):
    delta: float
    gamma: float
    theta: float
    vega: float


class OptionResult(BaseModel):
    ticker: str
    contract_symbol: str
    option_type: Literal["put", "call"]
    strategy: Strategy
    expiration: str  # YYYY-MM-DD
    dte: int
    spot: float
    strike: float
    long_strike: float | None = None
    width: float | None = None
    bid: float
    ask: float
    mid: float
    last: float
    spread_pct: float
    volume: int
    open_interest: int
    iv: float  # porcentaje
    greeks: Greeks
    premium: float  # por acción
    breakeven: float
    max_profit: float | None = None  # por contrato en $
    max_loss: float | None = None
    pop: float  # porcentaje
    ror: float | None = None  # porcentaje
    ror_day: float | None = None  # porcentaje


class ScreenerMeta(BaseModel):
    tickers: list[str]
    spots: dict[str, float]
    risk_free_rate: float
    generated_at: str  # ISO UTC
    expirations_scanned: int
    cache_hits: int
    truncated: bool
    warnings: list[str]
    count: int


class ScreenerResponse(BaseModel):
    results: list[OptionResult]
    meta: ScreenerMeta


class StatusResponse(BaseModel):
    source: str
    connected: bool
    latency_ms: int | None = None
    checked_at: str  # ISO UTC


class OverviewParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tickers: Annotated[list[str], Field(min_length=1, max_length=MAX_TICKERS)]
    dte: int = Field(30, ge=1, le=365)

    @field_validator("tickers", mode="before")
    @classmethod
    def _parse_tickers(cls, value: object) -> list[str]:
        return parse_tickers(value)


class AtmLeg(BaseModel):
    strike: float
    bid: float
    ask: float
    mid: float
    iv: float  # porcentaje
    greeks: Greeks


class TickerOverview(BaseModel):
    ticker: str
    spot: float
    previous_close: float | None = None
    change: float | None = None
    change_pct: float | None = None
    volume: int | None = None
    expiration: str | None = None
    dte: int | None = None
    atm_strike: float | None = None
    atm_iv: float | None = None  # porcentaje
    hv30: float | None = None  # volatilidad histórica 30d anualizada, %
    range52w_pct: float | None = None
    high_52w: float | None = None
    low_52w: float | None = None
    hv_percentile_52w: float | None = None
    call: AtmLeg | None = None
    put: AtmLeg | None = None
    error: str | None = None


class OverviewMeta(BaseModel):
    risk_free_rate: float
    generated_at: str  # ISO UTC
    truncated: bool
    warnings: list[str]


class OverviewResponse(BaseModel):
    items: list[TickerOverview]
    meta: OverviewMeta


class ChainParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str
    expiration: date | None = None

    @field_validator("ticker", mode="before")
    @classmethod
    def _parse_ticker(cls, value: object) -> str:
        tickers = parse_tickers(value)
        if len(tickers) != 1:
            raise ValueError("Se espera un único ticker")
        return tickers[0]


class ChainLeg(BaseModel):
    contract_symbol: str
    bid: float
    ask: float
    mid: float
    last: float
    volume: int
    open_interest: int
    iv: float | None = None  # porcentaje
    greeks: Greeks | None = None
    pop_short: float | None = None  # porcentaje
    itm_prob: float | None = None  # porcentaje


class ChainRow(BaseModel):
    strike: float
    call: ChainLeg | None = None
    put: ChainLeg | None = None


class ChainExpiration(BaseModel):
    date: str
    dte: int


class ChainMeta(BaseModel):
    risk_free_rate: float
    generated_at: str  # ISO UTC


class ChainResponse(BaseModel):
    ticker: str
    spot: float
    expirations: list[ChainExpiration]
    expiration: str | None = None
    dte: int | None = None
    rows: list[ChainRow] = []
    meta: ChainMeta


class HistoryParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ticker: str
    interval: Literal["1h", "1d", "1wk"] = "1d"

    @field_validator("ticker", mode="before")
    @classmethod
    def _parse_ticker(cls, value: object) -> str:
        tickers = parse_tickers(value)
        if len(tickers) != 1:
            raise ValueError("Se espera un único ticker")
        return tickers[0]


class Candle(BaseModel):
    time: int  # unix seconds UTC
    open: float
    high: float
    low: float
    close: float
    volume: int


class HistoryResponse(BaseModel):
    ticker: str
    interval: str
    candles: list[Candle]
