"""Plausibility limits for submitted runs. Pure functions, no I/O.

The numbers mirror frontend/src/game/constants.ts. Score is distance times the
multiplier (x2 at most), the runner never goes faster than MAX_SPEED, and the
densest coin pattern (plus sky trails) stays under COIN_DENSITY_MAX per metre.
A failed check never deletes anything: the run is stored as flagged and does
not count for the leaderboard.
"""
from __future__ import annotations

from dataclasses import dataclass

MAX_SPEED = 32.0  # m/s
SCORE_MULTIPLIER_MAX = 2
COIN_DENSITY_MAX = 0.8  # coins per metre
COIN_SLACK = 30
DISTANCE_SLACK = 60.0  # metres
SCORE_SLACK = 10
CLIENT_TIME_SLACK_S = 5.0
MAX_REVIVES = 5
RUN_TTL_S = 3 * 3600
FINISHED_RUN_KEEP_DAYS = 180

LEGACY_SCORE_CAP = 250_000  # about one hour at top speed with x2 most of the time
LEGACY_MIN_INTERVAL_S = 10
LEGACY_DAILY_RUNS = 300

FLAG_HIDE_THRESHOLD = 3


@dataclass(frozen=True)
class RunReport:
    score: int
    coins: int
    distance: int
    duration_ms: int
    revives: int = 0


def check_run(report: RunReport, server_elapsed_s: float) -> list[str]:
    """Reasons why a v2 run is implausible; empty when it looks fine."""
    reasons: list[str] = []
    active_s = max(0.0, report.duration_ms / 1000.0)
    if active_s > server_elapsed_s + CLIENT_TIME_SLACK_S:
        reasons.append("client_time")
    time_budget = max(0.0, min(server_elapsed_s, active_s + CLIENT_TIME_SLACK_S))
    if report.distance > MAX_SPEED * time_budget + DISTANCE_SLACK:
        reasons.append("distance_time")
    if report.score > SCORE_MULTIPLIER_MAX * report.distance + SCORE_SLACK:
        reasons.append("score_distance")
    if report.coins > COIN_DENSITY_MAX * report.distance + COIN_SLACK:
        reasons.append("coins_distance")
    if report.revives > MAX_REVIVES:
        reasons.append("revives")
    return reasons


def check_legacy(score: int, coins: int) -> list[str]:
    """Checks for the 1.0.x route, which only sends score and coins.

    Score is never below distance, so the coin bound can use the score.
    """
    reasons: list[str] = []
    if score > LEGACY_SCORE_CAP:
        reasons.append("legacy_score_cap")
    if coins > COIN_DENSITY_MAX * score + COIN_SLACK:
        reasons.append("legacy_coins")
    return reasons
