"""Convert "3D Mech Asset" by TryoutIndie.Dev (MIT, https://tryoutindiedev.itch.io/3d-mech-asset) into the enemy
mobile suit: assets/enemy_ms.glb, rigid-part contract (see convert_mechs.py / mobile_suits.PARENT).

Source: assets/src/cand/tryout_mech.glb (Blender 4.2 export of tryout_mech.blend). Most armour meshes are bone-parented
rigid pieces; the backpack ('Cube') and the rifle ('GUN', 'Cube.001') are skinned 100% to one bone each. The source faces
+Z in glTF (-Y in Blender) and its .L bones sit at +X, so no axis flip is needed; it is scaled uniformly to 18.5 m with
the feet at 0 and the pelvis on the Z axis (glTF z = 0).

Rest pose = the source bind pose (arms hanging straight down beside the thighs, the rifle hanging muzzle-down in the
right hand). Part pivots are source bone heads (PIVOT_BONE); tools/extract_motion.py retargets the source clips with the
same bone table (TRYOUT_* there) — keep the two in sync.

Added (original, not in the source): a tall angular kite shield on the left forearm, nozzle bells on the backpack pods,
engine / eye / core emissive materials, a white / gunmetal / red paint scheme.
Usage: blender.exe -b --factory-startup --python blender/convert_tryout.py [-- out_name]   (default enemy_ms)
"""
import sys, os, math
import bpy
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib
from lib import MB, reg, get_mat, link, set_parent
from mobile_suits import PARENT
from shipkit import deep_nozzle

ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'assets', 'src', 'cand', 'tryout_mech.glb')
OUT = os.path.join(ROOT, 'assets')
HEIGHT = 18.5

# source bone -> contract part (fingers / thumbs follow their hand)
BONE_PART = {'Root': 'pelvis', 'PelvisBase': 'pelvis', 'Low_Waist': 'pelvis', 'WaistJoint.L': 'pelvis',
             'WaistJoint.R': 'pelvis', 'Torso_WaistConnect': 'torso', 'Torso': 'torso', 'Neck': 'head'}
for s in ('L', 'R'):
    BONE_PART.update({'Bone.010.' + s: 'torso', 'ShoulderJoint.' + s: 'torso',
                      'Shoulder.' + s: 'arm_%s_upper' % s, 'UpperArm.%s.001' % s: 'arm_%s_upper' % s,
                      'ArmJoint.' + s: 'arm_%s_upper' % s, 'LowerArm.' + s: 'arm_%s_lower' % s,
                      'Hands.' + s: 'hand_' + s, 'Thigh.' + s: 'leg_%s_upper' % s, 'Knee.' + s: 'leg_%s_upper' % s,
                      'Shin.' + s: 'leg_%s_lower' % s, 'Feet.' + s: 'foot_' + s})
    for k in range(1, 13):
        BONE_PART['Finger%d.%s' % (k, s)] = 'hand_' + s
    for k in (1, 2):
        BONE_PART['Thumb%d.%s' % (k, s)] = 'hand_' + s
# whole source objects that go to a part regardless of their bone
MESH_PART = {'Upper Waist Armor': 'torso', 'Cube': 'backpack', 'GUN': 'rifle', 'Cube.001': 'rifle'}
# contract part -> the source bone whose head is its pivot (and whose rotation drives it in the motion clips)
PIVOT_BONE = {'ms_root': 'PelvisBase', 'pelvis': 'PelvisBase', 'torso': 'Low_Waist', 'head': 'Neck'}
for s in ('L', 'R'):
    PIVOT_BONE.update({'arm_%s_upper' % s: 'Shoulder.' + s, 'arm_%s_lower' % s: 'LowerArm.' + s,
                       'hand_' + s: 'Hands.' + s, 'leg_%s_upper' % s: 'Thigh.' + s,
                       'leg_%s_lower' % s: 'Shin.' + s, 'foot_' + s: 'Feet.' + s})
RED_MESHES = {'L.2.LKnee', 'R.2.LKnee'}          # knee caps: red accent ('Outer' faces only)

