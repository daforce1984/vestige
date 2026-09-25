// Shot list: camera + shot-specific content for every second of the film.
import { M, V, Q, hash, noise1, sat, smooth, ease, easeOut, easeIn, easeInOut, lerp, spline, DEG, clamp } from './math.js';
import { explosion, hyperWindow, engineGlows, emitWorld, bolt, hitFlash, trail, randDir, shatter, chargeInflow } from './fx.js';
import { duelHero, duelEnemy1, duelEnemy2, duelCamera, DUEL_EVENTS, bulletTime, bulletSpeed, DUEL_SHOTS, duelFK, maceWrist, ragdoll, DODGE, dodgeRight, AUTO_FX } from './duel.js';
import { storyT, tearU, FILM_DURATION } from './timemap.js';
import { heartbeatTimes } from './audio-music.js';
let FILM_NOW = 0;
import {
  drawWorld, mat, matEuler, motherMatrix, motherPoint, motherYaw, ionFrigate, assaultFrigate, enemyFrigate, dreadPos, dreadEmitter,
  WELL, DREAD, HANGAR, BC, GC, IONF, ASF, EF, GUN, POSES, blendPose, breathe, gundamLaunchPath, fighterPos, PAIRS,
  HIIG_ENGINE, ENEMY_ENGINE, HYPER_BLUE, HYPER_RED, ION_COL, LANCE_COL, BEAM_PINK, LANCE_FIRE, MAIN_FIRE, IMPLODE, LANCE_HIT, DREAD_DIE,
  modelLen, modelSize, ionMuzzle, missilePos, MISSILES, debrisOnly, allParts, rotY,
  EXTRA_H, EXTRA_E, extraHPos, extraEPos, H_FEATURED, drainOutflow, fighterModel, ionCharge, EARTH_T,
} from './world.js';

export const DURATION = FILM_DURATION;   // film (player) duration; choreography below is in story time
const CP = [GC[0], GC[1] + 25, GC[2]];
const SABER_ORANGE = [2.4, 0.9, 0.25];

// ------------------------------------------------------------------ environment presets
const SUN = V.norm([0, 0, 0], [-0.8, 0.5, 0.25]);
// Earth-like planet placed so the sun sits just past its limb seen from the fleet (sunrise shots)
const PL_R = 0.62;
const PLANET = (() => {
  const down = V.norm([0, 0, 0], V.cross([0, 0, 0], SUN, V.cross([0, 0, 0], [0, -1, 0], SUN)));
  const a = PL_R + 0.1;
  return V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], SUN, Math.cos(a)), V.scale([0, 0, 0], down, Math.sin(a))));
})();
// camera that frames `target` with the planet filling the background
// day side of the disc near the terminator (lit, grey-blue clouds behind the battle like the reference)
// the battle-zone moon sits roughly opposite the sun so its lit face is toward the fleet (reference art)
const MOON = V.norm([0, 0, 0], [-SUN[0] * 0.8 + 0.25, -0.45, -SUN[2] * 0.8 + 0.35]);
const PLANET_DAY = V.norm([0, 0, 0], V.lerp([0, 0, 0], PLANET, SUN, 0.6));
function againstPlanet(c, target, dist, lift, side, fov, roll = 0, lookBias = 0.15, day = false) {
  const P = day ? PLANET_DAY : PLANET;
  const sideV = V.norm([0, 0, 0], V.cross([0, 0, 0], P, [0, 1, 0]));
  const pos = V.add([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], target, P, -dist), sideV, side), [0, lift, 0]);
  const look = V.madd([0, 0, 0], target, P, dist * lookBias);
  camLook(c, pos, look, fov, roll);
}
function spaceEnv(t) {
  return {
    // lighting after the concept-art reference: warm key, cool soft skylight from above, warm bounce from below,
    // slate-blue space haze instead of pure black, gentle contrast
    time: t, sunDir: SUN, sunCol: [1.9, 1.62, 1.25], ambUp: [0.2, 0.25, 0.34], ambDown: [0.16, 0.11, 0.07], ambient: 1,
    rim: [0.55, 0.6, 0.7, 0.3], fill: [0.16, 0.16, 0.17, 0.4], nebula: 0, stars: 0.8, sunDisc: 1,
    sky: [0.010, 0.011, 0.013, 0.6],   // near-neutral: no blue gas in the backdrop
    planet: null,                                    // no moon (only Earth at the end)
    shadows: true, shadowCenter: [0, 0, 0], shadowRadius: 400,
  };
}
function basePost() {
  return {
    exposure: 0.9, bloom: 0.022, ca: 0.0006, grain: 0.008, fade: 1, flash: 0, letterbox: 1, vignette: 0.8,
    distort: 1, streak: 0.22, saturation: 0.9, contrast: 1.08, gradeShadows: [0.92, 0.98, 1.06], gradeHighlights: [1.08, 1.0, 0.9],
    shakeBlur: 0, lensA: null, lensB: null, godray: null,
  };
}

// ------------------------------------------------------------------ camera helpers
function camLook(ctx, pos, target, fov = 45, roll = 0) {
  const c = ctx.cam;
  V.copy(c.pos, pos); V.copy(c.target, target);
  if (ctx.R) ctx.R.camPos = c.pos;                           // fx helpers keep streaks off the lens
  c.fov = fov * DEG;
  const f = V.norm([0, 0, 0], V.sub([0, 0, 0], target, pos));
  const r = V.norm([0, 0, 0], V.cross([0, 0, 0], f, [0, 1, 0]));
  const u = V.cross([0, 0, 0], r, f);
  c.up[0] = u[0] * Math.cos(roll) + r[0] * Math.sin(roll);
  c.up[1] = u[1] * Math.cos(roll) + r[1] * Math.sin(roll);
  c.up[2] = u[2] * Math.cos(roll) + r[2] * Math.sin(roll);
}
function shake(ctx, amt, freq = 8) {
  if (amt <= 0) return;
  const t = ctx.t, c = ctx.cam;
  const d = V.dist(c.pos, c.target);
  const k = amt * d * 0.01;
  c.target[0] += noise1(t * freq) * k; c.target[1] += noise1(t * freq + 37) * k; c.target[2] += noise1(t * freq + 71) * k * 0.5;
  c.pos[0] += noise1(t * freq * 0.7 + 11) * k * 0.3; c.pos[1] += noise1(t * freq * 0.7 + 23) * k * 0.3;
}
function handheld(ctx, amt) { shake(ctx, amt * 0.35, 0.9); }
const addv = (a, b) => V.add([0, 0, 0], a, b);
const madd = (a, b, s) => V.madd([0, 0, 0], a, b, s);
const lerpv = (a, b, u) => V.lerp([0, 0, 0], a, b, u);
const sp = (pts, u) => spline([0, 0, 0], pts, u);

// Einstein-lens params with physical-ish scaling
function wellLens(ctx, Rs, swirl = 1, horizon = true, glow = 1) {
  const d = Math.max(V.dist(ctx.cam.pos, WELL), 30);
  const fov = ctx.cam.fov;
  return { enable: 1, pos: WELL, thetaE: Math.min(0.5, Math.sqrt(2 * Rs / d) / fov * 0.5), horizon: horizon ? Math.min(0.35, 2.6 * Rs / d / fov * 0.5) : 0, swirl: 0, glow };   // no swirl (user: 회오리 X)
}
// the well switches on at 70.0 in one violent step (small precursor 63–70), second pulse at 74.5
function wellOn(t) { return 0.12 * smooth(63, 69.5, t) + 0.6 * easeOut(sat((t - 70) / 0.9)) + 0.28 * easeOut(sat((t - 74.5) / 0.8)); }
function wellMass(t) { return 25 * wellOn(t) * (t > 262 ? 1 + smooth(262, 278, t) * 0.8 : 1) * (t > IMPLODE - 2 ? Math.max(0, 1 - (t - (IMPLODE - 2)) / 2) : 1); }

// ------------------------------------------------------------------ mobile suits
const tmpM = M.new();

