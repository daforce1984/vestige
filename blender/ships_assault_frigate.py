"""v11 assault frigate ("trident" brawler): a close-assault gunship / missile boat.
Design / zoning: blender/ASSAULT_FRIGATE_DESIGN.md.  Replaces the v5 white 'workhorse' assault frigate
(ships_hiigaran_v5.assault_frigate, left in place).  Same family as the v10 ion frigate and the v9 flagship:
blue-black gunmetal armour via shipkit.armor/cuts/plate, slate-blue accent, amber markers, blue beacons, no masts.

Layout: a wedge-prowed armoured centre hull flanked by two sponson gun pods on swept pylons (trimaran plan, open
space between the pylons), a dorsal VLS missile citadel between two twin gun turrets (the aft one superfiring),
a raked blade bridge tower aft, a ventral twin turret, twin main engines + one engine per sponson.

CONTRACT (glTF: +Z bow, +Y up, +X starboard):
  * root node 'assault_frigate'; length ~48 m (prow tip s=+22, nozzle exits s~-25.5); width ~17 m.
  * 'engine' (emissive) only on the four aft-facing nozzle throat discs (normals forced to glTF -Z).
  * 'window' emissive crew / bridge windows.
Blender space: bow toward -Y (station s = -y = glTF z), up +Z (= glTF y), +X = starboard.

Standalone usage (from WSL, project root):
  "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \
      --python "$(wslpath -w blender/ships_assault_frigate.py)" [-- nosave]
(build_models.py 'assault_frigate' calls assault_frigate() the normal way.)
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
from mathutils import Vector
import lib
from lib import MB, reg, rng, lerp, annulus
from shipkit import Hull, armor, cuts, obox, plate, lamp_fixture, window_bay, beacon
from ships_ion_frigate import (Y, blk, gp, cuts_at, deck_z, Surf, pair, sidep, pd_turret, sensor_array,
                               radiator_bank, rcs_quad, hatch, vent_louvre, sensor_dome, conduit, engine_bell,
                               fix_normals, docking_port)

LAMP_BODY, WIN_FRAME = 'hull2', 'greeble'
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
T = 0.24            # armour plate thickness


def palette():
    """glTF metallic-roughness values (fleet palette, same as the v10 ion frigate)."""
    reg('hull', (0.085, 0.092, 0.110), 0.75, 0.45)      # blue-black gunmetal (structure)
    reg('hull2', (0.130, 0.136, 0.152), 0.70, 0.48)     # lighter armour plates
    reg('plate', (0.066, 0.072, 0.088), 0.80, 0.40)     # dark satin plates
    reg('greeble', (0.055, 0.057, 0.064), 0.65, 0.55)   # machinery, recesses, barrels
    reg('trim', (0.200, 0.202, 0.212), 0.90, 0.32)      # bare machined metal: collars, pipes, rails
    reg('accent', (0.070, 0.120, 0.215), 0.40, 0.42)    # restrained slate-blue bands
    reg('exhaust', (0.300, 0.265, 0.300), 1.00, 0.36)   # heat-tinted nozzle metal
    reg('glass', (0.020, 0.032, 0.050), 0.30, 0.08)     # sights / domes
    reg('window', (0.20, 0.12, 0.06), 0.0, 0.40, (1.0, 0.62, 0.28), 3.0)
    reg('amber', (0.25, 0.10, 0.03), 0.0, 0.40, (1.0, 0.42, 0.08), 4.0)
    reg('blue_light', (0.05, 0.10, 0.20), 0.0, 0.40, (0.3, 0.6, 1.0), 5.0)
    reg('engine', (0.40, 0.50, 0.60), 0.0, 0.30, (0.72, 0.86, 1.0), 6.0)


# centre hull: steeply sloped upper armour (edges: 0 stbd wall, 1 stbd top slope, 2 deck, 3 port top slope,
# 4 port wall, 5 port low slope, 6 keel, 7 stbd low slope)
PROF = [(1, -0.25), (1, 0.35), (0.7, 1), (-0.7, 1), (-1, 0.35), (-1, -0.25), (-0.55, -1), (0.55, -1)]
MAIN = [(-23.0, 7.6, 5.8, 0.0), (-22.2, 8.2, 6.2, 0.0), (-6.0, 8.2, 6.2, 0.0), (7.0, 7.8, 5.8, -0.1),
        (14.0, 6.0, 4.2, -0.4), (19.5, 3.4, 2.0, -0.7), (22.0, 1.2, 0.8, -0.8)]
S_STERN, S_BOW = MAIN[0][0], MAIN[-1][0]
# sponson gun pods (octagonal), centre x = +-SPX
SPROF = [(1, -0.5), (1, 0.5), (0.5, 1), (-0.5, 1), (-1, 0.5), (-1, -0.5), (-0.5, -1), (0.5, -1)]
SPX, SPZ = 7.2, -1.0
SPON = [(-18.0, 2.5, 2.6, SPZ), (-17.2, 2.6, 2.7, SPZ), (8.5, 2.6, 2.7, SPZ), (11.8, 2.3, 2.4, SPZ),
        (12.8, 1.9, 1.9, SPZ)]
SP_STERN, SP_BOW = SPON[0][0], SPON[-1][0]
PYLONS = ((-12.0, -6.4), (0.8, 6.2))           # swept pylon root spans (s aft, s fore)
VLS = (0.6, 8.6)                               # missile citadel span
TWR = (-19.8, -8.4)                            # bridge casemate span

UP_MAT = lambda i, j, R: 'hull2' if R.random() < 0.72 else 'plate'
DN_MAT = lambda i, j, R: 'plate' if R.random() < 0.7 else 'hull'
WALL_MAT = lambda i, j, R: ('plate', 'hull2')[j % 2] if R.random() < 0.8 else 'hull'


# ================================================================================================ structure
def main_hull(mb, H, R):
    H.build(mb, 'hull')
    s0, s1 = S_STERN + 0.4, 19.9
    sc = cuts(s0, s1, R, 3.4, 6.2)
    for e in (1, 3):
        armor(mb, H, sc, [e + 0.03, e + 0.97], UP_MAT, R, thick=T, gap_s=0.3, gap_p=0.0, sub_prob=0.4,
              sub_mat='plate')
    for e in (5, 7):
        armor(mb, H, sc, [e + 0.03, e + 0.97], DN_MAT, R, thick=T, gap_s=0.3, gap_p=0.0, sub_prob=0.12,
              sub_mat='hull')
    for e in (0, 4):
        armor(mb, H, cuts(s0, s1, R, 3.0, 5.4), [e + 0.03, e + 0.5, e + 0.97], WALL_MAT, R, thick=T,
              gap_s=0.3, gap_p=gp(H, 0, e), sub_prob=0.25, sub_mat='hull2')
    # deck lanes; open under the VLS citadel and the bridge casemate (covered by them)
    DECK_P = [2.02, 2.22, 2.4, 2.6, 2.78, 2.98]
    skip = [(VLS[0], VLS[1], 2.0, 3.0), (TWR[0], TWR[1], 2.0, 3.0)]
    sc = cuts_at(s0, s1, R, 3.2, 6.0, fixed=(VLS[0], VLS[1], TWR[0], TWR[1]))
    armor(mb, H, sc, DECK_P, UP_MAT, R, thick=T, gap_s=0.3, gap_p=gp(H, 0, 2), skip=skip, sub_prob=0.2,
          sub_mat='plate')
    for pc in ([6.03, 6.5], [6.5, 6.97]):
        armor(mb, H, cuts(s0, s1, R, 3.4, 6.2), pc, DN_MAT, R, thick=T, gap_s=0.3, gap_p=gp(H, 0, 6),
              sub_prob=0.12, sub_mat='hull')
    # keel spine blocks
    s = s0 + 0.3
    while s < 17.0:
        L = min(5.4, 17.0 - s)
        zk = min(H.at(s)[2] - H.at(s)[1] / 2, H.at(s + L)[2] - H.at(s + L)[1] / 2)
        blk(mb, s, s + L, -0.55, 0.55, zk + 0.3, zk - 0.42, 'hull2', ins=0.12)
        s += L + 0.3
    # armoured ram: the prow tip is one continuous hull2 cap with a trim cutwater along the keel line
    for e in range(8):
        plate(mb, H, 20.2, 21.95, e + 0.03, e + 0.97, 'hull2', thick=0.2)
    zk0, zk1 = H.at(12.0)[2] - H.at(12.0)[1] / 2, H.at(21.6)[2] - H.at(21.6)[1] / 2
    mb.hexa([(-0.22, Y(12.0), zk0 + 0.3), (0.22, Y(12.0), zk0 + 0.3), (0.12, Y(21.6), zk1 + 0.1),
             (-0.12, Y(21.6), zk1 + 0.1), (-0.14, Y(12.6), zk0 - 0.5), (0.14, Y(12.6), zk0 - 0.5),
             (0.06, Y(21.4), zk1 - 0.12), (-0.06, Y(21.4), zk1 - 0.12)], 'trim')
    # restrained accent: slate-blue band plates on the upper wall belt at the citadel and casemate fronts
    for sb in (-8.0, 9.2):
        for e in (0, 4):
            plate(mb, H, sb - 0.4, sb + 0.4, e + 0.5, e + 0.97, 'accent', off=0.0, thick=T + 0.06, ch=0.1)


def sponson(mb, SP, sg, R):
    """Gun pod hull + armour; engine at the stern, breaching cannon at the bow."""
    SP.build(mb, 'hull')
    s0, s1 = SP_STERN + 0.3, SP_BOW - 0.4
    sc = cuts(s0, s1, R, 3.2, 5.6)
    for e in range(8):
        mats = UP_MAT if e in (1, 2, 3) else (WALL_MAT if e in (0, 4) else DN_MAT)
        pc = [e + 0.04, e + 0.5, e + 0.96] if e in (0, 4) else [e + 0.04, e + 0.96]
        armor(mb, SP, sc, pc, mats, R, thick=0.2, gap_s=0.26, gap_p=gp(SP, 0, e, 0.1) if e in (0, 4) else 0.0,
              sub_prob=0.2, sub_mat='plate')
    # accent collar ring near the nose + dark band aft of it
    plate(mb, SP, 9.3, 10.1, 0.02, 7.98, 'accent', thick=0.28, ch=0.08, rnd=0)
    x = sg * SPX
    # breaching cannon: gun shield, recoil jacket, barrel, heat rings, muzzle brake
    ax = (0, -1, 0)
    mb.cyl((x, Y(12.4), SPZ), (x, Y(13.7), SPZ), 0.95, 0.8, 'hull2', seg=20)
    annulus(mb, (x, Y(13.75), SPZ), ax, 0.5, 0.9, 0.2, 'trim', seg=20)
    mb.cyl((x, Y(13.6), SPZ), (x, Y(15.6), SPZ), 0.55, 0.48, 'trim', seg=14)
    mb.cyl((x, Y(15.5), SPZ), (x, Y(19.4), SPZ), 0.36, 0.33, 'greeble', seg=14)
    for s in (16.2, 17.1, 18.0):
        annulus(mb, (x, Y(s), SPZ), ax, 0.3, 0.45, 0.2, 'hull2', seg=14)
    mb.cyl((x, Y(19.2), SPZ), (x, Y(20.1), SPZ), 0.47, 0.47, 'hull2', seg=14)
    for k in (1, -1):   # brake side ports
        obox(mb, Vector((x + k * 0.47, Y(19.65), SPZ)), Vector((k, 0, 0)), (0.3, 0.55, 0.12), 'greeble', lift=0.0)
    annulus(mb, (x, Y(20.08), SPZ), ax, 0.22, 0.4, 0.06, 'plate', seg=14)
    # cheek armour over the gun shield (top) with a blue beacon
    blk(mb, 11.0, 13.4, x - 0.6, x + 0.6, SPZ + 0.75, SPZ + 1.18, 'hull2', ins=0.12)
    beacon(mb, Vector((x + sg * 0.3, Y(12.6), SPZ + 1.18)), Vector((0, 0, 1)), 0.11, 'blue_light', LAMP_BODY, 'trim')
    # stern: engine
    w, h, cz, _ = SP.at(SP_STERN)
    ys = Y(SP_STERN)
    blk(mb, SP_STERN - 0.35, SP_STERN + 0.05, x - w / 2 + 0.25, x + w / 2 - 0.25, cz - h / 2 + 0.25,
        cz + h / 2 - 0.25, 'plate')
    engine_bell(mb, (x, ys + 0.5, cz), 0.95, 2.3)
    for a in (0.8, 2.4, 4.0, 5.5):
        n = Vector((math.cos(a), 0, math.sin(a)))
        mb.cyl(Vector((x, ys + 0.05, cz)) + n * 1.25, Vector((x, ys + 0.8, cz)) + n * 1.2, 0.07, 0.06, 'trim', seg=6)


def pylon(mb, sg, sa, sb, sweep=1.3):
    """Swept armoured pylon from the hull's lower wall into the sponson's inner wall."""
    xi, xo = sg * 2.9, sg * (SPX - 1.0)
    zi0, zi1, zo0, zo1 = -2.2, 0.55, SPZ - 0.9, SPZ + 0.85
    wx = SPX - 1.0 - 2.9
    b = [(xi, Y(sb), zi0), (xo, Y(sb - sweep), zo0), (xo, Y(sa - sweep), zo0), (xi, Y(sa), zi0)]
    t = [(xi, Y(sb - 0.3), zi1), (xo, Y(sb - sweep - 0.2), zo1), (xo, Y(sa - sweep + 0.2), zo1),
         (xi, Y(sa + 0.3), zi1)]
    mb.hexa(b + t, 'hull', bevel=0.06)
    # top armour slab (sloped, following the pylon top) with a trim cap on the leading edge
    dz = 0.24
    xa, xb = sg * 4.0, sg * (SPX - 1.25)
    fa = (4.0 - 2.9) / wx
    fb = (SPX - 1.25 - 2.9) / wx
    za, zb = lerp(zi1, zo1, fa), lerp(zi1, zo1, fb)
    sfa = lerp(sb - 0.3, sb - sweep - 0.2, fa) - 0.35
    sfb = lerp(sb - 0.3, sb - sweep - 0.2, fb) - 0.35
    saa = lerp(sa + 0.3, sa - sweep + 0.2, fa) + 0.35
    sab = lerp(sa + 0.3, sa - sweep + 0.2, fb) + 0.35
    q = [(xa, Y(sfa), za - 0.05), (xb, Y(sfb), zb - 0.05), (xb, Y(sab), zb - 0.05), (xa, Y(saa), za - 0.05)]
    mb.hexa(q + [(p[0], p[1], p[2] + dz) for p in q], 'hull2', bevel=0.04)
    # leading edge cap + conduit bundle under the pylon (hull <-> sponson power / coolant)
    mb.cyl((sg * 3.2, Y(sb - 0.2), (zi0 + zi1) / 2 + 0.2), (sg * (SPX - 1.1), Y(sb - sweep - 0.1), (zo0 + zo1) / 2 + 0.1),
           0.2, 0.2, 'trim', seg=8)
    for k, s in enumerate(((sa + sb) / 2 - 0.9, (sa + sb) / 2 + 0.4)):
        mb.cyl((sg * 3.0, Y(s), -2.45), (sg * (SPX - 1.1), Y(s - sweep), SPZ - 1.1), 0.13, 0.13, 'trim', seg=8)
    lamp_fixture(mb, Vector((sg * (SPX - 1.6), Y(sb - sweep - 0.05), (zo0 + zo1) / 2 + 0.1)), Vector((0, -1, 0)),
                 (0.16, 0.35, 0.08), 'amber', LAMP_BODY, fwd=Vector((1, 0, 0)), lift=0.25)


# ================================================================================================ superstructure
def vls_citadel(mb, H, R):
    """Dorsal missile citadel: sloped armoured box, 4 x 6 hatch cells either side of a centre walkway, blast vents
    on the side slopes."""
    s0, s1 = VLS
    zt = min(deck_z(H, s0), deck_z(H, s1))
    ztop = zt + 1.15
    blk(mb, s0, s1, -2.75, 2.75, zt - 0.4, ztop, 'hull', ins=0.42, ins_s=0.7)
    blk(mb, s0 + 0.75, s1 - 0.75, -2.2, 2.2, ztop - 0.05, ztop + 0.07, 'greeble')
    for i, x in enumerate((-1.62, -0.62, 0.62, 1.62)):
        for j in range(6):
            s = s0 + 0.75 + (s1 - s0 - 1.5) * (j + 0.5) / 6
            m = 'hull2' if (i + j) % 3 else 'plate'
            blk(mb, s - 0.47, s + 0.47, x - 0.43, x + 0.43, ztop + 0.07, ztop + 0.2, m, ins=0.05)
            xi = x - 0.36 if x > 0 else x + 0.36                     # hinge bar on the inboard edge
            blk(mb, s - 0.35, s + 0.35, xi - 0.05, xi + 0.05, ztop + 0.2, ztop + 0.27, 'trim')
    blk(mb, s0 + 0.8, s1 - 0.8, -0.12, 0.12, ztop + 0.07, ztop + 0.14, 'trim')      # walkway rail
    for sg in (1, -1):
        for s in (s0 + 0.95, s1 - 0.95):
            lamp_fixture(mb, Vector((sg * 2.05, Y(s), ztop + 0.07)), Vector((0, 0, 1)), (0.16, 0.3, 0.08), 'amber',
                         LAMP_BODY, lift=0.0)
        # blast vents on the side slopes
        n = Vector((sg * 1.55, 0, 0.42)).normalized()
        for k in range(5):
            s = s0 + 1.2 + k * (s1 - s0 - 2.4) / 4
            p = Vector((sg * (2.75 - 0.42 * 0.5), Y(s), zt - 0.4 + 1.55 * 0.5))
            obox(mb, p, n, (0.75, 0.9, 0.1), 'trim', lift=0.02)
            obox(mb, p + n * 0.07, n, (0.55, 0.7, 0.08), 'greeble', lift=0.02)
    # accent: slate-blue band across the citadel front slope
    blk(mb, s1 - 0.62, s1 - 0.4, -2.0, 2.0, ztop - 0.25, ztop - 0.05, 'accent')


def bridge_tower(mb, H, R):
    """Aft armoured casemate + raked blade tower (bridge on the raked front, sensor roof)."""
    s0, s1 = TWR
    zt = min(deck_z(H, s0), deck_z(H, s1))
    zc = zt + 1.3
    blk(mb, s0, s1, -2.8, 2.8, zt - 0.3, zc, 'hull', ins=0.45, ins_s=0.9)
    # casemate roof plates (3 lanes)
    for k, (x0, x1) in enumerate(((-2.3, -0.8), (-0.75, 0.75), (0.8, 2.3))):
        sc = cuts(s0 + 1.0, s1 - 1.0, R, 2.4, 3.6)
        for a, c in zip(sc, sc[1:]):
            blk(mb, a + 0.12, c - 0.12, x0 + 0.06, x1 - 0.06, zc - 0.06, zc + 0.16, UP_MAT(0, k, R), ins=0.08)
    # casemate front windows (sloped face)
    dz, ds = zc - (zt - 0.3), 0.9
    nF = Vector((0, -dz, ds)).normalized()
    for f in (0.55,):
        z = lerp(zt - 0.3, zc, f)
        s = lerp(s1, s1 - ds, f) + 0.03
        for i in range(7):
            x = -2.1 + i * 0.7
            window_bay(mb, Vector((x, Y(s), z)), nF, (0.3, 0.5, 0.06), 'window', WIN_FRAME, lift=0.02,
                       fwd=Vector((1, 0, 0)), lit=R.random() > 0.15)
    # blade tower
    TF0, TF1, TA0, TA1, TX0, TX1 = -10.4, -13.6, -18.4, -17.5, 1.7, 1.2
    z0, z1 = zc - 0.05, zc + 3.0
    b = [(-TX0, Y(TF0), z0), (TX0, Y(TF0), z0), (TX0, Y(TA0), z0), (-TX0, Y(TA0), z0)]
    t = [(-TX1, Y(TF1), z1), (TX1, Y(TF1), z1), (TX1, Y(TA1), z1), (-TX1, Y(TA1), z1)]
    mb.hexa(b + t, 'hull', bevel=0.1)
    blk(mb, TA1 + 0.3, TF1 - 0.3, -TX1 + 0.15, TX1 - 0.15, z1 - 0.05, z1 + 0.14, 'plate', ins=0.08)
    # bridge windows on the raked front: two rows + armoured brow
    nB = Vector((0, -(z1 - z0), TF0 - TF1)).normalized()
    for f in (0.52, 0.72):
        hw = lerp(TX0, TX1, f)
        z, s = lerp(z0, z1, f), lerp(TF0, TF1, f) + 0.03
        n = int((2 * hw - 0.6) / 0.55)
        for i in range(n + 1):
            x = -hw + 0.3 + i * (2 * hw - 0.6) / n
            window_bay(mb, Vector((x, Y(s), z)), nB, (0.3, 0.44, 0.06), 'window', WIN_FRAME, lift=0.02,
                       fwd=Vector((1, 0, 0)))
    f = 0.9
    obox(mb, Vector((0, Y(lerp(TF0, TF1, f)), lerp(z0, z1, f))), nB, (0.35, 2 * lerp(TX0, TX1, f) + 0.1, 0.28),
         'hull2', lift=0.1, fwd=Vector((1, 0, 0)))
    for sg in (1, -1):
        nS = Vector((sg * (z1 - z0), 0, TX0 - TX1)).normalized()
        # side armour plates + a row of small ports
        for f, s, L in ((0.25, -16.4, 2.6), (0.25, -13.2, 2.4), (0.72, -16.0, 2.4)):
            p = Vector((sg * lerp(TX0, TX1, f), Y(s), lerp(z0, z1, f)))
            obox(mb, p, nS, (1.05, L, 0.14), 'hull2' if f < 0.5 else 'plate', lift=0.05)
        for k in range(4):
            s = -17.0 + k * 0.85
            f = 0.5
            p = Vector((sg * lerp(TX0, TX1, f), Y(s), lerp(z0, z1, f)))
            window_bay(mb, p, nS, (0.28, 0.5, 0.06), 'window', WIN_FRAME, lift=0.02, lit=R.random() > 0.2)
        # accent stripe along the tower's upper side edge
        f = 0.9
        p = Vector((sg * lerp(TX0, TX1, f), Y(-15.2), lerp(z0, z1, f)))
        obox(mb, p, nS, (0.14, 3.2, 0.08), 'accent', lift=0.02)
    return (z1, TF1, TA1, TX1)


# ================================================================================================ weapons
def heavy_turret(mb, F, sz=1.0, bar_h=0.45, nb=2, blen=4.2):
    """Twin gun house on a barbette: sloped-front armoured house, mantlet, jacketed barrels with muzzle brakes."""
    k = sz
    zb = bar_h * k
    F.cyl(mb, (0, 0, -F.sink), (0, 0, zb), 1.3 * k, 1.2 * k, 'hull2', seg=16)
    F.cyl(mb, (0, 0, zb - 0.14 * k), (0, 0, zb + 0.04 * k), 1.36 * k, 1.36 * k, 'trim', seg=16)
    z0, z1 = zb, zb + 1.05 * k
    P = lambda u, v, w: F.p(u * k, v * k, w)
    b = [P(-1.3, -1.5, z0), P(1.3, -1.5, z0), P(1.3, 1.0, z0), P(-1.3, 1.0, z0)]
    t = [P(-1.0, -1.3, z1), P(1.0, -1.3, z1), P(1.0, 0.1, z1), P(-1.0, 0.1, z1)]
    mb.hexa(b + t, 'hull', bevel=0.05 * k)
    F.box(mb, 0.0, -0.62 * k, z1 - 0.03 * k, 1.7 * k, 1.15 * k, 0.12 * k, 'hull2')          # roof plate
    for e in (-1, 1):   # cheek plates
        F.box(mb, e * 1.2 * k, -0.35 * k, z0 + 0.12 * k, 0.12 * k, 1.9 * k, 0.55 * k, 'plate')
    F.box(mb, 0.62 * k, -0.15 * k, z1 - 0.02 * k, 0.42 * k, 0.55 * k, 0.26 * k, 'hull2')      # sight
    F.box(mb, 0.62 * k, 0.1 * k, z1 + 0.04 * k, 0.3 * k, 0.08 * k, 0.12 * k, 'glass')
    F.box(mb, 0.0, 1.05 * k, z0 + 0.08 * k, 1.55 * k, 0.4 * k, 0.72 * k, 'hull2')            # mantlet
    F.lamp(mb, -0.75 * k, -1.1 * k, z1 - 0.02 * k, 0.14, 0.26, 0.08, 'amber')
    wz = z0 + 0.45 * k
    for i in range(nb):
        u = (i - (nb - 1) / 2) * 0.62 * k
        F.cyl(mb, (u, 1.2 * k, wz), (u, (1.25 + blen) * k, wz), 0.16 * k, 0.14 * k, 'greeble', seg=10)
        F.cyl(mb, (u, 1.2 * k, wz), (u, 2.5 * k, wz), 0.26 * k, 0.22 * k, 'trim', seg=10)
        F.cyl(mb, (u, (1.25 + blen - 0.5) * k, wz), (u, (1.25 + blen) * k, wz), 0.21 * k, 0.21 * k, 'hull2', seg=10)


# ================================================================================================ equipment
def equipment(mb, H, SPS, R, S, tw):
    zt_twr, TF1, TA1, TX1 = tw
    # --- turrets: A on the prow deck, B superfiring aft of the citadel, C under the keel
    F = S.top(0.0, 11.3, 2.6, 2.8, 'turret_A')
    if F:
        heavy_turret(mb, F, 1.0, 0.45)
    F = S.top(0.0, -3.4, 3.0, 3.0, 'turret_B')
    if F:
        F.cyl(mb, (0, 0, -F.sink), (0, 0, 1.3), 1.55, 1.45, 'hull', seg=16)
        for a in range(6):   # barbette ribs
            ang = a / 6 * 2 * math.pi
            F.box(mb, math.cos(ang) * 1.5, math.sin(ang) * 1.5, 0.0, 0.22, 0.22, 1.15, 'hull2')
        heavy_turret(mb, F, 1.0, 1.72)
    F = S.under(0.0, 4.8, 2.6, 2.8, 'turret_C')
    if F:
        heavy_turret(mb, F, 0.78, 0.4, blen=3.8)
    # --- PD: prow upper slopes, aft upper slopes, low slopes amidships; sponson tops
    for tag, s, e0, e1 in (('pd_fwd', 14.6, 1, 3), ('pd_aft', -20.6, 1, 3), ('pd_low', -2.6, 7, 5)):
        for sg, F in pair(lambda sg: S.hull(H, s, sidep(sg, e0, e1, 0.5), 1.8, 1.6, tag)):
            pd_turret(mb, F, 0, 0, 0.85)
    for sg in (1, -1):
        SP = SPS[sg]
        F = S.top(sg * SPX, -9.0, 1.2, 1.6, 'pd_sponson')
        if F:
            pd_turret(mb, F, 0, 0, 0.75)
        F = S.top(sg * SPX, 4.0, 1.1, 1.1, 'rcs_sponson_f')
        if F:
            rcs_quad(mb, F, 0.9)
        F = S.top(sg * SPX, -15.2, 1.1, 1.1, 'rcs_sponson_a')
        if F:
            rcs_quad(mb, F, 0.9)
        # outer wall: vent louvres (gun cooling) + marker row
        for s in (5.5, -1.5):
            F = S.hull(SP, s, sidep(sg, 0, 4, 0.5), 2.6, 1.0, 'sp_vent', tol=0.5)
            if F:
                vent_louvre(mb, F, 1.0, 2.6)
        F = S.hull(SP, -12.5, sidep(sg, 0, 4, 0.5), 1.4, 1.1, 'sp_hatch', tol=0.5)
        if F:
            hatch(mb, F, 1.0, 1.3)
        F = S.under(sg * SPX, -4.0, 1.2, 3.6, 'sp_rad')
        if F:
            radiator_bank(mb, F, 1.2, 3.6, pitch=0.4, fh=0.4)
    # --- walls: fire-control arrays forward, reactor vents aft, airlock + docking collar
    for sg, F in pair(lambda sg: S.hull(H, 15.0, sidep(sg, 0, 4, 0.7), 1.8, 0.6, 'fc_array', tol=0.9)):
        sensor_array(mb, F, 0.6, 1.8, 1, 3)
    for sg, F in pair(lambda sg: S.hull(H, -2.6, sidep(sg, 0, 4, 0.27), 2.4, 0.8, 'wall_vent', tol=0.75)):
        vent_louvre(mb, F, 0.8, 2.4)
    for sg, F in pair(lambda sg: S.hull(H, 2.2, sidep(sg, 1, 3, 0.35), 1.4, 1.2, 'airlock')):
        hatch(mb, F, 1.1, 1.3)
    # --- prow: bow RCS on the upper and lower slopes, chin sensor dome, prow deck fire-control array
    for sg, F in pair(lambda sg: S.hull(H, 17.6, sidep(sg, 1, 3, 0.45), 1.0, 1.0, 'rcs_bow')):
        rcs_quad(mb, F, 0.85)
    for sg, F in pair(lambda sg: S.hull(H, 16.4, sidep(sg, 7, 5, 0.5), 1.0, 1.0, 'rcs_bow_lo')):
        rcs_quad(mb, F, 0.85)
    F = S.under(0.0, 15.0, 1.2, 1.2, 'chin_dome')
    if F:
        sensor_dome(mb, F, 0.55)
    F = S.top(0.0, 16.4, 1.4, 1.6, 'prow_array')
    if F:
        sensor_array(mb, F, 1.3, 1.6, 2, 2)
    # --- tower roof: comms array + sensor blisters + beacons
    F = S.top(0.0, -16.2, 1.6, 1.8, 'tower_roof')
    if F:
        sensor_array(mb, F, 1.5, 1.8, 2, 3)
    for sg, F in pair(lambda sg: S.top(sg * 0.6, -14.4, 0.8, 0.8, 'blister')):
        sensor_dome(mb, F, 0.38)
    for sg in (1, -1):
        beacon(mb, Vector((sg * (TX1 - 0.2), Y(TA1 + 0.35), zt_twr + 0.14)), Vector((0, 0, 1)), 0.1, 'amber',
               LAMP_BODY, 'trim')
    # --- stern deck: engineering louvres + stern RCS
    for sg, F in pair(lambda sg: S.top(sg * 1.7, -21.1, 1.2, 1.8, 'eng_vent')):
        vent_louvre(mb, F, 1.2, 1.8)
    for sg, F in pair(lambda sg: S.hull(H, -21.4, sidep(sg, 7, 5, 0.5), 1.1, 1.1, 'rcs_aft_lo')):
        rcs_quad(mb, F, 0.9)
    # --- keel: radiators aft, magazine hatches, keel sensor strip
    for s in (-17.5, -12.8):
        for sg, F in pair(lambda sg: S.under(sg * 1.4, s, 1.4, 3.8, 'radiator_lo')):
            radiator_bank(mb, F, 1.4, 3.8, pitch=0.4, fh=0.5)
    for sg, F in pair(lambda sg: S.under(sg * 1.5, -3.0, 1.0, 1.3, 'mag_hatch')):
        hatch(mb, F, 0.9, 1.2)
    for sg, F in pair(lambda sg: S.under(sg * 1.35, 10.0, 0.8, 2.4, 'keel_array')):
        sensor_array(mb, F, 0.8, 2.4, 1, 3)


def crew_windows(mb, H, R, S):
    """Window bands on the hull walls: aft crew decks (both belts) and the mess deck between the pylons (upper
    belt); cast onto the armour, a window that would straddle a plate seam is dropped."""
    runs = ((-21.4, -13.0, 0.73), (-21.4, -13.0, 0.27), (-5.4, 0.2, 0.73))
    for sg in (1, -1):
        for s0, s1, f in runs:
            p = sidep(sg, 0, 4, f)
            s = s0
            while s < s1:
                pos, n = H.pt(s, p, 0.0)
                hits = [S.cast(pos + n * 3 + Vector((0, dy, 0)), -n, 6.0) for dy in (-0.42, 0.0, 0.42)]
                ds = [h.dot(n) for h in hits] if all(hits) else None
                if ds and max(ds) - min(ds) < 0.2:
                    c = hits[1] + n * (max(ds) - hits[1].dot(n))
                    window_bay(mb, c, n, (0.45, 0.95, 0.08), 'window', WIN_FRAME, lift=0.03, lit=R.random() > 0.12,
                               border=0.12)
                s += 1.4


def edge_lights(mb, H, SPS, S):
    for sg in (1, -1):
        for p, pitch, s0, s1 in ((sidep(sg, 1, 3, 0.92), 3.0, S_STERN + 1.2, 19.0),
                                 (sidep(sg, 7, 5, 0.08), 4.5, S_STERN + 1.2, 17.0)):
            s = s0
            while s < s1:
                pos, n = H.pt(s, p, 0.0)
                h = S.cast(pos + n * 3.0, -n, 6.0)
                if h and (h - pos).dot(n) < T + 0.1:
                    lamp_fixture(mb, h, n, (0.18, 0.4, 0.08), 'amber', LAMP_BODY, lift=0.03)
                s += pitch
        SP = SPS[sg]
        p = sidep(sg, 1, 3, 0.5)
        s = SP_STERN + 1.5
        while s < 8.0:
            pos, n = SP.pt(s, p, 0.0)
            h = S.cast(pos + n * 3.0, -n, 6.0)
            if h and (h - pos).dot(n) < 0.3:
                lamp_fixture(mb, h, n, (0.16, 0.36, 0.08), 'amber', LAMP_BODY, lift=0.03)
            s += 4.0
        # prow tip beacons
        beacon(mb, Vector((sg * 0.75, Y(19.9), H.at(19.9)[2] + 0.35)), Vector((sg, 0, 0.4)).normalized(), 0.1,
               'blue_light', LAMP_BODY, 'trim')


def engine_block(mb, H):
    s = S_STERN
    w, h, cz, _ = H.at(s)
    ys = Y(s)
    zc = cz + 0.25
    blk(mb, s - 0.5, s + 0.05, -w / 2 + 0.35, w / 2 - 0.35, cz - h / 2 + 0.35, cz + h / 2 - 0.35, 'plate')
    mb.box((0, ys + 0.8, zc), (0.6, 1.6, h - 1.2), 'hull2', bevel=0.05)
    mb.box((0, ys + 0.8, cz - h / 2 + 0.75), (w - 1.6, 1.6, 0.6), 'hull2', bevel=0.05)
    mb.box((0, ys + 0.8, cz + h / 2 - 0.75), (w - 1.6, 1.6, 0.6), 'hull2', bevel=0.05)
    mb.box((0, ys + 1.7, zc), (0.9, 0.3, 0.9), 'trim')
    for sg in (1, -1):
        x = sg * 2.0
        engine_bell(mb, (x, ys + 0.6, zc), 1.3, 2.7)
        for a in (0.6, 2.2, 4.0, 5.4):
            n = Vector((math.cos(a), 0, math.sin(a)))
            mb.cyl(Vector((x, ys + 0.1, zc)) + n * 1.65, Vector((x, ys + 1.0, zc)) + n * 1.6, 0.08, 0.07, 'trim',
                   seg=6)
        beacon(mb, Vector((sg * (w / 2 - 0.5), ys + 0.55, cz + h / 2 - 0.55)), Vector((0, 1, 0)), 0.13,
               'blue_light', LAMP_BODY, 'trim')
        for k in range(3):
            lamp_fixture(mb, Vector((sg * (0.9 + k * 0.9), ys + 1.6, cz - h / 2 + 0.75)), Vector((0, 1, 0)),
                         (0.14, 0.32, 0.1), 'amber', LAMP_BODY, fwd=Vector((1, 0, 0)), lift=0.05)


# ================================================================================================ build
def assault_frigate():
    palette()
    R = rng(1111)
    H = Hull(MAIN, PROF)
    SPS = {sg: Hull(SPON, SPROF, cx=sg * SPX) for sg in (1, -1)}
    mb = MB()
    main_hull(mb, H, R)
    for sg in (1, -1):
        sponson(mb, SPS[sg], sg, R)
        for sa, sb in PYLONS:
            pylon(mb, sg, sa, sb)
    vls_citadel(mb, H, R)
    tw = bridge_tower(mb, H, R)
    engine_block(mb, H)
    S = Surf(mb)
    equipment(mb, H, SPS, R, S, tw)
    crew_windows(mb, H, R, S)
    edge_lights(mb, H, SPS, S)
    if S.rej:
        print('SITES rejected:', S.rej, flush=True)
    obj = mb.to_object('assault_frigate', smooth_angle=26)
    print('emissive discs re-oriented:', fix_normals(obj), flush=True)
    return [obj]


if __name__ == '__main__' and 'ships_assault_frigate' in ' '.join(sys.argv):
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    lib.reset_scene()
    objs = assault_frigate()
    tris = sum(lib.tri_count(o) for o in bpy.context.scene.objects if o.type == 'MESH')
    if 'nosave' not in argv:
        lib.export_glb(os.path.join(ASSETS, 'assault_frigate.glb'))
    print('BUILT assault_frigate v11 tris=%d' % tris, flush=True)
