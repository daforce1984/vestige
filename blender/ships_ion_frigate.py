"""v10 ion-cannon frigate ("lance" frigate): a line ship built around one spinal ion cannon.
Design / zoning: blender/ION_FRIGATE_DESIGN.md.  Family look of the v9 flagship (blue-black gunmetal, dreadnought-
style armour via shipkit.armor/cuts/plate, functional equipment by zone, no antennas / masts).

CONTRACT (glTF: +Z bow, +Y up, +X starboard):
  * root node 'ion_frigate'; length 60-75 m (muzzle exit s=+31.5, nozzle exits s~-36.6); width ~13 m.
  * 'muzzle' (emissive) only on the bore exit disc at the very bow (s=31.25, x=0, glTF y=0.9); its densest cluster
    is on the barrel axis (concentric rings around a centre vertex).
  * 'engine' (emissive) only on the four aft-facing nozzle discs (normals forced to glTF -Z).
  * 'window' emissive crew windows.
Blender space: bow toward -Y (station s = -y = glTF z), up +Z (= glTF y), +X = starboard.

Standalone usage (from WSL, project root):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/ships_ion_frigate.py)" [-- nosave]
(build_models.py 'ion_frigate' calls ion_frigate() the normal way.)
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import lib
from lib import MB, reg, rng, lerp, annulus
from shipkit import Hull, armor, cuts, obox, plate, lamp_fixture, window_bay, beacon

LAMP_BODY, WIN_FRAME = 'hull2', 'greeble'     # non-emissive fixture bodies (housings / window bezels)

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')

BZ = 0.9            # barrel axis height (Blender z)
LIP_S = 31.5        # muzzle crown lip (very bow)
MUZZLE_S = 31.25    # emissive bore disc (exit plane, 0.25 m inside the lip)
T = 0.26            # armour plate thickness


def Y(s):
    return -s


def palette():
    """glTF metallic-roughness values (base colour linear RGB, metallic, roughness[, emissive, strength])."""
    reg('hull', (0.085, 0.092, 0.110), 0.75, 0.45)      # blue-black gunmetal (structure)
    reg('hull2', (0.130, 0.136, 0.152), 0.70, 0.48)     # lighter armour plates
    reg('plate', (0.066, 0.072, 0.088), 0.80, 0.40)     # dark satin plates
    reg('greeble', (0.055, 0.057, 0.064), 0.65, 0.55)   # machinery, recesses
    reg('trim', (0.200, 0.202, 0.212), 0.90, 0.32)      # bare machined metal: rails, pipes, collars
    reg('coil', (0.420, 0.200, 0.110), 1.00, 0.34)      # copper accelerator / focusing windings
    reg('accent', (0.070, 0.120, 0.215), 0.40, 0.42)    # restrained slate-blue trim stripes
    reg('exhaust', (0.300, 0.265, 0.300), 1.00, 0.36)   # heat-tinted nozzle metal
    reg('glass', (0.020, 0.032, 0.050), 0.30, 0.08)     # sensor domes / canopy
    reg('window', (0.20, 0.12, 0.06), 0.0, 0.40, (1.0, 0.62, 0.28), 3.0)
    reg('amber', (0.25, 0.10, 0.03), 0.0, 0.40, (1.0, 0.42, 0.08), 4.0)
    reg('blue_light', (0.05, 0.10, 0.20), 0.0, 0.40, (0.3, 0.6, 1.0), 5.0)
    reg('engine', (0.40, 0.50, 0.60), 0.0, 0.30, (0.72, 0.86, 1.0), 6.0)
    reg('muzzle', (0.10, 0.18, 0.28), 0.0, 0.30, (0.35, 0.65, 1.0), 3.0)


# hull profile (u = x, v = z), CCW seen from the bow; edges: 0 stbd wall, 1 stbd top chamfer, 2 deck,
# 3 port top chamfer, 4 port wall, 5 port low chamfer, 6 keel, 7 stbd low chamfer
PROF = [(1, -0.52), (1, 0.50), (0.74, 1), (-0.74, 1), (-1, 0.50), (-1, -0.52), (-0.62, -1), (0.62, -1)]
MAIN = [(-34.5, 10.4, 8.6, 0.3), (-33.2, 12.0, 10.0, 0.4), (-22.0, 12.4, 10.4, 0.5), (-8.0, 12.0, 10.0, 0.4),
        (1.5, 10.5, 8.8, 0.2), (7.0, 7.2, 6.4, -0.1)]
# strongback keel carrying the exposed barrel (top at z ~ -0.85, the coil rings rest on it)
SBK = [(3.0, 5.2, 3.4, -2.55), (8.0, 4.6, 3.1, -2.4), (22.0, 4.1, 2.9, -2.35), (25.6, 3.5, 2.5, -2.25),
       (27.4, 2.4, 1.7, -2.05)]
S_STERN, S_BOW = MAIN[0][0], MAIN[-1][0]

UP_MAT = lambda i, j, R: 'hull2' if R.random() < 0.75 else 'plate'
DN_MAT = lambda i, j, R: 'plate' if R.random() < 0.7 else 'hull'
WALL_MAT = lambda i, j, R: ('plate', 'hull2', 'plate')[j] if R.random() < 0.78 else 'hull'


def blk(mb, s0, s1, x0, x1, z0, z1, mat, ins=0.0, ins_s=None, bevel=0.0):
    """Axis-aligned block with its top face inset by `ins` (chamfered look)."""
    ins_s = ins if ins_s is None else ins_s
    sa, sb = min(s0, s1), max(s0, s1)
    xa, xb = min(x0, x1), max(x0, x1)
    b = [(xa, Y(sa), z0), (xb, Y(sa), z0), (xb, Y(sb), z0), (xa, Y(sb), z0)]
    t = [(xa + ins, Y(sa + ins_s), z1), (xb - ins, Y(sa + ins_s), z1), (xb - ins, Y(sb - ins_s), z1),
         (xa + ins, Y(sb - ins_s), z1)]
    mb.hexa(b + t, mat, bevel=bevel)


def gp(H, s, e, metres=0.14):
    return metres / max(0.5, H.edge_len(s, e))


def cuts_at(a, b, R, lmin, lmax, fixed=()):
    pts = [a] + sorted(f for f in fixed if a + lmin * 0.5 < f < b - lmin * 0.5) + [b]
    out = [a]
    for u, v in zip(pts, pts[1:]):
        out += cuts(u, v, R, min(lmin, (v - u)), lmax)[1:]
    return out


def deck_z(H, s):
    w, h, cz, _ = H.at(s)
    return cz + h / 2


# ================================================================================================ structure
def main_hull(mb, H, R):
    H.build(mb, 'hull')
    s0, s1 = S_STERN + 0.4, S_BOW - 0.3
    sc = cuts(s0, s1, R, 3.2, 6.0)
    for e in (1, 3):
        armor(mb, H, sc, [e + 0.03, e + 0.97], UP_MAT, R, thick=T, gap_s=0.3, gap_p=0.0, sub_prob=0.3,
              sub_mat='plate')
    for e in (5, 7):
        armor(mb, H, sc, [e + 0.03, e + 0.5, e + 0.97], DN_MAT, R, thick=T, gap_s=0.3, gap_p=gp(H, 0, e),
              sub_prob=0.15, sub_mat='hull')
    for e in (0, 4):
        armor(mb, H, cuts(s0, s1, R, 3.0, 5.6), [e + 0.03, e + 0.36, e + 0.67, e + 0.97], WALL_MAT, R, thick=T,
              gap_s=0.3, gap_p=gp(H, 0, e), sub_prob=0.3, sub_mat='hull2')
    # deck lanes; the centre lane is left open over the breech / reactor for the gallery and the coolant trunk
    DECK_P = [2.02, 2.18, 2.34, 2.44, 2.56, 2.66, 2.82, 2.98]
    skip = [(-17.5, 6.5, 2.44, 2.56)]
    sc = cuts_at(s0, s1, R, 3.2, 6.0, fixed=(-17.5,))
    armor(mb, H, sc, DECK_P, UP_MAT, R, thick=T, gap_s=0.3, gap_p=gp(H, 0, 2), skip=skip, sub_prob=0.22,
          sub_mat='plate')
    # keel: two belts either side of a structural keel spine
    for pc in ([6.03, 6.25, 6.45], [6.55, 6.75, 6.97]):
        armor(mb, H, cuts(s0, s1, R, 3.2, 6.0), pc, DN_MAT, R, thick=T, gap_s=0.3, gap_p=gp(H, 0, 6),
              sub_prob=0.15, sub_mat='hull')
    s = s0 + 0.3
    while s < s1 - 3:
        L = min(5.7, s1 - 0.3 - s)
        zk = min(H.at(s)[2] - H.at(s)[1] / 2, H.at(s + L)[2] - H.at(s + L)[1] / 2)
        blk(mb, s, s + L, -0.55, 0.55, zk + 0.3, zk - 0.45, 'hull2', ins=0.12)
        s += L + 0.3
    # restrained accent: slate-blue band plates on the upper wall belt at the C/D and D/E zone boundaries
    for sb in (-6.0, -17.0):
        for e in (0, 4):
            plate(mb, H, sb - 0.35, sb + 0.35, e + 0.36, e + 0.67, 'accent', off=0.0, thick=T + 0.06, ch=0.1)


def glacis(mb, H):
    """Armoured front face of the main hull around the barrel exit + recoil collar."""
    s = S_BOW
    w, h, cz, _ = H.at(s)
    ax = Vector((0, -1, 0))
    # layered frame plates on the flat front face (leave the barrel collar open)
    for x0, x1, z0, z1 in ((-w / 2 + 0.4, -1.9, cz - h / 2 + 0.6, cz + h / 2 - 0.6),
                           (1.9, w / 2 - 0.4, cz - h / 2 + 0.6, cz + h / 2 - 0.6),
                           (-1.9, 1.9, BZ + 1.9, cz + h / 2 - 0.5), (-1.9, 1.9, cz - h / 2 + 0.5, BZ - 1.9)):
        blk(mb, s - 0.2, s + 0.35, x0, x1, z0, z1, 'hull2')
    annulus(mb, (0, Y(s + 0.45), BZ), ax, 0.78, 1.95, 0.9, 'trim', seg=36)
    annulus(mb, (0, Y(s + 1.05), BZ), ax, 0.78, 1.55, 0.5, 'hull2', seg=36)
    for sg in (1, -1):   # recoil dampers from the collar into the front face
        for z in (BZ + 1.2, BZ - 1.2):
            mb.cyl((sg * 1.35, Y(s + 0.3), z), (sg * 1.1, Y(s + 1.6), z * 0.3 + BZ * 0.7), 0.16, 0.13, 'trim', seg=8)
        beacon(mb, Vector((sg * (w / 2 - 0.8), Y(s + 0.35), cz + h / 2 - 1.0)), Vector((0, -1, 0)), 0.15, 'blue_light',
               LAMP_BODY, 'trim')


def strongback(mb, R):
    SB = Hull(SBK, PROF)
    SB.build(mb, 'hull')
    s0, s1 = SBK[0][0] + 4.0, SBK[-1][0] - 0.2
    sc = cuts(s0, s1, R, 2.6, 4.2)
    for e in (1, 3, 5, 7):
        armor(mb, SB, sc, [e + 0.04, e + 0.96], UP_MAT if e in (1, 3) else DN_MAT, R, thick=0.2, gap_s=0.22,
              gap_p=0.0)
    armor(mb, SB, sc, [6.04, 6.5, 6.96], DN_MAT, R, thick=0.2, gap_s=0.22, gap_p=0.04, sub_prob=0.15)
    for e in (0, 4):
        armor(mb, SB, cuts(s0, s1, R, 2.4, 4.0), [e + 0.05, e + 0.95], WALL_MAT, R, thick=0.2, gap_s=0.22,
              gap_p=0.0)
    return SB


# ================================================================================================ the ion cannon
STAGES, ST0, STL = 4, 6.8, 4.1          # accelerator stages: start station, stage length (flange + 3 coils)


def ring_pts(c, ax, r, seg):
    q = Vector(ax).to_track_quat('Z', 'X').to_matrix()
    return [Vector(c) + q @ Vector((math.cos(i / seg * 2 * math.pi) * r, math.sin(i / seg * 2 * math.pi) * r, 0))
            for i in range(seg)]


def coil_ring(mb, s, big=False):
    ax = (0, -1, 0)
    c = (0, Y(s), BZ)
    if big:   # stage flange: armoured ring with bolt lugs
        annulus(mb, c, ax, 0.74, 2.05, 0.55, 'hull2', seg=36)
        annulus(mb, c, ax, 1.95, 2.12, 0.35, 'trim', seg=36)
        for k in range(8):
            a = (k + 0.5) / 8 * 2 * math.pi
            n = Vector((math.cos(a), 0, math.sin(a)))
            obox(mb, Vector(c) + n * 2.05, n, (0.35, 0.75, 0.22), 'trim', lift=0.0)
    else:     # copper coil: three winding packs between two retaining rings, clamp lugs outside
        annulus(mb, c, ax, 0.76, 1.3, 0.62, 'greeble', seg=36)                  # former
        for ds in (-0.2, 0.0, 0.2):
            annulus(mb, (0, Y(s + ds), BZ), ax, 1.28, 1.62, 0.17, 'coil', seg=36)
        for ds in (-0.34, 0.34):
            annulus(mb, (0, Y(s + ds), BZ), ax, 0.76, 1.72, 0.08, 'trim', seg=36)
        for k in range(4):
            a = (k + 0.5) / 4 * 2 * math.pi
            n = Vector((math.cos(a), 0, math.sin(a)))
            obox(mb, Vector(c) + n * 1.62, n, (0.22, 0.7, 0.14), 'trim', lift=0.0)


def cap_module(mb, s0, s1, sg, SB):
    """Stage capacitor module on the strongback flank: armoured housing, 2 x 3 can rack on top, bus bars up to the
    stage's three coils."""
    w = SB.at((s0 + s1) / 2)[0] / 2
    x0, x1 = sg * (w - 0.1), sg * (w + 1.25)
    z0, z1 = -3.35, -1.35
    blk(mb, s0, s1, x0, x1, z0, z1, 'hull2', ins=0.12)
    blk(mb, s0 + 0.35, s1 - 0.35, x1 - sg * 0.05, x1 + sg * 0.12, z0 + 0.35, z1 - 0.4, 'plate')   # side door
    lamp_fixture(mb, Vector((x1 + sg * 0.12, Y(s0 + 0.7), z1 - 0.6)), Vector((sg, 0, 0)), (0.2, 0.4, 0.08), 'amber',
                 LAMP_BODY, lift=0.04)
    xm = (x0 + x1) / 2
    L = s1 - s0
    for i, du in enumerate((-0.3, 0.3)):
        for j in range(3):
            s = s0 + L * (j + 0.5) / 3
            x = xm + du
            mb.cyl((x, Y(s), z1 - 0.05), (x, Y(s), z1 + 0.55), 0.24, 0.24, 'trim', seg=10)
            mb.cyl((x, Y(s), z1 + 0.55), (x, Y(s), z1 + 0.72), 0.15, 0.15, 'greeble', seg=8)
    blk(mb, s0 + 0.2, s1 - 0.2, xm - 0.1, xm + 0.1, z1 + 0.55, z1 + 0.78, 'hull2')                # bus bar
    for j in range(3):   # feed from the rack to each coil (lower flank of the ring)
        s = s0 + 1.0 + j * 1.0 + (ST0 - s0) * 0
        a = math.radians(-35)
        p1 = Vector((sg * 1.55 * math.cos(a), Y(s), BZ + 1.55 * math.sin(a)))
        p0 = Vector((xm, Y(s), z1 + 0.7))
        mb.cyl(p0, p1, 0.09, 0.09, 'coil', seg=6)


