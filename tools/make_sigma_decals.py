"""Sigma's decal atlas (2026-10-06, with the black matte scheme): assets/tex/src/sigma_decals.png, a 4 x 2 grid of 512 px
RGBA cells, baked onto the mech by blender/bake_mechs.py (MODEL_OPTS gundam 'decals': cell index = id - 1).
  1 'praise the sun' — a figure, arms flung up in a V, under a rayed sun (our own emblem: a gesture, not a copy of any
    game's icon)   2 the sun alone (shoulders)   3 unit mark 'Σ'
usage: uv run --with pillow tools/make_sigma_decals.py"""
import math, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'tex', 'src', 'sigma_decals.png')
FONT = '/mnt/c/Windows/Fonts/bahnschrift.ttf'
C, SS = 512, 4   # cell, supersampling
GOLD, BONE = (240, 182, 52, 255), (232, 226, 210, 255)


def sun(d, cx, cy, r, n=16, s=1.0):
    """a disc and alternating long / short straight rays"""
    for k in range(n):
        a = k / n * 2 * math.pi - math.pi / 2
        r0, r1, w = r * 1.22, r * (1.95 if k % 2 == 0 else 1.55), 0.075 if k % 2 == 0 else 0.06
        pts = [(cx + math.cos(a - w) * r0, cy + math.sin(a - w) * r0), (cx + math.cos(a) * r1, cy + math.sin(a) * r1),
               (cx + math.cos(a + w) * r0, cy + math.sin(a + w) * r0)]
        d.polygon([(x * s, y * s) for x, y in pts], fill=GOLD)
    d.ellipse([(cx - r) * s, (cy - r) * s, (cx + r) * s, (cy + r) * s], fill=GOLD)


def thick(d, a, b, w, s, fill):
    d.line([(a[0] * s, a[1] * s), (b[0] * s, b[1] * s)], fill=fill, width=int(w * s))
    for p in (a, b):
        d.ellipse([(p[0] - w / 2) * s, (p[1] - w / 2) * s, (p[0] + w / 2) * s, (p[1] + w / 2) * s], fill=fill)


def cell(fn):
    im = Image.new('RGBA', (C * SS, C * SS), (0, 0, 0, 0))
    fn(ImageDraw.Draw(im), SS)
    return im.resize((C, C), Image.LANCZOS)


def praise(d, s):
    sun(d, 256, 128, 52, 16, s)
    # the figure: head, a tapering body, arms thrown up and out in a wide V, legs braced apart
    d.ellipse([(256 - 25) * s, (282 - 25) * s, (256 + 25) * s, (282 + 25) * s], fill=BONE)
    d.polygon([(x * s, y * s) for x, y in [(226, 318), (286, 318), (272, 410), (240, 410)]], fill=BONE)
    for sg in (-1, 1):
        sh, el, hd = (256 + sg * 30, 326), (256 + sg * 78, 270), (256 + sg * 128, 206)
        thick(d, sh, el, 24, s, BONE); thick(d, el, hd, 21, s, BONE)
        thick(d, (256 + sg * 12, 404), (256 + sg * 44, 492), 24, s, BONE)


def sun_only(d, s):
    sun(d, 256, 256, 110, 16, s)


def sigma(d, s):
    f = ImageFont.truetype(FONT, 330 * s)
    try:
        f.set_variation_by_axes([700, 100])
    except Exception:
        pass
    w = d.textlength('Σ', font=f)
    d.text(((C * s - w) / 2, 40 * s), 'Σ', font=f, fill=BONE)
    d.rectangle([90 * s, 440 * s, 422 * s, 462 * s], fill=GOLD)


atlas = Image.new('RGBA', (C * 4, C * 2), (0, 0, 0, 0))
for i, f in enumerate([praise, sun_only, sigma]):
    atlas.paste(cell(f), ((i % 4) * C, (i // 4) * C))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
atlas.save(OUT)
print('saved', OUT, atlas.size)
