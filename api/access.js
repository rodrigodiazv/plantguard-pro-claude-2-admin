import { parseCode, makeSession, SESSION_MS } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    console.error("Parse error:", e);
    return res.status(400).json({ error: "invalid" });
  }

  const rawCode = body && body.code;
  console.log("Admin access attempt:", { code: rawCode, has_secret: !!process.env.ACCESS_SECRET });

  const id = parseCode(rawCode);
  console.log("ParseCode result:", { id, rawCode });

  if (!id) {
    return res.status(401).json({ error: "invalid" });
  }

  const token = makeSession();
  const cookieValue = `pg2_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
  console.log("Admin session set, valid until:", new Date(Number(token.split(".")[0])).toISOString());

  res.setHeader("Set-Cookie", cookieValue);
  return res.status(200).json({ ok: true });
}