def ion_cannon(mb, SB):
    ax = Vector((0, -1, 0))
    # barrel tube from inside the hull to the muzzle crown
    mb.cyl((0, Y(S_BOW - 1.0), BZ), (0, Y(28.2), BZ), 0.78, 0.78, 'greeble', seg=20)
    # accelerator stages
    for k in range(STAGES):
        s0 = ST0 + k * STL
        coil_ring(mb, s0, big=True)
        for j in range(3):
            coil_ring(mb, s0 + 1.0 + j * 1.0)
        for sg in (1, -1):
            cap_module(mb, s0 + 0.45, s0 + STL - 0.25, sg, SB)
        # saddle blocks under the flange and the coils
        blk(mb, s0 - 0.35, s0 + 0.35, -1.1, 1.1, -1.0, BZ - 1.6, 'hull2')
    coil_ring(mb, ST0 + STAGES * STL, big=True)
    blk(mb, ST0 + STAGES * STL - 0.35, ST0 + STAGES * STL + 0.35, -1.1, 1.1, -1.0, BZ - 1.6, 'hull2')
    # coolant lines through the coil stack (10 and 2 o'clock) with clamps at each flange
    for sg in (1, -1):
        a = math.radians(90 - sg * 50)
        x, z = 1.28 * math.cos(a), BZ + 1.28 * math.sin(a)
        mb.cyl((x, Y(S_BOW + 0.6), z), (x, Y(24.0), z), 0.1, 0.1, 'trim', seg=6)
    # power bus rail along the strongback top (both sides)
    for sg in (1, -1):
        blk(mb, S_BOW + 0.4, 23.6, sg * 1.25, sg * 1.75, -1.0, -0.62, 'trim', ins=0.05)
    # ---- focusing section (quadrupole magnets)
    sF0, sF1 = ST0 + STAGES * STL + 0.3, 28.0
    mb.cyl((0, Y(sF0), BZ), (0, Y(sF1), BZ), 1.15, 1.15, 'hull', seg=24)
    for s in (sF0 + 0.3, sF1 - 0.3):
        annulus(mb, (0, Y(s), BZ), ax, 1.1, 1.85, 0.45, 'trim', seg=36)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        n = Vector((math.cos(a), 0, math.sin(a)))
        c = Vector((0, Y((sF0 + sF1) / 2), BZ)) + n * 1.1
        obox(mb, c, n, (0.95, sF1 - sF0 - 1.3, 0.7), 'hull2', lift=0.35, bevel=0.05)
        obox(mb, c + n * 0.7, n, (0.62, sF1 - sF0 - 2.0, 0.22), 'coil', lift=0.1)
        for ds in (-1.2, 0.0, 1.2):   # clamp straps
            obox(mb, c + n * 0.15 + Vector((0, ds, 0)), n, (1.1, 0.18, 0.95), 'trim', lift=0.35)
    # jumpers from the coolant lines into the focusing collar
    for sg in (1, -1):
        mb.cyl((sg * 0.82, Y(24.0), BZ + 0.98), (sg * 0.55, Y(sF0 + 0.7), BZ + 1.2), 0.09, 0.09, 'trim', seg=6)
    # ---- muzzle crown
    mb.cyl((0, Y(28.0), BZ), (0, Y(30.9), BZ), 1.62, 1.72, 'hull', seg=32)
    annulus(mb, (0, Y(28.15), BZ), ax, 1.1, 1.95, 0.3, 'trim', seg=32)
    annulus(mb, (0, Y(31.2), BZ), ax, 0.95, 1.9, 0.6, 'trim', seg=32)          # lip s 30.9 .. 31.5
    annulus(mb, (0, Y(31.47), BZ), ax, 0.95, 1.25, 0.06, 'plate', seg=32)       # dark inner chamfer ring on the lip
    for k in range(8):   # radial field vanes
        a = (k + 0.5) / 8 * 2 * math.pi
        n = Vector((math.cos(a), 0, math.sin(a)))
        obox(mb, Vector((0, Y(29.55), BZ)) + n * 1.62, n, (0.26, 2.5, 0.42), 'hull2', lift=0.15)
        obox(mb, Vector((0, Y(29.55), BZ)) + n * 2.02, n, (0.12, 1.6, 0.08), 'accent', lift=0.0)
    # deep bore: dark liner, inner emitter rings (dim)
    mb.loft([ring_pts((0, Y(28.6), BZ), ax, 0.93, 32), ring_pts((0, Y(31.2), BZ), ax, 0.93, 32)], 'greeble',
            cap0=False, cap1=False)
    for s in (29.4, 30.3):
        annulus(mb, (0, Y(s), BZ), ax, 0.8, 0.94, 0.14, 'trim', seg=32)
    # emissive bore disc at the exit plane: concentric rings around a centre vertex (densest cluster on the axis)
    c = Vector((0, Y(MUZZLE_S), BZ))
    mb.loft([c] + [ring_pts(c, ax, r, 24) for r in (0.07, 0.16, 0.3, 0.55, 0.93)], 'muzzle', cap0=False,
            cap1=False)


