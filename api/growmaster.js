// api/growmaster.js - Server-side proxy to the Growmaster API (growmaster-pi.vercel.app).
// Same reasoning as api/crm.js: proxy server-side to avoid CORS and to keep
// this behind the admin's own PIN session.
//
// Only proxies what's real: /health, /photo-bank/check (GET) and /plan-day
// (POST, the drone route planner). Growmaster's orchestrator class has no
// real sensor/drone agents wired in yet, so there is no "proposals" feed to
// show - this file deliberately does not invent one.
const { hasValidSession } = require("../lib/session.js");

const GROWMASTER_BASE = "https://growmaster-pi.vercel.app";

async function growmasterFetch(path, options) {
  const r = await fetch(`${GROWMASTER_BASE}${path}`, options);
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

module.exports = async function handler(req, res) {
  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  if (req.method === "GET") {
    const [health, photoBank] = await Promise.all([
      growmasterFetch("/health"),
      growmasterFetch("/photo-bank/check"),
    ]);
    return res.status(200).json({
      ok: true,
      api_reachable: health.ok,
      health: health.ok ? health.data : null,
      photo_bank: photoBank.ok ? photoBank.data : null,
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch (e) {
      return res.status(400).json({ error: "invalid_body" });
    }
    const result = await growmasterFetch("/plan-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.status(result.status || 502).json(result.data);
  }

  return res.status(405).json({ error: "method_not_allowed" });
};
