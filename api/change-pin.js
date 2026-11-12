// api/change-pin.js - Actually rotates ADMIN_PIN, not just a UI mock.
//
// This is a static site with no database, so there's nowhere to persist a
// new PIN on its own. This endpoint calls the Vercel API directly to update
// the ADMIN_PIN environment variable and trigger a fresh deployment so the
// new value takes effect. It needs three env vars that must be set for it
// to work:
//   VERCEL_API_TOKEN  - a Vercel account/team token with write access
//                        (Vercel tokens are not scoped per-project, so this
//                        token can modify any project the account can reach
//                        - see the handoff notes for that tradeoff)
//   VERCEL_PROJECT_ID - this project's id (not secret)
//   VERCEL_TEAM_ID    - the team id that owns the project (not secret)
const { hasValidSession, timingSafeEqual } = require("../lib/session.js");

const VERCEL_API = "https://api.vercel.com";

function validatePinFormat(pin) {
  const str = String(pin || "").trim();
  if (!/^[A-Za-z0-9]{6,32}$/.test(str)) {
    return { valid: false, error: "El PIN debe tener entre 6 y 32 caracteres alfanuméricos." };
  }
  return { valid: true, value: str };
}

async function vercelFetch(path, options) {
  const r = await fetch(`${VERCEL_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options && options.headers),
    },
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (!hasValidSession(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { VERCEL_API_TOKEN, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } = process.env;
  if (!VERCEL_API_TOKEN || !VERCEL_PROJECT_ID || !VERCEL_TEAM_ID) {
    console.error("change-pin: VERCEL_API_TOKEN/VERCEL_PROJECT_ID/VERCEL_TEAM_ID not configured");
    return res.status(500).json({
      error: "not_configured",
      message: "El cambio de PIN automático no está activado todavía: falta configurar el acceso a la API de Vercel. Pídeselo a Claude.",
    });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    return res.status(400).json({ error: "invalid_body" });
  }

  const { currentPin, newPin, confirmPin } = body || {};
  const adminPin = process.env.ADMIN_PIN;

  if (!currentPin || !newPin || !confirmPin) {
    return res.status(400).json({ error: "missing_fields", message: "Todos los campos son requeridos." });
  }
  if (!adminPin) {
    return res.status(500).json({ error: "server_not_configured" });
  }
  if (!timingSafeEqual(currentPin, adminPin)) {
    return res.status(401).json({ error: "invalid_current_pin", message: "PIN actual incorrecto." });
  }
  if (newPin !== confirmPin) {
    return res.status(400).json({ error: "mismatch", message: "Los PINs nuevos no coinciden." });
  }
  const format = validatePinFormat(newPin);
  if (!format.valid) {
    return res.status(400).json({ error: "bad_format", message: format.error });
  }
  if (timingSafeEqual(format.value, adminPin)) {
    return res.status(400).json({ error: "same_pin", message: "El PIN nuevo es igual al actual." });
  }

  // 1. Update the env var (upsert replaces the existing value for this key).
  const envUpdate = await vercelFetch(
    `/v10/projects/${VERCEL_PROJECT_ID}/env?teamId=${VERCEL_TEAM_ID}&upsert=true`,
    {
      method: "POST",
      body: JSON.stringify({
        key: "ADMIN_PIN",
        value: format.value,
        type: "sensitive",
        target: ["production"],
        comment: "PIN rotated from the admin dashboard's Change PIN form",
      }),
    }
  );
  if (!envUpdate.ok) {
    console.error("change-pin: env update failed", envUpdate.status, envUpdate.data);
    return res.status(502).json({ error: "vercel_env_update_failed", message: "No se pudo actualizar la variable en Vercel." });
  }

  // 2. Trigger a fresh deployment so the function picks up the new value
  //    (Vercel env var changes don't apply to already-running functions).
  const deploy = await vercelFetch(`/v13/deployments?teamId=${VERCEL_TEAM_ID}&skipAutoDetectionConfirmation=1`, {
    method: "POST",
    body: JSON.stringify({
      name: "plantguard-pro-claude-2-admin",
      project: VERCEL_PROJECT_ID,
      target: "production",
      gitSource: { type: "github", org: "rodrigodiazv", repo: "plantguard-pro-claude-2-admin", ref: "main" },
    }),
  });
  if (!deploy.ok) {
    console.error("change-pin: deployment trigger failed", deploy.status, deploy.data);
    return res.status(200).json({
      ok: true,
      warning: "pin_saved_deploy_failed",
      message: "El PIN se guardó, pero no se pudo disparar el redeploy automático. Puede tardar en aplicarse hasta el próximo deploy.",
    });
  }

  return res.status(200).json({
    ok: true,
    message: "PIN actualizado. Tarda unos 30-60 segundos en aplicarse (se está redesplegando). Vuelve a iniciar sesión después con el PIN nuevo.",
  });
};
