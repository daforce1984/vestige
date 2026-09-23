"""Articulated armoured mech hand for the first-person shield tear -> assets/mech_hand.glb.
Frame = the hero's hand part (origin at the wrist pivot): fingers point -Y, palm faces +Z, width along X.
Nodes: 'palm' (root), 'f{i}_{s}' finger segments (i 0..3 index→little, s 1..3 base→tip), 'thumbR_{1,2}', 'thumbL_{1,2}'
(thumb on +X for the right hand, on -X for the left; hide the other). Every segment node's origin is its joint, so a pose
rotation about X curls it toward the palm. Flat shaded, three materials."""
import json, math, struct, pathlib

MATS = [('armor', [0.52, 0.44, 0.30], 0.15, 0.5), ('joint', [0.06, 0.06, 0.07], 0.8, 0.45), ('claw', [0.55, 0.56, 0.6], 1.0, 0.25)]
nodes, meshes = [], []


def norm(a):
    l = math.sqrt(sum(x * x for x in a)) or 1
    return [x / l for x in a]


class Mesh:
    def __init__(self): self.g = {m[0]: ([], []) for m in MATS}
    def tri(self, m, a, b, c, ref):
        v, ix = self.g[m]
        n = norm([(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]), (b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]), (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])])
        mid = [(a[k]+b[k]+c[k])/3 for k in range(3)]
        if sum(n[k]*(mid[k]-ref[k]) for k in range(3)) < 0: b, c = c, b; n = [-x for x in n]
        base = len(v); v += [p + n for p in (a, b, c)]; ix += [base, base+1, base+2]
    def hexa(self, m, P):
        c = [sum(p[k] for p in P)/8 for k in range(3)]
        for f in [(0,1,2,3),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
            q = [P[k] for k in f]; self.tri(m, q[0], q[1], q[2], c); self.tri(m, q[0], q[2], q[3], c)
    def box(self, m, x0, x1, y0, y1, z0, z1, taper=0.0, bev=0.0):
        # y0 = base (joint side), y1 = tip; the tip end shrinks by `taper`, top (+Z... back of hand = -Z) bevelled
        t = taper
        self.hexa(m, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
                      [x0+t, y1, z0+t], [x1-t, y1, z0+t], [x1-t, y1, z1-t-bev], [x0+t, y1, z1-t-bev]])
    def cyl(self, m, cx, cy, cz, r, x0, x1, n=8):   # knuckle roller along X
        ring = lambda x: [[x, cy + r*math.cos(2*math.pi*i/n), cz + r*math.sin(2*math.pi*i/n)] for i in range(n)]
        A, B = ring(x0), ring(x1); ref = [(x0+x1)/2, cy, cz]
        for i in range(n):
            j = (i+1) % n; self.tri(m, A[i], A[j], B[j], ref); self.tri(m, A[i], B[j], B[i], ref)
        for i in range(n):
            j = (i+1) % n; self.tri(m, [x0, cy, cz], A[i], A[j], [x0+1, cy, cz]); self.tri(m, [x1, cy, cz], B[i], B[j], [x1-1, cy, cz])


def add_node(name, mesh, t, children=()):
    mi = None
    if mesh is not None: meshes.append(mesh); mi = len(meshes) - 1
    nodes.append({'name': name, 'translation': t, 'children': list(children), 'mesh': mi})
    return len(nodes) - 1


# ---- fingers: 4 × 3 segments, index at +X... (x from +0.66 to -0.66); segment lengths shrink toward the tip
FX = [0.66, 0.22, -0.22, -0.66]
LEN = [[0.62, 0.5, 0.42], [0.68, 0.55, 0.45], [0.64, 0.52, 0.42], [0.52, 0.42, 0.36]]
W, TH = 0.36, 0.42
finger_roots = []
for i, fx in enumerate(FX):
    child = None
    for s in (3, 2, 1):
        L = LEN[i][s-1]
        m = Mesh()
        m.cyl('joint', 0, 0, 0.02, 0.2, -W*0.42, W*0.42)                              # knuckle roller at the joint
        m.box('armor', -W/2, W/2, -0.08, -L+0.04, -TH/2, TH/2, taper=0.03, bev=0.08)   # armoured phalanx
        m.box('joint', -W*0.38, W*0.38, -0.12, -L+0.1, TH/2-0.02, TH/2+0.05)          # palm-side pad
        if s == 3: m.hexa('claw', [[-W*0.4, -L+0.04, -TH*0.4], [W*0.4, -L+0.04, -TH*0.4], [W*0.4, -L+0.04, TH*0.3], [-W*0.4, -L+0.04, TH*0.3],
                                   [-0.05, -L-0.3, -TH*0.1], [0.05, -L-0.3, -TH*0.1], [0.05, -L-0.26, TH*0.25], [-0.05, -L-0.26, TH*0.25]])
        parentLen = LEN[i][s-2] if s > 1 else 0
        idx = add_node(f'f{i}_{s}', m, [0, -parentLen, 0] if s > 1 else [fx, -1.55, 0.0], [child] if child is not None else [])
        child = idx
    finger_roots.append(child)

