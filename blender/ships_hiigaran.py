"""Hiigaran fleet v2 (see DESIGN_NOTES.md): mothership, ion frigate, assault frigate, interceptor.
Blender space: nose -Y (station s = -y), up +Z, +X = starboard side (glTF +X)."""
import math
from mathutils import Vector, Matrix
from lib import MB, reg, empty, rng, lerp, annulus, D2R
from shipkit import (Hull, KNIFE, HEX, BOX8, DIAMOND, BLADE, plate, armor, cuts, plate_hull, obox, windows,
                     deep_nozzle, turret, fins, spine, digits, cowl, cutter_box, boolean_diff, join)


def palette():
    reg('hull', (0.70, 0.62, 0.47), 0.2, 0.42)         # ivory
    reg('hull2', (0.50, 0.43, 0.31), 0.25, 0.48)       # sand
    reg('mech', (0.045, 0.047, 0.052), 0.75, 0.45)     # dark mechanical
    reg('metal', (0.36, 0.36, 0.38), 0.9, 0.3)
    reg('rust', (0.42, 0.075, 0.035), 0.3, 0.45)
    reg('blue', (0.03, 0.10, 0.34), 0.35, 0.35)
    reg('bay', (0.012, 0.012, 0.015), 0.3, 0.8)
    reg('canopy', (0.02, 0.035, 0.06), 0.7, 0.08)
    reg('engine', (0.1, 0.15, 0.2), 0.0, 0.3, (0.5, 0.75, 1.0), 3.0)
    reg('window', (0.3, 0.25, 0.2), 0.0, 0.4, (1.0, 0.85, 0.62), 2.5)
    reg('muzzle', (0.2, 0.3, 0.4), 0.0, 0.3, (0.5, 0.8, 1.0), 6.0)
    reg('nav_r', (0.3, 0.02, 0.02), 0.0, 0.4, (1.0, 0.1, 0.05), 4.0)
    reg('nav_g', (0.02, 0.3, 0.05), 0.0, 0.4, (0.1, 1.0, 0.3), 4.0)


def hull_mats(accent_bands=(), blue_bands=(), base=('hull', 'hull', 'hull', 'hull2')):
    """Material chooser for plate grids: accent bands by station handled separately; mostly ivory, some sand."""
    def f(i, j, R):
        return R.choice(base)
    return f


def stripe(mb, hull, s0, s1, p0, p1, mat, off, thick=0.3):
    plate(mb, hull, s0, s1, p0, p1, mat, off=off, thick=thick, ch=min(0.4, (s1 - s0) * 0.2))


def pipes_along(mb, hull, s0, s1, p, off, r, mat, step=20.0):
    s = s0
    prev = hull.pt(s, p, off)[0]
    while s < s1:
        s2 = min(s1, s + step)
        cur = hull.pt(s2, p, off)[0]
        mb.cyl(prev, cur, r, r, mat, seg=8)
        prev, s = cur, s2


