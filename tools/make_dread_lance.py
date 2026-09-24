"""Enemy dreadnought GRAVITY LANCE firing system — blueprint + model from ONE parameter set (original design).

Writes
  blender/DREAD_LANCE_BLUEPRINT.svg   technical drawing: side elevation, front section, callouts, dimensions
  assets/dread_lance.glb              the detailed machinery, in the dreadnought's glTF model space (metres, before the
                                      engine's ×1.65 load scale): +Z = bow, the emitter at z = 200, the fork trench
                                      between the prongs spans |x| < ~17, the old core sphere sits at z = 80.
Systems (breech → muzzle):
  A  breech reactor cradle   z 58–94   six longitudinal ribs + two collar rings round the core, coolant loop pipes
  B  radiator fin banks      z 58–96   above and below the cradle (y ±14), 26 fins each
  C  capacitor banks         z 44–188  both trench walls, two tiers (y ±7): 21 cells per tier, bands + caps
  D  bus bars                z 44–192  copper conductors from the capacitor tiers forward to every coil
  E  focusing coil stack     z 100–190 the five old field rings get copper windings (32 each) + 4 new field-shaper
                                       rings between them, each clamped to the guide rails
  F  guide rails             z 60–206  top and bottom (y ±14) with clamp blocks and red status lamps
  G  emitter crown           z 196–214 base collar, six curved electrode horns (arc terminals at the tips), focus lens
The arc terminals (horn tips) are also used by js/world.js for the arc-discharge shader.
usage: uv run --with numpy tools/make_dread_lance.py"""
import json, struct, pathlib, math
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
MATS = [  # name, base, metal, rough, emissive
    ('lance_metal', [0.055, 0.05, 0.065], 0.85, 0.38, None),
    ('lance_dark', [0.03, 0.028, 0.035], 0.7, 0.55, None),
    ('lance_copper', [0.55, 0.26, 0.11], 0.95, 0.3, None),
    ('lance_cap', [0.13, 0.13, 0.15], 0.6, 0.45, None),
    ('lance_glow', [0.1, 0.02, 0.14], 0.0, 0.3, [0.75, 0.25, 1.0]),
    ('lance_warn', [0.3, 0.02, 0.02], 0.0, 0.4, [1.0, 0.08, 0.05]),
]
MI = {m[0]: i for i, m in enumerate(MATS)}

# ---------------------------------------------------------------------------------------------- parameters
CORE_Z, CORE_R = 80.0, 9.0
OLD_RINGS = [(z, 12 - (z - 100) * 0.03) for z in (100, 124, 148, 170, 190)]     # (z, inner radius) of the hull's coils
NEW_RINGS = [112.0, 136.0, 159.0, 180.0]
WALL_X = 16.6            # trench wall (inner face of the prongs) — capacitor backs sit against it
RAIL_Y = 14.0
CAP_Z = [44 + k * 7 for k in range(21)]
CAP_Y = (-7.0, 7.0)
CROWN_Z0, CROWN_Z1, CROWN_R0, CROWN_R1 = 197.0, 212.5, 9.0, 5.2
N_HORNS = 6


def horn_tip(k):
    a = k / N_HORNS * 2 * math.pi + math.pi / N_HORNS
    return (CROWN_R1 * math.cos(a), CROWN_R1 * math.sin(a), CROWN_Z1)