# ---- thumbs (two mirrored variants on the palm sides), 2 segments, angled across the palm
thumb_roots = []
for side, nm in ((1, 'thumbR'), (-1, 'thumbL')):
    t2 = Mesh(); t2.cyl('joint', 0, 0, 0.02, 0.22, -0.2, 0.2); t2.box('armor', -0.2, 0.2, -0.08, -0.55, -0.24, 0.24, taper=0.03, bev=0.08)
    t2.hexa('claw', [[-0.16, -0.51, -0.18], [0.16, -0.51, -0.18], [0.16, -0.51, 0.14], [-0.16, -0.51, 0.14], [-0.04, -0.8, -0.05], [0.04, -0.8, -0.05], [0.04, -0.76, 0.12], [-0.04, -0.76, 0.12]])
    n2 = add_node(f'{nm}_2', t2, [0, -0.62, 0])
    t1 = Mesh(); t1.cyl('joint', 0, 0, 0.02, 0.26, -0.24, 0.24); t1.box('armor', -0.24, 0.24, -0.08, -0.66, -0.26, 0.26, taper=0.03, bev=0.08)
    thumb_roots.append(add_node(f'{nm}_1', t1, [side * 1.0, -0.45, 0.25], [n2]))

# ---- palm: armoured back plate, knuckle guard, wrist cuff
pm = Mesh()
pm.box('armor', -0.95, 0.95, 0.15, -1.45, -0.46, 0.32, taper=0.04, bev=0.1)
pm.box('armor', -0.9, 0.9, -1.25, -1.62, -0.56, -0.12, taper=0.02)                  # knuckle guard ridge (back of hand)
pm.box('joint', -0.85, 0.85, -0.1, -1.4, 0.3, 0.42)                                 # palm pad
pm.cyl('joint', 0, 0.1, 0.0, 0.42, -0.62, 0.62, 10)                                 # wrist joint
for k in range(3):                                                                   # back-of-hand plates
    pm.box('armor', -0.75 + k*0.5, -0.35 + k*0.5, -0.2, -1.1, -0.58, -0.44)
add_node('palm', pm, [0, 0, 0], finger_roots + thumb_roots)
root = len(nodes) - 1

# ---- write GLB
bin_ = bytearray(); views = []; accs = []
def add(data, fmt, count, typ, comp, target, mm=None):
    while len(bin_) % 4: bin_.append(0)
    off = len(bin_); bin_.extend(struct.pack('<%d%s' % (len(data), fmt), *data))
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(bin_) - off, 'target': target})
    a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': count, 'type': typ}
    if mm: a['min'], a['max'] = mm
    accs.append(a); return len(accs) - 1
gmeshes = []
for m in meshes:
    prims = []
    for mi, (name, *_r) in enumerate(MATS):
        v, ix = m.g[name]
        if not ix: continue
        pos = [x for p in v for x in p[:3]]; nrm = [x for p in v for x in p[3:]]
        mm = ([min(p[k] for p in v) for k in range(3)], [max(p[k] for p in v) for k in range(3)])
        prims.append({'attributes': {'POSITION': add(pos, 'f', len(v), 'VEC3', 5126, 34962, mm), 'NORMAL': add(nrm, 'f', len(v), 'VEC3', 5126, 34962)},
                      'indices': add(ix, 'I', len(ix), 'SCALAR', 5125, 34963), 'material': mi})
    gmeshes.append({'primitives': prims})
while len(bin_) % 4: bin_.append(0)
gl_nodes = []
for nd in nodes:
    o = {'name': nd['name'], 'translation': nd['translation']}
    if nd['children']: o['children'] = nd['children']
    if nd['mesh'] is not None: o['mesh'] = nd['mesh']
    gl_nodes.append(o)
gl = {'asset': {'version': '2.0', 'generator': 'make_mech_hand.py'}, 'scene': 0, 'scenes': [{'nodes': [root]}], 'nodes': gl_nodes, 'meshes': gmeshes,
      'materials': [{'name': n, 'pbrMetallicRoughness': {'baseColorFactor': b + [1], 'metallicFactor': me, 'roughnessFactor': r}} for n, b, me, r in MATS],
      'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gl).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
p = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'mech_hand.glb'
p.write_bytes(out)
print(p, len(out), 'bytes, nodes', [n['name'] for n in nodes])
