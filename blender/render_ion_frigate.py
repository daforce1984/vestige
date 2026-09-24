"""Preview renders of assets/ion_frigate.glb (Cycles on the CPU, no GPU use).
Usage (WSL, project root):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/render_ion_frigate.py)" [-- --views hero,side,...] [--samples N]
Writes blender/previews/ion_frigate_<view>.png
"""
import sys, os, math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_ships as rs

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
OUT = os.path.join(HERE, 'previews')
D2R = math.pi / 180
# Blender space after import: bow -Y, up +Z.  view: (target, radius, azimuth, elevation, zoom[, lens])
# azimuth 0 = camera in front of the bow, 90 = starboard side
VIEWS = {
    'hero': ((0, 3, 0.5), 38, -40, 18, 0.62),
    'side': ((0, 3, 0.5), 36, 90, 2, 0.56),
    'top': None,                                           # orthographic, bow up
    'bow': ((0, -27.5, 0.2), 6.5, -28, 14, 0.95),          # muzzle / focusing close-up
    'rear': ((0, 3, 0.5), 38, 146, 20, 0.62),
    'below': ((0, 3, 0.5), 38, -130, -28, 0.62),
    'accel': ((0, -15, -0.5), 10, 58, 18, 0.95),           # accelerator stages + capacitor modules
    'deck': ((0, 12, 4.0), 14, -150, 32, 0.85),            # radiators / command block / engines from aft-above
    'engines': ((0, 36, 0.3), 7.5, 160, 10, 0.95),
}


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
    views = list(VIEWS)
    samples = 32
    if '--views' in argv:
        views = argv[argv.index('--views') + 1].split(',')
    if '--samples' in argv:
        samples = int(argv[argv.index('--samples') + 1])
    os.makedirs(OUT, exist_ok=True)
    rs.clear()
    setup(samples)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, 'ion_frigate.glb'))
    sc = bpy.context.scene
    for vn in views:
        path = os.path.join(OUT, 'ion_frigate_%s.png' % vn)
        if vn == 'top':
            cam = bpy.data.objects.new('_top', bpy.data.cameras.new('_top'))
            sc.collection.objects.link(cam)
            sc.camera = cam
            cam.data.type = 'ORTHO'
            cam.data.ortho_scale = 72
            cam.location = (0, 2.5, 60)
            cam.rotation_euler = (0, 0, math.pi / 2)       # bow (-Y) to the image left
            cam.data.clip_end = 300
            sc.render.resolution_x, sc.render.resolution_y = 1600, 520
            sc.render.filepath = path
            bpy.ops.render.render(write_still=True)
            print('WROTE', path, flush=True)
            bpy.data.objects.remove(cam, do_unlink=True)
            sc.render.resolution_x, sc.render.resolution_y = 1280, 720
            continue
        tgt, r, az, el, zm = VIEWS[vn][:5]
        rs.shot(Vector(tgt), r, az, el, zm, path)


main()
