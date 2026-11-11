# PlantGuard Pro - Admin Dashboard

Panel de administración para PlantGuard Pro. Sistema de control central de cultivos con autenticación por código.

## Instalación

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Abre http://localhost:3000

## Deployment en Vercel

1. Conecta el repositorio en Vercel
2. Configura las variables de entorno:
   - `ACCESS_SECRET` (mínimo 32 caracteres)
   - `ADMIN_KEY` (clave para generar accesos)
3. Deploy automático en cada push a `main`

## Variables de Entorno

Copia `.env.example` a `.env.local` y completa:

```env
ACCESS_SECRET=your-32-character-secret-key
ADMIN_KEY=your-admin-key
```

## Autenticación

Sistema de PIN con dos modos:

### Modo PIN Simple (Recomendado para producción)
- Login en `/login.html` con PIN de 8 dígitos
- PIN inicial: **`12345678`** (cámbialo inmediatamente)
- Sesión válida por 30 minutos (cookie `pg2_admin` con HMAC-SHA256)
- Cambiar PIN desde el admin

### Modo Código HMAC (Heredado, todavía soportado)
- Gate de acceso en `/` requiere código válido formato `XXXXXXXX-XXXXXX`
- Comparte `ACCESS_SECRET` con Cloud 2

## API

### POST `/api/access`

Autentica con PIN o código.

```bash
# Autenticar con PIN
curl -X POST http://localhost:3000/api/access \
  -H "Content-Type: application/json" \
  -d '{"pin":"12345678"}'

# Autenticar con código HMAC (modo heredado)
curl -X POST http://localhost:3000/api/access \
  -H "Content-Type: application/json" \
  -d '{"code":"XXXXXXXX-XXXXXX"}'
```

**Response:**
```json
{ "ok": true }
```

### POST `/api/change-pin`

Cambia el PIN (requiere sesión válida).

```bash
curl -X POST http://localhost:3000/api/change-pin \
  -H "Content-Type: application/json" \
  -H "Cookie: pg2_admin=<valid-session>" \
  -d '{"oldPin":"12345678","newPin":"tu-pin-secreto"}'
```

## Archivos Clave

- `middleware.js` - Gate de acceso y validación de sesión
- `lib/auth.js` - Generación y validación de códigos HMAC
- `pages/api/access.js` - Endpoint de autenticación
- `public/index.html` - Panel admin
