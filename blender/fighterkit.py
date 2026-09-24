"""v6 fighter toolkit (materials, profiles, smooth hulls, functional details) for fighters_ours.py /
fighters_enemy.py.  Fighter family: three variants per side, high-detail (50-70k tris), glTF metallic-roughness PBR.

  ours  (Hiigaran-style teal / sand / safety-yellow, rounded pods, yellow A-frames, hex thrusters)
    interceptor    A  strike interceptor  - twin rounded pods + cockpit spine (evolved v4 look)
    interceptor_b  B  heavy torpedo gunship - broad flat-bottom hull, twin torpedoes, sponson gun pods, 2x2 engines
    interceptor_c  C  fast scout / lancer - needle fuselage, forward rail lance, outrigger engine pods on swept arms
  enemy (crimson / charcoal / brass, faceted chiseled hulls, steel blades, glowing orange vent slits)
    enemy_fighter    A  evolved twin-pod blade fighter
    enemy_fighter_b  B  heavy bomber - arrowhead flying wing, ventral bomb racks, 4 engines, tail turret
    enemy_fighter_c  C  bladed interceptor - slim spine with forward-swept scythe wings and a single big engine

Blender space: nose -Y, up +Z, +X = model's left (port).  Hull station s = -y.
Material `engine` is used ONLY on the aft-facing glow discs inside the main nozzles (the engine finds thruster
positions from clusters of `engine` faces).  RCS / missile nozzles use `exhaust` (non-emissive).
"""
import math
import bmesh
from mathutils import Vector, Matrix
from lib import MB, reg, rng, lerp, D2R
from shipkit import Hull, plate, frame, digits

V = Vector
W = Matrix.Identity(4)      # world frame for cy()/bx() with world coordinates


# =============================================================================== materials
def mats_ours():
    #    name         base colour (linear)     metallic rough   emission              strength
    reg('paint_a', (0.245, 0.415, 0.385), 0.15, 0.52)                       # pale teal armour paint
    reg('paint_b', (0.600, 0.545, 0.430), 0.15, 0.50)                       # sand / off-white paint
    reg('trim', (0.780, 0.520, 0.045), 0.20, 0.45)                          # safety-yellow trim
    reg('metal', (0.630, 0.630, 0.650), 1.00, 0.30)                         # brushed aluminium / steel
    reg('gunmetal', (0.170, 0.178, 0.190), 0.90, 0.40)                      # dark machined frame
    reg('carbon', (0.030, 0.032, 0.036), 0.00, 0.80)                        # composite / rubber / seals
    reg('exhaust', (0.360, 0.300, 0.360), 1.00, 0.35)                       # heat-tinted titanium (violet-bronze)
    reg('glass', (0.012, 0.022, 0.032), 0.00, 0.05)                         # dark canopy glass
    reg('heat', (0.220, 0.050, 0.020), 0.00, 0.40, (1.00, 0.20, 0.04), 1.4)  # radiator fins (dull glow)
    reg('lamp_red', (0.30, 0.02, 0.02), 0.0, 0.30, (1.00, 0.06, 0.04), 8.0)
    reg('lamp_green', (0.02, 0.30, 0.08), 0.0, 0.30, (0.05, 1.00, 0.30), 8.0)
    reg('lamp_white', (0.40, 0.40, 0.40), 0.0, 0.30, (1.00, 0.95, 0.85), 8.0)
    reg('lamp', (0.40, 0.30, 0.05), 0.0, 0.40, (1.00, 0.75, 0.25), 4.0)     # amber utility lights
    reg('engine', (0.10, 0.15, 0.20), 0.0, 0.30, (0.50, 0.75, 1.00), 3.0)
    reg('nozzle_glow', (0.10, 0.15, 0.20), 0.0, 0.30, (0.50, 0.75, 1.00), 2.2)


