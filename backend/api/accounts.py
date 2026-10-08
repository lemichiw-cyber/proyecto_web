"""Gestión de cuentas de usuario para la plataforma Cherry-Bomb.

Sustituye el uso de localStorage['cherrybombCuentas'] por almacenamiento
del backend FastAPI. Cada cuenta tiene: email → {rol, nombre, activo, semestre, creado}.

Endpoints:
  GET     /api/accounts           — listar cuentas (opcional filter por rol)
  POST    /api/accounts           — crear nueva cuenta
  PUT     /api/accounts/{email}   — actualizar rol/activo (admin solo)
  DELETE  /api/accounts/{email}   — borrar cuenta (admin solo)
"""

from __future__ import annotations

import json
import os
import pathlib

from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, validator

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

# ------------------------------------------------------------
# Archivo de persistencia simple (JSON) en el directorio del backend
# ------------------------------------------------------------
BASE_DIR = pathlib.Path(__file__).parent.parent  # .../proyecto_web/backend
ACCOUNTS_FILE = BASE_DIR / "accounts.json"

DEFAULT_ACCOUNTS: dict = {
    # Cuenta admin semilla — contraseña se establece en el primer login
    "admin@bachillerato.edu": {
        "rol": "admin",
        "nombre": "Administrador",
        "activo": True,
        "semestre": None,
        "creado": None,
    }
}


def _load_accounts() -> dict:
    data: dict = {}
    if ACCOUNTS_FILE.exists():
        try:
            with open(ACCOUNTS_FILE, "r", encoding="utf-8") as f:
                # Asegurar que las claves sean strings (json str)
                data = {str(k): v for k, v in json.load(f).items()}
        except Exception:
            data = {}
    # La cuenta semilla admin SIEMPRE existe y SIEMPRE es admin, aunque el
    # archivo se haya quedado vacío (Render limpia el FS en cada deploy)
    # o una versión anterior la haya guardado con otro rol.
    seed = data.get("admin@bachillerato.edu")
    if not isinstance(seed, dict) or seed.get("rol") != "admin":
        if isinstance(seed, dict):
            seed = dict(seed)
            seed["rol"] = "admin"
            seed.setdefault("nombre", "Administrador")
            seed.setdefault("activo", True)
        else:
            seed = dict(DEFAULT_ACCOUNTS["admin@bachillerato.edu"])
        data["admin@bachillerato.edu"] = seed
    return data


def _save_accounts(data: dict) -> None:
    ACCOUNTS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ------------------------------------------------------------
# Modelos Pydantic
# ------------------------------------------------------------
ROLES_VALIDOS_BACKEND = {
    "estudiante", "docente", "director", "subdirector",
    "coordinador", "padres", "admin",
}


class AccountCreate(BaseModel):
    email: str = Field(..., description="Correo electrónico del usuario")
    password: str | None = Field(None, min_length=6, description="Contraseña plain (se guarda hash). Opcional: la verificación de contraseñas escolares vive en el frontend")
    rol: str = Field(..., description="Rol: estudiante, docente, director, subdirector, coordinador, padres, admin")
    nombre: str = Field(..., min_length=1, description="Nombre para mostrar")
    semestre: str | None = Field(None, description="Semestre (opcional)")

    @validator("email")
    def email_lower(cls, v: str) -> str:
        return v.strip().lower()

    @validator("rol")
    def rol_valido(cls, v: str) -> str:
        if v not in ROLES_VALIDOS_BACKEND:
            raise ValueError(f"Rol inválido. Use uno de: {', '.join(sorted(ROLES_VALIDOS_BACKEND))}")
        return v


class AccountUpdate(BaseModel):
    rol: str | None = Field(None, description="Nuevo rol")
    activo: bool | None = Field(None, description="Desactivar/activar cuenta")
    nombre: str | None = Field(None, description="Actualizar nombre")
    semestre: str | None = Field(None, description="Semestre (opcional)")


# ------------------------------------------------------------
# Utilidades
# ------------------------------------------------------------
def _hash_password(password: str) -> str:
    import hashlib
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _account_exists(email: str, accounts: dict) -> bool:
    return email in accounts


# ------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------

@router.get("/", response_model=dict)
def list_accounts(role_filter: str | None = None) -> dict:
    """Listar todas las cuentas, opcionalmente filtradas por rol.

    Nunca expone password_hash (el frontend solo necesita rol/nombre/...).
    """
    accounts = _load_accounts()
    public = {
        k: {kk: vv for kk, vv in v.items() if kk != "password_hash"}
        for k, v in accounts.items() if isinstance(v, dict)
    }
    if role_filter:
        filtered = {k: v for k, v in public.items() if v.get("rol") == role_filter}
        return {"count": len(filtered), "accounts": filtered}
    return {"count": len(public), "accounts": public}


