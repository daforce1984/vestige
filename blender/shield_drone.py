"""VANGUARD's SHIELD DRONE (2026-10-07), after the Codex design sheet assets/tex/src/shield_drone_concept_v1.png.

Built in the frame of enemy_ms.glb's 'shield' part (so the film places it with the same matrix — duel.js shieldDrone /
fk.shield): glTF +X = the face's normal (front face at x ≈ 1.8, back at ≈ 0.3), +Y = the long axis (top 1.65, tip -6.9),
+Z = across (-1.58 .. 1.92, centre 0.17). One node, 'shield' (the film's hole / scorch effects address that part).
Front: an armoured gunmetal rim round oxblood plates either side of a raised spine with two clamp blocks, a glowing slot,
a hazard-yellow stripe and the unit number '07', yellow edge lights. Back: a frame and spine, four main thruster nozzles
(two near the top corners, two at the start of the taper — shots.js DRONE_JETS), a magenta sensor eye, a glowing energy
strip, heat-sink fins, hazard-striped docking clamps, attitude-thruster ports on the edges.
Build: blender -b --factory-startup --python blender/build_models.py -- shield_drone"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from lib import MB, reg

ZC = 0.17                                   # the plate's centre across


def G(x, y, z):                             # glTF (part frame) -> Blender
    return (x, -z, y)


def palette():
    reg('red', (0.2, 0.018, 0.022), 0.35, 0.36)            # oxblood enamel
    reg('charcoal', (0.07, 0.072, 0.08), 0.55, 0.45)
    reg('frame', (0.2, 0.205, 0.22), 0.85, 0.32)            # machined gunmetal
    reg('metal', (0.34, 0.34, 0.36), 0.9, 0.3)
    reg('hazard', (0.85, 0.6, 0.05), 0.2, 0.45)
    reg('hazard_k', (0.02, 0.02, 0.02), 0.2, 0.5)
    reg('decal_white', (0.85, 0.85, 0.83), 0.1, 0.5)
    reg('nozzle', (0.05, 0.05, 0.055), 0.9, 0.35)
    reg('glow_y', (0.9, 0.6, 0.1), 0.0, 0.3, (1.0, 0.68, 0.15), 0.5)
    reg('eye', (0.8, 0.1, 0.6), 0.0, 0.3, (1.0, 0.12, 0.85), 4.0)
    reg('jet_glow', (0.9, 0.4, 0.1), 0.0, 0.3, (1.0, 0.45, 0.12), 2.0)


# ---------------------------------------------------------------- the outline (z, y) and polygon helpers
HW = 1.75
K = [(ZC - 0.78, 1.65), (ZC + 0.78, 1.65), (ZC + HW, 0.75), (ZC + HW, -2.7), (ZC + 0.18, -6.62), (ZC, -6.9),
     (ZC - 0.18, -6.62), (ZC - HW, -2.7), (ZC - HW, 0.75)]


def _area(p): return 0.5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(p, p[1:] + p[:1]))


def offset(poly, d):
    """inset a convex polygon by d (its edges moved inward)"""
    s = 1 if _area(poly) > 0 else -1
    n = len(poly); lines = []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        ex, ey = b[0] - a[0], b[1] - a[1]; L = math.hypot(ex, ey)
        nx, ny = -ey / L * s, ex / L * s                     # inward normal
        lines.append(((a[0] + nx * d, a[1] + ny * d), (ex, ey)))
    out = []
    for i in range(n):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        den = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(den) < 1e-9: out.append(p2); continue
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den
        out.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
    return out


def clip(poly, nz, ny, c):
    """keep nz*z + ny*y <= c"""
    out = []
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        fa, fb = nz * a[0] + ny * a[1] - c, nz * b[0] + ny * b[1] - c
        if fa <= 0: out.append(a)
        if (fa < 0) != (fb < 0) and fa != fb:
            t = fa / (fa - fb); out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def ring(poly, x): return [G(x, y, z) for (z, y) in poly]


def plate(mb, poly, x0, x1, mat, inset=0.0):
    if len(poly) < 3: return
    mb.loft([ring(poly, x0), ring(offset(poly, inset) if inset else poly, x1)], mat)


def gbox(mb, c, s, mat, bevel=0.0):         # a box in the part frame: centre (x, y, z), size (x, y, z)
    mb.box(G(*c), (s[0], s[2], s[1]), mat, bevel=bevel)


def edge_pad(mb, a, b, t0, t1, inset, w, x0, x1, mat):
    """a strip lying along the outline edge a-b (part of it, t0..t1), inset from it"""
    ex, ey = b[0] - a[0], b[1] - a[1]; L = math.hypot(ex, ey)
    nx, ny = -ey / L, ex / L
    cz, cy = (a[0] + b[0]) / 2 - ZC, (a[1] + b[1]) / 2 + 1.8
    if nx * cz + ny * cy > 0: nx, ny = -nx, -ny             # (point the normal inward, toward the plate's middle)
    P = lambda t, o: (a[0] + ex * t + nx * o, a[1] + ey * t + ny * o)
    q = [P(t0, inset), P(t1, inset), P(t1, inset + w), P(t0, inset + w)]
    mb.hexa([G(x0, y, z) for (z, y) in q] + [G(x1, y, z) for (z, y) in q], mat)


def text07(mb, height, centre_zy, x):
    """the unit number as real geometry (Blender's font), laid on the face reading left to right from the front"""
    cu = bpy.data.curves.new('n07', 'FONT'); cu.body = '07'; cu.size = height * 1.32; cu.extrude = 0.015
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    ob = bpy.data.objects.new('n07', cu); bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get(); me = ob.evaluated_get(dg).to_mesh().copy()
    bpy.data.objects.remove(ob); bpy.data.curves.remove(cu)
    # seen from the front (looking along -X, up +Z) the viewer's right is Blender +Y (= glTF -Z)
    zc, yc = centre_zy; o = Vector(G(x, yc, zc))
    M = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))   # local X -> Blender +Y, local Y -> +Z, local Z -> +X
    M.translation = o
    me.transform(M)
    n0 = len(mb.bm.faces); mb.bm.from_mesh(me); mi = mb._mi('decal_white')
    for f in list(mb.bm.faces)[n0:]: f.material_index = mi
    bpy.data.meshes.remove(me)


