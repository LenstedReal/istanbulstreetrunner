"""Back up every collection of the game database to JSON Lines.

Run before deploying the 2.0 backend (from Termux or any computer):

    pip install pymongo
    export MONGO_URL='...'          # never paste it into chats or commit it
    export DB_NAME=istanbulstreetrunner
    python3 scripts/backup_mongo.py

Creates backup-YYYYmmdd-HHMMSS/ with one <collection>.jsonl per collection
(MongoDB Extended JSON, so ObjectIds and dates survive) and manifest.json
with record counts and SHA-256 checksums. The connection string is never
printed. Keep the folder private: it contains player data.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from bson import json_util
from pymongo import MongoClient


def main() -> int:
    url = os.environ.get("MONGO_URL")
    name = os.environ.get("DB_NAME", "istanbulstreetrunner")
    if not url:
        print("MONGO_URL ortam değişkeni gerekli.", file=sys.stderr)
        return 2
    client = MongoClient(url, serverSelectionTimeoutMS=15000)
    db = client[name]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out = Path(f"backup-{stamp}")
    out.mkdir()
    manifest = {"database": name, "created_at": stamp, "collections": {}}
    for coll in sorted(db.list_collection_names()):
        path = out / f"{coll}.jsonl"
        digest = hashlib.sha256()
        count = 0
        with path.open("w", encoding="utf-8") as fh:
            for doc in db[coll].find({}).sort("_id", 1):
                line = json_util.dumps(doc, json_options=json_util.CANONICAL_JSON_OPTIONS) + "\n"
                fh.write(line)
                digest.update(line.encode("utf-8"))
                count += 1
        manifest["collections"][coll] = {"count": count, "sha256": digest.hexdigest()}
        print(f"{coll}: {count} kayıt")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Yedek hazır: {out}/ (manifest.json içinde sayılar ve özetler var)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
