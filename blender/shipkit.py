"""Advanced ship kit: surface-parametrized hulls, layered armor plates with panel breaks,
surface-oriented greebles, deep engine bells, turrets, radiators, sensor spines, hull numbers, booleans.

Conventions (Blender space): nose toward -Y, station s = -y (nose = +s), up +Z, x = starboard/port.
Profile points are normalized (u, v) in [-1, 1], ordered counter-clockwise seen from the nose.
Surface parameter p is in *vertex-index space*: p = i + t means t of the way along profile edge i.
"""
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from lib import MB, lerp, D2R, link, get_mat

# ------------------------------------------------------------------ profiles
KNIFE = [(1, 0.05), (0.72, 0.55), (0.3, 1), (-0.3, 1), (-0.72, 0.55), (-1, 0.05),
         (-0.78, -0.55), (-0.3, -1), (0.3, -1), (0.78, -0.55)]
HEX = [(1, 0), (0.55, 1), (-0.55, 1), (-1, 0), (-0.55, -1), (0.55, -1)]
BOX8 = [(1, -0.72), (1, 0.72), (0.8, 1), (-0.8, 1), (-1, 0.72), (-1, -0.72), (-0.8, -1), (0.8, -1)]
DIAMOND = [(1, 0), (0.4, 0.6), (0, 1), (-0.4, 0.6), (-1, 0), (-0.4, -0.6), (0, -1), (0.4, -0.6)]
BLADE = [(1, 0), (0, 1), (-1, 0), (0, -1)]


def smoothstep(t):
    return t * t * (3 - 2 * t)


class Hull:
    """Lofted hull defined by stations (s, w, h, cz[, cx]) and a profile."""

    def __init__(self, stations, prof, cx=0.0, cz=0.0, smooth=False):
        self.st = [tuple(x) + ((0.0,) if len(x) == 4 else ()) for x in stations]
        self.prof = prof
        self.cx0 = cx
        self.cz0 = cz
        self.smooth = smooth
        self.n = len(prof)

    def at(self, s):
        st = self.st
        if s <= st[0][0]:
            a = st[0]
            return a[1], a[2], a[3] + self.cz0, a[4] + self.cx0
        for a, b in zip(st, st[1:]):
            if a[0] <= s <= b[0]:
                t = (s - a[0]) / (b[0] - a[0]) if b[0] != a[0] else 0
                if self.smooth:
                    t = smoothstep(t)
                return (lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t) + self.cz0,
                        lerp(a[4], b[4], t) + self.cx0)
        a = st[-1]
        return a[1], a[2], a[3] + self.cz0, a[4] + self.cx0

    def poly(self, s, off=0.0):
        w, h, cz, cx = self.at(s)
        P = [Vector((u * w / 2, v * h / 2)) for u, v in self.prof]
        if off == 0.0:
            return P, (cx, cz)
        n = len(P)
        Q = []
        for i in range(n):
            e0 = P[i] - P[i - 1]
            e1 = P[(i + 1) % n] - P[i]
            n0 = Vector((e0.y, -e0.x))
            n1 = Vector((e1.y, -e1.x))
            if n0.length < 1e-9 or n1.length < 1e-9:
                Q.append(P[i])
                continue
            n0.normalize()
            n1.normalize()
            m = n0 + n1
            if m.length < 1e-6:
                m = n1
            m.normalize()
            k = max(0.35, m.dot(n1))
            Q.append(P[i] + m * (off / k))
        return Q, (cx, cz)

    def _w(self, s, q, c):
        return Vector((c[0] + q.x, -s, c[1] + q.y))

    def edge_len(self, s, i):
        P, _ = self.poly(s)
        i %= self.n
        return (P[(i + 1) % self.n] - P[i]).length

    def pt(self, s, p, off=0.0):
        """World point + outward normal at station s, surface param p (index space)."""
        Q, c = self.poly(s, off)
        P, _ = self.poly(s)
        i = int(math.floor(p)) % self.n
        t = p - math.floor(p)
        j = (i + 1) % self.n
        q = Q[i].lerp(Q[j], t)
        e = P[j] - P[i]
        nrm = Vector((e.y, 0.0, -e.x))
        nrm = Vector((nrm.x, 0, nrm.z)).normalized() if nrm.length > 1e-9 else Vector((0, 0, 1))
        return self._w(s, q, c), nrm

    def sample(self, s, p0, p1, off=0.0, trim0=0.0, trim1=0.0):
        """Points from p0 to p1 (p1 > p0), integer vertices included; trims in world units."""
        Q, c = self.poly(s, off)
        n = self.n
        pts = []
        i0 = int(math.floor(p0))
        l0 = max(1e-6, (Q[(i0 + 1) % n] - Q[i0 % n]).length)
        a = p0 + trim0 / l0
        i1 = int(math.floor(p1 - 1e-9))
        l1 = max(1e-6, (Q[(i1 + 1) % n] - Q[i1 % n]).length)
        b = p1 - trim1 / l1

        def at(p):
            i = int(math.floor(p))
            t = p - i
            return Q[i % n].lerp(Q[(i + 1) % n], t)
        pts.append(at(a))
        k = int(math.floor(p0)) + 1
        while k < p1 - 1e-6:
            pts.append(Q[k % n])
            k += 1
        pts.append(at(b))
        return [self._w(s, q, c) for q in pts]

    def build(self, mb, mat, s0=None, s1=None, step=None, cap0=True, cap1=True, off=0.0, tip0=False, tip1=False):
        s0 = self.st[0][0] if s0 is None else s0
        s1 = self.st[-1][0] if s1 is None else s1
        ss = sorted(set([s0, s1] + [x[0] for x in self.st if s0 < x[0] < s1] +
                        ([s0 + (s1 - s0) * k / 24 for k in range(1, 24)] if self.smooth else [])))
        rings = []
        for s in ss:
            w, h, cz, cx = self.at(s)
            if w < 1e-3 and h < 1e-3:
                rings.append(Vector((cx, -s, cz)))
            else:
                Q, c = self.poly(s, off)
                rings.append([self._w(s, q, c) for q in Q])
        mb.loft(rings, mat, cap0=cap0, cap1=cap1)


