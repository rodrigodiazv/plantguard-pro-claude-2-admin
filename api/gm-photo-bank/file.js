// api/gm-photo-bank/file.js - Streams one photo from the private blob
// store (growmaster-photos) to the browser, gated by the same admin
// session as the rest of the panel. The blob's own URL needs the store
// token to resolve for a private store, so this proxies the fetch
// instead of exposing that token or the raw blob URL to the client.
const { list } = require("@vercel/blob");
const { hasValidSession } = require("../../lib/session.js");

const PREFIX = "seed-photos/";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const filename = String(req.query.name || "");
  if (!filename || filename.includes("/") || filename.includes("..")) {
    return res.status(400).json({ error: "invalid_name" });
  }

  let blobs;
  try {
    blobs = (await list({ prefix: PREFIX })).blobs;
  } catch (e) {
    console.error("gm-photo-bank/file: list failed", e);
    return res.status(502).json({ error: "blob_list_failed" });
  }

  const match = blobs.find(b => b.pathname === PREFIX + filename);
  if (!match) {
    return res.status(404).json({ error: "not_found" });
  }

  try {
    const r = await fetch(match.url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    });
    if (!r.ok) {
      return res.status(502).json({ error: "blob_fetch_failed", status: r.status });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).send(buf);
  } catch (e) {
    console.error("gm-photo-bank/file: fetch failed", e);
    return res.status(502).json({ error: "blob_fetch_failed" });
  }
};