# =====================================================================================
def mothership():
    palette()
    R = rng(101)
    core = MB()
    det = MB()
    # ---------------------------------------------------------------- main hull (knife)
    H = Hull([(-230, 118, 54, 0), (-190, 138, 60, 1), (-120, 140, 60, 2), (-40, 124, 56, 2), (40, 100, 48, 1),
              (95, 76, 38, 0), (125, 56, 30, 0), (142, 38, 22, 0)], KNIFE)
    H.build(core, 'mech')
    hull_obj = core.to_object('mothership_core')
    # recessed starboard hangar bay (boolean cut-in) + a smaller ventral launch slot
    s_h0, s_h1 = -40.0, -4.0
    w, h, cz, cx = H.at((s_h0 + s_h1) / 2)
    xh = w / 2
    cut1 = cutter_box((xh + 2, -(s_h0 + s_h1) / 2, 0.5), (26, s_h1 - s_h0, 18), 'bay')
    boolean_diff(hull_obj, [cut1])

    # ---------------------------------------------------------------- armor plating on the main hull
    hang = [(s_h0 - 3, s_h1 + 3, -0.1, 0.99), (s_h0 - 3, s_h1 + 3, 9.0, 10.1)]
    plate_hull(det, H, -228, 138, R, 26, 64, hull_mats(), per_edge=1, edges=[0, 1, 3, 4, 5, 6, 8, 9], thick=2.0,
               gap_s=1.0, gap_p=0.012, skip=hang, skip_prob=0.02, sub_prob=0.55, sub_mat='hull2')
    # top: two plate lanes flanking a central mechanical trench
    sc = cuts(-228, 138, R, 24, 56)
    armor(det, H, sc, [2.0, 2.4], lambda i, j, R: R.choice(['hull', 'hull', 'hull2']), R, thick=2.0,
          gap_s=1.0, gap_p=0.01, sub_prob=0.6, sub_mat='hull2')
    armor(det, H, sc, [2.6, 3.0], lambda i, j, R: R.choice(['hull', 'hull', 'hull2']), R, thick=2.0,
          gap_s=1.0, gap_p=0.01, sub_prob=0.6, sub_mat='hull2')
    # knife-edge chines: thin blade lips along the side edge (strong planform line)
    for sd in (1, -1):
        spans = [(-214, 118)] if sd < 0 else [(-214, s_h0 - 6), (s_h1 + 6, 118)]
        for a, b in spans:
            rings = []
            n = max(2, int((b - a) / 8))
            for k in range(n + 1):
                s = lerp(a, b, k / n)
                w, h, cz, cx = H.at(s)
                t = min(1.0, (s - (-214)) / 30, (118 - s) / 40)
                ext = 2.0 + 7.0 * max(0.0, t)
                x0, z0 = w / 2 + 1.0, cz + 0.05 * h / 2
                rings.append([Vector((sd * (x0 - 3), -s, z0 + 1.2)), Vector((sd * (x0 + ext), -s, z0 + 0.25)),
                              Vector((sd * (x0 + ext), -s, z0 - 0.35)), Vector((sd * (x0 - 3), -s, z0 - 1.2))])
            det.loft(rings, 'hull2')
            s = a + 4
            while s < b - 4:  # small edge lights + vents along the chine
                w, h, cz, cx = H.at(s)
                det.box((sd * (w / 2 + 1.0 + 2.0 + 7.0 * min(1.0, (s + 214) / 30, (118 - s) / 40) - 0.2), -s,
                         cz + 0.05 * h / 2), (0.3, 0.8, 0.3), 'window')
                s += 12
    # hyperspace-core module: dorsal hump ahead of the engine block
    def top0(s):
        w, h, cz, cx = H.at(s)
        return cz + h / 2
    HC = Hull([(-230, 70, 22, top0(-230) + 9), (-214, 78, 26, top0(-214) + 11), (-186, 64, 20, top0(-186) + 8),
               (-170, 30, 8, top0(-170) + 2)], KNIFE)
    HC.build(det, 'mech')
    plate_hull(det, HC, -229, -172, R, 10, 22, ['hull', 'hull2'], per_edge=1, edges=[0, 1, 2, 3, 4], thick=1.4,
               gap_s=0.9, sub_prob=0.5)
    for p in (1.5, 3.5):
        pos, n = HC.pt(-205, p, 1.4)
        turret(det, pos, n, 5.0, 'metal', 'hull', 'mech', barrels=3, blen=2.4)
    for sd in (1, -1):
        fins(det, (sd * 30, 222, top0(-214) + 22), (0, -1, 0), (0, 0, 1), 8, 3.0, 4.0, 10, 0.6, 'metal')
    # bottom plates (belly, avoid launch slot)
    armor(det, H, cuts(-228, 138, R, 16, 30), [7.0, 7.5, 8.0], ['hull2', 'hull2', 'hull'], R, thick=1.0,
          gap_s=1.4, gap_p=0.02, skip=[(-172, -128, 7.0, 8.0)])
    # trench mechanics: pipes + ribs along the dorsal centerline
    for p in (2.43, 2.57):
        pipes_along(det, H, -170, 136, p, 0.9, 0.9, 'metal')
    pipes_along(det, H, -170, 136, 2.5, 0.5, 1.4, 'mech')
    s = -170
    while s < 134:
        pos, n = H.pt(s, 2.5, 0.0)
        obox(det, pos, n, (9.5, 1.0, 1.6), 'metal' if R.random() < 0.7 else 'rust')
        s += R.uniform(4, 9)
    # accent bands (rust + blue) wrapping the upper sides/chamfers, Hiigaran livery
    for s0, s1, m in ((-214, -206, 'rust'), (-202, -199, 'blue'), (-64, -56, 'rust'), (-53, -51, 'blue'),
                      (64, 72, 'rust'), (75, 77, 'blue')):
        for p0, p1 in ((0.05, 1.95), (3.05, 4.95)):
            stripe(det, H, s0, s1, p0, p1, m, off=2.0)
    # longitudinal blue pinstripe and rust sweep on the knife edges
    for p0, p1 in ((0.08, 0.2), (4.8, 4.92)):
        stripe(det, H, -196, 60, p0, p1, 'blue', off=2.0, thick=0.25)
    for p0, p1 in ((9.72, 9.9), (5.1, 5.28)):
        stripe(det, H, -196, 110, p0, p1, 'rust', off=2.0, thick=0.3)
    # windows: many tiny lit rows on both flanks (scale cue)
    gaps = [(s_h0 - 4, s_h1 + 4)]
    for p in (0.3, 0.42, 0.55, 0.68):
        windows(det, H, -220, 128, p, off=2.05, pitch=1.9, size=(0.5, 1.0, 0.25), R=R, dropout=0.25, gaps=gaps)
    for p in (4.32, 4.45, 4.58, 4.7):
        windows(det, H, -220, 128, p, off=2.05, pitch=1.9, size=(0.5, 1.0, 0.25), R=R, dropout=0.25)
    for p in (9.35, 9.55, 5.45, 5.65):
        windows(det, H, -210, 100, p, off=2.05, pitch=2.3, size=(0.45, 0.9, 0.25), R=R, dropout=0.35,
                gaps=gaps if p > 9 else None)
    # hull numbers "01" (both flanks, forward) + "HGN" style bar codes
    digits(det, H, '01', 70, 0.45, 9.0, 'rust', off=2.0)
    digits(det, H, '01', 70, 4.55, 9.0, 'rust', off=2.0)
    # turret batteries on the chamfers + PD turrets
    for s in (-176, -136, -84, -44, 8, 48):
        for p in (1.45, 3.55):
            pos, n = H.pt(s, p, 2.0)
            turret(det, pos, n, 4.2, 'metal', 'hull', 'mech', barrels=2, blen=2.4)
    for _ in range(26):
        s = R.uniform(-220, 120)
        p = R.choice([0.85, 4.15, 9.2, 5.8])
        if s_h0 - 6 < s < s_h1 + 6 and p in (0.85, 9.2):
            continue
        pos, n = H.pt(s, p, 2.0)
        turret(det, pos, n, 1.6, 'metal', 'hull2', 'mech', barrels=1, blen=2.0)

    # ---------------------------------------------------------------- hangar bay dressing
    y_c = -(s_h0 + s_h1) / 2
    xb = xh + 2 - 13  # back wall x
    det.box((xb + 0.3, y_c, 0.5 + 8.2), (0.6, s_h1 - s_h0 - 2, 0.5), 'window')      # ceiling light bar
    det.box((xb + 0.3, y_c, 0.5 - 3.0), (0.6, s_h1 - s_h0 - 4, 0.3), 'window')
    for k in range(6):
        det.box((xb + 0.4, y_c - 15 + k * 6, 0.5), (0.5, 0.6, 12), 'mech')         # back-wall ribs
    det.box((xb + 6.5, y_c, 0.5 - 8.6), (13, s_h1 - s_h0 - 1, 0.8), 'metal')         # bay deck
    for k in range(9):
        det.box((xh - 0.5, y_c - 16 + k * 4, 0.5 - 8.0), (0.6, 0.9, 0.3), 'engine' if False else 'window')
    for sgn in (1, -1):  # door frame
        det.box((xh + 0.5, y_c + sgn * ((s_h1 - s_h0) / 2 + 1.5), 0.5), (4, 3, 22), 'hull2', bevel=0.4)
    det.box((xh + 0.5, y_c, 0.5 + 10.5), (4, s_h1 - s_h0 + 6, 3), 'hull2', bevel=0.4)
    det.box((xh + 0.5, y_c, 0.5 - 10.5), (4, s_h1 - s_h0 + 6, 3), 'hull2', bevel=0.4)
    for k in range(7):  # hazard/landing lights on the lip
        det.box((xh + 2.6, y_c - 15 + k * 5, 0.5 - 9.6), (0.4, 1.2, 0.4), 'nav_g')
    empty('hangar_exit', (xh + 3.0, y_c, 0.5), rot=(0, 0, 90), size=6)

    # ---------------------------------------------------------------- dorsal spine deck + bridge
    def top(s):
        w, h, cz, cx = H.at(s)
        return cz + h / 2
    SP = Hull([(s, w, 7, top(s) + 3.5) for s, w in ((-226, 20), (-200, 30), (-60, 30), (40, 22), (96, 6))], HEX)
    SP.build(det, 'mech')
    plate_hull(det, SP, -224, 94, R, 8, 18, ['hull', 'hull2'], per_edge=1, edges=[0, 1, 2], thick=0.8, gap_s=1.0,
               sub_prob=0.2)
    BR = Hull([(-168, 16, 8, top(-168) + 9), (-150, 46, 14, top(-150) + 13), (-110, 42, 14, top(-110) + 13),
               (-92, 14, 7, top(-92) + 9)], HEX)
    BR.build(det, 'mech')
    plate_hull(det, BR, -166, -94, R, 8, 16, ['hull', 'hull', 'hull2'], per_edge=2, edges=[0, 1, 2], thick=0.8,
               gap_s=0.9, sub_prob=0.3)
    zb = top(-130) + 20
    BR2 = Hull([(-146, 20, 6, zb), (-128, 30, 8, zb + 1), (-110, 26, 7, zb + 0.5), (-102, 10, 4, zb - 0.5)], HEX)
    BR2.build(det, 'hull')
    for p in (0.5, 2.5):
        windows(det, BR2, -140, -104, p, off=0.05, pitch=1.3, size=(0.8, 1.0, 0.2))
    for p in (0.35, 0.65, 2.35, 2.65):
        windows(det, BR, -146, -98, p, off=0.85, pitch=1.4, size=(0.5, 0.9, 0.2), R=R, dropout=0.1)
    # asymmetric sensor spine (port) + mast cluster
    spine(det, (-10, 128, zb + 2), (-16, 176, zb + 30), 0.7, 'metal', nodes=4, node_mat='hull2', dish=True)
    for x, y, hh in ((5, 118, 18), (9, 124, 12), (2, 132, 22)):
        spine(det, (x, y, zb + 3), (x, y, zb + 3 + hh), 0.35, 'metal', nodes=2)
    det.sphere((6, 138, zb + 4), 3.0, 'hull2', seg=16, rings=8, half=True)

    # ---------------------------------------------------------------- ventral keel with launch tubes
    K = Hull([(-222, 44, 20, -34), (-160, 56, 24, -38), (-40, 50, 22, -36), (40, 28, 16, -30), (64, 1, 1, -27)],
             HEX)
    K.build(det, 'mech')
    plate_hull(det, K, -220, 50, R, 10, 22, ['hull2', 'hull', 'hull2'], per_edge=1, edges=[3, 4, 5, 0],
               thick=0.9, gap_s=1.0, sub_prob=0.2)
    for sgn, p in ((1, 5.5), (-1, 3.5)):
        for s in range(-200, 20, 22):
            pos, n = K.pt(s, p, 0.95)
            obox(det, pos, n, (4, 12, 0.5), 'bay')
            obox(det, pos + n * 0.2, n, (4.6, 0.6, 0.4), 'window')
    windows(det, K, -214, 30, 4.5, off=0.95, pitch=2.2, size=(0.4, 0.9, 0.2), R=R)

    # ---------------------------------------------------------------- prongs (tines) + main ion cannon
    for sd in (1, -1):
        T = Hull([(92, 34, 34, 0, sd * 26), (140, 30, 30, 0, sd * 32), (200, 24, 26, 0, sd * 32),
                  (250, 18, 20, 0, sd * 29), (282, 10, 12, 0, sd * 26), (300, 0, 0, 0, sd * 23)], KNIFE)
        T.build(det, 'mech')
        edges = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        armor(det, T, cuts(94, 280, R, 18, 40), [0, 1, 2, 3, 4, 5],
              lambda i, j, R: R.choice(['hull', 'hull', 'hull2']), R, thick=0.9, gap_s=1.0, gap_p=0.03,
              sub_prob=0.25)
        armor(det, T, cuts(94, 280, R, 18, 40), [5, 6, 7, 8, 9, 10], ['hull2', 'hull'], R, thick=0.9, gap_s=1.0,
              gap_p=0.02, sub_prob=0.4)
        for s0, s1, m in ((236, 248, 'rust'), (252, 255, 'blue'), (160, 164, 'rust')):
            stripe(det, T, s0, s1, 0.02, 4.98, m, off=0.9)
        inner_p = 4.5 if sd > 0 else 0.5
        outer_p = 0.4 if sd > 0 else 4.6
        windows(det, T, 100, 240, outer_p, off=0.95, pitch=1.8, size=(0.5, 1.0, 0.2), R=R, dropout=0.2)
        windows(det, T, 100, 220, outer_p + (0.15 if sd > 0 else -0.15), off=0.95, pitch=2.4, size=(0.4, 0.8, 0.2),
                R=R, dropout=0.3)
        pipes_along(det, T, 100, 240, inner_p, 0.6, 0.8, 'metal', step=14)
        pos, n = T.pt(296, 2.5, 0.1)
        det.sphere(T.pt(299, 0.0)[0], 0.8, 'nav_g' if sd > 0 else 'nav_r', seg=8, rings=4)
        for s in (150, 206):
            pos, n = T.pt(s, 2.5, 0.9)
            turret(det, pos, n, 3.0, 'metal', 'hull', 'mech', barrels=2)
        # strut to the cannon
        for s in (150, 210, 262):
            w, h, cz, cx = T.at(s)
            det.hexa([(sd * 6, -s + 2.5, -1.5), (sd * (abs(cx) - w / 2 + 2), -s + 4, -2.5),
                      (sd * (abs(cx) - w / 2 + 2), -s - 4, -2.5), (sd * 6, -s - 2.5, -1.5),
                      (sd * 6, -s + 2.5, 1.5), (sd * (abs(cx) - w / 2 + 2), -s + 4, 2.5),
                      (sd * (abs(cx) - w / 2 + 2), -s - 4, 2.5), (sd * 6, -s - 2.5, 1.5)], 'hull2', bevel=0.3)
    # cannon: exposed accelerator coils between armor collars
    det.cyl((0, -110, 0), (0, -284, 0), 4.2, 4.2, 'mech', seg=16)
    for k in range(34):
        s = 118 + k * 4.8
        det.cyl((0, -s, 0), (0, -(s + 1.8), 0), 6.2, 6.2, 'metal', seg=20)
    for s0 in (120, 176, 232):
        C = Hull([(s0, 13, 13, 0), (s0 + 2, 16, 16, 0), (s0 + 20, 16, 16, 0), (s0 + 24, 12, 12, 0)], [
            (math.cos((i + 0.5) / 8 * 2 * math.pi), math.sin((i + 0.5) / 8 * 2 * math.pi)) for i in range(8)])
        C.build(det, 'hull')
        stripe(det, C, s0 + 8, s0 + 11, 0, 8, 'blue', off=0.0, thick=0.25)
    det.cyl((0, -280, 0), (0, -291, 0), 9.0, 6.2, 'hull2', seg=24, bevel=0.3)
    annulus(det, (0, -291.4, 0), (0, 1, 0), 3.6, 6.4, 1.2, 'muzzle', seg=24)
    det.cyl((0, -289.0, 0), (0, -290.0, 0), 3.8, 3.8, 'muzzle', seg=24)
    empty('main_cannon', (0, -293, 0), size=8)

    # ---------------------------------------------------------------- engine block
    E = Hull([(-304, 148, 82, 0), (-298, 158, 90, 0), (-240, 158, 90, 0), (-224, 130, 70, 0)], BOX8)
    E.build(det, 'mech')
    plate_hull(det, E, -296, -226, R, 10, 20, ['hull', 'hull2', 'hull'], per_edge=2, edges=range(8), thick=1.6,
               gap_s=1.6, gap_p=0.025, sub_prob=0.35, skip=[(-294, -250, -0.1, 1.0), (-294, -250, 4.0, 5.0)])
    for p0, p1 in ((0.05, 3.95), (4.05, 7.95)):
        stripe(det, E, -262, -254, p0, p1, 'rust', off=1.6, thick=0.4)
        stripe(det, E, -250, -247, p0, p1, 'blue', off=1.6, thick=0.4)
    cowl(det, Hull([(-316, 150, 84, 0), (-300, 158, 90, 0)], BOX8), -316, -300, 5.0, 'hull2')
    for x in (-46, 0, 46):
        for z in (-20, 20):
            deep_nozzle(det, (x, 303, z), (0, 1, 0), 13.0, 'metal', 'mech', 'engine', depth=1.0)
    for x in (-66, 66):
        for z in (-29, 29):
            deep_nozzle(det, (x, 303, z), (0, 1, 0), 6.0, 'metal', 'mech', 'engine', depth=1.1, ribs=False)
    for sd in (1, -1):  # radiator fin banks on the block flanks
        fins(det, (sd * 79.0, 290, -30), (0, -1, 0), (sd, 0, 0), 11, 4.0, 7.0, 16, 0.9, 'metal')
        fins(det, (sd * 79.0, 290, 12), (0, -1, 0), (sd, 0, 0), 11, 4.0, 6.0, 14, 0.9, 'metal')
    for x in range(-60, 61, 12):  # top heat exchangers
        pos, n = E.pt(-270, 2.5, 1.6)
        obox(det, pos + Vector((x, 0, 0)), n, (7, 34, 2.5), 'mech', bevel=0.3)
        obox(det, pos + Vector((x, 0, 2.2)), n, (5.5, 30, 0.6), 'metal')

    # ---------------------------------------------------------------- nacelles on swept pylons (fletching)
    for sd in (1, -1):
        N = Hull([(-318, 26, 24, -8, sd * 106), (-308, 32, 30, -8, sd * 106), (-232, 32, 30, -8, sd * 106),
                  (-204, 22, 20, -8, sd * 106), (-184, 1, 1, -8, sd * 106)], KNIFE)
        N.build(det, 'mech')
        plate_hull(det, N, -306, -206, R, 8, 20, ['hull', 'hull2'], per_edge=1, thick=1.0, gap_s=1.0,
                   sub_prob=0.3)
        for s0, s1, m in ((-262, -254, 'rust'), (-250, -248, 'blue')):
            stripe(det, N, s0, s1, 0.02, 9.98, m, off=1.0)
        deep_nozzle(det, (sd * 106, 315, -8), (0, 1, 0), 10.5, 'metal', 'mech', 'engine', depth=1.0)
        det.sphere((sd * 106, 184, -8), 0.9, 'nav_g' if sd > 0 else 'nav_r', seg=8, rings=4)
        windows(det, N, -300, -214, 0.4 if sd > 0 else 4.6, off=1.05, pitch=1.6, size=(0.4, 0.9, 0.2), R=R)
        for zc, th in ((-4, 5.0), (-16, 3.0)):
            det.hexa([(sd * 74, 292, zc - th / 2), (sd * 92, 300, zc - th / 2 - 2), (sd * 92, 258, zc - th / 2 - 2),
                      (sd * 74, 236, zc - th / 2),
                      (sd * 74, 292, zc + th / 2), (sd * 92, 300, zc + th / 2 - 2), (sd * 92, 258, zc + th / 2 - 2),
                      (sd * 74, 236, zc + th / 2)], 'hull2', bevel=0.5)
        spine(det, (sd * 106, 240, 8), (sd * 106, 250, 26), 0.35, 'metal', nodes=2)

    hull_det = det.to_object('mothership_detail')
    join([hull_obj, hull_det], 'mothership')