// ---------------- berserk choreography helpers (film 262–278)
const SHIELD_R = 150;
const B_HITS = [263.4, 265.0, 266.6];
function berserkZ(t) {
  const hitZ = -SHIELD_R - 8;
  if (t < 262.8) return lerp(-260, -250, sat((t - 262) / 0.8));
  for (let i = 0; i < 3; i++) {
    const h = B_HITS[i], prev = i ? B_HITS[i - 1] : 262.8;
    if (t < h) { const back = i ? -205 - i * 5 : -250; return lerp(back, hitZ, easeIn(sat((t - (h - 0.35)) / 0.35))); }  // coil, then lunge in 0.35 s
    if (i === 2) {                                                                     // last hit: grab and tear
      if (t < h + 0.35) return lerp(hitZ, -185, easeOut(sat((t - h) / 0.35)));
      if (t < h + 0.6) return lerp(-185, hitZ + 1, easeIn(sat((t - h - 0.35) / 0.25)));
      if (t < 268) return hitZ + 1 + noise1(t * 30) * 0.4;
    }
    if (t < h + 1.25) { const back = -205 - (i + 1) * 5; return lerp(hitZ, back, easeOut(sat((t - h) / 0.5))); }  // recoil
  }
  if (t < 268) return lerp(-220, hitZ + 2, easeIn(sat((t - 267.6) / 0.4)));       // last lunge breaks it
  if (t < 270) return lerp(hitZ + 2, hitZ + 30, (t - 268) / 2);                     // through the shards
  if (t < 272.95) return lerp(hitZ + 30, -36, easeIn(sat((t - 270) / 2.95)));        // accelerating ram at the core
  return -36 + 5 * easeOut(sat((t - 272.95) / 0.35)) + 1.5 * smooth(273.3, 277.5, t);  // drives in and keeps grinding (no rebound)
}
// heavy shield strikes: each hit has its own wind-up → snap → follow-through → recovery (radians; partial poses)
const STRIKES = [
  { // overhead double-fist hammer
    wind: { torso: [-0.4, 0, 0], head: [-0.3, 0, 0], arm_L_upper: [-2.9, 0.2, 0.35], arm_L_lower: [-1.6, 0, 0], arm_R_upper: [-2.9, -0.2, -0.35], arm_R_lower: [-1.6, 0, 0],
            leg_L_upper: [-1.3, 0, 0.1], leg_L_lower: [1.9, 0, 0], leg_R_upper: [-1.1, 0, -0.1], leg_R_lower: [1.8, 0, 0] },
    hit:  { torso: [0.85, 0, 0], head: [0.3, 0, 0], arm_L_upper: [-1.15, 0.1, 0.15], arm_L_lower: [-0.15, 0, 0], arm_R_upper: [-1.15, -0.1, -0.15], arm_R_lower: [-0.15, 0, 0],
            leg_L_upper: [0.35, 0, 0.1], leg_L_lower: [0.4, 0, 0], leg_R_upper: [0.45, 0, -0.1], leg_R_lower: [0.3, 0, 0] } },
  { // right haymaker, whole body turning into it
    wind: { torso: [0.2, 0.75, -0.15], head: [0, -0.4, 0], arm_R_upper: [0.3, -0.7, -0.9], arm_R_lower: [-1.9, 0, 0], arm_L_upper: [-1.3, 0.3, 0.4], arm_L_lower: [-1.2, 0, 0],
            leg_L_upper: [-1.0, 0, 0.2], leg_L_lower: [1.6, 0, 0], leg_R_upper: [-0.3, 0, -0.2], leg_R_lower: [1.2, 0, 0] },
    hit:  { torso: [0.55, -0.7, 0.2], head: [0.1, 0.35, 0], arm_R_upper: [-1.6, 0.55, -0.15], arm_R_lower: [-0.15, 0, 0], arm_L_upper: [0.2, 0.4, 0.6], arm_L_lower: [-1.7, 0, 0],
            leg_L_upper: [0.3, 0, 0.3], leg_L_lower: [0.5, 0, 0], leg_R_upper: [-0.8, 0, -0.1], leg_R_lower: [1.5, 0, 0] } },
  { // left claw rake from high outside, dragging down across the barrier
    wind: { torso: [-0.1, -0.6, 0.25], head: [-0.2, 0.3, 0], arm_L_upper: [-2.5, 0.4, 1.1], arm_L_lower: [-1.2, 0, 0], hand_L: [0.9, 0, 0.4], arm_R_upper: [-0.9, -0.3, -0.5], arm_R_lower: [-1.5, 0, 0],
            leg_L_upper: [-0.6, 0, 0.3], leg_L_lower: [1.3, 0, 0], leg_R_upper: [-1.2, 0, -0.1], leg_R_lower: [1.9, 0, 0] },
    hit:  { torso: [0.7, 0.55, -0.2], head: [0.35, -0.2, 0], arm_L_upper: [-0.9, -0.5, 0.1], arm_L_lower: [-0.3, 0, 0], hand_L: [0.6, 0, -0.3], arm_R_upper: [-1.8, -0.2, -0.3], arm_R_lower: [-0.6, 0, 0],
            leg_L_upper: [0.4, 0, 0.2], leg_L_lower: [0.3, 0, 0], leg_R_upper: [0.1, 0, -0.2], leg_R_lower: [0.6, 0, 0] } },
];
// the overhead DOUBLE-FIST hammer: fingers interlocked — both fists meet at one point above the head (wind) and come
// down together in front of the chest (hit). Solved once with the duel FK so the hands really touch.
let _CLASP = null;
function claspPose(base, tgt) {
  const pose = JSON.parse(JSON.stringify(base));
  for (const k of ['arm_L_upper', 'arm_L_lower', 'hand_L', 'arm_R_upper', 'arm_R_lower', 'hand_R']) pose[k] = pose[k] || [0, 0, 0];
  const s0 = { pos: [0, 0, 0], fwd: [0, 0, 1], pose, saber: 0 };
  const cost = () => {
    const fk = duelFK(s0, 'gundam');
    const hl = M.transformPoint([0, 0, 0], fk.hand_L, [0, -1.0, 0.3]), hr = M.transformPoint([0, 0, 0], fk.hand_R, [0, -1.0, 0.3]);
    const dl = M.transformDir([0, 0, 0], fk.hand_L, [-1, 0, 0]), dr = M.transformDir([0, 0, 0], fk.hand_R, [1, 0, 0]);   // knuckles face each other
    const face = V.dot(V.norm([0, 0, 0], dl), V.norm([0, 0, 0], V.sub([0, 0, 0], hr, hl))) + V.dot(V.norm([0, 0, 0], dr), V.norm([0, 0, 0], V.sub([0, 0, 0], hl, hr)));
    return V.dist(hl, [tgt[0] + 0.7, tgt[1], tgt[2]]) ** 2 + V.dist(hr, [tgt[0] - 0.7, tgt[1], tgt[2]]) ** 2 + 2 * (2 - face);
  };
  const vars = [];
  for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L', 'arm_R_upper', 'arm_R_lower', 'hand_R']) for (const k of (p.includes('lower') ? [0] : [0, 1, 2])) vars.push([p, k]);
  let best = cost();
  for (let step = 0.4; step > 0.004; step *= 0.6) for (let it = 0; it < 8; it++) for (const [p, k] of vars) {
    for (const sg of [1, -1]) { pose[p][k] += sg * step; const c = cost(); if (c < best - 1e-6) { best = c; break; } pose[p][k] -= sg * step; }
  }
  return pose;
}
export function claspStrike() {
  if (_CLASP) return _CLASP;
  const S = STRIKES[0];
  _CLASP = { wind: claspPose(S.wind, [0, 10.8, 3.2]), hit: claspPose(S.hit, [0, 1.5, 7.5]) };   // hip-relative (pos = hip)
  return _CLASP;
}
function berserkStrike(t, pose) {
  for (let i = 0; i < B_HITS.length; i++) {
    const h = B_HITS[i];
    if (t < h - 0.75 || t > h + 1.1) continue;
    const S = i % STRIKES.length === 0 ? claspStrike() : STRIKES[i % STRIKES.length];
    const wind = easeInOut(sat((t - (h - 0.75)) / 0.55));           // slow, heavy load-up
    const snap = easeIn(sat((t - (h - 0.16)) / 0.16));              // violent release into the barrier
    const rec = easeInOut(sat((t - (h + 0.25)) / 0.85));            // follow-through held, then back to feral
    const jit = (k) => (i % STRIKES.length === 0 ? 0 : (hash(i * 13.1 + k) - 0.5) * 0.25);   // per-hit variation (not on the clasped hammer: the fists must stay locked)
    for (const part of new Set([...Object.keys(S.wind), ...Object.keys(S.hit)])) {
      const w = S.wind[part] || pose[part] || [0, 0, 0], hh = S.hit[part] || pose[part] || [0, 0, 0];
      const cur = pose[part] || [0, 0, 0];
      const act = [lerp(w[0], hh[0], snap) + jit(part.length), lerp(w[1], hh[1], snap) + jit(part.length + 3) * 0.5, lerp(w[2], hh[2], snap)];
      const k = wind * (1 - rec);
      pose[part] = [lerp(cur[0], act[0], k), lerp(cur[1], act[1], k), lerp(cur[2], act[2], k)];
    }
  }
}
// ---- the ram: both fists on the mace haft, weapon levelled at the core like a battering ram, body behind it.
// Solved once with the duel FK (same kinematics as the renderer): mace axis → straight ahead, left fist at the chest,
// right fist on the haft 3 m further along.
let _RAM = null;
export function ramBase() {
  if (_RAM) return _RAM;
  const pose = { torso: [0.5, 0, 0], head: [-0.45, 0, 0], pelvis: [0.15, 0, 0],
    leg_L_upper: [0.55, 0, 0.12], leg_L_lower: [0.5, 0, 0], leg_R_upper: [0.3, 0, -0.12], leg_R_lower: [1.0, 0, 0], foot_L: [0.6, 0, 0], foot_R: [0.6, 0, 0],
    arm_L_upper: [-1.4, 0.1, 0.2], arm_L_lower: [-0.6, 0, 0], hand_L: [0.2, 0, 0], arm_R_upper: [-1.4, -0.1, -0.2], arm_R_lower: [-0.8, 0, 0], hand_R: [0.3, 0, 0] };
  const s0 = { pos: [0, 0, 0], fwd: [0, 0, 1], pose, saber: 1, saberLen: 12.9 };
  const want = V.norm([0, 0, 0], [0, -0.04, 1]);
  const cost = () => {
    const fk = duelFK(s0, 'gundam');
    const d = fk.saber[2], hl = M.transformPoint([0, 0, 0], fk.hand_L, [0, 0, 0]), hr = M.transformPoint([0, 0, 0], fk.hand_R, [0, 0, 0]);
    const tl = [0.6, 4.2, 4.2], tr = V.madd([0, 0, 0], hl, want, 3.0);
    return 40 * V.dist(d, want) ** 2 + V.dist(hl, tl) ** 2 + V.dist(hr, tr) ** 2;
  };
  const vars = [['arm_L_upper', 0], ['arm_L_upper', 1], ['arm_L_upper', 2], ['arm_L_lower', 0], ['hand_L', 0], ['hand_L', 1], ['hand_L', 2],
    ['arm_R_upper', 0], ['arm_R_upper', 1], ['arm_R_upper', 2], ['arm_R_lower', 0], ['hand_R', 0]];
  let best = cost();
  for (let step = 0.3; step > 0.004; step *= 0.6) for (let it = 0; it < 6; it++) for (const [p, k] of vars) {
    for (const sg of [1, -1]) { pose[p][k] += sg * step; const c = cost(); if (c < best - 1e-6) { best = c; break; } pose[p][k] -= sg * step; }
  }
  _RAM = pose; _RAM._cost = best;
  return _RAM;
}
// the ram over time: braced on the approach, compression at impact (272.95), then straining/grinding against the core
function ramPose(t) {
  const b = ramBase(), out = {};
  for (const k in b) if (k[0] !== '_') out[k] = b[k].slice();
  const hit = Math.exp(-Math.max(0, t - 272.95) * 5) * (t > 272.95 ? 1 : 0);
  const grind = smooth(273.2, 274, t);
  out.torso[0] += 0.25 * hit + 0.1 * grind; out.head[0] += 0.2 * hit;
  out.arm_L_lower[0] -= 0.35 * hit; out.arm_R_lower[0] -= 0.35 * hit;           // elbows buckle on impact
  for (const k of ['arm_L_upper', 'arm_R_upper', 'torso', 'leg_L_upper', 'leg_R_upper']) {
    out[k][0] += noise1(t * (19 + k.length) + k.length) * 0.06 * grind;           // straining tremor while pushing in
  }
  out.leg_L_upper[0] += 0.25 * grind; out.leg_R_upper[0] += 0.35 * grind;        // legs kick back, thrusters behind
  return out;
}
function mixPose(pose, tgt, k) {
  for (const p in tgt) { const a = pose[p] || [0, 0, 0], b = tgt[p]; pose[p] = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
}
// elevator-door grip: each hand rolled about its finger axis so the palm faces OUTWARD, fingers hooked round the edge
export let HAND_YAW = 0.9;
export function setHandYaw(v) { HAND_YAW = v; }
function berserkHitK(t) { let k = 0; for (const h of [...B_HITS, 268]) if (t >= h) k = Math.max(k, Math.exp(-(t - h) * 6)); return k; }
function berserkJitter(t) { return 1 + berserkHitK(t) * 3; }
export function shieldState(t) {
  // crack 0..1 grows with each hit; shattered after 268
  let crack = 0; B_HITS.forEach((h, i) => { if (t >= h) crack = (i + 1) / 3 * 0.85; });
  return { on: t > 261 && t < 268.05, crack, hit: berserkHitK(t), shattered: t >= 268, up: smooth(261, 262, t) };
}
// docking path in flagship-local space (the port launch bay is x∈[-74,-62], y∈[-17,26], z∈[22,92])
const DOCK = { wide: [-395, 63, 97], out: [-165, 15, 67], mouth: [-84, 1, 57], pad: [-66.2, -2.5, 57] };
function recoveryTarget(t) {                               // where the pilot is steering (waypoints, ahead of the body)
  const wide = motherPoint([0, 0, 0], t, DOCK.wide), out = motherPoint([0, 0, 0], t, DOCK.out);
  const mouth = motherPoint([0, 0, 0], t, DOCK.mouth), pad = motherPoint([0, 0, 0], t, DOCK.pad);
  const k0 = easeInOut(sat((t - 336) / 2.4)), k1 = easeInOut(sat((t - 338.4) / 1.2)), k2 = easeInOut(sat((t - 339.6) / 0.8)), k3 = easeInOut(sat((t - 340.4) / 0.7));
  let p = V.lerp([0, 0, 0], gundamDrift(Math.min(t, 336)), wide, k0);
  p = V.lerp([0, 0, 0], p, out, k1); p = V.lerp([0, 0, 0], p, mouth, k2); return V.lerp([0, 0, 0], p, pad, k3);
}
// the heavy machine follows its steering target through a critically damped spring: slow to accelerate, carries its
// momentum through the turns, settles with weight (integrated deterministically from 336, so seek-safe)
const _rcache = new Map(), _rm = M.new();
function toMother(t, p) {                                  // world -> flagship-local (rigid transform)
  const m = motherMatrix(_rm, t), d = [p[0] - m[12], p[1] - m[13], p[2] - m[14]];
  return [0, 1, 2].map((c) => d[0] * m[c * 4] + d[1] * m[c * 4 + 1] + d[2] * m[c * 4 + 2]);
}
function recoveryPos(t) {
  // until the cut at 340 he simply accelerates straight ahead (S21b); F0 then picks him up gliding into the bay,
  // decelerating along the bay axis onto the pad (no waypoints, no swerves)
  if (t < 340) return gundamDrift(t);
  const L0 = [-150, 4, 57], u = sat((t - 340) / 2.45);
  const e = 1 - Math.pow(1 - u, 2.2);                                   // arrives with speed bleeding off smoothly
  const x = V.lerp([0, 0, 0], L0, DOCK.pad, e);
  if (t > 342.45) x[1] -= 0.2 * Math.sin((t - 342.45) * 9) * Math.exp(-(t - 342.45) * 5);   // clunks down onto the pad
  return motherPoint([0, 0, 0], t, x);
}
// the fly-by point off the melted flank: 85 m out from the wound along the hull normal, a little above
// the charge starts off the wound (flagship at t = 240, fixed point so the line to the well is one straight line)
let _diveStart = null;
function diveStart() { return _diveStart || (_diveStart = divePass(240)); }
function divePass(t) {
  const W = motherPoint([0, 0, 0], t, LANCE_HIT), n = V.norm([0, 0, 0], motherDir(t, [1, 0, 0]));
  return addv(madd(W, n, 122), [0, 30, 0]);                          // close past the camera (S16a sits at 150 m)
}
function gundamDrift0(t) { const base = addv(WELL, [40, 60, -1150]); return addv(base, [Math.sin(t * 0.1) * 4, Math.sin(t * 0.13) * 3, -(t - 320) * 0.5]); }
// coming to: from 334.3 he starts to creep forward toward home, accelerating gently (a = 3 m/s²) before the burn
const CREEP_T = 334.3, CREEP_A = 3;
let _creepDir = null;
// he sets off the way he is already facing when he comes to (no turn): the drift heading at CREEP_T
function creepDir() { const a = CREEP_T * 0.05 + 1; return _creepDir || (_creepDir = V.norm([0, 0, 0], [Math.sin(a), 0.1, -Math.cos(a)])); }
// distance travelled along creepDir: acceleration ramps smoothly 0 → 16 m/s² over 334.3–339 (jerk-limited: the heavy
// machine gathers speed, no sudden jump), integrated in closed form per segment
const CREEP_T1 = 339, CREEP_AMAX = 16;
function creepDist(t) {
  const x = t - CREEP_T; if (x <= 0) return 0;
  const T = CREEP_T1 - CREEP_T, A = CREEP_AMAX;
  // a(τ) = A·(τ/T)² for τ < T (smooth start), then A
  if (x < T) return A * x ** 4 / (12 * T * T);
  const d0 = A * T * T / 12, v0 = A * T / 3, y = x - T;
  return d0 + v0 * y + 0.5 * A * y * y;
}
function gundamDrift(t) { return madd(gundamDrift0(t), creepDir(), creepDist(t)); }
function motherDir(t, local) { return M.transformDir([0, 0, 0], motherMatrix(M.new(), t), local); }
function recoveryBay(t) {
  const ex = GUN.motherModel?.empties?.hangar_exit;
  return ex ? ex.pos : [-75, 3, 57];
}
export function gundamState(t) {
  const s = { vis: true, pos: [0, 0, 0], fwd: [0, 0, -1], roll: 0, pitch: 0, pose: {}, saber: 0, saberLen: 16, thr: 0.4, damage: 0, eye: 1 };
  if (t < 159.5 || (t > 280.25 && t < 320) || t > 346) { s.vis = false; return s; }   // swallowed by the blast at 280
  { const d = duelHero(t); if (d) return d; }
  const r = gundamStateRaw(t, s);
  if (t < 262) r.saber = 1;                                    // mace in hand from launch to the well assault
  return r;
}
function gundamStateRaw(t, s) {
  if (t < 170) {
    s.pos = gundamLaunchPath(t);
    const p2 = gundamLaunchPath(t + 0.05);
    s.fwd = V.sub([0, 0, 0], p2, s.pos);
    if (V.len(s.fwd) < 1e-3) s.fwd = [1, 0, 0];
    blendPose('flight', 'flight', 0, s.pose);
    s.pitch = 0.5; s.thr = 1;
    s.roll = Math.sin(t * 0.8) * 0.3;
  } else if (t < 180) {
    s.pos = strafePos(t);
    const e1 = enemyMS1(t).pos;
    s.fwd = V.sub([0, 0, 0], e1, s.pos);
    const aimU = smooth(170.8, 171.6, t) * (1 - smooth(179.4, 180, t));
    blendPose('flight', 'aim', aimU, s.pose);
    s.thr = 0.8; s.pitch = 0.15 * (1 - aimU);
    s.roll = Math.sin(t * 1.3) * 0.15;
  } else if (t < 186) {
    const u = easeInOut((t - 180) / 6);
    s.pos = lerpv(addv(GC, [-20, 30, 30]), addv(CP, [0, 0, 14]), u);
    s.fwd = [0, 0.05, -1];
    blendPose('aim', 'saberGuard', sat((t - 180.5) / 2), s.pose);
    s.saber = smooth(184, 184.4, t);
    s.thr = 0.7;
  } else if (t < 190) {
    s.pos = addv(CP, [Math.sin(t * 23) * 0.3, Math.sin(t * 19) * 0.2, 14]);
    s.fwd = [0, 0, -1];
    blendPose('saberGuard', 'saberGuard', 0, s.pose);
    s.pose.arm_L_upper[0] += Math.sin(t * 17) * 0.03;
    s.saber = 1; s.thr = 1;
  } else if (t < 194) {
    const u = (t - 190) / 4;
    s.pos = lerpv(addv(CP, [0, 0, 14]), addv(CP, [6, -4, -34]), easeInOut(sat((u - 0.35) / 0.4)));
    s.fwd = [Math.sin(u * 0.6) * 0.3, 0, -1];
    if (u < 0.38) blendPose('saberGuard', 'saberRaise', u / 0.38, s.pose);
    else blendPose('saberRaise', 'saberSlash', sat((u - 0.38) / 0.22), s.pose);
    s.saber = 1; s.thr = 1;
  } else if (t < 226) {
    s.pos = addv(CP, [6 + Math.sin(t * 0.5) * 1.5, -4 + Math.sin(t * 0.7) * 1.2, -34]);
    s.fwd = [Math.sin((t - 194) * 0.05) * 0.3, 0, -1];
    blendPose('saberSlash', 'stand', sat((t - 194) / 2.5), s.pose);
    breathe(s.pose, t, 1);
    s.saber = 1 - smooth(195, 195.6, t);
    s.thr = 0.3;
    if (t > 216 && t < 226) s.pose.head = [0.1, 0.35 * smooth(216, 218, t), 0];
  } else if (t < 240) {
    // (off screen 226–240) he moves up beside the flagship's melted flank, where the charge will start
    s.pos = lerpv(addv(CP, [6, -4 + Math.sin(t * 0.7), -34]), diveStart(), easeInOut(sat((t - 226.5) / 11)));
    const u = easeInOut(sat((t - 229) / 6));
    s.fwd = [Math.sin(u * Math.PI) * 1, 0, -Math.cos(u * Math.PI)];
    blendPose('stand', 'flight', smooth(237.5, 240, t), s.pose);
    breathe(s.pose, t, 1 - u);
    s.thr = 0.3 + smooth(238, 239.5, t) * 0.7;
  } else if (t < 262) {
    // one straight charge from the duel site to the well: no kink, he just keeps accelerating dead ahead
    const start = diveStart();
    const end = addv(WELL, [0, -10, -260]);
    const u = (t - 240) / 22;
    // coil for a breath, then an explosive burst to full speed (continuous: the old curve jumped back at 244.5)
    const B = 0.06, v = Math.max(0, u - B) / (1 - B), K = 18;
    const e = u < B ? 0.004 * (u / B) * (u / B) : 0.004 + 0.996 * (v - (1 - Math.exp(-K * v)) / K) / (1 - (1 - Math.exp(-K)) / K);
    s.pos = lerpv(start, end, clamp(e, 0, 1));
    s.fwd = V.sub([0, 0, 0], end, start);
    blendPose('flight', 'flight', 0, s.pose);
    s.pitch = 0.9 * smooth(240.9, 241.5, t) * (1 - smooth(258, 262, t)); s.thr = t < 241.3 ? 0.4 : 1; s.boostK = smooth(241.2, 241.45, t);
    s.roll = Math.sin(t * 0.5) * 0.05;
  } else if (t < 278) {
    // BERSERK: feral lunges into the shield (263.4 / 265.0 / 266.6), shatter 268, rush 270–272.8, slash 273
    const z = berserkZ(t);
    s.pos = addv(WELL, [noise1(t * 9) * 2.5 * berserkJitter(t), -6 + noise1(t * 8 + 3) * 2 * berserkJitter(t), z]);
    s.fwd = [noise1(t * 5) * 0.08, 0, 1];
    const hit = berserkHitK(t);                         // 1 right at an impact, decays
    const feral = { torso: [0.65, noise1(t * 11) * 0.15, noise1(t * 7) * 0.1], head: [-0.55 + noise1(t * 13) * 0.2, noise1(t * 9) * 0.35, 0],
      arm_L_upper: [-1.2 - hit * 0.5, 0.2, 0.55], arm_L_lower: [-1.3 + hit * 1.0, 0, 0], hand_L: [0.5, 0, 0],
      arm_R_upper: [-1.25 - hit * 0.5, -0.2, -0.55], arm_R_lower: [-1.2 + hit * 1.0, 0, 0], hand_R: [0.5, 0, 0],
      leg_L_upper: [-0.9, 0, 0.2], leg_L_lower: [1.5, 0, 0], leg_R_upper: [-0.4, 0, -0.2], leg_R_lower: [1.1, 0, 0], foot_L: [0.5, 0, 0], foot_R: [0.4, 0, 0] };
    if (t < 272.4) {
      for (const k in s.pose) delete s.pose[k];
      const w = smooth(262, 262.6, t);
      const fl = blendPose('flight', 'flight', 0, {});
      for (const k of new Set([...Object.keys(fl), ...Object.keys(feral)])) {
        const a = fl[k] || [0, 0, 0], b = feral[k] || [0, 0, 0];
        s.pose[k] = [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];
      }
      berserkStrike(t, s.pose);
      const tear = smooth(267.25, 268.0, t) * (1 - smooth(268.2, 268.8, t));
      if (tear > 0 || tearU(FILM_NOW) >= 0) {
        const pull = tearU(FILM_NOW) >= 0 ? 0.3 * tearU(FILM_NOW) + 0.7 * Math.pow(tearU(FILM_NOW), 4) : tear;
        s.pose.arm_L_upper = [-1.8, 0.15, -0.6 + pull * 0.55]; s.pose.arm_L_lower = [-0.55 + pull * 0.3, 0, 0]; s.pose.hand_L = [0.3, HAND_YAW, 0.15];
        s.pose.arm_R_upper = [-1.8, -0.15, 0.6 - pull * 0.55]; s.pose.arm_R_lower = [-0.55 + pull * 0.3, 0, 0]; s.pose.hand_R = [0.3, -HAND_YAW, -0.15];
        const tu = Math.max(0, tearU(FILM_NOW));
        const tr = (0.03 + 0.09 * tu) * (tu > 0 ? 1 : 0);
        s.pose.torso = [0.35 + tu * 0.15, noise1(FILM_NOW * 20) * 0.08, 0];
        for (const k of ['arm_L_upper', 'arm_R_upper', 'arm_L_lower', 'arm_R_lower', 'hand_L', 'hand_R']) {
          const a = s.pose[k]; a[0] += noise1(FILM_NOW * 31 + k.length) * tr; a[2] += noise1(FILM_NOW * 27 + k.length * 3) * tr;
        }
        s.damage = Math.max(s.damage || 0, 0.25 + tu * 0.55);
      }
      if (t > 270.2) mixPose(s.pose, ramPose(t), smooth(270.2, 271.0, t));
    } else { for (const k in s.pose) delete s.pose[k]; Object.assign(s.pose, ramPose(t)); }
    s.saber = smooth(270.3, 270.6, t);
    s.thr = 1; s.damage = 0.15 + smooth(262, 278, t) * 0.25;
    s.berserk = smooth(262, 262.4, t) * (1 - smooth(276, 278, t));
  } else if (t < 292) {
    const u = easeOut(sat((t - IMPLODE) / 10));
    // spent: no spin — the body goes slack and drifts backward, still facing the core (we see its back against the light)
    s.pos = lerpv(addv(WELL, [0, -6, -29.5 - 4 * sat((t - 278) / 2)]), addv(WELL, [40, 60, -1150]), t < IMPLODE ? 0 : u);
    s.fwd = [0.06 * Math.sin(t * 0.35), -0.08 - 0.1 * smooth(278, 284, t), 1];
    s.roll = 0.12 * Math.sin(t * 0.3) + 0.18 * smooth(278, 290, t);
    s.pitch = -0.25 * smooth(278.5, 288, t);          // head sinks back as the blast pushes the torso
    { const rp = ramPose(278), lp = blendPose('limp', 'limp', 0, {}); for (const k in s.pose) delete s.pose[k];
      Object.assign(s.pose, rp); mixPose(s.pose, lp, smooth(278.3, 281, t)); }
    if (t > 279.9) ragdoll(s.pose, 280.0, t, 1.3, 9);                // thrown by the blast: limbs flail, then float
    s.saber = 1 - smooth(279.6, 280.1, t);
    s.thr = 0; s.damage = 0.22;
    s.eye = 0.6 + 0.4 * Math.sin(t * 30);
  } else if (t < 346) {
    s.pos = gundamDrift(t);
    s.fwd = V.norm([0, 0, 0], V.lerp([0, 0, 0], [Math.sin(t * 0.05 + 1), 0.1, -Math.cos(t * 0.05 + 1)], creepDir(), easeInOut(sat((t - 333.6) / 2.4))));   // slowly turns toward home
    s.roll = (0.3 + (t - 292) * 0.004) * (1 - easeInOut(sat((t - 332.5) / 4.5)));   // dead-weight roll, levelled out gently as he comes to
    blendPose('limp', 'flight', easeInOut(sat((t - 333.2) / 5)), s.pose);            // limbs gather slowly as he comes to
    if (t > 331 && t < 336) {                                                          // the head lifts first, a hand flexes
      const hk = smooth(331, 333.5, t) * (1 - smooth(334.5, 336, t));
      s.pose.head = V.add([0, 0, 0], s.pose.head || [0, 0, 0], [-0.35 * hk, 0.15 * hk * Math.sin(t * 0.8), 0]);
      s.pose.hand_R = V.add([0, 0, 0], s.pose.hand_R || [0, 0, 0], [0.4 * smooth(332.2, 332.8, t) * (1 - smooth(333.4, 334.2, t)), 0, 0]);
    }
    const awake = smooth(333, 336, t);                        // unconscious: no idle breathing until he comes to
    if (t < 336) { const tmpP = ragdoll({}, 280.0, t, 1.3 * (1 - smooth(332, 336, t)), 9); for (const k in tmpP) { const a = s.pose[k] || (s.pose[k] = [0, 0, 0]); a[0] += tmpP[k][0]; a[1] += tmpP[k][1]; a[2] += tmpP[k][2]; } }
    breathe(s.pose, t, 0.5 * awake);
    s.damage = 0.22;
    s.eye = t < 331 ? (hash(Math.floor(t * 5)) > 0.35 ? 0.7 : 0.2) * smooth(324, 326, t) : 0.45 + 0.55 * smooth(331, 334, t);   // flickers, then steadies and brightens
    s.thr = smooth(334.2, 337.4, t) * (t < 335.6 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 17) * Math.sin(t * 5.3)) : 1);   // thrusters cough, then catch
    if (t > 336) {
      // recovery + stowing: swing wide of the hull, line up on the port launch bay, glide in, turn around (smooth yaw),
      // back down onto the docking pad, clamps lock (342.3–342.9), doors close (342.8–343.6)
      const driftFwd = s.fwd.slice();
      s.pos = recoveryPos(t);
      const vel = V.sub([0, 0, 0], recoveryPos(t + 0.08), recoveryPos(t - 0.08));
      const velDir = V.len(vel) > 0.05 ? V.norm([0, 0, 0], vel) : driftFwd;
      // straight ahead until the cut; in the bay: into the bay, then a slow, heavy turn round to face out
      let f = t < 340 ? creepDir().slice() : velDir;
      if (t > 341.0) {                                         // yaw from 'into the bay' (+X local) round to 'facing out' (-X)
        const k = easeInOut(sat((t - 341.0) / 1.6));
        const yaw = lerp(Math.PI / 2, Math.PI * 1.5, k);
        const loc = [Math.sin(yaw), 0, Math.cos(yaw)];
        const wd = V.norm([0, 0, 0], motherDir(t, loc));
        f = V.norm([0, 0, 0], V.lerp([0, 0, 0], f, wd, smooth(341.0, 341.5, t)));
      }
      s.fwd = f;
      const land = smooth(341.8, 342.5, t);
      s.roll += 0.05 * Math.sin(t * 0.9) * smooth(336, 337.5, t) * (1 - smooth(339.5, 341, t));
      if (land > 0) { const cur = s.pose, st = {}; blendPose('flight', 'stand', land, st); for (const k in st) cur[k] = st[k]; }   // keep the waking blend until landing
      s.boostK = smooth(336.2, 339.2, t) * (1 - smooth(339.8, 340.2, t));   // the burn builds slowly with the speed
      s.thr = t < 340.2 ? 1 : t < 342.1 ? 0.6 + 0.4 * Math.sin(t * 20) * 0.2 : 0.6 * (1 - smooth(342.1, 342.5, t));   // braking flare, then cut
      if (t > 343.7) s.vis = false;                            // behind the closed doors
    }
  }
  return s;
}

const STRAFE = [addv(GC, [60, 10, 120]), addv(GC, [100, 40, 40]), addv(GC, [40, 70, -10]), addv(GC, [-30, 40, 20]), addv(GC, [-20, 30, 30])];
function strafePos(t) { return sp(STRAFE, sat((t - 170) / 10)); }
export function enemyMS1(t) {
  { const d = duelEnemy1(t); if (d) return d; }
  const s = { vis: t > 160 && t < 180.3, pos: [0, 0, 0], fwd: [0, 0, 1], pose: {} };
  s.pos = addv(GC, [-60 + 50 * Math.sin(1.3 * t), 20 + 30 * Math.sin(0.9 * t), -120 + 30 * Math.cos(1.1 * t)]);
  s.fwd = V.sub([0, 0, 0], t < 170 ? gundamLaunchPath(t) : strafePos(t), s.pos);
  blendPose('aim', 'aim', 0, s.pose);
  s.pose.torso = [0.1, 0.3, 0];
  return s;
}
export function enemyMS2(t) {
  { const d = duelEnemy2(t); if (d) return d; }
  const s = { vis: t > 179 && t < 194.2, pos: [0, 0, 0], fwd: [0, 0, 1], pose: {}, saber: 0 };
  if (t < 186) {
    const u = easeIn(sat((t - 180) / 6));
    s.pos = lerpv(addv(CP, [60, 240, -200]), addv(CP, [0, 0, -14]), u);
    s.fwd = V.sub([0, 0, 0], addv(CP, [0, 0, 14]), s.pos);
    blendPose('flight', 'saberGuard', sat((t - 183) / 3), s.pose);
  } else if (t < 192.4) {
    s.pos = addv(CP, [Math.sin(t * 21) * 0.3, Math.sin(t * 25) * 0.2, -14 - smooth(190.5, 192.4, t) * 3]);
    s.fwd = [0, 0, 1];
    blendPose('saberGuard', 'saberGuard', 0, s.pose);
  } else {
    s.pos = addv(CP, [0, -smooth(192.4, 194, t) * 3, -17]);
    s.fwd = [Math.sin((t - 192.4) * 0.4), 0, 1];
    blendPose('saberGuard', 'limp', sat((t - 192.4) / 1.5), s.pose);
  }
  s.saber = smooth(181, 181.5, t) * (1 - smooth(192.6, 193, t));
  return s;
}

function msMatrix(out, s) {
  // model origin = feet; rotate around hip (y≈9)
  const f = V.norm([0, 0, 0], s.fwd);
  const yaw = Math.atan2(f[0], f[2]);
  const pitch = -Math.asin(clamp(f[1], -1, 1)) + (s.pitch || 0);
  Q.fromEuler(_q2, pitch, yaw, s.roll || 0);
  M.fromTRS(out, [0, 0, 0], _q2, 1);
  const hip = M.transformDir([0, 0, 0], out, [0, 9, 0]);
  out[12] = s.pos[0] - hip[0]; out[13] = s.pos[1] - hip[1]; out[14] = s.pos[2] - hip[2];
  return out;
}
const _q2 = [0, 0, 0, 1];

function saberSegment(R, name, e, hand, len) {
  const hm = R.partWorld(name, e, hand);
  const hiltName = name === 'gundam' ? 'saber_hilt' : null;
  let base;
  if (hiltName && R.models[name].empties[hiltName]) base = R.emptyWorld([0, 0, 0], name, e, hiltName);
  else base = M.transformPoint([0, 0, 0], hm, [0, -1.2, 0.6]);
  const dir = V.norm([0, 0, 0], M.transformDir([0, 0, 0], hm, SABER_AXIS));
  return [base, madd(base, dir, len), dir];
}
export const SABER_AXIS = [0, 0, 1];
const _maceM = new Float32Array(16), _dbM = new Float32Array(16), _dbQ = [0, 0, 0, 1];
// the decisive mace blow on RONIN #2 (192.4): crumple centre offset from its torso + blow direction, fixed at impact
// the mace kills: contact point + blow direction in the victim's torso space at the moment of impact (idx 1 / 2)
const BLOWS = {};
for (const ev of DUEL_EVENTS.filter((e) => e.cut)) {
  const idx = ev.t < 181 ? 1 : 2, st = idx === 1 ? duelEnemy1(ev.t) : duelEnemy2(ev.t);
  const inv = M.invert(M.new(), duelFK(st, 'enemy_ms').torso);
  const d = V.norm([0, 0, 0], V.sub([0, 0, 0], ev.cut[1], ev.cut[0]));
  BLOWS[idx] = { ev, p: M.transformPoint([0, 0, 0], inv, ev.pos), d: V.norm([0, 0, 0], M.transformDir([0, 0, 0], inv, d)) };
}
const E2_BLOW = BLOWS[2] && BLOWS[2].ev;
// heavy blows leave a mark: the struck plating dents (crush) and on the hardest ones a slab of chest armour is ripped
// off — the hole keeps a hot torn edge, the slab tumbles away along the blow. Contact points are the solved duel events,
// kept in torso-local coordinates so the damage rides with the part.
const HEAVY = [
  { t: 178.2, who: 1, r: 5, k: 0.5 },                  // knee to RONIN #1's gut
  { t: 178.55, who: 1, r: 6, k: 0.6, tear: 2.1 },      // push kick: chest plate torn off
  { t: 188.2, who: 2, r: 6, k: 0.65, tear: 2.3 },      // shoulder charge into RONIN #2: chest plate torn off
  { t: 189.45, who: 0, r: 5, k: 0.45 },                // RONIN #2's kick caves in Sigma's chest plate
];
for (const h of HEAVY) {
  const ev = DUEL_EVENTS.find((e) => Math.abs(e.t - h.t) < 1e-6);
  if (!ev || !ev.pos) { h.off = true; continue; }
  const st = h.who === 0 ? duelHero(ev.t) : h.who === 1 ? duelEnemy1(ev.t) : duelEnemy2(ev.t);
  const att = h.who === 0 ? duelEnemy2(ev.t) : duelHero(ev.t);
  h.model = h.who === 0 ? 'gundam' : 'enemy_ms';
  const T = duelFK({ ...st, saber: 1 }, h.model).torso, inv = M.invert(M.new(), T);
  h.dw = V.norm([0, 0, 0], V.sub([0, 0, 0], st.pos, att.pos));           // blow direction (attacker → victim)
  h.p = M.transformPoint([0, 0, 0], inv, ev.pos);
  h.d = V.norm([0, 0, 0], M.transformDir([0, 0, 0], inv, h.dw));
  h.w = ev.pos; h.ev = ev;
  h.m = msMatrix(new Float32Array(16), st); h.pose = JSON.parse(JSON.stringify(st.pose));
}
const _hvM = new Float32Array(16), _hvM2 = new Float32Array(16), _hvQ = [0, 0, 0, 1];
function heavyDamage(R, t, e, who) {
  if (t > 200) return;
  let dent = null;
  for (const h of HEAVY) {
    if (h.off || h.who !== who || t < h.t) continue;
    const lt = t - h.t;
    const tm = R.partWorld(h.model, e, 'torso');
    const d = V.norm([0, 0, 0], M.transformDir([0, 0, 0], tm, h.d));
    const cc = madd(M.transformPoint([0, 0, 0], tm, h.p), d, 1.2);
    const k = h.k * easeOut(sat(lt / 0.08)) + 0.06 * Math.sin(Math.min(lt, 0.35) * 45) * Math.exp(-lt * 9);   // bites in, rings, stays
    dent = [cc[0], cc[1], cc[2], h.r * Math.sign(d[2] || 1e-6), k, d[0], d[1]];
    if (h.tear) {
      const b = h.tear, c = V.madd([0, 0, 0], h.p, h.d, 0.4);        // the slab: a box round the contact, just under the skin
      const box = [c[0] - b, c[1] - b, c[2] - b, c[0] + b, c[1] + b, c[2] + b];
      e.clip = box; e.clipInv = true; e.clipPart = 'torso'; e.clipHeat = Math.max(0.25, 1.1 - lt / 3);
      // the torn slab: the victim's own torso at the moment of impact, clipped to the box, thrown along the blow
      const W = h.w, dist = 16 * lt * (1 - Math.min(0.5, lt * 0.08)) + 3 * easeOut(sat(lt / 0.1));
      Q.fromEuler(_hvQ, lt * 2.3, lt * 1.1, lt * 1.7);
      M.fromTRS(_hvM, [W[0] + h.dw[0] * dist, W[1] + h.dw[1] * dist + lt * 2, W[2] + h.dw[2] * dist], _hvQ, 1);
      M.fromTRS(_hvM2, [-W[0], -W[1], -W[2]], [0, 0, 0, 1], 1);
      M.mul(_hvM, _hvM, _hvM2); M.mul(_hvM, _hvM, h.m);
      const ch = R.add(h.model, _hvM);
      if (ch) {
        ch.pose = h.pose; ch.clip = box; ch.clipInv = false; ch.clipPart = 'torso'; ch.clipHeat = Math.max(0.2, 1.2 - lt / 2);
        ch.hidden = {}; for (const pt of R.models[h.model].parts) if (pt.name !== 'torso') ch.hidden[pt.name] = 1;
        ch.seed = e.seed + 5; ch.wear = 1; ch.texSet = e.texSet; ch.damage = 0.3; ch.emissive = 0;
      }
      if (lt < 1.5) {                                            // sparks and a puff of burning coolant from the wound
        const hp = M.transformPoint([0, 0, 0], tm, h.p);
        R.fire(hp, 1.2 + 2.5 * easeOut(lt / 1.5), lt, h.t * 7, [1, 1, 1], 0.8 * (1 - lt / 1.5));
      }
    }
  }
  if (dent && !e.crush) e.crush = dent;
}

