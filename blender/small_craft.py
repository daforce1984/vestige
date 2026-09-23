"""v4 small craft (original designs after the user's workhorse strike-craft reference):
wingless, chunky, space-native. Central cockpit spine between two thick rounded side pods, clusters of 3
hexagonal thruster housings under each pod, exposed machinery + glowing finned radiator between the pods,
yellow A-frame brackets, two thin top-rear exhausts. Blender space: nose -Y, up +Z."""
import math
from mathutils import Vector
from lib import MB, reg, rng, lerp, D2R
from shipkit import Hull, HEX, BOX8, plate, armor, obox, deep_nozzle, spine


def superellipse(n=16, p=4.0):
    pts = []
    for i in range(n):
        a = (i + 0.5) / n * 2 * math.pi
        c, s = math.cos(a), math.sin(a)
        pts.append((math.copysign(abs(c) ** (2 / p), c), math.copysign(abs(s) ** (2 / p), s)))
    return pts


ROUND = superellipse(16, 4.0)
ANGULAR = [(1, -0.55), (1, 0.35), (0.7, 1), (-0.7, 1), (-1, 0.35), (-1, -0.55), (-0.6, -1), (0.6, -1)]


def tri_decal(mb, pos, n, size, mat):
    """Small warning triangle as a thin triangular prism lying on the surface."""
    pos, n = Vector(pos), Vector(n).normalized()
    mb.cyl(pos, pos + n * 0.02, size, size, mat, seg=3)


def hex_thruster(mb, c, d, r, L, mats, lights=True):
    """Hexagonal thruster housing along direction d with a deep bell and yellow slit lights."""
    c, d = Vector(c), Vector(d).normalized()
    mb.cyl(c - d * L * 0.5, c + d * L * 0.5, r, r * 0.92, mats['mech'], seg=6, bevel=r * 0.05)
    deep_nozzle(mb, c + d * L * 0.45, d, r * 0.62, mats['metal'], mats['mech'], mats['engine'], depth=1.1, seg=12,
                ribs=False)
    mb.cyl(c - d * L * 0.5, c - d * L * 0.62, r * 0.7, r * 0.6, mats['mech'], seg=6)
    if lights:
        side = d.cross(Vector((0, 0, 1)))
        side = side.normalized() if side.length > 0.1 else Vector((1, 0, 0))
        for sg in (1, -1):
            p = c + side * sg * r * 0.9 - d * L * 0.1
            obox(mb, p, side * sg, (0.03, L * 0.45, 0.02), mats['lamp'], lift=0.0, fwd=d)


def radiator_stack(mb, c, w, L, n_fins, h, mats):
    c = Vector(c)
    mb.box(c, (w, L, 0.08), mats['mech'], bevel=0.02)
    for k in range(n_fins):
        y = c.y - L / 2 + L * (k + 0.5) / n_fins
        mb.box((c.x, y, c.z + h / 2 + 0.04), (w * 0.94, 0.035, h), mats['heat'])
    for sx in (-1, 1):
        mb.box((c.x + sx * (w / 2 + 0.02), c.y, c.z + h / 2), (0.04, L, h + 0.08), mats['mech'])


def a_frame(mb, a, b, c_, t, mat):
    """Yellow A-frame bracket: two bars from a and b meeting at c_."""
    for p in (a, b):
        mb.cyl(p, c_, t, t, mat, seg=6)
    mb.cyl(a, b, t * 0.8, t * 0.8, mat, seg=6)


