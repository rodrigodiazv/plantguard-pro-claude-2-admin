# Security Guidelines — PlantGuard Pro Admin

## Lecciones Aprendidas (Nov 2026)

### 🔴 NUNCA hacer esto
- ❌ Exponer API keys en variables de entorno del frontend
- ❌ Loguear secretos en consola
- ❌ Dejar credenciales en código fuente
- ❌ Usar secretos en rewrite/redirect rules (visible en HTML)
- ❌ Confundir `ADMIN_KEY` (signing) con `ADMIN_PIN` (login)

### ✅ Arquitectura Correcta

**Variable roles:**
```
ADMIN_KEY     → Clave de firma (32+ chars, usado en /api)
ADMIN_PIN     → PIN de login (8 chars, usuario ingresa)
ACCESS_SECRET → Fallback para ADMIN_KEY
```

**Dónde van los secretos:**
```
NUNCA:        Frontend (login.html, dashboard.js, public/)
SÍ:           Vercel Environment Variables → /api routes only
SÍ:           process.env.ADMIN_KEY (server-side only)
```

**Qué puede ver el usuario:**
```
✅ PIN input field (vacío, no prellenado)
✅ Dashboard después de login
❌ API endpoints en código frontend
❌ Secrets en network requests
❌ AUTH tokens visibles (use httpOnly cookies)
```

---

## Security Checklist

Antes de cada deploy:

- [ ] No hay `console.log(process.env.*)` en código
- [ ] ADMIN_KEY/ADMIN_PIN solo en Vercel env vars, NO en .env.example
- [ ] Secrets nunca en public/ folder
- [ ] httpOnly cookies para sesiones
- [ ] API routes verifican autenticación
- [ ] No hay secretos en vercel.json, next.config.js
- [ ] Package.json no contiene secrets en scripts
- [ ] .gitignore excluye .env, .env.local, etc
- [ ] No hay hardcoded PINs en HTML (excepto "default" como instrucción)

---

## API Security Pattern

**CORRECTO:**
```javascript
// pages/api/access.js
const SECRET = process.env.ADMIN_KEY || process.env.ACCESS_SECRET;
const currentPIN = process.env.ADMIN_PIN || '12345678';

if (String(pin).trim() === currentPIN) {
  const token = makeSession(SECRET); // HMAC signing
  res.setHeader("Set-Cookie", `token=${token}; HttpOnly; Secure`);
  return res.json({ ok: true });
}
```

**INCORRECTO:**
```javascript
// ❌ NUNCA hacer esto
res.json({ token: SECRET }); // Expone el secret
res.json({ adminKey: process.env.ADMIN_KEY }); // Leaked
document.write(process.env.ADMIN_PIN); // Exposed in HTML
```

---

## Errores Cometidos (Historial)

### Error 1: API Routes No Compiladas
- **Causa:** Vercel no detectaba `/api/*.js` sin framework
- **Fix:** Migrar a Next.js → `pages/api/`
- **Lección:** Always specify framework in `vercel.json`

### Error 2: Rewrites Interfiriendo con APIs
- **Causa:** `vercel.json` rewrites estáticas bloqueaban `/api/*`
- **Fix:** Usar server-side redirects (`getServerSideProps`)
- **Lección:** Rewrites != rutas API; mantenerlas separadas

### Error 3: Secretos en Variables Globales
- **Causa:** `ADMIN_KEY` intentó usarse como PIN
- **Fix:** Variables separadas por propósito
- **Lección:** Naming matters — clarify intent

### Error 4: Archivos Duplicados
- **Causa:** `/api/` + `pages/api/` = conflicto
- **Fix:** Single source — usar `pages/api/` con prefijo `_` para módulos
- **Lección:** Clean architecture prevents silent failures

---

## Para Futuros Proyectos

### Template de .env.example
```bash
# NUNCA incluir valores reales
ADMIN_KEY=<your-32-char-secret-key>
ADMIN_PIN=<your-8-char-pin>
ACCESS_SECRET=<backup-secret-key>
```

### Template de .gitignore
```
.env
.env.local
.env.*.local
.env.*.vault
node_modules/
.next/
.vercel/
```

### Template de next.config.js (Seguro)
```javascript
const nextConfig = {
  reactStrictMode: true,
  // NO incluir vercel.json aquí
  // NO incluir secretos
  // Use pages/api/ para rutas seguras
};
```

---

## Reglas de Oro

1. **Separation of Concerns**
   - Frontend = HTML, CSS, validación visual
   - Backend = lógica, secretos, autenticación

2. **Least Privilege**
   - Cada variable solo accede lo necesario
   - httpOnly cookies, CSRF tokens

3. **Audit Trail**
   - Log accesos a /api (sin secretos)
   - Monitorear fallos de PIN

4. **Regular Review**
   - Mensual: revisar qué está en .env
   - Trimestral: auditar secretos en Vercel

---

**Creado:** Nov 11, 2026
**Aprendizaje:** Errores evitados en PlantGuard Pro Admin
**Aplicar a:** Todos los proyectos futuro con secrets
