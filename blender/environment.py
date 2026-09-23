"""Gravity well generator, hangar interior, debris chunks."""
import math
import bmesh
from mathutils import Vector, Matrix, noise
from lib import MB, reg, empty, rng, annulus, lerp, D2R, frame_ring, circle_prof, PROF_OCT


# =====================================================================================
#  Gravity well: ring axis = glTF Z = Blender -Y. Ring lies in Blender XZ plane.
# =====================================================================================
def gw_palette():
    reg('gw_metal', (0.09, 0.09, 0.11), 0.9, 0.3)
    reg('gw_dark', (0.025, 0.025, 0.03), 0.8, 0.45)
    reg('gw_trim', (0.22, 0.2, 0.24), 0.9, 0.25)
    reg('core', (0.002, 0.002, 0.003), 0.9, 0.08)
    reg('violet', (0.2, 0.05, 0.35), 0.0, 0.3, (0.62, 0.22, 1.0), 4.0)


def polar(r, a, y):
    """Point at radius r, angle a (radians) in the ring plane (Blender XZ), depth y."""
    return Vector((math.cos(a) * r, y, math.sin(a) * r))


def ring_block(mb, r0, r1, a0, a1, y0, y1, mat, bevel=0.0, taper=0.0):
    """Curved block between radii r0..r1, angles a0..a1, depth y0..y1 (1 segment per ~3 deg)."""
    n = max(1, int(abs(a1 - a0) / (3 * D2R)))
    rings = []
    for i in range(n + 1):
        a = lerp(a0, a1, i / n)
        yi0, yi1 = y0 + taper, y1 - taper
        rings.append([polar(r0, a, yi0), polar(r1, a, y0), polar(r1, a, y1), polar(r0, a, yi1)])
    mb.loft(rings, mat, bevel=bevel)


