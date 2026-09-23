"""Mobile suits (no armature): one mesh object per part, origin at the joint pivot, parented per SCRIPT.md.

Blender frame: model faces -Y, up +Z, model's LEFT = +X (glTF: faces +Z, left +X).
Height ~18 (feet at z=0), hip / ms_root at z=9.
"""
import math
from mathutils import Vector
from lib import (MB, reg, empty, set_parent, frame_ring, lerp, link, annulus,
                 PROF_OCT, PROF_RECT, circle_prof, D2R)
import bpy

# joint pivots (left side, x>0); right side mirrors x
PIV = {
    'ms_root': (0, 0, 9.0),
    'pelvis': (0, 0, 9.0),
    'torso': (0, 0, 9.6),
    'head': (0, 0, 14.75),
    'backpack': (0, 1.7, 12.6),
    'arm_upper': (3.15, 0, 13.55),
    'arm_lower': (3.45, 0, 11.05),
    'hand': (3.45, 0, 8.25),
    'grip': (3.45, -0.05, 7.62),
    'shield': (4.45, 0, 9.6),
    'leg_upper': (1.3, 0, 8.55),
    'leg_lower': (1.3, 0, 5.2),
    'foot': (1.3, 0.1, 1.25),
}
PARENT = {'pelvis': 'ms_root', 'torso': 'ms_root', 'head': 'torso', 'backpack': 'torso',
          'arm_L_upper': 'torso', 'arm_R_upper': 'torso', 'arm_L_lower': 'arm_L_upper',
          'arm_R_lower': 'arm_R_upper', 'hand_L': 'arm_L_lower', 'hand_R': 'arm_R_lower',
          'saber_hilt': 'hand_L', 'rifle': 'hand_R', 'shield': 'arm_L_lower',
          'leg_L_upper': 'pelvis', 'leg_R_upper': 'pelvis', 'leg_L_lower': 'leg_L_upper',
          'leg_R_lower': 'leg_R_upper', 'foot_L': 'leg_L_lower', 'foot_R': 'leg_R_lower'}


PROF_CHEST = [(1, -0.62), (1, 0.62), (0.82, 1), (-0.82, 1), (-1, 0.62), (-1, -0.62), (-0.82, -1), (0.82, -1)]


def P(key, sd=1):
    x, y, z = PIV[key]
    return Vector((x * sd, y, z))


def zloft(mb, stations, mat, prof=PROF_OCT, cx=0.0, cy=0.0, bevel=0.0, cap=True):
    """Loft along Z: stations = [(z, w, d, [dy])] -> rings in XY plane."""
    rings = []
    for st in stations:
        z, w, d = st[:3]
        dy = st[3] if len(st) > 3 else 0.0
        rings.append(frame_ring((cx, cy + dy, z), (1, 0, 0), (0, 1, 0), w, d, prof))
    mb.loft(rings, mat, cap0=cap, cap1=cap, bevel=bevel)


def xloft(mb, stations, mat, prof=PROF_OCT, cy=0.0, cz=0.0):
    """Loft along X: stations = [(x, d, h)] (depth along Y, height along Z)."""
    rings = [frame_ring((x, cy, cz), (0, 1, 0), (0, 0, 1), d, h, prof) for x, d, h in stations]
    mb.loft(rings, mat)


def yloft(mb, stations, mat, prof=PROF_OCT, cx=0.0):
    """Loft along Y: stations = [(y, w, h, cz)]."""
    rings = [frame_ring((cx, y, cz), (1, 0, 0), (0, 0, 1), w, h, prof) for y, w, h, cz in stations]
    mb.loft(rings, mat)


def plate(mb, outline, x0, x1, mat, bevel=0.0):
    """Extrude a convex outline given in (y, z) along X from x0 to x1."""
    r0 = [Vector((x0, y, z)) for y, z in outline]
    r1 = [Vector((x1, y, z)) for y, z in outline]
    mb.loft([r0, r1], mat, bevel=bevel)


class Rig:
    def __init__(self):
        self.objs = {}
        self.piv = {}

    def root(self):
        e = bpy.data.objects.new('ms_root', None)
        e.empty_display_type = 'PLAIN_AXES'
        e.location = P('ms_root')
        link(e)
        self.objs['ms_root'] = e
        self.piv['ms_root'] = P('ms_root')

    def part(self, name, pivot, mb):
        obj = mb.to_object(name, pivot=pivot, smooth_angle=40)
        self.objs[name] = obj
        self.piv[name] = Vector(pivot)
        return obj

    def link_all(self):
        for c, p in PARENT.items():
            if c in self.objs:
                set_parent(self.objs[c], self.objs[p], self.piv[c], self.piv[p])

    def empty(self, name, loc, parent):
        e = empty(name, loc, parent=self.objs[parent], parent_pivot=self.piv[parent], size=0.5)
        self.objs[name] = e


# =====================================================================================
#                                     GUNDAM RX-H1
# =====================================================================================
def gundam_palette():
    reg('white', (0.80, 0.81, 0.84), 0.15, 0.38)
    reg('blue', (0.022, 0.065, 0.42), 0.2, 0.32)
    reg('red', (0.62, 0.022, 0.02), 0.2, 0.32)
    reg('yellow', (0.95, 0.60, 0.02), 0.2, 0.32)
    reg('frame', (0.12, 0.13, 0.15), 0.6, 0.45)
    reg('gray', (0.40, 0.41, 0.44), 0.5, 0.4)
    reg('visor', (0.008, 0.015, 0.015), 0.3, 0.12)
    reg('eye', (0.15, 0.35, 0.18), 0.0, 0.3, (0.45, 1.0, 0.6), 6.0)
    reg('engine', (0.2, 0.3, 0.4), 0.0, 0.3, (0.5, 0.75, 1.0), 8.0)
    reg('sensor', (0.3, 0.02, 0.02), 0.0, 0.3, (1.0, 0.15, 0.1), 2.0)