# ------------------------------------------------------------------ armor plates
# Rounded plate edges: every plate's outer edges get a 2-segment circular fillet (p sides) / a cubic roll-off (s ends)
# whose tangent length is PLATE_ROUND x thickness (clamped by the plate's own size, and by `mb.plate_round_max` metres
# when a ship sets it).  The fillets are smooth-shaded while the flat faces stay flat: the bevel edges are marked
# smooth and a Weighted Normal (face area) modifier limited to the plate vertices hands every fillet vertex the normal
# of its big neighbouring face, so the shading rolls over the edge without bending the plate tops.
# The build keeps the *un-rounded* plate until MB.to_object() (so ray-cast placement during the build sees exactly
# the old plates) and swaps in the rounded one there.  PLATE_ROUND = 0 disables it.
PLATE_ROUND = 0.4
PLATE_ROUND_SKIP = ('engine', 'muzzle', 'window')    # emissive markers the engine clusters: never touched
_RND_SMOOTH_MAX = 70.0                                 # fillet edges up to this dihedral are shaded smooth


def _bez(P, u):
    a, b, c, d = (1 - u) ** 3, 3 * u * (1 - u) ** 2, 3 * u * u * (1 - u), u ** 3
    return (a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1])


def _round_rings(hull, s0, s1, p0, p1, off, thick, ch, mids, d):
    """Rounded plate: list of rings (equal length) + column indices of the fillet columns, or None if too small."""
    L = s1 - s0
    hw = thick * 0.35                                   # end-wall height of the original plate
    sm = (s0 + s1) / 2
    # plate width at mid-station (along the inner row) and room to the first / last hull vertex crossed
    inner = hull.sample(sm, p0, p1, off - 0.05)
    W = sum((b - a).length for a, b in zip(inner, inner[1:]))
    room = W / 2 - ch
    if math.ceil(p0) < p1:
        room = min(room, (math.ceil(p0) - p0) * hull.edge_len(sm, math.floor(p0)) - ch)
    if math.floor(p1) > p0 and math.floor(p1) != p1:
        room = min(room, (p1 - math.floor(p1)) * hull.edge_len(sm, math.floor(p1)) - ch)
    dp = min(d, 0.6 * room)
    # s ends: cubic whose control polygon is the original end profile (wall top -> chamfer corner) -> lies inside it
    slope_s = math.hypot(ch, thick - hw)
    dW = min(d, 0.6 * (hw + 0.05))
    dT = min(d, 0.45 * slope_s, 0.8 * (L / 2 - ch))
    if dp < 0.004 or dT < 0.004 or dW < 0.004 or L < 2 * (ch + dT) + 1e-3:
        return None
    P = [(0.0, hw - dW), (0.0, hw), (ch, thick), (ch + dT, thick)]
    prof = [P[0], _bez(P, 0.5), P[3]]                  # 2 segments: (distance from the end, thickness)
    ss = [(s0 + a, h) for a, h in prof]
    ss += [(s, thick) for s in mids if s0 + ch + dT + 1e-3 < s < s1 - ch - dT - 1e-3]
    ss += [(s1 - a, h) for a, h in prof[::-1]]
    rings = []
    for s, tr in ss:
        # p sides: 2-segment circular fillet of the slope (0,-0.05)->(ch,tr) / top corner, tangent length dd
        sx, sy = ch, tr + 0.05
        Ls = math.hypot(sx, sy)
        dd = min(dp, 0.45 * Ls)
        ux, uy = sx / Ls, sy / Ls
        phi = math.atan2(sy, sx)                     # deflection slope -> top
        r = dd / math.tan(phi / 2)
        e = r / math.cos(phi / 2) - r
        bx, by = 1.0 - ux, -uy
        bl = math.hypot(bx, by)
        A = (ch - ux * dd, tr - uy * dd)
        M = (ch + bx / bl * e, tr + by / bl * e)
        B = (ch + dd, tr)
        inn = hull.sample(s, p0, p1, off - 0.05)
        top = hull.sample(s, p0, p1, off + tr, trim0=B[0], trim1=B[0])
        ra = hull.sample(s, p0, p1, off + A[1], trim0=A[0], trim1=A[0])
        rm = hull.sample(s, p0, p1, off + M[1], trim0=M[0], trim1=M[0])
        rings.append(inn + [ra[-1], rm[-1]] + top[::-1] + [rm[0], ra[0]])
    n, T = len(inner), len(top)
    cols = [n, n + 1, n + 2, n + 1 + T, n + 2 + T, n + 3 + T]       # A, M, B (p1 side), B, M, A (p0 side)
    return rings, cols


