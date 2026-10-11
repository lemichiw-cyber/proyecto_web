"""Configuración del backend leída de variables de entorno.

Toda variable es opcional: el backend arranca sin `.env`. Las que estén mal
formadas NO se ignoran en silencio — se lanza :class:`ConfigError` con un
mensaje claro y el proceso no arranca (contrato §5.5 y §5.11).

Nada de esto abre conexión de red: es sólo lectura de entorno.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import List, Optional, Tuple

DEFAULT_CORS_ORIGINS: Tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://lemichiw-cyber.github.io",
    "https://proyecto-web-2-bygl.onrender.com",
)

# Cualquier puerto local: en desarrollo el frontend se sirve con `vite`,
# `vite preview`, `serve` o `start.mjs`, todos en puertos distintos.
LOCAL_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?$"

_HOST_LOCAL = re.compile(r"^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$", re.I)
_ORIGIN = re.compile(r"^(https?)://([^/:\[]+|\[[0-9a-fA-F:]+\])(?::(\d{1,5}))?$", re.I)
_HOST_PATTERN = re.compile(r"^[A-Za-z0-9.*-]+$")


class ConfigError(RuntimeError):
    """Variable de entorno mal formada. El backend no debe arrancar."""


# ----------------------------------------------------------------------
# helpers de entorno
# ----------------------------------------------------------------------

def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} debe ser un número entero, llegó {raw!r}") from exc
    if not minimum <= value <= maximum:
        raise ConfigError(f"{name} debe estar entre {minimum} y {maximum}, llegó {value}")
    return value


def _env_float(name: str, default: float, *, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} debe ser un número, llegó {raw!r}") from exc
    if not minimum <= value <= maximum:
        raise ConfigError(f"{name} debe estar entre {minimum} y {maximum}, llegó {value}")
    return value


def _env_list(name: str) -> Optional[List[str]]:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return None
    return [item.strip() for item in raw.split(",") if item.strip()]


# ----------------------------------------------------------------------
# validación de orígenes CORS
# ----------------------------------------------------------------------

def validate_origin(origin: str) -> str:
    """Normaliza y valida un origen. Lanza :class:`ConfigError` si está mal.

    Reglas (contrato §5.5):
      - nada de comodines (`*`);
      - sin ruta: sólo protocolo + host (+ puerto);
      - `http://` únicamente si el host es local.
    """
    clean = origin.strip().rstrip("/")
    if not clean:
        raise ConfigError("Origen vacío en SAKURA_CORS_ORIGINS")
    if "*" in clean:
        raise ConfigError(
            f"SAKURA_CORS_ORIGINS no admite comodines: {origin!r}. Listá los orígenes exactos."
        )
    match = _ORIGIN.match(clean)
    if not match:
        raise ConfigError(
            f"Origen inválido en SAKURA_CORS_ORIGINS: {origin!r}. "
            "Formato esperado: https://host[:puerto]"
        )
    scheme, host, port = match.groups()
    scheme = scheme.lower()
    host = host.lower()
    if scheme == "http" and not _HOST_LOCAL.match(host):
        raise ConfigError(
            f"Origen inseguro en SAKURA_CORS_ORIGINS: {origin!r}. "
            "http:// sólo se permite en localhost, 127.0.0.1, 0.0.0.0 y [::1]."
        )
    if port is not None and not 1 <= int(port) <= 65535:
        raise ConfigError(f"Puerto inválido en el origen: {origin!r}")
    normalized = f"{scheme}://{host}"
    if port is not None:
        normalized += f":{port}"
    return normalized


def build_cors_origins(raw: Optional[List[str]], allow_localhost: bool) -> List[str]:
    """Lista exacta de orígenes permitidos (sin regex)."""
    entries = list(raw) if raw is not None else list(DEFAULT_CORS_ORIGINS)
    if not entries and not allow_localhost:
        raise ConfigError(
            "SAKURA_CORS_ORIGINS quedó vacío y SAKURA_ALLOW_LOCALHOST_ORIGINS=false: "
            "no habría ningún origen permitido."
        )
    origins: List[str] = []
    for entry in entries:
        normalized = validate_origin(entry)
        if normalized not in origins:
            origins.append(normalized)
    return origins


def validate_host_patterns(raw: List[str]) -> Tuple[str, ...]:
    """Valida la lista blanca de hosts del proxy de streaming (anti-SSRF)."""
    if not raw:
        raise ConfigError("SAKURA_STREAM_ALLOWED_HOSTS no puede quedar vacío")
    patterns: List[str] = []
    for pattern in raw:
        clean = pattern.strip().lower().rstrip(".")
        if not clean or not _HOST_PATTERN.match(clean):
            raise ConfigError(
                f"SAKURA_STREAM_ALLOWED_HOSTS contiene un patrón inválido: {pattern!r}"
            )
        if clean == "*" or clean == "*.*":
            raise ConfigError(
                f"SAKURA_STREAM_ALLOWED_HOSTS no admite el comodín {pattern!r}: eso anularía el anti-SSRF."
            )
        patterns.append(clean)
    return tuple(patterns)


# ----------------------------------------------------------------------
# settings
# ----------------------------------------------------------------------

@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: Tuple[str, ...] = DEFAULT_CORS_ORIGINS
    allow_localhost_origins: bool = True

    rate_limit: str = "120/minute"
    rate_limit_stream: str = "60/minute"

    stream_allowed_hosts: Tuple[str, ...] = ("*.googlevideo.com",)
    stream_timeout: float = 15.0
    stream_max_bytes: int = 50 * 1024 * 1024

    stream_cache_size: int = 256
    stream_cache_ttl: int = 600
    search_cache_size: int = 128
    search_cache_ttl: int = 120

    debug_routes: bool = False

    @property
    def local_origin_regex(self) -> Optional[str]:
        """Regex explícita de localhost, o None si se pidió apagarla."""
        return LOCAL_ORIGIN_REGEX if self.allow_localhost_origins else None


def load_settings() -> Settings:
    """Lee el entorno y valida. Lanza :class:`ConfigError` si algo está mal."""
    allow_localhost = _env_bool("SAKURA_ALLOW_LOCALHOST_ORIGINS", True)
    origins = build_cors_origins(_env_list("SAKURA_CORS_ORIGINS"), allow_localhost)
    hosts = validate_host_patterns(
        _env_list("SAKURA_STREAM_ALLOWED_HOSTS") or ["*.googlevideo.com"]
    )
    return Settings(
        host=_env("SAKURA_HOST", "127.0.0.1"),
        port=_env_int("SAKURA_PORT", 8000, minimum=1, maximum=65535)
        if os.getenv("SAKURA_PORT")
        else _env_int("PORT", 8000, minimum=1, maximum=65535),
        cors_origins=tuple(origins),
        allow_localhost_origins=allow_localhost,
        rate_limit=_env("SAKURA_RATE_LIMIT", "120/minute"),
        rate_limit_stream=_env("SAKURA_RATE_LIMIT_STREAM", "60/minute"),
        stream_allowed_hosts=hosts,
        stream_timeout=_env_float("SAKURA_STREAM_TIMEOUT", 15.0, minimum=1.0, maximum=120.0),
        stream_max_bytes=_env_int(
            "SAKURA_STREAM_MAX_BYTES", 50 * 1024 * 1024, minimum=64 * 1024, maximum=2 * 1024 ** 3
        ),
        stream_cache_size=_env_int("SAKURA_STREAM_CACHE_SIZE", 256, minimum=1, maximum=10000),
        stream_cache_ttl=_env_int("SAKURA_STREAM_CACHE_TTL", 600, minimum=1, maximum=86400),
        search_cache_size=_env_int("SAKURA_SEARCH_CACHE_SIZE", 128, minimum=1, maximum=10000),
        search_cache_ttl=_env_int("SAKURA_SEARCH_CACHE_TTL", 120, minimum=1, maximum=86400),
        debug_routes=_env_bool("SAKURA_DEBUG_ROUTES", False),
    )


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Singleton perezoso (se cachea tras el primer arranque)."""
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings


def reset_settings() -> None:
    """Sólo para tests: fuerza releer el entorno."""
    global _settings
    _settings = None
