"""Dependencias compartidas de la API.

Aquí viven los singletones perezosos: el proveedor de música, el cliente
HTTP saliente reutilizable, el single-flight y los límites por IP.
"""

from __future__ import annotations

import os
from typing import Optional

import httpx
from dotenv import load_dotenv

from core.cache import SingleFlight
from core.config import get_settings
from core.limits import RateLimiter
from services.provider import MusicProvider
from services.ytmusic_service import YouTubeMusicService

load_dotenv()

_AUTH_FILE = os.getenv("YTMUSIC_AUTH_FILE", "auth.json")
_ALLOW_ANONYMOUS = os.getenv("YTMUSIC_ALLOW_ANONYMOUS", "true").lower() != "false"

_service: Optional[YouTubeMusicService] = None
_http: Optional[httpx.AsyncClient] = None
_flight: Optional[SingleFlight] = None
_limiter_global: Optional[RateLimiter] = None
_limiter_stream: Optional[RateLimiter] = None


def get_service() -> YouTubeMusicService:
    """Singleton perezoso del proveedor de música."""
    global _service
    if _service is None:
        cfg = get_settings()
        _service = YouTubeMusicService(
            auth_file=_AUTH_FILE,
            allow_anonymous=_ALLOW_ANONYMOUS,
            stream_cache_size=cfg.stream_cache_size,
            stream_cache_ttl=float(cfg.stream_cache_ttl),
            search_cache_size=cfg.search_cache_size,
            search_cache_ttl=float(cfg.search_cache_ttl),
        )
    return _service


def get_provider() -> MusicProvider:
    """El mismo servicio, pero tipado contra la interfaz (bloque B5)."""
    return get_service()


def get_http_client() -> httpx.AsyncClient:
    """Cliente HTTP asíncrono **reutilizable** del proxy de streaming.

    Un solo cliente para toda la app: mantiene el pool de conexiones y
    evita abrir un handshake TLS por cada petición Range del reproductor
    (que llegan cada pocos segundos). Sin redirrecciones automáticas: el
    proxy valida cada `Location` contra la lista blanca (anti-SSRF).
    """
    global _http
    cfg = get_settings()
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient(
            follow_redirects=False,
            timeout=httpx.Timeout(
                cfg.stream_timeout,
                connect=min(10.0, cfg.stream_timeout),
                pool=min(5.0, cfg.stream_timeout),
            ),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
    return _http


async def close_http_client() -> None:
    """Cierra el cliente en el shutdown de la app."""
    global _http
    if _http is not None and not _http.is_closed:
        await _http.aclose()
    _http = None


def get_single_flight() -> SingleFlight:
    global _flight
    if _flight is None:
        _flight = SingleFlight()
    return _flight


def get_rate_limiter(kind: str = "global") -> RateLimiter:
    """Límite por IP. `kind`: `global` o `stream`."""
    global _limiter_global, _limiter_stream
    cfg = get_settings()
    if kind == "stream":
        if _limiter_stream is None:
            _limiter_stream = RateLimiter.from_spec(cfg.rate_limit_stream)
        return _limiter_stream
    if _limiter_global is None:
        _limiter_global = RateLimiter.from_spec(cfg.rate_limit)
    return _limiter_global


def reset_dependencies() -> None:
    """Sólo para tests: limpia los singletones."""
    global _service, _flight, _limiter_global, _limiter_stream
    _service = None
    _flight = None
    _limiter_global = None
    _limiter_stream = None
