"""Función serverless Vercel: GET /api/status."""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler

# Permite `import _models` etc. tanto en Vercel como localmente;
# los noqa: E402 de abajo existen por esta línea.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _data import check_yahoo  # noqa: E402
from _models import StatusResponse  # noqa: E402

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
            connected, latency_ms = check_yahoo()
            response = StatusResponse(
                source="yahoo",
                connected=connected,
                latency_ms=latency_ms,
                checked_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            )
            self._send_json(200, response.model_dump_json().encode())
        except Exception:
            logger.exception("Error interno en /api/status")
            try:
                self._send_json(500, json.dumps({"error": "Error interno"}).encode())
            except Exception:
                logger.exception("No se pudo responder 500")

    def log_message(self, format: str, *args) -> None:
        logger.debug("%s - %s", self.address_string(), format % args)
