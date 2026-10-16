"""Soft-deletes every player & friendship created during development/testing so the
app ships with a clean leaderboard. Run: python3 scripts/cleanup_test_data.py
Pass --all to flag everyone, or no args to flag only TEST_/Test prefixed accounts.
"""
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
now = datetime.now(timezone.utc)

if "--all" in sys.argv:
    query = {"deleted_at": None}
else:
    query = {"deleted_at": None, "nickname": {"$regex": "^(TEST_|Test|test)"}}

ids = [str(p["_id"]) for p in db.players.find(query, {"_id": 1})]
r1 = db.players.update_many(query, {"$set": {"deleted_at": now}})
r2 = db.friendships.update_many(
    {"deleted_at": None, "$or": [{"player_id": {"$in": ids}}, {"friend_id": {"$in": ids}}]} if ids else {"_id": None},
    {"$set": {"deleted_at": now}},
)
db.status_checks.delete_many({})  # template leftovers, never user data
print(f"players soft-deleted: {r1.modified_count}, friendships: {r2.modified_count}")
