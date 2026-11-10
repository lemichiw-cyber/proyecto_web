"""Sistema de roles de Cherry-Bomb.

Cubre lo que estaba roto:
  * crear cuentas exige sesión administrativa (antes cualquiera podía crearlas),
  * el rol que elige el admin se respeta (antes se forzaba "estudiante"),
  * las cuentas creadas por el admin pueden quedar sin contraseña y la persona
    la define en su primer ingreso,
  * la cookie de sesión (cookie-only) vale para administrar,
  * el rango VIGENTE (accounts.json) manda sobre el snapshot de la sesión,
  * una cuenta desactivada pierde la sesión al instante,
  * no se puede dejar la plataforma sin ningún administrador activo.
"""

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SAKURA_ADMIN_EMAIL", "admin@test.local")
os.environ.setdefault("SAKURA_ADMIN_PASSWORD", "pw-test-123")

from main import app  # noqa: E402

client = TestClient(app)

ADMIN_EMAIL = "admin@bachillerato.edu"
ADMIN_PASS = "admin-test-123"


@pytest.fixture(autouse=True)
def _reset_accounts():
    """Cada prueba arranca con cuentas y sesiones limpias."""
    from api.accounts import ACCOUNTS_FILE
    from api.auth import SESSIONS_FILE

    for f in (ACCOUNTS_FILE, SESSIONS_FILE):
        if f.exists():
            f.unlink()
    yield
    for f in (ACCOUNTS_FILE, SESSIONS_FILE):
        if f.exists():
            f.unlink()


def _login(email: str, password: str) -> str:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _cookie(token: str) -> dict:
    """Cabecera Cookie explícita (la cookie es Secure en prod y el TestClient
    va por http, así que no viaja sola en la cookie jar)."""
    return {"Cookie": "cherrybomb_session=" + token}


