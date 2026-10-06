"""Diagnóstico: qué devuelve YouTube exactamente a ESTE entorno.

El servicio en la nube falla en /player y /next (JSONDecodeError) pero
/search funciona; este endpoint muestra status/ctype/cuerpo de cada
endpoint con y sin la cookie de consentimiento SOCS=CAI para ver el
motivo real desde fuera. Solo diagnóstico, no lo usa el frontend.
"""

from __future__ import annotations

import re

import requests
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/debug", tags=["debug"])

_UA_WEB = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
_UA_APP = "com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip"


def _resumen(resp: requests.Response) -> dict:
    return {
        "status": resp.status_code,
        "ctype": (resp.headers.get("Content-Type") or "")[:70],
        "len": len(resp.content),
        "snip": resp.text[:260].replace("\n", " ").replace("\r", ""),
    }


@router.get("/youtube")
def youtube(video_id: str = Query("juRFjpB5Ppg")) -> dict:
    """Sondea hosts/clientes alternativos de YouTube con y sin SOCS.

    Cada caso reporta status/ctype y `player` = si el cuerpo contiene
    `streamingData` (la única vía a una URL de audio).
    """
    def _mk(resp: requests.Response) -> dict:
        out = _resumen(resp)
        out["player"] = '"streamingData"' in resp.text
        # En HTML (embed/watch): ¿trae la respuesta del player incrustada?
        m = re.search(r'playabilityStatus"\s*:\s*\{[^{}]*?"status"\s*:\s*"([A-Z_]+)"', resp.text)
        out["play"] = m.group(1) if m else None
        out["ytinit"] = '"ytInitialPlayerResponse"' in resp.text
        out["cipher"] = '"signatureCipher"' in resp.text
        return out

    def post(url, ctx_client, ua, cookie=None):
        hdrs = {"User-Agent": ua}
        if cookie:
            hdrs["Cookie"] = cookie
        return requests.post(
            url,
            json={"context": {"client": ctx_client},
                  "videoId": video_id, "contentCheckOk": True, "racyCheckOk": True},
            headers=hdrs, timeout=15,
        )

    WEB = {"clientName": "WEB", "clientVersion": "2.20250312.04.00", "hl": "en", "gl": "US"}
    ANDROID = {"clientName": "ANDROID", "clientVersion": "19.09.37",
               "androidSdkVersion": 34, "hl": "en", "gl": "US"}
    ANDROID_VR = {"clientName": "ANDROID_VR", "clientVersion": "1.60.19",
                  "androidSdkVersion": 34, "hl": "en", "gl": "US"}
    IOS = {"clientName": "IOS", "clientVersion": "19.09.3", "deviceModel": "iPhone14,3",
           "hl": "en", "gl": "US"}
    TV = {"clientName": "TVHTML5", "clientVersion": "7.20250312.16.00", "hl": "en", "gl": "US"}

    casos = [
        ("gstatic_player_web", lambda: post("https://youtubei.googleapis.com/youtubei/v1/player",
                                            WEB, _UA_WEB, "SOCS=CAI")),
        ("gstatic_player_android", lambda: post("https://youtubei.googleapis.com/youtubei/v1/player",
                                                ANDROID, _UA_APP)),
        ("gstatic_player_android_vr", lambda: post("https://youtubei.googleapis.com/youtubei/v1/player",
                                                   ANDROID_VR, _UA_APP)),
        ("gstatic_player_ios", lambda: post("https://youtubei.googleapis.com/youtubei/v1/player",
                                            IOS, "com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 17_4 like Mac OS X)")),
        ("m_player_web", lambda: post("https://m.youtube.com/youtubei/v1/player",
                                      WEB, _UA_WEB, "SOCS=CAI")),
        ("nocookie_player_web", lambda: post("https://www.youtube-nocookie.com/youtubei/v1/player",
                                             WEB, _UA_WEB, "SOCS=CAI")),
        ("tv_player_www", lambda: post("https://www.youtube.com/youtubei/v1/player",
                                       TV, "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version", "SOCS=CAI")),
        ("embed_html", lambda: requests.get(f"https://www.youtube.com/embed/{video_id}",
                                            headers={"User-Agent": _UA_WEB}, timeout=15)),
        ("embed_movil", lambda: requests.get(
            f"https://www.youtube.com/embed/{video_id}",
            headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) "
                                   "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 "
                                   "Mobile/15E148 Safari/604.1"},
            timeout=15)),
        ("embed_nocookie", lambda: requests.get(f"https://www.youtube-nocookie.com/embed/{video_id}",
                                                headers={"User-Agent": _UA_WEB}, timeout=15)),
        ("watch_con_params", lambda: requests.get(
            f"https://www.youtube.com/watch?v={video_id}&bpctr=9999999999&has_verified=1",
            headers={"User-Agent": _UA_WEB, "Cookie": "SOCS=CAI; PREF=fm=mp4"}, timeout=15)),
        ("oembed", lambda: requests.get(
            f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json",
            headers={"User-Agent": _UA_WEB}, timeout=15)),
        # control: funciona → comparar contra los demás
        ("search_control", lambda: requests.post(
            "https://www.youtube.com/youtubei/v1/search",
            json={"context": {"client": WEB}, "query": "bad bunny"},
            headers={"User-Agent": _UA_WEB, "Cookie": "SOCS=CAI"}, timeout=15)),
    ]

    out: dict = {}
    for nombre, probe in casos:
        try:
            out[nombre] = _mk(probe())
        except Exception as exc:  # noqa: BLE001 - el error también es diagnóstico
            out[nombre] = {"error": f"{type(exc).__name__}: {exc}"}
    return out