# ================================================================================================ placement
class LF:
    """Local frame on a surface: b across, t along (toward the bow), n out of the hull."""

    def __init__(self, o, n, t=(0, -1, 0), up=None):
        n = Vector(n).normalized()
        t = Vector(t)
        t = t - n * t.dot(n)
        if t.length < 1e-4:
            t = Vector((0, 0, 1)) - n * n.z
        t.normalize()
        b = t.cross(n)
        if up is not None and b.dot(Vector(up)) < 0:
            b = -b
        self.o, self.n, self.t, self.b = Vector(o), n, t, b
        self.sink = 0.15

    def p(self, u, v, w=0.0):
        return self.o + self.b * u + self.t * v + self.n * w

    def box(self, mb, u, v, w, su, sv, sw, mat):
        obox(mb, self.p(u, v, w + sw / 2), self.n, (su, sv, sw), mat, lift=0.0, fwd=self.t)

    def lamp(self, mb, u, v, w, su, sv, sw, mat):
        """Housed lamp fixture in place of an emissive box (same footprint, bottom at height w)."""
        lamp_fixture(mb, self.p(u, v, w + sw / 2), self.n, (su, sv, sw), mat, LAMP_BODY, fwd=self.t, lift=0.0)

    def cyl(self, mb, a, b, r0, r1=None, mat='trim', seg=8, caps=True):
        mb.cyl(self.p(*a), self.p(*b), r0, r0 if r1 is None else r1, mat, seg=seg, caps=caps)

    def plinth(self, mb, W, L, h, mat='hull', u=0.0, v=0.0):
        self.box(mb, u, v, -self.sink, W, L, h + self.sink, mat)


