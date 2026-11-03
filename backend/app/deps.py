"""Request helpers: database handle, client IP, rate limits and authentication."""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, Request

from . import security, services
from .ratelimit import RateLimiter


def get_db(request: Request):
    return request.app.state.db


def get_limiter(request: Request) -> RateLimiter:
    return request.app.state.limiter


def client_ip(request: Request) -> str:
    for header in ("true-client-ip", "cf-connecting-ip"):
        value = request.headers.get(header)
        if value:
            return value.strip()[:64]
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else "unknown"


def limit(request: Request, bucket: str, key: str) -> None:
    if not get_limiter(request).allow(bucket, key):
        raise HTTPException(429, "Çok fazla istek. Biraz sonra tekrar dene.")


async def optional_player(request: Request) -> Optional[dict]:
    token = security.parse_bearer(request.headers.get("authorization"))
    return await services.player_from_token(get_db(request), token)


async def require_player(request: Request) -> dict:
    doc = await optional_player(request)
    if not doc:
        raise HTTPException(401, "Oturum geçersiz. Uygulamayı yeniden başlat.")
    await services.ensure_public_id(get_db(request), doc)
    return doc


async def legacy_owner(request: Request, player_id: str) -> dict:
    """1.0.x routes act on the id in the path. Once an account is claimed by a 2.0
    install, only that install (with its token) may use them."""
    db = get_db(request)
    doc = await services.get_player_or_404(db, player_id)
    if services.is_claimed(doc):
        me = await optional_player(request)
        if not me or me["_id"] != doc["_id"]:
            raise HTTPException(401, "Bu hesap uygulamanın yeni sürümüyle korunuyor. Uygulamayı güncelle.")
    return doc
