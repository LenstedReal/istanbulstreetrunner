"""Daily missions: three per player per UTC day, chosen deterministically.

Pure functions. The client turns `kind` + `target` into Turkish or English text.
Progress only comes from accepted runs.
"""
from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass

# kind -> (targets, counts per run (True) or per day (False))
POOL: dict[str, tuple[tuple[int, ...], bool]] = {
    "run_distance": ((1000, 1500, 2500), True),
    "day_distance": ((3000, 5000, 8000), False),
    "run_coins": ((80, 120, 200), True),
    "day_coins": ((300, 500, 800), False),
    "day_jumps": ((40, 80), False),
    "day_rolls": ((30, 60), False),
    "day_powerups": ((5, 10), False),
    "day_runs": ((3, 5), False),
}

STAT_KEYS = ("jumps", "rolls", "powerups")


@dataclass(frozen=True)
class RunStats:
    distance: int
    coins: int
    jumps: int = 0
    rolls: int = 0
    powerups: int = 0


def _rng(player_id: str, day: str) -> random.Random:
    seed = int(hashlib.sha256(f"{player_id}:{day}".encode()).hexdigest()[:12], 16)
    return random.Random(seed)


DISTRICTS = ("istiklal", "galata", "eminonu", "bridge", "bosphorus")
MAX_LEVEL = len(DISTRICTS) - 1


def level_from_save(save: dict | None) -> int:
    """Player level = districts opened (from the cloud save) - 1, clamped to 0..4."""
    try:
        unlocked = (save or {}).get("data", {}).get("progress", {}).get("unlocked", [])
        opened = {d for d in unlocked if d in DISTRICTS} | {"istiklal"}
        return max(0, min(MAX_LEVEL, len(opened) - 1))
    except AttributeError:
        return 0


def _scale(value: int, level: int) -> int:
    """+30 % per level, rounded to a friendly number."""
    v = value * (1 + 0.3 * level)
    step = 50 if v >= 500 else 10 if v >= 50 else 1
    return int(round(v / step) * step)


def missions_for(player_id: str, day: str, level: int = 0) -> list[dict]:
    """Three missions; targets and rewards grow with the player's district level."""
    level = max(0, min(MAX_LEVEL, int(level)))
    rng = _rng(player_id, day)
    kinds = rng.sample(sorted(POOL.keys()), 3)
    out = []
    for i, kind in enumerate(kinds):
        targets, _ = POOL[kind]
        tier = rng.randrange(len(targets))
        target = _scale(targets[tier], level)
        if rng.random() < 0.5:
            reward_keys, reward_coins = 1 + tier + level // 2, 0
        else:
            reward_keys, reward_coins = 0, _scale(100 * (tier + 1), level)
        out.append(
            {
                "id": f"m{i}",
                "kind": kind,
                "target": target,
                "progress": 0,
                "reward_keys": reward_keys,
                "reward_coins": reward_coins,
                "claimed": False,
            }
        )
    return out


def apply_run(missions: list[dict], stats: RunStats) -> list[dict]:
    """Return updated copies; per-run kinds keep the best single run."""
    values = {
        "run_distance": stats.distance,
        "day_distance": stats.distance,
        "run_coins": stats.coins,
        "day_coins": stats.coins,
        "day_jumps": stats.jumps,
        "day_rolls": stats.rolls,
        "day_powerups": stats.powerups,
        "day_runs": 1,
    }
    updated = []
    for m in missions:
        m = dict(m)
        kind = m.get("kind")
        if kind in POOL and not m.get("claimed"):
            per_run = POOL[kind][1]
            v = int(values.get(kind, 0))
            progress = max(int(m.get("progress", 0)), v) if per_run else int(m.get("progress", 0)) + v
            m["progress"] = min(progress, int(m["target"]))
        updated.append(m)
    return updated


def clamp_stats(raw: dict | None, distance: int) -> dict[str, int]:
    """Keep only known counters and cap them at physically possible values."""
    raw = raw or {}
    cap = max(0, distance // 2 + 20)
    out = {}
    for key in STAT_KEYS:
        try:
            v = int(raw.get(key, 0))
        except (TypeError, ValueError):
            v = 0
        out[key] = max(0, min(v, cap))
    return out
