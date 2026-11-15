"""Mensajes — comunicación directa entre docentes, estudiantes y familias.

La sección "Mensajes" de la app estaba implementada pero guardaba los
mensajes **sólo en el dispositivo** (localStorage): el docente escribía en
su teléfono y el estudiante nunca lo veía. Ahora hay backend real con
autenticación (la misma cookie de sesión que el resto de la app).

Modelo:

    mensajes → mensajes individuales (remitente, destinatario, asunto,
               contenido, creado, leído)

Reglas:

    * Ver       → sólo los mensajes donde el usuario es remitente o
                  destinatario (nadie ve la conversación de otros).
    * Enviar    → cualquier usuario autenticado puede escribir a un contacto
                  válido (docentes entre sí, docentes↔estudiantes,
                  estudiantes→docentes).
    * Contactos → el estudiante ve al personal (docente, coordinador,
                  director, subdirector, admin); el personal ve a todo el
                  alumnado y al resto del personal.
    * Borrar    → el remitente o el personal con permiso de eliminar.
    * Marcar    → leído: sólo el destinatario.

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
from api.notify import send_push

router = APIRouter(prefix="/api/mensajes", tags=["mensajes"])

MENSAJES_FILE = data_file("mensajes.json", "SAKURA_MENSAJES_FILE")

# Personal (docencia y dirección): puede hablar con todo el mundo y borrar
# mensajes ajenos dentro de su alcance.
ROLES_PERSONAL = {"admin", "director", "subdirector", "coordinador", "docente"}
# Rango que ve el estudiante como "personal" al que puede escribirle.
ROLES_PERSONAL_ESTUDIANTE = ROLES_PERSONAL | {"padres"}

MAX_ASUNTO = 160
MAX_CONTENIDO = 4000
MAX_MENSAJES = 5000

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def _load() -> dict:
    if not MENSAJES_FILE.exists():
        return {}
    try:
        raw = json.loads(MENSAJES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return raw if isinstance(raw, dict) else {}


def _save(data: dict) -> None:
    write_json_atomic(MENSAJES_FILE, data, mode=0o600)


def _email(v: Any) -> str:
    return str(v or "").strip().lower()


def _texto(v: Any, maxlen: int) -> str:
    return str(v if v is not None else "").strip()[:maxlen]


def _email_valido(v: Any) -> str:
    e = _email(v)
    return e if e and len(e) <= 160 and _EMAIL_RE.match(e) else ""


def _es_personal(rol: str) -> bool:
    return str(rol or "").strip().lower() in ROLES_PERSONAL


def _cuentas() -> dict:
    """Cuentas del sistema (accounts.json es la fuente de verdad de roles)."""
    try:
        from api.accounts import _load_accounts

        return _load_accounts()
    except Exception:
        return {}


def _nombre_de(email: str) -> str:
    cuenta = _cuentas().get(email)
    if isinstance(cuenta, dict):
        return _texto(cuenta.get("nombre") or email.split("@")[0], 120)
    return email.split("@")[0]


def _rol_de(email: str) -> str:
    cuenta = _cuentas().get(email)
    if isinstance(cuenta, dict):
        return _texto(cuenta.get("rol") or "estudiante", 30).lower()
    return ""


def _contacto_valido(destinatario: str, rol_usuario: str) -> str:
    """Valida que el destinatario exista y que el usuario pueda escribirle."""
    destino = _email_valido(destinatario)
    if not destino:
        raise HTTPException(status_code=400, detail="Destinatario inválido")
    cuentas = _cuentas()
    cuenta = cuentas.get(destino)
    if not isinstance(cuenta, dict) or cuenta.get("activo") is False:
        raise HTTPException(status_code=404, detail="El destinatario no existe")
    rol_destino = _texto(cuenta.get("rol") or "estudiante", 30).lower()
    if _es_personal(rol_usuario):
        return destino
    # El estudiante (o los padres) sólo escriben al personal del colegio.
    if rol_destino not in ROLES_PERSONAL_ESTUDIANTE:
        raise HTTPException(status_code=403, detail="No podés escribir a esa cuenta")
    return destino


# --------------------------------------------------------------------------
# Modelos
# --------------------------------------------------------------------------

class EnviarIn(BaseModel):
    destinatario: str = Field(..., min_length=3, max_length=160)
    asunto: str = Field("", max_length=MAX_ASUNTO)
    contenido: str = Field("", max_length=MAX_CONTENIDO)


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@router.get("/contactos")
def contactos(user: dict = Depends(require_auth)):
    """Cuentas a las que el usuario puede escribir."""
    mi = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    personal = _es_personal(rol)
    out = []
    for email, cuenta in _cuentas().items():
        e = _email(email)
        if not e or e == mi:
            continue
        if not isinstance(cuenta, dict) or cuenta.get("activo") is False:
            continue
        rol_destino = _texto(cuenta.get("rol") or "estudiante", 30).lower()
        if not personal and rol_destino not in ROLES_PERSONAL_ESTUDIANTE:
            continue
        out.append({
            "email": e,
            "nombre": _texto(cuenta.get("nombre") or e.split("@")[0], 120),
            "rol": rol_destino,
        })
    out.sort(key=lambda c: (c["rol"] != "docente", c["nombre"].lower()))
    return {"ok": True, "count": len(out), "contactos": out}


@router.get("/bandeja")
def bandeja(user: dict = Depends(require_auth)):
    """Conversaciones del usuario, con el último mensaje y los no leídos."""
    mi = _email(user.get("email"))
    data = _load()
    hilos: dict[str, dict] = {}
    for m in data.values():
        if not isinstance(m, dict):
            continue
        remitente = _email(m.get("remitente"))
        destinatario = _email(m.get("destinatario"))
        if mi not in (remitente, destinatario):
            continue
        otro = destinatario if remitente == mi else remitente
        h = hilos.setdefault(otro, {
            "email": otro,
            "nombre": _nombre_de(otro),
            "rol": _rol_de(otro),
            "ultimo": None,
            "no_leidos": 0,
            "total": 0,
        })
        h["total"] += 1
        if destinatario == mi and not m.get("leido"):
            h["no_leidos"] += 1
        if not h["ultimo"] or float(m.get("creado", 0)) > float(h["ultimo"].get("creado", 0)):
            h["ultimo"] = {
                "id": m.get("id"),
                "asunto": m.get("asunto", ""),
                "contenido": m.get("contenido", ""),
                "creado": m.get("creado", 0),
                "de": remitente,
            }
    conversaciones = list(hilos.values())
    conversaciones.sort(key=lambda h: float((h["ultimo"] or {}).get("creado", 0)), reverse=True)
    return {"ok": True, "count": len(conversaciones), "conversaciones": conversaciones}


@router.get("/conversacion/{contacto}")
def conversacion(contacto: str, user: dict = Depends(require_auth)):
    """Mensajes entre el usuario y `contacto` (en orden cronológico)."""
    mi = _email(user.get("email"))
    otro = _email_valido(contacto)
    if not otro:
        raise HTTPException(status_code=400, detail="Contacto inválido")
    data = _load()
    items = []
    for m in data.values():
        if not isinstance(m, dict):
            continue
        remitente = _email(m.get("remitente"))
        destinatario = _email(m.get("destinatario"))
        if {remitente, destinatario} != {mi, otro}:
            continue
        items.append(m)
    items.sort(key=lambda m: float(m.get("creado", 0)))
    # Abrir la conversación marca como leídos los mensajes recibidos.
    for m in items:
        if _email(m.get("destinatario")) == mi and not m.get("leido"):
            m["leido"] = True
    if items:
        _save(data)
        audit_write("mensajes.leer", mi, otro)
    return {
        "ok": True,
        "contacto": {"email": otro, "nombre": _nombre_de(otro), "rol": _rol_de(otro)},
        "mensajes": items,
    }


@router.post("/enviar", status_code=201)
def enviar(payload: EnviarIn, user: dict = Depends(require_auth)):
    """Envía un mensaje."""
    mi = _email(user.get("email"))
    rol = str(user.get("rol") or "")
    # El autoenvío se valida ANTES que el permiso: el error es más claro
    # ("no te escribas a vos") que un 403 genérico de permisos.
    if _email(payload.destinatario) == mi:
        raise HTTPException(status_code=400, detail="No podés escribirte a vos mismo")
    destino = _contacto_valido(payload.destinatario, rol)
    asunto = _texto(payload.asunto, MAX_ASUNTO) or "(sin asunto)"
    contenido = _texto(payload.contenido, MAX_CONTENIDO)
    if not contenido:
        raise HTTPException(status_code=400, detail="El mensaje está vacío")
    data = _load()
    if len(data) >= MAX_MENSAJES:
        raise HTTPException(status_code=409, detail="Se alcanzó el máximo de mensajes")
    mid = uuid.uuid4().hex[:12]
    msg = {
        "id": mid,
        "remitente": mi,
        "remitente_nombre": _nombre_de(mi),
        "destinatario": destino,
        "asunto": asunto,
        "contenido": contenido,
        "creado": time.time(),
        "leido": False,
    }
    data[mid] = msg
    _save(data)
    audit_write("mensajes.enviar", mi, destino)
    # Notificación push opcional al destinatario
    try:
        send_push(destino, f"Nuevo mensaje: {asunto}", f"De: {_nombre_de(mi)}", url="/#app=mensajes")
    except Exception:
        pass
    return {"ok": True, "id": mid, "mensaje": msg}


@router.post("/{mensaje_id}/leer")
def marcar_leido(mensaje_id: str, user: dict = Depends(require_auth)):
    """Marca un mensaje como leído (sólo su destinatario)."""
    mi = _email(user.get("email"))
    data = _load()
    msg = data.get(mensaje_id)
    if not isinstance(msg, dict):
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    if _email(msg.get("destinatario")) != mi:
        raise HTTPException(status_code=403, detail="No podés marcar este mensaje")
    msg["leido"] = True
    _save(data)
    return {"ok": True, "mensaje": msg}


@router.delete("/{mensaje_id}")
def borrar(mensaje_id: str, user: dict = Depends(require_auth)):
    """Borra un mensaje: el remitente o el personal con permiso de eliminar."""
    mi = _email(user.get("email"))
    data = _load()
    msg = data.get(mensaje_id)
    if not isinstance(msg, dict):
        raise HTTPException(status_code=404, detail="Mensaje no encontrado")
    rol = str(user.get("rol") or "")
    es_remitente = _email(msg.get("remitente")) == mi
    if not es_remitente and rol not in {"admin", "director", "subdirector"}:
        raise HTTPException(status_code=403, detail="No podés borrar este mensaje")
    data.pop(mensaje_id, None)
    _save(data)
    audit_write("mensajes.borrar", mi, mensaje_id)
    return {"ok": True}
