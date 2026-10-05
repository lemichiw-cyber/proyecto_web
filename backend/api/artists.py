"""Endpoints de artistas."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.deps import get_service

router = APIRouter(prefix="/api/music", tags=["artists"])


@router.get("/artist/{browse_id}")
def get_artist(browse_id: str) -> dict:
    try:
        return get_service().get_artist(browse_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Artista no encontrado") from exc
