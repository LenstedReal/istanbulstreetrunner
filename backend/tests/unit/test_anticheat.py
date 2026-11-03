from app import anticheat
from app.anticheat import RunReport, check_legacy, check_run


def simulate_best_run(seconds: float, dt: float = 1 / 120):
    """Fastest possible run with the game's constants (START 13 m/s, x1.07 every 10 s, max 32, ease 3 m/s²)."""
    speed, distance, t = 13.0, 0.0, 0.0
    while t < seconds:
        target = min(32.0, 13.0 * 1.07 ** int(t // 10))
        step = min(abs(target - speed), 3 * dt)
        speed += step if target > speed else -step
        distance += speed * dt
        t += dt
    return distance


def test_best_possible_runs_pass():
    for seconds in (30, 120, 600, 1800):
        distance = int(simulate_best_run(seconds))
        report = RunReport(score=2 * distance, coins=int(0.625 * distance), distance=distance, duration_ms=int(seconds * 1000), revives=5)
        assert check_run(report, server_elapsed_s=seconds + 2) == [], seconds


def test_ordinary_run_passes():
    assert check_run(RunReport(score=1700, coins=200, distance=1500, duration_ms=60_000, revives=1), 75) == []


def test_distance_too_far_for_time():
    assert "distance_time" in check_run(RunReport(score=1000, coins=10, distance=1000, duration_ms=10_000), 10)


def test_client_time_longer_than_server_time():
    assert "client_time" in check_run(RunReport(score=100, coins=1, distance=100, duration_ms=120_000), 30)


def test_score_above_double_distance():
    assert "score_distance" in check_run(RunReport(score=5000, coins=10, distance=1000, duration_ms=60_000), 60)


def test_too_many_coins():
    assert "coins_distance" in check_run(RunReport(score=1000, coins=5000, distance=1000, duration_ms=60_000), 60)


def test_too_many_revives():
    assert "revives" in check_run(RunReport(score=1000, coins=10, distance=1000, duration_ms=60_000, revives=6), 60)


def test_legacy_caps():
    assert check_legacy(1200, 15) == []
    assert "legacy_score_cap" in check_legacy(anticheat.LEGACY_SCORE_CAP + 1, 0)
    assert "legacy_coins" in check_legacy(100, 1000)


def test_one_hour_at_top_speed_fits_legacy_cap():
    distance = simulate_best_run(3600)
    assert 2 * distance <= anticheat.LEGACY_SCORE_CAP
