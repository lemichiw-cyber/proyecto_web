"""Colegio Protegido — reportes de incidentes de seguridad escolar.

La sección "Colegio Protegido" de la app estaba implementada pero
guardaba los reportes **sólo en el dispositivo** (localStorage) y su
feature flag estaba apagado porque, sin backend, un reporte no llegaba a
nadie. Ahora hay backend real con autenticación: los incidentes se
guardan en el servidor y los ve el personal docente.

Reglas:

* Reportar: cualquier usuario autenticado (incluso un estudiante).
* Ver: el autor ve sus propios incidentes; el personal docente
  (docente, coordinador, director, subdirector, admin) ve TODOS.
* Borrar: el autor o el personal docente.
* Resolver (marcar como atendido): sólo el personal docente.

Persistencia: JSON atómico en el directorio de datos (`SAKURA_DATA_DIR`),
modo 0600. Cada acción queda en el log de auditoría (`audit.log`).
"""

from __future__ import annotations

import json
import secrets
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import require_auth
from audit import write as audit_write
from db import write_json_atomic
from paths import data_file

router = APIRouter(prefix="/api/protegido", tags=["protegido"])

INCIDENTES_FILE = data_file("protegido_incidentes.json")

# Personal que atiende los reportes (además del autor).
ROLES_GESTION = {"admin", "director", "subdirector", "coordinador", "docente"}

MAX_TIPO = 80
MAX_DESC = 2000


def _load() -> dict:
    if not INCIDENTES_FILE.exists():
        return {}
    try:
        d = json.loads(INCIDENTES_FILE.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def _save(d: dict) -> None:
    write_json_atomic(INCIDENTES_FILE, d, mode=0o600)


def _es_gestor(rol: str) -> bool:
    return str(rol or "").strip().lower() in ROLES_GESTION


class IncidenteIn(BaseModel):
    tipo: str = Field(..., min_length=1, max_length=MAX_TIPO)
    desc: str = Field("", max_length=MAX_DESC)
    urgente: bool = False


@router.post("/incidentes", status_code=201)
def reportar(payload: IncidenteIn, user: dict = Depends(require_auth)):
    """Crea un reporte de incidente."""
    tipo = (payload.tipo or "").strip()[:MAX_TIPO]
    desc = (payload.desc or "").strip()[:MAX_DESC]
    if not tipo:
        raise HTTPException(status_code=400, detail="Falta el tipo de incidente")
    inc = _load()
    iid = secrets.token_urlsafe(8)
    inc[iid] = {
        "id": iid,
        "tipo": tipo,
        "desc": desc,
        "urgente": bool(payload.urgente),
        "autor": user["email"],
        "autor_rol": user.get("rol", "estudiante"),
        "estado": "pendiente",
        "resuelto_por": "",
        "creado": time.time(),
        "resuelto": None,
    }
    _save(inc)
    audit_write("protegido.reportar", user["email"], "")
    return {"ok": True, "id": iid, "incidente": inc[iid]}


@router.get("/incidentes")
def listar(user: dict = Depends(require_auth)):
    """Lista los incidentes: todos para el personal docente, los propios para el resto."""
    inc = _load()
    items = list(inc.values())
    if not _es_gestor(user.get("rol", "")):
        items = [i for i in items if i.get("autor") == user["email"]]
    items.sort(key=lambda i: i.get("creado", 0), reverse=True)
    return {"ok": True, "count": len(items), "incidentes": items, "gestion": _es_gestor(user.get("rol", ""))}


@router.delete("/incidentes/{iid}")
def borrar(iid: str, user: dict = Depends(require_auth)):
    """Borra un incidente: el autor o el personal docente."""
    inc = _load()
    if iid not in inc:
        raise HTTPException(status_code=404, detail="Incidente no encontrado")
    if inc[iid].get("autor") != user["email"] and not _es_gestor(user.get("rol", "")):
        raise HTTPException(status_code=403, detail="No podés borrar este reporte")
    inc.pop(iid, None)
    _save(inc)
    audit_write("protegido.borrar", user["email"], iid)
    return {"ok": True}


@router.post("/incidentes/{iid}/resolver")
def resolver(iid: str, user: dict = Depends(require_auth)):
    """Marca el incidente como atendido. Sólo el personal docente."""
    if not _es_gestor(user.get("rol", "")):
        raise HTTPException(status_code=403, detail="Sólo el personal docente puede resolver reportes")
    inc = _load()
    if iid not in inc:
        raise HTTPException(status_code=404, detail="Incidente no encontrado")
    inc[iid]["estado"] = "resuelto"
    inc[iid]["resuelto"] = time.time()
    inc[iid]["resuelto_por"] = user["email"]
    _save(inc)
    audit_write("protegido.resolver", user["email"], iid)
    return {"ok": True, "incidente": inc[iid]}
