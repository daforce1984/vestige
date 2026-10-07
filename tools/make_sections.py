"""A ship's wreck as clean SECTIONS (2026-10-07 — the Voronoi chunks of tools/make_chunks.py broke along whole triangles:
spiky, shard-like pieces): the hull is first given an INTERIOR (decks, bulkheads, wall frames, pipe runs along the length,
machinery blocks on the decks, small lit panels) inside its own cross-section, then everything is sliced by flat planes
(an uneven grid: few across, many along the length), each triangle clipped exactly at the planes — every piece has
straight, clean cut faces you look into: the decks and the machinery behind them.
Output: DST.glb (nodes 'chunk_NN', each mesh about its own centre) + DST.js (export NAME = [{ name, c, lo, hi, tris }]).
usage: uv run --with pygltflib --with numpy tools/make_sections.py SRC.glb DST.glb DST.js NAME GX,GY,GZ [SEED]"""
import os, sys, numpy as np
from pygltflib import GLTF2, Scene, Node, Mesh, Primitive, Attributes, Buffer, BufferView, Accessor, Material, PbrMetallicRoughness
sys.path.insert(0, os.path.dirname(__file__))
from glbload import acc
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = sys.argv[1:]
SRC, DST, JS, NAME = (os.path.join(ROOT, A[0]), os.path.join(ROOT, A[1]), os.path.join(ROOT, A[2]), A[3])
GRID = [int(v) for v in A[4].split(',')]; SEED = int(A[5]) if len(A) > 5 else 7
rng = np.random.default_rng(SEED)

g = GLTF2().load(SRC); blob = g.binary_blob()
mats = list(g.materials)
def add_mat(name, base, metal, rough, emis=(0, 0, 0)):
    mats.append(Material(name=name, pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=[*base, 1], metallicFactor=metal, roughnessFactor=rough), emissiveFactor=list(emis)))
    return len(mats) - 1
M_DECK = add_mat('wreck_deck', (0.09, 0.09, 0.1), 0.7, 0.55)
M_FRAME = add_mat('wreck_frame', (0.05, 0.05, 0.055), 0.8, 0.45)
M_PIPE = add_mat('wreck_pipe', (0.32, 0.27, 0.18), 0.85, 0.35)
M_MACH = add_mat('wreck_machine', (0.14, 0.15, 0.17), 0.6, 0.5)
M_LIGHT = add_mat('wreck_light', (0.6, 0.8, 1.0), 0.0, 0.4, (0.6, 1.1, 1.6))

# ---- the source triangles (each primitive: material, P, N, UV, I) — node transforms applied
def node_mat(n):
    if n.matrix: return np.array(n.matrix).reshape(4, 4).T
    T = np.eye(4); t = n.translation or [0, 0, 0]; r = n.rotation or [0, 0, 0, 1]; s = n.scale or [1, 1, 1]
    x, y, z, w = r
    R = np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    T[:3, :3] = R * np.array(s); T[:3, 3] = t; return T
par = {}
for i, n in enumerate(g.nodes):
    for c in (n.children or []): par[c] = i
def world(i):
    Mw = node_mat(g.nodes[i])
    while i in par: i = par[i]; Mw = node_mat(g.nodes[i]) @ Mw
    return Mw
prims = []
for ni, n in enumerate(g.nodes):
    if n.mesh is None: continue
    W = world(ni)
    for p in g.meshes[n.mesh].primitives:
        P = acc(g, blob, p.attributes.POSITION).astype(np.float64); N = acc(g, blob, p.attributes.NORMAL).astype(np.float64)
        U = acc(g, blob, p.attributes.TEXCOORD_0).astype(np.float64) if p.attributes.TEXCOORD_0 is not None else np.zeros((len(P), 2))
        I = acc(g, blob, p.indices).reshape(-1, 3)
        P = P @ W[:3, :3].T + W[:3, 3]; N = N @ W[:3, :3].T; N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
        prims.append([p.material, P, N, U, I])