# ---- paint (linear). bake_mechs.py MODEL_OPTS['enemy_ms'] keeps these values (paint_floor 0.04): white ~0.46 lin =
# sRGB 0.71, gunmetal frame 0.05 lin = sRGB 0.25 (metallic satin, per-material PBR there), grey detail sRGB 0.35.
# (The flat colours are also the fallback before the textures load, so none of them is near-black.)
MATS = {
    'tryout_white': ((0.46, 0.47, 0.49), 0.1, 0.45),
    'tryout_frame': ((0.046, 0.049, 0.055), 0.6, 0.45),
    'tryout_grey': ((0.1, 0.104, 0.112), 0.4, 0.45),
    'tryout_red': ((0.5, 0.035, 0.04), 0.15, 0.4),
}
EYE_RGB = (1.0, 0.12, 0.16)        # menacing red visor (the source's is green)
ENGINE_RGB = (1.0, 0.45, 0.15)     # matches world.js ENEMY_ENGINE (orange)
CORE_RGB = (1.0, 0.3, 0.15)        # rifle lenses
SRC_MAT = {'Outer': 'tryout_white', 'Inner': 'tryout_frame', 'Inner.003': 'tryout_frame', 'Inner.002': 'tryout_grey'}


def glow_mat(obj_name):
    return 'eye' if obj_name in ('HeadSkeleton', 'Armor') else 'engine' if obj_name == 'Cube' else 'core'


def gather():
    """All source mesh faces in Blender world space at the bind pose: verts, faces (vertex lists), corner normals,
    per-face part and material."""
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    # every source clip closes the hands into the same fist (Finger*/Thumb* bones): bake that fist into the rigid hands
    # (from 'Idle Pose'), everything else stays at the bind pose
    arm.animation_data_create()
    act = bpy.data.actions.get('Idle Pose')
    arm.animation_data.action = act
    if getattr(act, 'slots', None):
        arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(0)
    fist = {pb.name: pb.rotation_quaternion.copy() for pb in arm.pose.bones if pb.name.startswith(('Finger', 'Thumb'))}
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location, pb.rotation_quaternion, pb.scale = (0, 0, 0), fist.get(pb.name, (1, 0, 0, 0)), (1, 1, 1)
        pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    V, F, CN, FP, FM, FO = [], [], [], [], [], []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.name == 'Icosphere':        # (Icosphere = a bone custom shape)
            continue
        oe = o.evaluated_get(dg)
        me = oe.to_mesh()
        Mw = oe.matrix_world.copy()
        Nm = Mw.to_3x3().inverted().transposed()
        flip = Mw.to_3x3().determinant() < 0                  # mirrored bone-parent scales: keep the winding outward
        base = len(V)
        V.extend([tuple(Mw @ v.co) for v in me.vertices])
        cn = [(Nm @ Vector(c.vector)).normalized() for c in me.corner_normals]
        gname = {g.index: g.name for g in o.vertex_groups}
        for p in me.polygons:
            vs = [base + i for i in p.vertices]
            ls = list(range(p.loop_start, p.loop_start + p.loop_total))
            if flip:
                vs, ls = vs[::-1], ls[::-1]
            F.append(vs)
            CN.append([tuple(cn[l]) for l in ls])
            if o.name in MESH_PART:
                part = MESH_PART[o.name]
            elif o.parent_type == 'BONE':
                part = BONE_PART[o.parent_bone]
            else:                                              # skinned: dominant bone of the face
                acc = {}
                for i in p.vertices:
                    for g in o.data.vertices[i].groups:
                        acc[gname[g.group]] = acc.get(gname[g.group], 0) + g.weight
                part = BONE_PART[max(acc, key=acc.get)]
            FP.append(part)
            sm = me.materials[p.material_index].name if me.materials else 'Inner'
            if sm == 'Inner.001':
                m = glow_mat(o.name)
            elif sm == 'Outer' and o.name in RED_MESHES:
                m = 'tryout_red'
            else:
                m = SRC_MAT[sm]
            FM.append(m)
            FO.append(o.name)
        oe.to_mesh_clear()
    heads = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
    tails = {b.name: arm.matrix_world @ b.tail_local for b in arm.data.bones}
    # GunPose: how the right hand turns the rifle, to find the rifle's top side
    act = bpy.data.actions.get('GunPose')
    arm.animation_data_create()
    arm.animation_data.action = act
    if getattr(act, 'slots', None):
        arm.animation_data.action_slot = act.slots[0]
    bpy.context.scene.frame_set(0)
    bpy.context.view_layer.update()
    pb = arm.pose.bones['Hands.R']
    D_gun = (pb.matrix @ pb.bone.matrix_local.inverted()).to_3x3()
    arm.animation_data.action = None
    return np.array(V), F, CN, FP, FM, FO, heads, tails, D_gun


