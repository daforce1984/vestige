"""v5 Hiigaran capital ships: original 'space workhorse' designs in the style language of the user's first
reference - a long boxy upper hull of stacked, offset, chamfered rectangular sections in off-white/light-grey
paint with seams, access panels, stepped plates and sparse stencil marks; a dense dark brown-grey mechanical
underbelly (pipes, cargo modules, tanks, pods, struts); a flat, wide stacked bridge tower top-rear; a big
cylindrical thruster block with ribbed rings at the stern; a blunt flat bow. Hiigaran rust/blue accents.
Blender space: nose -Y (station s = -y), up +Z, +X = starboard (glTF +X)."""
import math
from mathutils import Vector, Matrix
from lib import MB, reg, empty, rng, lerp, annulus, D2R
from shipkit import Hull, plate, obox, deep_nozzle, turret, spine, windows

CH = [(1, -0.8), (1, 0.8), (0.9, 1), (-0.9, 1), (-1, 0.8), (-1, -0.8), (-0.9, -1), (0.9, -1)]   # chamfered box
# CH edges: 0 stbd side, 1 stbd top chamfer, 2 top, 3 port top chamfer, 4 port side, 5 port low chamfer, 6 bottom, 7 stbd low


def palette(engine_rgb=(1.0, 0.62, 0.25)):
    reg('paint', (0.60, 0.60, 0.57), 0.3, 0.55)       # off-white / light grey armour paint
    reg('paint2', (0.46, 0.45, 0.42), 0.3, 0.6)       # grime-darkened panels
    reg('paint3', (0.34, 0.33, 0.31), 0.3, 0.62)      # heavy grime / worn panels
    reg('belly', (0.075, 0.066, 0.058), 0.8, 0.45)    # dark brown-grey mechanics
    reg('belly2', (0.20, 0.17, 0.14), 0.7, 0.5)
    reg('rust2', (0.18, 0.09, 0.05), 0.6, 0.55)      # rusty brown mechanics
    reg('metal', (0.50, 0.50, 0.52), 0.9, 0.3)
    reg('rust', (0.42, 0.075, 0.035), 0.3, 0.5)       # Hiigaran accent
    reg('blue', (0.03, 0.10, 0.34), 0.3, 0.45)        # Hiigaran accent
    reg('yellow', (0.85, 0.58, 0.05), 0.25, 0.5)
    reg('orange', (0.9, 0.3, 0.03), 0.25, 0.5)
    reg('glass', (0.03, 0.05, 0.07), 0.0, 0.05)
    reg('window', (0.3, 0.25, 0.2), 0.0, 0.4, (1.0, 0.85, 0.62), 2.5)
    reg('engine', (0.3, 0.2, 0.1), 0.0, 0.3, engine_rgb, 3.0)
    reg('muzzle', (0.2, 0.3, 0.4), 0.0, 0.3, (0.5, 0.8, 1.0), 6.0)


def chevron(mb, pos, n, size, mat):
    b_ = Vector((0, 1, 0))
    for sg in (1, -1):
        obox(mb, pos + b_ * sg * size * 0.25, n, (size * 0.18, size * 0.6, 0.02 * size), mat, lift=0.0,
             spin=sg * 0.7)


def hazard(mb, pos, n, size, k=6):
    for i in range(k):
        p = pos + Vector((0, (i - k / 2) * size * 0.25, 0))
        obox(mb, p, n, (size * 0.3, size * 0.12, 0.02 * size), 'yellow' if i % 2 else 'belly', lift=0.0, spin=0.6)


def tri(mb, pos, n, size, mat):
    mb.cyl(pos, pos + n * 0.03 * size, size * 0.5, size * 0.5, mat, seg=3)


