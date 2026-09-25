"""Decimated LOD copies for ships seen far away / in dense fleets: assets/<name>_lod.glb (same nodes, materials,
origin and axes; Blender Decimate 'collapse'). usage: blender -b --factory-startup --python make_lods.py"""
import bpy, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JOBS = {'ion_frigate': 0.14, 'assault_frigate': 0.35, 'interceptor': 0.12, 'interceptor_b': 0.12, 'interceptor_c': 0.12,
        'enemy_fighter': 0.12, 'enemy_fighter_b': 0.12, 'enemy_fighter_c': 0.12, 'enemy_frigate': 0.45}
for name, ratio in JOBS.items():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets', name + '.glb'))
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH': continue
        m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio; m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier='dec')
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'assets', name + '_lod.glb'), export_format='GLB', export_apply=True, export_yup=True)
    print('LOD', name, sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH'), flush=True)
