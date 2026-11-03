"""Small admin tasks for moderation and deletion requests that arrive by e-mail.

    python3 scripts/admin_tools.py stats
    python3 scripts/admin_tools.py reports                      # open nickname/cheating reports
    python3 scripts/admin_tools.py rename  --code K7F2PX --nickname "Koşucu 123"
    python3 scripts/admin_tools.py unhide  --code K7F2PX
    python3 scripts/admin_tools.py resolve --report <report id>
    python3 scripts/admin_tools.py delete  --code K7F2PX --yes  # same cascade as in-app deletion

Players are found by their friend code, which they can read in the app.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

from bson import ObjectId
from pymongo import MongoClient


def db_handle():
    url = os.environ.get("MONGO_URL")
    if not url:
        print("MONGO_URL ortam değişkeni gerekli.", file=sys.stderr)
        raise SystemExit(2)
    return MongoClient(url, serverSelectionTimeoutMS=15000)[os.environ.get("DB_NAME", "istanbulstreetrunner")]


def find(db, code: str):
    doc = db.players.find_one({"friend_code": code.strip().upper(), "deleted_at": None})
    if not doc:
        print("Bu arkadaş koduyla oyuncu bulunamadı.", file=sys.stderr)
        raise SystemExit(3)
    return doc


def delete_cascade(db, doc) -> None:
    pid = str(doc["_id"])
    db.friendships.delete_many({"$or": [{"player_id": pid}, {"friend_id": pid}]})
    for coll in ("credentials", "runs", "presence", "transfer_codes", "saves", "missions", "ledger"):
        db[coll].delete_many({"player_id": pid})
    db.blocks.delete_many({"$or": [{"player_id": pid}, {"blocked_id": pid}]})
    db.reports.delete_many({"$or": [{"target_id": pid}, {"reporter_id": pid}]})
    db.players.delete_one({"_id": doc["_id"]})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["stats", "reports", "rename", "unhide", "resolve", "delete"])
    ap.add_argument("--code")
    ap.add_argument("--nickname")
    ap.add_argument("--report")
    ap.add_argument("--yes", action="store_true")
    a = ap.parse_args()
    db = db_handle()

    if a.command == "stats":
        print("oyuncu:", db.players.count_documents({"deleted_at": None}))
        print("gizlenen:", db.players.count_documents({"hidden": True}))
        print("açık şikâyet:", db.reports.count_documents({"status": "open"}))
    elif a.command == "reports":
        for r in db.reports.find({"status": "open"}).sort("created_at", -1).limit(100):
            target = db.players.find_one({"_id": ObjectId(r["target_id"])}) if ObjectId.is_valid(r["target_id"]) else None
            code = target["friend_code"] if target else "-"
            print(f"{r['_id']}  {r['reason']:<9} {r.get('target_nickname', '')!r:<20} kod={code}  {r.get('note', '')}")
    elif a.command == "rename":
        doc = find(db, a.code or "")
        if not a.nickname:
            print("--nickname gerekli", file=sys.stderr)
            return 2
        db.players.update_one({"_id": doc["_id"]}, {"$set": {"nickname": a.nickname, "updated_at": datetime.now(timezone.utc)}})
        print("Takma ad değişti.")
    elif a.command == "unhide":
        doc = find(db, a.code or "")
        db.players.update_one({"_id": doc["_id"]}, {"$set": {"hidden": False, "flags": 0}})
        print("Oyuncu sıralamaya geri döndü.")
    elif a.command == "resolve":
        db.reports.update_one({"_id": ObjectId(a.report)}, {"$set": {"status": "closed"}})
        print("Şikâyet kapatıldı.")
    elif a.command == "delete":
        doc = find(db, a.code or "")
        if not a.yes:
            print(f"{doc['nickname']!r} silinecek. Onaylamak için --yes ekle.")
            return 1
        delete_cascade(db, doc)
        print("Hesap ve bağlı tüm veriler silindi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