def gravity_well():
    gw_palette()
    R = rng(61)
    # ---------------- ring
    mb = MB()
    NSEG = 16
    RI, RO, DEP = 90.0, 106.0, 20.0
    for i in range(NSEG):
        a0 = i / NSEG * 2 * math.pi + 1.2 * D2R
        a1 = (i + 1) / NSEG * 2 * math.pi - 1.2 * D2R
        am = (a0 + a1) / 2
        ring_block(mb, RI, RO, a0, a1, -DEP / 2, DEP / 2, 'gw_metal', bevel=0.4, taper=2.0)
        # stepped outer armour
        ring_block(mb, RO - 1, RO + 3.5, a0 + 2 * D2R, a1 - 2 * D2R, -DEP / 2 + 3, DEP / 2 - 3, 'gw_dark', bevel=0.3)
        # front/back face plates (raised)
        for sy in (1, -1):
            ring_block(mb, RI + 3, RO - 3, a0 + 1.5 * D2R, a1 - 1.5 * D2R, sy * DEP / 2 - 0.5, sy * DEP / 2 + sy * 1.2,
                       'gw_trim', bevel=0.2)
            # violet strips on each face
            ring_block(mb, RI + 7.2, RI + 8.2, a0 + 3 * D2R, a1 - 3 * D2R, sy * (DEP / 2 + 1.1),
                       sy * (DEP / 2 + 1.4), 'violet')
        # inner-face violet channel
        ring_block(mb, RI - 0.6, RI + 0.2, a0 + 2 * D2R, a1 - 2 * D2R, -2.0, 2.0, 'violet')
        ring_block(mb, RI - 1.2, RI + 0.5, a0 + 1 * D2R, a1 - 1 * D2R, -6.5, -3.0, 'gw_trim')
        ring_block(mb, RI - 1.2, RI + 0.5, a0 + 1 * D2R, a1 - 1 * D2R, 3.0, 6.5, 'gw_trim')
        # joint collars between segments
        aj = i / NSEG * 2 * math.pi
        ring_block(mb, RI - 2.5, RO + 5, aj - 1.8 * D2R, aj + 1.8 * D2R, -DEP / 2 - 2.5, DEP / 2 + 2.5, 'gw_trim',
                   bevel=0.3)
        # big outward spike per segment, smaller pair beside
        base = polar(RO + 3, am, 0)
        tip = polar(RO + 34, am, 0)
        _spike(mb, am, RO + 3, RO + 34, 7.0, 5.0, 'gw_dark')
        for off in (-6.5, 6.5):
            _spike(mb, am + off * D2R, RO + 3, RO + 16, 3.0, 2.4, 'gw_metal')
        # violet glow slit on spike root
        ring_block(mb, RO + 3.4, RO + 10, am - 0.6 * D2R, am + 0.6 * D2R, -1.2, 1.2, 'violet')
        # rear radiator fins (+Y side)
        for k in range(3):
            ak = lerp(a0, a1, (k + 1) / 4)
            p0 = polar((RI + RO) / 2, ak, DEP / 2 + 1)
            mb.box(p0 + Vector((0, 2.5, 0)), (1.0, 5, 7), 'gw_dark', rot=(0, -ak / D2R, 0))
    ring = mb.to_object('ring')

    # ---------------- core
    mb = MB()
    mb.sphere((0, 0, 0), 25.0, 'core', seg=48, rings=24)
    core = mb.to_object('core', smooth_angle=80)

    # ---------------- pylons (static spokes holding the core, inside the ring)
    mb = MB()
    for k in range(3):
        a = (90 + k * 120) * D2R
        d = polar(1, a, 0)
        side = Vector((-d.z, 0, d.x))
        # main spoke loft from core surface to r=84
        rings = []
        for r, w, h in ((24, 6, 8), (34, 9, 12), (60, 7, 10), (78, 10, 13), (84, 12, 15)):
            c = d * r
            rings.append(frame_ring(c, side, (0, 1, 0), w, h, PROF_OCT))
        mb.loft(rings, 'gw_metal', bevel=0.25)
        # emitter head near core
        mb.cyl(d * 27, d * 35, 7.5, 5.5, 'gw_dark', seg=16)
        for rr in (29, 32):
            mb.cyl(d * rr, d * (rr + 0.8), 8.5, 8.5, 'violet', seg=16)
        # violet conduit lines along the spoke
        for sy in (1, -1):
            mb.cyl(d * 38 + Vector((0, sy * 5.3, 0)), d * 78 + Vector((0, sy * 5.3, 0)), 0.6, 0.6, 'violet', seg=6)
        # side fins
        for ss in (1, -1):
            p0 = d * 44 + side * ss * 3.0
            p1 = d * 72 + side * ss * 3.0
            mb.hexa([p0 + Vector((0, -1, 0)), p1 + Vector((0, -1, 0)), p1 + side * ss * 6 + Vector((0, -0.5, 0)),
                     p0 + side * ss * 12 + Vector((0, -0.5, 0)),
                     p0 + Vector((0, 1, 0)), p1 + Vector((0, 1, 0)), p1 + side * ss * 6 + Vector((0, 0.5, 0)),
                     p0 + side * ss * 12 + Vector((0, 0.5, 0))], 'gw_dark')
        # stabiliser outboard (behind the ring plane, doesn't intersect the rotating ring)
        mb.box(d * 81, (9, 12, 9), 'gw_trim', rot=(0, -a / D2R, 0))
    pylons = mb.to_object('pylons')
    return [ring, core, pylons]


def _spike(mb, a, r0, r1, w, d, mat):
    rad = polar(1, a, 0)
    tang = Vector((-math.sin(a), 0, math.cos(a)))
    base = rad * r0
    rings = [frame_ring(base, tang, (0, 1, 0), w, d, [(1, 0), (0, 1), (-1, 0), (0, -1)]),
             frame_ring(rad * lerp(r0, r1, 0.35), tang, (0, 1, 0), w * 0.55, d * 0.7, [(1, 0), (0, 1), (-1, 0), (0, -1)]),
             rad * r1]
    mb.loft(rings, mat)


