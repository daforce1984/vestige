"""VANGUARD's SHIELD DRONE, revision 2 (2026-10-07), after the Codex sheet assets/tex/src/shield_drone_concept_v2.png
(revision 1: shield_drone_concept_v1.png): a THIN plate (~0.4 m at the rim, half of v1), gently CURVED — convex across its
width (the edges swept back ~0.45 m) and a little along its length — with no decals; thrusters facing EVERY way: four round
nozzles flush in the back (backward), vectoring vents set into the rim on the sides (left / right), the top edge (up), the
tip (down) and ports on the face's rim (forward).

Built in the frame of enemy_ms.glb's 'shield' part (the film places it with the same matrix — duel.js shieldDrone /
fk.shield): glTF +X = the face's normal, +Y = the long axis (top 1.65, tip -6.9), +Z = across (centre 0.17). One node,
'shield'. Build: blender -b --factory-startup --python blender/build_models.py -- shield_drone"""
import math
from lib import MB, reg

ZC = 0.17                                   # the plate's centre across
MID = 1.25                                  # its mid-surface at the centre (the face ≈ 1.42: duel.js SHIELD_C 1.35)
HW = 1.75
K = [(ZC - 0.78, 1.65), (ZC + 0.78, 1.65), (ZC + HW, 0.75), (ZC + HW, -2.7), (ZC + 0.18, -6.62), (ZC, -6.9),
     (ZC - 0.18, -6.62), (ZC - HW, -2.7), (ZC - HW, 0.75)]
CEN = (ZC, -2.0)


def G(x, y, z): return (x, -z, y)            # glTF (part frame) -> Blender


def bend(z, y):
    """the curve: the mid-surface's x at (z, y) — convex across, a slight bow along"""
    dz = z - ZC
    return MID - 0.147 * dz * dz - 0.15 * ((y + 2.6) / 4.3) ** 2


def palette():
    reg('red', (0.2, 0.018, 0.022), 0.35, 0.36)             # oxblood enamel
    reg('charcoal', (0.07, 0.072, 0.08), 0.55, 0.45)
    reg('frame', (0.24, 0.245, 0.26), 0.85, 0.32)           # machined gunmetal
    reg('nozzle', (0.04, 0.04, 0.045), 0.9, 0.35)
    reg('glow_y', (0.9, 0.6, 0.1), 0.0, 0.3, (1.0, 0.68, 0.15), 0.6)
    reg('jet_glow', (0.9, 0.4, 0.1), 0.0, 0.3, (1.0, 0.45, 0.12), 2.0)


# ---------------------------------------------------------------- polygon helpers (z, y)
def _area(p): return 0.5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(p, p[1:] + p[:1]))


def offset(poly, d):
    s = 1 if _area(poly) > 0 else -1
    n = len(poly); lines = []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        ex, ey = b[0] - a[0], b[1] - a[1]; L = math.hypot(ex, ey)
        lines.append(((a[0] - ey / L * s * d, a[1] + ex / L * s * d), (ex, ey)))
    out = []
    for i in range(n):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        den = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(den) < 1e-9: out.append(p2); continue
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
        out.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
    return out


def clip(poly, nz, ny, c):
    out = []
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        fa, fb = nz * a[0] + ny * a[1] - c, nz * b[0] + ny * b[1] - c
        if fa <= 0: out.append(a)
        if (fa < 0) != (fb < 0) and fa != fb:
            t = fa / (fa - fb); out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def resample(poly, n):
    """n points evenly along the outline (so the rings of a curved surface line up)"""
    segs = [(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]
    lens = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs]; L = sum(lens)
    out, acc, k = [], 0.0, 0
    for i in range(n):
        s = i * L / n
        while k < len(segs) - 1 and acc + lens[k] < s: acc += lens[k]; k += 1
        (a, b), f = segs[k], (s - acc) / max(lens[k], 1e-9)
        out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return out