// first person: armoured hands with real fingers clawing into the shield (the model's fists are solid blocks)
const CURL = -1;                                          // pose rx sign that bends a finger toward the palm (+Z)
const _hm = new Float32Array(16);
// GRIP: the model's hand is an open claw, so while a weapon is held it is replaced by the articulated hand with every
// finger wrapped round the haft. The weapon runs along the hand's +Z (duelFK saber line at hand-local y −1.2); the
// articulated hand's closed-fist bore runs along its X at (y −1.3, z 0.55), so it is turned −90° about Y and shifted
// to put that bore exactly on the haft.
const _gm = new Float32Array(16), _gr = new Float32Array(16);
function gripHand(R, ge, side, zOff) {
  if (!R.models.mech_hand) return;
  ge.hidden = { ...(ge.hidden || {}), ['hand_' + side]: 1 };
  const hw = R.partWorld('gundam', ge, 'hand_' + side);
  const sg = side === 'L' ? 1 : -1;
  M.fromTRS(_gr, [0.55 * sg, 0.1, 0.4 + zOff], Q.fromEuler([0, 0, 0, 1], 0, -Math.PI / 2 * sg, 0), 1);
  M.mul(_gm, hw, _gr);
  const h = R.add('mech_hand', _gm);
  if (!h) return;
  h.hidden = { [side === 'L' ? 'thumbR_1' : 'thumbL_1']: 1, [side === 'L' ? 'thumbR_2' : 'thumbL_2']: 1 };
  h.seed = 5.5; h.wear = 1;
  const pose = {};
  for (let i = 0; i < 4; i++) { pose[`f${i}_1`] = [CURL * 1.2, 0, 0]; pose[`f${i}_2`] = [CURL * 1.3, 0, 0]; pose[`f${i}_3`] = [CURL * 1.0, 0, 0]; }
  const th = side === 'L' ? 'thumbL' : 'thumbR';
  pose[th + '_1'] = [CURL * 0.9, 0, (side === 'L' ? -1 : 1) * 0.9]; pose[th + '_2'] = [CURL * 0.9, 0, 0];
  h.pose = pose;
}
function drawPovHands(R, t, ge, s) {
  if (!R.models.mech_hand) return;
  const film = FILM_NOW, u = Math.max(0, tearU(film));
  const strain = 0.3 + 0.7 * Math.pow(u, 1.4);
  for (const side of ['L', 'R']) {
    _hm.set(R.partWorld('gundam', ge, 'hand_' + side));
    const e = R.add('mech_hand', _hm);
    if (!e) continue;
    e.hidden = { [side === 'L' ? 'thumbR_1' : 'thumbL_1']: 1, [side === 'L' ? 'thumbR_2' : 'thumbL_2']: 1 };
    e.seed = 5.5; e.wear = 1; e.damage = 0.2 + 0.5 * u;
    const pose = {};
    for (let i = 0; i < 4; i++) {
      const tr = (k) => noise1(film * (23 + i * 3) + k * 7 + (side === 'L' ? 0 : 50)) * 0.12 * strain;   // straining tremor
      const c = 0.55 + 0.25 * strain;                    // claws dug in, curling harder as it rips
      pose[`f${i}_1`] = [CURL * (c * 0.8 + tr(1)), (i - 1.5) * 0.06 * (1 - u), 0];
      pose[`f${i}_2`] = [CURL * (c + tr(2)), 0, 0];
      pose[`f${i}_3`] = [CURL * (c * 0.7 + tr(3)), 0, 0];
    }
    const th = side === 'L' ? 'thumbL' : 'thumbR';
    pose[th + '_1'] = [CURL * 0.5, 0, (side === 'L' ? -1 : 1) * 0.6];
    pose[th + '_2'] = [CURL * 0.6, 0, 0];
    e.pose = pose;
  }
}

export function drawGundam(R, t, s, opts = {}) {
  if (!s.vis) return null;
  const e = R.add('gundam', msMatrix(tmpM, s));
  if (!e) return null;
  e.pose = s.pose; e.damage = s.damage; e.seed = 5.5; e.wear = 1; e.texSet = R.texLoaded & 1 ? 1 : 0;
  e.hidden = { rifle: 1, saber_hilt: 1 };                    // Sigma carries only the mace (the old beam-saber hilt is not drawn)
  if (s.fpv) {
    e.hidden = { rifle: 1, head: 1, torso: 1, backpack: 1, pelvis: 1, arm_L_upper: 1, arm_R_upper: 1, hand_L: 1, hand_R: 1 };   // POV: forearms + articulated hands
    drawPovHands(R, t, e, s);
  }
  const eyeK = s.eye * (opts.eye ?? 1);
  const bz = s.berserk || 0;
  const ec = [lerp(0.5 * 2.5, 9, bz) * eyeK, lerp(2.2 * 2.5, 0.4, bz) * eyeK, lerp(1.2 * 2.5, 0.25, bz) * eyeK];
  // chest reactor ring (torso 'core'): its own emissive plus a soft glow halo, slow heartbeat pulse; red when berserk
  const coreK = (0.85 + 0.15 * Math.sin(t * 2.2)) * (s.fpv ? 0 : 1) * (s.damage > 0.5 ? 0.4 : 1);
  const cc = [lerp(0.35, 3.5, bz) * 3.2 * coreK, lerp(0.85, 0.35, bz) * 3.2 * coreK, lerp(1.0, 0.2, bz) * 3.2 * coreK];
  e.matOverride = { eye: { base: [0.2, 0.9, 0.5], metal: 0, rough: 0.3, emissive: ec }, core: { base: [0.3, 0.8, 1.0], metal: 0, rough: 0.3, emissive: cc } };
  if (coreK > 0.02) {
    const cp = M.transformPoint([0, 0, 0], R.partWorld('gundam', e, 'torso'), [0.03, 3.14, 2.7]);
    R.glow(cp, 1.9, [cc[0] * 0.35, cc[1] * 0.35, cc[2] * 0.35], 0.45);
  }
  // exhaust history never reaches back across a scene cut where his path jumps (340: the drift → the bay approach)
  const pastHero = opts.pastState || ((tau) => { const q = gundamState(t >= 340 && t - tau < 340 ? 340 : t - tau); return { m: msMatrix(new Float32Array(16), q.vis ? q : s), pose: (q.vis ? q : s).pose }; });
  const inDuel = t > 169.5 && t < 200;                         // in the fight no plume history: it read as weapon trails
  if (s.thr > 0.02) engineGlows(R, 'gundam', e, [0.7, 0.9, 2.0], 0.9 * (1 + 0.9 * (s.boostK || 0)), s.thr, 1.2 + 1.5 * (s.boostK || 0), s.fpv || opts.noTrail || inDuel || (s.berserk || 0) > 0.05 ? null : { past: pastHero, particles: !(t > 318 && t < 347) });   // no ember sparks while he comes to / flies home
  const eye = emitWorld(R, 'gundam', e, 'eye');
  if (!s.fpv && eye && eyeK > 0.05) R.glow(eye, (s.visorFlare !== undefined ? 0.4 : 0.55 + bz * 2.4) * Math.min(eyeK, 1.2), [lerp(0.5, 5, bz) * eyeK, lerp(1.6, 0.3, bz) * eyeK, lerp(1.0, 0.2, bz) * eyeK], 0.35);   // visor: a small glint (a big ball read as a stray light next to him)
  if (!s.fpv && eyeK > 0.05 && (s.visorFlare !== undefined)) {        // visor band glow: every emitter point + a light spill
    const pts = R.models.gundam.emitPoints.eye || [];
    for (let i = 0; i < pts.length; i++) {
      const p = emitWorld(R, 'gundam', e, 'eye', i);
      if (p) R.glow(p, 0.22 + 0.3 * s.visorFlare, [0.5 * eyeK, 2.2 * eyeK, 1.3 * eyeK], 0.6);
    }
    if (eye) { R.light(eye, 10, [0.4, 1, 0.7], 2 * eyeK); if (s.visorFlare > 0.02) R.glow(eye, 1.4 * s.visorFlare, [0.3 * s.visorFlare, 1.2 * s.visorFlare, 0.7 * s.visorFlare], 0.35); }
  }
  if (s.saber > 0 && (t < 160 || t >= 200) && !(t > 270 && t < 281) && s.pose.hand_L && !s._wrist) {   // (the ram grip is solved exactly)
  s.pose.hand_L = [maceWrist(s.pose.hand_L[0]), s.pose.hand_L[1], s.pose.hand_L[2]]; s._wrist = 1; e.pose = s.pose; }
  if (s.saber > 0) {
    // war mace (replaces the beam saber): materialises in the left hand, energised red while berserk
    const hm = R.partWorld('gundam', e, 'hand_L');
    const [a, , dir] = saberSegment(R, 'gundam', e, 'hand_L', 1);
    const side = V.norm([0, 0, 0], M.transformDir([0, 0, 0], hm, [1, 0, 0]));
    const up = V.norm([0, 0, 0], V.cross([0, 0, 0], dir, side));
    const x = V.cross([0, 0, 0], up, dir);
    const k = easeOut(sat(s.saber)), sc = 0.25 + 0.75 * k;
    const mm = _maceM;
    mm[0] = x[0] * sc; mm[1] = x[1] * sc; mm[2] = x[2] * sc; mm[4] = up[0] * sc; mm[5] = up[1] * sc; mm[6] = up[2] * sc;
    mm[8] = dir[0] * sc; mm[9] = dir[1] * sc; mm[10] = dir[2] * sc; mm[12] = a[0]; mm[13] = a[1]; mm[14] = a[2]; mm[15] = 1;
    const me = R.add('mace', mm);
    const head = madd(a, dir, 9.6 * sc);
    const hot = Math.max(bz, (1 - k) * 2);                       // deploy flash / berserk charge
    if (me) {
      me.seed = 3.3; me.wear = 1;
      // calm glow (bright emissive panels shimmered through the bloom as the camera moved); dimmer still in the hangar
      const gk = t < 163 ? 0.35 : 1;
      const gc = bz > 0.05 ? [6 * bz + 0.3, 0.6, 0.35] : [(0.08 + 2 * (1 - k)) * gk, (0.45 + 2 * (1 - k)) * gk, (0.7 + 2 * (1 - k)) * gk];
      me.matOverride = { mace_glow: { base: [0.2, 0.8, 1], metal: 0, rough: 0.3, emissive: gc } };
    }
    if (hot > 0.05) {
      const col = bz > 0.05 ? [3.5, 0.5, 0.25] : [0.8, 2.2, 3.2];
      R.glow(head, (3 + 3 * bz) * hot, [col[0] * hot, col[1] * hot, col[2] * hot], 0.5);
      R.light(head, 50, bz > 0.05 ? [1, 0.25, 0.1] : [0.4, 0.8, 1], 5 * hot);
    }
    GUN.saber = [a, madd(a, dir, 12.9 * sc)];
    if (!s.fpv && k > 0.5) gripHand(R, e, 'L', 0);   // a real closed fist round the haft (replaces the open model hand)
  } else GUN.saber = null;
  if (t >= 170 && t < 200 && !s.fpv) heavyDamage(R, t, e, 0);
  GUN.gundam = e;
  return e;
}
// the finisher: from the moment the mace connects (192.4) RONIN #2 comes apart — the mace punches through, the body
// splits into armour chunks that drift outward in slow motion, then the reactor goes at 194 and everything is flung
const E2_FIN = 192.4, E1_FIN = 179.15;   // RONIN #1 blows apart right after the mace smash (no long crumple)
const _fin = {};
function drawBreakup(R, t, idx) {
  const t0 = idx === 2 ? E2_FIN : E1_FIN;
  if (!_fin[idx]) { const s0 = idx === 2 ? enemyMS2(t0) : enemyMS1(t0); _fin[idx] = { m: msMatrix(new Float32Array(16), s0), pose: JSON.parse(JSON.stringify(s0.pose)) }; }
  // RONIN #2 (the finisher) comes apart in slow motion until its reactor blows at 194; RONIN #1 in real time
  const tt = idx === 2 ? E2_FIN + Math.min(1.6, t - E2_FIN) * 0.28 + Math.max(0, t - 194) * 1.1 : t;
  // the pieces are thrown along the killing blow (the mace swing direction), in the dead machine's model space
  if (!_fin[idx].imp && BLOWS[idx]) { const ev = BLOWS[idx].ev; const inv = M.invert(M.new(), _fin[idx].m); _fin[idx].imp = V.norm([0, 0, 0], M.transformDir([0, 0, 0], inv, V.sub([0, 0, 0], ev.cut[1], ev.cut[0]))); }
  shatter(R, 'enemy_ms', _fin[idx].m, tt, t0, idx === 2 ? 88 : 77, [3, 4, 3], idx === 2 ? 2.6 : 3.2, { tint: [2, 0.4, 0.3], pose: _fin[idx].pose, texSet: R.texLoaded & 4 ? 2 : 0, impulse: _fin[idx].imp, impulseK: idx === 2 ? 1.6 : 2.6 });
}
function drawEnemyMS(R, t, s, idx) {
  if (idx === 2 && t > E2_FIN + 0.03 && t < 200) { drawBreakup(R, t, 2); return null; }
  if (idx === 1 && t > E1_FIN + 0.05 && t < 195) { drawBreakup(R, t, 1); return null; }
  if (!s.vis) return null;
  const e = R.add('enemy_ms', msMatrix(tmpM, s));
  if (!e) return null;
  e.pose = s.pose; e.seed = 8 + idx; e.wear = 1; e.texSet = R.texLoaded & 4 ? 2 : 0;
  const fn = idx === 1 ? enemyMS1 : enemyMS2;
  engineGlows(R, 'enemy_ms', e, ENEMY_ENGINE, 0.9, 0.8, 1.2, t > 169.5 && t < 200 ? null : { past: (tau) => { const q = fn(t - tau); return { m: msMatrix(new Float32Array(16), q), pose: q.pose }; }, particles: true });
  const BL = BLOWS[idx];
  if (BL && t > BL.ev.t) {
    const tm = R.partWorld('enemy_ms', e, 'torso');
    const d = V.norm([0, 0, 0], M.transformDir([0, 0, 0], tm, BL.d));
    const cc = madd(M.transformPoint([0, 0, 0], tm, BL.p), d, 1.5);   // just inside the struck surface
    const lt = t - BL.ev.t;
    const k = Math.min(0.75, 0.7 * easeOut(sat(lt / 0.12)) + 0.08 * Math.sin(Math.min(lt, 0.4) * 40) * Math.exp(-lt * 8));   // a dent, not a smear
    e.crush = [cc[0], cc[1], cc[2], 10 * Math.sign(d[2] || 1e-6), k, d[0], d[1]];
    e.damage = Math.max(e.damage || 0, 0.35 * sat(lt / 0.3));
  }
  heavyDamage(R, t, e, idx);
  const eye = emitWorld(R, 'enemy_ms', e, 'eye');
  if (eye) R.glow(eye, 1.6, [3.5, 0.3, 1.2], 0.6);
  // (no extra beam blade: RONIN already carries its own katana)
  return e;
}

const _e1m = new Map();
const _vamb = new Map();
function vambrace(ti) {                    // Sigma's right vambrace (forearm armour) at time ti — where the bolts land
  let p = _vamb.get(ti);
  if (!p) {
    const fk = duelFK({ ...gundamState(ti), saber: 1 }, 'gundam');
    p = V.lerp([0, 0, 0], M.transformPoint([0, 0, 0], fk.arm_R_lower, [0, 0, 0]), M.transformPoint([0, 0, 0], fk.hand_R, [0, 0, 0]), 0.6);
    _vamb.set(ti, p);
  }
  return p;
}
function e1Muzzle(tf) {                  // pure function of time (cached): the left hand of RONIN #1, a little ahead of the fist
  let p = _e1m.get(tf);
  if (!p) {
    const s = enemyMS1(tf);
    const fk = duelFK({ ...s, saber: 0 }, 'enemy_ms');
    const h = fk.hand_L;
    // wrist gun fires along the forearm (the fist's -Y, the way the fingers point), muzzle just past the knuckles
    p = { pos: M.transformPoint([0, 0, 0], h, [0, -2.4, 0.3]), dir: V.norm([0, 0, 0], M.transformDir([0, 0, 0], h, [0, -1, 0])) };
    _e1m.set(tf, p);
  }
  return p;
}
function rifleShot(R, t, t0, from, to, hit = false) {
  const lt = t - t0;
  if (lt < 0 || lt > 0.7) return;
  const L = V.dist(from, to);
  const speed = 2200;
  const head = Math.min(1, (lt * speed) / L), tail = Math.max(0, (lt * speed - 70) / L);
  const a = lerpv(from, to, tail), b = lerpv(from, to, head);
  if (head > tail) R.beam(a, b, 0.9, [2.4, 1.1, 1.6], 2, 20, 0.6, 1);
  if (lt < 0.12) { R.glow(from, 6 * (1 - lt / 0.12), [3, 2, 2.5], 0.7); R.light(from, 60, [1, 0.6, 0.8], 8); }
  if (hit && head >= 1) hitFlash(R, t, t0 + L / speed, to, 6, [1, 0.6, 0.8]);
}

// all gundam-sequence exterior drawing
let FPV_NOW = false;
function drawMSBattle(R, t) {
  const g = gundamState(t);
  g.fpv = FPV_NOW;
  const ge = drawGundam(R, t, g);
  if (ge && t > 180.9 && t < 181.7) {                          // sensor spike: the visor flashes warning red
    const pk = Math.pow(0.5 + 0.5 * Math.sin((t - 180.9) * 28), 3);
    ge.matOverride = { ...ge.matOverride, eye: { base: [0.9, 0.2, 0.2], metal: 0, rough: 0.3, emissive: [2 + 7 * pk, 0.25, 0.15] } };
  }
  const e1 = enemyMS1(t), e2 = enemyMS2(t);
  const ee1 = drawEnemyMS(R, t, e1, 1);
  drawEnemyMS(R, t, e2, 2);
  // rifle shots: fired from the rifle muzzle along the line fixed at the moment of the shot (duel.js DUEL_SHOTS)
  if (ge) {
    for (const sh of DUEL_SHOTS) {
      if (t < sh.t - 0.01 || t > sh.t + 0.8) continue;
      rifleShot(R, t, sh.t, sh.from, sh.to, sh.hit);
    }
  }
  // E1 machine gun
  if (false && e1.vis && t > 172 && t < 178.5 && g.vis) {   // (RONIN #1 no longer fires on the approach)
    for (let k = 0; k < 24; k++) {
      const tf = 172 + k * 0.26;
      if (t < tf || t > tf + 0.5) continue;
      const mz = e1Muzzle(tf), from = mz.pos;                     // wrist gun on RONIN's aiming (left) arm
      // every bolt is swatted aside by Sigma's right vambrace (duel.js volleyParry): it lands on the armour at ti and
      // glances off, sparks spraying
      const ti = tf + 0.35;
      const to = vambrace(ti);
      bolt(R, t, tf, ti, from, to, 14, 0.35, [3, 1.4, 0.4], 1);
      if (t >= ti) {
        const lt = t - ti, inc = V.norm([0, 0, 0], V.sub([0, 0, 0], to, from));
        // ricochet the way the arm is swinging (the swat throws it aside), plus a little of the glancing reflection
        const sv = V.sub([0, 0, 0], vambrace(ti + 0.03), vambrace(ti - 0.03));
        const out = V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], V.norm([0, 0, 0], sv), 1.0), V.add([0, 0, 0], V.scale([0, 0, 0], inc, 0.35), V.scale([0, 0, 0], randDir([0, 0, 0], k * 5.3 + 2), 0.15))));
        bolt(R, t, ti, ti + 0.3, to, madd(to, out, 380), 10, 0.25, [2.4, 1.0, 0.3], 0.8);
        const kf = Math.exp(-lt * 14);
        R.glow(to, 1.5 + 2.5 * easeOut(sat(lt / 0.05)), [3 * kf, 1.8 * kf, 0.8 * kf], 0.4);
        for (let q = 0; q < 8; q++) {
          const sd2 = V.norm([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], k * 11 + q * 3.1), out, 1.0));
          const life = 0.18 + hash(k + q) * 0.2; if (lt > life) continue;
          const u2 = lt / life, p = madd(to, sd2, (2 + 9 * hash(q + k * 2)) * easeOut(u2)), q2 = madd(p, sd2, -1.2 * (1 - u2));
          const b = 3.5 * (1 - u2) * (1 - u2);
          R.beam(q2, p, 0.06, [b, b * 0.6, b * 0.3], 1, 10);
        }
      }
      const mf = Math.exp(-(t - tf) * 12); if (t - tf < 0.3) { R.glow(from, 2.2, [3 * mf, 1.6 * mf, 0.5 * mf], 0.6); R.light(from, 30, [1, 0.6, 0.3], 4 * mf); }
    }
  }
  if (t > 179.1 && t < 180.3) hitFlash(R, t, 179.1, addv(enemyMS1(179.1).pos, [0, 9, 0]), 8, [1, 0.5, 0.3]);
  explosion(R, t, E1_FIN, addv(enemyMS1(E1_FIN).pos, [0, 9, 0]), 18, 501, 'ship');
  // contact effects from the choreography (exact world contact points)
  for (const ev of [...DUEL_EVENTS, ...AUTO_FX]) {                  // choreographed + hitbox-detected contacts
    const lt = t - ev.t;
    if (lt < 0 || lt > 0.7 || !ev.pos) continue;
    const st = ev.strength ?? 1;
    const k = Math.exp(-lt * 7);
    if (ev.type === 'clash' || ev.type === 'block' || ev.type === 'spark' || ev.type === 'hit') {
      R.glow(ev.pos, (2 + st * 3) * (0.6 + lt), [3 * k, 2.2 * k, 1.8 * k], 0.4);
      R.light(ev.pos, 90, [1, 0.65, 0.5], 14 * k * st);
      const n = ev.type === 'spark' ? 10 : 22;
      for (let i = 0; i < n; i++) {
        const d = randDir([0, 0, 0], ev.t * 13.1 + i * 3.7);
        const life = 0.25 + hash(ev.t + i) * 0.4;
        if (lt > life) continue;
        const a = lt / life;
        const p = madd(ev.pos, d, (8 + 22 * hash(i + ev.t * 3)) * st * easeOut(a));
        const q = madd(p, d, -3 * (1 - a));
        const b = (1 - a) * 4;
        R.beam(q, p, 0.1, [b, b * 0.7, b * 0.4], 1, 10);
      }
      if (ev.type !== 'spark' && lt < 0.25) R.ripple(ev.pos, (6 + 10 * st) * (0.2 + easeOut(lt / 0.25)), [0.2, 0.2, 0.2], (1 - lt / 0.25) * 1.2);
    }
    if (ev.cut && lt < (ev.t > 190 ? 3.2 : 1.6)) {       // mace blow: metal crumples, armour shards + sparks spray out along the swing
      const ls = ev.t > 190 ? lt * 0.35 : lt;            // the finisher plays out in slow motion
      const d = V.norm([0, 0, 0], V.sub([0, 0, 0], ev.cut[1], ev.cut[0]));
      const kc = Math.exp(-ls * 4);
      R.light(ev.pos, 60, [1, 0.6, 0.35], 10 * kc);
      const kg = Math.exp(-ls * 14);                   // short hot pop, then the crumpled metal stays readable
      R.glow(ev.pos, 3 + 8 * easeOut(sat(ls / 0.1)), [4 * kg, 2.6 * kg, 1.5 * kg], 0.45);
      if (ls < 0.5) {
        R.ripple(ev.pos, 8 + 90 * easeOut(ls / 0.5), [0.5, 0.5, 0.5], (1 - ls / 0.5) * 1.0);
        R.ripple(ev.pos, 4 + 40 * easeOut(ls / 0.35), [0.5, 0.5, 0.5], sat(1 - ls / 0.35) * 1.6);
      }
      for (let i = 0; i < 70; i++) {                  // spark fan, biased along the swing
        const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 3.9 + 11), d, 1.1));
        const life = 0.3 + hash(i + 40) * 0.9; if (ls > life) continue;
        const a = ls / life, p = madd(ev.pos, sd, (6 + 40 * hash(i + 7)) * easeOut(a)), q = madd(p, sd, -(2 + 4 * (1 - a)));
        const b = 5 * (1 - a) * (1 - a);
        R.beam(q, p, 0.12, [b, b * 0.65, b * 0.3], 1, 10);
      }
      for (let i = 0; i < 0; i++) {                   // (no foreign plates: the victim's own mesh crumples / breaks up)
        const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 5.3 + 1), d, 1.4));
        const p = madd(ev.pos, sd, (3 + 26 * hash(i + 3)) * easeOut(sat(ls / 1.6)));
        M.fromTRS(_dbM, p, Q.fromEuler(_dbQ, ls * 5 + i, ls * 3 + i * 2, ls * 4), 0.06 + 0.07 * hash(i));
        const de = R.add('debris', _dbM);
        if (de) { de.hidden = debrisOnly(R, 'hull' + (i % 4)); de.damage = 0.5; }
      }
      if (ls < 1.2) R.fire(ev.pos, 3 + 6 * easeOut(ls / 1.2), ls, 192.4, [1, 1, 1], 0.9 * (1 - ls / 1.2));
      if (ls < 0.35) {                                    // pile-driver: the blow punches clean THROUGH — a white-hot shaft out the back
        const kp = 1 - ls / 0.35, len = 6 + 30 * easeOut(sat(ls / 0.12));
        R.beam(ev.pos, madd(ev.pos, d, len), 0.9 * kp + 0.3, [4 * kp, 3 * kp, 2 * kp], 1, 12);
        R.glow(madd(ev.pos, d, len), 4 * kp, [3 * kp, 1.8 * kp, 0.8 * kp], 0.4);
      }
    }
  }
  explosion(R, t, 194, addv(enemyMS2(194).pos, [0, 6, -3]), 18, 502, 'ship');
  return g;
}

