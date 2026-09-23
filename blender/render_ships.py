"""Eevee preview renders (3-point light rig, 1280x720, 3 angles) of exported ship GLBs.
Usage: blender.exe -b --factory-startup --python render_ships.py [-- name ...]
"""
import sys, os, math
import bpy
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
OUT = os.path.join(HERE, 'previews')
D2R = math.pi / 180
SHIPS = ['mothership', 'ion_frigate', 'assault_frigate', 'interceptor', 'enemy_frigate', 'enemy_dreadnought',
         'enemy_fighter']
# name: (azimuth, elevation, zoom, target fraction)  azimuth 0 = in front of the nose
VIEWS = {'hero': (-38, 16, 0.62, (0.5, 0.5, 0.5)), 'rear': (148, 20, 0.62, (0.5, 0.5, 0.5)),
         'side': (92, 6, 0.55, (0.5, 0.5, 0.5))}
CLOSE = {'detail': (-62, 22, 0.24, (0.5, 0.3, 0.6)), 'engines': (160, 10, 0.26, (0.5, 0.92, 0.5))}


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for d in list(c):
            c.remove(d)


def bbox(objs):
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def setup():
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE'
    s.render.resolution_x, s.render.resolution_y = 1280, 720
    s.render.resolution_percentage = 100
    try:
        s.eevee.taa_render_samples = 32
    except Exception:
        pass
    try:
        s.view_settings.view_transform = 'AgX'
        s.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    if not s.world:
        s.world = bpy.data.worlds.new('w')
    s.world.use_nodes = True
    bg = s.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.004, 0.005, 0.008, 1)
    bg.inputs['Strength'].default_value = 1.0
    s.render.image_settings.file_format = 'PNG'


def lights(center, r):
    specs = [('key', (-0.6, -0.9, 0.7), 4.0, (1.0, 0.95, 0.88)),
             ('fill', (1.0, -0.3, 0.1), 1.0, (0.7, 0.8, 1.0)),
             ('rim', (0.3, 1.0, 0.6), 5.0, (0.85, 0.9, 1.0))]
    for name, d, e, col in specs:
        L = bpy.data.lights.new(name, 'SUN')
        L.energy = e
        L.color = col
        L.angle = 2 * D2R
        o = bpy.data.objects.new(name, L)
        bpy.context.scene.collection.objects.link(o)
        dv = Vector(d).normalized()
        o.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()


def shot(center, radius, az, el, zoom, path, lens=45):
    s = bpy.context.scene
    cam = bpy.data.objects.get('_cam')
    if not cam:
        cam = bpy.data.objects.new('_cam', bpy.data.cameras.new('_cam'))
        s.collection.objects.link(cam)
    s.camera = cam
    cam.data.lens = lens
    vfov = 2 * math.atan(math.tan(cam.data.angle / 2) * 9 / 16)
    dist = radius / math.sin(vfov / 2) * zoom
    d = Vector((math.sin(az * D2R) * math.cos(el * D2R), -math.cos(az * D2R) * math.cos(el * D2R),
                math.sin(el * D2R)))
    cam.location = center + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = max(0.01, dist / 2000)
    cam.data.clip_end = dist * 10
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('WROTE', path, flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = argv or SHIPS
    os.makedirs(OUT, exist_ok=True)
    setup()
    for n in names:
        clear()
        bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, n + '.glb'))
        objs = list(bpy.data.objects)
        lo, hi = bbox(objs)
        r = (hi - lo).length / 2
        lights((lo + hi) / 2, r)
        views = dict(VIEWS)
        if n in ('mothership', 'enemy_dreadnought', 'ion_frigate', 'assault_frigate', 'enemy_frigate'):
            views.update(CLOSE)
        for vn, (az, el, zm, f) in views.items():
            c = lo + Vector([(hi[i] - lo[i]) * f[i] for i in range(3)])
            shot(c, r, az, el, zm, os.path.join(OUT, 'v2_%s_%s.png' % (n, vn)))


if __name__ == "__main__" and "render_ships" in " ".join(sys.argv):
    main()
