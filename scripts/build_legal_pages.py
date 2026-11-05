#!/usr/bin/env python3
"""Build the public legal pages in docs/ from frontend/src/legal/legal.json.

The game shows the same JSON in Settings -> Privacy, so the in-game and web texts
never drift apart. Run after editing the JSON:  python3 scripts/build_legal_pages.py
"""
from __future__ import annotations

import html
import json
import re
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "frontend" / "src" / "legal" / "legal.json"
OUT = ROOT / "docs"

PAGES = {
    "privacy": "privacy-policy.html",
    "terms": "terms.html",
    "licenses": "licenses.html",
    "deletion": "delete-account.html",
}
MONTHS_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
LINK = re.compile(r"(https?://[^\s)]+|[\w.+-]+@[\w-]+\.[\w.]+)")

STYLE = """
:root { color-scheme: light dark; --bg:#fdfbf7; --fg:#2a2626; --muted:#6f6a62; --card:#ffffff; --line:#e0dcd6; --link:#007a94; --brand:#d62828; }
@media (prefers-color-scheme: dark) { :root { --bg:#141317; --fg:#eeeeef; --muted:#b0adb8; --card:#1d1c22; --line:#30303a; --link:#6fd3ee; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.7 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 820px; margin: 0 auto; padding: 24px 16px 64px; }
header.top { display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; justify-content:space-between; border-bottom:1px solid var(--line); padding-bottom:12px; }
.brand { font-weight:800; color:var(--brand); text-decoration:none; }
nav a { margin-right:12px; }
h1 { font-size:1.8rem; line-height:1.25; margin:24px 0 4px; }
h2 { font-size:1.15rem; margin:24px 0 6px; }
.updated { color:var(--muted); font-size:.9rem; margin:0 0 16px; }
section.lang { margin-top:32px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:4px 16px 8px; margin:12px 0; }
a { color:var(--link); overflow-wrap:anywhere; }
.switch { font-size:.9rem; }
footer { margin-top:40px; color:var(--muted); font-size:.85rem; }
"""


def linkify(text: str) -> str:
    out = []
    last = 0
    for m in LINK.finditer(text):
        out.append(html.escape(text[last : m.start()]))
        url = m.group(0)
        href = url if url.startswith("http") else f"mailto:{url}"
        out.append(f'<a href="{html.escape(href)}">{html.escape(url)}</a>')
        last = m.end()
    out.append(html.escape(text[last:]))
    return "".join(out)


def fmt_date(iso: str, lang: str) -> str:
    d = date.fromisoformat(iso)
    if lang == "tr":
        return f"{d.day} {MONTHS_TR[d.month - 1]} {d.year}"
    return d.strftime("%d %B %Y").lstrip("0")


def block(doc: dict, lang: str, updated: str) -> str:
    label = "Son güncelleme" if lang == "tr" else "Last updated"
    parts = [f'<section class="lang" lang="{lang}" id="{lang}">', f"<h1>{html.escape(doc['title'])}</h1>",
             f'<p class="updated">{label}: {fmt_date(updated, lang)}</p>', f"<p>{linkify(doc['intro'])}</p>"]
    for s in doc["sections"]:
        parts.append('<div class="card">')
        parts.append(f"<h2>{html.escape(s['h'])}</h2>")
        parts.extend(f"<p>{linkify(p)}</p>" for p in s["p"])
        parts.append("</div>")
    parts.append("</section>")
    return "\n".join(parts)


def nav(data: dict) -> str:
    links = [f'<a href="{PAGES[k]}">{html.escape(data[k]["tr"]["title"])}</a>' for k in PAGES]
    return " ".join(links)


def page(key: str, data: dict) -> str:
    doc = data[key]
    title = f"{doc['tr']['title']} / {doc['en']['title']} – Istanbul Street Runner"
    return f"""<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index,follow">
<title>{html.escape(title)}</title>
<style>{STYLE}</style>
</head>
<body>
<main>
<header class="top"><a class="brand" href="index.html">Istanbul Street Runner</a><nav>{nav(data)}</nav></header>
<p class="switch"><a href="#tr">Türkçe</a> · <a href="#en">English</a></p>
{block(doc['tr'], 'tr', doc.get('updated', data['updated']))}
{block(doc['en'], 'en', doc.get('updated', data['updated']))}
<footer>{html.escape(data['developer'])} · {linkify(data['contact'])}</footer>
</main>
</body>
</html>
"""


def index(data: dict) -> str:
    items = "\n".join(f'<li><a href="{PAGES[k]}">{html.escape(data[k]["tr"]["title"])} / {html.escape(data[k]["en"]["title"])}</a></li>' for k in PAGES)
    return f"""<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Istanbul Street Runner</title>
<style>{STYLE}</style>
</head>
<body>
<main>
<h1>Istanbul Street Runner</h1>
<p>İstanbul sokaklarında sonsuz koşu oyunu. · An endless runner through the streets of Istanbul.</p>
<ul>
{items}
</ul>
<footer>{html.escape(data['developer'])} · {linkify(data['contact'])}</footer>
</main>
</body>
</html>
"""


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    OUT.mkdir(exist_ok=True)
    for key, name in PAGES.items():
        (OUT / name).write_text(page(key, data), encoding="utf-8")
    (OUT / "index.html").write_text(index(data), encoding="utf-8")
    print(f"wrote {len(PAGES) + 1} pages to {OUT}")


if __name__ == "__main__":
    main()
