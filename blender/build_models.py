"""Build all GLB assets.  Usage (from WSL):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/build_models.py)" [-- model1 model2 ...]
Fighters only:  ... -- interceptor interceptor_b interceptor_c enemy_fighter enemy_fighter_b enemy_fighter_c
"""
import sys, os, time, importlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import lib

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
BUILDERS = {
    'mothership': ('ships_hiigaran_v5', 'mothership'),
    'ion_frigate': ('ships_ion_frigate', 'ion_frigate'),   # v10 redesign (ION_FRIGATE_DESIGN.md)
    'assault_frigate': ('ships_hiigaran_v5', 'assault_frigate'),
    # v6 fighter variants (fighters_ours.py / fighters_enemy.py; the v4 designs remain in small_craft.py)
    'interceptor': ('fighters_ours', 'interceptor_a'),
    'interceptor_b': ('fighters_ours', 'interceptor_b'),
    'interceptor_c': ('fighters_ours', 'interceptor_c'),
    'enemy_frigate': ('ships_enemy_v5', 'enemy_frigate'),
    'enemy_dreadnought': ('ships_enemy_v5', 'enemy_dreadnought'),
    'enemy_fighter': ('fighters_enemy', 'enemy_fighter_a'),
    'enemy_fighter_b': ('fighters_enemy', 'enemy_fighter_b'),
    'enemy_fighter_c': ('fighters_enemy', 'enemy_fighter_c'),
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
