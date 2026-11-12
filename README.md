# PlantGuard Pro - Admin Dashboard

Panel de administración para PlantGuard Pro. Sitio estático (HTML puro) con un
gate de PIN validado en el servidor.

## Deployment en Vercel

Deploy automático en cada push a `main`. No hay build: `vercel.json` está
vacío (`{}`) y Vercel sirve `public/` tal cual, más las funciones en `api/`.

### Variables de entorno requeridas

- `ADMIN_PIN` — el PIN de acceso (lo valida `api/access.js` en el servidor).
- `ADMIN_KEY` o `ACCESS_SECRET` — secreto para firmar la cookie de sesión
  (HMAC-SHA256). Usa el que esté definido; `ADMIN_KEY` tiene prioridad.

Ninguno de los dos se envía al navegador. Para cambiar el PIN hay que
rotarlo en Vercel (Project Settings → Environment Variables) — no hay base
de datos en este sitio estático para guardarlo desde el propio panel.

## Autenticación

- `public/index.html` es el login: pide el PIN y lo manda por `POST` a
  `/api/access`.
- `api/access.js` compara el PIN contra `ADMIN_PIN` (comparación segura
  contra timing attacks) y, si es correcto, pone una cookie de sesión
  `pg2_admin` firmada con HMAC, `httpOnly`, `Secure`, válida 30 minutos.
- Si el PIN es correcto, redirige a `public/dashboard.html`.

**Importante:** `dashboard.html` es un archivo estático público — nada
bloquea abrirlo directamente por URL sin pasar por el login. Hoy no expone
datos reales (es una maqueta, sin llamadas a ningún backend), pero cerrar
ese hueco de verdad necesitaría un Edge Middleware que valide la cookie en
cada ruta de `/dashboard.html`, hoy sin implementar.

### API

`POST /api/access`

```bash
curl -i -X POST https://<tu-deploy>.vercel.app/api/access \
  -H "Content-Type: application/json" \
  -d '{"pin":"tu-pin"}'
```

Devuelve `200 {"ok":true}` y la cookie de sesión si el PIN es correcto,
`401 {"error":"pin_invalid"}` si no.

## Archivos clave

- `public/index.html` — formulario de login.
- `public/dashboard.html` — panel (maqueta de UI, sin datos en vivo).
- `api/access.js` — valida el PIN y crea la sesión.
