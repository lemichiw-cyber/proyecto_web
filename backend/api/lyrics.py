"""GET /api/music/lyrics — letras sincronizadas (LRC) para una canción.

Consulta múltiples proveedores en orden de prioridad:
  1. LrcLib (gratuita, sin API key)
  2. Lyrica API (multi-provider: LRCLIB, Genius, Apple Music, YouTube, etc.)
  3. YouTube subtítulos (timedtext) — solo si hay videoId

Endpoints:
  GET /api/music/lyrics?q=...&artist=...&album=...&duration=...
    Búsqueda por metadatos.
  GET /api/music/lyrics/yt/{video_id}
    Letras de un video de YouTube por su ID.
  GET /api/music/lyrics/lyrica?q=...&artist=...&song=...
    Consulta directa a Lyrica API.
"""

from __future__ import annotations

import os
import urllib.parse
import urllib.request
import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/music", tags=["lyrics"])

# ── Proveedores ──────────────────────────────────────────────────────────

_LRC_LIB_SEARCH = "https://lrclib.net/api/search"
_LRC_LIB_GET = "https://lrclib.net/api/get"

# Lyrica API — instancia pública (sin API key requerida para uso básico)
_LYRICA_BASE = os.getenv("LYRICA_BASE_URL", "https://test-0k.onrender.com")
_LYRICA_SEARCH = _LYRICA_BASE + "/lyrics/"
_LYRICA_SUGGEST = _LYRICA_BASE + "/suggestion"


def _fetch_json(url: str, timeout: float = 15.0) -> Optional[Any]:
    """Petición HTTP GET simple sin dependencias externas (solo stdlib)."""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "SakuraPlayer/1.0 (https://github.com/lemichiw-cyber/proyecto_web)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            data = resp.read().decode("utf-8")
            return json.loads(data)
    except Exception:
        return None


# ── Normalización ────────────────────────────────────────────────────────

def _normalize_lrc_lib(item: dict) -> dict:
    """Normaliza un resultado de LrcLib al formato del frontend."""
    return {
        "source": "lrclib",
        "trackName": item.get("trackName") or "",
        "artistName": item.get("artistName") or "",
        "albumName": item.get("albumName") or "",
        "syncedLyrics": item.get("syncedLyrics") or None,
        "plainLyrics": item.get("plainLyrics") or None,
        "lrcId": item.get("id") or None,
    }


def _normalize_lyrica(item: dict) -> dict:
    """Normaliza una respuesta de Lyrica API al formato del frontend."""
    data = item.get("data", {}) if isinstance(item, dict) else {}
    timed = data.get("timed_lyrics") or []
    synced_lines = []
    for t in timed:
        start = t.get("start_time", 0)
        end = t.get("end_time", 0)
        text = t.get("text", "")
        # Convertir ms a segundos para el formato LRC interno
        start_s = start / 1000.0 if start else 0
        synced_lines.append({"time": start_s, "text": text, "words": None})

    synced_lines.sort(key=lambda l: l["time"])
    lrc = "\n".join(f"[{_format_lrc_time(l['time'])}] {l['text']}" for l in synced_lines)

    return {
        "source": data.get("source", "lyrica"),
        "trackName": data.get("title") or "",
        "artistName": data.get("artist") or "",
        "albumName": "",
        "syncedLyrics": lrc or data.get("lyrics") or None,
        "plainLyrics": data.get("lyrics") or "\n".join(l["text"] for l in synced_lines),
        "lrcId": None,
        "sync_level": data.get("sync_level", "line"),
        "words": timed,  # palabras con timestamps si Lyrica las devolvió
    }


def _format_lrc_time(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100)
    return f"{m:02d}:{s:02d}.{cs:02d}"


# ── Proveedores individuales ───────────────────────────────────────────

def _search_lrc_lib(title: str, artist: str, album: Optional[str], duration: Optional[int]) -> Optional[dict]:
    """Busca en LrcLib por metadatos."""
    params = {}
    if title:
        params["track_name"] = title
    if artist:
        params["artist_name"] = artist
    if album:
        params["album_name"] = album
    if duration and duration > 0:
        params["duration"] = duration

    url = _LRC_LIB_SEARCH + "?" + urllib.parse.urlencode(params)
    data = _fetch_json(url)
    if not isinstance(data, list) or len(data) == 0:
        return None

    # Elegir el mejor resultado: con letra sincronizada primero
    best = None
    for item in data:
        if isinstance(item, dict) and item.get("syncedLyrics"):
            best = item
            break
    if not best:
        best = data[0]
    return _normalize_lrc_lib(best)


def _search_lyrica(title: str, artist: str, album: Optional[str], duration: Optional[int]) -> Optional[dict]:
    """Busca en Lyrica API por artista y canción."""
    params = {}
    if artist:
        params["artist"] = artist
    if title:
        params["song"] = title
    if duration and duration > 0:
        params["duration"] = str(duration)
    # Pedir letras con timestamps para sincronización
    params["timestamps"] = "true"

    url = _LYRICA_SEARCH + "?" + urllib.parse.urlencode(params)
    data = _fetch_json(url, timeout=20.0)
    if not isinstance(data, dict):
        return None
    if data.get("status") != "success":
        return None
    return _normalize_lyrica(data)


