// Persistent world state as pure functions of film time t (seconds). Seek-safe.
import { M, V, Q, hash, noise1, sat, smooth, ease, easeOut, easeIn, easeInOut, lerp, spline, DEG, clamp } from './math.js';
import { explosion, hyperWindow, engineGlows, emitWorld, bolt, hitFlash, trail, randDir, shatter, breakOff, chargeInflow } from './fx.js';
import { ION_SHOTS, ION_BOLT_SPEED } from './ionfire.js';
export { explosion };

export const HIIG_ENGINE = [0.55, 0.8, 1.6];
export const ENEMY_ENGINE = [2.0, 0.55, 0.15];
export const HYPER_BLUE = [0.35, 0.65, 1.6];
export const HYPER_RED = [1.8, 0.25, 0.15];
export const ION_COL = [0.3, 0.6, 1.6];
export const LANCE_COL = [1.2, 0.35, 2.0];
export const BEAM_PINK = [2.2, 0.55, 1.4];

export const WELL = [0, 150, 3200];
export const DREAD = [150, 120, -2100];
export const HANGAR = [0, -8000, 0];
export const BC = [0, 40, -480];          // dogfight centre
export const GC = [230, 90, -640];        // gundam combat centre

export const IONF = [
  { p: [-170, 40, 160], arrive: 40.5, seed: 1 },
  { p: [175, -25, 190], arrive: 42.5, seed: 2 },
  { p: [-130, -70, 330], arrive: 44.5, seed: 3 },
  { p: [150, 70, 340], arrive: 46.5, seed: 4 },
];
export const ASF = [
  { p: [-280, -20, 40], arrive: 41.5, seed: 5 },
  { p: [270, 30, 60], arrive: 43.5, seed: 6 },
  { p: [-60, 130, 380], arrive: 45.5, seed: 7 },
  { p: [70, -130, 400], arrive: 47.5, seed: 8 },
];
export const EF = [
  { p: [-320, 60, -1050], arrive: 81, die: 290.3, seed: 11 },        // (all enemy losses come after the well collapses:
  { p: [300, -40, -1000], arrive: 81.4, die: 293.9, seed: 12 },      //  until then our ion guns cannot hold a charge)
  { p: [-120, -120, -1150], arrive: 81.8, die: 298.4, seed: 13 },
  { p: [150, 130, -1120], arrive: 82.3, die: 304.9, seed: 14 },
  { p: [-430, -60, -1300], arrive: 82.7, flee: 312, seed: 15 },
  { p: [430, 40, -1320], arrive: 83.1, flee: 314, seed: 16 },
  { p: [20, 210, -1420], arrive: 83.5, flee: 316, seed: 17 },
];
export const DREAD_ARRIVE = 85;      // emerges slowly 85–99 (window opens at 84)
export const DREAD_EMERGE = 1;       // every hyperspace exit takes 1 s (user request)
export const MOTHER_ARRIVE = 19;    // window 17.5, slides out 19–29
export const MOTHER_EMERGE = 1;
export const HOME_T = 340;          // fleet heads home (no hyperspace jump)
export const DREAD_DIE = 306;
export const LANCE_FIRE = 216;
export const MAIN_FIRE = 300;
export const IMPLODE = 280;
export const LANCE_HIT = [62, 10, 40];    // mothership-local hit point: STARBOARD flank over the hangar bay
export const WOUND_R = 44;                   // final melt-hole radius (m)
// hole radius over time: the wall glows, bulges, then melts open from the centre outwards
export function woundR(t) { return t < LANCE_FIRE + 0.15 ? 0 : WOUND_R * (0.25 + 0.75 * easeOut(sat((t - LANCE_FIRE - 0.15) / 3.2))); }

// ------------------------------------------------------------------ sun / planet (shared with shots.js)
export const SUN = V.norm([0, 0, 0], [-0.8, 0.5, 0.25]);
export const PL_R = 0.62;
export const PLANET = (() => {
  const down = V.norm([0, 0, 0], V.cross([0, 0, 0], SUN, V.cross([0, 0, 0], [0, -1, 0], SUN)));
  const a = PL_R + 0.1;
  return V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], SUN, Math.cos(a)), V.scale([0, 0, 0], down, Math.sin(a))));
})();
export const HOME_YAW = Math.atan2(PLANET[0], PLANET[2]);
// homeward drift after HOME_T: everything Hiigaran slowly accelerates toward the planet
// no normal-space flight home any more: the fleet jumps (344–346) and arrives at Earth (EARTH_T)
export function homeOffset(out, t) { out[0] = out[1] = out[2] = 0; return out; }
export const EARTH_T = 347.3;
// per-ship jump-out / Earth-arrival times (seeded), shared by all Hiigaran ships
export function jumpTimes(seed) { return { d: 344.3 + hash(seed * 1.7) * 1.6, a: EARTH_T + 0.5 + hash(seed * 2.3) * 2.4 }; }
function jumpState(t, seed, pos, fwd, L, dur = 1) {
  const { d, a } = jumpTimes(seed);
  if (t >= a) { const h = hyperIn(t, a, pos, fwd, L, dur); return { pos: h.pos, rz: h.revealZ, dir: h.dir, st: stretchIn(h.u), win: h.alpha > 0 ? { c: h.W, a: h.alpha } : null }; }
  if (t >= d) { const h = hyperOut(t, d, pos, fwd, L); return h.gone ? { gone: true, win: h.alpha > 0 ? { c: h.W, a: h.alpha } : null } : { pos: h.pos, rz: h.revealZ, dir: h.dir, st: stretchOut(h.u), out: true, win: { c: h.W, a: h.alpha } }; }
  if (t >= EARTH_T) return { gone: true };
  return null;
}

// ------------------------------------------------------------------ helpers
const _q = [0, 0, 0, 1], _m = M.new();
export function mat(out, pos, fwd, up = [0, 1, 0], roll = 0) {
  Q.lookRotation(_q, fwd, up);
  if (roll) Q.mul(_q, _q, Q.fromEuler([0, 0, 0, 1], 0, 0, roll));
  return M.fromTRS(out, pos, _q, 1);
}
export function matEuler(out, pos, pitch, yaw, roll, s = 1) {
  Q.fromEuler(_q, pitch, yaw, roll);
  return M.fromTRS(out, pos, _q, s);
}
export function yawDir(yaw) { return [Math.sin(yaw), 0, Math.cos(yaw)]; }
export function rotY(out, v, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const x = v[0] * c + v[2] * s, z = -v[0] * s + v[2] * c;
  out[0] = x; out[1] = v[1]; out[2] = z; return out;
}
export function modelLen(R, name) { const b = R.models[name]?.bounds; return b ? b.max[2] - b.min[2] : 50; }
export function modelSize(R, name) { const b = R.models[name]?.bounds; return b ? [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]] : [20, 20, 50]; }

// ------------------------------------------------------------------ fleet kinematics
export function motherYaw(t) {
  const final = Math.atan2(DREAD[0], DREAD[2]);
  let y = lerp(0, final, easeInOut(sat((t - 66) / 24)));      // slow, heavy turn to face the enemy (66–90)
  let home = HOME_YAW; while (home - y > Math.PI) home -= 2 * Math.PI; while (home - y < -Math.PI) home += 2 * Math.PI;
  return lerp(y, home, easeInOut(sat((t - 330) / 22)));
}
export function motherMatrix(out, t) {
  const bob = Math.sin(t * 0.13) * 2;
  const h = homeOffset([0, 0, 0], t - 3);   // mothership follows the fleet a little later
  return matEuler(out, [h[0], bob + h[1], h[2]], Math.sin(t * 0.07) * 0.004, motherYaw(t), Math.sin(t * 0.09) * 0.006);
}
export function motherPoint(out, t, local) {
  motherMatrix(_m, t);
  return M.transformPoint(out, _m, local);
}
export function frigateYaw(t) {
  const face = Math.PI * easeInOut(sat((t - 67) / 22));      // slow turn with the flagship
  return lerp(face, HOME_YAW + 2 * Math.PI, easeInOut(sat((t - 334) / 12)));
}

// arrival via hyperspace: returns {pos, revealZ, dir, window, alpha} or null if not yet
// ---- hyperspace, ported from the homeland project (unit.js _updateHyper / _updateHyperOut, fx.hyperWindow) ----
// hyperStretch curve: stretched ~16x along the length, holding, then snapping back to 1 inside K1..K2.
const K1 = 0.48, K2 = 0.72;
function hyperStretchAt(k) {
  if (k < K1) return 1 + 15 * (1 - 0.22 * (k / K1));
  if (k < K2) { const u = (k - K1) / (K2 - K1); return 1 + 12.7 * Math.pow(1 - u, 2.4); }
  const u = (k - K2) / (1 - K2); return 1 + 0.35 * Math.pow(1 - u, 3);
}
const stretchIn = (u) => u >= 1 ? 0 : hyperStretchAt(u) - 1;          // arrival
const stretchOut = (u) => u <= 0 ? 0 : hyperStretchAt(1 - u) - 1;      // departure (mirror)
let _R = null;                                                          // current renderer (set by drawWorld)
// streaks, wake ripples and ripples opening ahead (deterministic, seek-safe versions of homeland's)
function warpExtras(k, from, to, pos, fwd, L, tA, dur, out) {
  const R = _R; if (!R) return;
  const radius = L * 0.5;
  const r = out ? 1 - k : k;
  if (r > K1 && r < K2) {                                               // snap: thin afterimage lines
    const hs = hyperStretchAt(r);
    const tail = L * (hs - 1) * 0.55;
    for (let i = 0; i < 4; i++) {
      const a = [(hash(tA * 3 + i) - 0.5) * radius * 0.35, (hash(tA * 5 + i) - 0.5) * radius * 0.25, 0];
      const p0 = V.add([0, 0, 0], pos, rotYv(a, fwd));
      R.beam(p0, V.madd([0, 0, 0], p0, fwd, -tail * (0.5 + hash(tA + i * 7) * 0.5)), radius * 0.01, [0.85, 0.92, 1.0], 1.5, 20);
    }
  }
  // wake: refractive ripples at fixed samples along the travelled segment, each living 0.26 s
  const N = 8;
  for (let i = 1; i <= N; i++) {
    const ki = i / N;
    const ti = tA + ki * dur;
    const age = (tA + k * dur) - ti;
    if (age < 0 || age > 0.26 * (dur / 1.2)) continue;
    const e = out ? Math.pow(ki, 3.2) : 1 - Math.pow(1 - ki, 3.2);
    const q = V.lerp([0, 0, 0], from, to, e);
    R.ripple(q, radius * (0.9 + 0.8 * (out ? ki : 1 - ki)), [0, 0, 0], (1 - age / (0.26 * dur / 1.2)) * 1.2);
  }
  // space keeps opening just ahead of the ship
  const rate = out ? 2 + k * 9 : 7;
  const slot = Math.floor((tA + k * dur) * rate);
  for (let s2 = slot - 2; s2 <= slot; s2++) {
    const ts = s2 / rate, age = (tA + k * dur) - ts;
    if (age < 0 || age > 0.5) continue;
    R.ripple(pos, radius * (2.2 + hash(s2 * 1.3 + tA) * 2.5) * (0.3 + age * 1.4), [0, 0, 0], (1 - age / 0.5) * 0.9);
  }
}
function rotYv(a, fwd) { const yaw = Math.atan2(fwd[0], fwd[2]); const c = Math.cos(yaw), s = Math.sin(yaw); return [a[0] * c + a[2] * s, a[1], -a[0] * s + a[2] * c]; }
function warpClose(t, tEnd, pos, L) {
  const R = _R; if (!R) return;
  // space ripple scaled by the ship's bulk: a 60 m frigate barely shivers space, a 600 m capital ship shoves a big,
  // slow, strong wave out (and a second, wider aftershock ring)
  const age = t - tEnd, k = clamp(L / 70, 0.4, 9), dur = 0.45 + 0.28 * Math.sqrt(k), amp = 0.55 + 0.55 * Math.sqrt(k);
  if (age >= 0 && age < dur) R.ripple(pos, L * (0.6 + 3.2 * easeOut(age / dur)), [0, 0, 0], (1 - age / dur) * amp);
  if (k > 2.5 && age > 0.15 && age < 0.15 + dur * 1.6) { const a2 = (age - 0.15) / (dur * 1.6); R.ripple(pos, L * (1.5 + 6 * easeOut(a2)), [0, 0, 0], (1 - a2) * amp * 0.6); }
}