def centroid(p): return (sum(q[0] for q in p) / len(p), sum(q[1] for q in p) / len(p))


def curved_solid(mb, poly, lo, hi, mat, n=48, rings=5):
    """a solid between two offsets from the curved mid-surface (lo..hi) over the outline poly: concentric rings follow the curve"""
    P = resample(poly, n); C = centroid(poly)
    def ring(s, off):
        out = []
        for (z, y) in P:
            zz, yy = C[0] + (z - C[0]) * s, C[1] + (y - C[1]) * s
            out.append(G(bend(zz, yy) + off, yy, zz))
        return out
    sc = [1.0 - k / rings * 0.94 for k in range(1, rings + 1)]
    mb.loft([ring(1.0, lo), ring(1.0, hi)] + [ring(s, hi) for s in sc], mat, cap0=False, cap1=True)
    mb.loft([ring(s, lo) for s in sc[::-1]] + [ring(1.0, lo)], mat, cap0=True, cap1=False)


def rim_strip(mb, a, b, t0, t1, w, lo, hi, mat, out=0.0, segs=6):
    """a strip along the outline edge a-b (t0..t1 of it), w wide inward (out: pushed outward), lo..hi about the curve"""
    ex, ey = b[0] - a[0], b[1] - a[1]; L = math.hypot(ex, ey); nx, ny = -ey / L, ex / L
    if nx * (CEN[0] - (a[0] + b[0]) / 2) + ny * (CEN[1] - (a[1] + b[1]) / 2) < 0: nx, ny = -nx, -ny   # inward
    for k in range(segs):
        u0, u1 = t0 + (t1 - t0) * k / segs, t0 + (t1 - t0) * (k + 1) / segs
        pts = [(a[0] + ex * u + nx * o, a[1] + ey * u + ny * o) for (u, o) in ((u0, -out), (u1, -out), (u1, w - out), (u0, w - out))]
        mb.hexa([G(bend(z, y) + lo, y, z) for (z, y) in pts] + [G(bend(z, y) + hi, y, z) for (z, y) in pts], mat)


def quad_on(mb, q, lo, hi, mat, bevel=0.0):
    mb.hexa([G(bend(z, y) + lo, y, z) for (z, y) in q] + [G(bend(z, y) + hi, y, z) for (z, y) in q], mat, bevel=bevel)


