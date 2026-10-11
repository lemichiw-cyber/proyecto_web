"""Endpoints de canciones: metadatos, streaming (proxy con Range) y recomendaciones.

El proxy de `/stream` es la parte sensible del backend:

- valida el **id** antes de tocar la red (anti path-traversal / SSRF);
- aplica **límite por IP**;
- agrupa peticiones simultáneas del mismo id en **una sola** extracción
  (single-flight) y cachea el resultado en un LRU;
- comprueba que la URL resuelta por el proveedor esté en la **lista
  blanca** de hosts, y hace lo mismo con cada **redirección**;
- reenvía **sólo** `Range` y `User-Agent`; nunca refleja cabeceras del
  cliente;
- limita los **bytes** por petición y los **timeouts**.

Contrato: `docs/SAKURA_API.md` §5.4 y §5.6.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from api.deps import get_http_client, get_rate_limiter, get_service, get_single_flight
from core.config import get_settings
from core.errors import (
    NOT_FOUND,
    PROVIDER_ERROR,
    TIMEOUT,
    ApiError,
    request_id_of,
)
from core.ids import is_valid_video_id
from core.limits import client_ip
from core.net import allowed_url_from_location, forward_headers, host_allowed

log = logging.getLogger("sakura.stream")

router = APIRouter(prefix="/api/music", tags=["songs"])

_CHUNK = 64 * 1024
_MAX_REDIRECTS = 3


def _timed(request: Request, started: float, *, extra: str = "") -> None:
    """Log estructurado por petición (contrato §5.8)."""
    log.info(
        "request id=%s path=%s ms=%d %s",
        request_id_of(request),
        request.url.path,
        int((time.perf_counter() - started) * 1000),
        extra,
    )


async def _resolve_media(video_id: str, errors: List[str]) -> Optional[dict]:
    """Extracción con single-flight: N peticiones del mismo id → 1 extracción."""
    service = get_service()
    flight = get_single_flight()

    def work() -> Optional[dict]:
        return service.get_stream_media(video_id, errors=errors)

    return await flight.run(f"stream:{video_id}", work)


def _require_valid_id(video_id: str) -> None:
    if not is_valid_video_id(video_id):
        raise ApiError("invalid_id", "Ese identificador no es válido", status_code=400)


@router.get("/song/{video_id}")
def get_song(video_id: str, request: Request) -> dict:  # noqa: ARG001
    _require_valid_id(video_id)
    try:
        return get_service().get_song(video_id)
    except Exception as exc:  # noqa: BLE001
        raise ApiError(NOT_FOUND, "Canción no encontrada", status_code=404) from exc


@router.get("/stream/{video_id}")
async def stream_song(video_id: str, request: Request) -> StreamingResponse:
    """Proxy de streaming con soporte Range y lista blanca de hosts."""
    started = time.perf_counter()
    cfg = get_settings()
    _require_valid_id(video_id)

    ip = client_ip(request.headers, request.client.host if request.client else None)
    get_rate_limiter("stream").check(ip)

    errors: List[str] = []
    media = await _resolve_media(video_id, errors)

    if not media or not media.get("url"):
        detalle = "Stream no disponible para esta canción"
        if cfg.debug_routes and errors:
            detalle += " — " + " | ".join(e[:300] for e in errors[:6])
        _timed(request, started, extra=f"resultado=sin_stream errores={len(errors)}")
        raise ApiError(NOT_FOUND, detalle, status_code=404)

    # Anti-SSRF: la URL sale del proveedor, pero aun así se valida contra
    # la lista blanca antes de abrir conexión.
    if not host_allowed(media["url"], cfg.stream_allowed_hosts):
        log.warning("ssrf_rechazado video=%s", video_id)
        _timed(request, started, extra="resultado=host_rechazado")
        raise ApiError(
            PROVIDER_ERROR, "YouTube Music no está disponible ahora mismo", status_code=502
        )

    out_headers = forward_headers(dict(request.headers), media.get("headers") or {})

    client = get_http_client()
    url = media["url"]
    upstream = None
    for _ in range(_MAX_REDIRECTS + 1):
        try:
            upstream = await client.send(
                client.build_request("GET", url, headers=out_headers), stream=True
            )
        except httpx.TimeoutException as exc:
            _timed(request, started, extra="resultado=timeout")
            raise ApiError(
                TIMEOUT, "El servidor tardó demasiado en responder", status_code=504
            ) from exc
        except httpx.HTTPError as exc:
            _timed(request, started, extra="resultado=error_red")
            raise ApiError(
                PROVIDER_ERROR,
                "YouTube Music no está disponible ahora mismo",
                status_code=502,
            ) from exc

        if upstream.status_code not in (301, 302, 303, 307, 308):
            break
        location = upstream.headers.get("location") or ""
        await upstream.aclose()
        next_url = allowed_url_from_location(location, url, cfg.stream_allowed_hosts)
        if not next_url:
            log.warning("ssrf_redireccion_rechazada video=%s", video_id)
            _timed(request, started, extra="resultado=redirect_rechazado")
            raise ApiError(
                PROVIDER_ERROR,
                "YouTube Music no está disponible ahora mismo",
                status_code=502,
            )
        url = next_url
    else:
        _timed(request, started, extra="resultado=redirecciones")
        raise ApiError(
            PROVIDER_ERROR, "YouTube Music no está disponible ahora mismo", status_code=502
        )

    if upstream is None or upstream.status_code not in (200, 206):
        if upstream is not None:
            await upstream.aclose()
        _timed(request, started, extra="resultado=upstream_4xx_5xx")
        raise ApiError(
            PROVIDER_ERROR, "YouTube Music no está disponible ahora mismo", status_code=502
        )

    resp_headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": upstream.headers.get("content-type") or "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Request-Id": request_id_of(request),
    }
    if upstream.status_code == 206 and upstream.headers.get("content-range"):
        resp_headers["Content-Range"] = upstream.headers["content-range"]
    if upstream.headers.get("content-length"):
        resp_headers["Content-Length"] = upstream.headers["content-length"]

    max_bytes = cfg.stream_max_bytes

    async def gen():
        sent = 0
        try:
            async for chunk in upstream.aiter_bytes(_CHUNK):
                if not chunk:
                    continue
                sent += len(chunk)
                if sent > max_bytes:
                    # Tope por petición (contrato §5.11). El navegador
                    # corta la pista y reintenta con Range, que encaja
                    # justo en el tope de la mayoría de canciones.
                    log.warning("tope_bytes alcanzado video=%s bytes>%d", video_id, max_bytes)
                    break
                yield chunk
        finally:
            await upstream.aclose()

    _timed(
        request,
        started,
        extra=f"resultado=stream status={upstream.status_code} cache={media.get('cached', '?')}",
    )
    return StreamingResponse(gen(), status_code=upstream.status_code, headers=resp_headers)


@router.get("/recommendations")
def recommendations(limit: int = Query(20, ge=1, le=50)) -> dict:
    try:
        return {"tracks": get_service().get_recommendations(limit=limit)}
    except Exception as exc:  # noqa: BLE001
        raise ApiError(
            PROVIDER_ERROR, "No hay recomendaciones disponibles", status_code=502
        ) from exc


@router.get("/watch-playlist/{video_id}")
def watch_playlist(video_id: str, limit: int = Query(25, ge=1, le=100)) -> dict:
    """Mix tipo 'Radio' a partir de una canción (no requiere auth)."""
    _require_valid_id(video_id)
    try:
        return {"tracks": get_service().get_watch_playlist(video_id, limit=limit)}
    except Exception as exc:  # noqa: BLE001
        raise ApiError(PROVIDER_ERROR, "No se pudo generar la cola", status_code=502) from exc
