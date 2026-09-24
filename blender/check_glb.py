#!/usr/bin/env python3
"""Pure-python GLB inspector: node tree, triangle counts, bounding boxes, materials, contract checks.
Usage: python3 blender/check_glb.py [assets/*.glb]
"""
import json, struct, sys, os, glob, math

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')

BUDGET = {'mothership': 350000, 'enemy_dreadnought': 250000, 'ion_frigate': 60000, 'assault_frigate': 60000,
          'enemy_frigate': 60000, 'interceptor': 12000, 'enemy_fighter': 12000, 'gundam': 60000,
          'enemy_ms': 60000, 'gravity_well': 80000, 'hangar': 60000, 'debris': 20000,
          'mother_bay': 180000, 'bay_props': 45000}
LENGTH = {'mothership': 600, 'ion_frigate': 60, 'assault_frigate': 45, 'interceptor': 8, 'enemy_frigate': 55,
          'enemy_dreadnought': 400, 'enemy_fighter': 9}
REQ_NODES = {
    'mothership': ['main_cannon', 'hangar_exit'], 'enemy_dreadnought': ['lance_emitter'],
    'gravity_well': ['ring', 'core', 'pylons'],
    'debris': ['rock0', 'rock1', 'rock2', 'rock3', 'hull0', 'hull1', 'hull2', 'hull3'],
    'gundam': ['ms_root', 'pelvis', 'leg_L_upper', 'leg_L_lower', 'foot_L', 'leg_R_upper', 'leg_R_lower', 'foot_R',
               'torso', 'head', 'backpack', 'arm_L_upper', 'arm_L_lower', 'hand_L', 'saber_hilt', 'arm_R_upper',
               'arm_R_lower', 'hand_R', 'rifle', 'rifle_muzzle'],  # shield optional
}
REQ_NODES['enemy_ms'] = REQ_NODES['gundam']
# v6 fighter variants (fighters_ours.py / fighters_enemy.py): 50-70k tris each, hard cap 80k, `engine` required
for _f, _L in (('interceptor', 8), ('interceptor_b', 10), ('interceptor_c', 12), ('enemy_fighter', 9),
               ('enemy_fighter_b', 11.5), ('enemy_fighter_c', 9.3)):
    BUDGET[_f] = 80000
    LENGTH[_f] = _L
REQ_NODES['bay_props'] = ['crate0', 'crate1', 'container', 'barrel', 'tank', 'panel0', 'panel1', 'rib', 'cable',
                          'toolcart', 'seat', 'person0', 'person1', 'person2', 'person3']
REQ_MATS = {'mothership': ['engine', 'window'], 'ion_frigate': ['engine', 'muzzle'], 'assault_frigate': ['engine'],
            'interceptor': ['engine'], 'enemy_frigate': ['engine'], 'enemy_dreadnought': ['engine'],
            'enemy_fighter': ['engine'], 'gundam': ['eye', 'engine'], 'enemy_ms': ['eye'],
            'gravity_well': ['violet'], 'hangar': ['guide', 'lamp'],
            'mother_bay': ['lamp', 'amber', 'blue_light', 'scorch', 'hazard']}
for _f in ('interceptor_b', 'interceptor_c', 'enemy_fighter_b', 'enemy_fighter_c'):
    REQ_MATS[_f] = ['engine']
PARENTS = {'pelvis': 'ms_root', 'leg_L_upper': 'pelvis', 'leg_L_lower': 'leg_L_upper', 'foot_L': 'leg_L_lower',
           'leg_R_upper': 'pelvis', 'leg_R_lower': 'leg_R_upper', 'foot_R': 'leg_R_lower', 'torso': 'ms_root',
           'head': 'torso', 'backpack': 'torso', 'arm_L_upper': 'torso', 'arm_L_lower': 'arm_L_upper',
           'hand_L': 'arm_L_lower', 'saber_hilt': 'hand_L', 'arm_R_upper': 'torso', 'arm_R_lower': 'arm_R_upper',
           'hand_R': 'arm_R_lower', 'rifle': 'hand_R', 'rifle_muzzle': 'rifle', 'shield': 'arm_L_lower'}


def load(path):
    data = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not a GLB'
    off = 12
    js, binc = None, None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf8'))
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
    return js, binc


def qmat(q):
    x, y, z, w = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]


def local_m(n):
    if 'matrix' in n:
        m = n['matrix']
        return [[m[0], m[4], m[8], m[12]], [m[1], m[5], m[9], m[13]], [m[2], m[6], m[10], m[14]], [0, 0, 0, 1]]
    R = qmat(n.get('rotation', [0, 0, 0, 1]))
    s = n.get('scale', [1, 1, 1])
    t = n.get('translation', [0, 0, 0])
    return [[R[i][0] * s[0], R[i][1] * s[1], R[i][2] * s[2], t[i]] for i in range(3)] + [[0, 0, 0, 1]]


def mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def xf(m, p):
    return [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3)]