function hyperIn(t, tA, final, fwd, L, dur = 1) {
  if (t < tA) return null;
  const k = sat((t - tA) / dur);
  const from = V.madd([0, 0, 0], final, fwd, -L * 3);
  const e = 1 - Math.pow(1 - k, 3.2);
  const pos = V.lerp([0, 0, 0], from, final, e);
  if (k < 1) warpExtras(k, from, final, pos, fwd, L, tA, dur, false);
  warpClose(t, tA + dur, final, L);
  // window stays open for dur + 0.7 s (homeland warpOpen)
  const alpha = t < tA + dur + 0.7 ? 1 - Math.max(0, (t - tA - dur) / 0.7) : 0;
  return { pos, revealZ: 0, dir: 0, W: final, alpha, u: k };
}
function hyperOut(t, tD, start, fwd, L, dur = 1) {
  if (t < tD) return { pos: start, dir: 0, alpha: 0, u: 0 };
  const k = sat((t - tD) / dur);
  const exit = V.madd([0, 0, 0], start, fwd, L * 3);
  const pos = V.lerp([0, 0, 0], start, exit, Math.pow(k, 3.2));
  if (k < 1) warpExtras(k, start, exit, pos, fwd, L, tD, dur, true);
  warpClose(t, tD + dur, exit, L);
  const alpha = t < tD + dur + 0.7 ? 1 - Math.max(0, (t - tD - dur) / 0.7) : 0;
  return { pos, revealZ: 0, dir: 0, W: start, alpha, u: k, gone: k >= 1 };
}

// ---------------- the flank wound (216+)
const _wm = M.new(), _wq = [0, 0, 0, 1];
const SPILL = [];                 // bay contents blown out through the hole: [prop, local start, velocity dir, speed, t0, spin, scale]
{
  const props = ['crate0', 'crate1', 'container', 'barrel', 'tank', 'panel0', 'panel1', 'rib', 'cable', 'toolcart', 'seat', 'person0', 'person1', 'person2', 'person3'];
  for (let i = 0; i < 90; i++) {
    const h = (k) => hash(i * 7.31 + k * 1.93);
    const prop = i % 3 === 0 ? 'person' + (i % 4) : props[Math.floor(h(1) * props.length)];
    const a = h(2) * 6.283, rr = h(3) * 30;
    const start = [LANCE_HIT[0] - 6 - h(4) * 30, LANCE_HIT[1] + Math.sin(a) * rr * 0.7, LANCE_HIT[2] + Math.cos(a) * rr];
    const dir = V.norm([0, 0, 0], [1, (h(5) - 0.5) * 0.9, (h(6) - 0.5) * 0.9]);
    const t0 = LANCE_FIRE + 0.4 + Math.pow(h(7), 1.6) * 7;          // decompression: most in the first seconds
    SPILL.push({ prop, start, dir, speed: 8 + h(8) * 26, t0, spin: [h(9) - 0.5, h(10) - 0.5, h(11) - 0.5], person: prop.startsWith('person') });
  }
}
// objects inside the bay when the wall goes: zero-g, sucked toward the hole, some burning, some crushed, some exploding
const INTERIOR = [];
{
  const props = ['crate0', 'crate1', 'container', 'barrel', 'tank', 'toolcart', 'seat', 'cable', 'person0', 'person1', 'person2', 'person3'];
  const decks = [-17, 1, 19];                                        // hangar deck levels (mothership-local y)
  for (let i = 0; i < 44; i++) {
    const h = (k) => hash(i * 5.71 + k * 2.37 + 40);
    const prop = props[Math.floor(h(1) * props.length)];
    const p0 = [8 + h(2) * 48, decks[Math.floor(h(3) * 3)] + 1.2, -26 + h(4) * 132];
    INTERIOR.push({ prop, p0, lift: LANCE_FIRE + 0.3 + h(5) * 2.5, spin: [h(6) - 0.5, h(7) - 0.5, h(8) - 0.5],
      burn: h(9) < 0.18, crush: h(10) < 0.3 ? 0.6 + 0.6 * h(11) : 0, boom: h(12) < 0.18 ? LANCE_FIRE + 1 + h(13) * 12 : 0, seed: i });
  }
}
const _im = M.new(), _im2 = M.new(), _iq = [0, 0, 0, 1];
// the bay is NOT tidy after the hit: wreckage jammed and piled against the hull (pushed by the blast), crumpled,
// scorched; broken conduits spit sparks; fires and smoke on several decks
const WRECK = [];
{
  const parts = ['rib', 'panel0', 'panel1', 'cable', 'container', 'crate0', 'crate1', 'tank', 'toolcart', 'barrel'];
  const decks = [-17, 1, 19];
  for (let i = 0; i < 60; i++) {
    const h = (k) => hash(i * 3.91 + k * 1.77 + 90);
    const x = 12 + Math.pow(h(1), 0.6) * 46;                           // piled mostly toward the hole side (+X)
    WRECK.push({ prop: parts[Math.floor(h(2) * parts.length)], p: [x, decks[Math.floor(h(3) * 3)] + 0.6 + h(4) * 2.5, -30 + h(5) * 140],
      rot: [(h(6) - 0.5) * 2.4, h(7) * 6.28, (h(8) - 0.5) * 2.4], sc: 0.9 + h(9) * 0.8, crush: h(10) < 0.55 ? 0.5 + 0.8 * h(11) : 0 });
  }
}
const SPARKERS = Array.from({ length: 7 }, (_, i) => [8 + hash(i + 300) * 50, -14 + hash(i + 301) * 48, -25 + hash(i + 302) * 130]);
const FIRES = Array.from({ length: 10 }, (_, i) => [14 + hash(i + 400) * 44, [-17, 1, 19][i % 3] + 1.5, -24 + hash(i + 401) * 128]);
const _wq2 = [0, 0, 0, 1], _wm2 = M.new(), _wm3 = M.new();
function drawWreckage(R, t, mm) {
  if (!R.models.bay_props) return;
  const lt = t - LANCE_FIRE;
  for (let i = 0; i < WRECK.length; i++) {
    const w = WRECK[i];
    Q.fromEuler(_wq2, w.rot[0], w.rot[1], w.rot[2]);
    M.fromTRS(_wm2, w.p, _wq2, w.sc);
    M.mul(_wm3, mm, _wm2);
    const e = R.add('bay_props', _wm3);
    if (!e) continue;
    e.hidden = propOnly(R, w.prop); e.seed = 50 + i; e.damage = 0; e.shadeK = 0.5; e.soot = 0.8;
    if (w.crush) { const c = M.transformPoint([0, 0, 0], mm, w.p); e.crush = [c[0], c[1] + 1, c[2], 3 * w.sc, w.crush, 0.3, -0.8]; }
  }
  for (let i = 0; i < SPARKERS.length; i++) {                    // broken conduits: bursts of sparks
    const on = hash(Math.floor(t * 3 + i * 7)) > 0.45;
    if (!on) continue;
    const p0 = M.transformPoint([0, 0, 0], mm, SPARKERS[i]);
    for (let k = 0; k < 8; k++) {
      const d = randDir([0, 0, 0], Math.floor(t * 12) * 1.3 + k * 2.1 + i * 9);
      const ph = ((t * 3 + hash(k + i)) % 1), a = V.madd([0, 0, 0], p0, d, ph * 6), b = V.madd([0, 0, 0], a, d, -1.5);
      R.beam(b, a, 0.08, [4 * (1 - ph), 2.2 * (1 - ph), 0.6 * (1 - ph)], 1, 10);
    }
    R.glow(p0, 0.8, [3, 2, 0.8], 0.5);
  }
  for (let i = 0; i < FIRES.length; i++) {                       // fires and rolling smoke on the decks
    const p0 = M.transformPoint([0, 0, 0], mm, FIRES[i]);
    R.fire(p0, 2.5 + 1.5 * hash(i), 0.12 + 0.05 * Math.sin(t * 6 + i), i * 5.3 + t * 0.3, [1, 1, 1], 0.9);
    if (i % 3 === 0) R.light(p0, 40, [1, 0.5, 0.2], 4 + 2 * Math.sin(t * 9 + i));
    if (i % 2 === 0) R.fire(V.add([0, 0, 0], p0, [3, 5 + (t * 2 + i) % 6, 0]), 3.2, 0.8, i * 7.7, [0.35, 0.33, 0.32], 0.35 * Math.min(1, lt / 2));   // smoke
  }
}
// the bay's six strike craft (merged into mother_bay; hidden there after the hit and replaced by live models):
// [centre (flagship-local), toppled pose: offset, euler (pitch, yaw, roll), burning, crush]
const BAY_CRAFT = [
  [[45, -13.8, 2], [5.5, 1.8, 1], [0.1, 0.2, 1.75], 0, 0],        // rolled onto its side
  [[45, -13.8, 24], [7, 2.5, 3.5], [-0.62, 0.15, 0.35], 1, 0],    // shoved nose-up against the next cradle
  [[45, -13.8, 46], [4, 3.2, -1.5], [0.12, -0.3, 3.05], 0, 0.8],  // flipped upside down, crumpled
  [[45, -13.8, 68], [6, 1, -5], [0.05, 0.7, -1.05], 1, 0],        // slewed sideways into its neighbour
  [[20, 2.9, 30], [14, -2.5, 2], [0.55, 0.1, 1.2], 0, 0],         // hanging nose-down off the deck edge
  [[20, 2.9, 62], [-2, 1.5, 3], [0.05, 0.45, 1.55], 0, 0.5],      // rolled against the wall
];
const _cq = [0, 0, 0, 1], _cm1 = M.new(), _cm2 = M.new();
function drawBayCraft(R, t, mm) {
  if (!R.models.interceptor) return;
  const b = R.models.interceptor.bounds, sc = 16 / Math.max(1, b.max[2] - b.min[2]);
  const k = easeOut(sat((t - LANCE_FIRE - 0.15) / 0.6));           // decompression shove
  const la = Math.max(0, t - LANCE_FIRE - 0.75);                    // then a slow zero-g drift
  BAY_CRAFT.forEach(([c, off, rot, burn, crush], i) => {
    const p = [c[0] + off[0] * k + la * 0.35 * (i % 2 ? 1 : 0.5), c[1] + off[1] * k + la * 0.12, c[2] + off[2] * k];
    Q.fromEuler(_cq, rot[0] * k + la * 0.01 * i, rot[1] * k, rot[2] * k + la * 0.015 * (i - 2.5));
    M.fromTRS(_cm1, p, _cq, sc);
    M.mul(_cm2, mm, _cm1);
    const e = R.add('interceptor', _cm2);
    if (!e) return;
    e.seed = 30 + i; e.damage = 0; e.shadeK = 0.45; e.soot = 0.75;   // soot instead of the (costly) burn noise
    if (crush) { const w = M.transformPoint([0, 0, 0], mm, p); e.crush = [w[0], w[1] + 2, w[2], 6, crush * k, 0.2, -0.9]; }
    if (burn && t > LANCE_FIRE + 0.8) R.fire(M.transformPoint([0, 0, 0], mm, [p[0], p[1] + 2.2, p[2]]), 2.8, 0.12 + 0.05 * Math.sin(t * 6 + i), 60 + i, [1, 1, 1], 0.85);
  });
}
function drawInterior(R, t, mm) {
  if (!R.models.bay_props) return;
  const lt0 = t - LANCE_FIRE;
  for (const o of INTERIOR) {
    if (o.boom && t > o.boom + 0.15) {                              // blown apart: a lingering fire where it was
      if (t < o.boom + 3) explosion(R, t, o.boom, M.transformPoint([0, 0, 0], mm, interiorPos(o, o.boom)), 9, 700 + o.seed, 'small');
      continue;
    }
    const lp = interiorPos(o, t);
    const wp = M.transformPoint([0, 0, 0], mm, lp);
    const la = Math.max(0, t - o.lift);
    Q.fromEuler(_iq, la * o.spin[0] * 1.4, la * o.spin[1] * 1.4, la * o.spin[2] * 1.4);
    M.fromTRS(_im, [0, 0, 0], _iq, 1);
    const rot = M.mul(_im2, mm, _im); rot[12] = wp[0]; rot[13] = wp[1]; rot[14] = wp[2];
    const e = R.add('bay_props', rot);
    if (!e) continue;
    e.hidden = propOnly(R, o.prop); e.seed = o.seed;
    if (lt0 > 0) {
      e.damage = 0.25 + (o.burn ? 0.4 : 0);
      if (o.crush) { const k = o.crush * easeOut(sat((lt0 - 0.4) / 1.5)); e.crush = [wp[0], wp[1] + 0.8, wp[2], 2.2, k, 0.2, -0.9]; }
      if (o.burn && lt0 > 0.5) R.fire([wp[0], wp[1] + 0.8, wp[2]], 1.2 + 1.2 * hash(o.seed), 0.1 + 0.05 * Math.sin(t * 7 + o.seed), o.seed * 3.1 + t * 0.2, [1, 1, 1], 0.85);
    }
  }
  // secondary blasts ripping through the decks
  for (let k = 0; k < 9; k++) {
    const tb = LANCE_FIRE + 0.8 + k * 1.6 + hash(k) * 0.8;
    if (t < tb || t > tb + 2.5) continue;
    const lp = [12 + hash(k + 1) * 40, -16 + hash(k + 2) * 50, -20 + hash(k + 3) * 120];
    explosion(R, t, tb, M.transformPoint([0, 0, 0], mm, lp), 10 + 8 * hash(k + 4), 760 + k, 'small');
  }
}
// zero-g drift: lifts off the deck, drifts toward the breach (+X) — faster the closer it is — with a slow float
function interiorPos(o, t) {
  const la = Math.max(0, t - o.lift);
  const pull = (0.6 + (o.p0[0] - 8) / 48 * 2.4) * la;                // decompression toward the hole
  return [o.p0[0] + pull * la * 0.9, o.p0[1] + la * (0.9 + 0.6 * Math.sin(o.seed)), o.p0[2] + Math.sin(la * 0.4 + o.seed) * la * 0.8];
}

