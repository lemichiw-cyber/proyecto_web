"""Experiencias educativas – Fase 3.

Persistencia JSON atómica en SAKURA_DATA_DIR, modo 0600, auditoría.
"""
from __future__ import annotations
import datetime, secrets
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from api.auth import require_auth
from audit import write as audit_write
from paths import data_file
from db import write_json_atomic

router = APIRouter(prefix="/api/experiencias", tags=["experiencias"])
DATA_FILE = data_file("experiencias.json", "SAKURA_EXPERIENCIAS_FILE")

def _load() -> List[dict]:
    try:
        if DATA_FILE.exists():
            import json
            return json.loads(DATA_FILE.read_text(encoding="utf-8"))
        return []
    except Exception:
        return []

def _save(data: List[dict]) -> None:
    write_json_atomic(DATA_FILE, data)

class ExperienciaIn(BaseModel):
    titulo: str
    descripcion: str
    objetivo: Optional[str] = ""
    fecha_inicio: str
    fecha_fin: Optional[str] = ""

class ExperienciaOut(BaseModel):
    id: str
    titulo: str
    descripcion: str
    objetivo: str
    fecha_inicio: str
    fecha_fin: Optional[str]
    creador: str
    creado: str

@router.get("/", response_model=List[ExperienciaOut])
def listar(user=Depends(require_auth)):
    return _load()

@router.post("/", response_model=ExperienciaOut, status_code=201)
def crear(payload: ExperienciaIn, user=Depends(require_auth)):
    data = _load()
    item = {
        "id": secrets.token_urlsafe(8),
        "titulo": payload.titulo,
        "descripcion": payload.descripcion,
        "objetivo": payload.objetivo or "",
        "fecha_inicio": payload.fecha_inicio,
        "fecha_fin": payload.fecha_fin or "",
        "creador": user["email"],
        "creado": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    data.append(item)
    _save(data)
    audit_write("experiencias.creada", user["email"], "")
    return item

@router.delete("/{eid}", status_code=204)
def borrar(eid: str, user=Depends(require_auth)):
    data = _load()
    new_data = [x for x in data if x["id"] != eid]
    if len(new_data) == len(data):
        raise HTTPException(status_code=404, detail="No encontrada")
    if any(x["id"] == eid and x["creador"] != user["email"] and user["rol"] not in {"admin","director"} for x in data):
        raise HTTPException(status_code=403, detail="Sin permiso")
    _save(new_data)
