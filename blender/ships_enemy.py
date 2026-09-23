"""Enemy fleet v2 (Vaygr / Zeon influenced, see DESIGN_NOTES.md): frigate, dreadnought, fighter.
Crimson/charcoal, blade-like, asymmetric details, glowing orange vents. Blender space: nose -Y."""
import math
from mathutils import Vector, Matrix
from lib import MB, reg, empty, rng, lerp, annulus, D2R
from shipkit import (Hull, KNIFE, HEX, BOX8, DIAMOND, BLADE, plate, armor, cuts, plate_hull, obox, windows,
                     deep_nozzle, turret, fins, spine, digits, cowl, join)

VAY = [(1, 0), (0.62, 0.62), (0.22, 1), (-0.22, 1), (-0.62, 0.62), (-1, 0), (-0.62, -0.62), (-0.22, -1),
       (0.22, -1), (0.62, -0.62)]


def palette():
    reg('armor', (0.30, 0.018, 0.022), 0.3, 0.5)      # crimson
    reg('armor2', (0.12, 0.01, 0.014), 0.35, 0.5)      # dark maroon
    reg('char', (0.035, 0.035, 0.042), 0.7, 0.45)      # charcoal mechanical core
    reg('plate_k', (0.075, 0.075, 0.085), 0.55, 0.45)        # charcoal armor
    reg('steel', (0.30, 0.29, 0.30), 0.9, 0.3)
    reg('engine', (0.3, 0.1, 0.05), 0.0, 0.3, (1.0, 0.38, 0.1), 3.0)
    reg('vent', (0.3, 0.08, 0.02), 0.0, 0.4, (1.0, 0.32, 0.06), 3.5)
    reg('window', (0.3, 0.12, 0.05), 0.0, 0.4, (1.0, 0.55, 0.25), 2.5)
    reg('lance', (0.1, 0.0, 0.12), 0.0, 0.3, (0.75, 0.25, 1.0), 5.0)
    reg('muzzle', (0.3, 0.1, 0.05), 0.0, 0.3, (1.0, 0.4, 0.15), 5.0)


def blade(mb, r0, r1, t0, thick, mat, t1=None, up=(0, 0, 1), bevel=0.0, tip_thin=0.25):
    """Flat blade with root edge r0->r1 and tip edge t0(->t1)."""
    up = Vector(up).normalized() * (thick / 2)
    r0, r1, t0 = Vector(r0), Vector(r1), Vector(t0)
    t1 = Vector(t1) if t1 is not None else t0 + (r1 - r0) * 0.03
    k = tip_thin
    mb.hexa([r0 - up, r1 - up, t1 - up * k, t0 - up * k, r0 + up, r1 + up, t1 + up * k, t0 + up * k], mat,
            bevel=bevel)


def scale_mats(i, j, R):
    return R.choice(['armor', 'armor', 'armor', 'armor2', 'plate_k'])


def vent_row(mb, hull, s0, s1, p, off, pitch, size, mat='vent'):
    s = s0
    while s < s1:
        pos, n = hull.pt(s, p, off)
        obox(mb, pos, n, size, mat, lift=0.0)
        s += pitch


