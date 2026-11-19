// api/gm-photo-bank/index.js - Serves the foundational field-photo bank
// (growmaster_lib/banco_fotos) from Vercel Blob instead of leaving the
// images as unauthenticated static files under public/. The blob store
// (growmaster-photos) is private, so uploads use access: "private" and
// the list response returns filenames only (no direct blob URL - those
// require the store token to fetch). The browser gets each image's bytes
// through file.js, which is session-gated like this endpoint.
const fs = require("fs");
const path = require("path");
const { put, list } = require("@vercel/blob");
const { hasValidSession } = require("../../lib/session.js");

const PREFIX = "seed-photos/";
const BANK_DIR = path.join(__dirname, "..", "..", "growmaster_lib", "banco_fotos");

function parseManifest() {
  const csv = fs.readFileSync(path.join(BANK_DIR, "manifest.csv"), "utf8");
  const [header, ...lines] = csv.trim().split("\n");
  const cols = header.split(",");
  const rows = {};
  for (const line of lines) {
    const vals = line.split(",");
    const row = {};
    cols.forEach((c, i) => { row[c] = vals[i] || ""; });
    rows[row.archivo] = row;
  }
  return rows;
}

async function seedIfEmpty() {
  const existing = await list({ prefix: PREFIX });
  if (existing.blobs.length > 0) return existing.blobs;

  const manifest = parseManifest();
  const fotosDir = path.join(BANK_DIR, "fotos");
  const files = fs.readdirSync(fotosDir).filter(f => manifest[f]);
  const uploaded = [];
  for (const file of files) {
    const buf = fs.readFileSync(path.join(fotosDir, file));
    const blob = await put(PREFIX + file, buf, { access: "private", addRandomSuffix: false });
    uploaded.push(blob);
  }
  return uploaded;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let blobs;
  try {
    blobs = await seedIfEmpty();
  } catch (e) {
    console.error("gm-photo-bank: seed/list failed", e);
    return res.status(502).json({ error: "blob_list_failed", detail: e.message });
  }

  let manifest = {};
  try { manifest = parseManifest(); } catch (e) { /* metadata is best-effort */ }

  const photos = blobs.map(b => {
    const filename = b.pathname.replace(PREFIX, "");
    const meta = manifest[filename] || {};
    return {
      filename,
      entorno: meta.entorno || "",
      fase: meta.fase || "",
      vista: meta.vista || "",
      fecha: meta.fecha || "",
      origen: meta.origen || "",
    };
  });

  return res.status(200).json({ ok: true, count: photos.length, photos });
};
