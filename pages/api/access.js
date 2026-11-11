const { parseCode, makeSession, SESSION_MS } = require("./_auth");
const { getPIN } = require("./pin-store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    console.error("Parse error:", e);
    return res.status(400).json({ error: "invalid" });
  }

  const pin = body && body.pin;
  const rawCode = body && body.code;
  const currentPIN = getPIN();

  // Validar PIN
  if (pin) {
    console.log("Admin access attempt with PIN");
    if (String(pin).trim() === currentPIN) {
      const token = makeSession();
      const cookieValue = `pg2_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
      res.setHeader("Set-Cookie", cookieValue);
      return res.status(200).json({ ok: true });
    } else {
      return res.status(401).json({ error: "pin_invalid" });
    }
  }

  // Fallback: validar código HMAC antiguo
  if (rawCode) {
    console.log("Admin access attempt with code:", { has_secret: !!process.env.ACCESS_SECRET });
    const id = parseCode(rawCode);
    if (!id) {
      return res.status(401).json({ error: "invalid" });
    }
    const token = makeSession();
    const cookieValue = `pg2_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
    res.setHeader("Set-Cookie", cookieValue);
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "pin_required" });
};