def _rounding_pass(mb):
    """MB.pre_out hook: swap every recorded plate for its rounded version; tag fillet edges + plate vertices."""
    bm = mb.bm
    recs = [r for r in mb._rnd_plates if all(v.is_valid for v in r[0])]
    bmesh.ops.delete(bm, geom=[v for r in recs for v in r[0]], context='VERTS')
    smooth, sharp, verts = [], [], []
    for _, rings, cols, mat in recs:
        vr = mb.loft(rings, mat)
        K, m = len(vr), len(vr[0])
        bmesh.ops.recalc_face_normals(bm, faces=list({f for r in vr for v in r for f in v.link_faces}))
        verts += [v for r in vr for v in r]
        cand = []
        for i in range(K - 1):
            for j in cols:
                cand.append(bm.edges.get((vr[i][j], vr[i + 1][j])))
        for i in list(range(0, 3)) + list(range(K - 3, K)):
            for j in range(m):
                cand.append(bm.edges.get((vr[i][j], vr[i][(j + 1) % m])))
        for e in cand:
            if e is None:
                continue
            (smooth if e.calc_face_angle(math.pi) < _RND_SMOOTH_MAX * math.pi / 180 else sharp).append(e)
    bm.verts.index_update()
    bm.edges.index_update()
    mb._rnd_tags = ([e.index for e in smooth], [e.index for e in sharp], [v.index for v in verts])


def _rounding_post(mb, obj):
    """MB.post_out hook: fillet edges smooth (after the angle-based sharp pass), weighted normals on the plates."""
    smooth, sharp, verts = mb._rnd_tags
    if not verts:
        return
    me = obj.data
    att = me.attributes.get('sharp_edge') or me.attributes.new('sharp_edge', 'BOOLEAN', 'EDGE')
    flags = [False] * len(me.edges)
    att.data.foreach_get('value', flags)
    for i in smooth:
        flags[i] = False
    for i in sharp:
        flags[i] = True
    att.data.foreach_set('value', flags)
    me.update()
    vg = obj.vertex_groups.new(name='plate_round')
    vg.add(verts, 1.0, 'REPLACE')
    wn = obj.modifiers.new('plate_round_normals', 'WEIGHTED_NORMAL')
    wn.mode = 'FACE_AREA'
    wn.weight = 100
    wn.keep_sharp = True
    wn.vertex_group = vg.name


def plate(mb, hull, s0, s1, p0, p1, mat, off=0.0, thick=0.8, ch=None, step=None, rnd=None):
    """One armor plate following the hull surface, chamfered on all four sides, outer edges rounded (see above).
    rnd: fillet tangent length in metres (default PLATE_ROUND * thick, capped by mb.plate_round_max; 0 = off)."""
    if s1 - s0 < 1e-3 or p1 - p0 < 1e-3:
        return
    ch = ch if ch is not None else min(thick * 1.2, (s1 - s0) * 0.2)
    step = step or max(4.0, (s1 - s0) / 3)
    ss = [s0, s0 + ch]
    nmid = max(0, int((s1 - s0 - 2 * ch) / step))
    mids = [lerp(s0 + ch, s1 - ch, k / (nmid + 1)) for k in range(1, nmid + 1)]
    ss += mids
    ss += [s1 - ch, s1]
    rings = []
    for k, s in enumerate(ss):
        end = k in (0, len(ss) - 1)
        t = thick * (0.35 if end else 1.0)
        inner = hull.sample(s, p0, p1, off - 0.05)
        outer = hull.sample(s, p0, p1, off + t, trim0=ch, trim1=ch)
        rings.append(inner + outer[::-1])
    vr = mb.loft(rings, mat)
    d = PLATE_ROUND * thick if rnd is None else rnd
    cap = getattr(mb, 'plate_round_max', None)
    if cap is not None:
        d = min(d, cap)
    if d <= 0 or mat in PLATE_ROUND_SKIP:
        return
    if type(hull).at is Hull.at and type(hull).poly is Hull.poly and not hull.smooth:
        # piecewise-linear hull: the plate only needs rings where the hull itself has them (station breaks)
        mids = [st[0] for st in hull.st if s0 + ch < st[0] < s1 - ch]
    rr = _round_rings(hull, s0, s1, p0, p1, off, thick, ch, mids, d)
    if rr is None:
        return
    if not hasattr(mb, '_rnd_plates'):
        mb._rnd_plates = []
        mb.pre_out = list(getattr(mb, 'pre_out', ())) + [_rounding_pass]
        mb.post_out = list(getattr(mb, 'post_out', ())) + [_rounding_post]
    mb._rnd_plates.append(([v for r in vr for v in r], rr[0], rr[1], mat))


def armor(mb, hull, s_cuts, p_cuts, mats, R, off=0.0, thick=0.8, gap_s=0.6, gap_p=0.04, skip_prob=0.0,
          skip=None, sub_prob=0.0, sub_mat=None, ch=None, rnd=None):
    """Grid of plates. mats: callable(i_s, i_p, R) -> material or list.  rnd: see plate()."""
    for i, (sa, sb) in enumerate(zip(s_cuts, s_cuts[1:])):
        for j, (pa, pb) in enumerate(zip(p_cuts, p_cuts[1:])):
            sm = (sa + sb) / 2
            if skip and any(a <= sm <= b and (pp0 <= (pa + pb) / 2 <= pp1) for a, b, pp0, pp1 in skip):
                continue
            if skip_prob and R.random() < skip_prob:
                continue
            m = mats(i, j, R) if callable(mats) else R.choice(mats)
            plate(mb, hull, sa + gap_s / 2, sb - gap_s / 2, pa + gap_p, pb - gap_p, m, off=off, thick=thick, ch=ch,
                  rnd=rnd)
            if sub_prob and R.random() < sub_prob:
                L = sb - sa
                a = R.uniform(sa + L * 0.15, sa + L * 0.4)
                b = R.uniform(sa + L * 0.6, sb - L * 0.15)
                pw = pb - pa
                plate(mb, hull, a, b, pa + pw * 0.2, pb - pw * 0.2, sub_mat or m, off=off + thick, thick=thick * 0.6,
                      rnd=None if rnd is None else rnd * 0.6)


