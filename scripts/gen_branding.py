"""Generates the app icon, adaptive icon, splash image and favicon for Istanbul Runner.
Run: python3 scripts/gen_branding.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "images"
FONT = Path(__file__).resolve().parent.parent / "frontend" / "assets" / "fonts" / "Fredoka-Bold.ttf"

RED = (214, 40, 40)
RED_DARK = (154, 27, 27)
CREAM = (253, 251, 247)
GOLD = (233, 196, 106)
BLUE = (0, 168, 204)
DARK = (42, 38, 38)
SKY_TOP = (63, 147, 201)
SKY_BOTTOM = (246, 223, 192)


def gradient(size, top, bottom):
    w, h = size
    im = Image.new("RGBA", size)
    px = im.load()
    for y in range(h):
        k = y / max(h - 1, 1)
        c = tuple(int(top[i] * (1 - k) + bottom[i] * k) for i in range(3)) + (255,)
        for x in range(w):
            px[x, y] = c
    return im


def draw_scene(d: ImageDraw.ImageDraw, s: float, ox: float, oy: float):
    """Tram front + runner silhouette, scaled by s with origin offset."""
    def R(x0, y0, x1, y1, fill, r=0):
        d.rounded_rectangle((ox + x0 * s, oy + y0 * s, ox + x1 * s, oy + y1 * s), radius=r * s, fill=fill)

    # Road
    d.polygon([(ox + 300 * s, oy + 560 * s), (ox + 724 * s, oy + 560 * s), (ox + 1024 * s, oy + 1024 * s), (ox + 0, oy + 1024 * s)], fill=(74, 71, 68))
    for i in range(4):
        y0 = 600 + i * 100
        d.polygon(
            [(ox + 505 * s, oy + y0 * s), (ox + 519 * s, oy + y0 * s), (ox + (521 + i * 3) * s, oy + (y0 + 55) * s), (ox + (503 - i * 3) * s, oy + (y0 + 55) * s)],
            fill=CREAM,
        )
    # Tram body
    R(292, 150, 732, 620, RED, 60)
    R(292, 560, 732, 650, DARK, 30)
    R(312, 110, 712, 190, CREAM, 40)
    R(340, 230, 684, 400, (127, 179, 213), 30)
    R(340, 230, 684, 260, (90, 140, 180), 0)
    R(380, 440, 470, 520, GOLD, 20)
    R(554, 440, 644, 520, GOLD, 20)
    R(470, 470, 554, 500, CREAM, 10)
    d.line((ox + 512 * s, oy + 20 * s, ox + 512 * s, oy + 110 * s), fill=DARK, width=int(14 * s))
    d.line((ox + 420 * s, oy + 40 * s, ox + 604 * s, oy + 40 * s), fill=DARK, width=int(14 * s))
    # Runner silhouette (dark) in front
    rx, ry = 512, 760
    d.ellipse((ox + (rx - 42) * s, oy + (ry - 160) * s, ox + (rx + 42) * s, oy + (ry - 76) * s), fill=DARK)
    R(rx - 48, ry - 72, rx + 48, ry + 60, DARK, 30)
    d.line((ox + (rx - 40) * s, oy + (ry - 40) * s, ox + (rx - 120) * s, oy + (ry + 10) * s), fill=DARK, width=int(30 * s))
    d.line((ox + (rx + 40) * s, oy + (ry - 40) * s, ox + (rx + 110) * s, oy + (ry - 110) * s), fill=DARK, width=int(30 * s))
    d.line((ox + (rx - 20) * s, oy + (ry + 50) * s, ox + (rx - 90) * s, oy + (ry + 170) * s), fill=DARK, width=int(34 * s))
    d.line((ox + (rx + 20) * s, oy + (ry + 50) * s, ox + (rx + 70) * s, oy + (ry + 150) * s), fill=DARK, width=int(34 * s))


def icon(size=1024, rounded=True, padding=0.0):
    im = gradient((size, size), SKY_TOP, SKY_BOTTOM)
    d = ImageDraw.Draw(im)
    # sun
    d.ellipse((size * 0.68, size * 0.08, size * 0.92, size * 0.32), fill=(255, 233, 176))
    s = size / 1024 * (1 - padding * 2)
    draw_scene(d, s, size * padding, size * padding)
    if rounded:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), radius=int(size * 0.22), fill=255)
        im.putalpha(mask)
    return im


def splash(w=1242, h=2688):
    im = Image.new("RGBA", (w, h), DARK + (255,))
    d = ImageDraw.Draw(im)
    ic = icon(int(w * 0.5))
    im.alpha_composite(ic, (int(w * 0.25), int(h * 0.32)))
    font = ImageFont.truetype(str(FONT), int(w * 0.11))
    small = ImageFont.truetype(str(FONT), int(w * 0.045))
    title = "ISTANBUL\nRUNNER"
    bbox = d.multiline_textbbox((0, 0), title, font=font, align="center", spacing=int(w * 0.01))
    tw = bbox[2] - bbox[0]
    d.multiline_text(((w - tw) / 2, h * 0.32 + w * 0.5 + h * 0.03), title, font=font, fill=CREAM, align="center", spacing=int(w * 0.01))
    return im


icon(1024).save(OUT / "icon.png")
# Adaptive icons get cropped to a circle/squircle: keep the artwork inside the safe zone.
icon(1024, rounded=False, padding=0.12).save(OUT / "adaptive-icon.png")
icon(512).save(OUT / "favicon.png")
icon(1024).save(OUT / "splash-image.png")
splash().save(OUT / "app-image.png")
print("branding written to", OUT)