class Surf:
    """Ray caster over the finished structure + armour."""

    def __init__(self, mb):
        self.T = BVHTree.FromBMesh(mb.bm)
        self.rej = []

    def cast(self, o, d, dist=60.0):
        o, d = Vector(o), Vector(d).normalized()
        loc, n, _, _ = self.T.ray_cast(o, d, dist)
        return None if loc is None else loc

    def site(self, centre, n, b, t, W, L, tag, tol=0.7):
        """Site of W (along b) x L (along t) on the surface with outward normal n around `centre` (a point on or
        near the surface).  Returns an LF at the highest sampled point, sink bridging the plate seams."""
        n, b, t = Vector(n).normalized(), Vector(b).normalized(), Vector(t).normalized()
        hs = []
        for a in (-1, 0, 1):
            for c in (-1, 0, 1):
                p = Vector(centre) + b * (a * W / 2) + t * (c * L / 2)
                h = self.cast(p + n * 12.0, -n, 24.0)
                if h is None:
                    self.rej.append((tag, 'miss'))
                    return None
                hs.append(h)
        ds = [h.dot(n) for h in hs]
        if max(ds) - min(ds) > tol:
            self.rej.append((tag, round(max(ds) - min(ds), 2)))
            return None
        o = Vector(centre) + n * (max(ds) - Vector(centre).dot(n))
        F = LF(o, n, t)
        F.b = b if F.b.dot(b) > 0 else -F.b   # keep the requested across axis
        F.sink = max(ds) - min(ds) + 0.15
        return F

    def top(self, x, s, W, L, tag, z=None):
        return self.site(Vector((x, Y(s), 0 if z is None else z)), (0, 0, 1), (1, 0, 0), (0, -1, 0), W, L, tag)

    def under(self, x, s, W, L, tag):
        return self.site(Vector((x, Y(s), 0)), (0, 0, -1), (1, 0, 0), (0, -1, 0), W, L, tag)

    def hull(self, H, s, p, L, W, tag, tol=0.7):
        pos, n = H.pt(s, p, 0.0)
        e = int(math.floor(p))
        P, _ = H.poly(s)
        a, bb = P[e % H.n], P[(e + 1) % H.n]
        b = Vector(((bb - a).x, 0, (bb - a).y)).normalized()
        return self.site(pos, n, b, (0, -1, 0), W, L, tag, tol)


def pair(fn):
    """Mirror-symmetric sites: keep both only if both fit."""
    a, b = fn(1), fn(-1)
    return [(1, a), (-1, b)] if a and b else []


def sidep(sg, e_stbd, e_port, f):
    """Hull parameter on a mirrored edge pair: fraction f measured from the edge start on the starboard side."""
    return e_stbd + f if sg == 1 else e_port + (1 - f)


# ================================================================================================ components
def pd_turret(mb, F, u, v, sz=0.9, yaw=0.0):
    F.cyl(mb, (u, v, -F.sink), (u, v, 0.35 * sz), 0.7 * sz, 0.62 * sz, 'hull2', seg=10)
    F.cyl(mb, (u, v, 0.35 * sz), (u, v, 0.5 * sz), 0.6 * sz, 0.55 * sz, 'trim', seg=10)
    d = F.t * math.cos(yaw) + F.b * math.sin(yaw)
    sd = F.n.cross(d)
    c = F.p(u, v, 0.5 * sz + 0.25 * sz)
    obox(mb, c, F.n, (0.85 * sz, 1.0 * sz, 0.5 * sz), 'hull2', lift=0.0, fwd=d, bevel=0.04 * sz)
    obox(mb, c + F.n * 0.26 * sz - d * 0.1 * sz, F.n, (0.5 * sz, 0.4 * sz, 0.1 * sz), 'glass', lift=0.0, fwd=d)
    for k in (-1, 1):
        a = c + sd * (k * 0.22 * sz) + d * (0.4 * sz)
        mb.cyl(a, a + d * (1.25 * sz), 0.09 * sz, 0.07 * sz, 'greeble', seg=6)
        mb.cyl(a + d * (1.05 * sz), a + d * (1.28 * sz), 0.11 * sz, 0.11 * sz, 'trim', seg=6)


def sensor_array(mb, F, W, L, nu, nv):
    F.plinth(mb, W, L, 0.14, 'trim')
    cu, cv = W / nu, L / nv
    for i in range(nu):
        for j in range(nv):
            F.box(mb, -W / 2 + cu * (i + 0.5), -L / 2 + cv * (j + 0.5), 0.14, cu - 0.12, cv - 0.12, 0.09, 'plate')
    for e in (-1, 1):
        F.lamp(mb, e * (W / 2 - 0.18), L / 2 - 0.18, 0.14, 0.2, 0.2, 0.12, 'blue_light')


def radiator_bank(mb, F, W, L, pitch=0.36, fh=0.75):
    F.plinth(mb, W, L, 0.12, 'greeble')
    n = max(2, int((L - 0.9) / pitch))
    for k in range(n + 1):
        v = -(L - 0.9) / 2 + k * (L - 0.9) / n
        F.box(mb, 0.0, v, 0.12, W - 0.7, 0.1, fh, 'trim' if k % 4 == 0 else 'greeble')
    for e in (-1, 1):
        F.cyl(mb, (e * (W / 2 - 0.2), -L / 2 + 0.45, 0.35), (e * (W / 2 - 0.2), L / 2 - 0.45, 0.35), 0.15,
              mat='trim', seg=6, caps=False)
        F.box(mb, 0.0, e * (L / 2 - 0.2), 0.12, W, 0.4, 0.55, 'hull2')


