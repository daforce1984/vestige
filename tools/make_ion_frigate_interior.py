"""THE ION FRIGATE'S INSIDE (2026-10-07): its wreck opened onto an empty shell — this fills the hull, in its own model
space (assets/ion_frigate_lod.glb, nose +z, ~68 m), with what a warship carries:
  the main body (z -36 .. 3): three decks, a central corridor on each with doors into rooms either side, bulkheads every
  6 m; the rooms furnished by kind — crew quarters (bunks, lockers), ops (consoles with lit screens, a plot table),
  stores (crates, drums), engineering (machinery, tanks, pipe runs, panels) — ceiling light strips, pipes and cable trays
  down the corridors, hull frames; the reactor room aft (a two-deck reactor, its rings glowing) ;
  the gun section (z 4 .. 30): the ion conduit down its axis (y 0.9) inside its capacitor banks, a catwalk, frames.
Drawn inside the hull and cut with each wreck piece (renderer cellSplit, interior placed as is: cells.interiorAbs), so
every broken face opens onto rooms. Output: assets/ion_frigate_interior.glb (one node 'interior').
usage: uv run --with pygltflib --with numpy tools/make_ion_frigate_interior.py"""
import os, numpy as np
from pygltflib import GLTF2, Scene, Node, Mesh, Primitive, Attributes, Buffer, BufferView, Accessor, Material, PbrMetallicRoughness
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = np.random.default_rng(23)
#        name       base colour            metal rough  emissive
mats = [('deck',    (0.17, 0.17, 0.18),    0.6, 0.6,  (0, 0, 0)),
        ('wall',    (0.32, 0.34, 0.37),    0.45, 0.55, (0, 0, 0)),
        ('frame',   (0.05, 0.05, 0.06),    0.8, 0.45, (0, 0, 0)),
        ('machine', (0.14, 0.15, 0.17),    0.6, 0.5,  (0, 0, 0)),
        ('pipe',    (0.33, 0.24, 0.15),    0.85, 0.35, (0, 0, 0)),
        ('crate',   (0.32, 0.25, 0.13),    0.1, 0.7,  (0, 0, 0)),
        ('tank',    (0.52, 0.54, 0.57),    0.6, 0.4,  (0, 0, 0)),
        ('warn',    (0.55, 0.42, 0.05),    0.2, 0.6,  (0, 0, 0)),
        ('light',   (0.9, 0.9, 0.85),      0.0, 0.4,  (1.2, 1.15, 1.0)),
        ('screen',  (0.2, 0.6, 0.8),       0.0, 0.3,  (0.25, 0.9, 1.3)),
        ('reactor', (0.4, 0.7, 1.0),       0.0, 0.3,  (0.5, 1.0, 2.0)),
        ('bunk',    (0.18, 0.2, 0.24),     0.1, 0.8,  (0, 0, 0))]
M = {n: i for i, (n, *_) in enumerate(mats)}
tris = {i: [] for i in range(len(mats))}
def box(c, h, m):
    c, h = np.array(c, float), np.array(h, float)
    for ax in range(3):
        for sg in (-1, 1):
            n = np.zeros(3); n[ax] = sg; u = np.zeros(3); u[(ax + 1) % 3] = h[(ax + 1) % 3]; v = np.zeros(3); v[(ax + 2) % 3] = h[(ax + 2) % 3]
            f = c + n * h[ax]; q = [f - u - v, f + u - v, f + u + v, f - u + v]
            if np.dot(np.cross(q[1] - q[0], q[2] - q[0]), n) < 0: q = q[::-1]
            tris[M[m]] += [(q[0], q[1], q[2], n), (q[0], q[2], q[3], n)]
def bx(x0, x1, y0, y1, z0, z1, m):   # a box by its extents
    if x1 - x0 > 1e-3 and y1 - y0 > 1e-3 and z1 - z0 > 1e-3: box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), m)
