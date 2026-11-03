"""API tests against a real MongoDB. CI sets TEST_MONGO_URL (a service container);
without it these tests are not collected."""
import os
import uuid

import pytest

MONGO = os.environ.get("TEST_MONGO_URL")

collect_ignore_glob = [] if MONGO else ["test_*.py"]


@pytest.fixture
def make_client():
    from fastapi.testclient import TestClient
    from pymongo import MongoClient

    from app.config import Settings
    from app.main import create_app

    opened = []

    def _make(rate_limit: bool = False, presence: bool = True):
        settings = Settings(
            mongo_url=MONGO,
            db_name=f"isr_test_{uuid.uuid4().hex[:12]}",
            allowed_origins=(),
            rate_limit_enabled=rate_limit,
            presence_enabled=presence,
        )
        client = TestClient(create_app(settings))
        client.__enter__()
        opened.append((client, settings.db_name))
        return client

    yield _make
    sync = MongoClient(MONGO)
    for client, name in opened:
        client.__exit__(None, None, None)
        sync.drop_database(name)
    sync.close()


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def raw_db(client):
    """Synchronous handle on the test database, for setting up edge cases."""
    from pymongo import MongoClient

    sync = MongoClient(MONGO, tz_aware=True)
    yield sync[client.app.state.settings.db_name]
    sync.close()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
