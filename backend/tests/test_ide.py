"""Tests del módulo del IDE (backend/api/ide.py).

Verifica:
  * GET /api/ide/lenguajes lista los lenguajes soportados,
  * POST /api/ide/ejecutar ejecuta Python/JavaScript de verdad,
  * los errores de sintaxis y los tiempos agotados se reportan,
  * todo exige sesión (cookie),
  * el depurador de Python devuelve la traza línea a línea.
"""

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _cookie(client, email="ide@test.local", password="clave123456"):
    """Cookie de sesión: registra, o hace login/define contraseña si ya existe."""
    r = client.post("/api/auth/register", json={"email": email, "nombre": "Estudiante IDE", "password": password})
    if r.status_code in (200, 201):
        r = client.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Cookie": "cherrybomb_session=" + r.json()["token"]}
    # La cuenta ya existe (409): probar login directo; si nunca tuvo
    # contraseña, definirla por el flujo correspondiente.
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return {"Cookie": "cherrybomb_session=" + r.json()["token"]}
    r = client.post("/api/auth/definir-contrasena", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Cookie": "cherrybomb_session=" + r.json()["token"]}


# ------------------------------------------------------------------
# Catálogo de lenguajes
# ------------------------------------------------------------------

def test_lenguajes_lista_soportados(client):
    r = client.get("/api/ide/lenguajes", headers=_cookie(client))
    assert r.status_code == 200, r.text
    ids = {l["id"] for l in r.json()["lenguajes"]}
    assert {"python", "javascript", "typescript", "java", "c", "cpp"} <= ids
    py = next(l for l in r.json()["lenguajes"] if l["id"] == "python")
    assert py["depurable"] is True
    assert "print" in py["ejemplo"]


def test_lenguajes_exige_sesion(client):
    r = client.get("/api/ide/lenguajes")
    assert r.status_code == 401


# ------------------------------------------------------------------
# Ejecución real
# ------------------------------------------------------------------

def test_ejecutar_python_hola_mundo(client):
    r = client.post(
        "/api/ide/ejecutar",
        headers=_cookie(client),
        json={"codigo": 'print("Hola, Mundo!")', "lenguaje": "python"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["salida"].strip() == "Hola, Mundo!"
    assert body["codigo_salida"] == 0
    assert body["error"] == ""


def test_ejecutar_python_calculo(client):
    r = client.post(
        "/api/ide/ejecutar",
        headers=_cookie(client),
        json={"codigo": "total = sum(range(1, 11))\nprint(total)", "lenguaje": "python"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["salida"].strip() == "55"


def test_ejecutar_javascript(client):
    r = client.post(
        "/api/ide/ejecutar",
        headers=_cookie(client),
        json={
            "codigo": 'const nums = [1,2,3,4,5];\nconsole.log("Suma:", nums.reduce((a,b)=>a+b,0));',
            "lenguaje": "javascript",
        },
    )
    assert r.status_code == 200, r.text
    assert "Suma: 15" in r.json()["salida"]


def test_ejecutar_error_sintaxis_se_reporta(client):
    r = client.post(
        "/api/ide/ejecutar",
        headers=_cookie(client),
        json={"codigo": 'print("falta paréntesis"', "lenguaje": "python"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["codigo_salida"] != 0
    assert "Error" in body["error"] or "error" in body["error"]


def test_ejecutar_bucle_infinito_se_corta_con_timeout(client):
    r = client.post(
        "/api/ide/ejecutar",
        headers=_cookie(client),
        json={"codigo": "while True:\n    pass", "lenguaje": "python", "timeout_seg": 2},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["codigo_salida"] == 124
    assert "Tiempo agotado" in body["error"]


def test_ejecutar_lenguaje_invalido(client):
    r = client.post(
        "/api/ide/ejecutar",
        headers=_cookie(client),
        json={"codigo": "print(1)", "lenguaje": "cobol"},
    )
    assert r.status_code == 400


def test_ejecutar_sin_sesion(client):
    r = client.post("/api/ide/ejecutar", json={"codigo": "print(1)", "lenguaje": "python"})
    assert r.status_code == 401


# ------------------------------------------------------------------
# Depurador
# ------------------------------------------------------------------

def test_depurar_python_devuelve_traza(client):
    r = client.post(
        "/api/ide/depurar",
        headers=_cookie(client),
        json={
            "codigo": "x = 5\ny = x * 2\nprint(y)",
            "lenguaje": "python",
        },
    )
    assert r.status_code == 200, r.text
    pasos = r.json()["pasos"]
    assert len(pasos) >= 2
    lineas = [p["linea"] for p in pasos]
    assert 1 in lineas and 2 in lineas
    # En algún paso la variable x o y debe estar visible con su valor.
    vars_vistas = {k: v for p in pasos for k, v in p["variables"].items()}
    assert vars_vistas.get("x") == "5" or vars_vistas.get("y") == "10"


def test_depurar_python_con_breakpoints_filtra(client):
    r = client.post(
        "/api/ide/depurar",
        headers=_cookie(client),
        json={
            "codigo": "a = 1\nb = 2\nc = 3\nprint(a + b + c)",
            "lenguaje": "python",
            "breakpoints": [2],
        },
    )
    assert r.status_code == 200, r.text
    pasos = r.json()["pasos"]
    assert pasos, "con breakpoint en la línea 2 debe haber al menos un paso"
    assert all(p["linea"] == 2 for p in pasos)


def test_depurar_otro_lenguaje_devuelve_nota(client):
    r = client.post(
        "/api/ide/depurar",
        headers=_cookie(client),
        json={"codigo": 'console.log("hola")', "lenguaje": "javascript"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "Paso a paso" in body["nota"] or "paso a paso" in body["nota"]
    assert "hola" in body["salida"]