"""Sigma's beam rifle (original, 2026-09-30) — heavy armoured plates in his worn-tan paint over blackened-steel
mechanics, cyan reactor light (his chest-core rings on the receiver side and at the muzzle).

Coordinates below are glTF / rifle-node space (m): grip (his fist) at the origin, barrel +Z, up +Y, +X = the side
facing his left hand. Contract points used by js/duel.js: muzzle (0, 1.96, 21.48), fore-grip (0, -0.7, 4.5),
E-pac socket bottom (1.6, -1.0, 1.85), eject port (0.62, 3.6, 0.4).

Usage: blender.exe -b --factory-startup --python blender/build_hero_rifle.py -- <out.glb>
"""
import bpy, bmesh, sys, math
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)

def B(p):                       # glTF (x, y, z) → Blender (x, -z, y)
    return Vector((p[0], -p[2], p[1]))

MATS = {}
def mat(name, rgb, metal, rough, emis=None, es=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emis:
        b.inputs['Emission Color'].default_value = (*emis, 1); b.inputs['Emission Strength'].default_value = es
    MATS[name] = m
mat('paint', (0.30, 0.255, 0.18), 0.15, 0.62)          # his worn tan armour
mat('paint_dk', (0.16, 0.135, 0.095), 0.15, 0.55)      # the darker bronze-tan accents
mat('steel', (0.035, 0.034, 0.036), 0.8, 0.38)         # blackened steel mechanics
mat('bronze', (0.20, 0.13, 0.06), 0.85, 0.35)          # worn bronze collars (his actuator collars)
mat('recess', (0.02, 0.021, 0.024), 0.3, 0.85)
mat('core', (0.1, 0.1, 0.1), 0.0, 0.3, (0.35, 0.85, 1.0), 4.0)

parts = []
def finish(ob, m, bevel=0.0, seg=2):
    ob.data.materials.append(MATS[m])
    if bevel > 0:
        md = ob.modifiers.new('bv', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(40)
    parts.append(ob); return ob

def box(lo, hi, m, bevel=0.08, taper=None, seg=2):
    """axis box between glTF corners lo/hi; taper=(sx, sy) scales the +Z end face (x, y) about its centre"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        g = [lo[i] + (hi[i] - lo[i]) * (v.co[i] + 0.5) for i in range(3)]
        if taper and v.co[2] > 0:
            cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
            g[0] = cx + (g[0] - cx) * taper[0]; g[1] = cy + (g[1] - cy) * taper[1]
        v.co = B(g)
    me = bpy.data.meshes.new('b'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('b', me); bpy.context.scene.collection.objects.link(ob)
    return finish(ob, m, bevel, seg)

def cyl(c, r, z0, z1, m, n=16, bevel=0.0, r1=None, rot=0.0):
    """cylinder / cone along +Z (glTF) at centre (cx, cy), radius r (→ r1 at z1)"""
    bm = bmesh.new()
    r1 = r if r1 is None else r1
    ring0 = [bm.verts.new(B((c[0] + r * math.cos(a), c[1] + r * math.sin(a), z0))) for a in [rot + 2 * math.pi * i / n for i in range(n)]]
    ring1 = [bm.verts.new(B((c[0] + r1 * math.cos(a), c[1] + r1 * math.sin(a), z1))) for a in [rot + 2 * math.pi * i / n for i in range(n)]]
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((ring0[i], ring0[j], ring1[j], ring1[i]))
    bm.faces.new(list(reversed(ring0))); bm.faces.new(ring1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('c'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('c', me); bpy.context.scene.collection.objects.link(ob)
    return finish(ob, m, bevel)

def ring_x(c, r, t, x0, x1, m, n=24):
    """disc / ring facing ±X (the side reactor): cylinder along X at (y, z) = c"""
    bm = bmesh.new()
    a0 = [bm.verts.new(B((x0, c[0] + r * math.cos(2 * math.pi * i / n), c[1] + r * math.sin(2 * math.pi * i / n)))) for i in range(n)]
    a1 = [bm.verts.new(B((x1, c[0] + r * math.cos(2 * math.pi * i / n), c[1] + r * math.sin(2 * math.pi * i / n)))) for i in range(n)]
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((a0[i], a0[j], a1[j], a1[i]))
    bm.faces.new(list(reversed(a0))); bm.faces.new(a1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('r'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('r', me); bpy.context.scene.collection.objects.link(ob)
    return finish(ob, m, 0)

def prism(prof, x0, x1, m, bevel=0.1, seg=1):
    """side-profile [(z, y), ...] (counter-clockwise seen from +X) extruded from x0 to x1"""
    bm = bmesh.new()
    f0 = [bm.verts.new(B((x0, y, z))) for z, y in prof]
    f1 = [bm.verts.new(B((x1, y, z))) for z, y in prof]
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n; bm.faces.new((f0[i], f0[j], f1[j], f1[i]))
    bm.faces.new(list(reversed(f0))); bm.faces.new(f1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('p'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('p', me); bpy.context.scene.collection.objects.link(ob)
    return finish(ob, m, bevel, seg)

def both(prof, x0, x1, m, bevel=0.1, seg=1):     # mirrored pair of side plates (x0 < x1, both > 0)
    prism(prof, x0, x1, m, bevel, seg); prism(prof, -x1, -x0, m, bevel, seg)

BY = 1.96                                    # bore axis height
# ---- the body: one bullpup silhouette in blackened steel (stock → receiver → fore-end)
prism([(-6.7, 0.35), (-6.1, 0.35), (-4.9, 1.35), (-2.3, 1.05), (-0.8, 0.55), (2.8, 0.45), (7.3, 0.85), (7.3, 3.0),
       (6.3, 3.3), (1.8, 3.45), (-5.4, 3.45), (-6.7, 3.25)], -0.9, 0.9, 'steel', 0.08)
# armour: the stock shell, the receiver cheek plates, the fore-end plates (tan, chamfered, dark seams between)
both([(-6.85, 0.25), (-6.2, 0.25), (-5.0, 1.45), (-3.6, 1.6), (-3.6, 3.35), (-6.85, 3.35)], 0.86, 1.0, 'paint', 0.14)
both([(-3.45, 1.55), (0.3, 1.1), (2.9, 1.1), (3.2, 1.5), (3.2, 3.2), (-3.45, 3.3)], 0.88, 1.08, 'paint', 0.16)
both([(3.35, 1.2), (7.1, 1.55), (7.1, 2.95), (6.3, 3.2), (3.35, 3.2)], 0.86, 1.02, 'paint', 0.14)
both([(-2.9, 2.35), (2.7, 2.35), (2.7, 2.45), (-2.9, 2.45)], 1.08, 1.1, 'core', 0.0)             # a thin cyan seam light along the cheek
both([(-3.3, 0.95), (0.0, 0.62), (2.7, 0.62), (2.7, 1.0), (-3.3, 1.45)], 0.84, 0.98, 'paint_dk', 0.08)   # lower skirt
prism([(-6.6, 3.3), (-3.2, 3.3), (-2.8, 3.62), (-6.3, 3.62)], -0.72, 0.72, 'paint_dk', 0.12)        # stock top cover
prism([(3.4, 3.15), (6.2, 3.15), (6.9, 2.9), (6.9, 3.05), (6.1, 3.42), (3.4, 3.42)], -0.8, 0.8, 'paint', 0.12)   # fore top cover
box((-0.62, -0.05, -6.95), (0.62, 3.2, -6.72), 'steel', 0.08)                                     # butt pad
cyl((0, 1.0), 0.14, -2.6, 6.9, 'steel', 8); cyl((0.93, 1.35), 0.12, -2.6, 6.9, 'steel', 8); cyl((-0.93, 1.35), 0.12, -2.6, 6.9, 'steel', 8)   # conduits
# the side reactor (his chest-core rings): bronze housing, a recessed ring, cyan centre — both sides
for sx in (-1, 1):
    x0 = sx * 1.08
    ring_x((2.2, -1.5), 0.58, 0, x0, x0 + sx * 0.1, 'bronze')
    ring_x((2.2, -1.5), 0.45, 0, x0 + sx * 0.1, x0 + sx * 0.13, 'recess')
    ring_x((2.2, -1.5), 0.3, 0, x0 + sx * 0.1, x0 + sx * 0.16, 'core')
    ring_x((2.2, -1.5), 0.14, 0, x0 + sx * 0.16, x0 + sx * 0.2, 'bronze')
# top: ejection port cover (the spent pac pops out here, 0.9, 2.8, 0.4), a ribbed rail, the scope
box((0.3, 3.3, -0.5), (0.95, 3.6, 1.3), 'bronze', 0.05)
for k in range(6):
    box((-0.4, 3.4, -2.6 + k * 0.42), (0.4, 3.66, -2.38 + k * 0.42), 'steel', 0.03)
prism([(1.5, 3.55), (4.3, 3.55), (4.8, 3.85), (4.8, 4.45), (4.1, 4.6), (1.9, 4.6), (1.5, 4.3)], -0.48, 0.48, 'paint_dk', 0.1)   # scope body
cyl((0, 4.05), 0.32, 4.8, 4.95, 'bronze', 12); cyl((0, 4.05), 0.24, 4.95, 4.99, 'core', 12)
cyl((0, 4.1), 0.26, 1.2, 1.5, 'steel', 12)
# ---- pistol grip (his fist wraps the origin), guard
prism([(-0.75, 0.6), (0.35, 0.6), (0.1, -1.7), (-0.35, -2.05), (-1.1, -2.05), (-0.95, -1.5)], -0.48, 0.48, 'steel', 0.14, 2)
prism([(-1.15, -2.2), (-0.3, -2.2), (0.12, -1.72), (-0.95, -1.72)], -0.52, 0.52, 'paint_dk', 0.06)
prism([(0.35, 0.5), (2.1, 0.5), (2.1, -1.0), (0.2, -1.2), (0.2, -0.95), (1.85, -0.78), (1.85, 0.25), (0.35, 0.25)], -0.18, 0.18, 'steel', 0.04)
# ---- E-pac socket on his-left side, ahead of the grip (the pac is slammed up into it)
prism([(1.0, 0.7), (2.6, 0.7), (2.5, -1.0), (1.2, -1.0)], 0.3, 1.95, 'paint', 0.12)
box((1.1, -1.07, 1.4), (1.8, -0.9, 2.3), 'recess', 0.03)
box((1.95, -0.6, 1.45), (2.01, 0.4, 2.3), 'core', 0.0)                          # charge-level window
# ---- vertical fore-grip (his left hand at (0, -0.7, 4.5))
prism([(3.95, 0.7), (5.15, 0.7), (5.0, -1.85), (4.1, -1.85)], -0.42, 0.42, 'steel', 0.12, 2)
prism([(3.9, -1.8), (5.1, -1.8), (5.05, -2.12), (3.95, -2.12)], -0.46, 0.46, 'bronze', 0.05)
# ---- the slide (Beretta-style): two slim tan side plates with an open top, the thin barrel showing between them
for sx in (-1, 1):
    prism([(7.2, BY - 0.62), (14.4, BY - 0.5), (15.0, BY - 0.2), (15.0, BY + 0.45), (14.3, BY + 0.62), (7.2, BY + 0.72)],
          sx * 0.36 if sx > 0 else -0.52, 0.52 if sx > 0 else -0.36, 'paint', 0.06)
    for k in range(5):                                                             # serrations on the slide
        box((sx * 0.5 if sx > 0 else -0.545, BY - 0.35, 8.0 + k * 0.28), (0.545 if sx > 0 else -0.5, BY + 0.45, 8.12 + k * 0.28), 'recess', 0)
    box((sx * 0.5 if sx > 0 else -0.53, BY + 0.05, 9.0), (0.53 if sx > 0 else -0.5, BY + 0.11, 14.2), 'core', 0)   # a thin cyan seam along it
box((-0.36, BY - 0.62, 7.2), (0.36, BY - 0.42, 14.4), 'steel', 0.03)               # the slide's floor under the barrel
box((-0.52, BY - 0.2, 14.4), (0.52, BY + 0.45, 15.0), 'paint', 0.05)               # the nose block (the open top ends here)
# ---- the thin barrel, running long past the slide → a slim crown with the cyan emitter
cyl((0, BY), 0.26, 7.0, 21.2, 'steel', 16)
cyl((0, BY), 0.34, 15.0, 15.5, 'bronze', 16)
cyl((0, BY), 0.3, 18.2, 18.5, 'bronze', 16)
cyl((0, BY), 0.36, 20.5, 21.3, 'paint_dk', 8, 0.03, r1=0.32, rot=math.pi / 8)
cyl((0, BY), 0.26, 21.3, 21.42, 'bronze', 16)
cyl((0, BY), 0.2, 21.42, 21.48, 'core', 16)
cyl((0, BY), 0.1, 21.43, 21.5, 'recess', 12)
ring_x((2.3, -6.2), 0.2, 0, 1.0, 1.05, 'core'); ring_x((2.3, -6.2), 0.2, 0, -1.05, -1.0, 'core')

# ---- apply modifiers, join into one 'rifle' mesh at the grip
bpy.ops.object.select_all(action='DESELECT')
for ob in parts:
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for md in list(ob.modifiers):
        with bpy.context.temp_override(object=ob, active_object=ob): bpy.ops.object.modifier_apply(modifier=md.name)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
rf = bpy.context.view_layer.objects.active; rf.name = 'rifle'; rf.data.name = 'rifle'
for p in rf.data.polygons: p.use_smooth = False
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_texcoords=True, export_normals=True)
print('TRIS', sum(len(p.vertices) - 2 for p in rf.data.polygons))
