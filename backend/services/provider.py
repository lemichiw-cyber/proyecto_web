"""Abstracción de proveedores de música (contrato §5, bloque B5).

`MusicProvider` es la interfaz que debe cumplir cualquier fuente de la que
salgan canciones. Hoy sólo hay una implementación (`YouTubeMusicService`,
vía ytmusicapi + yt-dlp), pero el objetivo es poder añadir después
fuentes con licencia abregada (Jamendo, Free Music Archive, Audius,
SoundCloud con API oficial…) **sin tocar las rutas**.

Ningún proveedor nuevo entra todavía: esto sólo deja la estructura lista.

Errores: cada proveedor lanza :class:`ProviderError` (o una subclase) y
las rutas lo traducen al formato uniforme del contrato (502/504).
"""

from __future__ import annotations

from typing import Optional, Protocol, runtime_checkable


class ProviderError(Exception):
    """El proveedor falló. Equivale a `502 provider_error`."""


class ProviderTimeout(ProviderError):
    """El proveedor no contestó a tiempo. Equivale a `504 timeout`."""


class ProviderNotFound(ProviderError):
    """El proveedor no tiene ese recurso. Equivale a `404 not_found`."""


@runtime_checkable
class MusicProvider(Protocol):
    """Superficie mínima que debe cumplir un proveedor de música."""

    #: Identificador corto, se usa en logs y en `source`.
    name: str

    def search(self, query: str, filter_type: Optional[str] = None, limit: int = 20) -> dict:
        """Búsqueda. Devuelve `{songs, artists, albums, playlists}`."""
        ...

    def get_stream(self, video_id: str) -> Optional[dict]:
        """`{url, headers}` del audio, o None si no hay stream.

        Debe ser **síncrono**: el hilo de trabajo lo decide la ruta.
        """
        ...

    def get_artist(self, browse_id: str) -> dict:
        """Artista con `songs`, `albums`, `singles`, `videos`."""
        ...

    def get_album(self, browse_id: str) -> dict:
        """Álbum con `tracks`."""
        ...

    def get_playlist(self, playlist_id: str, limit: int = 100) -> dict:
        """Playlist con `tracks`."""
        ...


def is_music_provider(candidate: object) -> bool:
    """Comprueba en tiempo de ejecución que un objeto cumple la interfaz."""
    return isinstance(candidate, MusicProvider)
