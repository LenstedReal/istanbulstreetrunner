"""1.0.x routes. Paths, methods and response fields are unchanged so the old app
keeps working. Differences: other players appear with their public id and
without their friend code, implausible runs are not counted, requests are rate
limited, and a claimed account needs its 2.0 token."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from . import moderation, security, services
from .deps import client_ip, get_db, legacy_owner, limit, optional_player
from .models import FriendAdd, FriendsOut, PlayerCreate, PlayerOut, PlayerUpdate, RunSubmit

router = APIRouter(prefix="/api")


def _nickname(raw: str) -> str:
    check = moderation.check_nickname(raw)
    if not check.ok:
        raise HTTPException(422, check.message)
    return check.value


@router.get("/")
async def root():
    return {"message": "Istanbul Kosusu API"}


@router.post("/players", response_model=PlayerOut)
async def create_player(body: PlayerCreate, request: Request):
    limit(request, "create_player", client_ip(request))
    doc = await services.create_player(get_db(request), _nickname(body.nickname), claimed=False)
    return services.legacy_out(doc, is_me=True, reveal=True)


@router.get("/players/{player_id}", response_model=PlayerOut)
async def get_player(player_id: str, request: Request):
    db = get_db(request)
    doc = await services.get_player_or_404(db, player_id)
    me = await optional_player(request)
    owner = bool(me) and me["_id"] == doc["_id"]
    return services.legacy_out(doc, is_me=True, reveal=owner)


@router.patch("/players/{player_id}", response_model=PlayerOut)
async def update_player(player_id: str, body: PlayerUpdate, request: Request):
    doc = await legacy_owner(request, player_id)
    limit(request, "nickname", player_id)
    await services.set_nickname(get_db(request), doc, _nickname(body.nickname))
    return services.legacy_out(doc, is_me=True, reveal=True)


@router.post("/players/{player_id}/runs", response_model=PlayerOut)
async def submit_run(player_id: str, body: RunSubmit, request: Request):
    doc = await legacy_owner(request, player_id)
    limit(request, "legacy_run", player_id)
    limit(request, "legacy_run_day", player_id)
    db = get_db(request)
    await services.legacy_submit(db, doc, body.score, body.coins)
    return services.legacy_out(await services.get_player_or_404(db, player_id), is_me=True, reveal=True)


@router.get("/players/{player_id}/friends", response_model=FriendsOut)
async def list_friends(player_id: str, request: Request):
    db = get_db(request)
    me = await legacy_owner(request, player_id)
    docs = await services.friend_docs(db, player_id)
    await services.ensure_public_ids(db, docs)
    friends = sorted((services.legacy_out(d, public=True) for d in docs), key=lambda p: p.high_score, reverse=True)
    me_row = services.legacy_out(me, is_me=True, reveal=True)
    board = sorted([*friends, me_row], key=lambda p: p.high_score, reverse=True)
    for i, p in enumerate(board):
        p.rank = i + 1
    return FriendsOut(me=services.legacy_out(me, is_me=True, reveal=True), friends=friends, board=board)


@router.post("/players/{player_id}/friends", response_model=PlayerOut)
async def add_friend(player_id: str, body: FriendAdd, request: Request):
    me = await legacy_owner(request, player_id)
    limit(request, "friend_add", player_id)
    friend = await services.add_friend(get_db(request), me, body.friend_code)
    return services.legacy_out(friend, public=True)


@router.delete("/players/{player_id}/friends/{friend_ref}")
async def remove_friend(player_id: str, friend_ref: str, request: Request):
    db = get_db(request)
    await legacy_owner(request, player_id)
    friend_id = friend_ref
    if security.is_public_id(friend_ref):
        friend = await services.find_by_public_id(db, friend_ref)
        friend_id = str(friend["_id"]) if friend else ""
    if not friend_id or not await services.remove_friend(db, player_id, friend_id):
        raise HTTPException(404, "Arkadaşlık bulunamadı")
    return {"ok": True}


@router.get("/leaderboard", response_model=List[PlayerOut])
async def leaderboard(request: Request, count: int = Query(50, alias="limit"), me: Optional[str] = None):
    db = get_db(request)
    n = max(1, min(count, 100))
    docs = await services.top_players(db, n)
    await services.ensure_public_ids(db, docs)
    return [services.legacy_out(d, public=True, rank=i + 1, is_me=(me is not None and str(d["_id"]) == me)) for i, d in enumerate(docs)]
