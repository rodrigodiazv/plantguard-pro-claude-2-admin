import { createHmac, randomBytes } from "crypto";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SECRET = process.env.ACCESS_SECRET || process.env.access_secret || "";
if (SECRET.length < 32) {
  throw new Error("access_secret must be at least 32 characters.");
}
const SESSION_MS = 30 * 60 * 1000;

function randomChars(n) {
  const bytes = randomBytes(n);
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHA[bytes[i] % ALPHA.length];
  return out;
}

function sign(text) {
  return createHmac("sha256", SECRET).update(text).digest("hex").slice(0, 16).toUpperCase();
}

export function makeCode() {
  const id = randomChars(8);
  return `${id}-${sign(id).slice(0, 6)}`;
}

export function parseCode(raw) {
  const code = String(raw || "").trim().toUpperCase();
  const m = code.match(/^([A-Z0-9]{8})-([A-Z0-9]{6})$/);
  if (!m) return null;
  return sign(m[1]).slice(0, 6) === m[2] ? m[1] : null;
}

export function makeSession() {
  const exp = Date.now() + SESSION_MS;
  const body = String(exp);
  return `${body}.${sign("s" + body)}`;
}

export function checkSession(token) {
  if (!token) return false;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return false;
  if (sign("s" + body) !== sig) return false;
  return Number(body) > Date.now();
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  const hit = raw.split(";").map((c) => c.trim()).find((c) => c.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : "";
}

export { SESSION_MS };