def shield_drone():
    palette()
    mb = MB()
    nK = len(K)
    # ---- the body: a thin curved core plate
    curved_solid(mb, offset(K, 0.18), -0.08, 0.06, 'charcoal', n=56, rings=6)
    # ---- the rim all round (0.4 m thick), gunmetal
    for i in range(nK):
        a, b = K[i], K[(i + 1) % nK]
        rim_strip(mb, a, b, 0.0, 1.0, 0.3, -0.2, 0.2, 'frame', segs=8 if math.hypot(b[0] - a[0], b[1] - a[1]) > 2 else 3)
    # ---- the face: oxblood plates either side of the spine, panel-lined (three per side)
    A = offset(K, 0.3)
    for side in (-1, 1):
        half = clip(A, -side, 0, -side * (ZC + side * 0.27))
        for (ya, yb) in ((1.7, -0.95), (-1.0, -3.35), (-3.4, -7.0)):
            pc = clip(clip(half, 0, -1, -yb), 0, 1, ya)
            if len(pc) >= 3: curved_solid(mb, pc, 0.05, 0.14, 'red', n=32, rings=4)
    # ---- the spine down the face (raised, gunmetal) with amber lights, and down the back with vents and a centre block
    for k in range(13):
        y0, y1 = 1.45 - k * 0.62, 1.45 - (k + 1) * 0.62 + 0.04
        if y1 < -6.2: break
        q = [(ZC - 0.22, y0), (ZC + 0.22, y0), (ZC + 0.22, y1), (ZC - 0.22, y1)]
        quad_on(mb, q, 0.05, 0.2, 'frame'); quad_on(mb, q, -0.2, -0.06, 'frame')
    for y in (1.0, -0.6, -3.0, -5.2):
        quad_on(mb, [(ZC - 0.05, y + 0.2), (ZC + 0.05, y + 0.2), (ZC + 0.05, y - 0.2), (ZC - 0.05, y - 0.2)], 0.2, 0.215, 'glow_y')
    for (yc, h) in ((0.2, 0.9), (-3.9, 0.9), (-5.6, 0.6)):                  # back vents (louvred)
        for j in range(5):
            yy = yc + h / 2 - (j + 0.5) * h / 5
            quad_on(mb, [(ZC - 0.18, yy + 0.05), (ZC + 0.18, yy + 0.05), (ZC + 0.18, yy - 0.05), (ZC - 0.18, yy - 0.05)], -0.25, -0.2, 'nozzle')
    quad_on(mb, [(ZC - 0.42, -1.4), (ZC + 0.42, -1.4), (ZC + 0.42, -2.3), (ZC - 0.42, -2.3)], -0.3, -0.06, 'frame', bevel=0.03)   # the back's centre block
    # ---- four main nozzles flush in the back (backward)
    for (y, dz) in ((0.55, 0.9), (0.55, -0.9), (-3.25, 0.8), (-3.25, -0.8)):
        z = ZC + dz; xb = bend(z, y) - 0.08
        mb.cyl(G(xb + 0.04, y, z), G(xb - 0.1, y, z), 0.46, 0.46, 'frame', seg=24)
        mb.nozzle(G(xb - 0.06, y, z), (-1, 0, 0), 0.36, 'nozzle', 'jet_glow', length=0.14, seg=24)
    # ---- vectoring vents set into the rim, every way: sides, top, tip, the chamfers (outward-facing, a glowing slot each)
    def vent(i, t0, t1):
        a, b = K[i], K[(i + 1) % nK]
        rim_strip(mb, a, b, t0, t1, 0.24, -0.13, 0.13, 'nozzle', out=0.04, segs=2)
        rim_strip(mb, a, b, t0 + 0.02, t1 - 0.02, 0.03, -0.09, 0.09, 'glow_y', out=0.06, segs=2)
    vent(2, 0.25, 0.5); vent(2, 0.62, 0.86)            # one side, upper (out to the side)
    vent(7, 0.14, 0.38); vent(7, 0.5, 0.74)            # the other side
    vent(3, 0.2, 0.36); vent(6, 0.64, 0.8)             # the taper (down-and-out)
    vent(0, 0.25, 0.75)                                # the top edge (up)
    vent(4, 0.1, 0.9); vent(5, 0.1, 0.9)               # the tip (down)
    vent(1, 0.3, 0.7); vent(8, 0.3, 0.7)               # the chamfers (up-and-out)
    for (z, y) in ((ZC + 1.2, 1.3), (ZC - 1.2, 1.3), (ZC + 1.25, -2.9), (ZC - 1.25, -2.9)):   # forward ports on the face's rim
        q = [(z - 0.18, y + 0.09), (z + 0.18, y + 0.09), (z + 0.18, y - 0.09), (z - 0.18, y - 0.09)]
        quad_on(mb, q, 0.14, 0.22, 'nozzle'); quad_on(mb, q, 0.22, 0.23, 'glow_y')
    for (i, t) in ((2, 0.08), (2, 0.95), (7, 0.05), (7, 0.92), (3, 0.62), (6, 0.38), (0, 0.12), (0, 0.88)):   # amber edge lights
        a, b = K[i], K[(i + 1) % nK]
        rim_strip(mb, a, b, t - 0.025, t + 0.025, 0.06, 0.2, 0.215, 'glow_y', out=-0.12, segs=1)
    return [mb.to_object('shield', smooth_angle=35)]
