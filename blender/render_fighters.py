"""Eevee preview renders of the fighter variants (3-point rig, 1280x720, several angles).
Usage (WSL):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/render_fighters.py)" [-- name ... | --views hero,rear]
Writes blender/previews/fighters_<name>_<view>.png
"""
import sys, os, math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from render_ships import clear, bbox, setup, lights, shot

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
OUT = os.path.join(HERE, 'previews')
NAMES = ['interceptor', 'interceptor_b', 'interceptor_c', 'enemy_fighter', 'enemy_fighter_b', 'enemy_fighter_c']
# name: (azimuth, elevation, zoom, target fraction)   azimuth 0 = in front of the nose
VIEWS = {'hero': (-38, 18, 0.62, (0.5, 0.5, 0.5)), 'rear': (150, 22, 0.62, (0.5, 0.5, 0.5)),
         'side': (90, 4, 0.55, (0.5, 0.5, 0.5)), 'top': (0.01, 88, 0.8, (0.5, 0.5, 0.5)),
         'below': (-120, -30, 0.62, (0.5, 0.5, 0.5)), 'close': (-55, 25, 0.3, (0.5, 0.25, 0.65)),
         'topclose': (0.01, 88, 0.3, (0.22, 0.45, 0.5))}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    views = list(VIEWS)
    if '--views' in argv:
        i = argv.index('--views')
        views = argv[i + 1].split(',')
        argv = argv[:i] + argv[i + 2:]
    names = argv or NAMES
    os.makedirs(OUT, exist_ok=True)
    setup()
    s = bpy.context.scene
    try:
        s.eevee.taa_render_samples = 24
    except Exception:
        pass
    for n in names:
        clear()
        bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, n + '.glb'))
        objs = list(bpy.data.objects)
        lo, hi = bbox(objs)
        r = (hi - lo).length / 2
        lights((lo + hi) / 2, r)
        L = bpy.data.lights.new('under', 'SUN')       # soft under-fill so bellies read in the 'below' view
        L.energy = 1.2
        L.color = (0.8, 0.85, 1.0)
        o = bpy.data.objects.new('under', L)
        bpy.context.scene.collection.objects.link(o)
        o.rotation_euler = Vector((0.2, 0.4, 1.0)).normalized().to_track_quat('-Z', 'Y').to_euler()
        for vn in views:
            az, el, zm, f = VIEWS[vn]
            c = lo + Vector([(hi[i] - lo[i]) * f[i] for i in range(3)])
            shot(c, r, az, el, zm, os.path.join(OUT, 'fighters_%s_%s.png' % (n, vn)))


main()