def check(path):
    name = os.path.splitext(os.path.basename(path))[0]
    js, _ = load(path)
    nodes, meshes, accs = js.get('nodes', []), js.get('meshes', []), js['accessors']
    mats = [m.get('name', '?') for m in js.get('materials', [])]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i
    world = {}

    def wm(i):
        if i not in world:
            world[i] = mul(wm(parent[i]), local_m(nodes[i])) if i in parent else local_m(nodes[i])
        return world[i]

    tris = 0
    lo, hi = [1e18] * 3, [-1e18] * 3
    per_node = []
    for i, n in enumerate(nodes):
        if 'mesh' not in n:
            continue
        m = wm(i)
        nt = 0
        for p in meshes[n['mesh']]['primitives']:
            if 'indices' in p:
                nt += accs[p['indices']]['count'] // 3
            else:
                nt += accs[p['attributes']['POSITION']]['count'] // 3
            a = accs[p['attributes']['POSITION']]
            mn, mx = a['min'], a['max']
            for cx in (mn[0], mx[0]):
                for cy in (mn[1], mx[1]):
                    for cz in (mn[2], mx[2]):
                        w = xf(m, [cx, cy, cz])
                        lo = [min(lo[k], w[k]) for k in range(3)]
                        hi = [max(hi[k], w[k]) for k in range(3)]
        tris += nt
        per_node.append((n.get('name', '?'), nt))
    size = [hi[k] - lo[k] for k in range(3)]
    print('=' * 78)
    print('%s  tris=%d  bbox min=(%.1f,%.1f,%.1f) max=(%.1f,%.1f,%.1f) size=(%.1f,%.1f,%.1f)' % (
        name, tris, *lo, *hi, *size))
    print('  materials:', ', '.join(mats))
    em = []
    for m in js.get('materials', []):
        ef = m.get('emissiveFactor')
        if ef and max(ef) > 0:
            st = m.get('extensions', {}).get('KHR_materials_emissive_strength', {}).get('emissiveStrength', 1)
            em.append('%s(%.2f,%.2f,%.2f)x%.1f' % (m['name'], *ef, st))
    print('  emissive:', ', '.join(em))
    names = [n.get('name', '?') for n in nodes]
    if len(names) <= 40:
        print('  nodes:', ', '.join('%s%s' % (nm, '' if i not in parent else '<' + names[parent[i]])
                                    for i, nm in enumerate(names)))
    print('  mesh nodes:', ', '.join('%s:%d' % t for t in per_node[:30]))
    errs = []
    if tris > BUDGET.get(name, 1e9):
        errs.append('over budget %d > %d' % (tris, BUDGET[name]))
    for rn in REQ_NODES.get(name, []):
        if rn not in names:
            errs.append('missing node ' + rn)
    for rm in REQ_MATS.get(name, []):
        if rm not in mats:
            errs.append('missing material ' + rm)
    if name in LENGTH:
        L = LENGTH[name]
        if not (0.8 * L <= size[2] <= 1.2 * L):
            errs.append('length along Z %.1f vs ~%d' % (size[2], L))
        if size[2] < max(size[0], size[1]):
            errs.append('longest axis is not Z')
        for en in ('main_cannon', 'lance_emitter'):
            if en in names:
                p = xf(wm(names.index(en)), [0, 0, 0])
                print('  %s at (%.1f,%.1f,%.1f)' % (en, *p))
                if p[2] < hi[2] - 0.2 * L:
                    errs.append('%s not at +Z nose' % en)
        if 'hangar_exit' in names:
            i = names.index('hangar_exit')
            p = xf(wm(i), [0, 0, 0])
            fwd = [wm(i)[k][2] for k in range(3)]
            print('  hangar_exit at (%.1f,%.1f,%.1f) local+Z->world (%.2f,%.2f,%.2f)' % (*p, *fwd))
            if p[0] <= 0:
                errs.append('hangar_exit not on +X side')
        # engines at -Z: centroid of engine material verts is hard w/o binary; skip.
    if name in ('gundam', 'enemy_ms'):
        print('  height %.2f (feet y=%.2f)' % (size[1], lo[1]))
        if abs(lo[1]) > 0.3:
            errs.append('feet not at y=0 (%.2f)' % lo[1])
        if not (16 <= size[1] <= 20):
            errs.append('height %.1f not ~18' % size[1])
        for c, p in PARENTS.items():
            if c in names:
                ci = names.index(c)
                pn = names[parent[ci]] if ci in parent else None
                if pn != p:
                    errs.append('%s parent is %s, expected %s' % (c, pn, p))
        for k in ('ms_root', 'head', 'hand_L', 'hand_R', 'foot_L', 'rifle_muzzle'):
            if k in names:
                p = xf(wm(names.index(k)), [0, 0, 0])
                print('  pivot %-12s (%.2f,%.2f,%.2f)' % (k, *p))
        if 'arm_L_upper' in names and xf(wm(names.index('arm_L_upper')), [0, 0, 0])[0] <= 0:
            errs.append('left arm not on +X')
        if 'rifle_muzzle' in names:
            p = xf(wm(names.index('rifle_muzzle')), [0, 0, 0])
            if p[2] < -1:
                errs.append('rifle muzzle behind the body')
    if name == 'hangar':
        print('  expected z -60..30, x -12..12 (inner), y 0..22')
    if name == 'mother_bay':
        box = ((4, 60), (-30, 50), (-40, 120))
        for k in range(3):
            if lo[k] < box[k][0] - 0.05 or hi[k] > box[k][1] + 0.05:
                errs.append('outside bay box on axis %d (%.2f..%.2f)' % (k, lo[k], hi[k]))
    if name == 'bay_props':
        for nm, nt in per_node:
            if nt > 3000:
                errs.append('%s over 3k tris (%d)' % (nm, nt))
    print('  CHECK:', 'OK' if not errs else 'PROBLEMS: ' + '; '.join(errs))
    return tris, errs


def main():
    files = sys.argv[1:] or sorted(glob.glob(os.path.join(ASSETS, '*.glb')))
    bad = 0
    for f in files:
        _, e = check(f)
        bad += bool(e)
    print('\n%d files, %d with problems' % (len(files), bad))


if __name__ == '__main__':
    main()
