"""
Sakura Player — Backend mínimo.
Sirve solo como soporte de CORS/health check para el frontend que usa
localStorage (src/estudiante/datos.js). Ya no se conecta a YouTube Music.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Sakura Player — Modo Local",
    description="Backend mínimo para CORS y health check. La persistencia es 100% localStorage.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=False,
)

@app.get("/")
def root() -> dict:
    return {"ok": True, "service": "sakura-player-local"}

@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "sakura-player-local"}
