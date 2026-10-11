"""Límite de peticiones por IP (contrato §5.6).

Token bucket en memoria, sin dependencias externas y sin estado
compartido entre procesos: sirve para frenar abuso, no para cuotas
multitenant. Si algún día hay más de un worker de uvicorn, cada proceso
lleva su propio contador (el límite efectivo se multiplica por el número
de workers) — está documentado en `docs/SAKURA_API.md`.

Cuando un cliente se pasa del límite se responde `429` con
`Retry-After: <segundos>` y el mensaje `rate_limited`.
"""

from __future__ import annotations

import re
import threading
import time
from typing import Dict, Optional, Tuple

from core.errors import RATE_LIMITED, ApiError

_LIMIT_RE = re.compile(r"^\s*(\d+)\s*/\s*(second|minute|hour|day)\s*$", re.I)

_SECONDS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}


def parse_limit(raw: str, default: Tuple[int, int] = (120, 60)) -> Tuple[int, int]:
    """Convierte `60/minute` en `(límite, ventana_en_segundos)`."""
    match = _LIMIT_RE.match(raw or "")
    if not match:
        return default
    amount = int(match.group(1))
    window = _SECONDS[match.group(2).lower()]
    if amount <= 0:
        return default
    return amount, window


class RateLimiter:
    """Token bucket por clave (normalmente la IP del cliente)."""

    def __init__(self, limit: int, window: int, *, max_keys: int = 20000) -> None:
        self.limit = limit
        self.window = window
        # 1 token por ventana: refill lineal, sin ráfagas acumuladas.
        self.rate = limit / float(window)
        self.max_keys = max_keys
        self._hits: Dict[str, Tuple[float, float]] = {}
        self._lock = threading.Lock()

    @classmethod
    def from_spec(cls, spec: str, *, default: Tuple[int, int] = (120, 60)) -> "RateLimiter":
        limit, window = parse_limit(spec, default)
        return cls(limit, window)

    def _evict_if_needed(self, now: float) -> None:
        if len(self._hits) < self.max_keys:
            return
        stale = [key for key, (_, tokens) in self._hits.items() if tokens >= self.limit]
        for key in stale[: len(stale) // 2 or 1]:
            self._hits.pop(key, None)

    def check(self, key: str) -> None:
        """Sube un token o lanza :class:`ApiError` 429."""
        now = time.monotonic()
        with self._lock:
            last, tokens = self._hits.get(key, (now, float(self.limit)))
            tokens = min(float(self.limit), tokens + (now - last) * self.rate)
            if tokens < 1.0:
                retry_after = max(1, int((1.0 - tokens) / self.rate) + 1)
                self._hits[key] = (now, tokens)
                raise ApiError(
                    RATE_LIMITED,
                    "Demasiadas peticiones: esperá un momento",
                    status_code=429,
                    headers={"Retry-After": str(retry_after)},
                )
            self._evict_if_needed(now)
            self._hits[key] = (now, tokens - 1.0)

    def reset(self, key: Optional[str] = None) -> None:
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


def client_ip(headers, client_host: Optional[str] = None) -> str:
    """IP del cliente.

    Se usa **sólo** `request.client.host`: `X-Forwarded-For` es spoofable
    desde el navegador, así que detrás de un proxy real hay que confiar
    en que el servidor front lo fija. Si no hay cliente (tests), se usa
    "local".
    """
    host = (client_host or "").strip()
    return host or "local"
