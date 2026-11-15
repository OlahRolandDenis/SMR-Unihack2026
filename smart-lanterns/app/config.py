"""Central configuration — everything comes from environment variables.

Run locally with:  uvicorn app.main:app --reload --env-file .env
"""
import os
from pathlib import Path

# --- Database (Tiger Data / PostgreSQL) ---
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# --- AI services ---
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
# Default voice: "George" (good multilingual narration voice)
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")

# --- Auth0 ---
AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "")
AUTH0_AUDIENCE = os.environ.get("AUTH0_AUDIENCE", "")

# --- Moderation ---
MODERATOR_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("MODERATOR_EMAILS", "").split(",")
    if e.strip()
}

# --- Serving ---
# Absolute base URL the ESP32 uses to download MP3s (plain HTTP on Vultr).
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

# Directory where generated MP3s are stored, mounted at /audio in main.py.
AUDIO_DIR = Path(os.environ.get("AUDIO_DIR", Path(__file__).resolve().parent.parent / "audio"))
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Presence: a session counts as "here" if it pinged within this window.
PRESENCE_WINDOW_SECONDS = 45
