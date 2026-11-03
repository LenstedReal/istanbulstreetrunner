"""Restore a backup made by backup_mongo.py.

    python3 scripts/restore_mongo.py backup-YYYYmmdd-HHMMSS --into istanbulstreetrunner_restore

By default it restores into a NEW database name so nothing live is touched.
Writing into a database whose collections already hold documents requires
--force. Checksums from manifest.json are verified before anything is written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

from bson import json_util
from pymongo import MongoClient


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--into", required=True, help="target database name")
    ap.add_argument("--force", action="store_true", help="allow writing into non-empty collections")
    args = ap.parse_args()
    url = os.environ.get("MONGO_URL")
    if not url:
        print("MONGO_URL ortam değişkeni gerekli.", file=sys.stderr)
        return 2
    folder = Path(args.folder)
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    for coll, meta in manifest["collections"].items():
        data = (folder / f"{coll}.jsonl").read_bytes()
        if hashlib.sha256(data).hexdigest() != meta["sha256"]:
            print(f"{coll}: özet tutmuyor, geri yükleme durduruldu.", file=sys.stderr)
            return 3
    db = MongoClient(url, serverSelectionTimeoutMS=15000)[args.into]
    for coll in manifest["collections"]:
        if db[coll].estimated_document_count() and not args.force:
            print(f"{coll} boş değil; --force olmadan yazılmaz.", file=sys.stderr)
            return 4
    for coll in manifest["collections"]:
        docs = [json_util.loads(line) for line in (folder / f"{coll}.jsonl").read_text(encoding="utf-8").splitlines() if line]
        if docs:
            db[coll].insert_many(docs, ordered=False)
        print(f"{coll}: {len(docs)} kayıt yüklendi")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