def build_craft(pal, prof, R, angular=False):
    m = pal
    mb = MB()
    # ---------------- central cockpit spine
    SP = Hull([(-3.4, 0.8, 0.8, 0.15), (-2.8, 1.0, 1.0, 0.2), (1.6, 1.0, 1.1, 0.25), (3.1, 0.75, 0.85, 0.2),
               (3.8, 0.35, 0.4, 0.1)], BOX8 if not angular else ANGULAR)
    SP.build(mb, m['mech'])
    armor(mb, SP, [-3.3, -1.9, -0.6, 0.8, 2.2, 3.6], [0.05, 2.0, 4.0, 6.0, 7.95],
          lambda i, j, R: m['spine'] if (i + j) % 3 else m['pod'], R, thick=0.05, gap_s=0.05, gap_p=0.04,
          sub_prob=0.3, sub_mat=m['pod2'])
    # framed canopy on the spine nose
    C = Hull([(1.4, 0.45, 0.3, 0.86), (1.9, 0.7, 0.42, 0.9), (2.8, 0.6, 0.34, 0.8), (3.25, 0.25, 0.14, 0.66)], HEX)
    C.build(mb, m['glass'])
    for s in (1.95, 2.35, 2.75):
        for p in (0.5, 1.5, 2.5):
            pos, n = C.pt(s, p, 0.0)
            obox(mb, pos, n, (0.04, 0.05, 0.03), m['metal'], lift=0.0)
    mb.box((0, -3.0, 0.62), (0.4, 0.6, 0.35), m['mech'], bevel=0.04)          # spine rear hatch block
    spine(mb, (0.15, -2.9, 0.8), (0.18, -3.6, 1.6), 0.02, m['metal'], nodes=2)
    # ---------------- side pods
    for sx in (1, -1):
        cx = sx * 1.55
        if angular:
            P = Hull([(-3.5, 1.1, 1.1, 0.0, cx), (-3.1, 1.5, 1.35, 0.0, cx), (1.2, 1.5, 1.35, 0.05, cx),
                      (2.6, 1.0, 0.9, 0.0, cx + sx * 0.1), (3.3, 0.2, 0.25, -0.1, cx + sx * 0.2)], prof)
        else:
            P = Hull([(-3.4, 1.2, 1.2, 0.0, cx), (-3.0, 1.55, 1.45, 0.0, cx), (1.3, 1.55, 1.45, 0.05, cx),
                      (2.4, 1.3, 1.2, 0.0, cx), (2.8, 0.7, 0.7, 0.0, cx)], prof)
        P.build(mb, m['mech'])
        # armour panels with seams (dark core shows through), grime variants + raised hatch panels
        n = P.n
        q = n // 4
        armor(mb, P, [-3.35, -2.1, -0.9, 0.4, 1.5, 2.5], [0.02 + k * q for k in range(4)] + [n - 0.02],
              lambda i, j, R: m['pod'] if R.random() < 0.72 else m['pod2'], R, thick=0.06, gap_s=0.05, gap_p=0.05,
              ch=0.05)
        if not angular:   # painted nose cap
            tip = P.st[-1][0]
            plate(mb, P, 2.55, tip - 0.02, 0.0, float(n), m['pod2'], off=0.0, thick=0.05, ch=0.04)
        for (a, b) in ((-2.9, -2.3), (-0.6, 0.1)):
            plate(mb, P, a, b, n * 0.15, n * 0.33, m['pod2'], off=0.06, thick=0.03, ch=0.03)
            plate(mb, P, a, b, n * 0.67, n * 0.85, m['pod2'], off=0.06, thick=0.03, ch=0.03)
        for k in range(4):   # accent band + vents
            pos, nn = P.pt(-1.5 + k * 0.12, n * 0.25, 0.06)
            obox(mb, pos, nn, (0.5, 0.06, 0.02), m['mech'], lift=0.0)
        for pp in (n * 0.02, n * 0.52):
            s0 = -2.05
            plate(mb, P, s0, s0 + 0.15, pp + 0.3, pp + q * 2 - 0.3, m['spine'], off=0.06, thick=0.02, ch=0.02)
        # chipped paint / rust wear + warning triangles + registry blocks
        for _ in range(26):
            s = R.uniform(-2.9, 1.8)
            p = R.uniform(0, n)
            pos, nn = P.pt(s, p, 0.065)
            obox(mb, pos, nn, (R.uniform(0.05, 0.18), R.uniform(0.05, 0.25), 0.012), m['rust'], lift=0.0)
        outer = n * 0.0 if sx > 0 else n * 0.5
        pos, nn = P.pt(0.9, outer + 0.6, 0.07)
        tri_decal(mb, pos, nn, 0.12, m['yellow'])
        pos, nn = P.pt(-2.4, outer + n * 0.08, 0.07)
        tri_decal(mb, pos, nn, 0.09, m['orange'])
        for k in range(3):
            pos, nn = P.pt(-0.8 + k * 0.18, outer + n * 0.1, 0.07)
            obox(mb, pos, nn, (0.1, 0.12, 0.012), m['mech'], lift=0.0)
        # 3 hex thruster housings under each pod, aft-pointing and canted down
        for k, dx in enumerate((-0.45, 0.0, 0.45)):
            c = Vector((cx + dx, 1.9 + (0.15 if k == 1 else 0), -0.95))
            hex_thruster(mb, c, (0, 1, -0.28), 0.26, 1.5, m)
        mb.box((cx, 1.9, -0.6), (1.35, 1.4, 0.2), m['mech'], bevel=0.03)   # thruster mounting plate
        # thin top-rear exhaust
        deep_nozzle(mb, (cx, 3.3, 0.55), (0, 1, 0.25), 0.14, m['metal'], m['mech'], m['engine'], depth=1.4,
                    seg=10, ribs=False)
        mb.cyl((cx, 2.6, 0.55), (cx, 3.35, 0.58), 0.18, 0.16, m['mech'], seg=10)
        # yellow A-frame brackets pod -> spine (fore and aft)
        for y in (-1.8, 1.2):
            a_frame(mb, Vector((sx * 0.5, y - 0.4, 0.25)), Vector((sx * 0.5, y + 0.4, 0.25)),
                    Vector((sx * 0.9, y, 0.5)), 0.045, m['yellow'])
        # RCS quads on the pod noses/tails
        for y, z in ((-2.9, 0.45), (2.3, -0.5)):
            mb.box((cx + sx * 0.7, y, z), (0.16, 0.22, 0.16), m['mech'], bevel=0.02)
            mb.cyl((cx + sx * 0.78, y, z), (cx + sx * 0.92, y, z), 0.035, 0.05, m['metal'], seg=6)
        mb.sphere((cx + sx * 0.78, -0.4, 0.1), 0.04, m['lamp'], seg=6, rings=3)
    # ---------------- exposed machinery between the pods
    for sx in (1, -1):
        mb.cyl((sx * 0.62, -2.6, 0.05), (sx * 0.62, 2.2, 0.05), 0.07, 0.07, m['metal'], seg=8)   # main pipes
        mb.cyl((sx * 0.7, -2.4, -0.25), (sx * 0.7, 1.8, -0.25), 0.05, 0.05, m['mech'], seg=8)
        for y in (-1.2, 0.4):                                                                  # pistons
            mb.cyl((sx * 0.55, y, -0.35), (sx * 0.85, y + 0.5, -0.1), 0.06, 0.06, m['metal'], seg=8)
            mb.cyl((sx * 0.85, y + 0.5, -0.1), (sx * 1.0, y + 0.7, 0.0), 0.08, 0.08, m['mech'], seg=8)
        for k in range(5):                                                                     # cable clamps
            mb.cyl((sx * 0.62, -2.2 + k * 1.0, 0.05), (sx * 0.62, -2.08 + k * 1.0, 0.05), 0.1, 0.1, m['mech'],
                   seg=8)
    mb.box((0, -1.0, -0.45), (1.1, 2.4, 0.3), m['mech'], bevel=0.03)                              # boxy frame
    mb.box((0, 0.9, -0.5), (0.9, 1.2, 0.25), m['metal'], bevel=0.03)
    radiator_stack(mb, (0, 0.6, 0.72), 0.7, 1.9, 9, 0.28, m)                                     # glowing heat-sink
    # chin gun on the spine
    mb.box((0, -2.4, -0.55), (0.34, 0.8, 0.26), m['mech'], bevel=0.03)
    for x in (-0.08, 0.08):
        mb.cyl((x, -2.7, -0.58), (x, -4.2, -0.58), 0.035, 0.03, m['metal'], seg=8)
    return mb


