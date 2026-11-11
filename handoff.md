# handoff.md — plantguard-pro-claude-2-admin

**Fecha:** 2026-11-11  
**Estado:** ⚠️ EN PROGRESO - Login no funciona aún  

---

## Objetivo
PIN authentication (12345678) + PIN change en Vercel.

## ✅ Completado
- `api/pin-store.js` — PIN: `12345678` default
- `api/access.js` — valida PIN, crea sesión
- `api/change-pin.js` — cambiar PIN
- `api/_auth.js` — tokens HMAC
- `public/login.html` — formulario
- `public/index.html` — dashboard + cambiar PIN
- `middleware.js` — deshabilitado
- `vercel.json` — rewrite + `"functions": {"api/*.js": {"runtime": "nodejs18.x"}}`
- `package.json` — node >=18

## ⚠️ Problema abierto
**Login: "Error de conexión"** a `/api/access`

**Último commit:** `8edb7c9` - agregó `"functions"` a vercel.json

**Siguiente:** Verificar en Vercel logs si las funciones están compiladas.

## Intentos fallidos
- routes `/api/(.*)` → no sirvió
- outputDirectory: public → ocultó api/
- middleware ES modules → bloqueó API
- Sin package.json → no compiló

## Si sigue sin funcionar
1. Abre https://vercel.com
2. Revisa "Deployments" → logs
3. Busca "function invocation failed"
4. Si no compila: agrega `npm install` a buildCommand

## Código correcto (verificado)
- PIN: `'12345678'`
- Validación: `String(pin).trim() === currentPIN`
- Envío: `JSON.stringify({ pin })`

## Continuar con
- Otra sesión (contexto limpio)
- Modelo Haiku (más barato)
- Lee este archivo primero

---

URL: https://plantguard-pro-claude-2-admin-virid.vercel.app/
PIN: 12345678
