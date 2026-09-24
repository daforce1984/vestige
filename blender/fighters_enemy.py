"""Enemy fighter variants (crimson / charcoal paint, aged-brass trim, faceted chiselled hulls with overlapping
armour scales, polished steel blades, glowing orange vent slits, diamond thruster housings).
See fighterkit.py for the toolkit and material palette.  Blender space: nose -Y, up +Z, +X = port."""
import math
from mathutils import Vector, Matrix
from lib import MB, rng, lerp, D2R
from shipkit import digits
from fighterkit import (V, W, mats_enemy, prof_super, prof_chamfer, SHull, plates, Mat, HM, HD, p_dir, bx, wbox, cy,
                        hx, tube, strip, rail_on, hoop_on, nozzle, hex_housing, vent, rcs, blister, hatch, gear_bay,
                        gun, missile, antenna, navlamp, conduit, a_frame, fin_bank, tri_decal, stencil_bars, finish,
                        intake, rocket_pod, ring_pts, surf_x, HX)

K = {n: n for n in ('paint_a', 'paint_b', 'trim', 'metal', 'gunmetal', 'carbon', 'exhaust', 'glass', 'heat',
                    'lamp_red', 'lamp_green', 'lamp_white', 'lamp', 'engine', 'nozzle_glow')}
ANGULAR = [(1, -0.55), (1, 0.35), (0.7, 1), (-0.7, 1), (-1, 0.35), (-1, -0.55), (-0.6, -1), (0.6, -1)]
HEX = [(1, 0), (0.55, 1), (-0.55, 1), (-1, 0), (-0.55, -1), (0.55, -1)]
DIAMOND = [(1, 0), (0.45, 0.62), (0, 1), (-0.45, 0.62), (-1, 0), (-0.45, -0.62), (0, -1), (0.45, -0.62)]


def canopy(mb, st, frames, rails=(0.0,), prof=None):
    """Faceted canopy: red glass hex shell, gunmetal hoops + spine rail + sills."""
    prof = prof or prof_chamfer(HEX, 0.15)     # 12 pts, top edge = 3..4 (centre 3.5)
    C = SHull(st, prof, step=0.08)
    C.build(mb, K['glass'])
    s0, s1 = C.st[0][0] + 0.03, C.st[-1][0] - 0.03
    for dp in rails:
        rail_on(mb, C, s0, s1, 3.5 + dp, 0.0, 0.045, 0.03, K['gunmetal'])
    for s in frames:
        hoop_on(mb, C, s, 1.0, 6.0, 0.0, 0.055, 0.035, K['gunmetal'], sub=2)
    for pp in (1.0, 6.0):
        rail_on(mb, C, C.st[0][0], C.st[-1][0], pp, 0.0, 0.07, 0.045, K['trim'])
    return C


def scales(mb, H, s_cuts, p_cuts, matf, thick=0.05, lap=0.12, ch=0.03, gp=0.06):
    """Overlapping armour scales: every row starts `lap` behind the previous row's front edge and sits one
    layer higher, so the front edge of each row shades the next (reads as stacked scales)."""
    for i, (sa, sb) in enumerate(zip(s_cuts, s_cuts[1:])):
        o = (i % 2) * thick * 0.8
        for j, (pa, pb) in enumerate(zip(p_cuts, p_cuts[1:])):
            m = matf(i, j)
            if m is None:
                continue
            plates(mb, H, [sa - (lap if i % 2 else 0.0), sb - 0.03], [pa, pb], lambda a, b: m, thick=thick, gs=0.0,
                   gp=gp, ch=ch, off=o)


def blade(mb, cs, chords, thick, K, body='paint_a', edge='metal', fwd=(0, -1, 0), up=(0, 0, 1), edge_w=0.1,
          panels=None, trim_root=True, plane=None, bias=0.5):
    """Lofted blade along centre points cs; chord along fwd (projected), thickness along the blade normal.
    Polished steel leading-edge strip; optional raised panels (list of (i0, i1, mat)) on the upper face.
    plane: if given, the chord lies in the plane with this normal (perpendicular to the span, sign from fwd) -
    needed for curved scythe blades whose span turns parallel to fwd."""
    cs = [V(c) for c in cs]
    fwd, up = V(fwd), V(up)
    n = len(cs)
    rings, edges, frames = [], [], []
    for i, c in enumerate(cs):
        tg = (cs[min(i + 1, n - 1)] - cs[max(i - 1, 0)]).normalized()
        if plane is not None:
            f = V(plane).cross(tg).normalized()
            if (frames and f.dot(frames[-1][1]) < 0) or (not frames and f.dot(fwd) < 0):
                f = -f                         # keep the chord direction continuous along the span
        else:
            f = (fwd - tg * fwd.dot(tg)).normalized()
        nr = f.cross(tg).normalized()
        if nr.dot(up) < 0:
            nr = -nr
        ch, t = chords[i], thick[i]
        c = c + f * ch * (bias - 0.5)          # bias > 0.5 moves the section toward the leading edge
        LE, TE = c + f * ch * 0.5, c - f * ch * 0.5
        rings.append([LE, c + f * ch * 0.18 + nr * t / 2, c - f * ch * 0.32 + nr * t / 2, TE,
                      c - f * ch * 0.32 - nr * t / 2, c + f * ch * 0.18 - nr * t / 2])
        e = edge_w * (0.4 + 0.6 * ch / max(chords))
        edges.append([LE - f * 0.02 + nr * t * 0.22, LE + f * e, LE - f * 0.02 - nr * t * 0.22])
        frames.append((c, f, nr, ch, t))
    mb.loft(rings, K[body])
    mb.loft(edges, K[edge])
    if trim_root:
        c, f, nr, ch, t = frames[0]
        cn = cs[1] - cs[0]
        a = c + cn.normalized() * 0.12
        tg = cn.normalized()
        mb.hexa([a - f * ch * 0.5 - nr * t * 0.6, a + f * ch * 0.5 - nr * t * 0.6,
                 a + f * ch * 0.5 + tg * 0.08 - nr * t * 0.6, a - f * ch * 0.5 + tg * 0.08 - nr * t * 0.6,
                 a - f * ch * 0.5 + nr * t * 0.6, a + f * ch * 0.5 + nr * t * 0.6,
                 a + f * ch * 0.5 + tg * 0.08 + nr * t * 0.6, a - f * ch * 0.5 + tg * 0.08 + nr * t * 0.6],
                K['trim'])
    for (i0, i1, m) in (panels or []):
        for side in (1, -1):
            pts = []
            for i in (i0, i1):
                c, f, nr, ch, t = frames[i]
                pts.append((c + f * ch * 0.1 + nr * side * t / 2, c - f * ch * 0.26 + nr * side * t / 2, nr * side))
            (a0, b0, n0), (a1, b1, n1) = pts
            h = 0.022
            a0i, b0i = a0.lerp(a1, 0.08), b0.lerp(b1, 0.08)
            a1i, b1i = a1.lerp(a0, 0.08), b1.lerp(b0, 0.08)
            mb.hexa([a0i, b0i, b1i, a1i, a0i + n0 * h, b0i + n0 * h, b1i + n1 * h, a1i + n1 * h], K[m], bevel=0.006)
    return frames


