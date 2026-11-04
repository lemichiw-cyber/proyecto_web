import os
from fastapi.testclient import TestClient

os.environ.setdefault("SAKURA_ADMIN_EMAIL", "admin@test.local")
os.environ.setdefault("SAKURA_ADMIN_PASSWORD", "pw-test-123")

from main import app  # noqa: E402

client = TestClient(app)


def _reset_sessions():
    import pathlib
    from api.auth import SESSIONS_FILE
    if SESSIONS_FILE.exists():
        SESSIONS_FILE.unlink()


def test_register_devuelve_rol_estudiante():
    _reset_sessions()
    r = client.post("/api/auth/register", json={
        "email": "alu@test.local",
        "nombre": "Alumno",
        "password": "pw-123456",
        "rol": "admin",  # el cliente intenta autoasignarse admin; se ignora
    })
    assert r.status_code == 201, r.text
    assert r.json()["rol"] == "estudiante", r.text


def test_login_devuelve_token_y_rol():
    _reset_sessions()
    client.post("/api/auth/register", json={
        "email": "alu@test.local",
        "nombre": "Alumno",
        "password": "pw-123456",
        "rol": "estudiante",
    })
    r = client.post("/api/auth/login", json={
        "email": "alu@test.local",
        "password": "pw-123456",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert "token" in data
    assert data["rol"] == "estudiante"


def test_login_credenciales_invalidas_devuelve_401():
    _reset_sessions()
    r = client.post("/api/auth/login", json={
        "email": "noexiste@test.local",
        "password": "whatever",
    })
    assert r.status_code == 401, r.text


def test_me_valida_token():
    _reset_sessions()
    client.post("/api/auth/register", json={
        "email": "alu@test.local",
        "nombre": "Alumno",
        "password": "pw-123456",
        "rol": "estudiante",
    })
    r = client.post("/api/auth/login", json={
        "email": "alu@test.local",
        "password": "pw-123456",
    })
    token = r.json()["token"]
    rr = client.get("/api/auth/me", headers={"Authorization": "Bearer " + token})
    assert rr.status_code == 200, rr.text
    assert rr.json()["email"] == "alu@test.local"
    assert rr.json()["rol"] == "estudiante"


def test_me_sin_token_devuelve_401():
    _reset_sessions()
    r = client.get("/api/auth/me")
    assert r.status_code == 401, r.text


def test_logout_invalida_token():
    _reset_sessions()
    client.post("/api/auth/register", json={
        "email": "alu@test.local",
        "nombre": "Alumno",
        "password": "pw-123456",
        "rol": "estudiante",
    })
    r = client.post("/api/auth/login", json={
        "email": "alu@test.local",
        "password": "pw-123456",
    })
    token = r.json()["token"]
    # Antes del logout, /api/auth/me funciona
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer " + token}).status_code == 200
    # Después del logout, el token ya no sirve
    client.post("/api/auth/logout", headers={"Authorization": "Bearer " + token})
    rr = client.get("/api/auth/me", headers={"Authorization": "Bearer " + token})
    assert rr.status_code == 401, rr.text
