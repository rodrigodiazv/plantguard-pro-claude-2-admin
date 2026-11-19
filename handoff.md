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
- `api/ops-data.py` — GET devuelve TODAS las tablas de Airtable de una;
  POST crea un dispositivo nuevo (antes era `api/gm-device` separado,
  se fusionó).
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

## Nota sobre commits "Unverified" en GitHub

Algunos commits (incluido uno legítimo de Rodrigo, `a6d983a`) aparecen
como "Unverified" en GitHub por falta de firma GPG/SSH. Es puramente
cosmético, no indica ningún problema. No reescribir autoría ni forzar
push para "arreglarlo" — si se quiere, configurar firma de commits en la
cuenta de GitHub de Rodrigo, sin tocar el historial pasado.
