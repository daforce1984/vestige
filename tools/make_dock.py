"""Docking rig for Sigma in the flagship's port launch bay -> assets/dock_rig.glb (original design).
Modelled in MOTHERSHIP-local space (glTF axes: +Z bow, +Y up, +X starboard); the bay is the port recess
x∈[-74,-62], y∈[-17,26], z∈[22,92]. Sigma docks upright facing out (-X), hip at (-66, -2.5, 57).
Nodes: 'frame' (back-wall cradle, pad, gantry), 'clampL' / 'clampR' (shoulder clamps; origin = hinge; rest pose = CLOSED,
arm reaching -X over the shoulder; the engine opens them by rotating about Z), 'door' (one 35 m sliding door leaf; origin
at its centre; the engine draws two instances and slides them along Z), 'mouth' (bay frame + door pockets)."""
import json, math, struct, pathlib

MATS = [('dock_metal', [0.16, 0.17, 0.19], 0.8, 0.4, None), ('dock_trim', [0.5, 0.5, 0.52], 0.9, 0.3, None),
        ('hazard', [0.75, 0.55, 0.05], 0.2, 0.5, None), ('dock_light', [0.3, 0.7, 1.0], 0.0, 0.3, [0.35, 0.85, 1.4]),
        ('amber', [1.0, 0.5, 0.1], 0.0, 0.4, [1.4, 0.6, 0.12]),
        ('hull', [0.092, 0.098, 0.114], 0.75, 0.46, None), ('trim', [0.12, 0.125, 0.14], 0.8, 0.42, None)]   # = hull gunmetal
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

# The bay sits in an armoured box that stands 9 m proud of the port hull: box face x = -71 over y -17..31, z 17..97,
# opening y -11..25, z 23..91, a landing ledge (x -74) along y -17..-12. Everything below is fitted to that face.
# ---- door leaf (34 m along Z × 36.5 m tall), slab x -72.2..-71.0 sitting flush in the box face, inside the frame.
# Local +Z points toward the centre seam for the leaf the engine places at z 74 (it mirrors the other with a scale of
# -1 on Z). Recessed panels between vertical ribs, two reinforcement belts, a hazard chevron strip and a row of seam
# lights on the leading edge, marker lamps along top and bottom. Opening, each leaf slides 34 m sideways into a
# pocket housing beside the bay.
D = Mesh()
X0 = -72.2                                                                      # outer face of the slab
D.box('hull', X0, -71.0, -18.25, 18.25, -17.0, 17.0)                      # slab
D.box('trim', X0 - 0.4, X0, -18.25, -17.3, -17.0, 17.0)                    # frame bottom
D.box('trim', X0 - 0.4, X0, 17.3, 18.25, -17.0, 17.0)                      # frame top
D.box('trim', X0 - 0.4, X0, -18.25, 18.25, -17.0, -16.0)                   # frame outer edge
for z in (-10.0, -3.0, 4.0, 11.0):                                              # vertical ribs
    D.box('hull', X0 - 0.55, X0, -17.3, 17.3, z - 0.4, z + 0.4)
for y in (-6.0, 6.0):                                                           # reinforcement belts
    D.box('trim', X0 - 0.65, X0, y - 0.8, y + 0.8, -16.0, 13.8)
    for z in (-13.5, -6.5, 0.5, 7.5, 12.5):                                     # belt bolts
        D.box('hull', X0 - 0.8, X0 - 0.65, y - 0.3, y + 0.3, z - 0.3, z + 0.3)
for k in range(8):                                                              # hazard chevrons on the leading strip
    y0 = -17.2 + k * 4.4
    D.box('hazard', X0 - 0.2, X0, y0, y0 + 2.1, 14.0, 15.9)
for k in range(9):                                                              # seam lights down the leading edge
    y0 = -16.0 + k * 4.0
    D.box('trim', X0 - 0.35, X0, y0 - 0.45, y0 + 0.45, 16.0, 16.8)
    D.box('dock_light', X0 - 0.45, X0 - 0.35, y0 - 0.3, y0 + 0.3, 16.1, 16.7)
