"""
YouTubeMusicService — capa de abstracción sobre ytmusicapi.

El frontend NUNCA ve la estructura interna de ytmusicapi: todos los
métodos devuelven diccionarios planos y normalizados.

Autenticación:
  - Si existe YTMUSIC_AUTH_FILE (auth.json) se usa para la biblioteca,
    playlists del usuario e historial.
  - Sin auth.json funciona en modo invitado (búsqueda, artistas,
    álbumes, playlists públicas y streaming).
"""

from __future__ import annotations

import os
import shutil
import time
from typing import Any, Optional

from ytmusicapi import YTMusic


# ----------------------------------------------------------------------
# Normalización de helpers
# ----------------------------------------------------------------------

def _thumbnails(item: Any, size: int = 220) -> str:
    """Devuelve la URL de thumbnail más cercana a `size` px de ancho."""
    thumbs = item.get("thumbnails") or []
    if not thumbs:
        return ""
    best = thumbs[0]
    for t in thumbs:
        w = t.get("width") or 0
        if abs(w - size) < abs((best.get("width") or 0) - size):
            best = t
    return best.get("url", "")


def _duration(seconds: Any) -> int:
    try:
        return int(seconds)
    except (TypeError, ValueError):
        return 0


def _artists(item: Any) -> str:
    artists = item.get("artists") or []
    if not artists:
        return item.get("artist", "") or ""
    return ", ".join(a.get("name", "") for a in artists if a.get("name"))


def _artist_list(item: Any) -> list:
    artists = item.get("artists") or []
    if not artists and item.get("artist"):
        return [{"name": item["artist"], "id": None}]
    return [{"name": a.get("name", ""), "id": a.get("id")} for a in artists]


def normalize_track(item: Any) -> dict:
    """Canción normalizada (YouTube Music o biblioteca local)."""
    return {
        "id": item.get("videoId") or item.get("id") or "",
        "title": item.get("title") or item.get("name") or "Sin título",
        "artists": _artist_list(item),
        "artist": _artists(item),
        "album": (item.get("album") or {}).get("name") if isinstance(item.get("album"), dict) else item.get("album", ""),
        "albumId": (item.get("album") or {}).get("id") if isinstance(item.get("album"), dict) else None,
        "duration": _duration(item.get("duration_seconds") or item.get("lengthSeconds")),
        "durationText": item.get("duration") or "",
        "thumb": _thumbnails(item),
        "explicit": bool(item.get("isExplicit")),
        "source": "yt",
    }


def normalize_artist(item: Any) -> dict:
    return {
        "id": item.get("browseId") or item.get("id") or "",
        "name": item.get("name") or item.get("artist") or "Desconocido",
        "thumb": _thumbnails(item, 300),
        "subscribers": item.get("subscribers") or "",
        "source": "yt",
    }


def normalize_album(item: Any) -> dict:
    return {
        "id": item.get("browseId") or item.get("id") or "",
        "title": item.get("title") or item.get("name") or "Sin título",
        "artists": _artist_list(item),
        "artist": _artists(item),
        "year": item.get("year") or "",
        "thumb": _thumbnails(item),
        "source": "yt",
    }


def normalize_playlist(item: Any) -> dict:
    return {
        "id": item.get("playlistId") or item.get("id") or "",
        "title": item.get("title") or item.get("name") or "Sin título",
        "description": item.get("description") or "",
        "count": item.get("count") or item.get("trackCount") or 0,
        "thumb": _thumbnails(item),
        "author": (item.get("author") or {}).get("name") if isinstance(item.get("author"), dict) else "",
        "source": "yt",
    }


# ----------------------------------------------------------------------
# Servicio
# ----------------------------------------------------------------------

