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


# ------------------------------------------------------------------------------------------ main hull
def main_hull(mb, H, R):
    H.build(mb, 'hull')
    # --- armour plates on chamfers, keel chamfers and walls (starboard wall skips the bay section)
    mats = ['hull2', 'plate', 'hull', 'plate']
    for e in (1, 3, 5, 7):
        sc = cuts(-280, 305, R, 14, 34)
        for a, b in zip(sc, sc[1:]):
            if R.random() < 0.1:
                continue
            p0, p1 = e + 0.06, e + 0.94
            if R.random() < 0.35:
                pm = e + R.uniform(0.35, 0.65)
                plate(mb, H, a + 0.6, b - 0.6, p0, pm - 0.03, R.choice(mats), thick=R.uniform(0.8, 2.0))
                plate(mb, H, a + 0.6, b - 0.6, pm + 0.03, p1, R.choice(mats), thick=R.uniform(0.8, 2.0))
            else:
                plate(mb, H, a + 0.6, b - 0.6, p0, p1, R.choice(mats), thick=R.uniform(0.8, 2.2))
    for e, side in ((0, 1), (4, -1)):
        sc = cuts(-280, 293, R, 12, 30)
        for a, b in zip(sc, sc[1:]):
            if side == 1 and b > FLAT_S[0] - 4 and a < FLAT_S[1] + 4:
                continue   # starboard bay wall has its own treatment
            if side == -1 and b > 8 and a < 102:
                continue   # port launch bay
            for (pa, pb) in ((e + 0.03, e + 0.3), (e + 0.34, e + 0.64), (e + 0.68, e + 0.97)):
                if R.random() < 0.12:
                    continue
                plate(mb, H, a + 0.5, b - 0.5, pa, pb, R.choice(mats), thick=R.uniform(0.6, 1.6))
    # --- window rows on the walls (deck levels)
    for p in (0.2, 0.47, 0.82):
        for side, e in ((1, 0), (-1, 4)):
            pp = e + (p if side == 1 else 1 - p)
            s = -278.0
            while s < 283:
                skip = (side == 1 and FLAT_S[0] - 4 < s < FLAT_S[1] + 4) or (side == -1 and 6 < s < 104)
                if not skip and R.random() > 0.3:
                    ln = R.uniform(4, 14)
                    pos, n = H.pt(s + ln / 2, pp, 1.9)
                    obox(mb, pos, n, (0.9, ln, 0.3), 'window', lift=0.0)
                    s += ln + R.uniform(2, 6)
                else:
                    s += R.uniform(6, 18)
    # --- keel: ventral spine blocks + lights
    for a, b in zip(*[iter(cuts(-280, 280, R, 20, 40))] * 2):
        w = R.uniform(14, 30)
        blk(mb, a, b, -w / 2, w / 2, H.at((a + b) / 2)[2] - H.at((a + b) / 2)[1] / 2 + 1,
            H.at((a + b) / 2)[2] - H.at((a + b) / 2)[1] / 2 - R.uniform(1.2, 3.0), R.choice(mats), ins=0.0)
    for side in (1, -1):
        s = -270.0
        while s < 280:
            w, h, cz, _ = H.at(s)
            pos = Vector((side * U_BOT * w / 2 * 0.7, Y(s), cz - h / 2 - 0.3))
            obox(mb, pos, Vector((0, 0, -1)), (1.0, 3.0, 0.3), 'amber' if R.random() < 0.8 else 'blue_light',
                 lift=0.0)
            s += R.uniform(12, 26)
    # small flank greebles (outside the starboard bay window and the port launch bay)
    for _ in range(1400):
        side = R.choice((1, -1))
        s = R.uniform(-279, 293)
        if side == 1 and FLAT_S[0] - 3 < s < FLAT_S[1] + 3:
            continue
        if side == -1 and 12 < s < 100:
            continue
        e = R.choice((0, 0, 1, 5, 7)) if side == 1 else R.choice((4, 4, 3, 5, 7))
        if side == -1 and e == 7:
            e = 5
        if side == 1 and e == 5:
            e = 7
        pos, n = H.pt(s, e + R.uniform(0.05, 0.95), 1.2)
        obox(mb, pos, n, (R.uniform(1, 3.5), R.uniform(2, 9), R.uniform(0.4, 1.8)), R.choice(
            ['greeble', 'trim', 'plate', 'hull2']))
    for _ in range(700):
        s = R.uniform(-279, 293)
        w, h, cz, _ = H.at(s)
        x = R.uniform(-U_BOT, U_BOT) * w / 2 * 0.95
        sz = R.uniform(0.6, 3.5)
        mb.box((x, Y(s), cz - h / 2 - sz / 2 + 0.2), (R.uniform(1.5, 6), R.uniform(2, 10), sz),
               R.choice(['greeble', 'trim', 'plate', 'hull2']))


