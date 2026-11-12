// api/crm.js - Server-side proxy to the real CRM backend (plantguard-crm.vercel.app).
// Runs server-side so the browser never calls the CRM directly (avoids CORS,
// since the CRM has no Access-Control-Allow-Origin header, and keeps this
// behind the admin's own PIN session instead of exposing the CRM publicly
// to anyone who finds its URL).
const { hasValidSession } = require("../lib/session.js");

const CRM_BASE = "https://plantguard-crm.vercel.app";

async function crmFetch(path) {
  const r = await fetch(`${CRM_BASE}${path}`);
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const [analytics, contacts] = await Promise.all([
    crmFetch("/api/analytics?period=month"),
    crmFetch("/api/contacts?limit=50"),
  ]);

  if (!analytics.ok) {
    return res.status(502).json({ error: "crm_unreachable", detail: analytics.data });
  }

  return res.status(200).json({
    ok: true,
    metrics: analytics.data.metrics || null,
    contacts: contacts.ok ? contacts.data.data || [] : [],
    contacts_error: contacts.ok ? null : contacts.data,
  });
};
