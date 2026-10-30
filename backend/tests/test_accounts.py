import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SAKURA_ADMIN_EMAIL", "admin@test.local")
os.environ.setdefault("SAKURA_ADMIN_PASSWORD", "pw-test-123")

from main import app  # noqa: E402

client = TestClient(app)

ADMIN_TOKEN = None


def _admin_login() -> str:
    global ADMIN_TOKEN
    if ADMIN_TOKEN:
        return ADMIN_TOKEN
    r = client.post(
        "/api/admin/login",
        json={"email": os.environ["SAKURA_ADMIN_EMAIL"], "password": os.environ["SAKURA_ADMIN_PASSWORD"]},
    )
    assert r.status_code == 200, r.text
    ADMIN_TOKEN = r.json()["token"]
    return ADMIN_TOKEN


@pytest.fixture(autouse=True)
def _reset_accounts():
    """Cada prueba arranca con un archivo de cuentas limpio."""
    import pathlib
    from api.accounts import ACCOUNTS_FILE

    if ACCOUNTS_FILE.exists():
        ACCOUNTS_FILE.unlink()
    yield
    if ACCOUNTS_FILE.exists():
        ACCOUNTS_FILE.unlink()


def test_estudiante_no_puede_crear_admin():
    """POST /api/accounts ignora el rol del cliente y fuerza 'estudiante'."""
    r = client.post(
        "/api/accounts",
        json={
            "email": "alu@test.local",
            "password": "pw-123456",
            "rol": "admin",  # el cliente intenta autoasignarse admin
            "nombre": "Alumno",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["account"]["rol"] == "estudiante", r.text


def test_put_delete_sin_token_devuelve_401():
    """PUT y DELETE exigen autenticación de admin."""
    # crear cuenta primero
    client.post(
        "/api/accounts",
        json={"email": "otro@test.local", "password": "pw-123456", "rol": "estudiante", "nombre": "Otro"},
    )
    r = client.put("/api/accounts/otro@test.local", json={"rol": "docente"})
    assert r.status_code == 401, r.text

    r = client.delete("/api/accounts/otro@test.local")
    assert r.status_code == 401, r.text


def test_login_admin_desactivado_sin_variables(monkeypatch):
    """Sin SAKURA_ADMIN_EMAIL/PASSWORD, el login admin responde 403."""
    monkeypatch.delenv("SAKURA_ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("SAKURA_ADMIN_PASSWORD", raising=False)

    # Forzar recarga del módulo admin para que lea el entorno sin variables
    import importlib
    import api.admin as admin_mod
    importlib.reload(admin_mod)

    from main import app as _app
    c = TestClient(_app)
    r = c.post(
        "/api/admin/login",
        json={"email": "x@y.z", "password": "whatever"},
    )
    assert r.status_code == 403, r.text


def test_examen_sin_respuesta_devuelve_422():
    """ExamenIn rechaza pregunta múltiple sin correcta."""
    from api.tareas_examenes import ExamenIn  # noqa: WPS433
    with pytest.raises(Exception) as exc:
        ExamenIn(
            titulo="Examen inválido",
            tiempo=10,
            preguntas=[{"texto": "¿2+2?", "tipo": "multiple", "opciones": ["3", "4", "5"]}],
        )
    assert "correcta" in str(exc.value) or "Pregunta 1" in str(exc.value)


def test_examen_valido_devuelve_modelo():
    """ExamenIn acepta examen completo con respuestas."""
    from api.tareas_examenes import ExamenIn  # noqa: WPS433
    ex = ExamenIn(
        titulo="Examen válido",
        materia="matematica",
        tiempo=10,
        preguntas=[
            {"texto": "¿2+2?", "tipo": "multiple", "opciones": ["3", "4", "5"], "correcta": 1},
            {"texto": "¿Tierra plana?", "tipo": "vf", "correcta": 0},
        ],
    )
    assert ex.titulo == "Examen válido"
    assert ex.materia == "matematica"
    assert len(ex.preguntas) == 2


def test_examen_materia_invalida():
    """ExamenIn rechaza materia no permitida."""
    from api.tareas_examenes import ExamenIn  # noqa: WPS433
    with pytest.raises(Exception):
        ExamenIn(
            titulo="Examen",
            materia="historia",
            tiempo=10,
            preguntas=[{"texto": "¿x?", "tipo": "abierta"}],
        )


def test_examen_pregunta_abierta():
    """ExamenIn acepta tipo 'abierta' sin respuesta predefinida."""
    from api.tareas_examenes import ExamenIn  # noqa: WPS433
    ex = ExamenIn(
        titulo="Redacción",
        materia="emprendedurismo",
        tiempo=30,
        preguntas=[
            {"texto": "¿Qué es un plan de negocios?", "tipo": "abierta"},
        ],
    )
    assert ex.preguntas[0]["tipo"] == "abierta"


def test_examen_nuevos_tipos():
    """ExamenIn acepta casilla, ordenar, emparejar y texto_largo."""
    from api.tareas_examenes import ExamenIn  # noqa: WPS433
    ex = ExamenIn(
        titulo="Variados",
        materia="software",
        tiempo=20,
        preguntas=[
            {"texto": "¿Cuáles son lenguajes?", "tipo": "casilla", "opciones": ["JS", "Python", "HTML"], "correctas": [0, 1, 2]},
            {"texto": "Ordená pasos", "tipo": "ordenar", "opciones": ["A", "B", "C"], "orden": [2, 0, 1]},
            {"texto": "Emparejá", "tipo": "emparejar", "pares": [["HTML", "Marcado"], ["CSS", "Estilos"]]},
            {"texto": "Explicá", "tipo": "texto_largo", "respuesta": "Respuesta esperada larga"},
        ],
    )
    assert ex.preguntas[0]["tipo"] == "casilla"
    assert ex.preguntas[1]["tipo"] == "ordenar"
    assert ex.preguntas[2]["tipo"] == "emparejar"
    assert ex.preguntas[3]["tipo"] == "texto_largo"


def test_examen_casilla_sin_correctas_rechazado():
    """ExamenIn rechaza casilla sin correctas."""
    from api.tareas_examenes import ExamenIn  # noqa: WPS433
    with pytest.raises(Exception):
        ExamenIn(
            titulo="Mal",
            materia="ciencias",
            tiempo=10,
            preguntas=[{"texto": "¿x?", "tipo": "casilla", "opciones": ["A", "B"]}],
        )
