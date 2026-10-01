"""Servidor de desarrollo local para /api/screener (sustituye a uvicorn).

Uso: python scripts/dev_api.py  →  http://127.0.0.1:8000/api/screener
"""

import os
import sys
from http.server import ThreadingHTTPServer

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO_ROOT, "api"))

import screener  # noqa: E402

if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), screener.handler)
    print("API de desarrollo en http://127.0.0.1:8000/api/screener")
    server.serve_forever()
