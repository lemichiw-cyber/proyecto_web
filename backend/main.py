"""
Sakura Player — Backend (FastAPI + ytmusicapi)

Puente entre el frontend (Vite) y YouTube Music.

Ejecución:
    uvicorn main:app --reload --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import os
import pathlib
import shutil
import sys

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# El .env debe cargarse ANTES de importar los routers: varios módulos leen
# variables al importarse (NVIDIA_API_KEY en api.ia, flags de cookie, etc.).
# Si se cargara después, la clave se leía como "" y la IA devolvía 503.
load_dotenv()

from api import accounts, admin, albums, artists, actividades, auth, debug, library, lyrics, matricula, moderacion, playlists, push, search, songs, tareas_examenes, translate, ia
from api.deps import get_service

# P2: Sentry opcional (sin dependencia obligatoria; si SENTRY_DSN existe y está instalado)
try:
    import sentry_sdk  # type: ignore
    _dsn = os.getenv("SENTRY_DSN", "").strip()
    if _dsn:
        sentry_sdk.init(dsn=_dsn, environment=os.getenv("SAKURA_ENV", "production"), traces_sample_rate=0.1)
except Exception:
    pass

_HOST = os.getenv("SAKURA_HOST", "127.0.0.1")
# PORT es la convención de Render/Heroku; SAKURA_PORT manda si existe.
_PORT = int(os.getenv("SAKURA_PORT") or os.getenv("PORT") or "8000")

# Orígenes permitidos.
# En producción (SAKURA_ENV=production, por defecto) NO se aceptan origins localhost.
# En dev (SAKURA_ENV=dev o SAKURA_ALLOW_LOCAL_CORS=1) sí, para vite dev server.
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
_ENV = os.getenv("SAKURA_ENV", "production").strip().lower()
_ALLOW_LOCAL = _ENV == "dev" or os.getenv("SAKURA_ALLOW_LOCAL_CORS", "").strip().lower() in {"1", "true", "yes", "on"}

# Cualquier localhost/puerto local (dev, preview, serve…) — solo en dev
_CORS_LOCAL = r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$" if _ALLOW_LOCAL else r"^$"  # nunca matchea en prod

app = FastAPI(
    title="Sakura Player API",
    description="Backend de Sakura Player — puente con YouTube Music vía ytmusicapi",
    version="1.0.0",
)

# CORS personalizado con allowlist explícita (prod: sin localhost, sin private-network)
@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    import re
    origin = request.headers.get("origin", "")
    is_local = bool(re.match(r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$", origin)) if _ALLOW_LOCAL else False
    is_explicit = origin in _CORS

    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
            "Access-Control-Max-Age": "86400",
            "Vary": "Origin",
        }
        if is_local or is_explicit:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
            # Allow-Private-Network solo en dev explícito (era vía de bypass en prod)
            if _ALLOW_LOCAL and request.headers.get("access-control-request-private-network"):
                headers["Access-Control-Allow-Private-Network"] = "true"
        return JSONResponse(status_code=200, content={}, headers=headers)

    response = await call_next(request)

    if is_local or is_explicit:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
        if _ALLOW_LOCAL and request.headers.get("access-control-request-private-network"):
            response.headers["Access-Control-Allow-Private-Network"] = "true"

    return response

# Headers de seguridad en toda respuesta del backend (P0: CSP + HSTS).
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # CSP para la API: solo JSON, sin scripts remotos. En dev se reporta además.
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'self'"
    # HSTS solo tiene sentido si la respuesta vino por HTTPS: enviarlo sobre
    # http://127.0.0.1 (backend local) haría que el navegador intente
    # https://127.0.0.1 y no llegaría al backend.
    if _ENV != "dev" and request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response

# Routers
if os.getenv("SAKURA_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"} and _ENV != "production":
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
app.include_router(moderacion.router)        # <-- moderación (reportes foros, P2)
app.include_router(ia.router)                # <-- IA generativa con NVIDIA NIM (P5)


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
        "version": "1.0.0-p2",
        "audit_count": __import__("audit").read_tail(1).__len__() if pathlib.Path(__file__).parent.joinpath("audit.log").exists() else 0,
        "reportes_pendientes": len([v for v in __import__("json").loads(__import__("pathlib").Path(__file__).parent.joinpath("foro_reportes.json").read_text() or "{}").values() if not v.get("resuelto")]) if __import__("pathlib").Path(__file__).parent.joinpath("foro_reportes.json").exists() else 0,
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
