// lib/session.js - shared session cookie helpers for api/access.js and api/change-pin.js
const crypto = require("crypto");

const SESSION_MS = 30 * 60 * 1000;
const SECRET = process.env.ADMIN_KEY || process.env.ACCESS_SECRET || "";

function sign(text) {
  return crypto.createHmac("sha256", SECRET).update(text).digest("hex");
}

function makeSessionCookie() {
  const exp = Date.now() + SESSION_MS;
  const body = String(exp);
  const token = `${body}.${sign("s" + body)}`;
  return `pg2_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`;
}

function clearSessionCookie() {
  return "pg2_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
}

function hasValidSession(req) {
  const token = readCookie(req, "pg2_admin");
  if (!token) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  if (!timingSafeEqual(sign("s" + body), sig)) return false;
  return Number(body) > Date.now();
}

module.exports = { SESSION_MS, SECRET, sign, makeSessionCookie, clearSessionCookie, timingSafeEqual, readCookie, hasValidSession };
