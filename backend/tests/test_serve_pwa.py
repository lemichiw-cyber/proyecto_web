"""El backend puede servir la propia PWA (mismo origen).

Contexto: la PWA de GitHub Pages (https) llama al backend local
(http://127.0.0.1:8000). Son sitios distintos, así que el navegador pide
el permiso de "acceso a la red local" (LNA) y la cookie de sesión
necesita SameSite=None.

Si el backend además sirve la app en http://127.0.0.1:8000/, todo queda
en el mismo origen: sin CORS, sin LNA y con la cookie normal. Esta es la
vía que no necesita ningún permiso del navegador.

Lo que se verifica acá:
  * `/` devuelve la app (HTML) y no el JSON del health check.
  * La API sigue respondiendo JSON en /api/*.
  * En index.html se inyecta `window.__CB_API_BASE__=""` para que la app
    use rutas /api relativas (mismo origen), sin importar el host.
  * Las rutas desconocidas devuelven index.html (fallback de la SPA).
  * La CSP de la app permite sus recursos; la de la API sigue estricta.
  * Con SAKURA_SERVE_APP=0 el backend NO sirve la app (despliegue en la
    nube, donde la PWA vive en otro sitio).
"""

import importlib
import os

import pytest
from fastapi.testclient import TestClient


def _recargar(servir: str):
    os.environ["SAKURA_SERVE_APP"] = servir
    import main as main_mod
    return importlib.reload(main_mod)


@pytest.fixture(autouse=True)
def _restore_env():
    old = os.environ.get("SAKURA_SERVE_APP")
    yield
    if old is None:
        os.environ.pop("SAKURA_SERVE_APP", None)
    else:
        os.environ["SAKURA_SERVE_APP"] = old
    import main as main_mod
    importlib.reload(main_mod)


@pytest.fixture(autouse=True)
def _cuentas_limpias():
    from api.accounts import ACCOUNTS_FILE
    from api.auth import SESSIONS_FILE

    for f in (ACCOUNTS_FILE, SESSIONS_FILE):
        if f.exists():
            f.unlink()
    yield
    for f in (ACCOUNTS_FILE, SESSIONS_FILE):
        if f.exists():
            f.unlink()


def test_sin_pwa_la_raiz_sigue_siendo_json():
    main_mod = _recargar("0")
    assert main_mod._SERVE_APP is False
    with TestClient(main_mod.app) as client:
        r = client.get("/")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/json")
        assert r.json()["ok"] is True


def test_con_pwa_la_raiz_sirve_la_app():
    main_mod = _recargar("1")
    if not (main_mod._DIST_DIR / "index.html").exists():
        pytest.skip("no hay build de la PWA (dist/index.html)")
    with TestClient(main_mod.app) as client:
        r = client.get("/")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/html")
        assert "<title>" in r.text or "Cherry-Bomb" in r.text


def test_inyecta_la_url_de_api_del_servidor():
    main_mod = _recargar("1")
    if not (main_mod._DIST_DIR / "index.html").exists():
        pytest.skip("no hay build de la PWA (dist/index.html)")
    with TestClient(main_mod.app) as client:
        r = client.get("/")
        assert 'window.__CB_API_BASE__=""' in r.text


def test_la_api_sigue_respondiendo_json():
    main_mod = _recargar("1")
    with TestClient(main_mod.app) as client:
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/json")
        assert r.json()["ok"] is True


def test_fallback_de_la_spa():
    main_mod = _recargar("1")
    if not (main_mod._DIST_DIR / "index.html").exists():
        pytest.skip("no hay build de la PWA (dist/index.html)")
    with TestClient(main_mod.app) as client:
        r = client.get("/ruta-que-no-existe")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/html")
        assert 'window.__CB_API_BASE__=""' in r.text


def test_csp_de_la_app_permite_sus_recursos():
    main_mod = _recargar("1")
    if not (main_mod._DIST_DIR / "index.html").exists():
        pytest.skip("no hay build de la PWA (dist/index.html)")
    with TestClient(main_mod.app) as client:
        r = client.get("/")
        csp = r.headers.get("content-security-policy", "")
        assert "script-src 'self'" in csp
        assert "connect-src" in csp


def test_csp_de_la_api_sigue_estricta():
    main_mod = _recargar("1")
    with TestClient(main_mod.app) as client:
        r = client.get("/api/health")
        csp = r.headers.get("content-security-policy", "")
        assert "default-src 'none'" in csp