def slit_vents(mb, M, n, w, l, pitch, K):
    """Row of glowing orange vent slits in a charcoal frame (enemy heat-dump language)."""
    L = n * pitch
    bx(mb, M, (0, 0, 0.02), (w + 0.08, L + 0.06, 0.04), K['gunmetal'], bev=0.01)
    for k in range(n):
        y = -L / 2 + pitch * (k + 0.5)
        bx(mb, M, (0, y, 0.035), (w, l, 0.02), K['heat'])
        bx(mb, M, (0, y + l / 2 + 0.012, 0.046), (w + 0.02, 0.02, 0.02), K['metal'])


def diamond_thruster(mb, c, d, r, L, K):
    c, d = V(c), V(d).normalized()
    hex_housing(mb, c, d, r, L, K, seg=4)
    nozzle(mb, c + d * L * 0.38, d, r * 0.58, K, petals=8, seg=16, ribs=1)


def turret_enemy(mb, pos, K, face=(0, -1, 0), r=0.42, blen=1.5):
    pos = V(pos)
    cy(mb, W, pos + V((0, 0, -0.05)), pos + V((0, 0, 0.1)), r * 1.1, r * 1.05, K['gunmetal'], seg=8)
    tube(mb, pos + V((0, 0, 0.1)), (0, 0, 1), r * 0.85, r * 1.0, 0.05, K['trim'], seg=8)
    M = Mat(pos + V((0, 0, 0.12)), (0, 0, 1), face)
    hx(mb, M, [(-r * 0.9, -r * 1.0, 0), (r * 0.9, -r * 1.0, 0), (r * 0.6, r * 1.2, 0), (-r * 0.6, r * 1.2, 0),
               (-r * 0.6, -r * 0.7, r * 0.6), (r * 0.6, -r * 0.7, r * 0.6), (r * 0.3, r * 0.8, r * 0.5),
               (-r * 0.3, r * 0.8, r * 0.5)], K['paint_a'], bev=0.025)
    blister(mb, M @ Matrix.Translation((0, -r * 0.3, r * 0.6)), 0.07, K)
    for sx in (-1, 1):
        gun(mb, M @ V((sx * r * 0.38, r * 1.1, r * 0.28)), M.to_3x3() @ V((0, 1, 0)), blen, 0.04, K)


