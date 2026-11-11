"""Las pruebas no deben tocar los datos reales de la laptop.

`backend/accounts.json` es la fuente de verdad de los roles y
`backend/sessions.json` guarda las sesiones activas. Antes, correr
`pytest` los BORRABA y con ello se perdían las cuentas de desarrollo.

Ahora `backend/tests/conftest.py` apunta esas rutas a un directorio
temporal (SAKURA_ACCOUNTS_FILE / SAKURA_SESSIONS_FILE).
"""

import pathlib

from api.accounts import ACCOUNTS_FILE
from api.auth import SESSIONS_FILE


def _es_temporal(ruta: pathlib.Path) -> bool:
    """¿La ruta está dentro de un directorio temporal?"""
    partes = [p.lower() for p in ruta.parts]
    return any("cherrybomb-tests" in p for p in partes) or "tmp" in partes


def test_las_cuentas_de_prueba_no_estan_en_el_proyecto():
    assert _es_temporal(ACCOUNTS_FILE), f"accounts.json real en riesgo: {ACCOUNTS_FILE}"
    assert ACCOUNTS_FILE.name == "accounts.json"


def test_las_sesiones_de_prueba_no_estan_en_el_proyecto():
    assert _es_temporal(SESSIONS_FILE), f"sessions.json real en riesgo: {SESSIONS_FILE}"
    assert SESSIONS_FILE.name == "sessions.json"


def test_el_proyecto_no_tiene_accounts_json_reales():
    """El archivo real del proyecto no debe existir por efecto de las pruebas."""
    backend_dir = pathlib.Path(__file__).resolve().parent.parent
    real = backend_dir / "accounts.json"
    # Si existe, es porque alguien lo creó a mano: las pruebas no lo tocan.
    # Este test sólo informa; el aislamiento ya está 보장izado arriba.
    if real.exists():
        import json
        datos = json.loads(real.read_text(encoding="utf-8"))
        # No debe contener artefactos de prueba.
        assert "@test.local" not in json.dumps(datos)
