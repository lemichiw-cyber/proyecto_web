"""Endpoints del Portal de Padres (/api/padres).

Verifica:
  * sólo las cuentas con rango "padres" pueden ver la sección,
  * los hijos salen de los emails vinculados a la cuenta del padre,
  * el resumen trae tareas, notas y asistencia de CADA hijo,
  * un padre NO ve los datos de otro alumno.
"""

import json

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _cookie(token: str) -> dict:
    return {"Cookie": "cherrybomb_session=" + token}


def _registrar(client, email, nombre="Test", password="clave123456"):
    """Registra la cuenta (o usa la existente) y devuelve su cabecera Cookie."""
    r = client.post(
        "/api/auth/register",
        json={"email": email, "nombre": nombre, "password": password},
    )
    if r.status_code in (200, 201):
        r = client.post("/api/auth/login", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return _cookie(r.json()["token"])
    assert r.status_code == 409, r.text

    # Ya existe: se intenta entrar con la contraseña conocida.
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return _cookie(r.json()["token"])
    if r.status_code == 409:
        # Cuenta creada por el administrador: todavía no tiene contraseña.
        r = client.post(
            "/api/auth/definir-contrasena", json={"email": email, "password": password}
        )
        assert r.status_code == 200, r.text
        return _cookie(r.json()["token"])
    raise AssertionError(f"No se pudo autenticar {email}: {r.status_code} {r.text}")


def _rol_y_campos(client, email, rol, campos=None):
    """Fija el rango y los campos extra (ej. hijo_email) de una cuenta."""
    from api.accounts import ACCOUNTS_FILE

    _registrar(client, email)
    datos = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    datos[email]["rol"] = rol
    if campos:
        datos[email].update(campos)
    ACCOUNTS_FILE.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")


def test_el_portal_exige_sesion(client):
    r = client.get("/api/padres/hijos")
    assert r.status_code == 401


def test_un_estudiante_no_entra_al_portal(client):
    h = _registrar(client, "alu-pad@test.local")
    r = client.get("/api/padres/hijos", headers=h)
    assert r.status_code == 403
    r = client.get("/api/padres/resumen", headers=h)
    assert r.status_code == 403


def test_los_hijos_vinculados_se_listan(client):
    _registrar(client, "hijo-pad@test.local", nombre="Ana Hija")
    _rol_y_campos(
        client,
        "padre-pad@test.local",
        "padres",
        {"hijo_email": "hijo-pad@test.local"},
    )
    h = _registrar(client, "padre-pad@test.local")
    r = client.get("/api/padres/hijos", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["count"] == 1
    assert data["hijos"][0]["email"] == "hijo-pad@test.local"
    assert data["hijos"][0]["nombre"] == "Ana Hija"


def test_el_resumen_trae_tareas_notas_y_asistencia(client, monkeypatch, tmp_path):
    from api import padres as mod

    aulas = {
        "tareas": {
            "t1": {"id": "t1", "estudiante_email": "hijo2-pad@test.local",
                   "titulo": "Ensayo de química", "materia": "Química", "fecha": "2026-03-01"},
        },
        "entregas": {
            "e1": {"id": "e1", "estudiante_email": "hijo2-pad@test.local", "tarea_id": "t1"},
        },
        "calificaciones": {
            "c1": {"id": "c1", "estudiante_email": "hijo2-pad@test.local",
                   "tarea_id": "t1", "nota": 9, "comentario": "Muy bien"},
        },
        "asistencia": {
            "a1": {"id": "a1", "estudiante_email": "hijo2-pad@test.local", "estado": "presente"},
            "a2": {"id": "a2", "estudiante_email": "hijo2-pad@test.local", "estado": "ausente"},
        },
        "aulas": {},
        "inscripciones": {},
    }
    destino = tmp_path / "aulas.json"
    destino.write_text(json.dumps(aulas, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(mod, "AULAS_FILE", destino)

    _registrar(client, "hijo2-pad@test.local", nombre="Beto Hijo")
    _rol_y_campos(
        client,
        "madre-pad@test.local",
        "padres",
        {"hijo_email": "hijo2-pad@test.local"},
    )
    h = _registrar(client, "madre-pad@test.local")
    r = client.get("/api/padres/resumen", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["count"] == 1
    hijo = data["hijos"][0]
    assert hijo["email"] == "hijo2-pad@test.local"
    assert len(hijo["tareas"]) == 1
    assert hijo["tareas"][0]["titulo"] == "Ensayo de química"
    assert hijo["tareas"][0]["entregada"] is True
    assert hijo["promedio"] == 9
    assert hijo["asistencia"]["registros"] == 2
    assert hijo["asistencia"]["presentes"] == 1


def test_un_padre_no_ve_los_datos_de_otro_alumno(client, monkeypatch, tmp_path):
    from api import padres as mod

    aulas = {
        "tareas": {
            "t1": {"id": "t1", "estudiante_email": "otro-pad@test.local", "titulo": "Privada"},
        },
        "entregas": {},
        "calificaciones": {},
        "asistencia": {},
    }
    destino = tmp_path / "aulas.json"
    destino.write_text(json.dumps(aulas, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(mod, "AULAS_FILE", destino)

    _registrar(client, "otro-pad@test.local")
    _registrar(client, "mihijo-pad@test.local")
    _rol_y_campos(
        client,
        "padre2-pad@test.local",
        "padres",
        {"hijo_email": "mihijo-pad@test.local"},
    )
    h = _registrar(client, "padre2-pad@test.local")
    r = client.get("/api/padres/resumen", headers=h)
    assert r.status_code == 200
    hijo = r.json()["hijos"][0]
    assert hijo["email"] == "mihijo-pad@test.local"
    assert hijo["tareas"] == []


def test_los_contactos_son_docentes_y_administracion(client):
    _rol_y_campos(client, "doc-pad@test.local", "docente")
    _rol_y_campos(client, "alu-pad2@test.local", "estudiante")
    h = _registrar(client, "padre3-pad@test.local")
    r = client.get("/api/padres/contactos", headers=h)
    assert r.status_code == 200
    emails = [c["email"] for c in r.json()["contactos"]]
    assert "doc-pad@test.local" in emails
    assert "alu-pad2@test.local" not in emails
