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

from api import accounts, admin, albums, artists, actividades, auth, debug, library, lyrics, matricula, playlists, push, search, songs, tareas_examenes, translate
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

# CORS personalizado: con credenciales (credentials: 'include' en el
# frontend) no se puede usar allow_origin_regex ni "*". Reflejamos el
# Origin de la petición para permitir cualquier puerto local con
# credenciales, necesario para vite dev server.
@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    import re
    origin = request.headers.get("origin", "")
    is_local = bool(re.match(r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$", origin))
    is_explicit = origin in _CORS

    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            "Access-Control-Max-Age": "86400",
        }
        if is_local or is_explicit:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
            if request.headers.get("access-control-request-private-network"):
                headers["Access-Control-Allow-Private-Network"] = "true"
        return JSONResponse(status_code=200, content={}, headers=headers)

    response = await call_next(request)

    if is_local or is_explicit:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        if request.headers.get("access-control-request-private-network"):
            response.headers["Access-Control-Allow-Private-Network"] = "true"

    return response

# Headers de seguridad en toda respuesta del backend.
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Routers
if os.getenv("SAKURA_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}:
    app.include_router(debug.router)
app.include_router(search.router)
app.include_router(songs.router)
app.include_router(artists.router)
app.include_router(albums.router)
app.include_router(playlists.router)
app.include_router(library.router)
app.include_router(lyrics.router)
app.include_router(translate.router)
app.include_router(admin.router)
app.include_router(accounts.router)          # <-- nuevo
app.include_router(auth.router)              # <-- auth (login/register/me/logout)
app.include_router(push.router)              # <-- push (suscripciones y envío)
app.include_router(actividades.router)       # <-- actividades (Postgres/Supabase)
app.include_router(matricula.router)         # <-- matrícula por grupo
app.include_router(tareas_examenes.router)   # <-- tareas/exámenes por grupo


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
