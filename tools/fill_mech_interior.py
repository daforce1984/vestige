"""Fill the hollow insides of a mech (assets/<name>.glb): its armour parts are open shells, so through the waist, the
neck and the shoulder / hip sockets (when a joint bends) you looked straight into empty space. Each part gets an inner
body — its convex hull (of the central vertices only, so it stays under the armour), shrunk toward its middle — in the
material 'inner' (dark gunmetal; the renderer draws it untextured). Idempotent: an existing 'inner' is replaced.
usage: uv run --with pygltflib --with numpy --with scipy tools/fill_mech_interior.py [gundam] [--preview]
(run again after blender/convert_mechs.py rebuilds the model)"""
import os, sys, numpy as np
from scipy.spatial import ConvexHull
from pygltflib import GLTF2, BufferView, Accessor, Material, PbrMetallicRoughness, Primitive, Attributes
sys.path.insert(0, os.path.dirname(__file__))
from glbload import acc
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# part: (keep vertices within this fraction of the half-extent on x / y / z, shrink toward the middle)
PARTS = {
    'torso': ((0.62, 0.8, 0.8), 0.86),
    'pelvis': ((0.8, 1.0, 0.8), 0.84),
    'arm_L_upper': ((0.8, 0.85, 0.8), 0.8), 'arm_R_upper': ((0.8, 0.85, 0.8), 0.8),
    'arm_L_lower': ((0.8, 0.9, 0.8), 0.8), 'arm_R_lower': ((0.8, 0.9, 0.8), 0.8),
    'leg_L_upper': ((0.8, 0.9, 0.8), 0.82), 'leg_R_upper': ((0.8, 0.9, 0.8), 0.82),
    'leg_L_lower': ((0.8, 0.92, 0.8), 0.82), 'leg_R_lower': ((0.8, 0.92, 0.8), 0.82),
    'head': ((0.8, 0.8, 0.8), 0.8),
}

def main():
    name = next((a for a in sys.argv[1:] if not a.startswith('--')), 'gundam')
    path = os.path.join(ROOT, 'assets', name + '.glb')
    g = GLTF2().load(path); blob = bytearray(g.binary_blob())
    mi = next((i for i, m in enumerate(g.materials) if m.name == 'inner'), None)
    if mi is None:
        g.materials.append(Material(name='inner', pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=[0.07, 0.072, 0.078, 1], metallicFactor=0.8, roughnessFactor=0.5)))
        mi = len(g.materials) - 1
    for n in g.nodes:
        if n.mesh is None or n.name not in PARTS: continue
        m = g.meshes[n.mesh]
        m.primitives = [p for p in m.primitives if p.material != mi]
        P = np.concatenate([acc(g, blob, p.attributes.POSITION) for p in m.primitives]).astype(np.float64)
        lo, hi = P.min(0), P.max(0); c = (lo + hi) / 2; h = (hi - lo) / 2
        (fx, fy, fz), sh = PARTS[n.name]
        Q = P[np.all(np.abs(P - c) <= h * [fx, fy, fz], axis=1)]
        hull = ConvexHull(Q); mid = Q[hull.vertices].mean(0)
        V = mid + (Q - mid) * sh; F = hull.simplices.copy()
        for k, f in enumerate(F):   # outward winding
            a, b, cc = V[f]
            if np.dot(np.cross(b - a, cc - a), a - mid) < 0: F[k] = f[[0, 2, 1]]
        used = np.unique(F); remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
        V = V[used].astype(np.float32); F = remap[F].astype(np.uint32)
        N = np.zeros_like(V)
        for f in F:
            a, b, cc = V[f]; nn = np.cross(b - a, cc - a); N[f] += nn
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9); N = N.astype(np.float32)
        UV = np.zeros((len(V), 2), np.float32)
        acs = []
        for arr, typ, tgt, comp in ((V, 'VEC3', 34962, 5126), (N, 'VEC3', 34962, 5126), (UV, 'VEC2', 34962, 5126), (F.reshape(-1), 'SCALAR', 34963, 5125)):
            while len(blob) % 4: blob.append(0)
            off = len(blob); data = arr.tobytes(); blob.extend(data)
            g.bufferViews.append(BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=tgt))
            a = Accessor(bufferView=len(g.bufferViews) - 1, componentType=comp, count=len(arr), type=typ)
            if typ == 'VEC3' and arr is V: a.min = V.min(0).tolist(); a.max = V.max(0).tolist()
            g.accessors.append(a); acs.append(len(g.accessors) - 1)
        m.primitives.append(Primitive(attributes=Attributes(POSITION=acs[0], NORMAL=acs[1], TEXCOORD_0=acs[2]), indices=acs[3], material=mi))
        print(n.name, 'inner', len(F), 'tris', V.min(0).round(2), V.max(0).round(2))
    g.buffers[0].byteLength = len(blob)
    g.set_binary_blob(bytes(blob)); g.save_binary(path)

main()
