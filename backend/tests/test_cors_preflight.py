"""CORS: el preflight debe permitir las cabeceras que manda el frontend.

Si `Access-Control-Allow-Headers` no incluye una cabecera que el
frontend envía (p.ej. `X-User-Email`), el navegador responde al preflight
con error y **no envía la petición real**: el backend sólo ve el OPTIONS.
Eso rompía el flujo GitHub Pages (https) → backend local (http://127.0.0.1)
para todos los endpoints que usan api-client.ts (matrícula, cuentas,
tareas, exámenes...).
"""

from fastapi.testclient import TestClient


def _preflight(client, path="/api/accounts/", headers=None):
    return client.options(
        path,
        headers={
            "Origin": "https://lemichiw-cyber.github.io",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": headers or "content-type,x-user-email",
            **({"Access-Control-Request-Private-Network": "true"}),
        },
    )


def test_el_preflight_permite_x_user_email():
    with TestClient(__import__("main").app) as client:
        r = _preflight(client)
        allow = r.headers.get("access-control-allow-headers", "")
        assert "X-User-Email" in allow


def test_el_preflight_permite_content_type_y_authorization():
    with TestClient(__import__("main").app) as client:
        r = _preflight(
            client,
            headers="content-type,authorization,x-requested-with,x-user-email",
        )
        allow = r.headers.get("access-control-allow-headers", "")
        for h in ("Content-Type", "Authorization", "X-Requested-With", "X-User-Email"):
            assert h in allow


def test_el_preflight_desde_pages_permite_el_origen_y_las_credenciales():
    with TestClient(__import__("main").app) as client:
        r = _preflight(client)
        assert r.headers.get("access-control-allow-origin") == "https://lemichiw-cyber.github.io"
        assert r.headers.get("access-control-allow-credentials") == "true"