// ------------------------------------------------------------------ hangar
function drawHangar(R, t, phase) {
  // phase: 'standby' | 'launch'
  const e = R.add('hangar', matEuler(tmpM, HANGAR, 0, 0, 0, 1));
  if (!e) return;
  const on = phase === 'launch' ? smooth(150, 151.5, t) : 0;
  const blinks = [[150.05, 150.2], [150.45, 150.58], [150.85, 150.95]];   // fluorescent start-up: three clean blinks (no 1-frame strobe)
  const flick = on > 0 && on < 1 ? (blinks.some(([a, b]) => t >= a && t < b) ? 1 : t > 151 ? 1 : 0.3) : 1;
  const lampE = phase === 'launch' ? [0.9 * on * flick + 0.05, 0.85 * on * flick + 0.03, 0.75 * on * flick + 0.03] : [1.2, 0.15, 0.1];
  const guideE = phase === 'launch' ? [0.5, 2.5 * (0.3 + on), 4 * (0.3 + on)] : [1.5, 0.2, 0.1];
  e.matOverride = {
    lamp: { base: [0.9, 0.9, 0.9], metal: 0, rough: 0.4, emissive: lampE },
    guide: { base: [0.2, 0.4, 0.6], metal: 0, rough: 0.4, emissive: guideE },
  };
  e.seed = 2; e.emissive = 1;
  // lamp point lights along the ceiling
  for (let i = 0; i < 3; i++) {                    // three hard pools of light down the bay, darkness between
    const z = -45 + i * 30;
    const lp = addv(HANGAR, [0, 17, z]);
    if (phase === 'launch') R.light(lp, 26, [1, 0.93, 0.82], 2.6 * on * flick);
    else R.light(lp, 26, [1, 0.12, 0.08], 1.2 * (0.6 + 0.4 * Math.sin(t * 3 + i)));
  }
  // cinematic key + fill on the mech in its cradle
  R.light(addv(HANGAR, [12, 14, 16]), 34, [1, 0.9, 0.8], phase === 'launch' ? 1.6 : 0.8);          // key on the mech only
  R.light(addv(HANGAR, [-9, 5, -6]), 22, [0.35, 0.5, 0.9], 0.6);                                      // cold rim
  // blue containment curtain across the hangar mouth (z≈30): powers up with the bay lights, ripples as Sigma punches through
  if (phase === 'launch') {
    const k = smooth(150.6, 152, t);
    const pass = 157.9 + Math.sqrt(29.5 / 72);                 // catapult reaches the mouth
    R.bayField(addv(HANGAR, [0, 11, 29.5]), [13.6, 0, 0], [0, 12.6, 0], t > pass ? t - pass : -1, [0.35, 0.7, 1.6], 0.45 * k);
  }
  // chasing guide lights toward the mouth
  if (phase === 'launch') {
    // floor lights show the launch direction (+Z, toward the mouth): chasing rails + chevrons down the centre line
    const hot = 1 + 1.5 * smooth(157.4, 157.9, t);              // go signal: everything surges just before the catapult
    const speed = 2.5 + 3 * smooth(157.4, 157.9, t);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 22; i++) {
        const z = -60 + i * 4.5;
        const ph = ((t * speed - i * 0.1) % 1 + 1) % 1;
        const k = (0.12 + Math.pow(1 - ph, 5) * 3.5) * on * hot;
        R.glow(addv(HANGAR, [side * 5, 0.25, z]), 0.55, [0.3 * k, 1.3 * k, 3 * k], 0.4);
      }
    }
    for (let i = 0; i < 12; i++) {                                // chevrons '^' pointing +Z
      const z = -52 + i * 8;
      const ph = ((t * speed * 0.5 - i * 0.09) % 1 + 1) % 1;
      const k = (0.1 + Math.pow(1 - ph, 4) * 2.5) * on * hot;
      for (let j = -3; j <= 3; j++) {
        R.glow(addv(HANGAR, [j * 0.55, 0.22, z - Math.abs(j) * 0.7]), 0.32, [3 * k, 1.8 * k, 0.4 * k], 0.4);
      }
    }
  }
}

// ------------------------------------------------------------------ shots
function gundamHangarState(t, phase) {
  const s = { vis: true, pos: addv(HANGAR, [0, 9, 0]), fwd: [0, 0, 1], pose: {}, saber: 1, thr: 0, damage: 0, eye: 0, roll: 0, pitch: 0 };   // mace in hand
  if (phase === 'standby') {
    blendPose('stand', 'stand', 0, s.pose);
    s.saber = 0;                                   // mace racked while standing by (it swept past the lens and flashed)
    return s;
  }
  // launch: crouch on catapult, eyes ignite 153, catapult 158
  blendPose('stand', 'crouch', smooth(154.5, 156.8, t), s.pose);
  // visor ignition: two dead flickers, a catch, an over-bright flare that settles to a steady glow
  const fl = [[153.0, 153.06], [153.18, 153.22], [153.34, 153.4]];
  let ev = t >= 153.5 ? 1 + 1.2 * Math.exp(-(t - 153.5) * 3.2) : 0;
  for (const [a, b] of fl) if (t >= a && t < b) ev = 0.7;
  s.eye = ev; s.visorFlare = t >= 153.5 ? Math.exp(-(t - 153.5) * 1.6) : 0;
  if (t > 157.9) {
    const lt = t - 157.9;
    s.pos = addv(HANGAR, [0, 9 - 2.5 * smooth(154.5, 156.8, t), 1.2 * 60 * lt * lt]);
    blendPose('crouch', 'flight', sat(lt / 1.2), s.pose);
    s.thr = 1;
  } else s.pos[1] -= 2.5 * smooth(154.5, 156.8, t);
  s.thr = t > 157.6 ? 1 : 0.15 * smooth(155, 156, t);
  return s;
}

export const SHOTS = [];
function shot(t0, t1, name, fn) { SHOTS.push({ t0, t1, name, fn }); }