// Sigma's docking rig in the port launch bay: clamps swing down over the shoulders (342.3–342.9), the two door leaves
// slide shut along the hull (342.8–343.6) and stay shut — through the jump and the arrival at Earth
const _dm = M.new(), _dt = M.new();
function drawDock(R, t, me) {
  if (!R.models.dock_rig || (me.hidden && me.hidden.__all)) return;
  const mm = me.m;
  const rig = R.add('dock_rig', mm);
  if (rig) {
    rig.hidden = { door: 1 }; rig.stretch = me.stretch || 0; rig.stretchAnchor = motherAnchor(R, me); rig.seed = 7.7;
    const open = 1 - easeInOut(sat((t - 342.55) / 0.5));
    rig.pose = { clampL: [0, 0, -1.5 * open], clampR: [0, 0, -1.5 * open] };
    const blink = 0.6 + 0.4 * Math.sin(t * 9);
    rig.matOverride = { dock_light: { base: [0.3, 0.7, 1], metal: 0, rough: 0.3, emissive: t < 343.05 ? [0.35 * blink * 3, 0.85 * blink * 3, 1.4 * blink * 3] : [0.1, 0.9, 0.4] } };
  }
  // blue containment field across the bay mouth (fades on as Sigma approaches; ripples as he pushes through)
  if (t > 336 && t < 344) {
    const k = smooth(336, 337.5, t) * (1 - smooth(343.2, 343.8, t));
    const cw = M.transformPoint([0, 0, 0], mm, [-74.2, 4.5, 57]);
    const au = M.transformDir([0, 0, 0], mm, [0, 0, 35]), av = M.transformDir([0, 0, 0], mm, [0, 21.5, 0]);
    R.bayField(cw, au, av, t > 340.95 ? t - 340.95 : -1, [0.35, 0.7, 1.6], 0.8 * k);
  }
  const shut = easeInOut(sat((t - 343.0) / 0.75));
  for (const [zc, dir] of [[39.5, -1], [74.5, 1]]) {
    M.fromTRS(_dt, [0, 0, zc + dir * 35 * (1 - shut)], [0, 0, 0, 1], 1);
    M.mul(_dm, mm, _dt);
    const d = R.add('dock_rig', _dm);
    if (d) { d.hidden = { frame: 1, clampL: 1, clampR: 1 }; d.stretch = me.stretch || 0; d.stretchAnchor = motherAnchor(R, me) - (zc + dir * 35 * (1 - shut)); d.seed = 7.9; }
  }
}

function motherAnchor(R, me) { const b = R.models.mothership.bounds; return me.stretchOut ? b.min[2] : b.max[2]; }
const _rimT = M.new(), _rimM = M.new();
function drawWound(R, t, me) {
  // the interior rides with the hull: same live matrix (incl. hyperspace moves), stretch, reveal and visibility
  const mm = _m2; mm.set(me.m);
  const gone = me.hidden && me.hidden.__all;
  const bay = gone ? null : R.add('mother_bay', mm);
  if (bay) bay.hideMats = { craft: 1, craft_dark: 1, craft_teal: 1, canopy: 1 };   // live, toppled craft instead
  if (bay) drawBayCraft(R, t, mm);
  if (bay && t < 330) { drawInterior(R, t, mm); drawWreckage(R, t, mm); }
  if (bay) {
    bay.stretch = me.stretch || 0; bay.stretchAnchor = motherAnchor(R, me); bay.revealDir = me.revealDir; bay.revealZ = me.revealZ; bay.revealWidth = me.revealWidth; bay.tint = me.tint;
    const fl = 0.7 + 0.3 * Math.sin(t * 7) * Math.sin(t * 2.3) + (hash(Math.floor(t * 3)) > 0.8 ? -0.35 : 0);   // unsteady, not strobing
    const red = 0.5 + 0.5 * Math.sin(t * 5);
    bay.seed = 4.1; bay.damage = 0; bay.shadeK = 0.35; bay.soot = 0.8;   // deep inside the hull: little skylight, sooty
    bay.matOverride = { lamp: { base: [0.8, 0.8, 0.8], metal: 0, rough: 0.5, emissive: [1.1 * fl, 0.8 * fl, 0.55 * fl] },
      wall: { base: [0.09, 0.085, 0.08], metal: 0.5, rough: 0.8, emissive: [0, 0, 0] }, deck: { base: [0.07, 0.065, 0.06], metal: 0.4, rough: 0.85, emissive: [0, 0, 0] },
      deck_dark: { base: [0.04, 0.035, 0.03], metal: 0.4, rough: 0.9, emissive: [0, 0, 0] }, panel_light: { base: [0.14, 0.13, 0.12], metal: 0.3, rough: 0.8, emissive: [0, 0, 0] },
      amber: { base: [0.6, 0.3, 0.05], metal: 0, rough: 0.5, emissive: [4 * red, 0.5 * red, 0.1 * red] } };
    for (let i = 0; i < 4; i++) R.light(M.transformPoint([0, 0, 0], mm, [30, 12, -10 + i * 30]), 45, [1, 0.35 + 0.4 * fl, 0.25], 3 * fl);
  }
  // the armour's THICKNESS around the melt hole: a molten cut face + rolled lip (tools/make_wound_rim.py), scaled with
  // the growing hole, deformed with the hull (same crush), riding every hull transform (stretch, reveal)
  const r = woundR(t);
  if (!gone && r > 0.5 && me.melt) {
    M.fromTRS(_rimT, LANCE_HIT, [0, 0, 0, 1], 1); _rimT[5] = r; _rimT[10] = r;
    const rim = R.add('wound_rim', M.mul(_rimM, mm, _rimT));
    if (rim) {
      rim.texSet = -2; rim.emissive = me.melt[5]; rim.crush = me.crush; rim.seed = 9.1;
      rim.stretch = me.stretch || 0; rim.stretchAnchor = (motherAnchor(R, me) - LANCE_HIT[2]) / r;
      rim.revealDir = me.revealDir; rim.revealZ = (me.revealZ - LANCE_HIT[2]) / r; rim.revealWidth = me.revealWidth; rim.tint = me.tint;
    }
  }
  // molten drips peeling off the lower rim (streaks that cool from white to red)
  for (let i = 0; i < 26; i++) {
    const per = 1.4 + hash(i) * 1.6, ph = ((t - LANCE_FIRE) / per + hash(i + 3)) % 1;
    if (t - LANCE_FIRE < ph * per) continue;
    const a = -Math.PI / 2 + (hash(i + 7) - 0.5) * 2.4;
    const p0 = [LANCE_HIT[0] + 1.5, LANCE_HIT[1] + Math.sin(a) * r, LANCE_HIT[2] + Math.cos(a) * r];
    const p1 = [p0[0] + ph * 14, p0[1] - ph * 22 - 3, p0[2] + (hash(i + 9) - 0.5) * ph * 8];
    const c = 1 - ph, w = M.transformPoint([0, 0, 0], mm, p0), w1 = M.transformPoint([0, 0, 0], mm, p1);
    // a glob with a short tapering tail, wobbling as it drifts off the rim
    const wob = Math.sin(t * 6 + i) * 0.8;
    w1[0] += wob; w1[2] += Math.cos(t * 5 + i) * 0.8;
    R.glow(w1, 1.2 + 1.4 * c, [4 * c + 0.5, 1.5 * c * c + 0.1, 0.35 * c * c], 0.8);
    R.beam(V.lerp([0, 0, 0], w, w1, 0.55 + 0.25 * hash(i + 5)), w1, 0.35 + 0.5 * c, [2.6 * c + 0.3, 0.9 * c * c + 0.06, 0.2 * c * c], 1, 8);
  }
  // decompression spill: objects and people tumbling out of the bay
  const pm = R.models.bay_props;
  for (const sp of SPILL) {
    const lt = t - sp.t0;
    if (lt < 0 || lt > 26) continue;
    const d = sp.speed * lt * (1 - Math.min(0.4, lt * 0.012));
    const lp = [sp.start[0] + sp.dir[0] * d, sp.start[1] + sp.dir[1] * d, sp.start[2] + sp.dir[2] * d];
    const wp = M.transformPoint([0, 0, 0], mm, lp);
    Q.fromEuler(_wq, lt * sp.spin[0] * 3, lt * sp.spin[1] * 3, lt * sp.spin[2] * 3);
    if (pm) {
      M.fromTRS(_wm, wp, _wq, 1);
      const e = R.add('bay_props', _wm);
      if (e) { e.hidden = propOnly(R, sp.prop); e.seed = sp.t0; }
    } else {
      M.fromTRS(_wm, wp, _wq, sp.person ? 0.02 : 0.06);
      const e = R.add('debris', _wm);
      if (e) { e.hidden = debrisOnly(R, 'hull' + (Math.floor(sp.t0 * 10) % 4)); e.damage = 0.4; }
    }
  }
}
const _propHidden = new Map();
function propOnly(R, name) {
  let h = _propHidden.get(name);
  if (!h) { h = {}; for (const p of R.models.bay_props.parts) if (p.name !== name && p.name !== '__root') h[p.name] = 1; _propHidden.set(name, h); }
  return h;
}
const _m2 = M.new();

export function ionFrigate(t, i) {
  const f = IONF[i];
  const yaw = frigateYaw(t);
  const drift = V.add([0, 0, 0], [Math.sin(t * 0.2 + i) * 2, Math.sin(t * 0.17 + i * 2) * 1.5, 0], homeOffset([0, 0, 0], t));
  return { pos: V.add([0, 0, 0], f.p, drift), fwd: yawDir(yaw), yaw };
}
export function assaultFrigate(t, i) {
  const f = ASF[i];
  const yaw = frigateYaw(t - 0.8 * i);
  const drift = V.add([0, 0, 0], [Math.sin(t * 0.21 + i) * 2, Math.sin(t * 0.19 + i * 2) * 1.5, 0], homeOffset([0, 0, 0], t + 1));
  return { pos: V.add([0, 0, 0], f.p, drift), fwd: yawDir(yaw), yaw };
}
export function enemyFrigate(t, i) {
  const f = EF[i];
  const drift = [Math.sin(t * 0.23 + i) * 3, Math.sin(t * 0.2 + i * 2) * 2, Math.min(0, 0) + (t > 105 ? (t - 105) * 1.5 : 0)];
  return { pos: V.add([0, 0, 0], f.p, drift), fwd: [0, 0, 1] };
}
export function dreadPos(t) {
  return V.add([0, 0, 0], DREAD, [0, Math.sin(t * 0.1) * 3, t > 100 ? Math.min(t - 100, 120) * 0.8 : 0]);
}

// ------------------------------------------------------------------ dogfight
export const PAIRS = [];
for (let k = 0; k < 14; k++) {
  PAIRS.push({
    R: 140 + hash(k * 3.1) * 200, H: 60 + hash(k * 5.7) * 90, w: 0.32 + hash(k * 7.3) * 0.22,
    ph: hash(k * 9.1) * 6.28, ph2: hash(k * 11.3) * 6.28, dz: (hash(k * 13.7) - 0.5) * 380, dx: (hash(k * 2.9) - 0.5) * 240,
    hiigChases: k % 3 !== 1, die: [138, 141.6, 145, 148.6, 152, 157, 163, 171, 178, 189][k] ?? 999,
  });
}
export function fighterPos(out, k, t) {
  const p = PAIRS[k];
  const a = p.w * t + p.ph;
  out[0] = BC[0] + p.dx + p.R * Math.sin(a);
  out[1] = BC[1] + p.H * Math.sin(1.63 * a + p.ph2);
  out[2] = BC[2] + p.dz + p.R * 0.75 * Math.cos(a * 0.9);
  return out;
}

