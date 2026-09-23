"""Eevee v3 previews for converted downloaded assets (mechs incl. a posed test).
Usage: blender.exe -b --factory-startup --python render_v3.py -- gundam enemy_ms [ships...]"""
import sys, os, math
import bpy
from mathutils import Vector, Euler
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_ships as rs
from render_previews import POSE, pose_ms

OUT = os.path.join(HERE, 'previews')


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['gundam', 'enemy_ms']
    rs.setup()
    for n in argv:
        rs.clear()
        bpy.ops.import_scene.gltf(filepath=os.path.join(rs.ASSETS, n + '.glb'))
        objs = list(bpy.data.objects)
        lo, hi = rs.bbox(objs)
        r = (hi - lo).length / 2
        rs.lights((lo + hi) / 2, r)
        c = (lo + hi) / 2
        if n in ('gundam', 'enemy_ms'):
            for vn, (az, el, zm) in {'front': (-25, 8, 0.75), 'back': (160, 12, 0.75), 'side': (90, 3, 0.75)}.items():
                rs.shot(c, r, az, el, zm, os.path.join(OUT, 'v3_%s_%s.png' % (n, vn)))
            head = bpy.data.objects.get('head')
            rs.shot(head.matrix_world.translation + Vector((0, 0, 1.0)), 2.5, -20, 5, 0.9,
                    os.path.join(OUT, 'v3_%s_head.png' % n))
            pose_ms(POSE)
            lo, hi = rs.bbox(objs)
            rs.shot((lo + hi) / 2, r, -35, 10, 0.8, os.path.join(OUT, 'v3_%s_posed.png' % n))
        else:
            for vn, (az, el, zm, f) in rs.VIEWS.items():
                cc = lo + Vector([(hi[i] - lo[i]) * f[i] for i in range(3)])
                rs.shot(cc, r, az, el, zm, os.path.join(OUT, 'v3_%s_%s.png' % (n, vn)))


main()
