import { checkSession, readCookie } from './_auth.js';

// PIN storage en memoria (sincronizado con access.js)
let currentPIN = process.env.ADMIN_PIN || '12345678';

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  // Verificar sesión válida
  const session = readCookie(req, "pg2_admin");
  if (!checkSession(session)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    console.error("Parse error:", e);
    return res.status(400).json({ error: "invalid" });
  }

  const { oldPin, newPin } = body;

  if (!oldPin || !newPin) {
    return res.status(400).json({ error: "missing_fields" });
  }

  if (String(oldPin).trim() === currentPIN) {
    currentPIN = String(newPin).trim();
    console.log("PIN changed successfully");
    return res.status(200).json({ ok: true, message: "PIN actualizado correctamente" });
  } else {
    return res.status(401).json({ error: "invalid_old_pin" });
  }
}
