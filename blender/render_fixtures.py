"""Close-up preview renders of the emissive fixtures (window bays, housed lamps, light bars, chevrons, beacons,
glowing louvres) on the exported GLBs.  Cycles on the CPU only (no GPU use).
Usage (WSL):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/render_fixtures.py)" [-- model ...] [--only tag,tag]
Writes blender/previews/fixtures_<model>_<tag>.png.  Targets are in Blender space of the imported GLB
(= the build scripts' Blender space: bow -Y, up +Z); az 0 = camera in front of the bow, 90 = starboard (+X).
"""
import sys, os, math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from render_ships import clear, setup, lights

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
OUT = os.path.join(HERE, 'previews')
D2R = math.pi / 180

# model: [(tag, target, distance, azimuth, elevation)]
SHOTS = {
    'mothership': [
        ('wall', (63, -48, 12), 34, 70, 12),               # starboard hangar-wall window strips + door lights
        ('spine', (18, -40, 64), 26, 55, 22),              # spine window bands, deck-edge lamps
        ('bridge', (0, 64, 68), 50, -20, 38),              # command block window bands
        ('stern', (0, 291, 4), 60, 160, 10),               # hangar slot luminaires, strip lights, beacons
        ('launch', (-72, -57, -8), 36, -115, 28),          # launch-deck chevrons
        ('strake', (76, -30, 56), 26, 115, 30),            # strake edge lamps, underside window bays
        ('flank', (50, -190, 5), 40, 75, 8),               # forward crew-deck window bands
        ('beacon', (64, 291, 40), 12, 140, 25),            # stern corner beacon
        ('deck', (30, -190, 60), 30, 40, 45),              # VLS / PD marker lamps, deck-edge lamps
        ('trench', (30, -40, 56), 22, 30, 35),             # service-trench chevrons
        ('tip', (133, 225, 18), 30, 75, 12),               # sponson tip window grid + beacon
    ],
    'ion_frigate': [
        ('bridge', (0, 18.5, 7.2), 10, -20, 24),
        ('flank', (4.5, 22, 0.5), 9, 70, 8),
        ('stern', (2.5, 35, 3.8), 6, 160, 22),
        ('deck', (3, 5, 4.5), 8, 60, 35),
    ],
    'assault_frigate': [
        ('bridge', (0, 11.5, 5.8), 7, -25, 15),
        ('deck', (3.5, -13, 5.2), 6, 60, 25),
    ],
    'enemy_frigate': [
        ('flank', (3.8, -15, 0), 5, 70, 15),
        ('stern', (0, 25.1, 4.6), 7, 170, -18),
    ],
    'enemy_dreadnought': [
        ('prow', (40, -150, 0), 22, 70, 15),
        ('inner', (20, -170, -8), 18, -50, 10),
        ('bridge', (-16, 122, 39), 16, 70, 10),
        ('stern', (0, 180, 5), 105, 172, 30),
    ],
}
for f in ('interceptor', 'interceptor_b', 'interceptor_c', 'enemy_fighter', 'enemy_fighter_b', 'enemy_fighter_c'):
    SHOTS[f] = [('top', (0, 0.3, 0.6), 3.2, -35, 45), ('rear', (0, 2.5, 0), 4.5, 150, 20),
                ('below', (0, 1.0, -0.6), 4.0, -140, -30)]
SHOTS['interceptor'].append(('fins', (0, 0.4, 0.9), 2.0, -30, 50))
SHOTS['mother_bay'] = [
    ('ceiling', (30, -40, 30), 22, 90, -25), ('wall', (10, -40, 5), 20, 80, 5), ('deck', (35, -60, -15), 25, 100, 20),
]


def cam_shot(target, dist, az, el, path, lens=50):
    s = bpy.context.scene
    cam = bpy.data.objects.get('_cam')
    if not cam:
        cam = bpy.data.objects.new('_cam', bpy.data.cameras.new('_cam'))
        s.collection.objects.link(cam)
    s.camera = cam
    cam.data.lens = lens
    d = Vector((math.sin(az * D2R) * math.cos(el * D2R), -math.cos(az * D2R) * math.cos(el * D2R), math.sin(el * D2R)))
    cam.location = Vector(target) + d * dist
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_start = max(0.01, dist / 500)
    cam.data.clip_end = dist * 40
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('WROTE', path, flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    only = None
    if '--only' in argv:
        i = argv.index('--only')
        only = set(argv[i + 1].split(','))
        argv = argv[:i] + argv[i + 2:]
    names = argv or list(SHOTS)
    os.makedirs(OUT, exist_ok=True)
    setup()
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.cycles.denoising_use_gpu = False
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    for n in names:
        clear()
        bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, n + '.glb'))
        lights(Vector((0, 0, 0)), 10)
        if n == 'mother_bay':      # interior: soft fill so the dark bay reads
            L = bpy.data.lights.new('fill2', 'SUN')
            L.energy = 1.5
            o = bpy.data.objects.new('fill2', L)
            sc.collection.objects.link(o)
            o.rotation_euler = Vector((-1.0, 0.2, -0.3)).normalized().to_track_quat('-Z', 'Y').to_euler()
        for tag, tgt, dist, az, el in SHOTS[n]:
            if only and tag not in only:
                continue
            cam_shot(tgt, dist, az, el, os.path.join(OUT, 'fixtures_%s_%s.png' % (n, tag)))


main()
