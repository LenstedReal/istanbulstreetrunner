"""MongoDB indexes. Every call is idempotent; existing 1.0.x indexes keep their exact definitions."""
from __future__ import annotations

import logging

log = logging.getLogger("isr.db")

# (collection, keys, options)
INDEXES: list[tuple[str, object, dict]] = [
    # 1.0.x indexes (unchanged)
    ("players", "friend_code", {"unique": True}),
    ("players", [("high_score", -1)], {}),
    ("friendships", [("player_id", 1), ("friend_id", 1)], {"unique": True}),
    # 2.0 additions
    ("players", "public_id", {"unique": True, "sparse": True}),
    # Nicknames are unique (folded: case, Turkish letters, look-alikes). Old players get the
    # key the first time they rename, so the index stays sparse.
    ("players", "nickname_key", {"unique": True, "sparse": True}),
    ("players", [("high_score", -1), ("best_at", 1)], {}),
    ("friendships", "friend_id", {}),
    ("credentials", "token_hash", {"unique": True}),
    ("credentials", "player_id", {}),
    ("runs", "run_id", {"unique": True}),
    ("runs", [("player_id", 1), ("started_at", -1)], {}),
    ("runs", "expire_at", {"expireAfterSeconds": 0}),
    ("ledger", [("player_id", 1), ("kind", 1), ("key", 1)], {"unique": True}),
    ("blocks", [("player_id", 1), ("blocked_id", 1)], {"unique": True}),
    ("blocks", "blocked_id", {}),
    ("reports", [("target_id", 1), ("created_at", -1)], {}),
    ("transfer_codes", "code_hash", {"unique": True}),
    ("transfer_codes", "expire_at", {"expireAfterSeconds": 0}),
    ("presence", "player_id", {"unique": True}),
    ("presence", "last_seen", {"expireAfterSeconds": 180}),
    ("saves", "player_id", {"unique": True}),
    ("missions", [("player_id", 1), ("day", 1)], {"unique": True}),
    ("missions", "expire_at", {"expireAfterSeconds": 0}),
    ("audit", "at", {"expireAfterSeconds": 90 * 86400}),
]


async def ensure_indexes(db) -> list[str]:
    """Create missing indexes; a failure is logged and does not stop the API."""
    failed: list[str] = []
    for coll, keys, opts in INDEXES:
        try:
            await db[coll].create_index(keys, **opts)
        except Exception:  # noqa: BLE001 - keep serving even if one index cannot be built
            log.exception("index %s %s failed", coll, keys)
            failed.append(f"{coll}:{keys}")
    return failed
