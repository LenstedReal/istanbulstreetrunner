"""Request and response models.

The legacy models keep the exact field names of the 1.0.x API so that the old
app keeps working. v2 models never expose another player's ObjectId or friend
code: other players are identified by `public_id`.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------- legacy (1.0.x)
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
    friends: list[PlayerOut]
    board: list[PlayerOut]


# ------------------------------------------------------------------------ v2
class NicknameIn(BaseModel):
    nickname: str = Field(min_length=1, max_length=40)


class ClaimIn(BaseModel):
    player_id: str = Field(min_length=1, max_length=40)
    friend_code: str = Field(min_length=4, max_length=12)


class TransferIn(BaseModel):
    code: str = Field(min_length=4, max_length=32)


class PublicPlayer(BaseModel):
    public_id: str
    nickname: str
    high_score: int
    total_coins: int
    runs: int
    rank: Optional[int] = None
    is_me: bool = False
    online: Optional[bool] = None


class MeOut(BaseModel):
    id: str
    public_id: str
    nickname: str
    friend_code: str
    high_score: int
    total_coins: int
    runs: int
    rank: Optional[int] = None
    hidden: bool = False
    created_at: Optional[datetime] = None


class AuthOut(BaseModel):
    token: str
    player: MeOut


class FriendsOutV2(BaseModel):
    me: PublicPlayer
    friends: list[PublicPlayer]
    board: list[PublicPlayer]


class LeaderboardOut(BaseModel):
    top: list[PublicPlayer]
    me: Optional[PublicPlayer] = None


class RunStartIn(BaseModel):
    client_version: Optional[str] = Field(default=None, max_length=24)
    district: Optional[str] = Field(default=None, max_length=24)


class RunStartOut(BaseModel):
    run_id: str
    seed: int
    started_at: datetime


class RunFinishIn(BaseModel):
    score: int = Field(ge=0, le=10_000_000)
    coins: int = Field(ge=0, le=1_000_000)
    distance: int = Field(ge=0, le=10_000_000)
    duration_ms: int = Field(ge=0, le=6 * 3600 * 1000)
    revives: int = Field(default=0, ge=0, le=50)
    district: Optional[str] = Field(default=None, max_length=24)
    stats: Optional[dict[str, int]] = None

    @field_validator("stats")
    @classmethod
    def _small_stats(cls, v: Optional[dict[str, int]]) -> Optional[dict[str, int]]:
        if v is not None and len(v) > 16:
            raise ValueError("too many stats")
        return v


class RunFinishOut(BaseModel):
    accepted: bool
    flagged: bool
    reasons: list[str]
    new_record: bool
    player: MeOut


class ReportIn(BaseModel):
    public_id: str = Field(min_length=4, max_length=32)
    reason: Literal["nickname", "cheating", "other"]
    note: Optional[str] = Field(default=None, max_length=200)


class TransferCodeOut(BaseModel):
    code: str
    expires_at: datetime


class WelcomeIn(BaseModel):
    local_granted: bool = False


class GrantOut(BaseModel):
    granted: bool
    keys: int
    already: bool


class SaveIn(BaseModel):
    rev: int = Field(ge=0)
    data: dict

    @field_validator("data")
    @classmethod
    def _small(cls, v: dict) -> dict:
        if len(json.dumps(v, separators=(",", ":"))) > 8192:
            raise ValueError("save too large")
        return v


class SaveOut(BaseModel):
    rev: int
    data: dict
    updated_at: Optional[datetime] = None


class MissionOut(BaseModel):
    id: str
    kind: str
    target: int
    progress: int
    reward_keys: int
    reward_coins: int
    claimed: bool


class MissionsOut(BaseModel):
    day: str
    missions: list[MissionOut]


class MissionClaimOut(BaseModel):
    reward_keys: int
    reward_coins: int
    missions: MissionsOut


class HeartbeatOut(BaseModel):
    online: int


class MetaOut(BaseModel):
    api: int
    features: dict[str, bool]