// ============ ACT I — EXODUS
// COLD OPEN (flash-forward): a calm view of empty space... the camera turns and we are in the middle of the battle.
const CO_T0 = 139.4;                              // world time shown during the cold open (film 0 -> world 139.4)
const CO_CAM = [170, 105, -860];
// cold-open close action: fighters knife past the lens, bolts cross, a strike craft dies next to us, debris everywhere
const CO_FLY = [   // [t0 (film), side offset, height, speed, enemy?, dir sign]
  [8.3, -14, 6, 55, 1, 1], [8.45, -10, 9, 55, 0, 1], [9.4, 18, -8, 48, 1, -1], [9.55, 22, -4, 48, 0, -1],
  [10.6, -6, 12, 62, 0, 1], [11.3, 12, -3, 45, 1, 1], [11.45, 9, 1, 45, 0, 1], [12.3, -20, -10, 52, 1, -1],
];
function coFighter(t, k, cam, fwd, side) {
  const [t0, off, h, sp, , sg] = CO_FLY[k];
  const lt = t - t0;
  // enters from behind the camera, crosses the frame toward the enemy line with a lazy S-curve
  const along = 18 + lt * sp;
  const lat = off + sg * 8 * Math.sin(lt * 1.6) + sg * lt * 6;
  return addv(madd(madd(cam, fwd, along), side, lat), [0, h + 6 * Math.sin(lt * 2.1 + k), 0]);
}
const CO_BOOM = [[9.05, 1], [10.35, 4], [11.25, 2], [12.2, 6], [13.1, 7]];
function drawColdOpenAction(R, t, cam, tgt) {
  const fwd = V.norm([0, 0, 0], V.sub([0, 0, 0], tgt, cam));
  const side = V.norm([0, 0, 0], V.cross([0, 0, 0], fwd, [0, 1, 0]));
  const upv = V.cross([0, 0, 0], side, fwd);
  for (let k = 0; k < CO_FLY.length; k++) {
    const [t0, , , , enemy] = CO_FLY[k];
    if (t < t0 || t > t0 + 4.5) continue;
    const die = CO_BOOM.find((b) => b[1] === k);
    const p = coFighter(t, k, cam, fwd, side);
    if (die && t > die[0]) { explosion(R, t, die[0], coFighter(die[0], k, cam, fwd, side), 9, 900 + k, 'small'); continue; }
    const q = coFighter(t + 0.05, k, cam, fwd, side);
    const name = fighterModel(enemy, k);
    const e = R.add(name, mat(tmpM, p, V.sub([0, 0, 0], q, p), [0, 1, 0], Math.sin((t - t0) * 2 + k) * 0.7));
    if (e) engineGlows(R, name, e, enemy ? ENEMY_ENGINE : HIIG_ENGINE, 0.8, 1, 3,
      { past: (tau) => { const a = coFighter(t - tau, k, cam, fwd, side), b2 = coFighter(t - tau + 0.05, k, cam, fwd, side); return { m: mat(new Float32Array(16), a, V.sub([0, 0, 0], b2, a), [0, 1, 0], 0) }; } });
    // chasers fire short bolts at the craft ahead of them
    if (!enemy && k > 0 && CO_FLY[k - 1][4]) {
      for (let j = 0; j < 9; j++) {
        const tf = t0 + 0.25 + j * 0.3;
        const from = coFighter(tf, k, cam, fwd, side), to = coFighter(tf + 0.12, k - 1, cam, fwd, side);
        bolt(R, t, tf, tf + 0.12, from, madd(to, upv, (hash(j + k) - 0.5) * 6), 16, 0.35, [0.8, 1.6, 3.2], 1);
      }
    }
  }
  // crossing capital-ship bolts close overhead (short heavy ion slugs)
  for (let j = 0; j < 7; j++) {
    const tf = 8.5 + j * 0.7 + hash(j) * 0.3;
    const a = addv(madd(madd(cam, fwd, -200), side, -300 + hash(j + 2) * 120), [0, 30 + hash(j + 4) * 60, 0]);
    const b = addv(madd(madd(cam, fwd, 700), side, 250 - hash(j + 5) * 200), [0, -20 + hash(j + 6) * 50, 0]);
    bolt(R, t, tf, tf + 0.9, j % 2 ? b : a, j % 2 ? a : b, 90, 1.6, j % 2 ? [3.2, 1.0, 0.3] : [0.7, 1.5, 3.4], 1.2);
  }
  // close debris drifting across the lens
  for (let i = 0; i < 16; i++) {
    const p = addv(madd(madd(cam, fwd, 25 + hash(i) * 120), side, -70 + hash(i + 1) * 140 - (t - 8) * (4 + 6 * hash(i + 2))), [0, -30 + hash(i + 3) * 60, 0]);
    M.fromTRS(_dbM, p, Q.fromEuler(_dbQ, t * (0.4 + hash(i + 4)) + i, t * 0.3 + i, t * 0.5), 0.08 + 0.18 * hash(i + 5));
    const de = R.add('debris', _dbM);
    if (de) { de.hidden = debrisOnly(R, 'hull' + (i % 4)); de.damage = 0.4 + 0.3 * hash(i + 6); }
  }
  // burning wreck fire + distant flak bursts beyond the frigate
  for (let i = 0; i < 10; i++) {
    const tb = 8.4 + i * 0.55;
    if (t < tb || t > tb + 0.6) continue;
    const p = addv(madd(madd(tgt, fwd, -60 - hash(i) * 200), side, -220 + hash(i + 1) * 440), [0, -60 + hash(i + 2) * 140, 0]);
    hitFlash(R, t, tb, p, 7, [1, 0.6, 0.3]);
  }
}
shot(0, 14, 'C0 cold open', (c) => {
  c.env.sunDisc = 0;                            // (the sun disc slid through the lower-left of the frame during the tilt: a stray light blob)
  const { t, R } = c;
  c.worldT = CO_T0 + t;
  // the camera sits off the dreadnought's flank; it opens looking UP into quiet stars, slowly sinks, then whips
  // straight DOWN (a pure tilt, no sideways swing) onto the dreadnought broadside with the battle raging around it
  const tilt = easeInOut(sat((t - 0.8) / 7.4));
  const D = dreadPos(c.worldT);
  const fightTgt = addv(D, [0, 0, 60]);
  const pos = addv(D, [640 + Math.sin(t * 0.1) * 4, 170 - 8 * tilt, 120 - Math.max(0, t - 8.25) * 5]);
  const fightDir = V.norm([0, 0, 0], V.sub([0, 0, 0], fightTgt, pos));
  const horiz = V.norm([0, 0, 0], [fightDir[0], 0, fightDir[2]]);
  const pitchUp = 1.05 - 0.2 * tilt;                                    // radians above the horizon while calm
  const calmDir = V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], horiz, Math.cos(pitchUp)), [0, Math.sin(pitchUp), 0]));
  const w = easeInOut(sat((t - 8.25) / 0.35));                        // whip pan
  const dir = V.norm([0, 0, 0], V.lerp([0, 0, 0], calmDir, fightDir, w));
  camLook(c, pos, V.madd([0, 0, 0], pos, dir, 200), lerp(34, 50, w), lerp(0.02, -0.06, w));
  if (t < 8.25) handheld(c, 0.04); else { shake(c, 0.5 + 0.5 * Math.exp(-(t - 8.6) * 2), 12); handheld(c, 0.5); }
  if (t > 8.2) drawColdOpenAction(R, t, pos, fightTgt);
  for (const b of CO_BOOM) if (t > b[0] && t < b[0] + 0.6) shake(c, 1.4 * Math.exp(-(t - b[0]) * 5), 16);
  c.post.fade = smooth(0.3, 3.5, t);
  c.post.lensA = { enable: 0 };
  c.env.planet = null; c.env.nebula = 0;
  c.env.fill = [0.35, 0.37, 0.45, 0.5];
  c.post.shakeBlur = t > 8.2 && t < 8.7 ? 0.004 : 0;
});
shot(14, 16, 'C1 black', (c) => {
  c.world = false;
  camLook(c, [0, 0, 0], [0, 0, 1], 40);
  c.post.fade = 0; c.env.planet = null;
});
function hangarEnv(c, phase) {
  const e = c.env;
  e.sunCol = [0.25, 0.25, 0.3]; e.ambient = phase === 'launch' ? 0.1 * smooth(150, 151.5, c.t) + 0.06 : 0.1;   // dark bay: a few pools of light only
  e.ambUp = [0.025, 0.025, 0.03]; e.ambDown = [0.012, 0.012, 0.015];
  e.shadows = false; e.sunDisc = 0; e.planet = null; e.fill = [0.05, 0.05, 0.06, 0.15];
  e.interior = HANGAR;
  e.rim = phase === 'launch' ? [0.3, 0.45, 0.8, 0.35] : [0.8, 0.12, 0.1, 0.35];
}
// ---- escorts: three interceptors cruising slowly near the arrival point (scale reference, Dune-style)
function escortPos(t, k) {
  return [-40 + k * 26 + Math.sin(t * 0.3 + k) * 2, -95 + k * 7 + Math.sin(t * 0.4 + k * 2) * 1.5, 120 + (t - 16) * 9 - k * 18];
}
function drawEscorts(R, t, n = 3, scaleGlow = 0.8) {
  for (let k = 0; k < n; k++) {
    const e = R.add(fighterModel(false, k), mat(M.new(), escortPos(t, k), [0, 0, 1], [0, 1, 0], Math.sin(t * 0.5 + k) * 0.1));
    if (e) { R._time = t; engineGlows(R, fighterModel(false, k), e, HIIG_ENGINE, scaleGlow, 1, 4); }
  }
}
shot(16, 30, 'A2 THE ARRIVAL', (c) => {
  const { t, u, R } = c;
  drawEscorts(R, t);
  // far wide: the rift opens (17.5), the mothership bursts out in one second (19) and then the camera takes its time —
  // a slow push past the escorts (scale) that finally tilts up under the prow
  const b = R.models.mothership.bounds;
  const len = b.max[2] - b.min[2];
  const k = 1;                                                        // fixed at the close framing from the first frame (no push-in)
  const pos = [lerp(-len * 0.95, -len * 0.42, k), lerp(-len * 0.2, -len * 0.12, k), lerp(len * 1.15, len * 0.62, k)];
  const tgt = [0, lerp(-len * 0.02, len * 0.05, k), lerp(-len * 0.15, len * 0.1, k)];
  camLook(c, pos, tgt, lerp(38, 48, k), 0.05 - 0.03 * k);
  handheld(c, 0.06);
  c.env.shadowCenter = [0, 0, 0]; c.env.shadowRadius = len * 0.7;
  c.post.fade = smooth(16, 17.2, t);
  c.env.fill = [0.3, 0.32, 0.4, 0.4];
});
shot(30, 40, 'A3 belly pass', (c) => {
  const { t, u, R } = c;
  const b = R.models.mothership.bounds;
  // the flagship is ALREADY under way: the camera hangs just below the keel and the hull streams past overhead —
  // plates, hatches and lights rush by fast, yet the ship takes the whole ten seconds to go by (it is that long)
  const L = b.max[2] - b.min[2];
  const z = lerp(b.max[2] + 25, b.max[2] - L * 0.72, (t - 30) / 10);   // constant speed; the shot cuts before the stern arrives
  const y = b.min[1] - 5;                                              // skimming just under the keel
  const pos = motherPoint([0, 0, 0], t, [-18, y, z]);
  const look = motherPoint([0, 0, 0], t, [-8, y + 26, z - 70]);       // up and aft: the hull rushes at us overhead
  camLook(c, pos, look, 60, 0.1);
  handheld(c, 0.12);
  c.post.motionBlur = 1.2; c.post.mbNear = 0;
  for (let k = 0; k < 3; k++) {
    const p = motherPoint([0, 0, 0], t, [-40 + k * 26, b.min[1] - 26 - k * 4, z + 160 - (t - 30) * 20 - k * 22]);
    const e = R.add(fighterModel(false, k), mat(M.new(), p, rotY([0, 0, 0], [0, 0, -1], motherYaw(t))));
    if (e) engineGlows(R, fighterModel(false, k), e, HIIG_ENGINE, 0.7, 1, 4);
  }
  c.env.shadowCenter = motherPoint([0, 0, 0], t, [0, 0, z]); c.env.shadowRadius = 220;
  c.env.fill = [0.35, 0.37, 0.45, 0.5];
});
shot(40, 50, 'A4 fleet assembles', (c) => {
  // one steady wide 3/4 view from high off the port quarter that holds the WHOLE formation (x ±400, z 40..450 around the
  // flagship), so every frigate's hyperspace exit (40.5 .. 49.3) is seen as it happens
  const { t, u } = c;
  const look = [-20, -10, 170 + u * 30];
  camLook(c, [-980 + u * 90, 430 - u * 30, -760 + u * 70], look, 44, -0.03);
  c.env.shadowCenter = [0, 0, 220]; c.env.shadowRadius = 640;
  c.env.fill = [0.3, 0.29, 0.28, 0.5]; c.env.rim = [0.5, 0.55, 0.65, 0.5];
});
shot(50, 57, 'A6 hangar', (c) => {
  const { t, u } = c;
  c.world = false; c.hangar = 'standby';
  const h = HANGAR;
  camLook(c, addv(h, [6 - u * 3, 4 + u * 9, 16 - u * 5]), addv(h, [0, 6 + u * 10, 0]), 44, 0.02);
  handheld(c, 0.15);
  hangarEnv(c, 'standby');
});
shot(57, 63, 'A7 the promise', (c) => {
  const { t, u } = c;
  const b = c.R.models.mothership.bounds;
  // over the dorsal hull toward the planet: the prow and the planet in one frame
  const pos = motherPoint([0, 0, 0], t, [b.max[0] * 0.2, b.max[1] + 16, b.min[2] * 0.2 - u * 20]);
  camLook(c, pos, V.madd([0, 0, 0], pos, PLANET, 1000), 44, 0.03);
  c.env.fill = [0.3, 0.32, 0.4, 0.4];
});
shot(63, 70, 'B1 red alert', (c) => {
  const { t, u } = c;
  const L = modelLen(c.R, 'mothership');
  const pos = motherPoint([0, 0, 0], t, [34, 116, -L * 0.05 + u * 30]);      // standing on top of the hull (flagship v9 top ≈ 98 m)
  camLook(c, pos, lerpv(addv(WELL, [0, -900, 0]), addv(WELL, [0, -500, 0]), u), 40);
  shake(c, t < 64.5 ? 0.35 : 0.08, 6);
  c.env.shadowRadius = 300;
});
shot(70, 80, 'B2 the well switches on', (c) => {
  const { t, u } = c;
  // looking down the ring's axis (+Z) at a sunlit planet behind it: when the well switches on,
  // continents and clouds are dragged into a ring around a black disc (Interstellar-like, no neon)
  const dist = 1300 - u * 200;
  const pos = V.add([0, 0, 0], WELL, [60, 40, -dist]);
  camLook(c, pos, V.add([0, 0, 0], WELL, [0, 0, 400]), 32 - u * 5, 0.02);
  c.env.planet = { dir: V.norm([0, 0, 0], [0.12, -0.3, 1]), radius: 0.42, col: [0.62, 0.46, 0.34], earth: false };
  c.env.planetInSky = true;
  c.env.sunDir = V.norm([0, 0, 0], [-0.45, 0.55, -0.7]);
  c.env.sunDisc = 0;
  c.env.rim = [0.5, 0.45, 0.4, 0.25];
  const k1 = Math.exp(-Math.max(0, t - 70) * 2.2), k2 = t > 74.5 ? Math.exp(-(t - 74.5) * 2.5) : 0;
  shake(c, 0.9 * k1 + 0.6 * k2, 7);
  c.post.shakeBlur = 0.0015 * (k1 + k2);
  c.post.lensA = { ...wellLens(c, wellMass(t) * 2.3, 0.25 + wellOn(t) * 0.9, true, 0.35) };
  c.post.exposure = 0.95 - 0.3 * k1;
  c.post.ca = 0.001 + 0.004 * (k1 + k2);
  c.env.shadowCenter = WELL; c.env.shadowRadius = 200;
  c.env.fill = [0.2, 0.2, 0.22, 0.4];
});
// 80–100: the dreadnought arrives. Enemy frigates first (small, close), then the colossus slides out.
shot(80, 100, 'B3 DREADNOUGHT REVEAL', (c) => {
  const { t, u, R } = c;
  const d = dreadPos(t);
  const Ld = modelLen(R, 'enemy_dreadnought');
  const sz = modelSize(R, 'enemy_dreadnought');
  const winZ = d[2] - Ld * 0.5;
  // two enemy frigates jump in first and fly alongside the emergence path: the scale reference
  for (let k = 0; k < 2; k++) {
    const ta = 81.6 + k * 0.7;
    if (t < ta) continue;
    const p = [d[0] + sz[0] * 0.5 + 40 + k * 55, d[1] - 40 - k * 25, winZ + 80 + (t - ta) * 14 + k * 40];
    const e = R.add('enemy_frigate', mat(M.new(), p, [0, 0, 1]));
    if (e) { e.tint = [2, 0.3, 0.2]; R._time = t; engineGlows(R, 'enemy_frigate', e, ENEMY_ENGINE, 1, 0.8); }
    if (t < ta + 1.5) hyperWindow(R, [p[0], p[1], p[2] - 25], [0, 0, 1], 24, 18, HYPER_RED, Math.min(1, (ta + 1.5 - t)));
  }
  // low camera beside the path, looking back at the window, then tilting up as the prow slides past overhead
  const cam = [d[0] + sz[0] * 0.5 + 150, d[1] - 120, winZ + Ld * 0.95];
  const prowZ = winZ + Ld * easeOut(sat((t - 85) / 14));
  const target = t < 85 ? [d[0], d[1], winZ] : lerpv([d[0], d[1], winZ], [d[0], d[1] + 20, prowZ], 0.6);
  camLook(c, cam, target, lerp(38, 56, smooth(85, 99, t)), 0.06);
  handheld(c, 0.06);
  shake(c, (t > 85 && t < 86.5) || (t > 90 && t < 91) || (t > 95 && t < 96) ? 0.18 : 0, 5);
  c.env.shadowCenter = [d[0], d[1], winZ + 200]; c.env.shadowRadius = 450;
  c.env.fill = [0.3, 0.26, 0.26, 0.45]; c.env.rim = [0.95, 0.35, 0.3, 0.9];
  c.post.gradeShadows = [1.05, 0.94, 0.96];
  c.env.sunDisc = 0.08;
  c.env.planet = null;                        // close on the dreadnought: no tiny planet behind it
});
shot(100, 110, 'B4 standoff', (c) => {
  const { t, u } = c;
  c.env.sunDir = V.norm([0, 0, 0], [0.75, 0.55, -0.35]);        // key from high behind the camera: the moon behind the fleets shows its lit face
  // side-on profile of the whole gap: our flagship on the left, the dreadnought on the right, bows facing
  const d = dreadPos(t), m = motherPoint([0, 0, 0], t, [0, 0, 0]);
  const mid = V.lerp([0, 0, 0], m, d, 0.5);
  const axis = V.norm([0, 0, 0], V.sub([0, 0, 0], d, m));
  const side = V.norm([0, 0, 0], V.cross([0, 0, 0], axis, [0, 1, 0]));
  const gap = V.dist(m, d);
  const pos = addv(madd(madd(mid, side, gap * 1.18), axis, -gap * 0.08 + u * gap * 0.06), [0, -gap * 0.08, 0]);
  camLook(c, pos, addv(V.lerp([0, 0, 0], m, d, 0.46), [0, gap * 0.02, 0]), 42, 0.02);
  handheld(c, 0.05);
  c.env.shadowCenter = mid; c.env.shadowRadius = gap * 0.7;
});
shot(110, 120, 'B5 ion muzzle charge', (c) => {
  const { t, u } = c;
  const st = ionFrigate(t, 0);
  const L = modelLen(c.R, 'ion_frigate');
  const m = ionMuzzle(c.R, t, 0);
  const side = V.norm([0, 0, 0], V.cross([0, 0, 0], st.fwd, [0, 1, 0]));
  // when the charge starts bleeding away the camera swings round to follow it: past the muzzle, down the line into
  // the distance where the gravity well waits
  const wellDir = V.norm([0, 0, 0], V.sub([0, 0, 0], WELL, m)), kc = easeInOut(sat((t - 116.4) / 2.4));
  const p0 = madd(madd(m, st.fwd, -L * 0.45 + u * 10), side, 30 + u * 4).map((v, i) => v + (i === 1 ? 12 : 0));
  const perp = V.norm([0, 0, 0], V.cross([0, 0, 0], wellDir, [0, 1, 0]));
  const p1 = addv(madd(madd(m, wellDir, 60), perp, 230), [0, 45, 0]);            // side-on to the drain line: the streams race across frame
  camLook(c, V.lerp([0, 0, 0], p0, p1, kc), V.lerp([0, 0, 0], madd(m, st.fwd, 12), madd(m, wellDir, 330), kc), lerp(44, 58, kc), 0.06);
  handheld(c, 0.3);
  c.env.shadowCenter = st.pos; c.env.shadowRadius = 70;
  const R = c.R;
  // the charge climbs... stalls... and the gravity well pulls it back out of the coils (nothing will fire at 120)
  const k = sat((t - 110) / 6) * 0.85 * (1 - 0.8 * smooth(116.2, 119.5, t));
  ionCharge(R, GUN.ionEntries && GUN.ionEntries[0], t, k, t > 115.6, 11);                   // the gun wakes stage by stage…
  drainOutflow(R, t, 115.8, m, smooth(115.8, 116.8, t), 11);                                  // …and the well drinks it
});
shot(120, 123.6, 'S9a nothing fires', (c) => {
  // the order is given and nothing leaves the muzzles: the charges bleed away toward the well while red fire pours in
  const { t, u } = c;
  camLook(c, [-330 + u * 30, 60, -60 - u * 60], [60, 0, -760], 50, -0.12);
  handheld(c, 0.15);
  c.env.shadowCenter = [-150, 0, 0]; c.env.shadowRadius = 400;
});
// close on one of OUR line ships as an enemy bolt kills it (world.js H_FEATURED: deaths chosen for these cameras)
function lossCam(c, k, dist, ang, fov) {
  const f = H_FEATURED[k]; if (!f) return false;
  const p = extraHPos(Math.min(c.t, f.t), f.i).pos;
  camLook(c, addv(p, [Math.sin(ang) * dist, dist * 0.3, Math.cos(ang) * dist]), p, fov, 0.08);
  c.env.shadowCenter = p; c.env.shadowRadius = 90;
  return f.t;
}
shot(123.6, 127.8, 'S9b our frigate dies', (c) => {
  const td = lossCam(c, 0, 250 - c.u * 30, 2.6, 40);
  shake(c, td && c.t > td && c.t < td + 1.4 ? 0.9 : 0.1, 8);
});
shot(127.8, 134, 'S9c wide battle', (c) => {
  const { t, u } = c;
  camLook(c, [700 - u * 100, 320, -300], [0, 0, -700], 38, 0.06);
  handheld(c, 0.3);
  c.env.shadowRadius = 700; c.env.shadowCenter = [0, 0, -500];
});
// interceptor strafing run along the enemy line, chased by a red fighter (scripted so it always reads)
function strafeRun(t) { return [-520 + (t - 134) * 150, 40 + Math.sin(t * 1.3) * 18, -980 + Math.sin(t * 0.7) * 30]; }
// the strike leader's four-ship finger formation is jumped from behind; three wingmen die one after another
// [side, up, back] in the leader's frame, death time (null = the leader survives)
const STRIKE = [[0, 0, 0, null], [-15, -2, 11, 139.7], [17, 1, 13, 137.9], [32, -3, 25, 136.1]];
const BANDITS = [[-6, 5, 70], [14, 9, 84], [30, 2, 96]];
function strikePos(t, off) {
  const a = strafeRun(t), v = V.norm([0, 0, 0], V.sub([0, 0, 0], strafeRun(t + 0.05), a));
  const sd = V.norm([0, 0, 0], V.cross([0, 0, 0], v, [0, 1, 0])), up = V.cross([0, 0, 0], sd, v);
  const wob = [Math.sin(t * 1.3 + off[0]) * 1.5, Math.sin(t * 1.7 + off[2]) * 1.0, 0];
  return { p: V.add([0, 0, 0], V.add([0, 0, 0], V.add([0, 0, 0], a, V.scale([0, 0, 0], sd, off[0] + wob[0])), V.scale([0, 0, 0], up, off[1] + wob[1])), V.scale([0, 0, 0], v, -off[2])), v };
}
shot(134, 141, 'S10a dogfight chase', (c) => {
  const { t, R } = c;
  const lead = strikePos(t, STRIKE[0]);
  STRIKE.forEach((w, k) => {
    const [x, y, z, die] = w;
    const roll = Math.sin(t * 1.7 + k) * 0.6 + (die && t > die - 0.9 ? Math.sin(t * 9 + k) * 0.5 : 0);   // hit-jinking before the end
    if (die && t > die) {                                                       // killed: fireball, the craft breaks up
      const st = strikePos(die, [x, y, z]);
      explosion(R, t, die, st.p, 14, 610 + k, 'small');
      shatter(R, fighterModel(false, k), mat(M.new(), st.p, st.v, [0, 1, 0], roll), t, die, 620 + k, [2, 1, 3], 1.4, { tint: [0.4, 0.7, 1] });
      return;
    }
    const st = strikePos(t, [x, y, z]);
    const e = R.add(fighterModel(false, k), mat(M.new(), st.p, st.v, [0, 1, 0], roll));
    const past = (tau) => { const q = strikePos(t - tau, [x, y, z]); return { m: mat(new Float32Array(16), q.p, q.v, [0, 1, 0], roll) }; };
    if (e) { R._time = t; engineGlows(R, fighterModel(false, k), e, HIIG_ENGINE, 0.6, 1, 3, { past }); }
  });
  // the bandits: three red fighters on their six, walking fire onto the wingmen
  BANDITS.forEach((b, k) => {
    const st = strikePos(t, b);
    const ef = R.add(fighterModel(true, k), mat(M.new(), st.p, st.v, [0, 1, 0], -Math.sin(t * 1.5 + k) * 0.5));
    const past = (tau) => { const q = strikePos(t - tau, b); return { m: mat(new Float32Array(16), q.p, q.v, [0, 1, 0], 0) }; };
    if (ef) engineGlows(R, fighterModel(true, k), ef, ENEMY_ENGINE, 0.6, 1, 3, { past });
  });
  for (let n = 0; n < 24; n++) {
    const tf = 134.3 + n * 0.26;
    const tgtK = tf < 136.1 ? 3 : tf < 137.9 ? 2 : tf < 139.7 ? 1 : 0;          // each burst on the next victim
    const shooter = BANDITS[n % 3];
    const from = strikePos(tf, shooter).p;
    const tp = strikePos(tf + 0.2, STRIKE[tgtK]).p;
    const miss = tgtK === 0 ? 9 : (n % 3 === 0 ? 1 : 5);
    const to = V.add([0, 0, 0], tp, [(hash(n) - 0.5) * miss * 2, (hash(n + 1) - 0.5) * miss * 1.4, 0]);
    bolt(R, t, tf, tf + 0.2, from, to, 12, 0.2, [3, 1.2, 0.4], 1);
  }
  const v = lead.v;
  const sd = V.norm([0, 0, 0], V.cross([0, 0, 0], v, [0, 1, 0]));
  const roll = Math.sin(t * 1.7) * 0.6;
  const cam = V.add([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], lead.p, v, -128), sd, -22), [0, 26, 0]);   // behind the bandits
  camLook(c, cam, V.madd([0, 0, 0], lead.p, v, 10), 46, roll * 0.25);
  shake(c, 0.35, 12);
  for (const w of STRIKE) if (w[3] && c.t > w[3] && c.t < w[3] + 0.6) shake(c, 0.9 * Math.exp(-(c.t - w[3]) * 5), 14);
  c.env.shadowCenter = lead.p; c.env.shadowRadius = 90;
  c.post.shakeBlur = 0.0006;
});
shot(141, 145, 'S10b missiles swatted down', (c) => {
  // our last weapon that does not need a charge: the salvo streaks out and the enemy point defence swats it down
  const { t, u } = c;
  const a = assaultFrigate(141.8, 3).pos, b = EF[3].p;
  const mid = V.lerp([0, 0, 0], a, b, 0.28);
  camLook(c, addv(mid, [150 - u * 20, 70, 40]), V.lerp([0, 0, 0], a, b, 0.6), 46, -0.05);
  shake(c, 0.15, 8);
  c.env.shadowCenter = mid; c.env.shadowRadius = 300;
});
shot(145, 150, 'S10c fighter cockpit-ish', (c) => {
  const { t, u } = c;
  const k = 4;
  const a = fighterPos([0, 0, 0], k, t), b = fighterPos([0, 0, 0], k, t - 0.1);
  const v = V.norm([0, 0, 0], V.sub([0, 0, 0], a, b));
  camLook(c, addv(madd(a, v, -16), [3, 3, 0]), madd(a, v, 60), 64, Math.sin(t * 0.9) * 0.5);
  shake(c, t > 148.4 && t < 149.6 ? 1 : 0.35, 12);
  c.post.shakeBlur = 0.001;
  c.env.shadowCenter = a; c.env.shadowRadius = 60;
});
shot(150, 153, 'S11a hangar lights', (c) => {
  const { t, u } = c;
  c.world = false; c.hangar = 'launch';
  camLook(c, addv(HANGAR, [0, 15 - u * 2, 28]), addv(HANGAR, [0, 9, -10]), 54);
  handheld(c, 0.2);
  hangarEnv(c, 'launch');
});
shot(153, 156, 'S11b eyes ignite', (c) => {
  const { t, u } = c;
  c.world = false; c.hangar = 'launch';
  c.post.streak = 0.5 + 1.6 * (t > 153.5 ? Math.exp(-(t - 153.5) * 1.5) : 0);   // anamorphic flare off the visor
  c.post.bloom = 0.08 + 0.1 * (t > 153.5 ? Math.exp(-(t - 153.5) * 2) : 0);
  camLook(c, addv(HANGAR, [2.5 - u * 1, 16.4, 11 - u * 1.5]), addv(HANGAR, [0, 16.2, 0]), 30);
  handheld(c, 0.15);
  hangarEnv(c, 'launch');
});
shot(156, 159.4, 'S11c catapult', (c) => {
  const { t, u } = c;
  c.world = false; c.hangar = 'launch';
  camLook(c, addv(HANGAR, [8, 3, 34]), addv(gundamHangarState(t, 'launch').pos, [0, 2, 0]), 46, -0.05);
  shake(c, t > 157.9 ? 0.6 : 0.05, 14);
  hangarEnv(c, 'launch');
  const gm = addv(gundamHangarState(t, 'launch').pos, [0, 2, 0]);
  const fd = V.dist(c.cam.pos, gm);
  if (t > 157.6) { c.post.dof = { focus: fd, range: fd * 0.45, blur: 0.009 }; c.post.motionBlur = 2.2; }
  c.post.shakeBlur = t > 157.9 ? 0.002 : 0;
});
shot(159.4, 163, 'S11d fly-by', (c) => {
  const { t, u } = c;
  const g = gundamLaunchPath(Math.max(t, 159.6));
  const exitW = motherPoint([0, 0, 0], t, GUN.exitLocal || [60, 0, 0]);
  const cp = addv(gundamLaunchPath(162.2), [-18, 14, 60]);
  camLook(c, cp, addv(lerpv(exitW, g, 0.2 + 0.8 * smooth(159.5, 160.5, t)), [0, 6, 0]), 44, 0.04);
  { const fd = V.dist(c.cam.pos, g); c.post.dof = { focus: fd, range: fd * 0.4, blur: 0.008 }; c.post.motionBlur = 2.0; }
  shake(c, t > 161.4 && t < 162.6 ? 0.6 : 0.1, 10);
  c.env.shadowCenter = g; c.env.shadowRadius = 120;
});
shot(163, 170, 'S11e chase to battle', (c) => {
  const { t, u } = c;
  const g = gundamLaunchPath(t);
  const g2 = gundamLaunchPath(t - 0.25);
  const v = V.norm([0, 0, 0], V.sub([0, 0, 0], g, g2));
  camLook(c, addv(madd(g, v, -38), [8, 10, 0]), madd(g, v, 200), 52, Math.sin(t * 0.7) * 0.15);
  c.post.dof = { focus: 40, range: 25, blur: 0.009 }; c.post.motionBlur = 2.0;
  shake(c, 0.2, 9);
  c.env.shadowCenter = g; c.env.shadowRadius = 70;
});
shot(170, 194.6, 'S12 DUEL', (c) => {
  const k = duelCamera(c.t);
  if (!k) return;
  camLook(c, k.pos, k.target, k.fov, k.roll);
  shake(c, k.shake, k.shakeFreq); handheld(c, k.handheld);
  c.env.shadowCenter = k.focus; c.env.shadowRadius = k.shadowRadius;
  c.post.shakeBlur = k.blur;                                   // (no whole-screen flash on duel contacts: it read as flicker)
  c.env.fill = [0.42, 0.44, 0.52, 0.55]; c.env.rim = [0.6, 0.72, 1.0, 1.0]; c.env.ambient = 1.4;
  c.post.lensA = { enable: 0 };   // the well is far away: no background lensing (it smeared the planet into grey)
  if (k.slowmo) { c.post.saturation = 0.75; c.post.streak = 0.45; c.post.gradeHighlights = [1.2, 1.0, 0.85]; }
  { // bullet time: the picture drains a little and the edges fall away while time crawls
    const bs = sat((0.75 - bulletSpeed(storyT(FILM_NOW))) / 0.5);
    if (bs > 0) { c.post.saturation = lerp(c.post.saturation ?? 0.9, 0.62, bs); c.post.vignette = lerp(c.post.vignette ?? 0.8, 1.25, bs); c.post.contrast = lerp(c.post.contrast ?? 1.08, 1.16, bs); c.post.streak = Math.max(c.post.streak ?? 0, 0.4 * bs); }
  }
  // ---- the second RONIN from above (180.9–184.4): sensor spike → a silhouette against the light → the dive
  {
    const t = c.t, R = c.R;
    if (t > 180.9 && t < 181.6) {                              // visor spikes red, warning pulse
      const hs = duelHero(t), fk = duelFK({ ...hs, saber: 1 }, 'gundam');
      const hd = M.transformPoint([0, 0, 0], fk.head, [0, 0.6, 1.4]);
      const pk = Math.pow(0.5 + 0.5 * Math.sin((t - 180.9) * 28), 3);
      R.glow(hd, 0.35 + 0.4 * pk, [3 * pk + 0.4, 0.25, 0.12], 0.5);
      c.post.streak = 0.6 + 0.6 * pk; c.post.ca = 0.004 + 0.006 * pk; c.post.exposure = 0.8;
    }
    // (the backlight glow disc + red thruster star behind RONIN #2's entrance were removed: they read as a glow bug)
    if (t > 182.6 && t < 184.4) {                              // the dive: speed streaks and shock rings around RONIN
      const e = duelEnemy2(t).pos, eN = duelEnemy2(t + 0.05).pos;
      const dv = V.norm([0, 0, 0], V.sub([0, 0, 0], eN, e));
      for (let i = 0; i < 26; i++) {
        const o = V.norm([0, 0, 0], V.cross([0, 0, 0], dv, randDir([0, 0, 0], i * 2.9 + 1)));
        const ph = ((t * 4 + hash(i)) % 1);
        const p0 = madd(madd(e, o, 6 + 14 * hash(i + 2)), dv, 30 - ph * 60);
        R.beam(p0, madd(p0, dv, -10 - 10 * hash(i + 3)), 0.06, [1.2, 1.3, 1.6], 1, 10);
      }
      const slot = Math.floor((t - 182.6) / 0.16), age = (t - 182.6) - slot * 0.16;
      R.ripple(madd(e, dv, 4), 6 + age * 40, [0.2, 0.2, 0.2], (1 - age / 0.16) * 0.9);
    }
  }
  for (const bi of [1, 2]) {
    if (!BLOWS[bi]) continue;
    const lt = c.t - BLOWS[bi].ev.t;
    if (lt > 0 && lt < 1) {
      shake(c, 3.2 * Math.exp(-lt * 5), 18);
      c.post.shakeBlur = Math.max(c.post.shakeBlur || 0, 0.004 * Math.exp(-lt * 6));
    }
  }
});
// 194.6–200: the duel is won — cut away from the mech to the enemy flagship turning its prow toward the fleet
shot(194.6, 196.8, 'S12d the dreadnought turns', (c) => {
  const { t, u } = c;
  const d = dreadPos(t);
  // low under the flagship's flank, slow crane up along the hull toward its prow: the giant wakes
  camLook(c, addv(d, [-230 + u * 25, -70 + u * 20, 330 - u * 45]), addv(d, [0, 10, 120 + u * 40]), 44 - u * 3, 0.08 - u * 0.04);
  handheld(c, 0.12);
  c.env.shadowCenter = d; c.env.shadowRadius = 400;
  c.post.gradeShadows = [1.05, 0.92, 1.1];
});
// 200–216: ONE weapon, three long takes. The lines fall silent; the dreadnought drinks light.
shot(200, 207, 'S13a lance wakes', (c) => {
  const { t, u, R } = c;
  const d = dreadPos(t);
  const em = GUN.dread ? dreadEmitter(R, t, GUN.dread) : addv(d, [0, 0, 200]);
  // slow push down the length of the dreadnought toward the glowing fork
  camLook(c, addv(d, [120 - u * 40, 70 - u * 20, -260 + u * 180]), em, 40 - u * 6, 0.03);
  handheld(c, 0.12);
  c.post.lensB = { enable: 1, pos: em, thetaE: 0.02 + 0.06 * u, horizon: 0, swirl: 0, glow: 0 };
  c.post.godray = { pos: em, intensity: 0.12 * u, decay: 0.95 };
  c.env.shadowCenter = d; c.env.shadowRadius = 320;
  c.post.gradeShadows = [1.05, 0.9, 1.1];
});
shot(207, 212, 'S13b down the barrel', (c) => {
  const { t, u, R } = c;
  const em = GUN.dread ? dreadEmitter(R, t, GUN.dread) : dreadPos(t);
  const hit = motherPoint([0, 0, 0], t, LANCE_HIT);
  // behind and above the fork, looking along the firing line: the mothership small and far, dead ahead
  const back = V.norm([0, 0, 0], V.sub([0, 0, 0], em, hit));
  camLook(c, addv(madd(em, back, 70 - u * 20), [0, 26, 0]), lerpv(em, hit, 0.6), 34 - u * 8, 0);
  handheld(c, 0.08);
  shake(c, 0.1 + u * 0.3, 6);
  c.post.lensB = { enable: 1, pos: em, thetaE: 0.08 + 0.05 * u, horizon: 0, swirl: 0, glow: 0 };
  c.post.godray = { pos: em, intensity: 0.15 + 0.1 * u, decay: 0.955 };
  c.env.shadowRadius = 400;
});
shot(212, 216, 'S13c the charge peaks', (c) => {
  const { t, u, R } = c;
  const em = GUN.dread ? dreadEmitter(R, t, GUN.dread) : dreadPos(t);
  // close on the emitter between the forks; light and particles pour in, everything trembles
  camLook(c, addv(em, [70 - u * 15, 55 - u * 10, 90 - u * 25]), em, 40 - u * 10, 0.05);
  shake(c, 0.2 + u * u * 1.2, 14);
  c.post.shakeBlur = 0.0015 * u * u;
  c.post.lensB = { enable: 1, pos: em, thetaE: 0.13 + 0.05 * u, horizon: 0, swirl: 0, glow: 0 };
  c.post.ca = 0.002 + u * 0.006;
  c.env.shadowRadius = 200;
});
shot(216, 218, 'S14a lance fires', (c) => {
  const { t, u } = c;
  const hit = motherPoint([0, 0, 0], t, LANCE_HIT);
  const em = GUN.dread ? dreadEmitter(c.R, t, GUN.dread) : dreadPos(t);
  const mid = lerpv(em, hit, 0.72);
  camLook(c, addv(hit, [520, 180, -700]), lerpv(hit, em, 0.25), 55, 0.1);
  shake(c, 1.4 * Math.exp(-(t - 216) * 1.2), 12);
  c.post.flash = t < 216.2 ? 0.8 : 0;
  c.post.lensB = { enable: 1, pos: em, thetaE: 0.12, horizon: 0, swirl: 0, glow: 0 };
  c.post.shakeBlur = 0.002;
  c.env.shadowRadius = 600;
});
shot(218, 226, 'S14b tinnitus', (c) => {
  const { t, u } = c;
  // off the starboard flank, three-quarter from aft: the wall still melting open, the first bodies and crates spilling out
  const hit = motherPoint([0, 0, 0], t, LANCE_HIT);
  camLook(c, motherPoint([0, 0, 0], t, [LANCE_HIT[0] + 260 - u * 40, LANCE_HIT[1] + 70 - u * 15, LANCE_HIT[2] - 230 + u * 40]), hit, 40, 0.12 - u * 0.08);
  handheld(c, 1.0);
  c.post.saturation = 0.35 + u * 0.4; c.post.shakeBlur = 0.002 * (1 - u); c.post.exposure = 0.9;   // (1.25 washed the hull white)
  c.post.ca = 0.4 * (0.006 * (1 - u) + 0.002);
  c.env.shadowCenter = hit; c.env.shadowRadius = 260;
  c.env.shadows = false;                 // perf: the huge interior would double in the shadow pass
});
shot(226, 233, 'S15a the wound', (c) => {
  const { t, u } = c;
  // square on to the melted hole: the hangar bay exposed, molten rim dripping, contents streaming out
  const w = motherPoint([0, 0, 0], t, LANCE_HIT);
  camLook(c, motherPoint([0, 0, 0], t, [LANCE_HIT[0] + 170 - u * 35, LANCE_HIT[1] + 18 - u * 6, LANCE_HIT[2] + 60 - u * 20]), w, 44 - u * 4, 0.05);
  handheld(c, 0.35);
  c.env.shadowCenter = w; c.env.shadowRadius = 160;
  c.env.shadows = false;                 // perf: the huge interior would double in the shadow pass
});
shot(233, 240, 'S15b through the hole', (c) => {
  const { t, u } = c;
  // drifting in among the debris: people and cargo tumble past the lens, the lit bay beyond
  const w = motherPoint([0, 0, 0], t, [LANCE_HIT[0] - 20, LANCE_HIT[1], LANCE_HIT[2]]);
  camLook(c, motherPoint([0, 0, 0], t, [LANCE_HIT[0] + 95 - u * 30, LANCE_HIT[1] + 6 + u * 3, LANCE_HIT[2] - 14 + u * 6]), w, 48, -0.04);
  handheld(c, 0.45);
  c.env.shadowCenter = w; c.env.shadowRadius = 120;
  c.env.shadows = false;                 // perf: the huge interior would double in the shadow pass
});
// ---- the dive into the well (240–262): gravity pulses in time with the heartbeat, space streams toward the core,
// comms and the image start to break up
const HB_T = heartbeatTimes(244, 262);
function hbPulse(t) { let k = 0; for (const h of HB_T) if (t >= h - 0.02) k = Math.max(k, Math.exp(-(t - h) * 7)); return k; }
function interference(t, level) {           // smooth swells (no on/off switching — that read as flicker)
  const w = 0.5 + 0.5 * noise1(t * 1.3 + 7);
  return level * (0.12 + 0.35 * w * w);
}
function diveFX(c, t, lvl, g) {
  const pk = hbPulse(t);
  c.post.radial = { pos: WELL, strength: lvl * 0.05 + pk * (0.02 + lvl * 0.04) };   // gentle: Sigma must stay sharp
  c.post.mbNear = 90;
  c.post.interference = Math.min(0.8, 2.2 * (interference(t, lvl) + pk * 0.2 * lvl));   // drives the gravity-anomaly warp (final pass)
  c.post.ca = 0.4 * (0.002 + lvl * 0.004 + pk * 0.006);      // light touch: strong CA read as blur on Sigma
  c.post.vignette = 0.9 + lvl * 0.35 + pk * 0.2;
  c.post.exposure = (c.post.exposure ?? 1) * (1 - pk * 0.18);
  c.post.gradeShadows = [0.88, 0.95 + pk * 0.05, 1.18];
  c.post.gradeHighlights = [1.12 + pk * 0.1, 1.0, 0.9];
  c.post.streak = 0.5 + lvl * 0.6;
  shake(c, pk * (0.6 + lvl * 1.2), 18);
  c.env.warp = lvl * 0.05 + pk * 0.03;                       // a hint of streaking only (it smeared Sigma)
  return pk;
}
shot(240, 247, 'S16a dive start', (c) => {
  // behind and beside him at the melted flank, looking down his straight line toward the well: the wound fills the
  // near side of the frame, Sigma accelerates dead ahead and shrinks toward the well (no turns)
  const { t, u } = c;
  const g = gundamState(t);
  const S = diveStart(), dir = V.norm([0, 0, 0], V.sub([0, 0, 0], addv(WELL, [0, -10, -260]), S));
  const W = motherPoint([0, 0, 0], t, LANCE_HIT);
  const aw = V.norm([0, 0, 0], V.sub([0, 0, 0], S, W));
  const cam = addv(madd(madd(S, dir, -62), aw, 30), [0, 16, 0]);
  camLook(c, madd(cam, dir, u * 30), addv(madd(S, dir, 260), [0, 6, 0]), 48, 0.03);
  handheld(c, 0.12);
  const pk = diveFX(c, t, 0.08 + u * 0.18, g);
  c.post.lensA = wellLens(c, wellMass(t) * (1 + pk * 0.3), 0, true, 1);
  c.env.shadowCenter = W; c.env.shadowRadius = 200;
});
shot(247, 255, 'S16b time dilation', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [10, -6, 28 + u * 6]), addv(g.pos, [0, 8, 0]), 50 + u * 12, 0.3 * Math.sin(t * 0.4));
  shake(c, 0.3 + u * 0.4, 10);
  const pk = diveFX(c, t, 0.35 + u * 0.3, g);
  c.post.lensA = wellLens(c, wellMass(t) * (1 + u) * (1 + pk * 0.35), 0, true, 1.2);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 50;
});
shot(255, 262, 'S16c event horizon', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [-6, 14, -34]), addv(WELL, [0, 0, 0]), 62 - u * 8, 0.05);
  shake(c, 0.6, 12);
  const pk = diveFX(c, t, 0.65 + u * 0.35, g);
  c.post.lensA = wellLens(c, wellMass(t) * 2 * (1 + pk * 0.4), 0, true, 1.6);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 80;
});

