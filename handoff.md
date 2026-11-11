# handoff.md — plantguard-pro-claude-2-admin

**Fecha:** 2026-11-11
**Estado:** Configuración de deploy corregida; pendiente redeploy y verificación en Vercel

---

## Objetivo
PIN authentication (12345678) + PIN change en Vercel.

## ✅ Completado
- `lib/pin-store.js` — almacenamiento del PIN
- `pages/api/access.js` — valida PIN y crea sesión
- `pages/api/change-pin.js` — cambia PIN
- `lib/auth.js` — tokens HMAC
- `public/login.html` — formulario
- `public/index.html` — dashboard + cambiar PIN
- `middleware.js` — deshabilitado
- `vercel.json` — quitada la propiedad `public`, que Vercel ya no acepta
- `package.json` — Node >=20.9, requerido por Next.js 16
- Eliminadas rutas API duplicadas para que Next.js sea el único dueño de `/api/*`

## ⚠️ Problema abierto
No se pudo consultar la URL de producción desde este entorno. Después de publicar estos cambios, revisar que `/api/access` responda y que el login redirija al panel.

---

URL de producción: https://plantguard-pro-claude-2-admin-virid.vercel.app/
