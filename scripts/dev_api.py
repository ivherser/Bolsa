"""Servidor de desarrollo local para /api/screener y /api/status
(sustituye a un uvicorn separado).

Uso: python scripts/dev_api.py
"""

import os
import sys
from http.server import ThreadingHTTPServer
from urllib.parse import urlparse

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "api"))

import overview  # noqa: E402
import screener  # noqa: E402
import status  # noqa: E402

_ROUTES = {
    "/api/status": status.handler,
    "/api/overview": overview.handler,
}


class Dispatcher(screener.handler, status.handler, overview.handler):
    """Despacha por path: /api/status → status, /api/overview → overview,
    resto → screener."""

    def do_GET(self) -> None:
        _ROUTES.get(urlparse(self.path).path, screener.handler).do_GET(self)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Dispatcher)
    print("API de desarrollo en http://127.0.0.1:8000")
    print("  GET /api/screener  ·  GET /api/status  ·  GET /api/overview")
    server.serve_forever()