def cyl(a, b, r, m, seg=8):
    a, b = np.array(a, float), np.array(b, float); d = (b - a) / np.linalg.norm(b - a)
    t1 = np.cross(d, [0, 1, 0] if abs(d[1]) < 0.9 else [1, 0, 0]); t1 /= np.linalg.norm(t1); t2 = np.cross(d, t1)
    for k in range(seg):
        a0, a1 = 2 * np.pi * k / seg, 2 * np.pi * (k + 1) / seg; n0, n1 = t1 * np.cos(a0) + t2 * np.sin(a0), t1 * np.cos(a1) + t2 * np.sin(a1)
        p = [a + n0 * r, a + n1 * r, b + n1 * r, b + n0 * r]; tris[M[m]] += [(p[0], p[1], p[2], (n0 + n1) / 2), (p[0], p[2], p[3], (n0 + n1) / 2)]
        for e, dn in ((a, -d), (b, d)):   # caps
            q = [e, e + n0 * r, e + n1 * r]
            if np.dot(np.cross(q[1] - q[0], q[2] - q[0]), dn) < 0: q = q[::-1]
            tris[M[m]].append((q[0], q[1], q[2], dn))

# ---------------------------------------------------------------- the main body
X = 5.4                      # inner half-width
FL = [-4.5, -1.3, 1.9]       # deck floor levels (each deck 3.2 m)
TOP = 5.0                    # the top deck's ceiling
Z0, Z1 = -36.0, 3.0
CW = 1.15                    # corridor half-width
REACT = (-36.0, -29.0)       # the reactor room, aft, two decks high
for fl in FL + [TOP]:
    if fl == FL[1]:          # (the middle deck has a well over the reactor)
        bx(-X, X, fl - 0.25, fl, REACT[1], Z1, 'deck'); bx(-X, -2.8, fl - 0.25, fl, Z0, REACT[1], 'deck'); bx(2.8, X, fl - 0.25, fl, Z0, REACT[1], 'deck')
    else: bx(-X, X, fl - 0.25, fl, Z0, Z1, 'deck')
# hull frames: ribs round the inside every 3 m
for z in np.arange(Z0 + 1.5, Z1, 3.0):
    bx(-X - 0.35, -X, -4.75, TOP, z - 0.2, z + 0.2, 'frame'); bx(X, X + 0.35, -4.75, TOP, z - 0.2, z + 0.2, 'frame')
    bx(-X, X, TOP, TOP + 0.3, z - 0.2, z + 0.2, 'frame'); bx(-X, X, -4.95, -4.75, z - 0.2, z + 0.2, 'frame')
