import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "growmaster_lib"))
from session_check import has_valid_session  # noqa: E402
from photo_bank import check_manifest  # noqa: E402


import urllib.error  # noqa: E402
import urllib.request  # noqa: E402


def _probe(req):
    """Return only an HTTP status code (never any key or body)."""
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:  # noqa: BLE001
        return "network_error"


def key_status():
    out = {}
    ak = os.environ.get("ANTHROPIC_API_KEY", "")
    out["anthropic"] = "missing" if not ak else _probe(urllib.request.Request(
        "https://api.anthropic.com/v1/models", headers={"x-api-key": ak, "anthropic-version": "2023-06-01"}))
    ek = os.environ.get("ELEVENLABS_API_KEY", "")
    vid = os.environ.get("ELEVENLABS_VOICE_ID", "x9KrIDxDgLgpS9PEHqw8")
    out["elevenlabs_tts"] = "missing" if not ek else _probe(urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_22050_32",
        data=json.dumps({"text": "Hola.", "model_id": "eleven_multilingual_v2"}).encode(), method="POST",
        headers={"xi-api-key": ek, "Content-Type": "application/json"}))
    return out


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if "keys=1" in (self.path or ""):
            # Diagnostic: status codes only (200 = key works). No secrets returned.
            self._json(200, key_status())
            return
        if not has_valid_session(self.headers.get("Cookie")):
            self._json(401, {"error": "unauthorized"})
            return
        problems = check_manifest()
        self._json(200, {
            "status": "ok",
            "photo_bank": {"ok": not problems, "problems": problems},
        })

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
