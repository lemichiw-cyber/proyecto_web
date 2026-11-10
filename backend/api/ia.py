"""IA generativa con NVIDIA NIM para crear exámenes y actividades escolares.

Endpoints:
  GET    /api/ia/test              diagnóstico de configuración (no expone la clave)
  POST   /api/ia/generar-examen    genera un examen completo desde tema/texto
  POST   /api/ia/acomodar-examen   aplica acomodaciones (tiempo extra, reducir opciones,
                                   fuente dislexia, leer en voz alta) a un examen existente

La clave API va en .env como NVIDIA_API_KEY. Nunca se sube al repositorio.
"""

from __future__ import annotations

import json
import os
import re
from typing import List, Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from api.auth import require_auth

# load_dotenv() local: garantiza que la clave esté disponible aunque este módulo
# se importe antes que main.py (el orden de imports no debe romper la IA).
load_dotenv()

router = APIRouter(prefix="/api/ia", tags=["ia"])

NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# Modelos vigentes en NVIDIA NIM.
#
# El primero es el default: es el más rápido de los disponibles para esta
# cuenta (~8 s por examen) y devuelve JSON limpio. Antes se usaba
# meta/llama-3.2-90b-vision-instruct, que tarda 55-85 s y provocaba timeouts
# (la app está pensada para PWAs con internet intermitente).
#
# El segundo es de reserva: mejor redacción, pero mucho más lento.
# meta/llama-3.1-8b-instruct murió en 2026-08-26 y devolvía HTTP 410.
NVIDIA_MODEL_DEFAULT = "nvidia/nemotron-3.5-bolt-e4b"
NVIDIA_MODEL_FALLBACKS = (
    "meta/llama-3.2-90b-vision-instruct",
    "nvidia/nemotron-3-super-120b-a12b",
)

# Segundos máximos por modelo. El default responde en ~10 s; el de reserva
# puede llegar a 90 s.
NVIDIA_TIMEOUT_S = 120


def _nvidia_key() -> str:
    """Lee la clave de forma LAZY: si el .env se carga después del import, aún funciona."""
    return (os.getenv("NVIDIA_API_KEY") or "").strip()


def _nvidia_model() -> str:
    return (os.getenv("NVIDIA_MODEL") or "").strip() or NVIDIA_MODEL_DEFAULT


def _modelos_candidatos() -> list[str]:
    """Modelo configurado + fallbacks, sin duplicados y en orden."""
    orden = [_nvidia_model(), *NVIDIA_MODEL_FALLBACKS]
    vistos: set[str] = set()
    salida: list[str] = []
    for m in orden:
        if m and m not in vistos:
            vistos.add(m)
            salida.append(m)
    return salida


class OpcionMultiple(BaseModel):
    texto: str
    correcta: bool = False


class PreguntaIA(BaseModel):
    """Pregunta normalizada.

    `tipo` usa los tipos canónicos del frontend/evaluador:
    multiple, vf, completar, abierta, casilla, ordenar, emparejar, texto_largo.
    `correcta` es el índice de la opción correcta (multiple) o 1=Verdadero/0=Falso (vf).
    `respuesta` es el texto esperado (completar/abierta/texto_largo).
    """

    tipo: str = "multiple"
    enunciado: str = ""
    opciones: Optional[List[str]] = None
    respuesta_correcta: str = ""
    justificacion: Optional[str] = None
    # Campos canónicos calculados por _normalizar_pregunta:
    correcta: Optional[int] = None
    respuesta: Optional[str] = None
    correctas: Optional[List[int]] = None
    orden: Optional[List[int]] = None
    pares: Optional[List[List[str]]] = None


class ExamenGenerado(BaseModel):
    titulo: str
    materia: str
    tiempo_minutos: int
    nota_minima: int
    intentos: int
    preguntas: List[PreguntaIA]


