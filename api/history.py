"""Función serverless Vercel: GET /api/history."""

from __future__ import annotations

import concurrent.futures
import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Permite `import _models` etc. tanto en Vercel como localmente;
# los noqa: E402 de abajo existen por esta línea.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _data import get_history  # noqa: E402
from _models import Candle, HistoryParams, HistoryResponse  # noqa: E402
from _screener import _env_float  # noqa: E402
from pydantic import ValidationError  # noqa: E402

logger = logging.getLogger(__name__)


class handler(BaseHTTPRequestHandler):
    def _send_json(
        self,
        status: int,
        body: bytes,
        cache: str = "no-store",
        cdn_cache: str | None = None,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", cache)
        if cdn_cache is not None:
            self.send_header("Vercel-CDN-Cache-Control", cdn_cache)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _method_not_allowed(self) -> None:
        self._send_json(405, json.dumps({"error": "Método no permitido"}).encode())

    do_POST = _method_not_allowed
    do_PUT = _method_not_allowed
    do_DELETE = _method_not_allowed

    def do_GET(self) -> None:
        try:
            query = parse_qs(urlparse(self.path).query, keep_blank_values=False)
            raw_params = {k: v[0] for k, v in query.items()}
            try:
                params = HistoryParams.model_validate(raw_params)
            except ValidationError as exc:
                details = [
                    {"field": ".".join(str(p) for p in err["loc"]), "message": err["msg"]}
                    for err in exc.errors()
                ]
                self._send_json(
                    400,
                    json.dumps({"error": "Parámetros inválidos", "details": details}).encode(),
                )
                return
            deadline_s = _env_float("SCREENER_DEADLINE_SECONDS", 8.0, 0.1, 60.0)
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            try:
                fut = executor.submit(get_history, params.ticker, params.interval)
                candles, _ = fut.result(timeout=deadline_s)
            except concurrent.futures.TimeoutError:
                self._send_json(504, json.dumps({"error": "Tiempo límite alcanzado"}).encode())
                return
            finally:
                executor.shutdown(wait=False, cancel_futures=True)
            response = HistoryResponse(
                ticker=params.ticker,
                interval=params.interval,
                candles=[Candle(**c) for c in candles],
            )
            self._send_json(
                200,
                response.model_dump_json().encode(),
                cache="no-cache",
                cdn_cache="max-age=300, stale-while-revalidate=600",
            )
        except Exception:
            logger.exception("Error interno en /api/history")
            try:
                self._send_json(500, json.dumps({"error": "Error interno"}).encode())
            except Exception:
                logger.exception("No se pudo responder 500")

    def log_message(self, format: str, *args) -> None:
        logger.debug("%s - %s", self.address_string(), format % args)
