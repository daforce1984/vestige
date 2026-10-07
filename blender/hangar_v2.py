"""THE LAUNCH BAY, v2 (2026-10-07) — rebuilt after the Codex production-design frame assets/tex/src/hangar_concept_v1.png
(scene 6's composition, empty bay): a tall armoured bay with three levels of catwalks down both walls on heavy columns,
layered armour panels, brass pipe runs and red indicator strips; a deep coffered ceiling of girders and joists with rows
of rectangular alert lamps and a yellow gantry crane at the far end; a rail-bed catapult track down the centre (rails on
sleepers, the shuttle carriage at the origin) between floor panels with light studs and hazard chevrons; a big armoured
bulkhead door at the back.

Same frame as v1 (shots.js / world.js rely on it): glTF z -60..30 (Blender y +60..-30), open at glTF +z (Blender -y),
floor at 0, Sigma standing at the origin, the catapult along x = 0, the floor guide studs at x ±2.45 and ±5 every 4.5 m,
ceiling lamps around y 17 (glTF), the mouth's field 27 x 25 m. Materials 'lamp' and 'guide' are animated by the film
(drawHangar matOverride): red on standby, white / blue for the launch.
Build: blender -b --factory-startup --python blender/build_models.py -- hangar"""
import math
from lib import MB, reg, rng

W, H = 13.0, 24.0             # inner half-width, ceiling height
Y0, Y1 = -30.0, 60.0          # open end (mouth), back wall  (Blender y)
LV = (6.0, 12.0, 18.0)        # catwalk levels
COL = 7.5                     # column / main-beam spacing


def palette():
    reg('deck', (0.15, 0.155, 0.165), 0.7, 0.45)
    reg('deck_dark', (0.055, 0.06, 0.065), 0.6, 0.55)
    reg('wall', (0.2, 0.21, 0.225), 0.65, 0.5)
    reg('wall2', (0.12, 0.125, 0.135), 0.7, 0.45)
    reg('rib', (0.27, 0.275, 0.29), 0.8, 0.4)
    reg('pipe', (0.28, 0.24, 0.18), 0.75, 0.4)
    reg('pipe_y', (0.62, 0.46, 0.12), 0.7, 0.4)       # brass / yellow accents (kept off the bay's metalize)
    reg('hazard', (0.8, 0.55, 0.03), 0.2, 0.5)
    reg('hazard_k', (0.02, 0.02, 0.02), 0.2, 0.5)
    reg('rail', (0.5, 0.5, 0.52), 0.95, 0.2)
    reg('grate', (0.08, 0.085, 0.09), 0.8, 0.6)
    reg('guide', (0.1, 0.3, 0.4), 0.0, 0.3, (0.3, 0.75, 1.0), 5.0)
    reg('lamp', (0.4, 0.38, 0.33), 0.0, 0.3, (1.0, 0.92, 0.78), 5.0)
    reg('signal', (0.4, 0.05, 0.02), 0.0, 0.3, (1.0, 0.15, 0.05), 5.0)