def cuts(a, b, R, lmin, lmax):
    out = [a]
    while out[-1] < b - lmin:
        out.append(min(b, out[-1] + R.uniform(lmin, lmax)))
    out[-1] = b
    return out


# ------------------------------------------------------------------ oriented placement
def frame(n, fwd=Vector((0, -1, 0))):
    n = Vector(n).normalized()
    t = fwd - n * fwd.dot(n)
    if t.length < 1e-6:
        t = Vector((1, 0, 0)) - n * n.x
    t.normalize()
    b = t.cross(n)
    return b, t, n


def obox(mb, pos, n, size, mat, lift=None, bevel=0.0, fwd=Vector((0, -1, 0)), spin=0.0):
    """Box sitting on a surface point (pos, normal). size = (across, along, height)."""
    b, t, nn = frame(n, fwd)
    if spin:
        c, s_ = math.cos(spin), math.sin(spin)
        b, t = b * c + t * s_, t * c - b * s_
    h = size[2]
    lift = h / 2 - 0.05 * h if lift is None else lift
    c = Vector(pos) + nn * lift
    M = Matrix((
        (b.x * size[0], t.x * size[1], nn.x * h, c.x),
        (b.y * size[0], t.y * size[1], nn.y * h, c.y),
        (b.z * size[0], t.z * size[1], nn.z * h, c.z),
        (0, 0, 0, 1)))
    r = bmesh.ops.create_cube(mb.bm, size=1.0, matrix=M)
    mb._fin(mb._faces_of(r['verts']), mat, bevel)


def windows(mb, hull, s0, s1, p, mat='window', off=0.9, pitch=1.6, size=(0.3, 0.8, 0.2), R=None, dropout=0.15,
            gaps=None, frame_mat=None):
    """Row of recessed window bays on the surface (size = (across, along, thickness) of each bay's footprint).
    Same sites / RNG use as the old box rows; each bay = dark bezel + set-back panes (see window_bay)."""
    s = s0
    while s < s1:
        if not (gaps and any(a <= s <= b for a, b in gaps)) and not (R and R.random() < dropout):
            pos, n = hull.pt(s, p, off)
            window_bay(mb, pos, n, size, mat, frame_mat, lift=0.3 * size[2])   # pane plane clears the skin
        s += pitch


# ------------------------------------------------------------------ emissive fixtures
# Purpose-designed light fixtures that replace plain emissive boxes.  Every helper takes the same placement as
# obox(): a surface point `pos`, its normal `n`, a footprint `size` = (across, along, height) and `fwd` (the
# "along" direction); `lift` is the height of the footprint centre above `pos` (obox default when None).
# All geometry stays inside that footprint box, so swapping obox() for a fixture keeps positions / sizes /
# ray-cast behaviour.  Emissive material only on lenses / panes; bodies use existing non-emissive materials
# (`body=None` picks the first registered of greeble / belly / mech / gunmetal / hull ...).
# Variation (dark panes, blinds) is hashed from the world position - no RNG is consumed, seeds stay intact.
DARK_MATS = ('greeble', 'belly', 'mech', 'gunmetal', 'machine', 'wall_dark', 'hull', 'steel')
TRIM_MATS = ('trim', 'metal', 'ring', 'steel', 'hull2', 'greeble', 'belly', 'mech', 'gunmetal')


def _mat_or(m, pool):
    if m:
        return m
    from lib import MAT_SPECS
    for k in pool:
        if k in MAT_SPECS:
            return k
    return pool[0]


def _fx(pos, n, fwd, size, lift, spin=0.0):
    """Local fixture frame: base-centre o (bottom of the footprint), b across, t along, nn out."""
    b, t, nn = frame(n, Vector(fwd))
    if spin:
        c, s_ = math.cos(spin), math.sin(spin)
        b, t = b * c + t * s_, t * c - b * s_
    h = size[2]
    lift = h / 2 - 0.05 * h if lift is None else lift
    o = Vector(pos) + nn * (lift - h / 2)
    return o, b, t, nn


def _w(L, x, y, z):
    o, b, t, nn = L
    return o + b * x + t * y + nn * z


def _ring(L, pts2, z):
    return [_w(L, x, y, z) for x, y in pts2]


def _rect(a, l, cx=0.0, cy=0.0):
    return [(cx + a / 2, cy + l / 2), (cx - a / 2, cy + l / 2), (cx - a / 2, cy - l / 2), (cx + a / 2, cy - l / 2)]


def _stadium(a, l, k=4, sc=1.0):
    """Rounded-end (pill) outline, across a, along l, k points per end cap (CCW); circle when l <= a."""
    a, l = a * sc, l * sc
    if l < a:
        a, l, swap = l, a, True
    else:
        swap = False
    r = a / 2
    cy = max(0.0, l / 2 - r)
    pts = [(r * math.cos(math.pi * i / (k - 1)), cy + r * math.sin(math.pi * i / (k - 1))) for i in range(k)]
    pts += [(r * math.cos(math.pi + math.pi * i / (k - 1)), -cy + r * math.sin(math.pi + math.pi * i / (k - 1)))
            for i in range(k)]
    if swap:
        pts = [(y, -x) for x, y in pts]
    return pts


def _face(mb, pts, mat):
    """Single face with the given winding (CCW seen from outside), protected from normal recalculation."""
    f = mb.bm.faces.new([mb.bm.verts.new(Vector(p)) for p in pts])
    f.material_index = mb._mi(mat)
    mb.keep([f])
    return f


def _hash(p, k=0):
    v = math.sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719 + k * 11.13) * 43758.5453
    return v - math.floor(v)


