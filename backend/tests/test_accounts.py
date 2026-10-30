import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SAKURA_ADMIN_EMAIL", "admin@test.local")
os.environ.setdefault("SAKURA_ADMIN_PASSWORD", "pw-test-123")

from main import app  # noqa: E402

client = TestClient(app)

ADMIN_TOKEN = None


def _admin_login() -> str:
    global ADMIN_TOKEN
    if ADMIN_TOKEN:
        return ADMIN_TOKEN
    r = client.post(
        "/api/admin/login",
        json={"email": os.environ["SAKURA_ADMIN_EMAIL"], "password": os.environ["SAKURA_ADMIN_PASSWORD"]},
    )
    assert r.status_code == 200, r.text
    ADMIN_TOKEN = r.json()["token"]
    return ADMIN_TOKEN


@pytest.fixture(autouse=True)
def _reset_accounts():
    """Cada prueba arranca con un archivo de cuentas limpio."""
    import pathlib
    from api.accounts import ACCOUNTS_FILE

    if ACCOUNTS_FILE.exists():
        ACCOUNTS_FILE.unlink()
    yield
    if ACCOUNTS_FILE.exists():
        ACCOUNTS_FILE.unlink()


def test_estudiante_no_puede_crear_admin():
    """POST /api/accounts ignora el rol del cliente y fuerza 'estudiante'."""
    r = client.post(
        "/api/accounts",
        json={
            "email": "alu@test.local",
            "password": "pw-123456",
            "rol": "admin",  # el cliente intenta autoasignarse admin
            "nombre": "Alumno",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["account"]["rol"] == "estudiante", r.text


def test_put_delete_sin_token_devuelve_401():
    """PUT y DELETE exigen autenticación de admin."""
    # crear cuenta primero
    client.post(
        "/api/accounts",
        json={"email": "otro@test.local", "password": "pw-123456", "rol": "estudiante", "nombre": "Otro"},
    )
    r = client.put("/api/accounts/otro@test.local", json={"rol": "docente"})
    assert r.status_code == 401, r.text

    r = client.delete("/api/accounts/otro@test.local")
    assert r.status_code == 401, r.text


def test_login_admin_desactivado_sin_variables(monkeypatch):
    """Sin SAKURA_ADMIN_EMAIL/PASSWORD, el login admin responde 403."""
    monkeypatch.delenv("SAKURA_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("SAKURA_ADMIN_PASSWORD", raising=False)

    # Forzar recarga del módulo admin para que lea el entorno sin variables
    import importlib
    import api.admin as admin_mod
    importlib.reload(admin_mod)

    from main import app as _app
    c = TestClient(_app)
    r = c.post(
        "/api/admin/login",
        json={"email": "x@y.z", "password": "whatever"},
    )
    assert r.status_code == 403, r.text