def mats_enemy():
    reg('paint_a', (0.300, 0.020, 0.024), 0.20, 0.50)                       # crimson armour paint
    reg('paint_b', (0.070, 0.070, 0.080), 0.20, 0.58)                       # charcoal paint
    reg('trim', (0.520, 0.380, 0.160), 0.30, 0.45)                          # aged-brass trim
    reg('metal', (0.560, 0.555, 0.560), 1.00, 0.26)                         # polished steel (blades)
    reg('gunmetal', (0.100, 0.100, 0.112), 0.90, 0.42)                      # dark machined frame
    reg('carbon', (0.028, 0.026, 0.028), 0.00, 0.80)                        # composite / rubber / seals
    reg('exhaust', (0.450, 0.330, 0.220), 1.00, 0.35)                       # heat-tinted steel (straw-bronze)
    reg('glass', (0.050, 0.008, 0.006), 0.00, 0.05)                         # red-tinted canopy glass
    reg('heat', (0.400, 0.080, 0.020), 0.00, 0.40, (1.00, 0.32, 0.06), 3.0)  # glowing vent slits
    reg('lamp_red', (0.30, 0.02, 0.02), 0.0, 0.30, (1.00, 0.06, 0.04), 8.0)
    reg('lamp_green', (0.02, 0.30, 0.08), 0.0, 0.30, (0.05, 1.00, 0.30), 8.0)
    reg('lamp_white', (0.40, 0.40, 0.40), 0.0, 0.30, (1.00, 0.90, 0.80), 8.0)
    reg('lamp', (0.40, 0.20, 0.05), 0.0, 0.40, (1.00, 0.50, 0.10), 4.0)     # amber/orange utility lights
    reg('engine', (0.30, 0.10, 0.05), 0.0, 0.30, (1.00, 0.38, 0.10), 3.0)
    reg('nozzle_glow', (0.30, 0.10, 0.05), 0.0, 0.30, (1.00, 0.38, 0.10), 2.2)


# =============================================================================== profiles
def prof_super(n=24, p=4.0, phase=0.5):
    pts = []
    for i in range(n):
        a = (i + phase) / n * 2 * math.pi
        c, s = math.cos(a), math.sin(a)
        pts.append((math.copysign(abs(c) ** (2 / p), c), math.copysign(abs(s) ** (2 / p), s)))
    return pts


def prof_chamfer(poly, k=0.14):
    """Cut every corner (fraction k of each adjacent edge) -> bevelled edges that catch speculars."""
    out = []
    n = len(poly)
    for i in range(n):
        v, a, b = V(poly[i]), V(poly[i - 1]), V(poly[(i + 1) % n])
        out.append(tuple(v.lerp(a, k)))
        out.append(tuple(v.lerp(b, k)))
    return out


def prof_flatbottom(n_top=16, p=3.0):
    top = []
    for i in range(n_top + 1):
        a = i / n_top * math.pi
        c, s = math.cos(a), math.sin(a)
        top.append((math.copysign(abs(c) ** (2 / p), c), math.copysign(abs(s) ** (2 / p), s)))
    return top + [(-1, -0.55), (-0.92, -0.9), (-0.75, -1), (0.75, -1), (0.92, -0.9), (1, -0.55)]


# =============================================================================== smooth hull
class SHull(Hull):
    """Hull with cubic-Hermite interpolation between stations and dense ring sampling."""

    def __init__(self, stations, prof, step=0.12, cx=0.0, cz=0.0):
        super().__init__(stations, prof, cx, cz)
        self.step = step

    def at(self, s):
        st = self.st
        n = len(st)
        if s <= st[0][0]:
            a = st[0]
            return a[1], a[2], a[3] + self.cz0, a[4] + self.cx0
        if s >= st[-1][0]:
            a = st[-1]
            return a[1], a[2], a[3] + self.cz0, a[4] + self.cx0
        i = 0
        while i < n - 2 and s > st[i + 1][0]:
            i += 1
        p0, p1, p2, p3 = st[max(i - 1, 0)], st[i], st[i + 1], st[min(i + 2, n - 1)]
        h = p2[0] - p1[0]
        t = (s - p1[0]) / h if h else 0.0
        t2, t3 = t * t, t * t * t
        h00, h10, h01, h11 = 2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2
        out = []
        for c in range(1, 5):
            m1 = (p2[c] - p0[c]) / (p2[0] - p0[0]) * h if p2[0] != p0[0] else 0.0
            m2 = (p3[c] - p1[c]) / (p3[0] - p1[0]) * h if p3[0] != p1[0] else 0.0
            if i == 0:
                m1 = p2[c] - p1[c]
            if i + 2 >= n:
                m2 = p2[c] - p1[c]
            v = h00 * p1[c] + h10 * m1 + h01 * p2[c] + h11 * m2
            lo, hi = min(p1[c], p2[c]), max(p1[c], p2[c])   # no overshoot
            out.append(min(max(v, lo), hi))
        return out[0], out[1], out[2] + self.cz0, out[3] + self.cx0

    def build(self, mb, mat, s0=None, s1=None, cap0=True, cap1=True, off=0.0, **kw):
        s0 = self.st[0][0] if s0 is None else s0
        s1 = self.st[-1][0] if s1 is None else s1
        k = max(2, int(math.ceil((s1 - s0) / self.step)))
        ss = sorted(set([s0 + (s1 - s0) * i / k for i in range(k + 1)] +
                        [x[0] for x in self.st if s0 < x[0] < s1]))
        rings = []
        for s in ss:
            w, h, cz, cx = self.at(s)
            if w < 1e-3 and h < 1e-3:
                rings.append(V((cx, -s, cz)))
            else:
                Q, c = self.poly(s, off)
                rings.append([self._w(s, q, c) for q in Q])
        mb.loft(rings, mat, cap0=cap0, cap1=cap1)


