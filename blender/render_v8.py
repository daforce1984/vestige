"""Eevee previews of the mechs WITH the baked textures (assets/tex/<model>_albedo.png / _orm.png).
Usage: blender.exe -b --factory-startup --python blender/render_v8.py [-- gundam enemy_ms]"""
import sys, os
import bpy
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_ships as rs

EMISSIVE = {'eye', 'core', 'engine'}


def hook(name):
    tex = os.path.join(os.path.dirname(HERE), 'assets', 'tex')
    alb = bpy.data.images.load(os.path.join(tex, name + '_albedo.png'))
    orm = bpy.data.images.load(os.path.join(tex, name + '_orm.png'))
    orm.colorspace_settings.name = 'Non-Color'
    for m in bpy.data.materials:
        if not m.node_tree or m.name in EMISSIVE:
            continue
        p = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not p:
            continue
        nt = m.node_tree
        ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = alb
        to = nt.nodes.new('ShaderNodeTexImage'); to.image = orm
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(to.outputs[0], sep.inputs[0])
        mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
        mul.inputs['Factor'].default_value = 0.5
        cs = [s for s in mul.inputs if s.type == 'RGBA']
        nt.links.new(ta.outputs[0], cs[0])
        nt.links.new(sep.outputs[0], cs[1])      # AO
        nt.links.new([s for s in mul.outputs if s.type == 'RGBA'][0], p.inputs['Base Color'])
        nt.links.new(sep.outputs[1], p.inputs['Roughness'])
        nt.links.new(sep.outputs[2], p.inputs['Metallic'])


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['gundam', 'enemy_ms']
    rs.setup()
    for n in argv:
        rs.clear()
        for im in list(bpy.data.images):  # clean
            bpy.data.images.remove(im)
        bpy.ops.import_scene.gltf(filepath=os.path.join(rs.ASSETS, n + '.glb'))
        hook(n)
        objs = list(bpy.data.objects)
        lo, hi = rs.bbox(objs)
        r = (hi - lo).length / 2
        rs.lights((lo + hi) / 2, r)
        rs.shot((lo + hi) / 2, r, -25, 8, 0.75, os.path.join(rs.OUT, 'v9_%s_front.png' % n))
        rs.shot(Vector((0, -1.5, 14.2)), 3.4, -28, 8, 0.9, os.path.join(rs.OUT, 'v9_%s_chest_head.png' % n))
        rs.shot(Vector((1.5, -1.0, 9.0)), 3.0, -50, 5, 0.9, os.path.join(rs.OUT, 'v9_%s_closeup.png' % n))


main()
