import base64
import json
import os
import pathlib
import sys
import tempfile
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "growmaster_lib"))
from session_check import has_valid_session  # noqa: E402
from photo_bank import analyze  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not has_valid_session(self.headers.get("Cookie")):
            self._json(401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid_body"})
            return

        image_b64 = body.get("image_base64")
        filename = body.get("filename", "upload.jpg")
        if not image_b64:
            self._json(400, {"detail": "image_base64 requerido"})
            return
        try:
            data = base64.b64decode(image_b64)
        except Exception:
            self._json(400, {"detail": "image_base64 inválido"})
            return

        suffix = pathlib.Path(filename).suffix or ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
            tmp.write(data)
            tmp.flush()
            try:
                result = analyze(tmp.name)
            except ValueError as exc:
                self._json(400, {"detail": str(exc)})
                return
        self._json(200, result)

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