def plates(mb, H, s_cuts, p_cuts, matf, thick=0.05, gs=0.05, gp=0.06, ch=0.03, step=0.22, off=0.0):
    """Grid of chamfered armour plates with recessed seams (the dark hull core shows between them).
    matf(i, j) -> material name or None (skip)."""
    for i, (sa, sb) in enumerate(zip(s_cuts, s_cuts[1:])):
        for j, (pa, pb) in enumerate(zip(p_cuts, p_cuts[1:])):
            m = matf(i, j)
            if m is None:
                continue
            o = off(i, j) if callable(off) else off
            plate(mb, H, sa + gs / 2, sb - gs / 2, pa + gp, pb - gp, m, off=o, thick=thick, ch=ch, step=step)


# =============================================================================== local-frame primitives
def Mat(pos, n=(0, 0, 1), fwd=(0, -1, 0), spin=0.0):
    """Local frame at pos: x across, y along fwd (projected), z = n."""
    b, t, nn = frame(V(n), V(fwd))
    if spin:
        c, s_ = math.cos(spin), math.sin(spin)
        b, t = b * c + t * s_, t * c - b * s_
    p = V(pos)
    return Matrix(((b.x, t.x, nn.x, p.x), (b.y, t.y, nn.y, p.y), (b.z, t.z, nn.z, p.z), (0, 0, 0, 1)))


def HM(H, s, p, off=0.0, fwd=(0, -1, 0), spin=0.0):
    pos, n = H.pt(s, p, off)
    return Mat(pos, n, fwd, spin)


def _finish(mb, verts, mat, bev=0.0, seg=1):
    fs = mb._faces_of(verts)
    mi = mb._mi(mat)
    for f in fs:
        f.material_index = mi
    if bev > 0:
        es = list({e for f in fs for e in f.edges})
        bmesh.ops.bevel(mb.bm, geom=es, offset=bev, offset_type='OFFSET', segments=seg, profile=0.5,
                        affect='EDGES', clamp_overlap=True, material=mi)


def bx(mb, M, c, s, mat, bev=0.0, seg=1, rot=None):
    """Box in local frame M, centre c, size s; optional bevel (world units) and local rotation matrix."""
    T = M @ Matrix.Translation(V(c))
    if rot is not None:
        T = T @ rot
    T = T @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
    r = bmesh.ops.create_cube(mb.bm, size=1.0, matrix=T)
    if bev > 0:
        bev = min(bev, 0.45 * min(s))
    _finish(mb, r['verts'], mat, bev, seg)


def wbox(mb, c, s, mat, bev=0.0, seg=1, rot=None):
    bx(mb, Matrix.Identity(4), c, s, mat, bev, seg, rot)


def cy(mb, M, p0, p1, r0, r1, mat, seg=12):
    mb.cyl(M @ V(p0), M @ V(p1), r0, r1, mat, seg=seg)


def hx(mb, M, pts, mat, bev=0.0):
    mb.hexa([M @ V(p) for p in pts], mat, bevel=bev)


def ring_pts(c, d, r, seg, z=0.0, phase=0.0):
    c, d = V(c), V(d).normalized()
    q = d.to_track_quat('Z', 'Y' if abs(d.y) < 0.99 else 'X').to_matrix()
    return [c + q @ V((math.cos((i + phase) / seg * 2 * math.pi) * r, math.sin((i + phase) / seg * 2 * math.pi) * r,
                       z)) for i in range(seg)]


def tube(mb, c, d, r_in, r_out, L, mat, seg=20):
    """Hollow collar ring along d, centred at c."""
    c, d = V(c), V(d).normalized()
    h = L / 2
    mb.loft([ring_pts(c, d, r_in, seg, -h), ring_pts(c, d, r_out, seg, -h), ring_pts(c, d, r_out, seg, h),
             ring_pts(c, d, r_in, seg, h)], mat, wrap=True)


