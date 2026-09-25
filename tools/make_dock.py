"""Docking rig for Sigma in the flagship's port launch bay -> assets/dock_rig.glb (original design).
Modelled in MOTHERSHIP-local space (glTF axes: +Z bow, +Y up, +X starboard); the bay is the port recess
x∈[-74,-62], y∈[-17,26], z∈[22,92]. Sigma docks upright facing out (-X), hip at (-66, -2.5, 57).
Nodes: 'frame' (back-wall cradle, pad, gantry), 'clampL' / 'clampR' (shoulder clamps; origin = hinge; rest pose = CLOSED,
arm reaching -X over the shoulder; the engine opens them by rotating about Z), 'door' (one 35 m sliding door leaf; origin
at its centre; the engine draws two instances and slides them along Z)."""
import json, math, struct, pathlib

MATS = [('dock_metal', [0.16, 0.17, 0.19], 0.8, 0.4, None), ('dock_trim', [0.5, 0.5, 0.52], 0.9, 0.3, None),
        ('hazard', [0.75, 0.55, 0.05], 0.2, 0.5, None), ('dock_light', [0.3, 0.7, 1.0], 0.0, 0.3, [0.35, 0.85, 1.4]),
        ('amber', [1.0, 0.5, 0.1], 0.0, 0.4, [1.4, 0.6, 0.12])]
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
    def box(self, m, x0, x1, y0, y1, z0, z1):
        P = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
        c = [(x0+x1)/2, (y0+y1)/2, (z0+z1)/2]
        for f in [(0,1,2,3),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
            q = [P[k] for k in f]; self.tri(m, q[0], q[1], q[2], c); self.tri(m, q[0], q[2], q[3], c)
    def ring(self, m, cx, cy, cz, r0, r1, h, n=24):          # flat annulus in the XZ plane (landing ring)
        for i in range(n):
            a0, a1 = 2*math.pi*i/n, 2*math.pi*(i+1)/n
            p = lambda r, a, y: [cx + r*math.cos(a), y, cz + r*math.sin(a)]
            for y in (cy, cy + h):
                self.tri(m, p(r0, a0, y), p(r1, a0, y), p(r1, a1, y), [cx, cy - 1 if y == cy else cy + h + 1, cz])
                self.tri(m, p(r0, a0, y), p(r1, a1, y), p(r0, a1, y), [cx, cy - 1 if y == cy else cy + h + 1, cz])


def node(name, mesh, t, children=()):
    mi = None
    if mesh is not None: meshes.append(mesh); mi = len(meshes) - 1
    nodes.append({'name': name, 'translation': t, 'children': list(children), 'mesh': mi}); return len(nodes) - 1


# ---- frame: two pillars against the back wall, a landing pad with guide ring, a top gantry, cable conduits, lights
F = Mesh()
for z in (51.5, 62.5):
    F.box('dock_metal', -63.5, -61.8, -12.0, 15.0, z - 1.0, z + 1.0)            # pillars
    F.box('dock_trim', -64.2, -63.5, -11.0, 14.0, z - 0.4, z + 0.4)
    for y in (-8, -2, 4, 10): F.box('amber', -64.25, -64.1, y, y + 0.8, z - 0.25, z + 0.25)
F.box('dock_metal', -74.0, -62.0, -13.2, -12.0, 49.0, 65.0)                     # landing pad
F.box('hazard', -74.0, -72.8, -12.05, -11.95, 49.0, 65.0)                        # hazard edge
F.ring('dock_light', -67.5, -11.9, 57.0, 3.6, 4.2, 0.05)                         # guide ring
F.box('dock_metal', -64.0, -61.8, 14.0, 16.5, 49.5, 64.5)                        # top gantry
F.box('dock_metal', -70.5, -63.0, 15.0, 16.2, 56.0, 58.0)                        # gantry boom
F.box('dock_light', -70.4, -69.6, 14.7, 15.0, 56.3, 57.7)                        # boom lamp
for z in (53.5, 60.5): F.box('dock_trim', -62.6, -62.0, -11.0, 14.0, z - 0.3, z + 0.3)   # conduits
frame = node('frame', F, [0, 0, 0])

# ---- shoulder clamps: hinge on the pillar tops; rest pose = closed (arm reaching out over the shoulder)
clamps = []
for nm, z in (('clampL', 52.2), ('clampR', 61.8)):
    C = Mesh()
    C.box('dock_metal', -0.8, 0.6, -0.8, 0.8, -0.9, 0.9)                         # hinge block
    C.box('dock_metal', -4.6, -0.5, -0.5, 0.5, -0.6, 0.6)                         # arm
    C.box('dock_trim', -5.4, -3.8, -1.6, 0.3, -0.9, 0.9)                          # shoulder pad
    C.box('hazard', -5.45, -3.75, 0.3, 0.45, -0.9, 0.9)
    C.box('dock_light', -5.2, -4.0, -1.65, -1.55, -0.5, 0.5)
    clamps.append(node(nm, C, [-62.6, 11.5, z]))

# ---- door leaf (35 m along Z × 43 m tall), outer face at x = -75. Local +Z points toward the centre seam for the
# leaf the engine places at z 74.5 (it mirrors the other with a scale of -1 on Z). Heavy armoured slab with a frame,
# recessed panels between vertical ribs, two reinforcement belts, interlocking teeth + a hazard chevron band and a
# row of seam lights on the leading edge, marker lamps along top and bottom.
D = Mesh()
D.box('dock_metal', -75.4, -74.2, -21.5, 21.5, -17.5, 17.5)                     # slab
D.box('dock_trim', -75.9, -75.4, -21.5, -20.3, -17.5, 17.5)                     # frame bottom
D.box('dock_trim', -75.9, -75.4, 20.3, 21.5, -17.5, 17.5)                       # frame top
D.box('dock_trim', -75.9, -75.4, -21.5, 21.5, -17.5, -16.4)                     # frame outer edge
for z in (-10.5, -3.5, 3.5, 10.5):                                              # vertical ribs
    D.box('dock_metal', -76.3, -75.4, -20.3, 20.3, z - 0.45, z + 0.45)
for y in (-7.0, 7.0):                                                           # reinforcement belts
    D.box('dock_trim', -76.5, -75.4, y - 0.9, y + 0.9, -16.4, 14.5)
    for z in (-14.0, -7.0, 0.0, 7.0, 12.5):                                     # belt bolts
        D.box('dock_metal', -76.7, -76.5, y - 0.35, y + 0.35, z - 0.35, z + 0.35)
for k in range(8):                                                              # interlocking teeth on the leading edge
    y0 = -20.0 + k * 5.2
    D.box('dock_metal', -75.6, -74.0, y0, y0 + 2.4, 17.5, 18.6)
for k in range(9):                                                              # hazard chevrons on the leading strip
    y0 = -20.0 + k * 4.6
    D.box('hazard', -76.0, -75.8, y0, y0 + 2.2, 14.6, 16.8)
    D.box('dock_metal', -76.0, -75.85, y0 + 2.2, y0 + 4.6, 14.6, 16.8)
for k in range(10):                                                             # seam lights down the leading edge
    y0 = -19.0 + k * 4.2
    D.box('dock_trim', -75.95, -75.6, y0 - 0.5, y0 + 0.5, 16.8, 17.4)
    D.box('dock_light', -76.05, -75.95, y0 - 0.35, y0 + 0.35, 16.9, 17.3)
for z in (-14.0, -6.0, 2.0, 10.0):                                              # marker lamps top and bottom
    for y in (-20.9, 20.9):
        D.box('dock_trim', -76.1, -75.9, y - 0.35, y + 0.35, z - 0.9, z + 0.9)
        D.box('amber', -76.2, -76.1, y - 0.2, y + 0.2, z - 0.7, z + 0.7)
door = node('door', D, [0, 4.5, 0])

# ---- bay mouth frame (fixed): armoured jambs round the opening (y -17..26, z 22..92) with a bevelled inner lip,
# lamp fixtures every 4.5 m along top and bottom, hazard lips, corner beacons
Fm = Mesh()
Fm.box('dock_metal', -77.8, -74.9, 26.0, 29.2, 18.5, 95.5)                      # header
Fm.box('dock_metal', -77.8, -74.9, -20.2, -17.0, 18.5, 95.5)                    # sill
Fm.box('dock_metal', -77.8, -74.9, -17.0, 26.0, 18.5, 21.8)                     # aft jamb
Fm.box('dock_metal', -77.8, -74.9, -17.0, 26.0, 92.2, 95.5)                     # fore jamb
Fm.box('dock_trim', -78.3, -77.8, 25.4, 26.2, 21.4, 92.6)                       # inner lip trims
Fm.box('dock_trim', -78.3, -77.8, -17.2, -16.4, 21.4, 92.6)
Fm.box('dock_trim', -78.3, -77.8, -16.4, 25.4, 21.4, 22.2)
Fm.box('dock_trim', -78.3, -77.8, -16.4, 25.4, 91.8, 92.6)
for k in range(16):                                                             # hazard on the sill lip
    z0 = 22.5 + k * 4.35
    Fm.box('hazard', -78.35, -77.9, -20.0, -18.6, z0, z0 + 2.1)
for k in range(15):                                                             # lamp fixtures along header & sill
    z0 = 24.5 + k * 4.5
    for y in (27.6, -18.6):
        Fm.box('dock_trim', -78.4, -77.8, y - 0.55, y + 0.55, z0 - 1.1, z0 + 1.1)
        Fm.box('dock_light', -78.5, -78.4, y - 0.3, y + 0.3, z0 - 0.85, z0 + 0.85)
for z in (20.1, 93.9):                                                          # corner beacons
    for y in (27.8, -18.8):
        Fm.box('dock_metal', -78.6, -77.8, y - 0.7, y + 0.7, z - 0.7, z + 0.7)
        Fm.box('amber', -79.2, -78.6, y - 0.45, y + 0.45, z - 0.45, z + 0.45)
mouth = node('mouth', Fm, [0, 0, 0])

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
mats = []
for n, b, me, r, e in MATS:
    m = {'name': n, 'pbrMetallicRoughness': {'baseColorFactor': b + [1], 'metallicFactor': me, 'roughnessFactor': r}}
    if e:
        s = max(e); m['emissiveFactor'] = [x / s for x in e]
        if s > 1: m['extensions'] = {'KHR_materials_emissive_strength': {'emissiveStrength': s}}
    mats.append(m)
gl = {'asset': {'version': '2.0', 'generator': 'make_dock.py'}, 'scene': 0, 'scenes': [{'nodes': [frame] + clamps + [door, mouth]}], 'nodes': gl_nodes,
      'meshes': gmeshes, 'materials': mats, 'extensionsUsed': ['KHR_materials_emissive_strength'],
      'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gl).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
p = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'dock_rig.glb'
p.write_bytes(out); print(p, len(out), 'bytes', [n['name'] for n in nodes])