def section(mb, s0, s1, w, h, cz, R, k, accent=None, cx=0.0):
    """One stacked hull section with seams, stepped plates, access panels and stencils. k = detail scale."""
    H = Hull([(s0, w * 0.97, h * 0.96, cz, cx), (s0 + k * 0.8, w, h, cz, cx), (s1 - k * 0.8, w, h, cz, cx),
              (s1, w * 0.97, h * 0.96, cz, cx)], CH)
    H.build(mb, R.choice(['paint', 'paint', 'paint', 'paint2']))
    L = s1 - s0
    # stepped plates on the top and upper sides
    for e in (0, 2, 4):
        s = s0 + k * 1.2
        while s < s1 - k * 2:
            ln = min(R.uniform(3, 9) * k, s1 - k - s)
            if R.random() < 0.55:
                pa, pb = e + R.uniform(0.05, 0.3), e + R.uniform(0.6, 0.95)
                plate(mb, H, s, s + ln, pa, pb, R.choice(['paint', 'paint2', 'paint2', 'paint3']), off=0.0,
                      thick=0.12 * k, ch=0.1 * k)
            s += ln + R.uniform(0.3, 1.5) * k
    # seams across the section
    for f in (0.33, 0.66):
        ss = lerp(s0, s1, f) + R.uniform(-0.05, 0.05) * L
        for e in (0, 2, 4):
            pos, n = H.pt(ss, e + 0.5, 0.0)
            obox(mb, pos, n, (0.12 * k if e != 2 else w * 0.9, 0.12 * k, 0.05 * k) if e == 2 else
                 (h * 0.9, 0.12 * k, 0.05 * k), 'belly', lift=0.0)
    # access panels + vents
    for _ in range(int(L / (3 * k)) + 2):
        e = R.choice([0, 0, 2, 4, 4])
        pos, n = H.pt(R.uniform(s0 + k, s1 - k), e + R.uniform(0.15, 0.85), 0.0)
        if R.random() < 0.6:
            obox(mb, pos, n, (R.uniform(0.6, 1.6) * k, R.uniform(0.8, 2.2) * k, 0.08 * k), 'paint2', lift=0.0,
                 bevel=0.02 * k)
        else:
            for j in range(4):
                obox(mb, pos + Vector((0, j * 0.25 * k, 0)), n, (0.9 * k, 0.1 * k, 0.06 * k), 'belly', lift=0.0)
    # sparse stencil marks
    if R.random() < 0.7:
        pos, n = H.pt(R.uniform(s0 + 2 * k, s1 - 2 * k), R.choice([0.3, 4.7]), 0.0)
        chevron(mb, pos, n, 1.4 * k, R.choice(['yellow', 'orange']))
    if R.random() < 0.5:
        pos, n = H.pt(R.uniform(s0 + 2 * k, s1 - 2 * k), R.choice([2.2, 2.8]), 0.0)
        hazard(mb, pos, n, 1.5 * k)
    if R.random() < 0.6:
        pos, n = H.pt(R.uniform(s0 + 2 * k, s1 - 2 * k), R.choice([0.7, 4.3]), 0.0)
        tri(mb, pos, n, 0.9 * k, R.choice(['yellow', 'orange']))
    for _ in range(2):   # registry-style blocks
        pos, n = H.pt(R.uniform(s0 + 2 * k, s1 - 2 * k), R.choice([0.55, 4.45]), 0.0)
        obox(mb, pos, n, (0.7 * k, 2.0 * k, 0.03 * k), R.choice(['belly2', 'paint3']), lift=0.0)
    if R.random() < 0.55 and L > 8 * k:   # raised deck block (stacked, offset) -> medium-scale shape
        da, db = s0 + L * R.uniform(0.1, 0.3), s1 - L * R.uniform(0.1, 0.3)
        dw, dh = w * R.uniform(0.45, 0.7), h * R.uniform(0.18, 0.3)
        dx = R.uniform(-0.12, 0.12) * w
        D = Hull([(da, dw * 0.9, dh * 0.8, cz + h / 2 + dh * 0.4, dx), (da + k, dw, dh, cz + h / 2 + dh * 0.5, dx),
                  (db - k, dw, dh, cz + h / 2 + dh * 0.5, dx), (db, dw * 0.9, dh * 0.8, cz + h / 2 + dh * 0.4, dx)], CH)
        D.build(mb, R.choice(['paint', 'paint2']))
        for p in (0.5, 4.5):
            windows(mb, D, da + 1.5 * k, db - 1.5 * k, p, off=0.02, pitch=1.0 * k, size=(0.25 * k, 0.5 * k, 0.05 * k),
                    R=R, dropout=0.4)
        pos, n = D.pt((da + db) / 2, 2.5, 0.0)
        obox(mb, pos, n, (dw * 0.5, (db - da) * 0.4, 0.1 * k), 'paint3', lift=0.0, bevel=0.03 * k)
    if accent:
        sa = s0 + L * 0.2
        plate(mb, H, sa, sa + 1.2 * k, 0.02, 4.98, accent, off=0.0, thick=0.08 * k, ch=0.05 * k)
        plate(mb, H, sa + 1.6 * k, sa + 2.0 * k, 0.02, 4.98, 'blue' if accent == 'rust' else 'rust', off=0.0,
              thick=0.08 * k, ch=0.04 * k)
    return H


