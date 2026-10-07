"""v16 enemy frigate (2026-10-07): our own model, built after the shape of the frigate the film used (assets/cargo_game.glb —
'Cargo Spaceship', blaice, CC BY 4.0: its silhouette only, nothing taken from its mesh or textures), with real armour:
  * a WIDE AFT BLOCK (31 m across, chamfered corners) carrying the bridge deck, two low ENGINE PODS slung under its flanks
    and a pair of main drives in its stern face
  * a narrower MID-SPINE with five cargo / magazine bays between heavy frames
  * a tapering FORE SECTION with stub fins, a chin and a long bow spike (a spinal gun)
Every surface armoured plate by plate (shipkit armor: chamfered, gapped, staggered seams, a second layer here and there),
hazard-yellow armour over a dark frame, bare grey metal on the collars and frames, red running lights.
Contract with the engine: single mesh node 'enemy_frigate', 'engine' material only on the nozzle glow discs (the
renderer's emit points), nose +Z in glTF (Blender -Y), about 57 m long, 31 m wide, 13 m tall (as before).
Blender space: nose -Y (station s = -y), up +Z, x across."""
import math
from mathutils import Vector
from lib import MB, rng, reg
from shipkit import Hull, armor, cuts, obox, deep_nozzle, lamp_fixture, fins, BOX8

HEXW = [(1, -0.55), (1, 0.6), (0.72, 1), (-0.72, 1), (-1, 0.6), (-1, -0.55), (-0.62, -1), (0.62, -1)]   # wide block: chamfered top + bottom
POD = [(1, -0.5), (1, 0.5), (0.55, 1), (-0.55, 1), (-1, 0.5), (-1, -0.5), (-0.55, -1), (0.55, -1)]
POD_X, POD_Z = 12.4, -4.7     # slung in the block's lower corners, half sunk in


def palette():
    reg('paint', (0.48, 0.17, 0.025), 0.3, 0.5)          # burnt-orange armour (the reference's colours)
    reg('paint2', (0.30, 0.11, 0.02), 0.3, 0.55)         # grimed
    reg('grey', (0.11, 0.11, 0.12), 0.5, 0.5)            # dark-grey armour panels
    reg('dark', (0.06, 0.06, 0.065), 0.55, 0.5)          # the frame under the armour
    reg('ring', (0.42, 0.42, 0.44), 0.85, 0.35)          # bare grey metal
    reg('mech', (0.035, 0.035, 0.04), 0.8, 0.45)         # dark mechanics
    reg('stripe', (0.02, 0.02, 0.02), 0.3, 0.55)         # black hazard bands
    reg('lime', (0.15, 0.4, 0.05), 0.0, 0.4, (0.45, 1.0, 0.15), 3.0)  # running lights
    reg('window', (0.3, 0.15, 0.05), 0.0, 0.4, (1.0, 0.6, 0.25), 2.0)
    reg('engine', (0.3, 0.1, 0.05), 0.0, 0.3, (1.0, 0.45, 0.12), 3.0)


def hi(i, j, R):
    r = R.random()
    return 'paint' if r < 0.7 else 'paint2' if r < 0.85 else 'grey'


def lo(i, j, R): return 'grey' if R.random() < 0.6 else 'paint2'


def skin(mb, H, s0, s1, edges, R, mats=hi, lmin=2.2, lmax=3.8, thick=0.14, sub=0.3, rnd=None):
    """Armour a stretch of hull plate by plate: every edge split into `rows` strips, each strip with its own seams (so they
    stagger like brickwork), plate thickness varied a little per strip, a second, smaller plate bolted on here and there."""
    for e, rows in edges:
        for r in range(rows):
            pa, pb = e + 0.02 + 0.96 * r / rows, e + 0.02 + 0.96 * (r + 1) / rows
            armor(mb, H, cuts(s0, s1, R, lmin, lmax), [pa, pb], mats, R, thick=thick * R.uniform(0.8, 1.2), gap_s=0.12,
                  gap_p=0.03 / rows, sub_prob=sub, sub_mat='paint2', rnd=rnd)