def interceptor():
    reg('pod', (0.27, 0.44, 0.40), 0.25, 0.55)      # pale teal paint
    reg('pod2', (0.19, 0.31, 0.29), 0.25, 0.6)      # grime-darkened teal
    reg('spine', (0.62, 0.56, 0.44), 0.25, 0.55)    # Hiigaran sand/off-white
    reg('rust', (0.30, 0.10, 0.04), 0.3, 0.7)       # chipped paint / rust wear
    reg('yellow', (0.85, 0.58, 0.05), 0.25, 0.5)
    reg('orange', (0.9, 0.3, 0.03), 0.25, 0.5)
    reg('metal', (0.55, 0.55, 0.57), 0.9, 0.3)
    reg('mech', (0.06, 0.062, 0.068), 0.8, 0.45)
    reg('glass', (0.03, 0.06, 0.09), 0.0, 0.05)
    reg('heat', (0.4, 0.05, 0.02), 0.0, 0.4, (1.0, 0.22, 0.05), 4.0)
    reg('lamp', (0.4, 0.3, 0.05), 0.0, 0.4, (1.0, 0.8, 0.2), 4.0)
    reg('engine', (0.1, 0.15, 0.2), 0.0, 0.3, (0.5, 0.75, 1.0), 3.0)
    pal = {k: k for k in ('pod', 'pod2', 'spine', 'rust', 'yellow', 'orange', 'metal', 'mech', 'glass', 'heat', 'lamp',
                          'engine')}
    mb = build_craft(pal, ROUND, rng(401))
    return [mb.to_object('interceptor', smooth_angle=30)]


