"""ElevenLabs: turn approved story text into MP3 files on disk.

Files land in config.AUDIO_DIR and are served statically at /audio/<name>
(plain HTTP on Vultr so the ESP32 can stream them).
"""
import asyncio
import logging

import httpx
from elevenlabs.client import AsyncElevenLabs

from app import config

log = logging.getLogger(__name__)

_client = AsyncElevenLabs(api_key=config.ELEVENLABS_API_KEY)

# ElevenLabs plans cap concurrent API requests (~2 on the free tier); going
# over returns 429s. Gate every API call here so simultaneous uploads wait a
# few seconds in line instead of failing.
_api_slots = asyncio.Semaphore(2)


async def _retry(op, attempts: int = 3, base_delay: float = 2.0):
    """Run `op` with exponential backoff; transient 429s/outages heal here."""
    for i in range(attempts):
        try:
            return await op()
        except Exception:
            if i == attempts - 1:
                raise
            delay = base_delay * (2 ** i)
            log.warning(
                "ElevenLabs call failed (attempt %d/%d), retrying in %.0f s",
                i + 1, attempts, delay, exc_info=True,
            )
            await asyncio.sleep(delay)

# mp3_44100_128 decodes fine with ESP8266Audio on the ESP32.
OUTPUT_FORMAT = "mp3_44100_128"
TTS_MODEL = "eleven_multilingual_v2"  # handles both RO and EN

# -14 LUFS / -1.5 dBTP: consistent loudness so the ESP32 firmware can run
# STREAM_GAIN=1.0 without clipping. 64k mono-ish voice keeps streaming light.
LOUDNORM = "loudnorm=I=-14:TP=-1.5:LRA=11"
FFMPEG_NORMALIZE = [
    "-codec:a", "libmp3lame", "-b:a", "64k", "-ar", "44100",
    "-af", LOUDNORM,
]
# Fallback cleanup when ElevenLabs isolation is unavailable: cut rumble below
# the voice band, FFT-denoise steady background, then the usual loudnorm.
FFMPEG_DENOISE = [
    "-codec:a", "libmp3lame", "-b:a", "64k", "-ar", "44100",
    "-af", f"highpass=f=80,afftdn=nf=-25,{LOUDNORM}",
]


async def _normalize_loudness(out_path) -> None:
    """Re-encode in place at normalized loudness; keep the original on failure."""
    tmp = out_path.with_name(out_path.name + ".norm.mp3")
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", str(out_path), *FFMPEG_NORMALIZE, str(tmp),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, err = await proc.communicate()
        if proc.returncode == 0:
            tmp.replace(out_path)
        else:
            log.warning("loudnorm failed for %s: %s", out_path.name, err.decode()[-300:])
    except FileNotFoundError:
        log.warning("ffmpeg not installed; serving %s unnormalized", out_path.name)
    finally:
        tmp.unlink(missing_ok=True)


async def transcode_to_file(audio_bytes: bytes, filename: str, denoise: bool = False) -> str:
    """Re-encode an uploaded recording (webm/mp4) to normalized MP3.

    Keeps the storyteller's real voice as the playable audio — the lantern
    needs MP3 and the same loudness as the TTS files. Raises if ffmpeg is
    unavailable or the input can't be decoded (callers fall back to TTS).
    """
    out_path = config.AUDIO_DIR / filename
    src_path = out_path.with_name(out_path.name + ".src")
    src_path.write_bytes(audio_bytes)
    try:
        args = FFMPEG_DENOISE if denoise else FFMPEG_NORMALIZE
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", str(src_path), *args, str(out_path),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, err = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg transcode failed: {err.decode()[-300:]}")
        return f"/audio/{filename}"
    finally:
        src_path.unlink(missing_ok=True)


async def isolate_voice(audio_bytes: bytes) -> bytes:
    """ElevenLabs Audio Isolation: strip background noise, keep the voice.

    REST via httpx for the same reason as Gemini (the SDK's transport hangs
    on this WSL2 network; plain HTTP/1.1 does not).
    """
    async def attempt() -> bytes:
        async with _api_slots:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    "https://api.elevenlabs.io/v1/audio-isolation",
                    headers={"xi-api-key": config.ELEVENLABS_API_KEY},
                    files={"audio": ("recording", audio_bytes)},
                )
                resp.raise_for_status()
                return resp.content

    return await _retry(attempt, attempts=2, base_delay=1.5)


async def clean_and_transcode(audio_bytes: bytes, filename: str) -> str:
    """Best-effort cleanup chain for the storyteller's own recording:
    ElevenLabs voice isolation -> ffmpeg denoise fallback -> raw transcode."""
    try:
        cleaned = await isolate_voice(audio_bytes)
        return await transcode_to_file(cleaned, filename)
    except Exception:
        log.warning("Voice isolation failed; using ffmpeg denoise fallback", exc_info=True)
        return await transcode_to_file(audio_bytes, filename, denoise=True)


async def synthesize_to_file(text: str, filename: str, voice_id: str | None = None) -> str:
    """Generate speech for `text`, save as AUDIO_DIR/<filename>.

    Returns the public path ('/audio/<filename>') to store in the DB.
    `voice_id` overrides the default story voice (e.g. the touch prompts).
    """
    out_path = config.AUDIO_DIR / filename

    async def attempt() -> None:
        async with _api_slots:
            stream = _client.text_to_speech.convert(
                voice_id=voice_id or config.ELEVENLABS_VOICE_ID,
                text=text,
                model_id=TTS_MODEL,
                output_format=OUTPUT_FORMAT,
            )
            with open(out_path, "wb") as f:
                async for chunk in stream:
                    f.write(chunk)

    await _retry(attempt)
    await _normalize_loudness(out_path)
    return f"/audio/{filename}"