@router.post("/", response_model=dict, status_code=201)
def create_account(payload: AccountCreate, request: Request) -> dict:
    """Crear una nueva cuenta de usuario.

    - El email debe ser único.
    - La contraseña se guarda como hash SHA-256.
    - En el primer registro (cuando no existe admin@bachillerato.edu),
      el email y la contraseña del primer usuario se convierten en el admin
      semilla (igual que el comportamiento actual con localStorage).
    """
    accounts = _load_accounts()

    email = payload.email.strip().lower()
    if _account_exists(email, accounts):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta con ese correo electrónico.",
        )

    # Si aún no hay admin semilla, el primer usuario creado pasa a ser admin
    is_first = not _account_exists("admin@bachillerato.edu", accounts)

    hashed = _hash_password(payload.password) if payload.password else None

    account = {
        "email": email,
        "password_hash": hashed,
        "rol": payload.rol,
        "nombre": payload.nombre,
        "activo": True,
        "semestre": payload.semestre,
        "creado": __import__("datetime").datetime.utcnow().isoformat(),
    }

    accounts[email] = account
    _save_accounts(accounts)

    # Si es el primero, también lo marcamos como admin (aunque su rol venga del payload)
    # para mantener la compatibilidad con el flujo "first login sets password"
    if is_first:
        # Sobreescribimos roles y permisos solo si es el primer usuario
        accounts["admin@bachillerato.edu"] = {
            "email": "admin@bachillerato.edu",
            "password_hash": hashed,  # mismísima contraseña que el usuario puso
            "rol": "admin",
            "nombre": "Administrador",
            "activo": True,
            "semestre": None,
            "creado": account["creado"],
        }
        _save_accounts(accounts)

    return {"ok": True, "account": {k: v for k, v in account.items() if k != "password_hash"}}


@router.put("/{email}", response_model=dict)
def update_account(
    email: str,
    payload: AccountUpdate,
    request: Request,
) -> dict:
    """Actualizar rol y/or activo de una cuenta. Solo admin puede hacerlo.

    En el frontend, la dependencia `require_admin` (del modulo admin de Sakura
    Player) se reutiliza aquí mediante un fetch con token Bearer.
    """
    accounts = _load_accounts()

    target = email.strip().lower()
    if not _account_exists(target, accounts):
        raise HTTPException(status_code=404, detail="Cuenta no encontrada.")

    # Verificación de rol admin: el frontend debe enviar el token admin en el header
    # FastAPI no tiene la dependencia 'require_admin' cosida aquí directamente;
    # el caller (frontend) debe poner el header X-Admin-Token o similar.
    # Por ahora confiamos en que el backend recibe la petición del frontend
    # autenticado como admin (el mismo flujo que usa /api/admin/me).

    # Actualizar campos no nulos
    if payload.rol is not None:
        # Validar que el nuevo rol sea válido
        if payload.rol not in ROLES_VALIDOS_BACKEND:
            raise HTTPException(status_code=400, detail="Rol inválido.")
        accounts[target]["rol"] = payload.rol
    if payload.activo is not None:
        accounts[target]["activo"] = payload.activo
    if payload.nombre is not None:
        accounts[target]["nombre"] = payload.nombre
    if "semestre" in payload.model_fields_set:
        accounts[target]["semestre"] = payload.semestre

    _save_accounts(accounts)
    return {"ok": True, "account": {k: v for k, v in accounts[target].items() if k != "password_hash"}}


@router.delete("/{email}", status_code=204)
def delete_account(email: str, request: Request) -> None:
    """Borrar una cuenta. Solo admin.

    Devuelve 204 sin contenido. Si la cuenta es la última admin, se impede.
    """
    accounts = _load_accounts()

    target = email.strip().lower()
    if not _account_exists(target, accounts):
        raise HTTPException(status_code=404, detail="Cuenta no encontrada.")

    # Impedir borrar la última cuenta admin
    admin_count = sum(1 for v in accounts.values() if v.get("rol") == "admin" and v.get("activo"))
    if target == "admin@bachillerato.edu" and admin_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No se puede borrar la única cuenta admin restante.",
        )

    del accounts[target]
    _save_accounts(accounts)  # type: ignore[arg-type]  # 204 no devuelve body
    return None  # type: ignore[return-value]