"""Smart Cultural Lanterns — FastAPI entry point.

Run locally:   uvicorn app.main:app --reload --env-file .env
On Vultr:      uvicorn app.main:app --host 0.0.0.0 --port 80 --env-file .env
               (plain HTTP on purpose: the ESP32 streams MP3s without TLS)
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config, db
from app.routers import iot, lanterns, moderation, presence, stories


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()  # creates the pool and applies db/schema.sql (idempotent)
    yield
    await db.disconnect()


app = FastAPI(title="Smart Cultural Lanterns", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Generated MP3s, served over plain HTTP for the ESP32.
app.mount("/audio", StaticFiles(directory=config.AUDIO_DIR), name="audio")

app.include_router(lanterns.router)
app.include_router(presence.router)
app.include_router(stories.router)
app.include_router(moderation.router)
app.include_router(iot.router)


@app.get("/health")
async def health():
    return {"ok": True}