def manifold(mb, F, W, L, h=0.7, nstub=3):
    F.plinth(mb, W, L, h, 'hull2')
    F.box(mb, 0.0, 0.0, h, W - 0.3, L - 0.3, 0.1, 'greeble')
    for k in range(nstub):
        u = (k - (nstub - 1) / 2) * (W - 0.5) / max(1, nstub - 1)
        F.cyl(mb, (u, 0, h + 0.1), (u, 0, h + 0.4), 0.14, 0.14, 'trim', seg=6)
        F.cyl(mb, (u, 0, h + 0.4), (u, 0, h + 0.5), 0.23, 0.23, 'greeble', seg=6)


def rcs_quad(mb, F, sz=1.0):
    F.box(mb, 0, 0, -F.sink, sz, sz, 0.75 * sz + F.sink, 'hull2')
    w = 0.42 * sz
    for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        a = (du * sz / 2, dv * sz / 2, w)
        b = (du * (sz / 2 + 0.45 * sz), dv * (sz / 2 + 0.45 * sz), w)
        F.cyl(mb, a, b, 0.12 * sz, 0.26 * sz, 'exhaust', seg=6)
    F.lamp(mb, 0, 0, 0.75 * sz, 0.22, 0.22, 0.1, 'amber')


def hatch(mb, F, W, L, light=True):
    F.box(mb, 0, 0, -F.sink, W, L, 0.07 + F.sink, 'hull2')
    for e in (-1, 1):
        F.box(mb, e * (W / 2 - 0.07), 0, 0.07, 0.14, L, 0.1, 'trim')
        F.box(mb, 0, e * (L / 2 - 0.07), 0.07, W - 0.28, 0.14, 0.1, 'trim')
    F.box(mb, 0, -L / 2 + 0.3, 0.07, W - 0.5, 0.18, 0.15, 'greeble')
    if light:
        F.lamp(mb, W / 2 - 0.22, L / 2 - 0.22, 0.17, 0.14, 0.14, 0.08, 'amber')


def docking_port(mb, F, r=0.9):
    F.plinth(mb, 2.5 * r, 2.5 * r, 0.18, 'hull2')
    annulus(mb, F.p(0, 0, 0.36), F.n, r, r + 0.28, 0.36, 'trim', seg=16)
    F.cyl(mb, (0, 0, 0.18), (0, 0, 0.42), r, r, 'plate', seg=16)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        F.box(mb, math.cos(a) * (r + 0.42), math.sin(a) * (r + 0.42), 0.18, 0.32, 0.32, 0.36, 'greeble')
    for a in (-1, 1):
        for b in (-1, 1):
            F.lamp(mb, a * 1.12 * r, b * 1.12 * r, 0.18, 0.16, 0.16, 0.08, 'amber')


def capacitor_bank(mb, F, nu, nv, pitch=0.8, r=0.28, h=0.75):
    W, L = nu * pitch + 0.3, nv * pitch + 0.3
    F.plinth(mb, W, L, 0.14, 'hull')
    for i in range(nu):
        u = -W / 2 + 0.15 + pitch * (i + 0.5)
        for j in range(nv):
            v = -L / 2 + 0.15 + pitch * (j + 0.5)
            F.cyl(mb, (u, v, 0.14), (u, v, 0.14 + h), r, r, 'trim', seg=10)
            F.cyl(mb, (u, v, 0.14 + h), (u, v, 0.24 + h), r * 0.6, r * 0.6, 'greeble', seg=8)
        F.box(mb, u, 0.0, 0.24 + h, 0.16, L - 0.3, 0.1, 'coil')           # copper bus bar


def vent_louvre(mb, F, W, L, pitch=0.32):
    F.plinth(mb, W, L, 0.08, 'trim')
    n = max(2, int((L - 0.3) / pitch))
    for k in range(n + 1):
        F.box(mb, 0.0, -(L - 0.3) / 2 + k * (L - 0.3) / n, 0.08, W - 0.25, 0.09, 0.18, 'greeble')


def sensor_dome(mb, F, r):
    F.cyl(mb, (0, 0, -F.sink), (0, 0, 0.2), r * 1.2, r * 1.15, 'trim', seg=14)
    F.cyl(mb, (0, 0, 0.2), (0, 0, 0.2 + r * 0.45), r, r * 0.55, 'glass', seg=14)
    F.lamp(mb, r * 0.95, 0.0, 0.2, 0.14, 0.14, 0.08, 'amber')


def conduit(mb, pts, n, npipes=3, r=0.13, gap=0.34, clamp_every=2.0):
    """Straight pipe bundle along p0 -> p1 on a surface with normal n, clamp straps on a 2 m frame pitch."""
    p0, p1 = pts
    d = (p1 - p0)
    L = d.length
    d.normalize()
    sd = n.cross(d).normalized()
    for i in range(npipes):
        o = (i - (npipes - 1) / 2) * gap
        mb.cyl(p0 + sd * o + n * (r + 0.05), p1 + sd * o + n * (r + 0.05), r, r, 'trim', seg=6, caps=False)
    k = int(L / clamp_every)
    for i in range(k + 1):
        p = p0 + d * (L * i / max(1, k))
        obox(mb, p + n * (r + 0.05) - n * 0.12, n, (npipes * gap + 0.15, 0.22, 2 * r + 0.3), 'greeble', lift=0.0,
             fwd=d)


# ================================================================================================ zones
def gallery(mb, H):
    """C structure: armoured charging gallery over the breech line (main bus trunk)."""
    s0, s1 = -5.5, 5.6
    zd0 = min(deck_z(H, s0), deck_z(H, s1))
    blk(mb, s0, s1, -1.45, 1.45, zd0 - 0.4, zd0 + 0.95, 'hull', ins=0.35, ins_s=0.6)
    blk(mb, s0 + 0.9, s1 - 0.9, -0.95, 0.95, zd0 + 0.9, zd0 + 1.25, 'hull2', ins=0.15)
    for s in (-3.6, -0.6, 2.4):       # clamp bands over the gallery
        mb.box((0, Y(s), zd0 + 0.7), (3.1, 0.35, 0.7), 'trim')
    blk(mb, s1 - 1.0, s1 - 0.6, -1.0, 1.0, zd0 + 1.2, zd0 + 1.3, 'accent')


