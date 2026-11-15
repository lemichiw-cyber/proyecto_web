"""Helper para notificaciones push internas."""
from __future__ import annotations
import json, os
from pathlib import Path
from paths import data_file

SUBS_FILE = data_file("subscriptions.json")

def _load_subs():
    if not SUBS_FILE.exists():
        return {}
    try:
        data = json.loads(SUBS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def send_push(email: str, titulo: str, cuerpo: str, url: str = "/") -> None:
    subs = _load_subs()
    targets = subs.get(email.strip().lower(), [])
    if not targets:
        return
    try:
        from pywebpush import webpush  # type: ignore
        vapid_private = os.getenv("VAPID_PRIVATE_KEY")
        if not vapid_private:
            return
        vapid_claims = {"sub": "mailto:admin@bachillerato.edu"}
        for sub in targets:
            webpush(
                subscription_info=sub,
                data=json.dumps({"title": titulo, "body": cuerpo, "tag": "cherrybomb", "url": url}),
                vapid_private_key=vapid_private,
                vapid_claims=vapid_claims,
            )
    except Exception:
        # Silencioso: push es opcional
        return
