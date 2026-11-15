"""Moderator dashboard — everything requires MODERATOR_EMAILS membership.

GET  /api/moderation/pending            — stories Gemini flagged as borderline
POST /api/moderation/{id}/approve       — approve: kicks the same TTS task
POST /api/moderation/{id}/reject        — reject with a reason
"""
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app import config
from app.auth import get_moderator
from app.db import pool
from app.routers.stories import _generate_audio


def _original_audio_url(story_id, language: str | None) -> str | None:
    """The storyteller's own voice, if it was preserved at upload time."""
    if language not in ("ro", "en"):
        return None
    filename = f"{story_id}_{language}.mp3"
    return f"/audio/{filename}" if (config.AUDIO_DIR / filename).exists() else None

router = APIRouter(
    prefix="/api/moderation",
    tags=["moderation"],
    dependencies=[Depends(get_moderator)],
)


@router.get("/pending")
async def pending_stories():
    rows = await pool().fetch(
        """SELECT s.id, s.lantern_id, l.name AS lantern_name, u.email AS author,
                  s.language_original, s.transcript_original, s.text_ro, s.text_en,
                  s.created_at
           FROM stories s
           JOIN lanterns l ON l.id = s.lantern_id
           JOIN users u    ON u.id = s.user_id
           WHERE s.status = 'pending_review'
           ORDER BY s.created_at""",
    )
    return [
        {**dict(r), "original_audio_url": _original_audio_url(r["id"], r["language_original"])}
        for r in rows
    ]


@router.post("/{story_id}/approve")
async def approve(story_id: UUID, background: BackgroundTasks):
    row = await pool().fetchrow(
        """UPDATE stories SET status = 'processing', reviewed_at = now()
           WHERE id = $1 AND status = 'pending_review'
           RETURNING id, text_ro, text_en, language_original""",
        story_id,
    )
    if row is None:
        raise HTTPException(404, "No pending story with that id.")
    original_url = _original_audio_url(row["id"], row["language_original"])
    background.add_task(
        _generate_audio, str(row["id"]), row["text_ro"], row["text_en"],
        row["language_original"], original_url,
    )
    return {"status": "processing"}


class RejectRequest(BaseModel):
    reason: str = "Rejected by a moderator."


@router.post("/{story_id}/reject")
async def reject(story_id: UUID, req: RejectRequest):
    row = await pool().fetchrow(
        """UPDATE stories
           SET status = 'rejected', reject_reason = $2, reviewed_at = now()
           WHERE id = $1 AND status = 'pending_review'
           RETURNING id""",
        story_id, req.reason,
    )
    if row is None:
        raise HTTPException(404, "No pending story with that id.")
    for suffix in ("_ro.mp3", "_en.mp3"):  # preserved original voice, if any
        (config.AUDIO_DIR / f"{story_id}{suffix}").unlink(missing_ok=True)
    return {"status": "rejected"}
