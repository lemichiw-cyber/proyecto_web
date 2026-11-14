"""Endpoints de Mensajes (/api/mensajes).

Verifica:
  * la bandeja exige sesión (cookie),
  * un estudiante sólo ve sus conversaciones (nunca las de otros),
  * el remitente y el destinatario ven el mensaje; un tercero no,
  * el estudiante sólo puede escribirle al personal del colegio,
  * el personal docente puede escribirle a cualquiera,
  * abrir la conversación marca lo recibido como leído,
  * borrar: el remitente sí, un tercero no,
  * los datos se guardan fuera del código y con permisos 0600.
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
    """Registra la cuenta (o usa la existente) y devuelve su cabecera Cookie.

    La cuenta puede existir ya: (a) creada por el admin sin contraseña →
    se define en el primer ingreso, (b) creada antes en el mismo test →
    se entra directamente con la contraseña conocida.
    """
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


def _rol(client, email, rol, nombre="Persona"):
    """Fija el rango de una cuenta ya registrada (accounts.json es la fuente)."""
    from api.accounts import ACCOUNTS_FILE

    _registrar(client, email, nombre=nombre)
    datos = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    datos[email]["rol"] = rol
    datos[email]["nombre"] = nombre
    ACCOUNTS_FILE.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")


def test_la_bandeja_exige_sesion(client):
    r = client.get("/api/mensajes/bandeja")
    assert r.status_code == 401


def test_enviar_y_ver_la_conversacion(client):
    # El docente es personal del colegio: el estudiante sí puede escribirle.
    _rol(client, "doc-msj@test.local", "docente", nombre="Docente")
    h_doc = _registrar(client, "doc-msj@test.local", nombre="Docente")
    h_alu = _registrar(client, "alu-msj@test.local", nombre="Alumno")

    # El alumno escribe al docente (el docente existe como cuenta).
    r = client.post(
        "/api/mensajes/enviar",
        json={
            "destinatario": "doc-msj@test.local",
            "asunto": "Consulta",
            "contenido": "¿Me pasás la consigna?",
        },
        headers=h_alu,
    )
    assert r.status_code == 201, r.text
    mid = r.json()["id"]

    # El docente lo ve en su bandeja.
    r = client.get("/api/mensajes/bandeja", headers=h_doc)
    assert r.status_code == 200
    conv = r.json()["conversaciones"]
    assert len(conv) == 1
    assert conv[0]["email"] == "alu-msj@test.local"
    assert conv[0]["no_leidos"] == 1

    # Y al abrir la conversación, el mensaje queda leído.
    r = client.get("/api/mensajes/conversacion/alu-msj@test.local", headers=h_doc)
    assert r.status_code == 200
    assert len(r.json()["mensajes"]) == 1

    r = client.get("/api/mensajes/bandeja", headers=h_doc)
    assert r.json()["conversaciones"][0]["no_leidos"] == 0
    assert mid


def test_un_tercero_no_ve_la_conversacion(client):
    h1 = _registrar(client, "uno-msj@test.local")
    _rol(client, "dos-msj@test.local", "docente")
    h2 = _registrar(client, "dos-msj@test.local")
    h3 = _registrar(client, "tres-msj@test.local")
    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "dos-msj@test.local", "contenido": "secreto"},
        headers=h1,
    )
    assert r.status_code == 201, r.text
    r = client.get("/api/mensajes/conversacion/uno-msj@test.local", headers=h3)
    assert r.status_code == 200
    assert r.json()["mensajes"] == []


def test_el_estudiante_no_puede_escribir_a_otro_estudiante(client):
    h1 = _registrar(client, "e1-msj@test.local")
    _registrar(client, "e2-msj@test.local")
    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "e2-msj@test.local", "contenido": "hola"},
        headers=h1,
    )
    assert r.status_code == 403


def test_el_docente_puede_escribir_a_un_estudiante(client):
    _rol(client, "doc2-msj@test.local", "docente")
    h_doc = _registrar(client, "doc2-msj@test.local")
    _registrar(client, "alu2-msj@test.local")

    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "alu2-msj@test.local", "contenido": "Traé el cuaderno"},
        headers=h_doc,
    )
    assert r.status_code == 201, r.text


def test_no_puede_escribirse_a_si_mismo(client):
    h = _registrar(client, "self-msj@test.local")
    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "self-msj@test.local", "contenido": "hola"},
        headers=h,
    )
    assert r.status_code == 400


def test_mensaje_vacio_o_destinatario_invalido(client):
    _rol(client, "dest-vacio-msj@test.local", "docente")
    h = _registrar(client, "vacio-msj@test.local")
    # Contenido vacío (destinatario válido) → 400.
    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "dest-vacio-msj@test.local", "contenido": "  "},
        headers=h,
    )
    assert r.status_code in (400, 422)
    # Destinatario que no es un email → 400.
    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "no-es-un-email", "contenido": "hola"},
        headers=h,
    )
    assert r.status_code in (400, 422)
    # Destinatario válido pero inexistente → 404.
    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "nadie-msj@test.local", "contenido": "hola"},
        headers=h,
    )
    assert r.status_code == 404


def test_borrar_solo_el_remitente(client):
    h1 = _registrar(client, "b1-msj@test.local")
    h2 = _registrar(client, "b2-msj@test.local")
    _rol(client, "dest-msj@test.local", "docente")
    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "dest-msj@test.local", "contenido": "se puede borrar"},
        headers=h1,
    )
    assert r.status_code == 201, r.text
    mid = r.json()["id"]

    # Un tercero no puede borrarlo.
    r = client.delete(f"/api/mensajes/{mid}", headers=h2)
    assert r.status_code == 403
    # El remitente sí.
    r = client.delete(f"/api/mensajes/{mid}", headers=h1)
    assert r.status_code == 200


def test_los_mensajes_se_guardan_fuera_del_codigo(client, monkeypatch, tmp_path):
    from api import mensajes as mod

    destino = tmp_path / "mensajes.json"
    monkeypatch.setattr(mod, "MENSAJES_FILE", destino)
    h = _registrar(client, "file-msj@test.local")
    _rol(client, "file2-msj@test.local", "docente")
    r = client.post(
        "/api/mensajes/enviar",
        json={"destinatario": "file2-msj@test.local", "contenido": "hola"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    assert destino.exists()
    assert oct(destino.stat().st_mode)[-3:] == "600"
