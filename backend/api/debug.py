"""Diagnóstico: qué devuelve YouTube exactamente a ESTE entorno.

El servicio en la nube falla en /player y /next (JSONDecodeError) pero
/search funciona; este endpoint muestra status/ctype/cuerpo de cada
endpoint con y sin la cookie de consentimiento SOCS=CAI para ver el
motivo real desde fuera. Solo diagnóstico, no lo usa el frontend.
"""

from __future__ import annotations

import re
import shutil
from urllib.parse import urlparse

import requests
from fastapi import APIRouter, HTTPException, Query

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


@router.get("/googlevideo")
def googlevideo(url: str = Query(..., description="URL videoplayback de googlevideo.com")) -> dict:
    """¿Puede este entorno entregar bytes de audio? (solo *.googlevideo.com)

    Comprueba el último eslabón del streaming en la nube: aún con URL
    fresca, si googlevideo rechaza la IP del servicio, reproducir es
    imposible desde ahí.
    """
    from urllib.parse import urlparse

    host = urlparse(url).hostname or ""
    if not host.endswith(".googlevideo.com"):
        raise HTTPException(status_code=400, detail="solo URLs de *.googlevideo.com")
    try:
        r = requests.get(
            url,
            headers={"Range": "bytes=0-4095", "User-Agent": _UA_WEB},
            timeout=20,
        )
        return {
            "status": r.status_code,
            "len": len(r.content),
            "ctype": (r.headers.get("Content-Type") or "")[:60],
            "accept_ranges": r.headers.get("Accept-Ranges"),
        }
    except Exception as exc:  # noqa: BLE001
        return {"error": f"{type(exc).__name__}: {exc}"}


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


def _host_de(url: str) -> str:
    try:
        return urlparse(url).hostname or ""
    except Exception:  # noqa: BLE001 - diagnóstico
        return ""


def _baja_bytes(url: str) -> dict:
    """Range de 4 KB contra una URL que extrajo ESTE mismo proceso.

    La sonda anterior (`/api/debug/googlevideo`) usaba una URL extraída
    en otra máquina; como googlevideo ata la URL a la IP que la pidió,
    eso sólo medía el binding por IP y no este entorno. Acá la URL sale
    de la misma IP que la descarga.
    """
    try:
        with requests.get(
            url,
            headers={"Range": "bytes=0-4095", "User-Agent": _UA_WEB},
            stream=True,
            timeout=20,
        ) as r:
            chunk = next(r.iter_content(4096), b"")
            return {
                "status": r.status_code,
                "bytes": len(chunk),
                "ctype": (r.headers.get("Content-Type") or "")[:50],
                "accept_ranges": r.headers.get("Accept-Ranges"),
                "content_length": r.headers.get("Content-Length"),
            }
    except Exception as exc:  # noqa: BLE001 - el error también es diagnóstico
        return {"error": f"{type(exc).__name__}: {exc}"}


