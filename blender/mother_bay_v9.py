"""v9: breached starboard hangar bay of the mothership + the debris/people that get sucked out of it.

  assets/mother_bay.glb  - hangar interior modelled directly in MOTHERSHIP space (glTF axes: +Z forward, +Y up,
                           +X starboard, metres), box x 4..60, y -18..38, z -28..108, open side at x = 60
                           (facing the melted hull hole centred at (62, 10, 40), r <= 45). One node, merged
                           per material.
  assets/bay_props.glb   - separate tumbling parts, each centred on its own origin:
                           crate0 crate1 container barrel tank panel0 panel1 rib cable toolcart seat person0..3

All geometry is authored in glTF coordinates and rotated into Blender space (x, -z, y) at the end, so the
exporter's export_yup conversion maps it back to exactly these numbers.

Usage (from WSL):
  B="/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
  "$B" -b --factory-startup --python "$(wslpath -w blender/mother_bay_v9.py)"            # build + export both
  "$B" -b --factory-startup --python "$(wslpath -w blender/mother_bay_v9.py)" -- render  # preview PNGs
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector, Matrix, noise
import lib
from lib import MB, reg, rng, lerp, D2R

ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
OUT = os.path.join(HERE, 'previews')
LIGHT_SCALE = 1.0
TO_BLENDER = Matrix.Rotation(math.radians(90), 4, 'X')   # glTF (x, y, z) -> Blender (x, -z, y)

# bay box
XB, XO = 4.0, 60.0          # back wall outer face, open side
YF, YC = -17.0, 37.0        # floor top, ceiling underside
ZA, ZB = -27.0, 107.0       # inner faces of the end bulkheads
Y2, X2 = 0.0, 28.0          # deck 2 top / edge
Y3, X3 = 16.0, 17.0         # deck 3 top / edge
RIBS = [-23.0 + 9.0 * k for k in range(15)]   # -23 .. 103
HOLE_C, HOLE_R = (10.0, 40.0), 45.0


def in_hole(y, z, margin=0.0):
    return (y - HOLE_C[0]) ** 2 + (z - HOLE_C[1]) ** 2 < (HOLE_R - margin) ** 2


def ntris(mb):
    return sum(len(f.verts) - 2 for f in mb.bm.faces)


# =====================================================================================  geometry helpers
def frame_from(d, up):
    a = Vector(d).normalized()
    up = Vector(up)
    u = up - a * up.dot(a)
    if u.length < 1e-6:
        u = Vector((1, 0, 0)) - a * a.x
    u.normalize()
    s = u.cross(a)
    return s, u, a


def ob(mb, p0, p1, sw, sh, mat, up=(0, 1, 0), bevel=0.0, off=(0.0, 0.0)):
    """Box from p0 to p1 (length axis), sw along side axis, sh along the 'up' axis."""
    p0, p1 = Vector(p0), Vector(p1)
    s, u, a = frame_from(p1 - p0, up)
    M = Matrix((s, u, a)).transposed().to_4x4()
    M.translation = (p0 + p1) / 2 + s * off[0] + u * off[1]
    M = M @ Matrix.Diagonal((sw, sh, (p1 - p0).length, 1.0))
    r = bmesh.ops.create_cube(mb.bm, size=1.0, matrix=M)
    mb._fin(mb._faces_of(r['verts']), mat, bevel)


def ibeam(mb, p0, p1, depth, width, mat, dn, tw=0.3, tf=0.22, flange_mat=None):
    """I-beam p0->p1, depth measured along dn, flanges perpendicular to dn."""
    ob(mb, p0, p1, tw, depth, mat, up=dn)
    for sg in (1, -1):
        ob(mb, p0, p1, width, tf, flange_mat or mat, up=dn, off=(0, sg * (depth - tf) / 2))


def tube(mb, pts, r, mat, seg=8, caps=True):
    pts = [Vector(p) for p in pts]
    n = len(pts)
    rs = r if isinstance(r, (list, tuple)) else [r] * n
    t0 = (pts[1] - pts[0]).normalized()
    nrm = t0.orthogonal().normalized()
    rings = []
    for i in range(n):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        nrm = (nrm - t * nrm.dot(t)).normalized()
        b = t.cross(nrm)
        rings.append([pts[i] + (nrm * math.cos(k / seg * 2 * math.pi) + b * math.sin(k / seg * 2 * math.pi)) * rs[i]
                      for k in range(seg)])
    mb.loft(rings, mat, cap0=caps, cap1=caps)


def sag(p0, p1, drop, n=7, side=(0, 0, 0)):
    p0, p1, side = Vector(p0), Vector(p1), Vector(side)
    return [p0.lerp(p1, i / n) + Vector((0, -drop * 4 * (i / n) * (1 - i / n), 0)) + side * 4 * (i / n) * (1 - i / n)
            for i in range(n + 1)]


def hazard_band(mb, p0, p1, width, nrm=(0, 1, 0), stripe=1.0, base=True, lift=0.0):
    """Yellow/black diagonal stripes on a surface with normal nrm, running p0->p1."""
    p0, p1, nrm = Vector(p0), Vector(p1), Vector(nrm).normalized()
    a = (p1 - p0)
    L = a.length
    a.normalize()
    s = nrm.cross(a)
    if base:
        ob(mb, p0 + nrm * lift, p1 + nrm * lift, width, 0.03, 'hazard_k', up=nrm, off=(0, 0.015))
    n = max(1, int(L / stripe))
    q = stripe / 4
    sh = width * 0.5
    for k in range(n):
        c = p0 + a * ((k + 0.5) * L / n) + nrm * (lift + 0.02)
        pts2 = [(-q - sh, -width / 2), (q - sh, -width / 2), (q + sh, width / 2), (-q + sh, width / 2)]
        pts2 = [(max(-L / 2 + 1e-3 - ((k + 0.5) * L / n - L / 2), x), y) for x, y in pts2]
        bot = [c + a * x + s * y for x, y in pts2]
        top = [p + nrm * 0.03 for p in bot]
        mb.hexa(bot + top, 'hazard')


def railing(mb, p0, p1, h=1.1, spacing=2.0, mat='steel', toe=True):
    p0, p1 = Vector(p0), Vector(p1)
    L = (p1 - p0).length
    n = max(1, int(L / spacing))
    up = Vector((0, 1, 0))
    for i in range(n + 1):
        p = p0.lerp(p1, i / n)
        ob(mb, p, p + up * h, 0.08, 0.08, mat, up=(p1 - p0))
    mb.cyl(p0 + up * h, p1 + up * h, 0.05, 0.05, mat, seg=6)
    mb.cyl(p0 + up * h * 0.55, p1 + up * h * 0.55, 0.035, 0.035, mat, seg=5)
    if toe:
        ob(mb, p0 + up * 0.1, p1 + up * 0.1, 0.03, 0.2, 'rib')


def stairs(mb, x0, x1, z_bot, y_bot, z_top, y_top, rails=True):
    rise = 0.28
    n = int(round((y_top - y_bot) / rise))
    rise = (y_top - y_bot) / n
    dz = (z_top - z_bot) / n
    xc = (x0 + x1) / 2
    w = abs(x1 - x0)
    for i in range(n):
        y = y_bot + (i + 1) * rise
        z = z_bot + (i + 0.5) * dz
        mb.box((xc, y - 0.04, z), (w, 0.08, abs(dz) + 0.06), 'grating')
        if i % 4 == 0:
            mb.box((xc, y + 0.001, z + dz * 0.45), (w, 0.02, 0.06), 'hazard')
    for x in (x0, x1):
        ob(mb, (x, y_bot - 0.3, z_bot - dz * 0.5), (x, y_top - 0.3, z_top + dz * 0.5), 0.12, 0.5, 'rib', up=(0, 1, 0))
        if rails:
            a, b = Vector((x, y_bot + 1.0, z_bot)), Vector((x, y_top + 1.0, z_top))
            mb.cyl(a, b, 0.05, 0.05, 'steel', seg=6)
            for i in range(0, n + 1, 5):
                p = a.lerp(b, i / n)
                mb.box(p - Vector((0, 0.5, 0)), (0.06, 1.0, 0.06), 'steel')
    # support legs
    for f in (0.35, 0.7):
        yb = lerp(y_bot, y_top, f)
        zb = lerp(z_bot, z_top, f)
        for x in (x0, x1):
            ob(mb, (x, y_bot - 0.05, zb), (x, yb - 0.4, zb), 0.25, 0.25, 'rib', up=(0, 0, 1))


def beacon(mb, p, nrm=(0, 1, 0), mat='amber', r=0.22):
    p, nrm = Vector(p), Vector(nrm).normalized()
    mb.cyl(p, p + nrm * 0.12, r * 1.3, r * 1.3, 'deck_dark', seg=8)
    mb.cyl(p + nrm * 0.12, p + nrm * (0.12 + r * 1.4), r, r * 0.75, mat, seg=8)


def crate(mb, c, s, mat, yaw=0.0):
    c = Vector(c)
    mb.box(c, s, mat, rot=(0, yaw, 0), bevel=0.05)
    # two straps / frame bands
    for f in (-0.3, 0.3):
        off = Vector((s[0] * f, 0, 0))
        R = Matrix.Rotation(yaw * D2R, 3, 'Y')
        mb.box(c + R @ off, (0.12, s[1] + 0.04, s[2] + 0.04), 'crate_frame', rot=(0, yaw, 0))


def container(mb, c, L, W, H, mat, along='z', ribs=True, marks=True):
    """Cargo container, long axis along z or x, c = centre of the bottom face."""
    c = Vector(c)
    ax = Vector((0, 0, 1)) if along == 'z' else Vector((1, 0, 0))
    sd = Vector((1, 0, 0)) if along == 'z' else Vector((0, 0, 1))
    up = Vector((0, 1, 0))
    ctr = c + up * (H / 2)
    size = (W, H, L) if along == 'z' else (L, H, W)
    mb.box(ctr, size, mat)
    # corner posts + rails
    for i in (-1, 1):
        for j in (-1, 1):
            p = ctr + ax * (i * (L / 2 - 0.1)) + sd * (j * (W / 2 - 0.05))
            ob(mb, p - up * H / 2, p + up * H / 2, 0.22, 0.22, 'crate_frame', up=ax)
        for yy in (-H / 2 + 0.1, H / 2 - 0.1):
            p = ctr + sd * (i * (W / 2 - 0.02)) + up * yy
            ob(mb, p - ax * L / 2, p + ax * L / 2, 0.12, 0.2, 'crate_frame', up=up)
    if ribs:
        n = int(L / 0.7)
        for k in range(1, n):
            t = -L / 2 + k * L / n
            for j in (-1, 1):
                p = ctr + ax * t + sd * (j * (W / 2 + 0.03))
                ob(mb, p - up * (H / 2 - 0.2), p + up * (H / 2 - 0.2), 0.06, 0.18, mat, up=ax)
    # door bars on the +end
    for j in (-0.3, -0.1, 0.1, 0.3):
        p = ctr + ax * (L / 2 + 0.04) + sd * (j * W)
        ob(mb, p - up * (H / 2 - 0.15), p + up * (H / 2 - 0.15), 0.08, 0.08, 'steel', up=sd)
    if marks:
        p = ctr + sd * (W / 2 + 0.02) + up * (H * 0.25)
        ob(mb, p - ax * L * 0.15, p + ax * L * 0.15, 0.04, 0.35, 'floor_line', up=up)


# =====================================================================================  bay materials
def bay_palette():
    reg('deck', (0.135, 0.14, 0.148), 0.7, 0.55)
    reg('deck_dark', (0.06, 0.063, 0.068), 0.65, 0.6)
    reg('grating', (0.22, 0.225, 0.235), 0.85, 0.4)
    reg('floor_line', (0.72, 0.70, 0.62), 0.1, 0.6)
    reg('wall', (0.16, 0.165, 0.175), 0.65, 0.5)
    reg('wall_dark', (0.075, 0.078, 0.085), 0.6, 0.55)
    reg('panel_light', (0.30, 0.305, 0.315), 0.6, 0.45)
    reg('rib', (0.25, 0.255, 0.27), 0.8, 0.38)
    reg('steel', (0.55, 0.56, 0.58), 0.95, 0.25)
    reg('pipe', (0.30, 0.26, 0.20), 0.7, 0.45)
    reg('pipe_coolant', (0.10, 0.20, 0.30), 0.6, 0.45)
    reg('pipe_fuel', (0.36, 0.08, 0.05), 0.5, 0.5)
    reg('cable', (0.03, 0.03, 0.035), 0.2, 0.7)
    reg('hazard', (0.85, 0.55, 0.03), 0.2, 0.5)
    reg('hazard_k', (0.02, 0.02, 0.022), 0.2, 0.6)
    reg('machine', (0.78, 0.46, 0.05), 0.35, 0.45)
    reg('crate', (0.26, 0.28, 0.19), 0.3, 0.65)
    reg('crate2', (0.45, 0.25, 0.09), 0.3, 0.6)
    reg('crate_frame', (0.18, 0.18, 0.19), 0.8, 0.4)
    reg('container', (0.34, 0.09, 0.05), 0.4, 0.55)
    reg('container2', (0.07, 0.17, 0.28), 0.4, 0.55)
    reg('tank', (0.52, 0.53, 0.52), 0.4, 0.45)
    reg('craft', (0.40, 0.42, 0.44), 0.5, 0.4)
    reg('craft_teal', (0.03, 0.36, 0.38), 0.4, 0.4)
    reg('craft_dark', (0.05, 0.055, 0.06), 0.8, 0.4)
    reg('canopy', (0.02, 0.03, 0.04), 0.1, 0.08)
    reg('scorch', (0.022, 0.02, 0.018), 0.3, 0.85)
    reg('lamp', (0.4, 0.38, 0.33), 0.0, 0.3, (1.0, 0.93, 0.80), 6.0)
    reg('amber', (0.5, 0.3, 0.05), 0.0, 0.3, (1.0, 0.55, 0.08), 6.0)
    reg('blue_light', (0.1, 0.25, 0.4), 0.0, 0.3, (0.25, 0.62, 1.0), 5.0)
    reg('window', (0.15, 0.2, 0.25), 0.0, 0.1, (0.55, 0.75, 0.95), 1.6)
    reg('fabric', (0.12, 0.15, 0.20), 0.0, 0.9)


# =====================================================================================  bay parts
def build_shell(mb, R):
    # --- main floor: plates between ribs (seams), torn edge in the breach zone
    xs = [5.0, 12.0, 19.0, 26.0, 33.0, 40.0, 47.0, 54.0, XO]
    zs = [ZA] + RIBS + [ZB]
    for zi, (za, zb) in enumerate(zip(zs, zs[1:])):
        zc = (za + zb) / 2
        for xi, (xa, xb) in enumerate(zip(xs, xs[1:])):
            mat = 'deck' if (xi + zi) % 3 else 'deck_dark'
            if xb == XO and in_hole(YF, zc, -6):
                xcut = XO - R.uniform(1.5, 5.0)
                mb.box(((xa + xcut) / 2, YF - 0.5, zc), (xcut - xa - 0.08, 1.0, zb - za - 0.08), mat)
                # scorched rim + torn shards hanging down
                mb.box((xcut - 0.7, YF + 0.01, zc), (1.4, 0.04, zb - za - 0.3), 'scorch')
                z = za + 0.2
                while z < zb - 0.8:
                    wz = R.uniform(1.2, 3.0)
                    wz = min(wz, zb - 0.2 - z)
                    ang = R.uniform(-12, 55) * D2R
                    Ls = min(R.uniform(1.5, 4.5), (XO - 0.6 - xcut) / max(0.2, math.cos(ang)))
                    d = Vector((math.cos(ang), math.sin(ang), 0))
                    h = Vector((xcut, YF - 0.25, z + wz / 2))
                    ob(mb, h, h + d * Ls, 0.45, wz, 'scorch' if R.random() < 0.6 else mat, up=(0, 0, 1))
                    z += wz + R.uniform(0.1, 0.6)
            else:
                mb.box(((xa + xb) / 2, YF - 0.5, zc), (xb - xa - 0.08, 1.0, zb - za - 0.08), mat)
    # sub-floor slab under seams
    mb.box(((XB + XO - 6) / 2, YF - 0.95, (ZA + ZB) / 2), (XO - 6 - XB, 0.1, ZB - ZA), 'wall_dark')
    # floor grating trench along z at x = 33
    for x in (32.3, 33.7):
        mb.box((x, YF + 0.02, (ZA + ZB) / 2), (0.12, 0.06, ZB - ZA - 1), 'grating')
    z = ZA + 1
    while z < ZB - 1:
        mb.box((33.0, YF + 0.03, z), (1.5, 0.05, 0.1), 'grating')
        z += 0.6
    mb.box((33.0, YF - 0.2, (ZA + ZB) / 2), (1.4, 0.1, ZB - ZA - 1), 'hazard_k')
    # painted walkway lines along z
    for x in (30.5, 35.5, 52.5):
        z = ZA + 1.5
        while z < ZB - 2:
            mb.box((x, YF + 0.015, z + 1.5), (0.2, 0.03, 3.0), 'floor_line')
            z += 4.5

    # --- back wall (outer face x = 4) + panels between ribs
    mb.box((XB + 0.5, (YF - 1 + YC + 1) / 2, (ZA + ZB) / 2), (1.0, YC - YF + 2, ZB - ZA + 2), 'wall_dark')
    rows = [(-16.5, -10.2), (-9.8, -2.4), (0.6, 7.6), (8.0, 15.0), (16.6, 23.5), (24.0, 30.5), (31.0, 35.8)]
    for za, zb in zip(RIBS, RIBS[1:]):
        for ri, (ya, yb) in enumerate(rows):
            mat = 'panel_light' if (ri + int(za)) % 4 == 0 else 'wall'
            mb.box((5.12, (ya + yb) / 2, (za + zb) / 2), (0.25, yb - ya, zb - za - 1.4), mat, bevel=0.05)
    for za, zb in ((ZA, RIBS[0]), (RIBS[-1], ZB)):
        mb.box((5.12, (YF + YC) / 2, (za + zb) / 2), (0.25, YC - YF - 1, zb - za - 0.5), 'wall')

    # --- ceiling slab + coffers
    mb.box(((XB + XO) / 2, YC + 0.5, (ZA + ZB) / 2), (XO - XB, 1.0, ZB - ZA + 2), 'wall_dark')
    for za, zb in zip([ZA] + RIBS, RIBS + [ZB]):
        for xa, xb in ((6, 20), (21, 35), (36, 49), (50, 58.5)):
            zc = (za + zb) / 2
            if xb > 55 and in_hole(YC, zc, -6):
                continue
            mb.box(((xa + xb) / 2, YC - 0.15, zc), (xb - xa, 0.3, zb - za - 1.4), 'wall', bevel=0.04)
    # --- end bulkheads
    for zf, sg in ((ZA, -1), (ZB, 1)):
        mb.box(((XB + XO) / 2, (YF + YC) / 2, zf + sg * 0.5), (XO - XB, YC - YF + 2, 1.0), 'wall_dark')
        for xa, xb in ((5.5, 16.5), (17.5, 27.5), (28.5, 30.5), (57.5, 59.8)):
            for ya, yb in ((YF, -9), (-8.5, -0.5), (0.5, 8), (8.5, 15.5), (16.5, 26), (26.5, 36.5)):
                if xa >= 28.5 and yb <= 16:
                    pass
                mb.box(((xa + xb) / 2, (ya + yb) / 2, zf - sg * 0.1), (xb - xa - 0.2, yb - ya - 0.2, 0.2),
                       'wall' if (int(xa) + int(ya)) % 3 else 'panel_light', bevel=0.04)
        # upper wall above the big door
        for xa, xb in ((30.5, 44), (44, 57.5)):
            for ya, yb in ((16.5, 26), (26.5, 36.5)):
                mb.box(((xa + xb) / 2, (ya + yb) / 2, zf - sg * 0.1), (xb - xa - 0.2, yb - ya - 0.2, 0.2),
                       'wall', bevel=0.04)


def build_bulkhead_door(mb, zf, sg, R):
    """Big launch bulkhead door in the end wall at z = zf (sg = direction out of the bay)."""
    x0, x1, y0, y1 = 31.0, 57.0, YF, 14.0
    zi = zf - sg * 0.35
    xc = (x0 + x1) / 2
    # leaves
    for xa, xb in ((x0, xc), (xc, x1)):
        mb.box(((xa + xb) / 2, (y0 + y1) / 2, zf - sg * 0.2), (xb - xa - 0.1, y1 - y0, 0.5), 'wall_dark')
        for k in range(6):
            y = y0 + 2.5 + k * 5.0
            mb.box(((xa + xb) / 2, y, zi - sg * 0.1), (xb - xa - 1.6, 0.6, 0.3), 'rib', bevel=0.05)
        for x in (xa + 1.2, xb - 1.2):
            mb.box((x, (y0 + y1) / 2, zi - sg * 0.1), (0.7, y1 - y0 - 1, 0.3), 'rib', bevel=0.05)
    # centre seam hazard teeth
    for k in range(14):
        y = y0 + 0.9 + k * 2.2
        mb.box((xc + (0.35 if k % 2 else -0.35), y, zi - sg * 0.3), (0.7, 1.1, 0.12), 'hazard' if k % 2 else 'hazard_k')
    # heavy frame
    for x in (x0 - 1.0, x1 + 1.0):
        mb.box((x, (y0 + y1 + 2) / 2, zi - sg * 0.4), (2.0, y1 - y0 + 2, 1.4), 'rib', bevel=0.1)
        hazard_band(mb, (x, y0 + 0.2, zi - sg * 1.12), (x, y1, zi - sg * 1.12), 1.4, nrm=(0, 0, -sg), stripe=1.4)
    mb.box((xc, y1 + 1.0, zi - sg * 0.4), (x1 - x0 + 4, 2.0, 1.4), 'rib', bevel=0.1)
    hazard_band(mb, (x0 - 1.8, y1 + 1.0, zi - sg * 1.12), (x1 + 1.8, y1 + 1.0, zi - sg * 1.12), 1.4, nrm=(0, 0, -sg),
                stripe=1.4)
    # amber beacons + status lights over the door
    for x in (x0 + 2, xc, x1 - 2):
        beacon(mb, (x, y1 + 2.0, zi - sg * 0.4), nrm=(0, 1, 0))
    for k in range(8):
        mb.box((x0 + 3 + k * 2.9, y1 + 0.3, zi - sg * 1.15), (1.6, 0.25, 0.08), 'blue_light')
    # door floor sill + guide track
    hazard_band(mb, (x0, YF + 0.01, zf - sg * 2.2), (x1, YF + 0.01, zf - sg * 2.2), 1.6, stripe=1.3)
    # personnel doors on the other levels of this wall
    for (x, y) in ((11.0, YF), (22.0, YF), (11.0, Y2), (22.0, Y2), (11.0, Y3)):
        mb.box((x, y + 2.1, zi - sg * 0.1), (2.2, 4.2, 0.3), 'wall_dark')
        for xx in (x - 1.35, x + 1.35):
            mb.box((xx, y + 2.3, zi - sg * 0.2), (0.4, 4.6, 0.5), 'hazard', bevel=0.03)
        mb.box((x, y + 4.8, zi - sg * 0.2), (3.1, 0.4, 0.5), 'hazard_k')
        mb.box((x, y + 5.25, zi - sg * 0.25), (0.6, 0.25, 0.2), 'amber')
        mb.box((x + 1.9, y + 1.5, zi - sg * 0.25), (0.35, 0.5, 0.1), 'blue_light')


def build_decks(mb, R):
    for (yt, xe, th) in ((Y2, X2, 0.9), (Y3, X3, 0.8)):
        # slab in plates (seams)
        zs = [ZA] + RIBS + [ZB]
        for zi, (za, zb) in enumerate(zip(zs, zs[1:])):
            for xi, (xa, xb) in enumerate(((5.25, (5.25 + xe) / 2), ((5.25 + xe) / 2, xe))):
                mb.box(((xa + xb) / 2, yt - th / 2, (za + zb) / 2), (xb - xa - 0.06, th, zb - za - 0.06),
                       'deck' if (xi + zi) % 3 else 'deck_dark')
        # underside transverse beams at each rib + longitudinal edge girder
        for z in RIBS:
            ob(mb, (5.5, yt - th - 0.6, z), (xe, yt - th - 0.6, z), 0.5, 1.2, 'rib')
        ob(mb, (xe - 0.3, yt - th - 0.7, ZA), (xe - 0.3, yt - th - 0.7, ZB), 0.6, 1.4, 'rib')
        # deck edge fascia + hazard stripe + railing (gap at the stair landings)
        mb.box((xe + 0.12, yt - 0.6, (ZA + ZB) / 2), (0.25, 1.6, ZB - ZA), 'wall_dark')
        hazard_band(mb, (xe - 0.45, yt, ZA + 0.5), (xe - 0.45, yt, ZB - 0.5), 0.7, stripe=1.2)
        gaps = [(74.0, 79.5)] if yt == Y2 else [(1.5, 6.5)]
        segs, z = [], ZA + 0.3
        for ga, gb in gaps:
            segs.append((z, ga))
            z = gb
        segs.append((z, ZB - 0.3))
        for za, zb in segs:
            railing(mb, (xe - 0.12, yt, za), (xe - 0.12, yt, zb), spacing=2.25)
        # edge lights (amber) every other rib, blue strip underneath
        for z in RIBS[::2]:
            beacon(mb, (xe + 0.3, yt - 0.6, z), nrm=(1, 0, 0), r=0.18)
        for z in RIBS[:-1]:
            mb.box((xe + 0.26, yt - 1.2, z + 4.5), (0.06, 0.12, 3.0), 'blue_light')
        # painted walkway lines
        z = ZA + 1
        while z < ZB - 2:
            mb.box((xe - 2.2, yt + 0.012, z + 1.5), (0.18, 0.03, 3.0), 'floor_line')
            z += 4.5
    # support columns under deck 2 (every other rib) and deck 3
    for z in RIBS[1::2]:
        ibeam(mb, (X2 - 0.9, YF, z), (X2 - 0.9, Y2 - 2.3, z), 0.9, 0.9, 'rib', dn=(1, 0, 0))
        mb.box((X2 - 0.9, YF + 0.3, z), (1.6, 0.6, 1.6), 'rib', bevel=0.05)
        hazard_band(mb, (X2 - 0.9, YF + 0.7, z - 0.52), (X2 - 0.9, YF + 3.0, z - 0.52), 0.9, nrm=(0, 0, -1),
                    stripe=0.8, base=False)
    for z in RIBS[::2]:
        ibeam(mb, (X3 - 0.8, Y2, z), (X3 - 0.8, Y3 - 2.0, z), 0.8, 0.8, 'rib', dn=(1, 0, 0))
    # stairs: floor -> deck 2 (lands in the deck-2 railing gap), deck 2 -> deck 3
    stairs(mb, X2 + 0.4, X2 + 2.8, 100.0, YF, 77.0, Y2)
    mb.box((X2 + 1.6, Y2 - 0.1, 76.2), (2.6, 0.2, 2.0), 'grating')
    stairs(mb, X3 + 1.0, X3 + 3.4, -24.0, Y2, 3.5, Y3)
    mb.box((X3 + 2.2, Y3 - 0.1, 4.6), (2.6, 0.2, 2.4), 'grating')
    mb.box((X3 + 0.6, Y3 - 0.1, 4.6), (1.4, 0.2, 2.4), 'grating')


def build_ribs(mb, R):
    D, W = 1.7, 1.2
    for z in RIBS:
        dmg = in_hole(10.0, z, 0)
        # back column + curved haunch + ceiling beam
        col_top = 27.0
        ibeam(mb, (5.9, YF - 0.5, z), (5.9, col_top, z), D, W, 'rib', dn=(1, 0, 0))
        arc = [(5.9 + 12 * (1 - math.cos(a)), col_top + 9.2 * math.sin(a)) for a in
               [i / 5 * math.pi / 2 for i in range(6)]]
        for (xa, ya), (xb, yb) in zip(arc, arc[1:]):
            d = Vector((xb - xa, yb - ya, 0)).normalized()
            dn = Vector((0, 0, 1)).cross(d)
            ibeam(mb, (xa - d.x * 0.3, ya - d.y * 0.3, z), (xb + d.x * 0.3, yb + d.y * 0.3, z), D, W, 'rib', dn=dn)
        # brackets bolted to the back wall + floor shoe
        mb.box((5.6, YF + 0.5, z), (2.4, 1.0, 2.2), 'rib', bevel=0.08)
        for y in (-8, 8, 20):
            mb.box((5.3, y, z), (0.8, 1.6, 2.4), 'deck_dark', bevel=0.05)
        yb = col_top + 9.2 - 0.15
        xend = XO - 0.6
        if not dmg:
            ibeam(mb, (17.9, yb, z), (xend, yb, z), D, W, 'rib', dn=(0, 1, 0))
            ibeam(mb, (XO - 1.4, YF - 0.5, z), (XO - 1.4, yb - 0.8, z), D, W, 'rib', dn=(1, 0, 0))
            ob(mb, (XO - 1.4, 28.0, z), (XO - 9.0, yb - 0.6, z), 0.9, 0.9, 'rib', up=(0, 0, 1))  # knee brace
            mb.box((XO - 1.4, YF + 0.5, z), (2.4, 1.0, 2.2), 'rib', bevel=0.08)
            for y in (-10, 5, 22):
                beacon(mb, (XO - 0.55, y, z), nrm=(1, 0, 0), r=0.16)
        else:
            # ceiling beam torn off near the breach and bent down/outward, scorched tip
            depth = 45 - abs(z - 40)
            xcut = XO - 6.5 - min(depth, 30) * 0.18 - R.uniform(0, 2)
            ibeam(mb, (17.9, yb, z), (xcut, yb, z), D, W, 'rib', dn=(0, 1, 0))
            a1 = R.uniform(15, 35) * D2R
            p1 = Vector((xcut + math.cos(a1) * 3.2, yb - math.sin(a1) * 3.2, z + R.uniform(-0.6, 0.6)))
            ibeam(mb, (xcut - 0.2, yb, z), p1, D * 0.9, W * 0.9, 'rib', dn=(math.sin(a1), math.cos(a1), 0.15))
            a2 = a1 + R.uniform(20, 40) * D2R
            p2 = p1 + Vector((math.cos(a2) * 2.2, -math.sin(a2) * 2.2, R.uniform(-0.8, 0.8)))
            ibeam(mb, p1, p2, D * 0.75, W * 0.7, 'scorch', dn=(math.sin(a2), math.cos(a2), 0.3))
            # stub of the outer column: melted, bent inward
            if R.random() < 0.35:
                h = R.uniform(1.5, 4)
                p0 = Vector((XO - 1.4, YF - 0.5, z))
                p1 = p0 + Vector((0, h, 0))
                ibeam(mb, p0, p1, D, W, 'rib', dn=(1, 0, 0))
                b = R.uniform(25, 60) * D2R
                p2 = p1 + Vector((-math.sin(b) * 2.5, math.cos(b) * 2.5, R.uniform(-0.5, 0.5)))
                ibeam(mb, p1, p2, D * 0.8, W * 0.8, 'scorch', dn=(math.cos(b), math.sin(b), 0))
                mb.box((XO - 1.4, YF + 0.5, z), (2.4, 1.0, 2.2), 'scorch', bevel=0.08)
        # transverse ceiling tie girders between ribs (lighter), every rib bay near the back
        if z != RIBS[-1]:
            for x in (9.0,):
                ob(mb, (x, YC - 0.6, z + 0.6), (x, YC - 0.6, z + 8.4), 0.5, 0.9, 'rib')
    # longitudinal stringers along the back wall top and the open-side edge (outside the breach)
    ob(mb, (6.8, 26.0, ZA), (6.8, 26.0, ZB), 0.5, 0.8, 'rib')
    for (za, zb) in ((ZA, 2.0), (78.0, ZB)):
        ob(mb, (XO - 0.8, YC - 1.0, za), (XO - 0.8, YC - 1.0, zb), 1.2, 1.8, 'rib')
        ob(mb, (XO - 0.8, YF + 0.4, za), (XO - 0.8, YF + 0.4, zb), 1.2, 1.2, 'rib')
    # torn ceiling-edge girder stubs + hanging ceiling plates in the breach
    for zz in (2.0, 78.0):
        sg = 1 if zz < 40 else -1
        p0 = Vector((XO - 0.8, YC - 1.0, zz))
        p1 = p0 + Vector((-0.6, -2.5, sg * 3.0))
        ob(mb, p0, p1, 1.0, 1.4, 'scorch')
    # jagged torn ceiling skin: tapered shards bent down/outward along the breach edge
    z = 6.0
    while z < 75.0:
        w = R.uniform(1.2, 3.0)
        if R.random() < 0.55:
            ang = R.uniform(30, 70) * D2R
            L = R.uniform(1.5, 3.2)
            h = Vector((XO - 0.8 - L * math.cos(ang) - R.uniform(0, 2.5), YC - 0.35, z))
            d = Vector((math.cos(ang), -math.sin(ang), R.uniform(-0.3, 0.3)))
            tipz = R.uniform(0.2, 0.8) * w
            b0, b1 = h, h + Vector((0, 0, w))
            t0 = h + d * L + Vector((0, 0, tipz - 0.15))
            t1 = h + d * L + Vector((0, 0, tipz + 0.15))
            n = Vector((0, 0.18, 0))
            mb.hexa([b0, b1, t1, t0, b0 + n, b1 + n, t1 + n, t0 + n], 'scorch' if R.random() < 0.45 else 'wall')
        z += w + R.uniform(0.2, 1.2)
    # scorch marks on the floor and ceiling near the breach
    for _ in range(26):
        zc = R.uniform(4, 76)
        for yy, sg in ((YF + 0.035, 1), (YC - 0.33, -1)):
            if not in_hole(yy, zc, -8):
                continue
            x = XO - R.uniform(1.0, 9.0) ** 1.0
            sx, sz = R.uniform(1.5, 5.0), R.uniform(1.0, 3.5)
            mb.box((min(x, XO - math.hypot(sx, sz) / 2), yy, zc), (sx, 0.03, sz), 'scorch',
                   rot=(0, R.uniform(0, 180), 0))


def build_ceiling_systems(mb, R):
    yb = YC - 1.8
    # crane rails (hung from ribs)
    rails = (21.0, 50.0)
    for x in rails:
        ibeam(mb, (x, yb - 1.2, ZA + 0.5), (x, yb - 1.2, ZB - 0.5), 1.1, 0.8, 'rib', dn=(0, 1, 0))
        for z in RIBS:
            mb.box((x, yb - 0.4, z), (1.2, 0.8, 0.5), 'deck_dark')
    # bridge cranes: one working (holding a container), one parked
    for zc, x_trolley, hook_y, load in ((33.0, 41.0, 13.0, True), (-12.0, 27.0, 26.0, False)):
        yg = yb - 2.6
        for dz in (-1.3, 1.3):
            ob(mb, (rails[0] - 1.5, yg, zc + dz), (rails[1] + 1.5, yg, zc + dz), 0.8, 1.6, 'machine', up=(0, 1, 0))
        for x in rails:
            mb.box((x, yg + 0.4, zc), (1.8, 1.2, 4.6), 'machine', bevel=0.08)
            mb.box((x, yg + 0.4, zc + 2.35), (1.8, 1.2, 0.1), 'hazard_k')
        hazard_band(mb, (rails[0], yg - 0.82, zc + 1.72), (rails[1], yg - 0.82, zc + 1.72), 0.6, nrm=(0, 0, 1),
                    stripe=1.4, base=False)
        mb.box((x_trolley, yg - 1.3, zc), (3.4, 1.6, 3.8), 'machine', bevel=0.1)     # trolley
        mb.cyl((x_trolley - 1.2, yg - 1.3, zc - 1.95), (x_trolley - 1.2, yg - 1.3, zc + 1.95), 0.6, 0.6, 'rib', seg=12)
        mb.box((x_trolley + 1.72, yg - 1.1, zc), (0.1, 0.4, 1.2), 'amber')
        for dx, dz in ((-0.5, -0.5), (0.5, -0.5), (-0.5, 0.5), (0.5, 0.5)):
            mb.cyl((x_trolley + dx, yg - 2.1, zc + dz), (x_trolley + dx * 0.4, hook_y + 1.3, zc + dz * 0.4), 0.05,
                   0.05, 'cable', seg=5)
        mb.box((x_trolley, hook_y + 0.8, zc), (1.4, 1.2, 1.0), 'machine', bevel=0.08)       # hook block
        hazard_band(mb, (x_trolley - 0.7, hook_y + 0.8, zc + 0.52), (x_trolley + 0.7, hook_y + 0.8, zc + 0.52), 1.0,
                    nrm=(0, 0, 1), stripe=0.5, base=False)
        if load:
            mb.box((x_trolley, hook_y, zc), (0.8, 0.4, 7.0), 'hazard_k')                    # spreader
            for dz in (-3.2, 3.2):
                mb.cyl((x_trolley, hook_y, zc + dz), (x_trolley, hook_y - 1.2, zc + dz), 0.04, 0.04, 'cable', seg=4)
            container(mb, (x_trolley, hook_y - 3.9, zc), 6.1, 2.44, 2.6, 'container2', along='z')
    # ceiling light panels (lamp) between ribs, three rows
    for za, zb in zip(RIBS, RIBS[1:]):
        zm = (za + zb) / 2
        for x in (14.0, 31.0, 44.0):
            if x > 40 and in_hole(YC, zm, 6) and R.random() < 0.5:
                continue
            mb.box((x, YC - 0.45, zm), (2.6, 0.6, 5.2), 'rib', bevel=0.05)
            mb.box((x, YC - 0.8, zm), (2.1, 0.1, 4.7), 'lamp')
    # pipes along the ceiling
    for x, r, m in ((8.5, 0.55, 'pipe'), (9.8, 0.4, 'pipe_coolant'), (26.0, 0.45, 'pipe'), (27.1, 0.3, 'pipe_fuel')):
        mb.cyl((x, YC - 0.8 - r, ZA), (x, YC - 0.8 - r, ZB), r, r, m, seg=10)
    for z in RIBS:
        for x in (9.15, 26.5):
            mb.box((x, YC - 1.0, z + 1.2), (2.4, 0.3, 0.3), 'deck_dark')
    # cable bundles swinging between the ribs along the ceiling
    for za, zb in zip(RIBS, RIBS[1:]):
        for k, (x, dy) in enumerate(((11.5, 1.0), (11.9, 1.3), (12.3, 0.8))):
            tube(mb, sag((x, YC - 2.0, za), (x, YC - 2.0, zb), dy, n=6), 0.09, 'cable', seg=5, caps=False)


def build_walls(mb, R):
    # pipe runs along the back wall, with flanges/brackets at each rib
    runs = [(-14.2, 0.45, 'pipe', 7.4), (-13.0, 0.3, 'pipe_fuel', 7.2), (-4.0, 0.55, 'pipe_coolant', 7.5),
            (10.8, 0.6, 'pipe_fuel', 7.5), (12.3, 0.4, 'pipe', 7.3), (20.5, 0.45, 'pipe_coolant', 7.4),
            (29.5, 0.5, 'pipe', 7.9), (30.7, 0.35, 'pipe', 7.7)]
    for y, r, m, x in runs:
        mb.cyl((x, y, ZA), (x, y, ZB), r, r, m, seg=10)
        for z in RIBS:
            mb.cyl((x, y, z + 1.3), (x, y, z + 1.7), r * 1.35, r * 1.35, 'rib', seg=10)
            mb.box(((x + 5.3) / 2, y, z + 1.5), (x - 5.3, 0.25, 0.25), 'deck_dark')
    # vertical drops (down-comers) at some ribs
    for i, z in enumerate(RIBS[1:-1]):
        if i % 3 == 0:
            mb.cyl((7.0, YF, z + 3.0), (7.0, YC - 1, z + 3.0), 0.35, 0.35, 'pipe_coolant', seg=8)
            mb.cyl((7.0, YF + 1.5, z + 3.0), (7.0, YF + 3.5, z + 3.0), 0.5, 0.5, 'rib', seg=8)
            mb.box((6.3, YF + 2.5, z + 3.0), (1.0, 0.4, 0.4), 'hazard')
    # cable bundles sagging between ribs on the wall (two levels)
    for yb in (-6.5, 24.5):
        for za, zb in zip(RIBS, RIBS[1:]):
            for k in range(3):
                tube(mb, sag((6.4 + k * 0.25, yb + k * 0.2, za + 0.9), (6.4 + k * 0.25, yb + k * 0.2, zb - 0.9),
                             0.9 + k * 0.25, n=6), 0.08, 'cable', seg=5, caps=False)
    # wall equipment: lockers, panels with blue status lights, fire stations, personnel doors
    for i, (za, zb) in enumerate(zip(RIBS, RIBS[1:])):
        zm = (za + zb) / 2
        for lvl, y0 in enumerate((YF, Y2, Y3)):
            kind = (i + lvl * 2) % 4
            if lvl == 2 and 22 <= zm <= 66:
                continue   # control room there
            if kind == 0:     # personnel door
                mb.box((5.35, y0 + 2.2, zm), (0.3, 4.4, 2.6), 'wall_dark')
                for dz in (-1.6, 1.6):
                    mb.box((5.5, y0 + 2.4, zm + dz), (0.5, 4.8, 0.45), 'hazard', bevel=0.03)
                mb.box((5.5, y0 + 5.0, zm), (0.5, 0.45, 3.6), 'hazard_k')
                mb.box((5.8, y0 + 5.45, zm), (0.25, 0.25, 0.7), 'amber')
                mb.box((5.6, y0 + 1.6, zm + 2.2), (0.1, 0.5, 0.35), 'blue_light')
            elif kind == 1:   # lockers
                for k in range(5):
                    mb.box((5.8, y0 + 1.2, zm - 2.4 + k * 1.2), (1.0, 2.4, 1.1), 'panel_light' if k % 2 else 'wall',
                           bevel=0.03)
            elif kind == 2:   # electrical cabinet with status lights
                mb.box((5.9, y0 + 1.8, zm), (1.2, 3.6, 4.0), 'wall_dark', bevel=0.05)
                for k in range(4):
                    mb.box((6.52, y0 + 2.6 + (k % 2) * 0.5, zm - 1.2 + (k // 2) * 2.4), (0.05, 0.2, 1.4), 'blue_light')
                mb.box((6.52, y0 + 1.2, zm), (0.05, 0.9, 3.4), 'panel_light')
            else:             # console + screen
                mb.box((6.3, y0 + 0.55, zm), (1.8, 1.1, 3.0), 'wall', bevel=0.05)
                mb.box((6.1, y0 + 1.5, zm), (1.2, 0.8, 3.0), 'wall_dark', rot=(0, 0, -30))
                mb.box((5.55, y0 + 2.6, zm), (0.1, 1.2, 2.2), 'blue_light')
        # high wall light bars
        mb.box((5.4, 33.5, zm), (0.3, 0.4, 5.0), 'lamp')
        mb.box((5.4, -2.0 if i % 2 else 13.8, zm + 3.0), (0.2, 0.25, 1.4), 'blue_light')
    # numbered bay markers on the back wall (big light stencils) = simple bars
    for i, z in enumerate(RIBS[1:-1:2]):
        for k in range((i % 3) + 1):
            mb.box((5.3, 18.0, z + 3.0 + k * 0.8), (0.1, 3.0, 0.45), 'floor_line')


def build_control_room(mb, R):
    x0, x1, y0, y1, z0, z1 = 5.3, 13.0, Y3, 25.0, 22.0, 66.0
    mb.box(((x0 + x1) / 2, y1 + 0.4, (z0 + z1) / 2), (x1 - x0 + 0.6, 0.8, z1 - z0 + 0.6), 'wall', bevel=0.08)
    for z in (z0, z1):
        mb.box(((x0 + x1) / 2, (y0 + y1) / 2, z), (x1 - x0, y1 - y0, 0.6), 'wall', bevel=0.05)
    # lower wall + sloped window band + upper visor
    mb.box((x1, y0 + 1.6, (z0 + z1) / 2), (0.6, 3.2, z1 - z0), 'wall', bevel=0.05)
    wb = [Vector((x1 - 0.1, y0 + 3.2, z0)), Vector((x1 + 1.3, y0 + 3.2, z0)), Vector((x1 + 1.3, y0 + 3.2, z1)),
          Vector((x1 - 0.1, y0 + 3.2, z1))]
    wt = [Vector((x1 - 1.1, y1 - 1.4, z0)), Vector((x1 + 0.1, y1 - 1.4, z0)), Vector((x1 + 0.1, y1 - 1.4, z1)),
          Vector((x1 - 1.1, y1 - 1.4, z1))]
    mb.hexa([wb[0], wb[1], wb[2], wb[3], wt[0], wt[1], wt[2], wt[3]], 'window')
    mb.box((x1 - 0.2, y1 - 0.7, (z0 + z1) / 2), (1.6, 1.4, z1 - z0 + 0.2), 'wall', bevel=0.05)
    # mullions
    n = 14
    for k in range(n + 1):
        z = z0 + k * (z1 - z0) / n
        ob(mb, (x1 + 1.35, y0 + 3.1, z), (x1 + 0.15, y1 - 1.3, z), 0.3, 0.3, 'wall_dark', up=(0, 0, 1))
    mb.box((x1 + 1.3, y0 + 3.2, (z0 + z1) / 2), (0.4, 0.35, z1 - z0), 'wall_dark')
    mb.box((x1 + 0.35, y0 + 0.4, (z0 + z1) / 2), (0.1, 0.3, z1 - z0 - 2), 'blue_light')
    # antenna / roof equipment
    for z in (28.0, 44.0, 58.0):
        mb.box((9.0, y1 + 1.2, z), (3.0, 1.0, 3.0), 'wall_dark', bevel=0.05)
    beacon(mb, (12.0, y1 + 0.8, 30.0))
    beacon(mb, (12.0, y1 + 0.8, 60.0))
    hazard_band(mb, (x1 - 0.1, y1 + 0.81, z0), (x1 - 0.1, y1 + 0.81, z1), 0.6, stripe=1.5)


def build_catwalks(mb, R):
    # transverse catwalk bridge across the bay at y = 26, z = 89.5
    zc, yc = 89.5, 26.0
    x0, x1 = 5.5, 55.0
    ob(mb, (x0, yc - 0.15, zc), (x1, yc - 0.15, zc), 2.4, 0.12, 'grating', up=(0, 1, 0))
    for sgn in (-1, 1):
        ob(mb, (x0, yc - 0.45, zc + sgn * 1.2), (x1, yc - 0.45, zc + sgn * 1.2), 0.15, 0.5, 'rib', up=(0, 1, 0))
        railing(mb, (x0, yc, zc + sgn * 1.15), (x1, yc, zc + sgn * 1.15), spacing=2.5)
    for x in (15.0, 25.0, 35.0, 45.0, 54.5):
        for sgn in (-1, 1):
            mb.cyl((x, yc - 0.3, zc + sgn * 1.2), (x, YC - 0.3, zc + sgn * 1.2), 0.07, 0.07, 'steel', seg=5)
        mb.box((x, yc - 0.6, zc), (0.3, 0.3, 2.8), 'rib')
    beacon(mb, (x1, yc + 1.2, zc), nrm=(0, 1, 0), r=0.16)
    for x in (10, 20, 30, 40, 50):
        mb.box((x, yc - 0.55, zc), (1.4, 0.08, 0.5), 'lamp')
    # longitudinal catwalk along the back wall at y = 28 (x 5.5..8)
    yl = 28.0
    mb.box((6.9, yl - 0.1, (ZA + ZB) / 2), (2.6, 0.12, ZB - ZA), 'grating')
    ob(mb, (8.2, yl - 0.4, ZA), (8.2, yl - 0.4, ZB), 0.15, 0.5, 'rib')
    railing(mb, (8.15, yl, ZA + 0.5), (8.15, yl, ZB - 0.5), spacing=2.5)
    for z in RIBS:
        ob(mb, (5.4, yl - 1.8, z + 0.9), (8.2, yl - 0.3, z + 0.9), 0.2, 0.2, 'rib', up=(0, 0, 1))
    # ladder from deck 3 to the catwalk
    for x in (6.2, 7.2):
        mb.box((x, (Y3 + yl) / 2, 70.5), (0.08, yl - Y3, 0.08), 'steel')
    for k in range(int(yl - Y3) * 3):
        mb.box((6.7, Y3 + 0.3 + k / 3, 70.5), (1.0, 0.05, 0.05), 'steel')
    # short maintenance catwalk under the crane rail at x = 50 (hanging), outside the breach
    for (za, zb) in ((ZA + 1, -4.0), (86.0, ZB - 1)):
        mb.box((52.5, 30.0, (za + zb) / 2), (2.0, 0.12, zb - za), 'grating')
        railing(mb, (53.45, 30.0, za), (53.45, 30.0, zb), spacing=2.5)
        for z in (za + 1, (za + zb) / 2, zb - 1):
            mb.cyl((51.6, 30.0, z), (51.6, YC - 2.8, z), 0.06, 0.06, 'steel', seg=5)


def build_cradles(mb, R, spots):
    for (x, y, z, L) in spots:
        # cradle base with launch rails, hazard border, clamps
        mb.box((x, y + 0.3, z), (6.4, 0.6, L + 2.0), 'deck_dark', bevel=0.05)
        for dx in (-1.6, 1.6):
            mb.box((x + dx, y + 0.72, z), (0.45, 0.25, L + 1.6), 'steel')
        for sg in (-1, 1):
            hazard_band(mb, (x + sg * 3.0, y + 0.6, z - (L + 2) / 2 + 0.3), (x + sg * 3.0, y + 0.6, z + (L + 2) / 2 - 0.3),
                        0.45, stripe=1.0, base=False)
        for dz in (-L * 0.28, L * 0.2):
            for sg in (-1, 1):
                ob(mb, (x + sg * 2.9, y + 0.6, z + dz), (x + sg * 1.6, y + 2.2, z + dz), 0.35, 0.5, 'machine',
                   up=(0, 0, 1))
        for sg in (-1, 1):
            for dz in (-(L + 2) / 2 + 0.3, (L + 2) / 2 - 0.3):
                beacon(mb, (x + sg * 3.0, y + 0.6, z + dz), r=0.15)
        mb.box((x + 3.25, y + 0.35, z), (0.06, 0.25, 2.0), 'blue_light')
        # blast deflector behind the craft
        ob(mb, (x - 3.5, y + 1.45, z - L / 2 - 2.6), (x + 3.5, y + 1.45, z - L / 2 - 2.6), 0.5, 3.2, 'rib',
           up=(0, 1, 0.5))
        for dx in (-3.0, 3.0):
            ob(mb, (x + dx, y, z - L / 2 - 3.6), (x + dx, y + 1.6, z - L / 2 - 2.9), 0.3, 0.3, 'rib', up=(1, 0, 0))
        # floor stencil lines around the spot
        for sg in (-1, 1):
            mb.box((x + sg * 4.5, y + 0.015, z), (0.25, 0.03, L + 5), 'floor_line')
        mb.box((x, y + 0.015, z - (L + 5) / 2), (9.25, 0.03, 0.25), 'floor_line')
        mb.box((x, y + 0.015, z + (L + 5) / 2), (9.25, 0.03, 0.25), 'floor_line')


def maint_arm(mb, base, yaw, a1, a2, a3=30.0):
    """Floor mounted articulated maintenance arm. Angles in degrees."""
    base = Vector(base)
    Ry = Matrix.Rotation(yaw * D2R, 3, 'Y')
    mb.cyl(base, base + Vector((0, 0.5, 0)), 1.3, 1.3, 'deck_dark', seg=12)
    mb.cyl(base + Vector((0, 0.5, 0)), base + Vector((0, 1.9, 0)), 0.85, 0.75, 'machine', seg=12)
    sh = base + Vector((0, 2.3, 0))
    mb.cyl(sh + Ry @ Vector((-0.7, 0, 0)), sh + Ry @ Vector((0.7, 0, 0)), 0.55, 0.55, 'rib', seg=10)
    d1 = Ry @ Vector((0, math.sin(a1 * D2R), math.cos(a1 * D2R)))
    el = sh + d1 * 6.0
    ob(mb, sh, el, 0.8, 0.9, 'machine', up=Ry @ Vector((1, 0, 0)), bevel=0.06)
    mb.cyl(el + Ry @ Vector((-0.55, 0, 0)), el + Ry @ Vector((0.55, 0, 0)), 0.45, 0.45, 'rib', seg=10)
    d2 = Ry @ Vector((0, math.sin(a2 * D2R), math.cos(a2 * D2R)))
    wr = el + d2 * 4.5
    ob(mb, el, wr, 0.6, 0.65, 'machine', up=Ry @ Vector((1, 0, 0)), bevel=0.05)
    d3 = Ry @ Vector((0, math.sin(a3 * D2R), math.cos(a3 * D2R)))
    tip = wr + d3 * 1.3
    mb.cyl(wr, tip, 0.32, 0.22, 'rib', seg=8)
    mb.cyl(tip, tip + d3 * 0.4, 0.12, 0.05, 'steel', seg=6)
    mb.sphere(wr, 0.36, 'rib', seg=8, rings=5)
    hazard_band(mb, sh + d1 * 1.0 + (Ry @ Vector((0.41, 0, 0))), sh + d1 * 2.6 + (Ry @ Vector((0.41, 0, 0))), 0.8,
                nrm=Ry @ Vector((1, 0, 0)), stripe=0.5, base=False)
    tube(mb, [sh + Vector((0, 0.3, 0)) + Ry @ Vector((0.5, 0, 0)), sh + d1 * 3 + Ry @ Vector((0.55, 0.3, 0)),
              el + Ry @ Vector((0.5, 0.2, 0))], 0.08, 'cable', seg=5)
    mb.box(tip - d3 * 0.3 + Vector((0, 0.3, 0)), (0.15, 0.1, 0.15), 'blue_light')


def build_storage(mb, R):
    # container stacks on the main floor (aft end, outside the craft rows)
    stacks = [((38.0, 96.0), 3, 'container'), ((41.0, 96.0), 2, 'container2'), ((44.0, 96.0), 3, 'container'),
              ((50.0, 98.0), 1, 'container2'), ((38.0, 83.5), 1, 'container2')]
    for (x, z), n, m in stacks:
        for k in range(n):
            container(mb, (x, YF + k * 2.62, z), 12.0 if (x < 45 and k < 2) else 6.1, 2.44, 2.6,
                      m if k % 2 == 0 else ('container2' if m == 'container' else 'container'), along='z')
    container(mb, (55.0, YF, 93.0), 6.1, 2.44, 2.6, 'container', along='x')
    container(mb, (54.0, YF + 2.62, 93.0), 6.1, 2.44, 2.6, 'container2', along='x')
    # crate piles
    piles = [(48.0, YF, 84.0, 3), (36.0, YF, -20.0, 4), (44.0, YF, -21.0, 3), (51.0, YF, -18.0, 2),
             (22.0, Y2, -12.0, 3), (12.0, Y2, 90.0, 4), (21.0, Y2, 96.0, 2), (10.0, Y3, 80.0, 2),
             (55.0, YF, 12.0, 1), (54.0, YF, 58.0, 2)]
    for (x, y, z, n) in piles:
        for i in range(n):
            for j in range(max(1, n - i)):
                s = R.choice([(2, 2, 2), (3, 1.5, 1.5), (1.5, 1.2, 1.5), (2, 2, 2)])
                c = (x + (j - (n - i - 1) / 2) * 2.3 + R.uniform(-0.2, 0.2), y + s[1] / 2 + i * 2.02,
                     z + R.uniform(-0.4, 0.4))
                crate(mb, c, s, R.choice(['crate', 'crate', 'crate2']), yaw=R.uniform(-12, 12))
    # fuel tanks under deck 2 (vertical, on skids) with bands and piping
    for z in (62.0, 70.0, 78.0, 86.0):
        x = 13.0
        mb.box((x, YF + 0.4, z), (6.0, 0.8, 6.0), 'deck_dark', bevel=0.05)
        mb.cyl((x, YF + 0.8, z), (x, YF + 12.5, z), 2.8, 2.8, 'tank', seg=24)
        mb.sphere((x, YF + 12.5, z), 2.8, 'tank', seg=24, rings=8, scale=(1, 0.45, 1), half=False)
        for y in (YF + 3.0, YF + 10.5):
            mb.cyl((x, y, z), (x, y + 0.35, z), 2.9, 2.9, 'rib', seg=24)
        mb.cyl((x, YF + 6.2, z), (x, YF + 7.0, z), 2.84, 2.84, 'hazard', seg=24)
        tube(mb, [(x, YF + 13.6, z), (x, YF + 14.8, z), (7.5, YF + 14.8, z), (7.5, -13.0, z)], 0.25, 'pipe_fuel', seg=6)
        mb.box((x + 2.9, YF + 4.5, z), (0.3, 1.2, 0.8), 'wall_dark')
        mb.box((x + 3.06, YF + 4.7, z), (0.05, 0.3, 0.5), 'blue_light')
    # fuel bowser + hose on the main floor
    mb.box((36.5, YF + 1.2, 58.0), (2.4, 2.0, 5.0), 'machine', bevel=0.12)
    mb.cyl((36.5, YF + 1.8, 55.5), (36.5, YF + 1.8, 60.5), 0.9, 0.9, 'tank', seg=12)
    for dz in (-1.8, 1.8):
        for dx in (-1.0, 1.0):
            mb.cyl((36.5 + dx * 1.3, YF + 0.4, 58 + dz), (36.5 + dx * 1.0, YF + 0.4, 58 + dz), 0.4, 0.4, 'cable', seg=8)
    tube(mb, [(37.7, YF + 1.2, 58.0), (39.5, YF + 0.2, 58.5), (41.0, YF + 0.15, 60.5), (42.5, YF + 1.5, 62.0)],
         0.12, 'hazard_k', seg=6)
    # tool carts / service boxes near the craft
    for (x, z) in ((37.0, 7.0), (51.0, 27.0), (37.5, 47.0), (51.5, 69.0), (22.5, 50.0)):
        y = YF if x > 30 else Y2
        mb.box((x, y + 0.6, z), (1.2, 0.9, 1.8), 'container', bevel=0.05)
        mb.box((x, y + 1.08, z), (1.25, 0.06, 1.85), 'steel')
        for dz in (-0.7, 0.7):
            mb.cyl((x - 0.5, y + 0.12, z + dz), (x + 0.5, y + 0.12, z + dz), 0.12, 0.12, 'cable', seg=6)


# -------------------------------------------------------------------------------------  strike craft
CRAFT_PROF = [(1, 0), (0.8, 0.55), (0.35, 1), (-0.35, 1), (-0.8, 0.55), (-1, 0), (-0.8, -0.45), (-0.3, -0.7),
              (0.3, -0.7), (0.8, -0.45)]


def craft(name, L=16.0, variant=0):
    """Original wingless strike craft: flat lozenge lifting body, twin fused engine pods, bubble canopy.
    Local frame: nose +Z, up +Y, belly at y = 0."""
    mb = MB()
    k = L / 16.0
    st = [(8.0, 0.25, 0.15, 0.3), (6.6, 1.1, 0.8, 0.5), (4.2, 2.0, 1.5, 0.7), (1.2, 2.6, 2.0, 0.8),
          (-2.4, 2.9, 2.1, 0.75), (-5.8, 2.8, 1.9, 0.6), (-7.4, 2.4, 1.6, 0.5)]
    y0 = 1.6
    rings = [[Vector((u * w * k, (y0 + yc + v * h) * k, z * k)) for u, v in CRAFT_PROF] for z, w, h, yc in st]

    def sub(idx):
        return [[r[i] for i in idx] for r in rings]
    mb.loft(sub([1, 2, 3, 4]), 'craft_teal', cap0=False, cap1=False, closed=False)
    mb.loft(sub([4, 5, 6, 7, 8, 9, 0, 1]), 'craft', cap0=False, cap1=False, closed=False)
    # nose tip + tail cap
    tip = Vector((0, (y0 + 0.3) * k, 8.6 * k))
    mb.loft([tip, rings[0]], 'craft_dark', cap0=False, cap1=False)
    tail = rings[-1]
    inner = [Vector((p.x * 0.8, (y0 + 0.4) * k + (p.y - (y0 + 0.4) * k) * 0.75, p.z - 0.3 * k)) for p in tail]
    mb.loft([tail, inner], 'craft_dark', cap0=False, cap1=True)
    # engine pods fused to the flanks
    for sg in (1, -1):
        x = sg * 2.55 * k
        yp = (y0 + 0.55) * k
        mb.cyl((x, yp, -7.9 * k), (x, yp, -1.2 * k), 1.0 * k, 1.0 * k, 'craft', seg=14)
        mb.cyl((x, yp, -1.2 * k), (x, yp, 1.4 * k), 1.0 * k, 0.6 * k, 'craft', seg=14)
        mb.cyl((x, yp, 1.4 * k), (x, yp, 1.6 * k), 0.55 * k, 0.55 * k, 'craft_dark', seg=14)
        mb.nozzle((x, yp, -7.9 * k), (0, 0, -1), 0.72 * k, 'craft_dark', 'craft_dark', length=0.7 * k, flare=1.05,
                  seg=14)
        for zz in (-6.8, -3.5):
            mb.cyl((x, yp, zz * k), (x, yp, (zz + 0.3) * k), 1.05 * k, 1.05 * k, 'craft_dark', seg=14)
        # side sensor blister + nav light
        mb.box((sg * 3.52 * k, yp, -4.8 * k), (0.12 * k, 0.25 * k, 0.5 * k), 'amber' if sg > 0 else 'blue_light')
    mb.nozzle((0, (y0 + 0.8) * k, -7.6 * k), (0, 0, -1), 0.8 * k, 'craft_dark', 'craft_dark', length=0.6 * k,
              flare=1.05, seg=16)
    # canopy + frame
    mb.sphere((0, (y0 + 2.3) * k, 2.2 * k), 1.0 * k, 'canopy', seg=16, rings=8, scale=(0.8, 2.4, 0.95),
              rot=(-90, 0, 0), half=True)
    ob(mb, (0, (y0 + 3.27) * k, 3.4 * k), (0, (y0 + 3.27) * k, 1.0 * k), 0.12 * k, 0.1 * k, 'craft_dark')
    # dorsal spine + intake scoops + belly keel + sensor chin
    ob(mb, (0, (y0 + 2.85) * k, -0.4 * k), (0, (y0 + 2.8) * k, -7.2 * k), 1.3 * k, 0.6 * k, 'craft', bevel=0.05)
    for z in (-2.0, -3.6, -5.2):
        mb.box((0, (y0 + 3.17) * k, z * k), (1.2 * k, 0.1 * k, 0.6 * k), 'craft_dark')
    ob(mb, (0, (y0 - 0.75) * k, 4.0 * k), (0, (y0 - 0.75) * k, -6.0 * k), 1.4 * k, 0.45 * k, 'craft_dark')
    mb.sphere((0, (y0 - 0.2) * k, 5.6 * k), 0.4 * k, 'craft_dark', seg=10, rings=6)
    # hull number bars on the flanks
    for sg in (1, -1):
        for i in range(variant % 3 + 1):
            z = (1.4 - i * 0.45) * k
            ob(mb, (sg * 2.7 * k, (y0 + 1.05) * k, z), (sg * 2.7 * k, (y0 + 0.45) * k, z), 0.06 * k, 0.24 * k,
               'floor_line', up=(0, 0, 1))
    # landing struts
    for (x, z) in ((0, 5.0), (1.8, -4.5), (-1.8, -4.5)):
        mb.cyl((x * k, 0.0, z * k), (x * k, (y0 - 0.6) * k, z * k), 0.14 * k, 0.14 * k, 'steel', seg=6)
        mb.box((x * k, 0.08, z * k), (0.6 * k, 0.16, 0.9 * k), 'craft_dark')
    return mb.to_object(name)


# =====================================================================================  ship cross-section
#  Compartments around the hangar, cut open at x = 60 like a doll house: two deck levels below the hangar
#  (A, B), two above (C, D), and stacked fore/aft end blocks (10 levels each) between them.
#  Every floor slab / partition runs to x = 60 so its cut edge faces +X; service voids show pipe runs.
SX0, SX1 = 4.0, 60.0
SZ0, SZ1 = -40.0, 120.0                     # outer faces of the section end walls
SY0, SY1 = -30.0, 50.0
LEVELS_BELOW = [(-29.4, -24.8), (-24.2, -19.8)]
LEVELS_ABOVE = [(40.0, 44.6), (45.2, 49.4)]
END_FLOORS = [-17.0, -11.5, -6.0, 0.0, 5.5, 11.0, 16.5, 22.0, 27.5, 33.0]
END_BLOCKS = [(-39.6, -28.0), (108.0, 119.6)]
ROOM_KINDS = ['bunks', 'machinery', 'storage', 'corridor', 'conduit', 'mess', 'control', 'machinery', 'bunks',
              'storage', 'corridor', 'conduit']


def hole_halfwidth(y, margin=0.0):
    d = (HOLE_R - margin) ** 2 - (y - HOLE_C[0]) ** 2
    return math.sqrt(d) if d > 0 else -1.0


def section_layout(seed=4242):
    """Deterministic room list (also used by the preview renderer to place fill lights)."""
    R = rng(seed)
    rooms = []
    for li, (y0, y1) in enumerate(LEVELS_BELOW + LEVELS_ABOVE):
        z = SZ0 + 0.4
        while z < SZ1 - 0.4 - 1:
            L = R.uniform(8.5, 16.0)
            if SZ1 - 0.4 - (z + L) < 7.0:
                L = SZ1 - 0.4 - z
            kind = R.choice(ROOM_KINDS)
            xb = R.uniform(52.0, 53.5) if kind == 'corridor' else R.uniform(40.0, 48.5)
            rooms.append(dict(x0=xb, y0=y0, y1=y1, z0=z, z1=z + L, kind=kind, dark=R.random() < 0.12,
                              seed=R.randrange(1 << 30), strip=li))
            z += L
    for bi, (za, zb) in enumerate(END_BLOCKS):
        for i, yf in enumerate(END_FLOORS):
            yc = END_FLOORS[i + 1] - 0.5 if i + 1 < len(END_FLOORS) else 37.0
            kind = 'stairs' if (bi == 0 and i < len(END_FLOORS) - 1) else R.choice(ROOM_KINDS[:3] + ['control', 'mess'])
            xb = R.uniform(38.0, 46.0)
            rooms.append(dict(x0=xb, y0=yf, y1=yc, z0=za, z1=zb, kind=kind, dark=R.random() < 0.15,
                              seed=R.randrange(1 << 30), strip=10 + bi))
    return rooms


def cut_slab(mb, R, y_bot, y_top, z0, z1, mat='deck_dark', x0=SX0):
    """Floor slab from x0 to the cut face at x = 60; ragged + scorched where it crosses the breach."""
    ym = (y_bot + y_top) / 2
    hw = hole_halfwidth(ym, -4.0)
    th = y_top - y_bot
    if hw < 0 or z1 < HOLE_C[1] - hw or z0 > HOLE_C[1] + hw:
        mb.box(((x0 + SX1) / 2, ym, (z0 + z1) / 2), (SX1 - x0, th, z1 - z0), mat)
        return
    ha, hb = max(z0, HOLE_C[1] - hw), min(z1, HOLE_C[1] + hw)
    for za, zb in ((z0, ha), (hb, z1)):
        if zb - za > 0.05:
            mb.box(((x0 + SX1) / 2, ym, (za + zb) / 2), (SX1 - x0, th, zb - za), mat)
    z = ha
    while z < hb - 0.05:
        w = min(R.uniform(1.5, 4.5), hb - z)
        xe = SX1 - R.uniform(0.0, 1.8)
        mb.box(((x0 + xe) / 2, ym, z + w / 2), (xe - x0, th, w), mat)
        mb.box((xe - 0.05, ym, z + w / 2), (0.14, th + 0.02, w + 0.02), 'scorch')
        z += w


def service_void(mb, R, y_bot, y_top, z0, z1, pipes=9):
    """Interstitial layer between decks: joists every 4.5 m (cut ends face +X) + pipe/cable runs along z."""
    h = y_top - y_bot
    z = z0 + 1.0
    while z < z1 - 0.5:
        mb.box(((SX0 + SX1) / 2 - 0.3, (y_bot + y_top) / 2, z), (SX1 - SX0 - 0.6, h, 0.3), 'rib')
        z += 4.5
    mats = ['pipe', 'pipe_coolant', 'pipe', 'pipe_fuel', 'cable', 'pipe', 'pipe_coolant', 'cable', 'pipe']
    for i in range(pipes):
        r = R.uniform(0.12, min(0.42, h / 2 - 0.08))
        x = SX1 - 1.0 - i * 1.25 - R.uniform(0, 0.4)
        y = y_bot + r + 0.04 + R.uniform(0, max(0.0, h - 2 * r - 0.08))
        mb.cyl((x, y, z0), (x, y, z1), r, r, mats[i % len(mats)], seg=8 if r > 0.2 else 6, caps=False)
    # cable tray + light strip at the cut face
    mb.box((SX1 - 0.6, y_bot + 0.1, (z0 + z1) / 2), (0.9, 0.06, z1 - z0), 'steel')


def partition(mb, R, z, xa, y0, y1, service=False, door=True):
    """Wall between two rooms, running from the deeper back wall xa out to the cut face at x = 60."""
    H = y1 - y0
    ym = (y0 + y1) / 2
    hw = hole_halfwidth(ym, -4.0)
    xe = SX1
    if hw > 0 and abs(z - HOLE_C[1]) < hw:
        xe = SX1 - R.uniform(0.0, 1.4)
    if service:
        for dz in (-0.45, 0.45):
            mb.box(((xa + xe) / 2, ym, z + dz), (xe - xa, H, 0.12), 'wall')
        for k, (xo, r, m) in enumerate(((0.7, 0.16, 'pipe_coolant'), (1.4, 0.12, 'pipe_fuel'), (2.2, 0.2, 'pipe'),
                                        (3.2, 0.1, 'cable'), (3.5, 0.1, 'cable'))):
            mb.cyl((xe - xo, y0 - 0.3, z + (0.15 if k % 2 else -0.15)), (xe - xo, y1 + 0.3, z + (0.15 if k % 2 else -0.15)),
                   r, r, m, seg=6, caps=False)
        th = 1.02
    else:
        mb.box(((xa + xe) / 2, ym, z), (xe - xa, H, 0.3), 'wall')
        th = 0.32
    if xe < SX1:
        mb.box((xe - 0.04, ym, z), (0.12, H + 0.1, th + 0.04), 'scorch')
    if door:
        xd = xa + R.uniform(2.0, 5.0)
        mb.box((xd, y0 + 1.1, z), (1.3, 2.2, th + 0.08), 'wall_dark')
        mb.box((xd, y0 + 2.35, z), (1.7, 0.3, th + 0.12), 'hazard_k')
        mb.box((xd + 0.9, y0 + 1.3, z), (0.12, 0.25, th + 0.14), 'blue_light' if R.random() < 0.6 else 'amber')


def lamps(mb, r, R):
    x0, y1, z0, z1 = r['x0'], r['y1'], r['z0'], r['z1']
    L, D = z1 - z0, SX1 - x0
    rows = [x0 + D / 2] if D < 16 else [x0 + D * 0.3, x0 + D * 0.7]
    n = max(1, int(L / 6.5))
    for x in rows:
        for k in range(n):
            z = z0 + (k + 0.5) * L / n
            if r['dark']:
                if k % 2 == 0:
                    mb.box((x, y1 - 0.08, z), (0.5, 0.12, 0.5), 'amber')
            else:
                mb.box((x, y1 - 0.06, z), (1.0, 0.1, 2.6), 'lamp')
                mb.box((x, y1 - 0.02, z), (1.3, 0.06, 2.9), 'wall_dark')


def room_shell(mb, r, R):
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    L, H, zc = z1 - z0, y1 - y0, (z0 + z1) / 2
    mb.box((x0 - 0.2, (y0 + y1) / 2, zc), (0.4, H, L), 'wall' if r['strip'] % 2 else 'panel_light')
    mb.box((x0 + 0.04, y0 + 0.15, zc), (0.1, 0.3, L - 0.3), 'wall_dark')
    mb.box((x0 + 0.03, y0 + H * 0.62, zc), (0.08, 0.14, L - 0.3), 'panel_light' if r['strip'] % 2 else 'wall')
    # overhead pipes along the room
    mb.cyl((x0 + 0.8, y1 - 0.35, z0 + 0.2), (x0 + 0.8, y1 - 0.35, z1 - 0.2), 0.22, 0.22, 'pipe', seg=8, caps=False)
    mb.cyl((x0 + 1.4, y1 - 0.3, z0 + 0.2), (x0 + 1.4, y1 - 0.3, z1 - 0.2), 0.14, 0.14,
           R.choice(['pipe_coolant', 'pipe_fuel', 'cable']), seg=6, caps=False)
    lamps(mb, r, R)


def furn_bunks(mb, r, R):
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    n = min(5, int((z1 - z0 - 1.5) / 2.4))
    for k in range(n):
        zc = z0 + 1.2 + k * 2.4 + 1.0
        x = x0 + 0.55
        for dz in (-1.05, 1.05):
            mb.box((x, y0 + 1.0, zc + dz), (1.0, 2.0, 0.06), 'steel')
        for yy in (0.45, 1.6):
            mb.box((x, y0 + yy, zc), (1.0, 0.1, 2.1), 'steel')
            mb.box((x, y0 + yy + 0.12, zc), (0.9, 0.16, 1.95), 'fabric')
            mb.box((x + 0.05, y0 + yy + 0.25, zc - 0.75), (0.6, 0.12, 0.35), 'floor_line')
    # lockers against the first partition + a table with stools
    for k in range(4):
        mb.box((x0 + 2.2 + k * 0.8, y0 + 1.0, z0 + 0.45), (0.75, 2.0, 0.5), 'panel_light' if k % 2 else 'wall')
    xt = x0 + (SX1 - x0) * 0.6
    zt = (z0 + z1) / 2
    mb.box((xt, y0 + 0.75, zt), (1.4, 0.06, 2.2), 'steel')
    mb.box((xt, y0 + 0.37, zt), (0.2, 0.74, 0.2), 'rib')
    for dx in (-1.1, 1.1):
        mb.box((xt + dx, y0 + 0.45, zt), (0.4, 0.06, 1.8), 'fabric')
        mb.box((xt + dx, y0 + 0.22, zt), (0.1, 0.44, 0.1), 'rib')


def furn_machinery(mb, r, R):
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    H, L = y1 - y0, z1 - z0
    rad = min(1.5, H / 2 - 0.55)
    xg = x0 + 1.2 + rad
    yg = y0 + rad + 0.4
    za, zb = z0 + 1.2, z0 + 1.2 + L * 0.6
    mb.cyl((xg, yg, za), (xg, yg, zb), rad, rad, 'tank' if r['seed'] % 2 else 'machine', seg=16)
    for f in (0.15, 0.5, 0.85):
        z = lerp(za, zb, f)
        mb.cyl((xg, yg, z - 0.12), (xg, yg, z + 0.12), rad * 1.07, rad * 1.07, 'rib', seg=16, caps=False)
    for z in (za + 0.8, zb - 0.8):
        mb.box((xg, y0 + 0.2, z), (rad * 2.2, 0.4, 0.6), 'rib')
    tube(mb, [(xg, yg + rad, zb - 1.0), (xg, y1 - 0.8, zb - 1.0), (x0 + 0.8, y1 - 0.8, zb - 1.0)], 0.18, 'pipe_coolant',
         seg=6)
    tube(mb, [(xg + rad, yg, za + 1.5), (xg + rad + 1.2, yg, za + 1.5), (xg + rad + 1.2, y0 + 0.1, za + 1.5)], 0.14,
         'pipe_fuel', seg=6)
    # pump skids + control cabinet
    for k in range(2):
        z = zb + 1.2 + k * 1.8
        if z < z1 - 1.0:
            mb.box((x0 + 1.5, y0 + 0.7, z), (1.6, 1.4, 1.3), 'machine' if k else 'wall_dark')
            mb.cyl((x0 + 2.4, y0 + 0.7, z), (x0 + 2.9, y0 + 0.7, z), 0.35, 0.35, 'rib', seg=8)
    xc = min(SX1 - 2.0, xg + rad + 3.0)
    mb.box((xc, y0 + 1.0, z0 + 0.6), (1.4, 2.0, 0.7), 'wall_dark')
    mb.box((xc, y0 + 1.4, z0 + 0.97), (1.0, 0.6, 0.04), 'blue_light')
    hazard_band(mb, (xg + rad + 0.6, y0, za), (xg + rad + 0.6, y0, zb), 0.5, stripe=1.5, base=False)
    beacon(mb, (x0 + 0.1, y1 - 0.9, zb), nrm=(1, 0, 0), r=0.16)


def rack(mb, R, x, y0, y1, za, zb):
    H = min(y1 - y0 - 0.4, 3.6)
    for z in (za, zb):
        for dx in (-0.5, 0.5):
            mb.box((x + dx, y0 + H / 2, z), (0.08, H, 0.08), 'machine')
    for k in range(3):
        y = y0 + 0.2 + k * H / 3
        mb.box((x, y, (za + zb) / 2), (1.1, 0.06, zb - za), 'steel')
        zz = za + 0.2
        while zz < zb - 0.9:
            w = R.uniform(0.6, 1.2)
            h = R.uniform(0.4, H / 3 - 0.15)
            mb.box((x + R.uniform(-0.1, 0.1), y + 0.03 + h / 2, zz + w / 2), (0.9, h, w),
                   R.choice(['crate', 'crate2', 'container2', 'crate']))
            zz += w + R.uniform(0.1, 0.5)


def furn_storage_(mb, r, R):
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    z = z0 + 0.8
    while z < z1 - 3.5:
        rack(mb, R, x0 + 0.8, y0, y1, z, z + 3.0)
        z += 3.4
    for k in range(R.randint(2, 4)):
        s = R.uniform(0.9, 1.6)
        mb.box((R.uniform(x0 + 3, SX1 - 3), y0 + s / 2, R.uniform(z0 + 1.5, z1 - 1.5)), (s, s, s * 1.2),
               R.choice(['crate', 'crate2']), rot=(0, R.uniform(-20, 20), 0))


def furn_corridor(mb, r, R):
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    z = z0 + 2.5
    while z < z1 - 1.5:
        mb.box((x0 + 0.05, y0 + 1.1, z), (0.12, 2.2, 1.4), 'wall_dark')
        mb.box((x0 + 0.08, y0 + 2.35, z), (0.14, 0.2, 1.8), 'hazard' if R.random() < 0.3 else 'panel_light')
        mb.box((x0 + 0.12, y0 + 1.3, z + 0.95), (0.05, 0.2, 0.15), 'blue_light')
        z += R.uniform(4.0, 6.0)
    mb.cyl((x0 + 0.25, y0 + 0.95, z0 + 0.3), (x0 + 0.25, y0 + 0.95, z1 - 0.3), 0.04, 0.04, 'steel', seg=5, caps=False)
    mb.box(((x0 + SX1) / 2, y0 + 0.012, (z0 + z1) / 2), (0.15, 0.03, z1 - z0 - 0.6), 'floor_line')
    mb.box((x0 + 0.1, y1 - 0.1, (z0 + z1) / 2), (0.15, 0.1, z1 - z0 - 0.6), 'lamp')
    for k, (dx, rr, m) in enumerate(((1.8, 0.18, 'pipe'), (2.4, 0.12, 'cable'), (2.8, 0.12, 'cable'))):
        mb.cyl((x0 + dx, y1 - 0.25, z0 + 0.2), (x0 + dx, y1 - 0.25, z1 - 0.2), rr, rr, m, seg=6, caps=False)


def furn_conduit(mb, r, R):
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    xc, zc = x0 + 2.2, (z0 + z1) / 2 + R.uniform(-2, 2)
    mats = ['pipe', 'pipe_coolant', 'pipe_fuel', 'pipe', 'cable', 'cable']
    for k in range(6):
        a = k / 6 * 2 * math.pi
        rr = 0.28 if k < 4 else 0.14
        p = (xc + math.cos(a) * 0.9, zc + math.sin(a) * 0.9)
        mb.cyl((p[0], max(SY0, y0 - 0.7), p[1]), (p[0], min(SY1, y1 + 0.7), p[1]), rr, rr, mats[k], seg=8, caps=False)
    for y in (y0 + 0.6, y1 - 0.6):
        mb.box((xc, y, zc), (2.6, 0.2, 2.6), 'rib')
    # hatch + caged ladder up through the ceiling
    xl, zl = min(SX1 - 2.5, x0 + 5.0), z1 - 1.6
    for dx in (-0.25, 0.25):
        mb.box((xl + dx, (y0 + y1) / 2 + 0.3, zl), (0.06, y1 - y0 + 0.6, 0.06), 'steel')
    for k in range(int((y1 - y0) / 0.4)):
        mb.box((xl, y0 + 0.3 + k * 0.4, zl), (0.5, 0.04, 0.04), 'steel')
    for y in (y0 + 0.015, y1 - 0.02):
        for dx, dz, sx, sz in ((0, -0.75, 1.6, 0.12), (0, 0.75, 1.6, 0.12), (-0.75, 0, 0.12, 1.6), (0.75, 0, 0.12, 1.6)):
            mb.box((xl + dx, y, zl + dz), (sx, 0.05, sz), 'hazard')
        mb.box((xl, y, zl), (1.3, 0.03, 1.3), 'hazard_k')
    mb.box((x0 + 0.1, (y0 + y1) / 2, zc - 2.6), (0.1, 0.25, 0.25), 'amber')


def furn_mess(mb, r, R):
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    for k in range(min(3, int((SX1 - x0 - 4) / 5))):
        xt = x0 + 4.0 + k * 5.0
        zt = (z0 + z1) / 2
        Lt = min(6.0, z1 - z0 - 3)
        mb.box((xt, y0 + 0.75, zt), (1.2, 0.06, Lt), 'panel_light')
        for dz in (-Lt / 2 + 0.4, Lt / 2 - 0.4):
            mb.box((xt, y0 + 0.37, zt + dz), (0.8, 0.74, 0.1), 'rib')
        for dx in (-1.0, 1.0):
            mb.box((xt + dx, y0 + 0.45, zt), (0.35, 0.06, Lt - 0.4), 'fabric')
    mb.box((x0 + 0.6, y0 + 0.5, (z0 + z1) / 2), (1.0, 1.0, (z1 - z0) * 0.6), 'wall')
    mb.box((x0 + 0.6, y0 + 1.02, (z0 + z1) / 2), (1.1, 0.05, (z1 - z0) * 0.6 + 0.1), 'steel')
    for k in range(3):
        mb.box((x0 + 0.05, y0 + 1.9, z0 + 2 + k * 1.2), (0.05, 0.5, 0.8), 'blue_light')


def furn_control(mb, r, R):
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    n = min(4, int((z1 - z0 - 2) / 2.6))
    for k in range(n):
        z = z0 + 1.8 + k * 2.6
        mb.box((x0 + 0.9, y0 + 0.5, z), (1.2, 1.0, 2.2), 'wall_dark')
        mb.box((x0 + 0.75, y0 + 1.25, z), (0.8, 0.6, 2.2), 'wall', rot=(0, 0, 25))
        mb.box((x0 + 1.12, y0 + 1.45, z), (0.05, 0.4, 1.8), 'blue_light', rot=(0, 0, 25))
        xs = x0 + 2.2
        mb.box((xs, y0 + 0.5, z), (0.5, 0.08, 0.5), 'fabric')
        mb.box((xs + 0.25, y0 + 0.85, z), (0.08, 0.7, 0.5), 'fabric')
        mb.box((xs, y0 + 0.25, z), (0.08, 0.5, 0.08), 'steel')
    mb.box((x0 + 0.03, y0 + (y1 - y0) * 0.6, (z0 + z1) / 2), (0.05, 1.2, min(6.0, z1 - z0 - 2)), 'blue_light')
    mb.box((x0 + (SX1 - x0) * 0.55, y0 + 0.5, (z0 + z1) / 2), (2.0, 1.0, 3.0), 'wall_dark')    # plot table
    mb.box((x0 + (SX1 - x0) * 0.55, y0 + 1.02, (z0 + z1) / 2), (1.8, 0.04, 2.8), 'window')


def furn_stairs(mb, r, R):
    """Stairwell (fore block): flight along z up to the next level floor, through a hole in its slab."""
    x0, y0, y1, z0, z1 = r['x0'], r['y0'], r['y1'], r['z0'], r['z1']
    xs0, xs1 = x0 + 0.4, x0 + 2.8
    stairs(mb, xs0, xs1, z0 + 9.0, y0, z0 + 1.6, y1 + 0.5)
    for k in range(3):
        mb.box((x0 + 5.0 + k * 0.8, y0 + 1.0, z1 - 0.5), (0.75, 2.0, 0.5), 'panel_light' if k % 2 else 'wall')
    mb.box((x0 + 3.2, y0 + 3.0, z0 + 5.0), (0.05, 0.5, 1.2), 'floor_line')


FURN = {'bunks': furn_bunks, 'machinery': furn_machinery, 'storage': furn_storage_, 'corridor': furn_corridor,
        'conduit': furn_conduit, 'mess': furn_mess, 'control': furn_control, 'stairs': furn_stairs}


def build_sections(mb, R):
    rooms = section_layout()
    # ---- slabs of the below/above strips (full length) + service voids
    for (yb, yt) in ((SY0, -29.4), (-24.8, -24.2), (-19.8, -19.5), (39.6, 40.0), (44.6, 45.2), (49.4, SY1)):
        cut_slab(mb, R, yb, yt, SZ0 + 0.4, SZ1 - 0.4)
    service_void(mb, R, -19.5, -18.0, SZ0 + 0.4, SZ1 - 0.4)
    service_void(mb, R, 38.0, 39.6, SZ0 + 0.4, SZ1 - 0.4)
    # end blocks: top plates under/over the voids that the hangar floor/ceiling cover elsewhere
    for za, zb in END_BLOCKS:
        cut_slab(mb, R, -18.0, -17.0, za, zb)
        cut_slab(mb, R, 37.0, 38.0, za, zb)
    # ---- outer end walls of the section
    for zf in (SZ0 + 0.2, SZ1 - 0.2):
        mb.box(((SX0 + SX1) / 2, (SY0 + SY1) / 2, zf), (SX1 - SX0, SY1 - SY0, 0.4), 'wall_dark')
    # hangar bulkheads extended to the full section height (cut edges at x = 60)
    for zf in (ZA - 0.5, ZB + 0.5):
        for (ya, yb) in ((SY0, -18.0), (38.0, SY1)):
            mb.box(((SX0 + SX1) / 2, (ya + yb) / 2, zf), (SX1 - SX0, yb - ya, 1.0), 'wall_dark')
    # ---- end-block level slabs (with stairwell holes in the fore block)
    for bi, (za, zb) in enumerate(END_BLOCKS):
        for i, yf in enumerate(END_FLOORS[1:], start=1):
            if bi == 0:
                st = [r for r in rooms if r['strip'] == 10 and abs(r['y1'] + 0.5 - yf) < 0.01]
                if st:
                    x0 = st[0]['x0']
                    hx0, hx1, hz0, hz1 = x0 + 0.2, x0 + 3.0, za + 1.2, za + 3.4
                    cut_slab(mb, R, yf - 0.5, yf, za, hz0)
                    cut_slab(mb, R, yf - 0.5, yf, hz1, zb)
                    mb.box(((SX0 + hx0) / 2, yf - 0.25, (hz0 + hz1) / 2), (hx0 - SX0, 0.5, hz1 - hz0), 'deck_dark')
                    mb.box(((hx1 + SX1) / 2, yf - 0.25, (hz0 + hz1) / 2), (SX1 - hx1, 0.5, hz1 - hz0), 'deck_dark')
                    railing(mb, (hx1 + 0.1, yf, hz0), (hx1 + 0.1, yf, hz1), spacing=1.1, toe=False)
                    continue
            cut_slab(mb, R, yf - 0.5, yf, za, zb)
    # ---- partitions between neighbouring rooms of each strip
    by_strip = {}
    for r in rooms:
        by_strip.setdefault(r['strip'], []).append(r)
    for sid, rs in by_strip.items():
        if sid >= 10:
            continue
        for a, b in zip(rs, rs[1:]):
            partition(mb, R, a['z1'], min(a['x0'], b['x0']) - 0.4, a['y0'], a['y1'], service=R.random() < 0.45,
                      door=R.random() < 0.7)
    # ---- rooms
    counts = {}
    for r in rooms:
        RR = rng(r['seed'])
        t0 = ntris(mb)
        room_shell(mb, r, RR)
        FURN[r['kind']](mb, r, RR)
        counts[r['kind']] = counts.get(r['kind'], 0) + 1
    print('ROOMS', len(rooms), counts)


# =====================================================================================  assemble bay
def mother_bay():
    bay_palette()
    R = rng(909)
    mb = MB()
    tally = {}

    def step(label, fn, *a):
        t0 = ntris(mb)
        fn(mb, R, *a)
        tally[label] = ntris(mb) - t0
    step('shell', build_shell)
    step('door_fwd', lambda m, r: build_bulkhead_door(m, ZA, -1, r))
    step('door_aft', lambda m, r: build_bulkhead_door(m, ZB, 1, r))
    step('decks', build_decks)
    step('ribs', build_ribs)
    step('ceiling', build_ceiling_systems)
    step('walls', build_walls)
    step('control', build_control_room)
    step('catwalks', build_catwalks)
    spots = [(45.0, YF, 2.0, 16.0), (45.0, YF, 24.0, 16.0), (45.0, YF, 46.0, 16.0), (45.0, YF, 68.0, 16.0),
             (20.0, Y2, 30.0, 14.0), (20.0, Y2, 62.0, 14.0)]
    step('cradles', build_cradles, spots)
    t0 = ntris(mb)
    maint_arm(mb, (37.5, YF, 20.0), 90.0, 55.0, -15.0, -60.0)
    maint_arm(mb, (52.5, YF, 64.0), -90.0, 60.0, -10.0, -55.0)
    maint_arm(mb, (27.0, Y2, 57.0), -90.0, 50.0, -20.0, -60.0)
    tally['arms'] = ntris(mb) - t0
    step('storage', build_storage)
    step('sections', build_sections)
    mb.bm.transform(TO_BLENDER)
    base = mb.to_object('mother_bay')
    objs = [base]
    ct = 0
    for i, (x, y, z, L) in enumerate(spots):
        o = craft('craft%d' % i, L=L * 0.95, variant=i)
        ct += lib.tri_count(o)
        o.matrix_world = TO_BLENDER @ Matrix.Translation((x, y + 0.85, z))
        objs.append(o)
    tally['craft'] = ct
    obj = lib.join_into(objs, 'mother_bay')
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    print('TALLY', ', '.join('%s=%d' % kv for kv in tally.items()), 'total=%d' % lib.tri_count(obj))
    return obj


# =====================================================================================  props
def props_palette():
    reg('crate', (0.26, 0.28, 0.19), 0.3, 0.65)
    reg('crate2', (0.45, 0.25, 0.09), 0.3, 0.6)
    reg('crate_frame', (0.18, 0.18, 0.19), 0.8, 0.4)
    reg('container', (0.34, 0.09, 0.05), 0.4, 0.55)
    reg('steel', (0.55, 0.56, 0.58), 0.95, 0.25)
    reg('hazard', (0.85, 0.55, 0.03), 0.2, 0.5)
    reg('hazard_k', (0.02, 0.02, 0.022), 0.2, 0.6)
    reg('floor_line', (0.72, 0.70, 0.62), 0.1, 0.6)
    reg('barrel', (0.10, 0.22, 0.34), 0.5, 0.45)
    reg('tank', (0.52, 0.53, 0.52), 0.4, 0.45)
    reg('hull', (0.10, 0.105, 0.115), 0.85, 0.35)        # mothership dark gunmetal
    reg('rib', (0.25, 0.255, 0.27), 0.8, 0.38)
    reg('wall', (0.16, 0.165, 0.175), 0.65, 0.5)
    reg('scorch', (0.022, 0.02, 0.018), 0.3, 0.85)
    reg('cable', (0.03, 0.03, 0.035), 0.2, 0.7)
    reg('machine', (0.78, 0.46, 0.05), 0.35, 0.45)
    reg('rubber', (0.025, 0.025, 0.025), 0.0, 0.8)
    reg('seat', (0.09, 0.09, 0.1), 0.1, 0.7)
    reg('suit_orange', (0.95, 0.36, 0.06), 0.05, 0.55)
    reg('suit_white', (0.86, 0.86, 0.84), 0.05, 0.55)
    reg('suit_grey', (0.52, 0.54, 0.56), 0.1, 0.55)
    reg('suit_dark', (0.12, 0.12, 0.13), 0.2, 0.6)
    reg('helmet', (0.9, 0.9, 0.88), 0.15, 0.35)
    reg('visor', (0.16, 0.11, 0.04), 0.9, 0.1)
    reg('blue_light', (0.1, 0.25, 0.4), 0.0, 0.3, (0.25, 0.62, 1.0), 5.0)


def finish_prop(mb, name):
    bm = mb.bm
    lo = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts), min(v.co.z for v in bm.verts)))
    hi = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts), max(v.co.z for v in bm.verts)))
    bm.transform(Matrix.Translation(-(lo + hi) / 2))
    bm.transform(TO_BLENDER)
    o = mb.to_object(name)
    print('PROP %-10s tris=%5d size=(%.2f, %.2f, %.2f)' % (name, lib.tri_count(o), *(hi - lo)))
    return o


def p_crate(name, s, mat):
    mb = MB()
    sx, sy, sz = s
    mb.box((0, 0, 0), (sx - 0.12, sy - 0.12, sz - 0.12), mat, bevel=0.03)
    # frame edges
    for i in (-1, 1):
        for j in (-1, 1):
            mb.box((i * (sx / 2 - 0.06), j * (sy / 2 - 0.06), 0), (0.12, 0.12, sz), 'crate_frame')
            mb.box((i * (sx / 2 - 0.06), 0, j * (sz / 2 - 0.06)), (0.12, sy - 0.24, 0.12), 'crate_frame')
            mb.box((0, i * (sy / 2 - 0.06), j * (sz / 2 - 0.06)), (sx - 0.24, 0.12, 0.12), 'crate_frame')
    # diagonal braces on the big faces
    for sg in (1, -1):
        ob(mb, (-sx / 2 + 0.15, -sy / 2 + 0.15, sg * sz / 2), (sx / 2 - 0.15, sy / 2 - 0.15, sg * sz / 2), 0.14, 0.05,
           'crate_frame', up=(0, 0, 1))
    # stencil + hazard corner + handles
    mb.box((0, sy * 0.25, sz / 2 + 0.01), (sx * 0.4, sy * 0.12, 0.02), 'floor_line')
    hazard_band(mb, (-sx / 2 + 0.2, -sy / 2 + 0.25, -sz / 2), (sx / 2 - 0.2, -sy / 2 + 0.25, -sz / 2), 0.3,
                nrm=(0, 0, -1), stripe=0.35, base=False)
    for sg in (1, -1):
        mb.box((sg * (sx / 2 + 0.03), sy * 0.2, 0), (0.06, 0.1, sz * 0.35), 'steel')
    return finish_prop(mb, name)


def p_container():
    mb = MB()
    container(mb, (0, -1.3, 0), 6.0, 2.6, 2.6, 'container', along='x')
    mb.box((0, 1.31, 0), (5.6, 0.02, 2.2), 'container')
    mb.box((-3.0, -0.2, 0.0), (0.05, 0.6, 0.6), 'scorch')
    return finish_prop(mb, 'container')


def p_barrel():
    mb = MB()
    r, h = 0.36, 1.2
    mb.cyl((0, -h / 2, 0), (0, h / 2, 0), r, r, 'barrel', seg=20)
    for y in (-h / 2 + 0.03, -h / 6, h / 6, h / 2 - 0.03):
        mb.cyl((0, y - 0.025, 0), (0, y + 0.025, 0), r + 0.02, r + 0.02, 'steel', seg=20)
    mb.cyl((0, -0.12, 0), (0, 0.12, 0), r + 0.005, r + 0.005, 'hazard', seg=20)
    mb.cyl((0.18, h / 2, 0), (0.18, h / 2 + 0.04, 0), 0.05, 0.05, 'steel', seg=8)
    mb.cyl((-0.15, h / 2, 0.1), (-0.15, h / 2 + 0.03, 0.1), 0.03, 0.03, 'steel', seg=6)
    return finish_prop(mb, 'barrel')


def p_tank():
    mb = MB()
    r, L = 0.42, 4.0
    b = L / 2 - r
    mb.cyl((-b, 0, 0), (b, 0, 0), r, r, 'tank', seg=20, caps=False)
    for sg in (1, -1):
        mb.sphere((sg * b, 0, 0), r, 'tank', seg=20, rings=10, scale=(1, 1, 1), half=True, rot=(0, sg * 90, 0))
    mb.cyl((b + r - 0.02, 0, 0), (b + r + 0.2, 0, 0), 0.07, 0.07, 'steel', seg=8)
    mb.box((b + r + 0.2, 0, 0), (0.08, 0.3, 0.08), 'steel')
    mb.cyl((b + r + 0.2, 0.0, 0), (b + r + 0.2, 0.2, 0), 0.08, 0.08, 'hazard_k', seg=8)
    mb.cyl((0.6, 0, 0), (1.0, 0, 0), r + 0.004, r + 0.004, 'hazard', seg=20)
    for x in (-1.2, 1.2):
        mb.cyl((x - 0.04, 0, 0), (x + 0.04, 0, 0), r + 0.03, r + 0.03, 'steel', seg=20)
    mb.box((0, 0, r + 0.005), (1.4, 0.18, 0.01), 'floor_line')
    return finish_prop(mb, 'tank')


def torn_plate(name, seed, length, width, curl):
    R = rng(seed)
    mb = MB()
    bm = mb.bm
    nx, ny, th = 12, 6, 0.28

    def deform(x, y, z):
        t = x / length + 0.5
        zz = z + curl * (max(0, t - 0.55) ** 2) * length * 1.6 + 0.04 * length * math.sin(y / width * 3 + seed)
        a = 0.35 * (t - 0.5) * (1 if seed % 2 else -1)
        yy = y * math.cos(a) - zz * math.sin(a)
        zz = y * math.sin(a) + zz * math.cos(a)
        return Vector((x, zz, yy))           # plate lies in x-z, normal +y
    grid = []
    for i in range(nx + 1):
        x = -length / 2 + length * i / nx
        j0 = R.uniform(0, 0.35 * width) if (i in (0, 1, nx - 1, nx) or R.random() < 0.25) else R.uniform(0, 0.05 * width)
        j1 = R.uniform(0, 0.4 * width) if (i in (0, 1, nx - 1, nx) or R.random() < 0.3) else R.uniform(0, 0.05 * width)
        col = []
        for j in range(ny + 1):
            y = lerp(-width / 2 + j0, width / 2 - j1, j / ny)
            xj = x + (R.uniform(-0.5, 0.5) if i in (0, nx) else R.uniform(-0.05, 0.05))
            col.append((xj, y))
        grid.append(col)
    top = [[bm.verts.new(deform(x, y, th / 2)) for x, y in col] for col in grid]
    bot = [[bm.verts.new(deform(x, y, -th / 2)) for x, y in col] for col in grid]
    faces = []
    for i in range(nx):
        for j in range(ny):
            faces.append(bm.faces.new((top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1])))
            faces.append(bm.faces.new((bot[i][j + 1], bot[i + 1][j + 1], bot[i + 1][j], bot[i][j])))
    loop = [(i, 0) for i in range(nx)] + [(nx, j) for j in range(ny)] + \
           [(i, ny) for i in range(nx, 0, -1)] + [(0, j) for j in range(ny, 0, -1)]
    rim = []
    for k in range(len(loop)):
        a, b = loop[k], loop[(k + 1) % len(loop)]
        rim.append(bm.faces.new((top[a[0]][a[1]], bot[a[0]][a[1]], bot[b[0]][b[1]], top[b[0]][b[1]])))
    mh, ms = mb._mi('hull'), mb._mi('scorch')
    for f in faces:
        f.material_index = mh
    for f in rim:
        f.material_index = ms
    # scorched border faces (quads touching the outline)
    for i in range(nx):
        for j in range(ny):
            edge = i in (0, nx - 1) or j in (0, ny - 1)
            c = grid[i][j]
            if edge and (R.random() < 0.75 or noise.noise(Vector((c[0], c[1], seed)) * 0.6) > 0.1):
                faces[2 * (i * ny + j)].material_index = ms
                faces[2 * (i * ny + j) + 1].material_index = ms
    # stiffener ribs on the back
    for i in (3, 6, 9):
        x = -length / 2 + length * i / nx
        pa, pb = deform(x, grid[i][0][1] + 0.1, -th / 2 - 0.2), deform(x, grid[i][-1][1] - 0.1, -th / 2 - 0.2)
        ob(mb, pa, pb, 0.18, 0.4, 'rib', up=(0, 1, 0))
    for yy in (-width * 0.15, width * 0.2):
        pts = [deform(-length / 2 + length * i / nx, yy, -th / 2 - 0.12) for i in range(1, nx)]
        for a, b in zip(pts, pts[1:]):
            ob(mb, a, b, 0.14, 0.22, 'rib', up=(0, 1, 0))
    # armour panel seams / raised plates on the outside
    for i in range(3, 9, 2):
        x0 = -length / 2 + length * i / nx
        p0 = deform(x0, -width * 0.05, th / 2 + 0.06)
        p1 = deform(x0 + length / nx * 1.6, -width * 0.05, th / 2 + 0.06)
        ob(mb, p0, p1, width * 0.45, 0.12, 'hull', up=(0, 1, 0), bevel=0.03)
    for k in range(4):   # dead window slots
        p = deform(-length * 0.25 + k * 0.6, width * 0.3, th / 2 + 0.02)
        mb.box(p, (0.35, 0.05, 0.22), 'scorch')
    return finish_prop(mb, name)


def p_rib():
    """10 m I-girder, bent in the middle and twisted, torn ends."""
    mb = MB()
    L = 10.0
    n = 16
    D, W, tw, tf = 0.9, 0.55, 0.12, 0.1
    prof = [(-W / 2, -D / 2), (W / 2, -D / 2), (W / 2, -D / 2 + tf), (tw / 2, -D / 2 + tf), (tw / 2, D / 2 - tf),
            (W / 2, D / 2 - tf), (W / 2, D / 2), (-W / 2, D / 2), (-W / 2, D / 2 - tf), (-tw / 2, D / 2 - tf),
            (-tw / 2, -D / 2 + tf), (-W / 2, -D / 2 + tf)]
    rings, mats = [], []
    for i in range(n + 1):
        t = i / n
        x = (t - 0.5) * L
        bend = 0.9 * math.exp(-((t - 0.55) / 0.12) ** 2)
        ang = 0.9 * (1 / (1 + math.exp(-(t - 0.55) * 25)))         # kink ~50 deg
        c = Vector((x * math.cos(ang * 0.5) if t < 0.55 else 0, 0, 0))
        # centreline: straight, then turned by ang after the kink point
        xk = (0.55 - 0.5) * L
        if x <= xk:
            c = Vector((x, 0, 0))
            d = Vector((1, 0, 0))
        else:
            d = Vector((math.cos(ang), math.sin(ang), 0))
            c = Vector((xk, 0, 0)) + d * (x - xk)
        tw_a = 0.5 * t
        s = Vector((0, 0, 1))
        u = d.cross(s) * -1
        R = Matrix.Rotation(tw_a, 3, d)
        s, u = R @ s, R @ u
        ring = [c + s * (a * (1 - 0.3 * bend)) + u * (b * (1 + 0.1 * bend)) for a, b in prof]
        rings.append(ring)
    mb.loft(rings, 'rib', cap0=True, cap1=True)
    # torn / scorched ends: jagged flange shards
    R = rng(55)
    for end in (0, n):
        for a, b in prof[::3]:
            p = rings[end][prof.index((a, b))]
            q = p + Vector((R.uniform(-0.4, 0.4), R.uniform(-0.3, 0.3), R.uniform(-0.3, 0.3))) + \
                (Vector((-0.5, 0, 0)) if end == 0 else Vector((0.4, 0.3, 0)))
            ob(mb, p, q, 0.1, 0.08, 'scorch')
    for i in (0, 1, n - 1):
        for p in rings[i][::2]:
            pass
    mb.loft([[p + (p - sum(rings[0], Vector()) / 12) * 0.03 for p in rings[0]],
             [p + (p - sum(rings[1], Vector()) / 12) * 0.03 for p in rings[1]]], 'scorch', cap0=False, cap1=False)
    mb.loft([[p + (p - sum(rings[-2], Vector()) / 12) * 0.03 for p in rings[-2]],
             [p + (p - sum(rings[-1], Vector()) / 12) * 0.03 for p in rings[-1]]], 'scorch', cap0=False, cap1=False)
    # bolt plates / lightening holes suggestion
    for t in (0.2, 0.35, 0.8):
        i = int(t * n)
        c = sum(rings[i], Vector()) / 12
        mb.box(c, (0.4, 0.5, 0.2), 'hull')
    return finish_prop(mb, 'rib')


def p_cable():
    mb = MB()
    pts = []
    turns, r, pitch = 4.5, 0.75, 0.13
    N = int(turns * 16)
    R = rng(7)
    for i in range(N + 1):
        a = i / 16 * 2 * math.pi
        rr = r + 0.06 * math.sin(i * 0.7)
        pts.append(Vector((math.cos(a) * rr, (i / N - 0.5) * turns * pitch + 0.05 * math.sin(a * 0.5),
                           math.sin(a) * rr)))
    tail0 = [pts[0] + Vector((0.3, 0.1, -0.6)), pts[0] + Vector((0.9, 0.3, -1.4)), pts[0] + Vector((1.2, 0.7, -2.2))]
    tail1 = [pts[-1] + Vector((-0.4, 0.2, 0.5)), pts[-1] + Vector((-0.6, 0.8, 1.2))]
    path = tail0[::-1] + pts + tail1
    tube(mb, path, 0.075, 'cable', seg=6)
    # coupling ends + straps
    for p, q in ((path[0], path[1]), (path[-1], path[-2])):
        d = (p - q).normalized()
        mb.cyl(p - d * 0.05, p + d * 0.25, 0.12, 0.12, 'hazard', seg=8)
        mb.cyl(p + d * 0.25, p + d * 0.35, 0.08, 0.08, 'steel', seg=8)
    for a in (0.3, 2.4, 4.4):
        c = Vector((math.cos(a) * r, 0, math.sin(a) * r))
        mb.box(c, (0.25, turns * pitch + 0.25, 0.08), 'hazard_k', rot=(0, -a / D2R + 90, 0))
    return finish_prop(mb, 'cable')


def p_toolcart():
    mb = MB()
    w, d, h = 1.0, 0.6, 0.95
    mb.box((0, 0.55, 0), (w, 0.7, d), 'machine', bevel=0.03)        # drawer body
    for k in range(4):
        y = 0.28 + k * 0.17
        mb.box((0, y, d / 2 + 0.01), (w - 0.1, 0.13, 0.02), 'hazard_k')
        mb.box((0, y + 0.03, d / 2 + 0.04), (0.3, 0.025, 0.04), 'steel')
    mb.box((0, h, 0), (w + 0.1, 0.05, d + 0.1), 'steel')                # top tray
    for sg in (1, -1):
        mb.box((sg * (w / 2 + 0.03), h + 0.06, 0), (0.03, 0.1, d + 0.1), 'steel')
    mb.box((0, 0.12, 0), (w, 0.04, d), 'steel')                          # lower shelf
    for sx in (1, -1):
        for sz in (1, -1):
            mb.cyl((sx * 0.4, 0.12, sz * 0.22), (sx * 0.4, 0.08, sz * 0.22), 0.03, 0.03, 'steel', seg=6)
            mb.cyl((sx * 0.4 - 0.025, 0.06, sz * 0.22), (sx * 0.4 + 0.025, 0.06, sz * 0.22), 0.06, 0.06, 'rubber',
                   seg=10)
    # handle
    tube(mb, [(-w / 2 - 0.02, 0.8, -0.2), (-w / 2 - 0.2, 0.9, -0.2), (-w / 2 - 0.2, 0.9, 0.2),
              (-w / 2 - 0.02, 0.8, 0.2)], 0.02, 'steel', seg=6)
    # tools on top
    mb.cyl((-0.2, h + 0.06, -0.1), (0.25, h + 0.06, 0.05), 0.025, 0.025, 'steel', seg=6)        # wrench bar
    mb.box((0.28, h + 0.06, 0.06), (0.1, 0.03, 0.08), 'steel')
    mb.box((0.15, h + 0.1, -0.15), (0.3, 0.12, 0.14), 'hazard', bevel=0.01)                      # drill body
    mb.cyl((0.0, h + 0.1, -0.15), (-0.15, h + 0.1, -0.15), 0.02, 0.015, 'steel', seg=6)
    mb.box((-0.3, h + 0.08, 0.15), (0.2, 0.08, 0.15), 'rubber')
    mb.box((-0.3, h + 0.125, 0.15), (0.12, 0.01, 0.08), 'blue_light')                            # tablet screen
    return finish_prop(mb, 'toolcart')


def p_seat():
    mb = MB()
    mb.box((0, 0.5, 0), (0.55, 0.12, 0.55), 'seat', bevel=0.04)                 # cushion
    mb.box((0, 0.95, -0.28), (0.55, 0.8, 0.12), 'seat', rot=(-8, 0, 0), bevel=0.04)   # back
    mb.box((0, 1.45, -0.35), (0.34, 0.24, 0.12), 'seat', rot=(-8, 0, 0), bevel=0.03)   # headrest
    for sg in (1, -1):
        mb.box((sg * 0.31, 0.72, -0.03), (0.07, 0.07, 0.45), 'steel')          # armrest
        mb.box((sg * 0.31, 0.61, 0.15), (0.05, 0.2, 0.05), 'steel')
        ob(mb, (sg * 0.12, 1.3, -0.33), (sg * 0.05, 0.56, 0.2), 0.06, 0.015, 'suit_orange')   # harness straps
    mb.box((0, 0.56, 0.18), (0.1, 0.06, 0.08), 'steel')                          # buckle
    mb.cyl((0, 0.44, 0), (0, 0.1, 0), 0.05, 0.05, 'steel', seg=8)               # post
    mb.cyl((0, 0.1, 0), (0, 0.04, 0), 0.12, 0.12, 'rib', seg=10)
    for k in range(4):                                                           # torn floor mount
        a = k * math.pi / 2 + 0.4
        mb.box((math.cos(a) * 0.2, 0.03, math.sin(a) * 0.2), (0.3, 0.05, 0.06), 'rib', rot=(0, -a / D2R, 0))
    mb.box((0.2, 0.0, -0.1), (0.25, 0.02, 0.15), 'scorch', rot=(0, 20, 12))
    return finish_prop(mb, 'seat')


# -------------------------------------------------------------------------------------  people
def limb(mb, a, b, ra, rb, mat, seg=8):
    mb.cyl(a, b, ra, rb, mat, seg=seg)


def joint(mb, p, r, mat):
    mb.sphere(p, r, mat, seg=8, rings=5)


def person(name, pose, suit, accent, helmet='helmet', pack=True):
    """pose: dict of unit-ish direction vectors (body frame: +x = person's left, +y = up, +z = front)."""
    mb = MB()
    V = lambda t: Vector(t).normalized()
    sp = V(pose.get('spine', (0, 1, 0)))
    fw = V(pose.get('front', (0, 0, 1)))
    fw = (fw - sp * fw.dot(sp)).normalized()
    lf = sp.cross(fw)                   # person's left
    pel = Vector((0, 0, 0))
    chest = pel + sp * 0.52
    # torso: pelvis block, abdomen, chest (suit), chest unit, backpack
    ob(mb, pel - sp * 0.08, pel + sp * 0.12, 0.36, 0.24, suit, up=fw, bevel=0.04)
    ob(mb, pel + sp * 0.08, chest - sp * 0.12, 0.34, 0.22, accent if accent != suit else suit, up=fw, bevel=0.04)
    ob(mb, chest - sp * 0.2, chest + sp * 0.08, 0.46, 0.3, suit, up=fw, bevel=0.06)
    ob(mb, chest - sp * 0.12 + fw * 0.16, chest + sp * 0.0 + fw * 0.16, 0.2, 0.06, 'suit_dark', up=fw)
    mb.box(chest - sp * 0.06 + fw * 0.195, (0.06, 0.04, 0.02), 'blue_light')
    if pack:
        ob(mb, chest - sp * 0.3 - fw * 0.27, chest + sp * 0.1 - fw * 0.27, 0.4, 0.22, 'suit_grey' if suit != 'suit_grey'
           else 'suit_dark', up=fw, bevel=0.05)
    # neck ring + helmet + visor
    neck = chest + sp * 0.12
    mb.cyl(neck - sp * 0.02, neck + sp * 0.06, 0.13, 0.12, 'suit_dark', seg=12)
    hd = V(pose.get('head', tuple(sp)))
    hc = neck + hd * 0.17
    hf = (fw - hd * fw.dot(hd)).normalized()
    mb.sphere(hc, 0.155, helmet, seg=14, rings=8)
    q = Matrix((hd.cross(hf), hd, hf)).transposed()        # columns: x=side, y=up, z=front
    eul = q.to_euler()
    mb.sphere(hc + hf * 0.075 + hd * 0.012, 0.135, 'visor', seg=12, rings=7, scale=(0.98, 0.72, 0.78),
              rot=tuple(a / D2R for a in eul))
    # arms
    for sg, key in ((1, 'l'), (-1, 'r')):
        sh = chest + lf * sg * 0.24 - sp * 0.02
        ua = V(pose[key + 'ua'])
        fa = V(pose[key + 'fa'])
        el = sh + ua * 0.3
        wr = el + fa * 0.27
        joint(mb, sh, 0.095, suit)
        limb(mb, sh, el, 0.085, 0.07, suit)
        joint(mb, el, 0.072, accent)
        limb(mb, el, wr, 0.068, 0.056, suit)
        mb.cyl(wr - fa * 0.03, wr + fa * 0.03, 0.058, 0.058, 'suit_dark', seg=8)   # glove cuff
        hand = wr + fa * 0.08
        mb.sphere(hand, 0.055, 'suit_dark', seg=8, rings=5, scale=(1.0, 0.7, 1.3),
                  rot=tuple(a / D2R for a in fa.to_track_quat('Z', 'Y').to_euler()))
    # legs
    for sg, key in ((1, 'l'), (-1, 'r')):
        hp = pel + lf * sg * 0.11 - sp * 0.06
        th = V(pose[key + 'th'])
        sh_ = V(pose[key + 'sh'])
        kn = hp + th * 0.44
        an = kn + sh_ * 0.42
        joint(mb, hp, 0.11, suit)
        limb(mb, hp, kn, 0.105, 0.082, suit)
        joint(mb, kn, 0.082, accent)
        limb(mb, kn, an, 0.078, 0.062, suit)
        ft = V(pose.get(key + 'ft', tuple(fw - sh_ * fw.dot(sh_))))
        ob(mb, an - sh_ * 0.06 - ft * 0.06, an + ft * 0.2 + sh_ * 0.02, 0.12, 0.13, 'suit_dark', up=-sh_, bevel=0.02)
    # accent stripes on the forearms/shins not needed; reflective patch on the shoulders
    for sg in (1, -1):
        mb.box(chest + lf * sg * 0.2 + sp * 0.05 + fw * 0.0, (0.03, 0.03, 0.03), 'suit_dark')
    return finish_prop(mb, name)


POSES = {
    # arms spread wide, legs apart (starfish)
    'person0': dict(spine=(0, 1, 0), front=(0, 0, 1), head=(0, 1, -0.25),
                    lua=(1, 0.35, 0.05), lfa=(1, 0.65, 0.2), rua=(-1, 0.25, -0.05), rfa=(-1, 0.55, 0.3),
                    lth=(0.4, -1, 0.1), lsh=(0.5, -1, -0.25), rth=(-0.35, -1, 0.2), rsh=(-0.45, -1, -0.1)),
    # curled up (knees to chest, arms hugging knees, head down)
    'person1': dict(spine=(0, 1, 0.55), front=(0, -0.4, 1), head=(0, 0.7, 1),
                    lua=(0.25, -0.35, 1), lfa=(-0.6, -0.2, 0.6), rua=(-0.25, -0.35, 1), rfa=(0.6, -0.2, 0.6),
                    lth=(0.2, 0.55, 1), lsh=(0.05, -1, 0.1), rth=(-0.2, 0.45, 1), rsh=(-0.05, -1, -0.05)),
    # reaching: one arm stretched up/out, the other trailing, one knee bent
    'person2': dict(spine=(0, 1, -0.1), front=(0, 0, 1), head=(0.1, 1, 0.3),
                    lua=(0.3, 1, 0.35), lfa=(0.25, 1, 0.45), rua=(-0.5, -0.8, -0.4), rfa=(-0.2, -1, 0.2),
                    lth=(0.1, -0.4, 1), lsh=(0.05, -1, -0.1), rth=(-0.15, -1, -0.35), rsh=(-0.1, -1, -0.6)),
    # tumbling backwards: arched back, arms flailing (one over the head, one forward), legs scissored
    'person3': dict(spine=(0.2, 1, -0.45), front=(0, 0.4, 1), head=(0.15, 0.7, -0.8),
                    lua=(0.6, 1, -0.3), lfa=(0.3, 0.6, -1), rua=(-0.8, 0.2, 0.7), rfa=(-0.2, 0.5, 1),
                    lth=(0.25, -0.6, 0.9), lsh=(0.1, -1, -0.2), rth=(-0.2, -1, -0.5), rsh=(-0.1, -0.2, -1)),
}
SUITS = {'person0': ('suit_orange', 'suit_dark', 'helmet'), 'person1': ('suit_white', 'suit_orange', 'helmet'),
         'person2': ('suit_grey', 'suit_orange', 'suit_grey'), 'person3': ('suit_orange', 'suit_white', 'helmet')}


def bay_props():
    props_palette()
    objs = [p_crate('crate0', (2.0, 2.0, 2.0), 'crate'), p_crate('crate1', (3.0, 1.5, 1.5), 'crate2'),
            p_container(), p_barrel(), p_tank(),
            torn_plate('panel0', 301, 5.0, 3.4, 0.35), torn_plate('panel1', 302, 7.6, 4.2, -0.5),
            p_rib(), p_cable(), p_toolcart(), p_seat()]
    for n, pose in POSES.items():
        s, a, h = SUITS[n]
        objs.append(person(n, pose, s, a, helmet=h, pack=(n != 'person2')))
    for o in objs:
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    return objs


# =====================================================================================  preview renders
def G2B(x, y, z):
    return Vector((x, -z, y))


def render_all():
    import render_ships as rs
    os.makedirs(OUT, exist_ok=True)
    rs.setup()
    s = bpy.context.scene
    s.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (0.002, 0.0025, 0.004, 1)
    try:
        s.eevee.use_raytracing = True
    except Exception:
        pass
    only = sys.argv[sys.argv.index('--') + 2:] if '--' in sys.argv else []
    if only == ['props']:
        return render_props(rs)
    # --- bay
    rs.clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, 'mother_bay.glb'))
    # fake outer hull slab with the melted hole at x = 62 for context
    mb = MB()
    reg('hullx', (0.10, 0.105, 0.115), 0.85, 0.35)
    ring_in = [Vector((62.0, 10 + math.sin(a) * HOLE_R, 40 + math.cos(a) * HOLE_R)) for a in
               [i / 48 * 2 * math.pi for i in range(48)]]
    ring_out = [Vector((62.0, 10 + math.sin(a) * 130, 40 + math.cos(a) * 130)) for a in
                [i / 48 * 2 * math.pi for i in range(48)]]
    mb.loft([ring_in, ring_out, [p + Vector((2, 0, 0)) for p in ring_out], [p + Vector((2, 0, 0)) for p in ring_in]],
            'hullx', wrap=True)
    mb.bm.transform(TO_BLENDER)
    hull = mb.to_object('_hull')
    # lighting: dim cool starlight from +X + interior fill lights under the lamp rows
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 1.2
    sun.color = (0.8, 0.85, 1.0)
    so = bpy.data.objects.new('sun', sun)
    s.collection.objects.link(so)
    so.rotation_euler = (G2B(-1, -0.4, 0.3)).to_track_quat('-Z', 'Y').to_euler()
    for z in RIBS[:-1]:
        for (x, y, e) in ((14, 33, 5000), (31, 33, 5000), (44, 33, 5000), (16, -3, 2500), (11, 13, 1500)):
            L = bpy.data.lights.new('pl', 'POINT')
            L.energy = e * LIGHT_SCALE
            L.use_shadow = (x == 31)
            L.color = (1.0, 0.93, 0.82)
            L.shadow_soft_size = 1.5
            o = bpy.data.objects.new('pl', L)
            o.location = G2B(x, y, z + 4.5)
            s.collection.objects.link(o)
    for r in section_layout():
        L = bpy.data.lights.new('rl', 'POINT')
        L.energy = (60 if r['dark'] else 450) * (r['z1'] - r['z0']) / 10 * LIGHT_SCALE
        L.color = (1.0, 0.6, 0.25) if r['dark'] else (1.0, 0.93, 0.82)
        L.use_shadow = False
        L.shadow_soft_size = 1.0
        o = bpy.data.objects.new('rl', L)
        o.location = G2B((r['x0'] + 60) / 2, r['y1'] - 0.9, (r['z0'] + r['z1']) / 2)
        s.collection.objects.link(o)
    for r in section_layout():
        L = bpy.data.lights.new('rl', 'POINT')
        L.energy = (150 if r['dark'] else 900) * LIGHT_SCALE
        L.color = (1.0, 0.6, 0.2) if r['dark'] else (1.0, 0.93, 0.82)
        L.use_shadow = False
        o = bpy.data.objects.new('rl', L)
        o.location = G2B((r['x0'] + SX1) / 2 + 3, r['y1'] - 1.0, (r['z0'] + r['z1']) / 2)
        s.collection.objects.link(o)
    shots = [('section', (260, 10, 40), (30, 10, 40), 30),
             ('wide', (175, 12, 40), (30, 8, 40), 40),
             ('upper', (95, 40, 30), (40, 43, 45), 30),
             ('lower', (95, -22, 30), (40, -25, 45), 30),
             ('section', (300, 10, 40), (30, 10, 40), 35),
             ('below', (95, -40, 30), (40, -24, 40), 35),
             ('above', (95, 58, 45), (40, 44, 40), 35),
             ('mid', (110, 6, 38), (30, 4, 42), 40),
             ('close', (78, 2, 22), (40, -6, 34), 35),
             ('oblique', (100, 25, -10), (32, 5, 55), 35),
             ('inside', (57, -10, 95), (25, 5, 30), 24),
             ('decks', (70, 8, 60), (12, 6, 45), 30)]
    cam = bpy.data.objects.new('_cam', bpy.data.cameras.new('_cam'))
    s.collection.objects.link(cam)
    s.camera = cam
    for name, eye, tgt, lens in shots:
        if only and name not in only:
            continue
        hull.hide_render = name in ('inside', 'decks', 'section')
        cam.data.lens = lens
        cam.data.clip_start = 0.3
        cam.data.clip_end = 2000
        e, t = G2B(*eye), G2B(*tgt)
        cam.location = e
        cam.rotation_euler = (t - e).to_track_quat('-Z', 'Y').to_euler()
        s.render.filepath = os.path.join(OUT, 'v9_bay_%s.png' % name)
        bpy.ops.render.render(write_still=True)
        print('WROTE', s.render.filepath, flush=True)
    if not only:
        render_props(rs)


