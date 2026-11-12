import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "growmaster_lib"))
from session_check import has_valid_session  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not has_valid_session(self.headers.get("Cookie")):
            self._json(401, {"error": "unauthorized"})
            return
        self._json(200, {"status": "ok"})

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
