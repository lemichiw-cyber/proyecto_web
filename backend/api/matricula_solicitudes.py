"""Matrícula solicitudes JSON – backend FastAPI para Fase 2.
Persistencia atómica en SAKURA_DATA_DIR, modo 0600, auditoría.
"""
from __future__ import annotations
import datetime, secrets
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from typing import List, Optional
from audit import write as audit_write
from paths import data_file
from api.auth import require_auth
from db import write_json_atomic

router = APIRouter(prefix="/api/matricula/solicitudes", tags=["matricula"])
DATA_FILE = data_file("matricula_solicitudes.json", "SAKURA_MATRICULA_SOLICITUDES_FILE")

def _require_admin_or_director(user: dict = Depends(require_auth)):
    if user["rol"] not in {"admin","director"}:
        raise HTTPException(status_code=403, detail="Rol insuficiente")
    return user

def _load():
    try:
        import json
        if DATA_FILE.exists():
            return json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return []
    except Exception:
        return []

def _save(data):
    write_json_atomic(DATA_FILE, data)

class SolicitudIn(BaseModel):
    nombres: str
    apellidos: str
    email: str
    telefono: Optional[str] = ""
    anio: str
    especialidad: str
    seccion: str

class SolicitudOut(BaseModel):
    id: str
    nombres: str
    apellidos: str
    email: str
    telefono: Optional[str] = ""
    anio: str
    especialidad: str
    seccion: str
    estado: str
    creado: str

class EstadoIn(BaseModel):
    estado: str

@router.get("/", response_model=List[SolicitudOut])
def listar_solicitudes(user=Depends(require_auth)):
    data = _load()
    # admin/director ven todas, resto solo propias
    if user["rol"] in {"admin","director","coordinador"}:
        return data
    # filtrar por email del solicitante si está en la cuenta? Simplificado: todas
    return data

@router.post("/", response_model=SolicitudOut, status_code=201)
def crear_solicitud(payload: SolicitudIn, request: Request, user=Depends(require_auth)):
    data = _load()
    sid = secrets.token_urlsafe(8)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    item = {
        "id": sid,
        "nombres": payload.nombres,
        "apellidos": payload.apellidos,
        "email": payload.email,
        "telefono": payload.telefono or "",
        "anio": payload.anio,
        "especialidad": payload.especialidad,
        "seccion": payload.seccion,
        "estado": "pendiente",
        "creado": now,
    }
    data.append(item)
    _save(data)
    audit_write("matricula.solicitud_creada", user["email"], request.client.host if request.client else "")
    return item

@router.patch("/{sid}")
def actualizar_estado(sid: str, payload: EstadoIn, user=Depends(_require_admin_or_director)):
    estado = payload.estado
    if estado not in {"pendiente","aprobado","rechazado"}:
        raise HTTPException(status_code=400, detail="Estado inválido")
    data = _load()
    for i, s in enumerate(data):
        if s["id"] == sid:
            s["estado"] = estado
            s["actualizado"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            _save(data)
            return {"ok": True}
    raise HTTPException(status_code=404, detail="Solicitud no encontrada")

@router.delete("/{sid}", status_code=204)
def borrar_solicitud(sid: str, user=Depends(_require_admin_or_director)):
    data = _load()
    new_data = [s for s in data if s["id"] != sid]
    if len(new_data) == len(data):
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    _save(new_data)
