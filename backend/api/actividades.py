"""Actividades — backend FastAPI + Postgres/Supabase.

Endpoints (todos exigen header X-User-Email):
  GET    /api/actividades        — listar actividades según rol
  POST   /api/actividades        — crear actividad (docente/admin/director)
  PUT    /api/actividades/{id}   — actualizar (owner o admin/director)
  DELETE /api/actividades/{id}   — eliminar (owner o admin/director)

El filtrado se hace en el servidor a partir del email autenticado
(cabecera X-User-Email, placeholder del JWT de Supabase Auth) y del rol
en tabla perfiles. Nunca se confía en datos enviados por el cliente.
"""

from __future__ import annotations

import os
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

try:
    import psycopg2
    from psycopg2.extras import DictCursor
except Exception:  # sin driver en dev local
    psycopg2 = None  # type: ignore
    DictCursor = None  # type: ignore

router = APIRouter(prefix="/api/actividades", tags=["actividades"])

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")


def _conn():
    if psycopg2 is None:
        raise HTTPException(status_code=503, detail="Falta driver psycopg2 en el backend")
    if not DATABASE_URL:
        raise HTTPException(status_code=503, detail="DATABASE_URL no configurada")
    return psycopg2.connect(DATABASE_URL)


def _query(sql: str, params: tuple = (), fetch: str = "all", commit: bool = False):
    with _conn() as conn:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute(sql, params)
            result = []
            if fetch == "one":
                row = cur.fetchone()
                result = dict(row) if row else None
            elif fetch == "none":
                result = []
            elif cur.description is not None:
                rows = cur.fetchall()
                result = [dict(r) for r in rows]
            else:
                result = []
        if commit:
            conn.commit()
    return result


def _perfil(email: str):
    try:
        return _query("SELECT id, rol FROM perfiles WHERE email = %s LIMIT 1", (email,), "one")
    except Exception:
        return None


def _require_email(x_user_email: str | None = Header(default=None)) -> str:
    if not x_user_email:
        raise HTTPException(status_code=401, detail="Falta cabecera X-User-Email")
    return x_user_email.strip().lower()


def _require_rol(email: str, roles: set[str]) -> dict:
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    if p["rol"] not in roles:
        raise HTTPException(status_code=403, detail="Rol insuficiente")
    return p


class ActividadIn(BaseModel):
    titulo: str = Field(..., min_length=1)
    descripcion: str = ""


@router.get("")
def listar_actividades(email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    # Cualquier rol autenticado ve todas las actividades (lectura abierta)
    sql = "SELECT id, titulo, descripcion, owner_id, created_at FROM actividades ORDER BY created_at DESC"
    return _query(sql)


@router.post("", status_code=201)
def crear_actividad(payload: ActividadIn, email: str = Depends(_require_email)):
    p = _require_rol(email, {"docente", "admin", "director", "subdirector", "coordinador"})
    if not payload.titulo.strip():
        raise HTTPException(status_code=400, detail="Título obligatorio")
    row = _query(
        "INSERT INTO actividades (titulo, descripcion, owner_id) VALUES (%s,%s,%s) RETURNING id, titulo, descripcion, owner_id, created_at",
        (payload.titulo.strip(), payload.descripcion, p["id"]),
        "one",
    )
    return row


@router.put("/{actividad_id}")
def actualizar_actividad(actividad_id: int, payload: ActividadIn, email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    # Verificar propiedad o rol admin
    row = _query("SELECT owner_id FROM actividades WHERE id = %s", (actividad_id,), "one")
    if not row:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    if p["rol"] not in {"admin", "director"} and row["owner_id"] != p["id"]:
        raise HTTPException(status_code=403, detail="No es propietario de la actividad")
    _query(
        "UPDATE actividades SET titulo = %s, descripcion = %s WHERE id = %s",
        (payload.titulo.strip(), payload.descripcion, actividad_id),
        commit=True,
    )
    return {"ok": True}


@router.delete("/{actividad_id}")
def eliminar_actividad(actividad_id: int, email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    row = _query("SELECT owner_id FROM actividades WHERE id = %s", (actividad_id,), "one")
    if not row:
        raise HTTPException(status_code=404, detail="Actividad no encontrada")
    if p["rol"] not in {"admin", "director"} and row["owner_id"] != p["id"]:
        raise HTTPException(status_code=403, detail="No es propietario de la actividad")
    _query("DELETE FROM actividades WHERE id = %s", (actividad_id,), commit=True)
    return {"ok": True}