// ============ ACT V — SINGULARITY
shot(262, 263.3, 'B1 berserk wakes', (c) => {
  c.env.sunDisc = 0.12;
  const { t } = c;
  const g = gundamState(t);
  const f = V.norm([0, 0, 0], g.fwd);
  camLook(c, addv(madd(g.pos, f, 14), [2.5, 7.5, 0]), addv(g.pos, [0, 7, 0]), 30, 0.08);
  shake(c, 0.4 + berserkHitK(t) * 0.8, 16);
  c.post.lensA = { enable: 0 };
  c.env.fill = [0.3, 0.2, 0.2, 0.5];
});
shot(263.3, 266.95, 'B2 clawing the shield', (c) => {
  c.env.sunDisc = 0.12;
  const { t, u } = c;
  const g = gundamState(t);
  // one angle per strike (cut halfway between hits): medium-close on the body so every wind-up and blow reads
  const i = t < (B_HITS[0] + B_HITS[1]) / 2 ? 0 : t < (B_HITS[1] + B_HITS[2]) / 2 ? 1 : 2;
  const ANG = [[-34, -12, -14, 0.10], [30, 9, -20, -0.08], [-12, 24, -30, 0.05]];   // [side, height, back, roll] from the mech
  const [ax, ay, az, rl] = ANG[i];
  const drift = (t - B_HITS[i]) * 1.5;
  camLook(c, addv(g.pos, [ax + drift, ay, az - drift]), addv(g.pos, [0, 5, 8]), 40, rl);
  const hk = berserkHitK(t);
  shake(c, 0.2 + hk * 2.4, 16);
  c.env.rim = [1.2, 0.35, 0.3, 1.2]; c.env.fill = [0.35, 0.3, 0.35, 0.5];
  c.post.shakeBlur = 0.002 * berserkHitK(t);
  c.post.lensA = { enable: 0 };
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 200;
});
// FIRST PERSON (≈11 s of film, see timemap.js): only the two hands in view, clawing the barrier open.
// The machine is pushed past its limits: joints spark, armour tears off the forearms, the head camera shakes and
// the feed breaks up (post: berserk/strain glitch).
shot(266.95, 268.05, 'B2b POV tear', (c) => {
  const { t, R } = c;
  c.env.sunDisc = 0.12;
  c.fpv = true;
  const film = c.filmT;
  const u = Math.max(0, tearU(film));                       // 0..1 across the stretched window
  const pre = film < 267.2 ? 1 : 0;
  const strain = pre ? 0.3 : 0.3 + 0.7 * Math.pow(u, 1.4);
  const g = gundamState(t);
  const f = V.norm([0, 0, 0], g.fwd);
  // eye at the visor, looking out along the arms at the fists in the shield
  const eyeP = madd(addv(g.pos, [0, 6.8, 0]), f, 1.2);          // at the head (hip + ~[0, 6, 2.6])
  // aim at the fists (what the pilot is staring at): midpoint of the hands, a little beyond, plus head shake
  const fk = duelFK({ ...g, saber: 0 }, 'gundam');              // this frame's hands (same FK as the renderer)
  const HL = M.transformPoint([0, 0, 0], fk.hand_L, [0, 0, 0]), HR = M.transformPoint([0, 0, 0], fk.hand_R, [0, 0, 0]);
  const grip = addv(madd(V.lerp([0, 0, 0], HL, HR, 0.5), f, 12), [0, 0.5, 0]);
  const look = addv(grip, [noise1(film * 6) * 1.5 * strain, 1.5 + noise1(film * 5 + 2) * 1.2 * strain, 0]);
  camLook(c, eyeP, look, 54 + strain * 5, noise1(film * 3.3) * 0.1 * strain);
  // head camera shake: constant tremor + violent jolts
  const jolt = Math.pow(Math.max(0, Math.sin(film * 2.7)), 18) + Math.pow(Math.max(0, Math.sin(film * 1.9 + 1)), 22);
  c.cam.pos[0] += noise1(film * 37) * 0.25 * strain; c.cam.pos[1] += noise1(film * 41 + 7) * 0.25 * strain;
  c.cam.target[0] += noise1(film * 23 + 3) * (1.2 + jolt * 5) * strain; c.cam.target[1] += noise1(film * 29 + 9) * (1.2 + jolt * 5) * strain;
  c.post.shakeBlur = 0.001 + 0.004 * strain * (0.5 + jolt);
  // failing feed
  c.post.berserk = 1.0 + strain * 0.9 + jolt * 0.4;
  c.post.redFlood = 0.22;                                   // keep the glitch, drop the red wash so the hands read
  c.post.ca = 0.004 + strain * 0.012 + jolt * 0.01;
  c.post.vignette = 1.3 + strain * 1.0;
  c.post.exposure = 0.9 + jolt * 0.3;
  c.post.lensA = { enable: 0 };
  c.env.rim = [0.7, 1.0, 1.9, 1.8]; c.env.fill = [0.1, 0.1, 0.13, 0.25];   // hands lit hard from the tear: dark armour, blue-white rims
  c.env.ambient = 0.35;
  // the rip: blinding energy where the fists are in the shield, arcing between the hands and up the arms
  {
    const hl = HL, hr = HR;
    const core = madd(V.lerp([0, 0, 0], hl, hr, 0.5), f, 4);
    const E = 0.45 + 0.8 * strain + 0.8 * jolt;
    R.glow(core, 2 + 7 * u, [1.4 * E, 2.2 * E, 4 * E], 0.5);
    R.light(core, 60, [0.55, 0.8, 1.6], 8 + 14 * strain);
    for (const hp of [hl, hr]) {
      R.glow(madd(hp, f, 1.5), 1.2 + 1.2 * strain, [1.5 * E, 2.4 * E, 4.2 * E], 0.45);
      for (let k = 0; k < 3; k++) {                          // jagged arcs (re-rolled every other frame)
        const sd = Math.floor(film * 4) * 3.1 + k * 7.7 + hp[0];
        let prev = madd(hp, f, 1.5);
        const target = madd(madd(hp, randDir([0, 0, 0], sd), 3 + 4 * hash(sd)), f, 2 * hash(sd + 1));
        for (let j = 1; j <= 5; j++) {
          const q = V.lerp([0, 0, 0], madd(hp, f, 1.5), target, j / 5);
          const jg = randDir([0, 0, 0], sd + j * 1.3);
          const pt = madd(q, jg, j < 5 ? 1.2 : 0);
          R.beam(prev, pt, 0.06, [2 * E, 3 * E, 5 * E], 1, 12);
          prev = pt;
        }
      }
    }
    // a seam of torn energy between the fists
    R.beam(madd(hl, f, 2), madd(hr, f, 2), 0.12 + 0.35 * u, [1.2 * E, 2 * E, 3.6 * E], 1.1, 26, 2, 1);
  }
  if (GUN.gundam) {
    for (const hn of ['hand_L', 'hand_R', 'arm_L_lower', 'arm_R_lower']) {
      const hm = R.partWorld('gundam', GUN.gundam, hn);
      const hp = M.transformPoint([0, 0, 0], hm, [0, 0, 0]);
      const isHand = hn.startsWith('hand');
      // sparks spraying from claws and elbow joints
      const nsp = isHand ? 10 : Math.round(4 + 10 * u);
      for (let k = 0; k < nsp; k++) {
        const per = 0.16 + hash(k + hn.length) * 0.22;
        const ph = ((film - 266.95) / per + hash(k + 5)) % 1;
        const d = V.norm([0, 0, 0], V.add([0, 0, 0], randDir([0, 0, 0], k * 2.9 + Math.floor((film - 266.95) / per + hash(k + 5)) * 5.1 + hn.length), V.scale([0, 0, 0], f, -1.2)));
        const p = madd(hp, d, ph * (8 + 14 * hash(k + 9)));
        const b = (1 - ph) * (1.2 + strain * 1.8);
        R.beam(madd(p, d, -1.6), p, 0.05, isHand ? [b * 0.7, b * 0.9, b * 1.3] : [b * 1.6, b * 0.9, b * 0.35], 1, 14);
      }
      // armour plates ripping off the forearms, and smoke/fire from overloaded joints
      if (!isHand && u > 0.25) {
        for (let k = 0; k < 4; k++) {
          const tb = 267.2 + (0.35 + k * 0.15 + hash(k + hn.length) * 0.1) * 10.8;
          if (film < tb) continue;
          const lt = film - tb;
          const d = V.norm([0, 0, 0], V.add([0, 0, 0], randDir([0, 0, 0], k * 7.7 + hn.length), [0, 0.8, -0.6]));
          const m = new Float32Array(16);
          M.fromTRS(m, madd(hp, d, 1 + lt * 9), Q.fromEuler([0, 0, 0, 1], lt * 3 + k, lt * 2, lt * 4), 0.18);
          const e = R.add('debris', m);
          if (e) { e.hidden = debrisOnly(R, 'hull' + (k % 4)); e.damage = 0.5; }
          if (lt < 0.25) R.glow(hp, 3, [4, 2, 0.8], 0.4);
        }
        R.fire(madd(hp, [0, 1, 0], 0.5), 1.2 + u * 1.5, 0.35, hn.length + Math.floor(film * 6) * 0.3, [1, 1, 1], 0.6 * u);
      }
      if (isHand) R.light(hp, 25, [0.6, 0.8, 1.6], 3 + 4 * strain);
    }
  }
});
shot(268, 270, 'B3 SHATTER', (c) => {
  c.env.sunDisc = 0.12;
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [-40 - u * 40, 20, -90 - u * 30]), addv(WELL, [0, 0, -40]), 50 + u * 8, -0.1);
  shake(c, 1.6 * Math.exp(-(t - 268) * 1.8), 12);
  c.post.flash = Math.max(0, 0.18 - (t - 268) * 0.6);
  c.post.lensA = { enable: 0 };
});
shot(270, 275, 'B4 the rush', (c) => {
  c.env.sunDisc = 0.12;
  const { t, u } = c;
  const g = gundamState(t);
  // third-person chase, accelerating into the core; the last second before impact cuts to a side angle that shows the
  // two-handed ram (mace levelled, body behind it) driving into the core
  if (t < 272.2) {
    const back = lerp(34, 18, easeIn(sat((t - 270) / 2.2)));
    camLook(c, addv(g.pos, [3, 11, -back]), addv(WELL, [0, 0, 0]), lerp(52, 72, easeIn(sat((t - 270) / 2.2))), 0.05 * Math.sin(t * 3));
  } else {
    camLook(c, addv(g.pos, [-42 + (t - 272.2) * 4, 9, -6]), addv(g.pos, [0, 5, 10]), 46, -0.06);
  }
  shake(c, 0.4 + (t > 272.8 ? 1.4 : 0), 14);
  c.post.lensA = wellLens(c, wellMass(t) * 1.4, 3, true, 1.2);
  c.post.mbNear = 80;
  c.post.flash = t > 272.95 && t < 273.15 ? 0.12 * (1 - (t - 272.95) / 0.2) : 0;
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 150;
  // the mace lands on the core: crater flash, shock ring, sparks and plates thrown back at the camera
  const R = c.R, lt = t - 273;
  if (lt > 0 && lt < 2) {
    const hp = addv(WELL, [0, -4, -24]);
    const k = Math.exp(-lt * 3);
    R.glow(hp, 5 + 12 * easeOut(sat(lt / 0.3)), [3 * k, 0.9 * k, 0.4 * k], 0.5);
    R.light(hp, 120, [1, 0.4, 0.2], 10 * k);
    if (lt < 0.6) R.ripple(hp, 10 + 120 * easeOut(lt / 0.6), [0.4, 0.4, 0.4], (1 - lt / 0.6) * 2);
    for (let i = 0; i < 40; i++) {
      const d = randDir([0, 0, 0], i * 3.1 + 7); if (d[2] > 0) d[2] = -d[2];
      const life = 0.4 + hash(i) * 0.8; if (lt > life) continue;
      const a = lt / life, p = madd(hp, d, (10 + 50 * hash(i + 2)) * easeOut(a)), q = madd(p, d, -6 * (1 - a));
      R.beam(q, p, 0.2, [5 * (1 - a), 2.5 * (1 - a), 1 * (1 - a)], 1, 10);
    }
    for (let i = 0; i < 14; i++) {
      const d = randDir([0, 0, 0], i * 4.7 + 2); d[2] = -Math.abs(d[2]) - 0.5;
      M.fromTRS(_dbM, madd(hp, V.norm(d, d), 3 + (20 + 30 * hash(i + 9)) * lt), Q.fromEuler(_dbQ, lt * 4 + i, lt * 2, lt * 3 + i), 0.12 + 0.1 * hash(i));
      const de = R.add('debris', _dbM);
      if (de) { de.hidden = debrisOnly(R, 'hull' + (i % 4)); de.damage = 0.6; }
    }
  }
});
shot(278, 280.2, 'S17d engulfed', (c) => {
  const { t, u } = c;
  const g = gundamState(Math.min(t, 280.2));
  c.closeCore = true;
  // low front three-quarter on the mech; the core's light swells behind it and eats the silhouette
  camLook(c, addv(g.pos, [12, 7, -36]), addv(g.pos, [0, 3, 0]), 40 - u * 6, -0.06);   // behind: its back against the light
  shake(c, 0.6 + u * 1.4, 16);
  c.post.shakeBlur = 0.002 * u;
  const k = smooth(278.4, 280.1, t);
  c.env.rim = [1.0 * (0.3 + k), 0.85 * (0.3 + k), 1.2 * (0.3 + k), 1.2];   // backlit by the core (kept low so the fire reads)
  c.env.ambient = 0.5; c.env.fill = [0.08, 0.07, 0.09, 0.2];
  c.post.exposure = 0.72 + k * 0.08;
  c.post.flash = t > 280.0 ? Math.min(0.9, (t - 280.0) * 5) : 0;
  c.post.lensA = { enable: 0 };
  c.env.sunDisc = 0.05;
  const R = c.R;
  const kw = Math.pow(smooth(279.7, 280.15, t), 2);                 // hold the white-out to the very last moment
  R.glow(WELL, 18 + 30 * k + kw * 380, [1.4 * k + 2.4 * kw + 0.2, 1.1 * k + 2.2 * kw + 0.15, 1.8 * k + 2.8 * kw + 0.3], 0.4);   // inside the core, behind the mech
  // caught in it: the core bursts through the shell right in front of Sigma — fireballs engulf the body from the
  // core side, armour plates tear off toward the lens, fire wraps the silhouette, then the white-out takes everything
  const gp = addv(g.pos, [0, 7, 0]);
  explosion(R, t, 278.9, addv(gp, [3, 2, 14]), 26, 881, 'ship');
  explosion(R, t, 279.35, addv(gp, [-4, -1, 8]), 40, 882, 'ship');
  explosion(R, t, 279.75, addv(gp, [0, 3, 2]), 70, 883, 'ship');
  if (t > 279.0) {
    const lt = t - 279.0;
    for (let i = 0; i < 0; i++) {                                // (no foreign plates on the engulfed mech)
      const d = V.norm([0, 0, 0], [(hash(i) - 0.5) * 1.6, (hash(i + 3) - 0.3) * 1.2, -1]);
      M.fromTRS(_dbM, madd(addv(gp, [(hash(i + 5) - 0.5) * 6, (hash(i + 7) - 0.5) * 8, 0]), d, lt * (25 + 30 * hash(i + 9))),
        Q.fromEuler(_dbQ, lt * 6 + i, lt * 4, lt * 5 + i), 0.08 + 0.08 * hash(i + 11));
      const de = R.add('debris', _dbM);
      if (de) { de.hidden = debrisOnly(R, 'hull' + (i % 4)); de.damage = 0.7; }
    }
    for (let i = 0; i < 8; i++) R.fire(addv(gp, [(hash(i) - 0.5) * 10, (hash(i + 2) - 0.5) * 14, -2 + hash(i + 4) * 6]), 4 + lt * 9, lt, 279 + i, [1, 1, 1], Math.min(1, lt * 2));
    shake(c, 1.5 + lt * 2.5, 18);
  }
  for (let i = 0; i < 24; i++) {                    // light streaming out of the cracking core past the mech
    const d = randDir([0, 0, 0], i * 2.3);
    const ph = ((t - 278) * 2.2 + hash(i)) % 1;
    const p0 = addv(WELL, [d[0] * 22, d[1] * 22, -22 + d[2] * 10]);
    const dir = V.norm([0, 0, 0], V.sub([0, 0, 0], c.cam.pos, p0));
    const a = madd(p0, dir, ph * 30), b = madd(a, dir, 10 * k);
    R.beam(a, b, 0.2 + 0.4 * k, [1.6 * k, 1.5 * k, 2 * k], 1, 12);
  }
});
shot(275, 278, 'S17c collapse', (c) => {
  const { t, u } = c;
  camLook(c, addv(WELL, [-340, 120, -620 - u * 60]), addv(WELL, [0, 0, 0]), 44, -0.05);
  shake(c, 0.6 + u, 12);
  const m = wellMass(t) * 2;
  c.post.lensA = { ...wellLens(c, m, 6 + u * 12, true, 2), horizon: wellLens(c, m, 6, true).horizon * (t < 279 ? 1 + u : 1) };
  c.post.ca = 0.4 * (0.01);
  c.env.shadowCenter = WELL; c.env.shadowRadius = 260;
});
shot(280.2, 286, 'S18a shockwave', (c) => {
  const { t, u } = c;
  // wide and steady, side-on: the whole fleet (left) and the dying well (right) — the gravity wave rolls across them
  const mid = [0, 120, 1250];
  camLook(c, [2300 - u * 80, 480, 1250 + u * 50], mid, 50, -0.02);   // from the side away from the moon
  c.post.flash = Math.max(0, 0.6 - (t - 280.2) / 0.6);
  c.env.shadowRadius = 2600; c.env.shadowCenter = mid;
});
shot(286, 292, 'S18b fleet struck', (c) => {
  const { t, u } = c;
  camLook(c, motherPoint([0, 0, 0], t, [-420, 90, -620 + u * 60]), motherPoint([0, 0, 0], t, [0, 0, 120]), 48, -0.04);   // steady (no shake)
  c.env.shadowRadius = 400;
});
shot(292, 300, 'S19a main cannon charge', (c) => {
  const { t, u } = c;
  const mc = mainCannon(c.R, t);
  const fwd = rotY([0, 0, 0], [0, 0, 1], motherYaw(t));
  camLook(c, addv(madd(mc, fwd, 140 - u * 60), [90, 40 - u * 10, 0]), madd(mc, fwd, -120), 46, 0.06);
  handheld(c, 0.4);
  c.env.shadowCenter = mc; c.env.shadowRadius = 260;
});
shot(300, 303, 'S19b FIRE', (c) => {
  const { t, u } = c;
  const mc = mainCannon(c.R, t);
  const d = dreadPos(t);
  camLook(c, addv(lerpv(mc, d, 0.1), [520, 240, 60]), lerpv(mc, d, 0.4), 52, -0.1);
  shake(c, 1.6 * Math.exp(-(t - 300) * 1.5), 14);
  c.post.flash = t < 300.2 ? 0.7 : 0;
  c.post.godray = { pos: mc, intensity: 0.35 * (0.6), decay: 0.95 };
  c.post.exposure = 0.75;
  c.post.streak = 0.6;
  c.env.shadowRadius = 700;
});
shot(303, 310, 'S19c dreadnought dies', (c) => {
  const { t, u } = c;
  const d = dreadPos(t);
  camLook(c, addv(d, [700 - u * 120, 200, 900 - u * 100]), addv(d, [0, 0, 0]), 42, 0.05);
  shake(c, t > 306 ? 1.8 * Math.exp(-(t - 306) * 0.7) : 0.3, 9);
  c.post.flash = 0;                                         // no screen wash: the additive world-space glow carries the flash
  c.env.shadowCenter = d; c.env.shadowRadius = 400;
});
shot(310, 320, 'S20 enemy flees', (c) => {
  const { t, u } = c;
  camLook(c, [-200 + u * 60, 160, -520], [0, 60, -1300], 40, 0.03);
  handheld(c, 0.25);
  c.env.shadowCenter = [0, 60, -1250]; c.env.shadowRadius = 500;
});

