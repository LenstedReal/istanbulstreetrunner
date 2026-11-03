import pytest

from app.moderation import check_nickname, fold, normalize


@pytest.mark.parametrize("name", ["Koşucu1234", "Ayşe Nur", "Çağrı_99", "İrem.K", "José", "Badminton", "Modern", "Destekçi", "Amsterdam", "Musiki", "Gotham", "Sikke"])
def test_ordinary_names_pass(name):
    res = check_nickname(name)
    assert res.ok, (name, res.code)


def test_normalisation_removes_invisible_and_collapses_spaces():
    assert normalize("  Ali​​Veli   Can ") == "AliVeli Can"
    res = check_nickname("Ali​Veli")
    assert res.ok and res.value == "AliVeli"


@pytest.mark.parametrize(
    ("name", "code"),
    [
        ("A", "too_short"),
        ("   ", "too_short"),
        ("A" * 17, "too_long"),
        ("Ali😀", "invalid_chars"),
        ("Z̵̶algo", "invalid_chars"),
        ("<script>", "invalid_chars"),
        ("__", "invalid_chars"),
    ],
)
def test_invalid_names(name, code):
    res = check_nickname(name)
    assert not res.ok and res.code == code


@pytest.mark.parametrize("name", ["Admin", "ADMIN 1", "Moderatör", "LenstedReal", "Istanbul Runner", "destek ekibi", "Resmi Hesap"])
def test_reserved_names(name):
    res = check_nickname(name)
    assert not res.ok and res.code == "reserved", name


@pytest.mark.parametrize("name", ["Orospu", "0r0spu", "SikTir", "s1kt1r", "Yarrrak", "fuck_you", "am k", "AMK", "piç"])
def test_blocked_names(name):
    res = check_nickname(name)
    assert not res.ok and res.code == "blocked", name


def test_fold_handles_turkish_i_and_leet():
    assert fold("İSTANBUL") == "istanbul"
    assert fold("IŞIK") == "isik"
    assert fold("k0şuc4") == "kosuca"


def test_messages_are_turkish():
    assert "karakter" in check_nickname("A").message