// ------------------------------------------------------------------ gundam kinematics (exterior)
export const GUN = {};
// launch path from hangar exit (mothership local) out to the battle
export function gundamLaunchPath(t) {
  const exitLocal = GUN.exitLocal || [60, 0, 60];
  const e = motherPoint([0, 0, 0], t, exitLocal);
  const pts = [e, V.add([0, 0, 0], e, [90, 10, -10]), [260, 60, -180], [300, 100, -420], V.add([0, 0, 0], GC, [60, 10, 120])];
  const u = sat((t - 159.5) / 10.5);
  return spline([0, 0, 0], pts, easeOut(u * 0.9 + 0.1 * u));
}

// ------------------------------------------------------------------ poses (euler radians per part)
export const POSES = {
  stand: {},
  crouch: { torso: [0.25, 0, 0], leg_L_upper: [-0.7, 0, 0.05], leg_R_upper: [-0.7, 0, -0.05], leg_L_lower: [1.2, 0, 0], leg_R_lower: [1.2, 0, 0], foot_L: [-0.45, 0, 0], foot_R: [-0.45, 0, 0], arm_L_upper: [-0.2, 0, 0.15], arm_R_upper: [-0.25, 0, -0.15], arm_L_lower: [-0.5, 0, 0], arm_R_lower: [-0.5, 0, 0], head: [-0.15, 0, 0] },
  flight: { torso: [0.15, 0, 0], leg_L_upper: [0.25, 0, 0.08], leg_R_upper: [0.1, 0, -0.08], leg_L_lower: [0.5, 0, 0], leg_R_lower: [0.75, 0, 0], foot_L: [0.35, 0, 0], foot_R: [0.3, 0, 0], arm_L_upper: [-0.55, 0, 0.3], arm_L_lower: [-0.7, 0, 0], arm_R_upper: [-0.5, 0, -0.2], arm_R_lower: [-0.9, 0, 0], head: [-0.25, 0, 0] },
  aim: { torso: [0.05, -0.25, 0], head: [0, 0.2, 0], arm_R_upper: [-1.55, 0.1, -0.05], arm_R_lower: [-0.05, 0, 0], hand_R: [0, 0, 0], arm_L_upper: [-0.6, 0, 0.35], arm_L_lower: [-0.9, 0, 0], leg_L_upper: [-0.35, 0, 0.1], leg_L_lower: [0.6, 0, 0], leg_R_upper: [0.2, 0, -0.1], leg_R_lower: [0.4, 0, 0], foot_L: [0.2, 0, 0], foot_R: [0.3, 0, 0] },
  saberRaise: { torso: [-0.1, 0.35, 0], head: [0.1, -0.3, 0], arm_L_upper: [-2.7, 0, 0.35], arm_L_lower: [-0.5, 0, 0], hand_L: [0.3, 0, 0], arm_R_upper: [-0.3, 0, -0.5], arm_R_lower: [-0.8, 0, 0], leg_L_upper: [-0.6, 0, 0.1], leg_L_lower: [0.9, 0, 0], leg_R_upper: [0.3, 0, -0.1], leg_R_lower: [0.5, 0, 0] },
  saberSlash: { torso: [0.35, -0.55, 0.1], head: [0.1, 0.3, 0], arm_L_upper: [-0.7, 0, -0.9], arm_L_lower: [-0.2, 0, 0], hand_L: [0.6, 0, 0], arm_R_upper: [-0.2, 0, -0.6], arm_R_lower: [-0.6, 0, 0], leg_L_upper: [0.3, 0, 0.1], leg_L_lower: [0.6, 0, 0], leg_R_upper: [-0.5, 0, -0.1], leg_R_lower: [0.8, 0, 0] },
  saberGuard: { torso: [0.1, 0.2, 0], arm_L_upper: [-1.4, 0, -0.2], arm_L_lower: [-1.0, 0, 0], hand_L: [-0.3, 0, 0], arm_R_upper: [-0.5, 0, -0.3], arm_R_lower: [-1.1, 0, 0], leg_L_upper: [-0.3, 0, 0.1], leg_L_lower: [0.7, 0, 0], leg_R_upper: [0.15, 0, -0.1], leg_R_lower: [0.5, 0, 0] },
  limp: { torso: [0.35, 0.1, 0.15], head: [0.4, 0.2, 0.1], arm_L_upper: [-0.4, 0, 0.6], arm_L_lower: [-0.3, 0, 0], arm_R_upper: [-0.2, 0.2, -0.5], arm_R_lower: [-0.6, 0, 0], leg_L_upper: [-0.3, 0, 0.2], leg_L_lower: [0.7, 0, 0], leg_R_upper: [0.1, 0, -0.1], leg_R_lower: [0.3, 0, 0] },
  maxSaber: { torso: [-0.15, 0.1, 0], head: [0.05, 0, 0], arm_L_upper: [-2.9, 0.2, 0.1], arm_R_upper: [-2.8, -0.2, -0.1], arm_L_lower: [-0.3, 0, 0], arm_R_lower: [-0.3, 0, 0], hand_L: [0.2, 0, 0], leg_L_upper: [-0.4, 0, 0.12], leg_L_lower: [0.8, 0, 0], leg_R_upper: [0.25, 0, -0.12], leg_R_lower: [0.5, 0, 0] },
  bigSlash: { torso: [0.5, 0, 0], head: [0.2, 0, 0], arm_L_upper: [-0.6, 0.2, 0.1], arm_R_upper: [-0.6, -0.2, -0.1], arm_L_lower: [-0.1, 0, 0], arm_R_lower: [-0.1, 0, 0], hand_L: [0.7, 0, 0], leg_L_upper: [0.4, 0, 0.1], leg_L_lower: [0.4, 0, 0], leg_R_upper: [-0.6, 0, -0.1], leg_R_lower: [1.0, 0, 0] },
};
const _pose = {};
export function blendPose(a, b, u, out = {}) {
  for (const k in out) delete out[k];
  const A = POSES[a] || a, B = POSES[b] || b;
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  const e = easeInOut(u);
  for (const k of keys) {
    const x = A[k] || [0, 0, 0], y = B[k] || [0, 0, 0];
    out[k] = [lerp(x[0], y[0], e), lerp(x[1], y[1], e), lerp(x[2], y[2], e)];
  }
  return out;
}
export function breathe(pose, t, amt = 1) {
  const s = Math.sin(t * 1.3) * 0.03 * amt;
  const tr = pose.torso || (pose.torso = [0, 0, 0]);
  tr[0] += s;
  const hd = pose.head || (pose.head = [0, 0, 0]);
  hd[1] += Math.sin(t * 0.7) * 0.05 * amt;
  return pose;
}

// ------------------------------------------------------------------ world render
/**
 * Adds all persistent exterior objects & effects for film time t.
 * opts: { skip: Set of names } lets shots hide things (e.g. while in hangar).
 */
