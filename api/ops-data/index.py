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

TABLES = {
    "zonas": "Zonas",
    "sensores": "Sensores",
    "alertas_ipm": "AlertasIPM",
    "automation_rules": "AutomationRules",
    "nutricion": "Nutricion",
    "personal": "PersonalCampo",
    "ciclos": "Ciclos",
    "drones": "Drones",
}


def _airtable_list(table_name):
    url = f"https://api.airtable.com/v0/{BASE_ID}/{urllib.parse.quote(table_name)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {AIRTABLE_API_KEY}"})
    with urllib.request.urlopen(req, timeout=8) as r:
        data = json.loads(r.read().decode())
    return [rec.get("fields", {}) for rec in data.get("records", [])]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not has_valid_session(self.headers.get("Cookie")):
            self._json(401, {"error": "unauthorized"})
            return
        if not AIRTABLE_API_KEY or not BASE_ID:
            self._json(503, {"error": "ops_backend_not_configured"})
            return
        try:
            out = {key: _airtable_list(name) for key, name in TABLES.items()}
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "airtable_fetch_failed", "detail": str(e)})
            return
        self._json(200, out)

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
