"""Suscripciones y envío de notificaciones push — backend FastAPI.

Guarda suscripciones Push API en backend/subscriptions.json (misma estrategia
de archivo que accounts.py). El envío real usa pywebpush si está instalado;
si no, se guardan las suscripciones y se devuelve ok sin enviar (para no
bloquear el frontend).

Endpoints:
  POST   /api/push/suscribir     — guarda una suscripción (email + subscription)
  GET    /api/push/suscripciones — lista suscripciones (filtrar por email)
  POST   /api/push/enviar        — envía notificación a un email o a todas
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Header, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/push", tags=["push"])

BASE_DIR = Path(__file__).parent.parent  # .../proyecto_web/backend
# Las suscripciones push van al directorio de datos (ver backend/paths.py):
# en el servidor Debian el código es de sólo lectura.
from paths import data_file  # noqa: E402

SUBS_FILE = data_file("subscriptions.json")


def _load() -> dict:
    if not SUBS_FILE.exists():
        return {}
    try:
        data = json.loads(SUBS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save(data: dict) -> None:
    SUBS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class SuscripcionIn(BaseModel):
    email: str
    subscription: dict = Field(..., description="Objeto PushSubscription serializado")


class EnviarIn(BaseModel):
    email: Optional[str] = Field(None, description="Si se omite, envía a todas las suscripciones")
    titulo: str = Field("Cherry-Bomb", min_length=1)
    cuerpo: str = Field("")
    tag: str = Field("cherrybomb")
    url: str = Field("/")


@router.post("/suscribir", status_code=201)
def suscribir(payload: SuscripcionIn = Body(...)):
    email = payload.email.strip().lower()
    subs = _load()
    lista = subs.get(email, [])
    endpoint = payload.subscription.get("endpoint")
    if endpoint and endpoint not in [s.get("endpoint") for s in lista]:
        lista.append(payload.subscription)
        subs[email] = lista
        _save(subs)
    return {"ok": True}


@router.get("/suscripciones")
def listar(email: Optional[str] = Header(default=None)):
    subs = _load()
    if email:
        key = email.strip().lower()
        return {"email": key, "suscripciones": subs.get(key, [])}
    total = sum(len(v) for v in subs.values())
    return {"count": total, "suscripciones": subs}


@router.post("/enviar")
def enviar(payload: EnviarIn = Body(...)):
    subs = _load()
    targets = []
    if payload.email:
        targets = subs.get(payload.email.strip().lower(), [])
    else:
        for v in subs.values():
            targets.extend(v)

    # Intento de envío real con pywebpush (opcional).
    try:
        from pywebpush import webpush  # type: ignore
        vapid_private = os.getenv("VAPID_PRIVATE_KEY")
        if not vapid_private:
            return {
                "ok": False,
                "enviados": 0,
                "error": "VAPID_PRIVATE_KEY no configurada",
            }
        vapid_claims = {"sub": "mailto:admin@bachillerato.edu"}
        enviados = 0
        for sub in targets:
            webpush(
                subscription_info=sub,
                data=json.dumps({
                    "title": payload.titulo,
                    "body": payload.cuerpo,
                    "tag": payload.tag,
                    "url": payload.url,
                }),
                vapid_private_key=vapid_private,
                vapid_claims=vapid_claims,
            )
            enviados += 1
        return {"ok": True, "enviados": enviados}
    except ImportError:
        return {"ok": True, "enviados": 0, "nota": "pywebpush no instalado; suscripción guardada sin envío"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "enviados": 0, "error": str(exc)}
