// lib/session.js - shared session cookie helpers (api/access.js, change-pin.js, uploads).
// Cookie format: exp.role.uid.name.sig  (name = base64url, sig = HMAC-SHA256 of the first four parts)
//   role: "super" (Rodrigo) | "jefe" (jefe de cultivo) | "operario"
//   uid : Airtable record id of the employee, or "super"
// The same format is checked in middleware.js (Edge) and growmaster_lib/session_check.py.
const crypto = require("crypto");

const SESSION_MS = 30 * 60 * 1000;
const SECRET = process.env.ADMIN_KEY || process.env.ACCESS_SECRET || "";
const ROLES = ["super", "jefe", "operario"];

function sign(text) {
  return crypto.createHmac("sha256", SECRET).update(text).digest("hex");
}

// PIN fingerprint stored in Airtable (never the PIN itself). Same formula in api/ops-data.py.
function pinHash(pin) {
  return crypto.createHmac("sha256", SECRET).update("pin:" + String(pin)).digest("hex");
}

function b64u(s) {
  return Buffer.from(String(s), "utf8").toString("base64url");
}

function makeSessionCookie(role = "super", uid = "super", name = "Rodrigo") {
  if (!ROLES.includes(role)) throw new Error("bad role");
  const exp = Date.now() + SESSION_MS;
  const body = `${exp}.${role}.${String(uid).replace(/[^A-Za-z0-9_-]/g, "")}.${b64u(name || "")}`;
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

// Returns { role, uid, name } for a valid, unexpired session, else null.
function getSession(req) {
  if (!SECRET) return null;
  const token = readCookie(req, "pg2_admin");
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [exp, role, uid, nameB64, sig] = parts;
  if (!ROLES.includes(role)) return null;
  if (!timingSafeEqual(sign("s" + [exp, role, uid, nameB64].join(".")), sig)) return null;
  if (!(Number(exp) > Date.now())) return null;
  let name = "";
  try { name = Buffer.from(nameB64, "base64url").toString("utf8"); } catch (e) { /* ignore */ }
  return { role, uid, name };
}

function hasValidSession(req) {
  return getSession(req) !== null;
}

function hasRole(req, roles) {
  const s = getSession(req);
  return !!s && roles.includes(s.role);
}

module.exports = { SESSION_MS, SECRET, ROLES, sign, pinHash, makeSessionCookie, clearSessionCookie, timingSafeEqual, readCookie, getSession, hasValidSession, hasRole };