def underbelly(mb, s0, s1, w, zt, depth, R, k):
    """Dense dark mechanical underbelly hanging below the white hull (zt = hull bottom): a narrow keel with
    pipes, tank clusters, cargo modules, pods and strut frames packed along both flanks and the bottom."""
    kw = w * 0.5
    K = Hull([(s0, kw * 0.8, depth * 0.6, zt - depth * 0.3), (s0 + 4 * k, kw, depth * 0.85, zt - depth * 0.42),
              (s1 - 5 * k, kw, depth * 0.85, zt - depth * 0.42), (s1, kw * 0.6, depth * 0.4, zt - depth * 0.2)], CH)
    K.build(mb, 'belly')
    zb = zt - depth * 0.85
    zm = zt - depth * 0.42
    # longitudinal pipe runs on both flanks at several heights, with clamps
    for sd in (1, -1):
        for zf, r in ((0.2, 0.35), (0.45, 0.5), (0.7, 0.3)):
            z = zt - depth * 0.85 * zf
            x = sd * (kw / 2 + r * k + 0.1 * k)
            mb.cyl((x, -s0 - 3 * k, z), (x, -s1 + 4 * k, z), r * k, r * k, R.choice(['belly2', 'metal', 'rust2']),
                   seg=10)
            s = s0 + 4 * k
            while s < s1 - 5 * k:
                mb.cyl((x, -s, z), (x, -(s + 0.4 * k), z), r * k * 1.35, r * k * 1.35, 'belly', seg=10)
                s += R.uniform(3, 6) * k
    # flank equipment: tank clusters, cargo modules, pods, struts (big -> medium -> small)
    for sd in (1, -1):
        s = s0 + 5 * k
        while s < s1 - 6 * k:
            r = R.random()
            ln = R.uniform(4, 10) * k
            if r < 0.4:      # horizontal tank pair along s
                for zz in (zm + 0.9 * k, zm - 1.4 * k):
                    x = sd * (kw / 2 + 2.0 * k)
                    rr = R.uniform(0.9, 1.3) * k
                    mb.cyl((x, -s, zz), (x, -(s + ln), zz), rr, rr, R.choice(['belly2', 'metal', 'paint3']), seg=16,
                           bevel=0.08 * k)
                    for f in (0.15, 0.85):
                        mb.cyl((x, -(s + ln * f), zz), (x, -(s + ln * f + 0.35 * k), zz), rr * 1.12, rr * 1.12,
                               'belly', seg=16)
            elif r < 0.7:    # cargo module bolted to the flank
                mb.box((sd * (kw / 2 + 1.6 * k), -(s + ln / 2), zm), (3.0 * k, ln, depth * 0.55),
                       R.choice(['belly2', 'paint3', 'belly2', 'rust2']), bevel=0.12 * k)
                for j in range(int(ln / (1.5 * k))):
                    mb.box((sd * (kw / 2 + 3.15 * k), -(s + 0.8 * k + j * 1.5 * k), zm),
                           (0.15 * k, 0.3 * k, depth * 0.45), 'belly')
            elif r < 0.85:   # pod on a strut
                c = Vector((sd * (kw / 2 + 2.4 * k), -(s + ln / 2), zm - 0.5 * k))
                mb.sphere(c, 1.4 * k, 'belly2', seg=14, rings=7, scale=(1, 1.9, 0.9))
                mb.cyl(c, c + Vector((-sd * 2.2 * k, 0, 0.8 * k)), 0.25 * k, 0.25 * k, 'metal', seg=6)
            else:            # open strut frame
                for dz in (-1.0, 1.0):
                    mb.cyl((sd * kw / 2, -s, zm + dz * k), (sd * (kw / 2 + 2.5 * k), -(s + ln), zm - dz * k),
                           0.18 * k, 0.18 * k, 'metal', seg=6)
            s += ln + R.uniform(0.5, 2) * k
    # bottom: keel pipes + hanging modules
    for x in (-0.25, 0.0, 0.25):
        mb.cyl((x * kw, -s0 - 4 * k, zb - 0.3 * k), (x * kw, -s1 + 5 * k, zb - 0.3 * k), 0.4 * k, 0.4 * k,
               'belly2', seg=8)
    s = s0 + 6 * k
    while s < s1 - 8 * k:
        ln = R.uniform(4, 9) * k
        mb.box((R.uniform(-0.2, 0.2) * kw, -(s + ln / 2), zb - 1.1 * k), (kw * R.uniform(0.4, 0.7), ln, 1.6 * k),
               R.choice(['belly2', 'belly', 'paint3']), bevel=0.1 * k)
        s += ln + R.uniform(2, 6) * k
    return K


