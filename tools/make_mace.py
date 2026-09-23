"""Procedural flanged war-mace for RX-H1 (original design) -> assets/mace.glb.
Axis +Z from the grip base (hand hilt) to the tip; metres. Flat-shaded; three materials."""
import json, math, struct, pathlib

MATS = [
    ('mace_metal', [0.20, 0.21, 0.23], 1.0, 0.38, [0, 0, 0]),
    ('mace_trim', [0.72, 0.72, 0.74], 1.0, 0.22, [0, 0, 0]),
    ('mace_glow', [0.2, 0.8, 1.0], 0.0, 0.3, [0.3, 1.6, 2.4]),
]
geo = {m[0]: ([], []) for m in MATS}   # name -> (verts[pos+nrm], idx)

def sub(a, b): return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def norm(a):
    l = math.sqrt(sum(x*x for x in a)) or 1
    return [x/l for x in a]

def tri(mat, a, b, c, ref=None):
    v, ix = geo[mat]
    n = norm(cross(sub(b, a), sub(c, a)))
    if ref is not None:   # make the face point away from ref (outward)
        mid = [(a[k]+b[k]+c[k])/3 for k in range(3)]
        if sum(n[k]*(mid[k]-ref[k]) for k in range(3)) < 0:
            b, c = c, b; n = [-x for x in n]
    base = len(v)
    for p in (a, b, c): v.append(p + n)
    ix += [base, base+1, base+2]

def quad(mat, a, b, c, d, ref): tri(mat, a, b, c, ref); tri(mat, a, c, d, ref)

def ring(r, z, n, ph=0.0): return [[r*math.cos(ph+2*math.pi*i/n), r*math.sin(ph+2*math.pi*i/n), z] for i in range(n)]

def frustum(mat, n, r0, r1, z0, z1, cap0=True, cap1=True, ph=0.0):
    A, B = ring(r0, z0, n, ph), ring(r1, z1, n, ph)
    axis = [0, 0, (z0+z1)/2]
    for i in range(n):
        j = (i+1) % n
        ref = [0, 0, (z0+z1)/2]
        quad(mat, A[i], A[j], B[j], B[i], ref)
    if cap0 and r0 > 0: [tri(mat, [0, 0, z0], A[i], A[(i+1) % n], [0, 0, z0+1]) for i in range(n)]
    if cap1 and r1 > 0: [tri(mat, [0, 0, z1], B[i], B[(i+1) % n], [0, 0, z1-1]) for i in range(n)]

def hexa(mat, P):
    """8 corners: P[0..3] one side loop, P[4..7] other side loop (same order)."""
    c = [sum(p[k] for p in P)/8 for k in range(3)]
    F = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    for f in F: quad(mat, *[P[k] for k in f], c)

def rotz(p, a): return [p[0]*math.cos(a)-p[1]*math.sin(a), p[0]*math.sin(a)+p[1]*math.cos(a), p[2]]

# pommel + grip (with trim rings) + collar
frustum('mace_trim', 8, 0.30, 0.55, -1.0, -0.6, ph=math.pi/8)
frustum('mace_metal', 8, 0.55, 0.42, -0.6, 0.0, ph=math.pi/8)
frustum('mace_metal', 8, 0.34, 0.34, 0.0, 7.2, cap0=False, cap1=False, ph=math.pi/8)
for z in (0.4, 2.2, 4.0, 5.8):
    frustum('mace_trim', 8, 0.42, 0.42, z, z+0.35, ph=math.pi/8)
