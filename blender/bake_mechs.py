"""UV-unwrap each mech into ONE shared atlas and bake procedural worn-paint PBR textures (Cycles):
  assets/tex/<model>_albedo.png (sRGB) and assets/tex/<model>_orm.png (linear R=AO, G=roughness, B=metalness).
Worn edges (bevel-normal edge mask + noise) reveal bare silver metal with a darker paint-chip border; AO-driven
cavity grime, vertical streaks, scorch marks (dark soot + brown heat ring), fine scratches.
Emissive materials (eye/core/engine) stay flat. Re-exports the GLB with TEXCOORD_0, images NOT embedded,
flat material colours kept as fallback; node names / hierarchy / pivots untouched.
Usage: blender.exe -b --factory-startup --python blender/bake_mechs.py [-- gundam enemy_ms]"""
import os, sys, math, random
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
TEX = os.path.join(ASSETS, 'tex')
EMISSIVE = {'eye', 'core', 'engine'}
RES = 4096
DETAIL_BOOST = {'head': 1.7, 'torso': 1.35}   # extra texel density for close-up parts
# per model options. enemy_ms = the TryoutIndie.Dev mech (blender/convert_tryout.py): satin white paint (albedo kept at
# ~sRGB 0.7: paint_floor 0.04 so the gunmetal frame is not lifted to mid-grey), edge wear to bare metal, per-panel
# value variation, and its own PBR for the metallic gunmetal frame / grey detail / red accents (mat_pbr: metal, rough)
MODEL_OPTS = {'enemy_ms': dict(wear=0.6, bare=(0.52, 0.52, 0.54), paint_rough=0.4, paint_metal=0.08, paint_floor=0.04,
                               panel_var=0.05, mat_pbr={'tryout_frame': (0.6, 0.42), 'tryout_grey': (0.55, 0.38),
                                                        'tryout_red': (0.08, 0.36)},
                               # AI-generated tileable 1024² sources (assets/tex/src), box-projected in model space:
                               # material -> (albedo, tile metres, linear tint multiplier)
                               tex_class={'tryout_white': ('white', 4.5, (0.8, 0.8, 0.8)),
                                          'tryout_red': ('white', 4.5, (0.78, 0.055, 0.06)),
                                          'tryout_frame': ('frame', 3.0, (1.0, 1.0, 1.0)),
                                          'tryout_grey': ('metal', 2.5, (0.55, 0.55, 0.57))},
                               tex_height_mats={'tryout_frame', 'tryout_grey'},
                               # PER PIECE (2026-10-05): every separate piece (connected mesh island) gets its own colour /
                               # finish from its material's palette, and the panel textures are projected along the
                               # piece's own axes (PCA) instead of the model's — so they run with the part, not across it.
                               # palette: material -> [(weight, linear tint, roughness, metalness, source texture)]
                               per_piece=True,
                               palette={'tryout_white': [(40, (0.8, 0.8, 0.8), 0.4, 0.08, 'white'),           # satin white
                                                         (22, (0.5, 0.52, 0.56), 0.46, 0.18, 'white'),         # cool grey
                                                         (14, (0.76, 0.72, 0.62), 0.52, 0.06, 'white'),        # warm off-white, matte
                                                         (14, (0.78, 0.055, 0.06), 0.34, 0.1, 'white'),        # red accent
                                                         (10, (0.5, 0.5, 0.53), 0.32, 0.75, 'metal')],         # bare gunmetal
                                        'tryout_frame': [(50, (1.0, 1.0, 1.0), 0.42, 0.6, 'frame'),             # dark frame
                                                         (30, (0.42, 0.42, 0.45), 0.34, 0.8, 'metal'),          # machined steel
                                                         (20, (0.55, 0.55, 0.6), 0.55, 0.45, 'frame')],         # anodised grey
                                        'tryout_red': [(1, (0.78, 0.055, 0.06), 0.34, 0.1, 'white')],
                                        'tryout_grey': [(1, (0.55, 0.55, 0.57), 0.38, 0.55, 'metal')]})}
TEX_SRC = {'white': 'vestige_mech_white_armor_albedo_v1.png', 'frame': 'vestige_mech_dark_frame_albedo_v1.png',
           'metal': 'vestige_mech_metal_detail_albedo_v1.png', 'height': 'vestige_mech_panel_height_v1.png',
           'mask': 'vestige_mech_wear_grime_mask_v1.png'}
