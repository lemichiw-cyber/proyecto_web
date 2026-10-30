"""Tareas y exámenes por grupo — backend FastAPI + Postgres/Supabase.

Se guarda cada ítem (tarea/examen) y sus asignaciones a grupos.
Todo el filtrado se hace en el servidor a partir del email autenticado
(cabecera X-User-Email, placeholder del JWT de Supabase Auth) y del rol
en tabla perfiles. Nunca se confía en grupo_id enviado por el cliente.

Endpoints:
  GET    /api/items/tareas        — tareas visibles según grupo del usuario
  POST   /api/items/tareas        — crear tarea + asignar a grupos (docente/admin)
  GET    /api/items/examenes      — exámenes visibles según grupo
  POST   /api/items/examenes      — crear examen + asignar a grupos (docente/admin)
"""
from __future__ import annotations

import os
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field, field_validator

try:
    import psycopg2
    from psycopg2.extras import DictCursor, Json
except Exception:  # sin driver en dev local
    psycopg2 = None  # type: ignore
    DictCursor = None  # type: ignore
    Json = None  # type: ignore

router = APIRouter(prefix="/api/items", tags=["items"])

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS tareas (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  materia TEXT DEFAULT '',
  fecha TEXT DEFAULT '',
  owner_id UUID REFERENCES auth.users(id),
  creado TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS examenes (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  tiempo INTEGER DEFAULT 60,
  preguntas JSONB DEFAULT '[]',
  notamin INTEGER DEFAULT 60,
  intentos INTEGER DEFAULT 3,
  barajar BOOLEAN DEFAULT false,
  owner_id UUID REFERENCES auth.users(id),
  creado TIMESTAMPTZ DEFAULT now()
);
"""

def _conn():
    if psycopg2 is None:
        raise HTTPException(status_code=503, detail="Falta driver psycopg2 en el backend")
    if not DATABASE_URL:
        raise HTTPException(status_code=503, detail="DATABASE_URL no configurada")
    return psycopg2.connect(DATABASE_URL)

def _init():
    try:
        with _conn() as conn:
            with conn.cursor() as cur:
                cur.execute(_SCHEMA)
            conn.commit()
    except Exception:
        pass  # si no hay BD, los endpoints fallan con 503 al usarse

def _query(sql: str, params: tuple = (), fetch: str = "all", commit: bool = False):
    with _conn() as conn:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute(sql, params)
            if fetch == "one":
                row = cur.fetchone()
                return dict(row) if row else None
            rows = cur.fetchall()
            return [dict(r) for r in rows]
        if commit:
            conn.commit()
    return []

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

class TareaIn(BaseModel):
    titulo: str = Field(..., min_length=1)
    descripcion: str = ""
    materia: str = ""
    fecha: str = ""
    grupo_ids: list[int] = Field(default_factory=list)

class ExamenIn(BaseModel):
    titulo: str = Field(..., min_length=1)
    tiempo: int = 60
    preguntas: list = Field(default_factory=list)
    notamin: int = 60
    intentos: int = 3
    barajar: bool = False
    grupo_ids: list[int] = Field(default_factory=list)

    @field_validator("tiempo")
    @classmethod
    def _tiempo_positivo(cls, v: int) -> int:
        if v < 1 or v > 480:
            raise ValueError("El tiempo debe estar entre 1 y 480 minutos")
        return v

    @field_validator("notamin")
    @classmethod
    def _notamin_rango(cls, v: int) -> int:
        if v < 0 or v > 100:
            raise ValueError("La nota mínima debe estar entre 0 y 100")
        return v

    @field_validator("intentos")
    @classmethod
    def _intentos_positivo(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Los intentos deben ser al menos 1")
        return v

    @field_validator("preguntas")
    @classmethod
    def _preguntas_validas(cls, v: list) -> list:
        if not v:
            raise ValueError("El examen debe tener al menos una pregunta")
        for i, p in enumerate(v):
            if not isinstance(p, dict) or not str(p.get("texto", "")).strip():
                raise ValueError(f"Pregunta {i + 1}: texto obligatorio")
            tipo = str(p.get("tipo", "multiple"))
            if tipo == "completar" and not str(p.get("respuesta", "")).strip():
                raise ValueError(f"Pregunta {i + 1}: respuesta correcta obligatoria")
            if tipo in ("multiple", "vf") and p.get("correcta") is None:
                raise ValueError(f"Pregunta {i + 1}: respuesta correcta obligatoria")
        return v

def _grupos_validos(docente_id, grupo_ids):
    """Devuelve True si todos los grupo_ids pertenecen al docente."""
    if not grupo_ids:
        return False
    rows = _query(
        "SELECT grupo_id FROM docente_grupo WHERE docente_id = %s AND grupo_id = ANY(%s)",
        (docente_id, grupo_ids),
    )
    return {r["grupo_id"] for r in rows} == set(grupo_ids)

@router.get("/tareas")
def listar_tareas(email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    rol = p["rol"]; uid = p["id"]
    if rol in {"admin", "director"}:
        sql = "SELECT t.*, a.grupo_id FROM tareas t LEFT JOIN asignaciones a ON a.tipo='tarea' AND a.item_id=t.id"
        return _query(sql)
    if rol == "docente":
        sql = """
            SELECT DISTINCT t.*, a.grupo_id FROM tareas t
            JOIN asignaciones a ON a.tipo='tarea' AND a.item_id=t.id
            JOIN docente_grupo dg ON dg.grupo_id = a.grupo_id AND dg.docente_id = %s
        """
        return _query(sql, (uid,))
    # estudiante: solo tareas asignadas a su grupo
    sql = """
        SELECT DISTINCT t.*, a.grupo_id FROM tareas t
        JOIN asignaciones a ON a.tipo='tarea' AND a.item_id=t.id
        JOIN estudiantes e ON e.grupo_id = a.grupo_id
        JOIN perfiles pf ON pf.email = e.email
        WHERE pf.id = %s
    """
    return _query(sql, (uid,))

@router.post("/tareas", status_code=201)
def crear_tarea(payload: TareaIn, email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    if p["rol"] not in {"docente", "admin", "director"}:
        raise HTTPException(status_code=403, detail="Solo docentes crean tareas")
    if not payload.titulo.strip():
        raise HTTPException(status_code=400, detail="Título obligatorio")
    uid = p["id"]
    if p["rol"] == "docente" and not _grupos_validos(uid, payload.grupo_ids):
        raise HTTPException(status_code=403, detail="Grupo no autorizado para este docente")
    row = _query(
        "INSERT INTO tareas (titulo, descripcion, materia, fecha, owner_id) VALUES (%s,%s,%s,%s,%s) RETURNING id",
        (payload.titulo.strip(), payload.descripcion, payload.materia, payload.fecha, uid),
        "one",
    )
    item_id = row["id"]
    for gid in payload.grupo_ids:
        _query(
            "INSERT INTO asignaciones (tipo, item_id, grupo_id) VALUES ('tarea', %s, %s) ON CONFLICT DO NOTHING",
            (item_id, gid),
            commit=True,
        )
    return {"ok": True, "id": item_id}

@router.get("/examenes")
def listar_examenes(email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    rol = p["rol"]; uid = p["id"]
    if rol in {"admin", "director"}:
        sql = "SELECT e.*, a.grupo_id FROM examenes e LEFT JOIN asignaciones a ON a.tipo='examen' AND a.item_id=e.id"
        return _query(sql)
    if rol == "docente":
        sql = """
            SELECT DISTINCT e.*, a.grupo_id FROM examenes e
            JOIN asignaciones a ON a.tipo='examen' AND a.item_id=e.id
            JOIN docente_grupo dg ON dg.grupo_id = a.grupo_id AND dg.docente_id = %s
        """
        return _query(sql, (uid,))
    sql = """
        SELECT DISTINCT e.*, a.grupo_id FROM examenes e
        JOIN asignaciones a ON a.tipo='examen' AND a.item_id=e.id
        JOIN estudiantes est ON est.grupo_id = a.grupo_id
        JOIN perfiles pf ON pf.email = est.email
        WHERE pf.id = %s
    """
    return _query(sql, (uid,))

@router.post("/examenes", status_code=201)
def crear_examen(payload: ExamenIn, email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    if p["rol"] not in {"docente", "admin", "director"}:
        raise HTTPException(status_code=403, detail="Solo docentes crean exámenes")
    if not payload.titulo.strip():
        raise HTTPException(status_code=400, detail="Título obligatorio")
    uid = p["id"]
    if p["rol"] == "docente" and not _grupos_validos(uid, payload.grupo_ids):
        raise HTTPException(status_code=403, detail="Grupo no autorizado para este docente")
    row = _query(
        "INSERT INTO examenes (titulo, tiempo, preguntas, notamin, intentos, barajar, owner_id) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
        (payload.titulo.strip(), payload.tiempo, Json(payload.preguntas) if Json else '[]',
         payload.notamin, payload.intentos, payload.barajar, uid),
        "one",
    )
    item_id = row["id"]
    for gid in payload.grupo_ids:
        _query(
            "INSERT INTO asignaciones (tipo, item_id, grupo_id) VALUES ('examen', %s, %s) ON CONFLICT DO NOTHING",
            (item_id, gid),
            commit=True,
        )
    return {"ok": True, "id": item_id}

_init()
