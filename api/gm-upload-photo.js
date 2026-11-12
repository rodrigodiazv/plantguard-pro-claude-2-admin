// api/gm-upload-photo.js - Field technicians upload a pest/disease photo from
// their phone/tablet (same admin panel, native camera input). Stores the
// photo in Vercel Blob, runs it through Growmaster's real coverage analyzer,
// and logs a catalog row in the "PlantGuard Growmaster" Airtable base (a
// separate base from the sales CRM - this is knowledge-base data, not a lead).
const { put } = require("@vercel/blob");
const { hasValidSession } = require("../lib/session.js");

async function callAnalyze(cookieHeader, host, image_base64, filename) {
  const r = await fetch(`https://${host}/api/gm-analyze-photo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader || "" },
    body: JSON.stringify({ image_base64, filename }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

async function logToAirtable(fields) {
  const apiKey = process.env.AIRTABLE_GROWMASTER_API_KEY;
  const baseId = process.env.AIRTABLE_GROWMASTER_BASE_ID;
  if (!apiKey || !baseId) {
    return { ok: false, reason: "not_configured" };
  }
  const r = await fetch(`https://api.airtable.com/v0/${baseId}/Field%20Photos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, data };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return res.status(400).json({ error: "invalid_body" });
  }

  const { image_base64, filename, zone, technician, note } = body;
  if (!image_base64) {
    return res.status(400).json({ error: "image_base64_required" });
  }
  const safeFilename = filename || "foto.jpg";

  let buffer;
  try {
    buffer = Buffer.from(image_base64, "base64");
  } catch (e) {
    return res.status(400).json({ error: "image_base64_invalid" });
  }

  // 1. Store the photo.
  const key = `field-photos/${Date.now()}-${safeFilename}`;
  let blob;
  try {
    blob = await put(key, buffer, { access: "public", addRandomSuffix: true });
  } catch (e) {
    console.error("upload-photo: blob put failed", e);
    return res.status(502).json({ error: "blob_upload_failed" });
  }

  // 2. Run the real coverage analyzer (forwards this same session so the
  //    downstream Python function's own auth check passes).
  const analysis = await callAnalyze(req.headers.cookie, req.headers.host, image_base64, safeFilename);
  const coveragePct = analysis.ok ? analysis.data.cobertura_verde_pct : null;

  // 3. Catalog it so Growmaster (and whoever reviews it) can always find it.
  const airtableResult = await logToAirtable({
    Photo: blob.url,
    Zone: zone || "",
    Technician: technician || "",
    Note: note || "",
    ...(coveragePct != null ? { "Coverage Pct": coveragePct / 100 } : {}),
    Status: "New",
    "Uploaded At": new Date().toISOString(),
  });

  return res.status(200).json({
    ok: true,
    photo_url: blob.url,
    coverage_pct: coveragePct,
    analysis_error: analysis.ok ? null : analysis.data,
    catalogued: airtableResult.ok,
    catalog_error: airtableResult.ok ? null : airtableResult.reason || airtableResult.data,
  });
};