KINDS = ['quarters', 'ops', 'stores', 'engineering']
def room(x0, x1, y0, y1, z0, z1, kind):
    s = 1 if x0 > 0 else -1; xo = x1 if s > 0 else x0       # (the outer wall side)
    w = x1 - x0; L = z1 - z0
    bx(x0 + 0.3, x1 - 0.3, y1 - 0.12, y1 - 0.05, (z0 + z1) / 2 - 0.15, (z0 + z1) / 2 + 0.15, 'light')   # ceiling strip
    if kind == 'quarters':
        for k in range(2):                                   # bunks: two-high, along the outer wall
            zc = z0 + L * (0.3 + 0.4 * k)
            for lvl in (0.45, 1.5):
                bx(xo - s * 0.95 if s > 0 else xo, xo if s > 0 else xo + 0.95, y0 + lvl, y0 + lvl + 0.18, zc - 1.0, zc + 1.0, 'bunk')
            bx(min(xo, xo - s * 0.95), max(xo, xo - s * 0.95), y0, y0 + 2.0, zc - 1.05, zc - 0.95, 'frame')
        for k in range(3):                                   # lockers along the inner wall
            zc = z0 + 0.6 + k * 0.75; xi = x0 if s > 0 else x1
            bx(min(xi, xi + s * 0.5), max(xi, xi + s * 0.5), y0, y0 + 2.1, zc - 0.33, zc + 0.33, 'wall')
    elif kind == 'ops':
        for k in range(int(L // 1.6)):                       # consoles on the outer wall, their screens lit
            zc = z0 + 0.9 + k * 1.6
            if zc > z1 - 0.7: break
            bx(min(xo, xo - s * 0.8), max(xo, xo - s * 0.8), y0, y0 + 1.0, zc - 0.6, zc + 0.6, 'machine')
            bx(min(xo - s * 0.15, xo - s * 0.25), max(xo - s * 0.15, xo - s * 0.25), y0 + 1.1, y0 + 1.9, zc - 0.5, zc + 0.5, 'screen')
        cx = (x0 + x1) / 2; bx(cx - 0.7, cx + 0.7, y0 + 0.8, y0 + 0.95, z0 + L * 0.3, z0 + L * 0.7, 'machine')   # the plot table
        bx(cx - 0.6, cx + 0.6, y0 + 0.96, y0 + 1.0, z0 + L * 0.32, z0 + L * 0.68, 'screen')
    elif kind == 'stores':
        for k in range(rng.integers(6, 11)):                 # crates, stacked
            cx = rng.uniform(x0 + 0.6, x1 - 0.6); cz = rng.uniform(z0 + 0.6, z1 - 0.6); hs = rng.uniform(0.3, 0.55)
            stack = rng.integers(1, 3)
            for j in range(stack): box((cx, y0 + hs + j * 2 * hs, cz), (hs, hs, hs * rng.uniform(0.8, 1.3)), 'crate')
        for k in range(rng.integers(2, 5)):                  # drums
            cx = rng.uniform(x0 + 0.5, x1 - 0.5); cz = rng.uniform(z0 + 0.5, z1 - 0.5); cyl((cx, y0, cz), (cx, y0 + 1.0, cz), 0.35, 'tank', 8)
    else:   # engineering
        for k in range(rng.integers(3, 6)):                  # machinery blocks with panel lights
            cx = rng.uniform(x0 + 0.8, x1 - 0.8); cz = rng.uniform(z0 + 0.8, z1 - 0.8); h = (rng.uniform(0.4, 0.8), rng.uniform(0.6, 1.3), rng.uniform(0.4, 0.9))
            box((cx, y0 + h[1], cz), h, 'machine'); bx(cx - h[0] * 0.6, cx + h[0] * 0.6, y0 + h[1] * 1.3, y0 + h[1] * 1.4, cz + h[2], cz + h[2] + 0.03, 'screen')
        for k in range(2):                                   # tanks, floor to ceiling
            cx = x0 + w * (0.3 + 0.4 * k); cz = z1 - 0.9; cyl((cx, y0, cz), (cx, y1 - 0.2, cz), 0.55, 'tank', 10)
            bx(cx - 0.6, cx + 0.6, y0 + 1.2, y0 + 1.35, cz - 0.6, cz + 0.6, 'warn')
        for k in range(3):                                   # pipe runs along the ceiling
            xx = x0 + w * (0.2 + 0.3 * k); cyl((xx, y1 - 0.35, z0 + 0.1), (xx, y1 - 0.35, z1 - 0.1), 0.09, 'pipe', 6)
for d, fl in enumerate(FL):
    y0, y1 = fl, (FL[d + 1] - 0.25) if d < 2 else TOP
    # the corridor: walls with door gaps, a light strip, pipes and a cable tray overhead
    zs = np.arange(Z0, Z1 + 0.01, 6.0)
    for s in (-1, 1):
        for zi in range(len(zs) - 1):
            za, zb = zs[zi], zs[zi + 1]
            if d < 2 and zb <= REACT[1]: continue            # (the reactor room spans the lower two decks)
            door = za + 1.0 + rng.uniform(0, 3.2)
            xw0, xw1 = (CW, CW + 0.15) if s > 0 else (-CW - 0.15, -CW)
            bx(xw0, xw1, y0, y1, za, door, 'wall'); bx(xw0, xw1, y0, y1, door + 1.3, zb, 'wall'); bx(xw0, xw1, y0 + 2.3, y1, door, door + 1.3, 'wall')
            bx(min(s * CW, s * X), max(s * CW, s * X), y0, y1, zb - 0.1, zb + 0.05, 'wall')      # bulkhead
            room(CW + 0.15 if s > 0 else -X, X if s > 0 else -CW - 0.15, y0, y1, za + 0.05, zb - 0.1, KINDS[int(rng.integers(0, 4))])
    bx(-0.25, 0.25, y1 - 0.1, y1 - 0.04, Z0, Z1, 'light')
    cyl((-0.75, y1 - 0.25, Z0), (-0.75, y1 - 0.25, Z1), 0.1, 'pipe', 6); cyl((0.75, y1 - 0.25, Z0), (0.75, y1 - 0.25, Z1), 0.07, 'pipe', 6)
    bx(0.3, 0.6, y1 - 0.45, y1 - 0.35, Z0, Z1, 'frame')
# the reactor room aft: the reactor, two decks high, rings glowing, catwalk and pipes round it
rz = (REACT[0] + REACT[1]) / 2
cyl((0, FL[0], rz), (0, FL[2] - 0.3, rz), 2.0, 'machine', 16)
for y in np.linspace(FL[0] + 0.8, FL[2] - 1.0, 5): cyl((0, y - 0.12, rz), (0, y + 0.12, rz), 2.12, 'reactor', 16)
cyl((0, FL[2] - 0.3, rz), (0, FL[2], rz), 1.3, 'reactor', 12)
for a in np.linspace(0, 2 * np.pi, 7)[:-1]:
    cx, cz = np.cos(a) * 3.6, rz + np.sin(a) * 2.6
    cyl((cx, FL[0], cz), (cx, FL[2] - 0.3, cz), 0.35, 'tank', 8); cyl((cx * 0.62, FL[1] + 1.0, rz + (cz - rz) * 0.62), (cx, FL[1] + 1.0, cz), 0.12, 'pipe', 6)
bx(-X, X, FL[1] - 0.15, FL[1], REACT[0], REACT[0] + 1.0, 'warn')

# ---------------------------------------------------------------- the gun section (narrow, forward)
G0, G1 = 4.5, 30.0
for z in np.arange(G0, G1, 3.0):                            # frames
    bx(-3.0, -2.75, -3.6, 2.6, z - 0.15, z + 0.15, 'frame'); bx(2.75, 3.0, -3.6, 2.6, z - 0.15, z + 0.15, 'frame'); bx(-3.0, 3.0, 2.4, 2.65, z - 0.15, z + 0.15, 'frame')
bx(-2.6, 2.6, -3.6, -3.4, G0, G1 - 6, 'deck')                # catwalk
cyl((0, 0.9, G0), (0, 0.9, G1), 0.55, 'reactor', 12)        # the ion conduit
for z in np.arange(G0 + 1, G1 - 1, 2.0): cyl((0, 0.9, z - 0.15), (0, 0.9, z + 0.15), 1.0, 'machine', 12)   # its collars
for s in (-1, 1):                                            # capacitor banks either side, lit strips
    for z in np.arange(G0 + 0.5, G1 - 7, 1.4):
        bx(s * 1.6 if s > 0 else -2.6, 2.6 if s > 0 else -1.6, -3.3, -0.6, z, z + 1.1, 'machine')
        bx(s * 1.55 if s > 0 else -1.6, 1.6 if s > 0 else -1.55, -2.6, -1.0, z + 0.3, z + 0.8, 'screen')
    cyl((s * 2.2, 1.9, G0), (s * 2.2, 1.9, G1 - 6), 0.12, 'pipe', 6)

# ---------------------------------------------------------------- write
data = bytearray(); bvs, accs, ps = [], [], []
def add(arr, typ, comp, tgt, mm=False):
    while len(data) % 4: data.append(0)
    off = len(data); b = arr.tobytes(); data.extend(b); bvs.append(BufferView(buffer=0, byteOffset=off, byteLength=len(b), target=tgt))
    a = Accessor(bufferView=len(bvs) - 1, componentType=comp, count=len(arr), type=typ)
    if mm: a.min = arr.min(0).tolist(); a.max = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
used = []
for m, tl in tris.items():
    if not tl: continue
    P = np.array([v for t in tl for v in t[:3]], np.float32); N = np.array([t[3] for t in tl for _ in range(3)], np.float32); U = np.zeros((len(P), 2), np.float32)
    ps.append(Primitive(attributes=Attributes(POSITION=add(P, 'VEC3', 5126, 34962, True), NORMAL=add(N, 'VEC3', 5126, 34962), TEXCOORD_0=add(U, 'VEC2', 5126, 34962)), indices=add(np.arange(len(P), dtype=np.uint32), 'SCALAR', 5125, 34963), material=m))
o = GLTF2(scene=0, scenes=[Scene(nodes=[0])], nodes=[Node(name='interior', mesh=0)], meshes=[Mesh(primitives=ps)],
          materials=[Material(name=n, pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=[*b, 1], metallicFactor=me, roughnessFactor=ro), emissiveFactor=list(e)) for n, b, me, ro, e in mats],
          buffers=[Buffer(byteLength=len(data))], bufferViews=bvs, accessors=accs)
o.set_binary_blob(bytes(data)); o.save_binary(os.path.join(ROOT, 'assets', 'ion_frigate_interior.glb'))
print('saved assets/ion_frigate_interior.glb', sum(len(t) for t in tris.values()), 'triangles')
