from fastapi.testclient import TestClient

from main import app  # noqa: E402

client = TestClient(app)


def _reset():
    import pathlib, json
    from api.push import SUBS_FILE
    if SUBS_FILE.exists():
        SUBS_FILE.unlink()


def test_suscribir_guarda_subscription():
    _reset()
    sub = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "x", "auth": "y"}}
    r = client.post("/api/push/suscribir", json={"email": "alu@test.local", "subscription": sub})
    assert r.status_code == 201, r.text
    assert r.json()["ok"] is True

    # Listar debe devolver la suscripción
    rr = client.get("/api/push/suscripciones", headers={"email": "alu@test.local"})
    assert rr.status_code == 200, rr.text
    datos = rr.json()
    assert len(datos["suscripciones"]) == 1
    assert datos["suscripciones"][0]["endpoint"] == sub["endpoint"]


def test_suscribir_duplicado_no_repite():
    _reset()
    sub = {"endpoint": "https://push.example.com/abc", "keys": {"p256dh": "x", "auth": "y"}}
    client.post("/api/push/suscribir", json={"email": "alu@test.local", "subscription": sub})
    client.post("/api/push/suscribir", json={"email": "alu@test.local", "subscription": sub})
    rr = client.get("/api/push/suscripciones", headers={"email": "alu@test.local"})
    assert len(rr.json()["suscripciones"]) == 1


def test_enviar_sin_pywebpush_devuelve_nota():
    _reset()
    r = client.post("/api/push/enviar", json={
        "email": "alu@test.local",
        "titulo": "Hola",
        "cuerpo": "Mundo",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["ok"] is True
    assert "nota" in data or data["enviados"] == 0
