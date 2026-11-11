"""Configuración común de las pruebas del backend.

Punto importante: las pruebas NO deben tocar los datos reales de la
laptop (`backend/accounts.json` y `backend/sessions.json`). Antes las
borraban, y con ello se perdían las cuentas de desarrollo (admin@…,
profe@…) cada vez que se corría `pytest`.

Acá se apuntan los archivos a un directorio temporal ANTES de que se
importen los módulos del backend (las rutas se leen al importar).
"""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path

import pytest

# --- Aislamiento de los archivos de datos -------------------------------
_TMP_DIR = Path(tempfile.mkdtemp(prefix="cherrybomb-tests-"))
# TODO lo que el backend escribe (cuentas, sesiones, auditoría,
# suscripciones push, reportes del foro, incidentes) va al temporal:
# así las pruebas no tocan los datos reales de la laptop NI ensucian el
# directorio del código.
os.environ.setdefault("SAKURA_DATA_DIR", str(_TMP_DIR))
os.environ.setdefault("SAKURA_ACCOUNTS_FILE", str(_TMP_DIR / "accounts.json"))
os.environ.setdefault("SAKURA_SESSIONS_FILE", str(_TMP_DIR / "sessions.json"))
# La app servida por el backend no debe activarse durante las pruebas
# (depende de que exista dist/, que varies según el checkout).
os.environ.setdefault("SAKURA_SERVE_APP", "0")


@pytest.fixture(scope="session", autouse=True)
def _limpiar_temporales():
    """Borra el directorio temporal de la sesión de pruebas."""
    yield
    shutil.rmtree(_TMP_DIR, ignore_errors=True)
