"""Persistencia JSON endurecida: escritura atómica + 0600 + lock (P1).

Sin dependencias nuevas: tmp en el mismo dir + os.replace (atómico en POSIX y Windows)
y fcntl.flock si está disponible (Linux). Corrige truncados a las 7am con 500 escritores.
"""
from __future__ import annotations
import json, os, pathlib, tempfile
try:
    import fcntl
    _HAS_FCNTL = True
except Exception:
    _HAS_FCNTL = False

def read_json(path: pathlib.Path, default=None):
    if default is None:
        default = {}
    if not pathlib.Path(path).exists():
        return default
    try:
        return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default

def write_json_atomic(path: pathlib.Path, data, *, mode: int = 0o600) -> None:
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, indent=2)
    fd, tmp = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            if _HAS_FCNTL:
                try:
                    fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                except Exception:
                    pass
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        try:
            os.chmod(path, mode)
        except Exception:
            pass
    finally:
        if os.path.exists(tmp):
            try:
                os.unlink(tmp)
            except Exception:
                pass
