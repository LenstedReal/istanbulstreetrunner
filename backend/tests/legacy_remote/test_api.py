"""Backend tests for Istanbul Kosusu runner API."""
import os
import pytest
import requests

BASE_URL = "https://run-forever-31.preview.emergentagent.com".rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --------------------------------------------------------------------------
# Players: create / get / update / validation
# --------------------------------------------------------------------------
class TestPlayers:
    def test_root(self, api):
        r = api.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()

    def test_create_player(self, api, request):
        r = api.post(f"{API}/players", json={"nickname": "TEST_A1"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["nickname"] == "TEST_A1"
        assert len(data["friend_code"]) == 6
        assert data["is_me"] is True
        assert data["high_score"] == 0 and data["runs"] == 0 and data["total_coins"] == 0
        pytest.player_a = data

    def test_create_validation_too_short(self, api):
        r = api.post(f"{API}/players", json={"nickname": "A"})
        assert r.status_code == 422

    def test_get_player(self, api):
        pid = pytest.player_a["id"]
        r = api.get(f"{API}/players/{pid}")
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_get_player_404(self, api):
        r = api.get(f"{API}/players/000000000000000000000000")
        assert r.status_code == 404
        r2 = api.get(f"{API}/players/not-an-id")
        assert r2.status_code == 404

    def test_update_player(self, api):
        pid = pytest.player_a["id"]
        r = api.patch(f"{API}/players/{pid}", json={"nickname": "TEST_A1b"})
        assert r.status_code == 200
        assert r.json()["nickname"] == "TEST_A1b"
        # verify persisted
        g = api.get(f"{API}/players/{pid}").json()
        assert g["nickname"] == "TEST_A1b"


# --------------------------------------------------------------------------
# Runs: $max high_score, $inc coins/runs
# --------------------------------------------------------------------------
class TestRuns:
    def test_submit_run_increments(self, api):
        pid = pytest.player_a["id"]
        r1 = api.post(f"{API}/players/{pid}/runs", json={"score": 1200, "coins": 15})
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["high_score"] == 1200
        assert d1["total_coins"] == 15
        assert d1["runs"] == 1

        # lower score should not reduce high_score, but coins & runs still accumulate
        r2 = api.post(f"{API}/players/{pid}/runs", json={"score": 500, "coins": 10})
        d2 = r2.json()
        assert d2["high_score"] == 1200
        assert d2["total_coins"] == 25
        assert d2["runs"] == 2

        # higher score replaces
        r3 = api.post(f"{API}/players/{pid}/runs", json={"score": 3000, "coins": 7})
        d3 = r3.json()
        assert d3["high_score"] == 3000
        assert d3["total_coins"] == 32
        assert d3["runs"] == 3


# --------------------------------------------------------------------------
# Friends: add/list/remove with soft delete and re-add
# --------------------------------------------------------------------------
class TestFriends:
    def test_create_second_player(self, api):
        r = api.post(f"{API}/players", json={"nickname": "TEST_B1"})
        assert r.status_code == 200
        pytest.player_b = r.json()
        # give B a score to validate rank/is_me ordering later
        api.post(f"{API}/players/{pytest.player_b['id']}/runs", json={"score": 5000, "coins": 3})

    def test_add_self_400(self, api):
        pid = pytest.player_a["id"]
        code = pytest.player_a["friend_code"]
        r = api.post(f"{API}/players/{pid}/friends", json={"friend_code": code})
        assert r.status_code == 400

    def test_add_unknown_404(self, api):
        pid = pytest.player_a["id"]
        r = api.post(f"{API}/players/{pid}/friends", json={"friend_code": "ZZZZZZ"})
        assert r.status_code == 404

    def test_add_valid(self, api):
        pid = pytest.player_a["id"]
        code = pytest.player_b["friend_code"]
        r = api.post(f"{API}/players/{pid}/friends", json={"friend_code": code})
        assert r.status_code == 200, r.text
        assert r.json()["friend_code"] == code

    def test_add_duplicate_409(self, api):
        pid = pytest.player_a["id"]
        code = pytest.player_b["friend_code"]
        r = api.post(f"{API}/players/{pid}/friends", json={"friend_code": code})
        assert r.status_code == 409

    def test_list_friends_board(self, api):
        pid = pytest.player_a["id"]
        r = api.get(f"{API}/players/{pid}/friends")
        assert r.status_code == 200
        data = r.json()
        assert data["me"]["id"] == pid and data["me"]["is_me"] is True
        ids = [f["id"] for f in data["friends"]]
        assert pytest.player_b["id"] in ids
        board = data["board"]
        # sorted desc by high_score
        scores = [p["high_score"] for p in board]
        assert scores == sorted(scores, reverse=True)
        # rank present and is_me flagged for self
        assert all(p.get("rank") for p in board)
        assert any(p["is_me"] for p in board)

    def test_bidirectional(self, api):
        # friend sees me in their list too
        bid = pytest.player_b["id"]
        r = api.get(f"{API}/players/{bid}/friends")
        ids = [f["id"] for f in r.json()["friends"]]
        assert pytest.player_a["id"] in ids

    def test_remove_and_readd(self, api):
        pid = pytest.player_a["id"]
        fid = pytest.player_b["id"]
        r = api.delete(f"{API}/players/{pid}/friends/{fid}")
        assert r.status_code == 200

        # gone from both sides
        for who in (pid, fid):
            data = api.get(f"{API}/players/{who}/friends").json()
            other = fid if who == pid else pid
            assert all(f["id"] != other for f in data["friends"])

        # re-add should succeed (soft-deleted record re-activated)
        code = pytest.player_b["friend_code"]
        r2 = api.post(f"{API}/players/{pid}/friends", json={"friend_code": code})
        assert r2.status_code == 200, r2.text

        # removing non-existent (already active now, so delete different id)
        r3 = api.delete(f"{API}/players/{pid}/friends/000000000000000000000000")
        assert r3.status_code == 404


# --------------------------------------------------------------------------
# Leaderboard
# --------------------------------------------------------------------------
class TestLeaderboard:
    def test_global(self, api):
        pid = pytest.player_a["id"]
        r = api.get(f"{API}/leaderboard", params={"limit": 50, "me": pid})
        assert r.status_code == 200
        board = r.json()
        assert isinstance(board, list)
        if board:
            scores = [p["high_score"] for p in board]
            assert scores == sorted(scores, reverse=True)
            assert all(p["high_score"] > 0 for p in board)
            assert all(p.get("rank") for p in board)
            me_rows = [p for p in board if p["is_me"]]
            # player A has high_score 3000 so should be in list and flagged
            assert any(p["id"] == pid and p["is_me"] for p in board)
            assert len(me_rows) == 1