# =====================================================================================
#  Hangar: tunnel z -60..+30 (glTF) -> Blender y +60..-30 ; x -12..12 ; z 0..22. Open at glTF +Z (Blender -Y).
# =====================================================================================
def hangar_palette():
    reg('deck', (0.16, 0.165, 0.175), 0.7, 0.55)
    reg('deck_dark', (0.06, 0.065, 0.07), 0.6, 0.6)
    reg('wall', (0.23, 0.235, 0.25), 0.6, 0.5)
    reg('rib', (0.33, 0.33, 0.35), 0.75, 0.4)
    reg('pipe', (0.28, 0.24, 0.18), 0.7, 0.45)
    reg('hazard', (0.8, 0.5, 0.02), 0.2, 0.5)
    reg('hazard_k', (0.02, 0.02, 0.02), 0.2, 0.5)
    reg('rail', (0.5, 0.5, 0.52), 0.95, 0.2)
    reg('guide', (0.1, 0.3, 0.4), 0.0, 0.3, (0.3, 0.75, 1.0), 5.0)
    reg('lamp', (0.4, 0.38, 0.33), 0.0, 0.3, (1.0, 0.92, 0.78), 5.0)
    reg('signal', (0.4, 0.05, 0.02), 0.0, 0.3, (1.0, 0.15, 0.05), 5.0)


