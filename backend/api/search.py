"""GET /api/music/search — búsqueda unificada en YouTube Music."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from api.deps import get_service

router = APIRouter(prefix="/api/music", tags=["search"])

_VALID_FILTERS = {"songs", "artists", "albums", "playlists", "all"}


@router.get("/search")
def search(
    q: str = Query(..., min_length=1, max_length=120, description="Texto a buscar"),
    filter: str = Query("all", description="songs | artists | albums | playlists | all"),
    limit: int = Query(20, ge=1, le=50),
) -> dict:
    if filter not in _VALID_FILTERS:
        raise HTTPException(status_code=400, detail=f"Filtro inválido: {filter}")
    try:
        return get_service().search(q, filter_type=None if filter == "all" else filter, limit=limit)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="YouTube Music no está disponible") from exc
