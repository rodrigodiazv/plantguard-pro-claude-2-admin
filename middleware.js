// Protege /dashboard.html: sin una sesión válida (cookie pg2_admin firmada y
// no caducada, la misma que fija api/access.js vía lib/session.js) se
// redirige al login en vez de servir el dashboard real. Antes, el dashboard
// se servía como archivo estático sin ninguna comprobación server-side.
import { next } from "@vercel/functions";

export const config = {
  matcher: ["/dashboard.html", "/dashboard", "/operario.html", "/operario"],
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

// Cookie: exp.role.uid.name.sig  (see lib/session.js). Returns the role or "".
async function sessionRole(cookieHeader) {
  const token = readCookie(cookieHeader, "pg2_admin");
  const parts = token.split(".");
  if (parts.length !== 5) return "";
  const [exp, role, uid, nameB64, sig] = parts;
  if (!["super", "jefe", "operario"].includes(role)) return "";
  const computed = await sign("s" + [exp, role, uid, nameB64].join("."));
  const isValid = await safeEqual(computed, sig);
  return isValid && Number(exp) > Date.now() ? role : "";
}

export default async function middleware(request) {
  if (!SECRET) {
    // Sin ADMIN_KEY/ACCESS_SECRET no hay forma de verificar la cookie: no
    // abrir el dashboard en vez de fallar a "todo permitido".
    return new Response("Admin panel not configured.", { status: 503 });
  }

  const role = await sessionRole(request.headers.get("cookie"));
  if (!role) {
    return Response.redirect(new URL("/", request.url), 302);
  }

  // Operarios only get the field view; super/jefe get the full panel.
  const path = new URL(request.url).pathname;
  const isOperarioPage = path === "/operario.html" || path === "/operario";
  if (role === "operario" && !isOperarioPage) {
    return Response.redirect(new URL("/operario.html", request.url), 302);
  }
  return next({ headers: { "Cache-Control": "private, no-store" } });
}
