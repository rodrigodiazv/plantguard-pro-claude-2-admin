"""Grow Agent: conversational assistant of the panel (text or voice from the browser).

It reads the real operation state from Airtable and can create or update records
(tasks, alerts, zones, devices, knowledge...) through tools limited to the same
field whitelist as the panel. It never deletes.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "growmaster_lib"))
from session_check import get_session  # noqa: E402
from ops_tables import AIRTABLE_API_KEY, BASE_ID, TABLES, airtable, can_read, clean_fields, list_all  # noqa: E402

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5")
FALLBACK_MODEL = "claude-haiku-4-5-20251001"
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
# Voice "Master Grower — estilo Jarvis 3" (chosen by Rodrigo) designed in ElevenLabs (not secret).
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "x9KrIDxDgLgpS9PEHqw8")
# ElevenLabs Conversational agent "PlantGuard Grow Agent" (voice + its own LLM, billed to ElevenLabs).
ELEVENLABS_AGENT_ID = os.environ.get("ELEVENLABS_AGENT_ID", "agent_9701m8063kvheyrb6g1g4jhr19nz")
MAX_TOOL_ROUNDS = 6
MAX_HISTORY = 20
CONTEXT_LIMIT = 60_000

TABLE_DOC = "\n".join(f"- {k} ({name}): {', '.join(fields)}" for k, (name, fields) in TABLES.items())

TOOLS = [
    {
        "name": "crear_registro",
        "description": "Crea un registro nuevo en una tabla del panel (tarea, alerta IPM, zona, "
                       "dispositivo, entrada de la base de conocimiento, medición de agua, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "table": {"type": "string", "enum": list(TABLES)},
                "fields": {"type": "object", "description": "Solo campos permitidos de esa tabla."},
            },
            "required": ["table", "fields"],
        },
    },
    {
        "name": "actualizar_registro",
        "description": "Actualiza campos de un registro existente, identificado por su _id (rec...).",
        "input_schema": {
            "type": "object",
            "properties": {
                "table": {"type": "string", "enum": list(TABLES)},
                "id": {"type": "string"},
                "fields": {"type": "object"},
            },
            "required": ["table", "id", "fields"],
        },
    },
]


def build_context(sess=None):
    role = (sess or {}).get("role", "super")
    parts, size = [], 0
    for key, (name, _) in TABLES.items():
        if not can_read(role, key):
            continue
        try:
            rows = list_all(name)
        except Exception:  # noqa: BLE001
            parts.append(f"{key}: (no disponible)")
            continue
        if key == "personal" and role == "operario":
            rows = [r for r in rows if r.get("_id") == sess.get("uid")]
        chunk = f"{key}: {json.dumps(rows, ensure_ascii=False)}"
        if size + len(chunk) > CONTEXT_LIMIT:
            chunk = f"{key}: ({len(rows)} registros, omitidos por tamaño)"
        size += len(chunk)
        parts.append(chunk)
    return "\n".join(parts)


def system_prompt(context):
    return (
        "Eres el Grow Agent (Master Grower) de PlantGuard Pro: el asistente central del cultivo, "
        "estilo Jarvis. Hablas en español de España y tratas de usted. Tus respuestas pueden leerse "
        "en voz alta: frases claras y cortas, sin tablas ni markdown, salvo que te pidan detalle.\n"
        "Puedes: informar del estado (zonas, ciclos, IPM, nutrición, agua, personal, dispositivos), "
        "analizar y proponer planes, y ejecutar órdenes creando o actualizando registros con tus "
        "herramientas (asignar tareas, abrir o cerrar alertas, registrar mediciones, añadir "
        "conocimiento, dar de alta equipos). No puedes borrar: si te lo piden, indica que se borra "
        "desde el panel.\n"
        "Atiendes por voz al administrador general, al encargado de cultivo y a los operarios en su turno "
        "(desde su dispositivo IoT de empresa). Si no sabes quién habla, pregunta su nombre y rol al inicio. "
        "Incidencias de operarios (gotera, planta rota, plaga, avería de riego, luces, clima, electricidad, "
        "cualquier anomalía de infraestructura o del cultivo): 1) pregunta zona y gravedad si faltan; "
        "2) da el protocolo de actuación paso a paso, primero la seguridad (personas, electricidad, agua) "
        "y luego la planta o el equipo, usando la base de conocimiento si hay protocolo; 3) registra la "
        "incidencia con tus herramientas (alerta en alertas_ipm si es del cultivo, tarea en tareas con "
        "prioridad si es de infraestructura, indicando quién la reportó); 4) di que queda registrada para "
        "el administrador. Instrucciones de una en una, cortas y claras para alguien con las manos ocupadas.\n"
        "Reglas: usa SOLO los datos reales de abajo; si falta un dato, dilo, nunca lo inventes. "
        "Nunca pongas un equipo como 'Conectado' ni inventes lecturas de sensores. Cuando ejecutes "
        "una acción, confirma brevemente qué has hecho. Si una orden es ambigua, pregunta antes.\n\n"
        f"Tablas y campos que puedes escribir:\n{TABLE_DOC}\n\n"
        f"Datos actuales de la operación (cada fila tiene _id):\n{context}"
    )


def run_tool(name, args):
    table_key = args.get("table")
    entry = TABLES.get(table_key)
    if not entry:
        return {"ok": False, "error": "tabla desconocida"}
    table, allowed = entry
    fields = clean_fields(allowed, args.get("fields"))
    if fields is None:
        return {"ok": False, "error": "campos no permitidos", "permitidos": allowed}
    try:
        if name == "crear_registro":
            rec = airtable("POST", table, "", {"fields": fields, "typecast": True})
        elif name == "actualizar_registro":
            rec_id = str(args.get("id") or "")
            if not rec_id.startswith("rec"):
                return {"ok": False, "error": "id inválido"}
            rec = airtable("PATCH", table, "/" + rec_id, {"fields": fields, "typecast": True})
        else:
            return {"ok": False, "error": "herramienta desconocida"}
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": e.read().decode()[:300]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}
    return {"ok": True, "id": rec.get("id")}


GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/messages"
GATEWAY_MODELS = [m for m in os.environ.get(
    "AI_GATEWAY_MODELS", "anthropic/claude-sonnet-4.5,anthropic/claude-haiku-4.5").split(",") if m]
_oidc = {"token": os.environ.get("VERCEL_OIDC_TOKEN", "")}


def call_gateway(model, system, messages):
    """Claude through Vercel AI Gateway, authenticated with the deployment's OIDC token (no API key)."""
    body = json.dumps({"model": model, "max_tokens": 1500, "system": system,
                       "tools": TOOLS, "messages": messages}).encode()
    tok = _oidc["token"]
    req = urllib.request.Request(GATEWAY_URL, data=body, method="POST", headers={
        "Content-Type": "application/json", "anthropic-version": "2023-06-01",
        "Authorization": f"Bearer {tok}", "x-api-key": tok})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def call_llm(state, system, messages):
    """Direct Anthropic first; if its key is rejected or missing, Vercel AI Gateway."""
    if state["via"] == "anthropic":
        try:
            return call_claude(state["model"], system, messages)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404) and state["model"] != FALLBACK_MODEL:
                state["model"] = FALLBACK_MODEL
                return call_llm(state, system, messages)
            if e.code not in (401, 403):
                raise
        state["via"], state["gi"] = "gateway", 0
    while True:
        try:
            return call_gateway(GATEWAY_MODELS[state["gi"]], system, messages)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404) and state["gi"] + 1 < len(GATEWAY_MODELS):
                state["gi"] += 1
                continue
            raise