def zone_breech(mb, H, R, S):
    """C: charging gallery over the breech line, main capacitor racks, fire-control arrays, bow RCS, PD."""
    for s in (-3.4, -0.2):
        for sg, F in pair(lambda sg: S.top(sg * 2.75, s, 1.9, 2.7, 'cap_rack')):
            capacitor_bank(mb, F, 2, 3)
            F.box(mb, -sg * 1.3 if F.b.x > 0 else sg * 1.3, 0.0, 0.0, 0.7, 0.5, 0.35, 'greeble')   # feed to gallery
    # fire-control phased arrays on the forward walls (view along the barrel line)
    for sg, F in pair(lambda sg: S.hull(H, -1.2, sidep(sg, 0, 4, 0.52), 3.2, 1.5, 'fc_array')):
        sensor_array(mb, F, 1.5, 3.2, 2, 4)
    # PD pair on the upper chamfers, RCS quads at the forward deck corners
    for sg, F in pair(lambda sg: S.hull(H, 0.5, sidep(sg, 1, 3, 0.5), 1.8, 1.6, 'pd_fwd')):
        pd_turret(mb, F, 0, 0, 0.85)
    for sg, F in pair(lambda sg: S.hull(H, 4.6, sidep(sg, 1, 3, 0.45), 1.2, 1.2, 'rcs_bow')):
        rcs_quad(mb, F, 1.0)
    # keel: fire-control blister under the breech, lower bow RCS
    for sg, F in pair(lambda sg: S.under(sg * 1.7, 2.0, 1.0, 1.0, 'fc_dome')):
        sensor_dome(mb, F, 0.5)
    for sg, F in pair(lambda sg: S.hull(H, 0.8, sidep(sg, 7, 5, 0.5), 1.2, 1.2, 'rcs_bow_lo')):
        rcs_quad(mb, F, 1.0)


def zone_reactor(mb, H, R, S):
    """D: coolant trunk on the centre line, radiator banks either side (deck + keel), reactor vents, PD."""
    zt = min(deck_z(H, -17.0), deck_z(H, -6.0))
    blk(mb, -17.4, -5.6, -1.1, 1.1, zt - 0.4, zt + 0.08, 'greeble')     # open centre channel floor
    conduit(mb, (Vector((0, Y(-17.0), zt + 0.08)), Vector((0, Y(-5.8), zt + 0.08))), Vector((0, 0, 1)))
    for s in (-14.0, -8.8):
        for sg, F in pair(lambda sg: S.top(sg * 2.95, s, 3.0, 4.6, 'radiator')):
            radiator_bank(mb, F, 3.0, 4.6)
    for sg, F in pair(lambda sg: S.top(sg * 2.95, -5.6, 2.2, 1.0, 'manifold')):
        manifold(mb, F, 2.2, 1.0)
    for s in (-11.4,):
        for sg, F in pair(lambda sg: S.top(sg * 1.55, s, 0.7, 0.7, 'valve')):
            F.cyl(mb, (0, 0, -F.sink), (0, 0, 0.3), 0.3, 0.3, 'hull2', seg=8)
            F.cyl(mb, (0, 0, 0.3), (0, 0, 0.42), 0.4, 0.4, 'trim', seg=8)
    # ventral radiators + reactor maintenance hatch
    for s in (-14.0, -8.8):
        for sg, F in pair(lambda sg: S.under(sg * 2.2, s, 2.4, 4.4, 'radiator_lo')):
            radiator_bank(mb, F, 2.4, 4.4, fh=0.55)
    # reactor vent louvres on the walls (upper belt)
    for s in (-13.5, -9.0):
        for sg, F in pair(lambda sg: S.hull(H, s, sidep(sg, 0, 4, 0.5), 3.4, 1.4, 'vent')):
            vent_louvre(mb, F, 1.4, 3.4)
    # PD pair on the low chamfers (under the reactor, covers the belly)
    for sg, F in pair(lambda sg: S.hull(H, -11.2, sidep(sg, 7, 5, 0.5), 1.8, 1.6, 'pd_low')):
        pd_turret(mb, F, 0, 0, 0.85)


def command_block(mb, H, R):
    """E structure: low armoured command block with a slanted windowed front and a stepped bridge tier."""
    zt = min(deck_z(H, -29.0), deck_z(H, -16.5))
    sF, sA = -17.0, -28.6
    b = [(-4.0, Y(sF), zt - 0.3), (4.0, Y(sF), zt - 0.3), (4.0, Y(sA), zt - 0.3), (-4.0, Y(sA), zt - 0.3)]
    t = [(-3.3, Y(sF - 2.2), zt + 2.2), (3.3, Y(sF - 2.2), zt + 2.2), (3.3, Y(sA + 0.8), zt + 2.2),
         (-3.3, Y(sA + 0.8), zt + 2.2)]
    mb.hexa(b + t, 'hull', bevel=0.12)
    # armour on the command block roof: three lanes of long plates with gaps + sub-plates
    xc = [-3.0, -1.0, 1.0, 3.0]
    for k, (x0, x1) in enumerate(zip(xc, xc[1:])):
        sc = cuts(sA + 1.0, sF - 2.4, R, 2.6, 4.5)
        for a, c in zip(sc, sc[1:]):
            m = UP_MAT(0, k, R) if k != 1 else 'hull2'
            blk(mb, a + 0.15, c - 0.15, x0 + 0.12, x1 - 0.12, zt + 2.1, zt + 2.35, m, ins=0.1)
    # upper tier (bridge) with a slanted front
    b2 = [(-2.3, Y(-20.0), zt + 2.2), (2.3, Y(-20.0), zt + 2.2), (2.3, Y(-25.6), zt + 2.2), (-2.3, Y(-25.6), zt + 2.2)]
    t2 = [(-1.9, Y(-21.0), zt + 3.3), (1.9, Y(-21.0), zt + 3.3), (1.9, Y(-25.2), zt + 3.3), (-1.9, Y(-25.2), zt + 3.3)]
    mb.hexa(b2 + t2, 'hull2', bevel=0.08)
    blk(mb, -25.0, -21.3, -1.55, 1.55, zt + 3.28, zt + 3.42, 'plate', ins=0.08)
    for sg in (1, -1):
        blk(mb, -20.9, -20.7, sg * 1.5, sg * 1.85, zt + 3.28, zt + 3.36, 'accent')
    # bridge windows: slanted front of the upper tier + main block front + sides
    for k in range(2):
        f = 0.35 + 0.35 * k
        z = zt + 2.2 + 1.1 * f
        s = lerp(-20.0, -21.0, f) + 0.05
        for x in [-1.6 + i * 0.8 for i in range(5)]:
            window_bay(mb, Vector((x, Y(s), z)), Vector((0, -1, 1.0)).normalized(), (0.22, 0.55, 0.06), 'window',
                       WIN_FRAME, lift=0.018, fwd=Vector((1, 0, 0)))
    for k in range(2):
        f = 0.3 + 0.36 * k
        z = zt - 0.3 + 2.5 * f
        s = lerp(sF, sF - 2.2, f) + 0.05
        for i in range(9):
            x = -3.2 + i * 0.8
            if R.random() < 0.15:
                continue
            window_bay(mb, Vector((x, Y(s), z)), Vector((0, -1, 1.1)).normalized(), (0.2, 0.5, 0.06), 'window',
                       WIN_FRAME, lift=0.018, fwd=Vector((1, 0, 0)))
    for sg in (1, -1):
        for z in (zt + 0.5, zt + 1.35):
            s = sA + 1.5
            while s < sF - 2.0:
                if R.random() > 0.2:
                    xw = sg * (4.0 - 0.7 * (z - zt + 0.3) / 2.5) + sg * 0.03
                    window_bay(mb, Vector((xw, Y(s), z)), Vector((sg, 0, 0.28)).normalized(), (0.2, 0.7, 0.06),
                               'window', WIN_FRAME, lift=0.018)
                s += 1.2
        beacon(mb, Vector((sg * 3.3, Y(sA + 0.9), zt + 2.3)), Vector((0, 0, 1)), 0.11, 'amber', LAMP_BODY, 'trim')