# =====================================================================================
def ion_frigate():
    palette()
    R = rng(111)
    mb = MB()
    # lower hull: flat knife planform, widest aft
    L = Hull([(-30, 18, 6, -0.6), (-25, 21, 7, -0.6), (-9, 18.5, 6.4, -0.4), (3, 11, 4.8, -0.2), (12, 5, 3.2, 0),
              (16, 1.0, 1.0, 0)], KNIFE)
    L.build(mb, 'mech')
    plate_hull(mb, L, -29.5, 14, R, 7, 14, ['hull', 'hull', 'hull2'], per_edge=1, thick=0.35, gap_s=0.28,
               gap_p=0.012, sub_prob=0.5, sub_mat='hull2', skip_prob=0.03)
    # raised upper deck (set back) -> clear big/medium hierarchy
    U = Hull([(-29.5, 9, 4.5, 3.6), (-12, 10.5, 5.2, 3.9), (-2, 8, 4.4, 3.4), (6, 4, 2.6, 2.4)], HEX)
    U.build(mb, 'mech')
    plate_hull(mb, U, -29, 5, R, 6, 12, ['hull', 'hull2'], per_edge=1, edges=[0, 1, 2, 3], thick=0.3,
               gap_s=0.25, gap_p=0.015, sub_prob=0.5)
    for s0, s1, m in ((-21, -19.4, 'rust'), (-18.8, -18.3, 'blue')):
        stripe(mb, L, s0, s1, 0.02, 4.98, m, off=0.35, thick=0.1)
        stripe(mb, U, s0, s1, 0.02, 3.98, m, off=0.3, thick=0.1)
    for p in (0.35, 0.6, 4.4, 4.65):
        windows(mb, L, -27, 4, p, off=0.37, pitch=0.5, size=(0.12, 0.28, 0.05), R=R, dropout=0.2)
    for p in (0.5, 2.5):
        windows(mb, U, -27, 2, p, off=0.32, pitch=0.45, size=(0.12, 0.26, 0.05), R=R, dropout=0.15)
    # spinal cannon: armored housing -> exposed coils -> muzzle ring
    zc = 1.4
    OCT = [(math.cos((i + 0.5) / 8 * 2 * math.pi), math.sin((i + 0.5) / 8 * 2 * math.pi)) for i in range(8)]
    S = Hull([(-2, 6.4, 5.6, zc), (12, 5.2, 4.8, zc), (21, 4.2, 4.0, zc), (22, 3.4, 3.4, zc)], OCT)
    S.build(mb, 'mech')
    armor(mb, S, [-1.5, 5, 11, 16.5, 21.6], [0, 1, 2, 3, 4, 5, 6, 7, 8], ['hull', 'hull2', 'hull'], R, thick=0.28,
          gap_s=0.25, gap_p=0.03)
    mb.cyl((0, 0, zc), (0, -28, zc), 0.9, 0.9, 'mech', seg=12)
    for k in range(8):
        s = 22.3 + k * 0.62
        mb.cyl((0, -s, zc), (0, -(s + 0.3), zc), 1.5, 1.5, 'metal', seg=16)
    for sd in (1, -1):  # coil rails
        mb.cyl((sd * 1.25, -21.5, zc), (sd * 1.25, -27.5, zc), 0.14, 0.14, 'hull2', seg=6)
    mb.cyl((0, -27.2, zc), (0, -29.3, zc), 1.6, 2.2, 'hull2', seg=20, bevel=0.05)
    annulus(mb, (0, -29.5, zc), (0, 1, 0), 1.15, 2.15, 0.45, 'muzzle', seg=20)
    mb.cyl((0, -28.9, zc), (0, -29.15, zc), 1.2, 1.2, 'muzzle', seg=20)
    # engine nacelles + central bells
    for sd in (1, -1):
        N = Hull([(-31, 5.5, 5.5, -0.6, sd * 8.5), (-29, 6.2, 6.2, -0.6, sd * 8.5), (-16, 6.2, 6.2, -0.6, sd * 8.5),
                  (-10, 3, 3, -0.6, sd * 8.5), (-8, 0.4, 0.4, -0.6, sd * 8.5)], HEX)
        N.build(mb, 'mech')
        plate_hull(mb, N, -30.5, -11, R, 5, 9, ['hull2', 'hull'], per_edge=1, thick=0.25, gap_s=0.25, sub_prob=0.3)
        deep_nozzle(mb, (sd * 8.5, 31.0, -0.6), (0, 1, 0), 2.2, 'metal', 'mech', 'engine', depth=1.1, seg=18,
                    ribs=False)
        mb.hexa([(sd * 11, 27, -0.9), (sd * 16.5, 30.5, -1.6), (sd * 16.5, 27, -1.6), (sd * 11, 19, -0.9),
                 (sd * 11, 27, -0.5), (sd * 16.5, 30.5, -1.35), (sd * 16.5, 27, -1.35), (sd * 11, 19, -0.5)],
                'hull2', bevel=0.04)
        fins(mb, (sd * 12.8, 26.8, -1.1), (0, -1, 0), (0, 0, 1), 6, 1.0, 0.7, 2.4, 0.1, 'metal')
        mb.sphere((sd * 16.5, 29, -1.5), 0.14, 'nav_g' if sd > 0 else 'nav_r', seg=6, rings=3)
    for x in (-3.2, 0, 3.2):
        deep_nozzle(mb, (x, 30.6, -0.6), (0, 1, 0), 1.35, 'metal', 'mech', 'engine', depth=1.1, seg=16, ribs=False)
    # offset bridge (port) + sensor spine (starboard) + turrets
    BB = Hull([(-24, 2.5, 1.2, 6.6, -2.4), (-19, 4.5, 2.0, 7.0, -2.4), (-12, 4, 1.8, 6.9, -2.4),
               (-9.5, 1.5, 0.8, 6.4, -2.4)], HEX)
    BB.build(mb, 'hull')
    windows(mb, BB, -18.5, -10.5, 0.5, off=0.02, pitch=0.35, size=(0.16, 0.24, 0.04))
    windows(mb, BB, -18.5, -10.5, 2.5, off=0.02, pitch=0.35, size=(0.16, 0.24, 0.04))
    spine(mb, (2.6, 22, 6.0), (2.9, 28.5, 10.5), 0.11, 'metal', nodes=3, node_mat='hull2')
    for s in (-5, 2):
        pos, n = U.pt(s, 1.5, 0.3)
        turret(mb, pos, n, 0.9, 'metal', 'hull', 'mech', barrels=2, blen=2.2)
    digits(mb, L, '27', -18, 4.5, 1.6, 'rust', off=0.37, thick=0.05)
    digits(mb, L, '27', -18, 0.5, 1.6, 'rust', off=0.37, thick=0.05)
    return [mb.to_object('ion_frigate', smooth_angle=24)]


