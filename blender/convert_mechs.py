"""Convert downloaded rigged mecha GLBs (ATLAS/09 -> gundam.glb, RONIN/04 -> enemy_ms.glb) to the SCRIPT.md
rigid-part contract: one mesh object per body part (split by dominant bone weight), pivots at the joints,
hierarchy per mobile_suits.PARENT, textures flattened into per-colour-cluster Principled materials.

Usage: blender.exe -b --factory-startup --python blender/convert_mechs.py [-- gundam enemy_ms]
Sources: assets/src/atlas-09.glb, assets/src/ronin-04.glb (CC0, Ramon Linares, github.com/RamonLinares/atlas-09)
"""
import sys, os, math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib
from lib import MB, reg, get_mat, link, set_parent, lerp, annulus
from mobile_suits import PARENT
from shipkit import deep_nozzle

ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, 'assets', 'src')
OUT = os.path.join(ROOT, 'assets')

BASE_MAP = {'root': 'pelvis', 'pelvis': 'pelvis', 'skirt.L': 'pelvis', 'skirt.R': 'pelvis', 'chest': 'torso',
            'head': 'head',
            'shoulder.L': 'arm_L_upper', 'upper_arm.L': 'arm_L_upper', 'forearm.L': 'arm_L_lower', 'hand.L': 'hand_L',
            'shoulder.R': 'arm_R_upper', 'upper_arm.R': 'arm_R_upper', 'forearm.R': 'arm_R_lower', 'hand.R': 'hand_R',
            'sword.R': 'hand_R',
            'thigh.L': 'leg_L_upper', 'shin.L': 'leg_L_lower', 'foot.L': 'foot_L',
            'thigh.R': 'leg_R_upper', 'shin.R': 'leg_R_lower', 'foot.R': 'foot_R'}
# SERAPH / 03's wing chains (root, outer, five feathers per side) ride as one rigid part each, hinged at the wing root
for _s in ('L', 'R'):
    for _b in ['wing_root', 'wing_outer'] + ['feather_0%d' % _k for _k in range(1, 6)]:
        BASE_MAP['%s.%s' % (_b, _s)] = 'wing_' + _s
EXTRA_PARENT = {'wing_L': 'torso', 'wing_R': 'torso'}
# VANGUARD / 07's beam rifle is its own bone (child of hand.R): it becomes the `rifle` part (hinged at the grip)
BASE_MAP['rifle.R'] = 'rifle'
PIVOT_BONE = {'rifle': 'rifle.R', 'shield': 'forearm.L', 'wing_L': 'wing_root.L', 'wing_R': 'wing_root.R', 'pelvis': 'pelvis', 'torso': 'chest', 'head': 'head', 'arm_L_upper': 'upper_arm.L',
              'arm_L_lower': 'forearm.L', 'hand_L': 'hand.L', 'arm_R_upper': 'upper_arm.R', 'arm_R_lower': 'forearm.R',
              'hand_R': 'hand.R', 'leg_L_upper': 'thigh.L', 'leg_L_lower': 'shin.L', 'foot_L': 'foot.L',
              'leg_R_upper': 'thigh.R', 'leg_R_lower': 'shin.R', 'foot_R': 'foot.R'}

SPECS = {
    'gundam': dict(src='atlas-09.glb', height=18.0, prefix='atlas', eye_rgb=(0.4, 1.0, 0.9),
                   glow_name='core', engine_rgb=(0.5, 0.75, 1.0), muzzle_empty='Muzzle_R', hilt=True,
                   core_rgb=(0.35, 0.85, 1.0), K=5, clean_emissive=True, hand_rifle=True),
    # SERAPH / 03 (CC0): the new enemy — black armour, orange lights, wings, a heavy beam cannon on the right arm
    'enemy_seraph': dict(src='seraph-03.glb', height=19.0, prefix='seraph', eye_rgb=(1.0, 0.42, 0.12),
                         glow_name='core', engine_rgb=(1.0, 0.45, 0.15), muzzle_empty=None, hilt=False,
                         core_rgb=(1.0, 0.45, 0.15), K=5, smooth_iter=10, em_thresh=0.12),   # its small orange panel lights
    # VANGUARD / 07 (CC0): the enemy from 2026-09-28 (2) — a hand-held beam rifle + shield, painted white / gunmetal / red
    'enemy_vanguard': dict(src='vanguard-07.glb', height=18.5, prefix='vanguard', eye_rgb=(1.0, 0.3, 0.4),
                           glow_name='core', engine_rgb=(1.0, 0.4, 0.3), muzzle_empty='Muzzle_Rifle', hilt=False,
                           core_rgb=(1.0, 0.35, 0.3), K=6, smooth_iter=10, em_thresh=0.2, palette='white',
                           split_shield=1.15),
    'enemy_ms': dict(src='ronin-04.glb', height=18.0, prefix='ronin', eye_rgb=(1.0, 0.25, 0.6),
                     glow_name='core', engine_rgb=(1.0, 0.4, 0.12), muzzle_empty=None, hilt=False,
                     sword_forward=True, add_eyes=True, core_rgb=(1.0, 0.4, 0.12), K=5, smooth_iter=12),
}


