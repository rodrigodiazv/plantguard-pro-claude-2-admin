import hashlib
import hmac
import json
import os
import sys
import datetime
import urllib.request
import urllib.parse
import urllib.error
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "growmaster_lib"))
from session_check import has_valid_session  # noqa: E402

AIRTABLE_API_KEY = os.environ.get("AIRTABLE_GROWMASTER_API_KEY", "")
BASE_ID = os.environ.get("AIRTABLE_OPS_BASE_ID", "")
_SESSION_SECRET = os.environ.get("ADMIN_KEY") or os.environ.get("ACCESS_SECRET") or ""
# Key the IoT gateway sends in X-Ingest-Key. Explicit env var wins; otherwise it
# is derived from the session secret, so no secret ever has to be pasted around.
# Rotating ADMIN_KEY/ACCESS_SECRET rotates it too.
INGEST_KEY = os.environ.get("INGEST_KEY") or (
    hmac.new(_SESSION_SECRET.encode(), b"plantguard-ingest-v1", hashlib.sha256).hexdigest() if _SESSION_SECRET else "")

# table key (used by the panel) -> Airtable table name, and the only fields
# the panel may write. Anything not listed here is rejected.
TABLES = {
    "zonas": ("Zonas", ["Nombre", "Tipo", "Fase", "Plantas", "Estado"]),
    "sensores": ("Sensores", ["Zona", "Tipo", "Valor", "Unidad", "Actualizado"]),
    "alertas_ipm": ("AlertasIPM", ["Zona", "Plaga", "Severidad", "Protocolo", "Estado", "Creada"]),
    "automation_rules": ("AutomationRules", ["Zona", "Nombre", "Condicion", "Accion", "Activa"]),
    "nutricion": ("Nutricion", ["Zona", "N", "P", "K", "Ca", "Mg", "CE", "pH", "Micronutrientes"]),
    "personal": ("PersonalCampo", ["Nombre", "Rol", "Calificacion", "Especialidad", "ZonaActual",
                                   "TareaActual", "Prioridad", "DispositivoEmpresa", "EnTurno"]),
    "ciclos": ("Ciclos", ["Nombre", "Variedad", "Fase", "SemanaActual", "SemanaTotal", "FechaInicio",
                          "FechaCosechaEstimada", "Plantas", "Zona", "Estado"]),
    "drones": ("Drones", ["Nombre", "Sector", "Estado", "BateriaPct", "UltimaDeteccion"]),
    "dispositivos": ("Dispositivos", ["Nombre", "Tipo", "Espectro", "Zona", "Protocolo", "Direccion",
                                      "Endpoint", "Estado", "UltimaLectura", "UltimaLecturaEn", "Notas"]),
    "agua": ("TratamientoAgua", ["Etapa", "Orden", "pH", "EC_TDS", "CaudalLmin", "Estado", "Notas"]),
    "mediciones_agua": ("MedicionesAgua", ["Zona", "Fecha", "pH_prefiltrado", "EC_prefiltrado", "pH_filtrado",
                                           "EC_filtrado", "pH_final", "EC_final", "Notas"]),
    "tareas": ("Tareas", ["Tarea", "Zona", "Tecnico", "Fecha", "Estado", "Prioridad", "Notas"]),
    "trampas": ("Trampas", ["Zona", "Plaga", "Recuento", "Umbral", "Fecha"]),
    "liberaciones": ("Liberaciones", ["Agente", "PlagaObjetivo", "Zona", "Dosis", "Fecha"]),
    "riegos": ("Riegos", ["Zona", "Hora", "VolumenLm2", "Formula", "Estado"]),
    "conocimiento": ("BaseConocimiento", ["Titulo", "Categoria", "Contenido", "Fuente"]),
}


def _airtable(method, table_name, path="", body=None, query=None):
    url = f"https://api.airtable.com/v0/{BASE_ID}/{urllib.parse.quote(table_name)}{path}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {AIRTABLE_API_KEY}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def _list_all(table_name):
    out, offset = [], None
    while True:
        q = {"pageSize": 100}
        if offset:
            q["offset"] = offset
        data = _airtable("GET", table_name, query=q)
        for rec in data.get("records", []):
            row = dict(rec.get("fields", {}))
            row["_id"] = rec["id"]
            out.append(row)
        offset = data.get("offset")
        if not offset:
            return out


def _clean_fields(allowed, fields):
    if not isinstance(fields, dict):
        return None
    clean = {}
    for k, v in fields.items():
        if k not in allowed:
            return None
        if v == "":
            v = None
        clean[k] = v
    return clean


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if not self._auth():
            return
        if "ingest_key=1" in (self.path or ""):
            # Shown only inside the logged-in panel, on demand, to configure the gateway.
            self._json(200, {"ingest_key": INGEST_KEY})
            return
        try:
            out = {key: _list_all(name) for key, (name, _) in TABLES.items()}
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
        table, allowed = self._table(payload)
        if not table:
            return
        fields = _clean_fields(allowed, payload.get("fields"))
        if fields is None:
            self._json(400, {"error": "invalid_fields", "allowed": allowed})
            return
        self._write("POST", table, "", {"fields": fields, "typecast": True})

    def do_PATCH(self):
        payload = self._body()
        if payload is None or not self._auth():
            return
        table, allowed = self._table(payload)
        if not table:
            return
        rec_id = str(payload.get("id") or "")
        if not rec_id.startswith("rec"):
            self._json(400, {"error": "id_required"})
            return
        fields = _clean_fields(allowed, payload.get("fields"))
        if fields is None:
            self._json(400, {"error": "invalid_fields", "allowed": allowed})
            return
        self._write("PATCH", table, "/" + rec_id, {"fields": fields, "typecast": True})

    def do_DELETE(self):
        payload = self._body()
        if payload is None or not self._auth():
            return
        table, _ = self._table(payload)
        if not table:
            return
        rec_id = str(payload.get("id") or "")
        if not rec_id.startswith("rec"):
            self._json(400, {"error": "id_required"})
            return
        self._write("DELETE", table, "/" + rec_id, None)

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

    def _auth(self):
        if not has_valid_session(self.headers.get("Cookie")):
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

    def _write(self, method, table, path, body):
        try:
            result = _airtable(method, table, path, body)
        except urllib.error.HTTPError as e:
            self._json(502, {"error": "airtable_write_failed", "detail": e.read().decode()[:500]})
            return
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "airtable_write_failed", "detail": str(e)})
            return
        self._json(200, {"ok": True, "record": result})

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
