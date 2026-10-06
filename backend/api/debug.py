"""Diagnóstico: qué devuelve YouTube exactamente a ESTE entorno.

El servicio en la nube falla en /player y /next (JSONDecodeError) pero
/search funciona; este endpoint muestra status/ctype/cuerpo de cada
endpoint con y sin la cookie de consentimiento SOCS=CAI para ver el
motivo real desde fuera. Solo diagnóstico, no lo usa el frontend.
"""

from __future__ import annotations

import requests
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/debug", tags=["debug"])

_UA_WEB = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
_UA_APP = "com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip"

_CONTEXT = {"client": {"clientName": "WEB", "clientVersion": "2.20250312.04.00", "hl": "en", "gl": "US"}}


def _resumen(resp: requests.Response) -> dict:
    return {
        "status": resp.status_code,
        "ctype": (resp.headers.get("Content-Type") or "")[:70],
        "len": len(resp.content),
        "snip": resp.text[:260].replace("\n", " ").replace("\r", ""),
    }


@router.get("/youtube")
def youtube(video_id: str = Query("juRFjpB5Ppg")) -> dict:
    """Sondea /player, /next y /watch con y sin cookie de consentimiento."""
    post = lambda url, hdrs: requests.post(  # noqa: E731
        url, json={"context": _CONTEXT, "videoId": video_id,
                   "contentCheckOk": True, "racyCheckOk": True},
        headers=hdrs, timeout=15,
    )
    get = lambda url, hdrs: requests.get(url, headers=hdrs, timeout=15)  # noqa: E731

    casos = [
        ("player_www_sin_cookie", lambda: post("https://www.youtube.com/youtubei/v1/player",
                                               {"User-Agent": _UA_WEB})),
        ("player_www_socs", lambda: post("https://www.youtube.com/youtubei/v1/player",
                                         {"User-Agent": _UA_WEB, "Cookie": "SOCS=CAI"})),
        ("player_music_socs", lambda: post("https://music.youtube.com/youtubei/v1/player",
                                           {"User-Agent": _UA_WEB, "Cookie": "SOCS=CAI"})),
        ("next_socs", lambda: post("https://www.youtube.com/youtubei/v1/next",
                                   {"User-Agent": _UA_WEB, "Cookie": "SOCS=CAI"})),
        ("watch_sin_cookie", lambda: get(f"https://www.youtube.com/watch?v={video_id}",
                                         {"User-Agent": _UA_WEB})),
        ("watch_socs", lambda: get(f"https://www.youtube.com/watch?v={video_id}",
                                   {"User-Agent": _UA_WEB, "Cookie": "SOCS=CAI"})),
        ("watch_android_ua_socs", lambda: get(f"https://www.youtube.com/watch?v={video_id}",
                                              {"User-Agent": _UA_APP, "Cookie": "SOCS=CAI"})),
        # control: /search sí funciona (comparar ctype/snip con los demás)
        ("search_control", lambda: requests.post(
            "https://www.youtube.com/youtubei/v1/search",
            json={"context": _CONTEXT, "query": "bad bunny"},
            headers={"User-Agent": _UA_WEB, "Cookie": "SOCS=CAI"}, timeout=15)),
    ]

    out: dict = {}
    for nombre, probe in casos:
        try:
            out[nombre] = _resumen(probe())
        except Exception as exc:  # noqa: BLE001 - el error también es diagnóstico
            out[nombre] = {"error": f"{type(exc).__name__}: {exc}"}
    return out
