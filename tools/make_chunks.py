"""A ship's wreck, pre-broken (generic: tools/make_dread_chunks.py made for the dreadnought, 2026-10-06): SRC cut into N irregular chunks
(Voronoi cells round random seeds on the hull, measured in its own proportions; its big triangles first subdivided, then
every triangle goes whole to the cell its centroid falls in), each chunk its own node 'chunk_NN' with its mesh relative to its own centre — world.js draws each chunk alone (the
others hidden) on its baked flight, instead of the whole hull 36 times clipped to a box. Also writes js/dread_chunks.js (names, centres, bounds).
usage: uv run --with pygltflib --with numpy tools/make_chunks.py SRC.glb DST.glb DST.js EXPORT_NAME N [MAXE] [SEED]
  e.g. assets/ion_frigate.glb assets/ion_frigate_chunks.glb js/ion_frigate_chunks.js ION_FRIGATE_CHUNKS 48 4 21"""
import os, sys, numpy as np
from pygltflib import GLTF2, Scene, Node, Mesh, Primitive, Attributes, Buffer, BufferView, Accessor
sys.path.insert(0, os.path.dirname(__file__))
from glbload import acc
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = sys.argv[1:]
SRC, DST, JS, EXPORT, N = (os.path.join(ROOT, A[0]), os.path.join(ROOT, A[1]), os.path.join(ROOT, A[2]), A[3], int(A[4]))
MAXE_ARG = float(A[5]) if len(A) > 5 else None; SEED = int(A[6]) if len(A) > 6 else 77

MAXE = MAXE_ARG or 22.0   # longest triangle edge (model units, the hull ~430 long): its big panels span many cells and went whole to one

def subdivide(P, Nn, U, I, L):
    """split every triangle's longest edge at its middle until no edge is longer than L (shared midpoints, so no cracks)"""
    P, Nn, U = list(P), list(Nn), list(U); mid = {}; out = []; todo = [tuple(t) for t in I]
    def m(a, b):
        k = (min(a, b), max(a, b))
        if k not in mid:
            P.append((P[a] + P[b]) / 2); n = Nn[a] + Nn[b]; Nn.append(n / max(np.linalg.norm(n), 1e-9)); U.append((U[a] + U[b]) / 2); mid[k] = len(P) - 1
        return mid[k]
    while todo:
        a, b, c = todo.pop()
        e = [np.linalg.norm(P[a] - P[b]), np.linalg.norm(P[b] - P[c]), np.linalg.norm(P[c] - P[a])]
        k = int(np.argmax(e))
        if e[k] <= L: out.append((a, b, c)); continue
        if k == 0: d = m(a, b); todo += [(a, d, c), (d, b, c)]
        elif k == 1: d = m(b, c); todo += [(a, b, d), (a, d, c)]
        else: d = m(c, a); todo += [(a, b, d), (d, b, c)]
    return np.array(P, np.float32), np.array(Nn, np.float32), np.array(U, np.float32), np.array(out, np.int64)

g = GLTF2().load(SRC); blob = g.binary_blob()
prims = []   # (material, P, Nrm, UV, triangles)
for n in g.nodes:
    if n.mesh is None: continue
    for p in g.meshes[n.mesh].primitives:
        P = acc(g, blob, p.attributes.POSITION).astype(np.float32); Nn = acc(g, blob, p.attributes.NORMAL).astype(np.float32)
        U = acc(g, blob, p.attributes.TEXCOORD_0).astype(np.float32) if p.attributes.TEXCOORD_0 is not None else np.zeros((len(P), 2), np.float32); I = acc(g, blob, p.indices).reshape(-1, 3)   # (procedural ships have no UVs)
        P, Nn, U, I = subdivide(P, Nn, U, I, MAXE)
        prims.append((p.material, P, Nn, U, I))
allP = np.concatenate([q[1] for q in prims]); lo, hi = allP.min(0), allP.max(0)
rng = np.random.default_rng(SEED)
cens = np.concatenate([q[1][q[4]].mean(1) for q in prims])   # seeds on the hull itself (in the box most fell in empty space)
seeds = cens[rng.choice(len(cens), N, replace=False)]
scale = 1.0 / np.maximum(hi - lo, 1e-6)   # (cells measured in the hull's own proportions: chunks run across it, not only along)
def cell_of(c):
    d = (((c[:, None, :] - seeds[None, :, :]) * scale) ** 2).sum(-1)
    return d.argmin(1)
out = []   # per chunk: list of (material, P, N, U, idx)
for k in range(N): out.append([])
for mat, P, Nn, U, I in prims:
    cen = P[I].mean(1); cid = cell_of(cen)
    for k in range(N):
        tri = I[cid == k]
        if len(tri) == 0: continue
        used = np.unique(tri); remap = -np.ones(len(P), np.int64); remap[used] = np.arange(len(used))
        out[k].append((mat, P[used], Nn[used], U[used], remap[tri].astype(np.uint32)))
data = bytearray(); bvs = []; accs = []; meshes = []; nodes = []; info = []
def add(arr, typ, comp, tgt, mm=False):
    while len(data) % 4: data.append(0)
    off = len(data); b = arr.tobytes(); data.extend(b)
    bvs.append(BufferView(buffer=0, byteOffset=off, byteLength=len(b), target=tgt))
    a = Accessor(bufferView=len(bvs) - 1, componentType=comp, count=len(arr), type=typ)
    if mm: a.min = arr.min(0).tolist(); a.max = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
for k in range(N):
    if not out[k]: continue
    Pk = np.concatenate([q[1] for q in out[k]]); c = (Pk.min(0) + Pk.max(0)) / 2   # (its box centre)
    ps = []
    for mat, P, Nn, U, I in out[k]:
        pa = add((P - c).astype(np.float32), 'VEC3', 5126, 34962, True); na = add(Nn, 'VEC3', 5126, 34962); ua = add(U, 'VEC2', 5126, 34962)
        ia = add(I.reshape(-1), 'SCALAR', 5125, 34963)
        ps.append(Primitive(attributes=Attributes(POSITION=pa, NORMAL=na, TEXCOORD_0=ua), indices=ia, material=mat))
    meshes.append(Mesh(primitives=ps)); nodes.append(Node(name='chunk_%02d' % k, mesh=len(meshes) - 1, translation=c.tolist()))
    Pl = np.concatenate([q[1] for q in out[k]]) - c
    info.append('  { name: %r, c: [%.2f, %.2f, %.2f], lo: [%.2f, %.2f, %.2f], hi: [%.2f, %.2f, %.2f], tris: %d },' % (('chunk_%02d' % k,) + tuple(c) + tuple(Pl.min(0)) + tuple(Pl.max(0)) + (sum(len(q[4]) for q in out[k]),)))
    print('chunk_%02d' % k, sum(len(q[4]) for q in out[k]), 'tris', 'centre', np.round(c, 1))
o = GLTF2(scene=0, scenes=[Scene(nodes=list(range(len(nodes))))], nodes=nodes, meshes=meshes, materials=g.materials,
          buffers=[Buffer(byteLength=len(data))], bufferViews=bvs, accessors=accs)
o.set_binary_blob(bytes(data)); o.save_binary(DST)
open(JS, 'w').write('// generated by tools/make_chunks.py from %s: the pre-broken wreck (%s), model units\n'
                    '// c: chunk centre (its node translation), lo/hi: its bounds about c\nexport const %s = [\n' % (A[0], A[1], EXPORT) + '\n'.join(info) + '\n];\n')
print('saved', DST, JS, len(nodes), 'chunks')