# =============================================================================== A: evolved blade-pod fighter
def enemy_fighter_a():
    mats_enemy()
    R = rng(611)
    mb = MB()
    SPN = prof_chamfer(ANGULAR, 0.15)      # 16 pts
    SP = SHull([(-3.4, 0.8, 0.8, 0.15), (-2.8, 1.0, 1.0, 0.2), (1.6, 1.0, 1.1, 0.25), (3.1, 0.75, 0.85, 0.2),
                (3.8, 0.35, 0.4, 0.1)], SPN, step=0.1)
    SP.build(mb, K['gunmetal'])
    pc = [0.5 + 2 * k for k in range(9)]
    pc2 = [0.5 + k for k in range(17)]
    scales(mb, SP, [-3.38, -2.8, -2.2, -1.6, -1.0, -0.4, 0.2, 0.8, 1.4, 1.9, 2.5, 3.1, 3.78], pc,
           lambda i, j: None if (j == 2 and i >= 9) or (j == 2 and 3 <= i <= 5) else
           (K['paint_b'] if j in (2, 5, 6, 7) else K['paint_a']), thick=0.045, lap=0.1, gp=0.07)
    canopy(mb, [(1.4, 0.45, 0.3, 0.86), (1.9, 0.7, 0.42, 0.92), (2.8, 0.6, 0.36, 0.82), (3.3, 0.24, 0.14, 0.66)],
           frames=(1.85, 2.2, 2.55, 2.9))
    # dorsal heat-sink with glowing slits between the canopy and the knife fin
    slit_vents(mb, Mat((0, 0.6, 0.8)), 8, 0.5, 0.1, 0.22, K)
    # dorsal knife fin (paint with steel edge)
    blade(mb, [(0, 2.6, 0.82), (0, 2.8, 1.15), (0, 3.05, 1.5)], [1.9, 1.3, 0.5], [0.08, 0.06, 0.035], K,
          fwd=(0, -1, 0.35), up=(1, 0, 0), edge_w=0.06, trim_root=False)
    antenna(mb, (0.18, 3.0, 0.72), (0.2, 0.3, 1), 0.6, K, tip='lamp')
    navlamp(mb, (0, 3.42, 0.35), (0, 1, 0.2), K, 'lamp_white', 0.04)
    # chin: twin cannon in an angular fairing + sensor blister
    hx(mb, W, [(-0.24, -3.0, -0.62), (0.24, -3.0, -0.62), (0.24, -1.9, -0.6), (-0.24, -1.9, -0.6),
               (-0.3, -3.0, -0.3), (0.3, -3.0, -0.3), (0.3, -1.9, -0.25), (-0.3, -1.9, -0.25)], K['paint_b'], bev=0.03)
    gun(mb, (0, -3.02, -0.46), (0, -1, 0), 1.35, 0.042, K, barrels=2, spread=0.2)
    blister(mb, Mat((0, -2.2, -0.62), (0, 0, -1)), 0.09, K)
    wbox(mb, (0, -0.8, -0.45), (1.0, 2.4, 0.28), K['gunmetal'], bev=0.04, seg=2)
    gear_bay(mb, Mat((0, -0.8, -0.595), (0, 0, -1)), 0.6, 1.2, K, 'paint_b')
    # ---------------- angular pods
    PP = prof_chamfer(ANGULAR, 0.15)
    for sx in (1, -1):
        cx = sx * 1.55
        P = SHull([(-3.5, 1.1, 1.1, 0.0, cx), (-3.1, 1.5, 1.35, 0.0, cx), (1.2, 1.5, 1.35, 0.05, cx),
                   (2.6, 1.0, 0.9, 0.0, cx + sx * 0.1), (3.3, 0.2, 0.25, -0.1, cx + sx * 0.2)], PP, step=0.1)
        P.build(mb, K['gunmetal'])
        top = p_dir(P, 0.0, (0, 1))
        ob_j = 0 if sx > 0 else 4

        def pmat(i, j, sx=sx):
            if j == 2 and i == 0:
                return None                       # vent bay
            if j == 6 and i in (3, 4):
                return None                       # gear bay
            if j in (5, 6, 7):
                return K['paint_b']
            if i in (2, 5) and j in (1, 2, 3):
                return K['paint_b']               # charcoal bands
            return K['paint_a']
        scut = [-3.48, -2.6, -1.7, -0.8, 0.1, 1.0, 1.8, 2.6, 3.28]
        sfine = [-3.48, -2.9, -2.35, -1.8, -1.25, -0.7, -0.15, 0.4, 0.95, 1.5, 2.05, 2.6, 3.28]
        scales(mb, P, sfine, pc, lambda i, j: pmat(min(7, int((sfine[i] + 3.49) / 0.85)), j), thick=0.05, lap=0.12,
               gp=0.07)
        for i in (1, 3, 4, 6):            # raised armour inserts on the upper flank
            for j in (0, 1, 3, 4):
                if R.random() < 0.6:
                    sa, sb = scut[i], scut[i + 1]
                    plates(mb, P, [sa + 0.2, sb - 0.25], [pc[j] + 0.35, pc[j + 1] - 0.35],
                           lambda a, b: K['paint_a'], thick=0.03, off=0.05 + (i % 2) * 0.04, ch=0.02)
        # brass edge trims along the upper chamfers
        for pp in (3.0, 8.0):
            rail_on(mb, P, -3.0, 2.5, pp, 0.09, 0.05, 0.02, K['trim'])
        # glowing slit vents in the top-rear bay, rocket pod and missile under the pod
        slit_vents(mb, HD(P, -3.0, (0, 1), 0.0), 3, 0.62, 0.12, 0.26, K)
        vent(mb, HD(P, -1.2, (sx, 0.25), 0.1), 0.3, 0.6, 7, K, glow='heat')
        gear_bay(mb, HD(P, 0.55, (0, -1), 0.0), 0.62, 1.4, K, 'paint_b')
        pos, n = P.pt(0.3, p_dir(P, 0.3, (sx, -0.2)), 0.1)
        wbox(mb, pos + n * 0.08, (0.1, 1.2, 0.12), K['gunmetal'], bev=0.02)
        rocket_pod(mb, pos + n * 0.3 + V((0, 0.9, 0)), (0, -1, 0), 1.9, 0.2, K)
        # forward blade spike on the pod nose (steel, with brass collar)
        c = V((cx + sx * 0.2, -3.3, -0.05))
        blade(mb, [c + V((0, 0.5, 0)), c, c + V((sx * 0.08, -0.7, 0.02)), c + V((sx * 0.12, -1.35, 0.03))],
              [0.5, 0.42, 0.28, 0.06], [0.1, 0.09, 0.06, 0.02], K, body='metal', edge='metal', fwd=(sx, 0, 0),
              up=(0, 0, 1), edge_w=0.05)
        tube(mb, c + V((0, 0.35, 0)), (0, 1, 0), 0.08, 0.2, 0.08, K['trim'], seg=8)
        # RCS, blister, nav lamp, intake, antenna, markings
        rcs(mb, HD(P, 2.1, (sx, 0.6), 0.09), 0.2, K)
        rcs(mb, HD(P, 2.1, (sx, -0.6), 0.09), 0.2, K)
        rcs(mb, HD(P, -3.0, (sx, 0.6), 0.09), 0.2, K)
        rcs(mb, HD(P, -3.0, (sx, -0.6), 0.09), 0.2, K)
        blister(mb, HD(P, 2.2, (-sx * 0.3, 1), 0.09), 0.09, K)
        pos, n = P.pt(1.5, p_dir(P, 1.5, (sx, 0)), 0.09)
        navlamp(mb, pos, n, K, 'lamp_red' if sx > 0 else 'lamp_green', 0.055)
        intake(mb, HD(P, 1.6, (-sx, -0.5), 0.09), 0.3, 0.18, 0.7, K, shell='paint_b')
        tri_decal(mb, HD(P, 1.9, (sx, 0.3), 0.1), 0.08, K['trim'])
        stencil_bars(mb, HD(P, -0.35, (sx, 0.1), 0.1), 3, 0.2, 0.05, 0.05, K['trim'])
        # 3 diamond thrusters under each pod
        wbox(mb, (cx, 1.85, -0.6), (1.35, 1.45, 0.2), K['gunmetal'], bev=0.04, seg=2)
        d = V((0, 1, -0.28)).normalized()
        for k, dx in enumerate((-0.45, 0.0, 0.45)):
            diamond_thruster(mb, V((cx + dx, 1.95 + (0.15 if k == 1 else 0), -0.95)), d, 0.3, 1.5, K)
            wbox(mb, (cx + dx, 1.7, -0.74), (0.12, 0.6, 0.16), K['gunmetal'], bev=0.02)
        # top-rear exhaust
        de = V((0, 1, 0.25)).normalized()
        cy(mb, W, (cx, 2.55, 0.55), (cx, 3.3, 0.6), 0.2, 0.18, K['gunmetal'], seg=8)
        nozzle(mb, V((cx, 3.3, 0.6)), de, 0.14, K, petals=8, seg=16, ribs=1)
        # struts pod -> spine (charcoal, brass knuckles) and machinery
        for y in (-1.8, 1.2):
            for z in (0.25, -0.2):
                mb.cyl(V((sx * 0.48, y, z)), V((sx * 0.9, y + 0.3, z + 0.2)), 0.05, 0.05, K['gunmetal'], seg=8)
                mb.sphere(V((sx * 0.9, y + 0.3, z + 0.2)), 0.075, K['trim'], seg=8, rings=4)
        conduit(mb, (sx * 0.64, -2.6, 0.05), (sx * 0.64, 2.2, 0.05), 0.065, K, clamps=6)
        conduit(mb, (sx * 0.7, -2.4, -0.26), (sx * 0.7, 1.8, -0.26), 0.045, K, clamps=5, mat='gunmetal')
        for y in (-1.2, 0.4):
            mb.cyl(V((sx * 0.55, y, -0.35)), V((sx * 0.85, y + 0.5, -0.1)), 0.06, 0.06, K['metal'], seg=10)
            mb.cyl(V((sx * 0.85, y + 0.5, -0.1)), V((sx * 1.0, y + 0.7, 0.0)), 0.085, 0.085, K['gunmetal'], seg=10)
    return finish(mb, 'enemy_fighter', scale=1.1)


