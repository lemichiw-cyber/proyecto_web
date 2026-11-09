"""Autenticación de sesiones — backend FastAPI.

Endpoints:
  POST   /api/auth/register  — crear cuenta (público, rol forzado a estudiante)
  POST   /api/auth/login     — verificar credenciales, devuelve token de sesión
  GET    /api/auth/me        — validar token y devolver usuario
  POST   /api/auth/logout    — invalidar token

Las sesiones viven en backend/sessions.json (misma estrategia de archivo
que accounts.py). El token se envía como header Authorization: Bearer <token>.
"""

from __future__ import annotations

import os
import secrets
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Cookie, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator

from api.accounts import (
    _load_accounts,
    _save_accounts,
    _verify_password,
    ROLES_VALIDOS_BACKEND,
)
from audit import write as audit_write
from db import write_json_atomic

router = APIRouter(prefix="/api/auth", tags=["auth"])

BASE_DIR = Path(__file__).parent.parent  # .../proyecto_web/backend
SESSIONS_FILE = BASE_DIR / "sessions.json"

SESSION_TTL_SECONDS = 24 * 60 * 60  # 24 horas
SESSION_COOKIE = "cherrybomb_session"
SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS
SESSION_COOKIE_SECURE = os.getenv("SAKURA_COOKIE_SECURE", "1").strip().lower() in {"1", "true", "yes", "on"}

# --- Rate limiting mínimo en memoria (P0: evita brute-force de login) ---
# No es distribuido: bien para 1 instancia (despliegue único INCOA). Para P1, Redis/DB.
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_MAX = 5
_LOGIN_WINDOW = 300  # 5 min

def _check_rate_limit(client_ip: str, email_l: str) -> None:
    now = time.time()
    key = f"{client_ip}:{email_l}"
    lst = [t for t in _LOGIN_ATTEMPTS.get(key, []) if now - t < _LOGIN_WINDOW]
    if len(lst) >= _LOGIN_MAX:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Esperá 5 minutos.")
    # NO se registra intento aquí: solo se cuentan fallos (evita castigarclide legítimo y tests que hacen logins OK)


def _record_failed_attempt(client_ip: str, email_l: str) -> None:
    now = time.time()
    key = f"{client_ip}:{email_l}"
    lst = [t for t in _LOGIN_ATTEMPTS.get(key, []) if now - t < _LOGIN_WINDOW]
    lst.append(now)
    _LOGIN_ATTEMPTS[key] = lst


def _clear_attempts(client_ip: str, email_l: str) -> None:
    _LOGIN_ATTEMPTS.pop(f"{client_ip}:{email_l}", None)


