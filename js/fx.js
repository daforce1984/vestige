// Deterministic effect generators: everything is a pure function of film time, so seeking works.
import { M, V, Q, hash, sat, easeOut, smooth, lerp } from './math.js';

const tmp = [0, 0, 0], tmp2 = [0, 0, 0], tmp3 = [0, 0, 0];

export function randDir(out, seed) {
  const u = hash(seed) * 2 - 1, th = hash(seed + 17.3) * Math.PI * 2, s = Math.sqrt(1 - u * u);
  out[0] = s * Math.cos(th); out[1] = u; out[2] = s * Math.sin(th);
  return out;
}

/**
 * Explosion at pos, size ~ radius of the object. kind: 'small' | 'ship' | 'huge'
 * Returns true while active.
 */
const _chunkHidden = {};
function chunkHidden(R, keep) {
  if (_chunkHidden[keep]) return _chunkHidden[keep];
  const h = {};
  for (const p of R.models.debris.parts) if (p.name !== keep && p.name !== '__root') h[p.name] = 1;
  return (_chunkHidden[keep] = h);
}
const _cm = new Float32Array(16), _cq = [0, 0, 0, 1];

export function explosion(R, t, t0, pos, size, seed, kind = 'ship') {
  // homeland/fx.js explosion(): light first (white HDR core layers), a soft wash, three wavefronts,
  // three offset cauliflower fireballs, burning hull fragments. Almost no smoke (vacuum).
  const TS = kind === 'huge' ? 3.2 : kind === 'small' ? 1.0 : 1.8;   // film time-stretch
  const lt = (t - t0) / TS;
  const END = 1.6;
  if (lt < 0 || lt > END + (kind === 'huge' ? 1.2 : 0)) return false;
  const glowL = (sz, life, grow, col, mul, halo = 0.3) => {
    if (lt > life) return;
    const k = 1 - lt / life;
    R.glow(pos, sz * (1 + (grow - 1) * (lt / life)), [col[0] * mul * k, col[1] * mul * k, col[2] * mul * k], halo);
  };
  const warm = [1, 0.82, 0.63];
  glowL(size * 2.2, 0.35, 1.6, warm, 0.03, 0.5);          // wash
  glowL(size * 0.8, 0.22, 1.3, [1, 1, 1], 0.8);           // flash (spread over ~5 frames: no single-frame pop)
  glowL(size * 1.2, 0.14, 1.2, warm, 0.6);
  glowL(size * 0.45, 0.22, 1.15, [1, 1, 1], 1.8, 0.1);      // white-hot core
  glowL(size * 0.9, 0.35, 1.5, [1, 0.8, 0.55], 0.3, 0.1);
  
  R.light(pos, size * 16, [1, 0.7, 0.4], 45 * Math.exp(-lt * 5) + 4 * Math.max(0, 1 - lt / END));
  // wavefronts (refractive ripples)
  for (const [rr, life, del, c] of [[7.5, 0.34, 0.015, [1, 1, 1]], [12, 0.7, 0.06, warm], [17, 1.15, 0.16, [1, 0.54, 0.25]]]) {
    const a = (lt - del) / life;
    if (a < 0 || a > 1) continue;
    R.ripple(pos, size * rr * 0.22 * (0.06 + 0.94 * easeOut(a)), [c[0] * 0.25, c[1] * 0.25, c[2] * 0.25], (1 - a) * 1.2);
  }
  // fireball clusters: a main ball + satellite balls + delayed secondary blasts (chain reaction)
  const nb = kind === 'huge' ? 16 : kind === 'small' ? 4 : 9;
  for (let i = 0; i < nb; i++) {
    const s0 = seed * 31.7 + i * 7.77;
    const secondary = i >= (kind === 'small' ? 3 : 4);
    const del = secondary ? 0.12 + hash(s0 + 8) * (kind === 'huge' ? 1.6 : 0.9) : i * 0.04;
    const life = (0.55 + hash(s0 + 9) * 0.5) * (secondary ? 0.8 : 1) * (kind === 'huge' ? 1.5 : 1);
    const a = (lt - del) / life;
    if (a < 0 || a > 1) continue;
    randDir(tmp, s0);
    const off = secondary ? size * (0.5 + hash(s0 + 1) * 0.9) : size * 0.35 * hash(s0 + 1) * (i ? 1 : 0);
    V.madd(tmp2, pos, tmp, off + size * 0.35 * a);
    const base = secondary ? 0.45 + hash(s0 + 2) * 0.4 : (i === 0 ? 1.25 : 0.7 + hash(s0 + 2) * 0.4);
    const sz = size * base * 0.55 * (0.45 + 1.25 * easeOut(Math.min(1, a * 1.8)));
    R.fire(tmp2, sz, a, hash(s0 + 3) * 50 + i, [1, 1, 1], secondary ? 0.8 : (i === 0 ? 1.0 : 0.85));
    if (secondary && a < 0.15) R.glow(tmp2, sz * 0.8, [1.6 * (1 - a / 0.15), 1.1 * (1 - a / 0.15), 0.6 * (1 - a / 0.15)], 0.3);
  }
  // burning debris: arcing chunks trailing fire then smoke
  const nd = kind === 'huge' ? 14 : kind === 'small' ? 3 : 8;
  for (let i = 0; i < nd; i++) {
    const s0 = seed * 5.9 + i * 2.71;
    const life = 1.2 + hash(s0) * 1.6;
    if (lt > life) continue;
    randDir(tmp, s0 + 40);
    const sp = size * (1.2 + hash(s0 + 1) * 1.8);
    for (let k = 0; k < 7; k++) {                     // trail samples back along the path
      const tt = lt - k * 0.06;
      if (tt < 0) break;
      V.madd(tmp2, pos, tmp, sp * tt);
      const fk = 1 - k / 7;
      if (k < 3) R.fire(tmp2, size * 0.09 * fk * (1 - lt / life) + 0.4, 0.25 + k * 0.15, s0 + k, [1, 1, 1], 0.9 * fk);
      else R.smoke(tmp2, size * 0.1 * (1 + k * 0.3), 0.3 + k * 0.08, s0 + k, [0.05, 0.045, 0.04], 0.5 * fk * (1 - lt / life));
    }
  }
  // embers: slow, long-lived glowing specks drifting out
  const ne = kind === 'huge' ? 80 : kind === 'small' ? 12 : 40;
  for (let i = 0; i < ne; i++) {
    const s0 = seed * 3.3 + i * 1.91;
    const life = 1.5 + hash(s0) * 2.5;
    if (lt > life) continue;
    randDir(tmp, s0 + 60);
    V.madd(tmp2, pos, tmp, size * (0.4 + hash(s0 + 1) * 2.2) * Math.sqrt(lt / life) * 1.6);
    const tw = 0.5 + 0.5 * Math.sin(lt * (8 + hash(s0 + 2) * 20) + i);
    const k = (1 - lt / life) * tw;
    R.glow(tmp2, size * 0.015 + 0.25, [2.6 * k, 1.2 * k, 0.3 * k], 0.2);
  }
  // flickering fire light while it burns
  R.light(pos, size * 10, [1, 0.55, 0.25], 6 * Math.max(0, 1 - lt / END) * (0.75 + 0.25 * Math.sin(lt * 23)));
  // tumbling hull chunks
  if (false && kind !== 'small' && R.models.debris) {   // (removed: stock debris pieces that weren't part of the exploding model)
    const nc = kind === 'huge' ? 10 : 5;
    for (let i = 0; i < nc; i++) {
      const s0 = seed * 17.3 + i * 5.1;
      randDir(tmp, s0 + 90);
      V.madd(tmp2, pos, tmp, size * (0.6 + hash(s0) * 1.4) * lt * TS);
      Q.fromEuler(_cq, lt * (1 + hash(s0 + 1) * 3), lt * (hash(s0 + 2) * 2 - 1) * 2, lt * hash(s0 + 3) * 2);
      M.fromTRS(_cm, tmp2, _cq, size * 0.05 * (0.6 + hash(s0 + 4)));
      const e = R.add('debris', _cm);
      if (e) { e.hidden = chunkHidden(R, 'hull' + (i % 4)); e.damage = 0.35; e.seed = s0; }
    }
  }
  return true;
}

