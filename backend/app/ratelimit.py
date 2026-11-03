"""In-process sliding-window rate limiter.

Render's free plan runs one instance, so memory is enough. If the API ever
runs on several instances, move these counters to MongoDB or Redis.
"""
from __future__ import annotations

import time
from collections import deque
from typing import Callable

# bucket -> (limit, window in seconds)
LIMITS: dict[str, tuple[int, float]] = {
    "ip": (600, 60.0),
    "create_player": (5, 3600.0),
    "claim": (10, 3600.0),
    "transfer": (10, 3600.0),
    "transfer_code": (5, 3600.0),
    "friend_add": (30, 3600.0),
    "run_start": (120, 3600.0),
    "run_finish": (120, 3600.0),
    "nickname": (10, 86400.0),
    "report": (20, 86400.0),
    "legacy_run": (1, 10.0),
    "legacy_run_day": (300, 86400.0),
    "heartbeat": (6, 60.0),
    "save": (60, 3600.0),
    "block": (60, 3600.0),
    "mission_claim": (30, 3600.0),
}


class RateLimiter:
    def __init__(self, enabled: bool = True, clock: Callable[[], float] = time.monotonic, limits: dict[str, tuple[int, float]] | None = None):
        self.enabled = enabled
        self._clock = clock
        self._limits = dict(LIMITS if limits is None else limits)
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._calls = 0

    def allow(self, bucket: str, key: str) -> bool:
        """Record one hit; False when the bucket is already full for this key."""
        if not self.enabled:
            return True
        limit, window = self._limits[bucket]
        now = self._clock()
        q = self._hits.get((bucket, key))
        if q is None:
            q = self._hits[(bucket, key)] = deque()
        while q and q[0] <= now - window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        self._calls += 1
        if self._calls % 1000 == 0:
            self._prune(now)
        return True

    def _prune(self, now: float) -> None:
        for k in list(self._hits.keys()):
            limit, window = self._limits[k[0]]
            q = self._hits[k]
            while q and q[0] <= now - window:
                q.popleft()
            if not q:
                del self._hits[k]

    def reset(self) -> None:
        self._hits.clear()
