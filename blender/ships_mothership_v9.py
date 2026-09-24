"""v9 mothership: original dark wedge-hulled capital ship ("arrowhead dreadnought" language).

Silhouette (top view): narrow blunt bow ending in a heavy ring-armoured ion cannon, hull widening aft into a
parallel-sided mid-body, then large swept, angled armour sponsons ("shoulders") on both flanks toward the stern.
A stepped central spine runs the length of the deck with a command block + dark canopy dome ~1/3 from the stern.
Surface: dreadnought-style armour (shipkit.armor: long plates in bands along the stations, real gaps, sub-plates)
on hull, deck, strake and sponsons, carrying purpose-built machinery placed by a zoning plan (MOTHERSHIP_SYSTEMS.md):
capacitor racks, PD batteries, VLS cells, phased arrays, radiator fields, conduits, hatches, docking ports, RCS quads,
shield emitters -- no masts or antennae; dark gunmetal / blue-black satin metal;
many small amber window/light strips, a few cool-blue accents; two big blue-white engines + two small ones,
and a lit hangar slot between the engines.

CONTRACT (glTF space: +Z bow, +Y up, +X starboard):
  * starboard hangar wall: outer surface x = +62 for z in [-40,120], y in [-30,50]; single-layer skin;
    volume x in [2,60], y in [-30,50], z in [-40,120] is empty (validated at build time).
  * length (glTF z) <= 640 m.
  * empties: main_cannon (bow muzzle), hangar_exit (PORT flank, local +Z points outward -X), wound (62,10,40).
  * materials by name: engine (aft-facing discs), window, muzzle, + hull/hull2/plate/greeble/trim/glass/amber/
    blue_light.

Blender space here: bow toward -Y (station s = -y = glTF z), up +Z (= glTF y), +X = glTF +X (starboard).

Usage (from WSL, project root):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/ships_mothership_v9.py)" [-- render | renderonly] [--extra]
Writes assets/mothership.glb; with 'render' also blender/previews/v9_mothership_{top,front34,wall}.png
(--extra adds rear, bow, detail_mid, detail_aft, detail_fwd, belly). Other args: nosave, probe (dorsal heightmap),
--debug-sites (print every rejected equipment site).
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector
import lib
from lib import MB, reg, empty, rng, lerp, annulus, D2R
from shipkit import (Hull, plate, armor, cuts, obox, turret, lamp_fixture, light_bar, chevron_light, window_bay,
                     light_panel, beacon)
from hullkit import dome

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
OUT = os.path.join(HERE, 'previews')

# wall / bay contract (glTF numbers; s == glTF z, Blender z == glTF y)
WALL_X = 62.0
BAY_S = (-40.0, 120.0)
BAY_Z = (-30.0, 50.0)
BAY_X = (2.0, 60.0)
FLAT_S = (-44.0, 124.0)       # parallel-sided mid-body (w = 124)


def palette():
    reg('hull', (0.085, 0.092, 0.110), 0.75, 0.45)      # blue-black gunmetal
    reg('hull2', (0.115, 0.120, 0.135), 0.70, 0.50)     # lighter armour plates
    reg('plate', (0.070, 0.076, 0.092), 0.80, 0.40)     # dark satin plates
    reg('greeble', (0.060, 0.062, 0.070), 0.65, 0.55)   # mechanics / trenches
    reg('trim', (0.140, 0.142, 0.150), 0.85, 0.35)      # bare-metal trim, rings
    reg('glass', (0.030, 0.045, 0.070), 0.30, 0.10)     # command canopy
    reg('window', (0.20, 0.12, 0.06), 0.0, 0.4, (1.0, 0.6, 0.25), 3.0)
    reg('amber', (0.25, 0.10, 0.03), 0.0, 0.4, (1.0, 0.42, 0.08), 4.0)
    reg('blue_light', (0.05, 0.10, 0.20), 0.0, 0.4, (0.3, 0.6, 1.0), 5.0)
    reg('engine', (0.40, 0.50, 0.60), 0.0, 0.3, (0.72, 0.86, 1.0), 10.0)
    reg('muzzle', (0.10, 0.18, 0.28), 0.0, 0.3, (0.35, 0.65, 1.0), 1.3)


# normalized hull profile (u = x, v = z); edges: 0 stbd wall, 1 stbd top chamfer, 2 deck, 3 port chamfer,
# 4 port wall, 5 port low chamfer, 6 keel, 7 stbd low chamfer.  At the mid-body (w=124, h=86, cz=9):
# wall x = +-62 for z in [-30.8, 51.2], deck z = 55, keel z = -36.
V_LO, V_HI, U_TOP, U_BOT = -0.88571, 0.91648, 0.806, 0.645
PROF = [(1, V_LO), (1, V_HI), (U_TOP, 1), (-U_TOP, 1), (-1, V_HI), (-1, V_LO), (-U_BOT, -1), (U_BOT, -1)]
STATIONS = [  # (s, w, h, cz)
    (-291, 128, 78, 8), (-283, 138, 88, 9), (-200, 136, 91, 9.5), (-120, 130, 91, 9.5), (FLAT_S[0], 124, 91, 9.5),
    (FLAT_S[1], 124, 91, 9.5), (160, 112, 84, 8), (230, 82, 68, 6), (285, 54, 52, 4), (309, 44, 42, 4),
]


def Y(s):
    return -s


def blk(mb, s0, s1, x0, x1, z0, z1, mat, ins=0.0, ins_s=None, bevel=0.0):
    """Axis-aligned block (stations s0>s1 or s0<s1) with its top face inset by `ins` (chamfered look)."""
    ins_s = ins if ins_s is None else ins_s
    sa, sb = min(s0, s1), max(s0, s1)
    xa, xb = min(x0, x1), max(x0, x1)
    b = [(xa, Y(sa), z0), (xb, Y(sa), z0), (xb, Y(sb), z0), (xa, Y(sb), z0)]
    t = [(xa + ins, Y(sa + ins_s), z1), (xb - ins, Y(sa + ins_s), z1), (xb - ins, Y(sb - ins_s), z1),
         (xa + ins, Y(sb - ins_s), z1)]
    mb.hexa(b + t, mat, bevel=bevel)


LAMP_BODY, WIN_FRAME = 'hull2', 'greeble'       # non-emissive fixture bodies (housings / window bezels)


def fixture(mb, pos, n, size, mat, fwd=Vector((0, -1, 0)), lift=0.0):
    """Emissive fixture in place of an emissive box: `window` -> recessed window bay, lights -> housed lamp."""
    if mat == 'window':
        window_bay(mb, pos, n, size, 'window', WIN_FRAME, fwd=fwd, lift=lift)
    else:
        lamp_fixture(mb, pos, n, size, mat, LAMP_BODY, fwd=fwd, lift=lift)


def light_row(mb, p0, p1, n, pitch, size, mat, R=None, dropout=0.0, kind=None):
    """Row of emissive fixtures (window bays / housed lamps) along p0->p1 on a surface with normal n.
    size=(across, along, thick) of each fixture's footprint."""
    p0, p1, n = Vector(p0), Vector(p1), Vector(n).normalized()
    d = p1 - p0
    L = d.length
    if L < 1e-3:
        return
    f = d / L
    k = max(1, int(L / pitch))
    for i in range(k + 1):
        if R and R.random() < dropout:
            continue
        if kind == 'chevron':      # direction markers pointing along p0 -> p1
            chevron_light(mb, p0 + f * (L * i / k), n, size, mat, LAMP_BODY, fwd=f, lift=0.0)
        else:
            fixture(mb, p0 + f * (L * i / k), n, size, mat, fwd=f)


# ------------------------------------------------------------------------------------------ structural grid
FR0, BAYL, FRAME = -44.0, 24.0, 6.0          # bulkheads every 24 m from the bay bulkhead s=-44, frames every 6 m
WALL_T, CHAM_T, KEEL_T = 1.2, 1.1, 1.0
SPINE = [(293, 238, 9, 6), (238, 170, 13, 10), (170, 126, 17, 14), (126, 90, 17, 14), (90, -20, 19, 17),
         (-20, -60, 22, 20), (-130, -200, 24, 19), (-200, -274, 20, 13)]
STRAKE = [(176, 50, 50, 54), (126, 64, 51.5, 58), (40, 78, 51.5, 59), (-46, 94, 51.5, 59.5), (-120, 108, 44, 55),
          (-200, 121, 32, 44), (-226, 121, 31, 42)]


def grid(s0, s1, step=BAYL):
    """Grid lines (multiples of `step` from FR0) strictly inside (s0, s1), with the ends added."""
    k0 = math.ceil((s0 - FR0) / step + 1e-6)
    out = [s0]
    k = k0
    while FR0 + k * step < s1 - 1e-6:
        out.append(FR0 + k * step)
        k += 1
    out.append(s1)
    # drop slivers at the ends
    if len(out) > 2 and out[1] - out[0] < step * 0.3:
        out.pop(1)
    if len(out) > 2 and out[-1] - out[-2] < step * 0.3:
        out.pop(-2)
    return out



def strake_at(s):
    """(x_out, z_bottom, z_top) of the strake at station s."""
    st = STRAKE
    for a, b in zip(st, st[1:]):
        if b[0] <= s <= a[0]:
            t = (a[0] - s) / (a[0] - b[0])
            return tuple(lerp(u, v, t) for u, v in zip(a[1:], b[1:]))
    return st[0][1:] if s > st[0][0] else st[-1][1:]



# ------------------------------------------------------------------------------------------ armour kit
DEFER = []      # light rows that sit on armour: placed by ray casting once the armour exists (systems pass)


def defer_row(p0, p1, n, pitch, size, mat, dropout=0.0):
    DEFER.append((Vector(p0), Vector(p1), Vector(n).normalized(), pitch, size, mat, dropout))


def cuts_at(a, b, R, lmin, lmax, fixed=()):
    """cuts() between a and b, forced to break at the `fixed` stations (so skipped regions end on a seam)."""
    pts = [a] + sorted(f for f in fixed if a + lmin * 0.5 < f < b - lmin * 0.5) + [b]
    out = [a]
    for u, v in zip(pts, pts[1:]):
        out += cuts(u, v, R, min(lmin, (v - u)), lmax)[1:]
    return out


def gp(H, s, e, metres=0.45):
    """gap_p (index space) giving ~2 x `metres` between neighbouring plates on edge e."""
    return metres / max(1.0, H.edge_len(s, e))


class RingHull(Hull):
    """Hull-like parametrisation of any lofted section so shipkit.plate()/armor() can armour it:
    ring_fn(s) -> counter-clockwise 2D ring; to_world(s, q) -> Blender point."""

    def __init__(self, ring_fn, to_world, s0, s1):
        self.ring_fn, self.to_world = ring_fn, to_world
        self.n = len(ring_fn(s0))
        self.st = [(s0, 1.0, 1.0, 0.0, 0.0), (s1, 1.0, 1.0, 0.0, 0.0)]
        self.smooth, self.cx0, self.cz0 = False, 0.0, 0.0

    def poly(self, s, off=0.0):
        P = [Vector(q) for q in self.ring_fn(s)]
        if off == 0.0:
            return P, (0.0, 0.0)
        n = len(P)
        Q = []
        for i in range(n):
            e0, e1 = P[i] - P[i - 1], P[(i + 1) % n] - P[i]
            n0, n1 = Vector((e0.y, -e0.x)), Vector((e1.y, -e1.x))
            if n0.length < 1e-9 or n1.length < 1e-9:
                Q.append(P[i])
                continue
            n0.normalize()
            n1.normalize()
            m = n0 + n1
            if m.length < 1e-6:
                m = n1
            m.normalize()
            Q.append(P[i] + m * (off / max(0.35, m.dot(n1))))
        return Q, (0.0, 0.0)

    def _w(self, s, q, c):
        return self.to_world(s, q)