def hangar():
    palette()
    R = rng(83)
    mb = MB()
    L = Y1 - Y0; yc = (Y0 + Y1) / 2
    cols = [Y0 + 1.5 + k * COL for k in range(int((L - 1.5) / COL) + 1)]

    # ------------------------------------------------------------ shell
    mb.box((0, yc, -1.0), (2 * W + 4, L, 2.0), 'deck_dark')
    for sd in (1, -1): mb.box((sd * (W + 1.0), yc, H / 2), (2.0, L, H + 4), 'wall2')
    mb.box((0, yc, H + 1.5), (2 * W + 4, L, 3.0), 'wall2')
    mb.box((0, Y1 + 1.0, H / 2), (2 * W + 4, 2.0, H + 4), 'wall2')

    # ------------------------------------------------------------ floor: panels with seams, grates, light studs, chevrons
    for i in range(int(L / 4.5)):
        y = Y0 + 2.25 + i * 4.5
        for x0, x1 in ((3.9, 7.4), (7.4, 10.4), (-7.4, -3.9), (-10.4, -7.4)):
            m = 'grate' if (i % 5 == 2 and abs(x0) > 7) else ('deck' if (i + int(x0)) % 3 else 'deck_dark')
            mb.box(((x0 + x1) / 2, y, -0.2), (abs(x1 - x0) - 0.1, 4.4, 0.4), m, bevel=0.03)
        for sd in (1, -1):
            mb.box((sd * 5.0, y, 0.01), (0.35, 0.6, 0.05), 'guide')            # light studs (the launch's chasing lights ride on them)
    for sd in (1, -1):                                                         # wall-foot walkway
        mb.box((sd * (W - 1.3), yc, -0.1), (2.6, L, 0.2), 'deck_dark')
        for k in range(int(L / 1.2)):                                          # hazard chevrons along the track edges
            y = Y0 + 0.6 + k * 1.2
            mb.hexa([(sd * 3.3, y - 0.35, 0.0), (sd * 3.85, y - 0.35, 0.0), (sd * 3.85, y + 0.25, 0.0), (sd * 3.3, y + 0.25, 0.0),
                     (sd * 3.3, y - 0.35, 0.02), (sd * 3.85, y - 0.35, 0.02), (sd * 3.85, y + 0.25, 0.02), (sd * 3.3, y + 0.25, 0.02)],
                    'hazard' if k % 2 else 'hazard_k')

    # ------------------------------------------------------------ catapult: rail bed, sleepers, twin rails, guide lights, shuttle
    mb.box((0, yc, -0.75), (6.4, L, 0.3), 'deck_dark')
    for k in range(int(L / 1.5)):
        mb.box((0, Y0 + 0.75 + k * 1.5, -0.45), (5.0, 0.55, 0.3), 'rib', bevel=0.03)
    for sd in (1, -1):
        mb.box((sd * 1.3, yc, -0.2), (0.45, L, 0.4), 'rail', bevel=0.05)
        mb.box((sd * 2.8, yc, -0.25), (0.3, L, 0.5), 'rib')
        for k in range(int(L / 3)):
            mb.box((sd * 2.45, Y0 + 1.5 + k * 3, 0.02), (0.22, 1.0, 0.08), 'guide')
        mb.box((sd * 1.3, 0.0, -0.1), (2.2, 4.4, 0.4), 'hazard', bevel=0.05)   # shuttle foot clamps (top flush with the deck)
        mb.box((sd * 1.3, -2.4, 0.15), (2.2, 0.35, 0.3), 'rib', bevel=0.04)
        mb.box((sd * 1.3, 2.2, 0.2), (2.2, 0.35, 0.4), 'rib', bevel=0.04)
    mb.box((0, 0, -0.2), (0.6, 4.0, 0.4), 'hazard_k')
    for k in range(18):                                                        # hazard stripes at the launch lip
        x = -12.75 + k * 1.5
        mb.hexa([(x - 0.75, Y0 + 0.2, 0.0), (x, Y0 + 0.2, 0.0), (x + 0.75, Y0 + 2.0, 0.0), (x, Y0 + 2.0, 0.0),
                 (x - 0.75, Y0 + 0.2, 0.03), (x, Y0 + 0.2, 0.03), (x + 0.75, Y0 + 2.0, 0.03), (x, Y0 + 2.0, 0.03)], 'hazard' if k % 2 else 'hazard_k')

    # ------------------------------------------------------------ walls: columns, layered armour, pipes, indicator strips
    for sd in (1, -1):
        xw = sd * W
        for y in cols:
            mb.box((sd * (W - 0.55), y, H / 2), (1.1, 1.0, H), 'rib', bevel=0.06)                 # the column
            mb.box((sd * (W - 1.15), y, H / 2), (0.12, 1.5, H), 'wall2')                          # its flange
            mb.cyl((sd * (W - 1.35), y + 0.75, 0), (sd * (W - 1.35), y + 0.75, H), 0.13, 0.13, 'pipe_y', seg=8)   # brass riser
            mb.box((sd * (W - 1.25), y - 0.75, 3.4), (0.12, 0.22, 0.9), 'signal')                 # a column light, low
        for a, b in zip(cols, cols[1:]):
            ym = (a + b) / 2; span = b - a - 1.2
            for z0, z1 in ((0.3, LV[0] - 0.4), (LV[0] + 0.3, LV[1] - 0.4), (LV[1] + 0.3, LV[2] - 0.4), (LV[2] + 0.3, H - 1.2)):
                mb.box((sd * (W - 0.1), ym, (z0 + z1) / 2), (0.2, span, z1 - z0), 'wall', bevel=0.04)                  # armour panel
                inset = R.random() < 0.35
                mb.box((sd * (W - (0.15 if inset else 0.32)), ym, (z0 + z1) / 2), (0.25, span * 0.62, (z1 - z0) * 0.7), 'wall2', bevel=0.05)   # the layer on it (or a recess)
                if R.random() < 0.55:                                                                                   # vents / boxes
                    mb.box((sd * (W - 0.55), ym + R.uniform(-1.5, 1.5), z0 + R.uniform(0.6, 1.4)), (0.5, R.uniform(0.8, 1.6), R.uniform(0.5, 1.0)), R.choice(['rib', 'deck_dark', 'wall2']), bevel=0.04)
            for z in (1.6, LV[0] + 1.1, LV[1] + 1.1):                                                                 # red indicator strips
                if R.random() < 0.8: mb.box((sd * (W - 0.4), ym + R.uniform(-1.2, 1.2), z), (0.08, 1.1, 0.16), 'signal')
            if R.random() < 0.5: mb.box((sd * (W - 0.4), ym, LV[2] + 2.6), (0.08, 0.6, 0.6), 'signal')
            if R.random() < 0.4:                                                                                      # a lit control window
                mb.box((sd * (W - 0.3), ym + 1.0, LV[1] + 2.2), (0.1, 1.6, 0.9), 'guide')
        # pipe runs: a big bundle at the wall foot, a pair under each catwalk, a brass run high up
        for z, r in ((0.55, 0.42), (1.45, 0.42), (2.3, 0.3)):
            mb.cyl((sd * (W - 1.0 - r), Y0 + 1, z), (sd * (W - 1.0 - r), Y1, z), r, r, 'pipe', seg=12)
        for y in cols[::2]:
            mb.box((sd * (W - 1.2), y + 3.0, 1.4), (1.0, 0.5, 2.7), 'pipe_y', bevel=0.05)                              # pipe clamps
        for z in LV:
            mb.cyl((sd * (W - 0.7), Y0 + 1, z - 0.7), (sd * (W - 0.7), Y1, z - 0.7), 0.16, 0.16, 'pipe', seg=8)
            mb.cyl((sd * (W - 1.0), Y0 + 1, z - 1.1), (sd * (W - 1.0), Y1, z - 1.1), 0.11, 0.11, 'pipe_y', seg=8)
        mb.cyl((sd * (W - 0.6), Y0 + 1, H - 2.0), (sd * (W - 0.6), Y1, H - 2.0), 0.22, 0.22, 'pipe_y', seg=10)

    # ------------------------------------------------------------ catwalks: three levels, braced, railed
    for sd in (1, -1):
        for z in LV:
            xe = sd * (W - 3.4)                                       # the walkway's edge
            mb.box((sd * (W - 2.25), yc, z), (2.3, L - 1, 0.22), 'grate', bevel=0.02)
            mb.box((xe, yc, z - 0.25), (0.18, L - 1, 0.5), 'rib')                                # edge beam
            for h in (1.1, 0.55): mb.box((xe, yc, z + h), (0.07, L - 1, 0.07), 'rail')
            mb.box((xe, yc, z + 0.12), (0.05, L - 1, 0.18), 'hazard')                            # toe board stripe
            for k in range(int((L - 2) / 2.5)):
                mb.box((xe, Y0 + 1.5 + k * 2.5, z + 0.55), (0.07, 0.07, 1.1), 'rail')
            for y in cols:                                            # brace from the column under the walkway edge
                mb.hexa([(sd * (W - 1.1), y - 0.18, z - 2.6), (sd * (W - 1.1), y + 0.18, z - 2.6), (sd * (W - 1.1), y + 0.18, z - 2.2),
                         (sd * (W - 1.1), y - 0.18, z - 2.2), (xe, y - 0.18, z - 0.4), (xe, y + 0.18, z - 0.4), (xe, y + 0.18, z),
                         (xe, y - 0.18, z)], 'rib')
                if R.random() < 0.5:                                  # service arm reaching out over the bay
                    mb.box((sd * (W - 3.9), y + 1.2, z + 0.9), (1.0, 0.5, 0.5), 'rib', bevel=0.04)
                    mb.box((sd * (W - 4.8), y + 1.2, z + 0.4), (1.2, 0.35, 0.35), 'pipe_y', bevel=0.03)
        # stairs between levels at two places (zig-zag flights)
        for y0s in (Y0 + 12, Y1 - 18):
            for li, z in enumerate((0.0,) + LV[:-1]):
                zt = LV[li]; ya, yb = (y0s, y0s + 6) if li % 2 == 0 else (y0s + 6, y0s)
                n = 14
                for s in range(n):
                    yy = ya + (yb - ya) * (s + 0.5) / n
                    mb.box((sd * (W - 2.25), yy, z + (zt - z) * (s + 1) / n - 0.1), (1.6, abs(yb - ya) / n + 0.05, 0.12), 'grate')

    # ------------------------------------------------------------ ceiling: girders, beams, joists, alert lamps, braces
    zc = H - 0.9
    for x in (0.0, 4.6, -4.6, 9.2, -9.2):                              # longitudinal girders
        mb.box((x, yc, zc), (0.7, L, 1.8 if x == 0 else 1.3), 'rib', bevel=0.05)
    for y in cols:                                                     # main transverse beams on the columns
        mb.box((0, y, zc - 0.2), (2 * W, 1.0, 2.2), 'rib', bevel=0.06)
        mb.box((0, y, zc - 1.35), (2 * W - 2, 0.4, 0.15), 'wall2')
    for a, b in zip(cols, cols[1:]):                                   # secondary joists + lamp panels
        ym = (a + b) / 2
        mb.box((0, ym, zc + 0.2), (2 * W, 0.4, 1.0), 'wall2')
        for yy in (ym - COL / 4, ym + COL / 4):
            for x in (2.3, -2.3, 6.9, -6.9):
                mb.box((x, yy, H - 0.45), (2.1, 2.6, 0.5), 'rib', bevel=0.04)        # lamp housing
                mb.box((x, yy, H - 0.73), (1.7, 2.2, 0.06), 'lamp')
        if R.random() < 0.6:                                           # X bracing in some bays
            for sgn in (1, -1):
                mb.hexa([(-9.2, a + 0.5, zc + 0.1), (-9.2, a + 0.5, zc + 0.5), (-9.2, a + 0.9, zc + 0.5), (-9.2, a + 0.9, zc + 0.1),
                         (9.2, b - 0.9, zc + 0.1), (9.2, b - 0.9, zc + 0.5), (9.2, b - 0.5, zc + 0.5), (9.2, b - 0.5, zc + 0.1)] if sgn > 0 else
                        [(9.2, a + 0.5, zc + 0.1), (9.2, a + 0.5, zc + 0.5), (9.2, a + 0.9, zc + 0.5), (9.2, a + 0.9, zc + 0.1),
                         (-9.2, b - 0.9, zc + 0.1), (-9.2, b - 0.9, zc + 0.5), (-9.2, b - 0.5, zc + 0.5), (-9.2, b - 0.5, zc + 0.1)], 'wall2')
    for sd in (1, -1):                                                 # crane rails
        mb.box((sd * (W - 1.6), yc, H - 3.0), (0.6, L, 0.7), 'rib')
    # gantry crane near the back: a yellow bridge, its trolley, cables and hook block
    yk = Y1 - 14
    mb.box((0, yk, H - 3.6), (2 * W - 2.5, 1.6, 1.4), 'hazard', bevel=0.08)
    mb.box((0, yk + 1.3, H - 3.6), (2 * W - 2.5, 0.4, 1.0), 'hazard_k')
    for sd in (1, -1): mb.box((sd * (W - 1.6), yk, H - 3.3), (1.6, 2.6, 1.0), 'hazard', bevel=0.06)
    mb.box((2.5, yk, H - 4.8), (2.2, 2.2, 1.2), 'rib', bevel=0.08)
    for dx in (-0.4, 0.4): mb.cyl((2.5 + dx, yk, H - 5.4), (2.5 + dx, yk, H - 11.0), 0.05, 0.05, 'rail', seg=6)
    mb.box((2.5, yk, H - 11.5), (1.2, 0.8, 1.0), 'hazard', bevel=0.06)

    # ------------------------------------------------------------ the far end: armoured bulkhead door
    yb = Y1 - 0.3
    mb.box((0, yb, 10), (16, 0.6, 20), 'wall2', bevel=0.1)
    for sd in (1, -1):
        mb.box((sd * 4.0, yb - 0.35, 9.5), (7.8, 0.3, 19), 'wall', bevel=0.06)              # the two leaves
        for z in (3.0, 7.0, 11.0, 15.0): mb.box((sd * 4.0, yb - 0.55, z), (7.4, 0.15, 0.3), 'rib')
        mb.box((sd * 8.6, yb - 0.6, 10), (1.4, 1.0, 20.5), 'rib', bevel=0.08)               # jambs
        mb.box((sd * 9.5, yb - 0.75, 10), (0.18, 0.12, 16), 'signal')                       # red side lights
        mb.box((sd * 11.0, yb - 0.4, 12), (2.6, 0.6, 24), 'wall2', bevel=0.06)
    mb.box((0, yb - 0.6, 0.6), (0.18, 0.3, 1.2), 'hazard')
    mb.box((0, yb - 0.55, 9.5), (0.1, 0.12, 19), 'hazard_k')                                 # centre seam
    mb.box((0, yb - 0.6, 20.4), (18, 1.0, 1.0), 'rib', bevel=0.06)
    for k in range(6): mb.box((-5 + k * 2, yb - 1.0, 21.5), (0.9, 0.2, 0.35), 'lamp')

    # ------------------------------------------------------------ the mouth: door frame, hazard, signal lamps
    for sd in (1, -1):
        mb.box((sd * (W - 0.9), Y0 + 0.8, H / 2), (2.0, 1.6, H), 'wall2', bevel=0.1)
        for k in range(9): mb.box((sd * (W - 1.95), Y0 + 0.8, 1.2 + k * 2.6), (0.12, 1.4, 1.3), 'hazard' if k % 2 else 'hazard_k')
    mb.box((0, Y0 + 0.8, H - 1.2), (2 * W, 1.6, 2.4), 'wall2', bevel=0.1)
    for k in range(5): mb.box((-8 + k * 4, Y0 - 0.05, H - 1.6), (0.9, 0.2, 0.4), 'signal')
    # floor equipment: launch consoles, carts
    for sd in (1, -1):
        for y in (-18, 30):
            mb.box((sd * 9.0, y, 0.8), (2.4, 3.0, 1.6), 'rib', bevel=0.1)
            mb.box((sd * 9.0, y - 1.3, 1.45), (2.0, 0.2, 0.5), 'guide')
    return [mb.to_object('hangar')]