def _login_admin() -> str:
    """Reclama la cuenta semilla (nace sin contraseña) e inicia sesión."""
    r = client.post("/api/auth/definir-contrasena", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return _login(ADMIN_EMAIL, ADMIN_PASS)


# ------------------------------------------------------------------
# Registro público
# ------------------------------------------------------------------

def test_registro_publico_siempre_es_estudiante():
    """Nadie se autoasigna un rango por el registro público."""
    r = client.post("/api/auth/register", json={
        "email": "alu@test.local",
        "nombre": "Alumno",
        "password": "pw-123456",
        "rol": "admin",
    })
    assert r.status_code == 201, r.text
    assert r.json()["rol"] == "estudiante", r.text


# ------------------------------------------------------------------
# Crear cuentas (panel admin)
# ------------------------------------------------------------------

def test_crear_cuenta_sin_sesion_admin_devuelve_401():
    """POST /api/accounts exige rango administrativo."""
    r = client.post("/api/accounts/", json={
        "email": "alu@test.local",
        "nombre": "Alumno",
        "rol": "estudiante",
        "password": "pw-123456",
    })
    assert r.status_code == 401, r.text


def test_estudiante_no_puede_administrar_cuentas():
    """Un estudiante con sesión válida no entra al panel de usuarios."""
    client.post("/api/auth/register", json={
        "email": "alu@test.local", "nombre": "Alumno", "password": "pw-123456",
    })
    token = _login("alu@test.local", "pw-123456")
    r = client.get("/api/accounts/", headers=_cookie(token))
    assert r.status_code == 403, r.text


def test_admin_crea_cuenta_con_el_rango_elegido():
    """El admin decide el rango: se respeta (antes se forzaba estudiante)."""
    token = _login_admin()
    r = client.post("/api/accounts/", headers=_cookie(token), json={
        "email": "profe@test.local",
        "nombre": "Profe",
        "rol": "docente",
        "password": "pw-123456",
    })
    assert r.status_code == 201, r.text
    cuenta = r.json()["account"]
    assert cuenta["rol"] == "docente", r.text
    assert "password_hash" not in cuenta, r.text


def test_admin_crea_cuenta_sin_contrasena():
    """Cuenta sin contraseña: la persona la define en su primer ingreso."""
    token = _login_admin()
    r = client.post("/api/accounts/", headers=_cookie(token), json={
        "email": "nuevo@test.local",
        "nombre": "Nuevo",
        "rol": "coordinador",
    })
    assert r.status_code == 201, r.text
    assert r.json()["account"]["rol"] == "coordinador", r.text

    # El login avisa que falta la contraseña (409), no "credenciales inválidas".
    r2 = client.post("/api/auth/login", json={"email": "nuevo@test.local", "password": "lo-que-sea"})
    assert r2.status_code == 409, r2.text
    assert "PASSWORD_PENDIENTE" in r2.json()["detail"], r2.text


def test_definir_contrasena_habilita_el_primer_ingreso():
    token = _login_admin()
    client.post("/api/accounts/", headers=_cookie(token), json={
        "email": "nuevo@test.local", "nombre": "Nuevo", "rol": "docente",
    })
    r = client.post("/api/auth/definir-contrasena", json={
        "email": "nuevo@test.local", "password": "clave-123456",
    })
    assert r.status_code == 200, r.text
    assert r.json()["rol"] == "docente", r.text

    r2 = client.post("/api/auth/login", json={"email": "nuevo@test.local", "password": "clave-123456"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["rol"] == "docente", r2.text


def test_definir_contrasena_rechaza_cuenta_que_ya_tiene():
    client.post("/api/auth/register", json={
        "email": "alu@test.local", "nombre": "Alumno", "password": "pw-123456",
    })
    r = client.post("/api/auth/definir-contrasena", json={
        "email": "alu@test.local", "password": "otra-123456",
    })
    assert r.status_code == 409, r.text


def test_cuota_admin_no_puede_cambiar_rol_invalido():
    token = _login_admin()
    client.post("/api/accounts/", headers=_cookie(token), json={
        "email": "nuevo@test.local", "nombre": "Nuevo", "rol": "docente",
    })
    r = client.put("/api/accounts/nuevo@test.local", headers=_cookie(token), json={"rol": "jefe"})
    assert r.status_code in (400, 422), r.text


# ------------------------------------------------------------------
# El rango vigente manda
# ------------------------------------------------------------------

def test_promocion_surte_efecto_sin_volver_a_entrar():
    """El rol vigente (accounts.json) pisa el snapshot de la sesión."""
    client.post("/api/auth/register", json={
        "email": "alu@test.local", "nombre": "Alumno", "password": "pw-123456",
    })
    token = _login("alu@test.local", "pw-123456")
    # /api/auth/me rota el token de sesión: hay que seguir con el nuevo.
    r_me = client.get("/api/auth/me", headers=_cookie(token))
    assert r_me.status_code == 200, r_me.text
    assert r_me.json()["rol"] == "estudiante"
    token = r_me.json().get("token_nuevo") or token

    admin = _login_admin()
    r = client.put("/api/accounts/alu@test.local", headers=_cookie(admin), json={"rol": "docente"})
    assert r.status_code == 200, r.text

    # La misma sesión (sin re-loguear) ya ve el rango nuevo.
    rr = client.get("/api/auth/me", headers=_cookie(token))
    assert rr.status_code == 200, rr.text
    assert rr.json()["rol"] == "docente", rr.text


def test_cuenta_desactivada_pierde_la_sesion():
    client.post("/api/auth/register", json={
        "email": "alu@test.local", "nombre": "Alumno", "password": "pw-123456",
    })
    token = _login("alu@test.local", "pw-123456")
    admin = _login_admin()
    r = client.put("/api/accounts/alu@test.local", headers=_cookie(admin), json={"activo": False})
    assert r.status_code == 200, r.text
    rr = client.get("/api/auth/me", headers=_cookie(token))
    assert rr.status_code == 401, rr.text


def test_no_se_puede_dejar_la_plataforma_sin_admin():
    """El único admin no puede degradarse: el panel quedaría inaccesible."""
    admin = _login_admin()
    r = client.put("/api/accounts/admin@bachillerato.edu", headers=_cookie(admin), json={"rol": "estudiante"})
    assert r.status_code == 403, r.text


# ------------------------------------------------------------------
# Rango sin Postgres (local-first)
# ------------------------------------------------------------------

def test_perfil_cae_a_accounts_json_sin_postgres():
    """Sin base de datos, el rango se resuelve igual desde accounts.json."""
    from api.accounts import _load_accounts, _hash_password
    from api.tareas_examenes import _perfil

    cuentas = _load_accounts()
    cuentas["alu@test.local"] = {
        "email": "alu@test.local",
        "password_hash": _hash_password("pw-123456"),
        "rol": "coordinador",
        "nombre": "Alumno",
        "activo": True,
        "semestre": None,
        "creado": None,
    }
    from api.accounts import _save_accounts
    _save_accounts(cuentas)

    p = _perfil("alu@test.local")
    assert p is not None
    assert p["rol"] == "coordinador"


def test_rol_de_cuenta_ignora_cuentas_desactivadas():
    from api.accounts import _load_accounts, _save_accounts, rol_de_cuenta

    cuentas = _load_accounts()
    cuentas["baja@test.local"] = {
        "email": "baja@test.local", "password_hash": None, "rol": "docente",
        "nombre": "Baja", "activo": False, "semestre": None, "creado": None,
    }
    _save_accounts(cuentas)
    assert rol_de_cuenta("baja@test.local") is None