def g_pelvis(R):
    mb = MB()
    # waist belt
    mb.hexa([(-1.7, -1.1, 8.85), (1.7, -1.1, 8.85), (1.7, 1.1, 8.85), (-1.7, 1.1, 8.85),
             (-1.85, -1.25, 9.7), (1.85, -1.25, 9.7), (1.85, 1.25, 9.7), (-1.85, 1.25, 9.7)], 'white', bevel=0.07)
    # crotch block (red)
    mb.hexa([(-0.5, -1.05, 7.65), (0.5, -1.05, 7.65), (0.5, 0.7, 7.65), (-0.5, 0.7, 7.65),
             (-0.85, -1.4, 9.0), (0.85, -1.4, 9.0), (0.85, 0.95, 9.0), (-0.85, 0.95, 9.0)], 'red', bevel=0.06)
    mb.box((0, -1.42, 8.55), (0.9, 0.12, 0.35), 'yellow', bevel=0.02)
    for sd in (1, -1):
        # hip joint balls
        mb.sphere((sd * 1.3, 0, 8.55), 0.55, 'frame', seg=12, rings=6)
        mb.cyl((sd * 0.7, 0, 8.55), (sd * 1.3, 0, 8.55), 0.4, 0.4, 'frame', seg=10)
        # front skirt armour (angled plate)
        mb.hexa([(sd * 0.9, -1.35, 9.0), (sd * 2.25, -1.35, 9.0), (sd * 2.25, -1.1, 9.0), (sd * 0.9, -1.1, 9.0),
                 (sd * 0.95, -1.95, 7.05), (sd * 2.35, -1.95, 7.05), (sd * 2.35, -1.65, 7.05),
                 (sd * 0.95, -1.65, 7.05)], 'white', bevel=0.05)
        mb.box((sd * 1.62, -1.72, 7.6), (0.9, 0.14, 0.45), 'yellow', rot=(-17, 0, 0), bevel=0.02)
        # side skirt
        mb.hexa([(sd * 1.85, -0.9, 9.5), (sd * 2.1, -0.9, 9.5), (sd * 2.1, 0.9, 9.5), (sd * 1.85, 0.9, 9.5),
                 (sd * 2.1, -0.95, 7.8), (sd * 2.4, -0.95, 7.8), (sd * 2.4, 0.95, 7.8), (sd * 2.1, 0.95, 7.8)],
                'white', bevel=0.05)
        mb.cyl((sd * 2.35, 0, 8.1), (sd * 2.5, 0, 8.1), 0.28, 0.28, 'frame', seg=8)
    # rear skirt
    mb.hexa([(-1.4, 1.1, 9.4), (1.4, 1.1, 9.4), (1.4, 1.35, 9.4), (-1.4, 1.35, 9.4),
             (-1.2, 1.4, 7.9), (1.2, 1.4, 7.9), (1.2, 1.7, 7.9), (-1.2, 1.7, 7.9)], 'white', bevel=0.05)
    for sd in (1, -1):
        mb.nozzle((sd * 0.6, 1.6, 8.1), (0, 0.3, -1), 0.22, 'frame', 'engine', length=0.25, seg=10)
    return mb


def g_torso(R):
    mb = MB()
    mb.cyl((0, 0, 9.3), (0, 0, 10.0), 0.95, 0.95, 'frame', seg=16)
    # abdomen (red) with ribs
    mb.hexa([(-1.25, -0.95, 9.6), (1.25, -0.95, 9.6), (1.25, 1.0, 9.6), (-1.25, 1.0, 9.6),
             (-1.45, -1.15, 11.0), (1.45, -1.15, 11.0), (1.45, 1.1, 11.0), (-1.45, 1.1, 11.0)], 'red', bevel=0.06)
    for z in (10.0, 10.45):
        mb.box((0, -1.08, z), (2.3, 0.15, 0.12), 'frame')
    # chest (blue) - flared upward, pushed forward a little
    zloft(mb, [(10.85, 4.0, 2.4, -0.05), (11.6, 4.7, 2.9, -0.12), (13.2, 5.3, 3.3, -0.18),
               (14.15, 5.1, 3.1, -0.12), (14.45, 4.2, 2.6, -0.05)], 'blue', prof=PROF_CHEST, bevel=0.05)
    # chest front armour ridge + cockpit hatch
    mb.hexa([(-0.55, -1.7, 11.0), (0.55, -1.7, 11.0), (0.55, -1.2, 11.0), (-0.55, -1.2, 11.0),
             (-0.8, -1.95, 13.6), (0.8, -1.95, 13.6), (0.8, -1.4, 13.6), (-0.8, -1.4, 13.6)], 'blue', bevel=0.05)
    mb.box((0, -1.93, 12.1), (0.9, 0.12, 0.7), 'frame', rot=(-5, 0, 0), bevel=0.02)
    for sd in (1, -1):
        # yellow chest vents with slats
        mb.box((sd * 1.35, -1.82, 12.9), (1.15, 0.35, 1.05), 'yellow', bevel=0.04)
        for k in range(4):
            mb.box((sd * 1.35, -2.0, 12.52 + k * 0.25), (0.95, 0.08, 0.09), 'frame')
        # shoulder joint housing
        mb.cyl((sd * 2.3, 0, 13.55), (sd * 3.0, 0, 13.55), 0.62, 0.62, 'frame', seg=12)
        # chest side panels (white collar/yoke)
        mb.hexa([(sd * 2.2, -1.2, 13.7), (sd * 2.65, -1.2, 13.7), (sd * 2.65, 1.2, 13.7), (sd * 2.2, 1.2, 13.7),
                 (sd * 1.4, -1.25, 14.55), (sd * 2.35, -1.25, 14.55), (sd * 2.35, 1.25, 14.55),
                 (sd * 1.4, 1.25, 14.55)], 'white', bevel=0.04)
        # side vents
        mb.box((sd * 2.55, 0.2, 12.2), (0.2, 1.2, 0.8), 'frame')
    # neck collar
    mb.cyl((0, 0.1, 14.3), (0, 0.1, 14.75), 0.75, 0.6, 'frame', seg=14)
    # upper back
    mb.box((0, 1.45, 12.6), (3.2, 0.5, 2.6), 'blue', bevel=0.06)
    return mb


