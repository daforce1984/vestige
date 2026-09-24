"""The background moon as a real mesh -> assets/moon.glb (node 'moon', unit radius, centred at the origin).
A level-6 icosphere (81 920 tris) shaped like a real moon: nearly round, broad dark maria (shallow basins),
a power-law population of craters with raised rims and a few big ray-less basins, fine regolith grit.
Shaded in the engine with the procedural regolith mode (texSet −1). usage: uv run --with numpy tools/make_moon.py"""
import json, struct, pathlib, importlib.util
import numpy as np
spec = importlib.util.spec_from_file_location('ast', pathlib.Path(__file__).with_name('make_asteroids.py'))
ast = importlib.util.module_from_spec(spec); spec.loader.exec_module(ast)

def moon(seed=4):
    rng = np.random.default_rng(seed)
    nz = ast.Noise(seed)
    V, F = ast.icosphere(6)
    n = V.copy()
    h = 0.006 * nz.fbm(n * 1.5 + 3.0, 4)                         # gentle large-scale relief (it stays round)
    mare = np.clip(nz.fbm(n * 1.2 + 11.0, 3) * 1.6, 0, 1)          # dark lowland basins
    h -= 0.004 * mare
    for k in range(260):                                          # craters: many small, few large
        c = rng.normal(size=3); c /= np.linalg.norm(c)
        ang = 0.012 + 0.22 * rng.random() ** 3.2
        depth = ang * (0.06 + 0.03 * rng.random())
        d = np.arccos(np.clip(n @ c, -1, 1)) / ang
        d = d * (1 + 0.05 * nz(n * 20 + k))
        h += np.where(d < 1, (d * d - 1) * depth, 0) + depth * 0.3 * np.exp(-((d - 1) / 0.2) ** 2)
    h += 0.0012 * nz.fbm(n * 40.0 + 5.0, 3)
    P = n * (1 + h)[:, None]
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    N = np.zeros_like(P)
    for j in range(3): np.add.at(N, F[:, j], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    return P.astype(np.float32), N.astype(np.float32), F.astype(np.uint32)

P, N, F = moon()
bin_ = bytearray(); views, accs = [], []
def add(arr, typ, comp, target, mm=False):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); b = arr.tobytes(); bin_.extend(b)
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), 'target': target})
    a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0] if typ != 'SCALAR' else arr.size), 'type': typ}
    if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
prim = {'attributes': {'POSITION': add(P, 'VEC3', 5126, 34962, True), 'NORMAL': add(N, 'VEC3', 5126, 34962)}, 'indices': add(F.reshape(-1), 'SCALAR', 5125, 34963), 'material': 0}
while len(bin_) % 4: bin_.append(0)
gl = {'asset': {'version': '2.0', 'generator': 'make_moon.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'moon', 'mesh': 0}],
      'meshes': [{'primitives': [prim]}], 'materials': [{'name': 'regolith', 'pbrMetallicRoughness': {'baseColorFactor': [0.3, 0.29, 0.28, 1], 'metallicFactor': 0.0, 'roughnessFactor': 0.95}}],
      'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gl).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
p = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'moon.glb'; p.write_bytes(out); print(p, len(F), 'tris', len(out), 'bytes')