def strip(mb, pts, ups, w, h, mat, caps=True):
    """Rectangular (slightly trapezoid) bar swept along a polyline; ups = per-point surface normals."""
    pts = [V(p) for p in pts]
    n = len(pts)
    rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        u = V(ups[i])
        u = (u - t * u.dot(t)).normalized()
        sd = t.cross(u)
        rings.append([p - sd * w / 2 - u * 0.01, p + sd * w / 2 - u * 0.01, p + sd * w * 0.38 + u * h,
                      p - sd * w * 0.38 + u * h])
    mb.loft(rings, mat, cap0=caps, cap1=caps)


def rail_on(mb, H, s0, s1, p, off, w, h, mat, n=14):
    pts, ns = [], []
    for k in range(n + 1):
        pos, nn = H.pt(lerp(s0, s1, k / n), p, off)
        pts.append(pos)
        ns.append(nn)
    strip(mb, pts, ns, w, h, mat)


def hoop_on(mb, H, s, p0, p1, off, w, h, mat, sub=3):
    pts = []
    k = p0
    while k < p1 - 1e-6:
        for j in range(sub):
            pp = k + j / sub
            if pp < p1:
                pts.append(H.pt(s, pp, off)[0])
        k += 1
    pts.append(H.pt(s, p1, off)[0])
    wd, hd, cz, cx = H.at(s)
    ctr = V((cx, -s, cz))
    ups = [(p - ctr).normalized() for p in pts]
    strip(mb, pts, ups, w, h, mat)


# =============================================================================== functional details
def nozzle(mb, p, d, r, K, petals=12, depth=0.95, glow=0.5, seg=24, shell='gunmetal', ribs=2):
    """Convergent-divergent engine nozzle at p pointing aft along d (exhaust side).
    Outer shell, actuated flap petals, metal rim, heat-tinted liner, aft-facing `engine` glow disc, centre plug."""
    p, d = V(p), V(d).normalized()
    L = r * depth
    R = lambda rr, z: ring_pts(p, d, rr, seg, z)
    mb.loft([R(r * 0.98, -0.4 * r), R(r * 1.04, 0.0), R(r * 1.08, L * 0.55)], K[shell], cap0=True, cap1=False)
    mb.loft([R(r * 1.08, L * 0.55), R(r * 1.1, L * 0.95), R(r * 1.07, L)], K['metal'], cap0=False, cap1=False)
    mb.loft([R(r * 1.07, L), R(r * 0.95, L)], K['metal'], cap0=False, cap1=False)                   # rim lip
    zg = L * (1 - glow)
    mb.loft([R(r * 0.95, L), R(r * 0.86, L * 0.72), R(r * 0.76, zg - 0.01 * r)], K['exhaust'], cap0=False,
            cap1=False)
    # hot liner disc (nozzle_glow) + compact aft-facing `engine` core: the engine derives one thruster per
    # compact cluster of `engine` faces, so only the small core carries that material
    mb.cyl(p + d * (zg - 0.05 * r), p + d * zg, r * 0.77, r * 0.77, K.get('nozzle_glow', 'nozzle_glow'), seg=seg)
    tube(mb, p + d * (zg + 0.02 * r), d, r * 0.3, r * 0.4, 0.04 * r, K['exhaust'], seg=12)       # core retainer
    mb.cyl(p + d * zg, p + d * (zg + 0.03 * r), r * 0.3, r * 0.3, K['engine'], seg=12)              # engine core
    # flap petals over the divergent section (alternating metal / gunmetal)
    q = d.to_track_quat('Z', 'Y' if abs(d.y) < 0.99 else 'X').to_matrix()
    for k in range(petals):
        a0 = (k + 0.08) / petals * 2 * math.pi
        a1 = (k + 0.92) / petals * 2 * math.pi
        def pt(a, rr, z):
            return p + q @ V((math.cos(a) * rr, math.sin(a) * rr, z))
        r0, r1 = r * 1.1, r * 1.13
        z0, z1 = L * 0.5, L * 0.97
        t = r * 0.035
        mb.hexa([pt(a0, r0, z0), pt(a1, r0, z0), pt(a1, r1, z1), pt(a0, r1, z1),
                 pt(a0, r0 + t, z0), pt(a1, r0 + t, z0), pt(a1, r1 + t, z1), pt(a0, r1 + t, z1)],
                K['metal'] if k % 2 else K['gunmetal'])
    # actuator rods
    for k in range(4):
        a = (k + 0.5) / 4 * 2 * math.pi
        a0 = p + q @ V((math.cos(a) * r * 1.08, math.sin(a) * r * 1.08, -0.2 * r))
        a1 = p + q @ V((math.cos(a) * r * 1.17, math.sin(a) * r * 1.17, L * 0.6))
        mb.cyl(a0, a1, r * 0.045, r * 0.045, K['metal'], seg=6)
        mb.cyl(a0 - d * r * 0.06, a0 + d * r * 0.1, r * 0.075, r * 0.075, K['gunmetal'], seg=6)
    for k in range(ribs):
        z = -0.3 * r + k * 0.22 * r
        tube(mb, p + d * z, d, r * 1.02, r * 1.1, r * 0.08, K['gunmetal'], seg=seg)


