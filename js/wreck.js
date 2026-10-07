// The dreadnought's wreck, baked (2026-10-06): its hull comes pre-broken (assets/dreadnought_chunks.glb, 32 chunks —
// tools/make_dread_chunks.py) and the chunks' flight is simulated ONCE, the first time it is needed, with rigid bodies
// that knock into each other (each chunk a short row of spheres along its long axis; impulses with restitution and
// friction, so a hit sets a piece spinning). Every frame then only reads the cached track: one entry draws all the
// chunks (partXf per chunk), where the old shatter drew the whole hull 36 times, each clipped to its box.
import { M, hash } from './math.js';
import { DREAD_CHUNKS } from './dread_chunks.js';

const DT = 1 / 48, SUB = 4;          // the cached step (and physics substeps inside it)
const REST = 0.35, FRIC = 0.25;      // restitution, friction of a chunk hitting a chunk

/** bake the flight: returns { n, steps, track: Float32Array(steps*n*7) [x y z qx qy qz qw], chunks, endV, endW }
 *  chunks: [{ name, c, lo, hi }] (model units; × scale) — DREAD_CHUNKS, ION_FRIGATE_CHUNKS, or boxChunks() for a model
 *  drawn clipped; spin: × the tumble rate; after `dur` wreckPose carries each piece on with its last velocity and spin */