def thruster_block(mb, c, r, L, k, glow=True, n_rings=5):
    """Big cylindrical thruster block (axis +Y = aft) with ribbed rings and a deep amber bell."""
    c = Vector(c)
    a, b = c - Vector((0, L / 2, 0)), c + Vector((0, L / 2, 0))
    mb.cyl(a, b, r, r * 0.96, 'belly2', seg=28)
    for i in range(n_rings):
        y = lerp(a.y + L * 0.1, b.y - L * 0.1, i / max(1, n_rings - 1))
        mb.cyl((c.x, y - 0.25 * k, c.z), (c.x, y + 0.25 * k, c.z), r * 1.07, r * 1.07, 'metal', seg=28)
    mb.cyl(b, b + Vector((0, 0.8 * k, 0)), r * 1.02, r * 0.9, 'paint2', seg=28)
    deep_nozzle(mb, b + Vector((0, 0.6 * k, 0)), (0, 1, 0), r * 0.78, 'metal', 'belly', 'engine', depth=1.0,
                seg=28, ribs=True)


def bridge_tower(mb, s, zt, w, R, k, cx=0.0):
    """Flat, wide stacked bridge/antenna tower (tiers with window bands) + mast."""
    tiers = [(w * 0.55, 6 * k, 2.2 * k), (w * 0.42, 4.6 * k, 1.8 * k), (w * 0.3, 3.4 * k, 1.5 * k)]
    z = zt
    for i, (tw, tl, th) in enumerate(tiers):
        H = Hull([(s - tl, tw * 0.9, th * 0.9, z + th / 2, cx), (s - tl + 0.4 * k, tw, th, z + th / 2, cx),
                  (s + tl * 0.6, tw, th, z + th / 2, cx), (s + tl * 0.6 + 0.4 * k, tw * 0.92, th * 0.9, z + th / 2, cx)],
                 CH)
        H.build(mb, 'paint' if i != 1 else 'paint2')
        for p in (0.5, 4.5):
            windows(mb, H, s - tl + 0.8 * k, s + tl * 0.6, p, off=0.02 * k, pitch=0.7 * k,
                    size=(0.35 * k, 0.45 * k, 0.05 * k), R=R, dropout=0.15)
        pos, n = H.pt(s + tl * 0.6 + 0.4 * k, 2.5, 0)
        obox(mb, Vector((cx, -(s + tl * 0.6 + 0.45 * k), z + th * 0.55)), Vector((0, -1, 0)),
             (tw * 0.8, th * 0.28, 0.05 * k), 'window', lift=0.0, fwd=Vector((0, 0, 1)))
        z += th
    spine(mb, (cx + w * 0.08, -(s - 2 * k), z), (cx + w * 0.08, -(s - 2 * k), z + 9 * k), 0.12 * k, 'metal', nodes=3)
    spine(mb, (cx - w * 0.1, -(s - 1 * k), z), (cx - w * 0.1, -(s - 1 * k), z + 5 * k), 0.08 * k, 'metal', nodes=2)
    mb.sphere((cx - w * 0.02, -(s + 1 * k), z + 0.3 * k), 0.8 * k, 'metal', seg=12, rings=6, half=True)
    return z


def workhorse(R, L, W, Hh, k, n_sections, belly_depth, sections_bow_frac=0.03, accents=(1, 4)):
    """Assemble stacked sections along s in [-L/2, +L/2]. Returns (mb, sections list, top z)."""
    mb = MB()
    s_lo, s_hi = -L / 2, L / 2
    cuts_ = [s_lo]
    weights = [R.uniform(0.8, 1.3) for _ in range(n_sections)]
    tot = sum(weights)
    for wgt in weights[:-1]:
        cuts_.append(cuts_[-1] + (s_hi - s_lo) * wgt / tot)
    cuts_.append(s_hi)
    secs = []
    for i, (a, b) in enumerate(zip(cuts_, cuts_[1:])):
        f = i / max(1, n_sections - 1)
        w = W * (1.0 - 0.12 * f) * R.uniform(0.95, 1.03)
        h = Hh * R.uniform(0.82, 1.08) * (1.0 - 0.1 * f)
        cz = R.uniform(-0.04, 0.05) * Hh
        gap = 0.45 * k
        acc = 'rust' if i in accents else None
        Hs = section(mb, a + gap / 2, b - gap / 2, w, h, cz, R, k, accent=acc)
        secs.append((a, b, w, h, cz, Hs))
        # dark collar between sections
        if i < n_sections - 1:
            mb.box((0, -b, cz), (w * 0.9, gap * 2.2, h * 0.9), 'belly', bevel=0.1 * k)
    zt_bottom = min(cz - h / 2 for a, b, w, h, cz, _ in secs)
    underbelly(mb, s_lo + 2 * k, s_hi - 4 * k, W, zt_bottom + 0.3 * k, belly_depth, R, k)
    ztop = max(cz + h / 2 for a, b, w, h, cz, _ in secs)
    return mb, secs, ztop, zt_bottom


