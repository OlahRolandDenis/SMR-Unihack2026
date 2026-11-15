"""Gemini: ONE call that transcribes, moderates, and translates the recording.

Input:  raw audio bytes (webm/ogg/mp4 from the browser's MediaRecorder)
Output: GeminiResult — approved/rejected/needs_review + transcript + RO/EN texts

Uses the REST API directly over HTTP/1.1 (httpx): the official SDK's gRPC
transport hangs on this network, and the package is deprecated anyway.
"""
import base64
import json
from dataclasses import dataclass

import httpx

from app import config

MODEL = "gemini-3.5-flash"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

PROMPT = """\
You are the content pipeline for "Smart Cultural Lanterns", a public art installation
in Timișoara, Romania. Members of the public record short spoken memories/stories
about the city; approved stories are PLAYED ALOUD through speakers in public squares.

Process the attached audio recording and do ALL of the following in one pass:

1. TRANSCRIBE it faithfully in its original language.
2. MODERATE it. REJECT if it contains any of:
   - profanity, slurs, hate speech, or sexual content
   - personal identifiable information (phone numbers, addresses, email,
     full names of private individuals)
   - spam, advertising, or political campaigning
   - threats, harassment, or incitement
   - no intelligible speech at all (silence, noise, music only)
   If it is borderline (you are genuinely unsure whether a human would approve it),
   set "needs_review" to true instead of rejecting.
3. TRANSLATE the transcript into Romanian and into English. Keep it natural and
   spoken-word friendly (it will be read by a text-to-speech voice). If the original
   is already in one of those languages, lightly clean it up (remove filler words,
   false starts) rather than translating.

Respond with ONLY this JSON object, no markdown fences, no commentary:
{
  "approved": true/false,
  "needs_review": true/false,
  "reject_reason": "short human-readable reason shown to the user, or null",
  "language": "BCP-47 code of the spoken language, e.g. 'ro'",
  "transcript": "faithful transcription in the original language",
  "text_ro": "Romanian version",
  "text_en": "English version"
}
"""


@dataclass
class GeminiResult:
    approved: bool
    needs_review: bool
    reject_reason: str | None
    language: str
    transcript: str
    text_ro: str
    text_en: str


async def analyze_audio(audio_bytes: bytes, mime_type: str) -> GeminiResult:
    """Single Gemini call: transcription + moderation + translation."""
    body = {
        "contents": [
            {
                "parts": [
                    {"text": PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64.b64encode(audio_bytes).decode(),
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            API_URL,
            params={"key": config.GEMINI_API_KEY},
            json=body,
        )
        resp.raise_for_status()

    raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    # Defensive: strip markdown fences if the model added them anyway.
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.removeprefix("json").strip()
    data = json.loads(raw)

    return GeminiResult(
        approved=bool(data.get("approved", False)),
        needs_review=bool(data.get("needs_review", False)),
        reject_reason=data.get("reject_reason") or None,
        language=data.get("language") or "unknown",
        transcript=data.get("transcript") or "",
        text_ro=data.get("text_ro") or "",
        text_en=data.get("text_en") or "",
    )
