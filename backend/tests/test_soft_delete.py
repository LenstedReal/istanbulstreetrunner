"""Soft-delete tests for players (deleted_at)."""
import os
import pytest
import requests
from datetime import datetime, timezone
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
import asyncio

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_URL = "https://run-forever-31.preview.emergentagent.com".rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _soft_delete_player(pid: str):
    async def _run():
        client = AsyncIOMotorClient(MONGO_URL)
        try:
            await client[DB_NAME].players.update_one(
                {"_id": ObjectId(pid)},
                {"$set": {"deleted_at": datetime.now(timezone.utc)}},
            )
        finally:
            client.close()
    asyncio.run(_run())


class TestSoftDelete:
    def test_full_soft_delete_flow(self, api_client):
        # Create friend-target player (will be soft-deleted)
        r_target = api_client.post(f"{API}/players", json={"nickname": "TEST_SD_T"})
        assert r_target.status_code == 200
        target = r_target.json()
        # Give the target a score so it would appear on leaderboard
        api_client.post(f"{API}/players/{target['id']}/runs", json={"score": 7777, "coins": 11})

        # Create a befriender
        r_me = api_client.post(f"{API}/players", json={"nickname": "TEST_SD_M"})
        assert r_me.status_code == 200
        me = r_me.json()

        # Me befriends target BEFORE deletion
        r_add = api_client.post(f"{API}/players/{me['id']}/friends", json={"friend_code": target["friend_code"]})
        assert r_add.status_code == 200

        # Confirm target currently appears on leaderboard
        board = api_client.get(f"{API}/leaderboard", params={"limit": 100}).json()
        assert any(p["id"] == target["id"] for p in board), "target missing from leaderboard pre-delete"

        # Confirm target currently appears in friends list
        fl = api_client.get(f"{API}/players/{me['id']}/friends").json()
        assert any(f["id"] == target["id"] for f in fl["friends"])

        # Soft-delete target in Mongo
        _soft_delete_player(target["id"])

        # GET player -> 404
        g = api_client.get(f"{API}/players/{target['id']}")
        assert g.status_code == 404, g.text

        # Leaderboard excludes deleted player
        board2 = api_client.get(f"{API}/leaderboard", params={"limit": 100}).json()
        assert not any(p["id"] == target["id"] for p in board2), "deleted player still on leaderboard"

        # Add by friend_code -> 404 (deleted so lookup fails)
        r_add2 = api_client.post(
            f"{API}/players/{me['id']}/friends", json={"friend_code": target["friend_code"]}
        )
        assert r_add2.status_code == 404, r_add2.text

        # Friends list excludes deleted friend
        fl2 = api_client.get(f"{API}/players/{me['id']}/friends").json()
        assert not any(f["id"] == target["id"] for f in fl2["friends"])

        # Cleanup: soft-delete 'me' as well so leaderboard stays clean
        _soft_delete_player(me["id"])