class GenerarExamenIn(BaseModel):
    """Payload de POST /api/ia/generar-examen."""

    tema: str = Field(..., min_length=1, description="Tema o contenido del examen")
    fuente: Optional[str] = Field(default=None, description="Texto de referencia (guía, PDF, etc.)")
    numero_preguntas: int = Field(default=8, ge=1, le=40)
    tipo: str = Field(default="mixto", description="multiple, verdadero_falso, mixto, etc.")
    materia: str = Field(default="", description="Materia del examen (opcional: se deduce del tema)")
    grado: str = Field(default="bachillerato")

    @field_validator("tema")
    @classmethod
    def tema_no_vacio(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("El tema es obligatorio")
        return v

    @field_validator("numero_preguntas")
    @classmethod
    def preguntas_en_rango(cls, v: int) -> int:
        if v < 1 or v > 40:
            raise ValueError("numero_preguntas debe estar entre 1 y 40")
        return v


class AcomodarExamenIn(BaseModel):
    examen_id: str
    tiempo_extra: bool = False
    reducir_opciones: bool = False
    fuente_dislexia: bool = False
    leer_en_voz_alta: bool = False
    tiempo_minutos: int = Field(default=60, ge=1, le=480)


class ExamenAcomodado(BaseModel):
    examen_id: str
    tiempo_minutos: int
    preguntas: List[PreguntaIA]
    acomodaciones_aplicadas: List[str]


def _llm(prompt: str) -> str:
    key = _nvidia_key()
    if not key:
        raise HTTPException(
            status_code=503,
            detail="NVIDIA_API_KEY no configurada. Agregala a backend/.env",
        )

    mensajes = [
        {
            "role": "system",
            "content": (
                "Eres un experto docente de El Salvador (MINEDUCYT). "
                "Genera examenes educativos en espanol, alineados al curriculo de bachillerato. "
                "Responde SOLO con JSON valido, sin texto adicional antes ni despues."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    ultimo_error: str = ""
    ultimo_status = 502
    timeouts = 0

    for modelo in _modelos_candidatos():
        payload = {
            "model": modelo,
            "messages": mensajes,
            "temperature": 0.6,
            "top_p": 1,
            "max_tokens": 2500,
        }
        try:
            r = requests.post(
                NVIDIA_URL,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json=payload,
                timeout=NVIDIA_TIMEOUT_S,
            )
        except requests.exceptions.Timeout:
            # El modelo tardó demasiado: se prueba con el siguiente, que suele
            # ser más rápido. No se aborta el flujo.
            timeouts += 1
            ultimo_error = (
                f"NVIDIA NIM tardó demasiado con {modelo} "
                f"(>{NVIDIA_TIMEOUT_S} s). Probá con menos preguntas."
            )
            ultimo_status = 504
            continue
        except Exception as exc:  # noqa: BLE001
            # Error de red: se prueba con el siguiente modelo antes de fallar.
            ultimo_error = f"No se pudo contactar a NVIDIA NIM: {exc}"
            ultimo_status = 502
            continue

        if r.ok:
            try:
                data = r.json()
            except ValueError:
                ultimo_error = "NVIDIA NIM devolvió una respuesta que no es JSON."
                ultimo_status = 502
                continue
            try:
                contenido = data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError):
                ultimo_error = "NVIDIA NIM devolvió una respuesta con formato inesperado."
                ultimo_status = 502
                continue
            if not contenido or not str(contenido).strip():
                ultimo_error = "NVIDIA NIM devolvió una respuesta vacía."
                ultimo_status = 502
                continue
            return contenido

        # Error del proveedor: se distingue para dar un mensaje útil.
        detalle = (r.text or "").strip()[:300]
        if r.status_code in (401, 403):
            raise HTTPException(
                status_code=502,
                detail="NVIDIA NIM rechazó la clave (401/403). Revisá NVIDIA_API_KEY en backend/.env.",
            )
        if r.status_code == 429:
            ultimo_error = "NVIDIA NIM está saturado (429). Intentá de nuevo en un momento."
            ultimo_status = 429
            continue
        # 404/410: modelo no disponible o retirado -> probar el siguiente.
        ultimo_error = f"Error NVIDIA NIM ({r.status_code}) con {modelo}: {detalle}"
        ultimo_status = 502

    if timeouts and ultimo_status == 504:
        ultimo_error = (
            f"{ultimo_error} Podés reducir la cantidad de preguntas e intentar de nuevo."
        )

    raise HTTPException(
        status_code=ultimo_status,
        detail=ultimo_error or "NVIDIA NIM no pudo completar la solicitud.",
    )


def _extraer_json(texto: str) -> dict:
    texto = (texto or "").strip()
    if texto.startswith("```"):
        texto = re.sub(r"^```(?:json)?\s*", "", texto, flags=re.IGNORECASE)
        texto = re.sub(r"```\s*$", "", texto.strip())
    inicio = texto.find("{")
    fin = texto.rfind("}")
    if inicio == -1 or fin == -1 or fin < inicio:
        raise HTTPException(status_code=502, detail="La IA no devolvio JSON valido")
    try:
        datos = json.loads(texto[inicio : fin + 1])
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"La IA devolvio JSON incompleto: {exc.msg}",
        )
    if not isinstance(datos, dict):
        raise HTTPException(status_code=502, detail="La IA devolvio un JSON que no es un objeto")
    return datos


# ------------------------------------------------------------------
# Normalización de las preguntas de la IA al formato canónico
#
# El editor y el evaluador del frontend usan estos tipos:
#   multiple  → opciones[3] + correcta (índice 0..2)
#   vf        → correcta (1 = Verdadero, 0 = Falso)
#   completar → respuesta (texto)
#   abierta   → respuesta (pista opcional)
#   casilla   → opciones + correctas (lista de índices)
#   ordenar   → opciones + orden
#   emparejar → pares
#
# La IA puede devolver nombres propios ("verdadero_falso", "opcion_multiple")
# y respuestas en texto ("B) 3"). Sin normalizar, el frontend descarta la
# respuesta correcta y el examen se guarda sin calificar.
# ------------------------------------------------------------------

TIPOS_CANONICOS: dict[str, str] = {
    "multiple": "multiple",
    "opcion_multiple": "multiple",
    "opcion multiple": "multiple",
    "seleccion_unica": "multiple",
    "verdadero_falso": "vf",
    "vf": "vf",
    "verdadero o falso": "vf",
    "completar": "completar",
    "cloze": "completar",
    "abierta": "abierta",
    "ensayo": "abierta",
    "texto_largo": "texto_largo",
    "casilla": "casilla",
    "seleccion_multiple": "casilla",
    "opcion_multiple_checkbox": "casilla",
    "ordenar": "ordenar",
    "emparejar": "emparejar",
}

# El editor de "opción múltiple" renderiza exactamente 3 opciones (A, B, C).
OPCIONES_MULTIPLE = 3

_VERDADEROS = {"verdadero", "true", "v", "correcto", "correcta", "si", "sí"}
_FALSOS = {"falso", "false", "f", "incorrecto", "incorrecta", "no"}


def _tipo_canonico(tipo: str) -> str:
    t = re.sub(r"\s+", " ", (tipo or "").strip().lower())
    if not t:
        return "multiple"
    return TIPOS_CANONICOS.get(t, "multiple")


def _texto_limpio(valor) -> str:
    return str(valor or "").strip()


def _sin_acentos(texto: str) -> str:
    """'Matemáticas' -> 'matematicas' (para comparar con las materias válidas)."""
    trans = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    return str(texto or "").translate(trans)


# Materias aceptadas por el editor de exámenes y por /api/items/examenes.
MATERIAS_VALIDAS: tuple[str, ...] = (
    "metodos de investigacion",
    "ingles tecnico",
    "emprendedurismo",
    "matematica",
    "software",
    "ciencias",
    "ingles",
)


def _materia_canonica(valor: str) -> str:
    """Lleva el nombre de materia que devuelve la IA a una materia válida."""
    v = _sin_acentos(_texto_limpio(valor).lower())
    v = re.sub(r"\s+", " ", v)
    if not v:
        return ""
    if v in MATERIAS_VALIDAS:
        return v
    # Coincidencia por palabra clave (la IA escribe "Matemáticas", "Ciencias
    # Naturales", "Inglés Técnico", "Programación", etc.).
    if "metodo" in v:
        return "metodos de investigacion"
    if "ingles" in v:
        return "ingles tecnico" if ("tecnico" in v or "technical" in v) else "ingles"
    if "matemat" in v:
        return "matematica"
    if "cienc" in v:
        return "ciencias"
    if "softwar" in v or "program" in v or "informat" in v:
        return "software"
    if "emprend" in v:
        return "emprendedurismo"
    return ""


def _es_verdadero(respuesta: str) -> Optional[int]:
    """Convierte 'Verdadero'/'Falso' (o variantes) a 1/0. None si no se puede."""
    t = _texto_limpio(respuesta).lower().strip(" .!¿?")
    if not t:
        return None
    if t in _VERDADEROS:
        return 1
    if t in _FALSOS:
        return 0
    if t.startswith("verdad"):
        return 1
    if t.startswith("falso"):
        return 0
    if re.match(r"^[vf]$", t):
        return 1 if t == "v" else 0
    return None


def _idx_correcta_por_texto(opciones: list[str], respuesta: str) -> Optional[int]:
    """Deduce el índice de la opción correcta a partir del texto de respuesta."""
    rc = _texto_limpio(respuesta)
    if not rc or not opciones:
        return None
    rc_low = rc.lower()
    # 1) coincidencia exacta
    for i, o in enumerate(opciones):
        if _texto_limpio(o).lower() == rc_low:
            return i
    # 2) coincidencia ignorando el prefijo de letra ("B) 3" -> "3")
    limpio = re.sub(r"^\s*[\(\[]?[A-Za-z0-9][\)\].:,;-]?\s+", "", rc)
    if limpio:
        for i, o in enumerate(opciones):
            if _texto_limpio(o).lower() == limpio.lower():
                return i
    # 3) la respuesta contiene el texto exacto de una opción
    for i, o in enumerate(opciones):
        ot = _texto_limpio(o)
        if len(ot) >= 2 and ot.lower() in rc_low:
            return i
    # 4) la respuesta es solo la letra de la opción ("B", "B)", "b.")
    m = re.match(r"^\s*\(?([A-Za-z])\)?[\.\):,-]?\s*$", rc)
    if m:
        idx = ord(m.group(1).upper()) - ord("A")
        if 0 <= idx < len(opciones):
            return idx
    return None


def _ajustar_opciones(opciones: list[str], idx_correcta: Optional[int]) -> tuple[list[str], Optional[int]]:
    """Deja la lista de opciones en el formato que usa el editor (3 para múltiple).

    Si hay más de 3 opciones se descartan las incorrectas sobrantes (conservando
    la correcta). Si hay menos, se completan con cadenas vacías para que el
    docente rellene lo que falta (el editor avisa al guardar).
    """
    ops = [_texto_limpio(o) for o in opciones]
    if idx_correcta is not None and idx_correcta >= len(ops):
        idx_correcta = None
    # Sobrantes: eliminar de derecha a izquierda las que no son la correcta.
    while len(ops) > OPCIONES_MULTIPLE:
        quitar = None
        for i in range(len(ops) - 1, -1, -1):
            if i != idx_correcta:
                quitar = i
                break
        if quitar is None:
            break
        ops.pop(quitar)
        if idx_correcta is not None and quitar < idx_correcta:
            idx_correcta -= 1
    while len(ops) < OPCIONES_MULTIPLE:
        ops.append("")
    return ops, idx_correcta


def _normalizar_pregunta(p: dict) -> Optional[dict]:
    """Convierte una pregunta cruda de la IA al formato canónico de la app."""
    if not isinstance(p, dict):
        return None
    enunciado = _texto_limpio(p.get("enunciado") or p.get("texto") or p.get("pregunta"))
    if not enunciado:
        return None

    tipo = _tipo_canonico(p.get("tipo"))
    respuesta_txt = _texto_limpio(
        p.get("respuesta_correcta") or p.get("respuesta") or p.get("correcta")
    )
    opciones_raw = p.get("opciones")
    if not isinstance(opciones_raw, list):
        opciones_raw = []

    out: dict = {
        "tipo": tipo,
        "enunciado": enunciado,
        "respuesta_correcta": respuesta_txt,
        "justificacion": _texto_limpio(p.get("justificacion")) or None,
    }

    if tipo == "multiple":
        opciones = [_texto_limpio(o) for o in opciones_raw]
        idx = _idx_correcta_por_texto(opciones, respuesta_txt)
        if idx is None and isinstance(p.get("correcta"), int):
            idx = p["correcta"]
        opciones, idx = _ajustar_opciones(opciones, idx)
        out["opciones"] = opciones
        out["correcta"] = idx
    elif tipo == "vf":
        val = _es_verdadero(respuesta_txt)
        if val is None and isinstance(p.get("correcta"), int):
            val = 1 if p["correcta"] else 0
        out["correcta"] = val
    elif tipo == "completar":
        out["respuesta"] = respuesta_txt
    elif tipo == "abierta":
        out["respuesta"] = respuesta_txt
    elif tipo == "texto_largo":
        out["respuesta"] = respuesta_txt
    elif tipo == "casilla":
        opciones = [_texto_limpio(o) for o in opciones_raw]
        idxs: list[int] = []
        for i, o in enumerate(opciones):
            if o and o.lower() in respuesta_txt.lower():
                idxs.append(i)
        out["opciones"] = opciones[:OPCIONES_MULTIPLE]
        out["correctas"] = idxs[:OPCIONES_MULTIPLE]
    elif tipo == "ordenar":
        opciones = [_texto_limpio(o) for o in opciones_raw]
        out["opciones"] = (opciones + ["", "", ""])[:OPCIONES_MULTIPLE]
        out["orden"] = [0, 1, 2]
    elif tipo == "emparejar":
        # El formato canónico exige pares [[concepto, definicion], ...].
        pares = p.get("pares")
        if not isinstance(pares, list) or len(pares) < 2:
            # Sin pares no se puede construir la pregunta: se degrada a múltiple.
            tipo = "multiple"
            out["tipo"] = "multiple"
            opciones = [_texto_limpio(o) for o in opciones_raw]
            idx = _idx_correcta_por_texto(opciones, respuesta_txt)
            opciones, idx = _ajustar_opciones(opciones, idx)
            out["opciones"] = opciones
            out["correcta"] = idx
        else:
            out["pares"] = [[_texto_limpio(a), _texto_limpio(b)] for a, b in pares[:3]]

    return out


@router.get("/test")
def test_configuracion():
    """Diagnóstico de configuración de la IA. No expone la clave ni llama a NVIDIA."""
    key = _nvidia_key()
    return {
        "ok": bool(key),
        "modelo": _nvidia_model(),
        "clave_configurada": bool(key),
        "detalle": (
            "NVIDIA_API_KEY configurada."
            if key
            else "Falta NVIDIA_API_KEY en backend/.env (ver backend/.env.example)."
        ),
    }


@router.post("/generar-examen", response_model=ExamenGenerado)
def generar_examen(payload: GenerarExamenIn = Body(...), user: dict = Depends(require_auth)):
    fuente_txt = f"\nFuente de referencia:\n{payload.fuente}" if payload.fuente else ""
    prompt = f"""
Genera un examen escolar para bachillerato en El Salvador (MINEDUCYT).
Tema: {payload.tema}
Materia: {payload.materia}
Grado: {payload.grado}
Cantidad de preguntas: {payload.numero_preguntas}
Tipo: {payload.tipo}
{fuente_txt}

Devuelve SOLO JSON con esta estructura exacta:
{{
  "titulo": "Titulo del examen",
  "materia": "Materia",
  "tiempo_minutos": 45,
  "nota_minima": 60,
  "intentos": 2,
  "preguntas": [
    {{
      "tipo": "multiple|vf|completar|abierta",
      "enunciado": "Pregunta clara y autocontenida",
      "opciones": ["texto A", "texto B", "texto C"],
      "respuesta_correcta": "La respuesta correcta",
      "justificacion": "Por que es correcta (opcional)"
    }}
  ]
}}

REGLAS ESTRICTAS:
- tipo "multiple": EXACTAMENTE 3 opciones en "opciones" y en "respuesta_correcta"
  poné el TEXTO EXACTO de la opcion correcta (no la letra, no "B) ...").
- tipo "vf": no lleva "opciones"; "respuesta_correcta" es "Verdadero" o "Falso".
- tipo "completar": no lleva "opciones"; "respuesta_correcta" es el texto que completa.
- tipo "abierta": no lleva "opciones"; "respuesta_correcta" es la respuesta esperada.
- No inventes encerronas ni uses "todas las anteriores".
"""
    texto_ia = _llm(prompt)
    datos = _extraer_json(texto_ia)

    preguntas: List[PreguntaIA] = []
    for p in datos.get("preguntas", [])[: payload.numero_preguntas]:
        norm = _normalizar_pregunta(p)
        if not norm:
            continue
        preguntas.append(
            PreguntaIA(
                tipo=norm["tipo"],
                enunciado=norm["enunciado"],
                opciones=norm.get("opciones"),
                respuesta_correcta=norm.get("respuesta_correcta", ""),
                justificacion=norm.get("justificacion"),
                correcta=norm.get("correcta"),
                respuesta=norm.get("respuesta"),
                correctas=norm.get("correctas"),
                orden=norm.get("orden"),
                pares=norm.get("pares"),
            )
        )

    if not preguntas:
        raise HTTPException(
            status_code=502,
            detail="La IA no devolvió preguntas válidas. Intentá de nuevo.",
        )

    # La materia se normaliza a una válida: la IA la devuelve como texto libre
    # ("Matemáticas") y el <select> del frontend solo acepta las 7 materias.
    materia = _materia_canonica(datos.get("materia", "")) or _materia_canonica(payload.materia)

    return ExamenGenerado(
        titulo=_texto_limpio(datos.get("titulo")) or payload.tema,
        materia=materia,
        tiempo_minutos=max(1, min(480, int(datos.get("tiempo_minutos") or 45))),
        nota_minima=max(0, min(100, int(datos.get("nota_minima") or 60))),
        intentos=max(1, min(10, int(datos.get("intentos") or 2))),
        preguntas=preguntas,
    )


@router.post("/acomodar-examen", response_model=ExamenAcomodado)
def acomodar_examen(
    payload: AcomodarExamenIn = Body(...),
    user: dict = Depends(require_auth),
):
    """Aplica acomodaciones de accesibilidad a un examen existente."""
    # En esta version el examen viene del frontend; solo ajustamos lo reportado.
    acomodaciones: List[str] = []
    if payload.tiempo_extra:
        acomodaciones.append("Tiempo extra (+50%)")
    if payload.reducir_opciones:
        acomodaciones.append("Reducir opciones a 3")
    if payload.fuente_dislexia:
        acomodaciones.append("Fuente dislexia (OpenDyslexic)")
    if payload.leer_en_voz_alta:
        acomodaciones.append("Leer en voz alta (TTS)")

    return ExamenAcomodado(
        examen_id=payload.examen_id,
        tiempo_minutos=payload.tiempo_minutos + (30 if payload.tiempo_extra else 0),
        preguntas=[],  # el frontend aplica las acomodaciones visuales
        acomodaciones_aplicadas=acomodaciones,
    )
