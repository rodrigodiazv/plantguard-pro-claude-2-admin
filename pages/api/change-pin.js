const { checkSession, readCookie } = require('./_auth');
const { getPIN, setPIN } = require('./pin-store');

module.exports = function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

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

  const currentPIN = getPIN();
  if (String(oldPin).trim() !== currentPIN) {
    return res.status(401).json({ error: "invalid_old_pin" });
  }

  const result = setPIN(newPin);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  console.log("PIN changed successfully");
  return res.status(200).json({ ok: true, message: "PIN actualizado correctamente" });
};