OPT = {}


class G:
    """Tiny node-graph helper."""

    def __init__(self, nt):
        self.nt, self.nodes, self.new = nt, [], []

    def node(self, t, **kw):
        n = self.nt.nodes.new(t)
        for k, v in kw.items():
            setattr(n, k, v)
        self.new.append(n)
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def val(self, sock_or_val, target):
        if isinstance(sock_or_val, (int, float)):
            target.default_value = sock_or_val
        elif isinstance(sock_or_val, tuple):
            target.default_value = sock_or_val if len(sock_or_val) == 4 else (*sock_or_val, 1.0)
        else:
            self.link(sock_or_val, target)

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node('ShaderNodeMath', operation=op, use_clamp=clamp)
        self.val(a, n.inputs[0])
        self.val(b, n.inputs[1])
        return n.outputs[0]

    def mr(self, x, f0, f1, t0=0.0, t1=1.0):
        n = self.node('ShaderNodeMapRange', clamp=True)
        self.val(x, n.inputs['Value'])
        n.inputs['From Min'].default_value, n.inputs['From Max'].default_value = f0, f1
        n.inputs['To Min'].default_value, n.inputs['To Max'].default_value = t0, t1
        return n.outputs['Result']

    def vmath(self, op, a, b=None):
        n = self.node('ShaderNodeVectorMath', operation=op)
        self.val(a, n.inputs[0])
        if b is not None:
            if isinstance(b, tuple):
                n.inputs[1].default_value = b
            else:
                self.link(b, n.inputs[1])
        return n.outputs['Value'] if op in ('DOT_PRODUCT', 'DISTANCE', 'LENGTH') else n.outputs['Vector']

    def noise(self, vec, scale, detail=6.0, rough=0.6):
        n = self.node('ShaderNodeTexNoise')
        self.link(vec, n.inputs['Vector'])
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        return n.outputs['Fac']

    def mix(self, fac, a, b):
        n = self.node('ShaderNodeMix', data_type='RGBA', blend_type='MIX', clamp_factor=True)
        self.val(fac, n.inputs['Factor'])
        ins = [s for s in n.inputs if s.type == 'RGBA']
        self.val(a, ins[0])
        self.val(b, ins[1])
        return [s for s in n.outputs if s.type == 'RGBA'][0]

    def mixf(self, fac, a, b):
        n = self.node('ShaderNodeMix', data_type='FLOAT', clamp_factor=True)
        self.val(fac, n.inputs['Factor'])
        ins = [s for s in n.inputs if s.type == 'VALUE' and s.name in ('A', 'B')]
        self.val(a, ins[0])
        self.val(b, ins[1])
        return [s for s in n.outputs if s.type == 'VALUE'][0]


def box_tex(g, key, pos, tile, color=True):
    """tileable source texture, box (tri-planar) projected: vector = model-space position / tile metres"""
    img = bpy.data.images.load(os.path.join(TEX, 'src', TEX_SRC[key]), check_existing=True)
    img.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    n = g.node('ShaderNodeTexImage', projection='BOX', projection_blend=0.3, interpolation='Linear')
    n.image = img
    g.link(g.vmath('DIVIDE', pos, (tile, tile, tile)), n.inputs['Vector'])
    return n.outputs['Color']


