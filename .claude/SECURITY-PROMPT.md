# 🔐 SECURITY PROTOCOL — Todos los Proyectos

**Aplica a:** Todos los repos de Rodrigo  
**Prioridad:** MÁXIMA — Ejecuta antes de cualquier tarea  
**Actualizado:** Nov 11, 2026

---

## ⚡ ANTES DE CUALQUIER CODING

### 1️⃣ Variables de Entorno — NUNCA Frontend
```javascript
❌ NUNCA:
- document.write(process.env.SECRET)
- fetch('/api?key=' + process.env.API_KEY)
- localStorage.setItem('token', process.env.ADMIN_KEY)

✅ SIEMPRE:
- Secretos solo en process.env (server-side)
- Pasar datos seguros vía headers/cookies (httpOnly)
- Validar en API routes (/api/*)
```

### 2️⃣ Checklist Pre-Deploy
- [ ] `grep -r "process.env" public/` → SIN resultados
- [ ] `.env` está en .gitignore
- [ ] `.env.example` NO tiene valores reales
- [ ] No hay hardcoded tokens/keys en código
- [ ] `console.log(process.env.*)` → NUNCA
- [ ] httpOnly cookies para sesiones
- [ ] API routes verifican autenticación
- [ ] Secretos en Vercel env vars, NO en vercel.json

### 3️⃣ Estructura de Seguridad
```
✅ CORRECTO:
pages/api/
  ├── access.js (POST) → Valida credencial → Token
  ├── _auth.js → Módulo (no expuesto, empieza con _)
  └── _secrets.js → Módulo (no expuesto)

❌ INCORRECTO:
api/
  └── utils.js (expone como ruta)

public/
  └── No secretos aquí
```

### 4️⃣ Patrones de Seguridad
```javascript
// ✅ CORRECTO
const SECRET = process.env.ADMIN_KEY;
const handler = (req, res) => {
  if (!SECRET) return res.status(500).json({ error: 'Config error' });
  const token = sign(req.body, SECRET); // Server-side
  res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Secure`);
};

// ❌ INCORRECTO
res.json({ secret: process.env.SECRET }); // Leaked
res.json({ user: req.headers.authorization }); // Exposed
```

---

## 🎓 Lecciones de PlantGuard Pro Admin

### Problema 1: API Routes No Compiladas
**Causa:** Vercel no detectaba `/api/*.js` sin framework  
**Fix:** Migrar a Next.js, usar `pages/api/`  
**Prevención:** Siempre especificar `framework: "nextjs"` en vercel.json

### Problema 2: Rewrites Interfirieron
**Causa:** Rewrites estáticas bloqueaban `/api/*`  
**Fix:** Usar server-side redirects (getServerSideProps)  
**Prevención:** Mantener APIs separadas de rewrites/redirects

### Problema 3: Secretos Expuestos
**Causa:** ADMIN_KEY intentó usarse como PIN  
**Fix:** Variables separadas por rol (signing vs login)  
**Prevención:** Naming claro (ADMIN_KEY, ADMIN_PIN, API_SECRET)

### Problema 4: Arquitectura Duplicada
**Causa:** `/api/` + `pages/api/` conflictivos  
**Fix:** Single source en `pages/api/` con prefijo `_`  
**Prevención:** Clean folder structure, linter checks

---

## 🚨 RED FLAGS — Si Ves Esto, PARAR

```javascript
// 🚨 PARAR INMEDIATAMENTE
import secret from '.env' // ❌ .env no se importa
const key = process.env.API_KEY in frontend // ❌ Frontend no accede
fetch('/?token=' + localStorage.getItem('key')) // ❌ Token en URL
<script>const KEY = ${process.env.SECRET}</script> // ❌ En HTML

// Fix: Mover a /api route
```

---

## 📋 Deploy Checklist (Antes de Vercel)

```bash
# 1. Búsqueda de secretos
grep -r "process.env\." pages/
grep -r "process.env\." public/
grep -r "ADMIN_" vercel.json
grep -r "SECRET" next.config.js

# 2. Verificar .gitignore
cat .gitignore | grep -E "\.env|secret|key"

# 3. Revisar variables
vercel env ls

# 4. Build local (sin errores)
npm run build
```

---

## 🔑 Variable Roles (Memoria Permanente)

| Variable | Propósito | Tamaño | Dónde | Frontend? |
|----------|-----------|--------|-------|-----------|
| ADMIN_KEY | Firma tokens HMAC | 32+ chars | /api only | ❌ NO |
| ADMIN_PIN | PIN login usuario | 8 chars | /api only | ❌ NO |
| API_SECRET | Backup signing | 32+ chars | /api only | ❌ NO |
| PUBLIC_KEY | Info pública | N/A | Puede ir en código | ✅ SÍ |

---

## 🎯 Workflow Seguro

1. **Diseño:**
   - ¿Necesita token/secret? → API route
   - ¿Está en public/? → NUNCA secretos
   - ¿Accede frontend? → NO puede ser secreto

2. **Código:**
   - Secretos solo en /api routes
   - Validar cada request en servidor
   - httpOnly cookies para sessiones

3. **Deploy:**
   - Variables en Vercel env (NO código)
   - Build local sin errores
   - Check grep para secretos expostos

4. **Monitoreo:**
   - Logs de accesos (sin secrets)
   - Alertas de fallos autenticación
   - Audit cada 30 días

---

## 📞 Preguntas de Auto-Check

Antes de pedir PR review:

- ¿Hay `process.env.SECRET` en público? → NO ✓
- ¿Está en .gitignore? → SÍ ✓
- ¿Las APIs validan sesión? → SÍ ✓
- ¿Usé httpOnly cookies? → SÍ ✓
- ¿Hay hardcoded keys? → NO ✓
- ¿Se puede leer en HTML? → NO ✓

---

**Si dudas de seguridad → Pregunta primero, code después**

**Mantener SECURITY.md actualizado en cada repo.**
