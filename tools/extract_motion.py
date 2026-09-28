"""Extract the source mechs' own animation clips (CC0, Ramon Linares — assets/src/*.glb) as engine poses.

For each clip, sampled at 24 fps, every contract part gets its pose rotation in the engine's convention: the part's
world rotation relative to rest (skinning delta D = W(t)·W(rest)⁻¹, model space) expressed in its contract parent's
frame, R = D_parent⁻¹ · D. Parts are unrotated at rest in the converted GLBs, so R is exactly the `pose` quaternion
the renderer / duelFK apply. The pelvis bone's translation (scaled into contract units) comes out as `root`.
Usage: uv run --with numpy python tools/extract_motion.py → js/motion_clips.js (no Blender)
"""
import json, struct, os, sys
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'src')
FPS = 24
# contract part -> source bone (blender/convert_mechs.py PIVOT_BONE), and the contract parent of each part
BONE = {'pelvis': 'pelvis', 'torso': 'chest', 'head': 'head', 'arm_L_upper': 'upper_arm.L', 'arm_L_lower': 'forearm.L',
        'hand_L': 'hand.L', 'arm_R_upper': 'upper_arm.R', 'arm_R_lower': 'forearm.R', 'hand_R': 'hand.R',
        'leg_L_upper': 'thigh.L', 'leg_L_lower': 'shin.L', 'foot_L': 'foot.L', 'leg_R_upper': 'thigh.R',
        'leg_R_lower': 'shin.R', 'foot_R': 'foot.R', 'rifle': 'rifle.R'}
PARENT = {'pelvis': None, 'torso': None, 'head': 'torso', 'arm_L_upper': 'torso', 'arm_L_lower': 'arm_L_upper',
          'hand_L': 'arm_L_lower', 'arm_R_upper': 'torso', 'arm_R_lower': 'arm_R_upper', 'hand_R': 'arm_R_lower',
          'leg_L_upper': 'pelvis', 'leg_L_lower': 'leg_L_upper', 'foot_L': 'leg_L_lower', 'leg_R_upper': 'pelvis',
          'leg_R_lower': 'leg_R_upper', 'foot_R': 'leg_R_lower', 'rifle': 'hand_R'}
# which clips to take from which source (model height in the film, for the root translation scale)
WANT = {
    'vanguard-07.glb': ['RifleBurst', 'ShieldGuard', 'BoostJump', 'Backflip', 'KneelFire', 'Sentinel'],
    'atlas-09.glb': ['Backflip', 'HitChest', 'HitHead', 'Knockback', 'KneelFire', 'Sentinel', 'Collapse'],
    'aether-02.glb': ['DodgeRoll', 'Backflip', 'Knockback', 'HitChest'],
    'seraph-03.glb': ['Flight'],
}
PELVIS_H = {'vanguard-07.glb': 8.942, 'atlas-09.glb': 9.1, 'aether-02.glb': 9.1, 'seraph-03.glb': 9.1}   # contract pelvis heights


def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return np.array([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz])


def qinv(q): return np.array([-q[0], -q[1], -q[2], q[3]])


def qrot(q, v): return qmul(qmul(q, np.array([*v, 0.0])), qinv(q))[:3]


def slerp(a, b, t):
    d = np.dot(a, b)
    if d < 0: b, d = -b, -d
    if d > 0.9995: r = a + (b - a) * t; return r / np.linalg.norm(r)
    th = np.arccos(d); return (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / np.sin(th)


def load(path):
    b = open(path, 'rb').read()
    L = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + L])
    off = 20 + L
    bl = struct.unpack('<I', b[off:off + 4])[0]
    bin_ = b[off + 8:off + 8 + bl]
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
        st = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        assert a['componentType'] == 5126
        return np.frombuffer(bin_, np.float32, a['count'] * n, st).reshape(a['count'], n) if n > 1 else np.frombuffer(bin_, np.float32, a['count'], st)
    return j, acc


