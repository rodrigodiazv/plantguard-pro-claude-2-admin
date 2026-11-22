// api/access.js - Server-side PIN check for the panel gate.
// Two kinds of PIN: the super administrator's (env ADMIN_PIN) and one personal PIN per
// employee (stored only as an HMAC fingerprint in Airtable PersonalCampo.PinHash).
const { SECRET, makeSessionCookie, clearSessionCookie, timingSafeEqual, pinHash } = require("../lib/session.js");

async function findEmployee(pin) {
  const key = process.env.AIRTABLE_GROWMASTER_API_KEY;
  const base = process.env.AIRTABLE_OPS_BASE_ID;
  if (!key || !base) return null;
  const formula = encodeURIComponent(`{PinHash}='${pinHash(pin)}'`);
  const r = await fetch(`https://api.airtable.com/v0/${base}/PersonalCampo?maxRecords=1&filterByFormula=${formula}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => ({}));
  const rec = (data.records || [])[0];
  if (!rec) return null;
  const f = rec.fields || {};
  return { uid: rec.id, name: f.Nombre || "Empleado", role: f.Acceso === "Jefe de cultivo" ? "jefe" : "operario" };
}

module.exports = async function handler(req, res) {
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(200).json({ ok: true });
  }
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

  if (timingSafeEqual(pin, adminPin)) {
    res.setHeader("Set-Cookie", makeSessionCookie("super", "super", "Rodrigo"));
    return res.status(200).json({ ok: true, role: "super" });
  }

  let emp = null;
  try { emp = await findEmployee(pin); } catch (e) { console.error("access: employee lookup failed"); }
  if (emp) {
    res.setHeader("Set-Cookie", makeSessionCookie(emp.role, emp.uid, emp.name));
    return res.status(200).json({ ok: true, role: emp.role });
  }

  // Slows down PIN guessing; a real per-IP limit needs a Vercel Firewall rule.
  await new Promise((r) => setTimeout(r, 1500));
  return res.status(401).json({ error: "pin_invalid" });
};
