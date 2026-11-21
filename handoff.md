# handoff.md — plantguard-pro-claude-2-admin

**Fecha:** 2026-11-19
**Estado:** Panel real conectado a datos de Airtable. `@vercel/blob` actualizado
a 2.4.0 (fix de Copilot, mergeado) para resolver alertas de dependencias.
En producción, deploy OK.

## Qué es esto

El panel de administración real de PlantGuard Pro (`public/dashboard.html`),
protegido por login con PIN (`middleware.js` + `lib/session.js` +
`api/access.js`). Antes del 18-nov era 100% maqueta visual (números fijos en
el HTML). Ahora Dashboard, Zonas, Ciclos, IPM, Nutrición, Personal,
Dispositivos y Agua leen datos reales de Airtable. Growmaster (rutas de
dron + banco de fotos) ya era real desde antes.

**URL de producción:** https://plantguard-pro-claude-2-admin-virid.vercel.app/

## Arquitectura de datos

Base Airtable **"PlantGuard Operaciones"** (`appEoJPsQoVqgRMYi`), tablas:
Zonas, Sensores, AlertasIPM, AutomationRules, Nutricion (+ Ca/Mg/
Micronutrientes), PersonalCampo, Ciclos, Drones, Dispositivos (sensores +
HVAC + calefacción + ventilación + iluminación por espectro + riego +
inyección CO2 + estaciones meteorológicas + drones), TratamientoAgua
(tanque → RO → carbón → salida pura/pH neutro).

**Dónde no hay hardware real todavía**: Drones, TratamientoAgua y la
mayoría de Dispositivos quedan honestamente en "Sin sensor conectado" /
"Pendiente de conectar" — no se inventa ninguna lectura.

## Endpoints (9 funciones serverless — ver nota de límite abajo)

- `api/access.js`, `api/change-pin.js` — login/PIN.
- `api/gm-analyze-photo/index.py`, `api/gm-plan-day/index.py`,
  `api/gm-upload-photo.js` — Growmaster original (rutas de dron, análisis
  de fotos de campo).
- `api/gm-health.py` — salud de la API + chequeo del banco de fotos
  fusionados en un solo endpoint (`{status, photo_bank}`).
- `api/gm-photo-bank.js` — banco de fotos fundacional, servido desde el
  Blob Store **privado** `growmaster-photos` (nunca público). GET sin
  query = lista; GET `?name=<archivo>` = streamea esa foto.
- `api/ops-data.py` — CRUD genérico de todas las tablas: GET (todas, cada
  fila con `_id`), POST `{table, fields}`, PATCH `{table, id, fields}`,
  DELETE `{table, id}`; campos en lista blanca por tabla. POST
  `{action:"ingest", device_id, valor, unidad, tipo_sensor?}` con cabecera
  `X-Ingest-Key` = lectura real de un gateway IoT (marca el equipo
  "Conectado"). La clave se deriva de ADMIN_KEY/ACCESS_SECRET (o env
  `INGEST_KEY`) y se ve solo en el panel: Sistemas → "Mostrar clave".
- `api/gm-chat/index.py` — chat real del Master Grower, llama a la
  Anthropic API con el estado actual de Airtable como contexto. Necesita
  `ANTHROPIC_API_KEY` en Vercel (ya configurada).

## ⚠️ Límite crítico: Vercel Hobby = máximo 12 Serverless Functions

El 18/19-nov tres deploys seguidos fallaron en silencio
(`exceeded_serverless_functions_per_deployment`) porque se agregó un
endpoint por feature sin consolidar. Producción seguía mostrando la
versión vieja mientras el push "parecía" haber andado. Se arregló
fusionando endpoints relacionados (ver arriba). **Antes de agregar un
endpoint nuevo: contar cuántos hay (`find api -name "*.js" -o -name
index.py`) y, si se acerca a 12, fusionar en vez de crear uno nuevo.**
Después de cada push, verificar el `readyState` del deployment — un build
puede completar bien y fallar recién al desplegar.

## Variables de entorno (Vercel)

- `ACCESS_SECRET`, `ADMIN_KEY`, `ADMIN_PIN` — login del panel.
- `AIRTABLE_GROWMASTER_API_KEY` — PAT de Airtable (usado también para
  `AIRTABLE_OPS_BASE_ID`, misma cuenta).
- `AIRTABLE_GROWMASTER_BASE_ID` — base de fotos de campo (Growmaster,
  distinta de "PlantGuard Operaciones").
- `AIRTABLE_OPS_BASE_ID` = `appEoJPsQoVqgRMYi` — base de operaciones.
- `BLOB_READ_WRITE_TOKEN` — Blob Store `growmaster-photos` (privado).
- `ANTHROPIC_API_KEY` — chat real del Master Grower.
- `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` — usados por
  `api/change-pin.js` para rotar el PIN vía API de Vercel.

## Edición completa (19-nov-2026)

`public/panel-crud.js`: cualquier `<div class="crud" data-table="…">` es una
tabla real con Añadir / Editar / Borrar. Está en Zonas (zonas, sensores,
tareas), Ciclos, Drones, IPM (alertas, trampas, liberaciones), Nutrición
(fórmulas, riegos), Agua (etapas + mediciones por zona con evaluación pH/EC
contra la fórmula), Dispositivos, Personal (ficha: rol, calificación,
especialidad, zona/tarea asignada, dispositivo de empresa, en turno) y
Growmaster (base de conocimiento). Nueva vista **Sistemas** con un apartado
por sistema (sensores, drones, ventilación, iluminación, climatización/
refrigeración, calefacción, riego, CO2, eléctrico, estación meteorológica).
Vistas aún de ejemplo llevan aviso amarillo. Tablas nuevas en Airtable:
Tareas, Trampas, Liberaciones, Riegos, MedicionesAgua, BaseConocimiento.