def extract(fname, clips):
    j, acc = load(os.path.join(SRC, fname))
    N = j['nodes']
    par = {c: i for i, n in enumerate(N) for c in n.get('children', [])}
    name_i = {n.get('name'): i for i, n in enumerate(N)}
    rest = [(np.array(n.get('translation', [0, 0, 0]), float), np.array(n.get('rotation', [0, 0, 0, 1]), float)) for n in N]

    def world(local):   # local: list of (t, q) per node -> world (t, q) per node
        out = [None] * len(N)
        def w(i):
            if out[i] is not None: return out[i]
            t, q = local[i]
            if i in par:
                pt, pq = w(par[i]); out[i] = (pt + qrot(pq, t), qmul(pq, q))
            else: out[i] = (t, q)
            return out[i]
        for i in range(len(N)): w(i)
        return out
    W0 = world(rest)
    S = PELVIS_H[fname] / W0[name_i['pelvis']][0][1]
    res = {}
    for an in j['animations']:
        if an['name'] not in clips: continue
        ch = []
        tmax = 0
        for c in an['channels']:
            sm = an['samplers'][c['sampler']]
            ti, vo = acc(sm['input']), acc(sm['output'])
            if sm.get('interpolation') == 'CUBICSPLINE': vo = vo.reshape(len(ti), 3, -1)[:, 1]
            ch.append((c['target']['node'], c['target']['path'], ti, vo, sm.get('interpolation', 'LINEAR')))
            tmax = max(tmax, float(ti[-1]))
        nf = int(round(tmax * FPS)) + 1
        frames = {p: [] for p in BONE}
        rootT = []
        for f in range(nf):
            t = f / FPS
            local = [list(r) for r in rest]
            for node, path, ti, vo, interp in ch:
                if path not in ('translation', 'rotation'): continue
                k = int(np.searchsorted(ti, t, 'right') - 1)
                if k < 0: v = vo[0]
                elif k >= len(ti) - 1: v = vo[-1]
                else:
                    u = 0 if interp == 'STEP' else (t - ti[k]) / max(1e-9, ti[k + 1] - ti[k])
                    v = slerp(np.array(vo[k], float), np.array(vo[k + 1], float), u) if path == 'rotation' else vo[k] + (vo[k + 1] - vo[k]) * u
                local[node][0 if path == 'translation' else 1] = np.array(v, float)
            Wt = world([tuple(x) for x in local])
            D = {}
            for p, bn in BONE.items():
                if bn not in name_i: continue
                i = name_i[bn]
                D[p] = qmul(Wt[i][1], qinv(W0[i][1]))
            for p in BONE:
                if p not in D: continue
                pp = PARENT[p]
                R = qmul(qinv(D[pp]), D[p]) if pp else D[p]
                if R[3] < 0: R = -R
                frames[p].append([round(float(x), 5) for x in R])
            pi = name_i['pelvis']
            # pelvis pivot displacement in contract units (the skinning delta moves the pivot by W(t)·p0 − p0)
            d = (Wt[pi][0] - W0[pi][0]) * S
            rootT.append([round(float(x), 4) for x in d])
        res[an['name']] = {'fps': FPS, 'n': nf, 'dur': round(tmax, 4), 'q': {p: v for p, v in frames.items() if v}, 'root': rootT}
        print('  %-14s %-12s %.2fs %d frames' % (fname, an['name'], tmax, nf))
    return res


if __name__ == '__main__':
    out = {}
    for f, cl in WANT.items():
        tag = f.split('-')[0]
        for k, v in extract(f, cl).items(): out[tag + '.' + k] = v
    js = os.path.join(ROOT, 'js', 'motion_clips.js')   # the same data as an ES module (duel.js solves at import time)
    open(js, 'w').write('// generated by tools/extract_motion.py — the source mechs\' own animation clips (CC0), as engine pose quaternions\n'
                        'export default ' + json.dumps(out, separators=(',', ':')) + ';\n')
    print('wrote', js)
