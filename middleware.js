import { next } from "@vercel/functions";

export const config = {
  matcher: [
    "/((?!api/).*)",
  ],
};

async function sign(text, secret) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16).toUpperCase();
}

async function validSession(cookieHeader, secret) {
  const hit = (cookieHeader || "").split(";").map((c) => c.trim()).find((c) => c.startsWith("pg2_admin="));
  if (!hit) {
    console.log("[middleware] No pg2_admin cookie found");
    return false;
  }
  const [body, sig] = decodeURIComponent(hit.slice(10)).split(".");
  if (!body || !sig) {
    console.log("[middleware] Invalid token format:", { has_body: !!body, has_sig: !!sig });
    return false;
  }
  const computed = await sign("s" + body, secret);
  const isValid = computed === sig;
  const isNotExpired = Number(body) > Date.now();
  console.log("[middleware] Admin session check:", {
    sig_match: isValid,
    not_expired: isNotExpired,
    expires_at: new Date(Number(body)).toISOString()
  });
  return isValid && isNotExpired;
}

const GATE = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>PlantGuard Pro · Admin Dashboard</title>
<style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0f0c;color:#e7ece8;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px;box-sizing:border-box}
.box{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:28px;width:100%;max-width:420px;text-align:center;box-sizing:border-box}
input{width:100%;font:inherit;padding:12px 14px;border-radius:10px;border:1px solid #2a3830;background:#0f1512;color:#e7ece8;margin:12px 0;text-align:center;letter-spacing:.08em;text-transform:uppercase;box-sizing:border-box}
button{width:100%;font:inherit;font-weight:700;background:#7fc29a;color:#0b0f0c;border:0;border-radius:10px;padding:12px;cursor:pointer}
p{color:#9bada2;margin:6px 0}.err{color:#e0a48f;min-height:1.3em}</style></head><body>
<div class="box"><div style="font-weight:800;font-size:1.3rem">Admin Dashboard</div>
<p id="t1"></p><input id="c" autocomplete="off" aria-label="Code" placeholder="XXXXXXXX-XXXXXX">
<button id="b"></button><p class="err" id="e"></p><p style="font-size:.85rem" id="t2"></p></div>
<script>
var L=["Admin access. Enter your code.","Enter","Session lasts 30 minutes.","Invalid code."];
document.getElementById('t1').textContent=L[0];document.getElementById('b').textContent=L[1];document.getElementById('t2').textContent=L[2];
async function go(){var v=document.getElementById('c').value.trim();if(!v)return;
var r=await fetch('/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:v})});
if(r.ok){location.href='/admin/';}else{document.getElementById('e').textContent=L[3];}}
document.getElementById('b').onclick=go;document.getElementById('c').addEventListener('keydown',function(e){if(e.key==='Enter')go();});
</script></body></html>`;

export default async function middleware(request) {
  const secret = process.env.ACCESS_SECRET;
  const pathname = new URL(request.url).pathname;

  // Permitir acceso a API y archivos públicos (login.html, etc)
  if (pathname.startsWith("/api/") || pathname === "/login.html" || pathname === "/") {
    return next();
  }

  // Si no hay SECRET en env, pasar (sistema en modo PIN simple)
  if (!secret || secret.length < 32) {
    const cookieHeader = request.headers.get("cookie");
    const isValid = await validSession(cookieHeader, "dummy-secret");

    if (!isValid && pathname.startsWith("/admin")) {
      // Redirigir a login
      return new Response(null, {
        status: 302,
        headers: { "Location": "/login.html" }
      });
    }
    return next({ headers: { "Cache-Control": "private, no-store" } });
  }

  const cookieHeader = request.headers.get("cookie");
  const isValid = await validSession(cookieHeader, secret);

  if (isValid) {
    return next({ headers: { "Cache-Control": "private, no-store" } });
  }

  // Redirigir a login en lugar de mostrar GATE inline
  if (pathname.startsWith("/admin")) {
    return new Response(null, {
      status: 302,
      headers: { "Location": "/login.html" }
    });
  }

  return new Response(GATE, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
