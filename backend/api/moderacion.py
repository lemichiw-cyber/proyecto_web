"""Moderación de foros (P2): reporte + cola admin. Persistencia JSON atómica."""
from __future__ import annotations
import time, secrets
from pathlib import Path
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from api.auth import require_auth
from audit import write as audit_write
from db import write_json_atomic

router = APIRouter(prefix="/api/moderacion", tags=["moderacion"])
BASE_DIR = Path(__file__).parent.parent
REPORTES_FILE = BASE_DIR / "foro_reportes.json"

def _load() -> dict:
    if not REPORTES_FILE.exists():
        return {}
    try:
        import json
        d = json.loads(REPORTES_FILE.read_text(encoding="utf-8"))
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

def _save(d: dict) -> None:
    write_json_atomic(REPORTES_FILE, d, mode=0o600)

class ReportIn(BaseModel):
    foro_id: str
    mensaje_id: str = ""
    motivo: str = ""

from api.admin import require_admin

@router.post("/report", status_code=201)
def report(payload: ReportIn, user: dict = Depends(require_auth)):
    foro_id = (payload.foro_id or "").strip()[:80]
    if not foro_id:
        raise HTTPException(status_code=400, detail="foro_id requerido")
    rep = _load()
    rid = secrets.token_urlsafe(8)
    rep[rid] = {
        "id": rid, "foro_id": foro_id, "mensaje_id": (payload.mensaje_id or "")[:80],
        "motivo": (payload.motivo or "")[:300], "denunciante": user["email"],
        "resuelto": False, "creado": time.time(),
    }
    _save(rep)
    audit_write("foro.report", user["email"], "")
    return {"ok": True, "id": rid}

@router.get("/cola")
def cola(_admin: str = Depends(require_admin)):
    rep = _load()
    pendientes = [v for v in rep.values() if not v.get("resuelto")]
    return {"ok": True, "pendientes": pendientes, "count": len(pendientes)}

@router.post("/resolver/{rid}")
def resolver(rid: str, _admin: str = Depends(require_admin)):
    rep = _load()
    if rid not in rep:
        raise HTTPException(status_code=404, detail="reporte no encontrado")
    rep[rid]["resuelto"] = True
    _save(rep)
    audit_write("foro.resolver", _admin, "")
    return {"ok": True}
