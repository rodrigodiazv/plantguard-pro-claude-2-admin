"""Shared Airtable access for the ops panel (ops-data) and the Grow Agent (gm-chat).

TABLES maps the panel's table key -> (Airtable table name, fields that may be written).
Anything not listed is rejected, for both the panel and the agent.
"""
import json
import os
import urllib.parse
import urllib.request

AIRTABLE_API_KEY = os.environ.get("AIRTABLE_GROWMASTER_API_KEY", "")
BASE_ID = os.environ.get("AIRTABLE_OPS_BASE_ID", "")

TABLES = {
    "zonas": ("Zonas", ["Nombre", "Tipo", "Fase", "Plantas", "Estado"]),
    "sensores": ("Sensores", ["Zona", "Tipo", "Valor", "Unidad", "Actualizado"]),
    "alertas_ipm": ("AlertasIPM", ["Zona", "Plaga", "Severidad", "Protocolo", "Estado", "Creada"]),
    "automation_rules": ("AutomationRules", ["Zona", "Nombre", "Condicion", "Accion", "Activa"]),
    "nutricion": ("Nutricion", ["Zona", "N", "P", "K", "Ca", "Mg", "CE", "pH", "Micronutrientes"]),
    "personal": ("PersonalCampo", ["Nombre", "Rol", "Calificacion", "Especialidad", "ZonaActual",
                                   "TareaActual", "Prioridad", "DispositivoEmpresa", "EnTurno", "Acceso"]),
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
    "mejoras": ("Mejoras", ["Titulo", "Detalle", "Tipo", "SolicitadaPor", "Rol", "Estado", "Fecha", "NotaRodrigo"]),
}


# ---- Roles: super (Rodrigo) | jefe (jefe de cultivo) | operario ----
# Hidden from every read (panel and agent): the PIN fingerprint.
HIDDEN_FIELDS = ("PinHash",)

# Operarios see only what they need in the field.
OPERARIO_READ = {"zonas", "tareas", "alertas_ipm", "trampas", "liberaciones", "riegos", "conocimiento",
                 "ciclos", "nutricion", "agua", "mediciones_agua"}
# What an operario may write: report incidents and measurements; update (not create) task progress.
OPERARIO_CREATE = {"alertas_ipm", "tareas", "trampas", "mediciones_agua", "liberaciones"}
OPERARIO_UPDATE = {"tareas"}
# Only the super administrator manages staff records and their access.
SUPER_ONLY_WRITE = {"personal"}


def can_read(role, key):
    if role in ("super", "jefe"):
        return True
    return role == "operario" and key in OPERARIO_READ


def can_write(role, key, method):
    """method: POST (create) | PATCH (update) | DELETE."""
    if role == "super":
        return True
    if key == "mejoras":
        # Anyone can ask for an improvement; only the super administrator can decide.
        return method == "POST"
    if key in SUPER_ONLY_WRITE:
        return False
    if role == "jefe":
        return True
    if role == "operario":
        if method == "POST":
            return key in OPERARIO_CREATE
        if method == "PATCH":
            return key in OPERARIO_UPDATE
    return False


def airtable(method, table_name, path="", body=None, query=None):
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


def list_all(table_name):
    out, offset = [], None
    while True:
        q = {"pageSize": 100}
        if offset:
            q["offset"] = offset
        data = airtable("GET", table_name, query=q)
        for rec in data.get("records", []):
            fields = rec.get("fields", {})
            row = {k: v for k, v in fields.items() if k not in HIDDEN_FIELDS}
            if "PinHash" in fields or table_name == "PersonalCampo":
                row["TienePin"] = bool(fields.get("PinHash"))
            row["_id"] = rec["id"]
            out.append(row)
        offset = data.get("offset")
        if not offset:
            return out


def clean_fields(allowed, fields):
    """Return a dict limited to allowed fields, or None if any field is not allowed."""
    if not isinstance(fields, dict):
        return None
    clean = {}
    for k, v in fields.items():
        if k not in allowed:
            return None
        clean[k] = None if v == "" else v
    return clean