def _housing(mb, L, a, l, z1, mat, inset):
    """Armoured housing: chamfered frustum a x l at the base -> inset at height z1."""
    mb.loft([_ring(L, _rect(a, l), 0.0), _ring(L, _rect(max(a - 2 * inset, a * 0.3), max(l - 2 * inset, l * 0.3)), z1)],
            mat, cap0=False)            # open underside (sits on the hull)


def lamp_fixture(mb, pos, n, size, mat, body=None, fwd=Vector((0, -1, 0)), lift=None, lens='pill', spin=0.0):
    """Marker / running light: low armoured housing with a bevelled pill lens (rounded ends) or a domed round lens
    (lens='dome'; automatic when the footprint is ~square)."""
    a, l, h = size
    body = _mat_or(body, DARK_MATS)
    L = _fx(pos, n, fwd, size, lift, spin)
    c = 0.16 * min(a, l)
    zh = 0.5 * h
    _housing(mb, L, a, l, zh, body, c)
    la, ll = (a - 2 * c) * 0.8, (l - 2 * c) * 0.88
    if lens == 'dome' or max(a, l) < 1.3 * min(a, l):
        d = min(la, ll)
        la, ll = (d, d) if max(a, l) < 1.3 * min(a, l) else (la, ll)
        mb.loft([_ring(L, _stadium(la, ll, 4), 0.36 * h), _ring(L, _stadium(la, ll, 4, 0.86), 0.8 * h),
                 _ring(L, _stadium(la, ll, 4, 0.45), h)], mat, cap0=False)
    else:
        mb.loft([_ring(L, _stadium(la, ll, 4), 0.36 * h), _ring(L, _stadium(la, ll, 4, 0.66), h)], mat, cap0=False)


def light_bar(mb, pos, n, size, mat, body=None, fwd=Vector((0, -1, 0)), lift=None, segs=None, spin=0.0):
    """Light bar: armoured channel housing carrying a row of separate bevelled lens segments (dark gaps between)."""
    a, l, h = size
    body = _mat_or(body, DARK_MATS)
    L = _fx(pos, n, fwd, size, lift, spin)
    if a > l:                       # run along the longer side
        o, b, t, nn = L
        L = (o, t, -b, nn)
        a, l = l, a
    c = 0.14 * a
    _housing(mb, L, a, l, 0.5 * h, body, c)
    ai, li = a - 2 * c, l - 2 * c
    k = segs or max(2, min(16, int(round(li / max(1e-6, ai * 1.6)))))
    g = min(ai * 0.35, li / k * 0.3)
    sl = (li - (k + 1) * g) / k
    sa = ai * 0.82
    for i in range(k):
        cy = -li / 2 + g + sl / 2 + i * (sl + g)
        e = min(sa, sl) * 0.18
        mb.loft([_ring(L, _rect(sa, sl, 0, cy), 0.34 * h), _ring(L, _rect(sa - 2 * e, sl - 2 * e, 0, cy), h)], mat,
                cap0=False)


def lamp_row(mb, p0, p1, n, pitch, size, mat, body=None, R=None, dropout=0.0, lens='pill'):
    """Row of discrete lamp units in housings along p0 -> p1 (same sites / RNG use as a row of obox lights)."""
    p0, p1, n = Vector(p0), Vector(p1), Vector(n).normalized()
    d = p1 - p0
    Ln = d.length
    if Ln < 1e-3:
        return
    f = d / Ln
    k = max(1, int(Ln / pitch))
    for i in range(k + 1):
        if R and R.random() < dropout:
            continue
        lamp_fixture(mb, p0 + f * (Ln * i / k), n, size, mat, body, fwd=f, lift=0.0, lens=lens)


def chevron_light(mb, pos, n, size, mat, body=None, fwd=Vector((0, -1, 0)), lift=None, spin=0.0):
    """Direction marker: armoured base plate carrying a raised chevron (arrow) lens pointing along +fwd."""
    a, l, h = size
    body = _mat_or(body, DARK_MATS)
    L = _fx(pos, n, fwd, size, lift, spin)
    c = 0.1 * min(a, l)
    _housing(mb, L, a, l, 0.45 * h, body, c)
    A, B = a - 2 * c, l - 2 * c
    th = 0.3 * B
    ch = [(0, 0.46 * B), (0.46 * A, 0.46 * B - 0.5 * B), (0.46 * A, 0.46 * B - 0.5 * B - th),
          (0, 0.46 * B - th), (-0.46 * A, 0.46 * B - 0.5 * B - th), (-0.46 * A, 0.46 * B - 0.5 * B)]
    ch = ch[::-1]                  # CCW
    mb.loft([_ring(L, ch, 0.3 * h), _ring(L, ch, h)], mat, cap0=False)