def hex_housing(mb, c, d, r, L, K, mat='gunmetal', seg=6):
    c, d = V(c), V(d).normalized()
    mb.cyl(c - d * L * 0.5, c + d * L * 0.5, r, r * 0.94, K[mat], seg=seg, bevel=r * 0.06)
    mb.cyl(c - d * L * 0.5, c - d * L * 0.64, r * 0.72, r * 0.6, K['gunmetal'], seg=seg)


def vent(mb, M, w, l, n, K, frame_mat='gunmetal', slat='gunmetal', floor='carbon', glow=None, ang=38):
    """Recessed louvred vent in local frame (z up): raised frame, dark floor, angled slats (optional glow floor)."""
    fh = 0.045
    fw = min(0.05, w * 0.12)
    bx(mb, M, (0, 0, 0.006), (w, l, 0.012), glow or floor)
    for sx in (-1, 1):
        bx(mb, M, (sx * (w / 2 + fw / 2), 0, fh / 2), (fw, l + 2 * fw, fh), frame_mat, bev=0.008)
    for sy in (-1, 1):
        bx(mb, M, (0, sy * (l / 2 + fw / 2), fh / 2), (w, fw, fh), frame_mat, bev=0.008)
    rot = Matrix.Rotation(ang * D2R, 4, 'X')
    pitch = l / n
    for k in range(n):
        y = -l / 2 + pitch * (k + 0.5)
        bx(mb, M, (0, y, fh * 0.55), (w * 0.98, pitch * 1.05, 0.01), slat, rot=rot)
    if w > 0.35:   # centre stiffener
        bx(mb, M, (0, 0, fh * 0.6), (0.025, l, fh * 0.8), frame_mat)


def rcs(mb, M, s, K, body='gunmetal'):
    """RCS thruster quad: bevelled block with four small nozzles (out, fore, aft, up)."""
    h = s * 0.7
    bx(mb, M, (0, 0, h / 2), (s, s, h), K[body], bev=s * 0.1, seg=2)
    c = M @ V((0, 0, h * 0.55))
    for dl in ((1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1)):
        d = (M.to_3x3() @ V(dl)).normalized()
        e = s * 0.5 if dl[2] == 0 else h * 0.45
        a = c + d * e
        mb.cyl(a, a + d * s * 0.22, s * 0.12, s * 0.17, K['exhaust'], seg=10)
        mb.cyl(a + d * s * 0.2, a + d * s * 0.225, s * 0.13, s * 0.13, K['carbon'], seg=10)


def blister(mb, M, r, K, dome='glass', base='metal', seg=18):
    """Sensor blister: machined base ring + dome + tiny lens."""
    cy(mb, M, (0, 0, -0.02), (0, 0, r * 0.18), r * 1.18, r * 1.12, K[base], seg=seg)
    rings = []
    for k in range(5):
        a = k / 5 * math.pi / 2
        rings.append([M @ V((math.cos(i / seg * 2 * math.pi) * r * math.cos(a),
                             math.sin(i / seg * 2 * math.pi) * r * math.cos(a), r * 0.18 + r * 0.8 * math.sin(a)))
                      for i in range(seg)])
    rings.append(M @ V((0, 0, r * 0.98)))
    mb.loft(rings, K[dome], cap0=False)


