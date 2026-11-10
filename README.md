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

- Gate de acceso en `/` requiere código válido
- Post-login redirige a `/admin/`
- Sesión válida por 30 minutos (cookie `pg2_admin` con HMAC-SHA256)
- Comparte `ACCESS_SECRET` con Cloud 2 para usar el mismo generador de códigos

## API

### POST `/api/access`

Valida código y crea sesión.

```bash
curl -X POST http://localhost:3000/api/access \
  -H "Content-Type: application/json" \
  -d '{"code":"XXXXXXXX-XXXXXX"}'
```

**Response:**
```json
{ "ok": true }
```

## Archivos Clave

- `middleware.js` - Gate de acceso y validación de sesión
- `api/_auth.js` - Generación y validación de códigos HMAC
- `api/access.js` - Endpoint de autenticación
- `public/index.html` - Panel admin
