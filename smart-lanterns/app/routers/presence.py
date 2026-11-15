"""Presence tracking: React pings every 15s; 45s of silence drops the user.

POST /api/presence/ping — anonymous; sends {lantern_id, session_id}.
Returns the live count so the Lantern Page updates with no extra request.
"""
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config
from app.db import pool

router = APIRouter(prefix="/api/presence", tags=["presence"])


class Ping(BaseModel):
    lantern_id: str
    session_id: UUID  # random UUID generated once per browser session by React
    user_id: str | None = None  # Auth0 sub if logged in (informational only)


@router.post("/ping")
async def ping(p: Ping):
    exists = await pool().fetchval("SELECT 1 FROM lanterns WHERE id = $1", p.lantern_id)
    if not exists:
        raise HTTPException(404, "Unknown lantern.")
    await pool().execute(
        "INSERT INTO presence_pings (lantern_id, session_id, user_id) VALUES ($1, $2, $3)",
        p.lantern_id, p.session_id, p.user_id,
    )
    count = await pool().fetchval(
        f"""SELECT count(DISTINCT session_id) FROM presence_pings
            WHERE lantern_id = $1
                  AND time > now() - interval '{config.PRESENCE_WINDOW_SECONDS} seconds'""",
        p.lantern_id,
    )
    return {"people_count": count}