def greebles(mb, H, s0, s1, edges, n, R, off):
    """Hardware on the armour: access hatches, vent slat rows, small housings."""
    for _ in range(n):
        s, p = R.uniform(s0, s1), R.choice(edges) + R.uniform(0.15, 0.85)
        pos, nn = H.pt(s, p, off)
        k = R.random()
        if k < 0.4:
            obox(mb, pos, nn, (R.uniform(0.5, 1.3), R.uniform(0.7, 2.0), R.uniform(0.12, 0.3)), R.choice(['grey', 'mech', 'paint2']), bevel=0.03)
        elif k < 0.75:
            for j in range(R.randint(3, 6)):
                obox(mb, pos + Vector((0, -0.24 * j, 0)), nn, (R.uniform(0.9, 1.4) if j == 0 else 1.1, 0.09, 0.07), 'mech', lift=0.0)
        else:
            obox(mb, pos, nn, (1.3, 1.3, 0.05), 'grey', lift=0.0, bevel=0.02)
            obox(mb, pos, nn, (0.9, 0.18, 0.08), 'stripe', lift=0.03)


def pod(mb, sd, R):
    cx = sd * POD_X
    N = Hull([(-29.0, 4.0, 3.4, POD_Z, cx), (-27.5, 5.2, 4.4, POD_Z, cx), (-13.0, 5.2, 4.4, POD_Z, cx), (-10.0, 3.4, 3.0, POD_Z + 0.3, cx)], POD)
    N.build(mb, 'dark')
    skin(mb, N, -27.2, -10.4, [(0, 1), (1, 1), (2, 1), (3, 1), (4, 1)], R, lmin=1.8, lmax=3.0, thick=0.12, sub=0.25)
    skin(mb, N, -27.2, -10.4, [(5, 1), (6, 1), (7, 1)], R, mats=lo, lmin=2.0, lmax=3.5, thick=0.1, sub=0.1, rnd=0)
    greebles(mb, N, -26, -13, [0, 4, 6], 6, R, 0.08)
    Hull([(-29.6, 5.4, 4.6, POD_Z, cx), (-28.4, 5.4, 4.6, POD_Z, cx)], POD).build(mb, 'ring')   # stern collar
    deep_nozzle(mb, (cx, 29.4, POD_Z), (0, 1, 0), 1.7, 'ring', 'mech', 'engine', depth=1.0, seg=16, ribs=False)
    for k in range(4):                                                    # black hazard bands round the pod's nose
        s = -11.6 + k * 0.5
        pos, n = N.pt(s, 6.5, 0.13)
        obox(mb, pos, n, (2.4, 0.25, 0.05), 'stripe' if k % 2 == 0 else 'paint', lift=0.0)
    fins(mb, Vector((cx + sd * 2.55, 15.0, POD_Z)), Vector((0, 1, 0)), Vector((sd, 0, 0)), 6, 0.9, 0.5, 1.6, 0.14, 'mech')   # radiator fins, outboard
    for s in (-24, -18):
        pos, n = N.pt(s, 0.5 if sd > 0 else 4.5, 0.12)
        lamp_fixture(mb, pos, n, (0.14, 0.5, 0.05), 'lime', 'mech', lift=0.02)