def ccw(pts):
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
    return pts if area > 0 else pts[::-1]


UP_MAT = lambda i, j, R: 'hull2' if R.random() < 0.78 else 'plate'
DN_MAT = lambda i, j, R: 'plate' if R.random() < 0.7 else 'hull'


# ------------------------------------------------------------------------------------------ main hull
def main_hull(mb, H, R):
    """Hull loft + dreadnought-style armour: long plates in bands along the stations, real gaps, sub-plates."""
    H.build(mb, 'hull')
    # chamfers (upper + lower) share one set of station cuts so the plate seams line up across the edges
    sc = cuts(-282, 305, R, 24, 44)
    for e in (1, 3):
        armor(mb, H, sc, [e + 0.02, e + 0.98], UP_MAT, R, thick=CHAM_T, gap_s=0.9, gap_p=0.0, sub_prob=0.22,
              sub_mat='plate')
    for e in (5, 7):
        armor(mb, H, sc, [e + 0.02, e + 0.5, e + 0.98], DN_MAT, R, thick=CHAM_T, gap_s=0.9, gap_p=gp(H, 0, e),
              sub_prob=0.15, sub_mat='hull')
    # walls: three belts; starboard skips the hangar wall, port skips the launch bay; aft is inside the sponsons
    wall_mat = lambda i, j, R: ('plate', 'hull2', 'plate')[j] if R.random() < 0.78 else 'hull'
    for e, spans in ((0, ((124.5, 293.0),)), (4, ((-45.0, 5.5), (104.5, 293.0)))):
        for a, b in spans:
            armor(mb, H, cuts(a, b, R, 22, 40), [e + 0.02, e + 0.34, e + 0.66, e + 0.98], wall_mat, R,
                  thick=WALL_T, gap_s=0.9, gap_p=gp(H, 0, e), sub_prob=0.22, sub_mat='hull2')
    # keel: armour belts either side of a structural keel spine (one block per bulkhead bay)
    armor(mb, H, cuts(-282, 300, R, 24, 44), [6.02, 6.21, 6.41], DN_MAT, R, thick=KEEL_T, gap_s=0.9,
          gap_p=gp(H, 0, 6), sub_prob=0.15, sub_mat='hull')
    armor(mb, H, cuts(-282, 300, R, 24, 44), [6.59, 6.79, 6.98], DN_MAT, R, thick=KEEL_T, gap_s=0.9,
          gap_p=gp(H, 0, 6), sub_prob=0.15, sub_mat='hull')
    bays = grid(-282, 300)
    for a, b in zip(bays, bays[1:]):
        zk = min(H.at(a)[2] - H.at(a)[1] / 2, H.at(b)[2] - H.at(b)[1] / 2)
        blk(mb, a + 0.8, b - 0.8, -7, 7, zk + 1, zk - 2.4, 'hull2', ins=0.0)
    # keel marker lights on a regular 12 m pitch (placed on the armour later)
    for side in (1, -1):
        for s in range(-270, 282, 12):
            w, h, cz, _ = H.at(s)
            defer_row((side * U_BOT * w / 2 * 0.7, Y(s), cz - h / 2), (side * U_BOT * w / 2 * 0.7, Y(s), cz - h / 2),
                      (0, 0, -1), 1.0, (1.0, 3.0, 0.3), 'amber')


def deck_z(H, s):
    w, h, cz, _ = H.at(s)
    return cz + h / 2



# deck lanes in edge-2 index space (2.0 = starboard deck edge, 3.0 = port): outer band, trench lane, conduit
# channel beside the spine foot, spine lanes.  At the mid-body 0.01 = 1 m.
DECK_P = [2.01, 2.16, 2.24, 2.30, 2.37, 2.5, 2.63, 2.70, 2.76, 2.84, 2.99]
CHANNEL_P = (2.265, 2.735)                      # power / coolant trunk lanes (plates skipped there)
TRENCH = ((-60, 120),)                          # midship service trench at x = +-30
CHANNEL_S = ((-20, 176), (-262, -140))          # where the channel lanes carry a trunk


def deck(mb, H, R):
    """Main deck armour (same logic as the hull): long plates in lanes that taper with the deck, sub-plates,
    service trench and conduit channels left open."""
    skip = []
    for a, b in TRENCH:
        skip += [(a, b, 2.16, 2.24), (a, b, 2.76, 2.84)]
    for a, b in CHANNEL_S:
        skip += [(a, b, 2.24, 2.30), (a, b, 2.70, 2.76)]
    skip += [(-110, 170, 2.0, 2.16), (-110, 170, 2.84, 3.0)]       # under the strake
    fixed = [x for ab in TRENCH + CHANNEL_S for x in ab] + [-110, 170]
    sc = cuts_at(-285, 305, R, 24, 44, fixed)
    armor(mb, H, sc, DECK_P, UP_MAT, R, thick=1.0, gap_s=0.9, gap_p=gp(H, 0, 2), skip=skip, sub_prob=0.22,
          sub_mat='plate')
    # service trench (midship): recessed floor, raised kerbs, amber guide lights on a 6 m pitch
    for side in (1, -1):
        x = side * 30.0
        for a, b in TRENCH:
            zt = min(deck_z(H, a), deck_z(H, b))
            blk(mb, a, b, x - 3.2, x + 3.2, zt - 1.0, zt + 0.1, 'greeble')
            for xs in (x - 3.8, x + 3.8):
                blk(mb, a, b, xs - 0.7, xs + 0.7, zt - 0.5, zt + 1.6, 'trim', ins=0.3)
            light_row(mb, (x, Y(a + 3), zt + 0.1), (x, Y(b - 3), zt + 0.1), (0, 0, 1), 6.0,
                      (1.2, 2.4, 0.25), 'amber', kind='chevron')
    # deck-edge amber rows along the chamfer break (the "edge lights" of the wedge)
    for side in (1, -1):
        for s in range(-276, 294, 6):
            pos, n = H.pt(s, 1.12 if side == 1 else 2.88, 0.0)
            defer_row(pos, pos, n, 1.0, (1.0, 2.2, 0.3), 'amber')


def spine_and_bridge(mb, H, R):
    """Stepped central superstructure and the command block with canopy dome (~1/3 from the stern)."""
    segs = SPINE
    for (a, b, hw, hh) in segs:
        zt = min(deck_z(H, a), deck_z(H, b))
        zb0 = max(zt - 1, BAY_Z[1] + 0.5) if b < BAY_S[1] else zt - 1   # keep clear of the bay volume
        blk(mb, a, b, -hw, hw, zb0, zt + hh, 'hull', ins=3.0, ins_s=4.0)
        # stepped upper layer
        blk(mb, a - 6, b + 6, -hw * 0.62, hw * 0.62, zt + hh - 0.5, zt + hh + 4.5, 'hull2', ins=1.4, ins_s=2)
        # side window bands
        for side in (1, -1):
            light_row(mb, (side * (hw - 1.6), Y(a - 5), zt + hh * 0.55), (side * (hw - 1.6), Y(b + 5), zt + hh * 0.55),
                      (side, 0, 0.35), 3.2, (0.7, 2.2, 0.3), 'window', R=R, dropout=0.25)
            light_row(mb, (side * (hw - 0.8), Y(a - 5), zt + hh * 0.25), (side * (hw - 0.8), Y(b + 5), zt + hh * 0.25),
                      (side, 0, 0.1), 4.0, (0.7, 2.6, 0.3), 'window', R=R, dropout=0.45)
        # roof armour: three lanes of long plates with gaps and sub-plates (same logic as the hull)
        ztop = zt + hh + 4.5
        xw = hw * 0.62 - 1.6
        xc = [-xw, -xw / 3, xw / 3, xw]
        for k, (x0, x1) in enumerate(zip(xc, xc[1:])):
            sc = cuts(b + 7, a - 7, R, 12, 24)
            for sa, sb in zip(sc, sc[1:]):
                m = UP_MAT(0, k, R)
                blk(mb, sa + 0.45, sb - 0.45, x0 + 0.35, x1 - 0.35, ztop - 0.3, ztop + 0.8, m, ins=0.35)
                if R.random() < 0.22 and sb - sa > 8:
                    L = sb - sa
                    blk(mb, sa + L * 0.25, sb - L * 0.25, x0 + (x1 - x0) * 0.2, x1 - (x1 - x0) * 0.2, ztop + 0.6,
                        ztop + 1.2, 'plate', ins=0.25)
    # spine ridge lights
    light_row(mb, (0, Y(285), deck_z(H, 285) + 10.6), (0, Y(250), deck_z(H, 250) + 10.6), (0, 0, 1), 6,
              (0.8, 2.0, 0.3), 'blue_light')
    # ---------------- command block (s ~ -95): wide slanted base, upper tier, canopy dome
    zt = deck_z(H, -95)
    sF, sA = -58, -132
    b = [(-32, Y(sF), zt), (32, Y(sF), zt), (32, Y(sA), zt), (-32, Y(sA), zt)]
    t = [(-27, Y(sF - 12), zt + 26), (27, Y(sF - 12), zt + 26), (27, Y(sA + 4), zt + 26), (-27, Y(sA + 4), zt + 26)]
    mb.hexa(b + t, 'hull', bevel=0.6)
    b2 = [(-24, Y(sF - 14), zt + 25.5), (24, Y(sF - 14), zt + 25.5), (24, Y(sA + 8), zt + 25.5),
          (-24, Y(sA + 8), zt + 25.5)]
    t2 = [(-19, Y(sF - 22), zt + 31), (19, Y(sF - 22), zt + 31), (19, Y(sA + 12), zt + 31), (-19, Y(sA + 12), zt + 31)]
    mb.hexa(b2 + t2, 'hull2', bevel=0.4)
    # slanted-front window bands (bridge windows)
    for k in range(3):
        f = 0.3 + k * 0.22
        z = zt + 26 * f
        s = lerp(sF, sF - 12, f)
        light_row(mb, (-26 + 5 * f, Y(s) - 0.3, z), (26 - 5 * f, Y(s) - 0.3, z), (0, -1, 0.45), 2.4, (0.5, 1.6, 0.3),
                  'window', R=R, dropout=0.1)
    for side in (1, -1):
        for k in range(3):
            z = zt + 6 + k * 6.5
            light_row(mb, (side * (31.6 - k * 1.2), Y(sF - 4), z), (side * (31.6 - k * 1.2), Y(sA + 3), z),
                      (side, 0, 0.18), 3.0, (0.6, 2.0, 0.3), 'window', R=R, dropout=0.2)
    dz = zt + 31
    dome(mb, (0, Y(-98), dz), 10.5, 'glass', base_mat='trim')
    light_row(mb, (-11.5, Y(-98) - 3, dz + 0.2), (11.5, Y(-98) - 3, dz + 0.2), (0, -1, 0.2), 2.0,
              (0.5, 1.2, 0.3), 'blue_light')
    return dz + 10.5


