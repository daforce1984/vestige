"""Higher-level hull-building helpers shared by ship builders."""
import math
from mathutils import Vector
from lib import MB, ship_ring, interp, lerp, PROF_HULL, D2R


def hull_loft(mb, stations, mat, prof=PROF_HULL, cx=0.0, sub=1, cap0=True, cap1=True, xs=1.0):
    """stations: [(s, w, h, cz), ...] sorted by s. Returns nothing."""
    rings = []
    for a, b in zip(stations, stations[1:]):
        for k in range(sub):
            t = k / sub
            s, w, h, cz = (lerp(x, y, t) for x, y in zip(a, b))
            rings.append(ship_ring(s, w * xs, h, cz, cx, prof))
    s, w, h, cz = stations[-1]
    if w < 1e-3 and h < 1e-3:
        rings.append(Vector((cx, -s, cz)))
    else:
        rings.append(ship_ring(s, w * xs, h, cz, cx, prof))
    mb.loft(rings, mat, cap0=cap0, cap1=cap1)


def band(mb, stations, s0, s1, mat, grow=0.4, prof=PROF_HULL, cx=0.0, scale_x=1.0):
    rings = []
    for s in (s0, s1):
        w, h, cz = interp(stations, s)
        rings.append(ship_ring(s, w * scale_x + 2 * grow, h + 2 * grow, cz, cx, prof))
    mb.loft(rings, mat)


def side_x(stations, s, v, prof=PROF_HULL):
    """x (positive side) of the hull surface at station s and normalized height v, for PROF_HULL side."""
    w, h, cz = interp(stations, s)
    # side edge from (1,-0.25) to (0.93,0.5)
    if v <= -0.25:
        u = lerp(1.0, 0.7, min(1, (-0.25 - v) / 0.6))
    elif v <= 0.5:
        u = lerp(1.0, 0.93, (v + 0.25) / 0.75)
    else:
        u = lerp(0.93, 0.6, min(1, (v - 0.5) / 0.5))
    return u * w / 2, cz + v * h / 2


def side_strip(mb, stations, s0, s1, v0, v1, mat, side=1, out=0.35, step=8.0, cx=0.0):
    n = max(1, int(abs(s1 - s0) / step))
    rings = []
    for i in range(n + 1):
        s = lerp(s0, s1, i / n)
        x0, z0 = side_x(stations, s, v0)
        x1, z1 = side_x(stations, s, v1)
        rings.append([Vector((cx + side * (x0 - 0.6), -s, z0)), Vector((cx + side * (x0 + out), -s, z0)),
                      Vector((cx + side * (x1 + out), -s, z1)), Vector((cx + side * (x1 - 0.6), -s, z1))])
    mb.loft(rings, mat)


def top_strip(mb, stations, s0, s1, u0, u1, mat, out=0.35, step=8.0, cx=0.0):
    """Plate on the flat top between normalized u0..u1 (|u|<=0.6)."""
    n = max(1, int(abs(s1 - s0) / step))
    rings = []
    for i in range(n + 1):
        s = lerp(s0, s1, i / n)
        w, h, cz = interp(stations, s)
        zt = cz + h / 2
        rings.append([Vector((cx + u0 * w / 2, -s, zt - 0.6)), Vector((cx + u1 * w / 2, -s, zt - 0.6)),
                      Vector((cx + u1 * w / 2, -s, zt + out)), Vector((cx + u0 * w / 2, -s, zt + out))])
    mb.loft(rings, mat)


def window_row(mb, stations, s0, s1, v, mat='window', side=1, seg=4.0, gap=1.5, hgt=0.7, cx=0.0, out=0.12):
    s = s0
    while s + seg <= s1:
        sm = s + seg / 2
        x, z = side_x(stations, sm, v)
        mb.box((cx + side * (x + out), -sm, z), (0.4, seg, hgt), mat)
        s += seg + gap


def top_z(stations, s):
    w, h, cz = interp(stations, s)
    return cz + h / 2