def g_head(R):
    mb = MB()
    mb.cyl((0, 0.05, 14.4), (0, 0.05, 15.2), 0.42, 0.42, 'frame', seg=10)
    # helmet shell (set back so the face sits recessed between cheek guards)
    zloft(mb, [(15.35, 1.5, 1.7, 0.3), (15.8, 1.8, 2.0, 0.2), (16.4, 1.85, 2.05, 0.12),
               (16.95, 1.5, 1.75, 0.15), (17.2, 0.85, 1.2, 0.2)], 'white', prof=PROF_CHEST, bevel=0.03)
    # crest ridge
    mb.hexa([(-0.13, -0.95, 16.6), (0.13, -0.95, 16.6), (0.13, 0.9, 16.9), (-0.13, 0.9, 16.9),
             (-0.09, -0.8, 17.15), (0.09, -0.8, 17.15), (0.09, 0.7, 17.38), (-0.09, 0.7, 17.38)], 'white')
    # cheek guards
    for sd in (1, -1):
        mb.hexa([(sd * 0.5, -1.02, 15.05), (sd * 0.88, -0.9, 15.05), (sd * 0.92, 0.3, 15.2), (sd * 0.55, 0.3, 15.2),
                 (sd * 0.55, -1.1, 16.25), (sd * 0.93, -0.95, 16.25), (sd * 0.95, 0.3, 16.3), (sd * 0.6, 0.3, 16.3)],
                'white', bevel=0.03)
    # brow (overhangs the eyes)
    mb.hexa([(-0.75, -1.12, 16.22), (0.75, -1.12, 16.22), (0.75, -0.5, 16.22), (-0.75, -0.5, 16.22),
             (-0.75, -1.02, 16.55), (0.75, -1.02, 16.55), (0.75, -0.5, 16.55), (-0.75, -0.5, 16.55)], 'white',
            bevel=0.02)
    # face mask + visor + eyes
    mb.hexa([(-0.3, -0.98, 15.1), (0.3, -0.98, 15.1), (0.3, -0.6, 15.1), (-0.3, -0.6, 15.1),
             (-0.52, -0.98, 15.9), (0.52, -0.98, 15.9), (0.52, -0.6, 15.9), (-0.52, -0.6, 15.9)], 'gray', bevel=0.02)
    for dx in (-0.12, 0.12):  # mouth slits
        mb.box((dx, -0.995, 15.45), (0.06, 0.04, 0.32), 'frame')
    mb.box((0, -0.96, 16.05), (1.1, 0.12, 0.36), 'visor')
    for sd in (1, -1):
        y0, y1 = -1.06, -1.0
        mb.hexa([(sd * 0.1, y0, 15.97), (sd * 0.5, y0, 16.06), (sd * 0.5, y1, 16.06), (sd * 0.1, y1, 15.97),
                 (sd * 0.1, y0, 16.15), (sd * 0.5, y0, 16.19), (sd * 0.5, y1, 16.19), (sd * 0.1, y1, 16.15)], 'eye')
    # chin (red)
    mb.hexa([(-0.22, -1.05, 14.95), (0.22, -1.05, 14.95), (0.22, -0.7, 14.95), (-0.22, -0.7, 14.95),
             (-0.32, -1.1, 15.25), (0.32, -1.1, 15.25), (0.32, -0.7, 15.25), (-0.32, -0.7, 15.25)], 'red', bevel=0.02)
    # forehead: yellow V-fin base + red camera
    mb.hexa([(-0.2, -1.16, 16.3), (0.2, -1.16, 16.3), (0.2, -1.0, 16.3), (-0.2, -1.0, 16.3),
             (-0.26, -1.14, 16.62), (0.26, -1.14, 16.62), (0.26, -1.0, 16.62), (-0.26, -1.0, 16.62)], 'yellow')
    mb.box((0, -1.0, 16.75), (0.24, 0.3, 0.2), 'sensor', bevel=0.02)
    for sd in (1, -1):
        y0, y1 = -1.16, -1.05
        mb.hexa([(sd * 0.12, y0, 16.42), (sd * 0.24, y0, 16.66), (sd * 1.72, y0 + 0.1, 18.12),
                 (sd * 1.7, y0 + 0.1, 18.0),
                 (sd * 0.12, y1, 16.42), (sd * 0.24, y1, 16.66), (sd * 1.72, y1 + 0.1, 18.12),
                 (sd * 1.7, y1 + 0.1, 18.0)], 'yellow')
        # vulcans
        mb.cyl((sd * 0.62, -0.85, 16.4), (sd * 0.62, -1.08, 16.4), 0.09, 0.09, 'yellow', seg=8)
        # ear sensors
        mb.cyl((sd * 0.85, 0.15, 15.9), (sd * 1.05, 0.15, 15.9), 0.4, 0.34, 'white', seg=12)
        mb.cyl((sd * 1.02, 0.15, 15.9), (sd * 1.09, 0.15, 15.9), 0.22, 0.22, 'gray', seg=10)
        mb.box((sd * 1.05, 0.15, 15.9), (0.05, 0.1, 0.34), 'red')
    # rear sensor + antenna
    mb.box((0, 1.25, 16.2), (0.7, 0.2, 0.5), 'gray', bevel=0.03)
    mb.cyl((0.4, 0.9, 16.8), (0.5, 1.2, 17.6), 0.03, 0.02, 'gray', seg=5)
    return mb


def g_arm_upper(sd, R):
    mb = MB()
    x = 3.5 * sd
    # shoulder armour: big white block with stepped top
    mb.hexa([(x - 0.9 * sd, -1.4, 12.75), (x + 0.95 * sd, -1.4, 12.75), (x + 0.95 * sd, 1.4, 12.75),
             (x - 0.9 * sd, 1.4, 12.75),
             (x - 0.9 * sd, -1.5, 14.9), (x + 0.8 * sd, -1.45, 14.9), (x + 0.8 * sd, 1.45, 14.9),
             (x - 0.9 * sd, 1.5, 14.9)], 'white', bevel=0.12)
    mb.box((x - 0.05 * sd, 0, 15.0), (1.5, 2.5, 0.3), 'white', bevel=0.06)
    mb.box((x + 0.96 * sd, 0, 13.9), (0.12, 1.6, 0.9), 'gray', bevel=0.03)
    mb.box((x, -1.52, 13.6), (1.3, 0.08, 0.2), 'frame')
    mb.box((x, 1.52, 13.6), (1.3, 0.08, 0.2), 'frame')
    # upper arm
    mb.cyl((x - 0.05 * sd, 0, 12.9), (x - 0.05 * sd, 0, 11.3), 0.55, 0.55, 'frame', seg=12)
    mb.box((x - 0.05 * sd, 0, 12.0), (1.15, 1.2, 1.45), 'white', bevel=0.08)
    mb.cyl((x - 0.62 * sd, 0, 11.05), (x + 0.52 * sd, 0, 11.05), 0.5, 0.5, 'frame', seg=12)
    return mb