def _load_sessions() -> dict:
    if not SESSIONS_FILE.exists():
        return {}
    try:
        import json

        with open(SESSIONS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_sessions(data: dict) -> None:
    write_json_atomic(SESSIONS_FILE, data, mode=0o600)


def _touch_session(token: str) -> None:
    """Ventana deslizante P3: extiende la sesión a 24h desde el último uso."""
    if not token:
        return
    try:
        sessions = _limpiar_expiradas(_load_sessions())
        if token in sessions:
            sessions[token]["creado"] = time.time()
            _save_sessions(sessions)
    except Exception:
        pass


def _limpiar_expiradas(sessions: dict) -> dict:
    ahora = time.time()
    return {k: v for k, v in sessions.items() if ahora - float(v.get("creado", 0)) < SESSION_TTL_SECONDS}


def _extraer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization[7:]


def require_auth(authorization: Optional[str] = Header(default=None), cherrybomb_session: Optional[str] = Cookie(default=None)) -> dict:
    """Dependency: acepta Bearer (compat) o cookie HttpOnly cherrybomb_session."""
    token = _extraer_token(authorization) or (cherrybomb_session.strip() if cherrybomb_session else None)
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    sessions = _limpiar_expiradas(_load_sessions())
    s = sessions.get(token)
    if not s:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    _save_sessions(sessions)
    return {"email": s["email"], "rol": s["rol"]}


class RegisterIn(BaseModel):
    email: str
    nombre: str = ""
    password: str = Field(..., min_length=6)
    rol: str = "estudiante"
    grupo_id: int | None = None

    @field_validator("email")
    @classmethod
    def email_lower(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("rol")
    @classmethod
    def rol_valido(cls, v: str) -> str:
        return v if v in ROLES_VALIDOS_BACKEND else "estudiante"


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_lower(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/register", status_code=201)
def register(request: Request, payload: RegisterIn = Body(...)):
    email = payload.email.strip().lower()
    _check_rate_limit(request.client.host if request.client else "unknown", email)
    accounts = _load_accounts()
    if email in accounts:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con ese correo.")

    # El registro público siempre es estudiante (el rol no se puede autoasignar)
    rol = "estudiante"

    import hashlib
    import os as _os
    salt = _os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", payload.password.encode("utf-8"), salt, 200_000)
    password_hash = "pbkdf2$" + salt.hex() + "$" + dk.hex()

    import datetime
    creado = datetime.datetime.now(datetime.timezone.utc).isoformat()

    account = {
        "email": email,
        "password_hash": password_hash,
        "rol": rol,
        "nombre": payload.nombre or email.split("@")[0],
        "activo": True,
        "semestre": None,
        "creado": creado,
    }
    if getattr(payload, "grupo_id", None) is not None:
        try:
            account["grupo_id"] = int(payload.grupo_id)
        except Exception:
            pass
    accounts[email] = account
    _save_accounts(accounts)
    # Si hay Postgres, crear fila estudiante con el grupo elegido (best-effort)
    if getattr(payload, "grupo_id", None) is not None:
        try:
            from api import matricula as _mat  # lazy
            _q_mat = _mat._query  # type: ignore
        except Exception:
            _q_mat = None
        try:
            if _q_mat is not None:
                _q_mat("INSERT INTO estudiantes (nombre, email, grupo_id) VALUES (%s,%s,%s) ON CONFLICT (email) DO UPDATE SET grupo_id = EXCLUDED.grupo_id",
                       (account["nombre"], email, int(payload.grupo_id)), fetch="none", commit=True)
        except Exception:
            pass
    try:
        audit_write("auth.register", email, request.client.host if request.client else "")
    except Exception:
        pass
    return {"ok": True, "email": email, "rol": rol, "nombre": account["nombre"]}


@router.post("/login")
def login(request: Request, response: Response, payload: LoginIn = Body(...)):
    email = payload.email.strip().lower()
    _ip = request.client.host if request.client else "unknown"
    _check_rate_limit(_ip, email)
    accounts = _load_accounts()
    acc = accounts.get(email)
    if not acc or not acc.get("activo"):
        _record_failed_attempt(_ip, email)
        try:
            audit_write("auth.login_fail", email, _ip)
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")

    stored = acc.get("password_hash")
    if not stored or not _verify_password(payload.password, stored):
        _record_failed_attempt(_ip, email)
        try:
            audit_write("auth.login_fail", email, _ip)
        except Exception:
            pass
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")
    _clear_attempts(_ip, email)
    try:
        audit_write("auth.login_ok", email, _ip)
    except Exception:
        pass

    token = secrets.token_urlsafe(32)
    sessions = _limpiar_expiradas(_load_sessions())
    sessions[token] = {"email": email, "rol": acc["rol"], "creado": time.time()}
    _save_sessions(sessions)
    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True, samesite="lax",
        secure=SESSION_COOKIE_SECURE, path="/",
    )
    return {
        "ok": True,
        "token": token,
        "rol": acc["rol"],
        "nombre": acc.get("nombre", ""),
    }


@router.get("/me")
def me(response: Response, user: dict = Depends(require_auth), cherrybomb_session: Optional[str] = Cookie(default=None), authorization: Optional[str] = Header(default=None)):
    token = _extraer_token(authorization) or (cherrybomb_session.strip() if cherrybomb_session else None)
    nuevo_token = token
    if token:
        # P5-B: rotación — invalida el token viejo y emite uno nuevo (ventana deslizante + rotación)
        try:
            sessions = _limpiar_expiradas(_load_sessions())
            if token in sessions:
                data = sessions.pop(token)
                nuevo_token = secrets.token_urlsafe(32)
                sessions[nuevo_token] = {"email": data.get("email", user["email"]), "rol": data.get("rol", user["rol"]), "creado": time.time()}
                _save_sessions(sessions)
        except Exception:
            nuevo_token = token
        response.set_cookie(
            SESSION_COOKIE, nuevo_token,
            max_age=SESSION_COOKIE_MAX_AGE, httponly=True, samesite="lax",
            secure=SESSION_COOKIE_SECURE, path="/",
        )
    return {"ok": True, "email": user["email"], "rol": user["rol"], "token_nuevo": nuevo_token}


@router.post("/logout")
def logout(response: Response, authorization: Optional[str] = Header(default=None), cherrybomb_session: Optional[str] = Cookie(default=None)):
    token = _extraer_token(authorization) or (cherrybomb_session.strip() if cherrybomb_session else None)
    if token:
        sessions = _load_sessions()
        if token in sessions:
            _email = sessions[token].get("email", "")
            del sessions[token]
            _save_sessions(sessions)
            try:
                audit_write("auth.logout", _email, "")
            except Exception:
                pass
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}
