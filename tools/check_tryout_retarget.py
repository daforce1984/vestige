"""Standalone check of the 'tryout.*' motion clips (tools/extract_motion.py) against the source rig.

For every frame of every tryout clip: source = the glTF bone chain of assets/src/cand/tryout_mech.glb (world joint
transforms, the rigid meshes ride their bones); ours = the engine FK on the converted assets/enemy_ms.glb (node
pivots from the GLB hierarchy, parts unrotated at rest, pose quaternions + root displacement from js/motion_clips.js):
  W(ms_root) = T(piv_ms_root + root);  W(p) = W(parent) · T(piv_p − piv_parent) · R(q_p)
Compared (contract metres): hand / foot / head pivots and tips (fingertips, toe, head top), elbow and knee.
Also checks that every GLB pivot equals the source bone head (converter ↔ extractor agree).
Usage: uv run --with numpy python tools/check_tryout_retarget.py
"""
import json, os, struct, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import extract_motion as em
from extract_motion import qmul, qinv, qrot


def glb_pivots(path):
    b = open(path, 'rb').read()
    L = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + L])
    N = j['nodes']
    par = {c: i for i, n in enumerate(N) for c in n.get('children', [])}
    piv = {}
    for i, n in enumerate(N):
        assert n.get('rotation', [0, 0, 0, 1]) == [0, 0, 0, 1] or np.allclose(n['rotation'], [0, 0, 0, 1]), n['name']
        p, k = np.zeros(3), i
        while k is not None:
            p += np.array(N[k].get('translation', [0, 0, 0]))
            k = par.get(k)
        piv[n['name']] = p
    return piv


def clips():
    s = open(os.path.join(ROOT, 'js', 'motion_clips.js')).read()
    return json.loads(s[s.index('export default ') + 15:].rstrip().rstrip(';'))


def main():
    S = em.TRY_SCALE
    piv = glb_pivots(os.path.join(ROOT, 'assets', 'enemy_ms.glb'))
    W0, ni, src = em.rig_frames(em.TRY_SRC, em.TRY_CLIPS)
    o = W0[ni['PelvisBase']][0] - piv['ms_root'] / S          # source glTF origin of the contract frame
    C = lambda p: (np.asarray(p) - o) * S
    worst_piv = max(np.linalg.norm(C(W0[ni[em.TRY_PIVOT[p]]][0]) - piv[p]) for p in em.TRY_PIVOT)
    print('GLB pivots vs source bone heads: max |d| = %.4f m' % worst_piv)
    # probe points: (contract part, source bone that carries it, source rest point)
    head = lambda b: W0[ni[b]][0]
    probes = []
    for s in ('L', 'R'):
        probes += [('hand_' + s, 'Hands.' + s, head('Hands.' + s), 'wrist ' + s),
                   ('hand_' + s, 'Hands.' + s, head('Hands.' + s) + np.array([0, -1.6, 0.4]), 'knuckles ' + s),   # (fingers: rigid fist)
                   ('arm_%s_lower' % s, 'LowerArm.' + s, head('LowerArm.' + s), 'elbow ' + s),
                   ('foot_' + s, 'Feet.' + s, head('Feet.' + s), 'ankle ' + s),
                   ('foot_' + s, 'Feet.' + s, head('Feet.' + s) + np.array([0, -0.15, 1.7]), 'toe ' + s),
                   ('leg_%s_lower' % s, 'Shin.' + s, head('Shin.' + s), 'knee ' + s)]
    probes += [('head', 'Neck', head('Neck') + np.array([0, 2.3, 0.3]), 'head top')]
    CL = clips()
    PARENT = em.PARENT
    worst = 0.0
    for cn in em.TRY_CLIPS:
        c = CL['tryout.' + cn.replace(' ', '_')]
        frames, _ = src[cn]
        if len(frames) == 1: frames = frames * 2
        errs = {}
        for f, Wt in enumerate(frames):
            Wp = {'ms_root': (piv['ms_root'] + np.array(c['root'][f]), np.array([0, 0, 0, 1.0]))}
            for p in list(PARENT):
                if p not in c['q']: continue
                pp = PARENT[p] or 'ms_root'
                pt, pq = Wp[pp]
                Wp[p] = (pt + qrot(pq, piv[p] - piv[pp]), qmul(pq, np.array(c['q'][p][f])))
            for part, bone, x0, label in probes:
                b = ni[bone]
                xs = Wt[b][0] + qrot(Wt[b][1], qrot(qinv(W0[b][1]), x0 - W0[b][0]))       # source, skinning chain
                t, q = Wp[part]
                xf = t + qrot(q, C(x0) - piv[part])                                        # ours, engine FK
                errs[label] = max(errs.get(label, 0.0), float(np.linalg.norm(C(xs) - xf)))
        worst = max(worst, max(errs.values()))
        print('%-15s max err (m): ' % cn + '  '.join('%s %.3f' % (k, v) for k, v in errs.items()))
    print('WORST %.3f m (model height 18.5 m)' % worst)


if __name__ == '__main__':
    main()
