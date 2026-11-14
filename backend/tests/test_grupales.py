"""Endpoints de Actividades Grupales (/api/grupales).

Verifica:
  * la lista exige sesión (cookie),
  * un miembro ve el grupo; un usuario ajeno NO,
  * crear deja al dueño como miembro,
  * invitar: sólo el dueño o el docente,
  * chat interno y entregas compartidas,
  * borrar: el dueño sí, un miembro común no,
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


def _rol(client, email, rol):
    """Fija el rango de una cuenta ya registrada (accounts.json es la fuente)."""
    from api.accounts import ACCOUNTS_FILE

    _registrar(client, email)
    datos = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    datos[email]["rol"] = rol
    ACCOUNTS_FILE.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")


def test_la_lista_exige_sesion(client):
    r = client.get("/api/grupales/")
    assert r.status_code == 401


def test_crear_grupo_deja_al_dueno_como_miembro(client):
    h = _registrar(client, "dueno-grp@test.local")
    r = client.post(
        "/api/grupales/",
        json={"nombre": "Proyecto science", "materia": "Física"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    gid = r.json()["id"]

    r = client.get(f"/api/grupales/{gid}", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["grupo"]["nombre"] == "Proyecto science"
    assert len(data["miembros"]) == 1
    assert data["miembros"][0]["email"] == "dueno-grp@test.local"


def test_un_usuario_ajeno_no_ve_el_grupo(client):
    h1 = _registrar(client, "a-grp@test.local")
    h2 = _registrar(client, "b-grp@test.local")
    gid = client.post(
        "/api/grupales/", json={"nombre": "Privado"}, headers=h1
    ).json()["id"]

    r = client.get(f"/api/grupales/{gid}", headers=h2)
    assert r.status_code == 403
    r = client.get("/api/grupales/", headers=h2)
    assert r.status_code == 200
    assert r.json()["count"] == 0


def test_invitar_y_chat_de_un_miembro(client):
    h1 = _registrar(client, "inv-grp@test.local")
    h2 = _registrar(client, "inv2-grp@test.local")
    gid = client.post(
        "/api/grupales/", json={"nombre": "Equipo"}, headers=h1
    ).json()["id"]

    r = client.post(
        f"/api/grupales/{gid}/miembros",
        json={"email": "inv2-grp@test.local"},
        headers=h1,
    )
    assert r.status_code == 201, r.text

    # El invitado ya ve el grupo.
    r = client.get(f"/api/grupales/{gid}", headers=h2)
    assert r.status_code == 200

    # Chat interno.
    r = client.post(
        f"/api/grupales/{gid}/mensajes",
        json={"contenido": "hola equipo"},
        headers=h2,
    )
    assert r.status_code == 201, r.text

    r = client.get(f"/api/grupales/{gid}", headers=h1)
    assert len(r.json()["mensajes"]) == 1
    assert r.json()["mensajes"][0]["contenido"] == "hola equipo"


def test_entrega_compartida(client):
    h = _registrar(client, "ent-grp@test.local")
    gid = client.post(
        "/api/grupales/", json={"nombre": "Trabajo final"}, headers=h
    ).json()["id"]
    r = client.post(
        f"/api/grupales/{gid}/entregas",
        json={"grupo_id": gid, "texto": "Primera parte"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    r = client.get(f"/api/grupales/{gid}", headers=h)
    assert len(r.json()["entregas"]) == 1


def test_solo_el_dueno_o_el_docente_pueden_invitar(client):
    h1 = _registrar(client, "d1-grp@test.local")
    h2 = _registrar(client, "d2-grp@test.local")
    _registrar(client, "d3-grp@test.local")
    gid = client.post(
        "/api/grupales/", json={"nombre": "Grupo"}, headers=h1
    ).json()["id"]
    # h2 es miembro (lo agrego como miembro) para probar que NO puede invitar.
    client.post(
        f"/api/grupales/{gid}/miembros", json={"email": "d2-grp@test.local"}, headers=h1
    )
    r = client.post(
        f"/api/grupales/{gid}/miembros",
        json={"email": "d3-grp@test.local"},
        headers=h2,
    )
    assert r.status_code == 403


def test_un_miembro_comun_no_puede_borrar_el_grupo(client):
    h1 = _registrar(client, "b1-grp@test.local")
    h2 = _registrar(client, "b2-grp@test.local")
    gid = client.post(
        "/api/grupales/", json={"nombre": "Grupo"}, headers=h1
    ).json()["id"]
    client.post(
        f"/api/grupales/{gid}/miembros", json={"email": "b2-grp@test.local"}, headers=h1
    )
    r = client.delete(f"/api/grupales/{gid}", headers=h2)
    assert r.status_code == 403
    # El dueño sí.
    r = client.delete(f"/api/grupales/{gid}", headers=h1)
    assert r.status_code == 200


def test_el_docente_ve_los_grupos(client):
    _registrar(client, "alu-grp@test.local")
    _rol(client, "doc-grp@test.local", "docente")
    h_doc = _registrar(client, "doc-grp@test.local")

    r = client.post(
        "/api/grupales/", json={"nombre": "Grupo del curso"}, headers=h_doc
    )
    assert r.status_code == 201, r.text
    gid = r.json()["id"]

    # El docente ve el grupo (es personal de gestión).
    r = client.get("/api/grupales/", headers=h_doc)
    assert r.status_code == 200
    ids = [g["id"] for g in r.json()["grupos"]]
    assert gid in ids

    # El alumno NO es miembro ni docente: no ve nada.
    h_alu = _registrar(client, "alu-grp@test.local")
    r = client.get("/api/grupales/", headers=h_alu)
    assert r.status_code == 200
    assert gid not in [g["id"] for g in r.json()["grupos"]]
    r = client.get(f"/api/grupales/{gid}", headers=h_alu)
    assert r.status_code == 403


def test_los_grupos_se_guardan_fuera_del_codigo(client, monkeypatch, tmp_path):
    from api import grupales as mod

    destino = tmp_path / "grupales.json"
    monkeypatch.setattr(mod, "GRUPALES_FILE", destino)
    h = _registrar(client, "file-grp@test.local")
    r = client.post("/api/grupales/", json={"nombre": "Persistido"}, headers=h)
    assert r.status_code == 201, r.text
    assert destino.exists()
    assert oct(destino.stat().st_mode)[-3:] == "600"
