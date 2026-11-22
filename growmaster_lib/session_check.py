# growmaster_lib/session_check.py - Python mirror of lib/session.js's cookie check.
# Cookie: exp.role.uid.name.sig (name = base64url). See lib/session.js.
import base64
import hashlib
import hmac
import os
import time
from urllib.parse import unquote

ROLES = ("super", "jefe", "operario")


def _secret():
    return os.environ.get("ADMIN_KEY") or os.environ.get("ACCESS_SECRET") or ""


def _sign(text, secret):
    return hmac.new(secret.encode("utf-8"), text.encode("utf-8"), hashlib.sha256).hexdigest()


def pin_hash(pin):
    """PIN fingerprint stored in Airtable PersonalCampo.PinHash (same formula as lib/session.js)."""
    return _sign("pin:" + str(pin), _secret())


def get_session(cookie_header):
    """Return {"role","uid","name"} for a valid, unexpired session, else None."""
    if not cookie_header:
        return None
    cookies = {}
    for part in cookie_header.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            cookies[k] = v
    token = cookies.get("pg2_admin")
    secret = _secret()
    if not token or not secret:
        return None
    parts = unquote(token).split(".")
    if len(parts) != 5:
        return None
    exp, role, uid, name_b64, sig = parts
    if role not in ROLES:
        return None
    if not hmac.compare_digest(_sign("s" + ".".join((exp, role, uid, name_b64)), secret), sig):
        return None
    try:
        if int(exp) <= int(time.time() * 1000):
            return None
    except ValueError:
        return None
    try:
        name = base64.urlsafe_b64decode(name_b64 + "=" * (-len(name_b64) % 4)).decode("utf-8")
    except Exception:  # noqa: BLE001
        name = ""
    return {"role": role, "uid": uid, "name": name}


def has_valid_session(cookie_header):
    return get_session(cookie_header) is not None