def call_claude(model, system, messages):
    body = json.dumps({
        "model": model,
        "max_tokens": 1500,
        "system": system,
        "tools": TOOLS,
        "messages": messages,
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
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def converse(history, context):
    system = system_prompt(context)
    messages = list(history)
    actions = []
    state = {"via": "anthropic" if ANTHROPIC_API_KEY else "gateway", "model": MODEL, "gi": 0}
    for _ in range(MAX_TOOL_ROUNDS):
        data = call_llm(state, system, messages)
        content = data.get("content", [])
        uses = [b for b in content if b.get("type") == "tool_use"]
        if data.get("stop_reason") != "tool_use" or not uses:
            text = "".join(b.get("text", "") for b in content if b.get("type") == "text")
            return text or "(sin respuesta)", actions
        messages.append({"role": "assistant", "content": content})
        results = []
        for u in uses:
            res = run_tool(u.get("name"), u.get("input") or {})
            actions.append({"herramienta": u.get("name"), "tabla": (u.get("input") or {}).get("table"), **res})
            results.append({"type": "tool_result", "tool_use_id": u["id"],
                            "content": json.dumps(res, ensure_ascii=False)})
        messages.append({"role": "user", "content": results})
    return "He llegado al límite de acciones seguidas en esta petición. Revise el panel.", actions


def tts(text):
    body = json.dumps({
        "text": text[:2500],
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
    }).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_64",
        data=body, method="POST",
        headers={"Content-Type": "application/json", "xi-api-key": ELEVENLABS_API_KEY, "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def parse_history(payload):
    raw = payload.get("messages")
    if not isinstance(raw, list):
        msg = (payload.get("message") or "").strip()
        raw = [{"role": "user", "content": msg}] if msg else []
    history = []
    for m in raw[-MAX_HISTORY:]:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant"):
            continue
        text = str(m.get("content") or "").strip()[:4000]
        if text:
            history.append({"role": m["role"], "content": text})
    while history and history[0]["role"] != "user":
        history.pop(0)
    if not history or history[-1]["role"] != "user":
        return None
    return history


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        sess = get_session(self.headers.get("Cookie"))
        if not sess:
            self._json(401, {"error": "unauthorized"})
            return
        _oidc["token"] = self.headers.get("x-vercel-oidc-token") or os.environ.get("VERCEL_OIDC_TOKEN", "")
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > 200_000:
            self._json(413, {"error": "body_too_large"})
            return
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode() or "{}")
        except Exception:  # noqa: BLE001
            self._json(400, {"error": "invalid_body"})
            return
        if isinstance(payload, dict) and payload.get("voice_session"):
            # Start a live voice session with the ElevenLabs agent: signed URL + current operation data.
            if not ELEVENLABS_API_KEY:
                self._json(503, {"error": "voice_not_configured"})
                return
            try:
                req = urllib.request.Request(
                    "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=" + ELEVENLABS_AGENT_ID,
                    headers={"xi-api-key": ELEVENLABS_API_KEY})
                with urllib.request.urlopen(req, timeout=20) as r:
                    signed = json.loads(r.read().decode()).get("signed_url")
            except urllib.error.HTTPError as e:
                self._json(502, {"error": "signed_url_failed", "detail": f"ElevenLabs {e.code}"})
                return
            context = build_context(sess) if (AIRTABLE_API_KEY and BASE_ID) else "(sin datos de operación disponibles)"
            role_label = {"super": "super administrador (Rodrigo, dueño del software)", "jefe": "jefe de cultivo",
                          "operario": "operario de cultivo"}[sess["role"]]
            self._json(200, {"signed_url": signed, "ops_context": context[:40000],
                             "user_name": sess["name"] or "usuario", "user_role": role_label})
            return
        if isinstance(payload, dict) and payload.get("tts"):
            # Voice of the Grow Agent: returns MP3 from ElevenLabs.
            if not ELEVENLABS_API_KEY:
                self._json(503, {"error": "tts_not_configured"})
                return
            try:
                audio = tts(str(payload["tts"]))
            except Exception as e:  # noqa: BLE001
                self._json(502, {"error": "tts_failed", "detail": str(e)[:200]})
                return
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio)
            return
        history = parse_history(payload if isinstance(payload, dict) else {})
        if not history:
            self._json(400, {"error": "message_required"})
            return
        context = build_context(sess) if (AIRTABLE_API_KEY and BASE_ID) else "(sin datos de operación disponibles)"
        try:
            reply, actions = converse(history, context)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                detail = "Ni la clave de Anthropic ni el acceso por Vercel AI Gateway funcionan (código %d)." % e.code
            else:
                detail = f"Anthropic respondió {e.code}"
            self._json(502, {"error": "llm_call_failed", "detail": detail})
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "llm_call_failed", "detail": str(e)[:300]})
            return
        self._json(200, {"reply": reply, "actions": actions})

    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