def deck_z(H, s):
    w, h, cz, _ = H.at(s)
    return cz + h / 2


def deck_half(H, s0, s1):
    return min(H.at(s0)[0], H.at(s1)[0], H.at((s0 + s1) / 2)[0]) / 2 * U_TOP


def deck(mb, H, R):
    """Layered deck plating: tiles of different heights, stacked sub-plates, trenches, vents, turrets."""
    mats = ['hull2', 'plate', 'hull', 'plate', 'trim']
    sc = cuts(-279, 293, R, 9, 24)
    for a, b in zip(sc, sc[1:]):
        zt = min(deck_z(H, a), deck_z(H, b))
        xe = deck_half(H, a, b) - 1.0
        # across-cuts: spine gap handled by the spine itself (tiles run under it)
        xc = [-xe]
        while xc[-1] < xe - 5:
            xc.append(min(xe, xc[-1] + R.uniform(5, 16)))
        xc[-1] = xe
        for x0, x1 in zip(xc, xc[1:]):
            if R.random() < 0.08:
                continue  # exposed trench
            if abs((x0 + x1) / 2) < 14 and R.random() < 0.7:
                continue  # under the spine
            hgt = R.choice([0.6, 0.9, 1.3, 1.8, 2.5, 3.2])
            m = R.choice(mats[:4])
            blk(mb, a + 0.5, b - 0.5, x0 + 0.4, x1 - 0.4, zt - 0.5, zt + hgt, m, ins=min(0.6, hgt * 0.4))
            r = R.random()
            if r < 0.5 and (b - a) > 8 and (x1 - x0) > 5:   # stacked second layer
                sa = R.uniform(a + 1.5, (a + b) / 2 - 1)
                sb = R.uniform((a + b) / 2 + 1, b - 1.5)
                xa = R.uniform(x0 + 1, (x0 + x1) / 2 - 0.8)
                xb = R.uniform((x0 + x1) / 2 + 0.8, x1 - 1)
                h2 = R.uniform(0.8, 3.0)
                blk(mb, sa, sb, xa, xb, zt + hgt - 0.2, zt + hgt + h2, R.choice(mats), ins=min(0.5, h2 * 0.35))
                if R.random() < 0.3:
                    cx, cs = (xa + xb) / 2, (sa + sb) / 2
                    blk(mb, cs - 1.5, cs + 1.5, cx - 1.2, cx + 1.2, zt + hgt + h2 - 0.2, zt + hgt + h2 + 1.6,
                        'greeble', ins=0.3)
            elif r < 0.65 and (b - a) > 8:          # vent bank
                n = int((b - a - 3) / 1.6)
                fins(mb, Vector(((x0 + x1) / 2, Y(a + 1.5), zt + hgt - 0.1)), Vector((0, -1, 0)),
                     Vector((0, 0, 1)), n, 1.6, 1.2, (x1 - x0) * 0.7, 0.5, 'greeble')
            elif r < 0.72:                            # small light strip on the tile
                obox(mb, Vector(((x0 + x1) / 2, Y((a + b) / 2), zt + hgt)), Vector((0, 0, 1)),
                     (0.9, (b - a) * 0.6, 0.25), 'amber', lift=0.0)
    # longitudinal trenches with amber lights (both sides of the spine)
    for side in (1, -1):
        x = side * 30.0
        for a, b in ((-270, -140), (-60, 120), (130, 250)):
            zt = min(deck_z(H, a), deck_z(H, b))
            if abs(x) + 4 > deck_half(H, a, b):
                continue
            blk(mb, a, b, x - 3.2, x + 3.2, zt - 1.0, zt + 0.1, 'greeble')
            for xs in (x - 3.8, x + 3.8):
                blk(mb, a, b, xs - 0.7, xs + 0.7, zt - 0.5, zt + 3.4, 'trim', ins=0.3)
            light_row(mb, (x, Y(a + 3), zt + 0.1), (x, Y(b - 3), zt + 0.1), (0, 0, 1), 7.0,
                      (1.2, 2.4, 0.25), 'amber')
    # deck-edge amber rows along the chamfer break (the "edge lights" of the wedge)
    for side in (1, -1):
        s = -276.0
        while s < 293:
            w, h, cz, _ = H.at(s)
            pos, n = H.pt(s, 1.12 if side == 1 else 2.88, 2.4)
            obox(mb, pos, n, (1.0, 2.2, 0.3), 'amber', lift=0.0)
            s += 5.5
    # dorsal turrets
    for s, x in ((210, 20), (210, -20), (150, 34), (150, -34), (-10, 40), (-10, -40), (-180, 44), (-180, -44)):
        zt = deck_z(H, s)
        turret(mb, Vector((x, Y(s), zt + 2.5)), Vector((0, 0, 1)), 6.5, 'trim', 'hull2', 'greeble', barrels=3,
               blen=2.4)
    # scattered small greebles everywhere on deck
    for _ in range(4500):
        s = R.uniform(-279, 293)
        xe = deck_half(H, s - 2, s + 2) - 2
        x = R.uniform(-xe, xe)
        zt = deck_z(H, s)
        sx, sy, sz = R.uniform(1, 4), R.uniform(1.5, 7), R.uniform(0.6, 4.2)
        mb.box((x, Y(s), zt + sz / 2 - 0.2), (sx, sy, sz), R.choice(['greeble', 'trim', 'plate', 'hull2']))