# =====================================================================================
def enemy_frigate():
    palette()
    R = rng(141)
    mb = MB()
    C = Hull([(-27, 9, 7, 0), (-21, 11, 8.2, 0), (-2, 10.5, 7.6, 0.2), (12, 6.5, 5, 0), (22, 3, 2.4, -0.2),
              (29, 0.2, 0.2, -0.3)], VAY)
    C.build(mb, 'char')
    # overlapping crimson scales (two layers) with glowing vents in the side trenches
    sc = cuts(-26.5, 24, R, 5, 9)
    armor(mb, C, sc, [0.08, 1, 2, 3, 4, 4.92], scale_mats, R, thick=0.35, gap_s=0.3, gap_p=0.05, sub_prob=0.0)
    armor(mb, C, sc, [5.08, 6, 7, 8, 9, 9.92], lambda i, j, R: R.choice(['plate_k', 'armor2']), R, thick=0.3,
          gap_s=0.3, gap_p=0.05)
    for a, b in zip(sc, sc[1:]):   # second (upper) scale layer, set back so the forward edge overlaps
        L = b - a
        plate(mb, C, a + L * 0.35, b - 0.1, 1.15, 3.85, R.choice(['armor', 'armor2']), off=0.35, thick=0.3)
    for p in (0.0, 5.0):
        vent_row(mb, C, -24, 10, p, 0.12, 1.1, (0.25, 0.7, 0.1))
    for p in (0.6, 4.4):
        windows(mb, C, -22, 8, p, off=0.37, pitch=0.6, size=(0.14, 0.3, 0.05), R=R, dropout=0.3)
    # mandible blades (asymmetric lengths) + rear swept blades
    for sd, reach in ((1, 17), (-1, 23)):
        blade(mb, (sd * 4.2, 4, 0.2), (sd * 3.6, -9, 0.1), (sd * 7.5, -reach, -0.6), 0.5, 'armor',
              t1=(sd * 9.0, -8, -0.4), bevel=0.05)
        blade(mb, (sd * 4.4, 3, 0.75), (sd * 3.8, -6, 0.65), (sd * 6.2, -reach * 0.7, 0.3), 0.3, 'armor2',
              t1=(sd * 7.4, -5, 0.3), bevel=0.03)
        blade(mb, (sd * 4.8, 22, 0.3), (sd * 4.8, 8, 0.3), (sd * 12.5, 26, -1.2), 0.45, 'armor',
              t1=(sd * 10.5, 19, -0.9), bevel=0.04)
        blade(mb, (sd * 4.6, 20, 0.85), (sd * 4.6, 12, 0.85), (sd * 9.5, 23.5, 0.0), 0.3, 'plate_k',
              t1=(sd * 8.2, 18.5, 0.1), bevel=0.03)
    # dorsal knife fin + ventral keel blade
    blade(mb, (0, 16, 3.4), (0, -2, 3.6), (0, 20, 10.5), 0.35, 'armor', t1=(0, 13, 9.8), up=(1, 0, 0), bevel=0.04)
    blade(mb, (0, 12, -3.6), (0, -6, -3.4), (0, 16, -7.5), 0.3, 'plate_k', t1=(0, 8, -7.0), up=(1, 0, 0))
    # Musai-like low engine nacelles
    for sd in (1, -1):
        N = Hull([(-29.5, 4.2, 3.8, -3.6, sd * 7), (-27.5, 4.8, 4.4, -3.6, sd * 7), (-12, 4.8, 4.4, -3.6, sd * 7),
                  (-6, 2.4, 2.2, -3.6, sd * 7), (-3, 0.3, 0.3, -3.6, sd * 7)], HEX)
        N.build(mb, 'char')
        plate_hull(mb, N, -29, -7, R, 3.5, 6, ['armor', 'armor2'], per_edge=1, thick=0.25, gap_s=0.25,
                   gap_p=0.05, sub_prob=0.2)
        vent_row(mb, N, -27, -10, 0.0 if sd > 0 else 3.0, 0.1, 0.9, (0.2, 0.55, 0.08))
        deep_nozzle(mb, (sd * 7, 29.4, -3.6), (0, 1, 0), 1.75, 'steel', 'char', 'engine', depth=1.1, seg=16,
                    ribs=False)
        mb.hexa([(sd * 3.5, 24, -1.5), (sd * 5.5, 24, -2.6), (sd * 5.5, 14, -2.6), (sd * 3.5, 12, -1.5),
                 (sd * 3.5, 24, -0.9), (sd * 5.5, 24, -2.0), (sd * 5.5, 14, -2.0), (sd * 3.5, 12, -0.9)], 'plate_k')
    cowl(mb, Hull([(-28.5, 9.4, 7.3, 0), (-26.8, 9.2, 7.1, 0)], VAY), -28.5, -26.8, 0.4, 'plate_k')
    for x, z in ((-2.1, 0), (2.1, 0), (0, 1.9)):
        deep_nozzle(mb, (x, 27.2, z), (0, 1, 0), 1.35, 'steel', 'char', 'engine', depth=1.1, seg=14, ribs=False)
    # asymmetric turret (starboard only) + command blister offset to port
    pos, n = C.pt(-2, 1.4, 0.35)
    turret(mb, pos, n, 1.2, 'steel', 'plate_k', 'char', barrels=2, blen=2.6)
    BR = Hull([(-15, 2, 1, 4.3, -1.2), (-10, 3.6, 1.7, 4.8, -1.2), (-4, 3, 1.4, 4.6, -1.2), (-1, 1, 0.5, 4.1, -1.2)],
              HEX)
    BR.build(mb, 'plate_k')
    windows(mb, BR, -9.5, -3.5, 0.5, off=0.02, pitch=0.35, size=(0.14, 0.22, 0.04))
    windows(mb, BR, -9.5, -3.5, 2.5, off=0.02, pitch=0.35, size=(0.14, 0.22, 0.04))
    spine(mb, (1.0, 14, 4.2), (1.2, 19, 7.4), 0.08, 'steel', nodes=2)
    mb.cyl((0, -27, -0.3), (0, -31.5, -0.3), 0.45, 0.02, 'steel', seg=8)
    mb.bm.transform(Matrix.Scale(0.9, 4))  # keep length within +-10% of the 55 contract
    return [mb.to_object('enemy_frigate', smooth_angle=24)]


