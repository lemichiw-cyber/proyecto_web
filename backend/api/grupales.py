"""Actividades grupales — workspace colaborativo de proyectos en equipo.

La sección "Actividades grupales" guardaba los grupos **sólo en el
dispositivo** (localStorage). Ahora hay backend real con autenticación.

Modelo:

    grupos   → proyectos (nombre, descripcion, materia, dueño, estado)
    miembros → quién participa de cada grupo
    mensajes → chat interno del grupo
    entregas → entrega compartida del grupo (con archivo opcional)

Reglas:

    * Ver       → los miembros del grupo y el personal docente ven todo;
                  el resto no ve el grupo.
    * Crear     → cualquier usuario autenticado (un estudiante puede armar
                  su propio equipo).
    * Editar    → el dueño del grupo o el personal docente.
    * Invitar   → el dueño o el personal docente (el invitado ve el grupo
                  desde el momento en que se lo agrega).
    * Entregar  → cualquier miembro del grupo.
    * Borrar    → el dueño o el personal con permiso de eliminar.

Persistencia: JSON atómico en el directorio de datos (`SAKURA_DATA_DIR`),
modo 0600. Cada acción queda en el log de auditoría (`audit.log`).
"""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import require_auth
from audit import write as audit_write
from db import write_json_atomic
from paths import data_file

router = APIRouter(prefix="/api/grupales", tags=["grupales"])

GRUPALES_FILE = data_file("grupales.json", "SAKURA_GRUPALES_FILE")

COLECCIONES = ("grupos", "miembros", "mensajes", "entregas")

ROLES_GESTION = {"admin", "director", "subdirector", "coordinador", "docente"}
ROLES_ELIMINAR = {"admin", "director", "subdirector"}

MAX_ITEMS = 2000
MAX_ID = 64
MAX_NOMBRE = 120
MAX_TITULO = 200
MAX_TEXTO = 4000
MAX_EMAIL = 160
MAX_ARCHIVO = 1_500_000   # caracteres (data URL)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def _load() -> dict:
    if not GRUPALES_FILE.exists():
        return {c: {} for c in COLECCIONES}
    try:
        raw = json.loads(GRUPALES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {c: {} for c in COLECCIONES}
    if not isinstance(raw, dict):
        return {c: {} for c in COLECCIONES}
    return {c: (raw.get(c) if isinstance(raw.get(c), dict) else {}) for c in COLECCIONES}


def _save(data: dict) -> None:
    write_json_atomic(GRUPALES_FILE, data, mode=0o600)


def _email(v: Any) -> str:
    return str(v or "").strip().lower()


def _texto(v: Any, maxlen: int) -> str:
    return str(v if v is not None else "").strip()[:maxlen]


def _id(v: Any) -> str:
    return _texto(v, MAX_ID)


def _email_valido(v: Any) -> str:
    e = _email(v)
    return e if e and len(e) <= MAX_EMAIL and _EMAIL_RE.match(e) else ""


def _es_gestion(rol: str) -> bool:
    return str(rol or "").strip().lower() in ROLES_GESTION


def _es_eliminar(rol: str) -> bool:
    return str(rol or "").strip().lower() in ROLES_ELIMINAR


def _cuentas() -> dict:
    try:
        from api.accounts import _load_accounts

        return _load_accounts()
    except Exception:
        return {}


def _nombre_de(email: str) -> str:
    cuenta = _cuentas().get(email)
    if isinstance(cuenta, dict):
        return _texto(cuenta.get("nombre") or email.split("@")[0], MAX_NOMBRE)
    return email.split("@")[0]


def _es_miembro(data: dict, email: str, grupo_id: str) -> bool:
    return any(
        _email(m.get("email")) == email and _id(m.get("grupo_id")) == grupo_id
        for m in data["miembros"].values()
        if isinstance(m, dict)
    )


def _puede_ver(data: dict, email: str, rol: str, grupo_id: str) -> bool:
    """El dueño, los miembros y el personal docente ven el grupo."""
    grupo = data["grupos"].get(grupo_id)
    if not isinstance(grupo, dict):
        return False
    if _email(grupo.get("owner_id")) == email:
        return True
    if _es_gestion(rol):
        return True
    return _es_miembro(data, email, grupo_id)


# --------------------------------------------------------------------------
# Modelos
# --------------------------------------------------------------------------

class CrearGrupoIn(BaseModel):
    nombre: str = Field(..., min_length=1, max_length=MAX_NOMBRE)
    descripcion: str = Field("", max_length=MAX_TEXTO)
    materia: str = Field("", max_length=80)
    miembros: list[str] = Field(default_factory=list)


class MensajeIn(BaseModel):
    contenido: str = Field(..., min_length=1, max_length=MAX_TEXTO)


class InvitarIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=MAX_EMAIL)