def window_bay(mb, pos, n, size, mat='window', frame_mat=None, fwd=Vector((0, -1, 0)), lift=None, lit=True,
               panes=None, rows=1, dark_mat=None, dark_prob=0.1, blind_prob=0.16, border=None, depth=0.62,
               spin=0.0):
    """Recessed window bay: dark bezel frame, panes set back inside (depth = fraction of the height), mullions
    dividing the long side into panes (+ a transom when rows=2); hashed dark panes and half-drawn blinds.
    lit=False gives a closed/dark bay.  Also used for light panels (dark_prob=blind_prob=0, rows/panes grid)."""
    a, l, h = size
    frame_mat = _mat_or(frame_mat, DARK_MATS)
    dark_mat = _mat_or(dark_mat, ('glass',) + DARK_MATS)
    L = _fx(pos, n, fwd, size, lift, spin)
    if a > l:
        o, b, t, nn = L
        L = (o, t, -b, nn)
        a, l = l, a
    f = border if border is not None else 0.16 * a
    ai, li = a - 2 * f, l - 2 * f
    zp = h * (1.0 - depth)
    # bezel: outer wall -> top lip -> inner reveal down to the pane plane (open where the panes sit)
    mb.loft([_ring(L, _rect(a, l), 0.0), _ring(L, _rect(a, l), h), _ring(L, _rect(ai, li), h),
             _ring(L, _rect(ai, li), zp)], frame_mat, cap0=False, cap1=False)
    k = panes or max(1, min(12, int(round(li / max(1e-6, ai * 1.3 / rows)))))
    m = f * 0.55
    pl = (li - (k - 1) * m) / k
    pa = (ai - (rows - 1) * m) / rows
    zm = zp + (h - zp) * 0.7
    for i in range(k - 1):          # mullions: bevelled ridges across the opening (ends hidden in the reveal)
        cy = -li / 2 + pl + m / 2 + i * (pl + m)
        prof = [(cy - m / 2, zp), (cy - m * 0.35, zm), (cy + m * 0.35, zm), (cy + m / 2, zp)]
        mb.loft([[_w(L, x, y, z) for y, z in prof] for x in (-ai / 2, ai / 2)], frame_mat, cap0=False, cap1=False,
                closed=False)
    for j in range(rows - 1):       # transoms (a touch lower than the mullions: no coplanar tops)
        cx = -ai / 2 + pa + m / 2 + j * (pa + m)
        zt = zp + (zm - zp) * 0.85
        prof = [(cx - m / 2, zp), (cx - m * 0.35, zt), (cx + m * 0.35, zt), (cx + m / 2, zp)]
        mb.loft([[_w(L, x, y, z) for x, z in prof] for y in (li / 2, -li / 2)], frame_mat, cap0=False, cap1=False,
                closed=False)
    for i in range(k):
        cy = -li / 2 + pl / 2 + i * (pl + m)
        for j in range(rows):
            cx = -ai / 2 + pa / 2 + j * (pa + m)
            ctr = _w(L, cx, cy, zp)
            r = _hash(ctr)
            quad = _ring(L, _rect(pa, pl, cx, cy), zp)
            if not lit or r < dark_prob:
                _face(mb, quad, dark_mat)
                continue
            _face(mb, quad, mat)
            if r > 1.0 - blind_prob:    # half-drawn blind: dark slab over part of the pane, just above the glass
                fr = 0.3 + 0.4 * _hash(ctr, 1)
                bx0 = cx + pa / 2 - pa * fr / 2
                _face(mb, _ring(L, _rect(pa * fr, pl * 0.96, bx0, cy), zp + (h - zp) * 0.12), dark_mat)


def light_panel(mb, pos, n, size, mat, frame_mat=None, fwd=Vector((0, -1, 0)), lift=None, grid=(1, 3), depth=0.5):
    """Recessed luminaire / lit panel: bezel frame with a diffuser divided into a grid of cells (no blinds)."""
    window_bay(mb, pos, n, size, mat, frame_mat, fwd=fwd, lift=lift, panes=grid[1], rows=grid[0], dark_prob=0.0,
               blind_prob=0.0, depth=depth)


def louvre_glow(mb, pos, n, size, glow, slat=None, frame_mat=None, fwd=Vector((0, -1, 0)), lift=None, pitch=None,
                ang=45.0, chord=1.0, spin=0.0):
    """Heat / exhaust vent: framed recess with the glow on its floor, seen only between angled dark slats."""
    a, l, h = size
    slat = _mat_or(slat, DARK_MATS)
    frame_mat = _mat_or(frame_mat, TRIM_MATS)
    L = _fx(pos, n, fwd, size, lift, spin)
    f = 0.12 * min(a, l)
    ai, li = a - 2 * f, l - 2 * f
    zf = 0.12 * h
    mb.loft([_ring(L, _rect(a, l), 0.0), _ring(L, _rect(a, l), h), _ring(L, _rect(ai, li), h),
             _ring(L, _rect(ai, li), zf)], frame_mat, cap0=False, cap1=False)
    _face(mb, _ring(L, _rect(ai, li), zf), glow)
    p = pitch or max(li / 14, min(ai * 0.5, li / 3))
    k = max(2, int(round(li / p)))
    p = li / k
    o, b, t, nn = L
    ca, sa = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    u = t * ca + nn * sa            # slat chord direction
    v = -t * sa + nn * ca           # slat thickness direction
    w2, e2 = p * chord / 2, p * 0.07
    zc = zf + (h - zf) * 0.5
    zc = min(zc, h - w2 * sa - e2)
    for i in range(k):
        c = _w(L, 0, -li / 2 + p * (i + 0.5), zc)
        q = [c + b * (sx * ai / 2) + u * (su * w2) - v * e2 for sx, su in ((1, -1), (-1, -1), (-1, 1), (1, 1))]
        mb.hexa(q + [x + v * (2 * e2) for x in q], slat)


