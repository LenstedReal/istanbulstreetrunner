import re

from app import security


def test_tokens_are_long_and_random():
    a, b = security.new_token(), security.new_token()
    assert a != b and len(a) >= 40
    assert re.fullmatch(r"[A-Za-z0-9_-]+", a)


def test_hash_is_sha256_hex():
    h = security.hash_secret("abc")
    assert h == security.hash_secret("abc") and len(h) == 64


def test_public_ids_do_not_look_like_object_ids():
    pid = security.new_public_id()
    assert security.is_public_id(pid) and not security.is_object_id(pid)
    assert security.is_object_id("0123456789abcdef01234567")
    assert not security.is_object_id("not-an-id")
    assert not security.is_object_id("abcdefghijkl")  # 12 chars is a valid ObjectId to bson, not to us


def test_codes():
    code = security.new_friend_code()
    assert len(code) == 6 and set(code) <= set(security.CODE_ALPHABET)
    t = security.new_transfer_code()
    assert re.fullmatch(r"[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}", t)
    assert security.normalize_code(t.lower()) == t.replace("-", "")


def test_parse_bearer():
    assert security.parse_bearer("Bearer abc") == "abc"
    assert security.parse_bearer("bearer  abc ") == "abc"
    assert security.parse_bearer("Basic abc") is None
    assert security.parse_bearer("Bearer ") is None
    assert security.parse_bearer(None) is None
    assert security.parse_bearer("Bearer " + "x" * 300) is None


def test_seed_and_anonymize():
    assert 0 < security.new_seed() < 2**31
    assert security.anonymize("abc").startswith("deleted:")
