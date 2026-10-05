"""Endpoints de álbumes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.deps import get_service

router = APIRouter(prefix="/api/music", tags=["albums"])


@router.get("/album/{browse_id}")
def get_album(browse_id: str) -> dict:
    try:
        return get_service().get_album(browse_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Álbum no encontrado") from exc
