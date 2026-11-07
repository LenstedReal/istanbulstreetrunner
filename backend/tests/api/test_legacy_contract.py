"""The 1.0.x app must keep working against the 2.0 server."""
import re

from bson import ObjectId

from .conftest import auth

LEGACY_FIELDS = {"id", "nickname", "friend_code", "high_score", "total_coins", "runs", "rank", "is_me"}


def create(client, nick):
    r = client.post("/api/players", json={"nickname": nick})
    assert r.status_code == 200, r.text
    return r.json()


def test_health_and_root(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.head("/health").status_code == 200
    assert client.get("/ready").status_code == 200
    assert "message" in client.get("/api/").json()


def test_create_player_shape(client):
    p = create(client, "Koşucu1234")
    assert set(p) == LEGACY_FIELDS
    assert re.fullmatch(r"[0-9a-f]{24}", p["id"])
    assert len(p["friend_code"]) == 6 and p["is_me"] is True
    assert p["high_score"] == 0 and p["runs"] == 0 and p["total_coins"] == 0


def test_create_validation(client):
    assert client.post("/api/players", json={"nickname": "A"}).status_code == 422
    r = client.post("/api/players", json={"nickname": "Admin"})
    assert r.status_code == 422 and isinstance(r.json()["detail"], str)


def test_get_player_hides_friend_code_without_token(client):
    p = create(client, "Gizli Kod")
    g = client.get(f"/api/players/{p['id']}")
    assert g.status_code == 200 and g.json()["id"] == p["id"] and g.json()["friend_code"] == ""
    assert client.get("/api/players/000000000000000000000000").status_code == 404
    assert client.get("/api/players/not-an-id").status_code == 404


def test_update_nickname(client):
    p = create(client, "Eski Ad")
    r = client.patch(f"/api/players/{p['id']}", json={"nickname": "Yeni Ad"})
    assert r.status_code == 200 and r.json()["nickname"] == "Yeni Ad"


def test_runs_accumulate_and_keep_max(client):
    p = create(client, "Rekorcu")
    d1 = client.post(f"/api/players/{p['id']}/runs", json={"score": 1200, "coins": 15}).json()
    assert (d1["high_score"], d1["total_coins"], d1["runs"]) == (1200, 15, 1)
    d2 = client.post(f"/api/players/{p['id']}/runs", json={"score": 500, "coins": 10}).json()
    assert (d2["high_score"], d2["total_coins"], d2["runs"]) == (1200, 25, 2)


def test_implausible_legacy_run_is_not_counted(client):
    p = create(client, "Hileci")
    r = client.post(f"/api/players/{p['id']}/runs", json={"score": 99_000_000, "coins": 1})
    assert r.status_code == 200 and r.json()["high_score"] == 0 and r.json()["runs"] == 0


def test_friends_flow_uses_public_ids(client):
    a, b = create(client, "Ayşe"), create(client, "Burak")
    assert client.post(f"/api/players/{a['id']}/friends", json={"friend_code": a["friend_code"]}).status_code == 400
    assert client.post(f"/api/players/{a['id']}/friends", json={"friend_code": "ZZZZZZ"}).status_code == 404
    added = client.post(f"/api/players/{a['id']}/friends", json={"friend_code": b["friend_code"].lower()})
    assert added.status_code == 200, added.text
    friend = added.json()
    assert friend["nickname"] == "Burak" and friend["friend_code"] == "" and friend["id"] != b["id"]
    assert client.post(f"/api/players/{a['id']}/friends", json={"friend_code": b["friend_code"]}).status_code == 409

    board = client.get(f"/api/players/{a['id']}/friends").json()
    assert len(board["friends"]) == 1 and len(board["board"]) == 2
    me_row = next(r for r in board["board"] if r["is_me"])
    assert me_row["id"] == a["id"] and me_row["friend_code"] == a["friend_code"]
    friend_row = next(r for r in board["board"] if not r["is_me"])
    assert friend_row["id"] == friend["id"] and friend_row["friend_code"] == ""
    # mutual friendship
    assert len(client.get(f"/api/players/{b['id']}/friends").json()["friends"]) == 1

    assert client.delete(f"/api/players/{a['id']}/friends/{friend_row['id']}").json() == {"ok": True}
    assert client.delete(f"/api/players/{a['id']}/friends/{friend_row['id']}").status_code == 404
    # re-add, then remove with the private id an old install may still hold
    assert client.post(f"/api/players/{a['id']}/friends", json={"friend_code": b["friend_code"]}).status_code == 200
    assert client.delete(f"/api/players/{a['id']}/friends/{b['id']}").json() == {"ok": True}


def test_leaderboard_hides_private_fields(client):
    a, b = create(client, "Birinci"), create(client, "İkinci")
    client.post(f"/api/players/{a['id']}/runs", json={"score": 900, "coins": 1})
    client.post(f"/api/players/{b['id']}/runs", json={"score": 400, "coins": 1})
    rows = client.get(f"/api/leaderboard?limit=50&me={a['id']}").json()
    assert [r["nickname"] for r in rows][:2] == ["Birinci", "İkinci"]
    assert all(r["friend_code"] == "" and r["id"] not in (a["id"], b["id"]) for r in rows)
    assert rows[0]["is_me"] is True and rows[0]["rank"] == 1 and rows[1]["is_me"] is False


def test_claimed_account_rejects_tokenless_legacy_writes(client):
    p = create(client, "Sahipli")
    token = client.post("/api/v2/auth/claim", json={"player_id": p["id"], "friend_code": p["friend_code"]}).json()["token"]
    assert client.patch(f"/api/players/{p['id']}", json={"nickname": "Kaçak"}).status_code == 401
    assert client.post(f"/api/players/{p['id']}/runs", json={"score": 10, "coins": 0}).status_code == 401
    assert client.get(f"/api/players/{p['id']}/friends").status_code == 401
    ok = client.patch(f"/api/players/{p['id']}", json={"nickname": "Sahibi"}, headers=auth(token))
    assert ok.status_code == 200 and ok.json()["nickname"] == "Sahibi"
    assert client.get(f"/api/players/{p['id']}", headers=auth(token)).json()["friend_code"] == p["friend_code"]


def test_friend_code_collision_is_retried(client, raw_db, monkeypatch):
    from app import security

    p = create(client, "İlk Oyuncu")
    # A soft-deleted legacy player keeps its code in the unique index; creation must still succeed.
    raw_db.players.insert_one({"_id": ObjectId(), "nickname": "Silinmiş", "friend_code": "AAAAAA", "deleted_at": raw_db.players.find_one()["created_at"]})
    # The first code drawn collides with that player: the server must draw a new one, not fail.
    real = security.new_friend_code
    drawn = iter(["AAAAAA"])
    monkeypatch.setattr(security, "new_friend_code", lambda: next(drawn, None) or real())
    # Nicknames are unique since 2.0 (a taken one is refused with 409), so each new player has its own.
    for name in ("Yeni Martı", "Yeni Simit", "Yeni Vapur", "Yeni Tramvay", "Yeni Galata"):
        r = client.post("/api/players", json={"nickname": name})
        assert r.status_code == 200, r.text
        assert r.json()["friend_code"] != "AAAAAA"
    assert p["friend_code"]


def test_taken_nickname_is_refused(client):
    create(client, "Yeni Oyuncu")
    assert client.post("/api/players", json={"nickname": "Yeni Oyuncu"}).status_code == 409
