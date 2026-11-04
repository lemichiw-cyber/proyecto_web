from fastapi.testclient import TestClient

from main import app  # noqa: E402

client = TestClient(app)


class FakeRow:
    def __init__(self, d):
        self._d = d
    def keys(self):
        return self._d.keys()
    def __getitem__(self, k):
        return self._d[k]


class FakeCursor:
    def __init__(self, rows, description=None):
        self.rows = rows
        self.description = description or [(k,) for k in (rows[0].keys() if rows else [])]
    def execute(self, sql, params=None):
        self.last_sql = sql
        self.last_params = params
    def fetchone(self):
        if not self.rows:
            return None
        return FakeRow(self.rows.pop(0))
    def fetchall(self):
        rows = list(self.rows)
        self.rows.clear()
        return [FakeRow(r) for r in rows]
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False


class FakeConn:
    def __init__(self, rows):
        self.rows = list(rows)
        self.committed = False
    def cursor(self, cursor_factory=None):
        return FakeCursor(self.rows, description=None)
    def commit(self):
        self.committed = True
    def close(self):
        pass
    def __enter__(self):
        return self
    def __exit__(self, *a):
        self.close()


def _activaciones(rows):
    import api.actividades as mod
    datos = list(rows)
    contador = len(datos)

    def fake_conn():
        return FakeConn(datos)

    def _query_fake(sql: str, params: tuple = (), fetch: str = "all", commit: bool = False):
        nonlocal contador
        sql_up = sql.strip().upper()
        if "RETURNING" in sql_up:
            contador += 1
            fila = {"id": contador}
            # extraer columnas del INSERT para rellenar titulo/descripcion/owner_id/created_at
            if "actividades" in sql.lower():
                fila["titulo"] = params[0] if params and len(params) > 0 else ""
                fila["descripcion"] = params[1] if params and len(params) > 1 else ""
                fila["owner_id"] = params[2] if params and len(params) > 2 else None
                fila["created_at"] = "2026-01-01T00:00:00"
            if fetch == "one":
                return fila
            return [fila]
        return _query_real(datos, sql, params, fetch)

    def _query_real(datos, sql, params, fetch):
        with _conn_real(datos) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                result = []
                if fetch == "one":
                    row = cur.fetchone()
                    result = dict(row) if row else None
                elif cur.description is not None:
                    rows2 = cur.fetchall()
                    result = [dict(r) for r in rows2]
        return result

    def _conn_real(datos):
        return FakeConn(datos)

    mod._conn = fake_conn
    mod._query = _query_fake
    return mod


def test_listar_actividades_devuelve_lista(monkeypatch):
    filas = [
        {"id": 1, "titulo": "Actividad A", "descripcion": "d", "owner_id": "u1", "created_at": "2026-01-01"},
        {"id": 2, "titulo": "Actividad B", "descripcion": "d2", "owner_id": "u2", "created_at": "2026-01-02"},
    ]
    mod = _activaciones(list(filas))
    monkeypatch.setattr(mod, "_perfil", lambda email: {"id": "u1", "rol": "estudiante"})
    r = client.get("/api/actividades", headers={"X-User-Email": "e@test.local"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data) == 2


def test_crear_actividad_rol_insuficiente_devuelve_403(monkeypatch):
    filas = []
    mod = _activaciones(filas)
    monkeypatch.setattr(mod, "_perfil", lambda email: {"id": "u1", "rol": "estudiante"})
    r = client.post("/api/actividades", json={"titulo": "X", "descripcion": "d"}, headers={"X-User-Email": "e@test.local"})
    assert r.status_code == 403, r.text


def test_crear_actividad_docente_ok(monkeypatch):
    filas = []
    mod = _activaciones(filas)
    monkeypatch.setattr(mod, "_perfil", lambda email: {"id": "u1", "rol": "docente"})
    r = client.post("/api/actividades", json={"titulo": "Taller", "descripcion": "d"}, headers={"X-User-Email": "e@test.local"})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["titulo"] == "Taller"
    assert data["owner_id"] == "u1"


def test_actualizar_actividad_sin_propiedad_devuelve_403(monkeypatch):
    filas = [{"id": 1, "titulo": "Vieja", "descripcion": "d", "owner_id": "otro", "created_at": "2026-01-01"}]
    mod = _activaciones(filas)
    monkeypatch.setattr(mod, "_perfil", lambda email: {"id": "u1", "rol": "estudiante"})
    r = client.put("/api/actividades/1", json={"titulo": "Nueva", "descripcion": "d"}, headers={"X-User-Email": "e@test.local"})
    assert r.status_code == 403, r.text


def test_actualizar_actividad_admin_ok(monkeypatch):
    filas = [{"id": 1, "titulo": "Vieja", "descripcion": "d", "owner_id": "otro", "created_at": "2026-01-01"}]
    mod = _activaciones(filas)
    monkeypatch.setattr(mod, "_perfil", lambda email: {"id": "u1", "rol": "admin"})
    r = client.put("/api/actividades/1", json={"titulo": "Nueva", "descripcion": "d"}, headers={"X-User-Email": "e@test.local"})
    assert r.status_code == 200, r.text


def test_eliminar_actividad_no_existente_devuelve_404(monkeypatch):
    filas = []
    mod = _activaciones(filas)
    monkeypatch.setattr(mod, "_perfil", lambda email: {"id": "u1", "rol": "admin"})
    r = client.delete("/api/actividades/999", headers={"X-User-Email": "e@test.local"})
    assert r.status_code == 404, r.text