def g_arm_lower(sd, R):
    mb = MB()
    x = 3.45 * sd
    zloft(mb, [(11.1, 1.15, 1.25), (10.6, 1.35, 1.5), (8.9, 1.45, 1.65), (8.45, 1.3, 1.45)], 'white',
          cx=x, bevel=0.05)
    mb.box((x, -0.8, 10.4), (0.7, 0.12, 0.6), 'gray', bevel=0.02)
    mb.cyl((x, 0, 8.55), (x, 0, 8.2), 0.5, 0.45, 'frame', seg=12)
    if sd > 0:  # shield mount
        mb.box((x + 0.78, 0, 9.6), (0.25, 0.8, 1.2), 'frame', bevel=0.03)
    return mb


def g_hand(sd, R, mat='gray'):
    mb = MB()
    x = 3.45 * sd
    mb.box((x + 0.08 * sd, -0.05, 7.72), (0.62, 1.0, 1.0), mat, bevel=0.06)   # palm / back of hand
    for k in range(4):  # curled fingers (wrapping the grip, inner side)
        mb.box((x - 0.34 * sd, -0.05, 8.06 - k * 0.24), (0.32, 0.95, 0.2), mat, bevel=0.03)
    mb.box((x - 0.2 * sd, -0.45, 8.15), (0.35, 0.3, 0.25), mat, bevel=0.03)  # thumb
    mb.box((x + 0.35 * sd, -0.05, 7.8), (0.08, 0.7, 0.6), 'white' if mat == 'gray' else 'armor', bevel=0.02)
    return mb


def g_saber_hilt():
    mb = MB()
    x, y, z = PIV['grip']
    mb.cyl((x, y + 0.95, z), (x, y - 1.05, z), 0.19, 0.19, 'white', seg=12)
    mb.cyl((x, y - 1.0, z), (x, y - 1.3, z), 0.2, 0.26, 'gray', seg=12)
    mb.cyl((x, y - 1.28, z), (x, y - 1.36, z), 0.16, 0.16, 'engine', seg=12)
    mb.cyl((x, y + 0.9, z), (x, y + 1.05, z), 0.23, 0.2, 'gray', seg=12)
    for k in range(3):
        mb.cyl((x, y + 0.5 - k * 0.3, z), (x, y + 0.42 - k * 0.3, z), 0.21, 0.21, 'frame', seg=12)
    return mb


def g_rifle():
    mb = MB()
    x, y, z = PIV['grip']
    x = -x
    zc = z + 0.42
    mb.box((x, y - 0.1, z - 0.05), (0.32, 0.45, 0.9), 'frame', rot=(-12, 0, 0))            # grip
    mb.hexa([(x - 0.24, y + 0.9, zc - 0.4), (x + 0.24, y + 0.9, zc - 0.4), (x + 0.24, y - 2.6, zc - 0.4),
             (x - 0.24, y - 2.6, zc - 0.4),
             (x - 0.26, y + 0.9, zc + 0.4), (x + 0.26, y + 0.9, zc + 0.4), (x + 0.26, y - 2.4, zc + 0.35),
             (x - 0.26, y - 2.4, zc + 0.35)], 'gray', bevel=0.04)                             # receiver
    mb.box((x, y - 1.3, zc - 0.55), (0.3, 0.8, 0.35), 'frame', bevel=0.03)                 # front grip
    mb.box((x, y + 1.45, zc - 0.05), (0.3, 1.2, 0.55), 'gray', bevel=0.04)                  # stock
    mb.box((x, y + 2.05, zc - 0.1), (0.34, 0.2, 0.8), 'frame', bevel=0.03)
    mb.cyl((x, y - 2.5, zc + 0.05), (x, y - 4.2, zc + 0.05), 0.24, 0.22, 'gray', seg=12)   # barrel shroud
    mb.cyl((x, y - 4.1, zc + 0.05), (x, y - 5.55, zc + 0.05), 0.14, 0.14, 'frame', seg=10)  # barrel
    mb.cyl((x, y - 5.4, zc + 0.05), (x, y - 5.7, zc + 0.05), 0.2, 0.2, 'gray', seg=10)
    mb.box((x, y - 3.9, zc + 0.35), (0.08, 0.3, 0.25), 'frame')                             # front sight
    # scope (on the inner side)
    sx = x + 0.38
    mb.cyl((sx, y + 0.3, zc + 0.35), (sx, y - 1.4, zc + 0.35), 0.17, 0.17, 'white', seg=10)
    mb.cyl((sx, y - 1.4, zc + 0.35), (sx, y - 1.5, zc + 0.35), 0.13, 0.13, 'sensor', seg=10)
    mb.box((sx - 0.18, y - 0.5, zc + 0.2), (0.2, 0.6, 0.2), 'frame')
    return mb, Vector((x, y - 5.75, zc + 0.05))


def g_shield():
    mb = MB()
    out = [(-1.5, 13.4), (1.5, 13.4), (1.75, 12.8), (1.75, 8.1), (0.0, 4.9), (-1.75, 8.1), (-1.75, 12.8)]
    plate(mb, out, 4.45, 4.7, 'white', bevel=0.04)
    inner = [(y * 0.86, 9.1 + (z - 9.1) * 0.9) for y, z in out]
    plate(mb, inner, 4.68, 4.8, 'red', bevel=0.02)
    # yellow cross emblem + white star
    mb.box((4.84, 0, 11.6), (0.08, 0.34, 1.9), 'yellow', bevel=0.02)
    mb.box((4.84, 0, 11.85), (0.08, 1.7, 0.34), 'yellow', bevel=0.02)
    mb.box((4.87, 0, 11.85), (0.06, 0.34, 0.34), 'white', rot=(45, 0, 0))
    # grip / mount on the back
    mb.box((4.3, 0, 9.6), (0.3, 0.9, 1.5), 'frame')
    return mb


