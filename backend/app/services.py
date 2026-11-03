"""Data operations shared by the legacy and v2 routes."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from . import anticheat, missions, security
from .models import MeOut, PlayerOut, PublicPlayer

log = logging.getLogger("isr")

ACTIVE = {"deleted_at": None}
VISIBLE = {"high_score": {"$gt": 0}, "deleted_at": None, "hidden": {"$ne": True}}
ONLINE_WINDOW = timedelta(seconds=120)
FRIEND_LIMIT = 200
TRANSFER_CODE_TTL = timedelta(hours=24)


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def today() -> str:
    return now().strftime("%Y-%m-%d")


# ----------------------------------------------------------------- lookups
async def find_player(db, player_id: str) -> Optional[dict]:
    if not security.is_object_id(player_id):
        return None
    return await db.players.find_one({"_id": ObjectId(player_id), **ACTIVE})


async def find_by_public_id(db, public_id: str) -> Optional[dict]:
    if not security.is_public_id(public_id):
        return None
    return await db.players.find_one({"public_id": public_id, **ACTIVE})


async def resolve_ref(db, ref: str) -> Optional[dict]:
    """A player referenced by its private ObjectId (1.0.x) or its public id (2.0)."""
    if security.is_object_id(ref):
        return await find_player(db, ref)
    return await find_by_public_id(db, ref)


async def get_player_or_404(db, player_id: str) -> dict:
    doc = await find_player(db, player_id)
    if not doc:
        raise HTTPException(404, "Oyuncu bulunamadı")
    return doc


async def ensure_public_id(db, doc: dict) -> str:
    """Give an older player a public id the first time one is needed (race-safe)."""
    pid = doc.get("public_id")
    if pid:
        return pid
    for _ in range(5):
        candidate = security.new_public_id()
        try:
            res = await db.players.update_one({"_id": doc["_id"], "public_id": {"$exists": False}}, {"$set": {"public_id": candidate}})
        except DuplicateKeyError:
            continue
        if res.modified_count == 1:
            doc["public_id"] = candidate
            return candidate
        fresh = await db.players.find_one({"_id": doc["_id"]}, {"public_id": 1})
        if fresh and fresh.get("public_id"):
            doc["public_id"] = fresh["public_id"]
            return fresh["public_id"]
    raise HTTPException(503, "Geçici bir sorun oluştu, tekrar dene")


async def ensure_public_ids(db, docs: list[dict]) -> None:
    for d in docs:
        if not d.get("public_id"):
            await ensure_public_id(db, d)


# ----------------------------------------------------------------- views
def legacy_out(doc: dict, *, rank: Optional[int] = None, is_me: bool = False, reveal: bool = False, public: bool = False) -> PlayerOut:
    """1.0.x shape. `public` swaps the private id for the public one; `reveal` includes the friend code."""
    return PlayerOut(
        id=(doc.get("public_id") or "") if public else str(doc["_id"]),
        nickname=doc.get("nickname", ""),
        friend_code=doc.get("friend_code", "") if reveal else "",
        high_score=int(doc.get("high_score", 0)),
        total_coins=int(doc.get("total_coins", 0)),
        runs=int(doc.get("runs", 0)),
        rank=rank,
        is_me=is_me,
    )


def public_out(doc: dict, *, rank: Optional[int] = None, is_me: bool = False, online: Optional[bool] = None) -> PublicPlayer:
    return PublicPlayer(
        public_id=doc.get("public_id", ""),
        nickname=doc.get("nickname", ""),
        high_score=int(doc.get("high_score", 0)),
        total_coins=int(doc.get("total_coins", 0)),
        runs=int(doc.get("runs", 0)),
        rank=rank,
        is_me=is_me,
        online=online,
    )


def me_out(doc: dict, *, rank: Optional[int] = None) -> MeOut:
    return MeOut(
        id=str(doc["_id"]),
        public_id=doc.get("public_id", ""),
        nickname=doc.get("nickname", ""),
        friend_code=doc.get("friend_code", ""),
        high_score=int(doc.get("high_score", 0)),
        total_coins=int(doc.get("total_coins", 0)),
        runs=int(doc.get("runs", 0)),
        rank=rank,
        hidden=bool(doc.get("hidden")),
        created_at=aware(doc.get("created_at")),
    )


# ----------------------------------------------------------------- players
async def create_player(db, nickname: str, *, claimed: bool) -> dict:
    """Insert a player; retries when the random friend code or public id collides."""
    for _ in range(12):
        t = now()
        doc: dict[str, Any] = {
            "nickname": nickname,
            "friend_code": security.new_friend_code(),
            "public_id": security.new_public_id(),
            "high_score": 0,
            "total_coins": 0,
            "runs": 0,
            "created_at": t,
            "updated_at": t,
            "schema_version": 2,
        }
        if claimed:
            doc["claimed_at"] = t
        try:
            res = await db.players.insert_one(doc)
        except DuplicateKeyError:
            continue
        doc["_id"] = res.inserted_id
        return doc
    raise HTTPException(503, "Arkadaş kodu üretilemedi, tekrar dene")


async def set_nickname(db, doc: dict, nickname: str) -> None:
    await db.players.update_one({"_id": doc["_id"]}, {"$set": {"nickname": nickname, "updated_at": now()}})
    doc["nickname"] = nickname


def is_claimed(doc: dict) -> bool:
    return bool(doc.get("claimed_at"))


async def audit(db, kind: str, **data: Any) -> None:
    try:
        await db.audit.insert_one({"kind": kind, "at": now(), **data})
    except Exception:  # noqa: BLE001 - auditing must never break a request
        log.warning("audit insert failed for %s", kind)


# ----------------------------------------------------------------- auth
async def issue_token(db, player_id: str, via: str) -> str:
    token = security.new_token()
    t = now()
    await db.credentials.insert_one({"token_hash": security.hash_secret(token), "player_id": player_id, "via": via, "created_at": t, "last_used_at": t})
    return token


async def player_from_token(db, token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    cred = await db.credentials.find_one({"token_hash": security.hash_secret(token)})
    if not cred:
        return None
    doc = await find_player(db, cred["player_id"])
    if not doc:
        return None
    last = aware(cred.get("last_used_at"))
    if last is None or now() - last > timedelta(hours=12):
        await db.credentials.update_one({"_id": cred["_id"]}, {"$set": {"last_used_at": now()}})
    return doc


async def claim(db, player_id: str, friend_code: str) -> dict:
    doc = await find_player(db, player_id)
    if not doc or doc.get("friend_code", "") != security.normalize_code(friend_code):
        raise HTTPException(404, "Hesap bulunamadı")
    res = await db.players.update_one({"_id": doc["_id"], "claimed_at": {"$exists": False}}, {"$set": {"claimed_at": now(), "schema_version": 2}})
    if res.modified_count != 1:
        raise HTTPException(409, "Bu hesap başka bir cihazda etkin. Hesap aktarma kodunu kullan.")
    doc["claimed_at"] = now()
    await ensure_public_id(db, doc)
    return doc


async def create_transfer_code(db, player_id: str) -> tuple[str, datetime]:
    code = security.new_transfer_code()
    expires = now() + TRANSFER_CODE_TTL
    await db.transfer_codes.insert_one(
        {"code_hash": security.hash_secret(security.normalize_code(code)), "player_id": player_id, "used": False, "created_at": now(), "expire_at": expires}
    )
    return code, expires


async def redeem_transfer_code(db, code: str) -> dict:
    doc = await db.transfer_codes.find_one_and_update(
        {"code_hash": security.hash_secret(security.normalize_code(code)), "used": False, "expire_at": {"$gt": now()}},
        {"$set": {"used": True, "used_at": now()}},
    )
    if not doc:
        raise HTTPException(404, "Kod geçersiz ya da süresi dolmuş")
    player = await find_player(db, doc["player_id"])
    if not player:
        raise HTTPException(404, "Hesap bulunamadı")
    return player


# ----------------------------------------------------------------- leaderboard
async def top_players(db, limit: int) -> list[dict]:
    cursor = db.players.find(VISIBLE).sort([("high_score", -1), ("best_at", 1), ("_id", 1)]).limit(limit)
    return await cursor.to_list(limit)


async def rank_of(db, doc: dict) -> Optional[int]:
    hs = int(doc.get("high_score", 0))
    if hs <= 0 or doc.get("hidden"):
        return None
    higher = await db.players.count_documents({**VISIBLE, "high_score": {"$gt": hs}})
    return higher + 1


# ----------------------------------------------------------------- presence
async def touch_presence(db, player_id: str) -> None:
    await db.presence.update_one({"player_id": player_id}, {"$set": {"last_seen": now()}}, upsert=True)


async def online_among(db, ids: list[str]) -> set[str]:
    if not ids:
        return set()
    cutoff = now() - ONLINE_WINDOW
    docs = await db.presence.find({"player_id": {"$in": ids}, "last_seen": {"$gte": cutoff}}, {"player_id": 1}).to_list(len(ids))
    return {d["player_id"] for d in docs}


async def online_count(db) -> int:
    return await db.presence.count_documents({"last_seen": {"$gte": now() - ONLINE_WINDOW}})


# ----------------------------------------------------------------- friends
async def blocked_between(db, a: str, b: str) -> bool:
    n = await db.blocks.count_documents({"$or": [{"player_id": a, "blocked_id": b}, {"player_id": b, "blocked_id": a}]}, limit=1)
    return n > 0


async def friend_docs(db, player_id: str) -> list[dict]:
    links = await db.friendships.find({"player_id": player_id, "deleted_at": None}, {"friend_id": 1}).to_list(FRIEND_LIMIT * 2)
    ids = [ObjectId(link["friend_id"]) for link in links if security.is_object_id(link.get("friend_id", ""))]
    if not ids:
        return []
    return await db.players.find({"_id": {"$in": ids}, **ACTIVE}).to_list(len(ids))


async def add_friend(db, me: dict, friend_code: str) -> dict:
    code = security.normalize_code(friend_code)
    friend = await db.players.find_one({"friend_code": code, **ACTIVE})
    me_id = str(me["_id"])
    if not friend:
        raise HTTPException(404, "Bu kodla bir oyuncu bulunamadı")
    friend_id = str(friend["_id"])
    if friend_id == me_id:
        raise HTTPException(400, "Kendini ekleyemezsin")
    if await blocked_between(db, me_id, friend_id):
        raise HTTPException(404, "Bu kodla bir oyuncu bulunamadı")
    existing = await db.friendships.find_one({"player_id": me_id, "friend_id": friend_id})
    if existing and existing.get("deleted_at") is None:
        raise HTTPException(409, "Bu oyuncu zaten arkadaşın")
    count = await db.friendships.count_documents({"player_id": me_id, "deleted_at": None})
    if count >= FRIEND_LIMIT:
        raise HTTPException(400, f"En fazla {FRIEND_LIMIT} arkadaş ekleyebilirsin")
    for a, b in ((me_id, friend_id), (friend_id, me_id)):
        await db.friendships.update_one(
            {"player_id": a, "friend_id": b},
            {"$set": {"deleted_at": None}, "$setOnInsert": {"player_id": a, "friend_id": b, "created_at": now()}},
            upsert=True,
        )
    await ensure_public_id(db, friend)
    return friend


async def remove_friend(db, me_id: str, friend_id: str) -> bool:
    res = await db.friendships.update_many(
        {"$or": [{"player_id": me_id, "friend_id": friend_id}, {"player_id": friend_id, "friend_id": me_id}], "deleted_at": None},
        {"$set": {"deleted_at": now()}},
    )
    return res.matched_count > 0


async def block(db, me_id: str, other_id: str) -> None:
    try:
        await db.blocks.insert_one({"player_id": me_id, "blocked_id": other_id, "created_at": now()})
    except DuplicateKeyError:
        pass
    await remove_friend(db, me_id, other_id)


async def unblock(db, me_id: str, other_id: str) -> None:
    await db.blocks.delete_one({"player_id": me_id, "blocked_id": other_id})


async def blocked_list(db, me_id: str) -> list[dict]:
    rows = await db.blocks.find({"player_id": me_id}, {"blocked_id": 1}).to_list(500)
    ids = [ObjectId(r["blocked_id"]) for r in rows if security.is_object_id(r.get("blocked_id", ""))]
    if not ids:
        return []
    return await db.players.find({"_id": {"$in": ids}, **ACTIVE}).to_list(len(ids))


# ----------------------------------------------------------------- runs
async def record_score(db, doc: dict, score: int, coins: int) -> bool:
    """Apply an accepted run to the player; True when it is a new record."""
    before = await db.players.find_one_and_update(
        {"_id": doc["_id"]},
        {"$max": {"high_score": score}, "$inc": {"total_coins": coins, "runs": 1}, "$set": {"updated_at": now()}},
        return_document=ReturnDocument.BEFORE,
    )
    new_record = bool(before) and score > int(before.get("high_score", 0))
    if new_record:
        await db.players.update_one({"_id": doc["_id"], "high_score": score}, {"$set": {"best_at": now()}})
    return new_record


async def flag_player(db, doc: dict, reasons: list[str]) -> None:
    after = await db.players.find_one_and_update(
        {"_id": doc["_id"]}, {"$inc": {"flags": 1}, "$set": {"last_flag": reasons}}, return_document=ReturnDocument.AFTER
    )
    if after and int(after.get("flags", 0)) >= anticheat.FLAG_HIDE_THRESHOLD and not after.get("hidden"):
        await db.players.update_one({"_id": doc["_id"]}, {"$set": {"hidden": True, "hidden_at": now()}})
        log.info("player hidden from the global board after repeated flags")


async def start_run(db, player_id: str, client_version: Optional[str], district: Optional[str]) -> dict:
    t = now()
    run = {
        "run_id": security.new_run_id(),
        "player_id": player_id,
        "seed": security.new_seed(),
        "status": "started",
        "started_at": t,
        "client_version": client_version,
        "district": district,
        "expire_at": t + timedelta(days=1),
    }
    await db.runs.insert_one(run)
    return run


def payload_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


async def finish_run(db, doc: dict, run_id: str, payload: dict) -> dict:
    """Validate and apply a finished run. Same payload twice returns the stored result."""
    player_id = str(doc["_id"])
    run = await db.runs.find_one({"run_id": run_id, "player_id": player_id})
    if not run:
        raise HTTPException(404, "Koşu bulunamadı")
    digest = payload_hash(payload)
    # Take the run atomically before any side effect, so a double submit cannot count twice.
    taken = await db.runs.find_one_and_update(
        {"_id": run["_id"], "status": "started"}, {"$set": {"status": "finishing", "payload_hash": digest}}
    )
    if not taken:
        latest = await db.runs.find_one({"_id": run["_id"]}) or run
        if latest.get("status") == "finished" and latest.get("payload_hash") == digest and latest.get("result"):
            return dict(latest["result"])
        raise HTTPException(409, "Bu koşu zaten kaydedildi")

    started = aware(run["started_at"]) or now()
    elapsed = (now() - started).total_seconds()
    reasons: list[str] = []
    if elapsed > anticheat.RUN_TTL_S:
        reasons.append("expired")
    report = anticheat.RunReport(
        score=payload["score"], coins=payload["coins"], distance=payload["distance"], duration_ms=payload["duration_ms"], revives=payload.get("revives", 0)
    )
    reasons += anticheat.check_run(report, elapsed)
    accepted = not reasons
    new_record = False
    if accepted:
        new_record = await record_score(db, doc, report.score, report.coins)
        stats = missions.clamp_stats(payload.get("stats"), report.distance)
        await apply_missions(db, player_id, missions.RunStats(distance=report.distance, coins=report.coins, **stats))
    else:
        await flag_player(db, doc, reasons)

    result = {"accepted": accepted, "flagged": not accepted, "reasons": reasons, "new_record": new_record}
    t = now()
    await db.runs.update_one(
        {"_id": run["_id"]},
        {
            "$set": {
                "status": "finished",
                "finished_at": t,
                "result": result,
                "score": report.score,
                "coins": report.coins,
                "distance": report.distance,
                "duration_ms": report.duration_ms,
                "revives": report.revives,
                "expire_at": t + timedelta(days=anticheat.FINISHED_RUN_KEEP_DAYS),
            }
        },
    )
    return result


async def legacy_submit(db, doc: dict, score: int, coins: int) -> None:
    """1.0.x run submission: capped, recorded, never raises for implausible values."""
    reasons = anticheat.check_legacy(score, coins)
    t = now()
    if reasons:
        await flag_player(db, doc, reasons)
    else:
        await record_score(db, doc, score, coins)
    await db.runs.insert_one(
        {
            "run_id": security.new_run_id(),
            "player_id": str(doc["_id"]),
            "status": "legacy",
            "score": score,
            "coins": coins,
            "result": {"accepted": not reasons, "reasons": reasons},
            "started_at": t,
            "finished_at": t,
            "expire_at": t + timedelta(days=30),
        }
    )


# ----------------------------------------------------------------- missions
async def get_missions(db, player_id: str) -> dict:
    day = today()
    doc = await db.missions.find_one({"player_id": player_id, "day": day})
    if doc:
        return doc
    level = missions.level_from_save(await get_save(db, player_id))
    fresh = {"player_id": player_id, "day": day, "level": level, "missions": missions.missions_for(player_id, day, level), "expire_at": now() + timedelta(days=3)}
    try:
        await db.missions.insert_one(fresh)
    except DuplicateKeyError:
        return await db.missions.find_one({"player_id": player_id, "day": day}) or fresh
    return fresh


async def apply_missions(db, player_id: str, stats: "missions.RunStats") -> None:
    doc = await get_missions(db, player_id)
    updated = missions.apply_run(doc.get("missions", []), stats)
    await db.missions.update_one({"player_id": player_id, "day": doc["day"]}, {"$set": {"missions": updated}})


async def claim_mission(db, player_id: str, mission_id: str) -> tuple[int, int, dict]:
    doc = await get_missions(db, player_id)
    items = doc.get("missions", [])
    target = next((m for m in items if m.get("id") == mission_id), None)
    if not target:
        raise HTTPException(404, "Görev bulunamadı")
    if target.get("claimed"):
        raise HTTPException(409, "Ödül zaten alındı")
    if int(target.get("progress", 0)) < int(target.get("target", 1)):
        raise HTTPException(400, "Görev henüz tamamlanmadı")
    try:
        await db.ledger.insert_one({"player_id": player_id, "kind": "mission", "key": f"{doc['day']}:{mission_id}", "at": now()})
    except DuplicateKeyError:
        raise HTTPException(409, "Ödül zaten alındı") from None
    for m in items:
        if m.get("id") == mission_id:
            m["claimed"] = True
    await db.missions.update_one({"player_id": player_id, "day": doc["day"]}, {"$set": {"missions": items}})
    return int(target.get("reward_keys", 0)), int(target.get("reward_coins", 0)), doc


# ----------------------------------------------------------------- welcome pack, saves
async def grant_once(db, player_id: str, kind: str, key: str) -> bool:
    try:
        await db.ledger.insert_one({"player_id": player_id, "kind": kind, "key": key, "at": now()})
        return True
    except DuplicateKeyError:
        return False


async def get_save(db, player_id: str) -> Optional[dict]:
    return await db.saves.find_one({"player_id": player_id})


async def put_save(db, player_id: str, rev: int, data: dict) -> tuple[bool, dict]:
    """Optimistic write: succeeds only if the client saw the latest revision."""
    current = await get_save(db, player_id)
    current_rev = int(current.get("rev", 0)) if current else 0
    if rev < current_rev:
        return False, current or {}
    new = {"player_id": player_id, "rev": current_rev + 1, "data": data, "updated_at": now()}
    res = await db.saves.update_one({"player_id": player_id, "rev": current_rev} if current else {"player_id": player_id}, {"$set": new}, upsert=not current)
    if current and res.modified_count != 1:
        latest = await get_save(db, player_id)
        return False, latest or {}
    return True, new


# ----------------------------------------------------------------- deletion
async def delete_player(db, doc: dict) -> None:
    """Delete the account and everything tied to it (Play account-deletion policy)."""
    pid = str(doc["_id"])
    await db.friendships.delete_many({"$or": [{"player_id": pid}, {"friend_id": pid}]})
    await db.credentials.delete_many({"player_id": pid})
    await db.runs.delete_many({"player_id": pid})
    await db.blocks.delete_many({"$or": [{"player_id": pid}, {"blocked_id": pid}]})
    await db.presence.delete_many({"player_id": pid})
    await db.transfer_codes.delete_many({"player_id": pid})
    await db.saves.delete_many({"player_id": pid})
    await db.missions.delete_many({"player_id": pid})
    await db.ledger.delete_many({"player_id": pid})
    await db.reports.delete_many({"$or": [{"target_id": pid}, {"reporter_id": pid}]})
    await db.players.delete_one({"_id": doc["_id"]})
