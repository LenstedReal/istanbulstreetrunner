"""Owner-only maintenance routes. Enabled only when ADMIN_SECRET is set; every call
needs the header `X-Admin-Secret`. Nothing here is reachable from the game client.

Deleting is always preceded by a copy into the `archive` collection, so a reset can
be undone with /restore-world."""
from __future__ import annotations

import hmac
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from . import security, services
from .deps import client_ip, get_db, limit

router = APIRouter(prefix="/api/v2/admin")

PLAYER_LINKED = ("friendships", "credentials", "runs", "blocks", "presence", "transfer_codes", "saves", "missions", "ledger", "reports")


def _require_admin(request: Request) -> None:
    secret = request.app.state.settings.admin_secret
    if not secret:
        raise HTTPException(404, "Not found")
    limit(request, "admin", client_ip(request))
    given = request.headers.get("x-admin-secret") or ""
    if not hmac.compare_digest(given.encode(), secret.encode()):
        raise HTTPException(401, "Admin secret wrong")


class PlayerRow(BaseModel):
    id: str
    nickname: str
    friend_code: str
    high_score: int
    runs: int
    created_at: datetime | None = None


class PlayersOut(BaseModel):
    total: int
    players: list[PlayerRow]


class ResetIn(BaseModel):
    """Friend codes of the accounts to keep; everyone else is archived and deleted."""

    keep: list[str] = Field(default_factory=list, max_length=200)
    dry_run: bool = True


class ResetOut(BaseModel):
    dry_run: bool
    kept: list[str]
    deleted: int
    archive_id: str | None = None
    freed_nicknames: list[str]


class RestoreIn(BaseModel):
    archive_id: str


def _row(doc: dict) -> PlayerRow:
    return PlayerRow(
        id=str(doc["_id"]),
        nickname=doc.get("nickname", ""),
        friend_code=doc.get("friend_code", ""),
        high_score=int(doc.get("high_score", 0)),
        runs=int(doc.get("runs", 0)),
        created_at=doc.get("created_at"),
    )


@router.get("/players", response_model=PlayersOut)
async def list_players(request: Request, limit_n: int = 200):
    _require_admin(request)
    db = get_db(request)
    cursor = db.players.find({}, {"nickname": 1, "friend_code": 1, "high_score": 1, "runs": 1, "created_at": 1}).sort([("high_score", -1)]).limit(max(1, min(limit_n, 1000)))
    rows = [_row(d) for d in await cursor.to_list(None)]
    return PlayersOut(total=await db.players.count_documents({}), players=rows)


@router.post("/reset-world", response_model=ResetOut)
async def reset_world(body: ResetIn, request: Request):
    """Archive and delete every player except the given friend codes (test accounts, stale names)."""
    _require_admin(request)
    db = get_db(request)
    keep = {c.strip().upper() for c in body.keep if c.strip()}
    victims = [d for d in await db.players.find({}).to_list(None) if (d.get("friend_code") or "").upper() not in keep]
    out = ResetOut(dry_run=body.dry_run, kept=sorted(keep), deleted=len(victims), freed_nicknames=sorted({d.get("nickname", "") for d in victims if d.get("nickname")}))
    if body.dry_run or not victims:
        return out
    ids = [str(d["_id"]) for d in victims]
    archive: dict[str, Any] = {"kind": "reset-world", "at": datetime.now(timezone.utc), "players": victims, "linked": {}}
    for coll in PLAYER_LINKED:
        query = {"$or": [{"player_id": {"$in": ids}}, {"friend_id": {"$in": ids}}, {"blocked_id": {"$in": ids}}, {"target_id": {"$in": ids}}, {"reporter_id": {"$in": ids}}]}
        archive["linked"][coll] = await db[coll].find(query).to_list(None)
    res = await db.archive.insert_one(archive)
    for coll, docs in archive["linked"].items():
        if docs:
            await db[coll].delete_many({"_id": {"$in": [d["_id"] for d in docs]}})
    await db.players.delete_many({"_id": {"$in": [d["_id"] for d in victims]}})
    await services.audit(db, "admin_reset", deleted=len(victims), archive=str(res.inserted_id), ip=security.anonymize(client_ip(request)))
    out.archive_id = str(res.inserted_id)
    return out


@router.post("/restore-world")
async def restore_world(body: RestoreIn, request: Request):
    """Put an archived reset back (players and everything linked to them)."""
    _require_admin(request)
    db = get_db(request)
    from bson import ObjectId

    try:
        oid = ObjectId(body.archive_id)
    except Exception:  # noqa: BLE001 - any malformed id is "not found"
        raise HTTPException(404, "Archive not found") from None
    archive = await db.archive.find_one({"_id": oid})
    if not archive:
        raise HTTPException(404, "Archive not found")
    restored = 0
    for doc in archive.get("players", []):
        if await db.players.find_one({"_id": doc["_id"]}, {"_id": 1}) is None:
            await db.players.insert_one(doc)
            restored += 1
    for coll, docs in archive.get("linked", {}).items():
        for doc in docs:
            if await db[coll].find_one({"_id": doc["_id"]}, {"_id": 1}) is None:
                await db[coll].insert_one(doc)
    await services.audit(db, "admin_restore", restored=restored, archive=body.archive_id)
    return {"ok": True, "restored_players": restored}
