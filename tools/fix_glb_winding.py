"""Turn inside-out triangles the right way round in a built GLB, in place (2026-10-07): every triangle whose winding
disagrees with its vertex normals (the renderer shades by winding — they read dark / inside-out). The same fix now runs
in tools/build_rifles.py fix_winding; this applies it to already-built files without rebuilding everything.
usage: uv run --with pygltflib --with numpy tools/fix_glb_winding.py assets/cargo_game.glb [...]"""
import sys, numpy as np
from pygltflib import GLTF2
for path in sys.argv[1:]:
    g = GLTF2().load(path); blob = bytearray(g.binary_blob()); n = 0
    def view(acc, k):
        a = g.accessors[acc]; bv = g.bufferViews[a.bufferView]; dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a.componentType]
        off = bv.byteOffset + (a.byteOffset or 0)
        return np.frombuffer(bytes(blob[off: off + a.count * k * np.dtype(dt).itemsize]), dtype=dt).reshape(-1, k) if k > 1 else np.frombuffer(bytes(blob[off: off + a.count * np.dtype(dt).itemsize]), dtype=dt), off, dt
    for m in g.meshes:
        for p in m.primitives:
            if p.attributes.NORMAL is None: continue
            P, _, _ = view(p.attributes.POSITION, 3); N, _, _ = view(p.attributes.NORMAL, 3); I, off, dt = view(p.indices, 1)
            T = I.reshape(-1, 3).copy()
            fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]]); bad = (fn * N[T].sum(1)).sum(1) < 0
            T[bad, 1], T[bad, 2] = T[bad, 2].copy(), T[bad, 1].copy(); n += int(bad.sum())
            raw = T.reshape(-1).astype(dt).tobytes(); blob[off: off + len(raw)] = raw
    g.set_binary_blob(bytes(blob)); g.save_binary(path)
    print(path, 'flipped', n)