/** Hyperspace window (Homeworld style). center, facing dir (normal), size w,h, color, intensity */
export function hyperWindow(R, center, normal, w, h, col, intensity) {
  // homeland fx.hyperWindow: the window tears open along the ship's UP axis as a chain of refractive shock
  // rings (3 segments for fighters .. 11 for the mothership); nothing emits light.
  if (intensity <= 0.01) return;
  const size = Math.max(w, h) * 2.25;                    // ≈ ship length × 1.8
  const big = Math.min(1, size / 4000 * 6);
  const N = Math.max(3, Math.round(3 + big * 8));
  const up = Math.abs(normal[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const lifeK = 1 - intensity;                           // 0 just opened .. 1 closed
  for (let i = 0; i < N; i++) {
    const u = N === 1 ? 0 : i / (N - 1) - 0.5;
    const k = 1 - Math.abs(u) * 1.7;
    if (k <= 0.05) continue;
    V.madd(tmp, center, up, u * size * 0.9);
    const delay = i * 0.012 * (1 + big * 2);
    const a = sat((lifeK - delay) / (0.5 + k * 0.6));
    if (a >= 1) continue;
    R.ripple(tmp, size * (0.10 + k * 0.26) * (0.06 + 0.94 * easeOut(a)), [0, 0, 0], (1 - a) * 1.4);
  }
  if (big > 0.35) { const a = sat(lifeK / (1.6 * big)); R.ripple(center, size * (0.34 + big * 0.30) * (0.1 + 0.9 * easeOut(a)), [0, 0, 0], (1 - a) * 1.2); }
}

/** Engine glows for every entry of a model. col = glow colour, scale = size multiplier, throttle 0..1 */
const _pe = { m: new Float32Array(16), pose: null, stretch: 0 };
const _pn = [0, 0, 0], _pa = [0, 0, 0], _prev = [0, 0, 0];
/**
 * Thruster flames. opts.past(tau) -> { m, pose } gives the craft's state tau seconds ago: the exhaust is then
 * traced as gas emitted from where the nozzle WAS, flying straight back from where it pointed, so the plume bends
 * smoothly along the flight path when the craft turns. opts.particles adds drifting sparks/embers.
 */
export function engineGlows(R, name, entry, col, scale = 1, throttle = 1, trail = 1, opts = null) {
  // past states are expensive (full choreography evaluations): quantise tau to 1/48 s and share them between emitters
  if (opts && opts.past) {
    const raw = opts.past, memo = new Map();
    opts = { ...opts, past: (tau) => { const k = Math.round(tau * 48); let st = memo.get(k); if (!st) { st = raw(k / 48); memo.set(k, st); } return st; } };
  }
  const model = R.models[name];
  if (!model || throttle < 0.06) return;
  const pts = model.emitPoints.engine;
  if (!pts || !pts.length) return;
  if ((entry.stretch || 0) > 0.01) return;                   // mid-warp: the hull is stretched, no fire ahead of the ship
  const isShip = name !== 'gundam' && name !== 'enemy_ms';
  if (isShip) {                                              // ships: throttle follows the real speed (off when stopped)
    throttle *= shipSpeedK(R, name, entry, model);
    if (throttle < 0.03) {                                   // idle: the nozzles stay warm — a faint, slow glow pulse, no plume
      const time = R._time || R._now || 0;
      for (let i = 0; i < pts.length; i++) {
        const ep = pts[i];
        const pm = R.partWorld(name, entry, model.parts[ep.part].name);
        M.transformPoint(tmp, pm, ep.pos);
        const r = Math.max(ep.r, 0.3) * scale;
        const pk = 0.16 + 0.08 * Math.sin(time * 1.6 + i * 0.9 + (entry.seed || 0));   // ~0.25 Hz breathing, per-nozzle phase
        R.glow(tmp, r * 1.15, [col[0] * pk, col[1] * pk, col[2] * pk], 0.25);
      }
      return;
    }
  }
  const time = R._time || 0;
  for (let i = 0; i < pts.length; i++) {
    const ep = pts[i];
    const pname = model.parts[ep.part].name;
    const pm = R.partWorld(name, entry, pname);
    M.transformPoint(tmp, pm, ep.pos);
    const r = Math.max(ep.r, 0.3) * scale;
    const flick = 0.92 + Math.sin(time * 27 + i * 1.7) * 0.08;
    M.transformDir(tmp2, pm, [0, 0, -1]);
    V.norm(tmp2, tmp2);
    const len = r * (1.7 + throttle * 5.0) * Math.max(0.5, trail * 0.6);
    const k = throttle * flick;
    const c = [col[0] * k, col[1] * k, col[2] * k];
    if (opts && opts.past) {
      // curved plume: 8 samples of gas emitted over the last `span` seconds
      const N = 8, span = opts.span ?? 0.12;
      const v = len / span;
      V.copy(_prev, tmp);
      for (let s2 = 1; s2 <= N; s2++) {
        const tau = (s2 / N) * span;
        const st = opts.past(tau);
        _pe.m.set(st.m); _pe.pose = st.pose || null;
        const pmp = R.partWorld(name, _pe, pname);
        M.transformPoint(_pn, pmp, ep.pos);
        M.transformDir(_pa, pmp, [0, 0, -1]); V.norm(_pa, _pa);
        V.madd(_pn, _pn, _pa, v * tau);
        const f = 1 - s2 / (N + 1);
        const kb = f * f * 0.5 + (s2 <= 2 ? 0.35 * f : 0);           // cone: thick + bright near the nozzle, thin + faint at the end
        R.beam(_prev, _pn, r * (0.2 + 1.45 * Math.pow(f, 1.3)), [c[0] * kb, c[1] * kb, c[2] * kb], 0.9, 6, 0.6, 0.5);
        V.copy(_prev, _pn);
      }
      R.glow(tmp, r * 2.4, [c[0] * 1.1, c[1] * 1.1, c[2] * 1.1], 0.35);   // bright additive glow round the thick base
      if (isShip) crossPlume(R, tmp, tmp2, r, len * 0.6, c);
      else { R.flame(tmp, V.scale(tmp3, tmp2, len * 0.45), r * 1.7, c, 1.4, i * 3.1, 1); crossPlume(R, tmp, tmp2, r * 0.8, len * 0.8, c); }
      if (opts.particles) {
        // sparks / embers blown out of the nozzle, following the same emission history
        for (let p = 0; p < 14; p++) {
          const life = 0.25 + hash(p * 3.1 + i) * 0.35;
          const ph = ((time / life) + hash(p * 7.3 + i)) % 1;
          const tau = ph * life;
          const st = opts.past(Math.min(tau, 0.6));
          _pe.m.set(st.m); _pe.pose = st.pose || null;
          const pmp = R.partWorld(name, _pe, pname);
          M.transformPoint(_pn, pmp, ep.pos);
          M.transformDir(_pa, pmp, [0, 0, -1]); V.norm(_pa, _pa);
          const seed = p * 13.7 + i + Math.floor(time / life + hash(p * 7.3 + i)) * 3.3;
          const spread = randDir(tmp3, seed);
          const sp = v * (0.6 + hash(seed) * 0.6);
          V.madd(_pn, _pn, _pa, sp * tau);
          V.madd(_pn, _pn, spread, r * 6 * tau);
          const b = (1 - ph) * (1 - ph) * 2.2 * throttle;
          R.glow(_pn, r * (0.18 + 0.1 * hash(seed + 1)), [col[0] * b + b * 0.4, col[1] * b + b * 0.3, col[2] * b], 0.1);
        }
      }
      continue;
    }
    if (isShip) { crossPlume(R, tmp, tmp2, r, len, c); R.glow(tmp, r * 2.6, [c[0] * 1.1, c[1] * 1.1, c[2] * 1.1], 0.35); R.glow(V.madd(tmp3, tmp, tmp2, len * 0.15), r * 2.2, [c[0] * 0.5, c[1] * 0.5, c[2] * 0.5], 0.5); continue; }   // hot glow round the thick base
    V.scale(tmp3, tmp2, len);
    R.flame(tmp, tmp3, r * 1.7, c, 1.4, i * 3.1, 1);
    crossPlume(R, tmp, tmp2, r * 0.8, len * 1.1, c);                  // the same cone plume as the ships (hot, additive base)
    R.glow(tmp, r * 2.2, [c[0] * 0.9, c[1] * 0.9, c[2] * 0.9], 0.3);
  }
}
// two plume planes crossed along the thrust axis (reads as a volume from any angle), sized from the nozzle radius
const _pa1 = [0, 0, 0], _pa2 = [0, 0, 0], _pax = [0, 0, 0];
function crossPlume(R, nozzle, dir, r, len, c) {
  V.scale(_pax, dir, len);
  V.norm(_pa1, V.cross(_pa1, dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  V.cross(_pa2, dir, _pa1);
  const w = r * 1.9;                                          // as wide as the nozzle bell, not a needle
  R.plume(nozzle, _pax, [_pa1[0] * w, _pa1[1] * w, _pa1[2] * w], c, 1.3);
  R.plume(nozzle, _pax, [_pa2[0] * w, _pa2[1] * w, _pa2[2] * w], c, 1.3);
}
// per-ship speed (tracked frame to frame, smoothed; paused frames keep the last value) → 0..1 throttle
const _spd = new Map();
function shipSpeedK(R, name, entry, model) {
  const key = name + ':' + (entry.seed ?? 0).toFixed(2);
  const now = R._now ?? 0, p = [entry.m[12], entry.m[13], entry.m[14]];
  let st = _spd.get(key);
  if (!st) { st = { p, t: now, v: 0 }; _spd.set(key, st); }
  const dt = now - st.t;
  if (dt > 1e-4 && dt < 0.5) { const v = V.dist(p, st.p) / dt; st.v = st.v * 0.7 + v * 0.3; }
  else if (dt < 0 || dt >= 0.5) st.v = 0;
  if (dt !== 0) { st.p = p; st.t = now; }
  if (_spd.size > 2000) _spd.clear();
  const b = model.bounds, L = Math.max(1, b.max[2] - b.min[2]);
  const vref = Math.max(6, L * 0.08);                          // cruising speed for a ship of this size
  return sat((st.v - vref * 0.05) / vref);
}

/** Emissive point list for material (eye/muzzle) in world space */
export function emitWorld(R, name, entry, mat, idx = 0, out = [0, 0, 0]) {
  const model = R.models[name];
  const pts = model?.emitPoints[mat];
  if (!pts || !pts.length) return null;
  const ep = pts[Math.min(idx, pts.length - 1)];
  return M.transformPoint(out, R.partWorld(name, entry, model.parts[ep.part].name), ep.pos);
}

/** Bolt: a projectile moving from a to b between t0 and t1 (len = streak length). Returns progress or -1. */
export function bolt(R, t, t0, t1, a, b, len, radius, col, intensity = 1) {
  if (t < t0 || t > t1) return -1;
  const u = (t - t0) / (t1 - t0);
  const L = V.dist(a, b);
  const ht = u, tt = Math.max(0, u - len / L);
  V.lerp(tmp, a, b, ht); V.lerp(tmp2, a, b, tt);
  R.beam(tmp2, tmp, radius, col, intensity, 16);
  return u;
}

/** Energy being sucked into a charging emitter. Speed is integrated so it is fast from the first frame and keeps
 * accelerating: rate(u) = r0 + (r1 - r0)·u², u = (t - t0)/dur. Streaks lengthen with speed. */
export function chargeInflow(R, t, t0, dur, pos, radius, n, col, r0 = 3, r1 = 15, width = 0.2, seed = 0) {
  const lt = Math.max(0, Math.min(t - t0, dur)), u = lt / dur;
  const P = r0 * lt + (r1 - r0) * dur * u * u * u / 3;           // ∫ rate dt  (cycles)
  const rate = r0 + (r1 - r0) * u * u;
  const k = 0.45 + 0.55 * u;
  for (let i = 0; i < n; i++) {
    const s = i * 1.913 + seed;
    const cyc = P * (0.75 + 0.5 * hash(s)) + hash(s + 1);
    const ph = cyc % 1;
    const d = randDir(tmp, s + Math.floor(cyc) * 2.3);
    const r = radius * (1 - ph) * (0.6 + 0.4 * hash(s + 2)) + radius * 0.04;
    if (R.camPos) {                                                // never let a streak flare across the lens
      const px = pos[0] + d[0] * r - R.camPos[0], py = pos[1] + d[1] * r - R.camPos[1], pz = pos[2] + d[2] * r - R.camPos[2];
      if (px * px + py * py + pz * pz < (radius * 0.45) * (radius * 0.45)) continue;
    }
    const len = Math.min(r, radius * (0.06 + rate * 0.012));
    const b = k * (0.3 + 0.7 * ph) * 3;
    R.beam(V.madd(tmp2, pos, d, r + len), V.madd(tmp3, pos, d, r), width, [col[0] * b, col[1] * b, col[2] * b], 1, 10);
  }
}

/** Impact flash (shield hit / small hit) */
export function hitFlash(R, t, t0, pos, size, col) {
  const lt = t - t0;
  if (lt < 0 || lt > 0.6) return;
  const k = Math.exp(-lt * 7);
  R.glow(pos, size * (1 + lt * 3), [col[0] * k * 3, col[1] * k * 3, col[2] * k * 3], 0.8);
  R.light(pos, size * 10, col, 8 * k);
}

/** Smoke / fire trail behind a moving thing given a position function */
export function trail(R, t, posFn, span, n, radius, col, fire = false, seed = 0) {
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const p = posFn(t - a * span);
    if (!p) continue;
    if (fire) R.fire(p, radius * (0.4 + a * 1.2), 0.25 + a * 0.7, seed + i * 1.3, [1, 1, 1], 1);
    else R.smoke(p, radius * (0.5 + a * 2), a, seed + i * 1.3, col, 0.6 * (1 - a));
  }
}

// ------------------------------------------------------------------ real model breakup
// The ship's own mesh is drawn once per chunk; each draw keeps only that chunk's cell (jagged local AABB,
// see the mesh shader) and flies/tumbles away from the break point. Torn edges glow and cool down.
const _sm = new Float32Array(16), _sm2 = new Float32Array(16), _sq = [0, 0, 0, 1];
export function shatter(R, name, base, t, t0, seed, grid = [2, 2, 3], speed = 1, opts = {}) {
  const model = R.models[name];
  if (!model || t < t0) return false;
  const lt = t - t0;
  const b = model.bounds, mn = b.min, mx = b.max;
  const [gx, gy, gz] = grid;
  const size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  let k = 0;
  for (let ix = 0; ix < gx; ix++) for (let iy = 0; iy < gy; iy++) for (let iz = 0; iz < gz; iz++, k++) {
    const s = seed * 7.31 + k * 3.17;
    // uneven cell boundaries so chunks aren't a regular grid
    const cut = (i, n, a, c, o) => i <= 0 ? a - 1 : i >= n ? c + 1 : a + (c - a) * (i / n + (hash(s + o + i) - 0.5) * 0.18 / n);
    const lo = [cut(ix, gx, mn[0], mx[0], 1), cut(iy, gy, mn[1], mx[1], 2), cut(iz, gz, mn[2], mx[2], 3)];
    const hi = [cut(ix + 1, gx, mn[0], mx[0], 1), cut(iy + 1, gy, mn[1], mx[1], 2), cut(iz + 1, gz, mn[2], mx[2], 3)];
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    // velocity: away from the break point + random tumble; bigger ships drift slower
    const dir = V.norm([0, 0, 0], [c[0] + (hash(s) - 0.5) * size * 0.3, c[1] + (hash(s + 1) - 0.5) * size * 0.3, c[2] * 0.6]);
    const v = size * (0.06 + hash(s + 2) * 0.1) * speed;
    const d = v * lt * (1 - Math.min(0.5, lt * 0.02));
    Q.fromEuler(_sq, lt * (hash(s + 3) - 0.5) * 0.5 * speed, lt * (hash(s + 4) - 0.5) * 0.4 * speed, lt * (hash(s + 5) - 0.5) * 0.6 * speed);
    // local: translate(-c) -> rotate -> translate(c + dir*d)
    M.fromTRS(_sm, [c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d], _sq, 1);
    M.fromTRS(_sm2, [-c[0], -c[1], -c[2]], [0, 0, 0, 1], 1);
    M.mul(_sm, _sm, _sm2);
    M.mul(_sm, base, _sm);
    const e = R.add(name, _sm);
    if (!e) continue;
    e.clip = [lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]];
    e.clipHeat = Math.max(0, 1 - lt / 9) * 1.2;
    e.damage = 0.1; e.seed = seed + k;                                   // light soot only: the torn edges carry the heat
    e.emissive = Math.max(0, 1 - lt * 1.5) * (hash(s + 6) > 0.5 ? 1 : 0.2);   // lights die, a few flicker
    if (opts.tint) e.tint = opts.tint;
    if (opts.pose) { e.pose = opts.pose; }
    if (opts.texSet) e.texSet = opts.texSet;
    if (opts.noFire) continue;
    // venting fire at each chunk centre for a few seconds
    if (lt < 6 && hash(s + 7) > 0.8) {
      M.transformPoint(tmp, _sm, c);
      R.fire(tmp, size * 0.03 * (1 - lt / 6), 0.25 + 0.4 * (lt / 6), s, [1, 1, 1], 0.6);
    }
  }
  return true;
}

// Tear a region [lo,hi] (model-local) out of a hull: returns nothing; draws the chunks flying out.
// The caller draws the main hull with e.clip = region, e.clipInv = true (a hole).
const _bm = new Float32Array(16), _bm2 = new Float32Array(16), _bq = [0, 0, 0, 1];
export function breakOff(R, name, base, t, t0, lo, hi, outDir, seed, grid = [2, 2, 3]) {
  if (t < t0) return;
  const lt = t - t0;
  const [gx, gy, gz] = grid;
  const span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const size = Math.max(...span);
  let k = 0;
  for (let ix = 0; ix < gx; ix++) for (let iy = 0; iy < gy; iy++) for (let iz = 0; iz < gz; iz++, k++) {
    const s = seed * 5.7 + k * 2.31;
    const a = [lo[0] + span[0] * ix / gx, lo[1] + span[1] * iy / gy, lo[2] + span[2] * iz / gz];
    const b = [lo[0] + span[0] * (ix + 1) / gx, lo[1] + span[1] * (iy + 1) / gy, lo[2] + span[2] * (iz + 1) / gz];
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const dir = V.norm([0, 0, 0], [outDir[0] + (hash(s) - 0.5) * 1.4, outDir[1] + (hash(s + 1) - 0.5) * 1.4, outDir[2] + (hash(s + 2) - 0.5) * 1.4]);
    const d = size * (0.25 + hash(s + 3) * 0.5) * lt * (1 - Math.min(0.6, lt * 0.03));
    Q.fromEuler(_bq, lt * (hash(s + 4) - 0.5) * 1.2, lt * (hash(s + 5) - 0.5) * 1.0, lt * (hash(s + 6) - 0.5) * 1.4);
    M.fromTRS(_bm, [c[0] + dir[0] * d, c[1] + dir[1] * d, c[2] + dir[2] * d], _bq, 1);
    M.fromTRS(_bm2, [-c[0], -c[1], -c[2]], [0, 0, 0, 1], 1);
    M.mul(_bm, _bm, _bm2); M.mul(_bm, base, _bm);
    const e = R.add(name, _bm);
    if (!e) continue;
    e.clip = [a[0], a[1], a[2], b[0], b[1], b[2]];
    e.clipHeat = Math.max(0, 0.9 - lt / 6);
    e.damage = 0.7; e.seed = s; e.emissive = Math.max(0, 1 - lt);
    if (lt < 10) { M.transformPoint(tmp, _bm, c); R.fire(tmp, size * 0.08 * (1 - lt / 10), 0.3 + lt * 0.05, s, [1, 1, 1], 0.9); }
  }
  // small hull fragments (debris model) streaming out of the wound
  if (false && R.models.debris) {                        // (removed: foreign hull fragments)
    const ctr = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    for (let i = 0; i < 40; i++) {
      const s = seed * 3.3 + i * 1.7;
      const dir = V.norm([0, 0, 0], [outDir[0] + (hash(s) - 0.5) * 2, outDir[1] + (hash(s + 1) - 0.5) * 2, outDir[2] + (hash(s + 2) - 0.5) * 2]);
      const d = size * (0.4 + hash(s + 3) * 1.6) * lt;
      Q.fromEuler(_bq, lt * (hash(s + 4) - 0.5) * 4, lt * (hash(s + 5) - 0.5) * 3, lt * (hash(s + 6) - 0.5) * 5);
      M.fromTRS(_bm2, [ctr[0] + dir[0] * d, ctr[1] + dir[1] * d, ctr[2] + dir[2] * d], _bq, 0.35 + hash(s + 7) * 0.9);
      M.mul(_bm, base, _bm2);
      const e = R.add('debris', _bm);
      if (e) { e.hidden = chunkHidden(R, 'hull' + (i % 4)); e.damage = 0.6; e.seed = s; }
      if (i % 3 === 0 && lt < 3) { M.transformPoint(tmp, _bm, [0, 0, 0]); R.beam(tmp, tmp, 0, [0, 0, 0], 0); R.glow(tmp, 1.5, [2.5 * (1 - lt / 3), 1.1 * (1 - lt / 3), 0.3 * (1 - lt / 3)], 0.3); }
    }
  }
}