def hatch(mb, M, w, l, K, paint, hinge=True, latches=2, seam='carbon'):
    """Access / gear-bay door: dark recessed seam frame, bevelled door plate, hinge knuckles, latches."""
    g = 0.03
    bx(mb, M, (0, 0, 0.004), (w + 2 * g, l + 2 * g, 0.012), K[seam])
    bx(mb, M, (0, 0, 0.018), (w, l, 0.024), K[paint], bev=0.008)
    if hinge:
        for k in range(3):
            x = -w * 0.35 + k * w * 0.35
            cy(mb, M, (x - w * 0.08, l / 2 + g * 0.2, 0.025), (x + w * 0.08, l / 2 + g * 0.2, 0.025), 0.018, 0.018,
               K['metal'], seg=8)
    for k in range(latches):
        x = (k - (latches - 1) / 2) * w * 0.5
        bx(mb, M, (x, -l / 2 + 0.05, 0.034), (0.06, 0.04, 0.012), K['metal'], bev=0.004)


def gear_bay(mb, M, w, l, K, paint):
    """Landing-gear bay: split doors + outline, with a small amber indicator."""
    hatch(mb, M @ Matrix.Translation((-w / 4 - 0.01, 0, 0)), w / 2 - 0.02, l, K, paint, hinge=False, latches=1)
    hatch(mb, M @ Matrix.Translation((w / 4 + 0.01, 0, 0)), w / 2 - 0.02, l, K, paint, hinge=False, latches=1)
    for sx in (-1, 1):
        for k in range(3):
            cy(mb, M, (sx * (w / 2 + 0.03), -l / 3 + k * l / 3 - 0.05, 0.02),
               (sx * (w / 2 + 0.03), -l / 3 + k * l / 3 + 0.05, 0.02), 0.015, 0.015, K['metal'], seg=6)
    bx(mb, M, (0, -l / 2 - 0.07, 0.01), (0.1, 0.03, 0.02), K['lamp'])


def gun(mb, p, d, L, r, K, body='gunmetal', barrels=1, spread=0.0, up=(0, 0, 1)):
    """Cannon: receiver, barrel(s) with slotted cooling jacket, muzzle brake."""
    p, d = V(p), V(d).normalized()
    M = Mat(p, up, d)
    bx(mb, M, (0, -r * 3.5, 0), (r * 4 + spread, r * 8, r * 3.6), K[body], bev=r * 0.4, seg=2)
    bx(mb, M, (0, -r * 5.5, r * 2.2), (r * 2.4, r * 3.0, r * 1.2), K['gunmetal'], bev=r * 0.2)  # feed cover
    for b in range(barrels):
        off = (b - (barrels - 1) / 2) * spread
        o = M @ V((off, 0, 0))
        mb.cyl(o, o + d * L, r, r * 0.9, K['metal'], seg=12)
        mb.cyl(o, o + d * L * 0.42, r * 1.55, r * 1.45, K['gunmetal'], seg=12)
        for k in range(5):
            z = L * (0.06 + k * 0.075)
            mb.cyl(o + d * z, o + d * (z + L * 0.03), r * 1.62, r * 1.62, K['carbon'], seg=12)
        mb.cyl(o + d * L * 0.86, o + d * L * 1.02, r * 1.4, r * 1.4, K['gunmetal'], seg=8)
        mb.cyl(o + d * L * 1.0, o + d * L * 1.02, r * 0.75, r * 0.75, K['carbon'], seg=8)


def missile(mb, p, d, L, r, K, body='paint_b', nose='carbon', band='trim', seg=12):
    """Missile tail at p pointing along d: body, ogive radome, band, cruciform fins, tail nozzle."""
    p, d = V(p), V(d).normalized()
    R = lambda rr, z: ring_pts(p, d, rr, seg, z)
    mb.loft([R(r * 0.8, 0.0), R(r, L * 0.05), R(r, L * 0.74)], K[body], cap0=True, cap1=False)
    mb.loft([R(r, L * 0.74), R(r * 0.92, L * 0.84), R(r * 0.62, L * 0.93), R(r * 0.25, L * 0.985), p + d * L],
            K[nose], cap0=False)
    mb.cyl(p + d * L * 0.68, p + d * L * 0.72, r * 1.03, r * 1.03, K[band], seg=seg)
    mb.cyl(p - d * r * 0.25, p, r * 0.5, r * 0.7, K['exhaust'], seg=seg)
    q = d.to_track_quat('Z', 'Y' if abs(d.y) < 0.99 else 'X').to_matrix()
    for k in range(4):
        a = (k + 0.5) / 4 * 2 * math.pi
        u = q @ V((math.cos(a), math.sin(a), 0))
        v = q @ V((-math.sin(a), math.cos(a), 0)) * r * 0.06
        b0, b1 = p + d * L * 0.02 + u * r * 0.9, p + d * L * 0.2 + u * r * 0.9
        t0, t1 = p + d * L * 0.02 + u * r * 2.0, p + d * L * 0.09 + u * r * 2.0
        mb.hexa([b0 - v, b1 - v, t1 - v, t0 - v, b0 + v, b1 + v, t1 + v, t0 + v], K['gunmetal'])


