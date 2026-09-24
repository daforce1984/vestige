"""v5 enemy ships (original designs in the style language of the user's third reference):
long sleek tapered burnt-orange hull with flat converging side slabs and a blunt bow, a recessed dorsal
machinery trench between raised armour rails, a bare-metal horseshoe cowl wrapping the stern with a thin lime
inner light strip, belly rods/struts, olive mechanical parts aft, small decal-like hatches/triangles/lights.
Blender space: nose -Y (station s = -y), up +Z."""
import math
from mathutils import Vector, Matrix
from lib import MB, reg, empty, rng, lerp, annulus, D2R
from shipkit import Hull, BOX8, plate, armor, cuts, obox, deep_nozzle, turret, spine, windows, lamp_fixture

# profile with a recessed dorsal trench (floor at v=0.5 between rails)
TRENCH = [(1, -0.5), (1, 0.45), (0.78, 1), (0.42, 1), (0.36, 0.5), (-0.36, 0.5), (-0.42, 1), (-0.78, 1),
          (-1, 0.45), (-1, -0.5), (-0.62, -1), (0.62, -1)]
# edge indices: 0 stbd side, 1 stbd upper chamfer, 2 stbd rail top, 3 stbd trench wall, 4 trench floor,
# 5 port trench wall, 6 port rail top, 7 port chamfer, 8 port side, 9 port lower chamfer, 10 bottom, 11 stbd lower


def palette():
    reg('paint', (0.50, 0.10, 0.018), 0.25, 0.5)        # burnt orange
    reg('paint2', (0.33, 0.065, 0.014), 0.25, 0.55)     # grime-darkened orange
    reg('ring', (0.50, 0.50, 0.52), 0.85, 0.35)         # bare grey metal
    reg('mech', (0.045, 0.045, 0.05), 0.8, 0.45)        # dark mechanics
    reg('olive', (0.10, 0.12, 0.045), 0.5, 0.5)         # olive mechanical parts
    reg('yellow', (0.85, 0.58, 0.05), 0.25, 0.5)
    reg('lime', (0.2, 0.4, 0.02), 0.0, 0.4, (0.55, 1.0, 0.12), 3.0)
    reg('window', (0.3, 0.2, 0.05), 0.0, 0.4, (1.0, 0.7, 0.3), 2.0)
    reg('engine', (0.3, 0.1, 0.05), 0.0, 0.3, (1.0, 0.45, 0.12), 3.0)
    reg('lance', (0.1, 0.0, 0.12), 0.0, 0.3, (0.75, 0.25, 1.0), 5.0)


def horseshoe(mb, y0, depth, r_in, r_out, a0, a1, mat, strip_mat, cz=0.0, seg_deg=6.0):
    """Curved cowl around the ship axis (Y), open between a1 and a0+360 (i.e. at the bottom)."""
    n = max(4, int((a1 - a0) / seg_deg))
    rings = []
    for i in range(n + 1):
        a = math.radians(lerp(a0, a1, i / n))
        c, s = math.cos(a), math.sin(a)
        p = lambda r, y: Vector((c * r, y, cz + s * r))
        rings.append([p(r_in, y0), p(r_out, y0 - depth * 0.15), p(r_out, y0 + depth), p(r_in, y0 + depth * 0.9)])
    mb.loft(rings, mat)
    # lime running lights on the inner edge: a row of discrete housed lamp units (was one continuous strip)
    k = max(6, int((a1 - a0 - 6) / 7.5))
    step = math.radians((a1 - a0 - 6) / k)
    for i in range(k + 1):
        a = math.radians(a0 + 3) + step * i
        d = Vector((math.cos(a), 0, math.sin(a)))
        tng = Vector((-math.sin(a), 0, math.cos(a)))
        lamp_fixture(mb, Vector((0, y0 + depth * 0.375, cz)) + d * r_in, -d,
                     (depth * 0.15, r_in * step * 0.62, r_in * 0.028), strip_mat, 'mech', fwd=tng, lift=r_in * 0.011)


def decals(mb, hull, R, s0, s1, n_tri, n_hatch, n_light, p_choices, off, scale):
    for _ in range(n_tri):
        pos, nn = hull.pt(R.uniform(s0, s1), R.choice(p_choices), off)
        mb.cyl(pos, pos + nn * 0.02 * scale, 0.35 * scale, 0.35 * scale, 'yellow', seg=3)
    for _ in range(n_hatch):
        pos, nn = hull.pt(R.uniform(s0, s1), R.choice(p_choices), off)
        obox(mb, pos, nn, (R.uniform(0.6, 1.4) * scale, R.uniform(0.8, 1.8) * scale, 0.05 * scale), 'paint2',
             lift=0.0, bevel=0.02 * scale)
    for _ in range(n_light):
        pos, nn = hull.pt(R.uniform(s0, s1), R.choice(p_choices), off)
        lamp_fixture(mb, pos, nn, (0.12 * scale, 0.3 * scale, 0.04 * scale), 'lime', 'mech', lift=0.016 * scale)