def g_backpack():
    mb = MB()
    mb.hexa([(-1.4, 1.65, 11.1), (1.4, 1.65, 11.1), (1.4, 2.9, 11.3), (-1.4, 2.9, 11.3),
             (-1.4, 1.65, 14.2), (1.4, 1.65, 14.2), (1.3, 2.75, 14.0), (-1.3, 2.75, 14.0)], 'white', bevel=0.08)
    mb.box((0, 2.95, 12.6), (1.6, 0.25, 2.0), 'gray', bevel=0.04)
    for sd in (1, -1):
        # saber hilts in racks, pointing up-outward
        mb.box((sd * 0.95, 2.45, 13.95), (0.6, 0.6, 0.5), 'gray', bevel=0.03)
        mb.cyl((sd * 0.95, 2.45, 14.0), (sd * 1.2, 2.55, 15.25), 0.18, 0.18, 'white', seg=10)
        mb.cyl((sd * 1.18, 2.55, 15.15), (sd * 1.24, 2.57, 15.45), 0.21, 0.21, 'gray', seg=10)
        # main thrusters (facing back, slightly down)
        mb.cyl((sd * 0.75, 2.4, 11.4), (sd * 0.75, 2.9, 11.0), 0.55, 0.55, 'frame', seg=14)
        mb.nozzle((sd * 0.75, 2.85, 11.05), (0, 1, -0.45), 0.5, 'gray', 'engine', length=0.55, seg=16)
        # side verniers
        mb.nozzle((sd * 1.45, 2.3, 12.8), (sd * 0.6, 1, 0), 0.22, 'gray', 'engine', length=0.25, seg=10)
    mb.nozzle((0, 2.95, 13.6), (0, 1, 0), 0.3, 'gray', 'engine', length=0.3, seg=12)
    return mb


def g_leg_upper(sd, R):
    mb = MB()
    x = 1.3 * sd
    mb.cyl((x, 0, 8.5), (x, 0, 7.4), 0.55, 0.55, 'frame', seg=12)
    mb.hexa([(x - 0.75, -0.8, 5.6), (x + 0.75, -0.8, 5.6), (x + 0.75, 0.8, 5.6), (x - 0.75, 0.8, 5.6),
             (x - 0.8, -0.9, 7.8), (x + 0.8, -0.9, 7.8), (x + 0.8, 0.9, 7.8), (x - 0.8, 0.9, 7.8)], 'white', bevel=0.1)
    mb.box((x + sd * 0.82, 0, 6.8), (0.1, 0.9, 1.1), 'gray', bevel=0.02)
    mb.cyl((x - 0.7, 0, 5.2), (x + 0.7, 0, 5.2), 0.55, 0.55, 'frame', seg=12)
    return mb


def g_leg_lower(sd, R):
    mb = MB()
    x = 1.3 * sd
    zloft(mb, [(5.5, 1.75, 1.95, 0.1), (4.4, 2.05, 2.45, 0.2), (2.6, 2.2, 2.6, 0.15), (1.55, 2.3, 2.6, 0.05)],
          'white', cx=x, bevel=0.04)
    # knee armour
    mb.hexa([(x - 0.72, -1.1, 4.7), (x + 0.72, -1.1, 4.7), (x + 0.72, -0.7, 4.7), (x - 0.72, -0.7, 4.7),
             (x - 0.62, -1.35, 5.9), (x + 0.62, -1.35, 5.9), (x + 0.62, -0.8, 5.9), (x - 0.62, -0.8, 5.9)],
            'white', bevel=0.07)
    mb.box((x, -1.2, 5.3), (1.0, 0.3, 0.5), 'gray', bevel=0.04)
    # ankle guard flares (front + sides)
    mb.hexa([(x - 0.95, -1.5, 1.2), (x + 0.95, -1.5, 1.2), (x + 0.95, -1.15, 1.2), (x - 0.95, -1.15, 1.2),
             (x - 0.85, -1.2, 2.3), (x + 0.85, -1.2, 2.3), (x + 0.85, -0.95, 2.3), (x - 0.85, -0.95, 2.3)],
            'white', bevel=0.05)
    for sdz in (1, -1):
        mb.hexa([(x + sdz * 1.25, -1.0, 1.15), (x + sdz * 1.25, 1.1, 1.15), (x + sdz * 0.95, 1.1, 1.15),
                 (x + sdz * 0.95, -1.0, 1.15),
                 (x + sdz * 1.12, -0.9, 2.2), (x + sdz * 1.12, 1.0, 2.2), (x + sdz * 0.85, 1.0, 2.2),
                 (x + sdz * 0.85, -0.9, 2.2)], 'white', bevel=0.05)
    # shin ridge + intake
    mb.hexa([(x - 0.35, -1.35, 2.0), (x + 0.35, -1.35, 2.0), (x + 0.35, -1.0, 2.0), (x - 0.35, -1.0, 2.0),
             (x - 0.3, -1.25, 4.4), (x + 0.3, -1.25, 4.4), (x + 0.3, -1.05, 4.4), (x - 0.3, -1.05, 4.4)],
            'white', bevel=0.04)
    for sdz in (1, -1):
        mb.box((x + sdz * 1.12, 0.2, 2.3), (0.1, 1.2, 0.5), 'frame')
    for k in range(3):  # calf vents
        mb.box((x, 1.42, 3.1 + k * 0.35), (1.1, 0.1, 0.16), 'frame')
    mb.box((x, 1.35, 1.9), (1.4, 0.2, 0.5), 'red', bevel=0.03)
    mb.sphere((x, 0.1, 1.25), 0.48, 'frame', seg=12, rings=6)
    return mb


def g_foot(sd, R, main='red'):
    mb = MB()
    x, yc = 1.3 * sd, 0.1
    mb.hexa([(x - 0.95, 1.35, 0.14), (x + 0.95, 1.35, 0.14), (x + 0.95, -2.3, 0.14), (x - 0.95, -2.3, 0.14),
             (x - 0.85, 1.15, 0.95), (x + 0.85, 1.15, 0.95), (x + 0.8, -2.05, 0.5), (x - 0.8, -2.05, 0.5)],
            main, bevel=0.07)
    mb.hexa([(x - 0.65, 0.4, 0.8), (x + 0.65, 0.4, 0.8), (x + 0.6, -1.3, 0.6), (x - 0.6, -1.3, 0.6),
             (x - 0.55, 0.4, 1.35), (x + 0.55, 0.4, 1.35), (x + 0.5, -0.9, 0.95), (x - 0.5, -0.9, 0.95)],
            main, bevel=0.05)
    mb.box((x, -0.4, 0.07), (2.0, 3.9, 0.14), 'frame', bevel=0.03)   # sole, bottom at z=0
    mb.box((x, 1.45, 0.5), (1.2, 0.3, 0.7), 'frame', bevel=0.04)       # heel
    mb.box((x, -2.0, 0.35), (1.4, 0.35, 0.18), 'gray', bevel=0.02)
    return mb


