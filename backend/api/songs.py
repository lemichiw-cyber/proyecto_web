"""Endpoints de canciones: metadatos, streaming (proxy con Range) y recomendaciones."""

from __future__ import annotations

import requests
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from api.deps import get_service

router = APIRouter(prefix="/api/music", tags=["songs"])

_CHUNK = 64 * 1024


@router.get("/song/{video_id}")
def get_song(video_id: str, request: Request) -> dict:
    try:
        return get_service().get_song(video_id)
    except Exception as exc:  # noqa: BLE001
        if request.query_params.get("debug"):
            raise HTTPException(
                status_code=404,
                detail=f"Canción no encontrada — {type(exc).__name__}: {exc}",
            ) from exc
        raise HTTPException(status_code=404, detail="Canción no encontrada") from exc


@router.get("/stream/{video_id}")
def stream_song(video_id: str, request: Request):
    """Proxy de streaming con soporte Range.

    El backend obtiene una URL fresca de YouTube Music y reenvía los
    bytes con cabeceras CORS, de modo que el elemento <audio> del
    navegador puede alimentar el grafo Web Audio (EQ, mezclador y
    visualizador) y el seek funciona con peticiones Range.
    """
    try:
        errores: list = []
        media = get_service().get_stream_media(video_id, errors=errores)
    except Exception as exc:  # noqa: BLE001
        if request.query_params.get("debug"):
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo obtener el stream — {type(exc).__name__}: {exc}",
            ) from exc
        raise HTTPException(status_code=502, detail="No se pudo obtener el stream") from exc
    if not media or not media.get("url"):
        # ?debug=1 expone el motivo de cada intento (solo diagnóstico).
        detalle = "Stream no disponible para esta canción"
        if request.query_params.get("debug") and errores:
            detalle += " — " + " | ".join(e[:300] for e in errores[:6])
        raise HTTPException(status_code=404, detail=detalle)

    # YouTube exige el mismo User-Agent con el que se extrajo la URL
    fwd = dict(media.get("headers") or {})
    rng = request.headers.get("range")
    if rng:
        fwd["Range"] = rng
    try:
        resp = requests.get(media["url"], headers=fwd, stream=True, timeout=30)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudo contactar con YouTube Music") from exc
    if resp.status_code not in (200, 206):
        resp.close()
        raise HTTPException(status_code=502, detail="YouTube Music rechazó la petición")

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": resp.headers.get("Content-Type", "audio/mpeg"),
        "Cache-Control": "no-store",
    }
    if resp.status_code == 206 and resp.headers.get("Content-Range"):
        headers["Content-Range"] = resp.headers["Content-Range"]
    if resp.headers.get("Content-Length"):
        headers["Content-Length"] = resp.headers["Content-Length"]

    def gen():
        try:
            for chunk in resp.iter_content(chunk_size=_CHUNK):
                if chunk:
                    yield chunk
        finally:
            resp.close()

    return StreamingResponse(gen(), status_code=resp.status_code, headers=headers)


@router.get("/recommendations")
def recommendations(limit: int = Query(20, ge=1, le=50)) -> dict:
    try:
        return {"tracks": get_service().get_recommendations(limit=limit)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No hay recomendaciones disponibles") from exc


@router.get("/watch-playlist/{video_id}")
def watch_playlist(video_id: str, request: Request, limit: int = Query(25, ge=1, le=100)) -> dict:
    """Mix tipo 'Radio' a partir de una canción (no requiere auth)."""
    try:
        return {"tracks": get_service().get_watch_playlist(video_id, limit=limit)}
    except Exception as exc:  # noqa: BLE001
        if request.query_params.get("debug"):
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo generar la cola — {type(exc).__name__}: {exc}",
            ) from exc
        raise HTTPException(status_code=502, detail="No se pudo generar la cola") from exc
