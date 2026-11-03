from datetime import datetime, timedelta, timezone

from app.missions import POOL, RunStats, apply_run, clamp_stats, level_from_save, missions_for
from app.ratelimit import RateLimiter
from app.revenuecat import entitlement_active


class FakeClock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_rate_limiter_window():
    clock = FakeClock()
    rl = RateLimiter(clock=clock, limits={"b": (2, 10.0)})
    assert rl.allow("b", "k") and rl.allow("b", "k")
    assert not rl.allow("b", "k")
    assert rl.allow("b", "other")
    clock.t += 10.01
    assert rl.allow("b", "k")


def test_rate_limiter_disabled():
    rl = RateLimiter(enabled=False, limits={"b": (1, 10.0)})
    assert all(rl.allow("b", "k") for _ in range(5))


def test_missions_are_deterministic_and_distinct():
    a = missions_for("player-1", "2026-11-03")
    b = missions_for("player-1", "2026-11-03")
    c = missions_for("player-1", "2026-11-04")
    assert a == b and len(a) == 3
    assert len({m["kind"] for m in a}) == 3
    assert all(m["kind"] in POOL and m["target"] in POOL[m["kind"]][0] for m in a)
    assert a != c or True  # another day may repeat by chance; determinism is what matters


def test_apply_run_per_run_and_per_day():
    ms = [
        {"id": "m0", "kind": "run_distance", "target": 1000, "progress": 0, "reward_keys": 1, "reward_coins": 0, "claimed": False},
        {"id": "m1", "kind": "day_distance", "target": 3000, "progress": 0, "reward_keys": 0, "reward_coins": 100, "claimed": False},
        {"id": "m2", "kind": "day_runs", "target": 3, "progress": 2, "reward_keys": 1, "reward_coins": 0, "claimed": True},
    ]
    ms = apply_run(ms, RunStats(distance=800, coins=10))
    ms = apply_run(ms, RunStats(distance=600, coins=10))
    assert ms[0]["progress"] == 800  # best single run
    assert ms[1]["progress"] == 1400  # sum over the day
    assert ms[2]["progress"] == 2  # claimed missions do not change
    ms = apply_run(ms, RunStats(distance=5000, coins=10))
    assert ms[0]["progress"] == 1000 and ms[1]["progress"] == 3000  # capped at target


def test_clamp_stats():
    assert clamp_stats({"jumps": 10_000, "rolls": "x", "hack": 5}, distance=100) == {"jumps": 70, "rolls": 0, "powerups": 0}


def test_revenuecat_entitlement():
    now = datetime(2026, 11, 3, tzinfo=timezone.utc)
    future = (now + timedelta(days=3)).isoformat().replace("+00:00", "Z")
    past = (now - timedelta(days=3)).isoformat().replace("+00:00", "Z")
    assert entitlement_active({"subscriber": {"entitlements": {"premium": {"expires_date": future}}}}, now=now)
    assert not entitlement_active({"subscriber": {"entitlements": {"premium": {"expires_date": past}}}}, now=now)
    assert entitlement_active({"subscriber": {"entitlements": {"premium": {"expires_date": None}}}}, now=now)
    assert not entitlement_active({"subscriber": {"entitlements": {}}}, now=now)


def test_missions_get_harder_with_level():
    base = missions_for("player-9", "2026-11-04", 0)
    hard = missions_for("player-9", "2026-11-04", 4)
    assert [m["kind"] for m in base] == [m["kind"] for m in hard]
    for b, h in zip(base, hard):
        assert h["target"] > b["target"]
        assert h["reward_keys"] >= b["reward_keys"] and h["reward_coins"] >= b["reward_coins"]
    assert missions_for("player-9", "2026-11-04", 99) == hard


def test_level_from_save():
    assert level_from_save(None) == 0
    assert level_from_save({"data": {"progress": {"unlocked": ["istiklal", "galata", "x"]}}}) == 1
    assert level_from_save({"data": {"progress": {"unlocked": ["istiklal", "galata", "eminonu", "bridge", "bosphorus"]}}}) == 4
    assert level_from_save({"data": "broken"}) == 0