class EntregaIn(BaseModel):
    grupo_id: str = Field(..., min_length=1, max_length=MAX_ID)
    texto: str = Field("", max_length=MAX_TEXTO)
    archivo: str = Field("", max_length=MAX_ARCHIVO)


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@router.get("/")
def listar(user: dict = Depends(require_auth)):
    """Lista los grupos que el usuario puede ver."""
    email = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    data = _load()
    visibles = []
    for gid, grupo in data["grupos"].items():
        if not isinstance(grupo, dict):
            continue
        if not _puede_ver(data, email, rol, gid):
            continue
        miembros = [
            {
                "email": _email(m.get("email")),
                "nombre": m.get("nombre") or _nombre_de(_email(m.get("email"))),
                "rol": m.get("rol", ""),
            }
            for m in data["miembros"].values()
            if isinstance(m, dict) and _id(m.get("grupo_id")) == gid
        ]
        mensajes = [m for m in data["mensajes"].values() if isinstance(m, dict) and _id(m.get("grupo_id")) == gid]
        entregas = [e for e in data["entregas"].values() if isinstance(e, dict) and _id(e.get("grupo_id")) == gid]
        visibles.append({
            **grupo,
            "miembros": miembros,
            "total_mensajes": len(mensajes),
            "total_entregas": len(entregas),
        })
    visibles.sort(key=lambda g: float(g.get("actualizado", 0)), reverse=True)
    return {"ok": True, "count": len(visibles), "grupos": visibles}


@router.post("/", status_code=201)
def crear(payload: CrearGrupoIn, user: dict = Depends(require_auth)):
    """Crea un grupo con su dueño ya(member) y la lista inicial de miembros."""
    email = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    nombre = _texto(payload.nombre, MAX_NOMBRE)
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre del grupo es obligatorio")
    data = _load()
    if len(data["grupos"]) >= MAX_ITEMS:
        raise HTTPException(status_code=409, detail="Se alcanzó el máximo de grupos")
    gid = "gr-" + uuid.uuid4().hex[:8]
    data["grupos"][gid] = {
        "id": gid,
        "nombre": nombre,
        "descripcion": _texto(payload.descripcion, MAX_TEXTO),
        "materia": _texto(payload.materia, 80),
        "owner_id": email,
        "owner_nombre": _nombre_de(email),
        "estado": "activo",
        "creado": time.time(),
        "actualizado": time.time(),
    }
    # El dueño siempre es miembro.
    _agregar_miembro(data, gid, email)
    for destino in payload.miembros or []:
        _agregar_miembro(data, gid, _email_valido(destino))
    _save(data)
    audit_write("grupales.crear", email, gid)
    return {"ok": True, "id": gid, "grupo": data["grupos"][gid]}


def _agregar_miembro(data: dict, grupo_id: str, email: str) -> None:
    """Agrega un miembro al grupo (idempotente)."""
    e = _email_valido(email)
    if not e:
        return
    for mid, m in data["miembros"].items():
        if isinstance(m, dict) and _id(m.get("grupo_id")) == grupo_id and _email(m.get("email")) == e:
            return
    mid = "mi-" + uuid.uuid4().hex[:8]
    data["miembros"][mid] = {
        "id": mid,
        "grupo_id": grupo_id,
        "email": e,
        "nombre": _nombre_de(e),
        "rol": "miembro",
        "fecha": time.time(),
    }


@router.get("/{grupo_id}")
def detalle(grupo_id: str, user: dict = Depends(require_auth)):
    """Detalle del grupo: miembros, chat y entregas."""
    email = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    data = _load()
    gid = _id(grupo_id)
    if gid not in data["grupos"]:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if not _puede_ver(data, email, rol, gid):
        raise HTTPException(status_code=403, detail="No tenés acceso a este grupo")
    grupo = data["grupos"][gid]
    miembros = [
        {
            "email": _email(m.get("email")),
            "nombre": m.get("nombre") or _nombre_de(_email(m.get("email"))),
            "rol": m.get("rol", ""),
            "fecha": m.get("fecha", 0),
        }
        for m in data["miembros"].values()
        if isinstance(m, dict) and _id(m.get("grupo_id")) == gid
    ]
    mensajes = sorted(
        [m for m in data["mensajes"].values() if isinstance(m, dict) and _id(m.get("grupo_id")) == gid],
        key=lambda m: float(m.get("creado", 0)),
    )
    entregas = sorted(
        [e for e in data["entregas"].values() if isinstance(e, dict) and _id(e.get("grupo_id")) == gid],
        key=lambda e: float(e.get("creado", 0)),
    )
    return {"ok": True, "grupo": grupo, "miembros": miembros, "mensajes": mensajes, "entregas": entregas}


@router.post("/{grupo_id}/mensajes", status_code=201)
def enviar_mensaje(grupo_id: str, payload: MensajeIn, user: dict = Depends(require_auth)):
    """Escribe en el chat interno del grupo."""
    email = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    data = _load()
    gid = _id(grupo_id)
    if gid not in data["grupos"]:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if not _puede_ver(data, email, rol, gid):
        raise HTTPException(status_code=403, detail="No tenés acceso a este grupo")
    contenido = _texto(payload.contenido, MAX_TEXTO)
    if not contenido:
        raise HTTPException(status_code=400, detail="El mensaje está vacío")
    mid = "ms-" + uuid.uuid4().hex[:8]
    data["mensajes"][mid] = {
        "id": mid,
        "grupo_id": gid,
        "email": email,
        "nombre": _nombre_de(email),
        "contenido": contenido,
        "creado": time.time(),
    }
    data["grupos"][gid]["actualizado"] = time.time()
    _save(data)
    audit_write("grupales.mensaje", email, gid)
    return {"ok": True, "id": mid, "mensaje": data["mensajes"][mid]}


