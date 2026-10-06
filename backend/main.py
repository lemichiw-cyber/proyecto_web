"""
Sakura Player — Backend (FastAPI + ytmusicapi)

Puente entre el frontend (Vite) y YouTube Music.

Ejecución:
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import os
import shutil
import sys

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import albums, artists, library, playlists, search, songs
from api.deps import get_service

load_dotenv()

_HOST = os.getenv("SAKURA_HOST", "127.0.0.1")
# PORT es la convención de Render/Heroku; SAKURA_PORT manda si existe.
_PORT = int(os.getenv("SAKURA_PORT") or os.getenv("PORT") or "8000")

# Orígenes permitidos. El frontend puede servirse de muchas formas
# (`vite` 5173, `vite preview` 4173, `serve`/`start` en el puerto que
# sea o GitHub Pages), así que además de la lista explícita se permite
# cualquier puerto local: si no, el navegador bloquea la petición y el
# reproductor muestra "Backend apagado o sin conexión".
_CORS_DEFAULT = ",".join([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://lemichiw-cyber.github.io",
    "https://proyecto-web-2-bygl.onrender.com",
])
_CORS = [o.strip() for o in os.getenv("SAKURA_CORS_ORIGINS", _CORS_DEFAULT).split(",") if o.strip()]

# Cualquier localhost/puerto local (dev, preview, serve, …)
_CORS_LOCAL = r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$"

app = FastAPI(
    title="Sakura Player API",
    description="Backend de Sakura Player — puente con YouTube Music vía ytmusicapi",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS,
    allow_origin_regex=_CORS_LOCAL,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    # Private Network Access (Chrome): un sitio público (Render, GitHub
    # Pages) pidiendo a este backend local envía un preflight con
    # `Access-Control-Request-Private-Network: true`; sin esta opción la
    # respuesta no lleva `Access-Control-Allow-Private-Network` y el
    # navegador corta la petición aunque el origen esté permitido.
    allow_private_network=True,
)

# Routers
app.include_router(search.router)
app.include_router(songs.router)
app.include_router(artists.router)
app.include_router(albums.router)
app.include_router(playlists.router)
app.include_router(library.router)


@app.get("/", tags=["meta"])
def root() -> dict:
    """Respuesta para el health check por defecto de la plataforma.

    Render/Heroku comprueban `/` al arrancar: sin esta ruta el servicio
    marcaría 404 y quedaría en loop de reinicios.
    """
    return {"ok": True, "service": "sakura-player", "health": "/api/health", "docs": "/docs"}


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
        # Entorno de ejecución: yt-dlp resuelve las firmas con node si existe.
        "runtime": {
            "node": bool(shutil.which("node")),
            "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        },
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


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:  # noqa: ARG001
    """Validación de parámetros con respuesta amigable (sin esquema técnico)."""
    return JSONResponse(status_code=422, content={"detail": "Faltan datos o los parámetros son incorrectos"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:  # noqa: ANN001, BLE001
    """Nunca exponer errores técnicos crudos al frontend."""
    return JSONResponse(status_code=500, content={"detail": "Error interno del servidor"})


def main() -> None:
    import uvicorn

    uvicorn.run("main:app", host=_HOST, port=_PORT, reload=True)


if __name__ == "__main__":
    main()
