"""Build all GLB assets.  Usage (from WSL):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/build_models.py)" [-- model1 model2 ...]
"""
import sys, os, time, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import lib

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
BUILDERS = {
    'mothership': ('ships_hiigaran_v5', 'mothership'),
    'ion_frigate': ('ships_hiigaran_v5', 'ion_frigate'),
    'assault_frigate': ('ships_hiigaran_v5', 'assault_frigate'),
    'interceptor': ('small_craft', 'interceptor'),
    'enemy_frigate': ('ships_enemy_v5', 'enemy_frigate'),
    'enemy_dreadnought': ('ships_enemy_v5', 'enemy_dreadnought'),
    'enemy_fighter': ('small_craft', 'enemy_fighter'),
    'gundam': ('mobile_suits', 'gundam'),
    'enemy_ms': ('mobile_suits', 'enemy_ms'),
    'gravity_well': ('environment', 'gravity_well'),
    'hangar': ('environment', 'hangar'),
    'debris': ('environment', 'debris'),
}


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    names = argv or list(BUILDERS)
    os.makedirs(ASSETS, exist_ok=True)
    for n in names:
        t = time.time()
        lib.reset_scene()
        mod, fn = BUILDERS[n]
        getattr(importlib.import_module(mod), fn)()
        tris = sum(lib.tri_count(o) for o in bpy.context.scene.objects if o.type == 'MESH')
        path = os.path.join(ASSETS, n + '.glb')
        lib.export_glb(path)
        print('BUILT %-18s tris=%7d  %.1fs' % (n, tris, time.time() - t), flush=True)


main()
