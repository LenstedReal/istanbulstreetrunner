from datetime import datetime, timedelta, timezone

from .conftest import auth


def v2_player(client, nick="Yeni Koşucu"):
    r = client.post("/api/v2/players", json={"nickname": nick})
    assert r.status_code == 200, r.text
    body = r.json()
    return body["token"], body["player"]


def legacy_player(client, nick):
    r = client.post("/api/players", json={"nickname": nick})
    assert r.status_code == 200, r.text
    return r.json()


def backdate_run(raw_db, run_id, seconds):
    raw_db.runs.update_one({"run_id": run_id}, {"$set": {"started_at": datetime.now(timezone.utc) - timedelta(seconds=seconds)}})


def play(client, raw_db, token, *, score, coins, distance, seconds, revives=0, stats=None):
    run = client.post("/api/v2/runs", json={"client_version": "2.0.0"}, headers=auth(token)).json()
    backdate_run(raw_db, run["run_id"], seconds + 2)
    body = {"score": score, "coins": coins, "distance": distance, "duration_ms": seconds * 1000, "revives": revives, "stats": stats or {}}
    r = client.post(f"/api/v2/runs/{run['run_id']}/finish", json=body, headers=auth(token))
    assert r.status_code == 200, r.text
    return run, body, r.json()


def test_meta(client):
    m = client.get("/api/v2/meta").json()
    assert m["api"] == 2 and m["features"]["missions"] is True


def test_create_and_me(client):
    token, player = v2_player(client)
    assert len(player["public_id"]) == 16 and len(player["friend_code"]) == 6
    me = client.get("/api/v2/me", headers=auth(token))
    assert me.status_code == 200 and me.json()["id"] == player["id"]
    assert client.get("/api/v2/me").status_code == 401
    assert client.get("/api/v2/me", headers=auth("yanlis-token")).status_code == 401


def test_nickname_rules(client):
    assert client.post("/api/v2/players", json={"nickname": "Moderatör"}).status_code == 422
    token, _ = v2_player(client)
    r = client.patch("/api/v2/me", json={"nickname": "  Yeni   Ad "}, headers=auth(token))
    assert r.status_code == 200 and r.json()["nickname"] == "Yeni Ad"


def test_claim_flow(client):
    p = legacy_player(client, "Eski Hesap")
    assert client.post("/api/v2/auth/claim", json={"player_id": p["id"], "friend_code": "ZZZZZZ"}).status_code == 404
    assert client.post("/api/v2/auth/claim", json={"player_id": "000000000000000000000000", "friend_code": p["friend_code"]}).status_code == 404
    r = client.post("/api/v2/auth/claim", json={"player_id": p["id"], "friend_code": p["friend_code"].lower()})
    assert r.status_code == 200, r.text
    assert r.json()["player"]["id"] == p["id"] and len(r.json()["player"]["public_id"]) == 16
    assert client.post("/api/v2/auth/claim", json={"player_id": p["id"], "friend_code": p["friend_code"]}).status_code == 409


def test_transfer_code(client):
    token, player = v2_player(client)
    code = client.post("/api/v2/me/transfer-code", headers=auth(token)).json()["code"]
    r = client.post("/api/v2/auth/transfer", json={"code": code.lower().replace("-", " ")})
    assert r.status_code == 200 and r.json()["player"]["id"] == player["id"]
    new_token = r.json()["token"]
    assert client.get("/api/v2/me", headers=auth(new_token)).status_code == 200
    assert client.get("/api/v2/me", headers=auth(token)).status_code == 200  # old device keeps working
    assert client.post("/api/v2/auth/transfer", json={"code": code}).status_code == 404