def beacon(mb, pos, n, r, mat, body=None, trim=None, cage=True, fwd=Vector((0, -1, 0))):
    """Beacon / nav light: armoured base, trim collar, domed lens and a guard cage (2 crossed straps)."""
    body = _mat_or(body, DARK_MATS)
    trim = _mat_or(trim, TRIM_MATS)
    L = _fx(pos, n, fwd, (r, r, 0.0), 0.0)
    o, b, t, nn = L
    p = Vector(pos)
    mb.cyl(p - nn * 0.25 * r, p + nn * 0.32 * r, 1.3 * r, 1.18 * r, body, seg=8)
    mb.cyl(p + nn * 0.3 * r, p + nn * 0.46 * r, 1.08 * r, 1.04 * r, trim, seg=8)
    seg = 8
    circ = lambda rr, z: [_w(L, math.cos(i / seg * 2 * math.pi) * rr, math.sin(i / seg * 2 * math.pi) * rr, z)
                          for i in range(seg)]
    z0 = 0.44 * r
    mb.loft([circ(0.9 * r, z0), circ(0.84 * r, z0 + 0.42 * r), circ(0.5 * r, z0 + 0.8 * r),
             _w(L, 0, 0, z0 + 0.92 * r)], mat)
    if cage:
        for ang in (0.25 * math.pi, 0.75 * math.pi):
            d = b * math.cos(ang) + t * math.sin(ang)
            e = nn.cross(d).normalized() * 0.06 * r
            prof = [(-1.0, 0.0), (-0.62, 0.95), (0.62, 0.95), (1.0, 0.0)]
            pts = [p + nn * z0 + d * (x * r * 0.98) + nn * (y * r * 0.98) for x, y in prof]
            for a_, b_ in zip(pts, pts[1:]):
                mb.hexa([a_ - e, b_ - e, b_ + e, a_ + e,
                         a_ - e + (a_ - p - nn * z0).normalized() * 0.08 * r,
                         b_ - e + (b_ - p - nn * z0).normalized() * 0.08 * r,
                         b_ + e + (b_ - p - nn * z0).normalized() * 0.08 * r,
                         a_ + e + (a_ - p - nn * z0).normalized() * 0.08 * r], trim)


def plate_hull(mb, hull, s0, s1, R, lmin, lmax, mats, per_edge=2, edges=None, off=0.0, thick=0.8, gap_s=0.8,
               gap_p=0.03, skip=None, skip_prob=0.04, sub_prob=0.25, sub_mat=None, ch=None):
    n = hull.n
    edges = range(n) if edges is None else edges
    sc = cuts(s0, s1, R, lmin, lmax)
    for e in edges:
        pc = [e + k / per_edge for k in range(per_edge + 1)]
        armor(mb, hull, sc, pc, mats, R, off=off, thick=thick, gap_s=gap_s, gap_p=gap_p, skip=skip,
              skip_prob=skip_prob, sub_prob=sub_prob, sub_mat=sub_mat, ch=ch)
        if R.random() < 0.5:  # re-cut s for the next edge so seams stagger
            sc = cuts(s0, s1, R, lmin, lmax)


def cowl(mb, hull, s0, s1, t, mat):
    """Hollow shroud following the hull profile between s0 and s1 (wall thickness t)."""
    def ring(s, off):
        Q, c = hull.poly(s, off)
        return [hull._w(s, q, c) for q in Q]
    mb.loft([ring(s0, 0), ring(s1, 0), ring(s1, -t), ring(s0, -t)], mat, wrap=True)


# ------------------------------------------------------------------ mechanical details
def deep_nozzle(mb, p, d, r, mat_body, mat_inner, mat_glow, depth=1.4, flare=1.12, seg=24, ribs=True):
    """Deep engine bell: outer shell + long inner cone + glowing core disk at the bottom."""
    p, d = Vector(p), Vector(d).normalized()
    q = d.to_track_quat('Z', 'Y' if abs(d.y) < 0.99 else 'X').to_matrix()
    L = r * depth

    def ring(rr, z):
        return [p + q @ Vector((math.cos(a) * rr, math.sin(a) * rr, z)) for a in
                [i / seg * 2 * math.pi for i in range(seg)]]
    rim = r * flare
    mb.loft([ring(r * 1.02, -0.2 * r), ring(rim * 1.04, L), ring(rim * 0.9, L)], mat_body, cap0=True, cap1=False)
    mb.loft([ring(rim * 0.9, L), ring(r * 0.8, L * 0.55), ring(r * 0.52, L * 0.08)], mat_inner, cap0=False,
            cap1=False)
    mb.cyl(p + d * (L * 0.04), p + d * (L * 0.1), r * 0.54, r * 0.54, mat_glow, seg=seg)
    # central plug / spike (makes the bell read as deep)
    mb.cyl(p + d * (L * 0.08), p + d * (L * 0.34), r * 0.2, r * 0.07, mat_inner, seg=12)
    if ribs:
        for k in range(3):
            z = L * (0.25 + 0.25 * k)
            mb.loft([ring(r * (1.05 + 0.05 * k), z), ring(r * (1.12 + 0.05 * k), z), ring(r * (1.12 + 0.05 * k),
                     z + r * 0.12), ring(r * (1.05 + 0.05 * k), z + r * 0.12)], mat_body, wrap=True)


def turret(mb, pos, n, size, m_base, m_house, m_barrel, barrels=2, fwd=Vector((0, -1, 0)), blen=2.2, yaw=0.0):
    b, t, nn = frame(n, fwd)
    if yaw:
        c, s_ = math.cos(yaw), math.sin(yaw)
        b, t = b * c + t * s_, t * c - b * s_
    pos = Vector(pos)
    mb.cyl(pos - nn * size * 0.2, pos + nn * size * 0.3, size * 0.75, size * 0.7, m_base, seg=16)
    # wedge housing
    hw, hl, hh = size * 0.6, size * 0.75, size * 0.45
    c0 = pos + nn * size * 0.3
    pts = [c0 - b * hw + t * hl * 0.7, c0 + b * hw + t * hl * 0.7, c0 + b * hw - t * hl, c0 - b * hw - t * hl]
    top = [c0 + nn * hh - b * hw * 0.8 + t * hl * 0.35, c0 + nn * hh + b * hw * 0.8 + t * hl * 0.35,
           c0 + nn * hh * 0.8 + b * hw * 0.75 - t * hl * 0.8, c0 + nn * hh * 0.8 - b * hw * 0.75 - t * hl * 0.8]
    mb.hexa(pts + top, m_house, bevel=size * 0.04)
    for k in range(barrels):
        off = (k - (barrels - 1) / 2) * size * 0.32
        a = c0 + nn * hh * 0.45 + b * off + t * hl * 0.6
        mb.cyl(a, a + t * size * blen, size * 0.08, size * 0.065, m_barrel, seg=8)
        mb.cyl(a + t * size * (blen - 0.25), a + t * size * blen, size * 0.1, size * 0.1, m_barrel, seg=8)


