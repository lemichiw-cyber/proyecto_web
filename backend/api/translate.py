"""POST /api/music/lyrics/translate — traducir letra sincronizada usando NVIDIA NIM.

Requiere configurar NVIDIA_API_KEY en las variables de entorno del backend.
Si tu cuenta de NVIDIA no tiene acceso a modelos de chat, el endpoint
devuelve un error claro indicando cómo configurarlo.
"""

from __future__ import annotations

import os
import urllib.request
import json
from fastapi import APIRouter, HTTPException, Body

router = APIRouter(prefix="/api/music", tags=["lyrics"])

_NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
# Modelo ligero y rápido; si tu cuenta no tiene acceso, cambia el modelo
# en https://build.nvidia.com/ o define NVIDIA_MODEL en el backend.
_NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "deepseek-ai/deepseek-coder-6.7b-instruct")


def _translate_nvidia(text: str, target_lang: str, api_key: str) -> str:
    """Traduce usando NVIDIA NIM."""
    prompt = (
        f"Traduce la siguiente letra de canción al {target_lang}. "
        f"Mantén el formato línea por línea, sin comentarios ni explicaciones, "
        f"solo la traducción:\n\n{text}"
    )
    payload = {
        "model": _NVIDIA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 1500,
    }
    req = urllib.request.Request(
        _NVIDIA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


@router.post("/lyrics/translate")
def translate_lyrics(
    text: str = Body(..., embed=True),
    target_lang: str = Body("es", embed=True),
) -> dict:
    """Traduce una letra de canción al idioma destino.

    Body JSON:
      { "text": "letra original línea por línea", "target_lang": "es" }
    """
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Traducción no configurada. Define NVIDIA_API_KEY en el backend "
                   "(ej. export NVIDIA_API_KEY=nvapi-xxx).",
        )

    try:
        translated = _translate_nvidia(text, target_lang, api_key)
        return {
            "original": text,
            "translated": translated,
            "target_lang": target_lang,
            "source": "nvidia-nim",
        }
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        detail = str(exc)
        if "404" in detail or "Not found" in detail:
            detail = (
                "Tu cuenta de NVIDIA no tiene acceso al modelo "
                f"{_NVIDIA_MODEL}. Ve a https://build.nvidia.com/ y activa "
                "un modelo de chat (ej. Llama-3.1, Nemotron, Gemma), o define "
                "NVIDIA_MODEL en el backend con un modelo disponible."
            )
        elif "410" in detail or "end of life" in detail:
            detail = (
                f"El modelo {_NVIDIA_MODEL} ha llegado a su fin de vida. "
                "Cambia NVIDIA_MODEL en el backend a un modelo disponible."
            )
        raise HTTPException(status_code=502, detail=detail) from exc