def trench_machinery(mb, hull, s0, s1, off, R, scale, lance=False):
    """Conduits, cylinders and housings along the trench floor (edge 4)."""
    for p, r in ((4.2, 0.18), (4.8, 0.18), (4.5, 0.28)):
        s = s0
        prev = hull.pt(s, p, off + r)[0]
        while s < s1:
            s2 = min(s1, s + 6 * scale)
            cur = hull.pt(s2, p, off + r)[0]
            mb.cyl(prev, cur, r * scale, r * scale, 'mech' if r > 0.2 else 'ring', seg=8)
            prev, s = cur, s2
    s = s0 + 2 * scale
    while s < s1 - 2 * scale:
        pos, nn = hull.pt(s, 4.5, off)
        k = R.random()
        if k < 0.4:   # cylinder tank across the trench
            ax = Vector((1, 0, 0))
            c = pos + nn * 0.55 * scale
            mb.cyl(c - ax * 0.9 * scale, c + ax * 0.9 * scale, 0.45 * scale, 0.45 * scale,
                   'olive' if R.random() < 0.3 else 'mech', seg=12)
        elif k < 0.75:  # housing block
            obox(mb, pos, nn, (1.6 * scale, R.uniform(1.2, 2.6) * scale, R.uniform(0.5, 0.9) * scale),
                 R.choice(['mech', 'ring', 'olive']), bevel=0.05 * scale)
        else:           # rib
            obox(mb, pos, nn, (2.0 * scale, 0.25 * scale, 0.35 * scale), 'ring')
        s += R.uniform(2.0, 3.5) * scale