# =====================================================================================
OCT = [(math.cos((i + 0.5) / 8 * 2 * math.pi), math.sin((i + 0.5) / 8 * 2 * math.pi)) for i in range(8)]


def gun_bow(mb, R, s0, s_mouth, k):
    """Massive spinal main-gun bow: armoured barrel housing with segmented sleeves (accelerator coils in the
    gaps), dorsal fire-control deck, heat-sink fins, conduits, bracing struts, sensor pods and a multi-stage
    muzzle with a brake and a deep glowing bore. Returns the muzzle mouth station."""
    reg('gunmetal', (0.08, 0.085, 0.09), 0.85, 0.35)
    reg('heat_amber', (0.46, 0.36, 0.26), 0.9, 0.3)
    reg('heat_blue', (0.26, 0.30, 0.42), 0.9, 0.3)
    # ---- transition collar from the stacked hull into the barrel
    Cl = Hull([(s0 - 6, 96, 50, 0), (s0 + 4, 92, 50, 0), (s0 + 14, 74, 60, 0), (s0 + 18, 70, 60, 0)], CH)
    Cl.build(mb, 'paint2')
    for e in (0, 2, 4):
        plate(mb, Cl, s0 - 4, s0 + 2, e + 0.1, e + 0.9, 'paint3', off=0.0, thick=0.5, ch=0.4)
    # ---- barrel housing (gunmetal core) tapering toward the muzzle
    s_b0, s_b1 = s0 + 16, s_mouth - 34
    B = Hull([(s_b0, 64, 58, 0), (s_b1, 50, 46, 0)], OCT)
    B.build(mb, 'gunmetal')
    # armour sleeves (all 8 facets) with gaps revealing accelerator coils
    sleeves = []
    s = s_b0 + 1
    while s < s_b1 - 8:
        ln = min(R.uniform(18, 24), s_b1 - 2 - s)
        sleeves.append((s, s + ln))
        s += ln + 6.5
    for (sa, sb) in sleeves:
        for e in range(8):
            m = 'paint' if e in (1, 2, 3) else R.choice(['paint', 'paint2', 'paint2'])
            plate(mb, B, sa, sb, e + 0.02, e + 0.98, m, off=0.0, thick=2.2, ch=1.2)
            if R.random() < 0.5:   # raised hatch / sub-panel
                plate(mb, B, sa + 3, sb - 3, e + 0.25, e + 0.75, R.choice(['paint2', 'paint3']), off=2.2, thick=0.5,
                      ch=0.4)
        # seam lines + small stencil patches on the sleeve
        for e in (2, 5, 6):
            pos, n = B.pt((sa + sb) / 2, e + 0.5, 2.2)
            obox(mb, pos, n, (2.0, 1.4, 0.1), R.choice(['yellow', 'orange', 'belly2']), lift=0.0)
    # accelerator coils in the gaps (stacked rings) + bus bars
    for (sa, sb), (sa2, sb2) in zip(sleeves, sleeves[1:]):
        g0, g1 = sb, sa2
        w, h, cz, cx = B.at((g0 + g1) / 2)
        r = min(w, h) / 2 * 1.02
        for i in range(4):
            y0 = -(g0 + 0.6 + i * (g1 - g0 - 1.2) / 4)
            mb.cyl((0, y0, 0), (0, y0 - (g1 - g0 - 1.2) / 4 * 0.6, 0), r, r, 'heat_blue' if i % 2 else 'metal', seg=32)
        for a in range(0, 360, 45):
            d = Vector((math.cos(math.radians(a + 22.5)), 0, math.sin(math.radians(a + 22.5))))
            mb.cyl(Vector((0, -g0, 0)) + d * (r + 0.6), Vector((0, -g1, 0)) + d * (r + 0.6), 0.45, 0.45, 'belly', seg=6)
    # ---- dorsal fire-control deck (solid volume over the upper bow; internal frames below)
    D = Hull([(s0 + 22, 20, 8, 30, 5), (s0 + 34, 44, 20, 36, 5), (s_b1 - 14, 40, 18, 35, 5), (s_b1 - 2, 18, 8, 30, 5)],
             CH)
    D.build(mb, 'paint')
    for (a, b) in ((s0 + 36, s0 + 64), (s0 + 68, s0 + 96), (s0 + 100, s_b1 - 16)):
        for e in (0, 2, 4):
            plate(mb, D, a, b, e + 0.08, e + 0.92, R.choice(['paint', 'paint2']), off=0.0, thick=0.6, ch=0.5)
    for p in (0.4, 0.6, 4.4, 4.6):
        windows(mb, D, s0 + 38, s_b1 - 18, p, off=0.62, pitch=2.0, size=(0.5, 1.1, 0.15), R=R, dropout=0.3)
    DT = Hull([(s0 + 48, 16, 6, 48, 9), (s0 + 56, 26, 8, 49, 9), (s0 + 82, 24, 8, 49, 9), (s0 + 90, 10, 4, 47, 9)], CH)
    DT.build(mb, 'paint2')
    windows(mb, DT, s0 + 58, s0 + 80, 0.5, off=0.02, pitch=1.3, size=(0.4, 0.7, 0.1))
    windows(mb, DT, s0 + 58, s0 + 80, 4.5, off=0.02, pitch=1.3, size=(0.4, 0.7, 0.1))
    spine(mb, (12, -(s0 + 70), 53), (12, -(s0 + 70), 66), 0.4, 'metal', nodes=3)
    mb.sphere((2, -(s0 + 64), 53), 3.0, 'metal', seg=16, rings=8, half=True)
    for i in range(4):   # internal decks / frames (revealed by the lance hole)
        sy = s0 + 40 + i * 22
        mb.box((5, -sy, 32), (38, 1.2, 14), 'belly2')
        mb.box((5, -sy - 11, 26), (40, 20, 0.8), 'belly')
        mb.box((5, -sy - 11, 12), (44, 20, 0.8), 'belly')
    for i in range(6):
        sy = s0 + 30 + i * 18
        mb.box((0, -sy, 0), (52, 1.5, 44), 'belly2')
    # ---- heat-sink fin banks on the flanks + conduit runs
    for sd in (1, -1):
        for (sa, sb) in sleeves[1:-1]:
            w, h, cz, cx = B.at((sa + sb) / 2)
            base = Vector((sd * (w / 2 + 2.2), -(sa + 2), -h * 0.12))
            for j in range(int((sb - sa - 4) / 1.6)):
                mb.box(base + Vector((sd * 1.6, -j * 1.6, 0)), (3.2, 0.35, h * 0.28), 'heat_amber' if j % 5 == 0
                       else 'metal')
        for zf, r in ((0.3, 0.9), (-0.25, 0.7), (-0.4, 1.1)):
            a_ = B.at(s_b0 + 4)
            b_ = B.at(s_b1 - 4)
            mb.cyl((sd * (a_[0] / 2 + 2.6 + r), -(s_b0 + 4), a_[1] * zf), (sd * (b_[0] / 2 + 2.6 + r), -(s_b1 - 4),
                   b_[1] * zf), r, r, R.choice(['belly2', 'rust2', 'metal']), seg=10)
    # ---- bracing struts barrel <-> hull
    for sd in (1, -1):
        for zz in (18, -18):
            mb.cyl((sd * 42, -(s0 - 10), zz), (sd * 28, -(s0 + 60), zz * 0.9), 2.0, 1.6, 'metal', seg=10)
            mb.cyl((sd * 42, -(s0 - 10), zz), (sd * 42, -(s0 - 16), zz), 3.2, 3.2, 'belly2', seg=10)
    # ---- multi-stage muzzle
    y = lambda st: -st
    st = s_b1
    stages = [(st, st + 5, 27, 27, 'paint2'), (st + 5, st + 8, 25, 25, 'belly'), (st + 8, st + 20, 26, 24, 'gunmetal'),
              (st + 20, st + 23, 23, 23, 'heat_amber'), (st + 23, st + 31, 22, 21, 'gunmetal'),
              (st + 31, s_mouth, 21.5, 20.5, 'heat_blue')]
    for (a, b, r0, r1, m) in stages:
        if b <= st + 9:
            mb.cyl((0, y(a), 0), (0, y(b), 0), r0, r1, m, seg=32, bevel=0.3)
        else:   # hollow stages so the bore stays open
            annulus(mb, (0, y((a + b) / 2), 0), (0, 1, 0), 15.9, (r0 + r1) / 2, b - a, m, seg=32)
    # muzzle brake: side vent slots (dark ports with gunmetal frames) on the 12-20 stage
    for sd in (1, -1):
        for zz in (-8, 0, 8):
            for j in range(3):
                sy = st + 9.5 + j * 3.6
                mb.box((sd * 23.6, y(sy), zz), (2.4, 2.4, 5.0), 'belly')
                mb.box((sd * 24.9, y(sy), zz), (0.6, 3.0, 5.8), 'gunmetal')
    for zz in (1, -1):
        for j in range(3):
            sy = st + 9.5 + j * 3.6
            mb.box((0, y(sy), zz * 23.6), (10, 2.4, 2.4), 'belly')
    # recessed bore: deep bell with stepped bore rings and the emissive glow deep inside
    deep_nozzle(mb, (0, y(s_mouth - 22), 0), (0, -1, 0), 13.5, 'gunmetal', 'gunmetal', 'muzzle', depth=1.65,
                seg=32, ribs=False)
    for i, dd in enumerate((4, 8, 12, 16)):
        rr = 9.5 + i * 1.0
        annulus(mb, (0, y(s_mouth - 22 + dd), 0), (0, 1, 0), rr, rr + 1.4, 0.8, 'heat_blue' if i % 2 else 'metal',
                seg=32)
    annulus(mb, (0, y(s_mouth + 0.3), 0), (0, 1, 0), 15.5, 21.0, 1.2, 'heat_blue', seg=32)
    # targeting / sensor pods beside the muzzle
    for sd in (1, -1):
        c = Vector((sd * 36, y(st - 4), 10 * sd))
        mb.cyl(c + Vector((0, 8, 0)), c - Vector((0, 8, 0)), 3.6, 3.0, 'paint', seg=16, bevel=0.2)
        mb.cyl(c - Vector((0, 8, 0)), c - Vector((0, 9.2, 0)), 2.4, 2.4, 'glass', seg=16)
        mb.cyl(c - Vector((0, 8.9, 0)), c - Vector((0, 9.3, 0)), 1.2, 1.2, 'window', seg=12)
        mb.cyl(c, Vector((sd * 24, y(st - 4), 6 * sd)), 1.0, 1.0, 'metal', seg=8)
        mb.cyl(c + Vector((0, 6, 0)), Vector((sd * 26, y(st - 12), 4 * sd)), 0.8, 0.8, 'metal', seg=8)
    empty('main_cannon', (0, y(s_mouth), 0), size=8)
    return s_mouth