# =====================================================================================
def enemy_dreadnought():
    palette()
    R = rng(151)
    mb = MB()
    B = Hull([(-196, 84, 54, 0), (-184, 98, 64, 0), (-120, 104, 70, 0), (-40, 96, 66, 0), (20, 78, 56, 0),
              (60, 52, 44, 0), (82, 28, 28, 0)], VAY)
    B.build(mb, 'char')
    # crimson scale armor: upper body two layers, lower body charcoal; glowing vents in side trenches
    sc = cuts(-194, 80, R, 18, 34)
    armor(mb, B, sc, [0.06, 1, 2, 3, 4, 4.94], scale_mats, R, thick=2.2, gap_s=1.6, gap_p=0.04, sub_prob=0.35,
          sub_mat='armor2')
    armor(mb, B, cuts(-194, 80, R, 20, 40), [5.06, 6, 7, 8, 9, 9.94],
          lambda i, j, R: R.choice(['plate_k', 'plate_k', 'armor2']), R, thick=1.8, gap_s=1.6, gap_p=0.04,
          sub_prob=0.3)
    for a, b in zip(sc, sc[1:]):
        L = b - a
        for pa, pb in ((1.1, 1.9), (3.1, 3.9)):
            plate(mb, B, a + L * 0.3, b - 0.8, pa, pb, R.choice(['armor', 'armor2']), off=2.2, thick=1.6)
    for p in (0.0, 5.0):
        vent_row(mb, B, -186, 60, p, 0.4, 5.0, (1.4, 3.2, 0.3))
    for p in (1.0, 4.0):
        vent_row(mb, B, -186, 60, p, 0.4, 7.0, (1.0, 3.8, 0.3))
    for p in (0.45, 0.7, 4.3, 4.55, 9.5, 5.5):
        windows(mb, B, -186, 60, p, off=2.25, pitch=2.2, size=(0.5, 1.1, 0.25), R=R, dropout=0.35)
    # ---- engine block with vent grilles + deep bells
    E = Hull([(-212, 84, 60, 0), (-206, 94, 70, 0), (-168, 94, 70, 0), (-156, 80, 58, 0)], BOX8)
    E.build(mb, 'char')
    plate_hull(mb, E, -205, -158, R, 10, 18, ['plate_k', 'armor2', 'armor'], per_edge=2, thick=1.6, gap_s=1.2,
               gap_p=0.03, sub_prob=0.3, skip=[(-204, -170, -0.1, 1.0), (-204, -170, 4.0, 5.0)])
    for sd in (1, -1):
        for k in range(9):
            obox(mb, Vector((sd * 47.2, 172 + k * 3.6, 0)), Vector((sd, 0, 0)), (40, 1.4, 0.8), 'plate_k', lift=0.0)
            obox(mb, Vector((sd * 47.0, 173.8 + k * 3.6, 0)), Vector((sd, 0, 0)), (36, 0.9, 0.3), 'vent', lift=0.0)
    cowl(mb, Hull([(-222, 86, 62, 0), (-210, 94, 70, 0)], BOX8), -222, -210, 4.0, 'armor2')
    for x in (-20, 20):
        for z in (-14, 14):
            deep_nozzle(mb, (x, 211, z), (0, 1, 0), 12.0, 'steel', 'char', 'engine', depth=0.95)
    for x, z in ((-38, 0), (38, 0), (0, -27), (0, 27)):
        deep_nozzle(mb, (x, 211, z), (0, 1, 0), 5.2, 'steel', 'char', 'engine', depth=1.1, ribs=False)
    # ---- forked prow (tines) with serrated inner edges
    for sd in (1, -1):
        T = Hull([(18, 30, 58, 0, sd * 40), (70, 24, 54, 0, sd * 36), (130, 18, 44, 0, sd * 32),
                  (175, 11, 28, 0, sd * 29), (200, 5, 12, 0, sd * 27), (214, 0.2, 0.2, 0, sd * 26)], DIAMOND)
        T.build(mb, 'char')
        armor(mb, T, cuts(20, 196, R, 22, 40), [0.05, 2, 3.95], scale_mats, R, thick=1.6, gap_s=1.2,
              gap_p=0.04, sub_prob=0.35, sub_mat='armor2')
        armor(mb, T, cuts(20, 196, R, 22, 40), [4.05, 6, 7.95],
              lambda i, j, R: R.choice(['armor', 'armor2', 'plate_k']), R, thick=1.4, gap_s=1.2, gap_p=0.04)
        inner = 4.0 if sd > 0 else 0.0
        outer = 0.0 if sd > 0 else 4.0
        vent_row(mb, T, 26, 190, inner, 0.3, 4.5, (1.2, 2.2, 0.3))
        vent_row(mb, T, 26, 170, outer, 0.3, 6.0, (0.8, 2.6, 0.3))
        for k, s in enumerate(range(34, 190, 13)):  # inner teeth
            pos, n = T.pt(s, inner, 1.2)
            L = 7.5 - k * 0.35
            blade(mb, pos + Vector((0, 4, 0)), pos + Vector((0, -4, 0)), pos + n * L + Vector((0, -6, 0)), 1.6,
                  'steel' if k % 2 else 'armor2', bevel=0.2)
        for k, s in enumerate(range(30, 180, 20)):  # outer spikes
            pos, n = T.pt(s, outer, 1.4)
            blade(mb, pos + Vector((0, 5, 0)), pos + Vector((0, -5, 0)), pos + n * (13 - k) + Vector((0, 9, 0)), 2.0,
                  'armor' if k % 2 else 'armor2', bevel=0.25)
    # lance: emitter orb + coils between the tines
    mb.sphere((0, -86, 0), 10, 'lance', seg=28, rings=14)
    mb.cyl((0, -60, 0), (0, -80, 0), 17, 10, 'steel', seg=24)
    for s in (100, 122, 144, 166, 186):
        r = 13 - (s - 100) * 0.04
        annulus(mb, (0, -s, 0), (0, 1, 0), r, r + 4, 4, 'plate_k', seg=28, mat_inner='lance')
    for s, x1 in ((100, 27), (144, 23), (186, 21)):
        x0 = 13 - (s - 100) * 0.04 + 3.5
        for sd in (1, -1):
            mb.box((sd * (x0 + x1) / 2, -s, 0), (x1 - x0 + 2, 3, 3), 'steel', bevel=0.3)
    empty('lance_emitter', (0, -200, 0), size=12)
    # ---- dorsal blade crest, swept wings, command tower (offset to port)
    for i, s in enumerate(range(-150, 30, 26)):
        w, h, cz, cx = B.at(s)
        H_ = 20 + 8 * math.sin(i * 0.9)
        blade(mb, (0, -s + 9, h / 2 - 3), (0, -s - 9, h / 2 - 3), (0, -s + 20, h / 2 + H_), 3.0,
              'armor' if i % 2 else 'armor2', t1=(0, -s + 12, h / 2 + H_ * 0.85), up=(1, 0, 0), bevel=0.3)
    for sd in (1, -1):
        blade(mb, (sd * 46, 150, -2), (sd * 48, 60, -2), (sd * 132, 206, -16), 5.0, 'armor',
              t1=(sd * 120, 170, -13), bevel=0.6)
        blade(mb, (sd * 60, 150, 1.5), (sd * 62, 108, 1.5), (sd * 120, 198, -11), 4.0, 'plate_k',
              t1=(sd * 112, 176, -10), bevel=0.4)
        blade(mb, (sd * 40, 20, -12), (sd * 38, -40, -12), (sd * 82, 44, -30), 3.0, 'armor2', t1=(sd * 74, 22, -26),
              bevel=0.3)
        for k in range(6):
            mb.box((sd * (70 + k * 9), 150 + k * 7.5, -5.5 - k * 1.2), (1.2, 10, 1.2), 'vent')
    zt = B.at(-110)[1] / 2
    TW = Hull([(-152, 8, 8, zt + 3, -16), (-136, 26, 18, zt + 10, -16), (-104, 22, 16, zt + 10, -16),
               (-92, 3, 3, zt + 5, -16)], VAY)
    TW.build(mb, 'char')
    plate_hull(mb, TW, -150, -94, R, 7, 14, ['armor', 'armor2'], per_edge=1, edges=[0, 1, 2, 3, 4], thick=1.0,
               gap_s=0.8, sub_prob=0.4)
    TW2 = Hull([(-142, 8, 6, zt + 21, -16), (-126, 18, 10, zt + 23, -16), (-110, 10, 6, zt + 21, -16),
                (-102, 1, 1, zt + 19, -16)], VAY)
    TW2.build(mb, 'armor')
    for p in (0.4, 4.6):
        windows(mb, TW, -132, -104, p, off=1.05, pitch=1.3, size=(0.5, 0.9, 0.2), R=R, dropout=0.1)
        windows(mb, TW2, -134, -110, p, off=0.05, pitch=1.1, size=(0.45, 0.8, 0.2))
    mb.box((-16, 103, zt + 25), (9, 1.5, 1.0), 'window', rot=(-25, 0, 0))
    spine(mb, (-12, 128, zt + 27), (-10, 150, zt + 46), 0.5, 'steel', nodes=3)
    spine(mb, (-20, 132, zt + 26), (-21, 140, zt + 38), 0.35, 'steel', nodes=2)
    # turret batteries (big twins on the upper chamfers, starboard gets an extra triple)
    for s in (-130, -70, -10, 40):
        for p in (1.5, 3.5):
            if p == 3.5 and s == -130:
                continue
            pos, n = B.pt(s, p, 2.2)
            turret(mb, pos, n, 6.0, 'steel', 'plate_k', 'char', barrels=2, blen=2.6)
    pos, n = B.pt(10, 1.2, 2.2)
    turret(mb, pos, n, 7.0, 'steel', 'armor2', 'char', barrels=3, blen=2.8)
    for _ in range(24):
        s = R.uniform(-180, 60)
        p = R.choice([0.5, 4.5, 6.5, 8.5])
        pos, n = B.pt(s, p, 1.9)
        turret(mb, pos, n, 2.0, 'steel', 'plate_k', 'char', barrels=1, blen=2.0)
    return [mb.to_object('enemy_dreadnought', smooth_angle=24)]