def crimson(c):
    """repaint an sRGB armour colour into a crimson / black / gold scheme: pale armour -> crimson, blue -> near-black,
    red trim -> gold, darks stay dark (a little warmer)"""
    r, g, b = (float(x) for x in c)
    lum = 0.3 * r + 0.55 * g + 0.15 * b
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / (mx + 1e-6)
    if b > r + 0.08 and b > g:                     # blue chest / panels
        out = (0.09, 0.075, 0.08)
    elif r > g + 0.15 and r > b + 0.15:            # red trim
        out = (0.78, 0.58, 0.24)
    elif lum > 0.42 and sat < 0.3:                 # pale armour
        k = min(1.0, lum / 0.8)
        out = (0.62 * k + 0.06, 0.06 * k + 0.02, 0.07 * k + 0.02)
    elif g > 0.45 and r > 0.45 and b < 0.3:        # yellow antenna / vents
        out = (0.8, 0.6, 0.22)
    else:                                          # frame / joints: dark, a little warm
        out = (lum * 0.55 + 0.03, lum * 0.45 + 0.025, lum * 0.45 + 0.03)
    print('  repaint %s -> %s' % (tuple(round(x, 2) for x in c), tuple(round(x, 2) for x in out)))
    return np.array(out)


def white(c):
    """repaint into a white / gunmetal / red scheme: pale armour -> clean white, blue -> dark gunmetal, red trim stays red,
    yellow -> gold, darks stay dark"""
    r, g, b = (float(x) for x in c)
    lum = 0.3 * r + 0.55 * g + 0.15 * b
    mx, mn = max(r, g, b), min(r, g, b)
    sat = (mx - mn) / (mx + 1e-6)
    if b > r + 0.08 and b > g:
        out = (0.2, 0.21, 0.23)
    elif r > g + 0.15 and r > b + 0.15:
        out = (0.62, 0.07, 0.08)
    elif lum > 0.42 and sat < 0.3:
        k = min(1.0, lum / 0.7)
        out = (0.64 * k + 0.06, 0.65 * k + 0.06, 0.68 * k + 0.06)   # (a brighter white bloomed out under the key light)
    elif g > 0.45 and r > 0.45 and b < 0.3:
        out = (0.8, 0.6, 0.22)
    else:
        out = (lum * 0.55 + 0.04, lum * 0.55 + 0.045, lum * 0.6 + 0.05)
    print('  repaint %s -> %s' % (tuple(round(x, 2) for x in c), tuple(round(x, 2) for x in out)))
    return np.array(out)


