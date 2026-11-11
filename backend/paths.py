"""Rutas de datos del backend.

El backend escribe varios archivos (cuentas, sesiones, auditoría,
suscripciones push, reportes del foro). Por defecto van al directorio
del código (`backend/`), que es lo que se usaba siempre.

En el servidor Debian el código se despliega en `/srv/cherrybomb` y el
servicio corre con `ProtectSystem=strict` (sólo puede escribir en
`/var/lib/cherrybomb`). Por eso `SAKURA_DATA_DIR` permite mover todos
esos archivos fuera del código: así además sobreviven a los despliegues
(`git pull`, `npm ci`).

Prioridad de cada archivo:
  1) variable de entorno exacta (SAKURA_ACCOUNTS_FILE, …) — la usan las
     pruebas para no tocar los datos reales,
  2) SAKURA_DATA_DIR,
  3) el directorio del backend (comportamiento por defecto).
"""

from __future__ import annotations

import os
from pathlib import Path

# .../proyecto_web/backend
BASE_DIR = Path(__file__).resolve().parent


def data_dir() -> Path:
    """Directorio donde viven los datos que escribe el backend."""
    d = os.getenv("SAKURA_DATA_DIR", "").strip()
    return Path(d).expanduser() if d else BASE_DIR


def data_file(nombre: str, env_var: str | None = None) -> Path:
    """Ruta de un archivo de datos, respetando la variable de entorno exacta."""
    if env_var:
        exacto = os.getenv(env_var, "").strip()
        if exacto:
            return Path(exacto).expanduser()
    return data_dir() / nombre
