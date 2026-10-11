"""Validación de identificadores (contrato §5.4).

El video_id de YouTube es exactamente 11 caracteres del juego
`[A-Za-z0-9_-]`. Validarlo ANTES de cualquier petición saliente corta
de raíz el path traversal, el SSRF por inyección de URL y los
`../../` en la ruta.

Los `browse_id` (artista, álbum, playlist) **no** siguen ese formato
(`UCX6OQ3DkcsbYNE6H8uQQuVA`, `OLAK5uy_...`), por eso usan otra regex.
"""

from __future__ import annotations

import re
from typing import Optional

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
BROWSE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
PLAYLIST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def is_valid_video_id(value: Optional[str]) -> bool:
    """True sólo si es un video_id bien formado."""
    if not isinstance(value, str):
        return False
    return bool(VIDEO_ID_RE.match(value))


def is_valid_browse_id(value: Optional[str]) -> bool:
    """Formato laxo para browseId de artista/álbum."""
    if not isinstance(value, str):
        return False
    return bool(BROWSE_ID_RE.match(value))


def is_valid_playlist_id(value: Optional[str]) -> bool:
    if not isinstance(value, str):
        return False
    return bool(PLAYLIST_ID_RE.match(value))