def hangar():
    hangar_palette()
    R = rng(71)
    mb = MB()
    Y0, Y1 = -30.0, 60.0          # open end, back wall
    L = Y1 - Y0
    W, H = 12.0, 22.0
    yc = (Y0 + Y1) / 2
    # shell (thick slabs, inner faces at x=+-12, z=0/22, y=60)
    mb.box((0, yc, -1.0), (2 * W + 4, L, 2.0), 'deck_dark')
    for sd in (1, -1):
        mb.box((sd * (W + 1.0), yc, H / 2), (2.0, L, H + 4), 'wall')
    mb.box((0, yc, H + 1.0), (2 * W + 4, L, 2.0), 'wall')
    mb.box((0, Y1 + 1.0, H / 2), (2 * W + 4, 2.0, H + 4), 'wall')
    # ---- deck plates with seams (top at z=0), leaving the catapult channel |x|<2.3
    for i in range(int(L / 6)):
        y = Y0 + 3 + i * 6
        for x0, x1 in ((2.3, 6.8), (6.8, 12.0), (-6.8, -2.3), (-12.0, -6.8)):
            mb.box(((x0 + x1) / 2, y, -0.25), (abs(x1 - x0) - 0.14, 5.86, 0.5),
                   'deck' if (i + int(x0)) % 3 else 'deck_dark', bevel=0.04)
    # catapult channel: floor, rails, guide lights
    mb.box((0, yc, -0.7), (4.6, L, 0.2), 'deck_dark')
    for sd in (1, -1):
        mb.box((sd * 1.3, yc, -0.35), (0.45, L, 0.5), 'rail', bevel=0.05)     # rail, top at z=-0.1
        mb.box((sd * 2.45, yc, -0.25), (0.3, L, 0.5), 'rib')                   # channel lip
        for k in range(int(L / 3)):
            y = Y0 + 1.5 + k * 3
            mb.box((sd * 2.45, y, 0.02), (0.22, 1.0, 0.08), 'guide')
            if k % 2 == 0:
                mb.box((sd * 6.8, y, 0.01), (0.12, 0.5, 0.05), 'guide')
    # catapult shuttle / foot clamps at origin (top flush with deck, z=0)
    for sd in (1, -1):
        mb.box((sd * 1.3, 0.0, -0.3), (2.2, 4.4, 0.6), 'hazard', bevel=0.05)
        mb.box((sd * 1.3, -2.4, 0.15), (2.2, 0.35, 0.3), 'rib', bevel=0.04)       # toe stop
        mb.box((sd * 1.3, 2.2, 0.2), (2.2, 0.35, 0.4), 'rib', bevel=0.04)        # heel stop
    mb.box((0, 0, -0.35), (0.6, 4.0, 0.5), 'hazard_k')
    # hazard stripes at the launch lip (open end)
    for k in range(16):
        x = -11.25 + k * 1.5
        mb.hexa([(x - 0.75, Y0 + 0.2, 0.0), (x, Y0 + 0.2, 0.0), (x + 0.75, Y0 + 2.0, 0.0), (x, Y0 + 2.0, 0.0),
                 (x - 0.75, Y0 + 0.2, 0.03), (x, Y0 + 0.2, 0.03), (x + 0.75, Y0 + 2.0, 0.03), (x, Y0 + 2.0, 0.03)],
                'hazard' if k % 2 else 'hazard_k')
    # ---- ribs / arches every 7.5
    ribs = [Y0 + 1.5 + k * 7.5 for k in range(12)]
    for y in ribs:
        for sd in (1, -1):
            mb.box((sd * (W - 0.5), y, H / 2), (1.2, 1.3, H), 'rib', bevel=0.08)
            # corner brace
            mb.hexa([(sd * (W - 0.2), y - 0.55, H - 5), (sd * (W - 0.2), y + 0.55, H - 5),
                     (sd * (W - 1.1), y + 0.55, H - 5), (sd * (W - 1.1), y - 0.55, H - 5),
                     (sd * (W - 0.2), y - 0.55, H), (sd * (W - 0.2), y + 0.55, H),
                     (sd * (W - 5), y + 0.55, H), (sd * (W - 5), y - 0.55, H)], 'rib')
        mb.box((0, y, H - 0.7), (2 * W, 1.3, 1.4), 'rib', bevel=0.08)
    # big door frame at the open end
    for sd in (1, -1):
        mb.box((sd * (W - 1.0), Y0 + 0.8, H / 2), (2.2, 1.6, H), 'wall', bevel=0.1)
        for k in range(8):
            mb.box((sd * (W - 2.15), Y0 + 0.8, 1.2 + k * 2.6), (0.12, 1.4, 1.3), 'hazard' if k % 2 else 'hazard_k')
    mb.box((0, Y0 + 0.8, H - 1.2), (2 * W, 1.6, 2.4), 'wall', bevel=0.1)
    for k in range(5):
        mb.box((-8 + k * 4, Y0 - 0.05, H - 1.6), (0.9, 0.2, 0.4), 'signal')
    # ---- wall panels between ribs + pipes
    for a, b in zip(ribs, ribs[1:]):
        for sd in (1, -1):
            for z0, z1 in ((1.0, 6.5), (7.2, 13.0), (14.5, 20.0)):
                mb.box((sd * (W - 0.15), (a + b) / 2, (z0 + z1) / 2), (0.3, b - a - 1.8, z1 - z0), 'wall', bevel=0.05)
            if R.random() < 0.6:  # wall equipment boxes
                mb.box((sd * (W - 0.9), (a + b) / 2 + R.uniform(-1.5, 1.5), 1.4), (1.6, R.uniform(1.5, 3), 2.8),
                       R.choice(['rib', 'deck_dark', 'pipe']), bevel=0.08)
            # small status light
            mb.box((sd * (W - 0.35), (a + b) / 2, 6.85), (0.1, 2.0, 0.18), 'guide')
    for sd in (1, -1):
        for z, r in ((3.2, 0.35), (3.95, 0.35), (4.7, 0.25), (17.0, 0.45), (18.1, 0.3)):
            mb.cyl((sd * (W - 1.5 - r), Y0 + 1, z), (sd * (W - 1.5 - r), Y1, z), r, r, 'pipe', seg=10)
        for y in ribs[1::2]:
            mb.cyl((sd * (W - 2.6), y + 2.5, 0), (sd * (W - 2.6), y + 2.5, H), 0.3, 0.3, 'pipe', seg=8)
            for z in (3.2, 3.95, 17.0):
                mb.cyl((sd * (W - 1.2), y + 0.9, z), (sd * (W - 2.6), y + 0.9, z), 0.5, 0.5, 'rib', seg=8)
    # ---- catwalks (z=10) with railings
    for sd in (1, -1):
        xw = sd * (W - 1.6)
        mb.box((xw, yc + 4, 10.0), (2.4, L - 10, 0.25), 'deck', bevel=0.03)
        mb.box((sd * (W - 2.85), yc + 4, 11.05), (0.08, L - 10, 0.08), 'rail')
        mb.box((sd * (W - 2.85), yc + 4, 10.55), (0.06, L - 10, 0.06), 'rail')
        for k in range(int((L - 10) / 2.5)):
            y = Y0 + 1 + 4 + k * 2.5
            mb.box((sd * (W - 2.85), y, 10.55), (0.07, 0.07, 1.05), 'rail')
        for y in ribs:
            mb.hexa([(sd * (W - 0.3), y - 0.2, 8.0), (sd * (W - 0.3), y + 0.2, 8.0), (sd * (W - 0.6), y + 0.2, 8.0),
                     (sd * (W - 0.6), y - 0.2, 8.0), (sd * (W - 0.3), y - 0.2, 9.9), (sd * (W - 0.3), y + 0.2, 9.9),
                     (sd * (W - 2.8), y + 0.2, 9.9), (sd * (W - 2.8), y - 0.2, 9.9)], 'rib')
    # ---- ceiling lamps (two rows between ribs) + central gantry rail
    for a, b in zip(ribs, ribs[1:]):
        ym = (a + b) / 2
        for x in (-6.0, 6.0):
            mb.box((x, ym, H - 0.25), (1.8, 4.6, 0.5), 'rib', bevel=0.05)
            mb.box((x, ym, H - 0.55), (1.3, 4.1, 0.12), 'lamp')
        mb.box((0, ym, H - 0.35), (0.8, 2.0, 0.3), 'lamp')
    for sd in (1, -1):
        mb.box((sd * 2.5, yc, H - 1.8), (0.6, L, 0.8), 'rib')
    # overhead gantry crane near the back
    mb.box((0, 44, H - 3.2), (2 * W - 1, 2.0, 1.6), 'hazard', bevel=0.1)
    mb.box((3, 44, H - 4.6), (2.4, 2.4, 1.4), 'rib', bevel=0.1)
    mb.cyl((3, 44, H - 5.3), (3, 44, H - 9.0), 0.06, 0.06, 'rail', seg=6)
    # back wall: big blast door + lights
    mb.box((0, Y1 - 0.2, 9), (14, 0.6, 18), 'deck_dark', bevel=0.1)
    mb.box((0, Y1 - 0.5, 9), (0.3, 0.3, 18), 'hazard')
    for x in (-7.6, 7.6):
        mb.box((x, Y1 - 0.4, 9), (1.0, 0.6, 18.4), 'rib', bevel=0.08)
    for k in range(6):
        mb.box((-5 + k * 2, Y1 - 0.6, 19.2), (0.8, 0.2, 0.4), 'lamp')
    # side deck equipment: launch control consoles, cranes
    for sd in (1, -1):
        for y in (-18, 30):
            mb.box((sd * 9.5, y, 0.8), (2.5, 3.0, 1.6), 'rib', bevel=0.1)
            mb.box((sd * 9.5, y - 1.3, 1.45), (2.0, 0.2, 0.5), 'guide')
    return [mb.to_object('hangar')]


