"""Los datos (cuentas y sesiones) pueden vivir fuera del repositorio.

En el servidor Debian el backend corre como servicio del sistema con el
código en /srv/cherrybomb (sólo lectura) y los datos en
/var/lib/cherrybomb. Así un `git pull` o un `npm ci` no pisa las cuentas.

La ruta se resuelve en este orden:
  1) SAKURA_ACCOUNTS_FILE / SAKURA_SESSIONS_FILE (pruebas, rutas exactas)
  2) SAKURA_DATA_DIR (directorio de datos)
  3) el directorio del backend (comportamiento por defecto)
"""

import importlib
import os
import pathlib
import tempfile

import pytest


@pytest.fixture
def _data_dir():
    d = pathlib.Path(tempfile.mkdtemp(prefix="cherrybomb-data-"))
    # conftest.py fija SAKURA_ACCOUNTS_FILE/SAKURA_SESSIONS_FILE (tiene
    # prioridad). Acá se quitan un momento para poder comprobar que
    # SAKURA_DATA_DIR manda cuando no hay ruta exacta.
    saved = {
        k: os.environ.pop(k)
        for k in ("SAKURA_DATA_DIR", "SAKURA_ACCOUNTS_FILE", "SAKURA_SESSIONS_FILE")
        if k in os.environ
    }
    os.environ["SAKURA_DATA_DIR"] = str(d)
    yield d
    for k in ("SAKURA_DATA_DIR", "SAKURA_ACCOUNTS_FILE", "SAKURA_SESSIONS_FILE"):
        os.environ.pop(k, None)
    os.environ.update(saved)


def test_las_cuentas_viven_en_el_directorio_de_datos(_data_dir):
    import api.accounts as cuentas_mod

    mod = importlib.reload(cuentas_mod)
    try:
        assert mod.ACCOUNTS_FILE.parent == _data_dir
        assert mod.ACCOUNTS_FILE.name == "accounts.json"
    finally:
        importlib.reload(cuentas_mod)


def test_las_sesiones_viven_en_el_directorio_de_datos(_data_dir):
    import api.auth as auth_mod

    mod = importlib.reload(auth_mod)
    try:
        assert mod.SESSIONS_FILE.parent == _data_dir
        assert mod.SESSIONS_FILE.name == "sessions.json"
    finally:
        importlib.reload(auth_mod)


def test_la_variable_de_entorno_exacta_tiene_prioridad(_data_dir):
    """SAKURA_ACCOUNTS_FILE gana sobre SAKURA_DATA_DIR (lo usan las pruebas)."""
    exacto = _data_dir / "otro.json"
    os.environ["SAKURA_ACCOUNTS_FILE"] = str(exacto)
    import api.accounts as cuentas_mod

    mod = importlib.reload(cuentas_mod)
    try:
        assert mod.ACCOUNTS_FILE == exacto
    finally:
        os.environ.pop("SAKURA_ACCOUNTS_FILE", None)
        importlib.reload(cuentas_mod)


def test_todos_los_archivos_que_escribe_el_backend_van_al_data_dir(_data_dir):
    """Con ProtectSystem=strict el backend sólo puede escribir en /var/lib/..."""
    import api.moderacion as mod_mod
    import api.push as push_mod
    import audit as audit_mod

    # Se recargan: la ruta se resuelve AL IMPORTAR el módulo.
    mods = [importlib.reload(mod_mod), importlib.reload(push_mod), importlib.reload(audit_mod)]
    mod_mod, push_mod, audit_mod = mods
    try:
        assert mod_mod.REPORTES_FILE.parent == _data_dir
        assert push_mod.SUBS_FILE.parent == _data_dir
        assert audit_mod.AUDIT_FILE.parent == _data_dir
    finally:
        for m in mods:
            importlib.reload(m)


def test_la_auditoria_se_escribe_en_el_data_dir(_data_dir):
    """Una escritura real de auditoría (append-only, 0600)."""
    import audit as audit_mod

    mod = importlib.reload(audit_mod)
    try:
        mod.write("test", email="a@test.local", ip="127.0.0.1")
        assert mod.AUDIT_FILE.exists()
        assert mod.AUDIT_FILE.parent == _data_dir
        # Permisos restrictivos (PII).
        assert oct(mod.AUDIT_FILE.stat().st_mode)[-3:] == "600"
        filas = mod.read_tail(5)
        assert filas and filas[-1]["evento"] == "test"
    finally:
        importlib.reload(audit_mod)


def test_paths_data_file_respeta_la_variable_exacta():
    from paths import data_file

    os.environ["SAKURA_CUENTA_TEST"] = "/tmp/opencode/exacto.json"
    try:
        assert str(data_file("x.json", "SAKURA_CUENTA_TEST")) == "/tmp/opencode/exacto.json"
    finally:
        os.environ.pop("SAKURA_CUENTA_TEST", None)