def mothership():
    palette()
    R = rng(601)
    k = 4.0
    mb, secs, ztop, zbot = workhorse(R, 400, 100, 46, k, 6, 40, accents=(1, 4))
    for (a, b, w, h, cz, Hs) in secs:   # flank windows + turret batteries (before the shift)
        for p in (0.35, 0.62, 4.38, 4.65):
            windows(mb, Hs, a + 3 * k, b - 3 * k, p, off=0.02, pitch=2.2, size=(0.6, 1.2, 0.15), R=R, dropout=0.45)
    for (a, b, w, h, cz, Hs) in secs[2:5]:
        for p in (1.5, 3.5):
            pos, n = Hs.pt((a + b) / 2, p, 0.1)
            turret(mb, pos, n, 4.0, 'metal', 'paint', 'belly', barrels=2, blen=2.4)
    shift = -60.0            # hull sections now span s = -260 .. 140; the gun bow fills 140 .. 292
    mb.bm.transform(Matrix.Translation((0, -shift, 0)))
    secs = [(a + shift, b + shift, w, h, cz, None) for (a, b, w, h, cz, Hs) in secs]
    gun_bow(mb, R, secs[-1][1], 292.0, k)
    # stern: cluster of big cylindrical thruster blocks with ribbed rings
    a0, b0, w0, h0, cz0, _ = secs[0]
    st = a0
    for x, z, r in ((0, cz0, 26), (-38, cz0 - 6, 16), (38, cz0 - 6, 16), (0, cz0 - 30, 12)):
        thruster_block(mb, (x, -st + 22, z), r, 44, k)
    mb.box((0, -st - 1, cz0), (w0 * 0.95, 4, h0 * 0.9), 'belly', bevel=0.4)
    s_tw = secs[1][0] + (secs[1][1] - secs[1][0]) * 0.5
    bridge_tower(mb, s_tw, ztop - 0.2, 80, R, k)
    # starboard hangar opening (+X side) on a mid section
    a, b, w, h, cz, _ = secs[3]
    sm = (a + b) / 2
    xh = w / 2
    mb.box((xh + 0.3, -sm, cz - h * 0.08), (0.8, 40, h * 0.55), 'belly')
    for k2 in range(3):
        mb.box((xh + 0.72, -sm, cz - h * 0.08 - h * 0.2 + k2 * h * 0.2), (0.1, 36, 0.5), 'window')
    for sg in (1, -1):
        mb.box((xh + 1.8, -sm + sg * 22, cz - h * 0.08), (3.6, 4, h * 0.7), 'paint2', bevel=0.4)
    mb.box((xh + 1.8, -sm, cz - h * 0.08 + h * 0.33), (3.6, 48, 3.5), 'paint2', bevel=0.4)
    mb.box((xh + 3.5, -sm, cz - h * 0.08 - h * 0.3), (7, 44, 1.6), 'metal', bevel=0.3)
    for k2 in range(8):
        mb.box((xh + 6.8, -sm - 17.5 + k2 * 5, cz - h * 0.08 - h * 0.3 + 0.9), (0.6, 1.4, 0.4), 'yellow')
    hazard(mb, Vector((xh + 3.7, -sm, cz - h * 0.08 + h * 0.33 + 1.9)), Vector((0, 0, 1)), 8.0, k=10)
    empty('hangar_exit', (xh + 4.0, -sm, cz - h * 0.08), rot=(0, 0, 90), size=6)
    return [mb.to_object('mothership', smooth_angle=26)]


