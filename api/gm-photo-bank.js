// api/gm-photo-bank.js - Serves the foundational field-photo bank
// (growmaster_lib/banco_fotos) from Vercel Blob instead of leaving the
// images as unauthenticated static files under public/. The blob store
// (growmaster-photos) is private, so uploads use access: "private".
// GET with no query -> list (filenames + manifest metadata, no blob URL).
// GET ?name=<filename> -> streams that one photo's bytes, fetched
// server-side with the store token (never exposed to the client).
// Merged list+file into one function to stay under the Hobby plan's
// 12-serverless-function-per-deployment limit.
const fs = require("fs");
const path = require("path");
const { put, list, get } = require("@vercel/blob");
const { hasValidSession } = require("../lib/session.js");

const PREFIX = "seed-photos/";
const BANK_DIR = path.join(__dirname, "..", "growmaster_lib", "banco_fotos");

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

async function handleList(req, res) {
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
}

async function handleFile(req, res, filename) {
  if (filename.includes("/") || filename.includes("..")) {
    return res.status(400).json({ error: "invalid_name" });
  }

  let result;
  try {
    result = await get(PREFIX + filename, { access: "private" });
  } catch (e) {
    console.error("gm-photo-bank/file: get failed", e);
    return res.status(502).json({ error: "blob_fetch_failed", detail: e.message });
  }
  if (!result) {
    return res.status(404).json({ error: "not_found" });
  }

  try {
    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    res.setHeader("Content-Type", result.blob.contentType || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).send(buf);
  } catch (e) {
    console.error("gm-photo-bank/file: stream read failed", e);
    return res.status(502).json({ error: "blob_fetch_failed" });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const name = req.query.name;
  if (name) {
    return handleFile(req, res, String(name));
  }
  return handleList(req, res);
};