def top_greebles(mb, stations, s0, s1, count, R, mats, umax=0.5, scale=1.0, cx=0.0, avoid=None):
    for _ in range(count):
        s = R.uniform(s0, s1)
        w, h, cz = interp(stations, s)
        u = R.uniform(-umax, umax)
        x = cx + u * w / 2
        if avoid and any(a0 <= s <= a1 and abs(x - cx) < ax for a0, a1, ax in avoid):
            continue
        zt = cz + h / 2
        sx = R.uniform(1.0, 4.0) * scale
        sy = R.uniform(1.5, 7.0) * scale
        sz = R.uniform(0.3, 1.4) * scale
        mat = R.choice(mats)
        mb.box((x, -s, zt + sz / 2 - 0.1), (sx, sy, sz), mat, bevel=min(sx, sy, sz) * 0.15)


def side_greebles(mb, stations, s0, s1, count, R, mats, vrange=(-0.2, 0.4), scale=1.0, side_both=True, cx=0.0):
    for _ in range(count):
        s = R.uniform(s0, s1)
        v = R.uniform(*vrange)
        x, z = side_x(stations, s, v)
        sx = R.uniform(0.3, 1.2) * scale
        sy = R.uniform(2.0, 8.0) * scale
        sz = R.uniform(0.8, 3.0) * scale
        mat = R.choice(mats)
        for side in ((1, -1) if side_both else (1,)):
            mb.box((cx + side * (x + sx / 2 - 0.15), -s, z), (sx, sy, sz), mat, bevel=min(sx, sy, sz) * 0.2)


def antenna(mb, base, height, r, mat, bars=3, bar_len=None, mat_bar=None):
    base = Vector(base)
    top = base + Vector((0, 0, height))
    mb.cyl(base, top, r, r * 0.5, mat, seg=6)
    bl = bar_len or height * 0.25
    for i in range(bars):
        z = base.z + height * (0.45 + 0.5 * i / max(1, bars))
        L = bl * (1 - 0.5 * i / max(1, bars))
        mb.box((base.x, base.y, z), (L, r * 1.2, r * 1.2), mat_bar or mat)
    mb.sphere(top, r * 1.4, mat_bar or mat, seg=8, rings=4)


def dome(mb, c, r, mat, base_mat=None):
    c = Vector(c)
    mb.cyl(c - Vector((0, 0, r * 0.25)), c + Vector((0, 0, r * 0.12)), r * 1.15, r * 1.1, base_mat or mat, seg=16)
    mb.sphere(c + Vector((0, 0, r * 0.1)), r, mat, seg=16, rings=8, half=True)


def shoulder_plates(mb, stations, s0, s1, R, mats, side=1, t=0.5, gap=1.2, lmin=6, lmax=18, cx=0.0,
                    ua=(0.9, 0.56), ub=(0.64, 0.94), skip=None):
    """Armour plates on the upper chamfer of a PROF_HULL hull (between profile points ua..ub)."""
    s = s0
    while s < s1 - 2:
        L = min(R.uniform(lmin, lmax), s1 - s)
        if skip and any(a <= s + L / 2 <= b for a, b in skip):
            s += L + gap
            continue
        pts_b, pts_t = [], []
        for ss in (s, s + L):
            w, h, cz = interp(stations, ss)
            A = Vector((cx + side * ua[0] * w / 2, -ss, cz + ua[1] * h / 2))
            B = Vector((cx + side * ub[0] * w / 2, -ss, cz + ub[1] * h / 2))
            d = B - A
            n = Vector((side * abs(d.z), 0, abs(d.x))).normalized()
            pts_b.append((A - n * 0.3, B - n * 0.3))
            pts_t.append((A + n * t, B + n * t))
        (a0, b0), (a1, b1) = pts_b
        (ta0, tb0), (ta1, tb1) = pts_t
        mb.hexa([a0, b0, b1, a1, ta0, tb0, tb1, ta1], R.choice(mats), bevel=min(0.25, t * 0.4))
        s += L + gap
