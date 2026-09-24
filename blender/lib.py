"""Shared procedural-modeling helpers (Blender 5.x, bmesh based).

Blender coordinates are used everywhere in the build scripts:
  forward (nose) = -Y, up = +Z, model's left = +X.
The glTF exporter (export_yup=True) maps this to nose +Z, up +Y, left +X.
"""
import bpy, bmesh, math, os, random
from mathutils import Vector, Matrix, Euler, noise

D2R = math.pi / 180.0

# ---------------------------------------------------------------- materials
MAT_SPECS = {}


def reg(name, color, metal=0.3, rough=0.5, emit=None, strength=0.0):
    """Register a material spec (created lazily per scene)."""
    MAT_SPECS[name] = (tuple(color), metal, rough, emit, strength)


def get_mat(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    color, metal, rough, emit, strength = MAT_SPECS[name]
    m = bpy.data.materials.new(name)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1.0)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emit is not None and strength > 0:
        p.inputs['Emission Color'].default_value = (*emit, 1.0)
        p.inputs['Emission Strength'].default_value = strength
        m.diffuse_color = (*emit, 1.0)
    else:
        m.diffuse_color = (*color, 1.0)
    m.metallic = metal
    m.roughness = rough
    return m


# ---------------------------------------------------------------- scene utils
def reset_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights,
                 bpy.data.images):
        for d in list(coll):
            coll.remove(d)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    MAT_SPECS.clear()


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def empty(name, loc, parent=None, parent_pivot=None, rot=(0, 0, 0), size=2.0):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = size
    loc = Vector(loc)
    if parent is not None:
        e.parent = parent
        e.matrix_parent_inverse = Matrix.Identity(4)
        loc = loc - Vector(parent_pivot)
    e.location = loc
    e.rotation_euler = Euler([r * D2R for r in rot])
    return link(e)


def set_parent(child, parent, child_pivot, parent_pivot):
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    child.location = Vector(child_pivot) - Vector(parent_pivot)


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def export_glb(path):
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', export_yup=True, export_apply=True,
        export_materials='EXPORT', export_extras=False, export_cameras=False,
        export_lights=False, use_selection=False, export_animations=False,
        export_texcoords=False, export_normals=True, export_tangents=False,
        export_image_format='NONE')


# ---------------------------------------------------------------- math helpers
def V(*a):
    if len(a) == 1:
        return Vector(a[0])
    return Vector(a)


