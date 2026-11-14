"""Portal de padres — vista resumida del progreso del hijo.

Cada cuenta con rango "padres" puede ver un resumen de la actividad
académica de sus hijos: tareas, exámenes y notas registradas en las aulas
virtuales. No expone datos de otros estudiantes: sólo los hijos vinculados
al padre (por email o por nombre en la cuenta del alumno).

Endpoints:
  GET  /api/padres/hijos        → lista de hijos vinculados al padre
  GET  /api/padres/resumen      → resumen académico de los hijos
  GET  /api/padres/contactos    → docente para consultas

Persistencia: sólo lectura sobre los datos ya existentes (aulas.json).
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from api.auth import require_auth
from paths import data_file

router = APIRouter(prefix="/api/padres", tags=["padres"])

AULAS_FILE = data_file("aulas.json", "SAKURA_AULAS_FILE")

MAX_ITEMS = 200
MAX_TEXTO = 300

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _cargar_aulas() -> dict:
    if not AULAS_FILE.exists():
        return {}
    try:
        raw = json.loads(AULAS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return raw if isinstance(raw, dict) else {}


def _email(v: Any) -> str:
    return str(v or "").strip().lower()


def _texto(v: Any, maxlen: int = MAX_TEXTO) -> str:
    return str(v if v is not None else "").strip()[:maxlen]


def _nombre_norm(v: Any) -> str:
    s = _email(v)
    s = re.sub(r"[^a-z0-9áéíóúüñ ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _cuentas() -> dict:
    try:
        from api.accounts import _load_accounts

        return _load_accounts()
    except Exception:
        return {}


def _hijos_de(email_padre: str) -> list[dict]:
    """Cuentas de estudiantes vinculadas al padre.

    Vínculo por email: la cuenta del padre tiene `hijo_email` o
    `hijos` (lista de emails). Como fallback, se comparan los nombres:
    "Ana García" (padre) vs "Ana García" (hijo) no es confiable, así que
    sólo se usa la coincidencia exacta del email configurado en la cuenta.
    """
    cuentas = _cuentas()
    padre = cuentas.get(email_padre)
    if not isinstance(padre, dict):
        return []
    candidatos: list[str] = []
    if padre.get("hijo_email"):
        candidatos.append(_email(padre.get("hijo_email")))
    for h in padre.get("hijos") or []:
        if isinstance(h, str):
            candidatos.append(_email(h))
        elif isinstance(h, dict):
            candidatos.append(_email(h.get("email")))
    out = []
    for e in candidatos:
        if not e or not _EMAIL_RE.match(e):
            continue
        cuenta = cuentas.get(e)
        if not isinstance(cuenta, dict):
            continue
        out.append({
            "email": e,
            "nombre": _texto(cuenta.get("nombre") or e.split("@")[0], 120),
            "rol": _texto(cuenta.get("rol") or "estudiante", 30),
            "semestre": cuenta.get("semestre"),
        })
    return out


@router.get("/hijos")
def hijos(user: dict = Depends(require_auth)):
    """Hijos vinculados al padre autenticado."""
    if str(user.get("rol") or "").strip().lower() != "padres":
        raise HTTPException(status_code=403, detail="Sólo las cuentas de padres pueden ver esta sección")
    lista = _hijos_de(_email(user.get("email")))
    return {"ok": True, "count": len(lista), "hijos": lista}


@router.get("/resumen")
def resumen(user: dict = Depends(require_auth)):
    """Resumen académico de los hijos: tareas, exámenes, entregas y notas."""
    if str(user.get("rol") or "").strip().lower() != "padres":
        raise HTTPException(status_code=403, detail="Sólo las cuentas de padres pueden ver esta sección")
    lista_hijos = _hijos_de(_email(user.get("email")))
    emails = {h["email"] for h in lista_hijos}
    aulas = _cargar_aulas()

    def _col(nombre: str) -> dict:
        col = aulas.get(nombre)
        return col if isinstance(col, dict) else {}

    tareas = [t for t in _col("tareas").values() if isinstance(t, dict)]
    entregas = [e for e in _col("entregas").values() if isinstance(e, dict)]
    calificaciones = [c for c in _col("calificaciones").values() if isinstance(c, dict)]
    asistencia = [a for a in _col("asistencia").values() if isinstance(a, dict)]

    def _mio(item: dict) -> bool:
        return _email(item.get("estudiante_email")) in emails

    por_hijo = []
    for h in lista_hijos:
        e = h["email"]
        mis_tareas = [t for t in tareas if _email(t.get("estudiante_email")) == e]
        mis_entregas = [x for x in entregas if _email(x.get("estudiante_email")) == e]
        mis_notas = [c for c in calificaciones if _email(c.get("estudiante_email")) == e]
        notas = [float(c.get("nota") or 0) for c in mis_notas if c.get("nota") is not None]
        mi_asistencia = [a for a in asistencia if _email(a.get("estudiante_email")) == e]
        presentes = sum(1 for a in mi_asistencia if a.get("estado") == "presente")
        por_hijo.append({
            **h,
            "tareas": [
                {
                    "titulo": _texto(t.get("titulo"), 200),
                    "materia": _texto(t.get("materia"), 80),
                    "fecha": _texto(t.get("fecha"), 40),
                    "entregada": any(_email(x.get("tarea_id")) == _texto(t.get("id"), MAX_ITEMS) for x in mis_entregas),
                }
                for t in mis_tareas
            ][:50],
            "notas": [
                {
                    "tarea_id": _texto(c.get("tarea_id"), MAX_ITEMS),
                    "nota": c.get("nota"),
                    "comentario": _texto(c.get("comentario"), 300),
                }
                for c in mis_notas
            ][:50],
            "promedio": (round(sum(notas) / len(notas), 2) if notas else None),
            "asistencia": {
                "registros": len(mi_asistencia),
                "presentes": presentes,
                "porcentaje": (round(presentes / len(mi_asistencia) * 100) if mi_asistencia else None),
            },
        })

    return {
        "ok": True,
        "count": len(por_hijo),
        "hijos": por_hijo,
        "totales": {
            "tareas": len(tareas),
            "entregas": len(entregas),
            "calificaciones": len(calificaciones),
        },
    }


@router.get("/contactos")
def contactos(user: dict = Depends(require_auth)):
    """Docentes y administración a los que el padre puede escribir."""
    email = _email(user.get("email"))
    out = []
    for e, cuenta in _cuentas().items():
        if not isinstance(cuenta, dict) or cuenta.get("activo") is False:
            continue
        rol = _texto(cuenta.get("rol") or "", 30).lower()
        if rol not in {"docente", "coordinador", "director", "subdirector", "admin"}:
            continue
        if _email(e) == email:
            continue
        out.append({
            "email": _email(e),
            "nombre": _texto(cuenta.get("nombre") or _email(e).split("@")[0], 120),
            "rol": rol,
        })
    out.sort(key=lambda c: c["nombre"].lower())
    return {"ok": True, "count": len(out), "contactos": out}