@router.post("/{grupo_id}/miembros", status_code=201)
def invitar(grupo_id: str, payload: InvitarIn, user: dict = Depends(require_auth)):
    """Invita a alguien al grupo (el dueño o el personal docente)."""
    email = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    data = _load()
    gid = _id(grupo_id)
    grupo = data["grupos"].get(gid)
    if not isinstance(grupo, dict):
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if _email(grupo.get("owner_id")) != email and not _es_gestion(rol):
        raise HTTPException(status_code=403, detail="Sólo el dueño o el docente puede invitar")
    destino = _email_valido(payload.email)
    if not destino:
        raise HTTPException(status_code=400, detail="Email inválido")
    cuentas = _cuentas()
    cuenta = cuentas.get(destino)
    if not isinstance(cuenta, dict) or cuenta.get("activo") is False:
        raise HTTPException(status_code=404, detail="Esa cuenta no existe")
    _agregar_miembro(data, gid, destino)
    data["grupos"][gid]["actualizado"] = time.time()
    _save(data)
    audit_write("grupales.invitar", email, destino)
    return {"ok": True, "grupo_id": gid, "email": destino}


@router.post("/{grupo_id}/entregas", status_code=201)
def entregar(grupo_id: str, payload: EntregaIn, user: dict = Depends(require_auth)):
    """Registra una entrega compartida del grupo (texto y/o archivo)."""
    email = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    data = _load()
    gid = _id(grupo_id)
    if gid not in data["grupos"]:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if not _puede_ver(data, email, rol, gid):
        raise HTTPException(status_code=403, detail="No tenés acceso a este grupo")
    texto = _texto(payload.texto, MAX_TEXTO)
    archivo = _texto(payload.archivo, MAX_ARCHIVO)
    if not texto and not archivo:
        raise HTTPException(status_code=400, detail="La entrega está vacía")
    eid = "en-" + uuid.uuid4().hex[:8]
    data["entregas"][eid] = {
        "id": eid,
        "grupo_id": gid,
        "email": email,
        "nombre": _nombre_de(email),
        "texto": texto,
        "archivo": archivo,
        "creado": time.time(),
    }
    data["grupos"][gid]["actualizado"] = time.time()
    _save(data)
    audit_write("grupales.entrega", email, gid)
    return {"ok": True, "id": eid, "entrega": data["entregas"][eid]}


@router.patch("/{grupo_id}")
def editar(grupo_id: str, payload: dict = Body(...), user: dict = Depends(require_auth)):
    """Edita los datos del grupo (el dueño o el personal docente)."""
    email = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    data = _load()
    gid = _id(grupo_id)
    grupo = data["grupos"].get(gid)
    if not isinstance(grupo, dict):
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    if _email(grupo.get("owner_id")) != email and not _es_gestion(rol):
        raise HTTPException(status_code=403, detail="No podés editar este grupo")
    if "nombre" in payload:
        nombre = _texto(payload.get("nombre"), MAX_NOMBRE)
        if not nombre:
            raise HTTPException(status_code=400, detail="El nombre no puede quedar vacío")
        grupo["nombre"] = nombre
    if "descripcion" in payload:
        grupo["descripcion"] = _texto(payload.get("descripcion"), MAX_TEXTO)
    if "materia" in payload:
        grupo["materia"] = _texto(payload.get("materia"), 80)
    if "estado" in payload:
        estado = _texto(payload.get("estado"), 20)
        if estado not in {"activo", "archivado"}:
            raise HTTPException(status_code=400, detail="Estado inválido")
        grupo["estado"] = estado
    grupo["actualizado"] = time.time()
    _save(data)
    audit_write("grupales.editar", email, gid)
    return {"ok": True, "grupo": grupo}


@router.delete("/{grupo_id}")
def borrar(grupo_id: str, user: dict = Depends(require_auth)):
    """Borra el grupo y todo su contenido (dueño o personal con permiso)."""
    email = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    data = _load()
    gid = _id(grupo_id)
    grupo = data["grupos"].get(gid)
    if not isinstance(grupo, dict):
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    es_dueno = _email(grupo.get("owner_id")) == email
    if not es_dueno and rol not in ROLES_ELIMINAR:
        raise HTTPException(status_code=403, detail="No podés borrar este grupo")
    for col in ("miembros", "mensajes", "entregas"):
        for mid in [k for k, v in data[col].items() if isinstance(v, dict) and _id(v.get("grupo_id")) == gid]:
            data[col].pop(mid, None)
    data["grupos"].pop(gid, None)
    _save(data)
    audit_write("grupales.borrar", email, gid)
    return {"ok": True}