def xform(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (Matrix.Translation(Vector(loc)) @ Euler([r * D2R for r in rot]).to_matrix().to_4x4()
            @ Matrix.Diagonal((*scale, 1.0)))


def align_z(p0, p1):
    """Matrix placing local Z along p0->p1, origin at midpoint. Returns (matrix, length)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    L = d.length
    up = 'Y' if abs(d.normalized().dot(Vector((0, 1, 0)))) < 0.99 else 'X'
    q = d.to_track_quat('Z', up)
    return Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4(), L


def lerp(a, b, t):
    return a + (b - a) * t


def interp(stations, s):
    """stations: list of tuples (s, v1, v2, ...) sorted by s. Linear interp of values."""
    if s <= stations[0][0]:
        return stations[0][1:]
    for a, b in zip(stations, stations[1:]):
        if a[0] <= s <= b[0]:
            t = (s - a[0]) / (b[0] - a[0]) if b[0] != a[0] else 0
            return tuple(lerp(x, y, t) for x, y in zip(a[1:], b[1:]))
    return stations[-1][1:]


# normalized cross-section profiles (u = x, v = z), counter-clockwise seen from +Y
PROF_OCT = [(1, -0.45), (1, 0.45), (0.55, 1), (-0.55, 1), (-1, 0.45), (-1, -0.45), (-0.55, -1), (0.55, -1)]
PROF_HULL = [(1, -0.25), (0.93, 0.5), (0.6, 1), (-0.6, 1), (-0.93, 0.5), (-1, -0.25),
             (-0.7, -0.85), (-0.25, -1), (0.25, -1), (0.7, -0.85)]
PROF_RECT = [(1, -1), (1, 1), (-1, 1), (-1, -1)]
PROF_DIAMOND = [(1, 0), (0.35, 0.55), (0, 1), (-0.35, 0.55), (-1, 0), (-0.35, -0.55), (0, -1), (0.35, -0.55)]
PROF_BLADE = [(1, 0), (0, 1), (-1, 0), (0, -1)]
PROF_WEDGE = [(1, -1), (0.8, 0.3), (0.3, 1), (-0.3, 1), (-0.8, 0.3), (-1, -1)]


def annulus(mb, center, axis, r_in, r_out, depth, mat, seg=32, mat_inner=None):
    """Thick ring around axis through center."""
    c, ax = Vector(center), Vector(axis).normalized()
    q = ax.to_track_quat('Z', 'Y' if abs(ax.y) < 0.99 else 'X').to_matrix()
    def circ(r, z):
        return [c + q @ Vector((math.cos(i / seg * 2 * math.pi) * r, math.sin(i / seg * 2 * math.pi) * r, z))
                for i in range(seg)]
    h = depth / 2
    mb.loft([circ(r_in, -h), circ(r_out, -h), circ(r_out, h), circ(r_in, h)], mat, wrap=True)
    if mat_inner:
        mb.loft([circ(r_in * 0.985, -h * 0.7), circ(r_in * 1.02, -h * 0.7), circ(r_in * 1.02, h * 0.7),
                 circ(r_in * 0.985, h * 0.7)], mat_inner, wrap=True)


def circle_prof(n, phase=0.5):
    return [(math.cos((i + phase) / n * 2 * math.pi), math.sin((i + phase) / n * 2 * math.pi)) for i in range(n)]


def ship_ring(s, w, h, cz=0.0, cx=0.0, prof=PROF_HULL):
    """Cross-section ring at station s (nose toward +s => Blender y = -s)."""
    return [Vector((cx + u * w / 2, -s, cz + v * h / 2)) for u, v in prof]


def frame_ring(origin, xa, ya, w, h, prof):
    o, xa, ya = Vector(origin), Vector(xa), Vector(ya)
    return [o + xa * (u * w / 2) + ya * (v * h / 2) for u, v in prof]


# ---------------------------------------------------------------- mesh builder
class MB:
    """Accumulates primitives into one bmesh with per-face materials."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []
        self._keep = []      # lone faces whose authored winding must survive recalc_face_normals()

    def keep(self, faces):
        """Register single (unconnected) faces, e.g. window panes / glow floors: recalc_face_normals() cannot
        orient an isolated flat face reliably, so to_object() restores the winding they were created with."""
        for f in faces:
            self._keep.append((f, f.loops[0].vert, f.loops[1].vert))

    # internal ---------------------------------------------------------
    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    @staticmethod
    def _faces_of(verts):
        fs = set()
        for v in verts:
            fs.update(v.link_faces)
        return list(fs)

    def _fin(self, faces, mat, bevel=0.0, seg=1):
        mi = self._mi(mat)
        for f in faces:
            f.material_index = mi
        if bevel > 0:
            es = list({e for f in faces for e in f.edges})
            bmesh.ops.bevel(self.bm, geom=es, offset=bevel, offset_type='OFFSET', segments=seg,
                            profile=0.5, affect='EDGES', clamp_overlap=True, material=mi)

    # primitives -------------------------------------------------------
    def box(self, c, s, mat, rot=(0, 0, 0), bevel=0.0):
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=xform(c, rot, s))
        self._fin(self._faces_of(r['verts']), mat, bevel)

    def hexa(self, pts, mat, bevel=0.0):
        """8 corners: bottom quad (4) then top quad (4), same winding."""
        vs = [self.bm.verts.new(Vector(p)) for p in pts]
        b, t = vs[:4], vs[4:]
        fs = [self.bm.faces.new(b[::-1]), self.bm.faces.new(t)]
        for i in range(4):
            j = (i + 1) % 4
            fs.append(self.bm.faces.new((b[i], b[j], t[j], t[i])))
        self._fin(fs, mat, bevel)

    def cyl(self, p0, p1, r0, r1=None, mat='metal', seg=16, bevel=0.0, caps=True):
        if r1 is None:
            r1 = r0
        M, L = align_z(p0, p1)
        r = bmesh.ops.create_cone(self.bm, cap_ends=caps, cap_tris=False, segments=seg,
                                  radius1=r0, radius2=r1, depth=L, matrix=M)
        self._fin(self._faces_of(r['verts']), mat, bevel)

    def sphere(self, c, r, mat, seg=16, rings=8, scale=(1, 1, 1), rot=(0, 0, 0), half=False):
        M = xform(c, rot, (r * scale[0], r * scale[1], r * scale[2]))
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0, matrix=M)
        verts = res['verts']
        if half:  # remove lower hemisphere (in local frame) -> dome
            Mi = M.inverted()
            kill = [v for v in verts if (Mi @ v.co).z < -1e-4]
            verts = [v for v in verts if (Mi @ v.co).z >= -1e-4]
            bmesh.ops.delete(self.bm, geom=kill, context='VERTS')
            bnd = list({e for v in verts for e in v.link_edges if e.is_boundary})
            if bnd:
                bmesh.ops.holes_fill(self.bm, edges=bnd, sides=0)
        self._fin(self._faces_of(verts), mat)

    def ico(self, c, r, mat, sub=2, scale=(1, 1, 1)):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=sub, radius=1.0,
                                         matrix=xform(c, (0, 0, 0), (r * scale[0], r * scale[1], r * scale[2])))
        self._fin(self._faces_of(res['verts']), mat)

    def loft(self, rings, mat, cap0=True, cap1=True, closed=True, bevel=0.0, wrap=False):
        """rings: list of point lists (equal length) or single points (tips)."""
        bm = self.bm
        vr = []
        fs = []
        for r in rings:
            if isinstance(r, Vector) or (len(r) == 3 and not hasattr(r[0], '__len__')):
                vr.append([bm.verts.new(Vector(r))])
            else:
                vr.append([bm.verts.new(Vector(p)) for p in r])
        pairs = list(zip(vr, vr[1:]))
        if wrap:
            pairs.append((vr[-1], vr[0]))
            cap0 = cap1 = False
        for a, b in pairs:
            if len(a) == 1 and len(b) == 1:
                continue
            n = max(len(a), len(b))
            m = n if closed else n - 1
            for i in range(m):
                j = (i + 1) % n
                if len(a) == 1:
                    fs.append(bm.faces.new((a[0], b[j], b[i])))
                elif len(b) == 1:
                    fs.append(bm.faces.new((a[i], a[j], b[0])))
                else:
                    fs.append(bm.faces.new((a[i], a[j], b[j], b[i])))
        if cap0 and len(vr[0]) > 2:
            fs.append(bm.faces.new(vr[0][::-1]))
        if cap1 and len(vr[-1]) > 2:
            fs.append(bm.faces.new(vr[-1]))
        self._fin(fs, mat, bevel)

    def nozzle(self, p, d, r, mat_body, mat_glow, length=None, flare=1.15, recess=0.35, seg=20):
        """Engine bell at point p pointing along direction d (exhaust side)."""
        p, d = Vector(p), Vector(d).normalized()
        L = length if length is not None else r * 0.9
        q = d.to_track_quat('Z', 'Y' if abs(d.y) < 0.99 else 'X')
        M = q.to_matrix()
        def ring(rr, z):
            return [p + M @ Vector((math.cos(a) * rr, math.sin(a) * rr, z))
                    for a in [i / seg * 2 * math.pi for i in range(seg)]]
        rim = r * flare
        self.loft([ring(r * 0.95, 0), ring(rim, L), ring(rim * 0.86, L), ring(r * 0.78, L * recess)],
                  mat_body, cap0=True, cap1=False)
        # glow disc deep in the bell
        self.cyl(p + d * (L * recess - 0.02 * r), p + d * (L * recess + 0.06 * r), r * 0.8, r * 0.8,
                 mat_glow, seg=seg)

    def pipe(self, pts, r, mat, seg=8, beads=0, bead_mat=None):
        pts = [Vector(p) for p in pts]
        for a, b in zip(pts, pts[1:]):
            self.cyl(a, b, r, r, mat, seg=seg)
        for p in pts[1:-1]:
            self.sphere(p, r, mat, seg=seg, rings=max(4, seg // 2))
        if beads:
            total = sum((b - a).length for a, b in zip(pts, pts[1:]))
            step = total / beads
            acc = step / 2
            for a, b in zip(pts, pts[1:]):
                L = (b - a).length
                d = (b - a).normalized()
                while acc < L:
                    c = a + d * acc
                    self.cyl(c - d * step * 0.3, c + d * step * 0.3, r * 1.35, r * 1.35, bead_mat or mat, seg=seg)
                    acc += step
                acc -= L

    # output -----------------------------------------------------------
    def to_object(self, name, pivot=(0, 0, 0), smooth_angle=35.0):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        for f, v0, v1 in getattr(self, '_keep', ()):
            if f.is_valid and not any(l.vert == v0 and l.link_loop_next.vert == v1 for l in f.loops):
                f.normal_flip()
        pivot = Vector(pivot)
        if pivot.length > 0:
            bm.transform(Matrix.Translation(-pivot))
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(get_mat(m))
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.set_sharp_from_angle(angle=smooth_angle * D2R)
        me.update()
        obj = bpy.data.objects.new(name, me)
        obj.location = pivot
        return link(obj)


def join_into(objs, name):
    """Join mesh objects (no modifiers pending) into the first one."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def rng(seed):
    return random.Random(seed)