def render_props(rs):
    rs.clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(ASSETS, 'bay_props.glb'))
    objs = [o for o in bpy.data.objects if o.type == 'MESH']
    order = ['crate0', 'crate1', 'container', 'barrel', 'tank', 'panel0', 'panel1', 'rib', 'cable', 'toolcart', 'seat',
             'person0', 'person1', 'person2', 'person3']
    byname = {o.name: o for o in objs}
    for o in objs:
        o.rotation_mode = 'XYZ'
    for n in ('panel0', 'panel1'):
        byname[n].rotation_euler = (70 * D2R, 0, 0)
    rows = [(['crate0', 'crate1', 'container', 'tank', 'barrel', 'cable', 'toolcart', 'seat'], 6.5, 1.0),
            (['panel0', 'panel1', 'rib'], 0.0, 1.5),
            (['person0', 'person1', 'person2', 'person3'], -3.5, 1.2)]
    for names, z, gap in rows:
        x = 0.0
        placed = []
        for n in names:
            o = byname[n]
            bpy.context.view_layer.update()
            lo, hi = rs.bbox([o])
            w = hi.x - lo.x
            o.location = Vector((x + w / 2 - (hi.x + lo.x) / 2 + o.location.x, 0, z + (hi.z - lo.z) / 2))
            x += w + gap
            placed.append(o)
        for o in placed:
            o.location.x -= (x - gap) / 2
    rs.lights(Vector((0, 0, 4)), 20)
    rs.shot(Vector((0, 0, 2.8)), 17, 0, 6, 0.85, os.path.join(OUT, 'v9_bay_props.png'))
    # persons close-up (front and three-quarter)
    ppl = ['person0', 'person1', 'person2', 'person3']
    for o in objs:
        o.hide_render = o.name not in ppl
    for i, n in enumerate(ppl):
        byname[n].location = Vector(((i - 1.5) * 1.9, 0, 1.1))
        byname[n].rotation_euler = (0, 0, 0)
    rs.shot(Vector((0, 0, 1.1)), 3.3, 0, 8, 0.9, os.path.join(OUT, 'v9_bay_people.png'))
    rs.shot(Vector((0, 0, 1.1)), 3.3, 55, 20, 0.9, os.path.join(OUT, 'v9_bay_people_34.png'))


# =====================================================================================  main
def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if argv and argv[0] == 'render':
        render_all()
        return
    os.makedirs(ASSETS, exist_ok=True)
    lib.reset_scene()
    mother_bay()
    lib.export_glb(os.path.join(ASSETS, 'mother_bay.glb'))
    lib.reset_scene()
    objs = bay_props()
    print('PROPS total tris=%d' % sum(lib.tri_count(o) for o in objs))
    lib.export_glb(os.path.join(ASSETS, 'bay_props.glb'))
    print('EXPORTED', flush=True)


main()
