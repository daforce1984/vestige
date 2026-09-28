"""v15 enemy frigate: its own ship class, no longer a scaled-down dreadnought.

Same faction look as ships_enemy_v5 (burnt-orange panelled armour, bare grey metal, dark mechanics, olive parts,
lime running lights, yellow triangle decals) but a different structure and silhouette:
  * a narrow, TALL blade keel (taller than wide, V-keel underneath) ending in a long pointed ram bow
    -- the dreadnought is a wide flat slab with a dorsal trench and a forked blunt prow
  * two outrigger engine nacelles on FORWARD-SWEPT pylons at mid-ship, each with a big engine bell aft and a
    twin gun mount at its nose -- the dreadnought has one engine cluster inside a stern horseshoe cowl
  * a raked dorsal conning tower (sail) with the bridge on top, well aft -- the dreadnought's bridge is a low
    offset block on its rail
  * no dorsal trench, no horseshoe ring
Contract with the engine: single mesh node 'enemy_frigate', 'engine' material only on the 4 nozzle discs (emit
points), nose +Z in glTF (Blender -Y), length ~57 m like before.
Blender space: nose -Y (station s = -y), up +Z."""
import math
from mathutils import Vector
from lib import MB, rng, lerp
from shipkit import Hull, armor, cuts, obox, deep_nozzle, turret, spine, windows, lamp_fixture, fins
from ships_enemy_v5 import palette

# blade keel: vertical flanks, chamfered shoulders, flat deck, V keel below
# edges: 0 stbd flank, 1 stbd shoulder, 2 deck, 3 port shoulder, 4 port flank, 5 port bilge, 6 port keel,
#        7 stbd keel, 8 stbd bilge
KEEL = [(1, -0.12), (1, 0.42), (0.6, 1), (-0.6, 1), (-1, 0.42), (-1, -0.12), (-0.5, -0.7), (0, -1), (0.5, -0.7)]
# nacelle: chamfered octagon.  edges: 0 stbd, 1 upper stbd, 2 top, 3 upper port, 4 port, 5 lower port, 6 bottom,
# 7 lower stbd
OCT = [(1, -0.42), (1, 0.42), (0.42, 1), (-0.42, 1), (-1, 0.42), (-1, -0.42), (-0.42, -1), (0.42, -1)]
# tower: tapered box
TWR = [(1, -1), (1, 0.6), (0.7, 1), (-0.7, 1), (-1, 0.6), (-1, -1)]

POD_X, POD_Z = 10.2, -0.8


def paint_hi(i, j, R):
    return 'paint' if R.random() < 0.8 else 'paint2'


def paint_lo(i, j, R):
    return 'paint2' if R.random() < 0.6 else 'paint'


def pylon(mb, sd, R):
    """Forward-swept wing pylon from the keel flank out to the nacelle (root aft, tip forward)."""
    t = 0.45
    # (x, s_lead, s_trail, z) at root / tip
    rx, rl, rt, rz = 2.6, -3.0, -14.0, 0.4
    tx, tl, tt, tz = POD_X - 1.2, 3.5, -5.5, POD_Z + 0.2
    bot = [(sd * rx, -rl, rz - t), (sd * tx, -tl, tz - t), (sd * tx, -tt, tz - t), (sd * rx, -rt, rz - t)]
    top = [(x, y, z + 2 * t) for x, y, z in bot]
    if sd < 0:
        bot, top = bot[::-1], top[::-1]
    mb.hexa(bot + top, 'paint', bevel=0.12)
    # dark leading-edge cuff and trailing-edge actuator housings
    a, b = Vector((sd * (rx + 0.6), -rl + 0.2, rz)), Vector((sd * (tx - 0.3), -tl + 0.2, tz))
    mb.cyl(a, b, 0.32, 0.32, 'mech', seg=8)
    for f in (0.3, 0.7):
        p = Vector((sd * lerp(rx, tx, f), -lerp(rt, tt, f) + 0.2, lerp(rz, tz, f)))
        mb.box(p, (1.4, 1.2, 0.7), 'olive', bevel=0.08)
    # a raised armour plate on the pylon top + a lime lamp near the tip
    for f0, f1 in ((0.12, 0.45), (0.52, 0.85)):
        c = [(lerp(rx, tx, f), lerp(rl, tl, f) - 1.0, lerp(rt, tt, f) + 1.2, lerp(rz, tz, f) + t) for f in (f0, f1)]
        (x0, l0, t0, z0), (x1, l1, t1, z1) = c
        pb = [(sd * x0, -l0, z0 - 0.05), (sd * x1, -l1, z1 - 0.05), (sd * x1, -t1, z1 - 0.05), (sd * x0, -t0, z0 - 0.05)]
        pt = [(x, y, z + 0.22) for x, y, z in pb]
        if sd < 0:
            pb, pt = pb[::-1], pt[::-1]
        mb.hexa(pb + pt, paint_hi(0, 0, R), bevel=0.06)
    lamp_fixture(mb, Vector((sd * (tx - 0.9), -(tl - 3.0), tz + t + 0.15)), Vector((0, 0, 1)), (0.3, 0.9, 0.12),
                 'lime', 'mech', lift=0.02)
    # ventral brace: keel bilge -> nacelle belly
    a = Vector((sd * 2.2, 9.0, -2.4))
    b = Vector((sd * (POD_X - 1.3), 3.0, POD_Z - 1.2))
    mb.cyl(a, b, 0.22, 0.22, 'ring', seg=8)
    for f in (0.0, 1.0):
        mb.sphere(a.lerp(b, f), 0.42, 'mech', seg=8, rings=4)