for z in (-13.0, -5.0, 3.0, 10.0):                                              # marker lamps top and bottom
    for y in (-17.75, 17.75):
        D.box('trim', X0 - 0.55, X0 - 0.4, y - 0.3, y + 0.3, z - 0.8, z + 0.8)
        D.box('amber', X0 - 0.65, X0 - 0.55, y - 0.18, y + 0.18, z - 0.6, z + 0.6)
door = node('door', D, [0, 7.0, 0])

# ---- bay mouth frame (fixed, standing on the box face x = -71): header, jambs and a sill on the landing ledge,
# a bevelled inner lip, lamp fixtures along the header and the ledge face, hazard stripes, corner beacons, and the two
# door pockets (armoured housings on the hull either side of the bay the leaves slide into).
Fm = Mesh()
XF = -73.6                                                                      # outer face of the frame
Fm.box('hull', XF, -71.0, 25.0, 29.0, 19.5, 94.5)                         # header
Fm.box('hull', XF, -71.0, -12.0, 25.0, 19.5, 23.0)                        # aft jamb
Fm.box('hull', XF, -71.0, -12.0, 25.0, 91.0, 94.5)                        # fore jamb
Fm.box('hull', -74.0, -71.0, -12.0, -11.2, 19.5, 94.5)                    # sill on the ledge
Fm.box('trim', XF - 0.35, XF, 24.6, 25.4, 22.6, 91.4)                      # inner lip trims
Fm.box('trim', XF - 0.35, XF, -11.2, 25.4, 22.6, 23.4)
Fm.box('trim', XF - 0.35, XF, -11.2, 25.4, 90.6, 91.4)
for k in range(16):                                                             # hazard stripe along the ledge face
    z0 = 22.8 + k * 4.3
    Fm.box('hazard', -74.3, -74.0, -16.4, -15.0, z0, z0 + 2.0)
for k in range(15):                                                             # lamp fixtures: header, ledge face
    z0 = 25.5 + k * 4.4
    Fm.box('trim', XF - 0.3, XF, 26.4, 27.6, z0 - 1.0, z0 + 1.0)
    Fm.box('dock_light', XF - 0.4, XF - 0.3, 26.7, 27.3, z0 - 0.8, z0 + 0.8)
    Fm.box('trim', -74.3, -74.0, -13.6, -12.6, z0 - 1.0, z0 + 1.0)
    Fm.box('dock_light', -74.4, -74.3, -13.4, -12.8, z0 - 0.8, z0 + 0.8)
for z in (21.2, 92.8):                                                          # corner beacons
    for y in (27.0, -9.8):
        Fm.box('trim', XF - 0.6, XF, y - 0.7, y + 0.7, z - 0.7, z + 0.7)
        Fm.box('amber', XF - 1.1, XF - 0.6, y - 0.4, y + 0.4, z - 0.4, z + 0.4)
for z0, z1, zo in ((-14.5, 19.5, -1), (94.5, 128.5, 1)):                        # door pockets (hull x = -62)
    Fm.box('hull', XF, -62.0, -12.0, 29.0, z0, z1)
    ze = z0 if zo < 0 else z1                                                   # far end: chamfer-ish stepped cap
    Fm.box('trim', XF + 0.2, -62.0, -12.0, 29.0, ze - 0.6 * (zo < 0), ze + 0.6 * (zo > 0))
    Fm.box('trim', XF - 0.3, XF, 22.0, 23.2, z0 + 1.0, z1 - 1.0)            # rail covers
    Fm.box('trim', XF - 0.3, XF, -6.2, -5.0, z0 + 1.0, z1 - 1.0)
    for k in range(7):                                                          # hazard chevrons at the pocket mouth
        y0 = -10.5 + k * 5.2
        zc = z1 - 2.2 if zo < 0 else z0 + 2.2
        Fm.box('hazard', XF - 0.2, XF, y0, y0 + 2.4, zc - 1.0, zc + 1.0)
    for k in range(4):                                                          # running lights along the rails
        z = z0 + 4.0 + k * (z1 - z0 - 8.0) / 3
        Fm.box('dock_light', XF - 0.4, XF - 0.3, 22.3, 22.9, z - 0.6, z + 0.6)
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
