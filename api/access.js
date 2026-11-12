// api/access.js - Server-side PIN check for the admin gate.
// Replaces the old client-side-only check (the PIN used to be hardcoded
// in public/index.html, readable by anyone via view-source).
const crypto = require("crypto");

const SESSION_MS = 30 * 60 * 1000;
const SECRET = process.env.ADMIN_KEY || process.env.ACCESS_SECRET || "";

function sign(text) {
  return crypto.createHmac("sha256", SECRET).update(text).digest("hex");
}

function makeSessionCookie() {
  const exp = Date.now() + SESSION_MS;
  const body = String(exp);
  const token = `${body}.${sign("s" + body)}`;
  return `pg2_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin || !SECRET) {
    console.error("access: ADMIN_PIN or ADMIN_KEY/ACCESS_SECRET not configured");
    return res.status(500).json({ error: "server_not_configured" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return res.status(400).json({ error: "invalid_body" });
  }

  const pin = String((body && body.pin) || "").trim();
  if (!pin) {
    return res.status(400).json({ error: "pin_required" });
  }

  if (!timingSafeEqual(pin, adminPin)) {
    return res.status(401).json({ error: "pin_invalid" });
  }

  res.setHeader("Set-Cookie", makeSessionCookie());
  return res.status(200).json({ ok: true });
};
