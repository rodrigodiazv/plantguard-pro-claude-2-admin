import hashlib
import hmac
import json
import os
import secrets
import sys
import datetime
import urllib.error
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "growmaster_lib"))
from session_check import get_session, pin_hash  # noqa: E402
from ops_tables import can_read, can_write  # noqa: E402

from ops_tables import AIRTABLE_API_KEY, BASE_ID, TABLES, clean_fields as _clean_fields  # noqa: E402
from ops_tables import airtable as _airtable, list_all as _list_all  # noqa: E402
from ops_tables import log_memory, memory_markdown  # noqa: E402

_SESSION_SECRET = os.environ.get("ADMIN_KEY") or os.environ.get("ACCESS_SECRET") or ""
# Key the IoT gateway sends in X-Ingest-Key. Explicit env var wins; otherwise it
# is derived from the session secret, so no secret ever has to be pasted around.
# Rotating ADMIN_KEY/ACCESS_SECRET rotates it too.
INGEST_KEY = os.environ.get("INGEST_KEY") or (
    hmac.new(_SESSION_SECRET.encode(), b"plantguard-ingest-v1", hashlib.sha256).hexdigest() if _SESSION_SECRET else "")



ROLE_LABEL_ = {"super": "Super administrador", "jefe": "Jefe de cultivo", "operario": "Operario"}