def principled(m):
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def build_bake_graph(m, scorches, seed):
    nt = m.node_tree
    p = principled(m)
    base = tuple(p.inputs['Base Color'].default_value)[:3]
    metal0 = p.inputs['Metallic'].default_value
    rough0 = p.inputs['Roughness'].default_value
    lum = 0.3 * base[0] + 0.55 * base[1] + 0.15 * base[2]
    g = G(nt)
    geo = g.node('ShaderNodeNewGeometry')
    pos = geo.outputs['Position']
    if m.name in EMISSIVE or m.name == 'recess':   # flat: emissive parts + matte visor recess
        alb = base
        orm = g.node('ShaderNodeCombineColor')
        orm.inputs[0].default_value, orm.inputs[1].default_value, orm.inputs[2].default_value = 1.0, rough0, metal0
        return g, alb, orm.outputs[0]
    painted = lum > 0.02
    # engine-friendly values: painted albedo mid-range (lum >= ~0.12 linear ~ sRGB 0.38), low metalness;
    # dark mechanics lifted to a satin dark grey. Only worn edges become bare metal (metal 1).
    if painted:
        k = min(max(OPT.get('paint_floor', 0.12) / max(lum, 1e-4), 1.0), 4.5)
        base = tuple(min(0.75, c * k) for c in base)
        paint_metal, paint_rough = OPT.get('paint_metal', 0.12), OPT.get('paint_rough', max(rough0, 0.55))
        paint_metal, paint_rough = OPT.get('mat_pbr', {}).get(m.name, (paint_metal, paint_rough))
    else:
        grey = max(lum, 1e-4)
        base = tuple(0.05 * (0.6 + 0.4 * c / grey) for c in base)   # ~0.05 linear, slight original tint
        paint_metal, paint_rough = 0.35, 0.55
    # --- edge mask from bevel normal vs true normal, broken up with noise
    bev = g.node('ShaderNodeBevel', samples=8)
    bev.inputs['Radius'].default_value = 0.07
    dotn = g.vmath('DOT_PRODUCT', bev.outputs['Normal'], geo.outputs['True Normal'])
    edge = g.mr(dotn, 0.998, 0.93)                       # 0 flat -> 1 sharp edge
    posn = g.vmath('ADD', pos, (seed * 13.1, seed * 7.7, seed * 3.3))
    n1 = g.noise(posn, 2.2, 12.0, 0.7)
    wear_raw = g.math('ADD', edge, g.math('MULTIPLY', g.math('SUBTRACT', n1, 0.5), 0.7))
    worn = g.mr(wear_raw, 0.82, 0.97)
    chip = g.math('SUBTRACT', g.mr(wear_raw, 0.68, 0.82), worn, clamp=True)
    n2 = g.noise(posn, 16.0, 3.0, 0.5)
    small_chips = g.math('MULTIPLY', g.mr(n2, 0.79, 0.84), g.mr(n1, 0.55, 0.7, 0.0, 0.8))
    worn = g.math('MAXIMUM', worn, small_chips)
    if OPT.get('wear', 1.0) < 1.0:
        worn = g.math('MULTIPLY', worn, OPT['wear'])
        chip = g.math('MULTIPLY', chip, OPT['wear'])
    if not painted:
        worn = g.math('MULTIPLY', worn, 0.0)
        chip = g.math('MULTIPLY', chip, 0.0)
    # --- cavity grime (AO) + breakup
    ao = g.node('ShaderNodeAmbientOcclusion', samples=16)
    ao.inputs['Distance'].default_value = 0.6
    aov = ao.outputs['AO']
    n3 = g.noise(posn, 5.0, 6.0, 0.6)
    grime = g.math('MULTIPLY', g.mr(aov, 0.35, 0.95, 0.9, 0.0), g.mr(n3, 0.3, 0.7, 0.55, 1.0))
    # --- vertical streaks
    sv = g.vmath('MULTIPLY', posn, (9.0, 9.0, 0.45))
    streak = g.math('MULTIPLY', g.mr(g.noise(sv, 1.0, 3.0, 0.5), 0.52, 0.72), 0.45)
    tcls = OPT.get('tex_class', {}).get(m.name)
    pp = None
    if OPT.get('per_piece') and m.name in OPT.get('palette', {}):
        pp = g.node('ShaderNodeAttribute', attribute_name='pp').outputs['Vector']   # the piece's own frame (assign_pieces)
        ptint = g.node('ShaderNodeAttribute', attribute_name='pt').outputs['Color']
        pmat = g.node('ShaderNodeSeparateColor')
        g.link(g.node('ShaderNodeAttribute', attribute_name='pm').outputs['Color'], pmat.inputs[0])
        paint_rough, paint_metal = pmat.outputs[0], pmat.outputs[1]
    tpos = pp if pp is not None else posn
    cav = None
    if tcls:
        # the AI wear / grime mask: its bright flecks chip the paint to bare metal, its dim smears are grime
        wm = box_tex(g, 'mask', posn, 4.0, color=False)
        worn = g.math('MAXIMUM', worn, g.math('MULTIPLY', g.mr(wm, 0.3, 0.6), OPT.get('wear', 1.0)))
        grime = g.math('MAXIMUM', grime, g.mr(wm, 0.06, 0.28, 0.0, 0.55))
        streak = g.math('MULTIPLY', streak, 0.5)                 # the sources carry their own streaking
        if m.name in OPT.get('tex_height_mats', ()):
            h = box_tex(g, 'height', tpos, tcls[1], color=False)
            cav = g.mr(h, 0.47, 0.3)                              # panel grooves / vents / bolt rims (height < plateau)
    # --- scratches (thin stretched noise iso-lines, masked)
    sc = g.vmath('MULTIPLY', posn, (30.0, 30.0, 2.5))
    s_n = g.noise(sc, 1.0, 2.0, 0.4)
    scratch = g.mr(g.math('ABSOLUTE', g.math('SUBTRACT', s_n, 0.5)), 0.0, 0.012, 1.0, 0.0)
    scratch = g.math('MULTIPLY', scratch, g.mr(g.noise(posn, 1.3, 2.0, 0.5), 0.5, 0.62))
    # --- scorch marks: dark soot core + brown heat ring
    soot, ring = 0.0, 0.0
    for c, r in scorches:
        d = g.vmath('DISTANCE', pos, c)
        s_ = g.math('MULTIPLY', g.mr(d, 0.15 * r, 0.75 * r, 1.0, 0.0), g.mr(n3, 0.2, 0.6, 0.6, 1.0))
        rg = g.math('MULTIPLY', g.mr(d, 0.55 * r, 0.9 * r), g.mr(d, 0.95 * r, 1.35 * r, 1.0, 0.0))
        soot = s_ if soot == 0.0 else g.math('MAXIMUM', soot, s_)
        ring = rg if ring == 0.0 else g.math('MAXIMUM', ring, rg)
    # --- colour
    dark_paint = tuple(c * 0.45 for c in base)
    col = base
    if tcls:
        mt = g.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=True)
        mt.inputs['Factor'].default_value = 1.0
        ins_t = [x for x in mt.inputs if x.type == 'RGBA']
        if pp is not None:   # the piece's source texture (pm.b: 0 its material's own, 1 the metal detail) × its tint
            alt = 'metal' if tcls[0] != 'metal' else 'white'
            g.link(g.mix(pmat.outputs[2], box_tex(g, tcls[0], tpos, tcls[1]), box_tex(g, alt, tpos, 2.5)), ins_t[0])
            g.link(ptint, ins_t[1])
        else:
            g.link(box_tex(g, tcls[0], posn, tcls[1]), ins_t[0])
            g.val(tuple(tcls[2]), ins_t[1])
        base = [x for x in mt.outputs if x.type == 'RGBA'][0]
        col = base
        dark_paint = (0.02, 0.02, 0.022)
    if OPT.get('panel_var') and painted:
        # per-panel value variation: ~1.5 m Voronoi cells, each a slightly different paint batch (+-panel_var)
        vor = g.node('ShaderNodeTexVoronoi')
        g.link(posn, vor.inputs['Vector'])
        vor.inputs['Scale'].default_value = 0.65
        sep = g.node('ShaderNodeSeparateColor')
        g.link(vor.outputs['Color'], sep.inputs[0])
        pv = g.mr(sep.outputs[0], 0.0, 1.0, 1.0 - OPT['panel_var'], 1.0 + OPT['panel_var'])
        grey = g.node('ShaderNodeCombineColor')
        for k in range(3):
            g.link(pv, grey.inputs[k])
        mul = g.node('ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY', clamp_factor=True)
        mul.inputs['Factor'].default_value = 1.0
        ins = [x for x in mul.inputs if x.type == 'RGBA']
        g.val(base, ins[0])
        g.link(grey.outputs[0], ins[1])
        col = [x for x in mul.outputs if x.type == 'RGBA'][0]
    col = g.mix(chip, col, dark_paint)
    if cav is not None:                                           # height map baked as cavity shading (no normal slot)
        col = g.mix(g.math('MULTIPLY', cav, 0.55), col, (0.008, 0.008, 0.009))
    col = g.mix(worn, col, OPT.get('bare', (0.72, 0.72, 0.74)))
    col = g.mix(g.math('MULTIPLY', scratch, 0.7), col, (0.55, 0.55, 0.57))
    col = g.mix(g.math('MULTIPLY', grime, 0.45), col, (0.06, 0.052, 0.042))
    col = g.mix(streak, col, (0.06, 0.055, 0.045))
    col = g.mix(g.math('MULTIPLY', ring, 0.75), col, (0.13, 0.055, 0.02))
    col = g.mix(soot, col, (0.018, 0.016, 0.015))
    # --- roughness / metal / ao
    rough = g.mixf(worn, paint_rough, 0.3)
    rough = g.math('ADD', rough, g.math('MULTIPLY', grime, 0.18), clamp=True)
    if cav is not None:
        rough = g.math('ADD', rough, g.math('MULTIPLY', cav, 0.2), clamp=True)
    rough = g.mixf(soot, rough, 0.85)
    metal = g.mixf(worn, paint_metal, 1.0)
    metal = g.mixf(g.math('MULTIPLY', scratch, 0.6), metal, 1.0)
    metal = g.mixf(soot, metal, 0.1)
    orm = g.node('ShaderNodeCombineColor')
    g.link(g.math('ADD', 0.45, g.math('MULTIPLY', aov, 0.55)), orm.inputs[0])   # AO kept mostly near 1
    g.link(rough, orm.inputs[1])
    g.link(metal, orm.inputs[2])
    return g, col, orm.outputs[0]


