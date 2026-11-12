import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "growmaster_lib"))
from session_check import has_valid_session  # noqa: E402
from drone_planner import FlightParams, plan_day  # noqa: E402


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

        try:
            plan = {
                "fence": body["fence"],
                "dock": body["dock"],
                "sections": body["sections"],
            }
            day = body["day"]
        except KeyError as exc:
            self._json(400, {"detail": f"falta el campo {exc}"})
            return

        params = FlightParams(
            alt_m=body.get("alt_m", 3.0),
            hfov_deg=body.get("hfov_deg", 70.0),
            sidelap=body.get("sidelap", 0.30),
            speed_ms=body.get("speed_ms", 2.0),
            turn_s=body.get("turn_s", 3.0),
            sortie_budget_s=body.get("sortie_budget_s", 12 * 60),
            fence_margin_m=body.get("fence_margin_m", 1.0),
        )
        try:
            result = plan_day(plan, day, params)
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
