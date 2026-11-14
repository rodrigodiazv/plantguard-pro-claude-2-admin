// Protege /dashboard.html: sin una sesión válida (cookie pg2_admin firmada y
// no caducada, la misma que fija api/access.js vía lib/session.js) se
// redirige al login en vez de servir el dashboard real. Antes, el dashboard
// se servía como archivo estático sin ninguna comprobación server-side.
import { next } from "@vercel/functions";

export const config = {
  matcher: ["/dashboard.html", "/dashboard"],
};

const SECRET = process.env.ADMIN_KEY || process.env.ACCESS_SECRET || "";

async function sign(text) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Comparación a tiempo constante (Edge runtime no tiene crypto.timingSafeEqual
// de Node): hashea ambos valores a longitud fija y compara byte a byte sin
// cortocircuito, igual que en los demás middleware de PlantGuard Pro.
async function safeEqual(a, b) {
  const ha = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(a))));
  const hb = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(b))));
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

function readCookie(cookieHeader, name) {
  const hit = (cookieHeader || "").split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
}

async function validSession(cookieHeader) {
  const token = readCookie(cookieHeader, "pg2_admin");
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const computed = await sign("s" + body);
  const isValid = await safeEqual(computed, sig);
  const isNotExpired = Number(body) > Date.now();
  return isValid && isNotExpired;
}

export default async function middleware(request) {
  if (!SECRET) {
    // Sin ADMIN_KEY/ACCESS_SECRET no hay forma de verificar la cookie: no
    // abrir el dashboard en vez de fallar a "todo permitido".
    return new Response("Admin panel not configured.", { status: 503 });
  }

  const cookieHeader = request.headers.get("cookie");
  const isValid = await validSession(cookieHeader);

  if (isValid) {
    return next({ headers: { "Cache-Control": "private, no-store" } });
  }

  return Response.redirect(new URL("/", request.url), 302);
}
