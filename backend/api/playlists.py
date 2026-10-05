"""Endpoints de playlists: CRUD + gestión de canciones."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.deps import get_service

router = APIRouter(prefix="/api/music", tags=["playlists"])


class PlaylistCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    privacy: str = Field(default="PRIVATE")


class PlaylistUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=500)


class TracksAdd(BaseModel):
    videoIds: list[str] = Field(default_factory=list)


class TracksRemove(BaseModel):
    videoIds: list[str] = Field(default_factory=list)


class TrackMove(BaseModel):
    videoId: str
    toIndex: int = Field(..., ge=0)


@router.get("/playlist/{playlist_id}")
def get_playlist(playlist_id: str) -> dict:
    try:
        return get_service().get_playlist(playlist_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Playlist no encontrada") from exc


@router.post("/playlists", status_code=201)
def create_playlist(body: PlaylistCreate) -> dict:
    try:
        return get_service().create_playlist(body.title, body.description, body.privacy)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudo crear la playlist") from exc


@router.put("/playlists/{playlist_id}")
def update_playlist(playlist_id: str, body: PlaylistUpdate) -> dict:
    svc = get_service()
    try:
        current = svc.get_playlist(playlist_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=404, detail="Playlist no encontrada") from exc
    title = body.title if body.title is not None else current.get("title", "")
    description = body.description if body.description is not None else current.get("description", "")
    try:
        ok = svc.rename_playlist(playlist_id, title, description)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudo actualizar la playlist") from exc
    if not ok:
        raise HTTPException(status_code=502, detail="No se pudo actualizar la playlist")
    return {"id": playlist_id, "title": title, "description": description, "source": "yt"}


@router.delete("/playlists/{playlist_id}", status_code=204)
def delete_playlist(playlist_id: str) -> None:
    try:
        ok = get_service().delete_playlist(playlist_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudo eliminar la playlist") from exc
    if not ok:
        raise HTTPException(status_code=502, detail="No se pudo eliminar la playlist")


@router.post("/playlists/{playlist_id}/tracks", status_code=201)
def add_tracks(playlist_id: str, body: TracksAdd) -> dict:
    if not body.videoIds:
        raise HTTPException(status_code=400, detail="No se enviaron canciones")
    try:
        ok = get_service().add_tracks_to_playlist(playlist_id, body.videoIds)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudieron agregar las canciones") from exc
    if not ok:
        raise HTTPException(status_code=502, detail="No se pudieron agregar las canciones")
    return {"playlistId": playlist_id, "added": len(body.videoIds)}


@router.delete("/playlists/{playlist_id}/tracks", status_code=200)
def remove_tracks(playlist_id: str, body: TracksRemove) -> dict:
    if not body.videoIds:
        raise HTTPException(status_code=400, detail="No se enviaron canciones")
    try:
        ok = get_service().remove_tracks_from_playlist(playlist_id, body.videoIds)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudieron quitar las canciones") from exc
    if not ok:
        raise HTTPException(status_code=502, detail="No se pudieron quitar las canciones")
    return {"playlistId": playlist_id, "removed": len(body.videoIds)}


@router.put("/playlists/{playlist_id}/tracks/move")
def move_track(playlist_id: str, body: TrackMove) -> dict:
    try:
        ok = get_service().move_track_in_playlist(playlist_id, body.videoId, body.toIndex)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail="No se pudo mover la canción") from exc
    if not ok:
        raise HTTPException(status_code=502, detail="No se pudo mover la canción")
    return {"playlistId": playlist_id, "videoId": body.videoId, "index": body.toIndex}
