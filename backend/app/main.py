"""FastAPI application factory."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo import AsyncMongoClient

from .config import Settings, load_settings
from .db import ensure_indexes
from .deps import client_ip
from .ratelimit import RateLimiter
from .routes_legacy import router as legacy_router
from .routes_v2 import router as v2_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("isr")


async def _indexes_when_ready(db) -> None:
    while True:
        try:
            await db.command("ping")
            await ensure_indexes(db)
            return
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            await asyncio.sleep(30)


def create_app(settings: Optional[Settings] = None) -> FastAPI:
    settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = AsyncMongoClient(settings.mongo_url, serverSelectionTimeoutMS=8000, tz_aware=True)
        app.state.client = client
        app.state.db = client[settings.db_name]
        app.state.index_task = None
        try:
            # A short check keeps startup fast; if MongoDB is slow, indexes are built in the background.
            await asyncio.wait_for(client.admin.command("ping"), timeout=4.0)
            failed = await ensure_indexes(app.state.db)
            if failed:
                log.warning("%d index(es) could not be created", len(failed))
        except Exception:  # noqa: BLE001
            log.warning("MongoDB not reachable at startup; indexes will be created in the background")
            app.state.index_task = asyncio.create_task(_indexes_when_ready(app.state.db))
        try:
            yield
        finally:
            if app.state.index_task:
                app.state.index_task.cancel()
            await client.close()

    app = FastAPI(title="Istanbul Street Runner API", version="2.0.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.limiter = RateLimiter(enabled=settings.rate_limit_enabled)

    @app.middleware("http")
    async def ip_limit(request: Request, call_next):
        if request.url.path.startswith("/api") and not app.state.limiter.allow("ip", client_ip(request)):
            return JSONResponse({"detail": "Çok fazla istek. Biraz sonra tekrar dene."}, status_code=429)
        return await call_next(request)

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception):  # noqa: ARG001
        log.exception("unhandled error on %s", request.url.path)
        return JSONResponse({"detail": "Sunucuda beklenmeyen bir hata oluştu"}, status_code=500)

    @app.get("/health", include_in_schema=False)
    @app.head("/health", include_in_schema=False)
    async def health():
        return {"status": "ok"}

    @app.get("/ready", include_in_schema=False)
    async def ready():
        try:
            await asyncio.wait_for(app.state.db.command("ping"), timeout=2.0)
        except Exception:  # noqa: BLE001
            return JSONResponse({"status": "db_unavailable"}, status_code=503)
        return {"status": "ready"}

    app.include_router(legacy_router)
    app.include_router(v2_router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    return app
