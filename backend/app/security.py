"""Tokens, public ids and codes. Pure functions, no I/O.

Only the SHA-256 hash of a token is stored, so a database copy cannot be used
to sign in. Public ids are random and unrelated to the MongoDB ObjectId, which
stays private to its owner.
"""
from __future__ import annotations

import base64
import hashlib
import re
import secrets

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_OBJECT_ID = re.compile(r"^[0-9a-f]{24}$")
_PUBLIC_ID = re.compile(r"^[a-z2-7]{16}$")


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def new_public_id() -> str:
    return base64.b32encode(secrets.token_bytes(10)).decode("ascii").lower()


def is_object_id(value: str) -> bool:
    return bool(_OBJECT_ID.match(value or ""))


def is_public_id(value: str) -> bool:
    return bool(_PUBLIC_ID.match(value or ""))


def new_friend_code(length: int = 6) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def new_transfer_code() -> str:
    raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def normalize_code(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def new_run_id() -> str:
    return secrets.token_urlsafe(16)


def new_seed() -> int:
    return secrets.randbits(31) or 1


def parse_bearer(header: str | None) -> str | None:
    if not header:
        return None
    scheme, _, value = header.partition(" ")
    value = value.strip()
    if scheme.lower() != "bearer" or not value or len(value) > 200:
        return None
    return value


def anonymize(player_id: str) -> str:
    return "deleted:" + hash_secret(player_id)[:16]