allP = np.concatenate([q[1] for q in prims]); lo, hi = allP.min(0), allP.max(0); ext = hi - lo
LA = int(np.argmax(ext)); A1, A2 = [k for k in range(3) if k != LA]   # the length axis, the two across it

# ---- the interior, inside the hull's own cross-section (slice by slice along the length)
box_tris = {}   # material -> list of (P[3], N[3])
def add_box(c, h, m):
    c = np.array(c, float); h = np.array(h, float)
    for ax in range(3):
        for sg in (-1, 1):
            n = np.zeros(3); n[ax] = sg
            u = np.zeros(3); u[(ax + 1) % 3] = h[(ax + 1) % 3]; v = np.zeros(3); v[(ax + 2) % 3] = h[(ax + 2) % 3]
            f = c + n * h[ax]
            q = [f - u - v, f + u - v, f + u + v, f - u + v]
            if np.dot(np.cross(q[1] - q[0], q[2] - q[0]), n) < 0: q = q[::-1]
            box_tris.setdefault(m, []).extend([((q[0], q[1], q[2]), n), ((q[0], q[2], q[3]), n)])
def add_cyl(a, b, r, m, seg=6):
    a, b = np.array(a, float), np.array(b, float); d = b - a; L = np.linalg.norm(d); d /= max(L, 1e-9)
    t1 = np.cross(d, [0, 1, 0] if abs(d[1]) < 0.9 else [1, 0, 0]); t1 /= np.linalg.norm(t1); t2 = np.cross(d, t1)
    for k in range(seg):
        a0, a1 = 2 * np.pi * k / seg, 2 * np.pi * (k + 1) / seg
        n0, n1 = t1 * np.cos(a0) + t2 * np.sin(a0), t1 * np.cos(a1) + t2 * np.sin(a1)
        p = [a + n0 * r, a + n1 * r, b + n1 * r, b + n0 * r]; nn = (n0 + n1) / 2
        box_tris.setdefault(m, []).extend([((p[0], p[1], p[2]), nn), ((p[0], p[2], p[3]), nn)])
BIN = ext[LA] / 40
env = []   # per bin along the length: (lo1, hi1, lo2, hi2) of the hull there, shrunk inside its skin
for b in range(40):
    z0 = lo[LA] + b * BIN; sel = allP[(allP[:, LA] >= z0) & (allP[:, LA] < z0 + BIN)]
    if len(sel) < 8: env.append(None); continue
    m1, M1, m2, M2 = sel[:, A1].min(), sel[:, A1].max(), sel[:, A2].min(), sel[:, A2].max()
    c1, c2, h1, h2 = (m1 + M1) / 2, (m2 + M2) / 2, (M1 - m1) / 2 * 0.78, (M2 - m2) / 2 * 0.78
    env.append((c1 - h1, c1 + h1, c2 - h2, c2 + h2))
def P3(l, a1, a2):
    p = np.zeros(3); p[LA] = l; p[A1] = a1; p[A2] = a2; return p
def H3(hl, h1, h2):
    h = np.zeros(3); h[LA] = hl; h[A1] = h1; h[A2] = h2; return h
