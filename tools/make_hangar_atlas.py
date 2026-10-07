"""THE LAUNCH BAY'S SURFACE DETAIL (2026-10-07), in the design language of Sigma's rifle (assets/tex/rifle2_game_*.png —
its SHAPES, light inlays and the way it uses its texture, NOT its colours): chamfered / cut-corner armour panels with
recessed capsule slots, rows of diagonal louvre marks, bolt dots, small stencil blocks, knurled grip insets and small
bright rectangular light inlays (an emissive mask in the albedo's alpha, as the rifle's atlas carries it).

A 3 x 3 atlas of TILING cells (2040 px, 680 a cell), greyscale (the bay keeps its own material colours — the shader
multiplies this detail onto them: shaders.js texSet 9), + an ORM map (R ambient occlusion, G roughness, B metal factor):
  0 armour panel   1 louvre vent    2 perforated grate
  3 deck plate     4 frame metal    5 pipe bands
  6 knurled grip   7 lamp housing   8 plain
blender/hangar_v2.py box-projects every face into its material's cell (uv.y / 10 = the cell, as the dreadnought's atlas).
Output: assets/tex/hangar_albedo.png, assets/tex/hangar_orm.png.  usage: uv run --with pillow --with numpy tools/make_hangar_atlas.py"""
import os, math, numpy as np
from PIL import Image, ImageDraw, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = 680; N = 3; S = C * N
rng = np.random.default_rng(11)


def cell_canvas(v=150):
    return Image.new('L', (C, C), v), Image.new('L', (C, C), 0), Image.new('L', (C, C), 255), Image.new('L', (C, C), 140)   # albedo, glow, AO, rough


def chamfer_poly(x0, y0, x1, y1, c):
    return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]


def groove(d, pts, w, val=55, closed=True):
    pts = pts + [pts[0]] if closed else pts
    d.line(pts, fill=val, width=w, joint='curve')


def bolts(dA, dO, pts, r=7):
    for (x, y) in pts:
        dA.ellipse([x - r, y - r, x + r, y + r], fill=70); dA.ellipse([x - r + 3, y - r + 3, x + r - 4, y + r - 4], fill=185)
        dO.ellipse([x - r - 2, y - r - 2, x + r + 2, y + r + 2], fill=150)


def stencil(d, x, y, n=3, w=60):
    for k in range(n):
        ww = int(w * (0.55 + 0.45 * rng.random()))
        d.rectangle([x, y + k * 11, x + ww, y + k * 11 + 5], fill=85)


def louvres(d, x, y, n=6, L=46, step=14, val=60):
    for k in range(n):
        d.line([(x + k * step, y + L), (x + k * step + L * 0.55, y)], fill=val, width=5)


def capsule(d, x, y, w, h, val):
    r = w // 2
    d.rounded_rectangle([x, y, x + w, y + h], radius=r, fill=val)


