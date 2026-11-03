"""Nickname rules shared by the legacy and v2 routes. Pure functions, no I/O.

A nickname is normalised (NFKC, invisible characters removed, whitespace
collapsed) and then checked for length, characters, reserved names and a short
TR/EN word list. The list is deliberately small: players can report names that
slip through and `scripts/admin_tools.py` renames them.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

MIN_LEN = 2
MAX_LEN = 16
_EXTRA_ALLOWED = frozenset(" _.-")

_TR_ASCII = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"})
_LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i"})

# Whole words (after folding) that may not appear in a name.
RESERVED_TOKENS = frozenset(
    {
        "admin", "administrator", "yonetici", "moderator", "mod", "destek", "support", "yetkili",
        "sistem", "system", "resmi", "official", "staff", "lensted", "lenstedreal",
    }
)
# Whole names (folded, separators removed).
RESERVED_NAMES = frozenset({"istanbulrunner", "istanbulstreetrunner", "istanbulkosusu", "lenstedreal"})

# Short words matched only as a whole word (otherwise they hide inside harmless names).
BLOCKED_TOKENS = frozenset(
    {"am", "amk", "aq", "sik", "got", "oc", "pic", "ibne", "sex", "seks", "porn", "porno", "dick", "cock", "cum", "tits", "anal"}
)
# Longer stems matched anywhere in the folded name.
BLOCKED_STEMS = (
    "orospu", "oruspu", "siktir", "sikis", "sikik", "sikerim", "amcik", "amina", "yarrak", "dalyarak",
    "pezevenk", "kahpe", "gavat", "kaltak", "serefsiz", "yavsak", "kevase", "ananisik",
    "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "whore", "slut", "rapist", "hitler", "pedofil", "pedophile",
)

MESSAGES = {
    "too_short": "Takma ad en az 2 karakter olmalı",
    "too_long": "Takma ad en fazla 16 karakter olabilir",
    "invalid_chars": "Takma adda yalnız harf, rakam, boşluk ve _ . - kullanılabilir",
    "reserved": "Bu takma ad kullanılamaz",
    "blocked": "Bu takma ad kullanılamaz",
}


@dataclass(frozen=True)
class NicknameCheck:
    ok: bool
    value: str
    code: str | None = None

    @property
    def message(self) -> str:
        return MESSAGES.get(self.code or "", "Geçersiz takma ad")


def normalize(raw: str) -> str:
    """NFKC, drop control/format/private characters, collapse whitespace."""
    s = unicodedata.normalize("NFKC", raw or "")
    s = "".join(ch for ch in s if unicodedata.category(ch)[0] != "C" or ch in "\t\n ")
    return re.sub(r"\s+", " ", s).strip()


def fold(s: str) -> str:
    """Lower-case with Turkish dotted/dotless I handled, Turkish letters to ASCII, leetspeak to letters."""
    s = s.replace("İ", "i").replace("I", "i").lower()
    return s.translate(_TR_ASCII).translate(_LEET)


def _squeeze(s: str, keep: int) -> str:
    """Shorten runs of the same character to at most `keep` characters."""
    return re.sub(r"(.)\1{%d,}" % keep, lambda m: m.group(1) * keep, s)


def _tokens(folded: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", folded) if t]


def check_nickname(raw: str) -> NicknameCheck:
    value = normalize(raw)
    if len(value) < MIN_LEN:
        return NicknameCheck(False, value, "too_short")
    if len(value) > MAX_LEN:
        return NicknameCheck(False, value, "too_long")
    for ch in value:
        if ch in _EXTRA_ALLOWED:
            continue
        cat = unicodedata.category(ch)
        if not (cat.startswith("L") or cat == "Nd"):
            return NicknameCheck(False, value, "invalid_chars")
    if not any(ch.isalnum() for ch in value):
        return NicknameCheck(False, value, "invalid_chars")

    folded = fold(value)
    tokens = _tokens(folded)
    joined = "".join(tokens)
    if joined in RESERVED_NAMES or any(t in RESERVED_TOKENS for t in tokens):
        return NicknameCheck(False, value, "reserved")

    squeezed_tokens = {_squeeze(t, 1) for t in tokens} | set(tokens)
    if squeezed_tokens & BLOCKED_TOKENS:
        return NicknameCheck(False, value, "blocked")
    loose = _squeeze(joined, 2)
    tight = _squeeze(joined, 1)
    for stem in BLOCKED_STEMS:
        if stem in loose or stem in joined or (_squeeze(stem, 1) == stem and stem in tight):
            return NicknameCheck(False, value, "blocked")
    return NicknameCheck(True, value)