def _short_(fields, n):
    return "; ".join(f"{k}={v}" for k, v in (fields or {}).items() if v not in (None, ""))[:n]


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not self._auth():
            return
        q = self.path or ""
        if "me=1" in q:
            self._json(200, {"role": self.sess["role"], "name": self.sess["name"], "uid": self.sess["uid"]})
            return
        if "memoria=md" in q:
            if self.sess["role"] == "operario":
                self._json(403, {"error": "forbidden"})
                return
            body = memory_markdown(self.sess["role"]).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/markdown; charset=utf-8")
            self.send_header("Content-Disposition", 'attachment; filename="MEMORIA-GrowAgent.md"')
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if "ingest_key=1" in q:
            if self.sess["role"] != "super":
                self._json(403, {"error": "forbidden"})
                return
            # Shown only inside the logged-in panel, on demand, to configure the gateway.
            self._json(200, {"ingest_key": INGEST_KEY})
            return
        try:
            out = {}
            for key, (name, _) in TABLES.items():
                if not can_read(self.sess["role"], key):
                    continue
                rows = _list_all(name)
                if key == "personal" and self.sess["role"] == "operario":
                    rows = [r for r in rows if r.get("_id") == self.sess["uid"]]
                out[key] = rows
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "airtable_fetch_failed", "detail": str(e)})
            return
        self._json(200, out)

    def do_POST(self):
        payload = self._body()
        if payload is None:
            return
        if payload.get("action") == "ingest":
            self._ingest(payload)
            return
        if not self._auth():
            return
        if payload.get("action") in ("set_pin", "revoke_pin"):
            self._staff_pin(payload)
            return
        if payload.get("action") == "conversation":
            # The panel sends every finished voice conversation here, so nothing said is ever lost.
            text = str(payload.get("transcript") or "")[:30000]
            if len(text) < 20:
                self._json(200, {"ok": True, "skipped": True})
                return
            first = str(payload.get("first") or "")[:160]
            log_memory(self.sess, "Conversación", "", "", f"Conversación con el Grow Agent ({int(payload.get('turns') or 0)} mensajes): {first}",
                       tipo="Conversación", detalle=text)
            self._json(200, {"ok": True})
            return
        table, allowed = self._table(payload)
        if not table or not self._allowed(payload, "POST"):
            return
        fields = _clean_fields(allowed, payload.get("fields"))
        if fields is None:
            self._json(400, {"error": "invalid_fields", "allowed": allowed})
            return
        if payload.get("table") == "mejoras":
            # Who asked, when and the initial state are decided here, never by the client or the agent.
            fields.pop("NotaRodrigo", None)
            fields.update({"Estado": "Pendiente", "SolicitadaPor": self.sess["name"] or "Usuario",
                           "Rol": {"super": "Super administrador", "jefe": "Jefe de cultivo", "operario": "Operario"}[self.sess["role"]],
                           "Fecha": datetime.datetime.utcnow().isoformat() + "Z"})
        if payload.get("table") == "memoria":
            fields.update({"Tipo": "Nota", "Accion": "Nota", "Tabla": "", "RegistroId": "",
                           "Actor": self.sess["name"] or "Usuario", "Rol": ROLE_LABEL_[self.sess["role"]],
                           "Fecha": datetime.datetime.utcnow().isoformat() + "Z"})
            self._write("POST", table, "", {"fields": fields, "typecast": True}, log=False)
            return
        self._write("POST", table, "", {"fields": fields, "typecast": True}, log=("POST", payload.get("table"), fields))

    def do_PATCH(self):
        payload = self._body()
        if payload is None or not self._auth():
            return
        table, allowed = self._table(payload)
        if not table or not self._allowed(payload, "PATCH"):
            return
        rec_id = str(payload.get("id") or "")
        if not rec_id.startswith("rec"):
            self._json(400, {"error": "id_required"})
            return
        fields = _clean_fields(allowed, payload.get("fields"))
        if fields is None:
            self._json(400, {"error": "invalid_fields", "allowed": allowed})
            return
        if payload.get("table") == "mejoras" and self.headers.get("X-Panel-Approval") != "1":
            # Approving/rejecting is a button in the panel, not something a voice agent can do.
            self._json(403, {"error": "forbidden", "detail": "La aprobación de mejoras solo se hace desde el botón del panel."})
            return
        self._write("PATCH", table, "/" + rec_id, {"fields": fields, "typecast": True}, log=("PATCH", payload.get("table"), fields))

    def do_DELETE(self):
        payload = self._body()
        if payload is None or not self._auth():
            return
        table, _ = self._table(payload)
        if not table or not self._allowed(payload, "DELETE"):
            return
        rec_id = str(payload.get("id") or "")
        if not rec_id.startswith("rec"):
            self._json(400, {"error": "id_required"})
            return
        self._write("DELETE", table, "/" + rec_id, None, log=("DELETE", payload.get("table"), {}))

    def _ingest(self, payload):
        """IoT gateways push a reading here with header X-Ingest-Key."""
        key = self.headers.get("X-Ingest-Key", "")
        if not INGEST_KEY or not hmac.compare_digest(key, INGEST_KEY):
            self._json(401, {"error": "unauthorized"})
            return
        device_id = str(payload.get("device_id") or "")
        if not device_id.startswith("rec"):
            self._json(400, {"error": "device_id_required"})
            return
        valor = payload.get("valor")
        unidad = str(payload.get("unidad") or "")
        now = datetime.datetime.utcnow().isoformat() + "Z"
        try:
            dev = _airtable("PATCH", "Dispositivos", "/" + device_id, {"fields": {
                "UltimaLectura": f"{valor} {unidad}".strip(),
                "UltimaLecturaEn": now,
                "Estado": "Conectado",
            }, "typecast": True})
            fields = dev.get("fields", {})
            tipo_sensor = payload.get("tipo_sensor")
            if tipo_sensor and fields.get("Zona") and isinstance(valor, (int, float)):
                _airtable("POST", "Sensores", "", {"fields": {
                    "Zona": fields["Zona"], "Tipo": tipo_sensor, "Valor": valor,
                    "Unidad": unidad, "Actualizado": now,
                }, "typecast": True})
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "airtable_write_failed", "detail": e.read().decode()[:300]})
            return
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "airtable_write_failed", "detail": str(e)})
            return
        self._json(200, {"ok": True})

    def _allowed(self, payload, method):
        if not can_write(self.sess["role"], payload.get("table"), method):
            self._json(403, {"error": "forbidden", "detail": "Su rol no permite esta operación."})
            return False
        return True

    def _staff_pin(self, payload):
        """Super administrator only: create/renew (set_pin) or remove (revoke_pin) an employee's PIN.
        The PIN is returned once, to the logged-in super administrator's panel; only its fingerprint is stored."""
        if self.sess["role"] != "super":
            self._json(403, {"error": "forbidden"})
            return
        rec_id = str(payload.get("id") or "")
        if not rec_id.startswith("rec"):
            self._json(400, {"error": "id_required"})
            return
        try:
            if payload.get("action") == "revoke_pin":
                _airtable("PATCH", "PersonalCampo", "/" + rec_id, {"fields": {"PinHash": None}})
                log_memory(self.sess, "Actualizar", "personal", rec_id, "Revocó el PIN de un empleado")
                self._json(200, {"ok": True})
                return
            acceso = payload.get("acceso")
            alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no look-alike characters
            for _ in range(10):
                pin = "".join(secrets.choice(alphabet) for _ in range(8))
                h = pin_hash(pin)
                clash = _airtable("GET", "PersonalCampo", query={"maxRecords": 1, "filterByFormula": "{PinHash}='%s'" % h})
                if not clash.get("records"):
                    break
            else:
                self._json(500, {"error": "pin_generation_failed"})
                return
            fields = {"PinHash": h}
            if acceso in ("Jefe de cultivo", "Operario"):
                fields["Acceso"] = acceso
            _airtable("PATCH", "PersonalCampo", "/" + rec_id, {"fields": fields, "typecast": True})
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "airtable_write_failed", "detail": e.read().decode()[:300]})
            return
        log_memory(self.sess, "Actualizar", "personal", rec_id, "Generó o renovó el PIN de un empleado (el PIN no se guarda)")
        self._json(200, {"ok": True, "pin": pin})

    def _auth(self):
        self.sess = get_session(self.headers.get("Cookie"))
        if not self.sess:
            self._json(401, {"error": "unauthorized"})
            return False
        if not AIRTABLE_API_KEY or not BASE_ID:
            self._json(503, {"error": "ops_backend_not_configured"})
            return False
        return True

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > 200_000:
            self._json(413, {"error": "body_too_large"})
            return None
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode() or "{}")
        except Exception:
            self._json(400, {"error": "invalid_body"})
            return None
        if not isinstance(data, dict):
            self._json(400, {"error": "invalid_body"})
            return None
        return data

    def _table(self, payload):
        entry = TABLES.get(payload.get("table"))
        if not entry:
            self._json(400, {"error": "unknown_table"})
            return None, None
        return entry

    def _write(self, method, table, path, body, log=None):
        try:
            result = _airtable(method, table, path, body)
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "airtable_write_failed", "detail": e.read().decode()[:500]})
            return
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "airtable_write_failed", "detail": str(e)})
            return
        if log:
            verbo = {"POST": "Creó", "PATCH": "Actualizó", "DELETE": "Borró"}[log[0]]
            rid = (result or {}).get("id") or path.lstrip("/")
            log_memory(self.sess, {"POST": "Crear", "PATCH": "Actualizar", "DELETE": "Borrar"}[log[0]], log[1], rid,
                       f"{verbo} en {log[1]}: {_short_(log[2], 120)}", detalle=_short_(log[2], 800))
        self._json(200, {"ok": True, "record": result})

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
