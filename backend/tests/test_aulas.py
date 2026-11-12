"""Endpoints de "Aulas Virtuales" (espacios de clase compartidos).

Verifica:
  * todo exige sesión (cookie),
  * el docente crea aulas y las ve,
  * el estudiante NO ve las aulas en las que no está inscrito,
  * al inscribirlo, ve el aula y las tareas de esa aula,
  * el estudiante no puede crear aulas ni tareas,
  * el estudiante entrega sólo en aulas donde está inscrito,
  * el docente no puede borrar (sólo dirección/admin),
  * los datos se guardan en el directorio de datos (no en el código).
"""

import json

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _registrar(client, email, password="clave123456", nombre="Test"):
    """Registra (o define la contraseña de) una cuenta y devuelve su cookie."""
    r = client.post("/api/auth/register", json={"email": email, "nombre": nombre, "password": password})
    if r.status_code == 409:
        r = client.post("/api/auth/definir-contrasena", json={"email": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Cookie": "cherrybomb_session=" + r.json()["token"]}
    assert r.status_code in (200, 201), r.text
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Cookie": "cherrybomb_session=" + r.json()["token"]}


def _promover(email, rol):
    """Cambia el rango desde accounts.json (fuente de verdad de roles)."""
    from api.accounts import ACCOUNTS_FILE

    if ACCOUNTS_FILE.exists():
        datos = json.loads(ACCOUNTS_FILE.read_text(encoding="utf-8"))
    else:
        datos = {}
    datos[email] = {"rol": rol, "nombre": email.split("@")[0], "activo": True}
    ACCOUNTS_FILE.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")


@pytest.fixture(autouse=True)
def _limpiar_aulas():
    """Cada prueba arranca sin aulas guardadas."""
    from api.aulas import AULAS_FILE

    if AULAS_FILE.exists():
        AULAS_FILE.unlink()
    yield


def test_todo_exige_sesion(client):
    r = client.get("/api/aulas/estado")
    assert r.status_code == 401
    r = client.post("/api/aulas/aulas", json={"id": "x", "nombre": "Aula", "capacidad": 10})
    assert r.status_code == 401


def test_el_docente_crea_y_ve_el_aula(client):
    _promover("doc@test.local", "docente")
    h = _registrar(client, "doc@test.local")

    r = client.post("/api/aulas/aulas", json={
        "id": "a1", "nombre": "Aula 101", "capacidad": 30,
        "tipo": "salon", "ubicacion": "Edificio A",
    }, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["item"]["nombre"] == "Aula 101"
    # El dueño es quien la creó (no el que la envía).
    assert r.json()["item"]["owner_id"] == "doc@test.local"

    r = client.get("/api/aulas/estado", headers=h)
    assert r.status_code == 200
    assert len(r.json()["aulas"]) == 1


def test_el_estudiante_no_ve_aulas_ajenas(client):
    _promover("doc2@test.local", "docente")
    h_doc = _registrar(client, "doc2@test.local")
    client.post("/api/aulas/aulas", json={
        "id": "a1", "nombre": "Aula 101", "capacidad": 30,
    }, headers=h_doc)

    h_alu = _registrar(client, "alu6@test.local")
    r = client.get("/api/aulas/estado", headers=h_alu)
    assert r.status_code == 200
    assert r.json()["aulas"] == []


def test_al_inscribirlo_el_estudiante_ve_el_aula_y_las_tareas(client):
    _promover("doc3@test.local", "docente")
    h_doc = _registrar(client, "doc3@test.local")
    client.post("/api/aulas/aulas", json={"id": "a1", "nombre": "Aula 101", "capacidad": 30}, headers=h_doc)
    client.post("/api/aulas/tareas", json={
        "id": "t1", "aula_id": "a1", "titulo": "Ensayo", "materia": "Historia",
    }, headers=h_doc)

    h_alu = _registrar(client, "alu7@test.local")

    # Todavía no está inscrito: no ve nada.
    r = client.get("/api/aulas/estado", headers=h_alu)
    assert r.json()["aulas"] == []
    assert r.json()["tareas"] == []

    # El docente lo inscribe.
    r = client.post("/api/aulas/inscripciones", json={
        "id": "i1", "aula_id": "a1", "estudiante_id": "7",
        "estudiante_email": "alu7@test.local", "estudiante_nombre": "Alumno",
    }, headers=h_doc)
    assert r.status_code == 200, r.text

    r = client.get("/api/aulas/estado", headers=h_alu)
    assert len(r.json()["aulas"]) == 1
    assert len(r.json()["tareas"]) == 1
    assert r.json()["tareas"][0]["titulo"] == "Ensayo"


def test_el_estudiante_no_puede_crear_aulas_ni_tareas(client):
    h = _registrar(client, "alu8@test.local")
    r = client.post("/api/aulas/aulas", json={"id": "a", "nombre": "Mía", "capacidad": 5}, headers=h)
    assert r.status_code == 403
    r = client.post("/api/aulas/tareas", json={"id": "t", "aula_id": "a", "titulo": "T"}, headers=h)
    assert r.status_code == 403


def test_el_estudiante_entrega_solo_en_su_aula(client):
    _promover("doc4@test.local", "docente")
    h_doc = _registrar(client, "doc4@test.local")
    client.post("/api/aulas/aulas", json={"id": "a1", "nombre": "Aula 101", "capacidad": 30}, headers=h_doc)
    client.post("/api/aulas/aulas", json={"id": "a2", "nombre": "Aula 202", "capacidad": 30}, headers=h_doc)
    client.post("/api/aulas/tareas", json={"id": "t1", "aula_id": "a1", "titulo": "Ensayo"}, headers=h_doc)
    client.post("/api/aulas/tareas", json={"id": "t2", "aula_id": "a2", "titulo": "Otra"}, headers=h_doc)

    h_alu = _registrar(client, "alu9@test.local")
    client.post("/api/aulas/inscripciones", json={
        "id": "i1", "aula_id": "a1", "estudiante_id": "9",
        "estudiante_email": "alu9@test.local", "estudiante_nombre": "Alumno",
    }, headers=h_doc)

    # En su aula: puede entregar.
    r = client.post("/api/aulas/entregas", json={
        "id": "e1", "tarea_id": "t1", "respuesta": "Listo",
    }, headers=h_alu)
    assert r.status_code == 200, r.text
    assert r.json()["item"]["estudiante_email"] == "alu9@test.local"

    # En otra aula: no.
    r = client.post("/api/aulas/entregas", json={
        "id": "e2", "tarea_id": "t2", "respuesta": "Listo",
    }, headers=h_alu)
    assert r.status_code == 403


def test_el_docente_no_puede_borrar_solo_direccion(client):
    _promover("doc5@test.local", "docente")
    h_doc = _registrar(client, "doc5@test.local")
    client.post("/api/aulas/aulas", json={"id": "a1", "nombre": "Aula 101", "capacidad": 30}, headers=h_doc)

    r = client.delete("/api/aulas/aulas/a1", headers=h_doc)
    assert r.status_code == 403

    _promover("dir@test.local", "director")
    h_dir = _registrar(client, "dir@test.local")
    r = client.delete("/api/aulas/aulas/a1", headers=h_dir)
    assert r.status_code == 200, r.text
    r = client.get("/api/aulas/estado", headers=h_dir)
    assert r.json()["aulas"] == []


def test_calificaciones_solo_del_personal_docente(client):
    h_doc = _registrar(client, "doc6@test.local")
    _promover("doc6@test.local", "docente")
    h_doc = _registrar(client, "doc6@test.local")

    r = client.post("/api/aulas/calificaciones", json={
        "id": "c1", "entrega_id": "e1", "nota": 90, "retroealimentacion": "Bien",
    }, headers=h_doc)
    assert r.status_code == 200, r.text

    h_alu = _registrar(client, "alu10@test.local")
    r = client.post("/api/aulas/calificaciones", json={"id": "c2", "nota": 100}, headers=h_alu)
    assert r.status_code == 403


def test_el_docente_ve_las_cuentas_de_los_alumnos(client):
    """El personal docente puede listar a los alumnos para inscribirlos."""
    _promover("doc9@test.local", "docente")
    h_doc = _registrar(client, "doc9@test.local")
    h_alu = _registrar(client, "alu11@test.local")

    r = client.get("/api/aulas/estudiantes", headers=h_doc)
    assert r.status_code == 200, r.text
    emails = [e["email"] for e in r.json()["estudiantes"]]
    assert "alu11@test.local" in emails

    # El estudiante no puede ver el listado del alumnado.
    r = client.get("/api/aulas/estudiantes", headers=h_alu)
    assert r.status_code == 403


def test_la_inscripcion_por_nombre_encuentra_la_cuenta(client):
    """Si el docente inscribe por nombre, el backend lo vincula a su cuenta."""
    _promover("doc10@test.local", "docente")
    h_doc = _registrar(client, "doc10@test.local")
    h_alu = _registrar(client, "alu12@test.local", nombre="Alumno Doce")

    client.post("/api/aulas/aulas", json={"id": "a1", "nombre": "Aula 101", "capacidad": 30}, headers=h_doc)
    r = client.post("/api/aulas/inscripciones", json={
        "id": "i1", "aula_id": "a1", "estudiante_id": "alu12@test.local",
        "estudiante_nombre": "Alumno Doce",
    }, headers=h_doc)
    assert r.status_code == 200, r.text
    assert r.json()["item"]["estudiante_email"] == "alu12@test.local"

    # Y el alumno ya ve el aula.
    r = client.get("/api/aulas/estado", headers=h_alu)
    assert len(r.json()["aulas"]) == 1


def test_validacion_de_capacidad_y_nombre(client):
    _promover("doc7@test.local", "docente")
    h_doc = _registrar(client, "doc7@test.local")

    r = client.post("/api/aulas/aulas", json={"id": "a1", "nombre": "", "capacidad": 30}, headers=h_doc)
    assert r.status_code == 400
    r = client.post("/api/aulas/aulas", json={"id": "a1", "nombre": "A", "capacidad": 0}, headers=h_doc)
    assert r.status_code == 400


def test_los_datos_viven_en_el_directorio_de_datos(client):
    import os

    from api.aulas import AULAS_FILE

    _promover("doc8@test.local", "docente")
    h_doc = _registrar(client, "doc8@test.local")
    client.post("/api/aulas/aulas", json={"id": "a1", "nombre": "Aula 101", "capacidad": 30}, headers=h_doc)

    assert AULAS_FILE.exists()
    assert str(AULAS_FILE).startswith(os.environ["SAKURA_DATA_DIR"])
    # Permisos 0600: el archivo no es legible por otros usuarios.
    assert oct(AULAS_FILE.stat().st_mode & 0o777) == "0o600"