# =====================================================================================
#  Debris: rock0..3 (asteroid chunks 5-15), hull0..3 (twisted hull plates ~8), each centered at origin
# =====================================================================================
def debris_palette():
    reg('rock', (0.14, 0.12, 0.10), 0.05, 0.9)
    reg('rock_dark', (0.07, 0.065, 0.06), 0.05, 0.95)
    reg('hull', (0.62, 0.55, 0.41), 0.25, 0.5)
    reg('rust', (0.40, 0.07, 0.035), 0.3, 0.5)
    reg('scorch', (0.03, 0.028, 0.025), 0.4, 0.8)
    reg('metal', (0.3, 0.3, 0.32), 0.8, 0.4)


def _rock(name, size, seed):
    R = rng(seed)
    mb = MB()
    r = size / 2
    res = bmesh.ops.create_icosphere(mb.bm, subdivisions=4, radius=r)
    sx, sy, sz = R.uniform(0.8, 1.25), R.uniform(0.6, 1.0), R.uniform(0.55, 0.9)
    off = Vector((R.uniform(0, 100), R.uniform(0, 100), R.uniform(0, 100)))
    # a few flat fracture planes
    planes = [(Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1))).normalized(), R.uniform(0.55, 0.8) * r)
              for _ in range(3)]
    for v in res['verts']:
        p = v.co.copy()
        n = p.normalized()
        d = 1.0 + 0.28 * noise.fractal(n * 1.3 + off, 0.6, 2.0, 4) + 0.08 * noise.noise(n * 5 + off)
        p = n * r * d
        p = Vector((p.x * sx, p.y * sy, p.z * sz))
        for pn, pd in planes:
            h = p.dot(pn)
            if h > pd:
                p -= pn * (h - pd)
        v.co = p
    mi = mb._mi('rock')
    for f in mb.bm.faces:
        f.material_index = mi
    # darker crevices: faces pushed inward
    mi2 = mb._mi('rock_dark')
    for f in mb.bm.faces:
        c = f.calc_center_median()
        if noise.noise(c / (r * 0.4) + off) > 0.25:
            f.material_index = mi2
    # re-centre
    lo = Vector((min(v.co.x for v in mb.bm.verts), min(v.co.y for v in mb.bm.verts), min(v.co.z for v in mb.bm.verts)))
    hi = Vector((max(v.co.x for v in mb.bm.verts), max(v.co.y for v in mb.bm.verts), max(v.co.z for v in mb.bm.verts)))
    c = (lo + hi) / 2
    for v in mb.bm.verts:
        v.co -= c
    return mb.to_object(name, smooth_angle=50)