def enemy_ship(stations, scale, R, fork=False):
    mb = MB()
    H = Hull(stations, TRENCH)
    H.build(mb, 'mech')
    s0, s1 = stations[0][0], stations[-1][0]
    sc = cuts(s0 + 0.5 * scale, s1 - 0.3 * scale, R, 5 * scale, 9 * scale)
    paint = lambda i, j, R: 'paint' if R.random() < 0.8 else 'paint2'
    # outer facets painted, trench walls/floor stay dark
    armor(mb, H, sc, [0.02, 1.0, 2.0, 2.98], paint, R, thick=0.12 * scale, gap_s=0.12 * scale, gap_p=0.02,
          sub_prob=0.2, sub_mat='paint2')
    armor(mb, H, sc, [6.02, 7.0, 8.0, 8.98], paint, R, thick=0.12 * scale, gap_s=0.12 * scale, gap_p=0.02,
          sub_prob=0.2, sub_mat='paint2')
    armor(mb, H, cuts(s0 + 0.5 * scale, s1 - 0.3 * scale, R, 6 * scale, 11 * scale), [9.02, 10.0, 11.0, 11.98],
          lambda i, j, R: 'paint2' if R.random() < 0.6 else 'paint', R, thick=0.1 * scale, gap_s=0.12 * scale,
          gap_p=0.02)
    trench_machinery(mb, H, s0 + 3 * scale, s1 - 4 * scale, 0.0, R, scale)
    # long flat side slabs converging toward the blunt bow (stand proud of the flanks)
    for sd in (1, -1):
        pts = []
        for (s, zc, hh, out) in ((s0 + 2 * scale, 0.0, 2.2, 0.55), (s1 - 3 * scale, -0.1, 1.2, 0.2)):
            w, h, cz, cx = H.at(s)
            x = sd * (w / 2 + out * scale)
            pts.append((x, -s, cz + zc * scale, hh * scale))
        (xa, ya, za, ha), (xb, yb, zb, hb) = pts
        t = 0.35 * scale
        mb.hexa([(xa - sd * t, ya, za - ha / 2), (xa, ya, za - ha / 2), (xb, yb, zb - hb / 2), (xb - sd * t, yb, zb - hb / 2),
                 (xa - sd * t, ya, za + ha / 2), (xa, ya, za + ha / 2), (xb, yb, zb + hb / 2), (xb - sd * t, yb, zb + hb / 2)],
                'paint', bevel=0.06 * scale)
        for k in range(6):   # standoff brackets
            f = (k + 0.5) / 6
            s = lerp(s0 + 2 * scale, s1 - 3 * scale, f)
            w, h, cz, cx = H.at(s)
            mb.box((sd * (w / 2 + 0.2 * scale), -s, cz), (0.6 * scale, 0.5 * scale, 0.3 * scale), 'mech')
    # belly rods / struts + olive parts aft
    for sd in (1, -1):
        a = H.pt(s0 + 4 * scale, 10.3 if sd > 0 else 10.7, 0.1 * scale)[0] - Vector((0, 0, 0.6 * scale))
        b = H.pt(s1 - 8 * scale, 10.3 if sd > 0 else 10.7, 0.1 * scale)[0] - Vector((0, 0, 0.6 * scale))
        mb.cyl(a, b, 0.08 * scale, 0.08 * scale, 'ring', seg=6)
        for f in (0.2, 0.5, 0.8):
            p = a.lerp(b, f)
            mb.cyl(p, p + Vector((0, 0, 0.7 * scale)), 0.05 * scale, 0.05 * scale, 'mech', seg=6)
    for k in range(3):
        pos, nn = H.pt(s0 + (3 + k * 2.2) * scale, 10.5, 0.1 * scale)
        obox(mb, pos, nn, (1.8 * scale, 1.4 * scale, 0.6 * scale), 'olive', bevel=0.05 * scale)
    # stern horseshoe cowl + engines
    w, h, cz, cx = H.at(s0)
    rr = max(w, h) / 2 * 1.04
    th, dep = rr * 0.22, rr * 0.9
    horseshoe(mb, -s0 - 0.55 * dep, dep, rr, rr + th, -35, 215, 'ring', 'lime', cz=cz)
    for a_deg in (-35, 215):   # cowl roots: heavy blocks bolting the horseshoe ends to the hull
        a = math.radians(a_deg)
        p = Vector((math.cos(a) * (rr + th * 0.4), -s0 + 0.2 * dep, cz + math.sin(a) * (rr + th * 0.4)))
        mb.box(p, (th * 1.3, dep * 0.9, th * 1.3), 'ring', bevel=0.1 * scale)
    for a_deg in (30, 90, 150):  # radial struts ring -> hull
        a = math.radians(a_deg)
        d = Vector((math.cos(a), 0, math.sin(a)))
        for yy in (0.1, 0.55):
            y = -s0 - 0.55 * dep + dep * yy
            mb.cyl(Vector((0, y, cz)) + d * (min(w, h) * 0.35), Vector((0, y, cz)) + d * (rr + 0.1), 0.18 * scale,
                   0.18 * scale, 'mech', seg=8)
    for k in range(10):          # ring panel seams / bolts on the outer face
        a = math.radians(-30 + k * 24)
        d = Vector((math.cos(a), 0, math.sin(a)))
        obox(mb, Vector((0, -s0 + 0.2 * dep, cz)) + d * (rr + th), d, (0.5 * scale, dep * 0.8, 0.12 * scale),
             'mech' if k % 3 == 0 else 'ring', lift=0.0)
    for x, z, r in ((0, 0.4, 1.7), (-2.6, -0.6, 1.1), (2.6, -0.6, 1.1), (0, -2.3, 0.8)):
        deep_nozzle(mb, (x * scale, -s0 - 0.2 * scale, cz + z * scale), (0, 1, 0), r * scale, 'ring', 'mech',
                    'engine', depth=1.15, seg=20, ribs=False)
    for sd in (1, -1):
        mb.box((sd * (rr + th + 0.3 * scale), -s0 + 0.2 * dep, cz + 0.3 * rr), (0.6 * scale, dep * 0.5, 0.9 * scale),
               'olive', bevel=0.05 * scale)
    # decals and small lights
    decals(mb, H, R, s0 + 3 * scale, s1 - 3 * scale, 6, 10, 10, [0.3, 0.7, 8.3, 8.7, 1.5, 7.5], 0.13 * scale, scale)
    for p in (0.5, 8.5):
        windows(mb, H, s0 + 4 * scale, s1 - 6 * scale, p, mat='window', off=0.13 * scale, pitch=1.2 * scale,
                size=(0.12 * scale, 0.35 * scale, 0.04 * scale), R=R, dropout=0.4)
    return mb, H


def enemy_frigate():
    palette()
    R = rng(501)
    ST = [(-26, 11, 7.2, 0), (-20, 12, 7.8, 0), (-2, 10.5, 7.0, 0.1), (14, 7.5, 5.2, 0), (24, 5.2, 3.8, -0.1),
          (27.5, 4.4, 3.0, -0.1)]
    mb, H = enemy_ship(ST, 1.0, R)
    # blunt bow plate + sensor housing + one spinal gun turret on the rail (asymmetric)
    obox(mb, Vector((0, -27.6, -0.1)), Vector((0, -1, 0)), (4.0, 2.6, 0.3), 'ring', lift=0.0, fwd=Vector((0, 0, 1)))
    mb.box((0, -27.8, -0.1), (1.6, 0.4, 0.6), 'mech')
    pos, n = H.pt(4, 2.5, 0.12)
    turret(mb, pos, n, 1.3, 'ring', 'paint', 'mech', barrels=2, blen=2.6)
    spine(mb, (-2.5, 16, 3.8), (-2.6, 20, 7.0), 0.07, 'ring', nodes=2)
    return [mb.to_object('enemy_frigate', smooth_angle=26)]


