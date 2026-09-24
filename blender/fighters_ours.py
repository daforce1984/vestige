"""Our-side fighter variants (Hiigaran-style: teal / sand paint, safety-yellow trim, rounded armoured pods,
A-frame brackets, hexagonal thruster housings).  See fighterkit.py for the toolkit and material palette.
Blender space: nose -Y, up +Z, +X = port (red lamp), -X = starboard (green lamp)."""
import math
from mathutils import Vector, Matrix
from lib import MB, rng, lerp, D2R
from shipkit import digits
from fighterkit import (V, W, mats_ours, prof_super, prof_chamfer, prof_flatbottom, SHull, plates, Mat, HM, bx, wbox,
                        cy, hx, tube, strip, rail_on, hoop_on, nozzle, hex_housing, vent, rcs, blister, hatch,
                        gear_bay, gun, missile, antenna, navlamp, conduit, a_frame, fin_bank, tri_decal, stencil_bars,
                        finish, intake)

K = {n: n for n in ('paint_a', 'paint_b', 'trim', 'metal', 'gunmetal', 'carbon', 'exhaust', 'glass', 'heat',
                    'lamp_red', 'lamp_green', 'lamp_white', 'lamp', 'engine', 'nozzle_glow')}
BOX8 = [(1, -0.72), (1, 0.72), (0.8, 1), (-0.8, 1), (-1, 0.72), (-1, -0.72), (-0.8, -1), (0.8, -1)]


def canopy(mb, st, n=16, p=2.6, frames=(), rails=(), sill=True):
    """Framed canopy: glass shell + longitudinal rails + hoops + sill."""
    C = SHull(st, prof_super(n, p), step=0.08)
    C.build(mb, K['glass'])
    s0, s1 = C.st[0][0] + 0.03, C.st[-1][0] - 0.03
    q = n / 4.0 - 0.5            # top of the profile in index space
    for dp in rails:
        rail_on(mb, C, s0, s1, q + dp, 0.0, 0.045, 0.03, K['gunmetal'])
    for s in frames:
        hoop_on(mb, C, s, -0.5 + 0.35, n / 2 - 0.5 - 0.35, 0.0, 0.05, 0.035, K['gunmetal'])
    if sill:
        for pp in (-0.5 + 0.3, n / 2 - 0.5 - 0.3):
            rail_on(mb, C, C.st[0][0], C.st[-1][0], pp, 0.0, 0.07, 0.04, K['gunmetal'])
    return C


def pod_angle(p, n):
    return (p + 0.5) / n * 2 * math.pi


def p_of(angle_deg, n, sx):
    """Profile index for a world-side angle (0 = outboard, 90 = up) on a pod mirrored by sx."""
    a = angle_deg if sx > 0 else 180 - angle_deg
    return (a / 360.0 * n - 0.5) % n