frustum('mace_metal', 8, 0.42, 0.62, 7.2, 7.7, ph=math.pi/8)
frustum('mace_glow', 8, 0.64, 0.64, 7.7, 7.85, ph=math.pi/8)
# head: octagonal core + 6 heavy flanges + crown + spike
frustum('mace_metal', 8, 0.72, 0.95, 7.85, 8.6, ph=math.pi/8)
frustum('mace_metal', 8, 0.95, 0.95, 8.6, 10.6, ph=math.pi/8)
frustum('mace_metal', 8, 0.95, 0.55, 10.6, 11.3, ph=math.pi/8)
for k in range(6):
    a = 2*math.pi*k/6
    w = 0.2   # half thickness
    inner0, inner1 = 7.95, 11.1        # flange root z span
    outer0, outer1 = 8.7, 10.25        # flange blade z span (trapezoid)
    ri, ro = 0.7, 1.95
    pts = []
    for side in (-w, w):
        tip = 0.5 if side < 0 else 1.0   # slight bevel: one face leans
        pts.append([[ri, side, inner0], [ro, side*0.55, outer0], [ro, side*0.55, outer1], [ri, side, inner1]])
    hexa('mace_metal', [rotz(p, a) for p in pts[0] + pts[1]])
    # glowing seam where the flange meets the core
    g = [[0.96, -0.07, 8.3], [0.96, -0.07, 10.8], [1.0, 0.07, 10.8], [1.0, 0.07, 8.3]]
    gg = [[0.9, -0.07, 8.3], [0.9, -0.07, 10.8], [0.9, 0.07, 10.8], [0.9, 0.07, 8.3]]
    # trim cap along the outer blade edge
    e = [[ro-0.06, -0.13, outer0+0.05], [ro+0.08, -0.08, outer0+0.25], [ro+0.08, -0.08, outer1-0.25], [ro-0.06, -0.13, outer1-0.05],
         [ro-0.06, 0.13, outer0+0.05], [ro+0.08, 0.08, outer0+0.25], [ro+0.08, 0.08, outer1-0.25], [ro-0.06, 0.13, outer1-0.05]]
    hexa('mace_trim', [rotz(p, a) for p in e])
    b = 2*math.pi*(k+0.5)/6   # glow slot between flanges
    s = [[0.93, -0.12, 8.9], [0.93, -0.12, 10.3], [0.93, 0.12, 10.3], [0.93, 0.12, 8.9],
         [0.99, -0.1, 8.95], [0.99, -0.1, 10.25], [0.99, 0.1, 10.25], [0.99, 0.1, 8.95]]
    hexa('mace_glow', [rotz(p, b) for p in s])
frustum('mace_trim', 8, 0.58, 0.58, 11.3, 11.5, ph=math.pi/8)
frustum('mace_metal', 6, 0.5, 0.0, 11.5, 12.9, cap1=False)

# ---- write GLB
bin_ = bytearray(); views = []; accs = []; prims = []
bmin = [1e9]*3; bmax = [-1e9]*3
for mi, (name, *_rest) in enumerate(MATS):
    v, ix = geo[name]
    pos = [x for p in v for x in p[:3]]; nrm = [x for p in v for x in p[3:]]
    for p in v:
        for k in range(3): bmin[k] = min(bmin[k], p[k]); bmax[k] = max(bmax[k], p[k])
    def add(data, fmt, count, typ, comp, target, mm=None):
        while len(bin_) % 4: bin_.append(0)
        off = len(bin_); bin_.extend(struct.pack('<%d%s' % (len(data), fmt), *data))
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(bin_)-off, 'target': target})
        a = {'bufferView': len(views)-1, 'componentType': comp, 'count': count, 'type': typ}
        if mm: a['min'], a['max'] = mm
        accs.append(a); return len(accs)-1
    pmin = [min(p[k] for p in v) for k in range(3)]; pmax = [max(p[k] for p in v) for k in range(3)]
    ap = add(pos, 'f', len(v), 'VEC3', 5126, 34962, (pmin, pmax))
    an = add(nrm, 'f', len(v), 'VEC3', 5126, 34962)
    ai = add(ix, 'I', len(ix), 'SCALAR', 5125, 34963)
    prims.append({'attributes': {'POSITION': ap, 'NORMAL': an}, 'indices': ai, 'material': mi})
while len(bin_) % 4: bin_.append(0)
gl = {'asset': {'version': '2.0', 'generator': 'make_mace.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
      'nodes': [{'name': 'mace', 'mesh': 0}], 'meshes': [{'name': 'mace', 'primitives': prims}],
      'materials': [{'name': n, 'pbrMetallicRoughness': {'baseColorFactor': b + [1], 'metallicFactor': m, 'roughnessFactor': r}, 'emissiveFactor': [min(1, x) for x in e],
                     **({'extensions': {'KHR_materials_emissive_strength': {'emissiveStrength': max(e)}}} if max(e) > 1 else {})} for n, b, m, r, e in MATS],
      'extensionsUsed': ['KHR_materials_emissive_strength'],
      'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gl).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
p = pathlib.Path(__file__).resolve().parent.parent / 'assets' / 'mace.glb'
p.write_bytes(out)
print(p, len(out), 'bytes', 'tris', sum(len(geo[m[0]][1])//3 for m in MATS), 'bounds', bmin, bmax)
