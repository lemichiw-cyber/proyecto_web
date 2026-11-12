"""Aulas Virtuales — espacios de clase compartidos entre personas.

La sección "Aulas Virtuales" de la app estaba implementada pero guardaba
todo **sólo en el dispositivo** (localStorage) y su feature flag estaba
apagado porque, sin backend, un aula no llegaba a nadie: el docente
creaba un aula en su teléfono y el estudiante nunca la veía.

Ahora hay backend real con autenticación (misma cookie de sesión que el
resto de la app). El modelo es el mismo que usa la interfaz:

    aulas           → espacios de clase (CRUD)
    inscripciones   → quién pertenece a cada aula
    tareas          → consignas del docente
    entregas        → respuesta del estudiante
    calificaciones  → nota del docente sobre una entrega
    asistencia      → registro por sesión (aula + fecha)

Reglas (las mismas que los permisos del frontend, `permisosDelRol`):

    * crear/editar  → admin, director, subdirector, coordinador, docente,
    * eliminar       → admin, director, subdirector,
    * ver           → el personal docente ve todo; el estudiante ve las
                      aulas donde está inscrito, sus tareas, sus entregas,
                      sus calificaciones y la asistencia de sus aulas,
    * entregar      → cualquier usuario autenticado, pero sólo puede
                      entregar en un aula donde está inscrito (el docente
                      puede registrar entregas de sus alumnos).

Persistencia: JSON atómico en el directorio de datos (`SAKURA_DATA_DIR`),
modo 0600. Cada acción queda en el log de auditoría (`audit.log`).
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import require_auth
from audit import write as audit_write
from db import write_json_atomic
from paths import data_file

router = APIRouter(prefix="/api/aulas", tags=["aulas"])

AULAS_FILE = data_file("aulas.json", "SAKURA_AULAS_FILE")

COLECCIONES = ("aulas", "inscripciones", "tareas", "entregas", "calificaciones", "asistencia")

# Personal que gestiona aulas (crear/editar).
ROLES_GESTION = {"admin", "director", "subdirector", "coordinador", "docente"}
# Personal que además puede borrar (los mismos permisos que el frontend).
ROLES_ELIMINAR = {"admin", "director", "subdirector"}

MAX_ITEMS = 2000          # por colección
MAX_ID = 64
MAX_NOMBRE = 120
MAX_TITULO = 200
MAX_TEXTO = 4000
MAX_EMAIL = 160
MAX_ARCHIVO = 1_500_000   # caracteres (data URL) — los archivos grandes no se suben

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ESTADOS_ASISTENCIA = {"presente", "ausente", "justificado"}


def _load() -> dict:
    """Lee el archivo de datos y devuelve las seis colecciones."""
    if not AULAS_FILE.exists():
        return {c: {} for c in COLECCIONES}
    try:
        raw = AULAS_FILE.read_text(encoding="utf-8")
        data = json.loads(raw)
    except Exception:
        return {c: {} for c in COLECCIONES}
    if not isinstance(data, dict):
        return {c: {} for c in COLECCIONES}
    out: dict[str, dict] = {}
    for c in COLECCIONES:
        col = data.get(c)
        out[c] = col if isinstance(col, dict) else {}
    return out


def _save(data: dict) -> None:
    write_json_atomic(AULAS_FILE, data, mode=0o600)


def _email(v: Any) -> str:
    return str(v or "").strip().lower()


def _es_gestion(rol: str) -> bool:
    return str(rol or "").strip().lower() in ROLES_GESTION


def _es_eliminar(rol: str) -> bool:
    return str(rol or "").strip().lower() in ROLES_ELIMINAR


def _texto(v: Any, maxlen: int) -> str:
    return str(v if v is not None else "").strip()[:maxlen]


def _id(v: Any) -> str:
    return _texto(v, MAX_ID)


def _email_valido(v: Any) -> str:
    e = _email(v)
    if e and len(e) <= MAX_EMAIL and _EMAIL_RE.match(e):
        return e
    return ""


def _nombre_norm(v: Any) -> str:
    """Normaliza un nombre para comparar ("Ana  Sofía" == "ana sofia")."""
    s = _email(v)  # sólo para bajar a minúsculas y quitar espacios
    s = re.sub(r"[^a-z0-9áéíóúüñ ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _cuentas() -> dict:
    """Cuentas del sistema (accounts.json es la fuente de verdad de roles)."""
    try:
        from api.accounts import _load_accounts

        return _load_accounts()
    except Exception:
        return {}


def _email_por_nombre(nombre: Any) -> str:
    """Busca el email de la cuenta cuyo nombre (o email) coincide con el dado."""
    objetivo = _nombre_norm(nombre)
    if not objetivo:
        return ""
    candidatos = []
    for email, cuenta in _cuentas().items():
        if not isinstance(cuenta, dict):
            continue
        if _email(cuenta.get("email")) == _email(email):
            # La cuenta trae su email: coincidencia directa.
            if _email(email) == _email(nombre):
                return _email(email)
        if _nombre_norm(cuenta.get("nombre")) == objetivo:
            candidatos.append(_email(email))
    # Con varias cuentas del mismo nombre no se puede saber cuál es: mejor
    # no vincular nada que vincular al alumno equivocado.
    return candidatos[0] if len(candidatos) == 1 else ""


# --------------------------------------------------------------------------
# Validación por colección
# --------------------------------------------------------------------------

def _validar_aula(p: dict, user: dict) -> dict:
    nombre = _texto(p.get("nombre"), MAX_NOMBRE)
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del aula es obligatorio")
    try:
        capacidad = int(p.get("capacidad") or 0)
    except Exception:
        capacidad = 0
    if capacidad < 1 or capacidad > 1000:
        raise HTTPException(status_code=400, detail="Capacidad inválida")
    return {
        "id": _id(p.get("id")),
        "nombre": nombre,
        "capacidad": capacidad,
        "ubicacion": _texto(p.get("ubicacion"), MAX_NOMBRE),
        "tipo": _texto(p.get("tipo"), 40),
        "equipamiento": _texto(p.get("equipamiento"), 40),
        "desc": _texto(p.get("desc") or p.get("descripcion"), MAX_TEXTO),
        "especialidad": _texto(p.get("especialidad"), 60),
        "anio": _texto(p.get("anio"), 10),
        "seccion": _texto(p.get("seccion"), 10),
        "owner_id": _email(user.get("email")),
        "actualizado": time.time(),
    }


def _validar_inscripcion(p: dict, user: dict) -> dict:
    aula_id = _id(p.get("aula_id") or p.get("aulaId"))
    if not aula_id:
        raise HTTPException(status_code=400, detail="Falta el aula de la inscripción")
    nombre = _texto(p.get("estudiante_nombre") or p.get("estudiante"), MAX_NOMBRE)
    email = _email_valido(p.get("estudiante_email") or p.get("estudianteEmail"))
    if not email:
        # El docente puede elegir al alumno por nombre: se busca su cuenta
        # para poder vincularlo (si no, el alumno no vería el aula).
        email = _email_por_nombre(nombre)
    return {
        "id": _id(p.get("id")) or f"ins-{aula_id}-{_id(p.get('estudiante_id'))}",
        "aula_id": aula_id,
        "estudiante_id": _id(p.get("estudiante_id") or p.get("estudianteId")),
        "estudiante_email": email,
        "estudiante_nombre": nombre,
        "estado": _texto(p.get("estado"), 30) or "aprobado",
        "fecha": _texto(p.get("fecha"), 40),
        "owner_id": _email(user.get("email")),
        "actualizado": time.time(),
    }


def _validar_tarea(p: dict, user: dict) -> dict:
    titulo = _texto(p.get("titulo"), MAX_TITULO)
    if not titulo:
        raise HTTPException(status_code=400, detail="El título de la tarea es obligatorio")
    aula_id = _id(p.get("aula_id") or p.get("aulaId"))
    if not aula_id:
        raise HTTPException(status_code=400, detail="Falta el aula de la tarea")
    return {
        "id": _id(p.get("id")),
        "aula_id": aula_id,
        "titulo": titulo,
        "descripcion": _texto(p.get("descripcion") or p.get("desc"), MAX_TEXTO),
        "materia": _texto(p.get("materia"), 80),
        "grupo": _texto(p.get("grupo"), 80),
        "fecha": _texto(p.get("fecha") or p.get("fecha_limite"), 40),
        "owner_id": _email(user.get("email")),
        "actualizado": time.time(),
    }


def _validar_entrega(p: dict, user: dict) -> dict:
    tarea_id = _id(p.get("tarea_id") or p.get("tareaId"))
    if not tarea_id:
        raise HTTPException(status_code=400, detail="Falta la tarea de la entrega")
    archivo = _texto(p.get("archivo"), MAX_ARCHIVO)
    return {
        "id": _id(p.get("id")),
        "tarea_id": tarea_id,
        "estudiante_id": _id(p.get("estudiante_id") or p.get("estudianteId")),
        "estudiante_email": _email_valido(p.get("estudiante_email") or p.get("estudianteEmail")) or _email(user.get("email")),
        "estudiante_nombre": _texto(p.get("estudiante_nombre") or p.get("estudiante"), MAX_NOMBRE),
        "respuesta": _texto(p.get("respuesta"), MAX_TEXTO),
        "archivo_nombre": _texto(p.get("archivo_nombre") or p.get("archivoNombre"), MAX_NOMBRE),
        "archivo": archivo,
        "fecha": _texto(p.get("fecha"), 40),
        "owner_id": _email(user.get("email")),
        "actualizado": time.time(),
    }


def _validar_calificacion(p: dict, user: dict) -> dict:
    try:
        nota = float(p.get("nota"))
    except Exception:
        raise HTTPException(status_code=400, detail="La nota no es válida")
    if nota < 0 or nota > 100:
        raise HTTPException(status_code=400, detail="La nota debe estar entre 0 y 100")
    return {
        "id": _id(p.get("id")),
        "entrega_id": _id(p.get("entrega_id") or p.get("entregaId")),
        "tarea_id": _id(p.get("tarea_id") or p.get("tareaId")),
        "estudiante_id": _id(p.get("estudiante_id") or p.get("estudianteId")),
        "estudiante_email": _email_valido(p.get("estudiante_email") or p.get("estudianteEmail")),
        "nota": nota,
        "retroealimentacion": _texto(p.get("retroealimentacion"), MAX_TEXTO),
        "fecha": _texto(p.get("fecha") or p.get("fecha_calificacion"), 40),
        "owner_id": _email(user.get("email")),
        "actualizado": time.time(),
    }


def _validar_asistencia(p: dict, user: dict) -> dict:
    aula_id = _id(p.get("aula_id") or p.get("aulaId"))
    if not aula_id:
        raise HTTPException(status_code=400, detail="Falta el aula del registro de asistencia")
    registros = p.get("registros")
    if not isinstance(registros, list):
        registros = []
    limpios = []
    for r in registros[:500]:
        if not isinstance(r, dict):
            continue
        estado = _texto(r.get("estado"), 20).lower()
        if estado not in _ESTADOS_ASISTENCIA:
            estado = "presente"
        limpios.append({
            "nombre": _texto(r.get("nombre"), MAX_NOMBRE),
            "estado": estado,
        })
    return {
        "id": _id(p.get("id")) or f"asi-{aula_id}-{_texto(p.get('fecha'), 40)}",
        "aula_id": aula_id,
        "fecha": _texto(p.get("fecha"), 40),
        "registros": limpios,
        "owner_id": _email(user.get("email")),
        "actualizado": time.time(),
    }


VALIDADORES = {
    "aulas": _validar_aula,
    "inscripciones": _validar_inscripcion,
    "tareas": _validar_tarea,
    "entregas": _validar_entrega,
    "calificaciones": _validar_calificacion,
    "asistencia": _validar_asistencia,
}


def _coleccion(name: str) -> str:
    c = str(name or "").strip().lower()
    if c not in COLECCIONES:
        raise HTTPException(status_code=404, detail="Colección desconocida")
    return c


# --------------------------------------------------------------------------
# Visibilidad
# --------------------------------------------------------------------------

def _aulas_del_usuario(data: dict, email: str) -> set:
    """Ids de aulas que un estudiante puede ver (inscripciones + propias)."""
    propias = {a.get("id") for a in data["aulas"].values() if _email(a.get("owner_id")) == email}
    inscritas = {
        i.get("aula_id") for i in data["inscripciones"].values()
        if _email(i.get("estudiante_email")) == email
    }
    return propias | {a for a in inscritas if a}


def _visible(data: dict, rol: str, email: str) -> dict:
    """Recorta el estado según el rango del usuario."""
    if _es_gestion(rol):
        return {c: list(data[c].values()) for c in COLECCIONES}

    mis_aulas = _aulas_del_usuario(data, email)
    return {
        "aulas": [a for a in data["aulas"].values() if a.get("id") in mis_aulas],
        "inscripciones": [i for i in data["inscripciones"].values() if _email(i.get("estudiante_email")) == email],
        "tareas": [t for t in data["tareas"].values() if t.get("aula_id") in mis_aulas],
        "entregas": [e for e in data["entregas"].values() if _email(e.get("estudiante_email")) == email],
        "calificaciones": [c for c in data["calificaciones"].values() if _email(c.get("estudiante_email")) == email],
        "asistencia": [a for a in data["asistencia"].values() if a.get("aula_id") in mis_aulas],
    }


def _inscrito(data: dict, email: str, aula_id: str) -> bool:
    return any(
        i.get("aula_id") == aula_id and _email(i.get("estudiante_email")) == email
        for i in data["inscripciones"].values()
    )


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@router.get("/estado")
def estado(user: dict = Depends(require_auth)):
    """Devuelve todo lo que el usuario puede ver, en una sola respuesta."""
    data = _load()
    return {"ok": True, **_visible(data, user.get("rol", ""), _email(user.get("email")))}


@router.get("/estudiantes")
def estudiantes(user: dict = Depends(require_auth)):
    """Cuentas con rango estudiante (para inscribirlas en un aula).

    Sólo el personal que gestiona aulas lo ve: son datos del alumnado.
    """
    if not _es_gestion(user.get("rol", "")):
        raise HTTPException(status_code=403, detail="Tu rango no puede ver el listado de estudiantes")
    out = []
    for email, cuenta in _cuentas().items():
        if not isinstance(cuenta, dict):
            continue
        if str(cuenta.get("rol") or "").strip().lower() != "estudiante":
            continue
        if cuenta.get("activo") is False:
            continue
        out.append({
            "id": _email(email),
            "email": _email(email),
            "nombre": _texto(cuenta.get("nombre") or _email(email).split("@")[0], MAX_NOMBRE),
        })
    out.sort(key=lambda c: c["nombre"].lower())
    return {"ok": True, "count": len(out), "estudiantes": out}


class GuardarIn(BaseModel):
    """Cuerpo libre: cada colección valida sus propios campos."""

    model_config = {"extra": "allow"}


@router.post("/{coleccion}")
def guardar(coleccion: str, payload: dict = Body(...), user: dict = Depends(require_auth)):
    """Guarda (crea o actualiza) un elemento de una colección.

    El id lo genera el cliente: la operación es idempotente, así que el
    frontend puede reenviar lo mismo sin duplicar nada.
    """
    col = _coleccion(coleccion)
    rol = str(user.get("rol") or "")
    email = _email(user.get("email"))

    if col in ("aulas", "inscripciones", "tareas", "calificaciones", "asistencia"):
        if not _es_gestion(rol):
            raise HTTPException(status_code=403, detail="Tu rango no puede gestionar esto")
    elif col == "entregas":
        # Cualquiera autenticado entrega, pero sólo en un aula donde está
        # inscrito (el personal docente puede registrar la de sus alumnos).
        pass

    data = _load()
    item = VALIDADORES[col](payload, user)
    if not item.get("id"):
        item["id"] = f"{col[:3]}-{int(time.time() * 1000)}"

    if col == "entregas" and not _es_gestion(rol):
        tarea = data["tareas"].get(item["tarea_id"])
        aula_id = str(tarea.get("aula_id")) if tarea else ""
        if not aula_id or not _inscrito(data, email, aula_id):
            raise HTTPException(status_code=403, detail="No estás inscrito en el aula de esa tarea")
        # El estudiante sólo puede entregar en su nombre.
        item["estudiante_email"] = email
        item["owner_id"] = email

    if len(data[col]) >= MAX_ITEMS and item["id"] not in data[col]:
        raise HTTPException(status_code=409, detail="Se alcanzó el máximo de elementos")

    data[col][item["id"]] = item
    _save(data)
    audit_write(f"aulas.{col}.guardar", email, item["id"])
    return {"ok": True, "id": item["id"], "item": item}


@router.delete("/{coleccion}/{item_id}")
def borrar(coleccion: str, item_id: str, user: dict = Depends(require_auth)):
    """Borra un elemento (sólo el personal con permiso de eliminar)."""
    col = _coleccion(coleccion)
    rol = str(user.get("rol") or "")
    email = _email(user.get("email"))

    if col == "entregas":
        # El estudiante puede borrar SU entrega; el resto, el personal docente.
        data = _load()
        item = data[col].get(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="No encontrado")
        if not _es_gestion(rol) and _email(item.get("estudiante_email")) != email:
            raise HTTPException(status_code=403, detail="No podés borrar esta entrega")
    else:
        if not _es_eliminar(rol):
            raise HTTPException(status_code=403, detail="Tu rango no puede eliminar esto")

    data = _load()
    if item_id not in data[col]:
        raise HTTPException(status_code=404, detail="No encontrado")
    data[col].pop(item_id, None)
    _save(data)
    audit_write(f"aulas.{col}.borrar", email, item_id)
    return {"ok": True}
