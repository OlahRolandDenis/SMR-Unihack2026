"""Auth0 access-token verification as FastAPI dependencies.

- get_current_user: requires a valid Bearer token (RS256, checked against the
  tenant's JWKS). Returns {"sub", "email", "name"}.
- get_moderator: same, plus the email must be in MODERATOR_EMAILS.

Note: Auth0 access tokens don't carry `email` by default, so we fall back to
the /userinfo endpoint once per user and cache the result in memory.
"""
import logging

import httpx
import jwt

logger = logging.getLogger("uvicorn.error")
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import config

_bearer = HTTPBearer(auto_error=False)
_jwks_client = jwt.PyJWKClient(
    f"https://{config.AUTH0_DOMAIN}/.well-known/jwks.json", cache_keys=True
)
# sub -> {"email": ..., "name": ...} fetched from /userinfo
_profile_cache: dict[str, dict] = {}


async def _userinfo(token: str, sub: str) -> dict:
    if sub in _profile_cache:
        return _profile_cache[sub]
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://{config.AUTH0_DOMAIN}/userinfo",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
    profile = resp.json() if resp.status_code == 200 else {}
    _profile_cache[sub] = profile
    return profile


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    if creds is None:
        logger.warning("auth: request had no Bearer token")
        raise HTTPException(401, "Login required")
    token = creds.credentials
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=config.AUTH0_AUDIENCE,
            issuer=f"https://{config.AUTH0_DOMAIN}/",
            leeway=60,  # tolerate clock skew between Auth0 and this host (WSL drifts)
        )
    except jwt.PyJWTError as exc:
        logger.warning("auth: token rejected: %r (token prefix: %s...)", exc, token[:20])
        raise HTTPException(401, f"Invalid token: {exc}") from exc

    sub = claims["sub"]
    email = claims.get("email")
    name = claims.get("name")
    if not email:
        profile = await _userinfo(token, sub)
        email = profile.get("email", "")
        name = name or profile.get("name")
    return {"sub": sub, "email": (email or "").lower(), "name": name}


async def get_moderator(user: dict = Depends(get_current_user)) -> dict:
    if user["email"] not in config.MODERATOR_EMAILS:
        raise HTTPException(403, "Moderator access required")
    return user
