"""Render Workbench preview PNGs of exported GLBs (re-imported, so this also checks the export).
Usage: blender.exe -b --factory-startup --python render_previews.py [-- name1 name2 ...]
"""
import sys, os, math
import bpy
from mathutils import Vector, Euler

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
OUT = os.path.join(HERE, 'previews')
D2R = math.pi / 180

# (azimuth, elevation, zoom) ; azimuth 0 = camera in front of the nose (Blender -Y side)
SHIP_VIEWS = {'front': (-35, 18, 0.75), 'rear': (150, 22, 0.75), 'side': (90, 4, 0.62), 'top': (0, 89, 0.7)}
MS_VIEWS = {'front': (-25, 8, 1.0), 'back': (160, 12, 1.0), 'side': (90, 0, 1.0)}


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras):
        for d in list(c):
            c.remove(d)


def import_glb(name, offset=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not p:
            continue
        col = list(p.inputs['Base Color'].default_value)
        es = p.inputs['Emission Strength'].default_value
        ec = list(p.inputs['Emission Color'].default_value)
        if es > 0 and sum(ec[:3]) > 0:
            col = ec
        m.diffuse_color = col
        m.metallic = min(0.6, p.inputs['Metallic'].default_value)
        m.roughness = p.inputs['Roughness'].default_value
    return new


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


def setup_render():
    s = bpy.context.scene
    s.render.engine = 'BLENDER_WORKBENCH'
    s.render.resolution_x, s.render.resolution_y = 960, 540
    s.render.resolution_percentage = 100
    sh = s.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_cavity = True
    sh.cavity_type = 'BOTH'
    sh.cavity_ridge_factor = 1.0
    sh.cavity_valley_factor = 1.0
    sh.show_shadows = True
    sh.shadow_intensity = 0.35
    sh.show_specular_highlight = True
    s.display.shadow_focus = 0.2
    s.render.film_transparent = False
    if not s.world:
        s.world = bpy.data.worlds.new('w')
    s.world.color = (0.035, 0.04, 0.055)
    s.render.image_settings.file_format = 'PNG'


def camera_shot(center, radius, az, el, zoom, path, lens=40):
    s = bpy.context.scene
    cam = bpy.data.objects.get('_cam')
    if not cam:
        cam = bpy.data.objects.new('_cam', bpy.data.cameras.new('_cam'))
        s.collection.objects.link(cam)
    s.camera = cam
    cam.data.lens = lens
    vfov = 2 * math.atan(math.tan(cam.data.angle / 2) * 9 / 16)
    dist = radius / math.sin(vfov / 2) * 0.72 * zoom
    d = Vector((math.sin(az * D2R) * math.cos(el * D2R), -math.cos(az * D2R) * math.cos(el * D2R),
                math.sin(el * D2R)))
    cam.location = center + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    if el > 80:
        cam.rotation_euler = Euler((0, 0, 90 * D2R))
    cam.data.clip_start = max(0.01, dist / 1000)
    cam.data.clip_end = dist * 10
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('WROTE', path, flush=True)


def camera_at(loc, target, lens, path):
    s = bpy.context.scene
    cam = bpy.data.objects.get('_cam')
    if not cam:
        cam = bpy.data.objects.new('_cam', bpy.data.cameras.new('_cam'))
        s.collection.objects.link(cam)
    s.camera = cam
    cam.data.lens = lens
    cam.location = Vector(loc)
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start, cam.data.clip_end = 0.05, 1000
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('WROTE', path, flush=True)


def shoot(name, objs, views, tag=''):
    lo, hi = bbox(objs)
    c = (lo + hi) / 2
    r = (hi - lo).length / 2
    for vn, v in views.items():
        az, el, zm = v[:3]
        if len(v) > 3:
            c = lo + Vector([(hi[i] - lo[i]) * v[3][i] for i in range(3)])
        else:
            c = (lo + hi) / 2
        camera_shot(c, r, az, el, zm, os.path.join(OUT, '%s%s_%s.png' % (name, tag, vn)))


def pose_ms(pose):
    for n, rot in pose.items():
        o = bpy.data.objects.get(n)
        if o:
            o.rotation_mode = 'XYZ'
            o.rotation_euler = Euler([a * D2R for a in rot])
    bpy.context.view_layer.update()


POSE = {  # Blender-space euler degrees (x = pitch, forward is -Y)
    'arm_R_upper': (-75, 0, 0), 'arm_R_lower': (-30, 0, 0),
    'arm_L_upper': (-20, 0, 35), 'arm_L_lower': (-70, 0, 0), 'hand_L': (0, 0, 0),
    'leg_L_upper': (-50, 0, 0), 'leg_L_lower': (70, 0, 0), 'foot_L': (-20, 0, 0),
    'leg_R_upper': (15, 0, 0), 'leg_R_lower': (20, 0, 0),
    'torso': (8, 0, 20), 'head': (0, 0, -25), 'pelvis': (0, 0, 0),
}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = argv or ['mothership', 'ion_frigate', 'assault_frigate', 'interceptor', 'enemy_frigate',
                     'enemy_dreadnought', 'enemy_fighter', 'gundam', 'enemy_ms', 'gravity_well', 'hangar',
                     'debris']
    os.makedirs(OUT, exist_ok=True)
    setup_render()
    for n in names:
        clear()
        objs = import_glb(n)
        if n in ('gundam', 'enemy_ms'):
            shoot(n, objs, MS_VIEWS)
            head = bpy.data.objects.get('head')
            if head:
                hp = head.matrix_world.translation
                camera_shot(hp + Vector((0, -0.3, 1.2)), 3.6, -25, 8, 1.0, os.path.join(OUT, n + '_head.png'))
                camera_shot(Vector((0, 0, 11.5)), 7.5, -30, 10, 1.0, os.path.join(OUT, n + '_upper.png'))
            pose_ms(POSE)
            shoot(n, objs, {'posed': (-35, 10, 1.1)})
        elif n == 'hangar':
            lo, hi = bbox(objs)
            import_glb('gundam')
            s = bpy.context.scene
            camera_at((7, -24, 5), (0, 8, 9), 20, os.path.join(OUT, 'hangar_inside.png'))
            camera_at((-7, 50, 15), (0, -10, 6), 20, os.path.join(OUT, 'hangar_back.png'))
            camera_at((0, -60, 11), (0, 0, 9), 35, os.path.join(OUT, 'hangar_front.png'))
            shoot(n, objs, {'outside': (-40, 35, 1.0)})
        elif n == 'debris':
            # spread nodes out for viewing
            for o in objs:
                if o.parent is None and o.name[-1].isdigit():
                    i = int(o.name[-1])
                    o.location = Vector(((i - 1.5) * 18, 0, 10 if o.name.startswith('rock') else -8))
            bpy.context.view_layer.update()
            shoot(n, objs, {'all': (-10, 12, 0.9)})
        elif n == 'gravity_well':
            shoot(n, objs, {'front': (-10, 10, 0.9), 'angle': (-55, 25, 0.9)})
        else:
            views = dict(SHIP_VIEWS)
            if n in ('mothership', 'enemy_dreadnought'):
                views['close'] = (-60, 20, 0.3, (0.5, 0.2, 0.5))
                views['rclose'] = (160, 12, 0.3, (0.5, 0.95, 0.5))
            shoot(n, objs, views)


if __name__ == "__main__" and "render_previews" in " ".join(sys.argv):
    main()