# ------------------------------------------------------------------------------------------ sponsons
def spon_sec(x):
    """Sponson section at |x|: (s_leading, s_trailing, z_bottom, z_top)."""
    t = max(0.0, x - 62) / 71.0
    s_le = -46 - t * 150          # swept leading edge: -46 at the hull -> -196 at the tip
    s_te = -286 + t * 8
    zb = -24 + t * 8
    zt = 50 - t * 22              # top slopes down outward (angled shoulder)
    return s_le, s_te, zb, zt


def sponson(mb, R, sg):
    """Swept, angled armour 'shoulder' on one flank (sg=+1 starboard, -1 port), aft of s=-46."""
    xs = [56, 70, 92, 114, 128, 133]
    sec = spon_sec

    def ring(x, shrink=0.0):
        s_le, s_te, zb, zt = sec(x)
        zb += shrink
        zt -= shrink
        s_le -= shrink
        zc = (zb + zt) / 2 - 3
        pts = [(s_le, zc), (s_le - 16, zt), (s_te + 7, zt), (s_te, zt - 7), (s_te, zb + 5), (s_le - 22, zb)]
        return [Vector((sg * x, Y(s), z)) for s, z in pts]
    rings = [ring(x) for x in xs[:-1]] + [ring(xs[-1], 4.0)]
    mb.loft(rings, 'hull')

    # armour: the sponson section is lofted span-wise, so plates run outboard in bands across the shoulder
    def sring(x):                       # CCW ring in (station s, z); edges: 0 lead-upper chamfer, 1 top,
        s_le, s_te, zb, zt = sec(x)      # 2 aft chamfer, 3 trailing face, 4 bottom, 5 lead-lower chamfer
        zc = (zb + zt) / 2 - 3
        return [(s_le, zc), (s_le - 16, zt), (s_te + 7, zt), (s_te, zt - 7), (s_te, zb + 5), (s_le - 22, zb)]
    SH = RingHull(sring, lambda x, q: Vector((sg * x, Y(q[0]), q[1])), 56, 133)
    spn = cuts(63, 128, R, 14, 24)
    armor(mb, SH, spn, [1.01, 1.2, 1.4, 1.6, 1.8, 1.99], UP_MAT, R, thick=1.1, gap_s=0.9, gap_p=0.004,
          sub_prob=0.22, sub_mat='plate')
    armor(mb, SH, spn, [0.03, 0.97], UP_MAT, R, thick=1.1, gap_s=0.9, gap_p=0.0, sub_prob=0.15, sub_mat='plate')
    armor(mb, SH, spn, [2.03, 2.97], UP_MAT, R, thick=1.0, gap_s=0.9, gap_p=0.0)
    armor(mb, SH, spn, [5.03, 5.5, 5.97], DN_MAT, R, thick=1.0, gap_s=0.9, gap_p=0.01, sub_prob=0.15, sub_mat='hull')
    armor(mb, SH, spn, [4.01, 4.34, 4.67, 4.99], DN_MAT, R, thick=0.9, gap_s=0.9, gap_p=0.004)
    # amber edge lights: along the leading chamfer, the top leading break (placed on the armour later)
    xa, xb = 60, 128
    A, B = sec(xa), sec(xb)
    for f in (0.35, 0.7):
        p0 = Vector((sg * xa, Y(lerp(A[0], A[0] - 16, f)), lerp((A[2] + A[3]) / 2 - 3, A[3], f)))
        p1 = Vector((sg * xb, Y(lerp(B[0], B[0] - 16, f)), lerp((B[2] + B[3]) / 2 - 3, B[3], f)))
        defer_row(p0, p1, Vector((sg * 0.25, -1.0, 1.0)), 4.5, (1.0, 2.4, 0.4), 'amber')
    p0 = Vector((sg * xa, Y(A[0] - 18), A[3]))
    p1 = Vector((sg * xb, Y(B[0] - 18), B[3]))
    defer_row(p0, p1, (0, 0, 1), 6.0, (1.0, 2.4, 0.3), 'amber', dropout=0.2)
    p0 = Vector((sg * xa, Y(A[0] - 10), A[2] + 3))
    p1 = Vector((sg * xb, Y(B[0] - 10), B[2] + 3))
    defer_row(p0, p1, Vector((0, -1, -0.6)), 6.0, (0.9, 2.0, 0.3), 'amber', dropout=0.3)
    # outer tip face: window grid + nav light
    s_le, s_te, zb, zt = sec(133)
    for z in (zb + 10, (zb + zt) / 2, zt - 9):
        light_row(mb, (sg * 133.2, Y(s_le - 22), z), (sg * 133.2, Y(s_te + 10), z), (sg, 0, 0), 4.0,
                  (0.8, 2.4, 0.3), 'window', R=R, dropout=0.15)
    beacon(mb, Vector((sg * 133.2, Y(s_le - 18), zt - 4)), Vector((sg, 0, 0)), 1.4, 'blue_light' if sg > 0 else 'amber',
           LAMP_BODY, 'trim')
    # trailing (aft) face lights + small engine
    s_le, s_te, zb, zt = sec(100)
    light_row(mb, (sg * 72, Y(-286.3), 30), (sg * 124, Y(-281.5), 20), (0, 1, 0), 5.0, (0.8, 2.2, 0.3), 'amber')
    engine_bell(mb, Vector((sg * 100, Y(-283), 0)), 8.5, 12)


def strake(mb, R, sg):
    """Upper armoured strake (above z=51 over the bay, so it never covers the starboard bay wall) that carries the
    wedge line from the forward hull out onto the sponson top -> continuous arrowhead planform."""
    # (s, x_out, z_bottom, z_top)
    st = STRAKE

    def ring(s, xo, zb, zt):
        return [Vector((sg * x, Y(s), z)) for x, z in
                ((36, zt + 0.5), (xo - 5, zt), (xo, zt - 3.5), (xo - 2, zb), (46, zb))]
    mb.loft([ring(*r) for r in st], 'hull2')

    at = strake_at

    def rring(s):          # CCW ring in (x, z)
        xo, zb, zt = at(s)
        return ccw([(sg * x, z) for x, z in ((36, zt + 0.5), (xo - 5, zt), (xo, zt - 3.5), (xo - 2, zb), (46, zb))])
    SH = RingHull(rring, lambda s, q: Vector((q[0], Y(s), q[1])), -226, 176)
    # edge indices after the CCW fix: find roof / outer chamfer / outer face by their midpoints
    r0 = rring(0.0)
    mids = [((r0[i][0] + r0[(i + 1) % 5][0]) / 2, (r0[i][1] + r0[(i + 1) % 5][1]) / 2) for i in range(5)]
    roof = max(range(5), key=lambda i: mids[i][1])
    face = max(range(5), key=lambda i: abs(mids[i][0]) - (100 if i == roof else 0))
    cham = [i for i in range(5) if i not in (roof, face) and abs(mids[i][0]) > 70 and mids[i][1] > 55]
    sc = cuts(-222, 172, R, 22, 40)
    armor(mb, SH, sc, [roof + 0.02, roof + 0.36, roof + 0.68, roof + 0.98], UP_MAT, R, thick=1.0, gap_s=0.9,
          gap_p=0.008, sub_prob=0.22, sub_mat='plate')
    for e in cham + [face]:
        armor(mb, SH, sc, [e + 0.04, e + 0.96], UP_MAT, R, thick=0.9, gap_s=0.9, gap_p=0.0)
    s = 165.0
    while s > -224:
        xo, zb, zt = at(s)
        defer_row(Vector((sg * xo, Y(s), zt - 3.0)), Vector((sg * xo, Y(s), zt - 3.0)), Vector((sg, 0, 0.4)), 1.0,
                  (1.0, 2.4, 0.35), 'amber')
        s -= 5.0
    s = 150.0
    while s > -220:
        xo, zb, zt = at(s)
        fixture(mb, Vector((sg * (xo - 1.6), Y(s), zb - 0.1)), Vector((0, 0, -1)), (0.9, 3.0, 0.3), 'window')
        s -= 6.0


# ------------------------------------------------------------------------------------------ engines / stern
def engine_bell(mb, p, r, L, seg=32):
    """Engine: armoured housing, deep flared bell, one flat aft-facing glow disc ('engine')."""
    d = Vector((0, 1, 0))                      # aft (glTF -Z)
    q = d.to_track_quat('Z', 'X').to_matrix()

    def ring(rr, z):
        return [p + q @ Vector((math.cos(a) * rr, math.sin(a) * rr, z)) for a in
                [i / seg * 2 * math.pi for i in range(seg)]]
    # housing sleeve reaching back into the hull
    mb.loft([ring(r * 1.18, -L * 0.8), ring(r * 1.18, L * 0.15), ring(r * 1.1, L * 0.25)], 'hull2', cap0=False,
            cap1=False)
    for k in range(3):
        z = -L * 0.6 + k * L * 0.25
        mb.loft([ring(r * 1.17, z), ring(r * 1.27, z + 0.6), ring(r * 1.27, z + 2.2), ring(r * 1.17, z + 2.8)],
                'trim', cap0=False, cap1=False)
    # bell: outer lip -> flared rim -> inner wall -> throat
    mb.loft([ring(r * 1.1, L * 0.25), ring(r * 1.14, L * 0.5), ring(r * 1.0, L * 0.52), ring(r * 0.82, L * 0.1),
             ring(r * 0.74, -L * 0.1)], 'greeble', cap0=False, cap1=False)
    # glow disc (single n-gon facing aft) + faint inner ring
    vs = [mb.bm.verts.new(v) for v in ring(r * 0.75, -L * 0.1 + 0.05)]
    f = mb.bm.faces.new(vs)
    f.material_index = mb._mi('engine')
    f.normal_update()
    if f.normal.dot(d) < 0:
        f.normal_flip()
    mb.cyl(p + d * (-L * 0.1 + 0.1), p + d * (L * 0.12), r * 0.16, r * 0.08, 'trim', seg=12)


def stern(mb, H, R):
    s0 = -291
    w, h, cz, _ = H.at(s0)
    ys = Y(s0)
    for sg in (1, -1):
        engine_bell(mb, Vector((sg * 36, ys + 3.5, 4)), 20.0, 24)
    # lit hangar slot between the engines: protruding frame, dark back, warm light panel and strips
    light_panel(mb, Vector((0, ys, 4)), Vector((0, 1, 0)), (22, 46, 1.2), 'amber', 'greeble', fwd=Vector((0, 0, 1)),
                lift=0.6, grid=(3, 7), depth=0.55)                         # lit back panel: grid of luminaires
    for x in (-13, 13):                                                     # protruding frame -> recessed slot
        mb.box((x, ys + 4.5, 4), (4, 9.0, 54), 'hull2')
    for z in (29, -21):
        mb.box((0, ys + 4.5, z), (30, 9.0, 4), 'hull2')
    for k in range(7):                                                      # cross beams / interior strips
        if k % 2:
            mb.box((0, ys + 1.5, -15 + k * 6.5), (22, 0.8, 0.7), 'trim')
        else:                                                               # segmented strip light on the beam
            light_bar(mb, Vector((0, ys + 1.1, -15 + k * 6.5)), Vector((0, 1, 0)), (0.7, 22, 0.8), 'window', 'greeble',
                      fwd=Vector((1, 0, 0)), lift=0.4, segs=9)
    # stern face plating + light rows
    for x0, x1, z0, z1 in ((-60, -16, 26, 42), (16, 60, 26, 42), (-60, -58, -24, 26), (58, 60, -24, 26)):
        blk(mb, s0 + 0.5, s0 - 1.5, x0, x1, z0, z1, 'plate')
    for z in (32, 37):
        light_row(mb, (-56, ys + 1.6, z), (-18, ys + 1.6, z), (0, 1, 0), 3.2, (0.6, 2.0, 0.3), 'window', R=R,
                  dropout=0.2)
        light_row(mb, (18, ys + 1.6, z), (56, ys + 1.6, z), (0, 1, 0), 3.2, (0.6, 2.0, 0.3), 'window', R=R,
                  dropout=0.2)
    for sg in (1, -1):
        beacon(mb, Vector((sg * 64, ys + 0.2, 40)), Vector((0, 1, 0)), 1.25, 'blue_light', LAMP_BODY, 'trim')


