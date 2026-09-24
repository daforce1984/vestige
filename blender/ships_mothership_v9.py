"""v9 mothership: original dark wedge-hulled capital ship ("arrowhead dreadnought" language).

Silhouette (top view): narrow blunt bow ending in a heavy ring-armoured ion cannon, hull widening aft into a
parallel-sided mid-body, then large swept, angled armour sponsons ("shoulders") on both flanks toward the stern.
A stepped central spine runs the length of the deck with a command block + dark canopy dome ~1/3 from the stern.
Dense layered deck plating, trenches, vent banks, turrets and antennae; dark gunmetal / blue-black satin metal;
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
Writes assets/mothership.glb; with 'render' also blender/previews/v9_mothership_{top,front34,wall}.png.
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector
import lib
from lib import MB, reg, empty, rng, lerp, annulus, D2R
from shipkit import Hull, plate, cuts, obox, turret, fins
from hullkit import antenna, dome

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


def light_row(mb, p0, p1, n, pitch, size, mat, R=None, dropout=0.0):
    """Row of small emissive boxes along p0->p1 lying on a surface with normal n. size=(across, along, thick)."""
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
        obox(mb, p0 + f * (L * i / k), n, size, mat, lift=0.0, fwd=f)


# ------------------------------------------------------------------------------------------ structural grid
FR0, BAYL, FRAME = -44.0, 24.0, 6.0          # bulkheads every 24 m from the bay bulkhead s=-44, frames every 6 m
WALL_T, CHAM_T, KEEL_T, TILE_H = 1.2, 1.1, 1.0, 0.7
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


def spine_hw(s):
    if -132 <= s <= -58:
        return 32.0                                # command block
    for a, b, hw, hh in SPINE:
        if b <= s <= a:
            return float(hw)
    return 0.0


def strake_at(s):
    """(x_out, z_bottom, z_top) of the strake at station s."""
    st = STRAKE
    for a, b in zip(st, st[1:]):
        if b[0] <= s <= a[0]:
            t = (a[0] - s) / (a[0] - b[0])
            return tuple(lerp(u, v, t) for u, v in zip(a[1:], b[1:]))
    return st[0][1:] if s > st[0][0] else st[-1][1:]


def wall_skip(side, s0, s1):
    """Wall spans reserved for the starboard hangar wall / port launch bay or hidden inside the sponsons."""
    if s1 < -50:
        return True
    if side == 1 and s1 > FLAT_S[0] - 4 and s0 < FLAT_S[1] + 4:
        return True
    if side == -1 and s1 > 6 and s0 < 104:
        return True
    return False


# ------------------------------------------------------------------------------------------ main hull
def main_hull(mb, H, R):
    """Hull loft + armour on a regular bulkhead grid: one plate per 24 m bay, three belts on the walls."""
    H.build(mb, 'hull')
    bays = grid(-282, 305)
    # upper / lower chamfers: plate per bay split lengthwise; belt tone per edge
    tone = {1: 'hull2', 3: 'hull2', 5: 'plate', 7: 'plate'}
    for e in (1, 3, 5, 7):
        for i, (a, b) in enumerate(zip(bays, bays[1:])):
            m = tone[e] if R.random() > 0.15 else 'hull'
            t = CHAM_T + (0.3 if i % 2 else 0.0)
            plate(mb, H, a + 0.6, b - 0.6, e + 0.06, e + 0.49, m, thick=t)
            plate(mb, H, a + 0.6, b - 0.6, e + 0.53, e + 0.94, m, thick=t)
    # walls: upper belt / citadel belt / lower belt
    for e, side in ((0, 1), (4, -1)):
        belts = ((e + 0.03, e + 0.3), (e + 0.34, e + 0.64), (e + 0.68, e + 0.97))
        btone = ('plate', 'hull2', 'plate') if side == 1 else ('plate', 'hull2', 'plate')[::-1]
        for i, (a, b) in enumerate(zip(bays, bays[1:])):
            if wall_skip(side, a, b):
                continue
            for k, (pa, pb) in enumerate(belts):
                m = btone[k] if R.random() > 0.12 else 'hull'
                plate(mb, H, a + 0.5, b - 0.5, pa, pb, m, thick=WALL_T + (0.25 if i % 2 else 0.0))
    # keel: regular structural keel spine (one block per bay) + plate belts either side
    for i, (a, b) in enumerate(zip(bays, bays[1:])):
        zk = min(H.at(a)[2] - H.at(a)[1] / 2, H.at(b)[2] - H.at(b)[1] / 2)
        blk(mb, a + 0.8, b - 0.8, -7, 7, zk + 1, zk - 2.2, 'hull2', ins=0.0)
        plate(mb, H, a + 0.6, b - 0.6, 6.06, 6.36, 'plate', thick=KEEL_T)
        plate(mb, H, a + 0.6, b - 0.6, 6.64, 6.94, 'plate', thick=KEEL_T)
    # keel marker lights on a regular 12 m pitch
    for side in (1, -1):
        s = -270.0
        while s < 280:
            w, h, cz, _ = H.at(s)
            pos = Vector((side * U_BOT * w / 2 * 0.7, Y(s), cz - h / 2 - KEEL_T - 0.1))
            obox(mb, pos, Vector((0, 0, -1)), (1.0, 3.0, 0.3), 'amber', lift=0.0)
            s += 12.0


def deck_z(H, s):
    w, h, cz, _ = H.at(s)
    return cz + h / 2


def deck_half(H, s0, s1):
    return min(H.at(s0)[0], H.at(s1)[0], H.at((s0 + s1) / 2)[0]) / 2 * U_TOP


def sblk(mb, a, b, xa0, xa1, xb0, xb1, za, zb, h, mat, ins=0.4):
    """Deck tile following the deck slope between stations a < b: x span (xa0,xa1) at a and (xb0,xb1) at b,
    bottom 0.5 below the deck surface (za at a, zb at b), top h above it, top face inset by `ins`."""
    bot = [(xa0, Y(a), za - 0.5), (xa1, Y(a), za - 0.5), (xb1, Y(b), zb - 0.5), (xb0, Y(b), zb - 0.5)]
    top = [(xa0 + ins, Y(a + ins), za + h), (xa1 - ins, Y(a + ins), za + h), (xb1 - ins, Y(b - ins), zb + h),
           (xb0 + ins, Y(b - ins), zb + h)]
    mb.hexa(bot + top, mat)


DECK_XC = [0, 8, 16, 26, 34, 42, 50, 58]
TRENCH = ((-60, 120),)                          # midship service trench at x = +-30


def deck(mb, H, R):
    """Main deck armour: regular tiles (12 m frames x 8/10 m lanes) following the deck slope; service trench."""
    lane_mat = ['hull2', 'plate', 'hull2', 'plate', 'hull', 'plate', 'hull2']
    rows = grid(-285, 305, 12.0)
    for a, b in zip(rows, rows[1:]):
        za, zb = deck_z(H, a), deck_z(H, b)
        xea, xeb = H.at(a)[0] / 2 * U_TOP - 1.0, H.at(b)[0] / 2 * U_TOP - 1.0
        in_trench = any(t0 <= (a + b) / 2 <= t1 for t0, t1 in TRENCH)
        for li, (x0, x1) in enumerate(zip(DECK_XC, DECK_XC[1:])):
            if in_trench and li == 3:
                continue                            # trench lane
            if max(spine_hw(a), spine_hw(b)) - 2.5 >= x1:
                continue                            # under the spine / command block
            if 243 <= b and a <= 311 and x1 <= 15:
                continue                            # under the cannon brow
            if x0 >= 42 and -226 <= (a + b) / 2 <= 170:
                continue                            # under the strake
            oa, ob = min(x1, xea), min(x1, xeb)
            if min(oa, ob) < x0 + 2.5:
                if max(oa, ob) < x0 + 2.5:
                    continue
            oa, ob = max(oa, x0 + 1.0), max(ob, x0 + 1.0)
            m = lane_mat[li] if R.random() > 0.12 else 'hull'
            for sg in (1, -1):
                xs = sorted((sg * (x0 + 0.4), sg * (oa - 0.4)))
                xt = sorted((sg * (x0 + 0.4), sg * (ob - 0.4)))
                sblk(mb, a + 0.4, b - 0.4, xs[0], xs[1], xt[0], xt[1], za, zb, TILE_H, m)
    # service trench (midship): recessed floor, raised kerbs, amber guide lights on a 6 m pitch
    for side in (1, -1):
        x = side * 30.0
        for a, b in TRENCH:
            zt = min(deck_z(H, a), deck_z(H, b))
            blk(mb, a, b, x - 3.2, x + 3.2, zt - 1.0, zt + 0.1, 'greeble')
            for xs in (x - 3.8, x + 3.8):
                blk(mb, a, b, xs - 0.7, xs + 0.7, zt - 0.5, zt + 1.6, 'trim', ins=0.3)
            light_row(mb, (x, Y(a + 3), zt + 0.1), (x, Y(b - 3), zt + 0.1), (0, 0, 1), 6.0,
                      (1.2, 2.4, 0.25), 'amber')
    # deck-edge amber rows along the chamfer break (the "edge lights" of the wedge)
    for side in (1, -1):
        s = -276.0
        while s < 293:
            pos, n = H.pt(s, 1.12 if side == 1 else 2.88, CHAM_T + 0.35)
            obox(mb, pos, n, (1.0, 2.2, 0.3), 'amber', lift=0.0)
            s += 6.0


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
        # roof armour: three lanes, plates on the 6 m frame grid (machinery is added by the systems pass)
        ztop = zt + hh + 4.5
        sc = grid(b + 8, a - 8, 12.0)
        xw = hw * 0.62 - 1.6
        xc = [-xw, -xw / 3, xw / 3, xw]
        for sa, sb in zip(sc, sc[1:]):
            for k, (x0, x1) in enumerate(zip(xc, xc[1:])):
                blk(mb, sa + 0.4, sb - 0.4, x0 + 0.3, x1 - 0.3, ztop - 0.3, ztop + 0.6,
                    'plate' if k != 1 else 'hull', ins=0.25)
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

    # layered armour plates on the sloped sponson top (+ stacked sub-plates, trenches, vents)
    def zt_at(x):
        return sec(x)[3]

    def splate(x0, x1, sa, sb, lift0, h, m, ins):
        za, zb_ = zt_at(x0) + lift0, zt_at(x1) + lift0
        bot = [(sg * x0, Y(sa), za - 0.5), (sg * x1, Y(sa), zb_ - 0.5), (sg * x1, Y(sb), zb_ - 0.5),
               (sg * x0, Y(sb), za - 0.5)]
        top = [(sg * (x0 + ins), Y(sa + ins), za + h), (sg * (x1 - ins), Y(sa + ins), zb_ + h),
               (sg * (x1 - ins), Y(sb - ins), zb_ + h), (sg * (x0 + ins), Y(sb - ins), za + h)]
        mb.hexa(bot + top, m)
    xb_ = [63, 72, 83, 95, 106, 118, 129]
    lane_mat = ['hull2', 'plate', 'hull2', 'plate', 'hull2', 'plate']
    for li, (x0, x1) in enumerate(zip(xb_, xb_[1:])):
        smax = sec(x1)[0] - 17
        smin = sec(x1)[1] + 8
        sc = grid(smin, smax, 12.0)
        for sa, sb in zip(sc, sc[1:]):
            m = lane_mat[li] if R.random() > 0.12 else 'hull'
            splate(x0 + 0.4, x1 - 0.4, sa + 0.4, sb - 0.4, 0.0, TILE_H + 0.2, m, 0.35)

    # armour panels on the leading upper / lower chamfers and the aft top chamfer
    ctr = Vector((sg * 95, Y(-200), 10))
    for (i, j, nv) in ((0, 1, 2), (5, 0, 2), (2, 3, 1)):
        xs_p = [66, 78, 90, 102, 114, 126]
        for xa, xb in zip(xs_p, xs_p[1:]):
            ra, rb = ring(xa), ring(xb)
            for k in range(nv):
                f0, f1 = k / nv, (k + 1) / nv
                q = [ra[i].lerp(ra[j], f0), rb[i].lerp(rb[j], f0), rb[i].lerp(rb[j], f1), ra[i].lerp(ra[j], f1)]
                c = sum(q, Vector()) / 4
                n = (q[1] - q[0]).cross(q[3] - q[0]).normalized()
                if n.dot(c - ctr) < 0:
                    n = -n
                g = 0.7
                q = [c + (v - c) * 0.94 for v in q]
                t = 1.1 + 0.3 * (k % 2)
                top = [c + (v - c) * 0.9 + n * t for v in q]
                mb.hexa([v - n * 0.3 for v in q] + top, 'hull2' if (i, k) != (2, 0) else 'plate')
    # amber edge lights: along the leading chamfer, the top leading break, the outer tip and the trailing edge
    xa, xb = 60, 128
    A, B = sec(xa), sec(xb)
    for f in (0.35, 0.7):
        p0 = Vector((sg * xa, Y(lerp(A[0], A[0] - 16, f)), lerp((A[2] + A[3]) / 2 - 3, A[3], f)))
        p1 = Vector((sg * xb, Y(lerp(B[0], B[0] - 16, f)), lerp((B[2] + B[3]) / 2 - 3, B[3], f)))
        n = Vector((sg * 0.25, -1.0, 1.0)).normalized()
        light_row(mb, p0 + n * 0.4, p1 + n * 0.4, n, 4.5, (1.0, 2.4, 0.4), 'amber')
    p0 = Vector((sg * xa, Y(A[0] - 18), A[3] + 0.2))
    p1 = Vector((sg * xb, Y(B[0] - 18), B[3] + 0.2))
    light_row(mb, p0, p1, (0, 0, 1), 6.0, (1.0, 2.4, 0.3), 'amber', R=R, dropout=0.2)
    # lower leading edge row
    p0 = Vector((sg * xa, Y(A[0] - 10), A[2] + 3))
    p1 = Vector((sg * xb, Y(B[0] - 10), B[2] + 3))
    light_row(mb, p0, p1, Vector((0, -1, -0.6)), 6.0, (0.9, 2.0, 0.3), 'amber', R=R, dropout=0.3)
    # outer tip face: window grid + nav light
    s_le, s_te, zb, zt = sec(133)
    for z in (zb + 10, (zb + zt) / 2, zt - 9):
        light_row(mb, (sg * 133.2, Y(s_le - 22), z), (sg * 133.2, Y(s_te + 10), z), (sg, 0, 0), 4.0,
                  (0.8, 2.4, 0.3), 'window', R=R, dropout=0.15)
    mb.sphere((sg * 133.5, Y(s_le - 18), zt - 4), 1.6, 'blue_light' if sg > 0 else 'amber', seg=8, rings=4)
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
    # roof armour: 12 m frames x 12 m lanes, outer lane clipped to the swept edge
    XS = [38, 50, 62, 74, 86, 98, 110, 122]
    sc = grid(-222, 168, 12.0)
    for sa, sb in zip(sc, sc[1:]):
        xo_a, _, zt_a = at(sa)
        xo_b, _, zt_b = at(sb)
        for li, (x0, x1) in enumerate(zip(XS, XS[1:])):
            oa, ob = min(x1, xo_a - 6), min(x1, xo_b - 6)
            if max(oa, ob) < x0 + 3:
                continue
            oa, ob = max(oa, x0 + 1.5), max(ob, x0 + 1.5)
            m = ('plate', 'hull2')[li % 2] if R.random() > 0.12 else 'hull'
            h = 1.0
            za, zb_ = zt_a, zt_b
            bot = [(sg * (x0 + 0.4), Y(sa + 0.4), za - 0.4), (sg * oa, Y(sa + 0.4), za - 0.4),
                   (sg * ob, Y(sb - 0.4), zb_ - 0.4), (sg * (x0 + 0.4), Y(sb - 0.4), zb_ - 0.4)]
            top = [(sg * (x0 + 0.8), Y(sa + 0.8), za + h), (sg * (oa - 0.4), Y(sa + 0.8), za + h),
                   (sg * (ob - 0.4), Y(sb - 0.8), zb_ + h), (sg * (x0 + 0.8), Y(sb - 0.8), zb_ + h)]
            mb.hexa(bot + top, m)
    s = 165.0
    while s > -224:
        xo, zb, zt = at(s)
        obox(mb, Vector((sg * (xo - 0.2), Y(s), zt - 3.0)), Vector((sg, 0, 0.4)), (1.0, 2.4, 0.35), 'amber',
             lift=0.0)
        s -= 5.0
    s = 150.0
    while s > -220:
        xo, zb, zt = at(s)
        obox(mb, Vector((sg * (xo - 1.6), Y(s), zb - 0.1)), Vector((0, 0, -1)), (0.9, 3.0, 0.3), 'window',
             lift=0.0)
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
    mb.box((0, ys + 0.6, 4), (22, 1.2, 46), 'amber')                       # lit back panel on the stern face
    for x in (-13, 13):                                                     # protruding frame -> recessed slot
        mb.box((x, ys + 4.5, 4), (4, 9.0, 54), 'hull2')
    for z in (29, -21):
        mb.box((0, ys + 4.5, z), (30, 9.0, 4), 'hull2')
    for k in range(7):                                                      # cross beams / interior strips
        mb.box((0, ys + 1.5, -15 + k * 6.5), (22, 0.8, 0.7), 'trim' if k % 2 else 'window')
    # stern face plating + light rows
    for x0, x1, z0, z1 in ((-60, -16, 26, 42), (16, 60, 26, 42), (-60, -58, -24, 26), (58, 60, -24, 26)):
        blk(mb, s0 + 0.5, s0 - 1.5, x0, x1, z0, z1, 'plate')
    for z in (32, 37):
        light_row(mb, (-56, ys + 1.6, z), (-18, ys + 1.6, z), (0, 1, 0), 3.2, (0.6, 2.0, 0.3), 'window', R=R,
                  dropout=0.2)
        light_row(mb, (18, ys + 1.6, z), (56, ys + 1.6, z), (0, 1, 0), 3.2, (0.6, 2.0, 0.3), 'window', R=R,
                  dropout=0.2)
    for sg in (1, -1):
        mb.sphere((sg * 64, ys + 1, 40), 1.4, 'blue_light', seg=8, rings=4)


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
        mb.sphere((sg * 17, YB(329), zc + 12.5), 1.2, 'blue_light', seg=8, rings=4)
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
            mb.box((x + 1.55, Y((a + b) / 2), z), (0.3, L, 1.1 if z not in (5.0, 32.0) else 2.2), 'window')
    # big closed hangar-door outline in the middle of the wall
    ds0, ds1, dz0, dz1 = 6.0, 78.0, -20.0, 22.0
    for s in (ds0, ds1):
        blk(mb, s - 1.4, s + 1.4, x - 0.3, x + 2.6, dz0, dz1, 'trim', ins=0)
    for z in (dz0, dz1):
        mb.box((x + 1.2, Y((ds0 + ds1) / 2), z), (2.6, ds1 - ds0 + 2.8, 2.6), 'trim')
    for k in range(9):                                    # amber door-edge marker lights
        s = lerp(ds0 + 3, ds1 - 3, k / 8)
        mb.box((x + 2.6, Y(s), dz0 - 2.0), (0.3, 1.6, 0.8), 'amber')
        mb.box((x + 2.6, Y(s), dz1 + 2.0), (0.3, 1.6, 0.8), 'amber')
    for s in (ds0 - 3.5, ds1 + 3.5):
        for z in (dz0 + 3, dz1 - 3):
            mb.box((x + 1.2, Y(s), z), (0.4, 1.2, 1.2), 'blue_light')
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
        mb.box((x - D - 1.5, Y(s), za + 0.1), (1.2, 1.6, 0.3), 'amber')
    for s in (sa - 2.5, sb + 2.5):
        mb.box((x - D - 0.1, Y(s), zb + 2.5), (0.3, 1.5, 1.5), 'blue_light')
    empty('hangar_exit', (x - D - 4, Y((sa + sb) / 2), (za + zb) / 2 - 4), rot=(0, 0, -90), size=6)


# ------------------------------------------------------------------------------------------ build
def mothership():
    palette()
    R = rng(909)
    H = Hull(STATIONS, PROF)
    mb = MB()
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
    obj = mb.to_object('mothership', smooth_angle=26)
    fix_engine_normals(obj)
    return [obj]


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


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    path = os.path.join(ASSETS, 'mothership.glb')
    if 'renderonly' in argv:
        render_previews(path)
        return
    lib.reset_scene()
    objs = mothership()
    tris = sum(lib.tri_count(o) for o in bpy.context.scene.objects if o.type == 'MESH')
    bad = check_bay(objs[0])
    if 'nosave' not in argv:
        lib.export_glb(path)
    print('BUILT mothership v9 tris=%d bay_violations=%d -> %s' % (tris, bad, path), flush=True)
    if 'render' in argv:
        render_previews(path)


main()
