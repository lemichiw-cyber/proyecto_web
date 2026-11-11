"""Auditoría append-only para trazabilidad docente (P1).

Un JSON por línea en audit.log (0600, gitignored):
  {ts_iso, ts, evento, email, ip}
No guarda contraseñas ni tokens. Solo eventos de auth/cuentas (PII mínima).
"""
from __future__ import annotations
import json, os, time
from pathlib import Path
BASE_DIR = Path(__file__).parent
AUDIT_FILE = BASE_DIR / "audit.log"

def write(evento: str, email: str = "", ip: str = "") -> None:
    try:
        AUDIT_FILE.parent.mkdir(parents=True, exist_ok=True)
        row = {"ts": time.time(), "ts_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "evento": evento, "email": (email or "")[:120], "ip": (ip or "")[:45]}
        line = json.dumps(row, ensure_ascii=False) + "\n"
        # append + chmod 0600 sin race importante para un log
        fd = os.open(str(AUDIT_FILE), os.O_CREAT | os.O_WRONLY | os.O_APPEND, 0o600)
        try:
            os.write(fd, line.encode())
        finally:
            os.close(fd)
        try:
            os.chmod(AUDIT_FILE, 0o600)
        except Exception:
            pass
    except Exception:
        pass  # auditoría nunca rompe la request

def read_tail(limit: int = 100) -> list[dict]:
    if not AUDIT_FILE.exists():
        return []
    try:
        lines = AUDIT_FILE.read_text(encoding="utf-8", errors="ignore").splitlines()[-max(1, int(limit)):]
    except Exception:
        return []
    out = []
    for ln in lines:
        try:
            out.append(json.loads(ln))
        except Exception:
            continue
    return out
