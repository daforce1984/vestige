"""A generic craft INTERIOR (2026-10-07) for wrecks of models whose files we may not modify (the third-party fighters):
frames, a spine, machinery blocks, pipe runs and a few lit panels inside the unit box [-1, 1]³ (length along z), drawn
scaled into the craft's hull and clipped with each broken piece (world.js drawBoxWreck) so the cuts open onto it.
Output: assets/wreck_interior.glb (one node 'interior'). usage: uv run --with pygltflib --with numpy tools/make_wreck_interior.py"""
import os, numpy as np
from pygltflib import GLTF2, Scene, Node, Mesh, Primitive, Attributes, Buffer, BufferView, Accessor, Material, PbrMetallicRoughness
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = np.random.default_rng(5)
mats = [('frame', (0.05, 0.05, 0.055), 0.8, 0.45, (0, 0, 0)), ('machine', (0.13, 0.14, 0.16), 0.6, 0.5, (0, 0, 0)),
        ('pipe', (0.3, 0.25, 0.17), 0.85, 0.35, (0, 0, 0)), ('light', (0.6, 0.8, 1.0), 0, 0.4, (0.5, 0.9, 1.4))]
tris = {i: [] for i in range(len(mats))}
def box(c, h, m):
    c, h = np.array(c, float), np.array(h, float)
    for ax in range(3):
        for sg in (-1, 1):
            n = np.zeros(3); n[ax] = sg; u = np.zeros(3); u[(ax + 1) % 3] = h[(ax + 1) % 3]; v = np.zeros(3); v[(ax + 2) % 3] = h[(ax + 2) % 3]
            f = c + n * h[ax]; q = [f - u - v, f + u - v, f + u + v, f - u + v]
            if np.dot(np.cross(q[1] - q[0], q[2] - q[0]), n) < 0: q = q[::-1]
            tris[m] += [(q[0], q[1], q[2], n), (q[0], q[2], q[3], n)]
def cyl(a, b, r, m, seg=6):
    a, b = np.array(a, float), np.array(b, float); d = (b - a) / np.linalg.norm(b - a)
    t1 = np.cross(d, [0, 1, 0] if abs(d[1]) < 0.9 else [1, 0, 0]); t1 /= np.linalg.norm(t1); t2 = np.cross(d, t1)
    for k in range(seg):
        a0, a1 = 2 * np.pi * k / seg, 2 * np.pi * (k + 1) / seg; n0, n1 = t1 * np.cos(a0) + t2 * np.sin(a0), t1 * np.cos(a1) + t2 * np.sin(a1)
        p = [a + n0 * r, a + n1 * r, b + n1 * r, b + n0 * r]; tris[m] += [(p[0], p[1], p[2], (n0 + n1) / 2), (p[0], p[2], p[3], (n0 + n1) / 2)]
box((0, 0, 0), (0.08, 0.08, 0.95), 0)                                   # the spine
for z in np.linspace(-0.85, 0.85, 7):                                   # frame rings
    for (c, h) in (((0, 0.7, z), (0.7, 0.04, 0.03)), ((0, -0.7, z), (0.7, 0.04, 0.03)), ((0.7, 0, z), (0.04, 0.7, 0.03)), ((-0.7, 0, z), (0.04, 0.7, 0.03))):
        box(c, h, 0)
for k in range(14):                                                      # machinery
    c = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(-0.8, 0.8)); h = (rng.uniform(0.08, 0.25), rng.uniform(0.08, 0.2), rng.uniform(0.08, 0.25))
    box(c, h, 1)
for k in range(5):                                                       # pipe runs
    x, y = rng.uniform(-0.55, 0.55), rng.uniform(-0.55, 0.55); cyl((x, y, -0.9), (x + rng.uniform(-0.1, 0.1), y + rng.uniform(-0.1, 0.1), 0.9), rng.uniform(0.025, 0.05), 2)
for k in range(6):                                                       # lit panels
    box((rng.choice([-0.62, 0.62]), rng.uniform(-0.4, 0.4), rng.uniform(-0.7, 0.7)), (0.01, 0.06, 0.12), 3)
data = bytearray(); bvs, accs, ps = [], [], []
def add(arr, typ, comp, tgt, mm=False):
    while len(data) % 4: data.append(0)
    off = len(data); b = arr.tobytes(); data.extend(b); bvs.append(BufferView(buffer=0, byteOffset=off, byteLength=len(b), target=tgt))
    a = Accessor(bufferView=len(bvs) - 1, componentType=comp, count=len(arr), type=typ)
    if mm: a.min = arr.min(0).tolist(); a.max = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
for m, tl in tris.items():
    P = np.array([v for t in tl for v in t[:3]], np.float32); N = np.array([t[3] for t in tl for _ in range(3)], np.float32); U = np.zeros((len(P), 2), np.float32)
    ps.append(Primitive(attributes=Attributes(POSITION=add(P, 'VEC3', 5126, 34962, True), NORMAL=add(N, 'VEC3', 5126, 34962), TEXCOORD_0=add(U, 'VEC2', 5126, 34962)), indices=add(np.arange(len(P), dtype=np.uint32), 'SCALAR', 5125, 34963), material=m))
o = GLTF2(scene=0, scenes=[Scene(nodes=[0])], nodes=[Node(name='interior', mesh=0)], meshes=[Mesh(primitives=ps)],
          materials=[Material(name=n, pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=[*b, 1], metallicFactor=me, roughnessFactor=ro), emissiveFactor=list(e)) for n, b, me, ro, e in mats],
          buffers=[Buffer(byteLength=len(data))], bufferViews=bvs, accessors=accs)
o.set_binary_blob(bytes(data)); o.save_binary(os.path.join(ROOT, 'assets', 'wreck_interior.glb'))
print('saved assets/wreck_interior.glb', sum(len(t) for t in tris.values()), 'triangles')
