# handoff.md — plantguard-pro-claude-2-admin

**Fecha:** 2026-11-11
**Estado:** Implementación del login y seguridad completada; redeploy y verificación en Vercel pendientes

## Logro Final
PIN alfanumérico (8 chars) + dashboard en Vercel. **Ningún secreto expuesto.**

## Variables Vercel
```
ADMIN_PIN=<tu-8-chars>     # Usuario ingresa esto
ADMIN_KEY=<32+ chars>      # Firma tokens (server-only)
```

## Estructura Limpia
- `pages/api/access.js` → Login
- `pages/api/change-pin.js` → Cambiar PIN
- `lib/auth.js` → Módulo de autenticación
- `lib/pin-store.js` → Almacenamiento del PIN
- `public/login.html`, `public/index.html` → Estáticos
- `SECURITY.md` → Guía de seguridad

## Errores Evitados (Lecciones)
1. API routes no compiladas → Migrar a Next.js
2. Rewrites bloqueando APIs → Usar redirects server-side
3. ADMIN_KEY como PIN → Variables separadas
4. `/api/` + `pages/api/` duplicados → Single source

## Test
```bash
PIN correcto → Dashboard
PIN incorrecto → Error
Nueva sesión → Respeta ADMIN_PIN
```

## Para Continuar
- Verifica ADMIN_PIN en Vercel env
- Logs: `vercel logs --follow`
- Local: `npm run dev`

**SECURITY.md tiene el checklist completo.**

## Configuración de deploy
- `vercel.json` — quitada la propiedad `public`, que Vercel ya no acepta
- `package.json` — Node >=20.9, requerido por Next.js 16
- Eliminadas rutas API duplicadas para que Next.js sea el único dueño de `/api/*`

## Verificación pendiente
No se pudo consultar la URL de producción desde este entorno. Después de publicar estos cambios, revisar que `/api/access` responda y que el login redirija al panel.

URL de producción: https://plantguard-pro-claude-2-admin-virid.vercel.app/