def spine_and_bridge(mb, H, R):
    """Stepped central superstructure and the command block with canopy dome (~1/3 from the stern)."""
    segs = [(293, 238, 9, 6), (238, 170, 13, 10), (170, 126, 17, 14), (126, 90, 17, 14), (90, -20, 19, 17), (-20, -60, 22, 20),
            (-130, -200, 24, 19), (-200, -274, 20, 13)]
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
        # top greebles on the spine
        ztop = zt + hh + 4.5
        sc = cuts(b + 8, a - 8, R, 5, 14)
        xw = hw * 0.62 - 1.6
        for sa, sb in zip(sc, sc[1:]):
            xc = [-xw, R.uniform(-xw * 0.5, -1), R.uniform(1, xw * 0.5), xw]
            for x0, x1 in zip(xc, xc[1:]):
                if R.random() < 0.2:
                    continue
                hgt = R.choice([0.4, 0.8, 1.2, 2.0])
                blk(mb, sa + 0.4, sb - 0.4, x0 + 0.3, x1 - 0.3, ztop - 0.3, ztop + hgt, R.choice(['plate', 'hull', 'trim']),
                    ins=min(0.4, hgt * 0.4))
        for _ in range(int(abs(a - b) / 5)):
            s = R.uniform(b + 8, a - 8)
            x = R.uniform(-hw * 0.45, hw * 0.45)
            sx, sy, sz = R.uniform(1.5, 5), R.uniform(2, 8), R.uniform(0.8, 3.5)
            mb.box((x, Y(s), ztop + sz / 2 - 0.2), (sx, sy, sz), R.choice(['greeble', 'trim', 'plate']))
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
    # antennae / sensor masts
    antenna(mb, (14, Y(-118), dz), 7, 0.5, 'trim', bars=3, mat_bar='greeble')
    antenna(mb, (-15, Y(-112), dz), 5, 0.45, 'trim', bars=2, mat_bar='greeble')
    antenna(mb, (6, Y(-240), deck_z(H, -240) + 17), 9, 0.4, 'trim', bars=2)
    antenna(mb, (-8, Y(60), deck_z(H, 60) + 21), 8, 0.4, 'trim', bars=2)
    mb.sphere((15, Y(-118), dz + 7.6), 1.2, 'blue_light', seg=8, rings=4)
    mb.sphere((-15, Y(-112), dz + 5.6), 1.0, 'amber', seg=8, rings=4)
    return dz + 10.5


