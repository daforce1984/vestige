"""Render duel states dumped by duel_dump.mjs (engine-exact part matrices + saber beams).
blender -b --factory-startup --python blender/duel_preview.py -- frames.json outdir prefix
"""
import bpy, sys, os, json, math
from mathutils import Matrix, Vector, Quaternion
argv = sys.argv[sys.argv.index('--') + 1:]
frames = json.load(open(argv[0])); outdir = argv[1]; prefix = argv[2]
sys.path.insert(0, r'D:\_AI_GENERATED\______2026\opus5_5test\blender')
import render_previews as rp
rp.setup_render()
s = bpy.context.scene
s.render.resolution_x, s.render.resolution_y = 960, 540
s.view_settings.view_transform = 'Standard'
s.view_settings.exposure = 1.3
s.world.color = (0.09, 0.1, 0.13)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # glTF -> Blender
Ci = C.inverted()
models = {}
for name in ('gundam', 'enemy_ms'):
    objs = rp.import_glb(name)
    mp = {}
    for o in objs:
        base = o.name.split('.')[0]
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        mp[base] = o
    models[name] = mp
# saber beams
def beam(name, col):
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.45, depth=1)
    o = bpy.context.object; o.name = name
    m = bpy.data.materials.new(name); m.diffuse_color = col; o.data.materials.append(m)
    return o
beams = {'gundam': beam('beamH', (1.0, 0.35, 0.8, 1)), 'enemy_ms': beam('beamE', (1.0, 0.55, 0.15, 1))}
boltObj = beam('bolt', (0.3, 1.0, 0.9, 1))
def gl2b(v): return Vector((v[0], -v[2], v[1]))
def gm(a):  # column-major flat -> Matrix
    return Matrix([[a[0], a[4], a[8], a[12]], [a[1], a[5], a[9], a[13]], [a[2], a[6], a[10], a[14]], [0, 0, 0, 1]])
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
cam.data.sensor_fit = 'VERTICAL'
for i, fr in enumerate(frames):
    used = set()
    for m in fr['mechs']:
        mp = models[m['model']]; used.add(m['model'])
        for p, arr in m['mats'].items():
            o = mp.get(p)
            if o: o.matrix_world = C @ gm(arr) @ Ci
        for o in mp.values(): o.hide_render = False
        b = beams[m['model']]
        if m['saber']:
            a, c = gl2b(m['saber'][0]), gl2b(m['saber'][1])
            d = c - a
            b.hide_render = False
            b.location = (a + c) / 2
            b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
            b.scale = (1, 1, d.length)
        else: b.hide_render = True
    for name, mp in models.items():
        if name not in used:
            for o in mp.values(): o.hide_render = True
            beams[name].hide_render = True
    bl = fr.get('bolt')
    if bl:
        a, c2 = gl2b(bl[0]), gl2b(bl[1]); d = c2 - a
        boltObj.hide_render = False; boltObj.location = (a + c2) / 2
        boltObj.rotation_mode = 'QUATERNION'; boltObj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        boltObj.scale = (0.5, 0.5, d.length)
    else: boltObj.hide_render = True
    c = fr['cam']
    cam.location = gl2b(c['pos'])
    d = gl2b(c['target']) - cam.location
    q = d.to_track_quat('-Z', 'Y')
    q = q @ Quaternion((0, 0, 1), -c.get('roll', 0))
    cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = q
    cam.data.angle_y = math.radians(c['fov'])
    cam.data.clip_start, cam.data.clip_end = 0.5, 3000
    s.render.filepath = os.path.join(outdir, '%s_%06.2f_%s.png' % (prefix, fr['t'], fr['mode']))
    bpy.ops.render.render(write_still=True)
    print('WROTE', s.render.filepath, flush=True)