class YouTubeMusicService:
    """Envuelve todas las llamadas a ytmusicapi con datos normalizados."""

    def __init__(self, auth_file: Optional[str] = None, allow_anonymous: bool = True):
        self._client: Optional[YTMusic] = None
        self._auth_file = auth_file
        self._allow_anonymous = allow_anonymous
        self._available: Optional[bool] = None
        self._stream_cache: dict = {}  # videoId -> (ts, url)

    # -- ciclo de vida --------------------------------------------------

    def _ensure_client(self) -> YTMusic:
        if self._client is None:
            if self._auth_file and os.path.exists(self._auth_file):
                self._client = YTMusic(auth=self._auth_file)
            elif self._allow_anonymous:
                self._client = YTMusic()
            else:
                raise RuntimeError("YouTube Music no está autenticado")
        return self._client

    @property
    def authenticated(self) -> bool:
        return bool(self._auth_file and os.path.exists(self._auth_file))

    def health(self) -> dict:
        """Comprueba que ytmusicapi responde (modo invitado cuenta)."""
        try:
            self._ensure_client()
            self._available = True
            return {"ok": True, "authenticated": self.authenticated}
        except Exception as exc:  # noqa: BLE001 - se reporta al frontend
            self._available = False
            return {"ok": False, "authenticated": False, "error": str(exc)}

    # -- búsqueda --------------------------------------------------------

    def search(self, query: str, filter_type: Optional[str] = None, limit: int = 20) -> dict:
        """Búsqueda unificada. filter_type: songs|artists|albums|playlists|None."""
        client = self._ensure_client()
        results: dict = {"songs": [], "artists": [], "albums": [], "playlists": []}
        if not query or not query.strip():
            return results

        if filter_type and filter_type != "all":
            raw = client.search(query, filter=filter_type, limit=limit)
            key = {"songs": "songs", "artists": "artists", "albums": "albums", "playlists": "playlists"}.get(
                filter_type, "songs"
            )
            for item in raw or []:
                results[key].append(self._normalize_any(item, filter_type))
            return results

        # Búsqueda general: canciones + artistas + álbumes + playlists
        for ftype, key in (("songs", "songs"), ("artists", "artists"), ("albums", "albums"), ("playlists", "playlists")):
            try:
                raw = client.search(query, filter=ftype, limit=min(limit, 10))
            except Exception:  # noqa: BLE001
                raw = []
            for item in raw or []:
                results[key].append(self._normalize_any(item, ftype))
        return results

    def _normalize_any(self, item: Any, ftype: str) -> dict:
        if ftype == "songs":
            return normalize_track(item)
        if ftype == "artists":
            return normalize_artist(item)
        if ftype == "albums":
            return normalize_album(item)
        return normalize_playlist(item)

    # -- canciones / streaming -------------------------------------------

    def get_song(self, video_id: str) -> dict:
        client = self._ensure_client()
        data = client.get_song(video_id)
        vd = data.get("videoDetails") or {}
        # videoDetails trae título, autor y miniaturas pero no artistas
        # ni álbum en el formato que espera normalize_track: se adapta.
        item = {
            "videoId": video_id,
            "title": vd.get("title"),
            "artists": [{"name": vd.get("author") or "", "id": vd.get("channelId")}],
            "lengthSeconds": vd.get("lengthSeconds"),
            "thumbnails": (vd.get("thumbnail") or {}).get("thumbnails") or [],
        }
        track = normalize_track(item)
        track["id"] = video_id
        secs = track.get("duration") or 0
        track["durationText"] = f"{secs // 60}:{secs % 60:02d}" if secs else ""
        # get_song no incluye el álbum: se completa con una búsqueda ligera.
        if not track.get("album"):
            try:
                for r in client.search(f"{track['title']} {track['artist']}".strip(), filter="songs", limit=5):
                    if r.get("videoId") == video_id:
                        album = r.get("album") or {}
                        track["album"] = album.get("name", "")
                        track["albumId"] = album.get("id")
                        break
            except Exception:  # noqa: BLE001 - el álbum es opcional
                pass
        return track

    def get_stream_media(self, video_id: str, use_cache: bool = True) -> Optional[dict]:
        """URL de audio + cabeceras para el proxy de streaming (o None).

        YouTube entrega los formatos con `signatureCipher` (sin URL plana),
        así que la extracción la hace yt-dlp, que descifra la firma y el
        parámetro `n`. Se cachea 10 minutos para no repetir la llamada en
        cada petición Range del reproductor.
        """
        if use_cache:
            hit = self._stream_cache.get(video_id)
            if hit and time.time() - hit[0] < 600:
                return {"url": hit[1], "headers": hit[2] if len(hit) > 2 else {}}
        media = self._extract_ytdlp(video_id) or self._extract_ytmusic(video_id)
        if media and use_cache:
            self._stream_cache[video_id] = (time.time(), media["url"], media.get("headers") or {})
        return media

    def get_stream_url(self, video_id: str, use_cache: bool = True) -> Optional[str]:
        media = self.get_stream_media(video_id, use_cache=use_cache)
        return media["url"] if media else None

    def _extract_ytdlp(self, video_id: str) -> Optional[dict]:
        """Extracción con yt-dlp (soporta signatureCipher y URL con parámetro n)."""
        try:
            from yt_dlp import YoutubeDL
        except Exception:  # noqa: BLE001 - dependencia opcional
            return None
        opts = {
            "format": "bestaudio/best",
            "quiet": True,
            "no_warnings": True,
            "noplaylist": True,
            "skip_download": True,
            "socket_timeout": 20,
            "retries": 1,
        }
        # Sin runtime JS algunos formatos quedan inaccesibles; si hay node, se usa.
        if shutil.which("node"):
            opts["js_runtimes"] = {"node": {}}
        try:
            with YoutubeDL(opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
        except Exception:  # noqa: BLE001 - el respaldo sigue disponible
            return None
        url = (info or {}).get("url")
        if not url:
            return None
        headers = (info or {}).get("http_headers") or {}
        ua = headers.get("User-Agent") or ""
        return {"url": url, "headers": {"User-Agent": ua} if ua else {}}

    def _extract_ytmusic(self, video_id: str) -> Optional[dict]:
        """Respaldo: formatos que ytmusicapi devuelve con URL directa (sin cipher)."""
        try:
            client = self._ensure_client()
            streaming = client.get_song(video_id).get("streamingData") or {}
            formats = list(streaming.get("formats") or []) + list(streaming.get("adaptiveFormats") or {})
            audio = [f for f in formats if (f.get("mimeType") or "").startswith("audio") and f.get("url")]
            if not audio:
                return None
            best = max(audio, key=lambda f: f.get("bitrate") or 0)
            return {"url": best["url"], "headers": {}}
        except Exception:  # noqa: BLE001
            return None

    def get_watch_playlist(self, video_id: str, limit: int = 25) -> list:
        """Cola tipo 'Mix de YouTube' a partir de una canción."""
        client = self._ensure_client()
        data = client.get_watch_playlist(videoId=video_id, limit=limit)
        tracks = []
        for item in data.get("tracks") or []:
            if item.get("videoId"):
                tracks.append(normalize_track(item))
        return tracks

    # -- artistas / álbumes ----------------------------------------------

    def get_artist(self, browse_id: str) -> dict:
        client = self._ensure_client()
        data = client.get_artist(browse_id)
        out = normalize_artist(data)
        # get_artist devuelve channelId (a veces distinto al solicitado tras
        # una redirección de canal); sin él se conserva el id pedido.
        out["id"] = data.get("channelId") or browse_id
        out["description"] = data.get("description") or ""
        out["songs"] = [normalize_track(t) for t in (data.get("songs", {}) or {}).get("results") or []]
        out["albums"] = [normalize_album(a) for a in (data.get("albums", {}) or {}).get("results") or []]
        out["singles"] = [normalize_album(a) for a in (data.get("singles", {}) or {}).get("results") or []]
        out["videos"] = [normalize_track(v) for v in (data.get("videos", {}) or {}).get("results") or []]
        return out

    def get_album(self, browse_id: str) -> dict:
        client = self._ensure_client()
        data = client.get_album(browse_id)
        out = normalize_album(data)
        # get_album no incluye el browseId en la respuesta: se usa el pedido.
        out["id"] = browse_id
        out["description"] = data.get("description") or ""
        out["tracks"] = [normalize_track(t) for t in data.get("tracks") or []]
        return out

    # -- playlists ---------------------------------------------------------

    def get_playlist(self, playlist_id: str, limit: int = 100) -> dict:
        client = self._ensure_client()
        data = client.get_playlist(playlistId=playlist_id, limit=limit)
        out = normalize_playlist(data)
        out["tracks"] = [normalize_track(t) for t in data.get("tracks") or []]
        return out

    # -- biblioteca e historial (requieren auth) ---------------------------

    def get_library(self, limit: int = 50) -> dict:
        client = self._ensure_client()
        out = {"songs": [], "artists": [], "albums": [], "playlists": []}
        try:
            songs = client.get_library_songs(limit=limit, verify_cache=True)
            out["songs"] = [normalize_track(t) for t in songs or []]
        except Exception:  # noqa: BLE001
            pass
        try:
            artists = client.get_library_artists(limit=limit)
            out["artists"] = [normalize_artist(a) for a in artists or []]
        except Exception:  # noqa: BLE001
            pass
        try:
            albums = client.get_library_albums(limit=limit)
            out["albums"] = [normalize_album(a) for a in albums or []]
        except Exception:  # noqa: BLE001
            pass
        try:
            playlists = client.get_library_playlists(limit=limit)
            out["playlists"] = [normalize_playlist(p) for p in playlists or []]
        except Exception:  # noqa: BLE001
            pass
        return out

    def get_history(self, limit: int = 50) -> list:
        client = self._ensure_client()
        try:
            raw = client.get_history()
        except Exception:  # noqa: BLE001
            return []
        tracks = []
        for entry in raw or []:
            if isinstance(entry, dict) and entry.get("videoId"):
                tracks.append(normalize_track(entry))
            if len(tracks) >= limit:
                break
        return tracks

    def get_recommendations(self, limit: int = 20) -> list:
        """Recomendaciones basadas en el historial (requiere auth)."""
        client = self._ensure_client()
        try:
            raw = client.get_home(limit=limit)
        except Exception:  # noqa: BLE001
            return []
        tracks = []
        for shelf in raw or []:
            for content in (shelf.get("contents") or []):
                results = (content.get("contents") or [content])
                for item in results:
                    if isinstance(item, dict) and item.get("videoId"):
                        tracks.append(normalize_track(item))
                    if len(tracks) >= limit:
                        return tracks
        return tracks

    # -- gestión de playlists ----------------------------------------------

    def create_playlist(self, title: str, description: str = "", privacy: str = "PRIVATE") -> dict:
        client = self._ensure_client()
        res = client.create_playlist(title=title, description=description, privacy_status=privacy)
        pid = res.get("playlistId") if isinstance(res, dict) else res
        return {"id": pid or "", "title": title, "description": description, "source": "yt"}

    def delete_playlist(self, playlist_id: str) -> bool:
        client = self._ensure_client()
        try:
            client.delete_playlist(playlist_id)
            return True
        except Exception:  # noqa: BLE001
            return False

    def rename_playlist(self, playlist_id: str, title: str, description: str = "") -> bool:
        client = self._ensure_client()
        try:
            client.edit_playlist(playlist_id, title=title, description=description)
            return True
        except Exception:  # noqa: BLE001
            return False

    def add_tracks_to_playlist(self, playlist_id: str, video_ids: list) -> bool:
        client = self._ensure_client()
        try:
            client.add_playlist_items(playlist_id, video_ids)
            return True
        except Exception:  # noqa: BLE001
            return False

    def remove_tracks_from_playlist(self, playlist_id: str, video_ids: list) -> bool:
        client = self._ensure_client()
        ok = True
        for vid in video_ids or []:
            try:
                client.remove_playlist_items(playlist_id, [{"videoId": vid}])
            except Exception:  # noqa: BLE001
                ok = False
        return ok

    def move_track_in_playlist(self, playlist_id: str, video_id: str, to_index: int) -> bool:
        client = self._ensure_client()
        try:
            client.edit_playlist(playlist_id, moveItem=(video_id, to_index))
            return True
        except Exception:  # noqa: BLE001
            return False
