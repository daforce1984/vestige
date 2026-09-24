"""The flagship's melt-hole rim -> assets/wound_rim.glb (node 'rim').

The lance melts a hole through the starboard armour (shader: cutAway, clipMin.w = 2). This is the THICKNESS of that
armour: a molten wall that runs from a curled, slumped lip on the outer hull down through ~9 m of plating, following
exactly the same boundary as the shader hole:
    v = (q.z * 0.62, q.y),  θ = atan2(v.y, v.x),  hole where |v| < r · B(θ)
    B(θ) = 1 + 0.10 sin(3θ+1.0) + 0.06 sin(5θ+2.3) + 0.035 sin(9θ+0.7) + 0.02 sin(14θ+4.1) + drip(θ)
    drip(θ) = 0.28 · max(0, sin(7θ+1.1))³ · max(0, −sin θ)          (molten tongues sagging downward)
Model space: x in metres relative to the hit point (LANCE_HIT.x = 62; the hull skin sits at x ≈ +1.4…+2.75),
y / z in units of the hole radius r — the engine places it with scale (1, r, r) so it follows the growing hole.
usage: uv run --with numpy tools/make_wound_rim.py"""
import json, struct, pathlib
import numpy as np

N_TH = 720


def B(th):
    d = 0.28 * np.maximum(0, np.sin(7 * th + 1.1)) ** 3 * np.maximum(0, -np.sin(th))
    return 1 + 0.10 * np.sin(3 * th + 1.0) + 0.06 * np.sin(5 * th + 2.3) + 0.035 * np.sin(9 * th + 0.7) + 0.02 * np.sin(14 * th + 4.1) + d


# profile across the plate: (radius factor, x offset m). Outer flange sitting on the skin -> rolled molten lip ->
# down the cut face (slightly flared, slumped) -> ragged inner edge
PROFILE = [(1.17, 2.5), (1.12, 3.2), (1.07, 3.75), (1.03, 3.9), (1.0, 3.5), (0.988, 2.6), (0.982, 1.2),
           (0.985, -0.8), (0.99, -2.8), (0.995, -4.6), (1.0, -6.2), (1.02, -7.0)]


def main():
    rng = np.random.default_rng(7)
    th = np.linspace(0, 2 * np.pi, N_TH, endpoint=False)
    b = B(th)
    # slow irregularity per ring (slumping) — stays inside the flange so the join with the hull is hidden
    wob = [0.012 * np.sin(k * 2 * th + rng.random() * 6) + 0.008 * np.sin(k * 5 * th + rng.random() * 6) for k in range(1, len(PROFILE) + 1)]
    rows = []
    for k, (rf, x) in enumerate(PROFILE):
        rr = b * (rf + (wob[k] if 0 < k < len(PROFILE) - 1 else 0))
        xx = x + (0.35 * np.sin(11 * th + k) * (k >= 9)) + (-0.6 * np.maximum(0, -np.sin(th)) * (k >= 3))   # ragged inner edge, lip sags low
        rows.append(np.stack([xx, rr * np.sin(th), rr * np.cos(th) / 0.62], axis=1))
    P = np.concatenate(rows).astype(np.float32)
    F = []
    n = N_TH
    for k in range(len(PROFILE) - 1):
        for i in range(n):
            a, b1, c, d = k * n + i, k * n + (i + 1) % n, (k + 1) * n + i, (k + 1) * n + (i + 1) % n
            F += [[a, c, b1], [b1, c, d]]
    F = np.array(F, dtype=np.uint32)
    # normals in METRIC space (y, z are scaled by r ≈ 44 at runtime), pointing toward the hole axis / outward on the flange
    Pm = P.astype(np.float64) * np.array([1, 44, 44])
    fn = np.cross(Pm[F[:, 1]] - Pm[F[:, 0]], Pm[F[:, 2]] - Pm[F[:, 0]])
    N = np.zeros_like(Pm)
    for j in range(3): np.add.at(N, F[:, j], fn)
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    N = (N / np.array([1, 44, 44]))                      # pre-divide so the (1, r, r) scale restores metric normals
    N = (N / np.linalg.norm(N, axis=1, keepdims=True)).astype(np.float32)
    bin_ = bytearray(); views, accs = [], []
    def add(arr, typ, comp, target, mm=False):
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); bb = arr.tobytes(); bin_.extend(bb)
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(bb), 'target': target})
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': int(arr.shape[0] if typ != 'SCALAR' else arr.size), 'type': typ}
        if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    prim = {'attributes': {'POSITION': add(P, 'VEC3', 5126, 34962, True), 'NORMAL': add(N, 'VEC3', 5126, 34962)},
            'indices': add(F.reshape(-1), 'SCALAR', 5125, 34963), 'material': 0}
    while len(bin_) % 4: bin_.append(0)
    gl = {'asset': {'version': '2.0', 'generator': 'make_wound_rim.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
          'nodes': [{'name': 'rim', 'mesh': 0}], 'meshes': [{'primitives': [prim]}],
          'materials': [{'name': 'molten', 'pbrMetallicRoughness': {'baseColorFactor': [0.06, 0.05, 0.045, 1], 'metallicFactor': 0.7, 'roughnessFactor': 0.5}}],
          'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    js = json.dumps(gl).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    p = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'wound_rim.glb'
    p.write_bytes(out); print(p, len(P), 'verts', len(F), 'tris', len(out), 'bytes')


if __name__ == '__main__':
    main()