def enemy_fighter():
    reg('armor', (0.30, 0.018, 0.022), 0.25, 0.55)  # crimson paint
    reg('armor2', (0.16, 0.012, 0.016), 0.25, 0.6)  # grime-darkened crimson
    reg('plate_k', (0.075, 0.075, 0.085), 0.25, 0.55)
    reg('rust', (0.20, 0.07, 0.03), 0.3, 0.7)
    reg('yellow', (0.85, 0.58, 0.05), 0.25, 0.5)
    reg('orange', (0.9, 0.3, 0.03), 0.25, 0.5)
    reg('steel', (0.5, 0.49, 0.5), 0.9, 0.3)
    reg('char', (0.035, 0.035, 0.042), 0.8, 0.45)
    reg('glass', (0.1, 0.015, 0.01), 0.0, 0.05)
    reg('vent', (0.4, 0.08, 0.02), 0.0, 0.4, (1.0, 0.32, 0.06), 4.0)
    reg('lamp', (0.4, 0.2, 0.05), 0.0, 0.4, (1.0, 0.5, 0.1), 4.0)
    reg('engine', (0.3, 0.1, 0.05), 0.0, 0.3, (1.0, 0.38, 0.1), 3.0)
    pal = {'pod': 'armor', 'pod2': 'armor2', 'spine': 'plate_k', 'rust': 'rust', 'yellow': 'yellow',
           'orange': 'orange', 'metal': 'steel', 'mech': 'char', 'glass': 'glass', 'heat': 'vent', 'lamp': 'lamp',
           'engine': 'engine'}
    mb = build_craft(pal, ANGULAR, rng(411), angular=True)
    # extra aggression: forward blade spikes on the pod noses + dorsal knife on the spine
    for sx in (1, -1):
        c = Vector((sx * 1.75, -3.3, 0.0))
        mb.hexa([c + Vector((0, 0.6, -0.05)), c + Vector((sx * 0.25, 0.6, -0.05)), c + Vector((sx * 0.1, -1.2, -0.02)),
                 c + Vector((0, -1.25, -0.02)), c + Vector((0, 0.6, 0.05)), c + Vector((sx * 0.25, 0.6, 0.05)),
                 c + Vector((sx * 0.1, -1.2, 0.02)), c + Vector((0, -1.25, 0.02))], 'steel')
    mb.hexa([(-0.04, 2.6, 0.75), (0.04, 2.6, 0.75), (0.04, 0.5, 0.75), (-0.04, 0.5, 0.75),
             (-0.02, 2.2, 1.3), (0.02, 2.2, 1.3), (0.02, 1.4, 1.1), (-0.02, 1.4, 1.1)], 'armor')
    mb.bm.transform(__import__('mathutils').Matrix.Scale(1.1, 4))
    return [mb.to_object('enemy_fighter', smooth_angle=30)]
