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
    _hash_password,
    _verify_password,
    ROLES_VALIDOS_BACKEND,
)
from audit import write as audit_write
from db import write_json_atomic

router = APIRouter(prefix="/api/auth", tags=["auth"])

BASE_DIR = Path(__file__).parent.parent  # .../proyecto_web/backend
# Directorio de datos (ver backend/paths.py): en el servidor Debian los
# archivos de sesión van fuera del repositorio (SAKURA_DATA_DIR).
# La ruta se puede sobreescribir por entorno (SAKURA_SESSIONS_FILE) para
# que las pruebas no toquen las sesiones reales de la laptop.
from paths import data_file  # noqa: E402

SESSIONS_FILE = data_file("sessions.json", "SAKURA_SESSIONS_FILE")

SESSION_TTL_SECONDS = 24 * 60 * 60  # 24 horas
SESSION_COOKIE = "cherrybomb_session"
SESSION_COOKIE_MAX_AGE = SESSION_TTL_SECONDS
SESSION_COOKIE_SECURE = os.getenv("SAKURA_COOKIE_SECURE", "1").strip().lower() in {"1", "true", "yes", "on"}

# SameSite de la cookie de sesión.
#   "lax"    (default) → el navegador NO manda la cookie cuando la app está
#             en otro origen (p.ej. GitHub Pages → http://127.0.0.1:8000).
#             Es lo correcto para el despliegue normal (mismo origen).
#   "none"             → obligatorio cuando el frontend (https) y el backend
#             (http://127.0.0.1) están en sitios distintos. Los navegadores
#             exigen "Secure" junto con "SameSite=None"; 127.0.0.1/localhost
#             son orígenes "potentially trustworthy", así que la cookie
#             funciona incluso sobre http.
#   "strict"           → la cookie nunca sale del sitio que la puso.
_SAMESITE_VALIDOS = {"lax", "strict", "none"}
_samesite = os.getenv("SAKURA_COOKIE_SAMESITE", "lax").strip().lower()
SESSION_COOKIE_SAMESITE = _samesite if _samesite in _SAMESITE_VALIDOS else "lax"
if SESSION_COOKIE_SAMESITE == "none":
    # Los navegadores rechazan SameSite=None sin Secure.
    SESSION_COOKIE_SECURE = True

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
    """Dependency: acepta Bearer (compat) o cookie HttpOnly cherrybomb_session.

    El rol que devuelve es el VIGENTE de la cuenta (accounts.json), no el que
    quedó congelado en la sesión: así una promoción o una baja de rango surte
    efecto de inmediato, sin obligar a volver a iniciar sesión.
    """
    token = _extraer_token(authorization) or (cherrybomb_session.strip() if cherrybomb_session else None)
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    sessions = _limpiar_expiradas(_load_sessions())
    s = sessions.get(token)
    if not s:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada")
    email = str(s.get("email") or "").strip().lower()
    rol = str(s.get("rol") or "estudiante")
    # Rol vigente + baja inmediata de cuentas desactivadas.
    try:
        acc = _load_accounts().get(email)
        if isinstance(acc, dict):
            if acc.get("activo") is False:
                sessions.pop(token, None)
                _save_sessions(sessions)
                raise HTTPException(
                    status_code=401,
                    detail="Tu cuenta fue desactivada. Contactá al administrador.",
                )
            rol = str(acc.get("rol") or rol)
    except HTTPException:
        raise
    except Exception:
        pass
    _save_sessions(sessions)
    return {"email": email, "rol": rol}


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


class DefinirContrasenaIn(BaseModel):
    email: str
    password: str = Field(..., min_length=6)

    @field_validator("email")
    @classmethod
    def email_lower(cls, v: str) -> str:
        return v.strip().lower()


@router.post("/definir-contrasena")
def definir_contrasena(request: Request, response: Response, payload: DefinirContrasenaIn = Body(...)):
    """Primer ingreso: define la contraseña de una cuenta que no tiene ninguna.

    Solo funciona para cuentas creadas por un administrador (o la cuenta
    semilla admin) que todavía no tienen `password_hash`. Si la cuenta ya
    tiene contraseña, se rechaza: el cambio de contraseña de una cuenta
    existente va por el flujo de recuperación, no por acá.
    """
    email = payload.email.strip().lower()
    accounts = _load_accounts()
    acc = accounts.get(email)
    if not isinstance(acc, dict):
        raise HTTPException(status_code=404, detail="No existe esa cuenta.")
    if acc.get("activo") is False:
        raise HTTPException(status_code=403, detail="La cuenta está desactivada.")
    if acc.get("password_hash"):
        raise HTTPException(
            status_code=409,
            detail="La cuenta ya tiene contraseña. Usá el flujo de recuperación.",
        )
    acc = dict(acc)
    acc["password_hash"] = _hash_password(payload.password)
    acc["password_creado"] = time.time()
    accounts[email] = acc
    _save_accounts(accounts)
    try:
        audit_write("auth.set_password", email, request.client.host if request.client else "")
    except Exception:
        pass
    # Se inicia sesión de una vez: el usuario no tiene que volver a escribirla.
    token = secrets.token_urlsafe(32)
    sessions = _limpiar_expiradas(_load_sessions())
    sessions[token] = {"email": email, "rol": acc.get("rol", "estudiante"), "creado": time.time()}
    _save_sessions(sessions)
    response.set_cookie(
        SESSION_COOKIE, token,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True, samesite=SESSION_COOKIE_SAMESITE,
        secure=SESSION_COOKIE_SECURE, path="/",
    )
    return {
        "ok": True,
        "token": token,
        "rol": acc.get("rol", "estudiante"),
        "nombre": acc.get("nombre", ""),
    }


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
    if not stored:
        # La cuenta fue creada por un administrador (o es la semilla admin) y
        # todavía no tiene contraseña: el usuario la define en su primer
        # ingreso (POST /api/auth/definir-contrasena).
        raise HTTPException(
            status_code=409,
            detail="PASSWORD_PENDIENTE: esta cuenta todavía no tiene contraseña. Definila para entrar.",
        )
    if not _verify_password(payload.password, stored):
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
        httponly=True, samesite=SESSION_COOKIE_SAMESITE,
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
            max_age=SESSION_COOKIE_MAX_AGE, httponly=True, samesite=SESSION_COOKIE_SAMESITE,
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
    # Se borra con los mismos atributos con los que se creó (name/domain/path
    # son los que definen el borrado; SameSite/Secure se mantienen por coherencia).
    response.delete_cookie(
        SESSION_COOKIE, path="/",
        secure=SESSION_COOKIE_SECURE, httponly=True, samesite=SESSION_COOKIE_SAMESITE,
    )
    return {"ok": True}