# ---------------------------------------------------------------------------------------------- mesh kit
class Mesh:
    def __init__(self): self.g = {m[0]: ([], [], []) for m in MATS}      # verts, normals, indices per material
    def add(self, mat, P, N, F):
        v, n, ix = self.g[mat]; b = len(v)
        v.extend(P); n.extend(N); ix.extend([[b + a, b + c, b + d] for a, c, d in F])
    def box(self, mat, c, h, R=None):
        """axis box centre c, half extents h, optional 3x3 rotation R (columns = local axes)"""
        R = np.eye(3) if R is None else np.asarray(R)
        faces = [((1, 0, 0), (0, 1, 0), (0, 0, 1)), ((-1, 0, 0), (0, 0, 1), (0, 1, 0)), ((0, 1, 0), (0, 0, 1), (1, 0, 0)),
                 ((0, -1, 0), (1, 0, 0), (0, 0, 1)), ((0, 0, 1), (1, 0, 0), (0, 1, 0)), ((0, 0, -1), (0, 1, 0), (1, 0, 0))]
        for nrm, u, w in faces:
            nrm, u, w = np.array(nrm, float), np.array(u, float), np.array(w, float)
            ctr = nrm * h
            du, dw = u * h, w * h
            quad = [ctr - du - dw, ctr + du - dw, ctr + du + dw, ctr - du + dw]
            P = [R @ q + c for q in quad]; N = [R @ nrm] * 4
            self.add(mat, P, N, [(0, 1, 2), (0, 2, 3)])
    def tube(self, mat, pts, rads, seg=12, caps=True):
        """swept circle along a polyline pts with radii rads (per point)"""
        pts = [np.asarray(p, float) for p in pts]
        P, N, F = [], [], []
        up0 = np.array([0, 1, 0.0])
        for i, p in enumerate(pts):
            t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]; t /= np.linalg.norm(t)
            up = up0 if abs(t @ up0) < 0.95 else np.array([1, 0, 0.0])
            a = np.cross(t, up); a /= np.linalg.norm(a); b = np.cross(t, a)
            for s in range(seg):
                th = 2 * math.pi * s / seg
                d = a * math.cos(th) + b * math.sin(th)
                P.append(p + d * rads[i]); N.append(d)
        for i in range(len(pts) - 1):
            for s in range(seg):
                a0, a1, b0, b1 = i * seg + s, i * seg + (s + 1) % seg, (i + 1) * seg + s, (i + 1) * seg + (s + 1) % seg
                F += [(a0, b0, a1), (a1, b0, b1)]
        self.add(mat, P, N, F)
        if caps:
            for end, sg in ((0, -1), (len(pts) - 1, 1)):
                t = pts[min(end + 1, len(pts) - 1)] - pts[max(end - 1, 0)]; t = t / np.linalg.norm(t) * sg
                ring = [P[end * seg + s] for s in range(seg)]
                self.add(mat, [pts[end]] + ring, [t] * (seg + 1), [(0, s + 1, (s + 1) % seg + 1) if sg > 0 else (0, (s + 1) % seg + 1, s + 1) for s in range(seg)])
    def cyl(self, mat, a, b, r, seg=12): self.tube(mat, [a, b], [r, r], seg)
    def torus(self, mat, c, R, r, axis=(0, 0, 1), seg=40, tseg=10):
        c = np.asarray(c, float); ax = np.asarray(axis, float); ax /= np.linalg.norm(ax)
        u = np.cross(ax, [0, 1, 0] if abs(ax[1]) < 0.9 else [1, 0, 0]); u /= np.linalg.norm(u); w = np.cross(ax, u)
        pts = [c + (u * math.cos(2 * math.pi * k / seg) + w * math.sin(2 * math.pi * k / seg)) * R for k in range(seg + 1)]
        self.tube(mat, pts, [r] * len(pts), tseg, caps=False)
    def sphere(self, mat, c, r, seg=12):
        c = np.asarray(c, float); P, N, F = [], [], []
        for i in range(seg // 2 + 1):
            ph = math.pi * i / (seg // 2)
            for j in range(seg):
                th = 2 * math.pi * j / seg
                d = np.array([math.sin(ph) * math.cos(th), math.cos(ph), math.sin(ph) * math.sin(th)])
                P.append(c + d * r); N.append(d)
        for i in range(seg // 2):
            for j in range(seg):
                a0, a1, b0, b1 = i * seg + j, i * seg + (j + 1) % seg, (i + 1) * seg + j, (i + 1) * seg + (j + 1) % seg
                F += [(a0, a1, b0), (a1, b1, b0)]
        self.add(mat, P, N, F)


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


# ---------------------------------------------------------------------------------------------- build
def build():
    m = Mesh()
    # A — breech reactor cradle: ribs round the core, collars, coolant loops to the walls
    for k in range(6):
        a = k / 6 * 2 * math.pi
        pts = [(11.6 * math.cos(a) * math.sin(t), 11.6 * math.sin(a) * math.sin(t), CORE_Z - 11.6 * math.cos(t)) for t in np.linspace(0.35, 2.8, 9)]
        m.tube('lance_metal', pts, [0.9] * len(pts), 8)
    for z in (68.0, 91.0):
        m.torus('lance_metal', (0, 0, z), 11.2 if z < 80 else 10.2, 1.1, seg=36, tseg=8)
    for sd in (1, -1):
        for y in (-4.0, 0.0, 4.0):
            m.tube('lance_cap', [(sd * 10.5, y, 76), (sd * 13.5, y, 74), (sd * (WALL_X - 0.6), y, 70)], [0.55, 0.55, 0.55], 8)
    # B — radiator fin banks above and below the cradle
    for sy in (1, -1):
        m.box('lance_dark', (0, sy * 12.2, 77), (7.5, 0.4, 19))
        for k in range(26):
            m.box('lance_metal', (0, sy * 14.0, 59 + k * 1.42), (7.0, 1.8, 0.14))
    # C — capacitor banks (two tiers on each trench wall), D — bus bars running forward
    for sd in (1, -1):
        x = sd * (WALL_X - 1.6)
        for y in CAP_Y:
            m.box('lance_dark', (sd * (WALL_X - 0.35), y, 116), (0.35, 3.2, 74))            # mounting plate
            for z in CAP_Z:
                m.cyl('lance_cap', (x, y - 2.4, z), (x, y + 2.4, z), 1.25, 12)
                for yb in (y - 1.9, y + 1.9):
                    m.cyl('lance_copper', (x, yb - 0.2, z), (x, yb + 0.2, z), 1.34, 12)            # clamp bands
                m.box('lance_metal', (x - sd * 1.45, y, z), (0.2, 0.5, 0.5))                     # terminal post
            m.box('lance_copper', (sd * (WALL_X - 3.3), y, 118), (0.18, 0.35, 74))               # bus bar
        # feeders from the bus bars to every coil
        for z, r in OLD_RINGS + [(z, 12 - (z - 100) * 0.03) for z in NEW_RINGS]:
            for y in CAP_Y:
                m.tube('lance_copper', [(sd * (WALL_X - 3.3), y, z - 1.5), (sd * (r + 3.6), y * 0.6, z - 0.4), (sd * (r + 2.2), y * 0.35, z)], [0.3] * 3, 6)
    # E — focusing coil stack: windings on the old rings + new field-shaper rings
    for z, r in OLD_RINGS:
        R = r + 1.75
        for k in range(32):
            a = k / 32 * 2 * math.pi
            m.box('lance_copper', (R * math.cos(a), R * math.sin(a), z), (0.55, 2.35, 2.25), rot_z(a))
    for z in NEW_RINGS:
        r = 12 - (z - 100) * 0.03
        m.torus('lance_metal', (0, 0, z), r + 1.4, 1.0, seg=40, tseg=8)
        m.torus('lance_glow', (0, 0, z), r + 0.2, 0.35, seg=40, tseg=6)              # field aperture (glows with charge)
        for k in range(16):
            a = k / 16 * 2 * math.pi + 0.1
            m.box('lance_copper', ((r + 1.4) * math.cos(a), (r + 1.4) * math.sin(a), z), (0.5, 1.2, 1.3), rot_z(a))
    # F — guide rails top & bottom, clamps at every ring, status lamps
    for sy in (1, -1):
        m.box('lance_metal', (0, sy * RAIL_Y, 133), (1.1, 1.1, 73))
        m.box('lance_dark', (0, sy * (RAIL_Y + 1.3), 133), (2.2, 0.25, 73))
        for z, r in OLD_RINGS + [(z, 12 - (z - 100) * 0.03) for z in NEW_RINGS]:
            m.box('lance_metal', (0, sy * (RAIL_Y - 0.4), z), (1.8, 1.6, 1.4))
            m.box('lance_metal', (0, sy * (RAIL_Y + r + 3.5) * 0.5, z), (0.6, (RAIL_Y - r - 3.2) * 0.5, 0.6))   # hanger to the ring
            m.box('lance_warn', (sy * 0.0 + 1.4, sy * RAIL_Y, z + 1.0), (0.18, 0.3, 0.18))
    # G — emitter crown: collar, six curved electrode horns, focus lens
    m.torus('lance_metal', (0, 0, CROWN_Z0), CROWN_R0 + 0.6, 1.3, seg=40, tseg=10)
    m.torus('lance_copper', (0, 0, CROWN_Z0 + 2.2), CROWN_R0, 0.6, seg=40, tseg=8)
    for k in range(N_HORNS):
        a = k / N_HORNS * 2 * math.pi + math.pi / N_HORNS
        tip = np.array(horn_tip(k))
        base = np.array([CROWN_R0 * math.cos(a), CROWN_R0 * math.sin(a), CROWN_Z0])
        ctrl = np.array([(CROWN_R0 + 2.5) * math.cos(a), (CROWN_R0 + 2.5) * math.sin(a), (CROWN_Z0 + CROWN_Z1) / 2])
        pts = [(1 - u) ** 2 * base + 2 * (1 - u) * u * ctrl + u * u * tip for u in np.linspace(0, 1, 10)]
        m.tube('lance_metal', pts, list(np.linspace(1.3, 0.45, 10)), 10)
        for u in (0.3, 0.55, 0.8):                                                      # insulator discs down each horn
            p = (1 - u) ** 2 * base + 2 * (1 - u) * u * ctrl + u * u * tip
            m.torus('lance_cap', p, 1.25 - 0.7 * u, 0.28, axis=(pts[5] - pts[3]), seg=16, tseg=6)
        m.sphere('lance_glow', tip, 0.75, 10)                                           # arc terminal
    m.tube('lance_glow', [(0, 0, 203.5), (0, 0, 204.3)], [4.2, 4.2], 32)                # focus lens
    m.torus('lance_metal', (0, 0, 203.9), 4.6, 0.5, seg=32, tseg=6)
    return m


# ---------------------------------------------------------------------------------------------- blueprint (SVG)
def blueprint(path):
    W, H = 1800, 1100
    sx = lambda z: 90 + (z - 30) * 6.6                 # side elevation: z → x
    sy = lambda y: 420 - y * 6.6                        # y → up
    fx = lambda x: 1450 + x * 12                       # front section
    fy = lambda y: 420 - y * 12
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="monospace">',
         '<rect width="100%" height="100%" fill="#0b2a4a"/>',
         '<defs><pattern id="g" width="33" height="33" patternUnits="userSpaceOnUse"><path d="M33 0H0V33" fill="none" stroke="#1d4b78" stroke-width="1"/></pattern></defs>',
         '<rect width="100%" height="100%" fill="url(#g)"/>',
         '<g stroke="#cfe6ff" fill="none" stroke-width="1.6">']
    L = lambda x1, y1, x2, y2, w=1.6, c='#cfe6ff', d='': o.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{c}" stroke-width="{w}" {d}/>')
    Rr = lambda x, y, w, h, c='#cfe6ff': o.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" stroke="{c}"/>')
    C = lambda x, y, r, c='#cfe6ff': o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" stroke="{c}"/>')
    T = lambda x, y, s, sz=15, c='#e8f4ff', a='start': o.append(f'<text x="{x:.1f}" y="{y:.1f}" fill="{c}" stroke="none" font-size="{sz}" text-anchor="{a}">{s}</text>')
    # side elevation: trench walls, core, cradle, fins, capacitors, rings, rails, crown
    L(sx(30), sy(20), sx(214), sy(20), 1, '#7fb0e0', 'stroke-dasharray="8 6"'); L(sx(30), sy(-20), sx(214), sy(-20), 1, '#7fb0e0', 'stroke-dasharray="8 6"')
    C(sx(CORE_Z), sy(0), CORE_R * 6.6); C(sx(CORE_Z), sy(0), 11.6 * 6.6, '#9fd0ff')
    for z in (68, 91): L(sx(z), sy(-12.3), sx(z), sy(12.3), 2.4)
    for sgn in (1, -1):
        for k in range(26): L(sx(59 + k * 1.42), sy(sgn * 12.2), sx(59 + k * 1.42), sy(sgn * 15.8), 1)
        Rr(sx(40), sy(sgn * RAIL_Y + 1.1) if sgn > 0 else sy(sgn * RAIL_Y + 1.1), (sx(206) - sx(60)), 2.2 * 6.6)
    for y in CAP_Y:
        for z in CAP_Z: Rr(sx(z) - 1.25 * 6.6, sy(y + 2.4), 2.5 * 6.6, 4.8 * 6.6, '#ffd08a')
    for z, r in OLD_RINGS: Rr(sx(z) - 2.25 * 6.6, sy(r + 4.1), 4.5 * 6.6, (2 * r + 8.2) * 6.6, '#ffb070')
    for z in NEW_RINGS:
        r = 12 - (z - 100) * 0.03; Rr(sx(z) - 1.0 * 6.6, sy(r + 2.4), 2.0 * 6.6, (2 * r + 4.8) * 6.6, '#d9a6ff')
    for k in range(N_HORNS):
        tip = horn_tip(k)
        L(sx(CROWN_Z0), sy(CROWN_R0 * math.sin(k / N_HORNS * 6.283 + 0.52)), sx(tip[2]), sy(tip[1]), 2.4, '#d9a6ff')
    L(sx(CROWN_Z0), sy(-10), sx(CROWN_Z0), sy(10), 3)
    L(sx(203.9), sy(-4.6), sx(203.9), sy(4.6), 3, '#d9a6ff')
    # dimension line + axis
    L(sx(30), sy(-30), sx(214), sy(-30), 1.2); T((sx(30) + sx(214)) / 2, sy(-30) + 20, '184 m  (×1.65 in service = 304 m)', 14, '#cfe6ff', 'middle')
    L(sx(30), sy(0), sx(220), sy(0), 1, '#7fb0e0', 'stroke-dasharray="20 6 4 6"')
    # front section at the crown
    C(fx(0), fy(0), CROWN_R0 * 12); C(fx(0), fy(0), 4.2 * 12, '#d9a6ff')
    for k in range(N_HORNS):
        tp = horn_tip(k); C(fx(tp[0]), fy(tp[1]), 0.75 * 12, '#d9a6ff')
        for j in (k + 1, k + 3):
            tq = horn_tip(j % N_HORNS); L(fx(tp[0]), fy(tp[1]), fx(tq[0]), fy(tq[1]), 1, '#b98cff', 'stroke-dasharray="4 5"')
    for sd in (1, -1):
        L(fx(sd * WALL_X), fy(-20), fx(sd * WALL_X), fy(20), 2, '#7fb0e0')
        for y in CAP_Y: C(fx(sd * (WALL_X - 1.6)), fy(y), 1.25 * 12, '#ffd08a')
    for sgn in (1, -1): Rr(fx(-1.1), fy(sgn * RAIL_Y + 1.1), 2.2 * 12, 2.2 * 12)
    T(fx(0), 640, 'SECTION G–G  (emitter crown, looking aft)', 16, '#e8f4ff', 'middle')
    T(fx(0), 662, 'dashed: arc discharge paths between terminals', 13, '#b98cff', 'middle')
    # callouts
    notes = [('A', CORE_Z, 12, 'BREECH REACTOR CRADLE — 6 ribs, 2 collars, coolant loops'),
             ('B', 72, -16, 'RADIATOR FIN BANKS ×2 — 26 fins each'),
             ('C', 60, 9.4, 'CAPACITOR BANKS — 2 tiers × 21 cells per wall'),
             ('D', 150, -7, 'COPPER BUS BARS + FEEDERS to every coil'),
             ('E', 136, 13.5, 'FOCUSING COIL STACK — 5 wound rings + 4 field shapers'),
             ('F', 188, -RAIL_Y - 1.5, 'GUIDE RAILS, CLAMPS, STATUS LAMPS'),
             ('G', 208, 7, 'EMITTER CROWN — 6 electrode horns, arc terminals, focus lens')]
    for i, (tag, z, y, txt) in enumerate(notes):
        yy = 760 + i * 40
        L(sx(z), sy(y), sx(z), yy - 12, 1, '#9fd0ff'); C(sx(z), sy(y), 4, '#9fd0ff')
        T(sx(z) + 8, yy, f'{tag}  {txt}', 15)
    T(90, 60, 'KHARAN-CLASS DREADNOUGHT — GRAVITY LANCE FIRING SYSTEM', 28, '#ffffff')
    T(90, 92, 'SIDE ELEVATION (fork trench, prong walls removed)   ·   model space metres   ·   original design for VESTIGE', 15, '#9fd0ff')
    T(W - 40, H - 30, 'drawn by tools/make_dread_lance.py — the model is built from the same parameters', 12, '#7fb0e0', 'end')
    o.append('</g></svg>')
    path.write_text('\n'.join(o), encoding='utf-8')


def write_glb(m, path):
    bin_ = bytearray(); views, accs, prims = [], [], []
    def add(arr, typ, comp, target, mm=False):
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); bb = arr.tobytes(); bin_.extend(bb)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(bb), 'target': target})
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0] if typ != 'SCALAR' else arr.size), 'type': typ}
        if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    tris = 0
    for name, (v, n, ix) in m.g.items():
        if not ix: continue
        P = np.array(v, np.float32); N = np.array(n, np.float32); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
        F = np.array(ix, np.uint32); tris += len(F)
        prims.append({'attributes': {'POSITION': add(P, 'VEC3', 5126, 34962, True), 'NORMAL': add(N, 'VEC3', 5126, 34962)},
                      'indices': add(F.reshape(-1), 'SCALAR', 5125, 34963), 'material': MI[name]})
    while len(bin_) % 4: bin_.append(0)
    mats = []
    for nme, b, me, r, e in MATS:
        mt = {'name': nme, 'pbrMetallicRoughness': {'baseColorFactor': b + [1], 'metallicFactor': me, 'roughnessFactor': r}}
        if e: mt['emissiveFactor'] = e
        mats.append(mt)
    gl = {'asset': {'version': '2.0', 'generator': 'make_dread_lance.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
          'nodes': [{'name': 'lance', 'mesh': 0}], 'meshes': [{'primitives': prims}], 'materials': mats,
          'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    js = json.dumps(gl).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    path.write_bytes(out)
    print(path, tris, 'tris', len(out), 'bytes')


if __name__ == '__main__':
    blueprint(ROOT / 'blender' / 'DREAD_LANCE_BLUEPRINT.svg')
    write_glb(build(), ROOT / 'assets' / 'dread_lance.glb')
    print('horn tips', [tuple(round(c, 3) for c in horn_tip(k)) for k in range(N_HORNS)])