def zone_command(mb, H, R, S):
    """E: roof sensors, crew window bands, airlocks, docking collars, PD, keel hatch."""
    zt = min(deck_z(H, -29.0), deck_z(H, -16.5))
    # roof sensors (no masts): two blisters + a flush comms array on the bridge tier
    for sg, F in pair(lambda sg: S.top(sg * 2.3, -26.4, 1.1, 1.1, 'blister')):
        sensor_dome(mb, F, 0.5)
    F = S.top(0.0, -23.1, 2.4, 2.4, 'comms')
    if F:
        sensor_array(mb, F, 2.4, 2.6, 3, 3)
    F = S.top(0.0, -26.9, 1.0, 1.3, 'hatch_roof')
    if F:
        hatch(mb, F, 0.9, 1.2)
    # crew window bands on the walls (two decks aft, the gunnery deck forward), one window per 1.5 m frame, cast
    # on the armour (a window that would straddle a plate seam is dropped)
    runs = ((-28.4, -17.4, 0.52), (-28.4, -17.4, 0.2), (-5.2, -0.4, 0.2), (-5.2, -2.0, 0.52))
    keep_out = ((-22.2, -19.8, 0.52), (-27.2, -24.4, 0.2))
    for sg in (1, -1):
        for s0, s1, f in runs:
            p = sidep(sg, 0, 4, f)
            s = s0
            while s < s1:
                if not any(a < s < b and f == ff for a, b, ff in keep_out):
                    pos, n = H.pt(s, p, 0.0)
                    hits = [S.cast(pos + n * 3 + Vector((0, dy, 0)), -n, 6.0) for dy in (-0.45, 0.0, 0.45)]
                    ds = [h.dot(n) for h in hits] if all(hits) else None
                    if ds and max(ds) - min(ds) < 0.2:          # on one plate (a sub-plate step is bridged)
                        c = hits[1] + n * (max(ds) - hits[1].dot(n))
                        lit = R.random() > 0.12
                        window_bay(mb, c, n, (0.55, 1.05, 0.08), 'window', WIN_FRAME, lift=0.03, lit=lit,
                                   border=0.135)
                s += 1.5
    # airlock (upper belt) + docking collar (lower belt) per flank
    for sg, F in pair(lambda sg: S.hull(H, -21.0, sidep(sg, 0, 4, 0.52), 1.6, 1.2, 'airlock')):
        hatch(mb, F, 1.2, 1.6)
    for sg, F in pair(lambda sg: S.hull(H, -25.8, sidep(sg, 0, 4, 0.2), 2.0, 2.0, 'dock', tol=0.5)):
        docking_port(mb, F, 0.75)
    # PD pair on the upper chamfers aft (covers the stern arc)
    for sg, F in pair(lambda sg: S.hull(H, -27.0, sidep(sg, 1, 3, 0.5), 1.8, 1.6, 'pd_aft')):
        pd_turret(mb, F, 0, 0, 0.85, yaw=0.0)
    for sg, F in pair(lambda sg: S.hull(H, -24.0, sidep(sg, 7, 5, 0.5), 1.8, 1.6, 'pd_low_aft')):
        pd_turret(mb, F, 0, 0, 0.85)
    # keel: crew cargo hatch
    F = S.under(0.0, -22.0, 2.4, 3.0, 'cargo')
    if F:
        hatch(mb, F, 2.2, 3.0)


def zone_engineering(mb, H, R, S):
    """F: stern deck louvres, stern RCS quads."""
    for sg, F in pair(lambda sg: S.top(sg * 2.25, -31.4, 1.3, 2.8, 'eng_vent')):
        vent_louvre(mb, F, 1.3, 2.8)
    for sg, F in pair(lambda sg: S.hull(H, -32.0, sidep(sg, 1, 3, 0.5), 1.2, 1.2, 'rcs_aft')):
        rcs_quad(mb, F, 1.0)
    for sg, F in pair(lambda sg: S.hull(H, -32.0, sidep(sg, 7, 5, 0.5), 1.2, 1.2, 'rcs_aft_lo')):
        rcs_quad(mb, F, 1.0)
    F = S.under(0.0, -30.5, 1.8, 2.0, 'eng_hatch')
    if F:
        hatch(mb, F, 1.6, 2.0)


def service_runs(mb, H, S):
    """Conduits along hull lines: a two-pipe bundle along the top of each wall (under the chamfer break), a keel
    bundle beside the keel spine, and PD magazine hatches on the keel under each PD group."""
    brk = [-31.5, -22.0, -8.0, 1.2]
    for sg in (1, -1):
        p = sidep(sg, 0, 4, 0.93)
        for a, b in zip(brk, brk[1:]):
            p0, n0 = H.pt(a + 0.3, p, T + 0.02)
            p1, n1 = H.pt(b - 0.3, p, T + 0.02)
            conduit(mb, (p0, p1), n0, npipes=2, r=0.11, gap=0.28, clamp_every=1.5)
        for a, b in zip(brk, brk[1:]):
            q0 = Vector((sg * 0.95, Y(a + 0.3), H.at(a + 0.3)[2] - H.at(a + 0.3)[1] / 2 - T - 0.02))
            q1 = Vector((sg * 0.95, Y(b - 0.3), H.at(b - 0.3)[2] - H.at(b - 0.3)[1] / 2 - T - 0.02))
            conduit(mb, (q0, q1), Vector((0, 0, -1)), npipes=2, r=0.1, gap=0.26, clamp_every=1.5)
    for s in (0.4, -11.2, -26.5):
        for sg, F in pair(lambda sg: S.under(sg * 2.4, s, 1.2, 1.6, 'mag_hatch')):
            hatch(mb, F, 1.1, 1.5)


def edge_lights(mb, H, S, R):
    """Amber marker rows along the deck-edge chamfer break and the low chamfer; blue beacons at the extremities."""
    for sg in (1, -1):
        for p, pitch in ((sidep(sg, 1, 3, 0.9), 3.0), (sidep(sg, 7, 5, 0.1), 4.5)):
            s = S_STERN + 1.2
            while s < S_BOW - 0.8:
                pos, n = H.pt(s, p, 0.0)
                h = S.cast(pos + n * 3.0, -n, 6.0)
                if h and (h - pos).dot(n) < T + 0.1:
                    lamp_fixture(mb, h, n, (0.18, 0.4, 0.08), 'amber', LAMP_BODY, lift=0.032)
                s += pitch
    for sg in (1, -1):
        beacon(mb, Vector((sg * 1.45, Y(26.6), -2.1)), Vector((sg, 0, 0)), 0.12, 'blue_light', LAMP_BODY, 'trim')