# ------------------------------------------------------------------------------------------ sponsons
def sponson(mb, R, sg):
    """Swept, angled armour 'shoulder' on one flank (sg=+1 starboard, -1 port), aft of s=-46."""
    xs = [56, 70, 92, 114, 128, 133]

    def sec(x):
        t = max(0.0, x - 62) / 71.0
        s_le = -46 - t * 150          # swept leading edge: -46 at the hull -> -196 at the tip
        s_te = -286 + t * 8
        zb = -24 + t * 8
        zt = 50 - t * 22              # top slopes down outward (angled shoulder)
        return s_le, s_te, zb, zt

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
    for x0, x1 in zip(xb_, xb_[1:]):
        smax = sec(x1)[0] - 17
        smin = sec(x1)[1] + 8
        sc = cuts(smin, smax, R, 8, 22)
        for sa, sb in zip(sc, sc[1:]):
            if R.random() < 0.08:
                continue
            h = R.choice([0.6, 1.0, 1.6, 2.4, 3.2])
            splate(x0 + 0.4, x1 - 0.4, sa + 0.4, sb - 0.4, 0.0, h, R.choice(['hull2', 'plate', 'hull', 'plate']),
                   min(0.6, h * 0.4))
            r = R.random()
            if r < 0.45 and sb - sa > 7:
                ca, cb = R.uniform(x0 + 1, (x0 + x1) / 2 - 0.5), R.uniform((x0 + x1) / 2 + 0.5, x1 - 1)
                da, db = R.uniform(sa + 1, (sa + sb) / 2 - 1), R.uniform((sa + sb) / 2 + 1, sb - 1)
                h2 = R.uniform(0.8, 2.6)
                splate(ca, cb, da, db, h - 0.2, h2, R.choice(['hull2', 'trim', 'plate']), 0.4)
            elif r < 0.55:
                obox(mb, Vector((sg * (x0 + x1) / 2, Y((sa + sb) / 2), zt_at((x0 + x1) / 2) + h)),
                     Vector((0, 0, 1)), (0.9, (sb - sa) * 0.6, 0.25), 'amber', lift=0.0)
    for _ in range(420):
        x = R.uniform(64, 128)
        s_le, s_te, zb, zt = sec(x)
        s = R.uniform(s_te + 9, s_le - 18)
        sx, sy, sz = R.uniform(1, 4), R.uniform(1.5, 7), R.uniform(0.8, 4.5)
        mb.box((sg * x, Y(s), zt + sz / 2 - 0.3), (sx, sy, sz), R.choice(['greeble', 'trim', 'plate', 'hull2']))
    for _ in range(4):
        x = R.uniform(80, 118)
        s_le, s_te, zb, zt = sec(x)
        s = R.uniform(s_te + 20, s_le - 40)
        fins(mb, Vector((sg * x, Y(s), zt + 1.5)), Vector((0, -1, 0)), Vector((0, 0, 1)), 10, 1.8, 1.6, 9, 0.5,
             'greeble')
    turret(mb, Vector((sg * 100, Y(-205), sec(100)[3] + 3.5)), Vector((0, 0, 1)), 6.0, 'trim', 'hull2', 'greeble',
           barrels=2, blen=2.4)

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
                t = R.uniform(0.7, 1.8)
                top = [c + (v - c) * 0.88 + n * t for v in q]
                mb.hexa([v - n * 0.3 for v in q] + top, R.choice(['hull2', 'plate', 'plate']))
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
                  (0.8, 2.4, 0.3), 'window', R=R, dropout=0.25)
    mb.sphere((sg * 133.5, Y(s_le - 18), zt - 4), 1.6, 'blue_light' if sg > 0 else 'amber', seg=8, rings=4)
    # trailing (aft) face lights + small engine
    s_le, s_te, zb, zt = sec(100)
    light_row(mb, (sg * 72, Y(-286.3), 30), (sg * 124, Y(-281.5), 20), (0, 1, 0), 5.0, (0.8, 2.2, 0.3), 'amber')
    engine_bell(mb, Vector((sg * 100, Y(-283), 0)), 8.5, 12)


