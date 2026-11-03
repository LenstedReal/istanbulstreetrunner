"""Optional server-side check of the `premium` entitlement through the RevenueCat
REST API. Used only when REVENUECAT_SECRET_KEY is set in Render; the secret key
never reaches the app."""
from __future__ import annotations

import asyncio
import json
import logging
import urllib.parse
import urllib.request
from datetime import datetime, timezone

log = logging.getLogger("isr.revenuecat")


class RevenueCatUnavailable(Exception):
    pass


def _fetch(secret: str, app_user_id: str) -> dict:
    url = "https://api.revenuecat.com/v1/subscribers/" + urllib.parse.quote(app_user_id, safe="")
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {secret}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310 - fixed https URL
        return json.loads(resp.read().decode("utf-8"))


def entitlement_active(data: dict, entitlement: str = "premium", now: datetime | None = None) -> bool:
    ent = (data.get("subscriber") or {}).get("entitlements", {}).get(entitlement)
    if not ent:
        return False
    expires = ent.get("expires_date")
    if not expires:
        return True  # lifetime
    try:
        when = datetime.fromisoformat(expires.replace("Z", "+00:00"))
    except ValueError:
        return False
    return when > (now or datetime.now(timezone.utc))


async def has_premium(secret: str, app_user_id: str) -> bool:
    try:
        data = await asyncio.to_thread(_fetch, secret, app_user_id)
    except Exception as exc:  # noqa: BLE001
        log.warning("RevenueCat lookup failed: %s", type(exc).__name__)
        raise RevenueCatUnavailable() from exc
    return entitlement_active(data)