# ------------------------------------------------------------------------------------------ bow cannon
def bow_cannon(mb, H, R):
    sB = 309

    def YB(s):          # bow parts were laid out for a bow at s=316; shifted 7 m aft (length <= 640)
        return Y(s - 7.0)
    w, h, cz, _ = H.at(sB)
    zc = cz
    ax = Vector((0, -1, 0))
    # armoured cheek blocks flanking the barrel
    for sg in (1, -1):
        b = [(sg * 10, YB(280), zc - 17), (sg * 27, YB(280), zc - 17), (sg * 27, YB(280), zc + 19), (sg * 10, YB(280), zc + 19)]
        t = [(sg * 12, YB(328), zc - 11), (sg * 21, YB(328), zc - 11), (sg * 21, YB(328), zc + 12), (sg * 12, YB(328), zc + 12)]
        mb.loft([b, t], 'hull2', bevel=0.8)
        for z in (zc - 6, zc + 1, zc + 8):
            light_row(mb, (sg * 24.2, YB(290), z), (sg * 20.2, YB(322), z), (sg, -0.2, 0), 4.0, (0.6, 2.0, 0.3),
                      'window', R=R, dropout=0.2)
        beacon(mb, Vector((sg * 17, YB(327.5), zc + 11.95)), Vector((0, 0, 1)), 1.05, 'blue_light', LAMP_BODY, 'trim')
    # barrel body + armour collars
    mb.cyl((0, YB(290), zc), (0, YB(326), zc), 15.5, 13.5, 'hull', seg=32)
    for s, r in ((300, 17.0), (311, 16.2), (321, 15.4)):
        annulus(mb, (0, YB(s), zc), ax, 12.5, r, 4.0, 'trim', seg=32)
    # muzzle: thick ring-armoured mouth around a dark bore with faintly glowing inner ring + bore floor
    annulus(mb, (0, YB(330.5), zc), ax, 8.0, 14.0, 9.0, 'plate', seg=32)
    annulus(mb, (0, YB(335.8), zc), ax, 8.0, 15.0, 2.2, 'trim', seg=32)
    annulus(mb, (0, YB(331), zc), ax, 7.2, 8.05, 6.0, 'muzzle', seg=32)       # inner emissive bore ring
    mb.cyl((0, YB(326.2), zc), (0, YB(326.6), zc), 8.0, 8.0, 'muzzle', seg=32)  # bore floor glow
    mb.cyl((0, YB(326.6), zc), (0, YB(329.5), zc), 2.6, 1.6, 'greeble', seg=12)  # emitter spike
    for k in range(8):   # radial armour lugs on the mouth ring
        a = k / 8 * 2 * math.pi + math.pi / 8
        c = Vector((math.cos(a) * 15.5, YB(333), zc + math.sin(a) * 15.5))
        n = Vector((math.cos(a), 0, math.sin(a)))
        obox(mb, c, n, (3.0, 7.0, 2.2), 'hull2', lift=0.0)
    dk = min(H.at(245)[2] + H.at(245)[1] / 2, H.at(311)[2] + H.at(311)[1] / 2)
    blk(mb, 243, 311, -15, 15, dk - 1.5, dk + 5.5, 'hull2', ins=3.0, ins_s=5.0)      # armoured brow
    blk(mb, 255, 305, -9, 9, dk + 5.0, dk + 8.0, 'plate', ins=1.5, ins_s=3.0)
    for sg in (1, -1):
        light_row(mb, (sg * 13.2, YB(256), dk + 3.0), (sg * 13.2, YB(314), dk + 3.0), (sg, 0, 0.5), 3.5,
                  (0.6, 1.8, 0.3), 'amber')
    empty('main_cannon', (0, YB(337.2), zc), size=8)


# ------------------------------------------------------------------------------------------ flanks
def starboard_bay_wall(mb, R):
    """Starboard hangar-deck wall section: flat single skin at x=62 (hull loft) + <=2.6 m relief detail."""
    x = WALL_X
    s0, s1 = FLAT_S[0] + 2, FLAT_S[1] - 2
    z0, z1 = -30.3, 50.7
    ribs = [s0 + i * (s1 - s0) / 11 for i in range(12)]
    for s in ribs:                                        # vertical frames
        blk(mb, s - 1.1, s + 1.1, x - 0.4, x + 2.4, z0, z1, 'hull2', ins=0)
    for z in (z0 + 0.8, 0.0, 26.0, z1 - 0.8):             # horizontal deck bands
        mb.box((x + 0.9, Y((s0 + s1) / 2), z), (2.2, s1 - s0, 1.6), 'trim')
    for a, b in zip(ribs, ribs[1:]):                      # armour panels between frames
        for (za, zb) in ((z0 + 1.8, -1.0), (1.0, 25.0), (27.0, z1 - 1.8)):
            if R.random() < 0.15:
                continue
            blk(mb, a + 1.6, b - 1.6, x - 0.3, x + R.uniform(0.6, 1.4), za + 0.4, zb - 0.4,
                R.choice(['plate', 'hull', 'hull2']), ins=0)
    # hangar-deck window strips (three deck levels) between the frames
    for z in (-24.0, -12.0, 5.0, 15.0, 32.0, 43.0):
        for a, b in zip(ribs, ribs[1:]):
            if R.random() < 0.12:
                continue
            L = (b - a) - 5
            hz = 1.1 if z not in (5.0, 32.0) else 2.2
            window_bay(mb, Vector((x + 1.4, Y((a + b) / 2), z)), Vector((1, 0, 0)), (hz, L, 0.3), 'window', WIN_FRAME,
                       lift=0.15, rows=2 if hz > 2 else 1, border=0.2)
    # big closed hangar-door outline in the middle of the wall
    ds0, ds1, dz0, dz1 = 6.0, 78.0, -20.0, 22.0
    for s in (ds0, ds1):
        blk(mb, s - 1.4, s + 1.4, x - 0.3, x + 2.6, dz0, dz1, 'trim', ins=0)
    for z in (dz0, dz1):
        mb.box((x + 1.2, Y((ds0 + ds1) / 2), z), (2.6, ds1 - ds0 + 2.8, 2.6), 'trim')
    for k in range(9):                                    # amber door-edge marker lights
        s = lerp(ds0 + 3, ds1 - 3, k / 8)
        for z in (dz0 - 2.0, dz1 + 2.0):
            lamp_fixture(mb, Vector((x + 2.45, Y(s), z)), Vector((1, 0, 0)), (0.8, 1.6, 0.3), 'amber', LAMP_BODY,
                         lift=0.15)
    for s in (ds0 - 3.5, ds1 + 3.5):
        for z in (dz0 + 3, dz1 - 3):
            lamp_fixture(mb, Vector((x + 1.0, Y(s), z)), Vector((1, 0, 0)), (1.2, 1.2, 0.4), 'blue_light', LAMP_BODY,
                         lift=0.2)
    # hull number stencil blocks (just trim bars) above the door
    for k in range(5):
        mb.box((x + 1.6, Y(20 + k * 4.6), 38.5), (0.3, 3.2, 0.9), 'trim')


def port_launch_bay(mb, R):
    """Port (-X) mech launch bay: protruding armoured mouth with a dark back wall."""
    x = -WALL_X
    sa, sb, za, zb = 22.0, 92.0, -12.0, 26.0
    mb.box((x - 0.4, Y((sa + sb) / 2), (za + zb) / 2), (1.0, sb - sa, zb - za), 'greeble')   # dark back
    D = 9.0
    blk(mb, sa - 5, sa, x + 0.5, x - D, za - 5, zb + 5, 'hull2', ins=0)
    blk(mb, sb, sb + 5, x + 0.5, x - D, za - 5, zb + 5, 'hull2', ins=0)
    blk(mb, sa, sb, x + 0.5, x - D, zb, zb + 5, 'hull2', ins=0)
    blk(mb, sa, sb, x + 0.5, x - D - 3, za - 5, za, 'hull2', ins=0)      # launch deck lip
    # (no lit horizontal strips on the back wall: the bay is lit by the dock rig's lamps and the energy curtain)
    for k in range(12):                                                  # deck guide lights
        s = lerp(sa + 3, sb - 3, k / 11)
        chevron_light(mb, Vector((x - D - 1.5, Y(s), za + 0.1)), Vector((0, 0, 1)), (1.6, 1.2, 0.3), 'amber',
                      LAMP_BODY, fwd=Vector((-1, 0, 0)), lift=0.0)     # launch-direction chevrons
    for s in (sa - 2.5, sb + 2.5):
        lamp_fixture(mb, Vector((x - D + 0.05, Y(s), zb + 2.5)), Vector((-1, 0, 0)), (1.5, 1.5, 0.3), 'blue_light',
                     LAMP_BODY, lift=0.15)
    empty('hangar_exit', (x - D - 4, Y((sa + sb) / 2), (za + zb) / 2 - 4), rot=(0, 0, -90), size=6)


# ==========================================================================================================
# SYSTEMS: purpose-built machinery placed by the zoning plan (see blender/MOTHERSHIP_SYSTEMS.md)
# ==========================================================================================================
DEBUG_SITES = '--debug-sites' in sys.argv