size = min(ext[A1], ext[A2])
deck_gap = max(size / 4.5, 0.6); th = deck_gap * 0.06
for b, e in enumerate(env):
    if e is None: continue
    zc = lo[LA] + (b + 0.5) * BIN; l1, h1, l2, h2 = e
    vert = A2 if ext[A2] < ext[A1] else A1   # decks stack along the thinner across-axis ('up' for a flat hull)
    if vert == A2:
        for y in np.arange(l2 + deck_gap * 0.5, h2, deck_gap):   # decks
            add_box(P3(zc, (l1 + h1) / 2, y), H3(BIN / 2, (h1 - l1) / 2, th), M_DECK)
            if rng.random() < 0.55:   # machinery on the deck
                for k in range(rng.integers(1, 4)):
                    w1 = (h1 - l1) * rng.uniform(0.08, 0.2); hh = deck_gap * rng.uniform(0.25, 0.6)
                    add_box(P3(zc + rng.uniform(-0.3, 0.3) * BIN, rng.uniform(l1 + w1, h1 - w1), y + th + hh / 2), H3(BIN * rng.uniform(0.2, 0.45), w1 / 2, hh / 2), M_MACH)
            if rng.random() < 0.18:
                add_box(P3(zc, rng.uniform(l1, h1), y + deck_gap * 0.8), H3(BIN * 0.3, (h1 - l1) * 0.03, deck_gap * 0.05), M_LIGHT)
    else:
        for x in np.arange(l1 + deck_gap * 0.5, h1, deck_gap):
            add_box(P3(zc, x, (l2 + h2) / 2), H3(BIN / 2, th, (h2 - l2) / 2), M_DECK)
            if rng.random() < 0.55:
                hh = deck_gap * rng.uniform(0.25, 0.6); w2 = (h2 - l2) * rng.uniform(0.08, 0.2)
                add_box(P3(zc, x + th + hh / 2, rng.uniform(l2 + w2, h2 - w2)), H3(BIN * 0.35, hh / 2, w2 / 2), M_MACH)
    if b % 3 == 0:   # a bulkhead (a frame ring of four bars round the section) and wall ribs
        for (a1, a2, s1, s2) in ((l1, (l2 + h2) / 2, th, (h2 - l2) / 2), (h1, (l2 + h2) / 2, th, (h2 - l2) / 2), ((l1 + h1) / 2, l2, (h1 - l1) / 2, th), ((l1 + h1) / 2, h2, (h1 - l1) / 2, th)):
            add_box(P3(zc, a1, a2), H3(th * 1.5, s1 + th, s2 + th), M_FRAME)
for k in range(6):   # pipe runs along the whole length (where the hull has room)
    f1, f2 = rng.uniform(0.15, 0.85), rng.uniform(0.15, 0.85); r = size * rng.uniform(0.012, 0.03)
    run = [(lo[LA] + (b + 0.5) * BIN, e) for b, e in enumerate(env) if e is not None]
    for (za, ea), (zb, eb) in zip(run[:-1], run[1:]):
        pa = P3(za, ea[0] + (ea[1] - ea[0]) * f1, ea[2] + (ea[3] - ea[2]) * f2); pb = P3(zb, eb[0] + (eb[1] - eb[0]) * f1, eb[2] + (eb[3] - eb[2]) * f2)
        add_cyl(pa, pb, r, M_PIPE)
for m, tris in box_tris.items():   # → primitives
    P = np.array([v for t, n in tris for v in t]); N = np.array([n for t, n in tris for _ in range(3)]); I = np.arange(len(P)).reshape(-1, 3)
    prims.append([m, P, N, np.zeros((len(P), 2)), I])

# ---- the cutting planes: an uneven grid (jittered, shared by neighbours)
cuts = []
for ax in range(3):
    n = GRID[ax]; c = [lo[ax] - 1]
    for i in range(1, n): c.append(lo[ax] + ext[ax] * (i / n + (rng.random() - 0.5) * 0.5 / n))
    c.append(hi[ax] + 1); cuts.append(c)
def clip_poly(poly, ax, v, keep_ge):   # Sutherland–Hodgman on one axis plane; poly: list of (P, N, U)
    out = []
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        da, db = (a[0][ax] - v) * (1 if keep_ge else -1), (b[0][ax] - v) * (1 if keep_ge else -1)
        if da >= 0: out.append(a)
        if (da >= 0) != (db >= 0):
            t = da / (da - db); out.append(tuple(a[k] + (b[k] - a[k]) * t for k in range(3)))
    return out