def _youtube_subtitles(video_id: str) -> Optional[dict]:
    """Intenta obtener subtítulos sincronizados de YouTube (timedtext)."""
    list_url = (
        "https://video.google.com/timedtext?type=list&v=" + urllib.parse.quote(video_id)
    )
    try:
        data = _fetch_json(list_url, timeout=10.0)
        if not isinstance(data, dict):
            return None
        tracks = data.get("track") or []
        if not isinstance(tracks, list):
            return None
        preferred = None
        for t in tracks:
            lang = t.get("lang_code", "")
            if lang.startswith("es") or lang.startswith("en"):
                preferred = t
                break
        if not preferred and tracks:
            preferred = tracks[0]
        if not preferred:
            return None

        lang_code = preferred.get("lang_code", "")
        track_url = (
            "https://video.google.com/timedtext?"
            + urllib.parse.urlencode({"v": video_id, "lang": lang_code, "fmt": "json3"})
        )
        track_data = _fetch_json(track_url, timeout=10.0)
        if not isinstance(track_data, dict):
            return None
        events = track_data.get("events") or []
        lines = []
        for ev in events:
            segs = ev.get("segs") or []
            text = "".join((s.get("utf8") or "") for s in segs).strip()
            if not text:
                continue
            t_start = (ev.get("tStartMs") or 0) / 1000
            lines.append({"time": t_start, "text": text})
        if not lines:
            return None
        lines.sort(key=lambda l: l["time"])
        lrc = "\n".join(f"[{_format_lrc_time(l['time'])}] {l['text']}" for l in lines)
        return {
            "source": "youtube",
            "trackName": "",
            "artistName": "",
            "albumName": "",
            "syncedLyrics": lrc,
            "plainLyrics": "\n".join(l["text"] for l in lines),
            "lrcId": None,
        }
    except Exception:
        return None


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/lyrics")
def get_lyrics(
    q: Optional[str] = Query(None, description="Título de la canción (o búsqueda general)"),
    artist: Optional[str] = Query(None, description="Nombre del artista"),
    album: Optional[str] = Query(None, description="Nombre del álbum"),
    duration: Optional[int] = Query(None, ge=0, description="Duración en segundos"),
) -> dict:
    """Busca letras sincronizadas por metadatos.

    Orden de proveedores:
      1. LrcLib
      2. Lyrica API (multi-provider)
      3. YouTube subtítulos (si hay videoId)
    """
    title = q or ""
    if not title and not artist:
        raise HTTPException(status_code=400, detail="Proporcioná al menos título o artista")

    # 1) LrcLib
    result = _search_lrc_lib(title, artist, album, duration)
    if result and result.get("syncedLyrics"):
        return {"lyrics": result, "entries_count": len(result["syncedLyrics"].splitlines()), "source": "lrclib"}

    # 2) Lyrica API
    result = _search_lyrica(title, artist, album, duration)
    if result and result.get("syncedLyrics"):
        return {"lyrics": result, "entries_count": len(result["syncedLyrics"].splitlines()), "source": "lyrica"}
    if result and result.get("plainLyrics"):
        return {"lyrics": result, "entries_count": 0, "source": "lyrica"}

    # 3) YouTube subtítulos (solo si tenemos video_id como 'q' o artist)
    video_id = title if title and len(title) == 11 and all(c.isalnum() or c in "-_" for c in title) else None
    if video_id:
        result = _youtube_subtitles(video_id)
        if result and result.get("syncedLyrics"):
            return {"lyrics": result, "entries_count": len(result["syncedLyrics"].splitlines()), "source": "youtube"}

    raise HTTPException(status_code=404, detail="No se encontraron letras para esta canción")


@router.get("/lyrics/lyrica")
def get_lyrics_lyrica(
    q: Optional[str] = Query(None, description="Título de la canción"),
    artist: Optional[str] = Query(None, description="Nombre del artista"),
    song: Optional[str] = Query(None, description="Nombre de la canción (alias de q)"),
    timestamps: bool = Query(True, description="Incluir letras sincronizadas"),
) -> dict:
    """Consulta directa a Lyrica API."""
    title = song or q or ""
    if not title and not artist:
        raise HTTPException(status_code=400, detail="Proporcioná al menos título o artista")

    params = {}
    if artist:
        params["artist"] = artist
    if title:
        params["song"] = title
    if timestamps:
        params["timestamps"] = "true"

    url = _LYRICA_SEARCH + "?" + urllib.parse.urlencode(params)
    data = _fetch_json(url, timeout=20.0)
    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Lyrica no respondió")
    if data.get("status") != "success":
        raise HTTPException(status_code=404, detail="Lyrica no encontró letras para esta canción")

    result = _normalize_lyrica(data)
    return {"lyrics": result, "source": "lyrica"}


@router.get("/lyrics/yt/{video_id}")
def get_lyrics_youtube(video_id: str) -> dict:
    """Obtiene subtítulos sincronizados de YouTube para un videoId."""
    result = _youtube_subtitles(video_id)
    if not result:
        raise HTTPException(status_code=404, detail="No hay subtítulos sincronizados para este video")
    return {"lyrics": result}


# Índice actualizado de endpoints
_MUSIC_INDEX_EXTRA = {
    "lyrics": "/api/music/lyrics?q=",
    "lyricsYt": "/api/music/lyrics/yt/{video_id}",
    "lyricsLyrica": "/api/music/lyrics/lyrica?q=",
}


def extra_index() -> dict:
    return _MUSIC_INDEX_EXTRA