def strake(mb, R, sg):
    """Upper armoured strake (above z=51 over the bay, so it never covers the starboard bay wall) that carries the
    wedge line from the forward hull out onto the sponson top -> continuous arrowhead planform."""
    # (s, x_out, z_bottom, z_top)
    st = [(176, 50, 50, 54), (126, 64, 51.5, 58), (40, 78, 51.5, 59), (-46, 94, 51.5, 59.5), (-120, 108, 44, 55),
          (-200, 121, 32, 44), (-226, 121, 31, 42)]

    def ring(s, xo, zb, zt):
        return [Vector((sg * x, Y(s), z)) for x, z in
                ((36, zt + 0.5), (xo - 5, zt), (xo, zt - 3.5), (xo - 2, zb), (46, zb))]
    mb.loft([ring(*r) for r in st], 'hull2')

    def at(s):
        for a, b in zip(st, st[1:]):
            if b[0] <= s <= a[0]:
                t = (a[0] - s) / (a[0] - b[0])
                return tuple(lerp(u, v, t) for u, v in zip(a[1:], b[1:]))
        return st[-1][1:]
    # plates on the strake top and an amber edge line
    sc = cuts(-222, 168, R, 10, 24)
    for sa, sb in zip(sc, sc[1:]):
        xo_a, _, zt_a = at(sa)
        xo_b, _, zt_b = at(sb)
        xo = min(xo_a, xo_b) - 6
        if xo < 50:
            continue
        x0 = 44 + R.uniform(0, 4)
        h = R.choice([0.5, 0.9, 1.4, 2.0])
        za, zb_ = zt_a, zt_b
        bot = [(sg * x0, Y(sa + 0.5), za - 0.4), (sg * xo, Y(sa + 0.5), za - 0.4), (sg * xo, Y(sb - 0.5), zb_ - 0.4),
               (sg * x0, Y(sb - 0.5), zb_ - 0.4)]
        top = [(sg * (x0 + 0.5), Y(sa + 1), za + h), (sg * (xo - 0.5), Y(sa + 1), za + h),
               (sg * (xo - 0.5), Y(sb - 1), zb_ + h), (sg * (x0 + 0.5), Y(sb - 1), zb_ + h)]
        mb.hexa(bot + top, R.choice(['plate', 'hull', 'hull2', 'plate']))
        if R.random() < 0.5:
            xm = R.uniform(x0 + 3, xo - 3)
            sm = (sa + sb) / 2
            mb.box((sg * xm, Y(sm), lerp(za, zb_, 0.5) + h + 0.8), (R.uniform(2, 5), R.uniform(3, 8), 2.0),
                   R.choice(['greeble', 'trim']))
    for _ in range(260):
        sm = R.uniform(-220, 160)
        xo, zb, zt = at(sm)
        if xo < 56:
            continue
        x = R.uniform(46, xo - 7)
        sz = R.uniform(0.6, 3.2)
        mb.box((sg * x, Y(sm), zt + 1.0 + sz / 2), (R.uniform(1, 4), R.uniform(2, 8), sz),
               R.choice(['greeble', 'trim', 'plate', 'hull2']))
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
        s -= R.uniform(6, 14)


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
