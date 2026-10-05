"""VANGUARD's decal atlas (scheme A, 'ace custom' — after the Codex character sheet vanguard-scheme-a-v1):
assets/tex/src/vanguard_decals.png, a 4 x 2 grid of 512 px RGBA cells, baked onto the mech by blender/bake_mechs.py
(MODEL_OPTS enemy_ms 'decals': cell index = id - 1).
  1 unit number '07'   2 faction emblem   3 warning stripes   4 CAUTION   5 SERVICE   6 kill tally
usage: uv run --with pillow tools/make_vanguard_decals.py"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'tex', 'src', 'vanguard_decals.png')
FONT = '/mnt/c/Windows/Fonts/bahnschrift.ttf'
C = 512
WHITE, YELLOW, BLACK = (232, 228, 218, 255), (243, 185, 40, 255), (20, 21, 24, 255)


def font(size, wght=700):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([wght, 100])   # Bahnschrift: weight, width
    except Exception:
        pass
    return f


def cell():
    return Image.new('RGBA', (C, C), (0, 0, 0, 0))


def centred(d, text, f, y, fill):
    w = d.textlength(text, font=f)
    d.text(((C - w) / 2, y), text, font=f, fill=fill)


def unit():
    im = cell(); d = ImageDraw.Draw(im)
    centred(d, '07', font(330), 40, WHITE)
    d.polygon([(70, 420), (330, 420), (300, 450), (70, 450)], fill=YELLOW)   # the accent bar under it
    return im


def emblem():
    im = cell(); d = ImageDraw.Draw(im)
    cx, cy, r = C / 2, C / 2, 220
    d.polygon([(cx, cy - r), (cx + r * 0.78, cy), (cx, cy + r), (cx - r * 0.78, cy)], fill=WHITE)   # a split diamond
    d.polygon([(cx - 14, cy - r + 40), (cx - 14, cy + r - 40), (cx - r * 0.78 + 46, cy)], fill=(0, 0, 0, 0))
    d.polygon([(cx + 30, cy - 70), (cx + 120, cy), (cx + 30, cy + 70)], fill=(0, 0, 0, 0))
    return im


def stripes():
    im = cell(); d = ImageDraw.Draw(im)
    d.rectangle([0, 150, C, 362], fill=BLACK)
    for k in range(-4, 10):
        x = k * 90
        d.polygon([(x, 362), (x + 45, 362), (x + 45 + 212, 150), (x + 212, 150)], fill=YELLOW)
    d.rectangle([0, 150, 6, 362], fill=(0, 0, 0, 0)); d.rectangle([C - 6, 150, C, 362], fill=(0, 0, 0, 0))
    m = Image.new('L', (C, C), 0); ImageDraw.Draw(m).rectangle([0, 150, C, 362], fill=255)
    out = cell(); out.paste(im, (0, 0), m)
    return out


def caution():
    im = cell(); d = ImageDraw.Draw(im)
    centred(d, 'CAUTION', font(120), 170, YELLOW)
    d.rectangle([60, 320, C - 60, 342], fill=YELLOW)
    return im


def service():
    im = cell(); d = ImageDraw.Draw(im)
    centred(d, 'SERVICE', font(116), 140, WHITE)
    for y, w in ((300, 380), (338, 380), (376, 220)):
        d.rectangle([(C - w) / 2, y, (C + w) / 2, y + 14], fill=WHITE)
    return im


def tally():
    im = cell(); d = ImageDraw.Draw(im)
    for k in range(4):
        x = 140 + k * 68
        d.polygon([(x, 120), (x + 26, 120), (x + 10, 400), (x - 16, 400)], fill=WHITE)
    d.polygon([(90, 330), (430, 150), (440, 175), (100, 356)], fill=WHITE)   # the fifth, struck through
    return im


atlas = Image.new('RGBA', (C * 4, C * 2), (0, 0, 0, 0))
for i, f in enumerate([unit, emblem, stripes, caution, service, tally]):
    atlas.paste(f(), ((i % 4) * C, (i // 4) * C))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
atlas.save(OUT)
print('saved', OUT, atlas.size)