def nacelle(mb, sd, R):
    cx = sd * POD_X
    N = Hull([(-25.5, 3.4, 3.4, POD_Z, cx), (-23.5, 4.2, 4.2, POD_Z, cx), (-4, 4.0, 4.0, POD_Z, cx),
              (4, 3.4, 3.4, POD_Z, cx), (8.5, 2.0, 2.2, POD_Z + 0.1, cx)], OCT)
    N.build(mb, 'mech')
    sc = cuts(-23.2, 8.2, R, 6.0, 9.0)
    armor(mb, N, sc, [0.02, 2, 3.98], paint_hi, R, thick=0.12, gap_s=0.14, gap_p=0.02, sub_prob=0.1,
          sub_mat='paint2')
    armor(mb, N, sc, [4.02, 6, 7.98], paint_lo, R, thick=0.1, gap_s=0.14, gap_p=0.02, rnd=0)
    # stern: grey collar + engine bell
    ring_c = [(-26.6, 4.5, 4.5, POD_Z, cx), (-23.6, 4.5, 4.5, POD_Z, cx)]
    Hull(ring_c, OCT).build(mb, 'ring')
    for k in range(8):                    # collar bolts
        a = (k + 0.5) / 8 * 2 * math.pi
        d = Vector((math.cos(a), 0, math.sin(a)))
        obox(mb, Vector((cx, 25.1, POD_Z)) + d * 2.3, d, (0.5, 2.4, 0.14), 'mech', lift=0.0)
    deep_nozzle(mb, (cx, 26.5, POD_Z), (0, 1, 0), 1.75, 'ring', 'mech', 'engine', depth=1.0, seg=16, ribs=False)
    # outboard lime running-light row + intake grille band
    for s in (-18, -12, -6, 0):
        pos, n = N.pt(s, 0.5 if sd > 0 else 4.5, 0.12)
        lamp_fixture(mb, pos, n, (0.14, 0.5, 0.05), 'lime', 'mech', lift=0.02)
    fins(mb, Vector((cx - 1.0, 12.0, POD_Z + 2.0)), Vector((0, 1, 0)), Vector((0, 0, 1)), 6, 0.9, 0.55, 1.6,
         0.18, 'mech')
    # decals
    for _ in range(2):
        pos, n = N.pt(R.uniform(-20, 2), R.choice([1.5, 2.5]), 0.13)
        mb.cyl(pos, pos + n * 0.02, 0.35, 0.35, 'yellow', seg=3)
    # nose: twin gun mount (armoured cheek + two long barrels with muzzle brakes)
    mb.box((cx, -8.9, POD_Z + 0.1), (2.4, 1.4, 1.8), 'ring', bevel=0.12)
    for dx in (-0.55, 0.55):
        a = Vector((cx + dx, -9.4, POD_Z + 0.1))
        b = a + Vector((0, -7.0, 0))
        mb.cyl(a, b, 0.24, 0.2, 'mech', seg=10)
        mb.cyl(a + Vector((0, -1.2, 0)), a + Vector((0, -2.0, 0)), 0.34, 0.34, 'ring', seg=10)
        mb.cyl(b + Vector((0, 0.7, 0)), b, 0.3, 0.3, 'ring', seg=10)
    return N


