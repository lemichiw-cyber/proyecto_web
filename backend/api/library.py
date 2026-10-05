"""Endpoints de biblioteca e historial (requieren autenticación)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.deps import get_service

router = APIRouter(prefix="/api/music", tags=["library"])


@router.get("/library")
def get_library(limit: int = Query(50, ge=1, le=200)) -> dict:
    try:
        return get_service().get_library(limit=limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Biblioteca no disponible: requiere autenticación") from exc


@router.get("/history")
def get_history(limit: int = Query(50, ge=1, le=200)) -> dict:
    try:
        return {"tracks": get_service().get_history(limit=limit)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Historial no disponible: requiere autenticación") from exc