def ion_frigate():
    palette()
    R = rng(611)
    k = 0.42
    # hull s -30..14 (44 long) + spinal cannon out of the blunt bow to s=29.5
    mb, secs, ztop, zbot = workhorse(R, 44, 13, 8, k, 4, 4.2, accents=(1,))
    shift = -8.0   # move the hull aft so the cannon fits the 60-unit length
    mb.bm.transform(Matrix.Translation((0, -shift, 0)))
    bow = 22 + shift
    a, b, w, h, cz, _ = secs[-1]
    zc = cz + 0.6
    mb.box((0, -(bow + 0.4), zc), (6, 0.8, 5.5), 'paint2', bevel=0.1)
    mb.cyl((0, -(bow + 0.5), zc), (0, -(bow + 5), zc), 2.6, 2.3, 'belly2', seg=20)
    mb.cyl((0, -(bow + 5), zc), (0, -28.0, zc), 1.0, 1.0, 'belly', seg=14)
    for i in range(9):   # exposed accelerator coils
        y = -(bow + 5.6 + i * 0.95)
        mb.cyl((0, y, zc), (0, y - 0.45, zc), 1.65, 1.65, 'metal', seg=18)
    for sd in (1, -1):
        mb.cyl((sd * 1.3, -(bow + 5), zc), (sd * 1.3, -27.5, zc), 0.13, 0.13, 'paint', seg=6)
    mb.cyl((0, -27.2, zc), (0, -29.3, zc), 1.6, 2.2, 'paint', seg=20, bevel=0.05)
    annulus(mb, (0, -29.55, zc), (0, 1, 0), 1.15, 2.15, 0.45, 'muzzle', seg=20)
    mb.cyl((0, -28.9, zc), (0, -29.15, zc), 1.2, 1.2, 'muzzle', seg=20)
    hazard(mb, Vector((0, -(bow + 0.85), zc + 2.0)), Vector((0, -1, 0)), 1.2)
    # stern thruster blocks
    st = secs[0][0] + shift
    for x, z, r in ((-2.9, secs[0][4], 2.6), (2.9, secs[0][4], 2.6)):
        thruster_block(mb, (x, -st + 1.6, z), r, 3.4, k, n_rings=3)
    bridge_tower(mb, secs[0][1] + shift - 3, ztop - 0.05, 9, R, k)
    return [mb.to_object('ion_frigate', smooth_angle=26)]


