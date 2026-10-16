from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
import secrets
from pathlib import Path
from typing import Annotated, Any, List, Optional
from datetime import datetime, timezone

from pydantic import BaseModel, BeforeValidator, Field, ConfigDict


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Istanbul Kosusu API")


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
def _to_str(v: Any) -> Any:
    return str(v) if isinstance(v, ObjectId) else v


PyObjectId = Annotated[str, BeforeValidator(_to_str)]


def now() -> datetime:
    return datetime.now(timezone.utc)


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[PyObjectId] = Field(default=None, alias="_id")

    def to_mongo(self) -> dict:
        data = self.model_dump(by_alias=True, exclude_none=True)
        data.pop("_id", None)
        return data

    @classmethod
    def from_mongo(cls, doc: dict):
        return cls.model_validate(doc)


class Player(BaseDocument):
    nickname: str
    friend_code: str
    high_score: int = 0
    total_coins: int = 0
    runs: int = 0
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    deleted_at: Optional[datetime] = None


ACTIVE = {"deleted_at": None}


class Friendship(BaseDocument):
    player_id: str
    friend_id: str
    created_at: datetime = Field(default_factory=now)
    deleted_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# API models
# ---------------------------------------------------------------------------
class PlayerCreate(BaseModel):
    nickname: str = Field(min_length=2, max_length=16)


class PlayerUpdate(BaseModel):
    nickname: str = Field(min_length=2, max_length=16)


class RunSubmit(BaseModel):
    score: int = Field(ge=0, le=100_000_000)
    coins: int = Field(ge=0, le=1_000_000)


class FriendAdd(BaseModel):
    friend_code: str = Field(min_length=4, max_length=12)


class PlayerOut(BaseModel):
    id: str
    nickname: str
    friend_code: str
    high_score: int
    total_coins: int
    runs: int
    rank: Optional[int] = None
    is_me: bool = False


class FriendsOut(BaseModel):
    me: PlayerOut
    friends: List[PlayerOut]
    board: List[PlayerOut]


def player_out(p: Player, rank: Optional[int] = None, is_me: bool = False) -> PlayerOut:
    return PlayerOut(
        id=p.id or "",
        nickname=p.nickname,
        friend_code=p.friend_code,
        high_score=p.high_score,
        total_coins=p.total_coins,
        runs=p.runs,
        rank=rank,
        is_me=is_me,
    )


CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


async def unique_friend_code() -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not await db.players.find_one({"friend_code": code, **ACTIVE}, {"_id": 1}):
            return code
    raise HTTPException(500, "Arkadaş kodu üretilemedi")


async def get_player_or_404(player_id: str) -> Player:
    if not ObjectId.is_valid(player_id):
        raise HTTPException(404, "Oyuncu bulunamadı")
    doc = await db.players.find_one({"_id": ObjectId(player_id), **ACTIVE})
    if not doc:
        raise HTTPException(404, "Oyuncu bulunamadı")
    return Player.from_mongo(doc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Istanbul Kosusu API"}


@api_router.post("/players", response_model=PlayerOut)
async def create_player(body: PlayerCreate):
    player = Player(nickname=body.nickname.strip(), friend_code=await unique_friend_code())
    result = await db.players.insert_one(player.to_mongo())
    player.id = str(result.inserted_id)
    return player_out(player, is_me=True)


@api_router.get("/players/{player_id}", response_model=PlayerOut)
async def get_player(player_id: str):
    return player_out(await get_player_or_404(player_id), is_me=True)


@api_router.patch("/players/{player_id}", response_model=PlayerOut)
async def update_player(player_id: str, body: PlayerUpdate):
    player = await get_player_or_404(player_id)
    await db.players.update_one(
        {"_id": ObjectId(player_id)},
        {"$set": {"nickname": body.nickname.strip(), "updated_at": now()}},
    )
    player.nickname = body.nickname.strip()
    return player_out(player, is_me=True)


@api_router.post("/players/{player_id}/runs", response_model=PlayerOut)
async def submit_run(player_id: str, body: RunSubmit):
    player = await get_player_or_404(player_id)
    await db.players.update_one(
        {"_id": ObjectId(player_id)},
        {
            "$max": {"high_score": body.score},
            "$inc": {"total_coins": body.coins, "runs": 1},
            "$set": {"updated_at": now()},
        },
    )
    return player_out(await get_player_or_404(player.id), is_me=True)


@api_router.get("/players/{player_id}/friends", response_model=FriendsOut)
async def list_friends(player_id: str):
    me = await get_player_or_404(player_id)
    links = await db.friendships.find({"player_id": player_id, "deleted_at": None}).to_list(500)
    friend_ids = [ObjectId(l["friend_id"]) for l in links if ObjectId.is_valid(l["friend_id"])]
    docs = await db.players.find({"_id": {"$in": friend_ids}, **ACTIVE}).to_list(500)
    friends = [player_out(Player.from_mongo(d)) for d in docs]
    friends.sort(key=lambda p: p.high_score, reverse=True)
    board = sorted([*friends, player_out(me, is_me=True)], key=lambda p: p.high_score, reverse=True)
    for i, p in enumerate(board):
        p.rank = i + 1
    return FriendsOut(me=player_out(me, is_me=True), friends=friends, board=board)


@api_router.post("/players/{player_id}/friends", response_model=PlayerOut)
async def add_friend(player_id: str, body: FriendAdd):
    me = await get_player_or_404(player_id)
    code = body.friend_code.strip().upper()
    doc = await db.players.find_one({"friend_code": code, **ACTIVE})
    if not doc:
        raise HTTPException(404, "Bu kodla bir oyuncu bulunamadı")
    friend = Player.from_mongo(doc)
    if friend.id == me.id:
        raise HTTPException(400, "Kendini ekleyemezsin")
    existing = await db.friendships.find_one({"player_id": me.id, "friend_id": friend.id})
    if existing and existing.get("deleted_at") is None:
        raise HTTPException(409, "Bu oyuncu zaten arkadaşın")
    for a, b in ((me.id, friend.id), (friend.id, me.id)):
        await db.friendships.update_one(
            {"player_id": a, "friend_id": b},
            {"$set": {"deleted_at": None}, "$setOnInsert": Friendship(player_id=a, friend_id=b).to_mongo()},
            upsert=True,
        )
    return player_out(friend)


@api_router.delete("/players/{player_id}/friends/{friend_id}")
async def remove_friend(player_id: str, friend_id: str):
    await get_player_or_404(player_id)
    result = await db.friendships.update_many(
        {
            "$or": [
                {"player_id": player_id, "friend_id": friend_id},
                {"player_id": friend_id, "friend_id": player_id},
            ],
            "deleted_at": None,
        },
        {"$set": {"deleted_at": now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Arkadaşlık bulunamadı")
    return {"ok": True}


@api_router.get("/leaderboard", response_model=List[PlayerOut])
async def leaderboard(limit: int = 50, me: Optional[str] = None):
    limit = max(1, min(limit, 100))
    docs = await db.players.find({"high_score": {"$gt": 0}, **ACTIVE}).sort("high_score", -1).limit(limit).to_list(limit)
    out = []
    for i, d in enumerate(docs):
        p = Player.from_mongo(d)
        out.append(player_out(p, rank=i + 1, is_me=(p.id == me)))
    return out


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def ensure_indexes():
    await db.players.create_index("friend_code", unique=True)
    await db.players.create_index([("high_score", -1)])
    await db.friendships.create_index([("player_id", 1), ("friend_id", 1)], unique=True)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
