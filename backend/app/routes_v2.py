"""2.0 routes. Every player-scoped route acts on the token's owner, never on an id
from the path. Other players are identified only by their public id."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from . import moderation, revenuecat, security, services
from .deps import client_ip, get_db, limit, optional_player, require_player
from .models import (
    AuthOut,
    ClaimIn,
    FriendAdd,
    FriendsOutV2,
    GrantOut,
    HeartbeatOut,
    LeaderboardOut,
    MeOut,
    MetaOut,
    MissionClaimOut,
    MissionOut,
    MissionsOut,
    NicknameIn,
    PublicPlayer,
    ReportIn,
    RunFinishIn,
    RunFinishOut,
    RunStartIn,
    RunStartOut,
    SaveIn,
    SaveOut,
    TransferCodeOut,
    TransferIn,
    WelcomeIn,
)

router = APIRouter(prefix="/api/v2")
WELCOME_KEYS = 50


def _nickname(raw: str) -> str:
    check = moderation.check_nickname(raw)
    if not check.ok:
        raise HTTPException(422, check.message)
    return check.value


def _presence(request: Request) -> bool:
    return bool(request.app.state.settings.presence_enabled)


def _missions_out(doc: dict) -> MissionsOut:
    return MissionsOut(day=doc["day"], missions=[MissionOut(**{k: m[k] for k in MissionOut.model_fields}) for m in doc.get("missions", [])])


# ----------------------------------------------------------------- meta & auth
@router.get("/meta", response_model=MetaOut)
async def meta(request: Request):
    return MetaOut(api=2, features={"presence": _presence(request), "missions": True, "save": True, "transfer": True, "reports": True})


@router.post("/players", response_model=AuthOut)
async def create_player(body: NicknameIn, request: Request):
    limit(request, "create_player", client_ip(request))
    db = get_db(request)
    doc = await services.create_player(db, _nickname(body.nickname), claimed=True)
    token = await services.issue_token(db, str(doc["_id"]), "create")
    return AuthOut(token=token, player=services.me_out(doc))


@router.post("/auth/claim", response_model=AuthOut)
async def claim(body: ClaimIn, request: Request):
    ip = client_ip(request)
    limit(request, "claim", ip)
    db = get_db(request)
    doc = await services.claim(db, body.player_id.strip(), body.friend_code)
    token = await services.issue_token(db, str(doc["_id"]), "claim")
    await services.audit(db, "claim", player_id=str(doc["_id"]), ip_hash=security.hash_secret(ip)[:16])
    return AuthOut(token=token, player=services.me_out(doc, rank=await services.rank_of(db, doc)))


@router.post("/auth/transfer", response_model=AuthOut)
async def transfer(body: TransferIn, request: Request):
    ip = client_ip(request)
    limit(request, "transfer", ip)
    db = get_db(request)
    doc = await services.redeem_transfer_code(db, body.code)
    await services.ensure_public_id(db, doc)
    token = await services.issue_token(db, str(doc["_id"]), "transfer")
    await services.audit(db, "transfer", player_id=str(doc["_id"]), ip_hash=security.hash_secret(ip)[:16])
    return AuthOut(token=token, player=services.me_out(doc, rank=await services.rank_of(db, doc)))


# ----------------------------------------------------------------- me
@router.get("/me", response_model=MeOut)
async def me(request: Request):
    doc = await require_player(request)
    return services.me_out(doc, rank=await services.rank_of(get_db(request), doc))


@router.patch("/me", response_model=MeOut)
async def rename(body: NicknameIn, request: Request):
    doc = await require_player(request)
    limit(request, "nickname", str(doc["_id"]))
    db = get_db(request)
    await services.set_nickname(db, doc, _nickname(body.nickname))
    return services.me_out(doc, rank=await services.rank_of(db, doc))


@router.delete("/me")
async def delete_me(request: Request):
    doc = await require_player(request)
    db = get_db(request)
    await services.delete_player(db, doc)
    await services.audit(db, "delete", player=security.anonymize(str(doc["_id"])))
    return {"ok": True}


@router.post("/me/transfer-code", response_model=TransferCodeOut)
async def transfer_code(request: Request):
    doc = await require_player(request)
    pid = str(doc["_id"])
    limit(request, "transfer_code", pid)
    code, expires = await services.create_transfer_code(get_db(request), pid)
    return TransferCodeOut(code=code, expires_at=expires)


# ----------------------------------------------------------------- runs
@router.post("/runs", response_model=RunStartOut)
async def run_start(body: RunStartIn, request: Request):
    doc = await require_player(request)
    pid = str(doc["_id"])
    limit(request, "run_start", pid)
    run = await services.start_run(get_db(request), pid, body.client_version, body.district)
    return RunStartOut(run_id=run["run_id"], seed=run["seed"], started_at=run["started_at"])


@router.post("/runs/{run_id}/finish", response_model=RunFinishOut)
async def run_finish(run_id: str, body: RunFinishIn, request: Request):
    doc = await require_player(request)
    pid = str(doc["_id"])
    limit(request, "run_finish", pid)
    db = get_db(request)
    result = await services.finish_run(db, doc, run_id, body.model_dump())
    fresh = await services.find_player(db, pid) or doc
    return RunFinishOut(**result, player=services.me_out(fresh, rank=await services.rank_of(db, fresh)))


# ----------------------------------------------------------------- social
@router.get("/me/friends", response_model=FriendsOutV2)
async def friends(request: Request):
    doc = await require_player(request)
    db = get_db(request)
    pid = str(doc["_id"])
    docs = await services.friend_docs(db, pid)
    await services.ensure_public_ids(db, docs)
    presence = _presence(request)
    online = await services.online_among(db, [str(d["_id"]) for d in docs]) if presence else set()
    rows = [services.public_out(d, online=(str(d["_id"]) in online) if presence else None) for d in docs]
    me_row = services.public_out(doc, is_me=True, online=True if presence else None)
    board = sorted([*rows, me_row], key=lambda p: p.high_score, reverse=True)
    for i, p in enumerate(board):
        p.rank = i + 1
    return FriendsOutV2(me=me_row, friends=sorted(rows, key=lambda p: p.high_score, reverse=True), board=board)


@router.post("/me/friends", response_model=PublicPlayer)
async def add_friend(body: FriendAdd, request: Request):
    doc = await require_player(request)
    limit(request, "friend_add", str(doc["_id"]))
    friend = await services.add_friend(get_db(request), doc, body.friend_code)
    return services.public_out(friend)


@router.delete("/me/friends/{public_id}")
async def remove_friend(public_id: str, request: Request):
    doc = await require_player(request)
    db = get_db(request)
    friend = await services.find_by_public_id(db, public_id)
    if not friend or not await services.remove_friend(db, str(doc["_id"]), str(friend["_id"])):
        raise HTTPException(404, "Arkadaşlık bulunamadı")
    return {"ok": True}


@router.get("/me/blocks", response_model=list[PublicPlayer])
async def blocks(request: Request):
    doc = await require_player(request)
    db = get_db(request)
    docs = await services.blocked_list(db, str(doc["_id"]))
    await services.ensure_public_ids(db, docs)
    return [services.public_out(d) for d in docs]


@router.post("/me/blocks/{public_id}")
async def block(public_id: str, request: Request):
    doc = await require_player(request)
    limit(request, "block", str(doc["_id"]))
    db = get_db(request)
    other = await services.find_by_public_id(db, public_id)
    if not other:
        raise HTTPException(404, "Oyuncu bulunamadı")
    if other["_id"] == doc["_id"]:
        raise HTTPException(400, "Kendini engelleyemezsin")
    await services.block(db, str(doc["_id"]), str(other["_id"]))
    return {"ok": True}


@router.delete("/me/blocks/{public_id}")
async def unblock(public_id: str, request: Request):
    doc = await require_player(request)
    db = get_db(request)
    other = await services.find_by_public_id(db, public_id)
    if other:
        await services.unblock(db, str(doc["_id"]), str(other["_id"]))
    return {"ok": True}


@router.post("/reports")
async def report(body: ReportIn, request: Request):
    doc = await require_player(request)
    pid = str(doc["_id"])
    limit(request, "report", pid)
    db = get_db(request)
    target = await services.find_by_public_id(db, body.public_id)
    if not target:
        raise HTTPException(404, "Oyuncu bulunamadı")
    if target["_id"] == doc["_id"]:
        raise HTTPException(400, "Kendini şikâyet edemezsin")
    await db.reports.insert_one(
        {
            "reporter_id": pid,
            "target_id": str(target["_id"]),
            "target_nickname": target.get("nickname", ""),
            "reason": body.reason,
            "note": (body.note or "").strip()[:200],
            "created_at": services.now(),
            "status": "open",
        }
    )
    return {"ok": True}


@router.get("/leaderboard", response_model=LeaderboardOut)
async def leaderboard(request: Request, count: int = Query(50, alias="limit")):
    db = get_db(request)
    me_doc = await optional_player(request)
    docs = await services.top_players(db, max(1, min(count, 100)))
    await services.ensure_public_ids(db, docs)
    top = [services.public_out(d, rank=i + 1, is_me=bool(me_doc) and d["_id"] == me_doc["_id"]) for i, d in enumerate(docs)]
    me_row = None
    if me_doc:
        await services.ensure_public_id(db, me_doc)
        me_row = services.public_out(me_doc, rank=await services.rank_of(db, me_doc), is_me=True)
    return LeaderboardOut(top=top, me=me_row)


# ----------------------------------------------------------------- presence
@router.post("/me/heartbeat", response_model=HeartbeatOut)
async def heartbeat(request: Request):
    doc = await require_player(request)
    if not _presence(request):
        return HeartbeatOut(online=0)
    limit(request, "heartbeat", str(doc["_id"]))
    db = get_db(request)
    await services.touch_presence(db, str(doc["_id"]))
    return HeartbeatOut(online=await services.online_count(db))


@router.delete("/me/heartbeat")
async def leave(request: Request):
    doc = await require_player(request)
    await get_db(request).presence.delete_many({"player_id": str(doc["_id"])})
    return {"ok": True}


@router.get("/online", response_model=HeartbeatOut)
async def online(request: Request):
    if not _presence(request):
        return HeartbeatOut(online=0)
    return HeartbeatOut(online=await services.online_count(get_db(request)))


# ----------------------------------------------------------------- rewards & saves
@router.post("/me/grants/welcome", response_model=GrantOut)
async def welcome(body: WelcomeIn, request: Request):
    doc = await require_player(request)
    pid = str(doc["_id"])
    secret = request.app.state.settings.revenuecat_secret
    if secret:
        try:
            active = await revenuecat.has_premium(secret, pid)
        except revenuecat.RevenueCatUnavailable:
            raise HTTPException(503, "Abonelik şu an doğrulanamadı, biraz sonra tekrar dene") from None
        if not active:
            raise HTTPException(403, "Aktif abonelik bulunamadı")
    if not await services.grant_once(get_db(request), pid, "welcome", "subscription"):
        return GrantOut(granted=False, keys=0, already=True)
    give = not body.local_granted
    return GrantOut(granted=give, keys=WELCOME_KEYS if give else 0, already=False)


@router.get("/me/missions", response_model=MissionsOut)
async def get_missions(request: Request):
    doc = await require_player(request)
    return _missions_out(await services.get_missions(get_db(request), str(doc["_id"])))


@router.post("/me/missions/{mission_id}/claim", response_model=MissionClaimOut)
async def claim_mission(mission_id: str, request: Request):
    doc = await require_player(request)
    pid = str(doc["_id"])
    limit(request, "mission_claim", pid)
    db = get_db(request)
    keys, coins, _ = await services.claim_mission(db, pid, mission_id)
    return MissionClaimOut(reward_keys=keys, reward_coins=coins, missions=_missions_out(await services.get_missions(db, pid)))


@router.get("/me/save", response_model=SaveOut)
async def get_save(request: Request):
    doc = await require_player(request)
    save = await services.get_save(get_db(request), str(doc["_id"]))
    if not save:
        return SaveOut(rev=0, data={})
    return SaveOut(rev=int(save.get("rev", 0)), data=save.get("data") or {}, updated_at=services.aware(save.get("updated_at")))


@router.put("/me/save", response_model=SaveOut)
async def put_save(body: SaveIn, request: Request):
    doc = await require_player(request)
    pid = str(doc["_id"])
    limit(request, "save", pid)
    ok, save = await services.put_save(get_db(request), pid, body.rev, body.data)
    if not ok:
        raise HTTPException(409, "Kayıt başka bir cihazda güncellendi")
    return SaveOut(rev=int(save["rev"]), data=save.get("data") or {}, updated_at=services.aware(save.get("updated_at")))
