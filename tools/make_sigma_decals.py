"""Sigma's decal atlas: assets/tex/src/sigma_decals.png, a 4 x 2 grid of 1024 px RGBA cells (sharp when baked), put on
the mech by blender/bake_mechs.py (MODEL_OPTS gundam 'decals': cell index = id - 1).
  1 the sun-god cult's emblem — a horned skull, skeletal arms raising a black-and-gold thorned sun (chest, backpack)
  2 its shoulder badge — a skull whose cranium is a black sun, a blood-red eclipse behind (both shoulders)
  3 unit mark 'Σ'
Cells 1 and 2 are Codex-generated artwork, simplified to two colours here, (assets/tex/src/sigma_suncult_emblem.png / sigma_suncult_shoulder.png, made
for this film; 2026-10-06); without them the first, plain versions are drawn (a figure under a sun, a sun).
usage: uv run --with pillow tools/make_sigma_decals.py"""
import math, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'tex', 'src', 'sigma_decals.png')
FONT = '/mnt/c/Windows/Fonts/bahnschrift.ttf'
C, SS = 1024, 2   # cell, supersampling
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
    fn(ImageDraw.Draw(im), SS * C / 512)   # (the drawings are laid out on a 512 grid)
    return im.resize((C, C), Image.LANCZOS)


def simplify(im):
    """(2026-10-06: 'too busy') two colours only — the black linework cut out (the armour shows through), the reds folded
    into the gold, the bone kept — the shapes smoothed and specks smaller than a few pixels dropped"""
    from PIL import ImageFilter
    im = im.convert('RGBA'); px = im.load(); W, H = im.size
    gold, bone = (226, 168, 52), (232, 226, 208)
    a = Image.new('L', im.size, 0); col = Image.new('RGB', im.size); pa, pc = a.load(), col.load()
    for y in range(H):
        for x in range(W):
            r, g, b, al = px[x, y]
            if al < 128 or max(r, g, b) < 70: continue                       # transparent / black linework → cut out
            sat = max(r, g, b) - min(r, g, b)
            pc[x, y] = bone if sat < 60 and r > 150 else gold                 # bone stays bone; gold and red → gold
            pa[x, y] = 255
    a = a.filter(ImageFilter.GaussianBlur(2.2)).point(lambda v: 255 if v > 140 else 0)   # smoothed, the fine detail merged
    a = a.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))              # specks dropped
    col = col.filter(ImageFilter.ModeFilter(7))                                          # flat colour areas
    out = col.convert('RGBA'); out.putalpha(a)
    return out


def art(fname, fallback):
    """a Codex artwork cell: simplified, its opaque bounds fitted into the cell (a small margin), or the drawn fallback"""
    path = os.path.join(ROOT, 'assets', 'tex', 'src', fname)
    if not os.path.exists(path):
        return cell(fallback)
    im = simplify(Image.open(path)); bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox() or (0, 0, *im.size)
    im = im.crop(bb); k = C * 0.94 / max(im.size); im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    out = Image.new('RGBA', (C, C), (0, 0, 0, 0)); out.paste(im, ((C - im.width) // 2, (C - im.height) // 2), im)
    return out


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
    d.text(((512 * s - w) / 2, 40 * s), 'Σ', font=f, fill=BONE)
    d.rectangle([90 * s, 440 * s, 422 * s, 462 * s], fill=GOLD)


atlas = Image.new('RGBA', (C * 4, C * 2), (0, 0, 0, 0))
for i, c in enumerate([art('sigma_suncult_emblem.png', praise), art('sigma_suncult_shoulder.png', sun_only), cell(sigma)]):
    atlas.paste(c, ((i % 4) * C, (i // 4) * C))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
atlas.save(OUT)
print('saved', OUT, atlas.size)
