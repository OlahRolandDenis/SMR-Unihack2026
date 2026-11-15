"""The ESP32 polling endpoint — tiny JSON, fast, no auth (hackathon decision).

GET /iot/{lantern_id}/poll  →  {"state": ..., "people_count": N, "audio_url": ...|null}

- state drives the WiZ bulb animation (ESP32 → bulb via local UDP):
    'playing' when a queued story is handed out, 'crowded' when the square is
    busy, otherwise 'idle'.
- audio_url is ABSOLUTE plain-HTTP (PUBLIC_BASE_URL) so ESP8266Audio can stream it.
- Popping the queue uses FOR UPDATE SKIP LOCKED so each item is delivered once.
"""
import random

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app import config
from app.db import pool

router = APIRouter(prefix="/iot", tags=["iot"])

CROWDED_THRESHOLD = 5  # live people that turn the lantern 'crowded'

# Pre-generated ElevenLabs touch prompts (see scripts in repo history):
# icebreakers, record-a-story nudges, and Timișoara culture notes.
PROMPTS_DIR = config.AUDIO_DIR / "prompts"


# Everything in ONE statement: the cloud DB round trip costs 200-500 ms on
# hotspot/cellular, so sequential queries here blow past the ESP32's HTTP timeout.
#
# Delivery is at-least-once: poll hands the item out as 'delivering'; the ESP32
# POSTs /iot/{id}/ack once playback starts, which marks it 'delivered'. Items
# stuck in 'delivering' (connection died mid-handoff or mid-stream) are put
# back in the queue by the two sweep CTEs below — at most 3 tries, then 'failed'.
# `popped` explicitly skips rows `requeued` touched: two sub-statements must
# not update the same row in one command (undefined in Postgres), and the
# exclusion also forces their execution order. A requeued story therefore
# goes out on the NEXT poll, ~4 s later.
POLL_QUERY = """
WITH requeued AS (
    UPDATE play_queue
    SET status = 'queued', delivered_at = NULL,
        delivery_attempts = delivery_attempts + 1
    WHERE lantern_id = $1 AND status = 'delivering'
          AND delivered_at < now() - interval '75 seconds'
          AND delivery_attempts < 2
    RETURNING id
),
gave_up AS (
    UPDATE play_queue
    SET status = 'failed'
    WHERE lantern_id = $1 AND status = 'delivering'
          AND delivered_at < now() - interval '75 seconds'
          AND delivery_attempts >= 2
    RETURNING id
),
popped AS (
    UPDATE play_queue q
    SET status = 'delivering', delivered_at = now()
    WHERE q.id = (
        SELECT id FROM play_queue
        WHERE lantern_id = $1 AND status = 'queued'
              AND id NOT IN (SELECT id FROM requeued)
        ORDER BY requested_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING q.story_id, q.lang
),
pc AS (
    SELECT count(DISTINCT session_id) AS n
    FROM presence_pings
    WHERE lantern_id = $1
          AND time > now() - make_interval(secs => $2)
),
sel AS (
    SELECT pc.n AS people_count,
           CASE WHEN p.lang = 'ro' THEN s.audio_ro_url
                ELSE s.audio_en_url END AS rel_url
    FROM pc
    LEFT JOIN popped p ON true
    LEFT JOIN stories s ON s.id = p.story_id
),
upd AS (
    UPDATE lanterns
    SET state = (SELECT CASE
            WHEN COALESCE(rel_url, '') <> '' THEN 'playing'
            WHEN people_count >= $3 THEN 'crowded'
            ELSE 'idle' END
        FROM sel),
        last_seen = now()
    WHERE id = $1
    RETURNING state
)
SELECT sel.people_count, sel.rel_url, upd.state
FROM sel LEFT JOIN upd ON true
"""


@router.get("/{lantern_id}/poll")
async def poll(lantern_id: str):
    row = await pool().fetchrow(
        POLL_QUERY, lantern_id, config.PRESENCE_WINDOW_SECONDS, CROWDED_THRESHOLD
    )
    if row["state"] is None:  # the UPDATE matched no lantern
        raise HTTPException(404, "Unknown lantern.")

    audio_url = f"{config.PUBLIC_BASE_URL}{row['rel_url']}" if row["rel_url"] else None
    return {
        "state": row["state"],
        "people_count": row["people_count"],
        "audio_url": audio_url,
    }


@router.get("/{lantern_id}/prompt")
async def touch_prompt(lantern_id: str):
    """A random spoken prompt for the lantern's touch button.

    Served as a plain MP3 so the ESP32 downloads it exactly like a story.
    """
    files = sorted(PROMPTS_DIR.glob("*.mp3")) if PROMPTS_DIR.exists() else []
    if not files:
        raise HTTPException(404, "No prompts generated yet.")
    return FileResponse(random.choice(files), media_type="audio/mpeg")


@router.post("/{lantern_id}/ack")
async def ack(lantern_id: str):
    """ESP32 confirms playback started; outstanding handoffs become 'delivered'.

    The lantern plays one story at a time (it skips polling mid-stream), so
    acking everything 'delivering' for this lantern is unambiguous.
    """
    result = await pool().execute(
        "UPDATE play_queue SET status = 'delivered' WHERE lantern_id = $1 AND status = 'delivering'",
        lantern_id,
    )
    return {"acked": result != "UPDATE 0"}