def antenna(mb, p, d, L, K, tip='lamp_white'):
    p, d = V(p), V(d).normalized()
    mb.cyl(p - d * 0.02, p + d * L * 0.12, 0.045, 0.03, K['gunmetal'], seg=8)
    mb.cyl(p + d * L * 0.12, p + d * L, 0.012, 0.007, K['metal'], seg=6)
    mb.cyl(p + d * L * 0.45, p + d * L * 0.5, 0.022, 0.022, K['gunmetal'], seg=6)
    if tip:
        mb.ico(p + d * L, 0.022, K[tip], sub=1)


def navlamp(mb, p, n, K, mat, r=0.05):
    p, n = V(p), V(n).normalized()
    mb.cyl(p - n * 0.02, p + n * 0.035, r * 1.25, r * 1.15, K['gunmetal'], seg=12)
    mb.sphere(p + n * 0.035, r, K[mat], seg=12, rings=6)


def conduit(mb, a, b, r, K, clamps=4, mat='metal'):
    a, b = V(a), V(b)
    mb.cyl(a, b, r, r, K[mat], seg=10)
    d = (b - a)
    for k in range(clamps):
        c = a + d * ((k + 0.5) / clamps)
        dn = d.normalized()
        mb.cyl(c - dn * r * 0.8, c + dn * r * 0.8, r * 1.45, r * 1.45, K['gunmetal'], seg=10)


def a_frame(mb, a, b, c_, t, K, mat='trim'):
    """A-frame bracket: two bars from a and b meeting at c_, cross bar and bolted lugs."""
    a, b, c_ = V(a), V(b), V(c_)
    for p in (a, b):
        mb.cyl(p, c_, t, t, K[mat], seg=8)
        mb.sphere(p, t * 1.5, K['gunmetal'], seg=8, rings=4)
    mb.cyl(a.lerp(c_, 0.45), b.lerp(c_, 0.45), t * 0.75, t * 0.75, K[mat], seg=8)
    mb.sphere(c_, t * 1.6, K['gunmetal'], seg=8, rings=4)


def fin_bank(mb, M, w, l, n, h, K, fin='heat', frame_mat='gunmetal'):
    """Radiator: base tray + n thin fins (along local y) + side rails."""
    bx(mb, M, (0, 0, 0.04), (w, l, 0.08), K[frame_mat], bev=0.015)
    for k in range(n):
        y = -l / 2 + l * (k + 0.5) / n
        bx(mb, M, (0, y, 0.08 + h / 2), (w * 0.94, 0.03, h), K[fin])
    for sx in (-1, 1):
        bx(mb, M, (sx * (w / 2 + 0.02), 0, 0.08 + h / 2), (0.04, l, h + 0.06), K[frame_mat], bev=0.01)
    for sy in (-1, 1):
        bx(mb, M, (0, sy * (l / 2 + 0.02), 0.08 + h / 2), (w + 0.08, 0.04, h + 0.06), K[frame_mat], bev=0.01)


def tri_decal(mb, M, size, mat):
    """Warning triangle as a thin prism lying on the surface."""
    c = M @ V((0, 0, 0.0))
    mb.cyl(c, M @ V((0, 0, 0.018)), size, size, mat, seg=3)


def stencil_bars(mb, M, n, w, l, gap, mat):
    """Row of small raised stencil/marking blocks (registry dashes, walkway marks)."""
    for k in range(n):
        bx(mb, M, ((k - (n - 1) / 2) * (w + gap), 0, 0.008), (w, l, 0.016), mat)


def center_mesh(mb):
    lo = V((1e9,) * 3)
    hi = V((-1e9,) * 3)
    for v in mb.bm.verts:
        lo = V(map(min, lo, v.co))
        hi = V(map(max, hi, v.co))
    c = (lo + hi) / 2
    mb.bm.transform(Matrix.Translation(-c))
    return hi - lo


def finish(mb, name, scale=1.0):
    if scale != 1.0:
        mb.bm.transform(Matrix.Scale(scale, 4))
    center_mesh(mb)
    return [mb.to_object(name, smooth_angle=32)]


def mirror_x(fn):
    """Call fn(sx) for sx in (+1, -1)."""
    for sx in (1, -1):
        fn(sx)



