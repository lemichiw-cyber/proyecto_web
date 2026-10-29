"""Matrícula por grupo (año + sección) — backend FastAPI + Postgres/Supabase.

Endpoints (todos exigen header X-User-Email salvo /grupos público de lectura
según rol):
  GET    /api/matricula/grupos              — listar grupos según rol
  POST   /api/matricula/grupos              — crear grupo (admin)
  GET    /api/matricula/estudiantes         — listar estudiantes con grupo
  POST   /api/matricula/inscribir           — asignar estudiante a grupo (admin)
  GET    /api/matricula/mi-grupo            — grupo del usuario autenticado

El filtrado se hace en el servidor a partir del email autenticado
(header X-User-Email, placeholder del JWT de Supabase Auth) y del rol en
tabla perfiles. Nunca se confía en un grupo_id enviado por el cliente para
filtrar lo que ve otro usuario.
"""
from __future__ import annotations

import os
from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

try:
    import psycopg2
    from psycopg2.extras import DictCursor, Json
except Exception:  # psycopg2 no instalado en dev local sin BD
    psycopg2 = None  # type: ignore
    DictCursor = None  # type: ignore

router = APIRouter(prefix="/api/matricula", tags=["matricula"])

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")


def _conn():
    if psycopg2 is None:
        raise HTTPException(status_code=503, detail="Falta driver psycopg2 en el backend")
    if not DATABASE_URL:
        raise HTTPException(status_code=503, detail="DATABASE_URL no configurada")
    return psycopg2.connect(DATABASE_URL)


def _query(sql: str, params: tuple = (), fetch: str = "all"):
    with _conn() as conn:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            cur.execute(sql, params)
            if fetch == "one":
                row = cur.fetchone()
                return dict(row) if row else None
            rows = cur.fetchall()
            return [dict(r) for r in rows]
        conn.commit()


def _perfil(email: str):
    """Devuelve {id, rol} del usuario desde tabla perfiles (Supabase)."""
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


class GrupoIn(BaseModel):
    anio: str
    seccion: str
    ciclo_escolar: str


class InscribirIn(BaseModel):
    email: str
    grupo_id: int

class CambiarGrupoIn(BaseModel):
    email: str
    grupo_id: int