export function drawWorld(R, t, opts = {}) {
  R._time = t; _R = R;
  const tmpM = M.new();
  const LM = modelLen(R, 'mothership');
  // ---------------- mothership
  const me = t > 17 ? R.add('mothership', motherMatrix(tmpM, t)) : null;
  GUN.motherModel = R.models.mothership;
  if (me) {
    const dmg = t > LANCE_FIRE + 1 ? lerp(0.25, 0.62, sat((t - LANCE_FIRE - 1) / 8)) : 0;
    me.damage = dmg;
    me.seed = 3.3;
    me.dmgC[0] = LANCE_HIT[0]; me.dmgC[1] = LANCE_HIT[1]; me.dmgC[2] = LANCE_HIT[2]; me.dmgR = WOUND_R * 2.2;
    if (t > LANCE_FIRE - 0.6) {
      // the wall heats (pre-glow), sags inward, then melts open; the molten rim cools slowly to a dull red
      const r = woundR(t);
      const heat = t < LANCE_FIRE + 0.15 ? 0.6 * sat((t - LANCE_FIRE + 0.6) / 0.75) : Math.max(0.35, 1.6 - (t - LANCE_FIRE) / 9);
      me.melt = [LANCE_HIT[0], LANCE_HIT[1], LANCE_HIT[2], Math.max(r, 0.01), 16, heat];
      const wc = motherPoint([0, 0, 0], t, LANCE_HIT), wi = V.norm([0, 0, 0], V.sub([0, 0, 0], motherPoint([0, 0, 0], t, [LANCE_HIT[0] - 10, LANCE_HIT[1], LANCE_HIT[2]]), wc));
      me.crush = [wc[0], wc[1], wc[2], WOUND_R * 1.6 * Math.sign(wi[2] || 1e-6), 0.22 * easeOut(sat((t - LANCE_FIRE + 0.4) / 2.5)), wi[0], wi[1]];
    }
    if (t > 63 && t < 120) {
      // red alert: windows pulse red
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      me.matOverride = { window: { base: [0.2, 0.05, 0.05], metal: 0, rough: 0.5, emissive: [3 * pulse + 0.3, 0.15, 0.1] } };
    }
    if (t > LANCE_FIRE + 1 && t < LANCE_FIRE + 3) me.flash = Math.exp(-(t - LANCE_FIRE - 1) * 3) * 2;
    engineGlows(R, 'mothership', me, [0.35, 0.55, 1.1], 0.6, t > 232 && t < 292 ? 1 : 0.7, 1.6);
    // ARRIVAL (Dune-style): the window unfolds at 17.5, the ship slides out slowly 19–29
    if (t < MOTHER_ARRIVE + MOTHER_EMERGE + 1.5) {
      const L = LM, fwd = [0, 0, 1], sz = modelSize(R, 'mothership');
      const W0 = [0, 0, -L * 0.5];
      const open = easeOut(sat((t - 17.5) / 1.4));
      if (t < MOTHER_ARRIVE) me.hidden = allParts(R, 'mothership');
      else {
        const hin = hyperIn(t, MOTHER_ARRIVE, [0, 0, 0], fwd, L, MOTHER_EMERGE);
        if (hin && hin.u < 1) {
          motherMatrix(tmpM, t); tmpM[12] = hin.pos[0]; tmpM[14] = hin.pos[2]; me.m.set(tmpM);
          me.revealDir = hin.dir; me.revealZ = hin.revealZ; me.revealWidth = 8; me.tint = [0.4, 0.7, 1.6]; me.stretch = stretchIn(hin.u);
        }
      }
      const a = t < MOTHER_ARRIVE + MOTHER_EMERGE ? open : Math.max(0, 1 - (t - MOTHER_ARRIVE - MOTHER_EMERGE) / 1.5);
      if (a > 0 && t > 17.5) hyperWindow(R, W0, fwd, (sz[0] * 0.62 + 30) * open, (sz[1] * 0.75 + 30) * open, HYPER_BLUE, a * 1.1);
    }
    // jump out at 345.6, emerge at Earth 348.0 over 9 s (slow, Dune-style)
    if (t > 345.6) {
      const L = LM, fwd = rotY([0, 0, 0], [0, 0, 1], motherYaw(t)), sz = modelSize(R, 'mothership');
      const base = motherMatrix(M.new(), t);
      const p0 = [base[12], base[13], base[14]];
      let st = null, winC = null, winA = 0;
      if (t < 348.0) {
        const h = hyperOut(t, 345.6, p0, fwd, L, 1);
        if (h.gone) me.hidden = allParts(R, 'mothership'); else st = h;
        winC = h.W; winA = h.alpha;
      } else {
        const h = hyperIn(t, 348.0, p0, fwd, L, 1);
        st = h.u < 1 ? h : null; winC = h.W; winA = h.alpha;
      }
      if (st) { me.m.set(base); me.m[12] = st.pos[0]; me.m[13] = st.pos[1]; me.m[14] = st.pos[2]; me.revealDir = st.dir; me.revealZ = st.revealZ; me.revealWidth = 3; me.tint = [0, 0, 0]; me.stretch = t < 348 ? stretchOut(st.u) : stretchIn(st.u); me.stretchOut = t < 348; }
      if (winA > 0 && winC) hyperWindow(R, winC, fwd, sz[0] * 0.62 + 30, sz[1] * 0.75 + 30, HYPER_BLUE, winA);
    }
    // the wound: the hangar bay behind the melted wall, molten drips, and the bay's contents sucked out into space
    if (t > LANCE_FIRE) drawWound(R, t, me);
    if (t > 335) drawDock(R, t, me);
    // hull fires after lance
    if (t > LANCE_FIRE + 1) {
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = hash(i * 3.7) * 6.283, rr = WOUND_R * (1.05 + 0.5 * hash(i * 5.1));
        const lp = [LANCE_HIT[0] + 1, LANCE_HIT[1] + Math.sin(a) * rr, LANCE_HIT[2] + Math.cos(a) * rr];
        const wp = motherPoint([0, 0, 0], t, lp);
        const f = 0.7 + 0.3 * Math.sin(t * (5 + i) + i);
        const k = t > 320 ? 0.45 : 1;
        R.fire(wp, (3 + hash(i) * 5) * f * k, 0.08 + 0.08 * Math.sin(t * 3 + i), i * 7.1 + t * 0.15, [1, 1, 1], 0.9);
        if (i % 3 === 0) R.light(wp, 80, [1, 0.5, 0.2], 5 * f * k);
      }
    }
  }

  // ---------------- hiigaran frigates
  const Li = modelLen(R, 'ion_frigate'), La = modelLen(R, 'assault_frigate');
  const szI = modelSize(R, 'ion_frigate'), szA = modelSize(R, 'assault_frigate');
  const place = (name, st, arrive, L, sz, seed, depart) => {
    let pos = st.pos, fwd = st.fwd, rz = 0, dir = 0, win = null, str = 0;
    const hin = hyperIn(t, arrive, st.pos, fwd, L);
    if (!hin) return null;
    if (hin.u < 1 || hin.alpha > 0) {
      pos = hin.pos; rz = hin.revealZ; dir = hin.dir; str = stretchIn(hin.u);
      if (hin.alpha > 0) win = { c: hin.W, a: hin.alpha };
    }
    const js = jumpState(t, seed, st.pos, fwd, L);
    if (js) {
      if (js.win) hyperWindow(R, js.win.c, fwd, sz[0] * 0.8 + 6, sz[1] * 0.9 + 6, HYPER_BLUE, js.win.a);
      if (js.gone) return null;
      pos = js.pos; rz = js.rz; dir = js.dir; win = null; str = js.st || 0;
    }
    const e = R.add(name, mat(tmpM, pos, fwd));
    e.revealZ = rz; e.revealDir = dir; e.revealWidth = 1.5; e.seed = seed; e.stretch = str; e.stretchOut = !!(js && js.out);
    if (win) hyperWindow(R, win.c, fwd, sz[0] * 0.8 + 6, sz[1] * 0.9 + 6, HYPER_BLUE, win.a);
    engineGlows(R, name, e, HIIG_ENGINE, 1, t > 108 && t < 119 ? 1 : 0.6);
    return e;
  };
  GUN.ionEntries = [];
  IONF.forEach((f, i) => { GUN.ionEntries[i] = place('ion_frigate', ionFrigate(t, i), f.arrive, Li, szI, f.seed, null); });
  ASF.forEach((f, i) => place('assault_frigate', assaultFrigate(t, i), f.arrive, La, szA, f.seed, null));

  // ---------------- enemy frigates
  const Le = modelLen(R, 'enemy_frigate'), szE = modelSize(R, 'enemy_frigate');
  GUN.efAlive = [];
  EF.forEach((f, i) => {
    if (t >= EARTH_T) return;
    const st = enemyFrigate(t, i);
    const hin = hyperIn(t, f.arrive, st.pos, st.fwd, Le, 1);
    if (!hin) return;
    const dead = f.die && t > f.die + 0.25;
    if (f.die) {
      explosion(R, t, f.die, V.add([0, 0, 0], st.pos, [0, 0, 5]), 45, i + 1, 'ship');
      explosion(R, t, f.die - 0.9, V.add([0, 0, 0], st.pos, [10, 6, -18]), 14, i + 20, 'small');
      if (dead) { if (t < EARTH_T) shatter(R, 'enemy_frigate', mat(M.new(), enemyFrigate(f.die, i).pos, [0, 0, 1]), t, f.die, 11 + i, [2, 2, 3], 1, { tint: [2, 0.3, 0.2] }); return; }
    }
    let pos = hin.u < 1 ? hin.pos : st.pos, rz = hin.revealZ, dir = hin.dir, win = hin.alpha > 0 ? { c: hin.W, a: hin.alpha } : null;
    if (f.flee && t > f.flee) {
      const fwd2 = st.fwd;                                 // jump straight ahead along the current heading (no turn)
      const ho = hyperOut(t, f.flee, st.pos, fwd2, Le, 1);
      if (ho.gone) { if (ho.alpha > 0) hyperWindow(R, ho.W, fwd2, szE[0] * 0.8, szE[1] * 0.9, HYPER_RED, ho.alpha); return; }
      const e = R.add('enemy_frigate', mat(tmpM, ho.pos, fwd2));
      e.revealZ = ho.revealZ; e.revealDir = ho.dir; e.revealWidth = 1.5; e.tint = [2, 0.3, 0.2]; e.damage = 0.2; e.stretch = stretchOut(ho.u); e.stretchOut = true;
      hyperWindow(R, ho.W, fwd2, szE[0] * 0.8 + 6, szE[1] * 0.9 + 6, HYPER_RED, ho.alpha);
      engineGlows(R, 'enemy_frigate', e, ENEMY_ENGINE, 1, 1);
      return;
    }
    const e = R.add('enemy_frigate', mat(tmpM, pos, st.fwd));
    e.revealZ = rz; e.revealDir = dir; e.revealWidth = 1.5; e.tint = [2, 0.3, 0.2]; e.seed = f.seed; e.stretch = hin.u < 1 ? stretchIn(hin.u) : 0;
    if (f.die) e.damage = sat((t - (f.die - 4)) / 4) * 0.5;
    if (win) hyperWindow(R, win.c, st.fwd, szE[0] * 0.8 + 6, szE[1] * 0.9 + 6, HYPER_RED, win.a);
    engineGlows(R, 'enemy_frigate', e, ENEMY_ENGINE, 1, 0.8);
    GUN.efAlive.push({ i, pos: st.pos, e });
  });

  // ---------------- mass fleets + tracer walls
  drawExtras(R, t);

  // ---------------- dreadnought
  if (t < EARTH_T) drawDreadnought(R, t, tmpM);

  // ---------------- gravity well
  if (!opts.noWell && t < IMPLODE + 0.2) drawWell(R, t, tmpM);

  // ---------------- dogfight
  if (t > 116 && t < 250) drawDogfight(R, t, tmpM);

  // ---------------- combat effects
  drawIonVolleys(R, t);
  drawEnemyFire(R, t);
  drawMissiles(R, t);
}

export function allParts(R, name) {
  const h = {};
  for (const p of R.models[name].parts) h[p.name] = 1;
  h.__all = 1;                      // marker: the whole model is hidden (attached models follow)
  return h;
}

function drawWreck(R, t, t0, pos, seed) {
  const lt = t - t0;
  const tmpM = M.new();
  for (let k = 0; k < 0; k++) {                            // (no foreign wreck chunks)
    const d = randDir([0, 0, 0], seed * 9 + k);
    const p = V.madd([0, 0, 0], pos, d, 8 + lt * (6 + k * 3));
    const e = R.add('debris', matEuler(tmpM, p, lt * 0.3 * (k + 1), lt * 0.2 + k, lt * 0.25 * k, 3.2));
    if (!e) continue;
    e.hidden = debrisOnly(R, 'hull' + k);
    e.damage = 0.45; e.seed = seed + k;
    if (lt < 25) R.fire(p, 6 * Math.max(0.2, 1 - lt / 25), 0.4, seed * 3 + k + Math.floor(t * 3) * 0.1, [1, 1, 1], 1);
  }
}
const _debHidden = {};
export function debrisOnly(R, keepName) {
  if (_debHidden[keepName]) return _debHidden[keepName];
  const h = {};
  for (const p of R.models.debris.parts) if (p.name !== keepName && p.name !== '__root') h[p.name] = 1;
  return (_debHidden[keepName] = h);
}

// the six crown arc terminals (horn tips) in dreadnought model space before the ×1.65 load scale — tools/make_dread_lance.py
const DREAD_HORNS = [[4.503, 2.6, 212.5], [0, 5.2, 212.5], [-4.503, 2.6, 212.5], [-4.503, -2.6, 212.5], [0, -5.2, 212.5], [4.503, -2.6, 212.5]];
// fighter variants (tools: blender/fighters_ours.py / fighters_enemy.py): three designs per side, picked by index
export function fighterModel(enemy, k) { return (enemy ? 'enemy_fighter' : 'interceptor') + ['', '_b', '_c'][((k % 3) + 3) % 3]; }
export function dreadEmitter(R, t, entry) {
  return R.emptyWorld([0, 0, 0], 'enemy_dreadnought', entry, 'lance_emitter');
}

