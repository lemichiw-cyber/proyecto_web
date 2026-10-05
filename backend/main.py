"""
Sakura Player — Backend (FastAPI + ytmusicapi)

Puente entre el frontend (Vite) y YouTube Music.

Ejecución:
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import albums, artists, library, playlists, search, songs
from api.deps import get_service

load_dotenv()

_HOST = os.getenv("SAKURA_HOST", "127.0.0.1")
_PORT = int(os.getenv("SAKURA_PORT", "8000"))
_CORS = [o.strip() for o in os.getenv("SAKURA_CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

app = FastAPI(
    title="Sakura Player API",
    description="Backend de Sakura Player — puente con YouTube Music vía ytmusicapi",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(search.router)
app.include_router(songs.router)
app.include_router(artists.router)
app.include_router(albums.router)
app.include_router(playlists.router)
app.include_router(library.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    """Estado del backend y de la conexión con YouTube Music."""
    svc = get_service()
    yt = svc.health()
    return {
        "ok": True,
        "service": "sakura-player",
        "ytmusic": yt,
        "authenticated": yt.get("authenticated", False),
    }


@app.get("/api/music", tags=["meta"])
def music_index() -> dict:
    """Índice de endpoints de música."""
    return {
        "search": "/api/music/search?q=",
        "song": "/api/music/song/{id}",
        "stream": "/api/music/stream/{id}",
        "artist": "/api/music/artist/{id}",
        "album": "/api/music/album/{id}",
        "playlist": "/api/music/playlist/{id}",
        "library": "/api/music/library",
        "history": "/api/music/history",
        "recommendations": "/api/music/recommendations",
        "watchPlaylist": "/api/music/watch-playlist/{id}",
    }


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:  # noqa: ANN001, BLE001
    """Nunca exponer errores técnicos crudos al frontend."""
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


def main() -> None:
    import uvicorn

    uvicorn.run("main:app", host=_HOST, port=_PORT, reload=True)


if __name__ == "__main__":
    main()