# ================================================================================================ engines
def engine_bell(mb, p, r, L, seg=36):
    """Deep gimballed nozzle: armoured sleeve with cooling bands, heat-tinted bell, throat glow disc ('engine'),
    central plug.  p = throat centre, bell opens toward +Y (aft)."""
    d = Vector((0, 1, 0))
    q = d.to_track_quat('Z', 'X').to_matrix()
    p = Vector(p)

    def ring(rr, z):
        return [p + q @ Vector((math.cos(a) * rr, math.sin(a) * rr, z)) for a in
                [i / seg * 2 * math.pi for i in range(seg)]]
    mb.loft([ring(r * 1.2, -1.4), ring(r * 1.2, L * 0.12), ring(r * 1.1, L * 0.2)], 'hull2', cap0=False, cap1=False)
    for z in (-0.7, 0.0):
        mb.loft([ring(r * 1.19, z), ring(r * 1.27, z + 0.08), ring(r * 1.27, z + 0.28), ring(r * 1.19, z + 0.36)],
                'trim', cap0=False, cap1=False)
    # bell: outer skin -> flared rim -> inner wall -> throat
    mb.loft([ring(r * 1.1, L * 0.2), ring(r * 1.16, L * 0.58), ring(r * 1.2, L * 0.62), ring(r * 1.06, L * 0.63)],
            'exhaust', cap0=False, cap1=False)
    mb.loft([ring(r * 1.06, L * 0.63), ring(r * 0.8, L * 0.36), ring(r * 0.56, L * 0.1), ring(r * 0.5, 0.05)],
            'greeble', cap0=False, cap1=False)                                   # sooted inner wall
    for k in range(12):   # cooling channel ribs on the bell
        a = k / 12 * 2 * math.pi
        n = Vector((math.cos(a), 0, math.sin(a)))
        c = p + n * (r * 1.14) + d * (L * 0.4)
        obox(mb, c, n, (0.08, L * 0.36, 0.08), 'trim', lift=0.02, fwd=d)
    # glow disc: fan around a centre vertex, facing aft (normals fixed after meshing)
    c0 = p + d * 0.08
    mb.loft([c0, ring(r * 0.25, 0.08), ring(r * 0.51, 0.08)], 'engine', cap0=False, cap1=False)
    mb.cyl(p + d * 0.1, p + d * (L * 0.34), r * 0.17, r * 0.06, 'trim', seg=12)
    for z, rr in ((L * 0.2, 0.66), (L * 0.4, 0.86)):   # regen-cooling rings inside the bell
        annulus(mb, p + d * z, d, r * rr, r * rr + 0.06, 0.06, 'trim', seg=seg)


def engine_block(mb, H, R):
    s = S_STERN
    w, h, cz, _ = H.at(s)
    ys = Y(s)
    zc = cz + 0.15
    NZ = [(sg * 2.85, zc + sz * 2.12) for sg in (1, -1) for sz in (1, -1)]
    # armoured engine frame: outer ring of plates + cross beams between the nozzles
    blk(mb, s - 0.6, s + 0.05, -w / 2 + 0.35, w / 2 - 0.35, cz - h / 2 + 0.35, cz + h / 2 - 0.35, 'plate')
    mb.box((0, ys + 0.9, zc), (0.9, 1.8, h - 1.6), 'hull2', bevel=0.06)
    mb.box((0, ys + 0.9, zc), (w - 1.8, 1.8, 0.7), 'hull2', bevel=0.06)
    mb.box((0, ys + 1.85, zc), (1.2, 0.3, 1.2), 'trim')
    for x, z in NZ:
        engine_bell(mb, (x, ys + 0.65, z), 1.55, 2.9)
        for a in (0.6, 2.2, 4.0):   # gimbal actuators from the frame onto the sleeve collar
            n = Vector((math.cos(a), 0, math.sin(a)))
            b0 = Vector((x, ys + 0.1, z)) + n * 1.95
            mb.cyl(b0, Vector((x, ys + 1.0, z)) + n * 1.9, 0.09, 0.07, 'trim', seg=6)
    # stern lights: blue beacons on the upper corners, amber rows on the frame
    for sg in (1, -1):
        beacon(mb, Vector((sg * (w / 2 - 0.5), ys + 0.6, cz + h / 2 - 0.6)), Vector((0, 1, 0)), 0.14, 'blue_light',
               LAMP_BODY, 'trim')
        for k in range(4):
            lamp_fixture(mb, Vector((sg * (0.9 + k * 1.1), ys + 0.6, cz + h / 2 - 0.55)), Vector((0, 1, 0)),
                         (0.14, 0.35, 0.1), 'amber', LAMP_BODY, fwd=Vector((1, 0, 0)), lift=0.05)


# ================================================================================================ build
def fix_normals(obj):
    """Emissive discs are open fans that recalc_face_normals() cannot orient: engine faces aft (Blender +Y =
    glTF -Z), muzzle faces forward (Blender -Y = glTF +Z)."""
    me = obj.data
    idx = {m.name: i for i, m in enumerate(me.materials) if m}
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    fl = 0
    for f in bm.faces:
        f.normal_update()
        if f.material_index == idx.get('engine') and f.normal.y < 0:
            f.normal_flip()
            fl += 1
        if f.material_index == idx.get('muzzle') and f.normal.y > 0:
            f.normal_flip()
            fl += 1
    bm.to_mesh(me)
    bm.free()
    me.update()
    return fl


def ion_frigate():
    palette()
    R = rng(1010)
    H = Hull(MAIN, PROF)
    mb = MB()
    main_hull(mb, H, R)
    glacis(mb, H)
    SB = strongback(mb, R)
    ion_cannon(mb, SB)
    engine_block(mb, H, R)
    gallery(mb, H)
    command_block(mb, H, R)
    S = Surf(mb)
    zone_breech(mb, H, R, S)
    zone_reactor(mb, H, R, S)
    zone_command(mb, H, R, S)
    zone_engineering(mb, H, R, S)
    service_runs(mb, H, S)
    F = S.under(0.0, -5.6, 1.1, 3.6, 'keel_array')
    if F is None:
        F = S.under(-2.0, -5.6, 1.2, 3.2, 'keel_array2')
    if F:
        sensor_array(mb, F, 1.0, 3.2, 1, 4)
    edge_lights(mb, H, S, R)
    if S.rej:
        print('SITES rejected:', S.rej, flush=True)
    obj = mb.to_object('ion_frigate', smooth_angle=26)
    print('emissive discs re-oriented:', fix_normals(obj), flush=True)
    return [obj]


if __name__ == '__main__' and 'ships_ion_frigate' in ' '.join(sys.argv):
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    lib.reset_scene()
    objs = ion_frigate()
    tris = sum(lib.tri_count(o) for o in bpy.context.scene.objects if o.type == 'MESH')
    if 'nosave' not in argv:
        lib.export_glb(os.path.join(ASSETS, 'ion_frigate.glb'))
    print('BUILT ion_frigate v10 tris=%d' % tris, flush=True)