def intake(mb, M, w, h, l, K, shell='paint_a', vanes=3):
    """Forward-facing air/propellant scoop sitting on a surface (local frame: +y = forward, z = normal).
    Rounded-rect cowl fairing back into the skin, metal lip, dark duct with a cap, vertical guide vanes."""
    rr = prof_chamfer([(1, -1), (1, 1), (-1, 1), (-1, -1)], 0.22)

    def ring(k, y, zk=1.0):
        return [M @ V((u * w / 2 * k, y, h / 2 + v * h / 2 * k * zk)) for u, v in rr]
    front = l / 2
    mb.loft([ring(0.98, -l / 2, 0.12), ring(1.0, -l / 6, 0.8), ring(1.0, front * 0.6), ring(1.0, front)],
            K[shell], cap0=True, cap1=False)
    mb.loft([ring(1.0, front), ring(1.02, front + 0.012), ring(0.8, front + 0.012), ring(0.78, front)], K['metal'],
            cap0=False, cap1=False)
    mb.loft([ring(0.78, front), ring(0.74, front - 0.18)], K['carbon'], cap0=False, cap1=True)
    for k in range(vanes):
        x = (k - (vanes - 1) / 2) * w * 0.7 / max(1, vanes - 1) if vanes > 1 else 0.0
        bx(mb, M, (x, front - 0.06, h / 2), (0.012, 0.1, h * 0.72), K['gunmetal'])


def p_dir(H, s, d, step=0.05):
    """Surface parameter at station s whose outward normal best matches direction d=(dx, dz) (middle of ties)."""
    d = V((d[0], 0.0, d[1])).normalized()
    best, cand = -9.0, []
    k = 0.0
    while k < H.n:
        sc = H.pt(s, k)[1].dot(d)
        if sc > best + 1e-4:
            best, cand = sc, [k]
        elif sc > best - 1e-4:
            cand.append(k)
        k += step
    return cand[len(cand) // 2]


def HD(H, s, d, off=0.0, fwd=(0, -1, 0), spin=0.0):
    """Local frame on hull H at station s, on the face pointing along d=(dx, dz)."""
    return HM(H, s, p_dir(H, s, d), off, fwd, spin)


def rocket_pod(mb, p, d, L, r, K, body='paint_b', tubes=7):
    """Unguided-rocket pod: body with trim bands, front plate with launch tubes, tail fairing."""
    p, d = V(p), V(d).normalized()
    mb.cyl(p, p + d * L, r, r, K[body], seg=16)
    mb.cyl(p, p - d * r * 0.8, r, r * 0.45, K[body], seg=16)
    for z in (0.12, 0.88):
        tube(mb, p + d * L * z, d, r * 0.99, r * 1.05, L * 0.05, K['trim'], seg=16)
    q = d.to_track_quat('Z', 'Y' if abs(d.y) < 0.99 else 'X').to_matrix()
    offs = [(0, 0)] + [(math.cos(a * math.pi / 3) * r * 0.58, math.sin(a * math.pi / 3) * r * 0.58)
                       for a in range(tubes - 1)]
    for ox, oy in offs:
        c = p + d * L + q @ V((ox, oy, 0))
        mb.cyl(c - d * 0.02, c + d * 0.03, r * 0.24, r * 0.24, K['gunmetal'], seg=10)
        mb.cyl(c + d * 0.025, c + d * 0.035, r * 0.17, r * 0.17, K['carbon'], seg=10)


def surf_x(H, s, x, upper=True):
    """Point + outward normal on hull H at station s where the upper (or lower) skin passes world x."""
    Q, c = H.poly(s)
    n = len(Q)
    best = None
    for i in range(n):
        a, b = Q[i], Q[(i + 1) % n]
        xa, xb = a.x + c[0], b.x + c[0]
        if (xa - x) * (xb - x) <= 0 and abs(xb - xa) > 1e-9:
            t = (x - xa) / (xb - xa)
            z = a.y + (b.y - a.y) * t + c[1]
            if ((a.y + b.y) / 2 > 0) == upper:
                e = b - a
                nrm = V((e.y, 0.0, -e.x)).normalized()
                if best is None or (upper and z > best[0]) or (not upper and z < best[0]):
                    best = (z, nrm)
    z, nrm = best
    return V((x, -s, z)), nrm


def HX(H, s, x, upper=True, off=0.0, fwd=(0, -1, 0)):
    pos, n = surf_x(H, s, x, upper)
    return Mat(pos + n * off, n, fwd)
