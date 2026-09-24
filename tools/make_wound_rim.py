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


R_FINAL, HIT = 44.0, np.array([62.0, 10.0, 40.0])
SKIN0 = 2.75          # PROFILE x offsets were authored for a flat skin at x = 62 + 2.75


def hull_tris():
    """mothership.glb triangles near the wound (starboard side), glTF model space"""
    b = (pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'mothership.glb').read_bytes()
    jl = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + jl]); bn = b[20 + jl + 8:]
    def acc(i, comp):
        a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]; off = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        n = a['count'] * {'VEC3': 3, 'SCALAR': 1}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
        return np.frombuffer(bn[off:off + n * np.dtype(dt).itemsize], dtype=dt)
    T = []
    for m in g['meshes']:
        for pr in m['primitives']:
            P = acc(pr['attributes']['POSITION'], 0).reshape(-1, 3); I = acc(pr['indices'], 0).reshape(-1, 3)
            T.append(P[I])
    T = np.concatenate(T).astype(np.float64)
    c = T.mean(1)
    keep = (c[:, 0] > 20) & (np.abs(c[:, 1] - HIT[1]) < 110) & (np.abs(c[:, 2] - HIT[2]) < 170)
    return T[keep]


def skin_x(T, y, z):
    """outermost hull x at each (y, z) (ray along -x); NaN where the ray misses the hull"""
    out = np.full(len(y), np.nan)
    a, b, c = T[:, 0], T[:, 1], T[:, 2]
    for s0 in range(0, len(y), 256):
        py, pz = y[s0:s0 + 256, None], z[s0:s0 + 256, None]
        d = (b[:, 1] - a[:, 1]) * (c[:, 2] - a[:, 2]) - (c[:, 1] - a[:, 1]) * (b[:, 2] - a[:, 2])
        ok = np.abs(d) > 1e-9
        u = ((py - a[:, 1]) * (c[:, 2] - a[:, 2]) - (c[:, 1] - a[:, 1]) * (pz - a[:, 2])) / np.where(ok, d, 1)
        v = ((b[:, 1] - a[:, 1]) * (pz - a[:, 2]) - (py - a[:, 1]) * (b[:, 2] - a[:, 2])) / np.where(ok, d, 1)
        inside = ok & (u >= 0) & (v >= 0) & (u + v <= 1)
        x = a[:, 0] + u * (b[:, 0] - a[:, 0]) + v * (c[:, 0] - a[:, 0])
        x = np.where(inside, x, -np.inf).max(1)
        out[s0:s0 + 256] = np.where(np.isfinite(x), x, np.nan)
    return out


def main():
    rng = np.random.default_rng(7)
    T = hull_tris()
    th = np.linspace(0, 2 * np.pi, N_TH, endpoint=False)
    b = B(th)
    # slow irregularity per ring (slumping) — stays inside the flange so the join with the hull is hidden
    wob = [0.012 * np.sin(k * 2 * th + rng.random() * 6) + 0.008 * np.sin(k * 5 * th + rng.random() * 6) for k in range(1, len(PROFILE) + 1)]
    rows = []
    for k, (rf, x) in enumerate(PROFILE):
        rr = b * (rf + (wob[k] if 0 < k < len(PROFILE) - 1 else 0))
        xx = x + (0.35 * np.sin(11 * th + k) * (k >= 9)) + (-0.6 * np.maximum(0, -np.sin(th)) * (k >= 3))   # ragged inner edge, lip sags low
        rows.append(np.stack([xx, rr * np.sin(th), rr * np.cos(th) / 0.62], axis=1))
    P = np.concatenate(rows)
    # conform to the real hull: each column of the wall follows the skin under it (chamfers, steps) at the final
    # radius; where the hole runs off the hull entirely there is no armour, so no wall
    sk = skin_x(T, HIT[1] + P[:, 1] * R_FINAL, HIT[2] + P[:, 2] * R_FINAL)
    miss = np.isnan(sk) | (sk < HIT[0] - 12)                  # nothing there, or deeper than the melt reaches
    sk = np.where(miss, HIT[0] + SKIN0, sk)
    P[:, 0] = P[:, 0] - SKIN0 + (sk - HIT[0])                  # same profile, riding on the actual skin
    print('skin x range', np.nanmin(sk), np.nanmax(sk), 'missing', int(miss.sum()), '/', len(sk))
    dkp = np.repeat(np.arange(len(PROFILE)) / (len(PROFILE) - 1), N_TH)   # uv.x: 0 flange edge .. 0.27 lip crest .. 1 inner edge
    UV = np.stack([dkp, np.tile(np.arange(N_TH) / N_TH, len(PROFILE))], axis=1).astype(np.float32)
    P = P.astype(np.float32)
    F = []
    n = N_TH
    for k in range(len(PROFILE) - 1):
        for i in range(n):
            a, b1, c, d = k * n + i, k * n + (i + 1) % n, (k + 1) * n + i, (k + 1) * n + (i + 1) % n
            if miss[[a, b1, c, d]].any(): continue
            F += [[a, c, b1], [b1, c, d]]
    F = np.array(F, dtype=np.uint32)
    # normals in METRIC space (y, z are scaled by r ≈ 44 at runtime), pointing toward the hole axis / outward on the flange
    Pm = P.astype(np.float64) * np.array([1, 44, 44])
    fn = np.cross(Pm[F[:, 1]] - Pm[F[:, 0]], Pm[F[:, 2]] - Pm[F[:, 0]])
    N = np.zeros_like(Pm)
    for j in range(3): np.add.at(N, F[:, j], fn)
    ln = np.linalg.norm(N, axis=1, keepdims=True); N = np.where(ln > 1e-12, N / np.maximum(ln, 1e-12), [1.0, 0, 0])
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
    prim = {'attributes': {'POSITION': add(P, 'VEC3', 5126, 34962, True), 'NORMAL': add(N, 'VEC3', 5126, 34962), 'TEXCOORD_0': add(UV, 'VEC2', 5126, 34962)},
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