def test_run_accepted_and_idempotent(client, raw_db):
    token, _ = v2_player(client)
    run, body, res = play(client, raw_db, token, score=1700, coins=200, distance=1500, seconds=60, revives=1)
    assert res["accepted"] is True and res["new_record"] is True and res["player"]["high_score"] == 1700
    again = client.post(f"/api/v2/runs/{run['run_id']}/finish", json=body, headers=auth(token))
    assert again.status_code == 200 and again.json()["accepted"] is True
    assert again.json()["player"]["runs"] == 1  # not counted twice
    changed = dict(body, score=1600)
    assert client.post(f"/api/v2/runs/{run['run_id']}/finish", json=changed, headers=auth(token)).status_code == 409


def test_run_of_another_player_is_not_found(client, raw_db):
    token_a, _ = v2_player(client, "Oyuncu A")
    token_b, _ = v2_player(client, "Oyuncu B")
    run = client.post("/api/v2/runs", json={}, headers=auth(token_a)).json()
    body = {"score": 10, "coins": 0, "distance": 10, "duration_ms": 5000}
    assert client.post(f"/api/v2/runs/{run['run_id']}/finish", json=body, headers=auth(token_b)).status_code == 404


def test_implausible_runs_flag_and_hide(client, raw_db):
    token, player = v2_player(client, "Şüpheli")
    _, _, ok = play(client, raw_db, token, score=500, coins=10, distance=400, seconds=30)
    assert ok["accepted"]
    for _ in range(3):
        _, _, bad = play(client, raw_db, token, score=900_000, coins=10, distance=450_000, seconds=30)
        assert bad["accepted"] is False and "distance_time" in bad["reasons"]
    me = client.get("/api/v2/me", headers=auth(token)).json()
    assert me["high_score"] == 500 and me["hidden"] is True
    board = client.get("/api/v2/leaderboard").json()["top"]
    assert all(r["public_id"] != player["public_id"] for r in board)


def test_friends_presence_block_and_report(client):
    ta, a = v2_player(client, "Ayla")
    tb, b = v2_player(client, "Baran")
    r = client.post("/api/v2/me/friends", json={"friend_code": b["friend_code"]}, headers=auth(ta))
    assert r.status_code == 200 and r.json()["public_id"] == b["public_id"] and "friend_code" not in r.json()
    assert client.post("/api/v2/me/heartbeat", headers=auth(tb)).json()["online"] >= 1
    friends = client.get("/api/v2/me/friends", headers=auth(ta)).json()
    assert friends["friends"][0]["online"] is True and len(friends["board"]) == 2

    assert client.post(f"/api/v2/me/blocks/{a['public_id']}", headers=auth(tb)).json() == {"ok": True}
    assert client.get("/api/v2/me/friends", headers=auth(ta)).json()["friends"] == []
    assert client.post("/api/v2/me/friends", json={"friend_code": b["friend_code"]}, headers=auth(ta)).status_code == 404
    assert [p["public_id"] for p in client.get("/api/v2/me/blocks", headers=auth(tb)).json()] == [a["public_id"]]
    client.delete(f"/api/v2/me/blocks/{a['public_id']}", headers=auth(tb))
    assert client.post("/api/v2/me/friends", json={"friend_code": b["friend_code"]}, headers=auth(ta)).status_code == 200

    rep = client.post("/api/v2/reports", json={"public_id": b["public_id"], "reason": "nickname"}, headers=auth(ta))
    assert rep.status_code == 200
    assert client.post("/api/v2/reports", json={"public_id": a["public_id"], "reason": "other"}, headers=auth(ta)).status_code == 400
    assert client.delete(f"/api/v2/me/friends/{b['public_id']}", headers=auth(ta)).json() == {"ok": True}


def test_leaderboard_v2_with_my_rank(client, raw_db):
    t1, p1 = v2_player(client, "Lider")
    t2, p2 = v2_player(client, "Takipçi")
    play(client, raw_db, t1, score=2000, coins=50, distance=1500, seconds=60)
    play(client, raw_db, t2, score=1000, coins=50, distance=900, seconds=60)
    data = client.get("/api/v2/leaderboard?limit=10", headers=auth(t2)).json()
    assert [r["public_id"] for r in data["top"]][:2] == [p1["public_id"], p2["public_id"]]
    assert data["me"]["rank"] == 2 and data["me"]["is_me"] is True
    assert "friend_code" not in data["top"][0]