function drawDreadnought(R, t, tmpM) {
  const Ld = modelLen(R, 'enemy_dreadnought'), sz = modelSize(R, 'enemy_dreadnought');
  const pos = dreadPos(t);
  const fwd = [0, 0, 1];
  const hin = hyperIn(t, DREAD_ARRIVE, pos, fwd, Ld, DREAD_EMERGE);
  if (t > 84 && t < DREAD_ARRIVE) { const W0 = V.madd([0, 0, 0], pos, fwd, -Ld * 0.5); const k = easeOut((t - 84) / 1); hyperWindow(R, W0, fwd, (sz[0] * 0.75 + 20) * k, (sz[1] * 0.85 + 20) * k, HYPER_RED, 0.9); }
  if (!hin) return;
  if (t > DREAD_DIE) {
    // a far bigger death: the core blast, a chain of secondary detonations down the hull, an additive white-hot
    // flash sprite that swells and fades (no 1-frame pop), a hard light and an expanding shock ring
    const D = dreadPos(DREAD_DIE), lt = t - DREAD_DIE;
    explosion(R, t, DREAD_DIE, pos, 240, 77, 'huge');
    for (let k = 0; k < 7; k++) {
      const tk = DREAD_DIE + 0.12 + k * 0.17 + hash(k * 3.1) * 0.1;
      const lp = [(hash(k * 2.3 + 1) - 0.5) * sz[0] * 0.8, (hash(k * 4.1 + 1) - 0.5) * sz[1] * 0.8, (k / 6 - 0.5) * Ld * 0.9];
      explosion(R, t, tk, V.add([0, 0, 0], D, lp), 70 + 25 * hash(k), 90 + k, k % 2 ? 'ship' : 'huge');
    }
    if (lt < 3.5) {
      const att = easeOut(sat(lt / 0.12)), dec = Math.exp(-lt * 1.6);
      const k = att * dec;
      R.glow(D, 260 + 520 * easeOut(sat(lt / 0.8)), [5.5 * k, 4.2 * k, 3.0 * k], 1.0);            // white-hot core flash (additive)
      R.glow(D, 500 + 500 * easeOut(sat(lt / 1.6)), [1.4 * k, 0.6 * k, 0.2 * k], 0.7);          // orange bloom
      R.light(D, 3000, [1, 0.75, 0.5], 60 * k);
      if (lt < 2.5) {
        const rr = 60 + 1400 * easeOut(lt / 2.5), a2 = (1 - lt / 2.5);
        R.ring(D, [rr, 0, 0], [0, rr * 0.18, rr * 0.35], [2.2 * a2, 1.3 * a2, 0.7 * a2], lt);
        R.ripple(D, rr * 0.9, [0.4, 0.4, 0.4], a2 * 1.4);
      }
    }
  }
  if (t > DREAD_DIE + 0.4) {
    if (t < EARTH_T) shatter(R, 'enemy_dreadnought', mat(M.new(), dreadPos(DREAD_DIE), [0, 0, 1]), t, DREAD_DIE, 77, [3, 3, 4], 0.7, { tint: [3, 1, 0.3] });
    return;
  }
  const e = R.add('enemy_dreadnought', mat(tmpM, hin.u < 1 ? hin.pos : pos, fwd));
  e.seed = 40;
  if (hin.u < 1) { e.revealZ = hin.revealZ; e.revealDir = hin.dir; e.revealWidth = 4; e.tint = [2.5, 0.3, 0.2]; e.stretch = stretchIn(hin.u); }
  // the gravity-lance firing system (tools/make_dread_lance.py, blueprint blender/DREAD_LANCE_BLUEPRINT.svg)
  const ln = R.add('dread_lance', e.m);
  if (ln) {
    ln.seed = 41; ln.revealZ = e.revealZ; ln.revealDir = e.revealDir; ln.revealWidth = e.revealWidth; ln.tint = e.tint; ln.stretch = e.stretch;
    const ch = t < LANCE_FIRE ? sat((t - 200) / 16) : Math.max(0, 1 - (t - LANCE_FIRE) / 5);
    const g = 0.12 + 1.3 * ch * (0.85 + 0.15 * Math.sin(t * (6 + 20 * ch)));
    const blink = (Math.sin(t * 5) > 0 ? 1 : 0.15) * (0.4 + 0.6 * ch);
    ln.matOverride = { lance_glow: { base: [0.1, 0.02, 0.14], metal: 0, rough: 0.3, emissive: [0.75 * g, 0.25 * g, 1.0 * g] },
      lance_warn: { base: [0.3, 0.02, 0.02], metal: 0, rough: 0.4, emissive: [3 * blink, 0.25 * blink, 0.15 * blink] } };
    GUN.dreadLance = ln;
  }
  if (hin.alpha > 0) hyperWindow(R, hin.W, fwd, sz[0] * 0.75 + 20, sz[1] * 0.85 + 20, HYPER_RED, hin.alpha * 0.9);
  if (t > MAIN_FIRE) {
    e.damage = sat((t - MAIN_FIRE) / 5) * 0.9;
    e.flash = Math.max(0, 1.5 - (t - MAIN_FIRE) * 0.6) * (0.5 + 0.5 * Math.sin(t * 40));
    for (let k = 0; k < 7; k++) {
      const tk = MAIN_FIRE + 1.5 + k * 0.62;
      const lp = [(hash(k * 2.3) - 0.5) * sz[0] * 0.6, (hash(k * 4.1) - 0.5) * sz[1] * 0.6, (hash(k * 6.7) - 0.5) * Ld * 0.8];
      explosion(R, t, tk, M.transformPoint([0, 0, 0], e.m, lp), 40 + k * 5, 60 + k, 'ship');
    }
  }
  engineGlows(R, 'enemy_dreadnought', e, ENEMY_ENGINE, 1.2, 0.8);
  GUN.dread = e;
  // gravity lance charge & fire
  if (t > 200 && t < LANCE_FIRE + 6) {
    const em = dreadEmitter(R, t, e);
    const ch = sat((t - 200) / 16);
    const pulse = 0.8 + 0.2 * Math.sin(t * (10 + ch * 30));
    const k = t < LANCE_FIRE ? ch : Math.max(0, 1 - (t - LANCE_FIRE) / 6);
    R.glow(em, (8 + 30 * k) * pulse, [LANCE_COL[0] * 0.9 * k, LANCE_COL[1] * 0.9 * k, LANCE_COL[2] * 0.9 * k], 0.5);   // toned down: the machinery and the arcs must read
    R.glow(em, (3 + 12 * k), [2 * k, 2 * k, 2.6 * k], 0.3);
    R.light(em, 600, LANCE_COL, 6 * k);
    if (t < LANCE_FIRE) {
      const aim = V.norm([0, 0, 0], V.sub([0, 0, 0], motherPoint([0, 0, 0], t, LANCE_HIT), em));
      const u1 = V.norm([0, 0, 0], V.cross([0, 0, 0], aim, [0, 1, 0])), u2 = V.cross([0, 0, 0], u1, aim);
      // accelerating inflow from all around
      chargeInflow(R, t, 200, LANCE_FIRE - 200, em, 360, 200, LANCE_COL, 2.5, 13, 1.1, 77);
      // (the coil stack is real geometry now — dread_lance.glb — its apertures glow via matOverride)
      // ARC DISCHARGE (shader lightning, sprite 12): the six crown terminals arc to each other and into the core,
      // the coil stack flashes over to the guide rails; density, reach and rate climb with the charge
      const tipW = (k) => M.transformPoint([0, 0, 0], e.m, DREAD_HORNS[k].map((v) => v * 1.65));
      const AC = [LANCE_COL[0] * 1.6, LANCE_COL[1] * 1.3, LANCE_COL[2] * 1.8];
      for (let k = 0; k < 6; k++) {
        const on = ch > 0.08 + k * 0.05;
        if (!on) continue;
        const a = tipW(k), b = tipW((k + 1) % 6);
        R.arc(a, b, 3.2, AC, 0.9 * ch, 11 + k, 7 + 7 * ch);                          // terminal to terminal round the crown
        if (ch > 0.35) R.arc(a, em, 4.5, AC, 1.1 * ch, 31 + k, 9 + 9 * ch);         // terminal into the core
        if (ch > 0.7 && k % 2 === 0) R.arc(a, tipW((k + 3) % 6), 6, AC, 0.8 * ch, 51 + k, 12);   // across the crown
      }
      for (let j = 0; j < 6; j++) {                                                    // coil stack flash-overs to the rails
        if (ch < 0.25 + j * 0.1) continue;
        const z = [100, 124, 148, 170, 190, 136][j] * 1.65, r = (12 - ([100, 124, 148, 170, 190, 136][j] - 100) * 0.03 + 2) * 1.65;
        const sgn = j % 2 ? 1 : -1, ang = hash(Math.floor(t * 3 + j)) * 6.283;
        const p0 = M.transformPoint([0, 0, 0], e.m, [Math.cos(ang) * r, Math.sin(ang) * r, z]);
        const p1 = M.transformPoint([0, 0, 0], e.m, [0, sgn * 14 * 1.65, z + (hash(j + 3) - 0.5) * 12]);
        R.arc(p0, p1, 5, AC, 0.7 * ch, 71 + j, 6 + 6 * ch);
      }
      // spiral vortex contracting into the core
      for (let j = 0; j < 36; j++) {
        const ph = ((t - 200) * (0.6 + 2.4 * ch) + j / 36) % 1;
        const ang = j * 2.4 + ph * 9;
        const r = 90 * (1 - ph);
        const p = V.madd([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], em, u1, Math.cos(ang) * r), u2, Math.sin(ang) * r), aim, -r * 0.4);
        R.glow(p, 1.2 + 2 * ph, [LANCE_COL[0] * 2 * ph * ch, LANCE_COL[1] * 2 * ph * ch, LANCE_COL[2] * 2 * ph * ch], 0.4);
      }
      // layered core: white-hot heart + violet corona, and refraction pulses at an accelerating rhythm
      R.glow(em, 3 + 7 * ch, [2.4 * ch, 2.2 * ch, 2.8 * ch], 0.25);
      const pulseP = (t - 200) * (1 + 5 * ch * ch);
      const pa = pulseP % 1;
      R.ripple(em, 20 + 90 * pa, [0.4, 0.2, 0.5], (1 - pa) * 0.9 * ch);
    }
  }
}

function drawWell(R, t, tmpM) {
  const on = smooth(62, 78, t);
  const tmp = M.new();
  const e = R.add('gravity_well', matEuler(tmpM, WELL, 0, Math.PI, 0, 1));
  if (!e) return;
  e.pose = { ring: [0, 0, t * 0.25 * (0.3 + on)], pylons: [0, 0, -t * 0.05] };
  e.emissive = 0.05 + on * 0.18;    // dark machine: no neon
  e.matOverride = { violet: { base: [0.05, 0.05, 0.06], metal: 0.8, rough: 0.4, emissive: [0.35 * on, 0.3 * on, 0.28 * on] } };
  e.seed = 9;
  if (t > 273) {                                  // crumpled in by the mace blow, caving further as it collapses
    const c = [WELL[0], WELL[1] - 4, WELL[2] - 22];
    e.crush = [c[0], c[1], c[2], 34, 0.7 * (1 - Math.exp(-(t - 273) * 14)) + 0.7 * smooth(273.4, 279.5, t), 0, 0.05];
  }
  if (t > 272.5) {
    e.damage = sat((t - 272.5) / 4);
    e.flash = Math.max(0, 1 - (t - 272.8) * 2) * 2;
  }
  R.light(WELL, 1200, [0.9, 0.8, 0.75], 1.2 * on);
}

// ---------------- dogfight
function dogPast(k, lag, t) {
  return (tau) => {
    const tt = t - lag - tau, p = fighterPos([0, 0, 0], k, tt), q = fighterPos([0, 0, 0], k, tt + 0.05);
    return { m: mat(new Float32Array(16), p, V.sub([0, 0, 0], q, p), [0, 1, 0], Math.sin(tt * 1.3 + k + (lag ? 1 : 0)) * (lag ? 0.5 : 0.6)) };
  };
}
function drawDogfight(R, t, tmpM) {
  const fade = smooth(116, 120, t) * (1 - smooth(236, 248, t));
  const a = [0, 0, 0], b = [0, 0, 0], v = [0, 0, 0];
  GUN.pairs = [];
  for (let k = 0; k < PAIRS.length; k++) {
    const p = PAIRS[k];
    const launch = 116 + k * 0.35;
    if (t < launch) continue;
    fighterPos(a, k, t);           // target
    fighterPos(b, k, t - 0.9);     // chaser
    const hiChase = p.hiigChases;
    const targetName = fighterModel(hiChase, k);
    const chaserName = fighterModel(!hiChase, k + 1);
    const alive = t < p.die;
    // velocity for orientation
    fighterPos(v, k, t + 0.05); V.sub(v, v, a);
    if (alive) {
      const e = R.add(targetName, mat(tmpM, a, v, [0, 1, 0], Math.sin(t * 1.3 + k) * 0.6));
      engineGlows(R, targetName, e, hiChase ? ENEMY_ENGINE : HIIG_ENGINE, 0.6, 1, 2.5, { past: dogPast(k, 0, t) });
    } else explosion(R, t, p.die, fighterPos([0, 0, 0], k, p.die), 7, 200 + k, 'small');
    fighterPos(v, k, t - 0.85); V.sub(v, v, b);
    const ce = R.add(chaserName, mat(tmpM, b, v, [0, 1, 0], Math.sin(t * 1.1 + k + 1) * 0.5));
    engineGlows(R, chaserName, ce, hiChase ? HIIG_ENGINE : ENEMY_ENGINE, 0.6, 1, 2.5, { past: dogPast(k, 0.9, t) });
    GUN.pairs[k] = { target: [...a], chaser: [...b], alive };
    // tracer bursts
    const col = hiChase ? [0.5, 1.1, 3.0] : [3.0, 0.55, 0.35];
    for (let burst = Math.floor((t - 1.2) / 3.3) * 3; burst <= Math.floor(t / 3.3) * 3; burst += 3) {   // sparse
      for (let s = 0; s < 5; s++) {
        const tf = burst * 1.1 + s * 0.07 + hash(k * 17 + burst) * 0.3;
        if (tf > p.die || tf < launch) continue;
        const from = fighterPos([0, 0, 0], k, tf - 0.9);
        const to = fighterPos([0, 0, 0], k, tf + 0.25);
        to[0] += (hash(tf * 3) - 0.5) * 8; to[1] += (hash(tf * 5) - 0.5) * 8;
        bolt(R, t, tf, tf + 0.3, from, to, 10, 0.35, [col[0] * fade, col[1] * fade, col[2] * fade], 1.3);
      }
    }
  }
}

