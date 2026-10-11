"""Red saliente del proxy de streaming: lista blanca de hosts (anti-SSRF).

El único host al que el backend le manda bytes es el que devuelve
yt-dlp / ytmusicapi como URL de audio. Sin lista blanca, un id o una
respuesta manipulada convertiría al backend en un proxy abierto hacia
cualquier interna (169.254.169.254, metadata, redis…).

Contrato §5.4.
"""

from __future__ import annotations

import ipaddress
import socket
from typing import Dict, Iterable, Optional, Sequence
from urllib.parse import urlparse

# Cabeceras que SÍ se reenvían hacia googlevideo. Nada de Cookie,
# X-Forwarded-For, Referer ni ninguna otra que mande el cliente.
FORWARDED_REQUEST_HEADERS = ("Range", "User-Agent")

# Cabeceras que SÍ se devuelven al navegador (contrato §2.6).
PROXY_RESPONSE_HEADERS = (
    "Accept-Ranges",
    "Content-Type",
    "Content-Length",
    "Content-Range",
    "Cache-Control",
)


def host_matches(host: str, pattern: str) -> bool:
    """Compara un host contra un patrón de la lista blanca.

    - `*.googlevideo.com`  → cualquier subdominio (y el propio dominio).
    - `videoplayback.googlevideo.com` → coincidencia exacta.
    """
    host = (host or "").lower().rstrip(".")
    pattern = (pattern or "").lower().rstrip(".")
    if not host or not pattern:
        return False
    if pattern.startswith("*."):
        suffix = pattern[2:]
        return host == suffix or host.endswith("." + suffix)
    return host == pattern


def is_private_host(host: str) -> bool:
    """True si el host es un literal IP privado/reservado o `localhost`.

    Es una red de seguridad adicional: aunque alguien añada una IP
    interna a la lista blanca por error, no se le sirve.
    """
    clean = (host or "").strip("[]").lower()
    if clean in {"localhost", "localhost.localdomain"}:
        return True
    try:
        ip = ipaddress.ip_address(clean)
    except ValueError:
        return False
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def url_host(url: str) -> str:
    """Host de una URL, o cadena vacía si no se puede parsear."""
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:  # noqa: BLE001 - URL basura no debe reventar el proxy
        return ""


def host_allowed(url: str, allowed: Sequence[str]) -> bool:
    """Valida la URL resuelta por el proveedor contra la lista blanca."""
    host = url_host(url)
    if not host:
        return False
    if is_private_host(host):
        return False
    return any(host_matches(host, pattern) for pattern in allowed)


def allowed_url_from_location(location: str, base_url: str, allowed: Sequence[str]) -> Optional[str]:
    """Resuelve un `Location` de redirección y devuelve la URL si es válida.

    Un 3xx a un host que no está en la lista blanca se rechaza: es el
    vector clásico de SSRF por redirección.
    """
    if not location:
        return None
    from urllib.parse import urljoin

    candidate = urljoin(base_url, location)
    if not host_allowed(candidate, allowed):
        return None
    return candidate


def forward_headers(
    client_headers: Dict[str, str],
    extraction_headers: Optional[Dict[str, str]],
) -> Dict[str, str]:
    """Cabeceras salientes: `Range` del cliente + `User-Agent` de la extracción.

    No se refleja ninguna otra cabecera que mande el navegador.
    """
    out: Dict[str, str] = {}
    user_agent = (extraction_headers or {}).get("User-Agent") or (
        extraction_headers or {}
    ).get("user-agent")
    if user_agent:
        out["User-Agent"] = str(user_agent)[:300]
    range_header = client_headers.get("range") or client_headers.get("Range")
    if range_header:
        out["Range"] = str(range_header)[:200]
    return out


def resolve_host(host: str) -> bool:
    """¿El host resuelve en DNS? Sólo para diagnóstico; no bloquea."""
    try:
        socket.getaddrinfo(host, None)
        return True
    except OSError:
        return False


def iter_allowed(allowed: Iterable[str]) -> tuple:
    return tuple(allowed)
