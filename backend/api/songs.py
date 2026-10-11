"""Endpoints de canciones: metadatos, streaming (proxy con Range) y recomendaciones."""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from api.deps import get_service

router = APIRouter(prefix="/api/music", tags=["songs"])

_CHUNK = 64 * 1024

# ------------------------------------------------------------------
# Validación de id de vídeo de YouTube
# ------------------------------------------------------------------
# Un videoId de YouTube tiene exactamente 11 caracteres de [A-Za-z0-9_-].
# Cualquier otra cosa se rechaza antes de tocar YouTube (evita inyectar
# rutas/params arbitrarios contra el servicio de extracción).
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# ------------------------------------------------------------------
# Límites del proxy de streaming
# ------------------------------------------------------------------
# Tamaño máximo de una respuesta de stream (evita que un id «válido» pero
# con un contenido enorme agote memoria/ancho de banda del backend).
_MAX_STREAM_BYTES = 128 * 1024 * 1024  # 128 MiB
# Cabecera Range con este formato exacto; cualquier otra se ignora (416).
_RANGE_RE = re.compile(r"^bytes=\d*-\d*$")
# Dominios a los que se permite proxyar audio. Las URLs de YouTube Music
# viven en *.googlevideo.com; nada más se contacta (mitigación SSRF).
_STREAM_HOST_SUFFIXES = (".googlevideo.com",)


def _valid_stream_url(url: str) -> bool:
    """True sólo si `url` es https hacia un host de audio de YouTube."""
    try:
        p = urlparse(url)
    except Exception:  # noqa: BLE001
        return False
    if p.scheme != "https" or not p.hostname:
        return False
    host = p.hostname.lower()
    return any(host == sfx[1:] or host.endswith(sfx) for sfx in _STREAM_HOST_SUFFIXES)


# ------------------------------------------------------------------
# Rate limiting por IP (en memoria, por proceso) para /stream
# ------------------------------------------------------------------
# Ventana deslizante: como máximo _STREAM_RPM peticiones por minuto e IP.
# Cada worker/instancia mantiene su propio contador (suficiente para el
# despliegue actual; si se escala a varios workers habría que usar Redis).
_STREAM_RPM = 60
_window_seconds = 60.0
_hits: dict[str, deque] = defaultdict(deque)


def _rate_limit(ip: str) -> None:
    """Lanza HTTPException(429) si `ip` superó el límite de stream."""
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > _window_seconds:
        q.popleft()
    if len(q) >= _STREAM_RPM:
        raise HTTPException(status_code=429, detail="Demasiadas peticiones de stream, probá en unos segundos")
    q.append(now)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.get("/song/{video_id}")
def get_song(video_id: str, request: Request) -> dict:
    if not _VIDEO_ID_RE.match(video_id):
        raise HTTPException(status_code=400, detail="Identificador de canción no válido")
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
    """Proxy de streaming con soporte Range y controles de seguridad.

    El backend obtiene una URL fresca de YouTube Music y reenvía los
    bytes con cabeceras CORS, de modo que el elemento <audio> del
    navegador puede alimentar el grafo Web Audio (EQ, mezclador y
    visualizador) y el seek funciona con peticiones Range.

    Seguridad:
    - valida el formato del id (11 chars de YouTube) antes de tocar YouTube;
    - limita la tasa por IP (429 sobre el máximo);
    - valida la cabecera Range (416 si es basura);
    - comprueba que la URL de origen sea https de *.googlevideo.com (SSRF);
    - acota el tamaño de la respuesta (413 si supera el máximo).
    """
    if not _VIDEO_ID_RE.match(video_id):
        raise HTTPException(status_code=400, detail="Identificador de canción no válido")

    _rate_limit(_client_ip(request))

    rng = request.headers.get("range")
    if rng and not _RANGE_RE.match(rng.strip()):
        raise HTTPException(status_code=416, detail="Cabecera Range no válida")

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

    stream_url = media["url"]
    # Mitigación SSRF: sólo se proxya audio de hosts de YouTube.
    if not _valid_stream_url(stream_url):
        raise HTTPException(status_code=502, detail="URL de stream no permitida")

    # YouTube exige el mismo User-Agent con el que se extrajo la URL
    fwd = dict(media.get("headers") or {})
    if rng:
        fwd["Range"] = rng
    try:
        resp = requests.get(stream_url, headers=fwd, stream=True, timeout=30)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudo contactar con YouTube Music") from exc
    if resp.status_code not in (200, 206):
        resp.close()
        raise HTTPException(status_code=502, detail="YouTube Music rechazó la petición")

    # Acota el tamaño: si el upstream anuncia más que el máximo, corta.
    upstream_len = resp.headers.get("Content-Length")
    if upstream_len and upstream_len.isdigit() and int(upstream_len) > _MAX_STREAM_BYTES:
        resp.close()
        raise HTTPException(status_code=413, detail="Contenido demasiado grande")

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": resp.headers.get("Content-Type", "audio/mpeg"),
        "Cache-Control": "no-store",
    }
    if resp.status_code == 206 and resp.headers.get("Content-Range"):
        headers["Content-Range"] = resp.headers["Content-Range"]
    if upstream_len:
        headers["Content-Length"] = upstream_len

    def gen():
        sent = 0
        try:
            for chunk in resp.iter_content(chunk_size=_CHUNK):
                if not chunk:
                    continue
                sent += len(chunk)
                if sent > _MAX_STREAM_BYTES:
                    break
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
    if not _VIDEO_ID_RE.match(video_id):
        raise HTTPException(status_code=400, detail="Identificador de canción no válido")
    try:
        return {"tracks": get_service().get_watch_playlist(video_id, limit=limit)}
    except Exception as exc:  # noqa: BLE001
        if request.query_params.get("debug"):
            raise HTTPException(
                status_code=502,
                detail=f"No se pudo generar la cola — {type(exc).__name__}: {exc}",
            ) from exc
        raise HTTPException(status_code=502, detail="No se pudo generar la cola") from exc
