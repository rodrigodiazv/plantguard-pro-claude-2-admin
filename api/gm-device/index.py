import json
import os
import sys
import datetime
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "growmaster_lib"))
from session_check import has_valid_session  # noqa: E402

AIRTABLE_API_KEY = os.environ.get("AIRTABLE_GROWMASTER_API_KEY", "")
BASE_ID = os.environ.get("AIRTABLE_OPS_BASE_ID", "")
TABLE = "Dispositivos"

VALID_TIPOS = {
    "Sensor temperatura/humedad", "Sensor CO2", "Sensor CE/pH", "Sensor PPFD/luz",
    "Climatizacion / HVAC", "Calefaccion", "Ventilacion", "Iluminacion",
    "Riego", "Dron", "Otro",
}
VALID_PROTOCOLOS = {
    "WiFi", "Bluetooth / BLE", "Zigbee", "LoRa", "Modbus", "MQTT",
    "BACnet", "DMX512", "MAVLink", "Otro",
}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not has_valid_session(self.headers.get("Cookie")):
            self._json(401, {"error": "unauthorized"})
            return
        if not AIRTABLE_API_KEY or not BASE_ID:
            self._json(503, {"error": "ops_backend_not_configured"})
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode() or "{}")
        except Exception:
            self._json(400, {"error": "invalid_body"})
            return

        nombre = (payload.get("nombre") or "").strip()
        tipo = payload.get("tipo") or ""
        zona = (payload.get("zona") or "").strip()
        protocolo = payload.get("protocolo") or ""
        direccion = (payload.get("direccion") or "").strip()
        notas = (payload.get("notas") or "").strip()

        if not nombre:
            self._json(400, {"error": "nombre_required"})
            return
        if tipo not in VALID_TIPOS:
            self._json(400, {"error": "tipo_invalid", "allowed": sorted(VALID_TIPOS)})
            return
        if protocolo not in VALID_PROTOCOLOS:
            self._json(400, {"error": "protocolo_invalid", "allowed": sorted(VALID_PROTOCOLOS)})
            return

        fields = {
            "Nombre": nombre,
            "Tipo": tipo,
            "Zona": zona,
            "Protocolo": protocolo,
            "Direccion": direccion,
            "Estado": "Pendiente de conectar",
            "Notas": notas,
            "CreadoEl": datetime.datetime.utcnow().isoformat() + "Z",
        }

        url = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE}"
        body = json.dumps({"fields": fields}).encode()
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={
                "Authorization": f"Bearer {AIRTABLE_API_KEY}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                created = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "airtable_write_failed", "detail": e.read().decode()[:500]})
            return
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "airtable_write_failed", "detail": str(e)})
            return

        self._json(200, {"ok": True, "id": created.get("id"), "fields": created.get("fields", {})})

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