@router.get("/streamdiag")
def streamdiag(
    video_id: str = Query("Iz-ALRy5fxY", description="videoId a diagnosticar"),
    clients: bool = Query(False, description="Además, prueba yt-dlp con clientes extra"),
) -> dict:
    """Diagnóstico de la cadena de streaming DESDE este entorno.

    Resuelve las dos preguntas que deciden si la música puede sonar en la
    nube:

    1. ¿`get_song()` trae `streamingData` y los formatos de audio traen
       URL directa o sólo `signatureCipher`? (si hay cipher, hace falta
       descifrar `n`/`sig`; si no hay streamingData, no hay nada que
       descifrar).
    2. ¿`*.googlevideo.com` entrega bytes cuando la URL la extrajo este
       mismo proceso? Si acá sale 403/206 manda, según el caso: el
       bloqueo es sólo de extracción y arreglarla alcanza; si es error de
       red, ni la extracción sirve de nada desde esta IP.

    Con `clients=1` prueba yt-dlp contra varios `player_client` y reporta
    cuál sí devuelve URL. Solo diagnóstico; no lo usa el frontend.
    """
    from api.deps import get_service

    out: dict = {"video_id": video_id, "versions": {}, "get_song": {}, "probes": {}, "ytdlp": {}}

    try:
        import yt_dlp
        import ytmusicapi

        out["versions"] = {
            "yt_dlp": getattr(getattr(yt_dlp, "version", None), "__version__", "?"),
            "ytmusicapi": getattr(ytmusicapi, "__version__", "?"),
            "node": bool(shutil.which("node")),
        }
    except Exception as exc:  # noqa: BLE001
        out["versions"] = {"error": f"{type(exc).__name__}: {exc}"}

    # ---- 1) ¿qué devuelve get_song() en cada contexto? ----------------
    # `ios` es el que usa /stream (URL directa); `web_remix` es el que
    # ytmusicapi usa por defecto y el que devolvía sólo signatureCipher.
    audio_directo: list = []
    svc = get_service()
    for etiqueta, obtener_cliente in (
        ("ios", svc._ensure_stream_client),
        ("web_remix", svc._ensure_client),
    ):
        try:
            raw = obtener_cliente().get_song(video_id) or {}
            estado = raw.get("playabilityStatus") or {}
            sd = raw.get("streamingData") or {}
            fmts = list(sd.get("formats") or []) + list(sd.get("adaptiveFormats") or {})
            audio = [f for f in fmts if str(f.get("mimeType") or "").startswith("audio")]
            con_url = [f for f in audio if f.get("url")]
            if etiqueta == "ios":
                audio_directo = con_url
            out["get_song"][etiqueta] = {
                "playability": estado.get("status"),
                "reason": estado.get("reason"),
                "tiene_streamingData": bool(sd),
                "claves_streamingData": sorted(sd.keys()),
                "formatos_total": len(fmts),
                "audio_total": len(audio),
                "audio_con_url_directa": len(con_url),
                "audio_con_cipher": len(
                    [f for f in audio if f.get("signatureCipher") or f.get("cipher")]
                ),
                "audio": [
                    {
                        "itag": f.get("itag"),
                        "mime": str(f.get("mimeType") or "")[:38],
                        "bitrate": f.get("bitrate"),
                        "url": bool(f.get("url")),
                        "cipher": bool(f.get("signatureCipher") or f.get("cipher")),
                    }
                    for f in audio[:8]
                ],
                "tiene_videoDetails": bool(raw.get("videoDetails")),
            }
        except Exception as exc:  # noqa: BLE001 - el error también es diagnóstico
            out["get_song"][etiqueta] = {"error": f"{type(exc).__name__}: {exc}"}

    # ---- 2) ¿baja bytes googlevideo con URL de ESTA IP? ---------------
    if audio_directo:
        mejor = max(audio_directo, key=lambda f: f.get("bitrate") or 0)
        out["probes"]["googlevideo_url_de_aqui"] = _baja_bytes(mejor["url"])
    else:
        out["probes"]["googlevideo_url_de_aqui"] = "sin URL directa que probar"

    # ---- 3) ¿algún player_client de yt-dlp funciona aquí? -------------
    if clients:
        from yt_dlp import YoutubeDL

        casos = (
            ("default", None),
            ("android", ["android"]),
            ("tv", ["tv"]),
            ("web_embedded", ["web_embedded"]),
            ("ios", ["ios"]),
            ("mweb", ["mweb"]),
        )
        for etiqueta, clientes in casos:
            opts = {
                "format": "bestaudio/best",
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "skip_download": True,
                "socket_timeout": 10,
                "retries": 0,
            }
            if clientes:
                opts["extractor_args"] = {"youtube": {"player_client": clientes}}
            if shutil.which("node"):
                opts["js_runtimes"] = {"node": {}}
            try:
                with YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(
                        f"https://www.youtube.com/watch?v={video_id}", download=False
                    )
                url = (info or {}).get("url")
                out["ytdlp"][etiqueta] = {"ok": bool(url), "host": _host_de(url) if url else ""}
            except Exception as exc:  # noqa: BLE001 - el error también es diagnóstico
                out["ytdlp"][etiqueta] = {"ok": False, "error": str(exc)[:200]}

    return out