def fins(mb, base, along, n, count, pitch, h, L, thick, mat, taper=0.6):
    """Radiator fin bank standing on a surface: fins spaced along `along`, height h along n, length L."""
    base, along, n = Vector(base), Vector(along).normalized(), Vector(n).normalized()
    t = n.cross(along).normalized()
    for k in range(count):
        c = base + along * (k * pitch)
        p = [c - along * thick / 2 - t * L / 2, c + along * thick / 2 - t * L / 2,
             c + along * thick / 2 + t * L / 2, c - along * thick / 2 + t * L / 2]
        q = [c + n * h - along * thick / 2 - t * L * taper / 2, c + n * h + along * thick / 2 - t * L * taper / 2,
             c + n * h + along * thick / 2 + t * L * taper / 2, c + n * h - along * thick / 2 + t * L * taper / 2]
        mb.hexa(p + q, mat)


def spine(mb, p0, p1, r, mat, nodes=4, node_mat=None, dish=False):
    p0, p1 = Vector(p0), Vector(p1)
    mb.cyl(p0, p1, r, r * 0.6, mat, seg=8)
    d = (p1 - p0)
    for k in range(1, nodes + 1):
        c = p0 + d * (k / (nodes + 1))
        mb.cyl(c - d.normalized() * r * 2, c + d.normalized() * r * 2, r * 2.2, r * 2.2, node_mat or mat, seg=8)
        side = d.normalized().cross(Vector((0, 0, 1)))
        if side.length < 0.1:
            side = Vector((1, 0, 0))
        side.normalize()
        mb.cyl(c, c + side * r * (10 - k * 1.5), r * 0.4, r * 0.3, mat, seg=5)
    mb.sphere(p1, r * 1.6, node_mat or mat, seg=10, rings=5)
    if dish:
        mb.cyl(p1, p1 + Vector((0, 0, r * 1.5)), r * 5, r * 1.5, node_mat or mat, seg=16)


# 7-segment digits: segments a b c d e f g
SEG = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc',
       '8': 'abcdefg', '9': 'abcdfg'}


def digits(mb, hull, text, s_start, p, height, mat, off=0.95, thick=0.25, spacing=None):
    """7-segment hull numbers laid on the hull surface, reading along -s (nose direction)."""
    w = height * 0.55
    sw = height * 0.14
    spacing = spacing or w * 1.5
    n0 = hull.pt(s_start, p, off)[1]
    dirn = -1 if n0.x > 0 else 1   # keep glyphs readable from outside on either flank
    for k, ch in enumerate(text):
        s0 = s_start + dirn * k * spacing
        pc, n = hull.pt(s0, p, off)
        up = Vector((0, 0, 1)) - n * n.z
        up = up.normalized() if up.length > 0.1 else Vector((0, 1, 0))
        rt = Vector((0, -dirn, 0))
        segs = {'a': (0, 1, True), 'g': (0, 0, True), 'd': (0, -1, True),
                'f': (-1, 0.5, False), 'b': (1, 0.5, False), 'e': (-1, -0.5, False), 'c': (1, -0.5, False)}
        for sname in SEG.get(ch, ''):
            x, y, horiz = segs[sname]
            c = pc + rt * (x * w / 2) + up * (y * height / 2)
            size = (w, sw, thick) if horiz else (sw, height / 2, thick)
            b = rt
            M = Matrix(((b.x * size[0], up.x * size[1], n.x * size[2], c.x),
                        (b.y * size[0], up.y * size[1], n.y * size[2], c.y),
                        (b.z * size[0], up.z * size[1], n.z * size[2], c.z), (0, 0, 0, 1)))
            r = bmesh.ops.create_cube(mb.bm, size=1.0, matrix=M)
            mb._fin(mb._faces_of(r['verts']), mat)


# ------------------------------------------------------------------ booleans / joining
def cutter_box(center, size, mat, rot=(0, 0, 0)):
    mb = MB()
    mb.box(center, size, mat, rot=rot)
    o = mb.to_object('_cut', smooth_angle=10)
    return o


def boolean_diff(obj, cutters):
    for c in cutters:
        m = obj.modifiers.new('bool', 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.object = c
        m.solver = 'EXACT'
        try:
            m.material_mode = 'TRANSFER'
        except Exception:
            pass
        c.hide_render = True
        c.hide_set(True)
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for c in cutters:
        me = c.data
        bpy.data.objects.remove(c, do_unlink=True)
        bpy.data.meshes.remove(me)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = objs[0]
    o.name = name
    o.data.name = name
    # merge duplicate material slots by name
    me = o.data
    names = [m.name.split('.')[0] if m else None for m in me.materials]
    uniq = []
    for nm in names:
        if nm not in uniq:
            uniq.append(nm)
    if len(uniq) != len(names):
        remap = [uniq.index(nm) for nm in names]
        idx = [0] * len(me.polygons)
        me.polygons.foreach_get('material_index', idx)
        idx = [remap[i] for i in idx]
        me.materials.clear()
        for nm in uniq:
            me.materials.append(bpy.data.materials[nm])
        me.polygons.foreach_set('material_index', idx)
    me.set_sharp_from_angle(angle=24 * D2R)
    return o
