"""IA generativa con NVIDIA NIM para crear exámenes y actividades escolares.

Endpoints:
  POST   /api/ia/generar-examen   genera un examen completo desde tema/texto/PDF-texto
  POST   /api/ia/acomodar           aplica acomodaciones (tiempo extra, reducir opciones,
                                    fuente dislexia, leer en voz alta) a un examen existente

La clave API va en .env como NVIDIA_API_KEY. Nunca se sube al repositorio.
"""

from __future__ import annotations

import json
import os
import re
from typing import List, Optional

import requests
from fastapi import APIRouter, Body, Depends, HTTPException, status
from pydantic import BaseModel, Field

from api.auth import require_auth

router = APIRouter(prefix="/api/ia", tags=["ia"])

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "meta/llama-3.1-8b-instruct")
NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"


class OpcionMultiple(BaseModel):
    texto: str
    correcta: bool = False


class PreguntaIA(BaseModel):
    tipo: str  # multiple, verdadero_falso, completar, abierta, emparejar, ordenar
    enunciado: str
    opciones: Optional[List[str]] = None
    respuesta_correcta: str
    justificacion: Optional[str] = None


class ExamenGenerado(BaseModel):
    titulo: str
    materia: str
    tiempo_minutos: int
    nota_minima: int
    intentos: int
    preguntas: List[PreguntaIA]


class AcomodarExamenIn(BaseModel):
    examen_id: str
    tiempo_extra: bool = False
    reducir_opciones: bool = False
    fuente_dislexia: bool = False
    leer_en_voz_alta: bool = False


class ExamenAcomodado(BaseModel):
    examen_id: str
    tiempo_minutos: int
    preguntas: List[PreguntaIA]
    acomodaciones_aplicadas: List[str]


def _llm(prompt: str) -> str:
    if not NVIDIA_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="NVIDIA_API_KEY no configurada. Agregala a backend/.env",
        )
    payload = {
        "model": NVIDIA_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Eres un experto docente de El Salvador (MINEDUCYT). "
                    "Genera examenes educativos en espanol, alineados al curriculo de bachillerato. "
                    "Responde SOLO con JSON valido, sin texto adicional antes ni despues."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "top_p": 1,
        "max_tokens": 4096,
    }
    try:
        r = requests.post(
            NVIDIA_URL,
            headers={
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
            timeout=120,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"No se pudo contactar a NVIDIA NIM: {exc}")
    if not r.ok:
        raise HTTPException(
            status_code=502,
            detail=f"Error NVIDIA NIM: {r.status_code} {r.text[:200]}",
        )
    data = r.json()
    return data["choices"][0]["message"]["content"]


def _extraer_json(texto: str) -> dict:
    texto = texto.strip()
    if texto.startswith("```"):
        texto = re.sub(r"^```json\s*", "", texto, flags=re.IGNORECASE)
        texto = re.sub(r"```$", "", texto.strip())
    inicio = texto.find("{")
    fin = texto.rfind("}")
    if inicio == -1 or fin == -1 or fin < inicio:
        raise HTTPException(status_code=502, detail="La IA no devolvio JSON valido")
    return json.loads(texto[inicio : fin + 1])


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
      "tipo": "multiple|verdadero_falso|completar|abierta|emparejar|ordenar",
      "enunciado": "Pregunta clara",
      "opciones": ["A", "B", "C", "D"],  (solo si tipo es multiple)
      "respuesta_correcta": "La respuesta correcta",
      "justificacion": "Por que es correcta (opcional)"
    }}
  ]
}}
"""
    texto_ia = _llm(prompt)
    datos = _extraer_json(texto_ia)

    preguntas: List[PreguntaIA] = []
    for p in datos.get("preguntas", [])[: payload.numero_preguntas]:
        preguntas.append(
            PreguntaIA(
                tipo=p.get("tipo", "multiple"),
                enunciado=p.get("enunciado", ""),
                opciones=p.get("opciones"),
                respuesta_correcta=p.get("respuesta_correcta", ""),
                justificacion=p.get("justificacion"),
            )
        )

    return ExamenGenerado(
        titulo=datos.get("titulo", payload.tema),
        materia=datos.get("materia", payload.materia),
        tiempo_minutos=datos.get("tiempo_minutos", 45),
        nota_minima=datos.get("nota_minima", 60),
        intentos=datos.get("intentos", 2),
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
