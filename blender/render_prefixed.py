"""Eevee previews with a filename prefix: blender -b --python render_prefixed.py -- v5 name1 name2 ..."""
import sys, os
import bpy
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_ships as rs

argv = sys.argv[sys.argv.index('--') + 1:]
prefix, names = argv[0], argv[1:]
rs.setup()
for n in names:
    rs.clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(rs.ASSETS, n + '.glb'))
    objs = list(bpy.data.objects)
    lo, hi = rs.bbox(objs)
    r = (hi - lo).length / 2
    rs.lights((lo + hi) / 2, r)
    views = dict(rs.VIEWS)
    views.update(rs.CLOSE)
    views['top'] = (15, 65, 0.6, (0.5, 0.5, 0.5))
    for vn, (az, el, zm, f) in views.items():
        c = lo + Vector([(hi[i] - lo[i]) * f[i] for i in range(3)])
        rs.shot(c, r, az, el, zm, os.path.join(rs.OUT, '%s_%s_%s.png' % (prefix, n, vn)))
