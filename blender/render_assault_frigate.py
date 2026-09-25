"""Preview renders of assets/assault_frigate.glb (Cycles on the CPU, no GPU use; same rig as render_ion_frigate.py).
Usage (WSL, project root):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/render_assault_frigate.py)" [-- --views hero,side,rear] [--samples N] [--tag v11]
Writes blender/previews/assault_frigate_<tag>_<view>.png
"""
import sys, os, math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_ships as rs

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
OUT = os.path.join(HERE, 'previews')
# Blender space after import: bow -Y, up +Z.  view: (target, radius, azimuth, elevation, zoom)
# azimuth 0 = camera in front of the bow, 90 = starboard side
VIEWS = {
    'hero': ((0, 1.5, 1.0), 28, -38, 20, 0.66),
    'side': ((0, 1.5, 1.0), 26, 90, 3, 0.58),
    'rear': ((0, 1.5, 1.0), 28, 142, 24, 0.66),
    'top': ((0, 1.5, 0.0), 26, 0.01, 89.9, 0.62),
    'below': ((0, 1.5, 0.0), 28, -125, -30, 0.66),
    'close': ((0, -2, 3.0), 12, -55, 30, 0.9),
}

D2R = math.pi / 180


def setup(samples):
    rs.setup()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.cycles.denoising_use_gpu = False
    except Exception:
        pass
    specs = [('key', (0.45, -0.55, 0.9), 3.2, (1.0, 0.95, 0.9)), ('fill', (-0.8, 0.2, 0.3), 0.8, (0.7, 0.8, 1.0)),
             ('rim', (-0.2, 1.0, 0.4), 3.0, (0.8, 0.88, 1.0)), ('side', (1.0, -0.2, 0.15), 1.2, (0.9, 0.92, 1.0)),
             ('under', (0.2, 0.3, -1.0), 0.7, (0.8, 0.85, 1.0))]
    for name, dv, e, col in specs:
        L = bpy.data.lights.new(name, 'SUN')
        L.energy, L.color, L.angle = e, col, 2 * D2R
        o = bpy.data.objects.new(name, L)
        sc.collection.objects.link(o)
        o.rotation_euler = (-Vector(dv).normalized()).to_track_quat('-Z', 'Y').to_euler()


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    views = ['hero', 'side', 'rear']
    samples, tag = 32, 'v11'
    if '--views' in argv:
        views = argv[argv.index('--views') + 1].split(',')
    if '--samples' in argv:
        samples = int(argv[argv.index('--samples') + 1])
    if '--tag' in argv:
        tag = argv[argv.index('--tag') + 1]
    os.makedirs(OUT, exist_ok=True)
    rs.clear()
    setup(samples)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, 'assault_frigate.glb'))
    for vn in views:
        tgt, r, az, el, zm = VIEWS[vn]
        rs.shot(Vector(tgt), r, az, el, zm, os.path.join(OUT, 'assault_frigate_%s_%s.png' % (tag, vn)))


main()