class Surf:
    """Ray caster over the finished structure + armour; places components on the plate they are bolted to."""

    def __init__(self, mb, tol=2.0):
        from mathutils.bvhtree import BVHTree
        self.T = BVHTree.FromBMesh(mb.bm)
        self.tol = tol
        self.stats = {}

    def cast(self, o, d, dist=900.0):
        o, d = Vector(o), Vector(d).normalized()
        loc, n, _, _ = self.T.ray_cast(o, d, dist)
        if loc is None:
            return None
        n = n.normalized()
        if n.dot(d) > 0:
            n = -n
        return loc, n

    def top(self, x, s):
        return self.cast((x, Y(s), 400.0), (0, 0, -1))

    def under(self, x, s):
        return self.cast((x, Y(s), -400.0), (0, 0, 1))

    def flank(self, sg, s, z):
        return self.cast((sg * 400.0, Y(s), z), (-sg, 0, 0))

    def _fit(self, hits, t, up, tol, tag, face):
        """Accept a site if the sampled points lie on one surface: dominant normal shared by >= 5 of 9 samples and
        the height spread along it within `tol` (plate seams and chamfered plate edges are bridged by the plinth)."""
        st = self.stats.setdefault(tag, [0, 0])
        if any(h is None for h in hits):
            st[1] += 1
            if DEBUG_SITES:
                print('  reject %s: miss' % tag, [h is None for h in hits], flush=True)
            return None
        face = Vector(face).normalized()      # prefer the plate tops (facing the rays) over plate-edge chamfers
        n = max((h[1] for h in hits), key=lambda m: sum(g[1].dot(m) for g in hits) + 3.0 * m.dot(face))
        best = sum(1 for g in hits if g[1].dot(n) > 0.95)
        ds = [h[0].dot(n) for h in hits]
        top, low = max(ds), min(ds)
        if best < (3 if len(hits) and (hits[1][0] - hits[-1][0]).length > 7 else 2) or top - low > tol:
            st[1] += 1
            if DEBUG_SITES:
                print('  reject %s at %s agree=%d spread=%.2f' % (tag, tuple(round(c, 1) for c in hits[0][0]), best,
                                                                 top - low), flush=True)
                if top - low > 3:
                    for h in hits:
                        print('     ', tuple(round(c, 1) for c in h[0]), tuple(round(c, 2) for c in h[1]))
            return None
        st[0] += 1
        c = hits[0][0]
        o = c + n * (top - c.dot(n))
        F = LF(o, n, t, up)
        F.sink = top - low + 0.35
        return F

    def site_top(self, x, s, W, L, tag='top', tol=None):
        """Flat site on a dorsal surface: W across (x), L along (s)."""
        pts = [(0, 0)] + [(a * W / 2, b * L / 2) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a, b) != (0, 0)]
        hits = [self.top(x + a, s + b) for a, b in pts]
        return self._fit(hits, (0, -1, 0), (1, 0, 0), tol or self.tol, tag, (0, 0, 1))

    def site_under(self, x, s, W, L, tag='under', tol=None):
        pts = [(0, 0)] + [(a * W / 2, b * L / 2) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a, b) != (0, 0)]
        hits = [self.under(x + a, s + b) for a, b in pts]
        return self._fit(hits, (0, -1, 0), (1, 0, 0), tol or self.tol, tag, (0, 0, -1))

    def site_flank(self, sg, s, z, L, Hh, tag='flank', tol=None):
        """Site on a side surface: L along s, Hh along z."""
        pts = [(0, 0)] + [(a * L / 2, b * Hh / 2) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a, b) != (0, 0)]
        hits = [self.flank(sg, s + a, z + b) for a, b in pts]
        return self._fit(hits, (0, -1, 0), (0, 0, 1), tol or self.tol, tag, (sg, 0, 0))

    def site_hull(self, H, s, p, L, W, tag='hull', tol=None):
        """Site on hull edge p (index space) at station s: L along s, W across (world metres)."""
        e = int(math.floor(p))
        dp = W / 2 / max(1.0, H.edge_len(s, e))
        pts = [(0, 0)] + [(a * L / 2, b * dp) for a in (-1, 0, 1) for b in (-1, 0, 1) if (a, b) != (0, 0)]
        hits = []
        for a, b in pts:
            pos, n = H.pt(s + a, p + b, 0.0)
            hits.append(self.cast(pos + n * 60.0, -n))
        up = Vector((0, 0, 1)) if abs(H.pt(s, p)[1].z) < 0.7 else Vector((1, 0, 0))
        return self._fit(hits, (0, -1, 0), up, tol or self.tol, tag, H.pt(s, p)[1])

    def heightmap(self):
        """Debug: ASCII map of the dorsal surface (one row per 8 m station, one column per 4 m of x)."""
        print('HEIGHTMAP  s \\ x = 0..136 step 4  (char = (z-20)/4, "." = miss)')
        for s in range(308, -296, -8):
            row = ''
            for x in range(0, 140, 4):
                h = self.top(x + 0.1, s + 0.1)
                if h is None:
                    row += '.'
                else:
                    k = int((h[0].z - 20) / 4)
                    row += '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[max(0, min(35, k))]
            print('%5d %s' % (s, row))


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
        self.sink = 0.35

    def p(self, u, v, w=0.0):
        return self.o + self.b * u + self.t * v + self.n * w

    def box(self, mb, u, v, w, su, sv, sw, mat):
        """Box with its bottom at height w."""
        obox(mb, self.p(u, v, w + sw / 2), self.n, (su, sv, sw), mat, lift=0.0, fwd=self.t)

    def lamp(self, mb, u, v, w, su, sv, sw, mat):
        """Housed lamp fixture in place of an emissive box (same footprint, bottom at height w)."""
        lamp_fixture(mb, self.p(u, v, w + sw / 2), self.n, (su, sv, sw), mat, LAMP_BODY, fwd=self.t, lift=0.0)

    def cyl(self, mb, a, b, r0, r1=None, mat='trim', seg=8, caps=True):
        mb.cyl(self.p(*a), self.p(*b), r0, r0 if r1 is None else r1, mat, seg=seg, caps=caps)

    def plinth(self, mb, W, L, h, mat='hull', u=0.0, v=0.0):
        self.box(mb, u, v, -self.sink, W, L, h + self.sink, mat)


# ---------------------------------------------------------------------------------------------- components
def pd_turret(mb, F, u, v, w, sz=2.6, yaw=0.0):
    """Point-defence mount: low drum, boxy twin-gun housing, two barrels (yaw 0 = toward the bow)."""
    F.cyl(mb, (u, v, w), (u, v, w + 0.4 * sz), 0.62 * sz, 0.55 * sz, 'trim', seg=8)
    d = F.t * math.cos(yaw) + F.b * math.sin(yaw)
    sd = F.n.cross(d)
    c = F.p(u, v, w + 0.4 * sz + 0.25 * sz)
    obox(mb, c, F.n, (0.8 * sz, 0.95 * sz, 0.5 * sz), 'hull2', lift=0.0, fwd=d)
    for k in (-1, 1):
        a = c + sd * (k * 0.2 * sz) + d * (0.35 * sz)
        mb.cyl(a, a + d * (1.2 * sz), 0.085 * sz, 0.07 * sz, 'greeble', seg=6)


def pd_battery(mb, F, n=3, pitch=5.0, sz=2.4, yaw=0.0):
    """Row of PD mounts on a common armoured plinth with magazine hatch and end marker lights."""
    L = n * pitch
    F.plinth(mb, 1.7 * sz, L, 0.5, 'hull')
    for k in range(n):
        pd_turret(mb, F, 0.0, (k - (n - 1) / 2) * pitch, 0.5, sz, yaw)
    for e in (-1, 1):
        F.lamp(mb, 0.0, e * (L / 2 - 0.4), 0.5, 1.0, 0.5, 0.25, 'amber')


def sensor_array(mb, F, W, L, nu, nv, lit=True):
    """Phased-array panel: raised trim frame carrying a regular grid of emitter tiles + status strip."""
    F.plinth(mb, W, L, 0.45, 'trim')
    cu, cv = W / nu, L / nv
    for i in range(nu):
        for j in range(nv):
            F.box(mb, -W / 2 + cu * (i + 0.5), -L / 2 + cv * (j + 0.5), 0.45, cu - 0.35, cv - 0.35, 0.3, 'plate')
    if lit:
        for e in (-1, 1):
            F.lamp(mb, e * (W / 2 - 0.5), L / 2 - 0.5, 0.45, 0.6, 0.6, 0.35, 'blue_light')


def radiator_bank(mb, F, W, L, pitch=1.6, fh=2.2):
    """Heat-rejection bank: fins across the hull between two header pipes, manifold boxes at both ends."""
    F.plinth(mb, W, L, 0.35, 'greeble')
    n = max(2, int((L - 2.6) / pitch))
    for k in range(n + 1):
        v = -(L - 2.6) / 2 + k * (L - 2.6) / n
        F.box(mb, 0.0, v, 0.35, W - 2.2, 0.3, fh, 'trim' if k % 4 == 0 else 'greeble')
    for e in (-1, 1):
        F.cyl(mb, (e * (W / 2 - 0.6), -L / 2 + 1.3, 0.9), (e * (W / 2 - 0.6), L / 2 - 1.3, 0.9), 0.45, mat='trim',
              seg=6, caps=False)
        F.box(mb, 0.0, e * (L / 2 - 0.6), 0.35, W, 1.2, 1.5, 'hull2')


def rcs_quad(mb, F, u, v, sz=3.2):
    """Reaction-control quad: armoured block with four flared nozzles (fore, aft, both sides) + marker."""
    F.box(mb, u, v, -F.sink, sz, sz, 0.8 * sz + F.sink, 'hull2')
    w = 0.45 * sz
    for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        a = (u + du * sz / 2, v + dv * sz / 2, w)
        b = (u + du * (sz / 2 + 0.55 * sz), v + dv * (sz / 2 + 0.55 * sz), w)
        F.cyl(mb, a, b, 0.14 * sz, 0.3 * sz, 'greeble', seg=6)
    F.lamp(mb, u, v, 0.8 * sz, 0.5, 0.5, 0.3, 'amber')


def hatch(mb, F, W, L, u=0.0, v=0.0, light=True):
    """Access hatch: trim frame, recessed-looking door panel, hinge bar, one marker light."""
    F.box(mb, u, v, -F.sink, W, L, 0.2 + F.sink, 'hull2')
    for e in (-1, 1):
        F.box(mb, u + e * (W / 2 - 0.2), v, 0.2, 0.4, L, 0.3, 'trim')
        F.box(mb, u, v + e * (L / 2 - 0.2), 0.2, W - 0.8, 0.4, 0.3, 'trim')
    F.box(mb, u, v - L / 2 + 0.9, 0.2, W - 1.4, 0.5, 0.45, 'greeble')      # hinge bar
    if light:
        F.lamp(mb, u + W / 2 - 0.6, v + L / 2 - 0.6, 0.5, 0.4, 0.4, 0.25, 'amber')


def cargo_hatch(mb, F, W, L):
    """Hangar lift / cargo hatch: heavy frame, two door leaves with stiffener ribs, hinge blocks, corner lights."""
    F.plinth(mb, W + 1.6, L + 1.6, 0.3, 'hull')
    for e in (-1, 1):
        F.box(mb, e * (W / 2 + 0.4), 0.0, 0.3, 0.8, L + 1.6, 0.7, 'trim')
        F.box(mb, 0.0, e * (L / 2 + 0.4), 0.3, W, 0.8, 0.7, 'trim')
    for e in (-1, 1):                                       # leaves split along the centreline
        F.box(mb, e * W / 4, 0.0, 0.3, W / 2 - 0.3, L, 0.35, 'hull2')
        for k in range(3):
            F.box(mb, e * W / 4, (k - 1) * L / 3.2, 0.65, W / 2 - 1.4, 0.6, 0.25, 'plate')
        for k in range(3):
            F.box(mb, e * (W / 2 + 1.1), (k - 1) * L / 3, 0.0, 0.8, 1.6, 0.9, 'greeble')
    for a in (-1, 1):
        for b in (-1, 1):
            F.lamp(mb, a * (W / 2 + 0.4), b * (L / 2 + 0.4), 1.0, 0.5, 0.5, 0.25, 'amber')


def docking_port(mb, F, r=4.0):
    """Docking collar: square armoured base, trim collar ring, closed iris door, clamp lugs, approach lights."""
    F.plinth(mb, 2.4 * r, 2.4 * r, 0.6, 'hull2')
    annulus(mb, F.p(0, 0, 1.3), F.n, r, r + 1.0, 1.4, 'trim', seg=16)
    F.cyl(mb, (0, 0, 0.6), (0, 0, 1.2), r, r, 'plate', seg=16)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        F.box(mb, math.cos(a) * (r + 1.4), math.sin(a) * (r + 1.4), 0.6, 1.2, 1.2, 1.4, 'greeble')
    for a in (-1, 1):
        for b in (-1, 1):
            F.lamp(mb, a * 1.1 * r, b * 1.1 * r, 0.6, 0.6, 0.6, 0.25, 'amber')