WEDGE_P = [(1, -0.2), (0.8, 0.6), (0.45, 1), (-0.45, 1), (-0.8, 0.6), (-1, -0.2), (-0.7, -1), (0.7, -1)]


# =====================================================================================
def assault_frigate():
    palette()
    R = rng(121)
    mb = MB()
    B = Hull([(-22, 20, 8.5, 0), (-18.5, 22, 9.5, 0), (0, 22, 9.5, 0.2), (11, 17, 8, 0), (19, 8, 4.5, -0.5),
              (23.5, 2, 1.5, -0.7)], WEDGE_P)
    B.build(mb, 'mech')
    plate_hull(mb, B, -21.5, 21, R, 6, 12, ['hull', 'hull', 'hull2'], per_edge=1, thick=0.35, gap_s=0.28,
               gap_p=0.014, sub_prob=0.5, sub_mat='hull2')
    # armored citadel deck
    C = Hull([(-21, 12, 3.6, 6.1), (-5, 13.5, 4.2, 6.4), (6, 10, 3.4, 5.8), (11, 3, 1.4, 5.0)], HEX)
    C.build(mb, 'mech')
    plate_hull(mb, C, -20.5, 10, R, 5, 10, ['hull', 'hull2'], per_edge=1, edges=[0, 1, 2, 3], thick=0.3,
               gap_s=0.25, sub_prob=0.5)
    for s0, s1, m in ((-15, -13.6, 'rust'), (-13, -12.6, 'blue'), (12, 13.2, 'rust')):
        stripe(mb, B, s0, s1, 0.02, 4.98, m, off=0.35, thick=0.1)
    for p in (0.35, 0.6, 4.4, 4.65):
        windows(mb, B, -20, 16, p, off=0.37, pitch=0.5, size=(0.12, 0.28, 0.05), R=R, dropout=0.25)
    for p in (0.5, 2.5):
        windows(mb, C, -19, 7, p, off=0.32, pitch=0.45, size=(0.12, 0.26, 0.05), R=R, dropout=0.15)
    # sponsons with missile cells
    for sd in (1, -1):
        SPn = Hull([(-23, 5, 5.5, -1.6, sd * 12), (-21, 5.6, 6.2, -1.6, sd * 12), (0, 5.6, 6.2, -1.6, sd * 12),
                    (6, 3, 3.6, -1.6, sd * 12), (9, 0.4, 0.5, -1.6, sd * 12)], BOX8)
        SPn.build(mb, 'mech')
        plate_hull(mb, SPn, -22.5, 5, R, 4, 8, ['hull2', 'hull'], per_edge=1, thick=0.25, gap_s=0.22, sub_prob=0.3)
        pos, n = SPn.pt(-9, 0.5 if sd > 0 else 4.5, 0.25)
        for k in range(4):
            for m in range(2):
                obox(mb, pos + Vector((0, -3 + k * 2.0, -0.6 + m * 1.2)), n, (0.9, 1.4, 0.12), 'mech', lift=0.0)
        deep_nozzle(mb, (sd * 12, 23.0, -1.6), (0, 1, 0), 2.1, 'metal', 'mech', 'engine', depth=1.1, seg=18,
                    ribs=False)
        mb.sphere((sd * 14.8, 0, -1.6), 0.14, 'nav_g' if sd > 0 else 'nav_r', seg=6, rings=3)
    cowl(mb, Hull([(-24, 20, 8.8, 0), (-21.8, 19.8, 8.6, 0)], WEDGE_P), -24, -21.8, 0.6, 'hull2')
    for x, z, r in ((-4.6, 0, 2.6), (4.6, 0, 2.6), (0, -1.8, 1.5), (0, 2.2, 1.3)):
        deep_nozzle(mb, (x, 22.2, z), (0, 1, 0), r, 'metal', 'mech', 'engine', depth=1.1, seg=18, ribs=False)
    for s in (3, -7):
        pos, n = C.pt(s, 1.5, 0.3)
        turret(mb, pos, n, 1.55, 'metal', 'hull', 'mech', barrels=2, blen=2.6)
    pos, n = B.pt(4, 6.5, 0.35)
    turret(mb, pos, n, 1.4, 'metal', 'hull', 'mech', barrels=2, blen=2.4)
    BR = Hull([(-19, 3, 1.4, 8.7, 2.8), (-15, 5.6, 2.2, 9.2, 2.8), (-10, 5, 2.0, 9.0, 2.8), (-8, 2, 1, 8.5, 2.8)], HEX)
    BR.build(mb, 'hull')
    windows(mb, BR, -14.5, -9, 0.5, off=0.02, pitch=0.33, size=(0.16, 0.22, 0.04))
    windows(mb, BR, -14.5, -9, 2.5, off=0.02, pitch=0.33, size=(0.16, 0.22, 0.04))
    spine(mb, (-3.0, 17, 8.2), (-3.2, 21.5, 12.5), 0.1, 'metal', nodes=3, node_mat='hull2')
    P = Hull([(10, 13, 6, -0.3), (18, 8.5, 4.6, -0.5), (24.5, 1.2, 1.2, -0.7)], WEDGE_P)
    P.build(mb, 'hull2', off=0.4)
    digits(mb, B, '14', -16, 4.5, 1.9, 'rust', off=0.37, thick=0.05)
    digits(mb, B, '14', -16, 0.5, 1.9, 'rust', off=0.37, thick=0.05)
    mb.bm.transform(Matrix.Scale(0.95, 4))  # keep length within +-10% of the 45 contract
    return [mb.to_object('assault_frigate', smooth_angle=24)]