# =============================================================================== B: heavy bomber (flying wing)
def enemy_fighter_b():
    mats_enemy()
    R = rng(612)
    mb = MB()
    WING = prof_chamfer([(1, 0), (0.55, 0.3), (0.2, 1), (-0.2, 1), (-0.55, 0.3), (-1, 0), (-0.55, -0.26),
                         (-0.2, -0.75), (0.2, -0.75), (0.55, -0.26)], 0.12)      # 20 pts
    Wg = SHull([(-4.3, 9.0, 1.3, 0.0), (-3.4, 9.2, 1.45, 0.0), (-1.0, 7.4, 1.5, 0.02), (1.8, 4.4, 1.35, 0.05),
                (3.8, 2.2, 1.05, 0.02), (5.0, 0.8, 0.55, 0.0), (5.5, 0.2, 0.2, 0.0)], WING, step=0.1)
    Wg.build(mb, K['gunmetal'])
    sc = [-4.28, -3.7, -3.1, -2.5, -1.9, -1.3, -0.7, -0.1, 0.5, 1.1, 1.7, 2.3, 2.9, 3.5, 4.1, 4.7, 5.45]
    pc = [0.5 + 2 * k for k in range(11)]      # sectors: 0 outer upper (+x), 1 upper mid, 2 top, 3.., 5 -x edge..
    pc2 = [0.5 + k for k in range(21)]

    def wmat(sm, j):
        if j == 2 and sm < -2.6:
            return None                          # dorsal vent bay (under the keel)
        if j in (6, 7, 8) and -2.2 < sm < 1.3:
            return None                          # bomb bays
        if j in (5, 6, 9):
            return K['paint_b']
        if j in (0, 4) and int((sm + 4.3) / 0.9) % 3 == 1:
            return K['paint_b']
        return K['paint_a']
    scales(mb, Wg, sc, pc2, lambda i, j: wmat((sc[i] + sc[i + 1]) / 2, j // 2), thick=0.05, lap=0.14, gp=0.08)
    # raised keel with cockpit
    KL = SHull([(-4.0, 0.6, 0.4, 0.72), (-3.6, 1.3, 0.75, 0.8), (2.2, 1.3, 0.7, 0.8), (4.2, 0.8, 0.45, 0.6),
                (4.9, 0.3, 0.2, 0.45)], prof_chamfer(HEX, 0.15), step=0.1)
    KL.build(mb, K['gunmetal'])
    plates(mb, KL, [-3.98, -3.0, -2.0, -1.0, 0.0, 1.0, 2.0, 2.6, 4.1, 4.88], [0.5, 2.5, 4.5, 6.5],
           lambda i, j: None if (i == 7 and j == 1) or (i in (1, 2) and j == 1) else
           (K['paint_b'] if j != 1 or i % 2 else K['paint_a']), thick=0.04, gs=0.05, gp=0.06, ch=0.03)
    canopy(mb, [(2.7, 0.5, 0.26, 1.1), (3.0, 0.9, 0.42, 1.12), (3.9, 0.74, 0.36, 1.0), (4.45, 0.3, 0.14, 0.82)],
           frames=(3.05, 3.35, 3.65, 3.95, 4.2), rails=(-0.8, 0.8))
    # tail turret (faces aft) and dorsal slit vents
    turret_enemy(mb, (0, 3.3, 1.2), K, face=(0, 1, 0))
    for sx in (1, -1):
        slit_vents(mb, HX(Wg, -3.3, sx * 1.9), 5, 0.7, 0.1, 0.2, K)
    for k in range(3):
        slit_vents(mb, Mat((0, -1.4 + k * 0.9, 1.19)), 3, 0.7, 0.08, 0.2, K)
    antenna(mb, (0.3, 2.0, 1.15), (0.1, 0.4, 1), 0.8, K, tip='lamp')
    antenna(mb, (-0.3, 2.2, 1.15), (-0.1, 0.4, 1), 0.5, K, tip=None)
    # nose: twin cannons and sensor cluster
    for sx in (1, -1):
        gun(mb, (sx * 0.34, -5.0, -0.12), (0, -1, 0), 1.2, 0.045, K)
        blister(mb, HD(Wg, 4.6, (sx * 0.4, -1), 0.05), 0.08, K)
    blister(mb, HD(Wg, 4.2, (0, -1), 0.0), 0.14, K)
    gear_bay(mb, HD(Wg, 3.2, (0, -1), 0.0), 0.7, 1.0, K, 'paint_b')
    # ---- bomb bays: open doors, racks, six bombs each side
    for sx in (1, -1):
        for k in range(2):
            x = sx * (0.95 + k * 0.8)
            zb = min(surf_x(Wg, sv, x, False)[0].z for sv in (-1.8, -0.5, 0.8))
            wbox(mb, (x, 0.2, zb + 0.02), (0.18, 4.4, 0.1), K['gunmetal'], bev=0.02)
            for m in range(3):
                y = -1.4 + m * 1.3
                wbox(mb, (x, y + 0.6, zb - 0.08), (0.08, 0.18, 0.14), K['metal'], bev=0.01)
                missile(mb, (x, y + 1.25, zb - 0.3), (0, -1, 0), 1.3, 0.16, K, body='paint_b', nose='paint_a',
                        band='trim', seg=14)
        # bay doors hinged open (angled plates) along the bay edges
        for xe, ang in ((sx * 0.5, -1), (sx * 2.2, 1)):
            zb = min(surf_x(Wg, sv, xe, False)[0].z for sv in (-1.8, -0.5, 0.8))
            for m in range(3):
                y = -1.4 + m * 1.3 + 0.6
                M = Mat((xe, y, zb - 0.02), (0, 0, 1), (0, -1, 0))
                bx(mb, M, (0, 0, 0), (0.05, 1.2, 0.02), K['metal'], bev=0.008)
                mb.hexa([V(p) for p in ((xe, y - 0.58, zb - 0.03), (xe, y + 0.58, zb - 0.03),
                                        (xe + sx * ang * 0.25, y + 0.58, zb - 0.55),
                                        (xe + sx * ang * 0.25, y - 0.58, zb - 0.55),
                                        (xe + 0.03, y - 0.58, zb - 0.03), (xe + 0.03, y + 0.58, zb - 0.03),
                                        (xe + 0.03 + sx * ang * 0.25, y + 0.58, zb - 0.55),
                                        (xe + 0.03 + sx * ang * 0.25, y - 0.58, zb - 0.55))], K['paint_b'],
                        bevel=0.008)
    # ---- four engines in the trailing edge
    for x, r in ((1.15, 0.36), (-1.15, 0.36), (2.9, 0.3), (-2.9, 0.3)):
        zc = 0.05
        c = V((x, 4.35, zc))
        hex_housing(mb, c, (0, 1, 0), r * 1.35, 0.7, K, seg=8)
        tube(mb, c + V((0, 0.2, 0)), (0, 1, 0), r * 1.3, r * 1.42, 0.08, K['trim'], seg=8)
        nozzle(mb, c + V((0, 0.3, 0)), (0, 1, 0), r, K, petals=12)
        for sg in (1, -1):
            wbox(mb, (x + sg * r * 1.35, 4.0, zc), (0.06, 0.6, r * 1.3), K['gunmetal'], bev=0.015)
    for sx in (1, -1):
        slit_vents(mb, Mat((sx * 2.05, 4.31, 0.05), (0, 1, 0), (0, 0, 1)), 2, 0.5, 0.08, 0.18, K)
        # ---- twin tail blades canted outward
        b0 = surf_x(Wg, -3.6, sx * 2.0)[0] - V((0, 0, 0.03))
        blade(mb, [b0, b0 + V((sx * 0.18, 0.35, 0.6)), b0 + V((sx * 0.38, 0.8, 1.2)), b0 + V((sx * 0.5, 1.2, 1.65))],
              [2.2, 1.6, 1.0, 0.4], [0.14, 0.11, 0.07, 0.03], K, fwd=(0, -1, 0.2), up=(sx, 0, 0), edge_w=0.09,
              panels=[(0, 1, 'paint_b'), (1, 2, 'paint_a')])
        navlamp(mb, b0 + V((sx * 0.5, 1.2, 1.65)) + V((0, 0.2, 0.02)), (0, 1, 0.3), K, 'lamp_white', 0.035)
        # ---- serrated steel leading edge along the wing edge
        pts, ns = [], []
        for k in range(18):
            s = lerp(-3.3, 4.9, k / 17)
            pp = p_dir(Wg, s, (sx, 0))
            pos, n = Wg.pt(s, pp, 0.0)
            pts.append(pos)
            ns.append(V((0, 0, 1)))
        for k in range(len(pts) - 1):
            a, b = pts[k], pts[k + 1]
            out = V((sx, 0, 0))
            hx(mb, W, [a - V((0, 0, 0.03)), b - V((0, 0, 0.03)), b - V((0, 0, 0.03)) + out * 0.02,
                       a + out * 0.22 - V((0, 0, 0.012)),
                       a + V((0, 0, 0.03)), b + V((0, 0, 0.03)), b + V((0, 0, 0.03)) + out * 0.02,
                       a + out * 0.22 + V((0, 0, 0.012))], K['metal'])
        # wingtip: nav lamp, RCS pair, blister, rocket pod under the outer wing
        tip = Wg.pt(-3.2, p_dir(Wg, -3.2, (sx, 0)), 0.0)[0]
        navlamp(mb, tip + V((sx * 0.25, 0, 0.03)), (sx, 0, 0), K, 'lamp_red' if sx > 0 else 'lamp_green', 0.06)
        rcs(mb, HD(Wg, -2.5, (0.25 * sx, 1), 0.05), 0.2, K)
        rcs(mb, HD(Wg, -2.5, (0.25 * sx, -1), 0.05), 0.2, K)
        pos = surf_x(Wg, -1.9, sx * 3.0, False)[0]
        wbox(mb, pos + V((sx * 0.0, 0.0, -0.06)), (0.1, 1.0, 0.12), K['gunmetal'], bev=0.02)
        rocket_pod(mb, pos + V((0, 0.8, -0.32)), (0, -1, 0), 1.6, 0.2, K)
        # dorsal wing hardware: intakes, hatches, markings
        intake(mb, HX(Wg, 1.4, sx * 1.5, off=0.08), 0.45, 0.2, 0.9, K, shell='paint_b')
        hatch(mb, HX(Wg, -0.3, sx * 1.6, off=0.09), 0.5, 0.7, K, 'paint_b')
        vent(mb, HX(Wg, -1.6, sx * 2.6, off=0.09), 0.4, 0.5, 6, K, glow='heat')
        tri_decal(mb, HX(Wg, 0.4, sx * 2.2, off=0.1), 0.1, K['trim'])
        stencil_bars(mb, HX(Wg, -2.4, sx * 3.4, off=0.1), 4, 0.18, 0.05, 0.05, K['trim'])
    return finish(mb, 'enemy_fighter_b')


# =============================================================================== C: bladed interceptor
def enemy_fighter_c():
    mats_enemy()
    R = rng(613)
    mb = MB()
    SPN = prof_chamfer(DIAMOND, 0.14)      # 16 pts; top = vertex 2 -> indices 4/5
    SP = SHull([(-3.3, 0.7, 0.8, 0.1), (-2.8, 1.0, 1.1, 0.1), (0.5, 1.0, 1.15, 0.12), (2.6, 0.75, 0.85, 0.08),
                (4.0, 0.34, 0.38, 0.0), (4.7, 0.06, 0.08, 0.0)], SPN, step=0.08)
    SP.build(mb, K['gunmetal'])
    pc = [-0.5 + 2 * k for k in range(9)]
    scut = [-3.28, -2.8, -2.3, -1.8, -1.3, -0.8, -0.3, 0.2, 0.7, 1.2, 1.7, 2.3, 2.9, 3.4, 3.9, 4.6]
    scales(mb, SP, scut, pc,
           lambda i, j: None if (j == 2 and 11 <= i <= 12) or (j == 2 and i in (1, 2)) else
           (K['paint_b'] if j in (5, 6, 7) or (j == 2 and i % 3 == 0) else K['paint_a']), thick=0.045,
           lap=0.1, gp=0.06)
    for i in (3, 5, 7, 9):
        for j in (0, 1, 3, 4):
            if R.random() < 0.7:
                plates(mb, SP, [scut[i] + 0.12, scut[i + 1] - 0.1], [pc[j] + 0.4, pc[j + 1] - 0.4],
                       lambda a, b: K['paint_a'], thick=0.03, off=0.045 + (i % 2) * 0.036, ch=0.02)
    canopy(mb, [(1.5, 0.4, 0.24, 0.62), (1.9, 0.62, 0.38, 0.66), (2.8, 0.5, 0.3, 0.55), (3.3, 0.2, 0.12, 0.4)],
           frames=(1.9, 2.2, 2.5, 2.8, 3.05))
    slit_vents(mb, Mat((0, 2.1, 0.66)), 4, 0.4, 0.08, 0.2, K)
    # tall dorsal knife fin offset to port (asymmetric) + short ventral blade
    blade(mb, [(0.12, 1.2, 0.62), (0.16, 1.7, 1.2), (0.19, 2.3, 1.9), (0.2, 2.8, 2.35)], [2.2, 1.5, 0.8, 0.3],
          [0.1, 0.08, 0.05, 0.025], K, fwd=(0, -1, 0.3), up=(1, 0, 0), edge_w=0.08,
          panels=[(0, 1, 'paint_b'), (1, 2, 'paint_a')])
    navlamp(mb, (0.2, 2.95, 2.36), (0, 1, 0.3), K, 'lamp_white', 0.035)
    blade(mb, [(0, 1.8, -0.5), (0, 2.1, -0.85), (0, 2.5, -1.15)], [1.6, 1.0, 0.35], [0.08, 0.06, 0.03], K,
          body='paint_b', fwd=(0, -1, -0.3), up=(1, 0, 0), edge_w=0.06)
    antenna(mb, (-0.2, 2.6, 0.5), (-0.3, 0.4, 1), 0.7, K, tip='lamp')
    # nose: sensor spike, blisters, chin gun
    cy(mb, W, (0, -4.65, 0.0), (0, -5.15, 0.0), 0.03, 0.008, K['metal'], seg=8)
    tube(mb, (0, -4.3, 0.0), (0, 1, 0), 0.16, 0.19, 0.05, K['trim'], seg=8)
    blister(mb, HD(SP, 3.4, (0, -1), 0.0), 0.1, K)
    gun(mb, (0, -3.5, -0.34), (0, -1, 0), 1.0, 0.04, K)
    gear_bay(mb, HD(SP, 0.9, (0, -1), 0.045), 0.45, 0.9, K, 'paint_b')
    # main engine: octagonal armoured collar + big nozzle + 4 radial struts
    c = V((0, 3.45, 0.1))
    hex_housing(mb, c, (0, 1, 0), 0.62, 0.7, K, seg=8)
    tube(mb, c + V((0, 0.36, 0)), (0, 1, 0), 0.6, 0.78, 0.12, K['paint_b'], seg=8)
    tube(mb, c + V((0, 0.44, 0)), (0, 1, 0), 0.62, 0.74, 0.05, K['trim'], seg=8)
    nozzle(mb, c + V((0, 0.3, 0)), (0, 1, 0), 0.44, K, petals=14)
    for a in (45, 135, 225, 315):
        u = V((math.cos(a * D2R), 0, math.sin(a * D2R)))
        mb.cyl(c + u * 0.62 + V((0, -0.35, 0)), c + u * 0.95 + V((0, -1.1, 0)), 0.045, 0.045, K['metal'], seg=8)
    for sx in (1, -1):
        # ---- forward-swept scythe wing (curved), cannon at the tip
        root = V((sx * 0.55, 0.9, -0.05))
        ctrl = V((sx * 2.9, 0.7, -0.2))
        tipp = V((sx * 3.7, -2.5, -0.42))
        NS = 30
        cs = []
        for k in range(NS):
            t = k / (NS - 1)
            cs.append(root * (1 - t) ** 2 + ctrl * 2 * t * (1 - t) + tipp * t * t)
        chords = [lerp(1.9, 0.3, (k / (NS - 1)) ** 1.1) for k in range(NS)]
        thick = [lerp(0.22, 0.05, k / (NS - 1)) for k in range(NS)]
        fr = blade(mb, cs, chords, thick, K, fwd=(sx, -1, 0), up=(0, 0, 1), edge_w=0.14, plane=(0, 0, 1), bias=0.72,
                   panels=[(k, k + 1, 'paint_b' if k % 5 == 0 else 'paint_a') for k in range(1, NS - 3)])
        # brass spar rib along the blade (upper face) and glowing slits near the root
        rp = [fr[k][0] - fr[k][1] * fr[k][3] * 0.3 + fr[k][2] * fr[k][4] * 0.5 for k in range(1, NS - 2)]
        strip(mb, rp, [fr[k][2] for k in range(1, NS - 2)], 0.05, 0.03, K['trim'])
        rp = [fr[k][0] - fr[k][1] * fr[k][3] * 0.3 - fr[k][2] * fr[k][4] * 0.5 for k in range(1, NS - 2)]
        strip(mb, rp, [-fr[k][2] for k in range(1, NS - 2)], 0.05, 0.03, K['gunmetal'])
        c9, f9, n9, ch9, t9 = fr[-1]
        gun(mb, c9 + V((0, 0.15, 0.06)), (0, -1, 0), 1.3, 0.04, K)
        navlamp(mb, cs[-1] + V((sx * 0.08, 0.12, 0.05)), (sx, 0, 0.2), K, 'lamp_red' if sx > 0 else 'lamp_green', 0.05)
        for kk, nv in ((9, 3), (17, 2)):
            c5, f5, n5, ch5, t5 = fr[kk]
            slit_vents(mb, Mat(c5 + n5 * (t5 * 0.5 + 0.022), n5, f5), nv, 0.26, 0.07, 0.16, K)
        # blade-tip sensor pod + RCS, under-blade hardpoint
        ct, ft, nt, cht, tt = fr[NS - 4]
        cy(mb, W, ct - V((0, 0.5, 0)) + nt * 0.02, ct + V((0, 0.55, 0)) + nt * 0.02, 0.09, 0.09, K['paint_b'], seg=12)
        cy(mb, W, ct - V((0, 0.5, 0)) + nt * 0.02, ct - V((0, 0.62, 0)) + nt * 0.02, 0.09, 0.05, K['glass'], seg=12)
        tube(mb, ct + nt * 0.02, (0, 1, 0), 0.088, 0.1, 0.06, K['trim'], seg=12)
        rcs(mb, Mat(fr[NS - 7][0] + fr[NS - 7][2] * fr[NS - 7][4] * 0.5, fr[NS - 7][2], (0, -1, 0)), 0.13, K)
        rcs(mb, Mat(fr[NS - 7][0] - fr[NS - 7][2] * fr[NS - 7][4] * 0.5, -fr[NS - 7][2], (0, -1, 0)), 0.13, K)
        cm, fm, nm, chm, tm = fr[12]
        hp = cm - nm * (tm * 0.5 + 0.08)
        wbox(mb, hp, (0.08, 0.8, 0.12), K['gunmetal'], bev=0.02)
        rocket_pod(mb, hp - V((0, -0.7, 0.2)), (0, -1, 0), 1.3, 0.13, K)
        # wing-root nacelle: faceted scaled pod carrying the blade, intake at the front, root engine aft
        cx = sx * 0.78
        NA = SHull([(-2.45, 0.34, 0.36, -0.05, cx), (-2.2, 0.5, 0.55, -0.05, cx), (0.6, 0.52, 0.56, -0.05, cx),
                    (1.3, 0.3, 0.34, -0.05, cx), (1.55, 0.08, 0.1, -0.05, cx)], prof_chamfer(DIAMOND, 0.14), step=0.08)
        NA.build(mb, K['gunmetal'])
        scales(mb, NA, [-2.43, -1.9, -1.35, -0.8, -0.25, 0.3, 0.85, 1.5], pc,
               lambda i, j: K['paint_b'] if j in (5, 6, 7) or i in (0, 3) else K['paint_a'], thick=0.035, lap=0.08)
        intake(mb, HD(NA, 0.4, (-sx, 0.2), 0.035), 0.2, 0.16, 0.6, K, shell='paint_b')
        nozzle(mb, V((cx, 2.45, -0.05)), (0, 1, 0), 0.17, K, petals=8, seg=16, ribs=1)
        rail_on(mb, NA, -2.2, 1.0, 4.5, 0.07, 0.04, 0.02, K['trim'])
        # missiles on a rail under each nacelle
        pos = V((cx, 0.0, -0.05 - 0.3))
        wbox(mb, pos, (0.08, 1.6, 0.1), K['gunmetal'], bev=0.02)
        for k, dx in enumerate((-0.16, 0.16)):
            missile(mb, pos + V((dx, 0.95, -0.17)), (0, -1, 0), 1.7, 0.08, K, body='paint_b', nose='paint_a')
        # ---- rear down-canted blades
        rb = V((sx * 0.4, 2.0, -0.2))
        blade(mb, [rb, rb + V((sx * 0.5, 0.35, -0.22)), rb + V((sx * 1.0, 0.8, -0.45)), rb + V((sx * 1.4, 1.3, -0.62))],
              [1.1, 0.85, 0.55, 0.2], [0.09, 0.07, 0.05, 0.025], K, body='paint_b', fwd=(0, -1, 0), up=(0, 0, 1),
              edge_w=0.07, panels=[(0, 1, 'paint_a'), (1, 2, 'paint_a')])
        # hull hardware
        gear_bay(mb, HD(NA, -0.9, (0, -1), 0.035), 0.3, 0.8, K, 'paint_b')
        rcs(mb, HD(SP, 3.0, (sx, 0.3), 0.045), 0.16, K)
        rcs(mb, HD(SP, -2.9, (sx, 0.5), 0.045), 0.18, K)
        rcs(mb, HD(SP, -2.9, (sx, -0.5), 0.045), 0.18, K)
        vent(mb, HD(SP, -1.9, (sx, 0.6), 0.09), 0.3, 0.7, 8, K, glow='heat')
        hatch(mb, HD(SP, 0.3, (sx, 0.55), 0.09), 0.35, 0.5, K, 'paint_b')
        blister(mb, HD(SP, 2.6, (sx, -0.4), 0.045), 0.07, K)
        tri_decal(mb, HD(SP, -0.6, (sx, 0.5), 0.1), 0.07, K['trim'])
        stencil_bars(mb, HD(SP, 1.2, (sx, 0.55), 0.1), 3, 0.14, 0.04, 0.04, K['trim'])
        conduit(mb, (sx * 0.35, -1.2, 0.5), (sx * 0.35, 0.6, 0.55), 0.04, K, clamps=4)
    return finish(mb, 'enemy_fighter_c')
