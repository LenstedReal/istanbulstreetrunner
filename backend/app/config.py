"""Settings from environment variables. Values are never logged."""
from __future__ import annotations

import os
from dataclasses import dataclass

DEFAULT_ORIGINS = ("http://localhost:8081", "http://localhost:19006", "http://127.0.0.1:8081")


def _flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    mongo_url: str
    db_name: str
    allowed_origins: tuple[str, ...] = DEFAULT_ORIGINS
    rate_limit_enabled: bool = True
    presence_enabled: bool = True
    revenuecat_secret: str | None = None
    # Long random value; enables the /api/v2/admin routes (header X-Admin-Secret). Empty = disabled.
    admin_secret: str | None = None
    # "Nick=FRIENDCODE,Other=CODE2": a nickname (and every name starting with it) only that
    # friend code may use. Empty = no reserved names besides the built-in ones.
    reserved_nicknames: tuple[tuple[str, str], ...] = ()


def _reserved(raw: str) -> tuple[tuple[str, str], ...]:
    out = []
    for item in raw.split(","):
        if not item.strip():
            continue
        name, _, code = item.partition("=")
        if name.strip():
            out.append((name.strip(), code.strip().upper()))
    return tuple(out)


def load_settings() -> Settings:
    origins = os.environ.get("ALLOWED_ORIGINS")
    return Settings(
        mongo_url=os.environ["MONGO_URL"],
        db_name=os.environ.get("DB_NAME", "istanbulstreetrunner"),
        allowed_origins=tuple(o.strip() for o in origins.split(",") if o.strip()) if origins is not None else DEFAULT_ORIGINS,
        rate_limit_enabled=_flag("RATE_LIMIT_ENABLED", True),
        presence_enabled=_flag("PRESENCE_ENABLED", True),
        revenuecat_secret=(os.environ.get("REVENUECAT_SECRET_KEY") or "").strip() or None,
        admin_secret=(os.environ.get("ADMIN_SECRET") or "").strip() or None,
        reserved_nicknames=_reserved(os.environ.get("RESERVED_NICKNAMES") or ""),
    )
