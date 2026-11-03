"""2.0 data migration. Additive only: no existing field is changed or removed.

    python3 scripts/migrate_v2.py              # dry run: only counts
    python3 scripts/migrate_v2.py --apply      # give every player a public_id
    python3 scripts/migrate_v2.py --rollback --yes

The 2.0 API also assigns public ids lazily, so --apply is optional. --rollback
removes only what 2.0 added (fields on players and the new collections). Run it
only if you go back to the 1.0 backend; 2.0 installs would lose their sign-in
tokens and claim their accounts again.
"""
from __future__ import annotations

import argparse
import base64
import os
import secrets
import sys

from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError

ADDED_PLAYER_FIELDS = ["public_id", "schema_version", "claimed_at", "best_at", "flags", "last_flag", "hidden", "hidden_at"]
NEW_COLLECTIONS = ["credentials", "runs", "ledger", "blocks", "reports", "transfer_codes", "presence", "saves", "missions", "audit"]


def new_public_id() -> str:
    return base64.b32encode(secrets.token_bytes(10)).decode("ascii").lower()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--rollback", action="store_true")
    ap.add_argument("--yes", action="store_true")
    args = ap.parse_args()
    url = os.environ.get("MONGO_URL")
    if not url:
        print("MONGO_URL ortam değişkeni gerekli.", file=sys.stderr)
        return 2
    db = MongoClient(url, serverSelectionTimeoutMS=15000)[os.environ.get("DB_NAME", "istanbulstreetrunner")]

    missing = db.players.count_documents({"public_id": {"$exists": False}})
    total = db.players.count_documents({})
    print(f"Oyuncu: {total}, public_id olmayan: {missing}")

    if args.rollback:
        if not args.yes:
            print("Geri alma için --yes ekle. Önce yedek al.", file=sys.stderr)
            return 3
        res = db.players.update_many({}, {"$unset": {f: "" for f in ADDED_PLAYER_FIELDS}})
        print(f"Oyunculardan 2.0 alanları kaldırıldı: {res.modified_count}")
        for name in NEW_COLLECTIONS:
            if name in db.list_collection_names():
                db.drop_collection(name)
                print(f"Koleksiyon silindi: {name}")
        if "public_id_1" in db.players.index_information():
            db.players.drop_index("public_id_1")
        return 0

    if not args.apply:
        print("Kuru çalıştırma: hiçbir şey yazılmadı. Uygulamak için --apply.")
        return 0

    db.players.create_index("public_id", unique=True, sparse=True)
    done = 0
    for doc in db.players.find({"public_id": {"$exists": False}}, {"_id": 1}):
        for _ in range(5):
            try:
                res = db.players.update_one({"_id": doc["_id"], "public_id": {"$exists": False}}, {"$set": {"public_id": new_public_id()}})
                done += res.modified_count
                break
            except DuplicateKeyError:
                continue
    print(f"public_id verilen oyuncu: {done}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
