"""The audio pipeline + story management.

POST /api/stories
  1. Auth0 login + consent checkbox required.
  2. Gemini call runs SYNCHRONOUSLY so a rejection returns its reason to React
     immediately (per spec).
  3. If approved, ElevenLabs TTS (RO + EN) runs as a background task; the story
     stays 'processing' until both MP3s exist, then flips to 'approved'.
     Borderline content becomes 'pending_review' for the moderator dashboard.

GET  /api/stories/mine        — My Stories page (status badges)
DELETE /api/stories/{id}      — owner delete (also removes MP3s)
GET  /api/stories/{id}        — single story (Listen page)
"""
import logging
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile

from app import config
from app.auth import get_current_user
from app.db import pool
from app.services import eleven, gemini

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/stories", tags=["stories"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # ~2 min of browser audio, generous


async def _generate_audio(
    story_id: str,
    text_ro: str,
    text_en: str,
    original_lang: str | None = None,
    original_url: str | None = None,
) -> None:
    """Background task: produce both audio files, then mark the story approved.

    When the storyteller recorded in Romanian or English, their own voice
    (already transcoded to normalized MP3 at upload) IS that language's audio;
    ElevenLabs only fills in the other language. Other languages get TTS both.
    """
    try:
        if original_url and original_lang == "ro":
            ro_url = original_url
            en_url = await eleven.synthesize_to_file(text_en, f"{story_id}_en.mp3")
        elif original_url and original_lang == "en":
            en_url = original_url
            ro_url = await eleven.synthesize_to_file(text_ro, f"{story_id}_ro.mp3")
        else:
            ro_url = await eleven.synthesize_to_file(text_ro, f"{story_id}_ro.mp3")
            en_url = await eleven.synthesize_to_file(text_en, f"{story_id}_en.mp3")
        await pool().execute(
            """UPDATE stories
               SET audio_ro_url = $2, audio_en_url = $3, status = 'approved'
               WHERE id = $1""",
            story_id, ro_url, en_url,
        )
    except Exception:
        # Likely a transient provider failure that outlived the retries, not a
        # bad story: park it for moderation — approving re-runs this task —
        # instead of auto-rejecting someone's genuine memory.
        log.exception("Audio generation failed for story %s; parked for manual retry", story_id)
        await pool().execute(
            "UPDATE stories SET status = 'pending_review' WHERE id = $1",
            story_id,
        )


@router.post("")
async def submit_story(
    background: BackgroundTasks,
    audio: UploadFile,
    lantern_id: str = Form(...),
    consent: bool = Form(...),
    user: dict = Depends(get_current_user),
):
    if not consent:
        raise HTTPException(400, "Public broadcast consent is required.")

    lantern = await pool().fetchrow("SELECT id FROM lanterns WHERE id = $1", lantern_id)
    if lantern is None:
        raise HTTPException(404, "Unknown lantern.")

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio upload.")
    if len(audio_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Recording too long — please keep it under 2 minutes.")

    # Keep the users table in sync with Auth0.
    await pool().execute(
        """INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET email = $2, name = COALESCE($3, users.name)""",
        user["sub"], user["email"], user["name"],
    )

    # --- The single all-in-one Gemini call ---
    try:
        result = await gemini.analyze_audio(
            audio_bytes, audio.content_type or "audio/webm"
        )
    except Exception:
        log.exception("Gemini analysis failed")
        raise HTTPException(502, "Story analysis failed — please try again.")

    # Rejected: record it and return the reason immediately (spec requirement).
    if not result.approved and not result.needs_review:
        row = await pool().fetchrow(
            """INSERT INTO stories (lantern_id, user_id, status, reject_reason,
                                    consent, language_original, transcript_original)
               VALUES ($1, $2, 'rejected', $3, TRUE, $4, $5)
               RETURNING id""",
            lantern_id, user["sub"], result.reject_reason or "Content not suitable.",
            result.language, result.transcript,
        )
        return {
            "story_id": str(row["id"]),
            "status": "rejected",
            "reject_reason": result.reject_reason or "Content not suitable.",
        }

    status = "pending_review" if result.needs_review else "processing"
    row = await pool().fetchrow(
        """INSERT INTO stories (lantern_id, user_id, status, consent,
                                language_original, transcript_original, text_ro, text_en)
           VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7)
           RETURNING id""",
        lantern_id, user["sub"], status,
        result.language, result.transcript, result.text_ro, result.text_en,
    )
    story_id = str(row["id"])

    # Preserve the storyteller's real voice: transcode the upload to normalized
    # MP3 under that language's slot. Done inline (~1 s) so it also survives
    # the pending_review path, where approval happens much later.
    original_url = None
    if result.language in ("ro", "en"):
        try:
            original_url = await eleven.clean_and_transcode(
                audio_bytes, f"{story_id}_{result.language}.mp3"
            )
        except Exception:
            log.exception("Original-audio transcode failed for story %s", story_id)

    if status == "processing":
        background.add_task(
            _generate_audio, story_id, result.text_ro, result.text_en,
            result.language, original_url,
        )

    return {"story_id": story_id, "status": status, "reject_reason": None}


@router.get("/mine")
async def my_stories(user: dict = Depends(get_current_user)):
    rows = await pool().fetch(
        """SELECT s.id, s.lantern_id, l.name AS lantern_name, s.status,
                  s.reject_reason, s.text_ro, s.text_en,
                  s.audio_ro_url, s.audio_en_url, s.created_at
           FROM stories s JOIN lanterns l ON l.id = s.lantern_id
           WHERE s.user_id = $1
           ORDER BY s.created_at DESC""",
        user["sub"],
    )
    return [dict(r) for r in rows]


@router.get("/{story_id}")
async def get_story(story_id: UUID):
    row = await pool().fetchrow(
        """SELECT id, lantern_id, status, text_ro, text_en,
                  audio_ro_url, audio_en_url, created_at
           FROM stories WHERE id = $1 AND status = 'approved'""",
        story_id,
    )
    if row is None:
        raise HTTPException(404, "Story not found.")
    return dict(row)


@router.delete("/{story_id}")
async def delete_story(story_id: UUID, user: dict = Depends(get_current_user)):
    row = await pool().fetchrow(
        "DELETE FROM stories WHERE id = $1 AND user_id = $2 RETURNING id",
        story_id, user["sub"],
    )
    if row is None:
        raise HTTPException(404, "Story not found.")
    for suffix in ("_ro.mp3", "_en.mp3"):
        (config.AUDIO_DIR / f"{story_id}{suffix}").unlink(missing_ok=True)
    return {"deleted": True}
