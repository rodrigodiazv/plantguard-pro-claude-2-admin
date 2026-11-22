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

## Grow Agent = agente conversacional de ElevenLabs (21-nov-2026, idea de Rodrigo)

- Cerebro + voz en ElevenLabs (saldo de ElevenLabs): agente "PlantGuard Grow
  Agent (Master Grower)" (id en `api/gm-chat/index.py`, env
  `ELEVENLABS_AGENT_ID`), LLM claude-sonnet-4-6, voz Jarvis 3, español,
  zona horaria Europe/Zurich. Herramientas cliente `crear_registro` /
  `actualizar_registro` (se ejecutan en el navegador con sesión, vía
  `/api/ops-data`). Prompt con `{{ops_context}}` = datos de Airtable.
- `POST /api/gm-chat {voice_session:true}` → URL firmada + contexto. El
  panel carga `@elevenlabs/client@1.35.0` (jsDelivr) y abre la sesión.
- Ya no depende de la clave de Anthropic ni del AI Gateway.
- Base de conocimiento del cultivo cargada en el agente (21-nov): documento
  de texto "PlantGuard Pro — Base de conocimiento del cultivo (Growmaster)"
  (KB v4 de la web: ciclos, clima/VPD, luz/DLI, plagas, control biológico,
  IPM, patógenos, raíces, nutrición, deficiencias, sustratos, clonación,
  poda, tratamientos, ramas rotas, secado, calidad, normativa CH, GACP/GMP)
  en modo prompt + PlantGuard-Pro-KB-11Labs-VOICE.docx con RAG multilingüe.
- Pendiente: activar autenticación (solo URL firmada) en el agente de
  ElevenLabs para que nadie más pueda usarlo con su saldo.

## Roles y acceso por PIN (22-nov-2026) — paso 1 de la visión de producto

- Tres roles: **super** (Rodrigo, `ADMIN_PIN`), **jefe** (jefe de cultivo) y **operario**.
  Cada empleado tiene su PIN personal (8 caracteres sin ambiguos); en Airtable
  (PersonalCampo) solo se guarda su huella HMAC (`PinHash`) y el nivel (`Acceso`).
  Nunca el PIN. `TienePin` (bool) se expone al panel; `PinHash` nunca sale.
- Cookie `pg2_admin` = `exp.role.uid.name.sig` (lib/session.js, middleware.js,
  growmaster_lib/session_check.py; probado JS = Python = Edge). Las sesiones
  antiguas dejan de valer (hay que volver a entrar).
- Permisos en `growmaster_lib/ops_tables.py` (`can_read`/`can_write`): jefe todo
  salvo personal (solo super); operario lee lo de campo, crea incidencias
  (alertas_ipm, tareas, trampas, mediciones) y solo actualiza tareas.
  El Grow Agent usa la sesión del navegador → hereda los mismos límites.
- `api/ops-data.py`: `GET ?me=1` (quién soy), `POST {action:"set_pin"|"revoke_pin", id,
  acceso}` solo super: el PIN se muestra UNA vez en el panel de Rodrigo (modal en
  Personal → "🔑 Dar acceso (PIN)"). `gm-health?keys=1` ahora exige super.
- `middleware.js`: operario → `/operario.html` (móvil: hablar con el Grow Agent,
  mis tareas, incidencias, foto reducida en el aparato). super/jefe → dashboard.
  `change-pin` y ajustes: solo super. `DELETE /api/access` = salir.
- Funciones Vercel: siguen 9 de 12.
- PENDIENTE: enviar el PIN por email (no hay servicio de correo en el backend;
  hoy lo entrega Rodrigo); paso 2 (solicitudes de mejora con aprobación), paso 3
  (panel por cliente con alta por email) y paso 4 (asistente de configuración
  de equipos). Actualizar prompt del agente ElevenLabs con {{user_name}} /
  {{user_role}} (hacerlo DESPUÉS de que el deploy esté READY).

## Solicitudes de mejora (22-nov-2026) — paso 2 de la visión de producto

- Tabla Airtable `Mejoras` (Titulo, Detalle, Tipo, SolicitadaPor, Rol, Estado, Fecha, NotaRodrigo);
  clave `mejoras` en `ops_tables.py`. Vista "Mejoras" del panel (super y jefe).