// ---------------- ion cannon volleys
export const VOLLEYS = [
  // [t0, t1, frigate, target enemy index]  t0 < 280: the charge FAILS (the well drains the coils; no beam leaves the muzzle)
  [120, 123.6, 0, 0], [120.1, 123.4, 2, 0], [120.05, 123.5, 1, 1], [120.15, 123.3, 3, 1],
  [129, 132.5, 0, 2], [129.3, 132, 2, 3], [136, 139, 3, 2], [150.5, 153.5, 2, 3], [165, 168, 0, 4], [182, 185, 1, 6],
  // after the well collapses the coils hold again: the volleys land and the enemy frigates die (EF[].die)
  [288.9, 290.6, 0, 0], [289.0, 290.5, 2, 0], [292.5, 294.2, 1, 1], [292.6, 294.1, 3, 1],
  [297.0, 298.7, 0, 2], [297.1, 298.6, 2, 2], [303.5, 305.2, 1, 3], [303.6, 305.1, 3, 3],
];
export const VOLLEY_FAILS = (t0) => t0 < 280;
export function ionMuzzle(R, t, i) {
  const e = GUN.ionEntries && GUN.ionEntries[i];
  const st = ionFrigate(t, i);
  if (e) {
    const p = emitWorld(R, 'ion_frigate', e, 'muzzle');
    if (p) return p;
  }
  return V.madd([0, 0, 0], st.pos, st.fwd, modelLen(R, 'ion_frigate') * 0.5);
}
// the gravity well steals the charge: energy streams OUT of the muzzle and bends away toward the well
export function drainOutflow(R, t, t0, from, k, seed) {
  // the charge is SUCKED OUT toward the gravity well: filaments peel off the coils, swing out, then bend onto the well
  // line and accelerate away down it, stretching as they go (quadratic Bézier: muzzle → swing-out → 1.1 km down the line)
  if (k <= 0.01) return;
  const toWell = V.norm([0, 0, 0], V.sub([0, 0, 0], WELL, from));
  const P = (a, b, c, u) => { const w = 1 - u; return [w * w * a[0] + 2 * w * u * b[0] + u * u * c[0], w * w * a[1] + 2 * w * u * b[1] + u * u * c[1], w * w * a[2] + 2 * w * u * b[2] + u * u * c[2]]; };
  const end = V.madd([0, 0, 0], from, toWell, 1100);
  for (let s = 0; s < 30; s++) {
    const hs = hash(s * 1.7 + seed), hs2 = hash(s * 3.1 + seed + 5);
    const ph = ((t - t0) * (0.55 + hs * 0.5) + hs2) % 1;
    const d0 = randDir([0, 0, 0], s * 5.1 + seed * 3.3);
    const a = V.madd([0, 0, 0], from, d0, 4 + 5 * hs);
    const b = V.madd([0, 0, 0], V.madd([0, 0, 0], from, d0, 30 + 40 * hs2), toWell, 90);
    const u = Math.pow(ph, 1.8), du = 0.015 + 0.09 * u;                 // accelerating, stretching
    const head = P(a, b, end, u), tail = P(a, b, end, Math.max(0, u - du)), mid = P(a, b, end, Math.max(0, u - du * 0.5));
    const fade = Math.min(1, ph * 8) * (1 - Math.pow(ph, 3));
    const br = 2.6 * k * fade;
    R.beam(tail, mid, 0.6 + 1.2 * u, [0.4 * br, 0.8 * br, 2.0 * br], 1, 10);
    R.beam(mid, head, 0.9 + 1.8 * u, [0.6 * br, 1.0 * br, 2.4 * br], 1, 10);
  }
  R.glow(V.madd([0, 0, 0], from, toWell, 25), 14 * k, [0.3 * k, 0.6 * k, 1.4 * k], 0.6);   // the leak at the mouth
}
// ION CANNON CHARGE, following the frigate's real gun (blender/ION_FRIGATE_DESIGN.md, model space, nose +z):
// the four accelerator stages (z 6.8…23.2, three copper coils each, r 1.65, barrel axis y 0.9) wake one after
// another from the breech forward, arcs jump from each stage's capacitor modules onto its coils, energy pulses race
// up the barrel, and the charge gathers into a plasma core INSIDE the muzzle bore (z ≈ 30.6). c: 0..1 charge,
// fail: the stages die back from the muzzle and the core bleeds away (the well drains it)
const ION_BORE = [0, 0.9, 30.6];
export function ionCharge(R, e, t, c, fail, seed) {
  if (!e || c <= 0.005) return;
  const P = (x, y, z) => M.transformPoint([0, 0, 0], e.m, [x, y, z]);
  const ax = V.norm([0, 0, 0], M.transformDir([0, 0, 0], e.m, [0, 0, 1])), up = V.norm([0, 0, 0], M.transformDir([0, 0, 0], e.m, [0, 1, 0]));
  const sd = V.cross([0, 0, 0], ax, up);
  const CC = [0.45, 0.85, 2.2];
  for (let k = 0; k < 4; k++) {
    const on = sat((c - k * 0.16) / 0.2);                                   // breech first, then forward
    if (on <= 0) continue;
    const zc = 6.8 + 4.1 * (k + 0.5);
    for (let j = -1; j <= 1; j++) {                                          // the stage's three coils
      const z = zc + j;
      const wave = 0.55 + 0.45 * Math.sin(t * (9 + 10 * c) - k * 1.3 - j * 0.6);
      const b = on * wave * (fail ? 0.7 + 0.3 * Math.sin(t * 31 + k + j) : 1) * 1.6;
      const r = 1.85;
      R.ring(P(0, 0.9, z), V.scale([0, 0, 0], sd, r), V.scale([0, 0, 0], up, r), [CC[0] * b, CC[1] * b, CC[2] * b], 0.6);
    }
    if (on > 0.4) for (const sx of [1, -1]) {                               // capacitor module → coil flash-over
      const a = P(sx * 2.6, -0.2, zc + (hash(k + sx + Math.floor(t * 5)) - 0.5) * 2.4), b2 = P(sx * 1.4, 0.9, zc + (hash(k * 3 + sx + Math.floor(t * 5)) - 0.5) * 2);
      R.arc(a, b2, 0.9, [0.5, 0.9, 2.2], 0.7 * on, seed + k * 3 + (sx > 0 ? 1 : 2), 10 + 8 * c);
    }
  }
  // energy pulses racing up the barrel into the focusing section and the bore
  for (let q = 0; q < 6; q++) {
    const ph = ((t * (0.9 + 1.6 * c) + q / 6) % 1);
    const z = 7 + ph * 23.5, len = 1.2 + 3 * c;
    const bb = c * (1 - ph * 0.3) * 1.6;
    R.beam(P(0, 0.9, z - len), P(0, 0.9, z), 0.55 + 0.4 * c, [CC[0] * bb, CC[1] * bb, CC[2] * bb], 1, 20, 0.3, 1);
  }
  // the plasma core forming inside the muzzle bore (it never floats in front of the gun)
  const core = P(ION_BORE[0], ION_BORE[1], ION_BORE[2]);
  const pk = c * (0.85 + 0.15 * Math.sin(t * (14 + 30 * c)));
  R.glow(core, 0.8 + 2.2 * c, [2.6 * pk, 3.0 * pk, 4.0 * pk], 0.3);
  R.glow(core, 3 + 7 * c, [0.35 * pk, 0.7 * pk, 1.8 * pk], 0.7);
  R.light(core, 60, ION_COL, 5 * c);
  if (!fail) chargeInflow(R, t, t - 1, 1, core, 22, 26, [0.5, 0.9, 2], 4, 14, 0.25, seed);   // gathered from right around the crown
}
function drawIonVolleys(R, t) {
  for (const [t0, t1, fi, ti] of VOLLEYS) {
    if (t < t0 - 3 || t > t1 + 0.6) continue;
    const from = ionMuzzle(R, t < t0 ? t : t0, fi);
    if (VOLLEY_FAILS(t0)) {                                   // failed charge: builds, stalls and sputters, then bleeds away
      const c = 0.75 * sat((t - (t0 - 3)) / 1.1) * (1 - smooth(t0 - 2.0, t0 + 0.1, t));
      ionCharge(R, GUN.ionEntries && GUN.ionEntries[fi], t, c, true, fi * 7 + 3);                // stages wake, then die back…
      drainOutflow(R, t, t0 - 2.1, from, smooth(t0 - 2.1, t0 - 1.5, t) * (1 - smooth(t0 + 1.2, t1, t)), fi * 5 + t0);   // …then sucked out toward the well
      if (t > t0 && t < t0 + 0.5) { const sp = Math.exp(-(t - t0) * 6); R.glow(from, 6 * sp, [0.6 * sp, 0.9 * sp, 1.8 * sp], 0.5); }   // a feeble spit, nothing leaves
      continue;
    }
    // charge glow
    if (t < t0) {
      const c = sat((t - (t0 - 3)) / 3);
      ionCharge(R, GUN.ionEntries && GUN.ionEntries[fi], t, c, false, fi * 7 + 3);
      continue;
    }
    // the beam is locked at the moment of firing: muzzle and aim point never move afterwards
    const f = EF[ti];
    if (f.die && t0 > f.die) continue;
    const to = V.add([0, 0, 0], enemyFrigate(t0, ti).pos, [Math.sin(t0 * 7 + fi) * 6, Math.cos(t0 * 5 + fi) * 6, 0]);
    const env = Math.min(1, (t - t0) / 0.12) * (t > t1 ? Math.max(0, 1 - (t - t1) / 0.5) : 1);
    const w = 1.6 * env * (1 + 0.15 * Math.sin(t * 50));
    R.beam(from, to, w * 2.0, [ION_COL[0] * env, ION_COL[1] * env, ION_COL[2] * env], 1.2, 40, 1.2, 1);
    R.beam(from, to, w * 4.5, [ION_COL[0] * 0.06 * env, ION_COL[1] * 0.06 * env, ION_COL[2] * 0.08 * env], 1, 3, 0.5, 0.6);
    R.glow(from, 10 * env, [1.2 * env, 1.8 * env, 3 * env], 0.6);
    // impact on shields/hull
    R.glow(to, 18 * env * (0.8 + 0.2 * Math.sin(t * 60)), [1.5 * env, 2 * env, 3.5 * env], 0.9);
    R.light(to, 400, ION_COL, 10 * env);
    R.light(from, 200, ION_COL, 5 * env);
    for (let s = 0; s < 10; s++) {
      const ph = ((t * 3 + hash(s + fi * 7)) % 1);
      const d = randDir([0, 0, 0], s * 3.3 + Math.floor(t * 3 + hash(s + fi * 7)) * 7.7 + fi);
      const p0 = V.madd([0, 0, 0], to, d, 4 + ph * 60);
      const p1 = V.madd([0, 0, 0], to, d, 4 + ph * 60 - 10);
      const k = (1 - ph) * 3 * env;
      R.beam(p1, p0, 0.5, [k, k * 0.9, k * 1.4], 1, 10);
    }
  }
}

// ---------------- enemy fire (pulse lasers at the hiigaran fleet)
function drawEnemyFire(R, t) {
  return;   // replaced by the sparse shared ion schedule (ionfire.js)
  if (t < 104 || t > 312) return;
  const targets = [];
  for (let i = 0; i < 4; i++) targets.push(ionFrigate(t, i).pos);
  for (let i = 0; i < 4; i++) targets.push(assaultFrigate(t, i).pos);
  targets.push([30, 0, -150], [-40, 10, -60]);
  EF.forEach((f, i) => {
    if (t < f.arrive + 6) return;
    if (f.die && t > f.die) return;
    if (f.flee && t > f.flee - 6) return;
    const st = enemyFrigate(t, i);
    const period = 0.9;
    const kNow = Math.floor((t - 104) / period);
    for (let k = kNow - 3; k <= kNow; k++) {
      if (k < 0) continue;
      const tf = 104 + k * period + hash(i * 31 + k) * 0.4;
      const tgt = targets[Math.floor(hash(i * 7 + k * 3) * targets.length)];
      const from = V.madd([0, 0, 0], st.pos, [0, 0, 1], 25);
      const d = V.dist(from, tgt);
      const dur = d / 1100;
      const miss = [(hash(k + i) - 0.5) * 40, (hash(k * 2 + i) - 0.5) * 30, 0];
      const to = V.add([0, 0, 0], tgt, miss);
      const u = bolt(R, t, tf, tf + dur, from, to, 50, 1.4, [3, 0.5, 0.25], 1.5);
      if (u >= 0 && u < 0.1) R.glow(from, 12, [3, 0.8, 0.3], 0.6);
      hitFlash(R, t, tf + dur, to, 10, [0.8, 0.6, 1.8]);
    }
  });
}

// ---------------- missiles from assault frigates -> EF2 at ~141
export const MISSILES = [];
for (let k = 0; k < 16; k++) MISSILES.push({ from: k % 4, t0: 136 + (k % 8) * 0.18 + (k >= 8 ? 5.8 : 0), dur: 4.4 + hash(k) * 0.6, target: k >= 8 ? 3 : 2, seed: k });
// the enemy's point defence swats every missile down short of its target (no counterattack gets through)
const missileEnd = (m) => 0.45 + hash(m.seed * 3.9 + 1) * 0.3;
export function missilePos(R, t, m) {
  const u = (t - m.t0) / m.dur;
  if (u < 0 || u > missileEnd(m)) return null;
  const a = assaultFrigate(m.t0, m.from).pos;
  const b = enemyFrigate(m.t0 + m.dur, m.target).pos;
  const c1 = V.add([0, 0, 0], a, [(hash(m.seed) - 0.5) * 300, 80 + hash(m.seed + 1) * 160, -120]);
  const c2 = V.add([0, 0, 0], b, [(hash(m.seed + 2) - 0.5) * 260, (hash(m.seed + 3) - 0.5) * 200, 300]);
  const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65;
  const i = 1 - e;
  return [
    i * i * i * a[0] + 3 * i * i * e * c1[0] + 3 * i * e * e * c2[0] + e * e * e * b[0],
    i * i * i * a[1] + 3 * i * i * e * c1[1] + 3 * i * e * e * c2[1] + e * e * e * b[1],
    i * i * i * a[2] + 3 * i * i * e * c1[2] + 3 * i * e * e * c2[2] + e * e * e * b[2],
  ];
}
function drawMissiles(R, t) {
  for (const m of MISSILES) {
    if (t < m.t0 || t > m.t0 + m.dur * missileEnd(m) + 3) continue;
    const p = missilePos(R, t, m);
    if (p) {
      R.glow(p, 5, [3, 2.2, 1.2], 0.5);
      trail(R, t, (tt) => (tt >= m.t0 ? missilePos(R, tt, m) : null), 1.6, 18, 3, [0.25, 0.25, 0.28], false, m.seed * 10);
    } else {
      const te = m.t0 + m.dur * missileEnd(m);
      const hitp = missilePos(R, te - 0.001, m);
      if (hitp) explosion(R, t, te, hitp, 6, 300 + m.seed, 'small');
    }
  }
}