def gundam():
    gundam_palette()
    R = None
    rig = Rig()
    rig.root()
    rig.part('pelvis', P('pelvis'), g_pelvis(R))
    rig.part('torso', P('torso'), g_torso(R))
    rig.part('head', P('head'), g_head(R))
    rig.part('backpack', P('backpack'), g_backpack())
    for sd, s in ((1, 'L'), (-1, 'R')):
        rig.part('arm_%s_upper' % s, P('arm_upper', sd), g_arm_upper(sd, R))
        rig.part('arm_%s_lower' % s, P('arm_lower', sd), g_arm_lower(sd, R))
        rig.part('hand_%s' % s, P('hand', sd), g_hand(sd, R))
        rig.part('leg_%s_upper' % s, P('leg_upper', sd), g_leg_upper(sd, R))
        rig.part('leg_%s_lower' % s, P('leg_lower', sd), g_leg_lower(sd, R))
        rig.part('foot_%s' % s, P('foot', sd), g_foot(sd, R))
    rig.part('saber_hilt', P('grip', 1), g_saber_hilt())
    mb, muzzle = g_rifle()
    rig.part('rifle', P('grip', -1), mb)
    rig.part('shield', P('shield'), g_shield())
    rig.link_all()
    rig.empty('rifle_muzzle', muzzle, 'rifle')
    return list(rig.objs.values())


# =====================================================================================
#                                ENEMY MS (Zaku-like, crimson)
# =====================================================================================
def zaku_palette():
    reg('armor', (0.50, 0.03, 0.035), 0.3, 0.38)
    reg('armor_dk', (0.16, 0.012, 0.018), 0.35, 0.42)
    reg('char', (0.06, 0.06, 0.07), 0.55, 0.45)
    reg('steel', (0.30, 0.29, 0.30), 0.85, 0.35)
    reg('pipe', (0.10, 0.10, 0.11), 0.6, 0.5)
    reg('visor', (0.005, 0.005, 0.006), 0.3, 0.15)
    reg('eye', (0.4, 0.05, 0.2), 0.0, 0.3, (1.0, 0.25, 0.6), 6.0)
    reg('engine', (0.3, 0.1, 0.05), 0.0, 0.3, (1.0, 0.4, 0.12), 8.0)


def z_pelvis():
    mb = MB()
    mb.hexa([(-1.8, -1.15, 8.85), (1.8, -1.15, 8.85), (1.8, 1.15, 8.85), (-1.8, 1.15, 8.85),
             (-1.9, -1.3, 9.75), (1.9, -1.3, 9.75), (1.9, 1.3, 9.75), (-1.9, 1.3, 9.75)], 'char', bevel=0.06)
    mb.hexa([(-0.55, -1.0, 7.7), (0.55, -1.0, 7.7), (0.55, 0.7, 7.7), (-0.55, 0.7, 7.7),
             (-0.9, -1.35, 9.0), (0.9, -1.35, 9.0), (0.9, 0.95, 9.0), (-0.9, 0.95, 9.0)], 'armor_dk', bevel=0.05)
    for sd in (1, -1):
        mb.sphere((sd * 1.3, 0, 8.55), 0.55, 'char', seg=12, rings=6)
        # wide front skirt with rivets
        mb.hexa([(sd * 0.85, -1.4, 9.1), (sd * 2.3, -1.4, 9.1), (sd * 2.3, -1.1, 9.1), (sd * 0.85, -1.1, 9.1),
                 (sd * 0.9, -2.05, 6.9), (sd * 2.55, -2.05, 6.9), (sd * 2.55, -1.75, 6.9), (sd * 0.9, -1.75, 6.9)],
                'armor', bevel=0.06)
        for k in range(2):
            mb.sphere((sd * (1.2 + k * 0.9), -1.95, 7.35), 0.09, 'steel', seg=6, rings=4)
        mb.hexa([(sd * 1.9, -0.95, 9.5), (sd * 2.2, -0.95, 9.5), (sd * 2.2, 0.95, 9.5), (sd * 1.9, 0.95, 9.5),
                 (sd * 2.25, -1.05, 7.4), (sd * 2.6, -1.05, 7.4), (sd * 2.6, 1.05, 7.4), (sd * 2.25, 1.05, 7.4)],
                'armor', bevel=0.06)
    mb.hexa([(-1.5, 1.1, 9.4), (1.5, 1.1, 9.4), (1.5, 1.35, 9.4), (-1.5, 1.35, 9.4),
             (-1.3, 1.5, 7.6), (1.3, 1.5, 7.6), (1.3, 1.8, 7.6), (-1.3, 1.8, 7.6)], 'armor', bevel=0.06)
    return mb


def z_torso():
    mb = MB()
    mb.cyl((0, 0, 9.3), (0, 0, 10.0), 1.0, 1.0, 'char', seg=16)
    # ribbed abdomen
    for k in range(4):
        z = 9.75 + k * 0.32
        mb.cyl((0, 0, z), (0, 0, z + 0.26), 1.45 - k * 0.02, 1.5 - k * 0.02, 'char', seg=16, bevel=0.03)
    # barrel chest
    zloft(mb, [(10.9, 3.8, 2.6, 0), (11.8, 4.9, 3.3, -0.1), (13.5, 5.2, 3.4, -0.12), (14.25, 4.6, 3.0, -0.05),
               (14.6, 3.2, 2.3, 0)], 'armor', prof=circle_prof(12), bevel=0.0)
    # chest vent grill + armour plates
    mb.hexa([(-1.7, -1.72, 11.4), (1.7, -1.72, 11.4), (1.7, -1.3, 11.4), (-1.7, -1.3, 11.4),
             (-2.0, -1.85, 13.8), (2.0, -1.85, 13.8), (2.0, -1.4, 13.8), (-2.0, -1.4, 13.8)], 'armor_dk', bevel=0.06)
    for k in range(4):
        mb.box((0, -1.9, 12.0 + k * 0.4), (2.8, 0.1, 0.12), 'char')
    for sd in (1, -1):
        mb.cyl((sd * 2.3, 0, 13.55), (sd * 3.0, 0, 13.55), 0.65, 0.65, 'char', seg=12)
        # power pipes: chest side -> under the chin (ribbed)
        mb.pipe([(sd * 1.9, -1.5, 12.0), (sd * 1.4, -1.9, 13.4), (sd * 0.55, -1.45, 14.7)], 0.17, 'pipe', seg=8,
                beads=9, bead_mat='pipe')
        # waist pipes -> backpack
        mb.pipe([(sd * 1.4, -1.0, 10.4), (sd * 1.9, 0.2, 10.5), (sd * 1.3, 1.6, 11.2)], 0.15, 'pipe', seg=8,
                beads=8, bead_mat='pipe')
    mb.cyl((0, 0.05, 14.3), (0, 0.05, 14.8), 0.8, 0.65, 'char', seg=14)
    mb.box((0, 1.55, 12.6), (3.4, 0.5, 2.6), 'armor', bevel=0.08)
    return mb


