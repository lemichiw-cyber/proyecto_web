"""SABI – Sistema de Alertas y Comunicación Institucional. Fase 3.

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

router = APIRouter(prefix="/api/sabi", tags=["sabi"])
DATA_FILE = data_file("sabi_alertas.json", "SAKURA_SABI_ALERTAS_FILE")

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

class AlertaIn(BaseModel):
    titulo: str
    mensaje: str
    nivel: str = "info"
    destinatarios: Optional[List[str]] = None

class AlertaOut(BaseModel):
    id: str
    titulo: str
    mensaje: str
    nivel: str
    destinatarios: List[str]
    creador: str
    creado: str

def _require_admin_or_director(user: dict = Depends(require_auth)):
    if user["rol"] not in {"admin","director"}:
        raise HTTPException(status_code=403, detail="Rol insuficiente")
    return user

@router.get("/", response_model=List[AlertaOut])
def listar(user=Depends(require_auth)):
    return _load()

@router.post("/", response_model=AlertaOut, status_code=201)
def crear(payload: AlertaIn, user=Depends(_require_admin_or_director)):
    data = _load()
    item = {
        "id": secrets.token_urlsafe(8),
        "titulo": payload.titulo,
        "mensaje": payload.mensaje,
        "nivel": payload.nivel if payload.nivel in {"info","alerta","urgente"} else "info",
        "destinatarios": payload.destinatarios or [],
        "creador": user["email"],
        "creado": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    data.append(item)
    _save(data)
    audit_write("sabi.alerta_creada", user["email"], "")
    return item

@router.delete("/{aid}", status_code=204)
def borrar(aid: str, user=Depends(_require_admin_or_director)):
    data = _load()
    new_data = [a for a in data if a["id"] != aid]
    if len(new_data) == len(data):
        raise HTTPException(status_code=404, detail="No encontrada")
    _save(new_data)