- Cualquier rol puede CREAR (también el Grow Agent por voz). El servidor fija
  Estado=Pendiente, SolicitadaPor, Rol y Fecha (el cliente/agente no puede elegirlos).
  Solo el super cambia el estado, y solo con la cabecera `X-Panel-Approval: 1` que
  envían los botones del panel (Aprobar / Rechazar / En desarrollo / Publicada):
  el agente de voz no puede aprobar nada.
- FLUJO DE DESARROLLO: al empezar una sesión en este repo, leer `Mejoras` con
  Estado = "Aprobada" (Airtable MCP, base appEoJPsQoVqgRMYi), proponer el plan a
  Rodrigo, pasar a "En desarrollo" al empezar y a "Publicada" SOLO tras probar,
  desplegar y verificar READY. Nada de código a producción sin aprobación.

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

## 22-nov — Grow Agent decía "hecho" sin ejecutar
- Causa: el agente de voz anunciaba "registrado" antes de llamar a `crear_registro`; luego las llamadas se duplicaron (6 filas repetidas en BaseConocimiento, ya borradas).
- Arreglo: regla de honestidad añadida al prompt del agente EL (solo confirmar tras `ok:true`, siempre `table`, no duplicar, no prometer cambios de software/hardware). Publicado.
- Pendiente: Rodrigo repite la prueba (crear zona por voz) y verifica en el panel. Sin hardware conectado.

## 22-nov — Memoria persistente del Grow Agent
- Tabla Airtable `Memoria` (tblTj1okAo0ztNu5W): diario escrito por el sistema (Fecha, Actor, Rol, Tipo, Accion, Tabla, RegistroId, Resumen, Detalle).
- `api/ops-data.py`: cada POST/PATCH/DELETE y cada emisión/revocación de PIN se anota solo (`log_memory`, no rompe la escritura si falla). POST a `memoria` = nota (el servidor fuerza autor/fecha); PATCH/DELETE prohibidos.
- `GET /api/ops-data?memoria=md` (super/jefe) descarga MEMORIA-GrowAgent.md: recuento real por tabla + mejoras abiertas + diario.
- `gm-chat`: `build_context` antepone "MEMORIA RECIENTE" (60 últimas entradas) al contexto del agente al empezar cada conversación.
- Panel: vista "Memoria" (visor + botón de descarga).
- Funciones Vercel: sin cambios (9).

## 22-nov — Grow Agent con poder de borrar y leer
- Nuevas client tools ElevenLabs: `borrar_registro` (table, ids_json, motivo) y `leer_tabla` (table), adjuntas al agente y publicadas.
- `public/grow-agent.js`: `deleteRecords` muestra cuadro "Autorizar / Rechazar" en el panel antes de borrar (DELETE por id vía /api/ops-data, permisos por rol; `memoria` no se puede borrar); `readTable` lee en vivo.
- Prompt: protocolo leer → anunciar y pedir autorización → borrar → confirmar solo tras ok:true.

## 22-nov — Memoria de conversaciones (nunca perder contexto)
- `grow-agent.js` acumula la transcripción y la envía al terminar (onDisconnect/cerrar/pagehide, `keepalive`) a `POST /api/ops-data {action:"conversation"}` → fila `Memoria` Tipo "Conversación" (Detalle = transcripción, hasta 30000 car.).
- `gm-chat build_context`: diario (60) + últimas 4 conversaciones (3500 car. c/u) al empezar cada sesión. Prompt: retomar lo pendiente sin que se lo repitan.
- Límite conocido: si el navegador muere sin evento de cierre, esa conversación no se guarda. El MEMORIA.md descargable incluye las transcripciones.

## 22-nov — Clima para el Grow Agent
- `GET /api/ops-data?clima=<lugar>` (sesión requerida): geocodifica y devuelve tiempo actual + 7 días de Open-Meteo (sin clave). Marcado como previsión pública, NO sensores.
- Client tool ElevenLabs `consultar_clima(lugar)` + `weather()` en `grow-agent.js`; prompt actualizado y publicado. Funciones Vercel: sin cambios (9).
