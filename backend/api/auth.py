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

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from api.accounts import (
    _load_accounts,
    _save_accounts,
    _verify_password,
    ROLES_VALIDOS_BACKEND,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

BASE_DIR = Path(__file__).parent.parent  # .../proyecto_web/backend
SESSIONS_FILE = BASE_DIR / "sessions.json"

SESSION_TTL_SECONDS = 24 * 60 * 60  # 24 horas


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
    import json

    SESSIONS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _limpiar_expiradas(sessions: dict) -> dict:
    ahora = time.time()
    return {k: v for k, v in sessions.items() if ahora - float(v.get("creado", 0)) < SESSION_TTL_SECONDS}


def _extraer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization[7:]


def require_auth(authorization: Optional[str] = Header(default=None)) -> dict:
    """Dependency FastAPI: devuelve {email, rol} del token válido."""
    token = _extraer_token(authorization)
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
def register(payload: RegisterIn = Body(...)):
    email = payload.email.strip().lower()
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
    accounts[email] = account
    _save_accounts(accounts)

    return {"ok": True, "email": email, "rol": rol, "nombre": account["nombre"]}


@router.post("/login")
def login(payload: LoginIn = Body(...)):
    email = payload.email.strip().lower()
    accounts = _load_accounts()
    acc = accounts.get(email)
    if not acc or not acc.get("activo"):
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")

    stored = acc.get("password_hash")
    if not stored or not _verify_password(payload.password, stored):
        raise HTTPException(status_code=401, detail="Credenciales inválidas.")

    token = secrets.token_urlsafe(32)
    sessions = _limpiar_expiradas(_load_sessions())
    sessions[token] = {"email": email, "rol": acc["rol"], "creado": time.time()}
    _save_sessions(sessions)

    return {
        "ok": True,
        "token": token,
        "rol": acc["rol"],
        "nombre": acc.get("nombre", ""),
    }


@router.get("/me")
def me(user: dict = Depends(require_auth)):
    return {"ok": True, "email": user["email"], "rol": user["rol"]}


@router.post("/logout")
def logout(authorization: Optional[str] = Header(default=None)):
    token = _extraer_token(authorization)
    if token:
        sessions = _load_sessions()
        if token in sessions:
            del sessions[token]
            _save_sessions(sessions)
    return {"ok": True}
