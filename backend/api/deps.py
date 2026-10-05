"""Dependencias compartidas de la API (instancia del servicio YouTube Music)."""

from __future__ import annotations

import os

from dotenv import load_dotenv

from services.ytmusic_service import YouTubeMusicService

load_dotenv()

_AUTH_FILE = os.getenv("YTMUSIC_AUTH_FILE", "auth.json")
_ALLOW_ANONYMOUS = os.getenv("YTMUSIC_ALLOW_ANONYMOUS", "true").lower() != "false"

_service: YouTubeMusicService | None = None


def get_service() -> YouTubeMusicService:
    """Singleton perezoso del servicio YouTube Music."""
    global _service
    if _service is None:
        _service = YouTubeMusicService(auth_file=_AUTH_FILE, allow_anonymous=_ALLOW_ANONYMOUS)
    return _service