export function bakeWreck(scale, dur, seed = 77, speed = 0.7, chunks = DREAD_CHUNKS, spin = 1, sub = SUB) {
  const C = chunks, n = C.length;
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const c of C) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], (c.c[k] + c.lo[k]) * scale); hi[k] = Math.max(hi[k], (c.c[k] + c.hi[k]) * scale); }
  const size = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const B = C.map((c, i) => {
    const s = seed * 7.31 + i * 3.17;
    const ext = [0, 1, 2].map((k) => (c.hi[k] - c.lo[k]) * scale), mid = [0, 1, 2].map((k) => (c.hi[k] + c.lo[k]) * 0.5 * scale);
    const ax = ext.indexOf(Math.max(...ext)), thick = Math.max(1, [...ext].sort((a, b) => a - b)[1]);
    const r = thick * 0.5, ns = Math.min(5, Math.max(1, Math.round(ext[ax] / thick)));   // spheres along the long axis
    const sph = [];
    for (let j = 0; j < ns; j++) { const p = mid.slice(); p[ax] += ns > 1 ? (j / (ns - 1) - 0.5) * (ext[ax] - thick) : 0; sph.push(p); }
    const m = Math.max(1, ext[0] * ext[1] * ext[2] * 0.3);
    const Ib = [m * (ext[1] ** 2 + ext[2] ** 2) / 12, m * (ext[0] ** 2 + ext[2] ** 2) / 12, m * (ext[0] ** 2 + ext[1] ** 2) / 12];
    const x = c.c.map((v) => v * scale);
    // away from the break point, as the old shatter threw them: jittered, slower along the length
    const d = [x[0] + (hash(s) - 0.5) * size * 0.3, x[1] + (hash(s + 1) - 0.5) * size * 0.3, x[2] * 0.6], dl = Math.hypot(...d) || 1;
    const vm = size * (0.06 + hash(s + 2) * 0.1) * speed;
    return { x, q: [0, 0, 0, 1], v: d.map((u) => u / dl * vm), w: [(hash(s + 3) - 0.5) * 0.5 * speed * spin, (hash(s + 4) - 0.5) * 0.4 * speed * spin, (hash(s + 5) - 0.5) * 0.6 * speed * spin],
      sph, r, R: Math.hypot(...ext) * 0.5 + r, im: 1 / m, Ib: Ib.map((v) => 1 / v), rot: new Float32Array(9) };
  });
  const steps = Math.ceil(dur / DT) + 1, track = new Float32Array(steps * n * 7);
  const allow = new Float32Array(n * n);   // pieces that start out interlocked may only drift apart: their first overlap is let be
  let first = true, hits = 0;
  const rotOf = (b) => { const [x, y, z, w] = b.q, R = b.rot;
    R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - z * w); R[2] = 2 * (x * z + y * w);
    R[3] = 2 * (x * y + z * w); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - x * w);
    R[6] = 2 * (x * z - y * w); R[7] = 2 * (y * z + x * w); R[8] = 1 - 2 * (x * x + y * y); };
  const mv = (R, p) => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
  const mtv = (R, p) => [R[0] * p[0] + R[3] * p[1] + R[6] * p[2], R[1] * p[0] + R[4] * p[1] + R[7] * p[2], R[2] * p[0] + R[5] * p[1] + R[8] * p[2]];
  const invI = (b, v) => { const l = mtv(b.rot, v); return mv(b.rot, [l[0] * b.Ib[0], l[1] * b.Ib[1], l[2] * b.Ib[2]]); };   // world inverse inertia
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const h = DT / sub;
  for (let st = 0; st < steps; st++) {
    for (let i = 0; i < n; i++) { const b = B[i], o = (st * n + i) * 7; track.set(b.x, o); track.set(b.q, o + 3); }
    for (let si = 0; si < sub; si++) {
      for (const b of B) rotOf(b);
      const W = B.map((b) => b.sph.map((p) => { const q = mv(b.rot, p); return [b.x[0] + q[0], b.x[1] + q[1], b.x[2] + q[2]]; }));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const A = B[i], Bj = B[j];
        if (Math.hypot(A.x[0] - Bj.x[0], A.x[1] - Bj.x[1], A.x[2] - Bj.x[2]) > A.R + Bj.R) { allow[i * n + j] = 0; continue; }
        let best = 0, bn = null, bp = null;   // the deepest sphere contact between the two
        for (const pa of W[i]) for (const pb of W[j]) {
          const dx = pb[0] - pa[0], dy = pb[1] - pa[1], dz = pb[2] - pa[2], dd = Math.hypot(dx, dy, dz), pen = A.r + Bj.r - dd;
          if (pen > best && dd > 1e-6) { best = pen; bn = [dx / dd, dy / dd, dz / dd]; bp = [pa[0] + bn[0] * A.r, pa[1] + bn[1] * A.r, pa[2] + bn[2] * A.r]; }
        }
        if (first) allow[i * n + j] = best;
        const pen = best - allow[i * n + j];
        allow[i * n + j] = Math.min(allow[i * n + j], best);
        if (pen <= 0 || !bn) continue;
        const ra = [bp[0] - A.x[0], bp[1] - A.x[1], bp[2] - A.x[2]], rb = [bp[0] - Bj.x[0], bp[1] - Bj.x[1], bp[2] - Bj.x[2]];
        const va = cross(A.w, ra), vb = cross(Bj.w, rb);
        const rv = [Bj.v[0] + vb[0] - A.v[0] - va[0], Bj.v[1] + vb[1] - A.v[1] - va[1], Bj.v[2] + vb[2] - A.v[2] - va[2]];
        const vn = dot(rv, bn);
        const kOf = (dir) => A.im + Bj.im + dot(dir, cross(invI(A, cross(ra, dir)), ra)) + dot(dir, cross(invI(Bj, cross(rb, dir)), rb));
        let J = [0, 0, 0];
        if (vn < 0) {
          const jn = -(1 + REST) * vn / kOf(bn); hits++;
          const vt = [rv[0] - bn[0] * vn, rv[1] - bn[1] * vn, rv[2] - bn[2] * vn], vtl = Math.hypot(...vt);
          J = bn.map((u) => u * jn);
          if (vtl > 1e-5) { const tdir = vt.map((u) => u / vtl), jt = Math.min(vtl / kOf(tdir), FRIC * jn); J = J.map((u, k) => u - tdir[k] * jt); }
        }
        for (let k = 0; k < 3; k++) { A.v[k] -= J[k] * A.im; Bj.v[k] += J[k] * Bj.im; }
        const wa = invI(A, cross(ra, J)), wb = invI(Bj, cross(rb, J));
        for (let k = 0; k < 3; k++) { A.w[k] -= wa[k]; Bj.w[k] += wb[k]; }
        const corr = pen * 0.4 / (A.im + Bj.im);   // push the overlap apart (by mass)
        for (let k = 0; k < 3; k++) { A.x[k] -= bn[k] * corr * A.im; Bj.x[k] += bn[k] * corr * Bj.im; }
      }
      first = false;
      for (const b of B) {
        const dmp = 1 - 0.02 * h;   // (the old flight slowed a little over time)
        for (let k = 0; k < 3; k++) { b.v[k] *= dmp; b.x[k] += b.v[k] * h; }
        const [wx, wy, wz] = b.w, [qx, qy, qz, qw] = b.q, s = 0.5 * h;
        b.q = [qx + s * (wx * qw + wy * qz - wz * qy), qy + s * (wy * qw + wz * qx - wx * qz), qz + s * (wz * qw + wx * qy - wy * qx), qw - s * (wx * qx + wy * qy + wz * qz)];
        const ql = Math.hypot(...b.q); b.q = b.q.map((u) => u / ql);
      }
    }
  }
  return { n, steps, track, chunks: C, hits, dur: (steps - 1) * DT, endV: B.map((b) => b.v.slice()), endW: B.map((b) => b.w.slice()) };
}
/** box cells of a model's bounds (uneven, like fx.js shatter) as chunks — for models drawn clipped to each cell (no split
 *  copy of the file: the third-party fighters' licences don't allow modified copies) */
