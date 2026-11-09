"""Migración JSON -> Postgres (P5, manual).

Sin DATABASE_URL -> sale 0 (seguro en CI/dev).
Con DATABASE_URL + psycopg -> schema + importa accounts/sessions/foro_reportes/audit
con INSERT ON CONFLICT DO NOTHING. No borra JSON.
Uso: DATABASE_URL=postgres://... python -m migrate (desde backend/)
"""
from __future__ import annotations
import json, os
from pathlib import Path
BASE = Path(__file__).parent

def main() -> int:
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("no DATABASE_URL definido, nada que migrar (P5 no-op)")
        return 0
    try:
        import psycopg  # type: ignore
    except Exception as e:
        print("no se pudo importar psycopg: " + type(e).__name__ + ": " + str(e))
        return 0
    try:
        conn = psycopg.connect(url)
        cur = conn.cursor()
        schema = (BASE / "schema_pg.sql").read_text(encoding="utf-8")
        cur.execute(schema)
        # accounts.json -> accounts(email, password_hash, rol, nombre, activo, semestre, creado)
        jf = BASE / "accounts.json"
        if jf.exists():
            try:
                accts = json.loads(jf.read_text(encoding="utf-8"))
                for email, a in (accts.items() if isinstance(accts, dict) else []):
                    if not isinstance(a, dict):
                        continue
                    cur.execute(
                        "INSERT INTO accounts (email, password_hash, rol, nombre, activo, semestre, creado) VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (email) DO NOTHING",
                        (email, a.get("password_hash"), a.get("rol", "estudiante"), a.get("nombre", ""), bool(a.get("activo", True)), a.get("semestre"), None),
                    )
            except Exception as e:
                print("accounts import warning: " + str(e))
        # sessions.json -> sessions(token, email, rol, creado)
        jf = BASE / "sessions.json"
        if jf.exists():
            try:
                sess = json.loads(jf.read_text(encoding="utf-8"))
                for tok, sdata in (sess.items() if isinstance(sess, dict) else []):
                    if not isinstance(sdata, dict):
                        continue
                    cur.execute("INSERT INTO sessions (token, email, rol, creado) VALUES (%s,%s,%s,%s) ON CONFLICT (token) DO NOTHING",
                                (tok, sdata.get("email", ""), sdata.get("rol", "estudiante"), float(sdata.get("creado", 0))))
            except Exception as e:
                print("sessions import warning: " + str(e))
        # foro_reportes.json
        jf = BASE / "foro_reportes.json"
        if jf.exists():
            try:
                reps = json.loads(jf.read_text(encoding="utf-8"))
                for rid, r in (reps.items() if isinstance(reps, dict) else []):
                    if not isinstance(r, dict):
                        continue
                    cur.execute("INSERT INTO foro_reportes (id, foro_id, mensaje_id, motivo, denunciante, resuelto, creado) VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (id) DO NOTHING",
                                (rid, r.get("foro_id", ""), r.get("mensaje_id", ""), r.get("motivo", ""), r.get("denunciante", ""), bool(r.get("resuelto", False)), float(r.get("creado", 0))))
            except Exception as e:
                print("foro import warning: " + str(e))
        # audit.log -> audit(ts, ts_iso, evento, email, ip)
        jf = BASE / "audit.log"
        if jf.exists():
            try:
                for line in jf.read_text(encoding="utf-8").splitlines()[-500:]:
                    try:
                        e = json.loads(line)
                        cur.execute("INSERT INTO audit (ts, ts_iso, evento, email, ip) VALUES (%s,%s,%s,%s,%s)",
                                    (float(e.get("ts", 0)), e.get("ts_iso", ""), e.get("evento", ""), e.get("email", ""), e.get("ip", "")))
                    except Exception:
                        continue
            except Exception as e:
                print("audit import warning: " + str(e))
        conn.commit()
        print("schema + datos importados (ON CONFLICT DO NOTHING, JSON intactos)")
    except Exception as e:
        print("error migracion: " + type(e).__name__ + ": " + str(e))
        return 0
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