// ============ ACT VI — HOMEWARD
shot(320, 330, 'S21a debris silence', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [44 - u * 16, 12 - u * 3, 50 - u * 22]), addv(g.pos, [0, 8, 0]), 36);
  handheld(c, 0.2);
  c.post.saturation = 0.85; c.post.gradeShadows = [0.9, 0.98, 1.15];
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 50;
  c.debris = true;
});
shot(330, 340, 'S21b return', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  // behind him along the way he will go; the camera holds still once he comes to, so he slowly draws AWAY from it
  const ta = Math.min(t, CREEP_T), ga = gundamState(ta).pos, cd = creepDir();
  const sdv = V.norm([0, 0, 0], V.cross([0, 0, 0], cd, [0, 1, 0]));
  const cp = addv(madd(madd(ga, cd, -85), sdv, -26), [0, 22, 0]);
  camLook(c, cp, addv(madd(g.pos, cd, 50), [0, 4, 0]), 36 + u * 6);
  c.post.mbNear = 160; c.post.motionBlur = 0.6;
  handheld(c, 0.2);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 50;
  c.debris = true;
});
shot(340, 343.8, 'F0 recovered', (c) => {
  const { t, u, R } = c;
  // off the flagship's port flank: the bay mouth lit, beacons pulsing, the battered machine drifting home
  const bay = recoveryBay(t);
  const mouth = motherPoint([0, 0, 0], t, bay);
  camLook(c, motherPoint([0, 0, 0], t, [bay[0] - 150, bay[1] + 28, bay[2] - 95 + u * 15]), addv(mouth, [0, 2, 0]), 36, 0.02);
  c.post.motionBlur = 0.5;
  handheld(c, 0.15);
  for (let i = 0; i < 8; i++) {                          // landing beacons framing the bay door
    const a = i / 8 * 6.283, ph = ((t * 1.6 - i * 0.12) % 1 + 1) % 1, k = Math.pow(1 - ph, 3) * 2.5 * (1 - smooth(341.9, 342.3, t));   // off once docked
    R.glow(motherPoint([0, 0, 0], t, [bay[0] - 1, bay[1] + Math.sin(a) * 9, bay[2] + Math.cos(a) * 14]), 1.1, [3 * k, 1.8 * k, 0.4 * k], 0.5);
  }
  R.light(addv(mouth, [0, 0, 0]), 60, [1, 0.8, 0.55], 6);
  c.env.shadowCenter = mouth; c.env.shadowRadius = 90;
});
shot(343.8, 347.3, 'F1 the jump', (c) => {
  const { t, u } = c;
  // wide on the battered fleet; ships slip into blue rifts one after another
  camLook(c, [-520 + u * 40, 120, 700 - u * 60], [0, 0, 120], 42, 0.03);
  c.post.lensA = { enable: 0 };
  c.env.shadowRadius = 600;
  c.post.fade = t > 346.8 ? 1 - smooth(346.8, 347.3, t) : 1;
});
// homecoming light: the sun comes from the side so the terminator runs across the middle of the disc — about half of
// Earth reads as blue daylight, half as night with city lights
// seen from the fleet the lit fraction of the disc is (1 + cos θ)/2, θ = angle between the planet→sun and planet→camera
// directions; 30 % day on TOP → cos θ = -0.4 (sun a little behind the planet), tilted toward the camera's up (the terminator runs across the upper third)
// the sunrise sun for the final shot: just above Earth's limb, on the side the camera looks at, a little to the right
// the sunrise sun for the final shot: resting on Earth's upper limb, dead centre of the frame (horizontally), its disc
// just touching the horizon — found on the limb circle from the S23 camera (framing at ~363 s, roll 0.12)
let _sunRise = null;
function SUN_RISE() {
  if (_sunRise) return _sunRise;
  const f = V.norm([0, 0, 0], V.lerp([0, 0, 0], PLANET, SUN, 0.522));
  const r0 = V.norm([0, 0, 0], V.cross([0, 0, 0], f, [0, 1, 0])), u0 = V.cross([0, 0, 0], r0, f);
  const roll = 0.12, U = V.add([0, 0, 0], V.scale([0, 0, 0], u0, Math.cos(roll)), V.scale([0, 0, 0], r0, Math.sin(roll)));
  const Rt = V.norm([0, 0, 0], V.cross([0, 0, 0], f, U));
  const up = V.norm([0, 0, 0], V.madd([0, 0, 0], f, PLANET, -V.dot(f, PLANET)));
  const right = V.norm([0, 0, 0], V.cross([0, 0, 0], up, PLANET));
  const a = PL_R + 0.008;                                   // centre just above the limb: the disc sits ON the horizon
  let best = null, bx = Infinity;
  for (let k = 0; k < 3600; k++) {
    const phi = (k / 3600) * 2 * Math.PI;
    const side = V.add([0, 0, 0], V.scale([0, 0, 0], up, Math.cos(phi)), V.scale([0, 0, 0], right, Math.sin(phi)));
    const sd = V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], PLANET, Math.cos(a)), V.scale([0, 0, 0], side, Math.sin(a))));
    const z = V.dot(sd, f), x = V.dot(sd, Rt) / z, y = V.dot(sd, U) / z;
    if (z <= 0 || y <= 0) continue;                        // the upper limb only
    if (Math.abs(x) < bx) { bx = Math.abs(x); best = sd; }
  }
  return (_sunRise = best);
}
const SUN_HOME = (() => {
  const toCam = V.scale([0, 0, 0], PLANET, -1);
  const up = V.norm([0, 0, 0], V.madd([0, 0, 0], [0, 1, 0], PLANET, -V.dot([0, 1, 0], PLANET)));
  return V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], toCam, -0.4), V.scale([0, 0, 0], up, Math.sqrt(1 - 0.16))));
})();
// F2 → S23 is ONE TAKE: the home camera (homeCam) keeps drifting, eases round from the fleet onto the sunrise
function homeCam(t) {
  const u = Math.min(1, (t - 347.3) / 10.7);
  const mp = motherPoint([0, 0, 0], Math.min(t, 358), [0, 0, 0]);
  const side = V.norm([0, 0, 0], V.cross([0, 0, 0], PLANET, [0, 1, 0]));
  const pos = V.add([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], mp, PLANET, -700 + u * 40 + Math.max(0, t - 358) * 6), side, 260), [0, -60, 0]);
  return { pos, target: V.madd([0, 0, 0], mp, PLANET, 300 + u * 150), fov: 40 - u * 4 };
}
shot(347.3, 358, 'F2 HOME', (c) => {
  const { t, u, R } = c;
  // Earth. The mothership emerges slowly from the rift with escorts close to camera (Dune-style scale)
  c.env.planet = { dir: PLANET, radius: PL_R, col: [0.3, 0.5, 1.0], earth: true };
  c.env.sunDir = SUN_HOME;
  c.post.fade = smooth(347.3, 348.2, t);
  const mp = motherPoint([0, 0, 0], t, [0, 0, 0]);
  const q = homeCam(t);
  camLook(c, q.pos, q.target, q.fov, 0.04);
  handheld(c, 0.06 * (1 - smooth(356, 358, t)));
  c.post.lensA = { enable: 0 };
  c.env.shadowCenter = mp; c.env.shadowRadius = 600;
  c.env.fill = [0.35, 0.37, 0.45, 0.5];
});
// speed profile of the final one-take (story s): accelerates off the fleet, keeps a slow rise through the narration,
// surges up through the sun, settles on the title. Integrated once; s runs 0 → 3 (fleet, limb, sun, title).
const END_V = [[358, 0], [359.5, 0.35], [366.6, 0.45], [368.4, 1.6], [370.8, 0]];   // angular speed (relative)
let _endTab = null;
function endS(t) {
  if (!_endTab) {
    const vAt = (x) => { for (let i = 0; i < END_V.length - 1; i++) { const [a, va] = END_V[i], [b, vb] = END_V[i + 1]; if (x <= b) return va + (vb - va) * sat((x - a) / (b - a)); } return 0; };
    _endTab = []; let acc = 0;
    for (let x = 358; x <= 370.8 + 1e-6; x += 0.01) { _endTab.push(acc); acc += vAt(x + 0.005) * 0.01; }
    _endTab = _endTab.map((v) => (v / acc) * 3);
  }
  const i = Math.round((t - 358) / 0.01);
  return i <= 0 ? 0 : i >= _endTab.length ? 3 : _endTab[i];
}
shot(358, 393.5, 'S23 title', (c) => {
  const { t } = c;
  // ONE TAKE from F2: the camera keeps its place by the fleet and eases from the flagship onto Earth's limb (358–361);
  // after the narration it tilts up FAST until the rising sun sits dead centre (366.8–368.2), holds on it, then
  // turns away into open space where the title appears (369.8–371.8) and holds 20 s
  c.env.sunDir = SUN_HOME;
  const q = homeCam(t), pos = q.pos;
  const f0 = V.norm([0, 0, 0], V.sub([0, 0, 0], q.target, pos));
  const dir0 = V.norm([0, 0, 0], V.lerp([0, 0, 0], PLANET, SUN, 0.5 + sat((t - 358) / 9) * 0.04));
  const S = SUN_RISE();
  const upDir = V.norm([0, 0, 0], V.add([0, 0, 0], dir0, [0, 1.1, 0]));
  // ONE continuous move 358 → 370.8 that never stops: fleet → Earth's limb → (keeps rising slowly under the narration)
  // → speeds up through the rising sun (dead centre mid-move) → round to the title. Catmull-Rom through the four
  // directions, driven by a speed profile that is > 0 everywhere between the ends.
  const Pts = [f0, dir0, S, upDir];
  const cr = (a, b, c2, d, u) => 0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u * u + (-a + 3 * b - 3 * c2 + d) * u * u * u);
  const at = (sv) => { const seg = Math.min(2, Math.floor(sv)), lu = sv - seg; const P0 = Pts[Math.max(0, seg - 1)], P1 = Pts[seg], P2 = Pts[seg + 1], P3 = Pts[Math.min(3, seg + 2)];
    return V.norm([0, 0, 0], [0, 1, 2].map((k) => cr(P0[k], P1[k], P2[k], P3[k], lu))); };
  // arc-length (angle) reparametrisation: the SPEED profile is in angle, so it never looks stalled
  const N = 300, A = [0]; let prevD = at(0);
  for (let k = 1; k <= N; k++) { const d = at(3 * k / N); A.push(A[k - 1] + Math.acos(Math.min(1, V.dot(d, prevD)))); prevD = d; }
  const want = endS(t) / 3 * A[N];
  let kk = 1; while (kk < N && A[kk] < want) kk++;
  const sp = 3 * ((kk - 1) + (want - A[kk - 1]) / Math.max(1e-9, A[kk] - A[kk - 1])) / N;
  let dir = at(Math.min(3, sp));
  const k0 = sat(sp), k2 = sat(sp - 2);
  camLook(c, pos, madd(pos, dir, 1000), lerp(q.fov, 34, k0), lerp(0.04, 0.12, k0) - k2 * 0.08);
  c.world = t < 369;                                          // the fleet stays until the camera has risen well past it (no pop)
  c.env.planet = { dir: PLANET, radius: PL_R, col: [0.3, 0.5, 1.0], earth: true };
  c.env.stars = 0.6 + k2 * 0.3; c.env.sunDisc = 0;
  c.post.exposure = 0.75;
  c.post.fade = 1 - smooth(391.5, 393.3, t);
  const rise = smooth(358.5, 362, t);
  // (no extra atmosphere glow sprite: it read as a fake disc of light round the sun, and lingered at the frame edge)
  c.post.flare = { pos: madd(pos, S, 1000), intensity: 1.4 * rise };
  c.post.streak = 0;
  // (no god rays here: marched over bloom while the camera swings they left a hard-edged ghost disc round the sun)
  c.env.shadowCenter = motherPoint([0, 0, 0], 358, [0, 0, 0]); c.env.shadowRadius = 600;
});

// the flagship charges its main gun only AFTER the order is given (v4c10 at 292.1, ~3.55 s)
const MAIN_CHARGE = 295.7;
export function mainCannon(R, t) {
  const me = R.models.mothership;
  const em = me?.empties?.main_cannon;
  const local = em ? em.pos : [0, 0, modelLen(R, 'mothership') * 0.5];
  return motherPoint([0, 0, 0], t, local);
}

// ------------------------------------------------------------------ frame entry
const ctx = { R: null, t: 0, lt: 0, u: 0, cam: { pos: [0, 0, 0], target: [0, 0, 1], up: [0, 1, 0], fov: 1, near: 0.5, far: 400000 }, env: null, post: null };

export function findShot(t) {
  for (const s of SHOTS) if (t >= s.t0 && t < s.t1) return s;
  return SHOTS[SHOTS.length - 1];
}

// wide establishing shots: the camera is lifted to look down on the action at an oblique angle, and a big planet
// fills part of the background behind the subject (lit side toward the camera)
const WIDE_SHOTS = new Set(['A4 fleet assembles', 'B4 standoff', 'S9c wide battle', 'S18a shockwave',
  'S20 enemy flees', 'X the enemy arrives (wide)']);
function wideTreatment(c) {
  const cam = c.cam, T = cam.target;
  const d = V.sub([0, 0, 0], cam.pos, T), dist = V.len(d);
  const h = Math.hypot(d[0], d[2]), e = Math.atan2(d[1], h);
  const e2 = Math.max(e, 0.3);                                    // at least ~17° above the subject
  const k = Math.cos(e2) * dist / Math.max(h, 1e-3);
  const P = [T[0] + d[0] * k, T[1] + Math.sin(e2) * dist, T[2] + d[2] * k];
  const f = V.norm([0, 0, 0], V.sub([0, 0, 0], T, P));
  const r = V.norm([0, 0, 0], V.cross([0, 0, 0], f, [0, 1, 0])), u = V.cross([0, 0, 0], r, f);
  camLook(c, P, T, cam.fov / DEG, 0.07);                         // a slight dutch tilt: the oblique look
}
const _moon = new Map();
function moonFor(R, s, film) {
  const tm = (s.t0 + s.t1) / 2;
  if (tm < 40 || tm >= EARTH_T) return null;
  if (_moon.has(s)) return _moon.get(s);
  const save = { t: ctx.t, lt: ctx.lt, u: ctx.u, env: ctx.env, post: ctx.post };
  ctx.R = R; ctx.t = tm; ctx.lt = tm - s.t0; ctx.u = 0.5; ctx.env = spaceEnv(tm); ctx.post = basePost();
  ctx.world = true; ctx.hangar = null; ctx.worldT = undefined; ctx.fpv = false;
  R.begin();
  s.fn(ctx);
  const cam = ctx.cam, f = V.norm([0, 0, 0], V.sub([0, 0, 0], cam.target, cam.pos));
  const r = V.norm([0, 0, 0], V.cross([0, 0, 0], f, [0, 1, 0])), u = V.cross([0, 0, 0], r, f);
  // pick the frame corner where the moon is most fully lit: lit fraction = (1 − SUN·dir) / 2
  const half = Math.tan((cam.fov || 0.8) * 0.5), asp = (R.width || 16) / Math.max(1, R.height || 9);
  let res = null, bestLit = -1;
  for (const sx of [1, -1]) for (const sy of [1, -0.6]) {
    const d = V.norm([0, 0, 0], V.add([0, 0, 0], V.add([0, 0, 0], f, V.scale([0, 0, 0], r, 0.55 * half * asp * sx)), V.scale([0, 0, 0], u, 0.42 * half * sy)));
    const lit = (1 - V.dot(SUN, d)) / 2 + (sy > 0 ? 0.08 : 0);            // prefer the upper corners a little
    if (lit > bestLit) { bestLit = lit; res = { side: sx, up: sy }; }
  }
  Object.assign(ctx, save);
  _moon.set(s, res);
  return res;
}
export function frame(R, film) {
  FILM_NOW = film;
  const t = bulletTime(storyT(film));                     // bullet time round the duel's big blows (identity elsewhere)
  const s = findShot(t);
  ctx.R = R; ctx.t = t; ctx.lt = t - s.t0; ctx.u = sat((t - s.t0) / (s.t1 - s.t0));
  ctx.env = spaceEnv(t); ctx.post = basePost();
  ctx.world = true; ctx.hangar = null; ctx.debris = false; ctx.worldT = undefined; ctx.fpv = false; ctx.filmT = film; ctx.closeCore = false;
  ctx.cam.near = 0.3; ctx.cam.far = 400000;
  const moonDir = null;                                   // (background moon removed)
  R.begin();
  R.camPos = null; R._now = t;
  if (!GUN.exitLocal) {
    const ex = R.models.mothership?.empties?.hangar_exit;
    GUN.exitLocal = ex ? ex.pos : [60, 0, 60];
  }
  s.fn(ctx);
  if (WIDE_SHOTS.has(s.name)) wideTreatment(ctx);
  // from scene 5 on (the fleet assembles, 40 s) the same MOON hangs in the background of every exterior shot — nothing
  // else; its place in the frame is fixed per shot (from the shot's mid-point camera) on the sunward side
  if (moonDir && ctx.world && !ctx.hangar && !(ctx.env.planet && ctx.env.planet.earth) && !ctx.env.interior) {
    // anchored to the frame: always in the upper corner on the sunward side (its lit face toward us)
    const cam = ctx.cam, f = V.norm([0, 0, 0], V.sub([0, 0, 0], cam.target, cam.pos));
    const r = V.norm([0, 0, 0], V.cross([0, 0, 0], f, [0, 1, 0])), u = V.cross([0, 0, 0], r, f);
    const side = moonDir.side, half = Math.tan(cam.fov * 0.5), asp = R.width / Math.max(1, R.height);
    const dir = V.norm([0, 0, 0], V.add([0, 0, 0], V.add([0, 0, 0], f, V.scale([0, 0, 0], r, 1.3 * half * asp * side)), V.scale([0, 0, 0], u, 1.15 * half * moonDir.up)));   // centre off the corner: a vast limb fills that side
    ctx.env.planet = { dir, radius: Math.min(1.4, 2.3 * Math.atan(half))   /* enormous: the limb sweeps across a third of the frame */, col: [0.36, 0.36, 0.38], earth: false, kind: 'moon' };
  }
  else if (t >= 40 && ctx.env.planet && !ctx.env.planet.earth) ctx.env.planet = null;
  if (globalThis.__CAM) { const q = globalThis.__CAM(t); if (q) camLook(ctx, q.pos, q.target, q.fov || 30, 0); }   // debug inspection camera (dev only)
  R.camPos = ctx.cam.pos;                                  // fx helpers keep streaks off the lens
  // near plane relative to subject distance for depth precision
  ctx.cam.near = Math.max(0.2, Math.min(4, V.dist(ctx.cam.pos, ctx.cam.target) * 0.01));
  if (ctx.world) {
    const wt = ctx.worldT ?? t;          // cold open shows the battle while the film clock is at 0–14
    drawWorld(R, wt, {});
    FPV_NOW = !!ctx.fpv;
    drawMSBattle(R, wt);
    drawLanceAndCannon(R, wt, ctx);
    drawImplosion(R, wt, ctx);
    if (ctx.debris || (wt > 280 && wt < 346)) drawDebrisField(R, wt);
    if (ctx.worldT === undefined && t > 62 && t < IMPLODE + 0.5 && !ctx.post.lensA) ctx.post.lensA = wellLens(ctx, wellMass(t), 1.2, true, 1);
    drawShield(R, wt, ctx);
    drawDodgeBolt(R, wt);
    const g = gundamState(wt);
    if (g.berserk) ctx.post.berserk = Math.max(ctx.post.berserk || 0, g.berserk * (0.35 + 0.65 * berserkHitK(wt)));
  }
  if (ctx.hangar) {
    R._time = t;
    drawHangar(R, t, ctx.hangar);
    const gs = gundamHangarState(t, ctx.hangar);
    drawGundam(R, t, gs, { noTrail: true });
  }
  return ctx;
}

