# growmaster_lib/session_check.py - Python mirror of lib/session.js's cookie
# check, so the Python api/gm-*.py functions enforce the same admin PIN
# session as the JS ones, without needing a cross-language call.
import hmac
import hashlib
import os
import time
from urllib.parse import unquote


def _secret():
    return os.environ.get("ADMIN_KEY") or os.environ.get("ACCESS_SECRET") or ""


def _sign(text, secret):
    return hmac.new(secret.encode("utf-8"), text.encode("utf-8"), hashlib.sha256).hexdigest()


def has_valid_session(cookie_header):
    if not cookie_header:
        return False
    cookies = {}
    for part in cookie_header.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            cookies[k] = v
    token = cookies.get("pg2_admin")
    if not token:
        return False
    token = unquote(token)
    if "." not in token:
        return False
    body, sig = token.rsplit(".", 1)
    secret = _secret()
    if not secret:
        return False
    expected = _sign("s" + body, secret)
    if not hmac.compare_digest(expected, sig):
        return False
    try:
        exp = int(body)
    except ValueError:
        return False
    return exp > int(time.time() * 1000)