def assign_pieces(meshes):
    """per connected piece: 'pp' (its corners in the piece's own PCA frame, offset per piece), 'pt' (palette tint),
    'pm' (roughness, metalness, 1 = the metal-detail source texture) — mirror twins get the same pick"""
    import bmesh, zlib
    import numpy as np
    pal = OPT['palette']
    for o in meshes:
        me = o.data
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        seen, comps = set(), []
        for f in bm.faces:
            if f.index in seen:
                continue
            stack, comp = [f], []
            seen.add(f.index)
            while stack:
                x = stack.pop(); comp.append(x.index)
                for v in x.verts:
                    for nf in v.link_faces:
                        if nf.index not in seen:
                            seen.add(nf.index); stack.append(nf)
            comps.append(comp)
        bm.free()
        for nm in ('pp', 'pt', 'pm'):
            if nm in me.attributes:
                me.attributes.remove(me.attributes[nm])
        app = me.attributes.new('pp', 'FLOAT_VECTOR', 'CORNER')
        apt = me.attributes.new('pt', 'FLOAT_COLOR', 'CORNER')
        apm = me.attributes.new('pm', 'FLOAT_COLOR', 'CORNER')
        W = o.matrix_world
        for comp in comps:
            vids = sorted({vi for fi in comp for vi in me.polygons[fi].vertices})
            P = np.array([tuple(W @ me.vertices[vi].co) for vi in vids])
            c = P.mean(0)
            ev, vec = np.linalg.eigh(np.cov((P - c).T) + np.eye(3) * 1e-9)
            A = vec[:, ::-1]
            if np.linalg.det(A) < 0:
                A[:, 2] *= -1
            mats = [me.materials[me.polygons[fi].material_index].name if me.materials[me.polygons[fi].material_index] else '' for fi in comp]
            mname = max(set(mats), key=mats.count)
            key = '%.1f,%.1f,%.1f,%d' % (abs(c[0]), c[1], c[2], len(comp))
            rnd = random.Random(zlib.crc32(key.encode()))
            off = np.array([rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)])
            opts = pal.get(mname)
            if opts is None:
                pick = (1, (1.0, 1.0, 1.0), 0.5, 0.2, 'white')
            elif len(comp) < 40:
                pick = opts[0]                                    # (bolts and slivers: the material's base finish)
            else:
                tot = sum(w for w, *_ in opts); x = rnd.uniform(0, tot)
                for pick in opts:
                    x -= pick[0]
                    if x <= 0:
                        break
            _, tint, rough, metal, src = pick
            alt = 1.0 if (src == 'metal') != (mname == 'tryout_grey') else 0.0
            for fi in comp:
                poly = me.polygons[fi]
                for li, vi in zip(poly.loop_indices, poly.vertices):
                    q = (np.array(tuple(W @ me.vertices[vi].co)) - c) @ A + off
                    app.data[li].vector = tuple(q)
                    apt.data[li].color = (*tint, 1.0)
                    apm.data[li].color = (rough, metal, alt, 1.0)
        print('PIECES', o.name, len(comps), flush=True)