def vls_block(mb, F, nu, nv, cell=2.2):
    """Vertical-launch missile cells: armoured frame over the magazine, a regular grid of cell hatches."""
    W, L = nu * cell + 1.0, nv * cell + 1.0
    F.plinth(mb, W, L, 0.8, 'hull2')
    for i in range(nu):
        for j in range(nv):
            F.box(mb, -W / 2 + 0.5 + cell * (i + 0.5), -L / 2 + 0.5 + cell * (j + 0.5), 0.8, cell - 0.45,
                  cell - 0.45, 0.2, 'plate' if (i + j) % 2 else 'greeble')
    F.lamp(mb, W / 2 - 0.5, L / 2 - 0.5, 0.8, 0.5, 0.5, 0.3, 'amber')
    F.lamp(mb, -W / 2 + 0.5, -L / 2 + 0.5, 0.8, 0.5, 0.5, 0.3, 'amber')


def capacitor_bank(mb, F, nu, nv, pitch=2.8, r=1.0, h=2.4, feed=0.0):
    """Cannon capacitor rack: cans in a grid on a base, bus bars along each row, optional feed toward -u."""
    W, L = nu * pitch + 0.8, nv * pitch + 0.8
    F.plinth(mb, W, L, 0.4, 'hull')
    for i in range(nu):
        u = -W / 2 + 0.4 + pitch * (i + 0.5)
        for j in range(nv):
            v = -L / 2 + 0.4 + pitch * (j + 0.5)
            F.cyl(mb, (u, v, 0.4), (u, v, 0.4 + h), r, r, 'trim', seg=8)
            F.cyl(mb, (u, v, 0.4 + h), (u, v, 0.7 + h), r * 0.6, r * 0.6, 'greeble', seg=6)
        F.box(mb, u, 0.0, 0.7 + h, 0.5, L - 1.0, 0.35, 'hull2')         # bus bar
    if feed > 0:
        F.box(mb, -W / 2 - feed / 2, 0.0, 0.4, feed, 1.6, 1.0, 'greeble')


def shield_emitter(mb, F, r=2.0):
    """Field-emitter node: pedestal, trim collar, low dome with a glowing emitter tip."""
    F.cyl(mb, (0, 0, -F.sink), (0, 0, 0.9), r * 1.35, r * 1.15, 'hull2', seg=8)
    F.cyl(mb, (0, 0, 0.9), (0, 0, 1.3), r * 1.15, r * 1.1, 'trim', seg=10)
    F.cyl(mb, (0, 0, 1.3), (0, 0, 1.3 + r * 0.7), r, r * 0.45, 'plate', seg=10)
    mb.sphere(F.p(0, 0, 1.3 + r * 0.75), r * 0.3, 'blue_light', seg=6, rings=3)


def vent_louvre(mb, F, W, L, pitch=1.0):
    """Exhaust / heat louvre grille: trim frame with slats across (u)."""
    F.plinth(mb, W, L, 0.25, 'trim')
    n = max(2, int((L - 1.0) / pitch))
    for k in range(n + 1):
        F.box(mb, 0.0, -(L - 1.0) / 2 + k * (L - 1.0) / n, 0.25, W - 0.8, 0.28, 0.55, 'greeble')


def manifold(mb, F, W, L, h=2.4, nstub=3):
    """Coolant manifold / pump block with a row of valve stubs on top."""
    F.plinth(mb, W, L, h, 'hull2')
    F.box(mb, 0.0, 0.0, h, W - 1.0, L - 1.0, 0.3, 'greeble')
    for k in range(nstub):
        u = (k - (nstub - 1) / 2) * (W - 1.6) / max(1, nstub - 1)
        F.cyl(mb, (u, 0, h + 0.3), (u, 0, h + 1.3), 0.45, 0.45, 'trim', seg=6)
        F.cyl(mb, (u, 0, h + 1.3), (u, 0, h + 1.6), 0.75, 0.75, 'greeble', seg=6)


def sensor_dome(mb, F, r):
    """Sensor blister: armoured ring base and a low dark dome."""
    F.cyl(mb, (0, 0, -F.sink), (0, 0, 0.6), r * 1.2, r * 1.15, 'trim', seg=12)
    F.cyl(mb, (0, 0, 0.6), (0, 0, 0.6 + r * 0.45), r, r * 0.55, 'glass', seg=12)
    F.lamp(mb, r * 0.9, 0.0, 0.6, 0.5, 0.5, 0.3, 'amber')


# ------------------------------------------------------------------------------------------ linear runs
def run_pts(fn, s0, s1, step=FRAME):
    """Samples (pos, n) of a path function fn(s) from s0 to s1 (both ends included)."""
    k = max(1, int(round(abs(s1 - s0) / step)))
    out = []
    for i in range(k + 1):
        r = fn(lerp(s0, s1, i / k))
        if r is None:
            return out
        out.append((Vector(r[0]), Vector(r[1]).normalized()))
    return out


def conduit(mb, pts, npipes=3, r=0.5, gap=1.25, clamp=True, mat='trim'):
    """Pipe bundle along sampled surface points; clamp strap at every sample (6 m frames)."""
    if len(pts) < 2:
        return
    for (p0, n0), (p1, n1) in zip(pts, pts[1:]):
        d = (p1 - p0)
        if d.length < 1e-3:
            continue
        d.normalize()
        for i in range(npipes):
            o = (i - (npipes - 1) / 2) * gap
            s0, s1 = n0.cross(d).normalized(), n1.cross(d).normalized()
            mb.cyl(p0 + s0 * o + n0 * (r + 0.15), p1 + s1 * o + n1 * (r + 0.15), r, r, mat, seg=6, caps=False)
    if clamp:
        for k, (p, n) in enumerate(pts):
            d = (pts[min(k + 1, len(pts) - 1)][0] - pts[max(k - 1, 0)][0]).normalized()
            obox(mb, p + n * (r + 0.15) - n * 0.4, n, (npipes * gap + 0.5, 0.7, 2 * r + 0.9), 'greeble',
                 lift=0.0, fwd=d)


def walkway(mb, pts, out, width=1.8, rail=1.2):
    """Maintenance catwalk: deck strip, posts every frame and a hand rail on the `out` side (+1/-1 across)."""
    if len(pts) < 2:
        return
    for (p0, n0), (p1, n1) in zip(pts, pts[1:]):
        d = p1 - p0
        L = d.length
        if L < 1e-3:
            continue
        d.normalize()
        n = (n0 + n1).normalized()
        c = (p0 + p1) / 2
        side = n.cross(d).normalized() * out
        obox(mb, c + n * 0.25, n, (width, L + 0.05, 0.3), 'trim', lift=0.0, fwd=d)
        obox(mb, c + side * (width / 2 - 0.1) + n * (0.4 + rail), n, (0.15, L, 0.15), 'trim', lift=0.0, fwd=d)
    for p, n in pts:
        d = Vector((0, -1, 0))
        side = n.cross(d).normalized() * out
        obox(mb, p + side * (width / 2 - 0.1) + n * (0.4 + rail / 2), n, (0.15, 0.15, rail), 'trim', lift=0.0)


def window_band(mb, S, H, side, s0, s1, p, R, dropout=0.15):
    """Crew-deck window band on a wall: 3 windows per 24 m bay on the 6 m frame pitch (the bulkhead slot stays
    blank), each in a dark frame, placed on whatever armour plate is there (skipped where it would sit in a seam)."""
    e = 0 if side == 1 else 4
    pp = e + (p if side == 1 else 1 - p)
    g = grid(s0, s1)
    for a, b in zip(g, g[1:]):
        if b - a < 10:
            continue
        k = int(round((b - a) / FRAME))
        for i in range(1, k):
            s = a + i * (b - a) / k
            ln = (b - a) / k - 1.4
            hs = []
            for ds in (-ln / 2, 0.0, ln / 2):
                pos, n = H.pt(s + ds, pp, 0.0)
                hs.append(S.cast(pos + n * 30.0, -n, 60.0))
            if any(h is None for h in hs) or max(h[0].dot(hs[1][1]) for h in hs) - \
                    min(h[0].dot(hs[1][1]) for h in hs) > 0.25:
                continue
            c, n = hs[1]
            lit = R.random() >= dropout
            window_bay(mb, c, n, (2.0, ln + 0.6, 0.3), 'window', WIN_FRAME, lift=0.0, lit=lit, border=0.5)


def cast_rows(mb, S, R):
    """Place the deferred light rows on top of the armour (ray cast along -n onto whatever plate is there)."""
    for p0, p1, n, pitch, size, mat, dropout in DEFER:
        d = p1 - p0
        L = d.length
        f = d / L if L > 1e-3 else Vector((0, -1, 0))
        k = max(0, int(L / pitch)) if L > 1e-3 else 0
        for i in range(k + 1):
            if dropout and R.random() < dropout:
                continue
            p = p0 + f * (L * i / k) if k else p0
            h = S.cast(p + n * 12.0, -n, 30.0)
            if h is None or abs((h[0] - p).dot(n)) > 4.0 or h[1].dot(n) < 0.6:
                continue
            fixture(mb, h[0], h[1], size, mat, fwd=f)


def ray_path(S, o_fn, d):
    """Path function s -> (point, normal) riding on the outermost armour near station s (3 rays, +-1.3 m)."""
    d = Vector(d).normalized()

    def fn(s):
        best = None
        for ds in (-1.3, 0.0, 1.3):
            h = S.cast(o_fn(s + ds), d)
            if h and (best is None or h[0].dot(-d) > best[0].dot(-d)):
                best = h
        if best is None:
            return None
        pnt = best[0].copy()
        pnt.y = Y(s)
        return pnt, (best[1] if best[1].dot(-d) > 0.8 else -d)
    return fn


def top_path(S, x):
    return ray_path(S, lambda s: Vector((x, Y(s), 300.0)), (0, 0, -1))


def under_path(S, x):
    return ray_path(S, lambda s: Vector((x, Y(s), -300.0)), (0, 0, 1))


def wall_path(S, H, side, p):
    return ray_path(S, lambda s: H.pt(s, p, 0.0)[0] + Vector((side * 30.0, 0, 0)), (-side, 0, 0))


def channel_path(H, p):
    """Open conduit channel in the deck armour: pipes lie on the hull skin itself."""
    return lambda s: H.pt(s, p, 0.0)


def up_p(side):          # upper chamfer / low chamfer parameters per side
    return {'cham': 1.5 if side == 1 else 3.5, 'low': 7.5 if side == 1 else 5.5}


def wall_p(side, p):
    return (0 + p) if side == 1 else (4 + 1 - p)


def pair(fn):
    """fn(sg) -> site or None, evaluated for both flanks; the pair is kept only if both sides fit (symmetry)."""
    Fs = [(sg, fn(sg)) for sg in (1, -1)]
    return Fs if all(F for _, F in Fs) else []


def heavy_turret(mb, S, x, s, size=6.5, yaw=0.0):
    for sg, F in pair(lambda sg: S.site_top(sg * x, s, size * 1.4, size * 1.4, 'heavy_turret')):
        F.cyl(mb, (0, 0, -F.sink), (0, 0, 0.3), size * 0.9, size * 0.85, 'hull2', seg=12)
        turret(mb, F.p(0, 0, size * 0.25), F.n, size, 'trim', 'hull2', 'greeble', barrels=3, blen=2.4, yaw=sg * yaw)


