import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "growmaster_lib"))
from session_check import get_session  # noqa: E402
from photo_bank import check_manifest  # noqa: E402


import urllib.error  # noqa: E402
import urllib.request  # noqa: E402


def _probe(req):
    """Return only an HTTP status code (never any key or body)."""
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode() or "{}")
            status = (body.get("detail") or {}).get("status") if isinstance(body.get("detail"), dict) else None
            if not status and isinstance(body.get("error"), dict):
                status = (str(body["error"].get("type", "")) + ": " + str(body["error"].get("message", ""))[:160])
        except Exception:  # noqa: BLE001
            status = None
        return f"{e.code} {status}" if status else e.code
    except Exception:  # noqa: BLE001
        return "network_error"


def key_status(oidc=""):
    out = {}
    tok = oidc or os.environ.get("VERCEL_OIDC_TOKEN", "")
    out["oidc_token"] = bool(tok)
    for m in ("anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5"):
        out["gateway_" + m] = "no_token" if not tok else _probe(urllib.request.Request(
            "https://ai-gateway.vercel.sh/v1/messages", method="POST",
            data=json.dumps({"model": m, "max_tokens": 5, "messages": [{"role": "user", "content": "Hola"}]}).encode(),
            headers={"Content-Type": "application/json", "anthropic-version": "2023-06-01",
                     "Authorization": f"Bearer {tok}", "x-api-key": tok}))
    ak = os.environ.get("ANTHROPIC_API_KEY", "")
    out["anthropic"] = "missing" if not ak else _probe(urllib.request.Request(
        "https://api.anthropic.com/v1/models", headers={"x-api-key": ak, "anthropic-version": "2023-06-01"}))
    ek = os.environ.get("ELEVENLABS_API_KEY", "")
    vid = os.environ.get("ELEVENLABS_VOICE_ID", "x9KrIDxDgLgpS9PEHqw8")
    for model in ("eleven_v3", "eleven_multilingual_v2"):
        out["elevenlabs_" + model] = "missing" if not ek else _probe(urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_22050_32",
            data=json.dumps({"text": "Hola.", "model_id": model}).encode(), method="POST",
            headers={"xi-api-key": ek, "Content-Type": "application/json"}))
    return out


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        sess = get_session(self.headers.get("Cookie"))
        if not sess:
            self._json(401, {"error": "unauthorized"})
            return
        if "keys=1" in (self.path or ""):
            # Diagnostic (super administrator only): status codes, no secrets.
            if sess["role"] != "super":
                self._json(403, {"error": "forbidden"})
                return
            self._json(200, key_status(self.headers.get("x-vercel-oidc-token", "")))
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
