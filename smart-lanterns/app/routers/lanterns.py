"""Public lantern endpoints — no login required.

GET  /api/lanterns                 — all lanterns (map / landing)
GET  /api/lanterns/{id}            — Lantern Page payload (live count, now playing)
GET  /api/lanterns/{id}/stories    — approved stories for the Listen page
GET  /api/lanterns/{id}/analytics  — per-minute crowdedness (Tiger Data time_bucket)
POST /api/lanterns/{id}/play       — "trigger the lantern" (queues playback)
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config
from app.db import pool

router = APIRouter(prefix="/api/lanterns", tags=["lanterns"])

LIVE = f"interval '{config.PRESENCE_WINDOW_SECONDS} seconds'"


async def _live_count(lantern_id: str) -> int:
    return await pool().fetchval(
        f"""SELECT count(DISTINCT session_id) FROM presence_pings
            WHERE lantern_id = $1 AND time > now() - {LIVE}""",
        lantern_id,
    )


# A lantern polls every 4 s; 15 s of silence means it is effectively offline.
ONLINE = "COALESCE(last_seen > now() - interval '15 seconds', false) AS online"


@router.get("")
async def list_lanterns():
    rows = await pool().fetch(
        f"SELECT id, name, description, latitude, longitude, state, last_seen, {ONLINE} "
        "FROM lanterns ORDER BY name"
    )
    return [dict(r) for r in rows]


@router.get("/{lantern_id}")
async def get_lantern(lantern_id: str):
    row = await pool().fetchrow(
        f"SELECT id, name, description, latitude, longitude, state, last_seen, {ONLINE} "
        "FROM lanterns WHERE id = $1",
        lantern_id,
    )
    if row is None:
        raise HTTPException(404, "Unknown lantern.")

    # "Now playing": the most recent handed-out queue item in the last 3 minutes
    # ('delivering' until the ESP32 acks playback, 'delivered' after).
    playing = await pool().fetchrow(
        """SELECT s.id AS story_id, q.lang, s.text_ro, s.text_en
           FROM play_queue q JOIN stories s ON s.id = q.story_id
           WHERE q.lantern_id = $1 AND q.status IN ('delivering', 'delivered')
                 AND q.delivered_at > now() - interval '3 minutes'
           ORDER BY q.delivered_at DESC LIMIT 1""",
        lantern_id,
    )
    return {
        **dict(row),
        "people_count": await _live_count(lantern_id),
        "now_playing": dict(playing) if playing else None,
    }


@router.get("/{lantern_id}/stories")
async def lantern_stories(lantern_id: str):
    rows = await pool().fetch(
        """SELECT id, text_ro, text_en, audio_ro_url, audio_en_url, created_at
           FROM stories
           WHERE lantern_id = $1 AND status = 'approved'
           ORDER BY created_at DESC""",
        lantern_id,
    )
    return [dict(r) for r in rows]


@router.get("/{lantern_id}/analytics")
async def lantern_analytics(lantern_id: str):
    """Per-minute distinct visitors over the last hour (TimescaleDB time_bucket)."""
    rows = await pool().fetch(
        """SELECT time_bucket('1 minute', time) AS bucket,
                  count(DISTINCT session_id)    AS visitors
           FROM presence_pings
           WHERE lantern_id = $1 AND time > now() - interval '1 hour'
           GROUP BY bucket ORDER BY bucket""",
        lantern_id,
    )
    return [{"time": r["bucket"].isoformat(), "visitors": r["visitors"]} for r in rows]


class PlayRequest(BaseModel):
    story_id: UUID
    lang: str = "ro"  # 'ro' | 'en'


@router.post("/{lantern_id}/play")
async def trigger_play(lantern_id: str, req: PlayRequest):
    if req.lang not in ("ro", "en"):
        raise HTTPException(400, "lang must be 'ro' or 'en'.")
    story = await pool().fetchrow(
        """SELECT id FROM stories
           WHERE id = $1 AND lantern_id = $2 AND status = 'approved'""",
        req.story_id, lantern_id,
    )
    if story is None:
        raise HTTPException(404, "Story not found on this lantern.")
    await pool().execute(
        "INSERT INTO play_queue (lantern_id, story_id, lang) VALUES ($1, $2, $3)",
        lantern_id, req.story_id, req.lang,
    )
    return {"queued": True}
