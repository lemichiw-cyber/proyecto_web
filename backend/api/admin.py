"""Modo administrador — acceso restringido a un correo y contraseña fijos.

Diseño (sin dependencias nuevas, solo la stdlib de Python):

* `POST /api/admin/login` valida las credenciales contra variables de
  entorno y devuelve un **token firmado con HMAC-SHA256** (no hace falta
  base de datos de sesiones ni librerías JWT).
* `GET /api/admin/me` y `GET /api/admin/stats` exigen ese token en la
  cabecera `Authorization: Bearer <token>`.
* Comparación de credenciales en tiempo constante (`hmac.compare_digest`)
  y limitador de intentos por IP para frenar fuerza bruta.

Credenciales por defecto (se pueden sobreescribir con variables de
entorno en Render — RECOMENDADO, porque el repo es público):

    SAKURA_ADMIN_EMAIL
    SAKURA_ADMIN_PASSWORD
    SAKURA_ADMIN_TOKEN_SECRET   (firma de los tokens; si no existe se
                                 deriva de la contraseña)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from api.deps import get_service

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_EMAIL = os.getenv("SAKURA_ADMIN_EMAIL", "sakuraenterprise2@gmail.com").strip().lower()
ADMIN_PASSWORD = os.getenv("SAKURA_ADMIN_PASSWORD", "MLRTJAH")

_TOKEN_TTL = 24 * 3600          # 24 horas
_MAX_ATTEMPTS = 5               # intentos fallidos...
_LOCK_SECONDS = 300             # ...por IP cada 5 minutos
_FAIL_DELAY = 0.4               # pausa anti-fuerza-bruta

# Intentos fallidos por IP: {ip: [ts, ...]} (en memoria, por proceso)
_attempts: dict[str, list[float]] = {}


# ------------------------------------------------------------------
# Tokens firmados (HMAC-SHA256) — formato  payloadB64.firmaB64
# ------------------------------------------------------------------
def _secret() -> bytes:
    """Secreto de firma: explícito o derivado de la contraseña."""
    configured = os.getenv("SAKURA_ADMIN_TOKEN_SECRET", "").strip()
    if configured:
        return configured.encode("utf-8")
    return hashlib.sha256(("sakura-admin:" + ADMIN_PASSWORD).encode("utf-8")).digest()


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign_token(email: str, now: float | None = None) -> str:
    """Firma un token con expiración para el correo dado."""
    ts = int(now if now is not None else time.time())
    payload = _b64e(json.dumps({"sub": email, "iat": ts, "exp": ts + _TOKEN_TTL}).encode("utf-8"))
    sig = _b64e(hmac.new(_secret(), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_token(token: str) -> str:
    """Devuelve el correo del token o lanza 401. Nunca lanza 500."""
    try:
        payload_b64, sig_b64 = (token or "").strip().split(".", 1)
        expected = hmac.new(_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64d(sig_b64)):
            raise ValueError("firma inválida")
        data = json.loads(_b64d(payload_b64))
        if int(data.get("exp", 0)) < time.time():
            raise HTTPException(status_code=401, detail="Sesión expirada: volvé a iniciar sesión")
        email = str(data.get("sub") or "")
        if email.lower() != ADMIN_EMAIL:
            raise ValueError("sujeto desconocido")
        return email
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001 — cualquier error de formato/firma → 401
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


def require_admin(authorization: str = Header(default="")) -> str:
    """Dependencia: exige `Authorization: Bearer <token>` válido."""
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Se requiere iniciar sesión como administrador")
    return verify_token(token.strip())


# ------------------------------------------------------------------
# Limitador de intentos por IP
# ------------------------------------------------------------------
def _client_ip(request: Request) -> str:
    # Render termina el TLS: el primer salto de X-Forwarded-For es el cliente
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "desconocida"


def _is_locked(ip: str) -> bool:
    now = time.time()
    hits = [t for t in _attempts.get(ip, []) if now - t < _LOCK_SECONDS]
    if hits:
        _attempts[ip] = hits
        return len(hits) >= _MAX_ATTEMPTS
    _attempts.pop(ip, None)
    return False


def _register_failure(ip: str) -> None:
    now = time.time()
    hits = [t for t in _attempts.get(ip, []) if now - t < _LOCK_SECONDS]
    hits.append(now)
    _attempts[ip] = hits


def _reset(ip: str) -> None:
    _attempts.pop(ip, None)


# ------------------------------------------------------------------
# Modelos
# ------------------------------------------------------------------
class LoginRequest(BaseModel):
    email: str = ""
    password: str = ""


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------
@router.post("/login")
def login(payload: LoginRequest, request: Request) -> dict:
    """Valida credenciales y devuelve un token de sesión (24 h)."""
    ip = _client_ip(request)
    if _is_locked(ip):
        raise HTTPException(
            status_code=429,
            detail="Demasiados intentos: esperá 5 minutos antes de reintentar",
        )

    email = (payload.email or "").strip().lower()
    password = payload.password or ""

    email_ok = hmac.compare_digest(email, ADMIN_EMAIL)
    pass_ok = hmac.compare_digest(password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8"))

    if not (email_ok and pass_ok):
        # Pausa corta + registro: frena fuerza bruta sin castigar al usuario
        # legítimo que tecleó mal una vez.
        time.sleep(_FAIL_DELAY)
        _register_failure(ip)
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")

    _reset(ip)
    return {
        "ok": True,
        "email": ADMIN_EMAIL,
        "token": sign_token(ADMIN_EMAIL),
        "token_type": "bearer",
        "expires_in": _TOKEN_TTL,
    }


@router.get("/me")
def me(email: str = Depends(require_admin)) -> dict:
    """Devuelve la sesión activa (para restaurarla al recargar la página)."""
    return {"ok": True, "email": email, "role": "admin"}


@router.get("/stats")
def stats(email: str = Depends(require_admin)) -> dict:
    """Información del backend reservada al administrador."""
    yt = get_service().health()
    return {
        "ok": True,
        "email": email,
        "ytmusic": yt,
        "authenticated": yt.get("authenticated", False),
        "session_ttl": _TOKEN_TTL,
        "locked_ips": len([v for v in _attempts.values() if len(v) >= _MAX_ATTEMPTS]),
    }