def z_head():
    mb = MB()
    mb.cyl((0, 0.05, 14.4), (0, 0.05, 15.2), 0.45, 0.45, 'char', seg=10)
    c = Vector((0, 0.05, 15.95))
    mb.sphere(c, 1.08, 'armor', seg=20, rings=10, scale=(1.0, 1.08, 0.95), half=True)          # dome
    mb.cyl(c - Vector((0, 0, 0.32)), c + Vector((0, 0, 0.02)), 1.0, 1.02, 'visor', seg=20)      # eye slit
    mb.sphere(c - Vector((0, 0, 0.3)), 1.02, 'armor', seg=20, rings=10, scale=(1.0, 1.06, 0.8),
              rot=(180, 0, 0), half=True)                                                       # jaw bowl
    mb.sphere((0.18, -1.02, 15.8), 0.17, 'eye', seg=12, rings=6, scale=(1.2, 0.6, 1.0))          # mono-eye
    mb.cyl((0, -0.85, 15.25), (0, -1.12, 15.2), 0.3, 0.26, 'char', seg=12)                       # mouth port
    mb.cyl((0, -1.1, 15.2), (0, -1.16, 15.2), 0.2, 0.2, 'steel', seg=12)
    # commander blade antenna
    mb.hexa([(-0.06, -1.05, 16.2), (0.06, -1.05, 16.2), (0.06, -0.6, 16.5), (-0.06, -0.6, 16.5),
             (-0.03, -1.05, 17.95), (0.03, -1.05, 17.95), (0.03, -0.95, 17.95), (-0.03, -0.95, 17.95)], 'armor_dk')
    for sd in (1, -1):
        mb.box((sd * 0.95, 0.2, 15.5), (0.3, 0.8, 0.6), 'char', bevel=0.05)
    return mb


def z_arm_upper(sd):
    mb = MB()
    x = 3.55 * sd
    mb.cyl((x - 0.1 * sd, 0, 13.3), (x - 0.1 * sd, 0, 11.3), 0.6, 0.55, 'char', seg=12)
    for k in range(3):
        mb.cyl((x - 0.1 * sd, 0, 12.8 - k * 0.45), (x - 0.1 * sd, 0, 12.6 - k * 0.45), 0.68, 0.68, 'char', seg=12)
    mb.cyl((x - 0.7 * sd, 0, 11.05), (x + 0.55 * sd, 0, 11.05), 0.52, 0.52, 'char', seg=12)
    if sd > 0:  # spiked shoulder pauldron
        c = Vector((x + 0.15, 0, 13.7))
        mb.sphere(c, 1.0, 'armor', seg=16, rings=8, scale=(1.15, 1.45, 1.2), half=True)
        mb.cyl(c - Vector((0, 0, 0.35)), c + Vector((0, 0, 0.02)), 1.2, 1.18, 'armor', seg=16)
        mb.sphere(c - Vector((0, 0, 0.35)), 1.0, 'armor_dk', seg=16, rings=8, scale=(1.18, 1.48, 0.4),
                  rot=(180, 0, 0), half=True)
        for dy, dz, ang in ((-0.75, 0.55, (-45, 0, 0)), (0.0, 0.85, (0, 0, 0)), (0.75, 0.55, (45, 0, 0))):
            base = c + Vector((0.55, dy, dz))
            tip = base + Vector((0.9, dy * 0.6, 0.9 + abs(dy) * 0.1))
            mb.cyl(base, tip, 0.28, 0.02, 'steel', seg=8)
    else:  # right: rounded shoulder shield plate
        c = Vector((x - 0.1, 0, 13.6))
        mb.sphere(c, 0.95, 'armor', seg=16, rings=8, scale=(1.0, 1.1, 0.9), half=True)
        mb.hexa([(x - 0.95, -1.9, 11.4), (x - 1.25, -1.9, 11.4), (x - 1.25, 1.9, 11.4), (x - 0.95, 1.9, 11.4),
                 (x - 0.6, -1.7, 15.0), (x - 0.95, -1.7, 15.0), (x - 0.95, 1.7, 15.0), (x - 0.6, 1.7, 15.0)],
                'armor', bevel=0.1)
        for k in range(3):
            mb.sphere((x - 1.27, -1.2 + k * 1.2, 12.0), 0.09, 'steel', seg=6, rings=4)
    return mb


def z_arm_lower(sd):
    mb = MB()
    x = 3.45 * sd
    zloft(mb, [(11.1, 1.2, 1.3), (10.5, 1.5, 1.6), (8.8, 1.6, 1.75), (8.45, 1.35, 1.5)], 'armor', cx=x, bevel=0.05)
    mb.cyl((x, 0, 8.55), (x, 0, 8.2), 0.5, 0.45, 'char', seg=12)
    return mb


def z_shield():
    """Forearm blade-guard on the left forearm (named 'shield' per contract)."""
    mb = MB()
    out = [(-1.0, 11.0), (0.9, 11.0), (1.1, 10.2), (1.0, 8.6), (0.0, 7.6), (-1.6, 8.9), (-1.2, 10.4)]
    plate(mb, out, 4.2, 4.5, 'armor_dk', bevel=0.04)
    for k, (y, z) in enumerate(((-1.4, 9.0), (-0.2, 7.9), (0.9, 8.7))):
        mb.cyl((4.4, y * 0.8, z + 0.3), (4.9, y * 1.2, z - 0.4), 0.16, 0.01, 'steel', seg=6)
    return mb


def z_backpack():
    mb = MB()
    mb.hexa([(-1.6, 1.7, 11.0), (1.6, 1.7, 11.0), (1.5, 3.2, 11.2), (-1.5, 3.2, 11.2),
             (-1.6, 1.7, 14.1), (1.6, 1.7, 14.1), (1.4, 3.0, 13.9), (-1.4, 3.0, 13.9)], 'armor', bevel=0.1)
    mb.box((0, 3.25, 12.5), (2.2, 0.2, 1.8), 'char', bevel=0.04)
    for sd in (1, -1):
        mb.nozzle((sd * 0.8, 3.1, 11.2), (0, 1, -0.4), 0.6, 'char', 'engine', length=0.6, seg=16)
        mb.box((sd * 1.7, 2.4, 12.4), (0.4, 1.2, 1.8), 'char', bevel=0.04)
    return mb


