"""Postgres-ready (P2): detector DATABASE_URL + schema. No migra aún (será P2-b).
Sin DATABASE_URL retorna False y todo sigue en JSON atómico (dev/test).
"""
from __future__ import annotations
import os
from pathlib import Path
SCHEMA_FILE = Path(__file__).parent / "schema_pg.sql"

def database_url() -> str | None:
    url = os.getenv("DATABASE_URL", "").strip()
    return url or None

def postgres_ready() -> bool:
    return database_url() is not None

def schema_sql() -> str:
    if SCHEMA_FILE.exists():
        return SCHEMA_FILE.read_text(encoding="utf-8")
    return ""
