# handoff.md — plantguard-pro-claude-2-admin

**Fecha:** 2026-11-11  
**Estado:** ✅ COMPLETADO — Login funcional + seguridad

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
- `pages/api/_auth.js` → Módulo (no expuesto)
- `pages/api/_pin-store.js` → Módulo (no expuesto)
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
