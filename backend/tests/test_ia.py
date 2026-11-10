"""Tests del módulo de IA (backend/api/ia.py).

No se llama a NVIDIA NIM: se simula la respuesta del LLM para verificar la
normalización de las preguntas al formato canónico que usan el editor y el
evaluador del frontend.
"""

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("SAKURA_ADMIN_EMAIL", "admin@test.local")
os.environ.setdefault("SAKURA_ADMIN_PASSWORD", "pw-test-123")

from main import app  # noqa: E402
from api import ia as ia_mod  # noqa: E402

client = TestClient(app)


# ------------------------------------------------------------------
# Normalización de tipos y respuestas
# ------------------------------------------------------------------

def test_tipo_verdadero_falso_se_mapea_a_vf():
    p = ia_mod._normalizar_pregunta(
        {"tipo": "verdadero_falso", "enunciado": "2+2=4", "respuesta_correcta": "Verdadero"}
    )
    assert p["tipo"] == "vf"
    assert p["correcta"] == 1  # 1 = Verdadero


def test_vf_falso_da_cero():
    p = ia_mod._normalizar_pregunta(
        {"tipo": "vf", "enunciado": "2+2=5", "respuesta_correcta": "Falso"}
    )
    assert p["tipo"] == "vf"
    assert p["correcta"] == 0


def test_multiple_resuelve_el_indice_por_texto():
    p = ia_mod._normalizar_pregunta(
        {
            "tipo": "multiple",
            "enunciado": "¿Cuánto es 2+2?",
            "opciones": ["3", "4", "5"],
            "respuesta_correcta": "4",
        }
    )
    assert p["tipo"] == "multiple"
    assert p["opciones"] == ["3", "4", "5"]
    assert p["correcta"] == 1  # la segunda opción


def test_multiple_resuelve_el_indice_con_prefijo_de_letra():
    p = ia_mod._normalizar_pregunta(
        {
            "tipo": "multiple",
            "enunciado": "¿Cuánto es 2+2?",
            "opciones": ["3", "4", "5"],
            "respuesta_correcta": "B) 4",
        }
    )
    assert p["correcta"] == 1


def test_multiple_se_queda_con_tres_opciones_conservando_la_correcta():
    p = ia_mod._normalizar_pregunta(
        {
            "tipo": "multiple",
            "enunciado": "Pregunta",
            "opciones": ["a", "b", "c", "d"],
            "respuesta_correcta": "d",
        }
    )
    assert len(p["opciones"]) == 3
    assert p["opciones"][p["correcta"]] == "d"


def test_completar_guarda_la_respuesta():
    p = ia_mod._normalizar_pregunta(
        {"tipo": "completar", "enunciado": "Capital de El Salvador", "respuesta_correcta": "San Salvador"}
    )
    assert p["tipo"] == "completar"
    assert p["respuesta"] == "San Salvador"


def test_tipo_desconocido_cae_a_multiple():
    p = ia_mod._normalizar_pregunta(
        {"tipo": "inventado", "enunciado": "Algo", "opciones": ["a", "b", "c"], "respuesta_correcta": "a"}
    )
    assert p["tipo"] == "multiple"


def test_pregunta_sin_enunciado_se_descarta():
    assert ia_mod._normalizar_pregunta({"tipo": "multiple", "enunciado": "  "}) is None


# ------------------------------------------------------------------
# Materias
# ------------------------------------------------------------------

@pytest.mark.parametrize(
    "entrada,esperada",
    [
        ("Matemáticas", "matematica"),
        ("matematica", "matematica"),
        ("Ciencias Naturales", "ciencias"),
        ("Inglés Técnico", "ingles tecnico"),
        ("Inglés", "ingles"),
        ("Programación", "software"),
        ("Métodos de Investigación", "metodos de investigacion"),
        ("Emprendedurismo", "emprendedurismo"),
        ("materia inventada", ""),
    ],
)
def test_materia_canonica(entrada, esperada):
    assert ia_mod._materia_canonica(entrada) == esperada


# ------------------------------------------------------------------
# Endpoint (con el LLM simulado)
# ------------------------------------------------------------------

RESPUESTA_LLM = {
    "titulo": "Ecuaciones de primer grado",
    "materia": "Matemáticas",
    "tiempo_minutos": 45,
    "nota_minima": 60,
    "intentos": 2,
    "preguntas": [
        {
            "tipo": "multiple",
            "enunciado": "¿Cuánto es 2+2?",
            "opciones": ["3", "4", "5"],
            "respuesta_correcta": "4",
            "justificacion": "2+2=4",
        },
        {
            "tipo": "verdadero_falso",
            "enunciado": "Todo número primo es impar",
            "respuesta_correcta": "Falso",
        },
        {
            "tipo": "completar",
            "enunciado": "Capital de El Salvador",
            "respuesta_correcta": "San Salvador",
        },
    ],
}


def _registrar_y_loguear(email="ia-test@correo.local"):
    client.post(
        "/api/auth/register",
        json={"email": email, "nombre": "IA Test", "password": "clave12345", "rol": "docente"},
    )
    r = client.post("/api/auth/login", json={"email": email, "password": "clave12345"})
    return r.json()["token"]


def test_generar_examen_normaliza_las_preguntas(monkeypatch):
    monkeypatch.setattr(ia_mod, "_llm", lambda prompt: __import__("json").dumps(RESPUESTA_LLM))
    token = _registrar_y_loguear()
    r = client.post(
        "/api/ia/generar-examen",
        json={
            "tema": "Ecuaciones de primer grado",
            "materia": "",
            "grado": "bachillerato",
            "numero_preguntas": 3,
            "tipo": "mixto",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["materia"] == "matematica"  # normalizada desde "Matemáticas"

    p0, p1, p2 = d["preguntas"]
    assert p0["tipo"] == "multiple"
    assert p0["correcta"] == 1
    assert p0["opciones"] == ["3", "4", "5"]
    assert p1["tipo"] == "vf"
    assert p1["correcta"] == 0
    assert p2["tipo"] == "completar"
    assert p2["respuesta"] == "San Salvador"


def test_generar_examen_requiere_autenticacion():
    r = client.post(
        "/api/ia/generar-examen",
        json={"tema": "X", "numero_preguntas": 1, "tipo": "mixto", "materia": "matematica", "grado": "bachillerato"},
    )
    assert r.status_code in (401, 403)


def test_endpoint_test_no_expone_la_clave():
    r = client.get("/api/ia/test")
    assert r.status_code == 200
    body = r.json()
    assert "clave_configurada" in body
    # La clave nunca debe aparecer en la respuesta.
    assert "nvapi" not in r.text.lower()