# =============================================================================== A: strike interceptor
def interceptor_a():
    mats_ours()
    R = rng(601)
    mb = MB()
    SPN = prof_chamfer(BOX8, 0.2)
    # ---------------- central cockpit spine
    SP = SHull([(-3.45, 0.78, 0.8, 0.12), (-2.9, 1.0, 1.02, 0.2), (0.5, 1.05, 1.12, 0.25), (1.8, 1.0, 1.08, 0.22),
                (3.1, 0.72, 0.8, 0.12), (3.9, 0.3, 0.34, 0.02)], SPN, step=0.1)
    SP.build(mb, K['gunmetal'])
    pc = [0.5 + 2 * k for k in range(9)]

    def spine_mat(i, j):
        if j == 2 and i in (2, 3):            # radiator bay on top
            return None
        if j == 2 and i >= 5:                 # canopy
            return None
        if j in (1, 2, 3):
            return K['paint_b']
        if j in (5, 6, 7):
            return K['paint_a'] if i != 4 else None
        return K['paint_a']
    plates(mb, SP, [-3.42, -2.7, -1.75, -0.7, 0.35, 1.35, 3.1, 3.88], pc, spine_mat, thick=0.045, gs=0.05, gp=0.07,
           ch=0.03)
    # layered second skin on the flanks
    for sa, sb in ((-2.6, -1.85), (0.45, 1.25)):
        plates(mb, SP, [sa, sb], [0.7, 2.3], lambda i, j: K['paint_a'], thick=0.03, off=0.045, ch=0.02)
        plates(mb, SP, [sa, sb], [8.7, 10.3], lambda i, j: K['paint_a'], thick=0.03, off=0.045, ch=0.02)
    canopy(mb, [(1.3, 0.5, 0.3, 0.83), (1.8, 0.74, 0.46, 0.88), (2.7, 0.66, 0.4, 0.8), (3.3, 0.28, 0.14, 0.62)],
           frames=(1.75, 2.2, 2.65, 3.0), rails=(0.0,))
    # canopy side sills and amber cockpit lights
    for sx in (1, -1):
        bx(mb, Mat((sx * 0.36, -1.35, 0.78)), (0, 0, 0), (0.12, 0.2, 0.06), K['gunmetal'], bev=0.02)
        bx(mb, Mat((sx * 0.36, -1.43, 0.79)), (0, 0, 0.03), (0.06, 0.04, 0.02), K['lamp'])
    # nose sensor cone + pitot
    cy(mb, W, (0, -3.88, 0.02), (0, -4.05, 0.02), 0.16, 0.12, K['metal'], seg=16)
    cy(mb, W, (0, -4.05, 0.02), (0, -4.35, 0.02), 0.03, 0.012, K['metal'], seg=8)
    tube(mb, (0, -3.97, 0.02), (0, 1, 0), 0.155, 0.175, 0.03, K['trim'], seg=16)
    # radiator stack between the flanks of the spine top
    fin_bank(mb, Mat((0, 0.72, 0.74)), 0.72, 2.0, 14, 0.26, K)
    for sy in (-1, 1):
        conduit(mb, (0.3, 0.72 + sy * 1.05, 0.83), (0.3, 0.72 + sy * 1.35, 0.8), 0.035, K, clamps=1)
        conduit(mb, (-0.3, 0.72 + sy * 1.05, 0.83), (-0.3, 0.72 + sy * 1.35, 0.8), 0.035, K, clamps=1)
    # spine rear: hatch block, antennas, white strobe
    bx(mb, Mat((0, 3.0, 0.72)), (0, 0, 0), (0.42, 0.62, 0.3), K['gunmetal'], bev=0.04, seg=2)
    vent(mb, Mat((0, 3.0, 0.87)), 0.3, 0.46, 6, K)
    antenna(mb, (0.16, 2.8, 0.8), (0.02, 0.6, 1.0), 0.8, K)
    antenna(mb, (-0.16, 2.6, 0.82), (0, 0.3, 1.0), 0.45, K, tip=None)
    navlamp(mb, (0, 3.44, 0.46), (0, 1, 0.3), K, 'lamp_white', 0.045)
    hatch(mb, Mat((0, 3.455, 0.1), (0, 1, 0), (0, 0, 1)), 0.4, 0.3, K, 'paint_a', latches=1)
    # chin gun pod + twin cannon
    wbox(mb, (0, -2.45, -0.46), (0.44, 1.1, 0.3), K['gunmetal'], bev=0.05, seg=2)
    vent(mb, Mat((0, -2.3, -0.61), (0, 0, -1)), 0.26, 0.5, 5, K)
    gun(mb, (0, -2.98, -0.5), (0, -1, 0), 1.25, 0.04, K, barrels=2, spread=0.18)
    # machinery frame under the spine + nose gear bay
    wbox(mb, (0, -0.95, -0.47), (1.05, 2.3, 0.28), K['gunmetal'], bev=0.04, seg=2)
    wbox(mb, (0, 0.95, -0.5), (0.9, 1.2, 0.24), K['metal'], bev=0.03, seg=2)
    gear_bay(mb, Mat((0, -0.95, -0.61), (0, 0, -1)), 0.62, 1.1, K, 'paint_b')
    for k in range(4):
        bx(mb, Mat((0, 0.5 + k * 0.28, -0.63), (0, 0, -1)), (0, 0, 0), (0.7, 0.1, 0.04), K['gunmetal'], bev=0.01)

    # ---------------- side pods
    NP = 32
    POD = prof_super(NP, 3.6)
    for sx in (1, -1):
        cx = sx * 1.55
        P = SHull([(-3.45, 1.15, 1.1, 0.0, cx), (-3.1, 1.55, 1.45, 0.0, cx), (1.3, 1.58, 1.47, 0.03, cx),
                   (2.35, 1.35, 1.25, 0.0, cx), (2.9, 0.8, 0.8, 0.0, cx), (3.06, 0.32, 0.32, 0.0, cx)], POD, step=0.1)
        P.build(mb, K['gunmetal'])
        scut = [-3.42, -2.45, -1.45, -0.45, 0.55, 1.5, 2.35, 3.0]
        pcut = [-0.5 + 4 * k for k in range(9)]

        def pod_mat(i, j, sx=sx):
            a = pod_angle((pcut[j] + pcut[j + 1]) / 2, NP)
            up, ob = math.sin(a), math.cos(a) * sx
            if i == 0 and up > 0.7:
                return None                               # vent bay
            if up < -0.75 and i in (3, 4):
                return None                               # gear bay
            if i == 6:
                return K['paint_b']                       # sand nose cap
            if i == 2 and up > -0.2:
                return K['paint_b']                       # sand band
            return K['paint_a']
        plates(mb, P, scut, pcut, pod_mat, thick=0.055, gs=0.06, gp=0.06, ch=0.035)
        # raised secondary plates (layering) on the top / outboard sectors
        for i in (1, 3, 4, 5):
            for j in range(8):
                a = pod_angle((pcut[j] + pcut[j + 1]) / 2, NP)
                if math.sin(a) > 0.2 and R.random() < 0.55:
                    sa, sb = scut[i], scut[i + 1]
                    L = sb - sa
                    plates(mb, P, [sa + L * R.uniform(0.15, 0.3), sb - L * R.uniform(0.15, 0.3)],
                           [pcut[j] + 0.9, pcut[j + 1] - 0.9], lambda i_, j_: K['paint_a'], thick=0.03, off=0.055,
                           ch=0.02)
        # vents over the thruster bay (top rear)
        for ang in (68, 112):
            vent(mb, HM(P, -2.93, p_of(ang, NP, sx), 0.0), 0.36, 0.78, 9, K)
        # gear bay on the belly
        gear_bay(mb, HM(P, 0.55, p_of(270, NP, sx), 0.0), 0.72, 1.55, K, 'paint_a')
        # coolant intake on the lower inboard cheek of the pod nose
        intake(mb, HM(P, 1.75, p_of(215, NP, sx), 0.05), 0.34, 0.2, 0.75, K, shell='paint_b')
        # missile rail on the outboard flank (two missiles)
        for k, ang in enumerate((-4, -30)):
            pos, n = P.pt(0.0, p_of(ang, NP, sx), 0.055)
            M = Mat(pos, n)
            bx(mb, M, (0, 0, 0.04), (0.05, 2.1, 0.08), K['gunmetal'], bev=0.015)
            for yy in (-0.7, 0.7):
                bx(mb, M, (0, yy, 0.09), (0.09, 0.14, 0.1), K['metal'], bev=0.01)
            missile(mb, pos + n * 0.24 + V((0, 1.15, 0)), (0, -1, 0), 2.35, 0.1, K)
        # RCS quads at the four outboard corners
        for s, ang in ((2.25, 40), (2.25, -40), (-2.95, 35), (-2.95, -35)):
            rcs(mb, HM(P, s, p_of(ang, NP, sx), 0.055, spin=0.0), 0.2, K)
        # sensor blister + landing light on the pod nose
        blister(mb, HM(P, 2.55, p_of(125, NP, sx), 0.055), 0.1, K)
        navlamp(mb, (cx, -3.08, 0.0), (0, -1, 0), K, 'lamp_white', 0.07)
        tube(mb, (cx, -3.07, 0.0), (0, 1, 0), 0.1, 0.14, 0.04, K['metal'], seg=16)
        # nav lamp (port red / starboard green) + tail strobe
        pos, n = P.pt(0.2, p_of(0, NP, sx), 0.055)
        navlamp(mb, pos, n, K, 'lamp_red' if sx > 0 else 'lamp_green', 0.06)
        pos, n = P.pt(-3.3, p_of(90, NP, sx), 0.0)
        navlamp(mb, pos, n, K, 'lamp_white', 0.035)
        # registry number, warning triangles, stencil dashes
        digits(mb, P, '07', 1.05, p_of(12, NP, sx), 0.34, K['paint_b'], off=0.062, thick=0.016)
        tri_decal(mb, HM(P, 1.95, p_of(40, NP, sx), 0.058), 0.07, K['trim'])
        tri_decal(mb, HM(P, -2.35, p_of(-40, NP, sx), 0.058), 0.07, K['trim'])
        stencil_bars(mb, HM(P, -1.0, p_of(20, NP, sx), 0.058), 4, 0.09, 0.05, 0.05, K['gunmetal'])
        # 3 hex thruster housings under each pod, aft-pointing and canted down
        d = V((0, 1, -0.28)).normalized()
        wbox(mb, (cx, 1.85, -0.62), (1.4, 1.5, 0.2), K['gunmetal'], bev=0.04, seg=2)
        for k, dx in enumerate((-0.45, 0.0, 0.45)):
            c = V((cx + dx, 1.95 + (0.15 if k == 1 else 0), -0.97))
            hex_housing(mb, c, d, 0.27, 1.5, K)
            nozzle(mb, c + d * 0.62, d, 0.19, K, petals=10, seg=20)
            wbox(mb, (cx + dx, 1.7, -0.75), (0.12, 0.6, 0.18), K['gunmetal'], bev=0.02)
            for sg in (1, -1):   # yellow slit lights on the housings
                bx(mb, Mat(c + V((sg * 0.25, -0.1, 0)), (sg, 0, 0), d), (0, 0, 0), (0.025, 0.55, 0.02), K['lamp'])
        # aft cap: service hatch, vents, tail ring
        Mt = Mat((cx, 3.455, 0.05), (0, 1, 0), (0, 0, 1))
        hatch(mb, Mt, 0.62, 0.42, K, 'paint_b')
        vent(mb, Mat((cx - sx * 0.02, 3.455, -0.38), (0, 1, 0), (0, 0, 1)), 0.7, 0.22, 4, K)
        for dx in (-0.42, 0.42):
            bx(mb, Mat((cx + dx, 3.455, 0.05), (0, 1, 0), (0, 0, 1)), (0, 0, 0.02), (0.08, 0.5, 0.05), K['metal'],
               bev=0.01)
        # thin top-rear exhaust
        de = V((0, 1, 0.25)).normalized()
        cy(mb, W, (cx, 2.55, 0.55), (cx, 3.3, 0.6), 0.19, 0.17, K['gunmetal'], seg=16)
        nozzle(mb, V((cx, 3.3, 0.6)), de, 0.14, K, petals=8, seg=16, ribs=1)
        # yellow A-frame brackets pod -> spine (fore and aft)
        for y in (-1.75, 1.25):
            a_frame(mb, (sx * 0.52, y - 0.42, 0.25), (sx * 0.52, y + 0.42, 0.25), (sx * 0.92, y, 0.52), 0.045, K)
        # exposed machinery between spine and pod
        conduit(mb, (sx * 0.64, -2.6, 0.05), (sx * 0.64, 2.2, 0.05), 0.065, K, clamps=6)
        conduit(mb, (sx * 0.7, -2.4, -0.26), (sx * 0.7, 1.8, -0.26), 0.045, K, clamps=5, mat='gunmetal')
        conduit(mb, (sx * 0.58, -2.2, 0.3), (sx * 0.58, 1.6, 0.3), 0.03, K, clamps=4, mat='trim')
        for y in (-1.2, 0.4):   # pistons (hydraulic links pod <-> spine)
            mb.cyl(V((sx * 0.55, y, -0.35)), V((sx * 0.85, y + 0.5, -0.1)), 0.06, 0.06, K['metal'], seg=10)
            mb.cyl(V((sx * 0.85, y + 0.5, -0.1)), V((sx * 1.0, y + 0.7, 0.0)), 0.085, 0.085, K['gunmetal'], seg=10)
        for y in (-2.0, -0.3, 1.4):   # junction boxes on the conduit
            bx(mb, Mat((sx * 0.66, y, 0.05), (sx, 0, 0)), (0, 0, 0.02), (0.18, 0.24, 0.1), K['gunmetal'], bev=0.015)
    return finish(mb, 'interceptor')