# =====================================================================================
def enemy_fighter():
    palette()
    R = rng(161)
    mb = MB()
    F = Hull([(-4.5, 1.1, 0.75, 0), (-4.0, 1.35, 0.9, 0), (-1, 1.15, 0.8, 0.05), (2, 0.6, 0.45, 0),
              (4.7, 0.04, 0.04, 0)], VAY)
    F.build(mb, 'char')
    armor(mb, F, [-4.4, -2.2, 0.2, 2.6, 4.2], [0.05, 2, 3, 4.95, 6, 9.95], scale_mats, R, thick=0.05, gap_s=0.07,
          gap_p=0.04)
    mb.sphere((0, 0.3, 0.33), 0.26, 'plate_k', seg=12, rings=6, scale=(0.9, 3.0, 0.8))
    mb.box((0, -0.5, 0.5), (0.16, 0.9, 0.04), 'window')
    for sd in (1, -1):
        blade(mb, (sd * 0.5, 2.8, 0), (sd * 0.5, 0.0, 0), (sd * 3.0, -1.8, -0.25), 0.12, 'armor',
              t1=(sd * 3.2, 0.2, -0.2), bevel=0.01)
        blade(mb, (sd * 2.4, -0.6, -0.2), (sd * 3.0, -1.6, -0.25), (sd * 3.1, -3.3, -0.3), 0.08, 'armor2')
        blade(mb, (sd * 0.4, 4.3, 0.2), (sd * 0.4, 2.5, 0.2), (sd * 1.3, 4.9, 1.2), 0.08, 'plate_k',
              up=(1, 0, -0.3 * sd))
        blade(mb, (sd * 0.45, 4.3, -0.2), (sd * 0.45, 3.0, -0.2), (sd * 1.1, 4.8, -0.9), 0.07, 'armor',
              up=(1, 0, 0.3 * sd))
        mb.cyl((sd * 0.62, 0.5, -0.2), (sd * 0.62, -2.6, -0.2), 0.06, 0.045, 'steel', seg=6)
        mb.box((sd * 0.58, 2.6, 0.05), (0.06, 1.2, 0.12), 'vent')
    deep_nozzle(mb, (0, 4.45, 0), (0, 1, 0), 0.42, 'steel', 'char', 'engine', depth=1.0, seg=14, ribs=False)
    return [mb.to_object('enemy_fighter', smooth_angle=24)]
