"""Cookie de sesión: atributos y SameSite configurable.

Contexto: cuando el frontend se sirve desde GitHub Pages (https://
lemichiw-cyber.github.io) y el backend corre en la laptop
(http://127.0.0.1:8000), la petición es CROSS-SITE. Con SameSite=Lax el
navegador NO manda la cookie de sesión y el login "se pierde" al recargar.

`SAKURA_COOKIE_SAMESITE=none` resuelve eso (los navegadores exigen Secure
junto con SameSite=None, y 127.0.0.1/localhost son orígenes confiables).
"""

import importlib
import os

import pytest
from fastapi.testclient import TestClient


def _reload_auth(samesite: str):
    """Recarga api.auth con la variable de entorno puesta."""
    os.environ["SAKURA_COOKIE_SAMESITE"] = samesite
    import api.auth as auth_mod
    return importlib.reload(auth_mod)


@pytest.fixture(autouse=True)
def _restore_env():
    old = os.environ.get("SAKURA_COOKIE_SAMESITE")
    yield
    if old is None:
        os.environ.pop("SAKURA_COOKIE_SAMESITE", None)
    else:
        os.environ["SAKURA_COOKIE_SAMESITE"] = old
    import api.auth as auth_mod
    importlib.reload(auth_mod)


@pytest.fixture(autouse=True)
def _cuentas_limpias():
    """Cada prueba arranca sin cuentas ni sesiones (como en test_roles.py)."""
    from api.accounts import ACCOUNTS_FILE
    from api.auth import SESSIONS_FILE

    for f in (ACCOUNTS_FILE, SESSIONS_FILE):
        if f.exists():
            f.unlink()
    yield
    for f in (ACCOUNTS_FILE, SESSIONS_FILE):
        if f.exists():
            f.unlink()


def test_samesite_por_defecto_es_lax():
    os.environ.pop("SAKURA_COOKIE_SAMESITE", None)
    import api.auth as auth_mod
    importlib.reload(auth_mod)
    assert auth_mod.SESSION_COOKIE_SAMESITE == "lax"


def test_samesite_none_fuerza_secure():
    auth = _reload_auth("none")
    assert auth.SESSION_COOKIE_SAMESITE == "none"
    # Sin Secure los navegadores rechazan la cookie.
    assert auth.SESSION_COOKIE_SECURE is True


def test_samesite_invalido_cae_a_lax():
    auth = _reload_auth("inventado")
    assert auth.SESSION_COOKIE_SAMESITE == "lax"


def test_strict_se_acepta():
    auth = _reload_auth("strict")
    assert auth.SESSION_COOKIE_SAMESITE == "strict"


def test_login_emite_la_cookie_con_el_samesite_configurado():
    auth = _reload_auth("none")
    from main import app

    with TestClient(app) as client:
        # La cuenta semilla del admin nace sin contraseña: se define y listo.
        r = client.post(
            "/api/auth/definir-contrasena",
            json={"email": "admin@bachillerato.edu", "password": "clave-123"},
        )
        assert r.status_code == 200, r.text
        set_cookie = r.headers.get("set-cookie", "")
        assert "cherrybomb_session=" in set_cookie
        assert "SameSite=none" in set_cookie
        assert "Secure" in set_cookie
        assert "HttpOnly" in set_cookie


def test_logout_borra_la_cookie():
    auth = _reload_auth("none")
    from main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/auth/definir-contrasena",
            json={"email": "admin@bachillerato.edu", "password": "clave-123"},
        )
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        out = client.post("/api/auth/logout", headers={"Cookie": "cherrybomb_session=" + token})
        assert out.status_code == 200, out.text
        set_cookie = out.headers.get("set-cookie", "")
        assert "cherrybomb_session=" in set_cookie
        assert "Max-Age=0" in set_cookie


# ----------------------------------------------------------------------
# Sin SAKURA_COOKIE_SAMESITE el backend decide por petición:
# same-site → lax (más estricto), cross-site → none + secure.
# ----------------------------------------------------------------------


def test_sin_configuracion_mismo_sitio_usa_lax():
    os.environ.pop("SAKURA_COOKIE_SAMESITE", None)
    import api.auth as auth_mod
    importlib.reload(auth_mod)
    from main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/auth/definir-contrasena",
            json={"email": "admin@bachillerato.edu", "password": "clave-123"},
            headers={"Origin": "http://testserver"},
        )
        assert r.status_code == 200, r.text
        set_cookie = r.headers.get("set-cookie", "")
        assert "SameSite=lax" in set_cookie, set_cookie


def test_sin_configuracion_otro_sitio_usa_none_y_secure():
    """La PWA de GitHub Pages contra el backend local: cross-site."""
    os.environ.pop("SAKURA_COOKIE_SAMESITE", None)
    import api.auth as auth_mod
    importlib.reload(auth_mod)
    from main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/auth/definir-contrasena",
            json={"email": "admin@bachillerato.edu", "password": "clave-123"},
            headers={"Origin": "https://lemichiw-cyber.github.io"},
        )
        assert r.status_code == 200, r.text
        set_cookie = r.headers.get("set-cookie", "")
        assert "SameSite=none" in set_cookie, set_cookie
        assert "Secure" in set_cookie, set_cookie
        assert "HttpOnly" in set_cookie, set_cookie


def test_configuracion_explicita_manda_sobre_el_origen():
    """Si el operador fija SAKURA_COOKIE_SAMESITE, se respeta siempre."""
    auth = _reload_auth("strict")
    from main import app

    with TestClient(app) as client:
        r = client.post(
            "/api/auth/definir-contrasena",
            json={"email": "admin@bachillerato.edu", "password": "clave-123"},
            headers={"Origin": "https://otro-sitio.example"},
        )
        assert r.status_code == 200, r.text
        assert "SameSite=strict" in r.headers.get("set-cookie", "")
