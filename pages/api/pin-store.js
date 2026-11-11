// Almacenamiento centralizado del PIN (en producción sería una DB)
let currentPIN = process.env.ADMIN_PIN || '12345678';

function validatePIN(pin) {
  // Validar: 8 caracteres alfanuméricos
  const str = String(pin || '').trim();
  if (!/^[a-zA-Z0-9]{8}$/.test(str)) {
    return { valid: false, error: "PIN debe tener exactamente 8 caracteres alfanuméricos" };
  }
  return { valid: true };
}

function getPIN() {
  return currentPIN;
}

function setPIN(newPin) {
  const validation = validatePIN(newPin);
  if (!validation.valid) {
    return { ok: false, error: validation.error };
  }
  currentPIN = String(newPin).trim();
  return { ok: true };
}

module.exports = { getPIN, setPIN, validatePIN };
