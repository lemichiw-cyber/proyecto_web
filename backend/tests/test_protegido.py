"""Endpoints de "Colegio Protegido" (reportes de incidentes).

Verifica:
  * reportar exige sesión (cookie),
  * un estudiante ve SOLO sus incidentes,
  * el personal docente ve todos y puede resolverlos,
  * un estudiante no puede borrar el reporte de otro,
  * el estado se guarda en el directorio de datos (no en el código).
"""

import json

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _registrar(client, email, rol="estudiante", password="clave123456"):
    """Registra (o define la contraseña de) una cuenta y devuelve su cookie."""
    r = client.post("/api/auth/register", json={"email": email, "nombre": "Test", "password": password})
    if r.status_code == 409:
        # La cuenta ya existe (la creó el admin): se le define la contraseña.
        r = client.post("/api/auth/definir-contrasena", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Cookie": "cherrybomb_session=" + r.json()["token"]}
    assert r.status_code in (200, 201), r.text
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Cookie": "cherrybomb_session=" + r.json()["token"]}


def test_reportar_exige_sesion(client):
    r = client.post("/api/protegido/incidentes", json={"tipo": "Acoso", "desc": "algo"})
    assert r.status_code == 401


def test_reportar_y_listar_propio(client):
    h = _registrar(client, "alu@test.local")
    r = client.post("/api/protegido/incidentes", json={"tipo": "Acoso", "desc": "en el patio"}, headers=h)
    assert r.status_code == 201, r.text
    iid = r.json()["id"]

    r = client.get("/api/protegido/incidentes", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 1
    assert data["incidentes"][0]["id"] == iid
    assert data["incidentes"][0]["tipo"] == "Acoso"
    assert data["incidentes"][0]["estado"] == "pendiente"
    # El frontend nunca manda Authorization: la cookie alcanza.
    assert data["incidentes"][0]["autor"] == "alu@test.local"


def test_un_estudiante_no_ve_los_reportes_de_otros(client):
    h1 = _registrar(client, "uno@test.local")
    h2 = _registrar(client, "dos@test.local")
    client.post("/api/protegido/incidentes", json={"tipo": "Robo", "desc": "mochila"}, headers=h1)

    r = client.get("/api/protegido/incidentes", headers=h2)
    assert r.status_code == 200
    assert r.json()["count"] == 0


def test_el_personal_docente_ve_todos_y_resuelve(client):
    h_alu = _registrar(client, "alu2@test.local")
    client.post("/api/protegido/incidentes", json={"tipo": "Emergencia", "desc": "gas"}, headers=h_alu)

    # Se promueve a docente desde accounts.json (fuente de verdad de roles).
    from api.accounts import ACCOUNTS_FILE

    datos = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    datos["doc@test.local"] = {"rol": "docente", "nombre": "Doc", "activo": True}
    ACCOUNTS_FILE.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")

    h_doc = _registrar(client, "doc@test.local")
    r = client.get("/api/protegido/incidentes", headers=h_doc)
    assert r.status_code == 200
    data = r.json()
    # El personal docente ve TODOS los incidentes (no sólo los propios).
    assert data["gestion"] is True
    assert data["count"] >= 1

    iid = data["incidentes"][0]["id"]
    r = client.post(f"/api/protegido/incidentes/{iid}/resolver", headers=h_doc)
    assert r.status_code == 200
    assert r.json()["incidente"]["estado"] == "resuelto"

    # Y ya no aparece pendiente.
    r = client.get("/api/protegido/incidentes", headers=h_doc)
    por_id = {i["id"]: i for i in r.json()["incidentes"]}
    assert por_id[iid]["estado"] == "resuelto"


def test_un_estudiante_no_puede_resolver(client):
    h = _registrar(client, "alu3@test.local")
    r = client.post("/api/protegido/incidentes", json={"tipo": "Prueba"}, headers=h)
    iid = r.json()["id"]
    r = client.post(f"/api/protegido/incidentes/{iid}/resolver", headers=h)
    assert r.status_code == 403


def test_no_puede_borrar_el_reporte_de_otro(client):
    h1 = _registrar(client, "a@test.local")
    h2 = _registrar(client, "b@test.local")
    iid = client.post("/api/protegido/incidentes", json={"tipo": "Prueba"}, headers=h1).json()["id"]
    r = client.delete(f"/api/protegido/incidentes/{iid}", headers=h2)
    assert r.status_code == 403
    # El autor sí puede.
    r = client.delete(f"/api/protegido/incidentes/{iid}", headers=h1)
    assert r.status_code == 200


def test_el_tipo_no_puede_venir_vacio(client):
    h = _registrar(client, "alu4@test.local")
    r = client.post("/api/protegido/incidentes", json={"tipo": "   ", "desc": "x"}, headers=h)
    assert r.status_code in (400, 422)


def test_los_incidentes_se_guardan_fuera_del_codigo(client, monkeypatch, tmp_path):
    from api import protegido as mod

    destino = tmp_path / "incidentes.json"
    monkeypatch.setattr(mod, "INCIDENTES_FILE", destino)
    h = _registrar(client, "alu5@test.local")
    r = client.post("/api/protegido/incidentes", json={"tipo": "Prueba"}, headers=h)
    assert r.status_code == 201
    assert destino.exists()
    # Permisos restrictivos: contiene datos sensibles.
    assert oct(destino.stat().st_mode)[-3:] == "600"