def _hull_plate(name, seed, length=8.0, width=4.2):
    R = rng(seed)
    mb = MB()
    bm = mb.bm
    nx, ny = 12, 6
    th = 0.3
    twist = R.uniform(25, 60) * D2R * R.choice((1, -1))
    bend = R.uniform(0.012, 0.035)
    def deform(x, y, z):
        t = (x / length + 0.5)
        a = twist * (t - 0.5)
        yy, zz = y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)
        zz += bend * (x * x) - bend * length * length / 8
        return Vector((x, yy, zz))
    # jagged outline: per-column random extents
    top_rows, bot_rows = [], []
    grid = []
    for i in range(nx + 1):
        x = -length / 2 + length * i / nx
        e0 = -width / 2 + (R.uniform(0, 0.9) if i in (0, nx) or R.random() < 0.3 else R.uniform(0, 0.25))
        e1 = width / 2 - (R.uniform(0, 1.2) if R.random() < 0.4 else R.uniform(0, 0.2))
        col = []
        for j in range(ny + 1):
            y = lerp(e0, e1, j / ny)
            xj = x + (R.uniform(-0.35, 0.35) if i in (0, nx) else 0)
            col.append((xj, y))
        grid.append(col)
    top = [[bm.verts.new(deform(x, y, th / 2)) for x, y in col] for col in grid]
    bot = [[bm.verts.new(deform(x, y, -th / 2)) for x, y in col] for col in grid]
    faces = []
    for i in range(nx):
        for j in range(ny):
            faces.append(bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1])))
            faces.append(bm.faces.new((bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j])))
    # rim
    loop = [(i, 0) for i in range(nx)] + [(nx, j) for j in range(ny)] + \
           [(i, ny) for i in range(nx, 0, -1)] + [(0, j) for j in range(ny, 0, -1)]
    for k in range(len(loop)):
        a, b = loop[k], loop[(k + 1) % len(loop)]
        faces.append(bm.faces.new((top[a[0]][a[1]], bot[a[0]][a[1]], bot[b[0]][b[1]], top[b[0]][b[1]])))
    mh, ms = mb._mi('hull'), mb._mi('scorch')
    for f in faces:
        c = f.calc_center_median()
        f.material_index = ms if (abs(c.x) > length * 0.36 or noise.noise(c * 0.7 + Vector((seed, 0, 0))) > 0.3) else mh
    # structural ribs underneath + a rust stripe on top
    for i in (2, 5, 8, 11):
        x = -length / 2 + length * i / nx
        p0, p1 = deform(x, grid[i][0][1] + 0.2, -th / 2 - 0.3), deform(x, grid[i][-1][1] - 0.2, -th / 2 - 0.3)
        mb.box((p0 + p1) / 2, (0.25, (p1 - p0).length, 0.6), 'metal',
               rot=(math.degrees(math.atan2(p1.z - p0.z, p1.y - p0.y)), 0, 0))
    for i in range(3, 9):
        x0 = -length / 2 + length * i / nx
        x1 = x0 + length / nx
        ym = R.uniform(-0.3, 0.3)
        p0, p1 = deform(x0, ym, th / 2 + 0.03), deform(x1, ym, th / 2 + 0.03)
        mb.box((p0 + p1) / 2, ((p1 - p0).length + 0.02, 0.8, 0.06), 'rust',
               rot=(math.degrees(twist * ((x0 + x1) / 2 / length)), 0, 0))
    # stepped armour layer + broken frame beams sticking out of the torn end
    for i in range(4, 10):
        x0 = -length / 2 + length * i / nx
        x1 = x0 + length / nx
        for yy in (-width * 0.3, width * 0.12):
            p0, p1 = deform(x0, yy, th / 2 + 0.12), deform(x1, yy, th / 2 + 0.12)
            if R.random() < 0.8:
                mb.box((p0 + p1) / 2, ((p1 - p0).length + 0.03, width * 0.3, 0.24), 'hull',
                       rot=(math.degrees(twist * ((x0 + x1) / 2 / length)), 0, 0), bevel=0.04)
    for k in range(3):
        y = lerp(-width * 0.35, width * 0.35, k / 2)
        p0 = deform(length * 0.3, y, -th / 2 - 0.25)
        p1 = deform(length / 2 + R.uniform(0.6, 1.8), y + R.uniform(-0.4, 0.4), -th / 2 - 0.25 + R.uniform(-0.5, 0.5))
        mb.cyl(p0, p1, 0.12, 0.08, 'metal', seg=6)
    for k in range(5):  # dead window strip
        x = -length * 0.2 + k * 0.7
        p = deform(x, width * 0.38, th / 2 + 0.02)
        mb.box(p, (0.45, 0.25, 0.06), 'scorch')
    return mb.to_object(name, smooth_angle=30)


def debris():
    debris_palette()
    objs = []
    for i, size in enumerate((5.0, 8.0, 11.0, 15.0)):
        objs.append(_rock('rock%d' % i, size, 100 + i))
    for i in range(4):
        objs.append(_hull_plate('hull%d' % i, 200 + i, length=R_len(i), width=4.4 + i * 0.3))
    return objs


def R_len(i):
    return (7.0, 8.0, 8.5, 9.0)[i]
