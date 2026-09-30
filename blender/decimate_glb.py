"""Reduce a GLB's polygon count while keeping its shape, UVs and materials (Decimate: collapse, UV seams kept).
Usage: blender.exe -b --factory-startup --python blender/decimate_glb.py -- <in.glb> <out.glb> <ratio>"""
import bpy, sys
args = sys.argv[sys.argv.index('--') + 1:]
src, dst, ratio = args[0], args[1], float(args[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
before = after = 0
for ob in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    me = ob.data; me.calc_loop_triangles(); before += len(me.loop_triangles)
    if len(me.polygons) < 400: continue                      # (tiny parts: leave them whole)
    m = ob.modifiers.new('dec', 'DECIMATE'); m.decimate_type = 'COLLAPSE'; m.ratio = ratio
    m.use_collapse_triangulate = True; m.use_symmetry = True; m.symmetry_axis = 'X'
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='dec'); ob.select_set(False)
for ob in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
    ob.data.calc_loop_triangles(); after += len(ob.data.loop_triangles)
print('TRIS', before, '->', after)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='AUTO', export_apply=True)