def c_armour():
    A, G, O, Rg = cell_canvas(160); dA, dG, dO, dR = ImageDraw.Draw(A), ImageDraw.Draw(G), ImageDraw.Draw(O), ImageDraw.Draw(Rg)
    m = 14
    groove(dA, chamfer_poly(m, m, C - m, C - m, 70), 7); groove(dO, chamfer_poly(m, m, C - m, C - m, 70), 11, 120)
    dA.polygon(chamfer_poly(60, 60, C - 60, C - 60, 90), fill=172); groove(dA, chamfer_poly(60, 60, C - 60, C - 60, 90), 4, 95)
    # the long recessed capsule slot down the middle, a hair-thin light in it
    capsule(dA, C // 2 - 26, 140, 52, C - 280, 60); capsule(dO, C // 2 - 30, 136, 60, C - 272, 110)
    dG.rectangle([C // 2 - 3, 170, C // 2 + 3, C - 170], fill=255); dA.rectangle([C // 2 - 3, 170, C // 2 + 3, C - 170], fill=235)
    # side capsule cut-outs (as the rifle's flank)
    for sx in (150, C - 150 - 40):
        capsule(dA, sx, 200, 40, 170, 95); capsule(dA, sx + 6, 206, 28, 158, 70)
    louvres(dA, 110, C - 210); louvres(dA, C - 200, C - 210)
    bolts(dA, dO, [(46, 46), (C - 46, 46), (46, C - 46), (C - 46, C - 46), (C // 2, 40), (C // 2, C - 40)])
    stencil(dA, 92, 96); stencil(dA, C - 160, 96, 2, 50)
    for (x, y) in ((C - 120, C - 120), (100, C - 128)):          # small square light inlays in dark sockets
        dA.rectangle([x - 14, y - 9, x + 14, y + 9], fill=55); dA.rectangle([x - 9, y - 4, x + 9, y + 4], fill=230); dG.rectangle([x - 9, y - 4, x + 9, y + 4], fill=255)
    return A, G, O, Rg


def c_louvre():
    A, G, O, Rg = cell_canvas(120); dA, dG, dO = ImageDraw.Draw(A), ImageDraw.Draw(G), ImageDraw.Draw(O)
    groove(dA, chamfer_poly(20, 20, C - 20, C - 20, 60), 8, 60)
    for k in range(16):
        y = 70 + k * 34
        dA.polygon([(60, y), (C - 60, y), (C - 60, y + 14), (60, y + 22)], fill=175); dA.line([(60, y + 22), (C - 60, y + 14)], fill=45, width=6)
        dO.line([(60, y + 26), (C - 60, y + 18)], fill=90, width=10)
    dG.rectangle([90, C - 46, C - 90, C - 40], fill=255); dA.rectangle([90, C - 46, C - 90, C - 40], fill=225)
    bolts(dA, dO, [(36, 36), (C - 36, 36), (36, C - 36), (C - 36, C - 36)], 6)
    return A, G, O, Rg


def c_grate():
    A, G, O, Rg = cell_canvas(150); dA, dO = ImageDraw.Draw(A), ImageDraw.Draw(O)
    p = 34
    for j in range(C // p + 1):
        for i in range(C // p + 1):
            x, y = i * p + (p // 2 if j % 2 else 0), j * p * 0.87
            dA.regular_polygon((x % C, y, 12), 6, fill=25); dO.regular_polygon((x % C, y, 15), 6, fill=60)
    return A, G, O, Rg


def c_deck():
    A, G, O, Rg = cell_canvas(140); dA, dO = ImageDraw.Draw(A), ImageDraw.Draw(O)
    for (x0, y0) in ((0, 0), (C // 2, 0), (0, C // 2), (C // 2, C // 2)):
        groove(dA, chamfer_poly(x0 + 6, y0 + 6, x0 + C // 2 - 6, y0 + C // 2 - 6, 26), 5, 60)
        bolts(dA, dO, [(x0 + 26, y0 + 26), (x0 + C // 2 - 26, y0 + 26), (x0 + 26, y0 + C // 2 - 26), (x0 + C // 2 - 26, y0 + C // 2 - 26)], 6)
    for j in range(0, C, 30):                                     # diamond tread
        for i in range(0, C, 30):
            if (i // 30 + j // 30) % 2: dA.line([(i + 6, j + 6), (i + 22, j + 22)], fill=165, width=4)
            else: dA.line([(i + 22, j + 6), (i + 6, j + 22)], fill=165, width=4)
    return A, G, O, Rg


def c_frame():
    A, G, O, Rg = cell_canvas(150); dA, dG, dO = ImageDraw.Draw(A), ImageDraw.Draw(G), ImageDraw.Draw(O)
    a = np.array(A, float) + rng.normal(0, 6, (C, 1)) * np.ones((1, C))      # brushed along the length
    A = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); dA = ImageDraw.Draw(A)
    for y in (C // 2,): dA.line([(0, y), (C, y)], fill=60, width=5); dO.line([(0, y), (C, y)], fill=120, width=9)
    for x in range(40, C, 80): bolts(dA, dO, [(x, 30), (x, C // 2 + 30), (x, C - 30)], 5)
    for x in (C // 4, 3 * C // 4):                                # tiny dot inlays
        dA.rectangle([x - 4, C // 2 - 20, x + 4, C // 2 - 12], fill=230); dG.rectangle([x - 4, C // 2 - 20, x + 4, C // 2 - 12], fill=255)
    louvres(dA, 60, C // 2 + 80, 5, 40, 13, 75); stencil(dA, C - 160, 70)
    return A, G, O, Rg


def c_pipe():
    A, G, O, Rg = cell_canvas(150); dA, dO = ImageDraw.Draw(A), ImageDraw.Draw(O)
    for y in range(0, C, C // 4):
        dA.rectangle([0, y, C, y + 26], fill=95); dA.rectangle([0, y + 8, C, y + 18], fill=120); dO.rectangle([0, y - 4, C, y + 30], fill=150)
        for x in range(30, C, 120): bolts(dA, dO, [(x, y + 13)], 5)
    return A, G, O, Rg


def c_knurl():
    A, G, O, Rg = cell_canvas(90); dA = ImageDraw.Draw(A)
    for k in range(-C, 2 * C, 16):
        dA.line([(k, 0), (k + C, C)], fill=45, width=4); dA.line([(k + C, 0), (k, C)], fill=45, width=4)
    return A, G, O, Rg


def c_lamp():
    A, G, O, Rg = cell_canvas(130); dA, dG = ImageDraw.Draw(A), ImageDraw.Draw(G)
    groove(dA, chamfer_poly(30, 30, C - 30, C - 30, 80), 10, 50)
    for k in range(6):
        y = 120 + k * 80
        dA.rectangle([110, y, C - 110, y + 10], fill=230); dG.rectangle([110, y, C - 110, y + 10], fill=255)
    return A, G, O, Rg


def c_plain():
    return cell_canvas(150)


CELLS = [c_armour, c_louvre, c_grate, c_deck, c_frame, c_pipe, c_knurl, c_lamp, c_plain]
alb = Image.new('RGBA', (S, S)); orm = Image.new('RGB', (S, S))
for k, fn in enumerate(CELLS):
    A, Gl, O, Rg = fn()
    A = A.filter(ImageFilter.GaussianBlur(0.7)); O = O.filter(ImageFilter.GaussianBlur(3))
    x, y = (k % N) * C, (k // N) * C
    alb.paste(Image.merge('RGBA', (A, A, A, Gl)), (x, y))
    metal = Image.new('L', (C, C), 200)
    orm.paste(Image.merge('RGB', (O, Rg, metal)), (x, y))
os.makedirs(os.path.join(ROOT, 'assets', 'tex'), exist_ok=True)
alb.save(os.path.join(ROOT, 'assets', 'tex', 'hangar_albedo.png')); orm.save(os.path.join(ROOT, 'assets', 'tex', 'hangar_orm.png'))
print('saved assets/tex/hangar_albedo.png, hangar_orm.png', S)