## Grow Agent (19-nov-2026)

Botón verde de arriba a la izquierda → panel del Grow Agent
(`public/grow-agent.js`): chat escrito + conversación por voz (reconocimiento y
voz del propio navegador, es-ES; Chrome/Edge/Safari). `api/gm-chat/index.py`
recibe el historial, lee TODAS las tablas de Airtable como contexto y puede
`crear_registro` / `actualizar_registro` (misma lista blanca que el panel,
`growmaster_lib/ops_tables.py`, compartida con ops-data). No borra. Modelo:
env `ANTHROPIC_MODEL` o `claude-sonnet-5-5`, con respaldo a Haiku 4.5 si la
clave no tiene acceso. `vercel.json`: micrófono permitido solo para el propio
sitio. Pendiente (pedido por Rodrigo, después): roles — administrador
general (Rodrigo, todo) vs administradores autorizados (acceso limitado).

## Limpieza total + voz Jarvis (21-nov-2026)

- Vistas que eran maqueta (Germinación, Secado, Informes, Estadísticas,
  Protocolos, Plan, Configuración) ahora son estados vacíos honestos; chats
  de ejemplo, nombres inventados, análisis de fotos simulados, temporizadores
  y modales falsos eliminados. Zonas sin zona por defecto.
- Voz: ElevenLabs, voz diseñada "Master Grower — estilo Jarvis" (id en
  `api/gm-chat/index.py`, env `ELEVENLABS_VOICE_ID` la puede cambiar).
  `POST /api/gm-chat {tts}` devuelve MP3; si falta `ELEVENLABS_API_KEY`
  en Vercel, el panel usa la voz del navegador. `ELEVENLABS_API_KEY` creada por Rodrigo en Vercel (Sensitive,
  Production) el 21-nov-2026. Voz activa: muestra 3 ("estilo Jarvis 3").

## Grow Agent solo voz + asistencia a operarios (21-nov-2026)

- Sin chat escrito: el botón verde (y "Campo · Voz Grow Agent") abre el
  panel y empieza a escuchar; la esfera pausa/reanuda. Se ve la
  transcripción como subtítulos.
- Prompt: atiende a administrador, encargado y operarios (dispositivo IoT de
  empresa); ante incidencias da protocolo paso a paso (seguridad primero) y
  las registra como alerta IPM o tarea para el administrador.
- Cerebro: Anthropic directo (`ANTHROPIC_API_KEY`) y, si falla, Vercel AI
  Gateway por OIDC (sin clave). Estado 21-nov: clave Anthropic inválida
  (401) y AI Gateway pide tarjeta en Vercel → Rodrigo debe hacer una de las
  dos. Voz ElevenLabs OK (200). Diagnóstico: `GET /api/gm-health?keys=1`
  (solo códigos de estado, sin claves).

## Pendiente / próximos pasos

- Conectar hardware real (sensores, filtros de agua, drones) a
  **Dispositivos** cuando exista — cada uno registra su canal (WiFi,
  Bluetooth/BLE, Zigbee, LoRa, Modbus, MQTT, BACnet, DMX512, MAVLink).
- Hay un PR/rama de Copilot (`fix/blob-dependency-audit`) actualizando
  `@vercel/blob` por vulnerabilidades — no mergeada a `main`, revisar y
  mergear si corresponde.
- Sección "Próximos hitos" de Ciclos: se sacó porque era inventada: no hay
  sistema de recordatorios automático. Si se quiere implementar, es
  trabajo nuevo real.

## Revisión de seguridad 2026-11-19

Corregido:
- XSS almacenado en las pestañas de Zonas (nombre de zona dentro de un `onclick`).
- `gm-upload-photo` subía como "public" a un store privado → fallaba siempre. Ahora privado + nombre de archivo saneado.
- Login: 1,5 s de espera tras PIN incorrecto (frena fuerza bruta, no la impide).
- Cabeceras: X-Frame-Options, nosniff, HSTS, Referrer-Policy, Permissions-Policy.

Pendiente (decisión de Rodrigo / panel de Vercel):
1. **Regla de Firewall en Vercel** que limite `/api/access` por IP (el retardo no basta contra intentos en paralelo).
2. **`VERCEL_API_TOKEN`** es un token de cuenta completa dentro de `change-pin.js`: quien tenga sesión puede rotar el PIN, y si se filtra el token afecta a todos los proyectos. Valorar quitar esa función o usar un token de alcance mínimo.
3. **`BLOB_READ_WRITE_TOKEN`** aparece en Vercel como "readable-secret": recrearla como tipo *Sensitive*.
4. Un mismo PAT de Airtable sirve a dos bases; idealmente uno por base con permisos mínimos.
5. Sin CSP (el panel es todo JS inline); requiere refactor.

## Nota sobre commits "Unverified" en GitHub

Algunos commits (incluido uno legítimo de Rodrigo, `a6d983a`) aparecen
como "Unverified" en GitHub por falta de firma GPG/SSH. Es puramente
cosmético, no indica ningún problema. No reescribir autoría ni forzar
push para "arreglarlo" — si se quiere, configurar firma de commits en la
cuenta de GitHub de Rodrigo, sin tocar el historial pasado.
