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
    """Perfil del usuario: id de Postgres + rango VIGENTE de accounts.json.

    El rango vive en accounts.json (fuente de verdad); Postgres es un espejo
    que puede quedar viejo. Si no hay Postgres, se devuelve el rango igual
    para que la app funcione local-first.
    """
    email = (email or "").strip().lower()
    p = None
    try:
        p = _query("SELECT id, rol FROM perfiles WHERE email = %s LIMIT 1", (email,), "one")
    except Exception:
        p = None
    rol = None
    try:
        from api.accounts import rol_de_cuenta
        rol = rol_de_cuenta(email)
    except Exception:
        rol = None
    if rol:
        if isinstance(p, dict):
            p = dict(p)
            p["rol"] = rol
            return p
        return {"id": None, "rol": rol}
    return p

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

MATERIAS_VALIDAS = {
    "emprendedurismo", "matematica", "metodos de investigacion",
    "software", "ciencias", "ingles", "ingles tecnico",
}


class ExamenIn(BaseModel):
    titulo: str = Field(..., min_length=1)
    materia: str = Field(..., description="Materia del examen")
    tiempo: int = 60
    preguntas: list = Field(default_factory=list)
    notamin: int = 60
    intentos: int = 3
    barajar: bool = False
    grupo_ids: list[int] = Field(default_factory=list)

    @field_validator("materia")
    @classmethod
    def _materia_valida(cls, v: str) -> str:
        m = v.strip().lower()
        if m not in MATERIAS_VALIDAS:
            raise ValueError(
                "Materia inválida. Use una de: " + ", ".join(sorted(MATERIAS_VALIDAS))
            )
        return m

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
            if tipo == "abierta" and not str(p.get("texto", "")).strip():
                raise ValueError(f"Pregunta {i + 1}: texto obligatorio")
            if tipo == "casilla" and not isinstance(p.get("correctas"), list):
                raise ValueError(f"Pregunta {i + 1}: 'correctas' debe ser lista de índices")
            if tipo == "ordenar" and not isinstance(p.get("orden"), list):
                raise ValueError(f"Pregunta {i + 1}: 'orden' debe ser lista de índices")
            if tipo == "emparejar" and not isinstance(p.get("pares"), list):
                raise ValueError(f"Pregunta {i + 1}: 'pares' debe ser lista de pares")
            if tipo == "texto_largo" and not str(p.get("respuesta", "")).strip():
                raise ValueError(f"Pregunta {i + 1}: respuesta esperada obligatoria")
            if tipo == "vf_justificacion" and p.get("correcta") is None:
                raise ValueError(f"Pregunta {i + 1}: respuesta correcta obligatoria")
            if tipo == "rango":
                resp = p.get("respuesta")
                if not isinstance(resp, (int, float)):
                    raise ValueError(f"Pregunta {i + 1}: 'respuesta' debe ser numérica")
                tol = p.get("tolerancia", 0)
                if not isinstance(tol, (int, float)) or tol < 0:
                    raise ValueError(f"Pregunta {i + 1}: 'tolerancia' debe ser numérica ≥ 0")
            if tipo == "cloze":
                respuestas = p.get("respuestas")
                if not isinstance(respuestas, list) or not respuestas or not all(str(r).strip() for r in respuestas):
                    raise ValueError(f"Pregunta {i + 1}: 'respuestas' debe ser lista no vacía")
            if tipo == "codigo":
                if not str(p.get("lenguaje", "")).strip():
                    raise ValueError(f"Pregunta {i + 1}: 'lenguaje' obligatorio para código")
            if tipo in ("video", "imagen"):
                if not str(p.get("url", "")).strip():
                    raise ValueError(f"Pregunta {i + 1}: 'url' obligatoria para {tipo}")
            if tipo in ("mat_ecuacion", "mat_geometria", "mat_funcion"):
                resp = p.get("respuesta")
                if not isinstance(resp, (int, float)) and not str(resp or "").strip():
                    raise ValueError(f"Pregunta {i + 1}: 'respuesta' obligatoria para {tipo}")
            if tipo in ("ciencia_formula", "ciencia_ecuacion", "ciencia_diagrama"):
                if not str(p.get("respuesta", "")).strip():
                    raise ValueError(f"Pregunta {i + 1}: 'respuesta' obligatoria para {tipo}")
            if tipo in ("sw_codigo_funcion", "sw_depuracion", "sw_arquitectura"):
                resp = p.get("respuesta") or p.get("salida_esperada")
                if not str(resp or "").strip():
                    raise ValueError(f"Pregunta {i + 1}: respuesta esperada obligatoria para {tipo}")
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
