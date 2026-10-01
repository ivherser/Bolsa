"""Función serverless Vercel: GET /api/screener."""

from __future__ import annotations

import json
import logging
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _models import ScreenerParams  # noqa: E402
from _screener import run_screener  # noqa: E402
from pydantic import ValidationError  # noqa: E402

logger = logging.getLogger(__name__)


class handler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, body: bytes, cache: str = "no-store") -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", cache)
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
                params = ScreenerParams.model_validate(raw_params)
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
            response = run_screener(params)
            self._send_json(
                200,
                response.model_dump_json().encode(),
                cache="public, s-maxage=300, stale-while-revalidate=600",
            )
        except Exception:
            logger.exception("Error interno en /api/screener")
            try:
                self._send_json(500, json.dumps({"error": "Error interno"}).encode())
            except Exception:
                logger.exception("No se pudo responder 500")

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        logger.debug("%s - %s", self.address_string(), format % args)