# ------------------------------------------------------------------------------------------ zone A: main gun
def zone_bow(mb, H, R, S):
    # cannon capacitor racks beside the brow, bus-fed straight into the breech
    for s in (252.0, 264.0, 276.0):
        for sg, F in pair(lambda sg: S.site_top(sg * 19.2, s, 6.4, 9.2, 'capacitor')):
            capacitor_bank(mb, F, 2, 3)
            F.box(mb, (-sg if F.b.x > 0 else sg) * 4.0, 0.0, 0.4, 1.8, 2.0, 1.2, 'greeble')
    # fire-control phased arrays on the forward walls (field of view along the barrel line)
    for s in (251.0, 265.0):
        cz = H.at(s)[2]
        for sg, F in pair(lambda sg: S.site_flank(sg, s, cz + 4.0, 12.0, 16.0, 'fc_array')):
            sensor_array(mb, F, 16.0, 12.0, 4, 3)
    # breech coolant louvres just aft of the arrays
    cz = H.at(238)[2]
    for sg, F in pair(lambda sg: S.site_flank(sg, 238.0, cz + 4.0, 8.0, 18.0, 'breech_vent')):
        G = LF(F.o, F.n, (0, 0, 1))
        G.sink = F.sink
        vent_louvre(mb, G, 8.0, 18.0, 1.0)
    # PD pairs under the barrel line (low chamfers); RCS quads at the four bow corners
    for s in (252.0, 268.0):
        for sg, F in pair(lambda sg: S.site_hull(H, s, up_p(sg)['low'], 10.0, 4.0, 'pd_low')):
            pd_battery(mb, F, 2, 5.0, 2.4)
    for s, key in ((284.0, 'low'), (268.0, 'cham')):
        for sg, F in pair(lambda sg: S.site_hull(H, s, up_p(sg)[key], 4.0, 4.0, 'rcs')):
            rcs_quad(mb, F, 0.0, 0.0, 3.2)
    # targeting blister on the brow
    F = S.site_top(0.0, 298.0, 4.0, 4.0, 'fc_dome')
    if F:
        sensor_dome(mb, F, 2.4)


# ------------------------------------------------------------------------------------------ zone B: forward battery
def zone_forward(mb, H, R, S):
    heavy_turret(mb, S, 22.5, 210.0)
    heavy_turret(mb, S, 27.0, 156.0)
    # VLS missile cells over the forward magazines
    for s, x, nu, nv in ((190.0, 30.0, 4, 6), (228.0, 22.0, 4, 5), (172.0, 25.0, 3, 5)):
        for sg, F in pair(lambda sg: S.site_top(sg * x, s, nu * 2.2 + 1.0, nv * 2.2 + 1.0, 'vls')):
            vls_block(mb, F, nu, nv)
    # PD batteries in threes on the upper chamfer, one per bulkhead bay
    for s in (184.0, 208.0, 232.0):
        for sg, F in pair(lambda sg: S.site_hull(H, s, up_p(sg)['cham'], 15.0, 4.0, 'pd_cham')):
            pd_battery(mb, F, 3, 5.0, 2.3)
    # ventral PD pairs on the low chamfers
    for s in (196.0, 148.0):
        for sg, F in pair(lambda sg: S.site_hull(H, s, up_p(sg)['low'], 10.0, 4.0, 'pd_low')):
            pd_battery(mb, F, 2, 5.0, 2.4)
    # long-range sensors on the forward spine roof: flush array + two low blisters (no masts)
    F = S.site_top(0.0, 204.0, 6.0, 20.0, 'spine_array')
    if F:
        sensor_array(mb, F, 6.0, 20.0, 2, 6)
    for s in (224.0, 184.0):
        F = S.site_top(0.0, s, 4.0, 4.0, 'spine_dome')
        if F:
            sensor_dome(mb, F, 2.2)


# ------------------------------------------------------------------------------------------ zone C: hangars / midship
def zone_midship(mb, H, R, S):
    # hangar-lift / cargo hatches on the strake roof over the hangars (alternating bays)
    for s in (112.0, 64.0, 16.0, -32.0):
        for sg, F in pair(lambda sg: S.site_top(sg * 51.0, s, 12.0, 16.0, 'lift_hatch')):
            cargo_hatch(mb, F, 10.0, 14.0)
    # PD pairs on the strake edge in the bays between the hatches
    for s in (88.0, 40.0, -8.0):
        xo = strake_at(s)[0]
        for sg, F in pair(lambda sg: S.site_top(sg * (xo - 13.0), s, 4.5, 10.0, 'pd_strake')):
            pd_battery(mb, F, 2, 5.0, 2.4, yaw=sg * 0.6)
    # hangar atmosphere / exhaust vent banks beside the PD pairs (the hangar deck is directly below)
    for s in (88.0, 40.0, -8.0):
        for sg, F in pair(lambda sg: S.site_top(sg * 51.0, s, 8.0, 12.0, 'hangar_vent')):
            vent_louvre(mb, F, 8.0, 12.0, 1.0)
    for sg in (1, -1):
        # power trunk (reactor -> cannon) in the open deck channel at the spine foot
        cp = CHANNEL_P[0] if sg == 1 else CHANNEL_P[1]
        conduit(mb, run_pts(channel_path(H, cp), -17.0, 173.0), 3, 0.55, 1.3)
        # maintenance walkway + coolant trunk along the strake's inner edge
        walkway(mb, run_pts(top_path(S, sg * 39.6), -100.0, 164.0), -sg)
        conduit(mb, run_pts(top_path(S, sg * 42.8), -102.0, 162.0), 2, 0.5, 1.3)
    for s in (-17.5, 175.0):                      # trunk junction boxes
        for sg, F in pair(lambda sg: S.site_top(H.pt(s, CHANNEL_P[0] if sg == 1 else CHANNEL_P[1])[0].x, s, 5.0, 4.0,
                                                'junction')):
            manifold(mb, F, 5.0, 4.0, 2.0, 3)
    # comms: flush phased-array panels and low blisters on the midship spine roof (no masts / dishes)
    for s in (68.0, 24.0):
        F = S.site_top(0.0, s, 8.0, 20.0, 'spine_array')
        if F:
            sensor_array(mb, F, 8.0, 20.0, 3, 6)
    for s in (48.0, 0.0):
        F = S.site_top(0.0, s, 5.0, 5.0, 'spine_dome')
        if F:
            sensor_dome(mb, F, 2.6)
    # spine roof access hatches
    for s in (112.0, 100.0):
        F = S.site_top(0.0, s, 3.0, 4.0, 'spine_hatch')
        if F:
            hatch(mb, F, 3.0, 4.0)


# ------------------------------------------------------------------------------------------ zone D: command
def zone_command(mb, H, R, S):
    # command roof behind the canopy: flush comms array + two sensor blisters (no masts / dishes)
    F = S.site_top(0.0, -116.0, 14.0, 6.0, 'cmd_array')
    if F:
        sensor_array(mb, F, 14.0, 6.0, 5, 2)
    for x, s in ((14.0, -114.0), (-14.0, -114.0)):
        F = S.site_top(x, s, 4.0, 4.0, 'cmd_dome')
        if F:
            sensor_dome(mb, F, 1.8)
    # secondary (flank) sensor arrays + PD + hatch on the strake roof beside the command block
    for s in (-56.0, -104.0):
        for sg, F in pair(lambda sg: S.site_top(sg * 58.0, s, 12.0, 16.0, 'flank_array')):
            sensor_array(mb, F, 12.0, 16.0, 3, 4)
    xo = strake_at(-80.0)[0]
    for sg, F in pair(lambda sg: S.site_top(sg * (xo - 14.0), -80.0, 4.5, 10.0, 'pd_strake')):
        pd_battery(mb, F, 2, 5.0, 2.4, yaw=sg * 0.8)
    for sg, F in pair(lambda sg: S.site_top(sg * 55.0, -80.0, 6.0, 8.0, 'strake_hatch')):
        hatch(mb, F, 6.0, 8.0)


# ------------------------------------------------------------------------------------------ zone E: engineering
def zone_engineering(mb, H, R, S):
    rows = (-152.0, -176.0, -200.0, -224.0, -248.0)
    # reactor-deck radiator field (two columns beside the reactor spine) + manifolds between the rows
    for s in rows:
        for x in (35.0, 48.0):
            for sg, F in pair(lambda sg: S.site_top(sg * x, s, 11.0, 20.0, 'radiator_deck')):
                radiator_bank(mb, F, 11.0, 20.0)
    for s in rows[:-1]:
        for x in (35.0, 48.0):
            for sg, F in pair(lambda sg: S.site_top(sg * x, s - 12.0, 6.0, 3.0, 'manifold')):
                manifold(mb, F, 6.0, 3.0, 1.8, 3)
    for sg in (1, -1):              # coolant trunk in the open channel beside the reactor spine
        cp = CHANNEL_P[0] if sg == 1 else CHANNEL_P[1]
        conduit(mb, run_pts(channel_path(H, cp), -141.0, -261.0), 2, 0.6, 1.4)
    # engine-room exhaust louvres on the stern deck
    for x in (35.0, 48.0):
        for sg, F in pair(lambda sg: S.site_top(sg * x, -272.0, 11.0, 14.0, 'engine_vent')):
            vent_louvre(mb, F, 11.0, 14.0, 1.0)
    # strake roof (outboard, over the sponsons): radiator columns + aft heavy turret
    for s in (-164.0, -188.0, -212.0):
        for x in (80.0, 95.0):
            for sg, F in pair(lambda sg: S.site_top(sg * x, s, 12.0, 20.0, 'radiator_strake')):
                radiator_bank(mb, F, 12.0, 20.0)
    heavy_turret(mb, S, 96.0, -138.0, 6.0, yaw=0.5)
    # sponson tops aft of the strake: radiator field on the sloped shoulder
    for s in (-240.0, -262.0):
        for x in (77.5, 89.0, 100.5, 112.0):
            for sg, F in pair(lambda sg: S.site_top(sg * x, s, 10.0, 18.0, 'radiator_sponson')):
                radiator_bank(mb, F, 10.0, 18.0)
    # RCS quads: sponson tips (fore + aft corner) and stern deck corners
    for x, s in ((125.0, -206.0), (125.0, -268.0), (52.0, -286.0)):
        for sg, F in pair(lambda sg: S.site_top(sg * x, s, 4.0, 4.0, 'rcs')):
            rcs_quad(mb, F, 0.0, 0.0, 3.2)