export function boxChunks(bounds, grid, seed) {
  const mn = bounds.min, mx = bounds.max, out = [];
  const cut = (i, n, a, c, o) => i <= 0 ? a : i >= n ? c : a + (c - a) * (i / n + (hash(seed * 7.31 + o * 13 + i * 5.1) - 0.5) * 0.55 / n);
  for (let ix = 0; ix < grid[0]; ix++) for (let iy = 0; iy < grid[1]; iy++) for (let iz = 0; iz < grid[2]; iz++) {
    const lo = [cut(ix, grid[0], mn[0], mx[0], 1), cut(iy, grid[1], mn[1], mx[1], 2), cut(iz, grid[2], mn[2], mx[2], 3)];
    const hi = [cut(ix + 1, grid[0], mn[0], mx[0], 1), cut(iy + 1, grid[1], mn[1], mx[1], 2), cut(iz + 1, grid[2], mn[2], mx[2], 3)];
    const c = lo.map((v, k) => (v + hi[k]) / 2);
    out.push({ name: 'b' + out.length, c, lo: lo.map((v, k) => v - c[k]), hi: hi.map((v, k) => v - c[k]), box: [...lo, ...hi] });
  }
  return out;
}

const _q = [0, 0, 0, 1];
/** the chunk transforms at time lt (seconds after the break) into xf[name] (Float32Array 16, model space) */
export function wreckPose(bake, lt, xf) {
  const f = Math.max(0, Math.min(bake.steps - 1.001, lt / DT)), s0 = Math.floor(f), a = f - s0, { n, track } = bake;
  const over = Math.max(0, lt - (bake.dur || 1e9));   // (past the baked window: carried on with its last velocity and spin)
  for (let i = 0; i < n; i++) {
    const o0 = (s0 * n + i) * 7, o1 = o0 + n * 7;
    const p = [0, 1, 2].map((k) => track[o0 + k] + (track[o1 + k] - track[o0 + k]) * a);
    let d = 0; for (let k = 0; k < 4; k++) d += track[o0 + 3 + k] * track[o1 + 3 + k];
    const sg = d < 0 ? -1 : 1;
    for (let k = 0; k < 4; k++) _q[k] = track[o0 + 3 + k] + (sg * track[o1 + 3 + k] - track[o0 + 3 + k]) * a;
    const l = Math.hypot(..._q); for (let k = 0; k < 4; k++) _q[k] /= l;
    if (over > 0 && bake.endV) {
      const v = bake.endV[i], w = bake.endW[i], wl = Math.hypot(...w);
      for (let k = 0; k < 3; k++) p[k] += v[k] * over;
      if (wl > 1e-6) { const h = wl * over * 0.5, sn = Math.sin(h) / wl, dq = [w[0] * sn, w[1] * sn, w[2] * sn, Math.cos(h)], q0 = _q.slice();
        _q[0] = dq[3] * q0[0] + dq[0] * q0[3] + dq[1] * q0[2] - dq[2] * q0[1]; _q[1] = dq[3] * q0[1] - dq[0] * q0[2] + dq[1] * q0[3] + dq[2] * q0[0];
        _q[2] = dq[3] * q0[2] + dq[0] * q0[1] - dq[1] * q0[0] + dq[2] * q0[3]; _q[3] = dq[3] * q0[3] - dq[0] * q0[0] - dq[1] * q0[1] - dq[2] * q0[2]; }
    }
    const name = bake.chunks[i].name;
    M.fromTRS(xf[name] || (xf[name] = new Float32Array(16)), p, _q, 1);
  }
  return xf;
}