def assault_frigate():
    palette()
    R = rng(621)
    k = 0.38
    mb, secs, ztop, zbot = workhorse(R, 38, 16, 9, k, 4, 4.6, accents=(2,))
    a, b, w, h, cz, _ = secs[-1]
    # blunt armoured bow with a ram plate and twin chin guns
    mb.box((0, -(b + 0.35), cz), (w * 0.9, 0.7, h * 0.85), 'paint2', bevel=0.1)
    hazard(mb, Vector((0, -(b + 0.72), cz + h * 0.25)), Vector((0, -1, 0)), 1.6)
    for sx in (1, -1):
        mb.box((sx * 3, -(b - 1), cz - h * 0.45), (1.4, 3, 1.0), 'belly2', bevel=0.1)
        mb.cyl((sx * 3, -(b + 0.5), cz - h * 0.45), (sx * 3, -(b + 3.2), cz - h * 0.45), 0.25, 0.22, 'metal', seg=8)
    # dorsal turret battery
    for (a, b, w, h, cz, Hs) in secs[1:4]:
        pos, n = Hs.pt((a + b) / 2, 2.5, 0.1)
        turret(mb, pos, n, 1.6, 'metal', 'paint', 'belly', barrels=2, blen=2.6)
    # stern thruster blocks
    st = secs[0][0]
    for x, z, r in ((-4.2, secs[0][4], 3.0), (4.2, secs[0][4], 3.0), (0, secs[0][4] - 3.4, 1.8)):
        thruster_block(mb, (x, -st + 2.0, z), r, 4.0, k, n_rings=3)
    bridge_tower(mb, secs[0][1] - 2, ztop - 0.05, 10, R, k)
    return [mb.to_object('assault_frigate', smooth_angle=26)]
