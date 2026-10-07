"""Ball joints filling a mech's sockets (2026-10-07): VANGUARD's shoulder blocks swung away from its torso when the arm
reached back (scene 35, the draw from its thigh holster) and left open sky between them — the shoulder seemed to come
off. A dark ball (the 'inner' material: the renderer draws it untextured, gunmetal) is added to the PARENT part at each
joint pivot, a little inboard, so the socket stays filled however the limb turns. Idempotent (replaces its own balls).
usage: uv run --with pygltflib --with numpy tools/add_joint_balls.py enemy_ms"""
import os, sys, numpy as np
from pygltflib import GLTF2, BufferView, Accessor, Material, PbrMetallicRoughness, Primitive, Attributes
sys.path.insert(0, os.path.dirname(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BALLS = {'enemy_ms': {'torso': [((-3.1, 5.15, 0.0), 1.05), ((3.1, 5.15, 0.0), 1.05)]}}   # parent part: [(centre in its frame, radius)]

def sphere(c, r, nu=16, nv=10):
    V, N, F = [], [], []
    for j in range(nv + 1):
        th = np.pi * j / nv
        for i in range(nu + 1):
            ph = 2 * np.pi * i / nu; n = np.array([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)])
            V.append(np.array(c) + n * r); N.append(n)
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i; b = a + nu + 1
            F += [(a, a + 1, b), (a + 1, b + 1, b)]
    return np.array(V, np.float32), np.array(N, np.float32), np.array(F, np.uint32)

name = sys.argv[1] if len(sys.argv) > 1 else 'enemy_ms'
path = os.path.join(ROOT, 'assets', name + '.glb')
g = GLTF2().load(path); blob = bytearray(g.binary_blob())
mi = next((i for i, m in enumerate(g.materials) if m.name == 'inner'), None)
if mi is None:
    g.materials.append(Material(name='inner', pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=[0.07, 0.072, 0.078, 1], metallicFactor=0.8, roughnessFactor=0.5))); mi = len(g.materials) - 1
for n in g.nodes:
    if n.mesh is None or n.name not in BALLS[name]: continue
    m = g.meshes[n.mesh]
    m.primitives = [p for p in m.primitives if not (p.extras or {}).get('jointBall')]
    for c, r in BALLS[name][n.name]:
        V, N, F = sphere(c, r); UV = np.zeros((len(V), 2), np.float32); acs = []
        for arr, typ, tgt, comp in ((V, 'VEC3', 34962, 5126), (N, 'VEC3', 34962, 5126), (UV, 'VEC2', 34962, 5126), (F.reshape(-1), 'SCALAR', 34963, 5125)):
            while len(blob) % 4: blob.append(0)
            off = len(blob); data = arr.tobytes(); blob.extend(data)
            g.bufferViews.append(BufferView(buffer=0, byteOffset=off, byteLength=len(data), target=tgt))
            a = Accessor(bufferView=len(g.bufferViews) - 1, componentType=comp, count=len(arr), type=typ)
            if arr is V: a.min = V.min(0).tolist(); a.max = V.max(0).tolist()
            g.accessors.append(a); acs.append(len(g.accessors) - 1)
        m.primitives.append(Primitive(attributes=Attributes(POSITION=acs[0], NORMAL=acs[1], TEXCOORD_0=acs[2]), indices=acs[3], material=mi, extras={'jointBall': True}))
        print(n.name, 'ball at', c, 'r', r)
g.buffers[0].byteLength = len(blob); g.set_binary_blob(bytes(blob)); g.save_binary(path)
