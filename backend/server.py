"""Render entry point: `uvicorn server:app` from the backend folder.

The application lives in the `app` package (see app/main.py). Settings come
from environment variables; a local backend/.env is read for development only
and must never be committed.
"""
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from app.main import create_app  # noqa: E402

app = create_app()