def enemy_dreadnought():
    palette()
    R = rng(511)
    S = 7.2
    ST = [(-196, 84, 56, 0), (-180, 94, 62, 0), (-100, 96, 64, 0), (-10, 86, 58, 0), (50, 60, 44, 0),
          (70, 40, 32, 0)]
    mb, H = enemy_ship(ST, S, R)
    # forked prow: two long orange slabs with a trench between them, lance coils in the trench
    for sd in (1, -1):
        T = Hull([(30, 26, 50, 0, sd * 32), (100, 24, 46, 0, sd * 31), (170, 18, 36, 0, sd * 29),
                  (205, 12, 24, 0, sd * 27), (214, 9, 18, 0, sd * 26)], BOX8)
        T.build(mb, 'mech')
        armor(mb, T, cuts(32, 212, R, 22, 40), [0.03, 1, 2, 3, 3.97], lambda i, j, R: 'paint' if R.random() < 0.8 else
              'paint2', R, thick=0.8, gap_s=0.9, gap_p=0.03, sub_prob=0.25, sub_mat='paint2')
        armor(mb, T, cuts(32, 212, R, 22, 40), [4.03, 5, 6, 7, 7.97], lambda i, j, R: 'paint2' if R.random() < 0.5 else
              'paint', R, thick=0.8, gap_s=0.9, gap_p=0.03)
        decals(mb, T, R, 40, 205, 5, 18, 14, [0.5, 1.5, 2.5, 5.5, 6.5, 7.5], 0.85, S * 0.8)
        windows(mb, T, 45, 200, 0.5 if sd > 0 else 4.5, mat='window', off=0.85, pitch=3.0,
                size=(0.6, 1.8, 0.2), R=R, dropout=0.3)
        inner = 4.5 if sd > 0 else 0.5
        s = 40
        while s < 205:   # inner-face conduits + lime indicator lights
            pos, n = T.pt(s, inner, 0.8)
            obox(mb, pos, n, (4.0, 7.0, 1.2), R.choice(['mech', 'ring', 'olive']), bevel=0.3)
            lamp_fixture(mb, T.pt(s + 5, inner + 0.3, 0.8)[0], n, (0.6, 1.4, 0.2), 'lime', 'ring', lift=0.08)
            s += 13
        obox(mb, Vector((sd * 26, -214.5, 0)), Vector((0, -1, 0)), (6, 12, 0.6), 'ring', lift=0.0, fwd=Vector((0, 0, 1)))
    mb.sphere((0, -80, 0), 9, 'lance', seg=24, rings=12)
    mb.cyl((0, -62, 0), (0, -76, 0), 15, 9, 'ring', seg=24)
    for s in (100, 124, 148, 170, 190):
        r = 12 - (s - 100) * 0.03
        annulus(mb, (0, -s, 0), (0, 1, 0), r, r + 3.5, 4, 'ring', seg=28, mat_inner='lance')
        for sd in (1, -1):
            x0, x1 = r + 3, 32 - (s - 100) * 0.05 - 10
            mb.box((sd * (x0 + x1) / 2, -s, 0), (x1 - x0 + 1, 2.5, 2.5), 'mech', bevel=0.2)
    empty('lance_emitter', (0, -200, 0), size=12)
    # command superstructure offset to port on the rail + turret batteries
    zt = H.at(-120)[1] / 2
    B = Hull([(-150, 10, 8, zt + 3, -26), (-138, 20, 14, zt + 7, -26), (-108, 18, 12, zt + 7, -26),
              (-98, 4, 4, zt + 3, -26)], BOX8)
    B.build(mb, 'paint')
    windows(mb, B, -134, -110, 0.5, off=0.02, pitch=1.4, size=(0.5, 0.9, 0.2))
    windows(mb, B, -134, -110, 4.5, off=0.02, pitch=1.4, size=(0.5, 0.9, 0.2))
    spine(mb, (-24, 125, zt + 15), (-23, 140, zt + 34), 0.45, 'ring', nodes=3)
    for s in (-150, -70, 10):
        for p in (1.5, 7.5):
            pos, n = H.pt(s, p, 0.9)
            turret(mb, pos, n, 6.0, 'ring', 'paint', 'mech', barrels=2, blen=2.6)
    return [mb.to_object('enemy_dreadnought', smooth_angle=26)]