def shield(mb, piv_fore, fore_lo, fore_hi):
    """Original tall angular kite shield on the outside (+X) of the left forearm (contract units, Blender coords).
    Layers: dark frame back plate, white faceted face plate rising to a vertical ridge, red ridge strip + corner caps,
    grey clamps to the forearm. Returns (centre, outward normal)."""
    x0 = fore_hi.x + 0.32                                         # back face of the shield
    yc = (fore_lo.y + fore_hi.y) / 2 - 0.15
    zc = (fore_lo.z + fore_hi.z) / 2 - 0.9
    half = [(0.0, 4.0), (1.25, 3.7), (1.75, 3.1), (1.75, -0.4), (0.32, -4.35), (0.0, -4.6)]
    outline = half + [(-u, v) for u, v in reversed(half[1:-1])]   # closed, counter-clockwise seen from +X

    def ring(sc_u, sc_v, n, dv=0.0):
        # u runs along -Y (forward), v along +Z; seen from +X (outside) the order is counter-clockwise
        return [Vector((x0 + n, yc - u * sc_u, zc + v * sc_v + dv)) for u, v in outline]
    fr, wh, rd, gy = 'tryout_frame', 'tryout_white', 'tryout_red', 'tryout_grey'
    mb.loft([ring(1.0, 1.0, 0.0), ring(1.0, 1.0, 0.34)], fr, bevel=0.05)                    # back plate / rim
    mb.loft([ring(0.9, 0.92, 0.3), ring(0.9, 0.92, 0.5), ring(0.1, 0.8, 0.82)], wh)          # faceted face plate
    for v0, v1 in ((3.2, 0.6), (0.2, -3.2)):                                                  # red ridge strip
        mb.hexa([(x0 + 0.8, yc - 0.13, zc + v0), (x0 + 0.8, yc + 0.13, zc + v0), (x0 + 0.8, yc + 0.13, zc + v1),
                 (x0 + 0.8, yc - 0.13, zc + v1), (x0 + 0.93, yc - 0.09, zc + v0 - 0.05),
                 (x0 + 0.93, yc + 0.09, zc + v0 - 0.05), (x0 + 0.93, yc + 0.09, zc + v1 + 0.05),
                 (x0 + 0.93, yc - 0.09, zc + v1 + 0.05)], rd)
    for sd in (1, -1):                                                                        # red top-corner caps
        u0, u1 = 1.02, 1.62
        mb.hexa([(x0 + 0.3, yc - sd * u0, zc + 3.62), (x0 + 0.3, yc - sd * u1, zc + 3.0),
                 (x0 + 0.3, yc - sd * u1, zc + 2.55), (x0 + 0.3, yc - sd * u0, zc + 3.2),
                 (x0 + 0.62, yc - sd * u0, zc + 3.5), (x0 + 0.62, yc - sd * u1, zc + 2.95),
                 (x0 + 0.62, yc - sd * u1, zc + 2.62), (x0 + 0.62, yc - sd * u0, zc + 3.22)], rd)
        mb.box((x0 + 0.55, yc - sd * 1.2, zc - 1.2), (0.12, 0.14, 1.5), fr, rot=(sd * 18, 0, 0))   # panel slots
    for dz in (1.1, -0.9):                                                                    # grey clamps
        z = (fore_lo.z + fore_hi.z) / 2 + dz
        mb.box(((fore_hi.x - 0.25 + x0) / 2, yc + 0.15, z), (x0 - fore_hi.x + 0.35, 0.9, 0.55), gy, bevel=0.06)
        mb.cyl((x0 - 0.05, yc + 0.15, z - 0.3), (x0 - 0.05, yc + 0.15, z + 0.3), 0.32, 0.32, fr, seg=10)
    return Vector((x0 + 0.45, yc, zc)), Vector((1, 0, 0))


