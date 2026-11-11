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
from pydantic import BaseModel, Field, field_validator

from api.admin import require_admin
from db import write_json_atomic

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

# ------------------------------------------------------------
# Archivo de persistencia simple (JSON) en el directorio del backend
# ------------------------------------------------------------
BASE_DIR = pathlib.Path(__file__).parent.parent  # .../proyecto_web/backend
# La ruta se puede sobreescribir por entorno (SAKURA_ACCOUNTS_FILE) para que
# las pruebas usen un archivo temporal y NO borren las cuentas reales de la
# laptop (accounts.json es la fuente de verdad de los roles).
ACCOUNTS_FILE = pathlib.Path(
    os.getenv("SAKURA_ACCOUNTS_FILE") or (BASE_DIR / "accounts.json")
).expanduser()

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
    write_json_atomic(ACCOUNTS_FILE, data, mode=0o600)


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

    @field_validator("email")
    @classmethod
    def email_lower(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("rol")
    @classmethod
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
try:
    import bcrypt as _bcrypt
except ImportError:  # pragma: no cover - fallback si falta la dependencia
    _bcrypt = None


def _hash_password(password: str) -> str:
    """Hash con bcrypt (salt por password). Si bcrypt no está instalado,
    cae a pbkdf2_hmac con salt aleatorio — NUNCA a SHA-256 pelado."""
    if _bcrypt is not None:
        return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")
    import hashlib
    import hmac as _hmac
    import os as _os
    salt = _os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return "pbkdf2$" + salt.hex() + "$" + dk.hex()


def _verify_password(password: str, stored: str | None) -> bool:
    """Verifica contra bcrypt o, para cuentas viejas, contra SHA-256
    (hash migrable)."""
    if not stored:
        return False
    if stored.startswith("pbkdf2$"):
        import hashlib
        salt_hex, dk_hex = stored.split("$")[1:3]
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), 200_000)
        return _hmac_compare(dk.hex(), dk_hex)
    if stored.startswith("$2"):
        if _bcrypt is None:
            return False
        try:
            return _bcrypt.checkpw(password.encode("utf-8"), stored.encode("utf-8"))
        except ValueError:
            return False
    # Hash legacy SHA-256 (hex de 64)
    import hashlib
    if _hmac_compare(hashlib.sha256(password.encode("utf-8")).hexdigest(), stored):
        return True
    return False


def _hmac_compare(a: str, b: str) -> bool:
    import hmac as _hmac
    return _hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def _account_exists(email: str, accounts: dict) -> bool:
    return email in accounts


def rol_de_cuenta(email: str) -> str | None:
    """Rango vigente de una cuenta (accounts.json). None si no existe.

    Es la fuente de verdad de los roles: Postgres (`perfiles.rol`) es solo un
    espejo y puede quedar desactualizado.
    """
    key = str(email or "").strip().lower()
    if not key:
        return None
    acc = _load_accounts().get(key)
    if not isinstance(acc, dict):
        return None
    if acc.get("activo") is False:
        return None
    rol = str(acc.get("rol") or "").strip().lower()
    return rol or None


# ------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------

@router.get("/", response_model=dict)
def list_accounts(
    role_filter: str | None = None,
    _email: str = Depends(require_admin),
) -> dict:
    """Listar todas las cuentas, opcionalmente filtradas por rol.

    Solo admin (expone email/rol/nombre de todo el colegio).
    Nunca expone password_hash.
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


def _sync_rol_postgres(email: str, rol: str) -> bool:
    """Sincroniza el rango con la tabla `perfiles` de Postgres (best-effort).

    La fuente de verdad es `accounts.json`; Postgres es el espejo que usan
    los endpoints de tareas/exámenes/actividades. Si no hay base de datos
    configurada, no pasa nada (la app sigue funcionando en local-first).
    """
    try:
        from api import matricula as _mat  # lazy: evita cargar psycopg2 al importar

        q = _mat._query  # type: ignore[attr-defined]
        q("UPDATE perfiles SET rol = %s WHERE email = %s", (rol, email), fetch="none", commit=True)
        return True
    except Exception:
        return False


@router.post("/", response_model=dict, status_code=201)
def create_account(
    payload: AccountCreate,
    request: Request,
    _email_admin: str = Depends(require_admin),
) -> dict:
    """Crear una nueva cuenta de usuario. Solo un administrador.

    - El email debe ser único.
    - El rol se respeta tal cual lo elige el admin (siempre uno de
      ROLES_VALIDOS_BACKEND): el registro público NO pasa por acá, va por
      `/api/auth/register`, que fuerza siempre "estudiante".
    - La contraseña es OPCIONAL: si no viene, la cuenta queda sin contraseña y
      la persona la define en su primer ingreso
      (`POST /api/auth/definir-contrasena`).
    """
    accounts = _load_accounts()

    email = payload.email.strip().lower()
    if _account_exists(email, accounts):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una cuenta con ese correo electrónico.",
        )

    rol = payload.rol if payload.rol in ROLES_VALIDOS_BACKEND else "estudiante"
    hashed = _hash_password(payload.password) if payload.password else None

    account = {
        "email": email,
        "password_hash": hashed,
        "rol": rol,
        "nombre": payload.nombre,
        "activo": True,
        "semestre": payload.semestre,
        "creado": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }

    accounts[email] = account
    _save_accounts(accounts)

    # Espejo en Postgres (si hay base de datos): el rango tiene que coincidir
    # en los dos lados o los endpoints de tareas/exámenes ven otro rol.
    _sync_rol_postgres(email, rol)

    return {"ok": True, "account": {k: v for k, v in account.items() if k != "password_hash"}}


@router.put("/{email}", response_model=dict)
def update_account(
    email: str,
    payload: AccountUpdate,
    request: Request,
    _email_admin: str = Depends(require_admin),
) -> dict:
    """Actualizar rol y/or activo de una cuenta. Solo admin."""
    accounts = _load_accounts()

    target = email.strip().lower()
    if not _account_exists(target, accounts):
        raise HTTPException(status_code=404, detail="Cuenta no encontrada.")

    # Actualizar campos no nulos
    nuevo_rol: str | None = None
    if payload.rol is not None:
        # Validar que el nuevo rol sea válido
        if payload.rol not in ROLES_VALIDOS_BACKEND:
            raise HTTPException(status_code=400, detail="Rol inválido.")
        nuevo_rol = payload.rol
        accounts[target]["rol"] = payload.rol
    if payload.activo is not None:
        accounts[target]["activo"] = payload.activo
    if payload.nombre is not None:
        accounts[target]["nombre"] = payload.nombre
    if "semestre" in payload.model_fields_set:
        accounts[target]["semestre"] = payload.semestre

    # No dejar la plataforma sin ningún admin activo (misma protección que
    # en el borrado): si el único admin se degrada o se desactiva, el panel
    # de usuarios quedaría inaccesible para siempre.
    admin_count = sum(1 for v in accounts.values() if v.get("rol") == "admin" and v.get("activo"))
    if admin_count == 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No se puede quedar la plataforma sin ningún administrador activo.",
        )

    _save_accounts(accounts)

    # Espejo en Postgres (si hay base de datos): el rango tiene que coincidir
    # en los dos lados o los endpoints de tareas/exámenes ven otro rol.
    if nuevo_rol:
        _sync_rol_postgres(target, nuevo_rol)

    return {"ok": True, "account": {k: v for k, v in accounts[target].items() if k != "password_hash"}}


@router.delete("/{email}", status_code=204)
def delete_account(email: str, request: Request, _email_admin: str = Depends(require_admin)) -> None:
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