def turret(mb, pos, K, r=0.46, blen=1.6):
    """Dorsal twin-cannon turret: bearing ring, bevelled wedge housing, armour cheeks, sensor, twin guns."""
    pos = V(pos)
    cy(mb, W, pos + V((0, 0, -0.05)), pos + V((0, 0, 0.1)), r * 1.12, r * 1.08, K['metal'], seg=28)
    tube(mb, pos + V((0, 0, 0.1)), (0, 0, 1), r * 0.9, r * 1.02, 0.05, K['gunmetal'], seg=28)
    M = Mat(pos + V((0, 0, 0.12)))
    hx(mb, M, [(-r * 0.85, -r * 0.9, 0), (r * 0.85, -r * 0.9, 0), (r * 0.85, r * 1.1, 0), (-r * 0.85, r * 1.1, 0),
               (-r * 0.7, -r * 0.55, r * 0.62), (r * 0.7, -r * 0.55, r * 0.62), (r * 0.7, r * 0.9, r * 0.66),
               (-r * 0.7, r * 0.9, r * 0.66)], K['paint_b'], bev=0.03)
    for sx in (-1, 1):   # armour cheeks
        hx(mb, M, [(sx * r * 0.86, -r * 0.8, 0.02), (sx * r * 0.98, -r * 0.8, 0.02), (sx * r * 0.98, r * 0.9, 0.02),
                   (sx * r * 0.86, r * 0.9, 0.02), (sx * r * 0.74, -r * 0.5, r * 0.55),
                   (sx * r * 0.86, -r * 0.5, r * 0.55), (sx * r * 0.86, r * 0.8, r * 0.58),
                   (sx * r * 0.74, r * 0.8, r * 0.58)], K['paint_a'], bev=0.015)
    blister(mb, M @ Matrix.Translation((r * 0.35, r * 0.4, r * 0.64)), 0.07, K)
    vent(mb, M @ Matrix.Translation((-r * 0.25, r * 0.45, r * 0.64)), 0.22, 0.3, 4, K)
    for sx in (-1, 1):
        gun(mb, M @ V((sx * r * 0.32, -r * 1.0, r * 0.3)), (0, -1, 0), blen, 0.045, K)


