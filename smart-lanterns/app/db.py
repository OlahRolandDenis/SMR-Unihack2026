"""asyncpg connection pool + schema initialization.

Usage in endpoints:
    from app.db import pool
    row = await pool().fetchrow("SELECT ...", arg)
"""
from pathlib import Path

import asyncpg

from app import config

_pool: asyncpg.Pool | None = None

SCHEMA_FILE = Path(__file__).resolve().parent.parent / "db" / "schema.sql"


def pool() -> asyncpg.Pool:
    """Return the live pool. Call only after startup (connect() has run)."""
    assert _pool is not None, "DB pool not initialized — is the app running via lifespan?"
    return _pool


async def connect() -> None:
    """Create the pool and apply the schema (idempotent). Called from lifespan."""
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=config.DATABASE_URL,
        min_size=1,
        max_size=10,
        # Tiger Data closes idle connections; keep the pool honest.
        max_inactive_connection_lifetime=300,
    )
    schema_sql = SCHEMA_FILE.read_text(encoding="utf-8")
    async with _pool.acquire() as conn:
        # Simple-query protocol: executes the whole multi-statement script.
        await conn.execute(schema_sql)


async def disconnect() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
