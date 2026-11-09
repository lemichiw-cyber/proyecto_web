"""Migración JSON -> Postgres (P3, manual).

Sin DATABASE_URL -> sale 0 con mensaje (seguro en CI/dev).
Con DATABASE_URL + psycopg instalado -> importa schema (idempotente).
Uso: DATABASE_URL=postgres://... python -m migrate   (desde backend/)
"""
from __future__ import annotations
import os


def main() -> int:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("no DATABASE_URL definido, nada que migrar (P3 no-op)")
        return 0
    try:
        import psycopg  # type: ignore
    except Exception as e:
        print("no se pudo importar psycopg (pip install psycopg[binary]): " + type(e).__name__ + ": " + str(e))
        return 0
    try:
        conn = psycopg.connect(url)  # type: ignore
        cur = conn.cursor()
        schema_path = os.path.join(os.path.dirname(__file__), "schema_pg.sql")
        with open(schema_path, encoding="utf-8") as f:
            cur.execute(f.read())
        conn.commit()
        print("schema aplicado (datos JSON -> PG pendiente P3-b)")
    except Exception as e:
        print("error migracion: " + type(e).__name__ + ": " + str(e))
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