# =============================================================================== B: heavy torpedo gunship
def interceptor_b():
    mats_ours()
    R = rng(602)
    mb = MB()
    FB = prof_flatbottom(24, 3.0)          # 31 points: 0..24 top arc (12 = top centre), 25..30 chamfered belly
    F = SHull([(-4.6, 2.3, 1.4, 0.2), (-4.1, 2.6, 1.7, 0.25), (1.2, 2.6, 1.75, 0.25), (2.8, 2.2, 1.4, 0.12),
               (4.2, 1.3, 0.85, -0.05), (4.9, 0.5, 0.36, -0.12)], FB, step=0.1)
    F.build(mb, K['gunmetal'])
    sc = [-4.55, -3.6, -2.5, -1.4, -0.3, 0.8, 1.9, 2.9, 3.9, 4.85]
    pc = [-1, 3, 7.5, 12, 16.5, 21, 25, 27.5, 30]

    def fmat(i, j):
        if j in (2, 3) and i in (6, 7):
            return None                      # canopy footprint
        if j in (2, 3) and i == 3:
            return None                      # turret ring
        if j in (2, 3) and i == 0:
            return None                      # engine-deck vents
        if j in (6, 7):
            return K['paint_a'] if i not in (7, 8) else None
        if i == 8:
            return K['paint_b']
        if j in (2, 3):
            return K['paint_b']
        if i in (2, 5) and j in (0, 1, 4, 5):
            return K['paint_b']                   # sand bands
        return K['paint_a']
    plates(mb, F, sc, pc, fmat, thick=0.06, gs=0.06, gp=0.08, ch=0.04)
    for i in (1, 3, 4, 6):          # raised secondary armour on the flanks
        for j in (0, 1, 4, 5):
            if R.random() < 0.7:
                sa, sb = sc[i], sc[i + 1]
                L = sb - sa
                plates(mb, F, [sa + L * 0.18, sb - L * R.uniform(0.15, 0.3)], [pc[j] + 0.9, pc[j + 1] - 0.9],
                       lambda a, b: K['paint_a'], thick=0.035, off=0.06, ch=0.025)
    # armoured slit canopy
    canopy(mb, [(2.15, 0.9, 0.4, 0.84), (2.7, 1.12, 0.52, 0.9), (3.5, 0.96, 0.44, 0.76), (4.1, 0.4, 0.2, 0.5)],
           frames=(2.4, 2.65, 2.9, 3.15, 3.4, 3.65, 3.88), rails=(-1.3, 0.0, 1.3))
    for sx in (1, -1):                               # brow armour over the canopy sides
        rail_on(mb, F, 2.0, 3.9, 12 + sx * 4.6, 0.06, 0.18, 0.08, K['paint_b'])
    # dorsal twin turret
    turret(mb, (0, 0.85, 1.12), K)
    # engine deck vents
    for sx in (1, -1):
        vent(mb, HM(F, -4.07, 12 + sx * 4.3, 0.0), 0.5, 0.8, 9, K)
    antenna(mb, (0.55, 3.2, 1.05), (0.1, 0.5, 1), 0.9, K)
    antenna(mb, (-0.55, 3.4, 1.0), (-0.1, 0.4, 1), 0.55, K, tip=None)
    navlamp(mb, (0, 3.6, 1.1), (0, 0, 1), K, 'lamp_white', 0.05)
    # nose: sensor chin blister, landing lights, nose gear
    blister(mb, HM(F, 4.35, 27.5, 0.0), 0.16, K)
    for sx in (1, -1):
        navlamp(mb, F.pt(4.5, 12 - sx * 8.25, 0.0)[0], (sx * 0.4, -1, 0), K, 'lamp_white', 0.05)
    gear_bay(mb, HM(F, 3.3, 27.5, 0.0), 0.7, 0.9, K, 'paint_a')
    rcs(mb, HM(F, 3.6, 1.5, 0.06), 0.2, K)
    rcs(mb, HM(F, 3.6, 22.5, 0.06), 0.2, K)
    rcs(mb, HM(F, -4.0, 2.25, 0.06), 0.22, K)
    rcs(mb, HM(F, -4.0, 21.75, 0.06), 0.22, K)
    # --- twin torpedoes in a ventral cradle
    wbox(mb, (0, -0.2, -0.78), (0.42, 4.6, 0.3), K['gunmetal'], bev=0.04, seg=2)
    for k in range(6):
        wbox(mb, (0, -2.2 + k * 0.8, -0.95), (0.3, 0.2, 0.08), K['metal'], bev=0.015)
    for sx in (1, -1):
        x = sx * 0.58
        missile(mb, (x, 2.25, -0.98), (0, -1, 0), 4.9, 0.3, K, body='paint_b', nose='gunmetal', seg=20)
        for y in (-1.6, 0.0, 1.5):
            tube(mb, (x, y, -0.98), (0, 1, 0), 0.305, 0.34, 0.12, K['gunmetal'], seg=20)
            wbox(mb, (sx * 0.3, y, -0.8), (0.28, 0.1, 0.1), K['gunmetal'], bev=0.02)
        for k in range(3):
            bx(mb, Mat((x, -1.0 + k * 0.25, -0.98 + 0.3), (0, 0, 1)), (0, 0, 0.005), (0.14, 0.12, 0.01), K['trim'])
    # --- engine block: 2x2 nozzles in hex housings
    wbox(mb, (0, 4.45, 0.2), (2.35, 0.3, 1.45), K['gunmetal'], bev=0.05, seg=2)
    for x in (-0.6, 0.6):
        for z in (0.58, -0.17):
            c = V((x, 4.75, z))
            hex_housing(mb, c, (0, 1, 0), 0.45, 0.6, K)
            nozzle(mb, c + V((0, 0.2, 0)), (0, 1, 0), 0.31, K, petals=12)
    for sx in (1, -1):
        wbox(mb, (sx * 1.25, 4.6, 0.2), (0.14, 0.5, 1.2), K['paint_b'], bev=0.03)
        navlamp(mb, (sx * 1.33, 4.75, 0.72), (sx, 0.4, 0), K, 'lamp_white', 0.04)
    # --- sponsons + gun pods
    NP = 24
    GP = prof_super(NP, 3.0)
    for sx in (1, -1):
        cx = sx * 2.8
        # stub wing (thick bevelled hexahedron)
        x0, x1 = sx * 1.2, sx * 2.45
        pts = [(x0, 1.7, -0.22), (x1, 1.2, -0.2), (x1, -0.5, -0.2), (x0, -0.9, -0.22),
               (x0, 1.7, 0.2), (x1, 1.2, 0.15), (x1, -0.5, 0.15), (x0, -0.9, 0.2)]
        if sx < 0:
            pts = pts[:4][::-1] + pts[4:][::-1]
        mb.hexa([V(p) for p in pts], K['gunmetal'], bevel=0.04)
        for k in range(3):   # armour tiles on the stub
            xa, xb = lerp(x0, x1, 0.05 + k * 0.32), lerp(x0, x1, 0.33 + k * 0.32)
            wbox(mb, ((xa + xb) / 2, 0.35, 0.2), (abs(xb - xa) - 0.05, 2.0 - k * 0.3, 0.05),
                 K['paint_b'] if k == 1 else K['paint_a'], bev=0.02)
        fin_bank(mb, Mat((sx * 1.85, 0.4, 0.22)), 0.55, 1.2, 9, 0.16, K)
        # yellow A-frames stub -> hull flank
        a_frame(mb, (sx * 2.3, 1.1, 0.2), (sx * 2.3, -0.4, 0.2), (sx * 1.35, 0.35, 0.9), 0.05, K)
        a_frame(mb, (sx * 2.3, 1.0, -0.2), (sx * 2.3, -0.3, -0.2), (sx * 1.3, 0.35, -0.55), 0.045, K)
        # gun pod
        P = SHull([(-1.9, 0.6, 0.6, -0.02, cx), (-1.6, 0.9, 0.86, 0.0, cx), (1.2, 0.92, 0.88, 0.0, cx),
                   (1.75, 0.7, 0.66, 0.0, cx), (2.0, 0.4, 0.38, 0.0, cx)], GP, step=0.1)
        P.build(mb, K['gunmetal'])
        psc = [-1.88, -1.1, -0.3, 0.5, 1.25, 1.98]
        ppc = [-0.5 + 3 * k for k in range(9)]
        plates(mb, P, psc, ppc, lambda i, j: (K['paint_b'] if i in (0, 4) else K['paint_a'])
               if not (i == 2 and j in (5, 6)) else None, thick=0.045, gs=0.05, gp=0.07, ch=0.03)
        gear_bay(mb, HM(P, -0.3 + 0.4, p_of(270, NP, sx), 0.0), 0.42, 0.62, K, 'paint_a')
        gun(mb, (cx, -2.0, 0.0), (0, -1, 0), 2.1, 0.06, K, barrels=2, spread=0.3)
        # ammo drum on top of the pod + feed chute
        cy(mb, W, (cx - 0.3, 0.9, 0.62), (cx + 0.3, 0.9, 0.62), 0.28, 0.28, K['gunmetal'], seg=20)
        for dx in (-0.3, 0.3):
            tube(mb, (cx + dx, 0.9, 0.62), (1, 0, 0), 0.2, 0.3, 0.04, K['metal'], seg=20)
        conduit(mb, (cx, 0.5, 0.55), (cx, -1.6, 0.35), 0.06, K, clamps=4, mat='metal')
        rcs(mb, HM(P, 1.5, p_of(45, NP, sx), 0.045), 0.18, K)
        rcs(mb, HM(P, -1.5, p_of(40, NP, sx), 0.045), 0.18, K)
        rcs(mb, HM(P, -1.5, p_of(-40, NP, sx), 0.045), 0.18, K)
        pos, n = P.pt(0.0, p_of(0, NP, sx), 0.045)
        navlamp(mb, pos, n, K, 'lamp_red' if sx > 0 else 'lamp_green', 0.06)
        blister(mb, HM(P, 1.6, p_of(110, NP, sx), 0.045), 0.08, K)
        # missile rack under the stub: 3 missiles
        wbox(mb, (sx * 1.85, 0.3, -0.34), (1.0, 1.8, 0.1), K['gunmetal'], bev=0.02)
        for k, dx in enumerate((-0.35, 0.0, 0.35)):
            x = sx * 1.85 + dx
            wbox(mb, (x, 0.3, -0.42), (0.06, 1.2, 0.08), K['metal'], bev=0.01)
            missile(mb, (x, 1.35, -0.58), (0, -1, 0), 2.0, 0.09, K)
        # hull flank: registry, radiator, stencils, triangles
        digits(mb, F, '21', -1.9, 12 - sx * 10.8, 0.45, K['paint_b'], off=0.068, thick=0.016)
        fin_bank(mb, HM(F, -3.1, 12 - sx * 11.85, 0.0, spin=0.0), 0.5, 0.95, 8, 0.12, K)
        tri_decal(mb, HM(F, 1.4, 12 - sx * 9.75, 0.064), 0.08, K['trim'])
        stencil_bars(mb, HM(F, 0.25, 12 - sx * 9.0, 0.064), 5, 0.09, 0.05, 0.05, K['gunmetal'])
        hatch(mb, HM(F, -0.9, 12 - sx * 11.25, 0.06), 0.45, 0.6, K, 'paint_b')
        intake(mb, Mat((sx * 1.55, -0.75, 0.2)), 0.42, 0.24, 0.9, K, shell='paint_b')
    return finish(mb, 'interceptor_b')


