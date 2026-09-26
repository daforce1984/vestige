"""Close-up previews of the mothership bow ion cannon (Cycles on the CPU, no GPU use).
Usage (WSL, project root):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/render_mothership_bow.py)" -- [tag] [glb]
Writes blender/previews/mothership_bow_<tag>_{front34,side}.png (tag default v12).
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector
from lib import D2R
import render_ships as rs

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
tag = argv[0] if argv else 'v12'
glb = argv[1] if len(argv) > 1 else os.path.join(os.path.dirname(HERE), 'assets', 'mothership.glb')
OUT = os.path.join(HERE, 'previews')

rs.setup()
rs.clear()
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 32
sc.cycles.use_denoising = True
try:
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.denoising_use_gpu = False
except Exception:
    pass
specs = [('key', (0.55, -0.6, 0.8), 3.2, (1.0, 0.95, 0.9)), ('fill', (-0.8, -0.3, 0.3), 0.9, (0.7, 0.8, 1.0)),
         ('rim', (-0.2, 1.0, 0.4), 3.0, (0.8, 0.88, 1.0)), ('side', (1.0, -0.2, 0.15), 1.2, (0.9, 0.92, 1.0))]
for name, dv, e, col in specs:
    L = bpy.data.lights.new(name, 'SUN')
    L.energy, L.color, L.angle = e, col, 2 * D2R
    o = bpy.data.objects.new(name, L)
    sc.collection.objects.link(o)
    o.rotation_euler = (-Vector(dv).normalized()).to_track_quat('-Z', 'Y').to_euler()
os.makedirs(OUT, exist_ok=True)
sc.render.resolution_x, sc.render.resolution_y = 1600, 900
# glTF (x, y, z) -> Blender (x, -z, y); bow toward Blender -Y
rs.shot(Vector((0, -298, 8)), 44, 38, 20, 0.95, os.path.join(OUT, 'mothership_bow_%s_front34.png' % tag), lens=40)
rs.shot(Vector((0, -292, 8)), 50, 90, 6, 0.95, os.path.join(OUT, 'mothership_bow_%s_side.png' % tag), lens=40)