def shield_drone():
    palette()
    mb = MB()
    # ---- the body: core plate, back plate, rim
    plate(mb, K, 0.95, 1.22, 'charcoal')
    plate(mb, offset(K, 0.22), 0.78, 0.95, 'charcoal')
    Ki = offset(K, 0.24)
    for i in range(len(K)):
        a, b, ai, bi = K[i], K[(i + 1) % len(K)], Ki[i], Ki[(i + 1) % len(K)]
        q = [a, b, bi, ai]
        mb.hexa([G(0.86, y, z) for (z, y) in q] + [G(1.78, y, z) for (z, y) in q], 'frame', bevel=0.02)
    # ---- the face: oxblood plates either side of the spine, split at the taper
    A = offset(K, 0.3)
    for side in (-1, 1):
        half = clip(A, side * -1, 0, side * -1 * (ZC + side * 0.27))     # keep the side away from the spine
        up = clip(half, 0, -1, 2.68)                                        # y >= -2.68
        lo = clip(half, 0, 1, -2.8)                                         # y <= -2.8
        plate(mb, up, 1.22, 1.6, 'red', inset=0.06)
        plate(mb, lo, 1.22, 1.6, 'red', inset=0.06)
        # a panel line: the upper plate's outer third a separate, slightly lower plate
        out = clip(up, -side, 0, -side * (ZC + side * 1.15))
        plate(mb, out, 1.22, 1.64, 'red', inset=0.04)
    # ---- the spine, its clamp blocks and glowing slots
    gbox(mb, (1.5, -2.3, ZC), (0.6, 7.3, 0.42), 'frame', bevel=0.03)
    gbox(mb, (1.81, -1.42, ZC), (0.04, 1.3, 0.12), 'glow_y')
    gbox(mb, (1.81, -4.7, ZC), (0.04, 1.5, 0.12), 'glow_y')
    for y in (-0.45, -2.45):
        gbox(mb, (1.6, y, ZC), (0.8, 0.62, 1.0), 'metal', bevel=0.05)
        gbox(mb, (2.02, y, ZC), (0.06, 0.4, 0.7), 'charcoal')
        for dz in (-0.42, 0.42): gbox(mb, (1.65, y, ZC + dz), (0.82, 0.66, 0.1), 'frame')
    # ---- the hazard stripe and the unit number
    gbox(mb, (1.655, -0.0, ZC - 0.62), (0.03, 2.7, 0.07), 'hazard')            # (glTF -Z = the viewer's right, from the front)
    gbox(mb, (1.655, -1.31, ZC - 0.82), (0.03, 0.07, 0.42), 'hazard')
    text07(mb, 0.5, (ZC - 1.04, 0.55), 1.655)   # (over the raised outer panel, 1.64)
    # ---- yellow edge lights on the rim's front
    n = len(K)
    for i, (t0, t1) in ((0, (0.3, 0.7)), (1, (0.3, 0.7)), (8, (0.3, 0.7))):
        edge_pad(mb, K[i], K[(i + 1) % n], t0, t1, 0.08, 0.08, 1.78, 1.81, 'glow_y')
    for i in (2, 7):
        for t0 in (0.12, 0.5): edge_pad(mb, K[i], K[(i + 1) % n], t0, t0 + 0.14, 0.08, 0.08, 1.78, 1.81, 'glow_y')
    for i in (3, 6):
        edge_pad(mb, K[i], K[(i + 1) % n], 0.18, 0.62, 0.08, 0.1, 1.78, 1.81, 'glow_y')
    gbox(mb, (1.8, -6.35, ZC), (0.03, 0.18, 0.14), 'glow_y')
    # ---- the back: spine, energy strip, armour panels, fins, eye, clamps
    gbox(mb, (0.66, -2.3, ZC), (0.5, 7.4, 0.56), 'frame', bevel=0.03)
    gbox(mb, (0.4, -0.25, ZC), (0.03, 1.5, 0.12), 'glow_y')
    gbox(mb, (0.4, -3.4, ZC), (0.03, 2.8, 0.12), 'glow_y')
    B = offset(K, 0.45)
    for side in (-1, 1):
        half = clip(B, side * -1, 0, side * -1 * (ZC + side * 0.4))
        mid = clip(clip(half, 0, 1, -0.35), 0, -1, 2.6)                  # between the nozzles (y -0.35 .. -2.6)
        lo = clip(clip(half, 0, 1, -4.0), 0, -1, 5.9)
        plate(mb, mid, 0.78, 0.6, 'red', inset=0.05)
        plate(mb, lo, 0.78, 0.6, 'red', inset=0.05)
        for k in range(6):                                                 # heat-sink fins
            gbox(mb, (0.68, -1.15 - k * 0.24, ZC + side * 1.22), (0.2, 0.08, 0.5), 'frame')
        gbox(mb, (0.5, -1.75, ZC + side * 0.55), (0.24, 0.6, 0.32), 'metal', bevel=0.03)   # docking clamps
        for k in range(3): gbox(mb, (0.37, -1.55 - k * 0.2, ZC + side * 0.55), (0.02, 0.1, 0.3), 'hazard' if k % 2 == 0 else 'hazard_k')
    gbox(mb, (0.62, 1.1, ZC), (0.3, 0.5, 0.5), 'frame', bevel=0.04)       # the sensor eye
    mb.cyl(G(0.47, 1.1, ZC), G(0.44, 1.1, ZC), 0.16, 0.16, 'eye', seg=16)
    # ---- four main thrusters (housing + bell + glowing throat), pointing back (-X)
    for (y, dz) in ((0.55, 0.9), (0.55, -0.9), (-3.25, 0.8), (-3.25, -0.8)):
        z = ZC + dz
        mb.cyl(G(0.95, y, z), G(0.62, y, z), 0.6, 0.6, 'frame', seg=20)
        mb.cyl(G(0.62, y, z), G(0.56, y, z), 0.64, 0.64, 'metal', seg=20)
        mb.nozzle(G(0.6, y, z), (-1, 0, 0), 0.44, 'nozzle', 'jet_glow', length=0.34, seg=20)
    # ---- attitude-thruster ports on the edges
    for (y, z) in ((-1.0, ZC + HW - 0.05), (-1.0, ZC - HW + 0.05), (1.6, ZC + 0.4), (1.6, ZC - 0.4), (-6.2, ZC)):
        gbox(mb, (1.3, y, z), (0.5, 0.22, 0.22), 'nozzle')
        gbox(mb, (1.3, y + (0.12 if y > 1 else -0.12 if y < -6 else 0), z + (0 if abs(z - ZC) < 1 else 0.12 * (1 if z > ZC else -1))), (0.3, 0.06, 0.06), 'glow_y')
    return [mb.to_object('shield', smooth_angle=30)]