# =============================================================================== C: fast scout / lancer
def interceptor_c():
    mats_ours()
    R = rng(603)
    mb = MB()
    NF = 28
    FP = prof_super(NF, 2.4)
    F = SHull([(-4.0, 0.8, 0.7, 0.1), (-3.4, 1.15, 1.0, 0.15), (-0.5, 1.35, 1.15, 0.15), (1.8, 1.1, 0.95, 0.08),
               (3.4, 0.6, 0.55, 0.0), (4.05, 0.32, 0.32, 0.0)], FP, step=0.1)
    F.build(mb, K['gunmetal'])
    sc = [-3.98, -3.2, -2.3, -1.4, -0.5, 0.45, 1.35, 2.3, 3.2, 4.02]
    pc = [-0.5 + 3.5 * k for k in range(9)]
    sf = [-3.98, -3.55, -3.1, -2.65, -2.2, -1.75, -1.3, -0.85, -0.4, 0.05, 0.5, 0.95, 1.4, 1.85, 2.3, 2.75, 3.2,
          3.6, 4.02]     # 8 sectors, 2 and 5 contain the dorsal / ventral centre

    def fmat(i, j):
        a = pod_angle((pc[j] + pc[j + 1]) / 2, NF)
        up = math.sin(a)
        if up > 0.8 and 2 <= i <= 5:
            return None                              # dorsal sensor ridge
        if up > 0.8 and i >= 6:
            return None                              # canopy
        if up < -0.8 and i in (5, 6):
            return None                              # gear bay
        if up > 0.3:
            return K['paint_a'] if i in (1, 8) else K['paint_b']
        if up < -0.3:
            return K['paint_b']
        return K['paint_a'] if i % 3 == 1 else K['paint_b']
    plates(mb, F, sf, pc, lambda i, j: fmat(min(8, max(0, sum(1 for x in sc[1:-1] if x <= (sf[i] + sf[i + 1]) / 2))), j),
           thick=0.045, gs=0.05, gp=0.07, ch=0.03)
    for i in (1, 3, 4, 6, 7):
        for j in (0, 3, 4, 7):
            if R.random() < 0.6:
                sa, sb = sc[i], sc[i + 1]
                L = sb - sa
                plates(mb, F, [sa + L * 0.2, sb - L * 0.2], [pc[j] + 0.8, pc[j + 1] - 0.8],
                       lambda a, b: K['paint_b'], thick=0.03, off=0.045, ch=0.02)
    # teal dorsal stripe rails
    for dp in (-3.0, 3.0):
        rail_on(mb, F, -3.9, 1.0, NF / 4 - 0.5 + dp, 0.045, 0.08, 0.02, K['trim'])
    canopy(mb, [(0.9, 0.45, 0.3, 0.6), (1.5, 0.72, 0.5, 0.68), (2.5, 0.62, 0.42, 0.58), (3.2, 0.24, 0.14, 0.38)],
           frames=(1.35, 1.85, 2.35, 2.8), rails=(0.0,))
    # --- rail lance: collar, barrel, accelerator coils, side rails, muzzle + sensor spike
    y0, y1 = -4.0, -7.1
    cy(mb, W, (0, y0 + 0.1, 0.0), (0, y0 - 0.35, 0.0), 0.26, 0.2, K['gunmetal'], seg=20)
    tube(mb, (0, y0 - 0.2, 0.0), (0, 1, 0), 0.2, 0.27, 0.08, K['trim'], seg=20)
    cy(mb, W, (0, y0 - 0.3, 0.0), (0, y1, 0.0), 0.085, 0.075, K['metal'], seg=16)
    for k in range(7):
        y = y0 - 0.55 - k * 0.36
        tube(mb, (0, y, 0.0), (0, 1, 0), 0.08, 0.15 - k * 0.006, 0.12, K['gunmetal'], seg=16)
        tube(mb, (0, y, 0.0), (0, 1, 0), 0.08, 0.157 - k * 0.006, 0.03, K['trim' if k % 2 else 'metal'], seg=16)
    for a in (0, 120, 240):
        ca, sa_ = math.cos(a * D2R), math.sin(a * D2R)
        p0 = V((ca * 0.13, y0 - 0.35, sa_ * 0.13))
        p1 = V((ca * 0.1, y1 + 0.35, sa_ * 0.1))
        pts = [p0.lerp(p1, t / 6) for t in range(7)]
        strip(mb, pts, [V((ca, 0, sa_))] * 7, 0.04, 0.03, K['gunmetal'])
    cy(mb, W, (0, y1 + 0.3, 0.0), (0, y1 - 0.05, 0.0), 0.12, 0.13, K['gunmetal'], seg=12)
    cy(mb, W, (0, y1 - 0.05, 0.0), (0, y1 - 0.12, 0.0), 0.09, 0.09, K['carbon'], seg=12)
    cy(mb, W, (0, y1 - 0.1, 0.0), (0, y1 - 0.55, 0.0), 0.025, 0.006, K['metal'], seg=8)
    # --- dorsal sensor ridge: fairing, phased-array tiles, blisters, antennas
    SR = SHull([(-2.9, 0.2, 0.2, 0.62), (-2.6, 0.5, 0.36, 0.66), (0.2, 0.5, 0.36, 0.7), (0.6, 0.2, 0.2, 0.66)],
               prof_chamfer(BOX8, 0.2), step=0.1)
    SR.build(mb, K['gunmetal'])
    plates(mb, SR, [-2.6, -1.5, -0.4, 0.3], [0.5 + 2 * k for k in range(9)],
           lambda i, j: None if j == 2 and i == 1 else (K['paint_a'] if j in (1, 2, 3) else K['paint_b']),
           thick=0.03, gs=0.04, gp=0.08, ch=0.02)
    for k in range(6):
        for m in range(2):
            bx(mb, Mat((-0.09 + m * 0.18, 0.95 - k * 0.17 + 1.0 - 1.0, 0.86)), (0, 0, 0.01), (0.15, 0.14, 0.02),
               K['glass'], bev=0.005)
    for s in (-2.4, 0.1):
        blister(mb, Mat((0, -s, 0.86)), 0.1, K)
    antenna(mb, (0.12, 2.3, 0.84), (0.2, 0.4, 1), 0.7, K)
    antenna(mb, (-0.12, 2.1, 0.84), (-0.2, 0.3, 1), 0.9, K, tip='lamp_red')
    # ventral fin with antenna + lamp
    mb.hexa([V(p) for p in ((-0.05, 3.7, -0.35), (0.05, 3.7, -0.35), (0.05, 1.6, -0.45), (-0.05, 1.6, -0.45),
                            (-0.025, 3.9, -1.05), (0.025, 3.9, -1.05), (0.025, 3.2, -1.05), (-0.025, 3.2, -1.05))],
            K['paint_a'], bevel=0.01)
    navlamp(mb, (0, 3.9, -1.07), (0, 0.3, -1), K, 'lamp_white', 0.035)
    # nose: chin sensor, landing light, gear bay, RCS
    blister(mb, HM(F, 3.0, NF * 0.75 - 0.5, 0.0), 0.12, K)
    gear_bay(mb, HM(F, 1.4, NF * 0.75 - 0.5, 0.0), 0.5, 0.8, K, 'paint_b')
    for sx in (1, -1):
        rcs(mb, HM(F, 3.0, p_of(20, NF, sx), 0.045), 0.16, K)
        rcs(mb, HM(F, -3.5, p_of(30, NF, sx), 0.045), 0.18, K)
        vent(mb, HM(F, -2.75, p_of(-25, NF, sx), 0.0), 0.3, 0.9, 10, K)
        hatch(mb, HM(F, 0.0, p_of(-10, NF, sx), 0.045), 0.35, 0.55, K, 'paint_a')
        intake(mb, HM(F, 1.1, p_of(-12, NF, sx), 0.045), 0.28, 0.2, 0.8, K)
        digits(mb, F, '3', -1.0, p_of(8, NF, sx), 0.4, K['paint_a'], off=0.052, thick=0.016)
        tri_decal(mb, HM(F, 2.6, p_of(15, NF, sx), 0.048), 0.06, K['trim'])
    # --- main engine: hex housing + big nozzle
    hex_housing(mb, (0, 4.15, 0.12), (0, 1, 0), 0.55, 0.7, K)
    nozzle(mb, V((0, 4.35, 0.12)), (0, 1, 0), 0.38, K, petals=14)
    # --- outrigger arms and engine pods
    NP = 24
    PP = prof_super(NP, 3.2)
    for sx in (1, -1):
        cx = sx * 2.35
        # swept strut (thick bevelled blade), radiator on top, yellow truss below
        r0 = [(sx * 0.5, 0.2, -0.08), (sx * 0.5, 1.4, -0.08), (sx * 0.5, 1.4, 0.1), (sx * 0.5, 0.2, 0.1)]
        pts = [(sx * 0.5, 0.2, -0.09), (sx * 2.1, 1.9, -0.07), (sx * 2.1, 2.6, -0.07), (sx * 0.5, 1.5, -0.09),
               (sx * 0.5, 0.2, 0.11), (sx * 2.1, 1.9, 0.08), (sx * 2.1, 2.6, 0.08), (sx * 0.5, 1.5, 0.11)]
        if sx < 0:
            pts = pts[:4][::-1] + pts[4:][::-1]
        mb.hexa([V(p) for p in pts], K['paint_a'], bevel=0.025)
        fin_bank(mb, Mat((sx * 1.3, 1.55, 0.1), (0, 0, 1), (sx * 1.6, -1.7, 0)), 0.42, 1.25, 11, 0.12, K)
        a_frame(mb, (sx * 0.55, 0.5, -0.3), (sx * 0.55, 1.4, -0.3), (sx * 2.0, 2.25, -0.2), 0.035, K)
        conduit(mb, (sx * 0.6, 1.3, 0.16), (sx * 2.05, 2.45, 0.14), 0.03, K, clamps=4)
        P = SHull([(-3.7, 0.42, 0.42, 0.0, cx), (-3.35, 0.64, 0.62, 0.0, cx), (-1.0, 0.64, 0.62, 0.0, cx),
                   (0.3, 0.44, 0.42, 0.0, cx), (0.75, 0.14, 0.14, 0.0, cx)], PP, step=0.1)
        P.build(mb, K['gunmetal'])
        plates(mb, P, [-3.68, -3.2, -2.7, -2.2, -1.7, -1.2, -0.7, -0.2, 0.7], [-0.5 + 3 * k for k in range(9)],
               lambda i, j: K['paint_a'] if i not in (1, 4, 7) else K['paint_b'], thick=0.035, gs=0.045, gp=0.08,
               ch=0.025)
        nozzle(mb, V((cx, 3.72, 0.0)), (0, 1, 0), 0.24, K, petals=10, seg=20)
        cy(mb, W, (cx, -0.7, 0.0), (cx, -1.25, 0.0), 0.03, 0.01, K['metal'], seg=8)
        blister(mb, HM(P, -0.3, p_of(90, NP, sx), 0.035), 0.07, K)
        pos, n = P.pt(-1.6, p_of(0, NP, sx), 0.035)
        navlamp(mb, pos, n, K, 'lamp_red' if sx > 0 else 'lamp_green', 0.05)
        rcs(mb, HM(P, 0.0, p_of(0, NP, sx), 0.035), 0.14, K)
        rcs(mb, HM(P, -3.3, p_of(0, NP, sx), 0.035), 0.14, K)
        vent(mb, HM(P, -2.5, p_of(90, NP, sx), 0.035), 0.22, 0.5, 6, K)
        stencil_bars(mb, HM(P, -1.7, p_of(40, NP, sx), 0.038), 3, 0.08, 0.04, 0.04, K['gunmetal'])
    return finish(mb, 'interceptor_c')