def z_leg_upper(sd):
    mb = MB()
    x = 1.3 * sd
    mb.cyl((x, 0, 8.5), (x, 0, 7.4), 0.6, 0.6, 'char', seg=12)
    mb.hexa([(x - 0.8, -0.85, 5.6), (x + 0.8, -0.85, 5.6), (x + 0.8, 0.85, 5.6), (x - 0.8, 0.85, 5.6),
             (x - 0.85, -0.95, 7.8), (x + 0.85, -0.95, 7.8), (x + 0.85, 0.95, 7.8), (x - 0.85, 0.95, 7.8)],
            'armor', bevel=0.1)
    mb.cyl((x - 0.72, 0, 5.2), (x + 0.72, 0, 5.2), 0.58, 0.58, 'char', seg=12)
    return mb


def z_leg_lower(sd):
    mb = MB()
    x = 1.3 * sd
    zloft(mb, [(5.6, 1.8, 2.0, 0.1), (4.6, 2.2, 2.5, 0.2), (2.4, 2.7, 3.0, 0.2), (1.35, 2.85, 3.15, 0.1)],
          'armor', cx=x, prof=circle_prof(10), bevel=0.0)
    mb.hexa([(x - 0.75, -1.15, 4.6), (x + 0.75, -1.15, 4.6), (x + 0.75, -0.7, 4.6), (x - 0.75, -0.7, 4.6),
             (x - 0.65, -1.4, 5.9), (x + 0.65, -1.4, 5.9), (x + 0.65, -0.8, 5.9), (x - 0.65, -0.8, 5.9)],
            'armor_dk', bevel=0.07)
    # leg pipe
    mb.pipe([(x + sd * 0.95, -0.4, 4.9), (x + sd * 1.35, 0.1, 3.6), (x + sd * 1.3, 0.6, 2.2)], 0.14, 'pipe',
            seg=8, beads=6)
    for k in range(3):
        mb.box((x, 1.72, 2.6 + k * 0.4), (1.3, 0.12, 0.18), 'char')
    mb.sphere((x, 0.1, 1.25), 0.5, 'char', seg=12, rings=6)
    return mb


def z_foot(sd):
    mb = MB()
    x = 1.3 * sd
    mb.hexa([(x - 1.05, 1.5, 0.14), (x + 1.05, 1.5, 0.14), (x + 1.05, -2.4, 0.14), (x - 1.05, -2.4, 0.14),
             (x - 0.95, 1.3, 1.0), (x + 0.95, 1.3, 1.0), (x + 0.85, -2.1, 0.45), (x - 0.85, -2.1, 0.45)],
            'char', bevel=0.08)
    mb.box((x, -0.4, 0.07), (2.2, 4.1, 0.14), 'pipe', bevel=0.03)
    mb.box((x, 0.2, 1.1), (1.4, 1.2, 0.5), 'char', bevel=0.05)
    return mb


def z_rifle():
    mb = MB()
    x, y, z = PIV['grip']
    x = -x
    zc = z + 0.4
    mb.box((x, y - 0.1, z - 0.05), (0.34, 0.45, 0.9), 'char', rot=(-12, 0, 0))
    mb.box((x, y - 0.9, zc), (0.5, 2.8, 0.75), 'char', bevel=0.05)
    mb.box((x, y + 1.3, zc - 0.05), (0.32, 1.4, 0.5), 'steel', bevel=0.04)
    mb.cyl((x, y - 2.3, zc + 0.1), (x, y - 5.2, zc + 0.1), 0.15, 0.15, 'steel', seg=10)
    mb.cyl((x, y - 2.3, zc + 0.1), (x, y - 3.0, zc + 0.1), 0.26, 0.26, 'char', seg=10)
    mb.cyl((x, y - 5.1, zc + 0.1), (x, y - 5.45, zc + 0.1), 0.2, 0.2, 'char', seg=10)
    # drum magazine on the outer side
    mb.cyl((x - 0.3, y - 0.6, zc - 0.1), (x - 0.75, y - 0.6, zc - 0.1), 0.75, 0.75, 'armor_dk', seg=16)
    mb.cyl((x + 0.3, y - 0.3, zc + 0.5), (x + 0.3, y - 1.5, zc + 0.5), 0.15, 0.15, 'steel', seg=8)  # scope
    return mb, Vector((x, y - 5.5, zc + 0.1))


def z_hilt():
    mb = MB()
    x, y, z = PIV['grip']
    mb.cyl((x, y + 0.9, z), (x, y - 1.1, z), 0.17, 0.17, 'char', seg=10)
    mb.cyl((x, y - 1.05, z), (x, y - 1.35, z), 0.22, 0.2, 'steel', seg=10)
    mb.cyl((x, y + 0.9, z), (x, y + 1.05, z), 0.2, 0.2, 'steel', seg=10)
    return mb


def enemy_ms():
    zaku_palette()
    rig = Rig()
    rig.root()
    rig.part('pelvis', P('pelvis'), z_pelvis())
    rig.part('torso', P('torso'), z_torso())
    rig.part('head', P('head'), z_head())
    rig.part('backpack', P('backpack'), z_backpack())
    for sd, s in ((1, 'L'), (-1, 'R')):
        rig.part('arm_%s_upper' % s, P('arm_upper', sd), z_arm_upper(sd))
        rig.part('arm_%s_lower' % s, P('arm_lower', sd), z_arm_lower(sd))
        rig.part('hand_%s' % s, P('hand', sd), g_hand(sd, None, mat='char'))
        rig.part('leg_%s_upper' % s, P('leg_upper', sd), z_leg_upper(sd))
        rig.part('leg_%s_lower' % s, P('leg_lower', sd), z_leg_lower(sd))
        rig.part('foot_%s' % s, P('foot', sd), z_foot(sd))
    rig.part('saber_hilt', P('grip', 1), z_hilt())
    mb, muzzle = z_rifle()
    rig.part('rifle', P('grip', -1), mb)
    rig.part('shield', P('shield'), z_shield())
    rig.link_all()
    rig.empty('rifle_muzzle', muzzle, 'rifle')
    return list(rig.objs.values())
