import json
import os
import sys
import urllib.request
import urllib.parse
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "growmaster_lib"))
from session_check import has_valid_session  # noqa: E402

AIRTABLE_API_KEY = os.environ.get("AIRTABLE_GROWMASTER_API_KEY", "")
BASE_ID = os.environ.get("AIRTABLE_OPS_BASE_ID", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")

CONTEXT_TABLES = ["Zonas", "AlertasIPM", "Nutricion", "Ciclos", "MedicionesAgua", "Tareas", "BaseConocimiento"]


def _airtable_list(table_name):
    url = f"https://api.airtable.com/v0/{BASE_ID}/{urllib.parse.quote(table_name)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {AIRTABLE_API_KEY}"})
    with urllib.request.urlopen(req, timeout=8) as r:
        data = json.loads(r.read().decode())
    return [rec.get("fields", {}) for rec in data.get("records", [])]


def build_context():
    parts = []
    for table in CONTEXT_TABLES:
        try:
            rows = _airtable_list(table)
        except Exception:
            continue
        parts.append(f"{table}: {json.dumps(rows, ensure_ascii=False)}")
    return "\n".join(parts)


def call_claude(user_message, context):
    system = (
        "Eres Master Grower, el asistente de cultivo de PlantGuard Pro. "
        "Respondes en espanol, de forma tecnica y concreta, basandote UNICAMENTE "
        "en los datos reales de la operacion que te paso abajo. Si no tienes el dato, "
        "dilo claramente en vez de inventarlo.\n\nDatos actuales de la operacion:\n" + context
    )
    body = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 600,
        "system": system,
        "messages": [{"role": "user", "content": user_message}],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        data = json.loads(r.read().decode())
    chunks = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    return "".join(chunks) or "(sin respuesta)"


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not has_valid_session(self.headers.get("Cookie")):
            self._json(401, {"error": "unauthorized"})
            return
        if not ANTHROPIC_API_KEY:
            self._json(503, {"error": "chat_not_configured", "detail": "Falta ANTHROPIC_API_KEY"})
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode() or "{}")
        except Exception:
            self._json(400, {"error": "invalid_body"})
            return

        message = (payload.get("message") or "").strip()
        if not message:
            self._json(400, {"error": "message_required"})
            return

        context = build_context() if (AIRTABLE_API_KEY and BASE_ID) else "(sin datos de operacion disponibles)"

        try:
            reply = call_claude(message, context)
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "llm_call_failed", "detail": str(e)})
            return

        self._json(200, {"reply": reply})

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