def convert(out_name):
    lib.reset_scene()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    bpy.ops.import_scene.gltf(filepath=SRC)
    V, F, CN, FP, FM, FO, heads, tails, D_gun = gather()
    zmin, zmax = V[:, 2].min(), V[:, 2].max()
    S = HEIGHT / (zmax - zmin)
    o = np.array([0.0, heads['PelvisBase'].y, zmin])       # pelvis on the Z axis, feet at z = 0

    def T(p):
        return Vector((np.asarray(p) - o) * S)
    V = (V - o) * S
    print('  source height %.3f  scale S=%.6f  origin (Blender) %s' % (zmax - zmin, S, tuple(round(x, 4) for x in o)))
    piv = {p: T(heads[b]) for p, b in PIVOT_BONE.items()}
    FP = np.array(FP)
    # rifle pivot: the right palm centre ('Base' palm mesh); saber hilt: the left fist centre
    def obj_centre(name):
        sel = [i for i, fo in enumerate(FO) if fo == name]
        pts = V[np.unique(np.concatenate([F[i] for i in sel]))]
        return Vector((pts.min(0) + pts.max(0)) / 2)
    piv['rifle'] = obj_centre('Base')
    fingers_L = [n for n in set(FO) if n.startswith('Finger') and n[-4:] in ('.004', '.005', '.006')]
    grip_L = (obj_centre('Base.001') + sum((obj_centre(n) for n in fingers_L), Vector()) / len(fingers_L)) / 2   # in the fist
    # backpack pivot: where it meets the torso (front of the pack, torso height)
    bp_sel = np.where(FP == 'backpack')[0]
    bp_pts = V[np.unique(np.concatenate([F[i] for i in bp_sel]))]
    piv['backpack'] = Vector((0.0, float(bp_pts[:, 1].min()), float(piv['torso'].z + (piv['head'].z - piv['torso'].z) * 0.7)))
    # ---- pod nozzles: the two long pods at the bottom of the backpack get engine bells at their lower-rear ends
    extra = MB()
    for sd in (1, -1):
        pod = np.array([V[F[i]].mean(0) for i in bp_sel])
        m = (pod[:, 0] * sd > 0.25) & (pod[:, 2] < piv['torso'].z + (piv['head'].z - piv['torso'].z) * 0.55) & \
            (np.array([FM[i] for i in bp_sel]) == 'tryout_white')
        pts = V[np.unique(np.concatenate([F[bp_sel[k]] for k in np.where(m)[0]]))]
        c = pts.mean(0)
        u, s_, vt = np.linalg.svd(pts - c)
        ax = vt[0] if vt[0][2] < 0 else -vt[0]                # pointing down (and back)
        proj = (pts - c) @ ax
        end = c + ax * proj.max()
        rad = np.percentile(np.linalg.norm((pts - c) - np.outer(proj, ax), axis=1), 90)
        print('  pod %+d: axis %s end %s r=%.2f' % (sd, np.round(ax, 3), np.round(end, 2), rad))
        deep_nozzle(extra, Vector(end - ax * rad * 0.25), Vector(ax), rad * 0.78, 'tryout_frame', 'tryout_frame',
                    'engine', depth=0.9, seg=16, ribs=False)
    # ---- materials
    for n, (c, mt, r) in MATS.items():
        reg(n, c, metal=mt, rough=r)
    reg('eye', (0.2, 0.04, 0.05), 0.0, 0.3, EYE_RGB, 6.0)
    reg('engine', (0.1, 0.1, 0.1), 0.0, 0.3, ENGINE_RGB, 3.0)
    reg('core', (0.1, 0.1, 0.1), 0.0, 0.3, CORE_RGB, 4.0)
    for o_ in list(bpy.data.objects):
        bpy.data.objects.remove(o_, do_unlink=True)
    # ---- one mesh object per part (geometry relative to its pivot, unrotated)
    objs = {}
    root = bpy.data.objects.new('ms_root', None)
    link(root)
    root.location = piv['ms_root']
    objs['ms_root'] = root
    for part in sorted(set(FP)):
        fl = np.where(FP == part)[0]
        pv = np.array(piv[part])
        remap, verts, faces, norms = {}, [], [], []
        for f in fl:
            fv = []
            for vi in F[f]:
                if vi not in remap:
                    remap[vi] = len(verts)
                    verts.append(tuple(V[vi] - pv))
                fv.append(remap[vi])
            faces.append(fv)
            norms.extend(CN[f])
        me = bpy.data.meshes.new(part)
        me.from_pydata(verts, [], faces)
        mats = sorted(set(FM[f] for f in fl))
        for m in mats:
            me.materials.append(get_mat(m))
        me.polygons.foreach_set('material_index', [mats.index(FM[f]) for f in fl])
        me.polygons.foreach_set('use_smooth', [True] * len(fl))
        me.normals_split_custom_set(norms)
        me.validate(clean_customdata=False)
        ob = bpy.data.objects.new(part, me)
        ob.location = piv[part]
        link(ob)
        objs[part] = ob

    def join(target, extra_obj):
        bpy.ops.object.select_all(action='DESELECT')
        extra_obj.select_set(True)
        objs[target].select_set(True)
        bpy.context.view_layer.objects.active = objs[target]
        bpy.ops.object.join()
    join('backpack', extra.to_object('_pods', pivot=piv['backpack'], smooth_angle=40))
    # ---- shield (new part on the left forearm, pivot = the forearm pivot)
    fl = np.where(FP == 'arm_L_lower')[0]
    fp = V[np.unique(np.concatenate([F[i] for i in fl]))]
    mb = MB()
    sc, sn = shield(mb, piv['arm_L_lower'], Vector(fp.min(0)), Vector(fp.max(0)))
    piv['shield'] = piv['arm_L_lower'].copy()
    objs['shield'] = mb.to_object('shield', pivot=piv['shield'], smooth_angle=30)
    # ---- empties
    hilt = bpy.data.objects.new('saber_hilt', None)
    link(hilt)
    hilt.location = grip_L
    objs['saber_hilt'], piv['saber_hilt'] = hilt, grip_L
    # rifle muzzle: centre of the rifle's front lens (its 'core' faces at the barrel end), on the end plane
    rf = np.where((FP == 'rifle'))[0]
    rpts = V[np.unique(np.concatenate([F[i] for i in rf]))]
    c = rpts.mean(0)
    u, s_, vt = np.linalg.svd(rpts - c)
    lens = [i for i in rf if FM[i] == 'core']
    lc = np.array([V[F[i]].mean(0) for i in lens])
    ax = vt[0] if (lc.mean(0) - c) @ vt[0] > 0 else -vt[0]
    lens_end = lc[((lc - c) @ ax) > ((rpts - c) @ ax).max() - 0.6]      # the lens at the barrel end (not the sight)
    mz = lens_end.mean(0)
    mz = mz + ax * (((rpts - c) @ ax).max() - (mz - c) @ ax)
    up_w = Vector(D_gun.inverted() @ Vector((0, 0, 1)))                   # world up in GunPose, back in the rest frame
    up_w = (up_w - Vector(ax) * up_w.dot(Vector(ax))).normalized()
    e = bpy.data.objects.new('rifle_muzzle', None)
    link(e)
    # ---- hierarchy
    for ch, pa in PARENT.items():
        if ch in objs and pa in objs:
            set_parent(objs[ch], objs[pa], piv[ch], piv[pa])
    set_parent(e, objs['rifle'], Vector(mz), piv['rifle'])
    # ---- report (glTF coordinates: x, z, -y)
    gl = lambda v: (v[0], v[2], -v[1])
    print('PIV (glTF model space):')
    for n_ in ['ms_root', 'pelvis', 'torso', 'head', 'backpack', 'arm_L_upper', 'arm_L_lower', 'hand_L',
               'arm_R_upper', 'arm_R_lower', 'hand_R', 'leg_L_upper', 'leg_L_lower', 'foot_L', 'leg_R_upper',
               'leg_R_lower', 'foot_R', 'rifle', 'shield', 'saber_hilt']:
        print('  %-12s [%.3f, %.3f, %.3f]' % (n_, *gl(piv[n_])))
    rm = Vector(mz) - piv['rifle']
    print('RIFLE muzzle in rifle frame [%.4f, %.4f, %.4f]  barrel dir [%.4f, %.4f, %.4f]  up [%.4f, %.4f, %.4f]'
          % (*gl(rm), *gl(ax), *gl(up_w)))
    sc_l = sc - piv['shield']
    sh = objs['shield'].data
    cen = sum((v.co for v in sh.vertices), Vector()) / len(sh.vertices)
    print('SHIELD centroid (part frame) [%.3f, %.3f, %.3f]  face-centre [%.3f, %.3f, %.3f]  normal [%.1f, %.1f, %.1f]'
          % (*gl(cen), *gl(sc_l), *gl(sn)))
    eyes = [(objs['head'].matrix_world @ p.center) for p in objs['head'].data.polygons
            if objs['head'].data.materials[p.material_index].name == 'eye']
    ec = sum(eyes, Vector()) / len(eyes)
    print('EYE centre (model) [%.3f, %.3f, %.3f]  in head frame [%.3f, %.3f, %.3f]' % (*gl(ec), *gl(ec - piv['head'])))
    tot = 0
    for n_, ob in sorted(objs.items()):
        if ob.type == 'MESH':
            t = lib.tri_count(ob)
            tot += t
            print('  %-12s tris=%6d mats=%s' % (n_, t, [m.name for m in ob.data.materials]))
    print('  TOTAL tris', tot)
    lib.export_glb(os.path.join(OUT, out_name + '.glb'))
    print('CONVERTED', out_name)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    convert(argv[0] if argv else 'enemy_ms')