// ---------------- the enemy ion bolt Sigma dodges on the launch run (duel.js DODGE): aimed at his undodged path point,
// from far ahead-left, at ion-bolt speed; it reaches that point at DODGE.t and keeps going
function drawDodgeBolt(R, t) {
  const T = DODGE.t;
  if (t < T - 0.62 || t > T + 1.9) return;
  // contact point: the right vambrace (between forearm and hand) at T, from the solved FK of the parry pose
  const hs = duelHero(T);
  const fk = duelFK({ ...hs, saber: 1 }, 'gundam');
  const hit = V.lerp([0, 0, 0], M.transformPoint([0, 0, 0], fk.arm_R_lower, [0, 0, 0]), M.transformPoint([0, 0, 0], fk.hand_R, [0, 0, 0]), 0.9);   // back of the wrist / hand
  const fwd = V.norm([0, 0, 0], hs.fwd);
  const r = dodgeRight(T);
  const dir = V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], fwd, -0.9), V.scale([0, 0, 0], r, -0.35)));   // from ahead, a little right
  const a = madd(hit, dir, -1300 * 0.62);
  bolt(R, t, T - 0.62, T, a, hit, 70, 2.2, [3.4, 0.7, 0.4], 1.8);
  if (t < T) { const hp = V.lerp([0, 0, 0], a, hit, (t - (T - 0.62)) / 0.62); R.glow(hp, 16, [2.2, 0.5, 0.25], 0.5); R.light(hp, 90, [1, 0.3, 0.15], 4); return; }
  // swatted: the bolt comes apart ON the back of his hand — it bursts right there, a white flash, a shock ring and a
  // spray of sparks every way (a little more of them thrown along the swat)
  // (dodgeRight() points to his LEFT — +X is the model's left — so his right is −r)
  const out = V.norm([0, 0, 0], V.add([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], r, -1.0), [0, 0.25, 0]), V.scale([0, 0, 0], fwd, 0.15)));
  const TB = T, E = madd(hit, out, 1.2), lt = t - T;
  const k = Math.exp(-lt * 7);                                            // the swat itself on the vambrace
  R.glow(hit, 4 + 5 * easeOut(sat(lt / 0.08)), [3.5 * k, 1.6 * k, 0.8 * k], 0.45);
  R.light(hit, 60, [1, 0.55, 0.3], 8 * k);
  for (let i = 0; i < 18; i++) {                                          // spark fan off the vambrace, along the swat
    const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 4.1 + 3), out, 1.2));
    const life = 0.2 + hash(i + 9) * 0.35; if (lt > life) continue;
    const u = lt / life, p = madd(hit, sd, (3 + 16 * hash(i + 2)) * easeOut(u)), q = madd(p, sd, -(1.2 + 2.5 * (1 - u)));
    const b = 4 * (1 - u) * (1 - u);
    R.beam(q, p, 0.09, [b, b * 0.6, b * 0.3], 1, 10);
  }
  const lb = t - TB;                                                      // the burst
  if (lb >= 0 && lb < 1.6) {
    const f = Math.exp(-lb * 9);
    R.glow(E, 3 + 8 * easeOut(sat(lb / 0.06)), [6 * f, 4.2 * f, 2.6 * f], 0.35);                        // white-hot core
    R.glow(E, 5 + 12 * easeOut(sat(lb / 0.3)), [2.2 * Math.exp(-lb * 4), 0.8 * Math.exp(-lb * 4), 0.3 * Math.exp(-lb * 4)], 0.6);   // orange fireball
    R.light(E, 120, [1, 0.6, 0.3], 18 * Math.exp(-lb * 6));
    if (lb < 0.35) R.ripple(E, 4 + 34 * easeOut(lb / 0.35), [0.4, 0.4, 0.4], (1 - lb / 0.35) * 1.5);
    for (let i = 0; i < 150; i++) {                                       // sparks: thin burning streaks flung every way,
      const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 2.37 + 71), out, 0.45));   // white-hot (blooming) at first, then cooling
      const life = 0.3 + hash(i + 31) * 1.0; if (lb > life) continue;     // orange -> dull red, thinning and fading out
      const u = lb / life, sp = 30 + 80 * hash(i + 5);
      const dist = sp * life * 0.55 * (1 - (1 - u) * (1 - u));             // drag: fast out, slowing
      const vel = sp * (1 - u);                                            // current speed -> streak length
      const p = madd(E, sd, dist), q = madd(p, sd, -(0.6 + vel * 0.06));
      const fade = (1 - u) * (1 - u), hot = Math.exp(-lb * 7);
      const b = (1.2 + 9 * hot) * fade * (hash(i + 17) > 0.85 ? 1.5 : 1);
      R.beam(q, p, 0.02 + 0.1 * (1 - u) * (0.5 + hash(i)), [b, b * (0.55 + 0.35 * hot), b * (0.15 + 0.5 * hot)], 1, 10);
    }
  }
}
// ---------------- energy shield around the well core (261–268), shatter 268–271
function drawShield(R, t, c) {
  // hexagons only: lit around hits, torn open by the hands, then the whole grid flashes and fades at 268
  if (t < 261 || t > 269.6) return;
  const sh = shieldState(t);
  const cam = c.cam;
  const f = V.norm([0, 0, 0], V.sub([0, 0, 0], cam.target, cam.pos));
  const right = V.norm([0, 0, 0], V.cross([0, 0, 0], f, cam.up));
  const upv = V.cross([0, 0, 0], right, f);
  const g = gundamState(t);
  const rel = V.sub([0, 0, 0], addv(g.pos, [0, 9, 0]), WELL);
  const iuv = [V.dot(rel, right) / SHIELD_R, V.dot(rel, upv) / SHIELD_R];
  const near = clamp((V.dist(cam.pos, WELL) - SHIELD_R) / 90, 0.35, 1);
  const tear = smooth(267.25, 268.0, t);
  let lastHit = -1; for (const h of [...B_HITS, 267.25]) if (t >= h) lastHit = h;
  const hitAge = lastHit < 0 ? 9 : t - lastHit;
  // at 268 the whole grid lights once and dies away (the barrier collapses)
  const flash = 0;                                          // (the old whole-grid flash is replaced by the collapse wave)
  const alive = t < 268 ? sh.up : Math.exp(-Math.max(0, t - 268.9) * 4);
  const collapse = t >= 268 ? t - 268 : 0;
  R.shield(WELL, SHIELD_R, iuv, flash, t >= 268 ? 1 : tear, hitAge, [0.35, 0.7, 1.8], alive * (0.9 + tear * 0.5) * near, collapse);
  if (collapse > 0 && collapse < 1.6) {
    // shock ring at the wound and glowing hex shards thrown off the dome surface
    const tp = madd(WELL, V.norm([0, 0, 0], rel), SHIELD_R);
    if (collapse < 0.6) R.ripple(tp, 20 + 260 * easeOut(collapse / 0.6), [0.3, 0.5, 1], (1 - collapse / 0.6) * 2);
    for (let i = 0; i < 70; i++) {
      const d = V.norm([0, 0, 0], V.add([0, 0, 0], V.norm([0, 0, 0], rel), V.scale([0, 0, 0], randDir([0, 0, 0], i * 3.17 + 5), 0.9)));
      const born = V.dist(d, V.norm([0, 0, 0], rel)) * 0.5;          // shards leave as the front reaches them
      const lt = collapse - born; if (lt < 0 || lt > 1.1) continue;
      const p0 = madd(WELL, d, SHIELD_R), p1 = madd(p0, d, lt * (40 + 60 * hash(i)));
      const k = (1 - lt / 1.1);
      R.glow(p1, 2 + 3 * hash(i + 2), [0.9 * k, 1.8 * k, 4 * k], 0.5);
      R.beam(madd(p1, d, -6 * k), p1, 0.25, [0.6 * k, 1.3 * k, 3 * k], 1, 10);
    }
    if (collapse < 0.4) R.light(tp, 400, [0.5, 0.8, 1.6], 40 * (1 - collapse / 0.4));
  }
}

// ---------------- lance + main cannon beams
function drawLanceAndCannon(R, t, c) {
  // gravity lance: twisted purple beam
  if (t > LANCE_FIRE && t < LANCE_FIRE + 5 && GUN.dread) {
    const em = dreadEmitter(R, t, GUN.dread);
    // the lance only GRAZES the flagship: it scrapes the starboard flank and glances off
    const hit = motherPoint([0, 0, 0], t, [LANCE_HIT[0] + 3, LANCE_HIT[1], LANCE_HIT[2]]);
    const lt = t - LANCE_FIRE;
    const reach = Math.min(1, lt / 0.9);
    const end = lerpv(em, hit, reach);
    const k = lt < 0.9 ? 1 : Math.max(0, 1 - (lt - 2.5) / 2.5);
    R.beam(em, end, 5 * k, [LANCE_COL[0] * k, LANCE_COL[1] * k, LANCE_COL[2] * k], 1.1, 36, 3.5, 1.5);
    R.beam(em, end, 14 * k, [LANCE_COL[0] * 0.04 * k, LANCE_COL[1] * 0.04 * k, LANCE_COL[2] * 0.04 * k], 1, 2, 3, 0.6);
    // helix strands
    const dir = V.norm([0, 0, 0], V.sub([0, 0, 0], end, em));
    const side = V.norm([0, 0, 0], V.cross([0, 0, 0], dir, [0, 1, 0]));
    const up = V.cross([0, 0, 0], side, dir);
    const L = V.dist(em, end);
    const N = 64;
    for (let strand = 0; strand < 3; strand++) {
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const a = i / N;
        const ang = a * 40 + t * 14 + strand * 2.09;
        const r = 22 * k * (0.6 + 0.4 * Math.sin(a * 13 + t * 6));
        const p = madd(madd(madd(em, dir, a * L), side, Math.cos(ang) * r), up, Math.sin(ang) * r);
        if (prev) R.beam(prev, p, 1.2 * k, [1.2 * k, 0.4 * k, 2.0 * k], 1, 14);
        prev = p;
      }
    }
    if (reach >= 1) {
      R.glow(hit, 60 * k, [2.5 * k, 1.4 * k, 3 * k], 0.5);
      R.light(hit, 170, [1, 0.5, 1.2], 6 * k);                   // lights the wound only (900 m washed the whole flagship white)
      // glancing blow: the deflected beam carries on off the hull at the mirrored angle, spraying molten sparks
      const n = V.norm([0, 0, 0], V.sub([0, 0, 0], motherPoint([0, 0, 0], t, [LANCE_HIT[0] + 10, LANCE_HIT[1], LANCE_HIT[2]]), motherPoint([0, 0, 0], t, LANCE_HIT)));
      const dn = V.dot(dir, n), rdir = V.norm([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], dir, n, -2 * dn), n, 0.25));
      const kr = k * Math.min(1, (lt - 0.9) / 0.15);
      const rEnd = madd(hit, rdir, 60000 * Math.min(1, (lt - 0.9) / 0.6));   // flies on out to the end of space
      R.beam(hit, rEnd, 3.2 * kr, [LANCE_COL[0] * 0.8 * kr, LANCE_COL[1] * 0.8 * kr, LANCE_COL[2] * 0.8 * kr], 1.1, 30, 3, 1.2);
      R.beam(hit, rEnd, 10 * kr, [LANCE_COL[0] * 0.03 * kr, LANCE_COL[1] * 0.03 * kr, LANCE_COL[2] * 0.03 * kr], 1, 2, 3, 0.6);
      for (let i = 0; i < 40; i++) {
        const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 3.3 + Math.floor(t * 8)), rdir, 1.6), n, 0.6));
        const ph = ((t * 3 + hash(i)) % 1), p = madd(hit, sd, 10 + ph * 140), q = madd(p, sd, -12 * (1 - ph));
        R.beam(q, p, 0.6, [5 * (1 - ph) * k, 2 * (1 - ph) * k, 0.6 * (1 - ph) * k], 1, 10);
      }
    }
  }
  // mothership hit explosions chain
  const chain = [[216.9, [64, 30, 70], 55], [218.2, [62, -15, 0], 38], [219.4, [60, 34, -10], 40], [221, [58, -20, 95], 36], [223, [62, 40, 60], 30]];   // secondary blasts along the scorched flank
  for (const [t0, lp, sz] of chain) explosion(R, t, t0, motherPoint([0, 0, 0], t0, lp), sz, t0 * 3, 'ship', 3.5);   // light the flank locally, not the whole ship
  // main cannon
  if (t > MAIN_CHARGE && t < MAIN_FIRE + 5) {
    const mc = mainCannon(R, t);
    const fwd = rotY([0, 0, 0], [0, 0, 1], motherYaw(t));
    if (t < MAIN_FIRE) {
      const k = smooth(MAIN_CHARGE, MAIN_FIRE, t);
      R.glow(mc, 10 + 60 * k, [1.5 * k, 2.5 * k, 5 * k], 1);
      R.light(mc, 500, ION_COL, 15 * k);
      chargeInflow(R, t, MAIN_CHARGE, MAIN_FIRE - MAIN_CHARGE, mc, 230, 160, [0.6, 1.0, 2.2], 3.5, 17, 0.8, 5);   // fast from the start, ever faster
    } else {
      const lt = t - MAIN_FIRE;
      const d = dreadPos(t);
      const k = lt < 3.4 ? 1 : Math.max(0, 1 - (lt - 3.4) / 1.6);
      const reach = Math.min(1, lt / 0.35);
      const end = lerpv(mc, d, reach);
      const w = (13 + Math.sin(t * 60) * 1.2) * k;
      R.beam(mc, end, w * 0.8, [ION_COL[0] * k, ION_COL[1] * k, ION_COL[2] * k], 1.2, 40, 4, 2);
      R.beam(mc, end, w * 2.2, [ION_COL[0] * 0.03 * k, ION_COL[1] * 0.03 * k, ION_COL[2] * 0.04 * k], 1, 2, 2, 1);
      R.glow(mc, 50 * k, [1.5 * k, 2 * k, 4 * k], 0.6);
      R.light(mc, 1500, ION_COL, 40 * k);
      if (reach >= 1) { R.glow(d, 220 * k, [4 * k, 4.5 * k, 7 * k], 1); R.light(d, 2000, [0.7, 0.8, 1.2], 50 * k); }
      // shock rings travelling down the beam
      const dir = V.norm([0, 0, 0], V.sub([0, 0, 0], d, mc));
      const side = V.norm([0, 0, 0], V.cross([0, 0, 0], dir, [0, 1, 0]));
      const upv = V.cross([0, 0, 0], side, dir);
      const L = V.dist(mc, d);
      for (let i = 0; i < 6; i++) {
        const ph = ((lt * 1.4 + i / 6) % 1);
        const pos = madd(mc, dir, ph * L * reach);
        const rr = w * (2.5 + ph * 2);
        R.ring(pos, [side[0] * rr, side[1] * rr, side[2] * rr, 0], [upv[0] * rr, upv[1] * rr, upv[2] * rr, 0], [0.8 * k, 1.2 * k, 2.4 * k], 0.55);
      }
    }
  }
}

// ---------------- implosion + shockwave
function drawImplosion(R, t, c) {
  if (t < 272.6 || t > 300) return;
  // ring breaking explosions after the slash
  for (let i = 0; i < 10; i++) {
    const t0 = 272.9 + i * 0.45;
    const ang = i * 0.63 + 0.3;
    const p = addv(WELL, [Math.cos(ang) * 110, Math.sin(ang) * 110, 0]);
    explosion(R, t, t0, p, 26, 700 + i, 'ship');
  }
  // implosion: light sucked in
  if (t > 277 && t < IMPLODE) {
    const k = smooth(277, IMPLODE, t);
    for (let i = 0; i < 140; i++) {
      const s = i * 1.13;
      const per = 0.5 + hash(s) * 0.4;
      const ph = ((t - 277) / per + hash(s + 1)) % 1;
      const d = randDir([0, 0, 0], s + Math.floor((t - 277) / per + hash(s + 1)) * 4.1);
      const r0 = 600 * (1 - ph);
      const cw = ctx.closeCore ? 0.35 : 1;                       // close-up at the core: thin the streams (camera sits inside them)
      R.beam(madd(WELL, d, r0 + 60), madd(WELL, d, r0), 3 * cw, [1.5 * k * ph * cw, 0.8 * k * ph * cw, 3 * k * ph * cw], 1, 10);
    }
  }
  if (t >= IMPLODE) {
    const lt = t - IMPLODE;
    const k = Math.exp(-lt * 1.1);
    R.glow(WELL, 250 + lt * 260, [4 * k, 3.4 * k, 5 * k], 0.4);
    R.haze(WELL, 500 + lt * 500, Math.exp(-lt * 0.6) * 0.8, 7);
    R.light(WELL, 6000, [0.9, 0.8, 1.2], 60 * k);
    // gravity wave: space itself ripples outward from the well — refractive rings racing out past the fleet, fading
    for (let j = 0; j < 4; j++) {
      const lj = lt - j * 0.45;
      if (lj < 0 || lj > 10) continue;
      const rg = 200 + lj * 620;
      R.ripple(WELL, rg, [0.25, 0.3, 0.45], 2.4 * Math.exp(-lj * 0.35) * (1 - j * 0.18));
    }
    // expanding shockwave disk facing the fleet
    const rr = 150 + lt * 520;
    for (let j = 0; j < 3; j++) {
      const r2 = rr * (1 - j * 0.12);
      R.ring(WELL, [r2, 0, 0, 0], [0, r2 * 0.95, 0, 0], [2.5 * k, 1.6 * k, 3.5 * k], 0.8 + j * 0.05);
      R.ring(WELL, [r2, 0, 0, 0], [0, 0, r2, 0], [1.5 * k, 1 * k, 2.5 * k], 0.85);
    }
  }
}

const _astHidden = {};
function astOnly(R, name) {
  if (_astHidden[name]) return _astHidden[name];
  const h = {}; for (const p of R.models.asteroids.parts) if (p.name !== name && p.name !== '__root') h[p.name] = 1;
  return (_astHidden[name] = h);
}
function drawDebrisField(R, t) {
  const base = addv(WELL, [40, 60, -1150]);
  const m = M.new();
  // procedural asteroids (tools/make_asteroids.py; shaded with texSet -1): power-law sizes, slow tumbles
  for (let i = 0; i < 34; i++) {
    const d = randDir([0, 0, 0], i * 7.7);
    const r = 3 + 26 * Math.pow(hash(i + 4), 2.2);
    const p = madd(base, d, 60 + r * 1.3 + hash(i * 3.3) * 200);          // keep clear of Sigma and the close cameras
    p[2] += (t - 280) * (hash(i) - 0.5) * 2;
    const e = R.add('asteroids', matEuler(m, p, t * 0.05 * (hash(i + 1) - 0.5) + i * 1.3, t * 0.04 * (hash(i + 2) - 0.5) + i, i * 0.7, r));
    if (!e) continue;
    e.hidden = astOnly(R, 'ast' + (i % 6));
    e.texSet = -1; e.seed = i * 3.7;
  }
  // a few large ones placed where the drift / return cameras look (behind Sigma, down his line home)
  [[-70, 25, -230, 26, 0], [110, -40, -330, 38, 3], [-170, 70, -470, 55, 1], [60, 90, -150, 12, 4], [-40, -60, -120, 9, 5]].forEach(([x, y, z, r, k], j) => {
    const p = addv(base, [x, y, z - (t - 280) * 0.6]);
    const e = R.add('asteroids', matEuler(m, p, t * 0.02 * (j % 2 ? 1 : -1) + j, t * 0.015 + j * 2.1, j * 0.9, r));
    if (e) { e.hidden = astOnly(R, 'ast' + k); e.texSet = -1; e.seed = 50 + j; }
  });
  // torn hull plates from the battle
  for (let i = 0; i < 8; i++) {
    const d = randDir([0, 0, 0], i * 5.3 + 100);
    const p = madd(base, d, 40 + hash(i * 4.1 + 9) * 240);
    p[2] += (t - 280) * (hash(i + 20) - 0.5) * 2;
    const e = R.add('debris', matEuler(m, p, t * 0.05 * (hash(i + 21) - 0.5), t * 0.04 * (hash(i + 22) - 0.5) + i, i * 0.7, 1 + hash(i + 24) * 2.5));
    if (!e) continue;
    e.hidden = debrisOnly(R, 'hull' + (i % 4));
    e.damage = 0.3;
    e.seed = i;
  }
}

// ------------------------------------------------------------------ EVE-style fast cut-ins (override the longer shots)
const CUTS = [];
function cut(t0, t1, name, fn) { CUTS.push({ t0, t1, name, fn }); }
const eDie = (i) => EXTRA_E[i].die;
// camera riding along the Hiigaran line, tracers streaming toward the enemy
function lineRide(c, i, back, side, up, fov, roll) {
  const st = extraHPos(c.t, i);
  const L = modelLen(c.R, EXTRA_H[i].type);
  const sideV = V.norm([0, 0, 0], V.cross([0, 0, 0], st.fwd, [0, 1, 0]));
  const pos = addv(madd(madd(st.pos, st.fwd, -L * back), sideV, side), [0, up, 0]);
  camLook(c, pos, madd(st.pos, st.fwd, 400), fov, roll);
  c.env.shadowCenter = st.pos; c.env.shadowRadius = 80;
}
// close on a dying enemy ship
function deathCam(c, i, dist, ang, fov) {
  const p = extraEPos(Math.min(c.t, eDie(i)), i).pos;
  camLook(c, addv(p, [Math.sin(ang) * dist, dist * 0.3, Math.cos(ang) * dist]), p, fov, 0.08);
  c.env.shadowCenter = p; c.env.shadowRadius = 90;
}
cut(121.8, 123.6, 'X enemy fire over the line', (c) => { lineRide(c, 4, 0.2, 30, 18, 48, -0.1); shake(c, 0.5, 9); });
cut(80.0, 88.5, 'X the enemy arrives (wide)', (c) => {
  // high over our fleet's shoulder, looking down the gap: the whole enemy force rips in — frigates, the line, the dreadnought
  const { t, u } = c;
  // high off the enemy's flank, looking down on the whole arrival zone: every frigate and line ship rips in, and the
  // dreadnought's window opens beside them — seen side-on and from above, so its length reads against the others
  const tgt = [120, 20, -1700];
  camLook(c, [2050 - u * 120, 1150 - u * 60, -1150 - u * 80], tgt, 44, 0.04);
  handheld(c, 0.05);
  c.env.shadowCenter = [0, 0, -1200]; c.env.shadowRadius = 1600;
  c.env.fill = [0.45, 0.4, 0.45, 0.55]; c.env.rim = [0.9, 0.6, 0.55, 0.6];
});
cut(125.6, 127.8, 'X tracer wall flythrough', (c) => { lineRide(c, 7, 1.2 - c.u * 0.6, -22, 8, 58, 0.15); shake(c, 0.3, 10); c.post.shakeBlur = 0.0008; });
cut(129.8, 131.8, 'X our frigate dies', (c) => { const td = lossCam(c, 1, 240 - c.u * 20, 0.6, 40); shake(c, td && c.t > td ? 0.9 : 0.2, 9); });
cut(131.8, 134, 'X hull skim', (c) => {
  const { t, u } = c;
  const L = modelLen(c.R, 'mothership');
  camLook(c, motherPoint([0, 0, 0], t, [36, 112, -L * 0.3 + u * 140]), motherPoint([0, 0, 0], t, [-40, 80, L * 0.5]), 62, 0.2);   // low over the top deck
  shake(c, 0.4, 12); c.post.shakeBlur = 0.001; c.env.shadowRadius = 200;
});
cut(143.8, 145.4, 'X frigate dies close', (c) => { const td = lossCam(c, 2, 230, -0.9, 42); shake(c, td && c.t > td ? 1 : 0.3, 10); });
cut(148.6, 150, 'X another loss', (c) => { const td = lossCam(c, 3, 260, 5.3, 38); shake(c, td && c.t > td ? 0.9 : 0.2, 9); });
cut(167.35, 169, 'X carnage over the planet', (c) => {   // (from 166.8: now holds on Sigma until the swatted bolt has burst)
  const { t, u } = c;
  againstPlanet(c, [0, 0, -700], 1300 - u * 120, 60, 300, 40, 0.06, 0.05, true);
  handheld(c, 0.4); c.env.shadowRadius = 900; c.env.shadowCenter = [0, 0, -700];
});
cut(196.8, 200, 'X wide over the planet', (c) => {
  const { t, u } = c;
  againstPlanet(c, [0, 0, -900], 1500, 80, -500 + u * 80, 38, -0.05, 0.05, true);
  handheld(c, 0.3); c.env.shadowRadius = 1000; c.env.shadowCenter = [0, 0, -800];
});
cut(308.4, 310, 'X tracers into the wreck', (c) => { lineRide(c, 10, 0.8, 26, 14, 52, -0.1); shake(c, 0.4, 8); });
SHOTS.unshift(...CUTS);