# ------------------------------------------------------------------------------------------ flanks & keel
def zone_flanks(mb, H, R, S):
    for sg in (1, -1):
        s_fwd0 = 128.0 if sg == 1 else 104.0
        # crew-deck window bands (three decks) on the forward walls; the docking-port bay stays clear mid-deck
        for p in (0.2, 0.47, 0.82):
            window_band(mb, S, H, sg, 148.0 if p == 0.47 else s_fwd0, 236.0, p, R)
        if sg == -1:
            for p in (0.2, 0.82):
                window_band(mb, S, H, sg, -44.0, 4.0, p, R)
        # pipe bundle along the top of each wall, under the chamfer
        pp = wall_p(sg, 0.93)
        conduit(mb, run_pts(wall_path(S, H, sg, pp), s_fwd0 + 2.0, 290.0), 2, 0.45, 1.1)
        if sg == -1:
            conduit(mb, run_pts(wall_path(S, H, sg, pp), -42.0, 2.0), 2, 0.45, 1.1)
        # forward deck-edge walkway
        walkway(mb, run_pts(ray_path(S, lambda s: Vector((sg * (H.at(s)[0] / 2 * U_TOP - 3.4), Y(s), 300.0)),
                                     (0, 0, -1)), 178.0, 244.0), sg)
    # airlock hatches in the upper belt on every other bulkhead (crew EVA access to the chamfer walkways)
    for s in (160.0, 208.0):
        w, h, cz, _ = H.at(s)
        z = cz + (V_LO + (V_HI - V_LO) * 0.7) * h / 2
        for sg, F in pair(lambda sg: S.site_flank(sg, s, z, 4.0, 5.0, 'airlock')):
            G = LF(F.o, F.n, (0, 0, 1))
            G.sink = F.sink
            hatch(mb, G, 3.2, 4.2)
    # docking ports on the citadel belt (starboard fwd; port fwd + aft of the launch bay)
    for sg, s in ((1, 136.0), (-1, 136.0), (-1, -32.0)):
        w, h, cz, _ = H.at(s)
        z = cz + (V_LO + (V_HI - V_LO) * 0.49) * h / 2
        F = S.site_flank(sg, s, z, 10.0, 10.0, 'docking_port')
        if F:
            docking_port(mb, F, 4.0)


def zone_keel(mb, H, R, S):
    # cargo transfer hatches and ventral docking ports under the hangars
    for s in (100.0, 52.0, 4.0):
        for sg, F in pair(lambda sg: S.site_under(sg * 22.0, s, 18.0, 22.0, 'keel_cargo')):
            cargo_hatch(mb, F, 16.0, 20.0)
    for s in (76.0, 28.0):
        for sg, F in pair(lambda sg: S.site_under(sg * 22.0, s, 10.0, 10.0, 'keel_dock')):
            docking_port(mb, F, 4.0)
    # forward ventral sensor blisters
    for s in (212.0, 248.0):
        for sg, F in pair(lambda sg: S.site_under(sg * 16.0, s, 9.0, 9.0, 'keel_sensor')):
            sensor_dome(mb, F, 3.6)
    # engineering keel: reactor maintenance hatches + coolant dump louvres
    for s in (-152.0, -176.0, -200.0, -224.0, -248.0):
        for sg, F in pair(lambda sg: S.site_under(sg * 22.0, s, 7.0, 9.0, 'keel_hatch')):
            hatch(mb, F, 7.0, 9.0)
        for sg, F in pair(lambda sg: S.site_under(sg * 34.0, s, 7.0, 12.0, 'keel_vent')):
            vent_louvre(mb, F, 7.0, 12.0, 1.0)
    for sg in (1, -1):              # keel conduits beside the keel spine
        conduit(mb, run_pts(under_path(S, sg * 9.6), -272.0, 282.0), 2, 0.5, 1.2)
    # ventral PD on the low chamfers amidships / aft
    for s in (100.0, 4.0, -92.0):
        for sg, F in pair(lambda sg: S.site_hull(H, s, up_p(sg)['low'], 10.0, 4.0, 'pd_low')):
            pd_battery(mb, F, 2, 5.0, 2.4)


def zone_edges(mb, H, R, S):
    """Shield emitter nodes on every bulkhead line along the strake's outer edge; deferred marker light rows."""
    for s in [148.0 - 24.0 * k for k in range(16)]:
        xo = strake_at(s)[0]
        for sg, F in pair(lambda sg: S.site_top(sg * (xo - 8.5), s, 5.5, 5.5, 'emitter')):
            shield_emitter(mb, F, 2.0)
    cast_rows(mb, S, R)


def systems(mb, H, R, S):
    zone_bow(mb, H, R, S)
    zone_forward(mb, H, R, S)
    zone_midship(mb, H, R, S)
    zone_command(mb, H, R, S)
    zone_engineering(mb, H, R, S)
    zone_flanks(mb, H, R, S)
    zone_keel(mb, H, R, S)
    zone_edges(mb, H, R, S)


# ------------------------------------------------------------------------------------------ build
def mothership(probe=False):
    palette()
    R = rng(909)
    H = Hull(STATIONS, PROF)
    mb = MB()
    # structure + armour
    main_hull(mb, H, R)
    deck(mb, H, R)
    spine_and_bridge(mb, H, R)
    for sg in (1, -1):
        sponson(mb, R, sg)
        strake(mb, R, sg)
    stern(mb, H, R)
    bow_cannon(mb, H, R)
    starboard_bay_wall(mb, R)
    port_launch_bay(mb, R)
    empty('wound', (WALL_X, Y(40.0), 10.0), size=6)
    # functional systems, placed on the finished armour by ray casting (zoning plan: MOTHERSHIP_SYSTEMS.md)
    mouth0 = mouth_faces(mb)
    S = Surf(mb)
    if probe:
        S.heightmap()
        for s in (112.0, 64.0, -32.0):
            for sg in (1, -1):
                row = []
                for x in range(40, 66, 2):
                    h = S.top(sg * x, s)
                    row.append('%.1f' % h[0].z if h else '-')
                print('PROBE s=%g sg=%d' % (s, sg), ' '.join(row))
    systems(mb, H, R, S)
    print('SITES placed/rejected:', S.stats, flush=True)
    print('LAUNCH BAY MOUTH: faces before systems = %d, after = %d (must be equal)' % (mouth0, mouth_faces(mb)),
          flush=True)
    obj = mb.to_object('mothership', smooth_angle=26)
    fix_engine_normals(obj)
    return [obj]


def mouth_faces(mb):
    """Faces touching the port launch bay mouth box (glTF x -74..-62, y -17..26, z 22..92)."""
    n = 0
    for f in mb.bm.faces:
        for v in f.verts:
            c = v.co
            if -74 < c.x < -62 and -17 < c.z < 26 and 22 < -c.y < 92:
                n += 1
                break
    return n


def fix_engine_normals(obj):
    """recalc_face_normals() cannot orient the lone engine discs; force them to face aft (Blender +Y = glTF -Z)."""
    import bmesh
    me = obj.data
    ei = [i for i, m in enumerate(me.materials) if m and m.name == 'engine'][0]
    bm = bmesh.new()
    bm.from_mesh(me)
    n = 0
    for f in bm.faces:
        if f.material_index == ei and f.normal.y < 0:
            f.normal_flip()
            n += 1
    bm.to_mesh(me)
    bm.free()
    me.update()
    print('engine discs flipped to face aft:', n, flush=True)


def check_bay(obj):
    """Contract: nothing inside the bay volume (glTF x in [2,60], y in [-20,40], z in [-30,110])."""
    me = obj.data
    eps = 1e-3
    lo = Vector((BAY_X[0] + eps, -BAY_S[1] + eps, BAY_Z[0] + eps))     # Blender coords
    hi = Vector((BAY_X[1] - eps, -BAY_S[0] - eps, BAY_Z[1] - eps))
    bad = 0
    for p in me.polygons:
        vs = [me.vertices[i].co for i in p.vertices]
        mn = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
        mx = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
        if all(mx[k] > lo[k] and mn[k] < hi[k] for k in range(3)):
            bad += 1
            if bad <= 5:
                print('  bay overlap face', tuple(round(c, 2) for c in mn), tuple(round(c, 2) for c in mx),
                      obj.material_slots[p.material_index].name, [tuple(round(c, 1) for c in v) for v in vs], flush=True)
    wall = [v.co.x for v in me.vertices if -BAY_S[1] <= v.co.y <= -BAY_S[0] and BAY_Z[0] <= v.co.z <= BAY_Z[1]
            and v.co.x > 30]
    print('BAY CHECK: faces overlapping bay volume = %d; starboard wall x range in bay window = %.2f .. %.2f'
          % (bad, min(wall), max(wall)), flush=True)
    return bad


# ------------------------------------------------------------------------------------------ previews
def render_previews(glb):
    import render_ships as rs
    rs.setup()
    rs.clear()
    bpy.ops.import_scene.gltf(filepath=glb)
    sc = bpy.context.scene
    # Cycles on the CPU: no GPU use at all (Eevee shader compiles crashed while another GPU job was running)
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.cycles.denoising_use_gpu = False
    except Exception:
        pass
    sc.render.threads_mode = 'AUTO'
    specs = [('key', (0.45, -0.55, 0.9), 3.2, (1.0, 0.95, 0.9)), ('fill', (-0.8, 0.2, 0.3), 0.8, (0.7, 0.8, 1.0)),
             ('rim', (-0.2, 1.0, 0.4), 3.0, (0.8, 0.88, 1.0)), ('side', (1.0, -0.2, 0.15), 1.2, (0.9, 0.92, 1.0))]
    for name, dv, e, col in specs:
        L = bpy.data.lights.new(name, 'SUN')
        L.energy, L.color, L.angle = e, col, 2 * D2R
        o = bpy.data.objects.new(name, L)
        sc.collection.objects.link(o)
        o.rotation_euler = (-Vector(dv).normalized()).to_track_quat('-Z', 'Y').to_euler()
    os.makedirs(OUT, exist_ok=True)
    # top view (bow up in the image)
    cam = bpy.data.objects.new('_cam', bpy.data.cameras.new('_cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 700
    cam.location = (0, 0, 900)
    cam.rotation_euler = (0, 0, math.pi)
    cam.data.clip_end = 3000
    sc.render.resolution_x, sc.render.resolution_y = 1280, 1280
    sc.render.filepath = os.path.join(OUT, 'v9_mothership_top.png')
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    rs.shot(Vector((0, 0, 0)), 340, 42, 24, 0.62, os.path.join(OUT, 'v9_mothership_front34.png'))
    rs.shot(Vector((WALL_X, Y(40), 10)), 110, 98, 6, 0.95, os.path.join(OUT, 'v9_mothership_wall.png'), lens=40)
    if '--extra' in sys.argv:
        rs.shot(Vector((0, 0, 0)), 340, 150, 22, 0.62, os.path.join(OUT, 'v9_mothership_rear.png'))
        rs.shot(Vector((0, Y(293), 5)), 60, -30, 12, 0.9, os.path.join(OUT, 'v9_mothership_bow.png'))
        rs.shot(Vector((30, Y(60), 55)), 70, -35, 38, 0.9, os.path.join(OUT, 'v9_mothership_detail_mid.png'))
        rs.shot(Vector((60, Y(-215), 45)), 75, 140, 40, 0.9, os.path.join(OUT, 'v9_mothership_detail_aft.png'))
        rs.shot(Vector((25, Y(240), 35)), 60, -40, 30, 0.9, os.path.join(OUT, 'v9_mothership_detail_fwd.png'))
        rs.shot(Vector((0, 0, 0)), 340, 60, -28, 0.62, os.path.join(OUT, 'v9_mothership_belly.png'))


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    path = os.path.join(ASSETS, 'mothership.glb')
    if 'renderonly' in argv:
        render_previews(path)
        return
    lib.reset_scene()
    objs = mothership(probe='probe' in argv)
    tris = sum(lib.tri_count(o) for o in bpy.context.scene.objects if o.type == 'MESH')
    bad = check_bay(objs[0])
    if 'nosave' not in argv:
        lib.export_glb(path)
    print('BUILT mothership v9 tris=%d bay_violations=%d -> %s' % (tris, bad, path), flush=True)
    if 'render' in argv:
        render_previews(path)


main()