# =====================================================================================
def interceptor():
    palette()
    R = rng(131)
    mb = MB()
    F = Hull([(-4.0, 1.3, 0.8, 0), (-3.6, 1.5, 0.95, 0), (-1.2, 1.3, 0.95, 0.05), (1.5, 0.75, 0.6, 0),
              (4.2, 0.05, 0.05, -0.05)], KNIFE)
    F.build(mb, 'mech')
    armor(mb, F, [-3.9, -1.6, 1.2, 3.9], [0, 2, 3, 5, 7, 8, 10], ['hull', 'hull', 'hull2'], R,
          thick=0.05, gap_s=0.05, gap_p=0.01)
    stripe(mb, F, 2.2, 2.45, 0.02, 9.98, 'blue', off=0.05, thick=0.02)
    stripe(mb, F, -2.2, -2.0, 0.02, 4.98, 'rust', off=0.05, thick=0.02)
    mb.sphere((0, -0.6, 0.46), 0.33, 'canopy', seg=16, rings=8, scale=(1.0, 3.0, 0.8))
    for sd in (1, -1):
        # cranked delta wing
        mb.hexa([(sd * 0.5, 3.2, -0.06), (sd * 2.2, 3.6, -0.1), (sd * 2.4, 2.4, -0.1), (sd * 0.5, -0.8, -0.06),
                 (sd * 0.5, 3.2, 0.08), (sd * 2.2, 3.6, -0.04), (sd * 2.4, 2.4, -0.04), (sd * 0.5, -0.8, 0.08)],
                'hull', bevel=0.02)
        mb.hexa([(sd * 2.2, 3.6, -0.1), (sd * 3.5, 3.9, -0.14), (sd * 3.5, 3.2, -0.14), (sd * 2.4, 2.4, -0.1),
                 (sd * 2.2, 3.6, -0.04), (sd * 3.5, 3.9, -0.1), (sd * 3.5, 3.2, -0.1), (sd * 2.4, 2.4, -0.04)],
                'blue', bevel=0.01)
        mb.hexa([(sd * 0.42, 4.0, 0.3), (sd * 0.5, 4.0, 0.3), (sd * 0.5, 2.5, 0.3), (sd * 0.42, 2.5, 0.3),
                 (sd * 0.85, 4.3, 1.25), (sd * 0.9, 4.3, 1.25), (sd * 0.9, 3.8, 1.25), (sd * 0.85, 3.8, 1.25)], 'hull2')
        mb.cyl((sd * 1.1, 1.8, -0.15), (sd * 1.1, -1.8, -0.15), 0.07, 0.05, 'metal', seg=6)
        # engine pods
        mb.cyl((sd * 0.45, 2.0, 0.0), (sd * 0.45, 4.05, 0.0), 0.36, 0.4, 'hull2', seg=12)
        deep_nozzle(mb, (sd * 0.45, 4.05, 0.0), (0, 1, 0), 0.32, 'metal', 'mech', 'engine', depth=1.0, seg=14,
                    ribs=False)
        mb.sphere((sd * 3.5, 3.55, -0.12), 0.05, 'nav_g' if sd > 0 else 'nav_r', seg=6, rings=3)
    return [mb.to_object('interceptor', smooth_angle=24)]
