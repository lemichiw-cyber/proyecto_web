"""Caché LRU con TTL y combinación de peticiones (single-flight).

Antes la caché de URLs era un `dict` plano con un `if` de 10 minutos:
crecía sin límite en el tamaño y cada peta de Range de la misma canción
podía disparar su propia extracción con yt-dlp.

- `LRUCache` tiene **tamaño máximo** (evicta el menos usado) y **TTL**.
- `SingleFlight` agrupa peticiones concurrentes de la misma clave para
  que sólo una haga el trabajo; las demás esperan su resultado.

Todo configurable por variables de entorno (contrato §5.11).
"""

from __future__ import annotations

import threading
import time
from collections import OrderedDict
from typing import Any, Callable, Dict, Optional, Tuple

_MISS = object()


class LRUCache:
    """Caché thread-safe con límite de entradas y expiración."""

    def __init__(self, maxsize: int = 256, ttl: float = 600.0) -> None:
        self.maxsize = max(1, int(maxsize))
        self.ttl = float(ttl)
        self._data: "OrderedDict[str, Tuple[float, Any]]" = OrderedDict()
        self._lock = threading.Lock()
        self.hits = 0
        self.misses = 0

    def get(self, key: str, default: Any = None) -> Any:
        if self.ttl <= 0 or self.maxsize <= 0:
            return default
        with self._lock:
            entry = self._data.get(key, _MISS)
            if entry is _MISS:
                self.misses += 1
                return default
            expires_at, value = entry
            if time.monotonic() >= expires_at:
                self._data.pop(key, None)
                self.misses += 1
                return default
            self._data.move_to_end(key)
            self.hits += 1
            return value

    def peek(self, key: str, default: Any = None) -> Any:
        """Como `get` pero **sin** contar el acierto (para métricas)."""
        if self.ttl <= 0 or self.maxsize <= 0:
            return default
        with self._lock:
            entry = self._data.get(key, _MISS)
            if entry is _MISS:
                return default
            expires_at, value = entry
            if time.monotonic() >= expires_at:
                return default
            return value

    def set(self, key: str, value: Any) -> None:
        if self.ttl <= 0 or self.maxsize <= 0:
            return
        with self._lock:
            self._data[key] = (time.monotonic() + self.ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)

    def pop(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._data)

    def stats(self) -> dict:
        with self._lock:
            return {
                "size": len(self._data),
                "maxsize": self.maxsize,
                "ttl": self.ttl,
                "hits": self.hits,
                "misses": self.misses,
            }


class SingleFlight:
    """Agrupa trabajos concurrentes de la misma clave en un solo run.

    Se implementa con `asyncio.Lock` por clave (no con futures compartidos)
    para no dejar promesas sin consumir cuando el trabajo falla: la
    excepción se propaga sólo al que lanzó el trabajo y el resto espera y
    luego consulta la caché.
    """

    def __init__(self, max_locks: int = 2048) -> None:
        self.max_locks = max_locks
        self._locks: Dict[str, Any] = {}
        self.coalesced = 0

    def _clean(self) -> None:
        if len(self._locks) <= self.max_locks:
            return
        free = [key for key, lock in list(self._locks.items()) if not lock.locked()]
        for key in free[: len(free) // 2 or 1]:
            self._locks.pop(key, None)

    async def run(self, key: str, fn: Callable[[], Any]) -> Any:
        """Ejecuta `fn` (síncrono) en el threadpool, uno por clave a la vez.

        Si otra petición ya está ejecutando `fn` para esta clave, ésta
        espera en el mismo lock y en cuanto se libere consulta la caché
        desde el caller — así N peticiones simultáneas del mismo id
        producen **una sola** extracción.
        """
        import asyncio

        from starlette.concurrency import run_in_threadpool

        lock = self._locks.get(key)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[key] = lock
            self._clean()

        if lock.locked():
            self.coalesced += 1

        async with lock:
            return await run_in_threadpool(fn)