def enemy_frigate():
    palette()
    R = rng(1601)
    mb = MB()
    # ---------------------------------------------------------- the wide aft block
    A = Hull([(-28.8, 25.0, 9.0, 0.6), (-27.4, 30.0, 11.0, 0.6), (-12.0, 30.0, 11.0, 0.6), (-9.0, 21.0, 9.4, 0.9)], HEXW)
    A.build(mb, 'dark')
    skin(mb, A, -27.0, -9.4, [(0, 3), (4, 3)], R, lmin=2.2, lmax=3.6, thick=0.16)         # flanks
    skin(mb, A, -27.0, -9.4, [(1, 1), (3, 1)], R, lmin=2.6, lmax=4.0, thick=0.16)         # shoulder chamfers
    skin(mb, A, -27.0, -9.4, [(2, 6)], R, lmin=2.0, lmax=3.4, thick=0.14)                 # the deck
    skin(mb, A, -27.0, -9.4, [(5, 1), (7, 1), (6, 5)], R, mats=lo, lmin=2.6, lmax=4.2, thick=0.12, sub=0.15, rnd=0)   # belly
    greebles(mb, A, -26.5, -10, [0, 4, 2, 6], 34, R, 0.1)
    # stern face: grey collar, two main drives, a dark recess band
    Hull([(-29.6, 26.2, 10.0, 0.6), (-28.6, 26.2, 10.0, 0.6)], HEXW).build(mb, 'ring', off=0.1)
    for x in (-5.2, 5.2):
        deep_nozzle(mb, (x, 29.8, 0.9), (0, 1, 0), 2.1, 'ring', 'mech', 'engine', depth=1.2, seg=20, ribs=False)
    obox(mb, Vector((0, 29.95, 3.6)), Vector((0, 1, 0)), (18, 0.9, 0.2), 'mech', lift=0.0, fwd=Vector((0, 0, 1)))
    # the bridge deck on top: a raised armoured superstructure with a window band, sensor mast, red lights
    zt = 0.6 + 11.0 / 2
    B = Hull([(-26.0, 8.0, 1.2, zt + 0.3), (-24.5, 10.5, 1.8, zt + 0.6), (-14.5, 10.5, 1.8, zt + 0.6), (-12.5, 8.0, 1.2, zt + 0.3)], BOX8)
    B.build(mb, 'dark')
    skin(mb, B, -24.3, -12.7, [(0, 1), (2, 3), (4, 1)], R, lmin=1.6, lmax=2.6, thick=0.1, sub=0.2)
    obox(mb, Vector((0, 12.45, zt + 0.95)), Vector((0, -1, 0)), (6.0, 0.3, 0.1), 'window', lift=0.0, fwd=Vector((0, 0, 1)))
    mb.cyl((2.5, 22.0, zt + 1.5), (2.5, 22.0, zt + 4.8), 0.18, 0.12, 'ring', seg=8)
    mb.box((2.5, 22.0, zt + 4.9), (1.6, 0.3, 0.3), 'ring')
    lamp_fixture(mb, Vector((2.5, 22.0, zt + 5.1)), Vector((0, 0, 1)), (0.3, 0.3, 0.14), 'lime', 'mech')
    for sd in (1, -1):                                                    # hazard bands on the block's shoulders
        for k in range(6):
            pos, n = A.pt(-10.6 - k * 0.45, 1.5 if sd > 0 else 3.5, 0.17)
            obox(mb, pos, n, (2.8, 0.22, 0.04), 'stripe' if k % 2 == 0 else 'paint', lift=0.0)
        for s in (-25, -19, -13):
            pos, n = A.pt(s, 0.15 if sd > 0 else 4.85, 0.17)
            lamp_fixture(mb, pos, n, (0.14, 0.6, 0.05), 'lime', 'mech', lift=0.02)
    # ---------------------------------------------------------- the mid-spine with five bays
    M_ = Hull([(-9.6, 10.6, 8.0, 1.4), (10.0, 10.6, 8.0, 1.4)], BOX8)
    M_.build(mb, 'dark')
    bays = [-8.2 + k * 3.65 for k in range(6)]
    for a, b in zip(bays, bays[1:]):                                      # each bay: armoured lids and side doors between frames
        skin(mb, M_, a + 0.4, b - 0.4, [(2, 3), (0, 2), (4, 2)], R, lmin=1.3, lmax=1.6, thick=0.14, sub=0.25)
        skin(mb, M_, a + 0.4, b - 0.4, [(1, 1), (3, 1)], R, mats=lo, lmin=2.8, lmax=3.0, thick=0.12, sub=0)
        skin(mb, M_, a + 0.4, b - 0.4, [(5, 1), (6, 3), (7, 1)], R, mats=lo, lmin=1.3, lmax=1.6, thick=0.1, sub=0, rnd=0)
        greebles(mb, M_, a + 0.6, b - 0.6, [0, 2, 4, 6], 3, R, 0.09)
    for s in bays:                                                        # the heavy frames between the bays
        Hull([(s - 0.35, 11.6, 9.0, 1.4), (s + 0.35, 11.6, 9.0, 1.4)], BOX8).build(mb, 'ring')
    for s in bays[1:-1]:
        for sd in (1, -1):
            pos, n = M_.pt(s, 0.5 if sd > 0 else 4.5, 0.55)
            lamp_fixture(mb, pos, n, (0.12, 0.3, 0.05), 'lime', 'mech', lift=0.02)
    # ---------------------------------------------------------- the fore section, fins, the bow spike
    F = Hull([(9.6, 10.8, 9.2, 0.5), (16.0, 9.8, 8.8, 0.6), (21.5, 6.2, 5.8, 1.1), (24.8, 2.4, 2.6, 1.3)], HEXW)
    F.build(mb, 'dark')
    skin(mb, F, 10.0, 24.4, [(0, 2), (4, 2), (1, 1), (3, 1), (2, 3)], R, lmin=1.8, lmax=3.0, thick=0.14)
    skin(mb, F, 10.0, 24.4, [(5, 1), (6, 3), (7, 1)], R, mats=lo, lmin=2.2, lmax=3.4, thick=0.12, sub=0.15, rnd=0)
    greebles(mb, F, 10.5, 20.0, [0, 4, 2], 12, R, 0.1)
    Hull([(24.6, 2.8, 3.0, 1.3), (25.6, 1.6, 1.8, 1.3)], HEXW).build(mb, 'ring')   # the bow cap
    mb.box((0, -22.0, -1.5), (1.8, 7.0, 1.6), 'mech', bevel=0.1)                 # spinal gun under the bow: housing,
    mb.cyl((0, -25.4, -1.8), (0, -28.8, -1.8), 0.32, 0.24, 'ring', seg=10)       # barrel, muzzle brake
    mb.cyl((0, -28.0, -1.8), (0, -28.7, -1.8), 0.42, 0.42, 'ring', seg=10)
    for sd in (1, -1):                                                    # stub fins
        x0 = sd * 5.0
        pts = [(x0, -10.0, 1.6), (x0, -11.6, 1.6), (sd * 7.2, -11.2, 1.4), (sd * 7.2, -10.2, 1.4)]
        top = [(x, y, z + 0.4) for x, y, z in pts]
        if sd < 0: pts, top = pts[::-1], top[::-1]
        mb.hexa(pts + top, 'paint', bevel=0.06)
        lamp_fixture(mb, Vector((sd * 7.0, -10.7, 2.05)), Vector((0, 0, 1)), (0.25, 0.5, 0.1), 'lime', 'mech', lift=0.0)
        for k in range(5):                                                # hazard bands at the fore section's shoulders
            pos, n = F.pt(11.0 + k * 0.45, 1.5 if sd > 0 else 3.5, 0.15)
            obox(mb, pos, n, (2.4, 0.22, 0.04), 'stripe' if k % 2 == 0 else 'paint', lift=0.0)
    obox(mb, Vector((0, -16.5, -3.4)), Vector((0, 0, -1)), (3.4, 4.0, 0.6), 'mech', bevel=0.06)   # chin sensor housing
    # ---------------------------------------------------------- the engine pods
    for sd in (1, -1):
        pod(mb, sd, R)
    return [mb.to_object('enemy_frigate', smooth_angle=26)]