cells = {}
for mi, P, N, U, I in prims:
    for tri in I:
        poly0 = [(P[j], N[j], U[j]) for j in tri]
        tlo, thi = P[tri].min(0), P[tri].max(0)
        for ix in range(GRID[0]):
            if thi[0] < cuts[0][ix] or tlo[0] > cuts[0][ix + 1]: continue
            for iy in range(GRID[1]):
                if thi[1] < cuts[1][iy] or tlo[1] > cuts[1][iy + 1]: continue
                for iz in range(GRID[2]):
                    if thi[2] < cuts[2][iz] or tlo[2] > cuts[2][iz + 1]: continue
                    poly = poly0
                    for ax, i0 in ((0, ix), (1, iy), (2, iz)):
                        poly = clip_poly(poly, ax, cuts[ax][i0], True)
                        if len(poly) < 3: break
                        poly = clip_poly(poly, ax, cuts[ax][i0 + 1], False)
                        if len(poly) < 3: break
                    if len(poly) < 3: continue
                    d = cells.setdefault((ix, iy, iz), {}).setdefault(mi, [])
                    for k in range(1, len(poly) - 1): d.append((poly[0], poly[k], poly[k + 1]))

# ---- write
data = bytearray(); bvs, accs, meshes, nodes, info = [], [], [], [], []
def add(arr, typ, comp, tgt, mm=False):
    while len(data) % 4: data.append(0)
    off = len(data); b = arr.tobytes(); data.extend(b)
    bvs.append(BufferView(buffer=0, byteOffset=off, byteLength=len(b), target=tgt))
    a = Accessor(bufferView=len(bvs) - 1, componentType=comp, count=len(arr), type=typ)
    if mm: a.min = arr.min(0).tolist(); a.max = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
k = 0
for key in sorted(cells):
    by = cells[key]; ntri = sum(len(v) for v in by.values())
    if ntri < 12: continue
    Pk = np.array([v[0] for tl in by.values() for t in tl for v in t]); c = (Pk.min(0) + Pk.max(0)) / 2
    ps = []
    for mi, tl in by.items():
        P = np.array([v[0] for t in tl for v in t], np.float32) - c.astype(np.float32); N = np.array([v[1] for t in tl for v in t], np.float32)
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9); U = np.array([v[2] for t in tl for v in t], np.float32)
        I = np.arange(len(P), dtype=np.uint32)
        ps.append(Primitive(attributes=Attributes(POSITION=add(P, 'VEC3', 5126, 34962, True), NORMAL=add(N.astype(np.float32), 'VEC3', 5126, 34962), TEXCOORD_0=add(U, 'VEC2', 5126, 34962)), indices=add(I, 'SCALAR', 5125, 34963), material=mi))
    nm = 'chunk_%02d' % k; k += 1
    meshes.append(Mesh(primitives=ps)); nodes.append(Node(name=nm, mesh=len(meshes) - 1, translation=c.tolist()))
    Pl = Pk - c
    cell = [cuts[ax][key[ax]] - c[ax] for ax in range(3)] + [cuts[ax][key[ax] + 1] - c[ax] for ax in range(3)]   # the cutting box about c: its faces ARE the cut faces (the renderer glows them hot)
    info.append('  { name: %r, c: [%.2f, %.2f, %.2f], lo: [%.2f, %.2f, %.2f], hi: [%.2f, %.2f, %.2f], cell: [%s], tris: %d },' % ((nm,) + tuple(c) + tuple(Pl.min(0)) + tuple(Pl.max(0)) + (', '.join('%.3f' % v for v in cell), ntri)))
o = GLTF2(scene=0, scenes=[Scene(nodes=list(range(len(nodes))))], nodes=nodes, meshes=meshes, materials=mats, buffers=[Buffer(byteLength=len(data))], bufferViews=bvs, accessors=accs)
o.set_binary_blob(bytes(data)); o.save_binary(DST)
open(JS, 'w').write('// generated by tools/make_sections.py from %s: the wreck in clean sections, its interior inside (%s), model units\n'
                    '// c: chunk centre (its node translation), lo/hi: its bounds about c\nexport const %s = [\n' % (A[0], A[1], NAME) + '\n'.join(info) + '\n];\n')
print('saved', DST, len(nodes), 'sections', sum(int(x.split('tris: ')[1].rstrip(' },')) for x in info), 'triangles; interior', sum(len(v) for v in box_tris.values()), 'tris')