def run(name):
    OPT.clear(); OPT.update(MODEL_OPTS.get(name, {}))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, name + '.glb'))
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    # ---- one shared UV atlas for all parts
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
        o.data.uv_layers.new(name='UVMap')
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005)   # glTF import splits verts at seams -> weld before unwrapping
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.001, area_weight=0.0,
                             scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in meshes:   # enlarge close-up parts' islands before packing (pack keeps relative scale)
        f = DETAIL_BOOST.get(o.name)
        if f:
            uv = o.data.uv_layers.active.data
            for d in uv:
                d.uv = d.uv * f
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.select_all(action='SELECT')
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=0.001, shape_method='CONCAVE', margin_method='FRACTION')
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=0.001)
    bpy.ops.object.mode_set(mode='OBJECT')
    # ---- images
    alb = bpy.data.images.new(name + '_albedo', RES, RES, alpha=False)
    alb.colorspace_settings.name = 'sRGB'
    orm = bpy.data.images.new(name + '_orm', RES, RES, alpha=False)
    orm.colorspace_settings.name = 'Non-Color'
    # ---- scorch centres picked on the surface (world space)
    R = random.Random(hash(name) & 0xffff)
    cand = [o for o in meshes if o.name in ('torso', 'arm_L_upper', 'arm_R_upper', 'leg_L_lower', 'leg_R_upper',
                                            'arm_R_lower', 'pelvis')]
    scorches = []
    for o in R.sample(cand, min(4, len(cand))):
        v = o.data.vertices[R.randrange(len(o.data.vertices))]
        scorches.append((tuple(o.matrix_world @ v.co), R.uniform(0.7, 1.3)))
    if OPT.get('per_piece'):
        assign_pieces(meshes)
    # ---- per-material bake graphs
    mats = {m for o in meshes for m in o.data.materials if m}
    graphs = {}
    for i, m in enumerate(sorted(mats, key=lambda m: m.name)):
        g, a_sock, o_sock = build_bake_graph(m, scorches, i + 1)
        em = g.node('ShaderNodeEmission')
        img = g.node('ShaderNodeTexImage')
        out = next(n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL')
        orig = [l.from_socket for l in m.node_tree.links if l.to_node == out and l.to_socket.name == 'Surface']
        g.link(em.outputs[0], out.inputs['Surface'])
        m.node_tree.nodes.active = img
        graphs[m] = (g, a_sock, o_sock, em, img, out, orig)
    # ---- bake
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.render.bake.margin = 8
    for img_t, key in ((alb, 1), (orm, 2)):
        for m, (g, a_sock, o_sock, em, img, out, orig) in graphs.items():
            g.val(a_sock if key == 1 else o_sock, em.inputs['Color'])
            img.image = img_t
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.bake(type='EMIT', use_clear=True, margin=8)
        os.makedirs(TEX, exist_ok=True)
        path = os.path.join(TEX, '%s_%s.png' % (name, 'albedo' if key == 1 else 'orm'))
        img_t.filepath_raw = path
        img_t.file_format = 'PNG'
        img_t.save()
        print('BAKED', path, flush=True)
    # ---- restore flat materials (fallback colours), drop bake nodes
    for m, (g, a_sock, o_sock, em, img, out, orig) in graphs.items():
        for n in g.new:
            m.node_tree.nodes.remove(n)
        if orig:
            m.node_tree.links.new(orig[0], out.inputs['Surface'])
    for o in meshes:   # (the per-piece bake attributes are not part of the model)
        for nm in ('pp', 'pt', 'pm'):
            if nm in o.data.attributes:
                o.data.attributes.remove(o.data.attributes[nm])
    sc.render.engine = 'BLENDER_EEVEE'
    bpy.ops.export_scene.gltf(filepath=os.path.join(ASSETS, name + '.glb'), export_format='GLB', export_yup=True,
                              export_apply=False, export_materials='EXPORT', export_texcoords=True,
                              export_normals=True, export_image_format='NONE', export_extras=False,
                              export_cameras=False, export_lights=False, export_animations=False)
    print('EXPORTED', name, flush=True)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['gundam', 'enemy_ms']
    for n in argv:
        run(n)