@router.get("/grupos")
def listar_grupos(email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    rol = p["rol"]
    uid = p["id"]
    if rol in {"admin", "director", "coordinador"}:
        return _query("SELECT * FROM grupos ORDER BY ciclo_escolar, anio, seccion")
    if rol == "docente":
        return _query(
            """
            SELECT g.* FROM grupos g
            JOIN docente_grupo dg ON dg.grupo_id = g.id
            WHERE dg.docente_id = %s
            ORDER BY g.ciclo_escolar, g.anio, g.seccion
            """,
            (uid,),
        )
    # estudiante: solo su grupo
    return _query(
        """
        SELECT g.* FROM grupos g
        JOIN estudiantes e ON e.grupo_id = g.id
        JOIN perfiles p ON p.email = e.email
        WHERE p.id = %s
        """,
        (uid,),
    )


@router.post("/grupos", status_code=201)
def crear_grupo(payload: GrupoIn, email: str = Depends(_require_email)):
    _require_rol(email, {"admin", "director"})
    try:
        row = _query(
            "INSERT INTO grupos (anio, seccion, ciclo_escolar) VALUES (%s,%s,%s) "
            "RETURNING id, anio, seccion, ciclo_escolar",
            (payload.anio, payload.seccion, payload.ciclo_escolar),
            "one",
        )
    except Exception as e:
        if "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="El grupo ya existe")
        raise HTTPException(status_code=400, detail=str(e))
    return row


@router.get("/estudiantes")
def listar_estudiantes(email: str = Depends(_require_email), grupo_id: int | None = None):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    rol = p["rol"]
    uid = p["id"]
    if rol in {"admin", "director"}:
        sql = "SELECT e.id, e.nombre, e.email, e.grupo_id, g.anio, g.seccion, g.ciclo_escolar FROM estudiantes e LEFT JOIN grupos g ON g.id = e.grupo_id"
        params = ()
        if grupo_id is not None:
            sql += " WHERE e.grupo_id = %s"
            params = (grupo_id,)
        sql += " ORDER BY e.nombre"
        return _query(sql, params)
    if rol == "docente":
        sql = """
            SELECT DISTINCT e.id, e.nombre, e.email, e.grupo_id, g.anio, g.seccion, g.ciclo_escolar
            FROM estudiantes e
            JOIN grupos g ON g.id = e.grupo_id
            JOIN docente_grupo dg ON dg.grupo_id = g.id
            WHERE dg.docente_id = %s
        """
        params = (uid,)
        if grupo_id is not None:
            sql += " AND e.grupo_id = %s"
            params = (uid, grupo_id)
        sql += " ORDER BY e.nombre"
        return _query(sql, params)
    # estudiante: solo sí mismo
    return _query(
        """
        SELECT e.id, e.nombre, e.email, e.grupo_id, g.anio, g.seccion, g.ciclo_escolar
        FROM estudiantes e
        JOIN perfiles p ON p.email = e.email
        LEFT JOIN grupos g ON g.id = e.grupo_id
        WHERE p.id = %s
        """,
        (uid,),
    )


@router.post("/inscribir")
def inscribir(payload: InscribirIn, email: str = Depends(_require_email)):
    _require_rol(email, {"admin", "director"})
    # Validar que el grupo existe
    grp = _query("SELECT id FROM grupos WHERE id = %s LIMIT 1", (payload.grupo_id,), "one")
    if not grp:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    # Validar que el estudiante exista
    est = _query("SELECT id, email FROM estudiantes WHERE email = %s LIMIT 1", (payload.email,), "one")
    if not est:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    _query(
        "UPDATE estudiantes SET grupo_id = %s WHERE email = %s",
        (payload.grupo_id, payload.email),
    )
    return {"ok": True, "email": payload.email, "grupo_id": payload.grupo_id}


@router.get("/mi-grupo")
def mi_grupo(email: str = Depends(_require_email)):
    p = _perfil(email)
    if not p:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    if p["rol"] not in {"estudiante", "docente", "admin", "director"}:
        raise HTTPException(status_code=403, detail="Rol sin acceso a grupos")
    if p["rol"] == "estudiante":
        row = _query(
            """
            SELECT g.id, g.anio, g.seccion, g.ciclo_escolar
            FROM estudiantes e
            JOIN perfiles p ON p.email = e.email
            LEFT JOIN grupos g ON g.id = e.grupo_id
            WHERE p.id = %s
            """,
            (p["id"],),
            "one",
        )
        return {"grupo": row}
    # docente/admin: devolver sus grupos o todos (admin)
    return {"grupos": listar_grupos(email)}

@router.post("/cambiar-grupo")
def cambiar_grupo(payload: CambiarGrupoIn, email: str = Depends(_require_email)):
    _require_rol(email, {"admin", "director"})
    est = _query("SELECT id FROM estudiantes WHERE email = %s LIMIT 1", (payload.email,), "one")
    if not est:
        raise HTTPException(status_code=404, detail="Estudiante no encontrado")
    grp = _query("SELECT id FROM grupos WHERE id = %s LIMIT 1", (payload.grupo_id,), "one")
    if not grp:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    _query("UPDATE estudiantes SET grupo_id = %s WHERE email = %s", (payload.grupo_id, payload.email), commit=True)
    return {"ok": True, "email": payload.email, "grupo_id": payload.grupo_id}

@router.post("/migrar-localstorage")
def migrar_localstorage(payload: dict, email: str = Depends(_require_email)):
    _require_rol(email, {"admin", "director"})
    gid_default = payload.get("grupo_default_id")
    estudiantes_db = payload.get("estudiantes_db") or []
    tareas_legacy = payload.get("bachillerato_tareas") or []
    examenes_legacy = payload.get("bachillerato_examenes") or []
    for est in estudiantes_db:
        if isinstance(est, dict) and est.get("email"):
            gid = est.get("grupo_id") or gid_default
            _query(
                "INSERT INTO estudiantes (nombre, email, grupo_id) VALUES (%s,%s,%s) "
                "ON CONFLICT (email) DO UPDATE SET grupo_id = COALESCE(EXCLUDED.grupo_id, estudiantes.grupo_id)",
                (est.get("nombre"), est["email"], gid),
                commit=True,
            )
    for t in tareas_legacy:
        if isinstance(t, dict) and t.get("titulo"):
            gid = t.get("grupo_id") or gid_default
            row = _query(
                "INSERT INTO tareas (titulo, descripcion, materia, fecha, owner_id) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                (t.get("titulo"), t.get("desc",""), t.get("materia",""), t.get("fecha",""), None),
                "one",
            )
            if gid:
                _query(
                    "INSERT INTO asignaciones (tipo, item_id, grupo_id) VALUES ('tarea', %s, %s) ON CONFLICT DO NOTHING",
                    (row["id"], gid), commit=True,
                )
    for ex in examenes_legacy:
        if isinstance(ex, dict) and ex.get("titulo"):
            gid = ex.get("grupo_id") or gid_default
            row = _query(
                "INSERT INTO examenes (titulo, tiempo, preguntas, notamin, intentos, barajar, owner_id) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                (ex.get("titulo"), ex.get("tiempo",60), Json(ex.get("preguntas",[])) if Json else '[]',
                 ex.get("notamin",60), ex.get("intentos",3), ex.get("barajar",False), None),
                "one",
            )
            if gid:
                _query(
                    "INSERT INTO asignaciones (tipo, item_id, grupo_id) VALUES ('examen', %s, %s) ON CONFLICT DO NOTHING",
                    (row["id"], gid), commit=True,
                )
    return {"ok": True, "estudiantes": len(estudiantes_db), "tareas": len(tareas_legacy), "examenes": len(examenes_legacy)}
