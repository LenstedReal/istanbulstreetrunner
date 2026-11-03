"""Old end-to-end tests against a deployed API. They run only when
LEGACY_API_URL (and, for the soft-delete test, MONGO_URL) are set."""
import os

collect_ignore = []
if not os.environ.get("LEGACY_API_URL"):
    collect_ignore += ["test_api.py", "test_soft_delete.py"]
elif not os.environ.get("MONGO_URL"):
    collect_ignore += ["test_soft_delete.py"]