def test_delete_account_cascades(client, raw_db):
    ta, a = v2_player(client, "Gidecek")
    tb, b = v2_player(client, "Kalacak")
    client.post("/api/v2/me/friends", json={"friend_code": b["friend_code"]}, headers=auth(ta))
    play(client, raw_db, ta, score=300, coins=5, distance=250, seconds=20)
    assert client.delete("/api/v2/me", headers=auth(ta)).json() == {"ok": True}
    assert client.get("/api/v2/me", headers=auth(ta)).status_code == 401
    assert client.get("/api/v2/me/friends", headers=auth(tb)).json()["friends"] == []
    assert raw_db.runs.count_documents({"player_id": a["id"]}) == 0
    assert raw_db.credentials.count_documents({"player_id": a["id"]}) == 0
    assert raw_db.players.count_documents({"public_id": a["public_id"]}) == 0


def test_missions_progress_and_claim(client, raw_db):
    token, _ = v2_player(client, "Görevci")
    missions = client.get("/api/v2/me/missions", headers=auth(token)).json()
    assert len(missions["missions"]) == 3
    # finish one big, plausible run that completes every per-run and most per-day missions
    play(client, raw_db, token, score=8000, coins=900, distance=8000, seconds=600, stats={"jumps": 90, "rolls": 70, "powerups": 12})
    after = client.get("/api/v2/me/missions", headers=auth(token)).json()["missions"]
    done = [m for m in after if m["progress"] >= m["target"]]
    assert done, after
    claim = client.post(f"/api/v2/me/missions/{done[0]['id']}/claim", headers=auth(token))
    assert claim.status_code == 200, claim.text
    assert claim.json()["reward_keys"] + claim.json()["reward_coins"] > 0
    assert client.post(f"/api/v2/me/missions/{done[0]['id']}/claim", headers=auth(token)).status_code == 409


def test_welcome_pack_once(client):
    token, _ = v2_player(client)
    first = client.post("/api/v2/me/grants/welcome", json={}, headers=auth(token)).json()
    assert first == {"granted": True, "keys": 50, "already": False}
    assert client.post("/api/v2/me/grants/welcome", json={}, headers=auth(token)).json()["already"] is True
    token2, _ = v2_player(client, "Eski Abone")
    legacy = client.post("/api/v2/me/grants/welcome", json={"local_granted": True}, headers=auth(token2)).json()
    assert legacy == {"granted": False, "keys": 0, "already": False}


def test_cloud_save_revisions(client):
    token, _ = v2_player(client)
    assert client.get("/api/v2/me/save", headers=auth(token)).json()["rev"] == 0
    s1 = client.put("/api/v2/me/save", json={"rev": 0, "data": {"districts": ["istiklal"]}}, headers=auth(token))
    assert s1.status_code == 200 and s1.json()["rev"] == 1
    assert client.put("/api/v2/me/save", json={"rev": 0, "data": {"x": 1}}, headers=auth(token)).status_code == 409
    s2 = client.put("/api/v2/me/save", json={"rev": 1, "data": {"districts": ["istiklal", "galata"]}}, headers=auth(token))
    assert s2.json()["rev"] == 2
    assert client.get("/api/v2/me/save", headers=auth(token)).json()["data"]["districts"] == ["istiklal", "galata"]
    big = {"blob": "x" * 9000}
    assert client.put("/api/v2/me/save", json={"rev": 2, "data": big}, headers=auth(token)).status_code == 422


def test_rate_limit(make_client):
    limited = make_client(rate_limit=True)
    codes = [limited.post("/api/v2/players", json={"nickname": f"Oyuncu {i}"}).status_code for i in range(6)]
    assert codes[:5] == [200] * 5 and codes[5] == 429