def enemy_frigate():
    palette()
    R = rng(1501)
    mb = MB()
    # ---------------------------------------------------------- blade keel with a long ram bow
    ST = [(-22.5, 5.6, 7.4, 0.2), (-19, 6.6, 8.6, 0.3), (-6, 6.8, 8.8, 0.3), (6, 5.8, 7.4, 0.0), (16, 3.8, 4.8, -0.4),
          (24, 1.9, 2.4, -0.6), (28.2, 0.5, 0.6, -0.7)]
    H = Hull(ST, KEEL)
    H.build(mb, 'mech')
    sc = cuts(-22.0, 26.0, R, 6.0, 10.0)
    armor(mb, H, sc, [0.02, 0.98], paint_hi, R, thick=0.12, gap_s=0.14, gap_p=0.02, sub_prob=0.2, sub_mat='paint2')
    armor(mb, H, sc, [4.02, 4.98], paint_hi, R, thick=0.12, gap_s=0.14, gap_p=0.02, sub_prob=0.2, sub_mat='paint2')
    armor(mb, H, cuts(-22.0, 26.0, R, 5.0, 9.0), [1.02, 2.5, 3.98], paint_hi, R, thick=0.12, gap_s=0.14,
          gap_p=0.02)
    armor(mb, H, cuts(-22.0, 26.0, R, 6.0, 10.0), [5.02, 7, 8.98], paint_lo, R, thick=0.1, gap_s=0.14,
          gap_p=0.02, rnd=0)
    # dark recessed seam belt along each flank (between the flank and the shoulder plates) with window bays
    for p in (0.99, 4.01):
        windows(mb, H, -16, 10, p - 0.35 if p < 2 else p + 0.35, mat='window', off=0.14, pitch=2.3,
                size=(0.12, 0.35, 0.04), R=R, dropout=0.25)
    # ram prow: grey armoured cap + chin sensor
    B = Hull([(21.5, 2.5, 3.1, -0.55), (26.0, 1.2, 1.5, -0.68), (29.5, 0.08, 0.1, -0.75)], KEEL)
    B.build(mb, 'ring', off=0.14)
    mb.sphere((0, -17.5, -3.1), 0.8, 'mech', seg=12, rings=6)
    mb.cyl((0, -17.5, -2.4), (0, -17.5, -3.0), 0.9, 0.9, 'ring', seg=12)
    # ventral keel fin aft + belly housings
    mb.hexa([(-0.35, 21.5, -3.4), (0.35, 21.5, -3.4), (0.35, 7.0, -3.4), (-0.35, 7.0, -3.4),
             (-0.25, 20.5, -6.2), (0.25, 20.5, -6.2), (0.25, 13.0, -5.0), (-0.25, 13.0, -5.0)], 'paint2', bevel=0.08)
    lamp_fixture(mb, Vector((0, 20.0, -6.25)), Vector((0, 0, -1)), (0.25, 0.8, 0.1), 'lime', 'mech', lift=0.0)
    for s in (-2.0, 3.5):
        pos, n = H.pt(s, 7.0, 0.1)
        obox(mb, pos, n, (1.6, 2.6, 0.7), 'olive', bevel=0.06)
    # ---------------------------------------------------------- dorsal turret (forward) on the deck
    zt = H.at(9)[1] / 2 + H.at(9)[2]
    pos, n = H.pt(9.0, 2.5, 0.12)
    mb.cyl(pos - Vector((0, 0, 0.3)), pos + Vector((0, 0, 0.35)), 1.5, 1.4, 'mech', seg=16)
    turret(mb, pos + Vector((0, 0, 0.35)), n, 1.6, 'ring', 'paint', 'mech', barrels=2, blen=2.4)
    # ventral turret under the bow
    pos, n = H.pt(12.0, 7.0, 0.05)
    turret(mb, pos, n, 1.1, 'ring', 'paint2', 'mech', barrels=2, blen=2.2)
    # ---------------------------------------------------------- raked conning tower (sail) + bridge
    zd = H.at(-12)[1] / 2 + H.at(-12)[2]     # deck height
    T = Hull([(-21.5, 2.4, 0.3, zd - 0.05), (-18.5, 3.2, 2.6, zd + 1.1), (-12.5, 2.6, 4.2, zd + 1.9),
              (-9.0, 2.2, 3.6, zd + 1.6), (-6.5, 1.4, 1.4, zd + 0.4)], TWR)
    T.build(mb, 'mech')
    tc = cuts(-21.3, -7.0, R, 3.5, 5.0)
    armor(mb, T, tc, [0.03, 0.97], paint_hi, R, thick=0.1, gap_s=0.12, gap_p=0.02)
    armor(mb, T, tc, [4.03, 4.97], paint_hi, R, thick=0.1, gap_s=0.12, gap_p=0.02)
    armor(mb, T, tc, [1.03, 3.97], paint_hi, R, thick=0.1, gap_s=0.12, gap_p=0.02)
    ztop = zd + 1.9 + 2.1
    # bridge: wide flat head block overhanging the sail, window band on the front and sides
    Bh = Hull([(-17.0, 3.6, 1.4, ztop + 0.4), (-15.5, 5.6, 2.0, ztop + 0.6), (-11.5, 5.8, 2.0, ztop + 0.6),
               (-10.0, 4.0, 1.2, ztop + 0.4)], TWR)
    Bh.build(mb, 'paint')
    obox(mb, Vector((0, 10.0 + 0.02, ztop + 0.75)), Vector((0, -1, 0)), (3.4, 0.35, 0.1), 'window', lift=0.0,
         fwd=Vector((0, 0, 1)))
    for p in (0.55, 4.45):
        windows(mb, Bh, -15.0, -11.9, p, mat='window', off=0.02, pitch=1.3, size=(0.2, 0.5, 0.06))
    obox(mb, Vector((0, 13.5, ztop + 1.6)), Vector((0, 0, 1)), (3.0, 3.0, 0.3), 'ring', bevel=0.05)
    spine(mb, (0.8, 14.2, ztop + 1.7), (0.9, 16.2, ztop + 4.4), 0.07, 'ring', nodes=2)
    lamp_fixture(mb, Vector((-1.2, 13.0, ztop + 1.75)), Vector((0, 0, 1)), (0.3, 0.3, 0.14), 'lime', 'mech')
    # sail flank decals / lights
    for sd in (1, -1):
        pos, n = T.pt(-14.0, 0.5 if sd > 0 else 4.5, 0.11)
        mb.cyl(pos, pos + n * 0.02, 0.4, 0.4, 'yellow', seg=3)
        pos, n = T.pt(-10.5, 0.3 if sd > 0 else 4.7, 0.11)
        lamp_fixture(mb, pos, n, (0.14, 0.5, 0.05), 'lime', 'mech', lift=0.02)
    # ---------------------------------------------------------- aft: grey stern collar + two stacked keel engines
    Hull([(-23.4, 6.3, 8.1, 0.2), (-21.4, 6.3, 8.1, 0.2)], KEEL).build(mb, 'ring', off=0.18)
    for z, r in ((1.7, 1.25), (-1.4, 1.05)):
        deep_nozzle(mb, (0, 23.2, z), (0, 1, 0), r, 'ring', 'mech', 'engine', depth=1.0, seg=16, ribs=False)
    mb.box((0, 22.9, 0.2), (4.6, 0.6, 0.5), 'olive', bevel=0.05)
    # ---------------------------------------------------------- pylons + outrigger nacelles
    for sd in (1, -1):
        pylon(mb, sd, R)
        nacelle(mb, sd, R)
    # keel decals / lights
    for _ in range(4):
        pos, n = H.pt(R.uniform(-16, 14), R.choice([0.3, 0.7, 4.3, 4.7]), 0.14)
        mb.cyl(pos, pos + n * 0.02, 0.35, 0.35, 'yellow', seg=3)
    for _ in range(6):
        pos, n = H.pt(R.uniform(-18, 18), R.choice([0.2, 0.8, 4.2, 4.8, 1.5, 3.5]), 0.14)
        lamp_fixture(mb, pos, n, (0.12, 0.3, 0.04), 'lime', 'mech', lift=0.016)
    for _ in range(8):
        pos, n = H.pt(R.uniform(-18, 16), R.choice([0.5, 4.5, 2.5]), 0.14)
        obox(mb, pos, n, (R.uniform(0.6, 1.4), R.uniform(0.8, 1.8), 0.05), 'paint2', lift=0.0)
    return [mb.to_object('enemy_frigate', smooth_angle=26)]