def srgb_to_lin(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def image_array(img):
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def sample(arr, uv):
    h, w = arr.shape[:2]
    x = np.clip((uv[:, 0] % 1.0) * w, 0, w - 1).astype(np.int64)
    y = np.clip((uv[:, 1] % 1.0) * h, 0, h - 1).astype(np.int64)
    return arr[y, x]


def find_textures(mesh_obj):
    """Return dict role -> numpy image (base, orm, emission) from the materials' image nodes."""
    out = {}
    for m in mesh_obj.data.materials:
        if not m or not m.node_tree:
            continue
        for nd in m.node_tree.nodes:
            if nd.type != 'TEX_IMAGE' or not nd.image:
                continue
            nm = nd.image.name.lower()
            role = 'base' if 'basecolor' in nm else 'orm' if 'orm' in nm else 'emission' if 'emission' in nm else None
            if role and role not in out:
                out[role] = image_array(nd.image)
    return out


def kmeans(X, w, K, iters=25, seed=3):
    rs = np.random.RandomState(seed)
    n = len(X)
    C = [X[rs.choice(n, p=w / w.sum())]]
    for _ in range(1, K):
        d = np.min(((X[:, None, :] - np.array(C)[None]) ** 2).sum(-1), axis=1)
        p = d * w
        C.append(X[rs.choice(n, p=p / p.sum())])
    C = np.array(C)
    for _ in range(iters):
        lab = np.argmin(((X[:, None, :] - C[None]) ** 2).sum(-1), axis=1)
        for k in range(K):
            m = lab == k
            if m.any():
                C[k] = (X[m] * w[m, None]).sum(0) / w[m].sum()
    return lab, C


def build_rifle(g, names_c, order, glow):
    """Original chunky beam rifle (~11 m) gripped at g, pointing forward (-Y Blender = +Z glTF)."""
    dark, mid, light = names_c[order[0]], names_c[order[len(order) // 2]], names_c[order[-1]]
    mb = MB()
    x, y, z = g
    zc = z + 0.55                                      # bore line sits above the grip
    mb.box((x, y + 0.05, z - 0.05), (0.5, 0.7, 1.4), dark, rot=(-14, 0, 0), bevel=0.06)         # pistol grip
    mb.hexa([(x - 0.42, y + 1.6, zc - 0.55), (x + 0.42, y + 1.6, zc - 0.55), (x + 0.42, y - 3.2, zc - 0.5),
             (x - 0.42, y - 3.2, zc - 0.5), (x - 0.45, y + 1.6, zc + 0.6), (x + 0.45, y + 1.6, zc + 0.6),
             (x + 0.4, y - 3.0, zc + 0.5), (x - 0.4, y - 3.0, zc + 0.5)], mid, bevel=0.08)          # receiver
    mb.box((x, y - 1.2, zc - 0.62), (0.7, 1.8, 0.35), dark, bevel=0.04)                         # trigger guard
    mb.box((x + 0.47, y - 0.8, zc), (0.06, 2.6, 0.18), glow)                                      # coil strip (R)
    mb.box((x - 0.47, y - 0.8, zc), (0.06, 2.6, 0.18), glow)                                      # coil strip (L)
    for k in range(5):
        mb.box((x, y - 0.1 - k * 0.55, zc + 0.62), (0.7, 0.18, 0.08), dark)                     # top vents
    mb.hexa([(x - 0.35, y + 1.5, zc - 0.4), (x + 0.35, y + 1.5, zc - 0.4), (x + 0.35, y + 3.6, zc - 0.9),
             (x - 0.35, y + 3.6, zc - 0.9), (x - 0.38, y + 1.5, zc + 0.45), (x + 0.38, y + 1.5, zc + 0.45),
             (x + 0.38, y + 3.6, zc + 0.15), (x - 0.38, y + 3.6, zc + 0.15)], mid, bevel=0.06)      # stock
    mb.box((x, y + 3.7, zc - 0.35), (0.8, 0.3, 1.3), dark, bevel=0.05)                          # butt pad
    mb.cyl((x, y - 3.0, zc), (x, y - 5.2, zc), 0.42, 0.38, light, seg=16, bevel=0.03)           # barrel jacket
    for k in range(4):
        mb.cyl((x, y - 3.2 - k * 0.5, zc), (x, y - 3.4 - k * 0.5, zc), 0.46, 0.46, dark, seg=16)
    mb.cyl((x, y - 5.2, zc), (x, y - 7.6, zc), 0.26, 0.24, dark, seg=14)                        # barrel
    mb.cyl((x, y - 7.3, zc), (x, y - 8.3, zc), 0.4, 0.36, mid, seg=8, bevel=0.03)               # muzzle shroud
    for sd in (1, -1):
        mb.box((x + sd * 0.36, y - 7.8, zc), (0.1, 0.5, 0.18), dark)                           # shroud slots
    mb.cyl((x, y - 8.25, zc), (x, y - 8.33, zc), 0.2, 0.2, glow, seg=12)                        # muzzle lens
    mb.box((x, y - 4.3, zc - 0.6), (0.34, 0.8, 0.9), dark, rot=(10, 0, 0), bevel=0.04)          # foregrip
    mb.cyl((x, y - 0.4, zc + 0.95), (x, y - 2.4, zc + 0.95), 0.2, 0.2, dark, seg=12)            # top sight
    mb.box((x, y - 1.4, zc + 0.72), (0.2, 0.9, 0.2), mid)
    mb.cyl((x, y - 2.4, zc + 0.95), (x, y - 2.5, zc + 0.95), 0.14, 0.14, glow, seg=10)
    ob = mb.to_object('rifle', pivot=Vector(g), smooth_angle=35)
    return ob, Vector((x, y - 8.4, zc))


def convert(name):
    sp = SPECS[name]
    lib.reset_scene()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, sp['src']))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    src = max((o for o in bpy.data.objects if o.type == 'MESH' and o.vertex_groups), key=lambda o: len(o.data.polygons))
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.context.view_layer.update()
    me = src.data
    Mw = src.matrix_world.copy()
    Aw = arm.matrix_world.copy()
    nv, nf = len(me.vertices), len(me.polygons)
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(nv, 3)
    co = (np.array(Mw.to_3x3()) @ co.T).T + np.array(Mw.translation)
    zmin = co[:, 2].min()
    S = sp['height'] / (co[:, 2].max() - zmin)
    off = np.array([0, 0, -zmin])

    def T(p):  # source world -> contract space
        return (np.asarray(p) + off) * S
    co = T(co)
    bone_heads = {b.name: Vector(T(np.array(Aw @ b.head_local))) for b in arm.data.bones}
    bone_tails = {b.name: Vector(T(np.array(Aw @ b.tail_local))) for b in arm.data.bones}
    # ---- dominant bone per vertex / face
    gname = {g.index: g.name for g in src.vertex_groups}
    vb = np.full(nv, -1, np.int64)
    names = sorted(set(gname.values()))
    nidx = {n: i for i, n in enumerate(names)}
    for v in me.vertices:
        best, bw = None, 0.0
        for g in v.groups:
            if g.weight > bw:
                best, bw = g.group, g.weight
        if best is not None:
            vb[v.index] = nidx[gname[best]]
    loop_start = np.empty(nf, np.int64)
    loop_total = np.empty(nf, np.int64)
    me.polygons.foreach_get('loop_start', loop_start)
    me.polygons.foreach_get('loop_total', loop_total)
    nl = len(me.loops)
    lv = np.empty(nl, np.int64)
    me.loops.foreach_get('vertex_index', lv)
    face_of_loop = np.repeat(np.arange(nf), loop_total)
    fb = np.empty(nf, np.int64)
    lb = vb[lv]
    for f in range(nf):
        vals = lb[loop_start[f]:loop_start[f] + loop_total[f]]
        vals = vals[vals >= 0]
        fb[f] = np.bincount(vals).argmax() if len(vals) else nidx.get('chest', 0)
    face_node = np.array([BASE_MAP.get(names[b], 'torso') for b in fb])
    if sp.get('split_shield') and 'forearm.L' in nidx:
        # VANGUARD's shield is skinned to forearm.L: faces farther than 1.15 m from the forearm's axis are the shield
        h0, t0 = np.array(bone_heads['forearm.L']), np.array(bone_tails['forearm.L'])
        ax = (t0 - h0) / np.linalg.norm(t0 - h0)
        cent = np.array([co[list(p.vertices)].mean(0) for p in me.polygons])
        d = cent - h0
        rad = np.linalg.norm(d - np.outer(d @ ax, ax), axis=1)
        sh = (fb == nidx['forearm.L']) & (rad > sp['split_shield'])
        face_node[sh] = 'shield'
        print('  shield split: %d faces' % sh.sum())
    # ---- per-face colour / orm / emission from textures
    tex = find_textures(src)
    uv = np.empty(nl * 2, np.float32)
    me.uv_layers[0].data.foreach_get('uv', uv)
    uv = uv.reshape(nl, 2)
    area = np.empty(nf, np.float32)
    me.polygons.foreach_get('area', area)

    def face_avg(img, channels):
        s = sample(img, uv)[:, :channels]
        acc = np.zeros((nf, channels))
        np.add.at(acc, face_of_loop, s)
        return acc / loop_total[:, None]
    base_srgb = face_avg(tex['base'], 3)
    orm = face_avg(tex['orm'], 3) if 'orm' in tex else np.tile([1, 0.5, 0.5], (nf, 1))
    emis = face_avg(tex['emission'], 3) if 'emission' in tex else np.zeros((nf, 3))
    # emission from dedicated emissive material slots
    mi = np.empty(nf, np.int64)
    me.polygons.foreach_get('material_index', mi)
    for k, m in enumerate(me.materials if 'emission' not in tex else []):
        if m and 'emission' in m.name.lower():
            sel = mi == k
            e_col = np.maximum(base_srgb[sel], 0.3)
            emis[sel] = np.maximum(emis[sel], e_col)
    # smooth per-face colour over edge-adjacent faces (removes texture noise / baked highlights)
    ek = {}
    adj_a, adj_b = [], []
    for f, p in enumerate(me.polygons):
        for e in p.edge_keys:
            if e in ek:
                adj_a.append(ek[e]); adj_b.append(f)
            else:
                ek[e] = f
    adj_a, adj_b = np.array(adj_a), np.array(adj_b)
    same = mi[adj_a] == mi[adj_b] if False else np.ones(len(adj_a), bool)
    for _ in range(sp.get('smooth_iter', 6)):
        acc = base_srgb * area[:, None]
        wsum = area.copy()
        np.add.at(acc, adj_a, base_srgb[adj_b] * area[adj_b, None])
        np.add.at(wsum, adj_a, area[adj_b])
        np.add.at(acc, adj_b, base_srgb[adj_a] * area[adj_a, None])
        np.add.at(wsum, adj_b, area[adj_a])
        base_srgb = acc / wsum[:, None]
    elum = emis.max(1)
    is_em = elum > sp.get('em_thresh', 0.35)
    # sword: keep as its own polished steel/gold cluster set (it is thin; clustering handles it)
    lab, C = kmeans(base_srgb[~is_em], area[~is_em] + 1e-6, sp['K'])
    cluster = np.full(nf, -1)
    cluster[~is_em] = lab
    # material table
    mats = []
    lum = C @ np.array([0.3, 0.55, 0.15])
    order = np.argsort(lum)
    names_c = {}
    for rank, k in enumerate(order):
        sel = cluster == k
        wgt = area[sel][:, None]
        col = (base_srgb[sel] * wgt).sum(0) / wgt.sum()
        if sp.get('palette') == 'crimson':
            col = crimson(col)
        elif sp.get('palette') == 'white':
            col = white(col)
        col = srgb_to_lin(col)
        rough = float((orm[sel, 1] * wgt[:, 0]).sum() / wgt.sum())
        metal = float((orm[sel, 2] * wgt[:, 0]).sum() / wgt.sum())
        mname = '%s_%d' % (sp['prefix'], rank)
        reg(mname, tuple(float(c) for c in col), metal=min(1.0, metal), rough=max(0.15, rough))
        names_c[k] = mname
    reg('eye', (0.2, 0.3, 0.3), 0.0, 0.3, sp['eye_rgb'], 6.0)
    ecol = tuple(float(x) for x in srgb_to_lin(emis[is_em].mean(0))) if is_em.any() else (0.4, 0.8, 1.0)
    reg(sp['glow_name'], (0.1, 0.1, 0.1), 0.0, 0.3, sp.get('core_rgb', ecol), 4.0)
    reg(sp['prefix'] + '_blade', (0.55, 0.56, 0.6), 1.0, 0.18)
    reg('engine', (0.1, 0.1, 0.1), 0.0, 0.3, sp['engine_rgb'], 3.0)
    reg('recess', (0.02, 0.021, 0.024), 0.3, 0.85)
    face_mat = np.empty(nf, dtype=object)
    clean = sp.get('clean_emissive')
    fcent = np.array([co[list(p.vertices)].mean(0) for p in me.polygons])
    fnrm = np.empty(nf * 3, np.float32)
    me.polygons.foreach_get('normal', fnrm)
    fnrm = (np.array(Mw.to_3x3().normalized()) @ fnrm.reshape(nf, 3).T).T
    eye_sel = is_em & (face_node == 'head')
    core_sel = is_em & (face_node == 'torso')
    if clean and eye_sel.sum() > 3:
        # darken the whole visor recess (not only the emissive texels) so no jagged light/dark teeth remain
        P = fcent[eye_sel]
        vx0, vx1 = np.percentile(P[:, 0], 2) - 0.2, np.percentile(P[:, 0], 98) + 0.2
        vy = np.polyfit(P[:, 0], P[:, 1], 2)
        vz = np.polyfit(P[:, 0], P[:, 2], 2)
        vh = max(0.1, (np.percentile(P[:, 2], 90) - np.percentile(P[:, 2], 10)) * 0.35)
        hx = fcent[:, 0]
        dz = fcent[:, 2] - np.polyval(vz, hx)
        recess = ((face_node == 'head') & (hx > vx0 - 0.15) & (hx < vx1 + 0.15) &
                  (dz < vh * 3.2) & (dz > -vh * 9.0) &          # extend well below the band (jaw grille)
                  (fcent[:, 1] < np.polyval(vy, hx) + 0.7))
        eye_sel = eye_sel | recess
    for f in range(nf):
        if clean and eye_sel[f]:
            face_mat[f] = 'recess'               # matte dark visor recess (no glossy shard highlights)
        elif clean and core_sel[f]:
            face_mat[f] = names_c[order[0]]      # sockets go dark; clean emissive parts are modelled below
        elif is_em[f]:
            face_mat[f] = 'eye' if face_node[f] == 'head' else sp['glow_name']
        else:
            face_mat[f] = names_c[cluster[f]]
    if sp.get('sword_forward') and 'sword.R' in nidx:
        grip0 = bone_heads['sword.R']
        cent = np.array([co[list(p.vertices)].mean(0) for p in me.polygons])
        blade = (fb == nidx['sword.R']) & (np.linalg.norm(cent - np.array(grip0), axis=1) > 1.3)
        face_mat[blade] = sp['prefix'] + '_blade'
    # ---- katana: rotate the sword so it points forward (engine draws the heat blade along hand +Z / -Y)
    if sp.get('sword_forward') and 'sword.R' in nidx:
        sw_faces = np.where(fb == nidx['sword.R'])[0]
        grip = bone_heads['sword.R']
        d = (bone_tails['sword.R'] - grip).normalized()
        q = d.rotation_difference(Vector((0, -1, 0)))
        R3 = np.array(q.to_matrix())
        vs = np.unique(lv[np.concatenate([np.arange(loop_start[f], loop_start[f] + loop_total[f]) for f in sw_faces])])
        co[vs] = (R3 @ (co[vs] - np.array(grip)).T).T + np.array(grip)
    # ---- original corner normals (rotated into contract space) so shading matches the source
    cn = np.empty(nl * 3, np.float32)
    me.corner_normals.foreach_get('vector', cn) if hasattr(me, 'corner_normals') else None
    cn = cn.reshape(nl, 3)
    R3w = np.array(Mw.to_3x3().normalized())
    cn = (R3w @ cn.T).T
    if sp.get('sword_forward') and 'sword.R' in nidx:
        sl = np.concatenate([np.arange(loop_start[f], loop_start[f] + loop_total[f]) for f in sw_faces])
        cn[sl] = (R3 @ cn[sl].T).T
    mat_list = sorted(set(face_mat))
    mat_index = {m: i for i, m in enumerate(mat_list)}
    node_faces = {}
    drop = (is_em & (face_node == 'head')) if sp.get('clean_emissive') else np.zeros(nf, bool)
    for f in range(nf):
        if drop[f]:
            continue              # original jagged visor triangles are deleted; a clean visor is modelled
        node_faces.setdefault(face_node[f], []).append(f)
    src_muzzle = None
    if sp.get('muzzle_empty') and bpy.data.objects.get(sp['muzzle_empty']):
        src_muzzle = Vector(T(np.array(bpy.data.objects[sp['muzzle_empty']].matrix_world.translation)))
    elif sp.get('muzzle_empty') in bone_heads:            # a bone in the rig (VANGUARD's Muzzle_Rifle)
        src_muzzle = bone_heads[sp['muzzle_empty']].copy()
    polys_v = [tuple(p.vertices) for p in me.polygons]
    # remove imported source objects
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    objs, piv = {}, {}
    root = bpy.data.objects.new('ms_root', None)
    link(root)
    ph = bone_heads['pelvis'] if 'pelvis' in bone_heads else Vector((0, 0, 9))
    root.location = Vector((0, ph.y, ph.z))
    objs['ms_root'], piv['ms_root'] = root, root.location.copy()
    for node, flist in node_faces.items():
        pv = bone_heads[PIVOT_BONE[node]].copy() if node in PIVOT_BONE else Vector((0, 0, 9))
        if node == 'pelvis':
            pv = piv['ms_root'].copy()
        remap, verts, faces, loops = {}, [], [], []
        for f in flist:
            fv = []
            for vi in polys_v[f]:
                if vi not in remap:
                    remap[vi] = len(verts)
                    verts.append(tuple(co[vi] - np.array(pv)))
                fv.append(remap[vi])
            faces.append(fv)
            loops.extend(range(loop_start[f], loop_start[f] + loop_total[f]))
        mesh = bpy.data.meshes.new(node)
        mesh.from_pydata(verts, [], faces)
        for m in mat_list:
            mesh.materials.append(get_mat(m))
        mesh.polygons.foreach_set('material_index', [mat_index[face_mat[f]] for f in flist])
        mesh.polygons.foreach_set('use_smooth', [True] * len(flist))
        if node == 'head' and sp.get('clean_emissive'):
            mesh.set_sharp_from_angle(angle=math.radians(40))      # smooth head shell (auto-smooth ~40 deg)
        else:
            mesh.normals_split_custom_set([tuple(cn[l]) for l in loops])
        mesh.validate(clean_customdata=False)
        ob = bpy.data.objects.new(node, mesh)
        ob.location = pv
        link(ob)
        objs[node], piv[node] = ob, pv
    # every joint of the contract exists even if no faces landed on it (SERAPH's right hand is inside its cannon)
    for node, bone in PIVOT_BONE.items():
        if node not in objs and bone in bone_heads:
            ob = bpy.data.objects.new(node, None)
            ob.location = bone_heads[bone].copy()
            link(ob)
            objs[node], piv[node] = ob, ob.location.copy()
    # ---- extras: backpack thrusters, saber hilt, rifle (+muzzle), eyes, shield-less contract nodes
    chest_h = bone_heads['chest']
    torso_faces_y = max(o.bound_box[6][1] for o in [objs['torso']]) + piv['torso'].y  # back surface (+Y)
    bpz = chest_h.z + (bone_heads['head'].z - chest_h.z) * 0.45
    back_y = torso_faces_y - 0.25
    mb = MB()
    dark = names_c[order[0]]
    mid = names_c[order[len(order) // 2]]
    # dominant (largest area) armour colour for the pack shell
    big = max(names_c.values(), key=lambda m: area[face_mat == m].sum())
    w = 1.3 if name == 'gundam' else 1.1
    h0, h1 = bpz - 1.9, bpz + 1.3
    mb.hexa([(-w, back_y, h0), (w, back_y, h0), (w * 0.8, back_y + 1.0, h0 + 0.3), (-w * 0.8, back_y + 1.0, h0 + 0.3),
             (-w * 0.9, back_y, h1), (w * 0.9, back_y, h1), (w * 0.6, back_y + 0.7, h1 - 0.2),
             (-w * 0.6, back_y + 0.7, h1 - 0.2)], big, bevel=0.1)
    mb.box((0, back_y + 0.95, (h0 + h1) / 2), (w * 0.9, 0.25, (h1 - h0) * 0.6), dark, bevel=0.05)
    for k in range(3):
        mb.box((0, back_y + 1.1, h0 + 0.9 + k * 0.45), (w * 0.8, 0.1, 0.12), mid)
    for sd in (1, -1):
        px = sd * (w + 0.35)
        mb.cyl((px, back_y + 0.35, h1 - 0.1), (px, back_y + 0.55, h0 - 0.2), 0.5, 0.58, big, seg=16, bevel=0.04)
        mb.box((px - sd * 0.35, back_y + 0.2, (h0 + h1) / 2), (0.5, 0.6, 1.6), dark, bevel=0.05)
        deep_nozzle(mb, (px, back_y + 0.6, h0 - 0.2), (0, 0.55, -1), 0.46, dark, dark, 'engine', depth=1.2, seg=18,
                    ribs=False)
    deep_nozzle(mb, (0, back_y + 1.0, h0 + 0.3), (0, 1, -0.3), 0.34, dark, dark, 'engine', depth=1.1, seg=14,
                ribs=False)
    bp = Vector((0, back_y, bpz))
    ob = mb.to_object('backpack', pivot=bp, smooth_angle=40)
    objs['backpack'], piv['backpack'] = ob, bp
    hand_L = bone_heads['hand.L']
    grip_L = bone_heads['hand.L'] + (bone_tails['hand.L'] - bone_heads['hand.L']) * 0.45
    if sp['hilt']:
        mb = MB()
        g = grip_L
        mb.cyl((g.x, g.y + 0.9, g.z), (g.x, g.y - 1.0, g.z), 0.2, 0.2, mid, seg=12)
        mb.cyl((g.x, g.y - 0.95, g.z), (g.x, g.y - 1.25, g.z), 0.21, 0.27, dark, seg=12)
        mb.cyl((g.x, g.y - 1.22, g.z), (g.x, g.y - 1.3, g.z), 0.17, 0.17, 'engine', seg=12)
        ob = mb.to_object('saber_hilt', pivot=g, smooth_angle=40)
    else:
        ob = bpy.data.objects.new('saber_hilt', None)
        ob.location = grip_L
        link(ob)
    objs['saber_hilt'], piv['saber_hilt'] = ob, grip_L.copy()
    grip_R = bone_heads['hand.R'] + (bone_tails['hand.R'] - bone_heads['hand.R']) * 0.45
    if sp.get('hand_rifle'):
        rifle, mz = build_rifle(grip_R, names_c, order, sp['glow_name'])
    elif 'rifle' in objs:                                   # the model's own rifle part (VANGUARD)
        rifle = objs['rifle']
        grip_R = piv['rifle'].copy()
    else:
        rifle = bpy.data.objects.new('rifle', None)
        rifle.location = grip_R
        link(rifle)
    objs['rifle'], piv['rifle'] = rifle, grip_R.copy()
    if sp.get('hand_rifle'):
        pass
    elif src_muzzle is not None and name != 'gundam':
        mz = src_muzzle
    elif name == 'gundam':
        mz = src_muzzle if src_muzzle is not None else grip_R + Vector((0, -1.5, 0))  # forearm pulse cannon
    else:
        mz = grip_R + Vector((0, -1.5, 0))
    if sp.get('add_eyes'):
        hm = objs['head'].data
        pale = names_c[order[-1]]
        pid = [i for i, m in enumerate(hm.materials) if m.name == pale]
        pts = []
        for p_ in hm.polygons:
            if p_.material_index in pid and abs(p_.center.x) < 0.6:
                pts.append(tuple(p_.center))
        hv = np.array(pts) + np.array(piv['head'])
        hv = hv[hv[:, 1] < np.percentile(hv[:, 1], 40)]      # front-facing mask faces
        zlo, zhi = hv[:, 2].min(), hv[:, 2].max()
        zc = zlo + 0.72 * (zhi - zlo)
        band = hv[np.abs(hv[:, 2] - zc) < 0.25]
        ymin = band[:, 1].min() if len(band) else hv[:, 1].min()
        print('  eyes at z=%.2f (mask %.2f..%.2f) y=%.2f' % (zc, zlo, zhi, ymin))
        mb = MB()
        for sd in (1, -1):
            mb.box((sd * 0.22, ymin + 0.06, zc), (0.28, 0.1, 0.09), 'eye', rot=(0, sd * 12, 0))
        eo = mb.to_object('_eyes', pivot=piv['head'])
        # merge into head
        bpy.ops.object.select_all(action='DESELECT')
        eo.select_set(True)
        objs['head'].select_set(True)
        bpy.context.view_layer.objects.active = objs['head']
        bpy.ops.object.join()
    if clean:
        dark = names_c[order[0]]

        def join_into(target, extra):
            bpy.ops.object.select_all(action='DESELECT')
            extra.select_set(True)
            objs[target].select_set(True)
            bpy.context.view_layer.objects.active = objs[target]
            bpy.ops.object.join()
        # clean visor: smooth curved strip fitted to the emissive head faces
        P = fcent[is_em & (face_node == 'head')]
        if len(P) > 3:
            x0, x1 = np.percentile(P[:, 0], 2), np.percentile(P[:, 0], 98)
            yfit = np.polyfit(P[:, 0], P[:, 1], 2)
            zfit = np.polyfit(P[:, 0], P[:, 2], 2)
            hh = max(0.1, (np.percentile(P[:, 2], 90) - np.percentile(P[:, 2], 10)) * 0.35)
            mb = MB()
            prof = [(math.cos(a), math.sin(a)) for a in [i / 12 * 2 * math.pi for i in range(12)]]
            prof = [(math.copysign(abs(u) ** 0.5, u), math.copysign(abs(v) ** 0.5, v)) for u, v in prof]  # rounded box
            for mat, grow, dy, t, hz_k in ((dark, 1.0, 0.0, 0.26, 1.7), ('eye', 0.0, -0.1, 0.1, 1.0)):
                rings = []
                n_s = 25
                for i in range(n_s):
                    x = lerp(x0 - grow * 0.16, x1 + grow * 0.16, i / (n_s - 1))
                    yv, zv = np.polyval(yfit, x) + dy, np.polyval(zfit, x)
                    taper = 1.0 - 0.35 * (abs(i / (n_s - 1) - 0.5) * 2) ** 3
                    hz = hh * hz_k * taper
                    rings.append([Vector((x, yv + t / 2 + u * t / 2, zv + v * hz)) for u, v in prof])
                mb.loft(rings, mat)
            join_into('head', mb.to_object('_visor', pivot=piv['head'], smooth_angle=40))
            print('  clean visor: x %.2f..%.2f, half-height %.2f' % (x0, x1, hh))
        # clean chest core: bezel + recessed emissive ring + dark centre with a lens
        P = fcent[core_sel]
        if len(P) > 3:
            c = Vector(P.mean(0))
            n = Vector(fnrm[core_sel].mean(0)).normalized()
            d = P - np.array(c)
            d = d - np.outer(d @ np.array(n), np.array(n))
            r = float(np.percentile(np.linalg.norm(d, axis=1), 95))
            mb = MB()
            annulus(mb, c + n * 0.05, n, r * 0.84, r * 1.14, 0.35, dark, seg=40)
            t1 = n.orthogonal().normalized()
            t2 = n.cross(t1)
            rt, rm = r * 0.68, r * 0.13                                  # torus band (major / minor radius)
            rings = []
            for i in range(48):
                a = i / 48 * 2 * math.pi
                radial = t1 * math.cos(a) + t2 * math.sin(a)
                rings.append([c + n * 0.02 + radial * (rt + rm * math.cos(b)) + n * (rm * math.sin(b))
                              for b in [j / 12 * 2 * math.pi for j in range(12)]])
            mb.loft(rings, sp['glow_name'], wrap=True)
            mb.cyl(c - n * 0.2, c + n * 0.04, r * 0.52, r * 0.52, dark, seg=40)
            mb.cyl(c + n * 0.02, c + n * 0.08, r * 0.18, r * 0.18, sp['glow_name'], seg=24)
            for k2 in range(8):   # bezel bolts
                a = k2 / 8 * 2 * math.pi
                t1 = n.orthogonal().normalized()
                t2 = n.cross(t1)
                pb = c + n * 0.24 + (t1 * math.cos(a) + t2 * math.sin(a)) * r * 0.99
                mb.cyl(pb, pb + n * 0.06, r * 0.05, r * 0.05, 'atlas_2' if 'atlas_2' in names_c.values() else dark,
                       seg=8)
            join_into('torso', mb.to_object('_core', pivot=piv['torso'], smooth_angle=40))
            print('  clean core ring r=%.2f at (%.2f,%.2f,%.2f)' % (r, *c))
    # ---- hierarchy
    for c, p in list(PARENT.items()) + list(EXTRA_PARENT.items()):
        if c in objs and p in objs:
            set_parent(objs[c], objs[p], piv[c], piv[p])
    e = bpy.data.objects.new('rifle_muzzle', None)
    link(e)
    set_parent(e, objs['rifle'], mz, piv['rifle'])
    # report
    for n_, o in objs.items():
        if o.type == 'MESH':
            print('  %-12s tris=%6d pivot=(%.2f,%.2f,%.2f)' % (n_, sum(len(p.vertices) - 2 for p in o.data.polygons),
                                                              *piv[n_]))
    lib.export_glb(os.path.join(OUT, name + '.glb'))
    print('CONVERTED', name, 'materials:', mat_list)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else list(SPECS)
    for n in argv:
        convert(n)