// every hyperspace event with the time its sound should land (the visual 'snap'): arrivals snap back at +0.6 s of the
// 1 s hyperIn; departures stretch and vanish around +0.4 s of hyperOut. size: 3 flagship/dreadnought, 2 frigate, 1 line ship
export function warpSchedule() {
  const ev = [];
  const inn = (t, size) => ev.push({ t: t + 0.6, dir: 'in', size });
  const out = (t, size) => ev.push({ t: t + 0.4, dir: 'out', size });
  inn(MOTHER_ARRIVE, 3); inn(DREAD_ARRIVE, 3);
  for (const f of IONF) inn(f.arrive, 2);
  for (const f of ASF) inn(f.arrive, 2);
  for (const f of EF) { inn(f.arrive, 2); if (f.flee) out(f.flee, 2); }
  for (const f of EXTRA_H) inn(f.arrive, 1);
  for (const f of EXTRA_E) { inn(f.arrive, 1); if (f.flee) out(f.flee, 1); }
  for (const f of [...IONF, ...ASF]) { const j = jumpTimes(f.seed); out(j.d, 2); inn(j.a, 2); }
  for (const f of EXTRA_H) { if (f.die) continue; const j = jumpTimes(f.seed); out(j.d, 1); inn(j.a, 1); }
  out(345.6, 3); inn(348.0, 3);
  return ev.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ EVE-style mass fleets + tracer walls
// Extra line ships on both sides (pure functions of t like everything else).
export const EXTRA_H = [];
for (let i = 0; i < 18; i++) {
  const row = i % 3, col = Math.floor(i / 3);
  EXTRA_H.push({
    p: [(col - 2.5) * 150 + (hash(i * 3.1) - 0.5) * 60, (row - 1) * 110 + (hash(i * 5.3) - 0.5) * 40, 60 + row * 120 + hash(i * 7.7) * 160],
    type: i % 3 === 1 ? 'assault_frigate' : 'ion_frigate', arrive: 41 + i * 0.45, depart: null, seed: 30 + i,
  });
}
export const EXTRA_E = [];
const E_DIE = [288.4, 290.9, 292.2, 294.6, 296.3, 299.1, 301.8, 303.4, 306.1, 308.3];   // the counterattack after the well dies
for (let i = 0; i < 22; i++) {
  const row = i % 4, col = Math.floor(i / 4);
  EXTRA_E.push({
    p: [(col - 2.5) * 190 + (hash(i * 2.3) - 0.5) * 80, (row - 1.5) * 120 + (hash(i * 4.9) - 0.5) * 50, -1080 - row * 110 - hash(i * 6.1) * 260],
    arrive: 81.2 + i * 0.13, die: E_DIE[i] ?? null, flee: E_DIE[i] ? null : 311.5 + (i % 5) * 1.1, seed: 60 + i,
  });
}
// keep the extra line ships clear of the named frigates (avoid "twin" ships reading as duplicates)
for (const f of EXTRA_H) {
  for (let it = 0; it < 6; it++) {
    const near = [...IONF, ...ASF].find((g) => V.dist(g.p, f.p) < 110);
    if (!near) break;
    const d = V.norm([0, 0, 0], V.sub([0, 0, 0], f.p, near.p));
    V.madd(f.p, near.p, d, 115);
  }
  // and clear of the (enlarged, 637 m × 270 m) flagship hull around the origin
  if (Math.abs(f.p[0]) < 185 && Math.abs(f.p[2]) < 470 && f.p[1] > -90 && f.p[1] < 150) f.p[0] = (f.p[0] < 0 ? -1 : 1) * (185 + Math.abs(f.p[0]) * 0.3);
}
const H_FEATURED_T = [124.4, 130.6, 144.6, 149.4];
export const H_FEATURED = [];
// our losses: most line ships die when the SECOND enemy ion bolt lands on them (so every kill is a visible hit)
{
  const hits = EXTRA_H.map(() => []);
  for (const sh of ION_SHOTS) {
    if (sh.side !== 'E' || sh.t > 245) continue;
    const i = sh.target;
    if (sh.t < EXTRA_H[i].arrive + 2) continue;
    const d = V.dist(extraEPos(sh.t, sh.shooter).pos, extraHPos(sh.t, i).pos);
    hits[i].push(sh.t + d / ION_BOLT_SPEED);
  }
  // featured deaths the cameras cut to (shots.js H_FEATURED): the hit landing nearest each time kills that ship
  for (const T of H_FEATURED_T) {
    let best = -1, bt = 0;
    hits.forEach((hs, i) => { if (EXTRA_H[i].die) return; for (const x of hs) if (Math.abs(x - T) < Math.abs(bt - T) || best < 0) { if (Math.abs(x - T) < 1.2) { best = i; bt = x; } } });
    if (best < 0) continue;
    EXTRA_H[best].die = bt; H_FEATURED.push({ t: bt, i: best });
  }
  EXTRA_H.forEach((f, i) => { if (!f.die && hash(i * 4.7 + 2) < 0.9 && hits[i].length >= 2) f.die = hits[i][1]; });
}
export function extraHAlive(t, i) { const f = EXTRA_H[i]; return t >= f.arrive + 2 && !(f.die && t > f.die); }
export function extraHPos(t, i) {
  const f = EXTRA_H[i];
  const yaw = frigateYaw(t - 0.3 * (i % 5));
  return { pos: V.add([0, 0, 0], V.add([0, 0, 0], f.p, [Math.sin(t * 0.2 + i) * 2, Math.sin(t * 0.17 + i) * 1.5, 0]), homeOffset([0, 0, 0], t + (i % 4) * 0.6)), fwd: yawDir(yaw) };
}
export function extraEPos(t, i) {
  const f = EXTRA_E[i];
  return { pos: V.add([0, 0, 0], f.p, [Math.sin(t * 0.23 + i) * 3, Math.sin(t * 0.2 + i) * 2, t > 105 ? (t - 105) * 1.5 : 0]), fwd: [0, 0, 1] };
}
export function extraEAlive(t, i) {
  const f = EXTRA_E[i];
  return t >= f.arrive + 2 && !(f.die && t > f.die) && !(f.flee && t > f.flee);
}

export function drawExtras(R, t) {
  const tmpM = M.new();
  EXTRA_H.forEach((f, i) => {
    const st = extraHPos(t, i);
    const L = modelLen(R, f.type), sz = modelSize(R, f.type);
    const hin = hyperIn(t, f.arrive, st.pos, st.fwd, L);
    if (!hin) return;
    let pos = hin.u < 1 ? hin.pos : st.pos, rz = hin.revealZ, dir = hin.dir, win = hin.alpha > 0 ? { c: hin.W, a: hin.alpha } : null;
    let str = hin.u < 1 ? stretchIn(hin.u) : 0;
    if (f.die && t > f.die - 0.1) {                          // killed: breaks apart in a fireball, burning pieces drift
      explosion(R, t, f.die, st.pos, 48, 950 + i, 'ship');
      explosion(R, t, f.die + 0.5, V.add([0, 0, 0], st.pos, [12, 8, -20]), 20, 970 + i, 'small');
      if (t > f.die + 0.2) { if (t < EARTH_T) shatter(R, f.type, mat(M.new(), extraHPos(f.die, i).pos, extraHPos(f.die, i).fwd), t, f.die, 60 + i, [2, 2, 3], 1.1, { tint: [0.4, 0.7, 1] }); return; }
    }
    const js = jumpState(t, f.seed, st.pos, st.fwd, L);
    if (js) {
      if (js.win) hyperWindow(R, js.win.c, st.fwd, sz[0] * 0.8, sz[1] * 0.9, HYPER_BLUE, js.win.a);
      if (js.gone) return;
      pos = js.pos; rz = js.rz; dir = js.dir; win = null; str = js.st || 0;
    }
    const e = R.add(f.type, mat(tmpM, pos, st.fwd));
    if (!e) return;
    e.revealZ = rz; e.revealDir = dir; e.revealWidth = 1.5; e.seed = f.seed; e.stretch = str;
    if (t > 218) e.damage = 0.15 * hash(i);
    if (f.die) e.damage = Math.max(e.damage, sat((t - (f.die - 6)) / 6) * 0.55);   // burning before it goes
    if (win) hyperWindow(R, win.c, st.fwd, sz[0] * 0.8 + 6, sz[1] * 0.9 + 6, HYPER_BLUE, win.a);
    engineGlows(R, f.type, e, HIIG_ENGINE, 1, 0.6);
  });
  const Le = modelLen(R, 'enemy_frigate'), szE = modelSize(R, 'enemy_frigate');
  EXTRA_E.forEach((f, i) => {
    if (t >= EARTH_T) return;
    const st = extraEPos(t, i);
    const hin = hyperIn(t, f.arrive, st.pos, st.fwd, Le, 1);
    if (!hin) return;
    if (f.die) {
      explosion(R, t, f.die, st.pos, 42, 900 + i, 'ship');
      if (t > f.die + 0.25) { if (t < EARTH_T) shatter(R, 'enemy_frigate', mat(M.new(), extraEPos(f.die, i).pos, [0, 0, 1]), t, f.die, 40 + i, [2, 1, 3], 1.2, { tint: [2, 0.3, 0.2] }); return; }
    }
    if (f.flee && t > f.flee) {
      const ho = hyperOut(t, f.flee, st.pos, st.fwd, Le, 1);          // along the current heading
      if (ho.alpha > 0) hyperWindow(R, ho.W, st.fwd, szE[0] * 0.8, szE[1] * 0.9, HYPER_RED, ho.alpha);
      if (ho.gone) return;
      const e = R.add('enemy_frigate', mat(tmpM, ho.pos, st.fwd));
      e.revealZ = ho.revealZ; e.revealDir = ho.dir; e.revealWidth = 1.5; e.tint = [2, 0.3, 0.2]; e.stretch = stretchOut(ho.u); e.stretchOut = true;
      return;
    }
    const e = R.add('enemy_frigate', mat(tmpM, hin.u < 1 ? hin.pos : st.pos, st.fwd));
    if (!e) return;
    e.revealZ = hin.revealZ; e.revealDir = hin.dir; e.revealWidth = 1.5; e.tint = [2, 0.3, 0.2]; e.seed = f.seed; e.stretch = hin.u < 1 ? stretchIn(hin.u) : 0;
    if (f.die) e.damage = sat((t - (f.die - 5)) / 5) * 0.5;
    if (hin.alpha > 0) hyperWindow(R, hin.W, st.fwd, szE[0] * 0.8 + 6, szE[1] * 0.9 + 6, HYPER_RED, hin.alpha);
    engineGlows(R, 'enemy_frigate', e, ENEMY_ENGINE, 1, 0.8);
  });
  drawTracerWalls(R, t);
}

// Autocannon/railgun tracer streams between the lines (the EVE look: walls of yellow fire).
const _a = [0, 0, 0], _b = [0, 0, 0];
function drawTracerWalls(R, t) {
  // sparse, heavy ion bolts from the shared schedule (each one has a matching sound in audio.js)
  for (const sh of ION_SHOTS) {
    if (t < sh.t || t > sh.t + 2.2) continue;
    const H = sh.side === 'H';
    const from = H ? extraHPos(sh.t, sh.shooter).pos : extraEPos(sh.t, sh.shooter).pos;
    if (!H && !extraEAlive(sh.t, sh.shooter)) continue;
    if (H && !extraEAlive(sh.t, sh.target)) continue;
    if (H && !extraHAlive(sh.t, sh.shooter)) continue;
    if (!H && EXTRA_H[sh.target].die && sh.t > EXTRA_H[sh.target].die) continue;
    const to = H ? extraEPos(sh.t, sh.target).pos : extraHPos(sh.t, sh.target).pos;
    V.add(_a, from, [0, 0, H ? -20 : 20]);
    V.add(_b, to, [(h01(sh.t) - 0.5) * 30, (h01(sh.t + 1) - 0.5) * 20, 0]);
    const dur = V.dist(_a, _b) / ION_BOLT_SPEED;
    const col = H ? [0.6, 1.3, 3.4] : [3.4, 0.7, 0.4];
    for (let b = 0; b < sh.burst; b++) {
      const ts = sh.t + b * 0.22;
      const u = bolt(R, t, ts, ts + dur, _a, _b, 55, 1.7, col, 1.6);
      if (u >= 0 && t - ts < 0.35) { const mf = Math.exp(-(t - ts) * 9); R.glow(_a, 9, [col[0] * 0.9 * mf, col[1] * 0.9 * mf, col[2] * 0.9 * mf], 0.4); R.light(_a, 120, col, 3 * mf); }   // muzzle glow decays (no 1-frame pop)
      hitFlash(R, t, ts + dur, _b, 14, H ? [0.8, 0.9, 1.6] : [1.6, 0.7, 0.4]);
    }
  }
}
const h01 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
