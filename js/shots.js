// Shot list: camera + shot-specific content for every second of the film.
import { M, V, Q, hash, noise1, sat, smooth, ease, easeOut, easeIn, easeInOut, lerp, spline, DEG, clamp } from './math.js';
import { fxOpts, explosion, hyperWindow, engineGlows, emitWorld, bolt, hitFlash, trail, randDir, shatter, chargeInflow, spark } from './fx.js';
import { RIFLE_T, RIFLE_Q, ENEMY_HOLE, enemyHolsterLocal, CATCH_T, duelMuzzle, duelHero, duelEnemy1, duelEnemy2, duelCamera, DUEL_EVENTS, DUEL_SHOTS, trailSample, maceCharge, rifleCharge, SERAPH_SHOTS, seraphMuzzle, FINALE_T, FINALE_END, SHIELD_HIT_T, HOLES, HERO_RIFLE_S, bigShieldScale, blockHitAt, blockPath, blockLocalAt, heroBackMount, heroRifleThrow, SD_GRAB, ENEMY_BURST, BLOCK_SPOT, blockFrame, HERO_LOAD, HERO_EJECT, HERO_LOCK, HERO_GRAB, heroEject, heroCap, heroRifleFrame, ENEMY_CHARGE0, ENEMY_CHARGE1, ENEMY_EYE, TRANS0, TRANS_SHOT, TRANS_PASS, TRANS_HIT, transK, enemyRifleFrame, transPath, transHead, transOrb, transCutAxis, SWING_PRE, SWING_POST, ultBeams, ultPoint, ultSwarm, missilePosC, circusClock, CIRCUS_B3, ULT_HIT, KILL_SHOT_T, CUT_T, CUT_Y, CUT_SPLIT, cutArms, SANDE0, duelFK, maceWrist, ragdoll, DODGE, dodgeRight, AUTO_FX, energyShards, SHARD_LIFE } from './duel.js';
import { storyT, filmT, tearU, slowHit, FILM_DURATION } from './timemap.js';
import { heartbeatTimes } from './audio-music.js';
let FILM_NOW = 0;
import {
  drawWorld, mat, matEuler, motherMatrix, motherPoint, motherYaw, ionFrigate, assaultFrigate, enemyFrigate, dreadPos, dreadEmitter,
  WELL, DREAD, HANGAR, BC, GC, IONF, ASF, EF, GUN, POSES, blendPose, breathe, gundamLaunchPath, fighterPos, PAIRS,
  HIIG_ENGINE, ENEMY_ENGINE, HYPER_BLUE, HYPER_RED, ION_COL, LANCE_COL, BEAM_PINK, LANCE_FIRE, MAIN_FIRE, IMPLODE, LANCE_HIT, DREAD_DIE,
  modelLen, modelSize, ionMuzzle, missilePos, MISSILES, debrisOnly, allParts, rotY,
  EXTRA_H, EXTRA_E, extraHPos, extraEPos, H_FEATURED, drainOutflow, fighterModel, ionCharge, EARTH_T, STRIKE_SHOTS, CO_FLY, CO_BOOM, CO_KILLS, CO_HULL_HITS, CO_TURRET,
} from './world.js';

export const DURATION = FILM_DURATION;   // film (player) duration; choreography below is in story time
const CP = [GC[0], GC[1] + 25, GC[2]];
const SABER_ORANGE = [2.4, 0.9, 0.25];

// ------------------------------------------------------------------ environment presets
const SUN = V.norm([0, 0, 0], [-0.8, 0.5, 0.25]);
const SUN2 = V.norm([0, 0, 0], [0.75, 0.12, -0.6]);        // the second sun (≈125° from the first)
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
  if (t >= EARTH_T) return {   // home: the original dark space round Earth (the warm key, near-black sky, no nebula)
    time: t, sunDir: SUN, sunCol: [2.5, 2.12, 1.62], ambUp: [0.2, 0.25, 0.34], ambDown: [0.16, 0.11, 0.07], ambient: 1.9,
    nebula: 0, stars: 0.8, sunDisc: 1, sun2Dir: null, sun2Col: [0.45, 0.56, 0.85],
    sky: [0.010, 0.011, 0.013, 0.6], planet: null, shadows: true, shadowCenter: [0, 0, 0], shadowRadius: 400,
  };
  return {
    // lighting after the concept-art reference: warm key, cool soft skylight from above, warm bounce from below,
    // slate-blue space haze instead of pure black, gentle contrast
    // (2026-10-01, after the user's Homeworld 3 reference: a luminous blue-violet space — cool white key, a strong blue
    // skylight so the shadow sides read blue instead of black, a nebula backdrop instead of near-black)
    time: t, sunDir: SUN, sunCol: [2.45, 2.32, 2.12], ambUp: [0.3, 0.4, 0.66], ambDown: [0.1, 0.11, 0.22], ambient: 2.1,   // sunCol: the upper sun is the strong key
    nebula: 1.15, stars: 0.6, sunDisc: 1,
    // a binary system: the second, blue-white sun on the far side lights what the first leaves dark (none at Earth)
    sun2Dir: t < EARTH_T ? SUN2 : null, sun2Col: [0.5, 0.68, 1.15],   // the lower, blue-white sun: weaker than the upper one
    sky: [0.03, 0.045, 0.12, 1.0],   // deep blue-violet haze across the whole sky
    planet: null,                                    // no moon (only Earth at the end)
    shadows: true, shadowCenter: [0, 0, 0], shadowRadius: 400,
  };
}
function basePost() {
  return {
    exposure: 0.9, bloom: 0.3, ca: 0.0006, grain: 0, fade: 1, flash: 0, letterbox: 1, vignette: 0.8,
    distort: 1, streak: 0.22, saturation: 1.0, contrast: 1.0, gradeShadows: [0.84, 0.94, 1.2], gradeHighlights: [1.0, 1.0, 1.04],   // a cool, bright grade (blue shadows)
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
const B_HITS = [267.42];   // (2026-09-30) one blow: the beam saber at ten times its output, thrust straight through the barrier
export const THRUST_T = 267.42, MEGA_LEN = 2.5;   // the blade tip reaches the shield; the blade 2.5× its length at full output
const THRUST_Z = -SHIELD_R - 5 - 13 * MEGA_LEN;
const DIVE_END_Z = -420, CHARGE_V = 38;   // the dive hands over to the charge at 262 here, at this speed (m/s along the axis)   // his z when the tip touches the dome (hilt ~5 m ahead of him)
function berserkZ(t) {
  const hitZ = -SHIELD_R - 8;
  // ONE CHARGE from the dive to the barrier: never stopping, never backing off — he keeps driving in, accelerating, draws
  // the blade back on the run and puts it straight through at the end of it
  if (t < THRUST_T) {   // Hermite: leaves the dive's end at its speed, reaches the barrier at the thrust's
    const T = THRUST_T - 262, w = sat((t - 262) / T), z0 = DIVE_END_Z, z1 = THRUST_Z, v0 = CHARGE_V, v1 = CHARGE_V * 1.2;
    return (2 * w ** 3 - 3 * w * w + 1) * z0 + (w ** 3 - 2 * w * w + w) * T * v0 + (-2 * w ** 3 + 3 * w * w) * z1 + (w ** 3 - w * w) * T * v1;
  }
  if (t < 268) return lerp(THRUST_Z, THRUST_Z + 6, easeOut(sat((t - THRUST_T) / (268 - THRUST_T))));   // the blade drives in; the barrier gives
  if (t < 270) return lerp(THRUST_Z + 6, hitZ + 30, (t - 268) / 2);                    // through the shards
  if (t < 272.95) return lerp(hitZ + 30, -36, easeIn(sat((t - 270) / 2.95)));        // accelerating ram at the core
  return -36 + 5 * easeOut(sat((t - 272.95) / 0.35)) + 1.5 * smooth(273.3, 277.5, t);  // drives in and keeps grinding (no rebound)
}
// the thrust: the ram's two-handed levelled grip, drawn back hard (elbows back, torso coiled), then driven straight in
function thrustPose(t) {
  const out = ramPose(t);
  const wind = smooth(266.2, 267.0, t) * (1 - smooth(267.18, 267.36, t)), lunge = smooth(267.18, 267.36, t) * (1 - smooth(268.2, 269.5, t));   // (drawn back on the run, the thrust straight out of it)
  out.torso[0] -= 0.55 * wind; out.head[0] += 0.3 * wind; out.torso[0] += 0.25 * lunge;
  for (const sd of ['L', 'R']) { out['arm_' + sd + '_lower'][0] -= 0.75 * wind; out['arm_' + sd + '_upper'][0] += 0.35 * wind; out['arm_' + sd + '_upper'][0] -= 0.15 * lunge; }
  out.leg_L_upper[0] += 0.4 * lunge - 0.3 * wind; out.leg_R_upper[0] += 0.5 * lunge - 0.2 * wind;
  return out;
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
// ---- the ram: both fists on the beam-saber hilt, the blade levelled at the core, body behind it.
// Solved once with the duel FK (same kinematics as the renderer): blade axis → straight ahead, left fist at the chest,
// right fist on the hilt just below it.
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
    const tl = [0.6, 4.2, 4.2], tr = V.madd([0, 0, 0], hl, want, 1.3);   // both fists on the saber hilt
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
  let crack = 0; B_HITS.forEach((h, i) => { if (t >= h) crack = (i + 1) / B_HITS.length * 0.85; });
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
// (2026-10-03) his mark for the dive is already clear of the flagship — out wide and a little up — so the dive is ONE
// straight line to the well (no swing round the hull); he takes it up off screen, already squared to the well
function diveStart() { if (_diveStart) return _diveStart; const nOut = V.norm([0, 0, 0], [motherDir(240, [1, 0, 0])[0], 0, motherDir(240, [1, 0, 0])[2]]); return (_diveStart = addv(madd(divePass(240), nOut, 160), [-60, 310, 0])); }   // (high over the flank: his line to the well clears the drifting bay contents by ~175 m and the frigates by ~70 m)
const diveDir = () => V.norm([0, 0, 0], V.sub([0, 0, 0], addv(WELL, [0, -10, DIVE_END_Z]), diveStart()));
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
  // the beam RIFLE from the launch to the dive; he puts it away on his back at 257.6–258.3 (over the shoulder) and
  // draws the beam SABER at 270.2 for the ram into the core
  r.weapon = t < 170 ? 'back' : t < FLING_T ? 'rifle' : t < 263 ? 'flung' : t < 265.9 ? 'none' : 'saber';   // (the rifle flung away before the well: FLING_T)
  if (t < 262) r.saber = 0;
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
    s.fwd = V.norm([0, 0, 0], lerpv([Math.sin(u * Math.PI) * 1, 0, -Math.cos(u * Math.PI)], diveDir(), smooth(235.5, 239.5, t)));   // (squared to the well before the dive starts)
    blendPose('stand', 'flight', smooth(237.5, 240, t), s.pose);
    breathe(s.pose, t, 1 - u);
    s.thr = 0.3 + smooth(238, 239.5, t) * 0.7;
  } else if (t < 262) {
    // one straight charge from the duel site to the well: no kink, he just keeps accelerating dead ahead
    const start = diveStart();
    const end = addv(WELL, [0, -10, DIVE_END_Z]);
    const u = (t - 240) / 22;
    // coil for a breath, then an explosive burst to full speed (continuous: the old curve jumped back at 244.5); over its
    // last stretch it eases to CHARGE_V so the charge at the barrier carries straight on from it (no stop at 262)
    // (2026-10-03) a held breath, then a sudden kick off the mark — and he keeps accelerating, half of it the kick's
    // momentum, half a steady burn (the old curve reached its top speed at once and coasted: it read as a linear slide)
    const B = 0.025, K = 60, eRaw = (x) => { if (x < B) return 0; const v = (x - B) / (1 - B), kick = (v - (1 - Math.exp(-K * v)) / K) / (1 - (1 - Math.exp(-K)) / K); return 0.5 * kick + 0.5 * v * v; };
    const U0 = 0.82, L = V.dist(start, end), s0 = (eRaw(U0 + 1e-4) - eRaw(U0 - 1e-4)) / 2e-4, s1 = CHARGE_V * 22 / L;
    let e = eRaw(u);
    if (u > U0) { const w = (u - U0) / (1 - U0), h = 1 - U0, e0 = eRaw(U0);
      e = (2 * w ** 3 - 3 * w * w + 1) * e0 + (w ** 3 - 2 * w * w + w) * h * s0 + (-2 * w ** 3 + 3 * w * w) * 1 + (w ** 3 - w * w) * h * s1; }
    // (the straight line to the well runs through the flagship's hull: he swings out wide of it — away from the wound
    // side — and a little up, then back onto his line once he's past it)
    const nOut = V.norm([0, 0, 0], [motherDir(240, [1, 0, 0])[0], 0, motherDir(240, [1, 0, 0])[2]]);
    const clr = (x) => smooth(0, 0.05, x) * (1 - smooth(0.3, 0.85, x));
    const offAt = (x) => [0, 0, 0];   // (no swing any more: his mark is clear of the hull — diveStart)
    const ec = clamp(e, 0, 1);
    s.pos = addv(lerpv(start, end, ec), offAt(ec));
    { const e2 = Math.min(1, ec + 0.01), p2 = addv(lerpv(start, end, e2), offAt(e2)), d = V.sub([0, 0, 0], p2, s.pos);
      s.fwd = V.len(d) > 1e-4 ? d : V.sub([0, 0, 0], end, start); }
    blendPose('flight', 'flight', 0, s.pose);
    s.pitch = 0.9 * smooth(240.45, 240.9, t) * (1 - smooth(258, 262, t)); s.thr = t < 240.55 ? 0.4 : 1; s.boostK = smooth(240.5, 240.62, t);
    s.roll = Math.sin(t * 0.5) * 0.05;
    // he flings the rifle away before the well: the arm wound in across him, then thrown out wide to his right (it leaves
    // the hand at FLING_T) and brought back in
    const wd = smooth(FLING_T - 0.4, FLING_T - 0.1, t) * (1 - smooth(FLING_T - 0.1, FLING_T, t)), fl = smooth(FLING_T - 0.1, FLING_T, t) * (1 - smooth(FLING_T + 0.25, FLING_T + 0.7, t));
    if (wd + fl > 0) {
      const a0 = s.pose.arm_R_upper, b0 = s.pose.arm_R_lower;
      s.pose.arm_R_upper = [lerp(lerp(a0[0], -1.3, wd), -0.5, fl), lerp(lerp(a0[1], 0.5, wd), 0, fl), lerp(lerp(a0[2], 0.4, wd), -1.45, fl)];
      s.pose.arm_R_lower = [lerp(lerp(b0[0], -1.8, wd), -0.1, fl), 0, 0];
    }
  } else if (t < 278) {
    // BERSERK: feral lunges into the shield (263.4 / 265.0 / 266.6), shatter 268, rush 270–272.8, slash 273
    const z = berserkZ(t);
    const jk = smooth(262, 262.6, t);   // (the feral shake builds in: no step off the dive)
    s.pos = addv(WELL, [noise1(t * 9) * 2.5 * berserkJitter(t) * jk, lerp(-10, -6, smooth(262, 263, t)) + noise1(t * 8 + 3) * 2 * berserkJitter(t) * jk, z]);
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
      mixPose(s.pose, thrustPose(t), smooth(265.4, 265.95, t));   // the saber in both hands: drawn back, the thrust
      if (t > 270.2) mixPose(s.pose, ramPose(t), smooth(270.2, 271.0, t));
    } else { for (const k in s.pose) delete s.pose[k]; Object.assign(s.pose, ramPose(t)); }
    s.saber = smooth(266.0, 266.25, t);
    s.saberPow = 1 + 9 * smooth(265.98, 266.3, t) * (1 - smooth(268.3, 269.6, t));   // TEN times its output for the thrust
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
      // (no fire puff at the wound: a round ball of light in the middle of the spark burst)
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

// SANDEVISTAN afterimages: the machine as it was a moment ago, every 45 ms, strung out behind him — neon silhouettes
// cycling green → cyan → magenta, fading with age (renderer ghost mode: screen-door translucency, rim-lit tint)
const SANDE_COL = [[0.3, 2.2, 1.0], [0.3, 1.6, 2.4], [2.2, 0.4, 1.9]];
function drawAfterimages(R, t, s) {
  const run = t > SANDE0 - 0.05 && t < CUT_T + 0.2, K = run ? 18 : 8, step = run ? 0.022 : 0.045;   // (the Sandevistan dash: a denser string of them)
  for (let k = 1; k <= K; k++) {
    const tp = t - k * step; if (tp < (s.ghostFrom ?? SANDE0 - 0.02)) break;
    const q = gundamState(tp); if (!q || !q.vis) continue;
    const g = R.add('gundam', msMatrix(new Float32Array(16), q)); if (!g) continue;
    g.pose = q.pose; g.seed = 5.5; g.texSet = 0;
    g.hidden = { rifle: 1, saber_hilt: 1 };
    g.ghost = s.sande * 0.62 * (1 - (k - 1) / K);
    const c = SANDE_COL[k % 3]; g.tint[0] = c[0]; g.tint[1] = c[1]; g.tint[2] = c[2];
  }
}
// BOOST SMEAR (the Itano-circus run): the machine a few film-milliseconds ago, close together and faint in its own colour —
// a short motion-blur trail behind him only (the scene's motion blur is off in the circus)
function drawBlurTrail(R, t, s) {
  const K = 5, f = filmT(t);
  for (let k = 1; k <= K; k++) {
    const q = gundamState(storyT(f - k * 0.022)); if (!q || !q.vis) continue;
    const g = R.add('gundam', msMatrix(new Float32Array(16), q)); if (!g) continue;
    g.pose = q.pose; g.seed = 5.5; g.texSet = 0;
    g.hidden = { rifle: 1, saber_hilt: 1 };
    g.ghost = s.blurTrail * 0.42 * Math.pow(1 - (k - 1) / K, 1.4);
    g.tint[0] = 0.9; g.tint[1] = 1.0; g.tint[2] = 1.2;
  }
}
// a shot that LANDS burns a hole through the armour it hits (duel.js HOLES): the plate melts open around the hit point —
// it opens out in a fifth of a second, white-hot at first, cooling to a dull cherry rim that stays for the rest of the fight
// SPARK STREAKS a pixel wide (not round dots): the ribbon radius is set from the distance to the camera
const pxR = (p, k = 0.6) => { const c = ctx.cam, R = ctx.R, d = V.dist(c.pos, p); return k * d * 2 * Math.tan((c.fov || 0.8) * 0.5) / Math.max(1, (R && R.height) || 1080); };
function streak(R, a, b, col, k = 0.6) { R.beam(a, b, pxR(b, k), col, 1, 2, 0, 0); }
// a burst of pixel sparks from p (directions around n, spread 0..1), story time lt since it began; life / speed ranges
function sparkBurst(R, p, n, lt, seed, count = 40, spread = 0.8, speed = 40, life = 0.5, col = [4, 2.2, 0.8]) {
  for (let i = 0; i < count; i++) {
    const L = life * (0.4 + 0.6 * hash(seed + i)); if (lt > L) continue;
    const a = lt / L, d = V.norm([0, 0, 0], V.madd([0, 0, 0], n, randDir([0, 0, 0], seed * 1.3 + i * 4.1), spread * 1.5));
    const v = speed * (0.3 + 0.7 * hash(seed + i + 50)), q = madd(p, d, v * lt), tail = madd(q, d, -Math.min(v * lt, v * 0.03));
    const b = (1 - a) * (1 - a); streak(R, tail, q, [col[0] * b, col[1] * b, col[2] * b]);
  }
}
// MOLTEN METAL: round gobbets of different sizes (a few pixels to ~10 px), white-yellow hot, cooling to orange and red
function molten(R, q, age, sz) {
  const b = 1 - age, hot = b * b;
  R.glow(q, pxR(q, 0.6) * sz * (0.6 + 0.4 * b), [5 * b + 1.2 * hot, 2.4 * hot + 0.4 * b, 0.6 * hot * hot], 0.12);
}
function moltenBurst(R, p, n, lt, seed, count = 40, spread = 0.8, speed = 40, life = 0.5) {
  for (let i = 0; i < count; i++) {
    const L = life * (0.4 + 0.6 * hash(seed + i)); if (lt > L) continue;
    const d = V.norm([0, 0, 0], V.madd([0, 0, 0], n, randDir([0, 0, 0], seed * 1.3 + i * 4.1), spread * 1.5));
    const v = speed * (0.3 + 0.7 * hash(seed + i + 50));
    molten(R, madd(p, d, v * lt), lt / L, 6 + 14 * hash(seed + i + 90));
  }
}
// the wound (a HOLES entry) in world space at time tt: its point and outward axis, from the duel FK (= the renderer's frames)
const inCatchCut = (t) => t > CATCH_T - 0.21 && t < CATCH_T + 0.06;   // scene 53 (D16c): the catch reads clean — no sparks or embers in it
function woundAt(who, h, tt) {
  const s = who === 'hero' ? duelHero(tt) : duelEnemy2(tt) || duelEnemy1(tt); if (!s) return null;
  const fk = duelFK(s, who === 'hero' ? 'gundam' : 'enemy_ms'), pm = fk[h.part]; if (!pm) return null;
  return { p: M.transformPoint([0, 0, 0], pm, h.local), n: V.norm([0, 0, 0], M.transformDir([0, 0, 0], pm, [1, 0, 0])) };
}
function meltHole(e, who, t, part) {
  let h = null;
  for (const x of HOLES) if (x.who === who && t >= x.t && (!part || x.part === part) && (!h || x.t > h.t)) h = x;
  if (!h) return;
  const lt = t - h.t, r = h.r * (0.35 + 0.65 * easeOut(sat(lt / 0.2)));
  e.melt = [h.local[0], h.local[1], h.local[2], r, h.depth, 0.35 + 2.4 * Math.exp(-lt * 1.3)]; e.meltPart = h.part;
  // the impact rides WITH the part it hit: flash, a spray of pixel sparks out of the wound, then a molten glow that cools
  // and a trickle of embers (all in the part's frame, so it follows the machine as it moves)
  const R = ctx.R, model = who === 'hero' ? 'gundam' : 'enemy_ms'; if (!R || lt > 5) return;
  const pm = R.partWorld(model, e, h.part), p = M.transformPoint([0, 0, 0], pm, h.local);
  const n = V.norm([0, 0, 0], M.transformDir([0, 0, 0], pm, [1, 0, 0]));          // the hole's outward axis (part-local +X)
  const hk = Math.exp(-lt * 1.1);
  if (lt < 0.12) { const f = 1 - lt / 0.12; R.glow(p, 1.5 + 5 * f, [4 * f, 2.6 * f, 1.4 * f], 0.3); }
  R.glow(p, h.r * (1.2 + 0.8 * hk), [2.6 * hk + 0.25, 0.9 * hk + 0.05, 0.25 * hk], 0.25);
  R.light(p, 25, [1, 0.5, 0.2], 1.5 + 5 * Math.exp(-lt * 6));
  // (the glow rides with the part; what flies OUT of the wound doesn't: each spark / ember leaves from where the wound
  // was when it was thrown and carries on through space on its own — it no longer travels along with the machine)
  if (inCatchCut(t)) return;                                                     // (scene 53, the rifle catch: nothing flying round him)
  const w0 = woundAt(who, h, h.t);
  sparkBurst(R, w0 ? w0.p : p, w0 ? w0.n : n, lt, 31 + h.t, 60, 0.9, 55, 0.7, [5, 2.6, 0.9]);
  for (let i = 0; i < 10; i++) {                                                   // embers still spitting out of the melt
    const L = 0.35 + 0.3 * hash(i + 90), ph = ((lt / L) + hash(i + 7)) % 1, cyc = Math.floor(lt / L + hash(i + 7));
    const wb = woundAt(who, h, t - ph * L) || { p, n };                             // the wound when this one was spat out
    const d = V.norm([0, 0, 0], V.madd([0, 0, 0], wb.n, randDir([0, 0, 0], i * 2.3 + cyc * 0.71), 0.9)), q = madd(wb.p, d, ph * 9), b = hk * 2.5 * (1 - ph);
    if (b > 0.03) streak(R, madd(q, d, -0.6), q, [b * 1.6, b * 0.7, b * 0.2]);
  }
}
const _hrS = new Float32Array(16);
// the beam-saber hilt on his left hip (duel.js SABER_MOUNT_*): a hilt-only copy of him placed so its hilt sits where his
// hand picks it up at SD_GRAB (the same torso-local pose, so the draw grabs it exactly off the mount)
let _hhL = null, _hhHide = null;
function drawHipHilt(R, e) {
  if (!_hhHide) { _hhHide = {}; for (const p of R.models.gundam.parts) if (p.name !== 'saber_hilt') _hhHide[p.name] = 1; }
  const Hn = R.partWorld('gundam', e, 'saber_hilt'), Hh = R.partWorld('gundam', e, 'hand_L'), Tw = R.partWorld('gundam', e, 'torso'); if (!Hn || !Hh || !Tw) return;
  if (!_hhL) {   // torso-local hilt matrix at the grab: inv(torso) · hand_L · (hand → hilt)
    const fk = duelFK(duelHero(SD_GRAB), 'gundam'), hToHilt = M.mul(new Float32Array(16), M.invert(new Float32Array(16), Hh), Hn);
    _hhL = M.mul(new Float32Array(16), M.invert(new Float32Array(16), fk.torso), M.mul(new Float32Array(16), fk.hand_L, hToHilt));
  }
  const Mm = M.mul(new Float32Array(16), Tw, _hhL), Mc = M.mul(new Float32Array(16), Mm, M.mul(new Float32Array(16), M.invert(new Float32Array(16), Hn), e.m));
  const c = R.add('gundam', Mc); if (!c) return;
  c.pose = e.pose; c.hidden = _hhHide; c.seed = e.seed; c.wear = e.wear; c.texSet = e.texSet;
}
export function drawGundam(R, t, s, opts = {}) {
  if (!s.vis) return null;
  if ((s.sande || 0) > 0.01 && !s.fpv) drawAfterimages(R, t, s);
  if ((s.blurTrail || 0) > 0.01 && !s.fpv) drawBlurTrail(R, t, s);
  const e = R.add('gundam', msMatrix(tmpM, s));
  if (!e) return null;
  e.pose = s.pose; e.damage = s.damage; e.seed = 5.5; e.wear = 1; e.texSet = R.texLoaded & 1 ? 1 : 0;
  const weapon = s.weapon || (t < 258.3 ? 'rifle' : t < 270.2 ? 'none' : 'saber');
  const hiltHand = weapon === 'saber' || s.saberL || s.hiltL;
  e.hidden = { rifle: 1, saber_hilt: hiltHand ? 0 : 1 };   // (the built-in rifle replaced by hero_rifle, drawn on its node)
  if (!hiltHand && !s.fpv && t > 150 && t < 191.26) drawHipHilt(R, e);   // otherwise the hilt hangs on his left hip
  // in hand: on hand_R through the grip frame in duel.js (RIFLE_T / RIFLE_Q) — the same one the IK solves for
  if (weapon === 'rifle' && !s.fpv) { const rw = M.mul(new Float32Array(16), R.partWorld('gundam', e, 'hand_R'), M.fromTRS(new Float32Array(16), RIFLE_T, RIFLE_Q, 1)); if (rw) { M.fromTRS(_hrS, [0, 0, 0], [0, 0, 0, 1], 1); _hrS[0] = HERO_RIFLE_S[0]; _hrS[5] = HERO_RIFLE_S[1]; _hrS[10] = HERO_RIFLE_S[2];
    const g = R.add('hero_rifle', M.mul(new Float32Array(16), rw, _hrS)); if (g) { g.seed = 5.5; g.wear = 0; g.damage = s.damage; g.texSet = R.texLoaded & 16 ? 3 : 0; } } }
  if (weapon === 'flung' && !s.fpv) { const m = flungRifle(t); if (m) { const g = R.add('hero_rifle', m); if (g) { g.seed = 5.5; g.wear = 0; g.damage = s.damage; g.texSet = R.texLoaded & 16 ? 3 : 0; } } }   // flung away before the well
  if (weapon === 'thrown' && !s.fpv) { const m = heroRifleThrow(t); if (m) { const g = R.add('hero_rifle', m); if (g) { g.seed = 5.5; g.wear = 0; g.damage = s.damage; g.texSet = R.texLoaded & 16 ? 3 : 0; } } }   // tossed aside for the saber cut
  if (weapon === 'back' && !s.fpv) { const tw = R.partWorld('gundam', e, 'torso'); if (tw) { const g = R.add('hero_rifle', M.mul(new Float32Array(16), tw, heroBackMount())); if (g) { g.seed = 5.5; g.wear = 0; g.damage = s.damage; g.texSet = R.texLoaded & 16 ? 3 : 0; } } }   // slung on his back
  if (s.fpv) {
    e.hidden = { rifle: 1, head: 1, torso: 1, backpack: 1, pelvis: 1, arm_L_upper: 1, arm_R_upper: 1, hand_L: 1, hand_R: 1 };   // POV: forearms + articulated hands
    drawPovHands(R, t, e, s);
  }
  const eyeK = s.eye * (opts.eye ?? 1);
  const bz = s.berserk || 0;
  const visK = 1 + 2.2 * smooth(175.55, 175.75, t) * (1 - smooth(176.0, 176.4, t));   // the standoff: his visor lights up
  const ec = [lerp(0.5 * 2.5, 9, bz) * eyeK * visK, lerp(2.2 * 2.5, 0.4, bz) * eyeK * visK, lerp(1.2 * 2.5, 0.25, bz) * eyeK * visK];
  // chest reactor ring (torso 'core'): its own emissive plus a soft glow halo, slow heartbeat pulse; red when berserk
  const coreK = (0.85 + 0.15 * Math.sin(t * 2.2)) * (s.fpv ? 0 : 1) * (s.damage > 0.5 ? 0.4 : 1);
  const cc = [lerp(0.35, 3.5, bz) * 3.2 * coreK, lerp(0.85, 0.35, bz) * 3.2 * coreK, lerp(1.0, 0.2, bz) * 3.2 * coreK];
  e.matOverride = { eye: { base: [0.2, 0.9, 0.5], metal: 0, rough: 0.3, emissive: ec }, core: { base: [0.3, 0.8, 1.0], metal: 0, rough: 0.3, emissive: cc } };
  if (coreK > 0.02) {
    const cp = M.transformPoint([0, 0, 0], R.partWorld('gundam', e, 'torso'), [0.03, 3.14, 2.7]);
    R.glow(cp, 1.9, [cc[0] * 0.35, cc[1] * 0.35, cc[2] * 0.35], 0.45);
  }
  // exhaust history never reaches back across a scene cut where his path jumps (340: the drift → the bay approach; 163: scene 30's run turned onto VANGUARD)
  const pastHero = opts.pastState || ((tau) => { const cutAt = t >= 340 ? 340 : t >= 163 && t < 170 ? 163 : -1e9, q = gundamState(Math.max(t - tau, cutAt)); return { m: msMatrix(new Float32Array(16), q.vis ? q : s), pose: (q.vis ? q : s).pose }; });
  const inDuel = t > 169.5 && t < 200;                         // in the fight no plume history: it read as weapon trails
  const bk = s.boostK ?? (inDuel ? sat((s.boost - 0.62) / 0.38) : 0);   // duel quick-boosts: the nozzles flare
  if (s.thr > 0.02) engineGlows(R, 'gundam', e, [0.9, 1.2, 2.6], (inDuel ? 1.3 : 0.9) * (1 + 0.9 * bk), s.thr, (inDuel ? 2.4 : 1.2) + 2.2 * bk, s.fpv || opts.noTrail || inDuel || (s.berserk || 0) > 0.05 ? null : { past: pastHero, particles: !(t > 318 && t < 347) });   // no ember sparks while he comes to / flies home
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
  // the BEAM SABER (left hand, from the well assault on): cyan blade out of the hilt, red while berserk
  if ((weapon === 'saber' || s.saberL) && s.saber > 0) {
    const [a, , dir] = saberSegment(R, 'gundam', e, 'hand_L', 1);
    const k = easeOut(sat(s.saber)), pw = s.saberPow || 1, mega = Math.max(0, (pw - 2) / 8);   // mega: 0..1 toward ten-times output
    const th = pw <= 2 ? pw : 2 + (pw - 2) * 0.12, tip = madd(a, dir, 13 * k * (1 + (MEGA_LEN - 1) * mega));
    const col = bz > 0.05 ? [3.4, 0.5, 0.3] : [0.8, 2.2, 3.2];
    R.beam(a, tip, 0.5 * th, [col[0] * k, col[1] * k, col[2] * k], 0.5 * pw, 26, 1.5, 1.2);   // (pw: output — 2 = full power, twice as thick; 10 = the barrier thrust)
    R.beam(a, tip, 1.5 * th, [col[0] * k, col[1] * k, col[2] * k], 0.04 * pw, 3, 2, 0.8);
    if (mega > 0) { R.beam(a, tip, 2.2 * th, [0.3 * k * mega, 0.8 * k * mega, 1.6 * k * mega], 0.03 * pw, 2, 2.5, 1.5); R.glow(a, 3 + 5 * mega, [1.5 * mega, 3 * mega, 5 * mega], 0.5); }   // the overdriven blade: a wide corona, the hilt blazing
    R.light(lerpv(a, tip, 0.5), 40 * pw, bz > 0.05 ? [1, 0.25, 0.1] : [0.4, 0.8, 1], 4 * k * pw);
    GUN.saber = [a, tip];
    if (s.saberL && t > TRANS_PASS - SWING_PRE - 0.002 && t < TRANS_PASS + SWING_POST + 0.02) {   // the swing's afterimage: a fan of fading blades along the path it just swept
      const fk0 = duelFK(duelHero(t), 'gundam').hand_L, inv = M.invert(M.new(), fk0), la = M.transformPoint([0, 0, 0], inv, a), ld = M.transformDir([0, 0, 0], inv, dir);
      for (let i = 1; i <= 14; i++) {
        const hm = duelFK(duelHero(t - i * 0.0012), 'gundam').hand_L, ga = M.transformPoint([0, 0, 0], hm, la), gd = V.norm([0, 0, 0], M.transformDir([0, 0, 0], hm, ld));
        if (V.dist(madd(ga, gd, 13), tip) < 0.6 * i) continue;   // (no smear where it hadn't moved)
        const f = Math.pow(1 - i / 15, 1.6) * k;
        R.beam(ga, madd(ga, gd, 13 * k), 0.9 * pw, [col[0] * f, col[1] * f, col[2] * f], 0.1 * f * pw, 4, 1.5, 0.8);
      }
    }
    if (!s.fpv && k > 0.5) gripHand(R, e, 'L', 0);   // a closed fist round the hilt
  } else GUN.saber = null;
  // the rifle charges for the last shot: the muzzle gathers light, the glow strips (and his core) flood with power
  const rc = weapon === 'rifle' ? rifleCharge(t) : 0;
  if (rc > 0 && !s.fpv) {
    const mz = R.models.gundam.empties.rifle_muzzle ? R.emptyWorld([0, 0, 0], 'gundam', e, 'rifle_muzzle') : null;
    const q = rc * rc * (1 + 0.1 * Math.sin(t * 41));
    if (mz) { R.glow(mz, 0.6 + 3.2 * q, [0.8 * q, 2.2 * q, 3.2 * q], 0.35); R.light(mz, 60, [0.4, 0.8, 1], 12 * q); }
    e.matOverride.core = { ...e.matOverride.core, emissive: e.matOverride.core.emissive.map((v) => v * (1 + 6 * q)) };
  }
  if (t >= 170 && t < 200 && !s.fpv) { heavyDamage(R, t, e, 0); meltHole(e, 'hero', t); }   // (drawLoad: the reload was cut)
  GUN.gundam = e;
  return e;
}
// the finisher: from the moment the magnum shot goes through (192.4) SERAPH comes apart — the beam punches through, the body
// splits into armour chunks that drift outward in slow motion, then the reactor goes at 194 and everything is flung
const E2_FIN = 1e9, E1_FIN = 1e9;   // (the halves come apart on their own: drawHalves)
const _fin = {};
function drawBreakup(R, t, idx) {
  const t0 = idx === 2 ? E2_FIN : E1_FIN;
  if (!_fin[idx]) { const s0 = idx === 2 ? enemyMS2(t0) : enemyMS1(t0); _fin[idx] = { m: msMatrix(new Float32Array(16), s0), pose: JSON.parse(JSON.stringify(s0.pose)) }; }
  // RONIN #2 (the finisher) comes apart in slow motion until its reactor blows at 194; RONIN #1 in real time
  const tt = idx === 2 ? E2_FIN + Math.min(1.6, t - E2_FIN) * 0.6 + Math.max(0, t - 194) * 1.1 : t;   // the fan opens up in the slow beat before the reactor goes
  // the pieces are thrown along the killing blow (the shot direction), in the dead machine's model space
  if (!_fin[idx].imp && BLOWS[idx]) { const ev = BLOWS[idx].ev; const inv = M.invert(M.new(), _fin[idx].m); _fin[idx].imp = V.norm([0, 0, 0], M.transformDir([0, 0, 0], inv, V.sub([0, 0, 0], ev.cut[1], ev.cut[0]))); }
  // RONIN #2 (the finisher): its own armour thrown out BEHIND it in a flat fan along the blow (no energy spray);
  // RONIN #1: chunks thrown along the smash as before
  const fin = _fin[idx], fan = idx === 2 && fin.imp ? { dir: fin.imp, side: V.norm([0, 0, 0], V.cross([0, 0, 0], fin.imp, [0, 1, 0])), spread: 55 * Math.PI / 180 } : null;
  shatter(R, 'enemy_ms', fin.m, tt, t0, idx === 2 ? 88 : 77, [3, 4, 3], idx === 2 ? 2.6 : 3.2, { tint: [2, 0.4, 0.3], pose: fin.pose, texSet: R.texLoaded & 4 ? 2 : 0, impulse: fan ? null : fin.imp, impulseK: 2.6, fan });
}
// VANGUARD's shield, torn off its forearm by Sigma's shot (SHIELD_HIT_T): the same model with only the shield part shown,
// frozen in the pose it had at the hit, tumbling about the hit point and drifting off along the shot
const _wing = {}, _wT = new Float32Array(16), _wA = new Float32Array(16), _wB = new Float32Array(16), _wQ = [0, 0, 0, 1];
// its rifle, flung away as it opens up for the ultimate: the rifle part alone, frozen at the release, spinning off
const RIFLE_DROP_T = 190.8, _rif = {}, _rT = new Float32Array(16), _rA = new Float32Array(16), _rB = new Float32Array(16), _rQ = [0, 0, 0, 1];
// VANGUARD's rifle (assets/rifle2_game.glb) drawn on the rifle part of an enemy_ms pose (m, pose); `pre` shifts it in world
function enemyRifleAt(R, m, pose, pre) {
  const r = pose.rifle || [0, 0, 0], hw = R.partWorld('enemy_ms', { m, pose, stretch: 0 }, 'hand_R');   // on its fist through the same grip frame as duel.js (ENEMY_HOLE)
  const rw = M.mul(new Float32Array(16), hw, M.fromTRS(new Float32Array(16), ENEMY_HOLE, Q.fromEuler([0, 0, 0, 1], r[0], r[1], r[2]), 1));
  const g = R.add('enemy_rifle', pre ? M.mul(new Float32Array(16), pre, rw) : rw);
  if (g) { g.seed = 10; g.wear = 0.4; g.texSet = R.texLoaded & 64 ? 4 : 0; }
  return g;
}
function drawDroppedRifle(R, t) {
  if (!_rif.m) {
    const s0 = enemyMS2(RIFLE_DROP_T), s1 = enemyMS2(RIFLE_DROP_T + 0.05);
    _rif.m = msMatrix(new Float32Array(16), s0); _rif.pose = JSON.parse(JSON.stringify(s0.pose));
    const fk = duelFK(s0, 'enemy_ms'); _rif.pivot = M.transformPoint([0, 0, 0], fk.rifle, [0, 0, 0]);
    const vs = V.scale([0, 0, 0], V.sub([0, 0, 0], s1.pos, s0.pos), 1 / 0.05), side = V.norm([0, 0, 0], V.sub([0, 0, 0], _rif.pivot, s0.pos));
    _rif.v = V.madd([0, 0, 0], V.madd([0, 0, 0], vs, side, 9), [0, 1, 0], -3);
    _rif.hide = {}; for (const p of R.models.enemy_ms.parts) if (p.name !== 'rifle') _rif.hide[p.name] = 1;
  }
  const lt = t - RIFLE_DROP_T; if (lt < 0 || lt > 8) return;
  const P = _rif.pivot, d = V.madd([0, 0, 0], P, _rif.v, lt);
  M.fromTRS(_rT, [-P[0], -P[1], -P[2]], [0, 0, 0, 1], 1);
  M.mul(_rA, _rT, _rif.m);
  Q.fromEuler(_rQ, lt * 1.4, lt * 0.5, -lt * 2.1);
  M.fromTRS(_rB, d, _rQ, 1);
  enemyRifleAt(R, M.mul(new Float32Array(16), _rB, _rA), _rif.pose);
}
// the block (his 178.7 shot on the shield): no hole — the face is scorched black round the splash (renderer damage
// sphere on the shield part only), with glowing cracks cooling in it
function shieldScorch(e, t) {
  const B = BLOCK_SPOT(), lt = t - B.t - 0.01; if (lt < 0) return;   // (the line reaches it ~8 ms after the event)
  const g = easeOut(sat(lt / 0.15));
  const P = blockPath(), a0 = P.length ? P[0].local : blockLocalAt(t), a1 = blockLocalAt(t), mid = [0, 1, 2].map((i) => (a0[i] + a1[i]) / 2);
  e.dmgC = mid; e.dmgR = 1.5 * (0.3 + 0.7 * g) + 0.5 * Math.hypot(a1[1] - a0[1], a1[2] - a0[2]);   // the soot over the whole swept track (it stays) e.dmgPart = 'shield'; e.damage = Math.max(e.damage || 0, 0.55 * g);   // patchy soot, cracks glowing
}
// …and the shot's energy spreads out over its face from the hit in every direction and dies away: a ragged ring
// racing out across the plate, radial pixel streaks skating flat along it, motes shed from the front fading behind
const _sparkPts = new Map();   // the contact point at each spark burst's birth (block shot)
function drawBlockSplash(R, t) {
  const B = BLOCK_SPOT(), lt = t - B.t - 0.01; if (lt < 0 || lt > 1.8) return;
  const F = blockFrame(t); if (!F) return;
  const sh = DUEL_SHOTS.find((x) => x.block), sdir = sh ? V.norm([0, 0, 0], V.sub([0, 0, 0], sh.to, sh.from)) : F.up;
  const nF = V.dot(F.n, sdir) > 0 ? V.scale([0, 0, 0], F.n, -1) : F.n;   // the struck face's normal, toward the shooter (not into the plate)
  const sd = V.norm([0, 0, 0], V.cross([0, 0, 0], nF, F.up));
  const onFace = (a, r, lift = 0.1) => madd(madd(madd(F.p, F.up, r * Math.cos(a)), sd, r * Math.sin(a)), nF, lift + 0.55);   // (+0.55: clear of the enlarged plate's face)
  // the shot's line skimmed onto the plate: the energy it carries goes skating off along the face that way
  let sk = V.sub([0, 0, 0], sdir, V.scale([0, 0, 0], nF, V.dot(sdir, nF))); sk = V.len(sk) > 1e-3 ? V.norm([0, 0, 0], sk) : F.up;
  const ska = Math.atan2(V.dot(sk, sd), V.dot(sk, F.up));
  // 1. the struck spot glowing: white-hot, cooling through yellow and orange to a dull red
  const heat = sat(lt / 0.03) * Math.exp(-lt * 1.6), hw = sat(heat * 1.6);
  if (heat > 0.01) {
    R.glow(onFace(0, 0, 0.15), 1.6 + 1.2 * heat, [6 * heat, (0.9 + 1.6 * hw) * heat, (0.05 + 0.5 * hw * hw) * heat], 0.2);   // the glowing patch (red-orange so it reads on the white plate)
    R.glow(onFace(0, 0, 0.15), 0.8 + 0.8 * heat, [6 * heat * hw, 4.5 * heat * hw, 2.5 * heat * hw], 0.15);
    if (lt < 0.4) R.light(F.p, 24, [1, 0.55, 0.25], 3 * heat);
  }
  // 2. the energy skating off across the plate along the shot's line: crackling arcs racing out to the edge
  const on = sat(lt / 0.02) * (1 - sat((lt - 0.12) / 0.35));
  if (on > 0.01) {
    for (let j = 0; j < 4; j++) {
      const L = Math.min(7, 1 + 45 * lt) * (0.7 + 0.3 * hash(j + 800)), a0 = ska + (hash(j + 801) - 0.5) * 0.7;
      const a1 = a0 + (hash(j + 802) - 0.5) * 0.35, pA = onFace(a0, 0.3), pB = onFace(a1, L);
      R.arc(pA, pB, 0.45, [0.6, 1.6, 3], 1.1 * on, 820 + j, 14);
    }
    R.beam(onFace(ska, 0.2), onFace(ska, Math.min(7, 1 + 45 * lt)), 0.45, [0.35 * on, 0.9 * on, 1.5 * on], 1, 8, 1.2, 1.5);   // the smeared energy under the arcs
  }
  // 3. a ring of crackling energy round the struck spot, spreading and crawling round over the plate
  const rr = 0.6 + 3.2 * easeOut(sat(lt / 0.5)), rk = sat(lt / 0.03) * (1 - sat((lt - 0.25) / 0.8));
  if (rk > 0.01) {
    const N = 12, spin = lt * 3.2;
    for (let i = 0; i < N; i++) {
      if (hash(i * 3.7 + Math.floor(lt * 30)) < 0.25) continue;   // flickering: segments dropping in and out
      const a0 = spin + (i / N) * 2 * Math.PI, a1 = spin + ((i + 1) / N) * 2 * Math.PI;
      const j0 = 1 + 0.2 * (hash(i + 840 + Math.floor(lt * 24)) - 0.5), j1 = 1 + 0.2 * (hash(((i + 1) % N) + 840 + Math.floor(lt * 24)) - 0.5);
      R.arc(onFace(a0, rr * j0), onFace(a1, rr * j1), 0.35, [0.7, 1.7, 3.2], 1.0 * rk, 860 + i, 18);
    }
    for (let i = 0; i < 5; i++) {                                   // spokes from the spot out to the ring
      const a = spin * 0.6 + i * 1.2566 + 0.3 * hash(i + 870);
      R.arc(onFace(a, 0.3), onFace(a, rr * 0.95), 0.28, [0.8, 1.8, 3.2], 0.7 * rk, 880 + i, 20);
    }
  }
  // 7. SPARKS (2026-10-05): all the while the beam drags across the plate, showers of sparks spray off the contact point —
  //    a fresh burst every 6 ms of story (the burn plays in deep bullet time: ~1 per film frame), thrown off the face and
  //    back along the drag, white-hot cooling to orange; each burst stays where it was born (they trail the moving point)
  { const c0 = B.t + 0.012, c1 = B.t + 0.26, dt = 0.006, life = 0.11;
    for (let te = c0; te <= Math.min(t, c1); te += dt) {
      const ls = t - te; if (ls > life) continue;
      const k = Math.round((te - c0) / dt); let hp = _sparkPts.get(k);
      if (!hp) { const h = blockHitAt(te); hp = h ? h.p : F.p; _sparkPts.set(k, hp); }
      const dir = V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], nF, 0.85), V.scale([0, 0, 0], sk, -0.55)));
      sparkBurst(R, madd(hp, nF, 0.6), dir, ls, 3100 + k * 7, 70, 0.95, 95, life, [6, 3.6, 1.3]);            // the hot core of the spray
      sparkBurst(R, madd(hp, nF, 0.6), nF, ls, 5100 + k * 11, 45, 1.6, 55, life * 1.4, [4.5, 1.7, 0.35]);    // a wide fan of slower orange ones
      if (ls < 0.025) R.glow(madd(hp, nF, 0.6), 3.2, [5, 3.2, 1.4], 0.3);   // the flash where each burst leaves
    }
  }
  // 6. the gouge the beam dragged across the plate: the track (kept in the shield's frame, so it rides with it) glowing
  //    white-hot where it's fresh, cooling to red behind
  { const P = blockPath();
    let pa = null, ta = 0;
    for (const x of P) {
      if (x.t > t) break;
      const q = madd(M.transformPoint([0, 0, 0], F.S, x.local), nF, 0.6);
      if (pa) { const age = t - x.t, hh = Math.exp(-age * 2.5) * (1 - smooth(0.12, 0.4, age)), w2 = sat(hh * 1.6);   // each bit cools from when it was hit: the first-struck end goes out first
        if (hh > 0.02) R.beam(pa, q, 0.35 + 0.25 * hh, [4 * hh, (0.6 + 2.2 * w2) * hh, (0.1 + 1.2 * w2 * w2) * hh], 0.35, 5, 0, 0.3); }
      pa = q; ta = x.t;
    } }
  // 5. sparks spitting off the struck spot while it's hot — laid out in the plate's own frame, so they ride with the shield
  for (let i = 0; i < 70; i++) {
    const born = 0.6 * hash(i + 950), L = 0.12 + 0.2 * hash(i + 951), sl = lt - born; if (sl < 0 || sl > L || born > 0.05 + 1.2 * heat) continue;
    const a = 2 * Math.PI * hash(i + 952), v = 8 + 14 * hash(i + 953), up = 0.3 + 1.2 * hash(i + 954), r = v * sl, h = up * v * sl;
    const q = madd(onFace(a, 0.2 + r, 0.15), nF, h), q0 = madd(onFace(a, 0.2 + Math.max(0, r - 0.5), 0.15), nF, Math.max(0, h - 0.5 * up));
    const b = (1 - sl / L) * 3;
    streak(R, q0, q, [b * 1.6, b * 1.0, b * 0.35]);
  }
  // 4. a few motes shed off the ring, fading
  for (let i = 0; i < 40; i++) {
    const born = 0.02 + 0.5 * hash(i + 900), L = 0.4 + 0.5 * hash(i + 901), ml = lt - born; if (ml < 0 || ml > L) continue;
    const a = 2 * Math.PI * hash(i + 902), r0 = 0.6 + 3.2 * easeOut(sat(born / 0.5)), q = madd(onFace(a, r0 + 1.2 * ml), nF, 0.2 + 1.5 * ml);
    const k = (1 - ml / L) * (0.7 + 0.3 * Math.sin(t * 25 + i));
    R.glow(q, 0.14 + 0.1 * hash(i + 903), [0.8 * k, 2.4 * k, 3.8 * k], 0.2);
  }
}
// THE BLOCK: the shield unfolds to twice its size as it comes up (long axis first, then its width), holds, folds back —
// drawn as a shield-only copy scaled about its face centre in its own frame (the real one hidden meanwhile)
const SHIELD_FACE = [1.351, -2.337, 0.17];
const _bsA = new Float32Array(16), _bsB = new Float32Array(16), _bsS = new Float32Array(16), _bsI = new Float32Array(16), _bsM = new Float32Array(16);
let _bsHide = null;
function drawBigShield(R, e, s, t) {
  const { sy, sz } = bigShieldScale(t); if (sy < 1.002 && sz < 1.002) return;   // (duel.js: it racks out in clunky steps)
  if (!_bsHide) { _bsHide = {}; for (const p of R.models.enemy_ms.parts) if (p.name !== 'shield') _bsHide[p.name] = 1; }
  e.hidden = { ...(e.hidden || {}), shield: 1 };
  const Ms = R.partWorld('enemy_ms', e, 'shield');
  M.fromTRS(_bsA, SHIELD_FACE, [0, 0, 0, 1], 1);
  M.identity ? M.identity(_bsS) : _bsS.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  _bsS[0] = 1 + 0.3 * (sy - 1); _bsS[5] = 1 + (sy - 1); _bsS[10] = 1 + (sz - 1);   // (thickness a little, long axis and width ×2)
  M.fromTRS(_bsB, [-SHIELD_FACE[0], -SHIELD_FACE[1], -SHIELD_FACE[2]], [0, 0, 0, 1], 1);
  M.mul(_bsM, Ms, M.mul(new Float32Array(16), _bsA, M.mul(new Float32Array(16), _bsS, _bsB)));   // the shield's scaled world matrix
  M.invert(_bsI, Ms);
  const Mc = M.mul(new Float32Array(16), _bsM, M.mul(new Float32Array(16), _bsI, e.m));           // the copy's model matrix
  const c = R.add('enemy_ms', Mc); if (!c) return;
  c.pose = e.pose; c.hidden = _bsHide; c.seed = e.seed; c.wear = 1; c.texSet = e.texSet; c.matOverride = e.matOverride;
  shieldScorch(c, t);
}
function drawLostShield(R, t) {
  const t0 = SHIELD_HIT_T + 0.03;
  if (!_wing.m) {
    const s0 = enemyMS2(t0), s1 = enemyMS2(t0 + 0.05), ev = DUEL_EVENTS.find((e) => Math.abs(e.t - t0) < 1e-6);
    _wing.m = msMatrix(new Float32Array(16), s0); _wing.pose = JSON.parse(JSON.stringify(s0.pose));
    _wing.pivot = ev ? ev.pos : s0.pos;
    const vs = V.scale([0, 0, 0], V.sub([0, 0, 0], s1.pos, s0.pos), 1 / 0.05), sd = ev && ev.shotDir ? ev.shotDir : [0, 0, 1];
    _wing.v = V.madd([0, 0, 0], V.madd([0, 0, 0], vs, sd, 22), [0, 1, 0], 4);
    _wing.hide = {}; for (const p of R.models.enemy_ms.parts) if (p.name !== 'shield') _wing.hide[p.name] = 1;
  }
  const lt = t - t0; if (lt < 0 || lt > 8) return;
  const P = _wing.pivot, d = V.madd([0, 0, 0], P, _wing.v, lt);
  M.fromTRS(_wT, [-P[0], -P[1], -P[2]], [0, 0, 0, 1], 1);
  M.mul(_wA, _wT, _wing.m);
  Q.fromEuler(_wQ, lt * 2.6, lt * 1.1, lt * 3.4);
  M.fromTRS(_wB, d, _wQ, 1);
  const w = R.add('enemy_ms', M.mul(new Float32Array(16), _wB, _wA));
  if (!w) return;
  w.pose = _wing.pose; w.hidden = _wing.hide; w.seed = 10; w.wear = 1; w.texSet = R.texLoaded & 4 ? 2 : 0;
  w.damage = 0.6; meltHole(w, 'enemy', t, 'shield'); shieldScorch(w, t);
  if (lt < 3) R.light(V.madd([0, 0, 0], P, _wing.v, lt), 30, [1, 0.5, 0.2], 4 * Math.exp(-lt * 2));   // the burnt mount glowing hot for a moment
}
// cut in half at the waist (CUT_T): two copies, the torso part clipped clean at the cut line (a glowing, molten edge);
// the upper half is carried on along his swing and turns over, the lower drifts back and tumbles the other way
const LOWER = { pelvis: 1, leg_L_upper: 1, leg_L_lower: 1, foot_L: 1, leg_R_upper: 1, leg_R_lower: 1, foot_R: 1, arm_L_lower: 1, hand_L: 1, arm_R_lower: 1, hand_R: 1 };
const SPLIT = { torso: 1, arm_L_upper: 1, arm_R_upper: 1 };   // cut through: drawn in both halves, each clipped to its side (the arms hang along its body: cut with it)
const _hT = new Float32Array(16), _hA = new Float32Array(16), _hB = new Float32Array(16), _hQ = [0, 0, 0, 1], _hM = new Float32Array(16);
// each half comes apart on its own: the lower half (hips + legs) breaks up first, then the upper half's reactor goes —
// each shatters into chunks along its own drift with its own blast (duel audio: HALF_BLAST times)
export const HALF_BLAST = { lower: 193.6, upper: 194.0 };
function halfMatrix(out, s, half, lt) {
  const ev = DUEL_EVENTS.find((x) => x.slash), P = ev.pos, d = ev.dir;
  const sep = easeOut(sat(lt / 1.2)) * 1.0 + lt * 0.8;               // they part slowly (it all happens in the slow beat)
  const off = V.madd([0, 0, 0], V.scale([0, 0, 0], d, half * 1.6 * sep), [0, 1, 0], half * 1.2 * sep);
  M.fromTRS(_hT, [-P[0], -P[1], -P[2]], [0, 0, 0, 1], 1);
  M.mul(_hA, _hT, msMatrix(_hM, s));
  Q.fromEuler(_hQ, half * 0.35 * lt, half * 0.2 * lt, -half * 0.3 * lt);
  M.fromTRS(_hB, V.add([0, 0, 0], P, off), _hQ, 1);
  return M.mul(out, _hB, _hA);
}
/** world centre of a half (for its blast), at story time t */
export function halfCentre(t, half) {
  const s = enemyMS2(Math.min(t, 194.15)); if (!s) return null;
  const m = halfMatrix(new Float32Array(16), s, half, Math.max(0, t - CUT_SPLIT));
  return M.transformPoint([0, 0, 0], m, [0, half > 0 ? 14.5 : 7, 0]);
}
const _halfM = { 1: new Float32Array(16), [-1]: new Float32Array(16) };
// the blade's plane (its torso-local y = CUT_Y at CUT_T) carried into EVERY part's own frame: whatever it passes through
// — torso, arms, the backpack and its boosters, anything — is cut; each half keeps its own side of it
let _cutPlanes = null;
function cutPlanes(R) {
  if (_cutPlanes) return _cutPlanes;
  const model = R.models.enemy_ms; if (!model) return null;
  const s0 = enemyMS2(CUT_T); if (!s0) return null;
  const ent = { m: msMatrix(new Float32Array(16), s0), pose: s0.pose, stretch: 0 }, W = {};
  R._partMatrices(model, ent);
  model.parts.forEach((p, i) => { W[p.name] = Float32Array.from(model.partWorld[i]); });
  const tp = [[0, CUT_Y, 0], [1, CUT_Y, 0], [0, CUT_Y, 1]].map((q) => M.transformPoint([0, 0, 0], W.torso, q));
  const upW = M.transformPoint([0, 0, 0], W.torso, [0, CUT_Y + 1, 0]);
  _cutPlanes = {};
  for (const p of model.parts) {
    if (p.name === '__root' || p.name === 'ms_root') continue;
    const inv = M.invert(M.new(), W[p.name]), [a, b, c] = tp.map((q) => M.transformPoint([0, 0, 0], inv, q)), u = M.transformPoint([0, 0, 0], inv, upW);
    let n = V.norm([0, 0, 0], V.cross([0, 0, 0], V.sub([0, 0, 0], b, a), V.sub([0, 0, 0], c, a)));
    if (V.dot(n, V.sub([0, 0, 0], u, a)) < 0) n = V.scale(n, n, -1);   // (+n: toward the upper half)
    _cutPlanes[p.name] = [n[0], n[1], n[2], V.dot(n, a)];
  }
  return _cutPlanes;
}
// the blade's first touch: from here the two halves are drawn in place (lt = 0) so the melt band runs along the real armour
const CUT_SEAM_T = CUT_T - 0.03;   // (the halves are drawn from before the blade arrives: its front and its touch decide what glows)
const CUT_LEAD = 0.3;   // m: the melt front runs this far ahead of the blade's centre line (its glowing width + the drawn hilt's offset)
// the blade going through (until CUT_SPLIT): a point on it and the way it moves through VANGUARD (relative to its torso,
// square to the blade) — the cut melts open only behind that front (shader: plane-cut front), not all at once
let _bfT = null, _bf = null;
function bladeFront(t) {
  if (t >= CUT_SPLIT) return null;
  if (_bfT === t) return _bf;
  const at = (x) => { const h = duelHero(x), e = duelEnemy2(x); if (!h || !e) return null; const H = duelFK({ ...h, saber: 1 }, 'gundam'), E = duelFK(e, 'enemy_ms'); return { p: madd(H.saber[0], H.saber[2], 6.5), d: H.saber[2], h: H.saber[0], tip: madd(H.saber[0], H.saber[2], 13), o: [E.torso[12], E.torso[13], E.torso[14]] }; };
  const a = at(t), b = at(t + 0.002); _bfT = t;
  if (!a || !b) return (_bf = null);
  let v = V.sub([0, 0, 0], V.sub([0, 0, 0], b.p, a.p), V.sub([0, 0, 0], b.o, a.o)); v = madd(v, a.d, -V.dot(v, a.d));
  return (_bf = V.len(v) > 1e-6 ? { p: a.p, v: V.norm([0, 0, 0], v), a: a.h, b: a.tip } : null);
}
function drawHalves(R, t, s) {
  const ev = DUEL_EVENTS.find((x) => x.slash), P = ev.pos, lt = s.cutK;
  const up = R.models.enemy_ms.parts, hideUp = {}, hideLo = {};
  for (const p of up) { if (LOWER[p.name]) hideUp[p.name] = 1; else if (!SPLIT[p.name]) hideLo[p.name] = 1; }   // (the break-up chunks)
  const CP = cutPlanes(R), flip = (q) => [-q[0], -q[1], -q[2], -q[3]];
  for (const half of [1, -1]) {
    const tb = half > 0 ? HALF_BLAST.upper : HALF_BLAST.lower;
    const hide = { ...(half > 0 ? hideUp : hideLo), shield: 1, rifle: 1 };
    if (t >= tb) {                                                    // this half has come apart: its chunks fly off its drift
      const sb = enemyMS2(tb) || s;
      halfMatrix(_halfM[half], sb, half, tb - CUT_SPLIT);
      shatter(R, 'enemy_ms', _halfM[half], t, tb, half > 0 ? 91 : 57, half > 0 ? [3, 3, 3] : [2, 3, 2], 2.4,
        { tint: [2, 0.4, 0.3], pose: sb.pose, texSet: R.texLoaded & 4 ? 2 : 0, hidden: hide });
      continue;
    }
    const e = R.add('enemy_ms', halfMatrix(new Float32Array(16), s, half, lt));
    if (!e) continue;
    e.pose = s.pose; e.seed = 10; e.wear = 1; e.texSet = R.texLoaded & 4 ? 2 : 0; e.damage = s.damage;
    e.hidden = CP ? (half > 0 ? { shield: 1, rifle: 1, pelvis: 1, leg_L_upper: 1, leg_L_lower: 1, foot_L: 1, leg_R_upper: 1, leg_R_lower: 1, foot_R: 1 } : { shield: 1, rifle: 1 }) : hide;   // every part drawn in both halves, each clipped to its side of the blade's plane (the hips and legs, wholly below it, only in the lower)
    if (half < 0 || !CP) meltHole(e, 'enemy', t, 'leg_R_upper');   // (the melt hole replaces that part's clip: the lower half only)
    e.clipInv = false; e.clipHeat = -(0.5 + 1.6 * Math.exp(-lt * 1.0)) * (0.35 + 0.65 * sat((t - CUT_SEAM_T) / (CUT_SPLIT - CUT_SEAM_T)));   // the molten rim of the cut: thick, white-hot, cooling to red (shader band; w < 0: a clean beam cut)
    if (CP) {
      e.clipParts = {}; for (const k in CP) e.clipParts[k] = half > 0 ? CP[k] : flip(CP[k]);
      const BF = bladeFront(t);
      if (BF && half > 0) ctx.env.blade = { a: BF.a, b: BF.b, r: 0.5 };   // (the shader: whatever it touches glows)
      if (BF) for (const k in e.clipParts) {                         // melted only behind the blade (each part in its own frame)
        const n = e.clipParts[k], W = R.partWorld('enemy_ms', e, k); if (!W) continue;
        const inv = M.invert(M.new(), W), pl = M.transformPoint([0, 0, 0], inv, BF.p);
        let vl = M.transformDir([0, 0, 0], inv, BF.v); vl = madd(vl, n, -V.dot(vl, n));
        if (V.len(vl) < 1e-6) continue; vl = V.norm([0, 0, 0], vl);
        const b1 = V.norm([0, 0, 0], V.cross([0, 0, 0], n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), b2 = V.cross([0, 0, 0], n, b1);
        const ang = Math.atan2(V.dot(vl, b2), V.dot(vl, b1)), f = madd(V.scale([0, 0, 0], b1, Math.cos(ang)), b2, Math.sin(ang));
        e.clipParts[k] = [n[0], n[1], n[2], n[3], ang, V.dot(pl, f) + CUT_LEAD];   // (led by the blade's own width: where it has gone in is already molten)
      }
    }
    else { const CA = cutArms(), box = (y) => (half > 0 ? [-30, y, -30, 30, 40, 30] : [-30, -40, -30, 30, y, 30]); e.clipParts = { torso: box(CUT_Y), arm_L_upper: box(CA.arm_L_upper), arm_R_upper: box(CA.arm_R_upper) }; }
  }
  if (t < HALF_BLAST.upper) R.light(P, 40, [1, 0.45, 0.2], 6 * Math.exp(-lt * 1.5));   // the molten cut glows
  return null;
}
// ---- THE CUT, frame by frame (extreme bullet time, CUT_T−0.04 → CUT_SPLIT): the torso's waist section is an ellipse
// (torso-local, from the mesh bounds); the blade line crosses it as a chord that sweeps through. Where the chord meets the
// armour, the cut edge glows white → orange and cools behind it, molten metal sprays off both ends, and crimson armour
// plates cut loose are flung out along the swing. All motion in story seconds (the picture runs at 1/40 here).
const CUT_E = { cx: 0, cz: 0.43, rx: 1.27, rz: 1.53 };   // section at CUT_Y (torso local, measured from the mesh: x ±1.26, z −1.09…1.96)
let _cutPath = null;
function cutPath() {   // sampled once: per story time, the chord's two ends as ellipse angles (NaN = not in contact)
  if (_cutPath) return _cutPath;
  const out = [];
  for (let tt = CUT_T - 0.06; tt <= CUT_SPLIT + 0.004; tt += 0.002) {
    const h = duelHero(tt), e = duelEnemy2(tt); if (!h || !e) continue;
    const H = duelFK({ ...h, saber: 1 }, 'gundam'), E = duelFK(e, 'enemy_ms'), inv = M.invert(M.new(), E.torso);
    const a = M.transformPoint([0, 0, 0], inv, H.saber[0]), b = M.transformPoint([0, 0, 0], inv, madd(H.saber[0], H.saber[2], 12.9));
    // chord of the blade (projected onto the section plane) with the ellipse: solve |(p − c)/r| = 1 along a → b
    const ax = (a[0] - CUT_E.cx) / CUT_E.rx, az = (a[2] - CUT_E.cz) / CUT_E.rz, dx = (b[0] - a[0]) / CUT_E.rx, dz = (b[2] - a[2]) / CUT_E.rz;
    const A = dx * dx + dz * dz, B = 2 * (ax * dx + az * dz), Cc = ax * ax + az * az - 1, D = B * B - 4 * A * Cc;
    let th = null;
    if (D > 0) { const s1 = (-B - Math.sqrt(D)) / (2 * A), s2 = (-B + Math.sqrt(D)) / (2 * A);
      if (s2 > 0 && s1 < 1) { const ang = (s) => Math.atan2(az + dz * s, ax + dx * s); th = [ang(Math.max(0, s1)), ang(Math.min(1, s2)), Math.max(0, s1) > 0, Math.min(1, s2) < 1]; } }
    out.push({ t: tt, th });
  }
  const first = out.find((q) => q.th);
  _cutPath = { out, first };
  return _cutPath;
}
const _secP = (th, lift = 0) => [CUT_E.cx + Math.cos(th) * CUT_E.rx * 1.01, CUT_Y + lift, CUT_E.cz + Math.sin(th) * CUT_E.rz * 1.01];
// THE CUT, from the real geometry (2026-10-03): the torso mesh sliced by the cut plane gives the true outline of its waist;
// the blade (a segment, hilt → tip, carried into the torso's frame) is swept through it frame by frame, and every point
// of the outline melts at the moment the blade actually crosses it — the molten line runs exactly behind the blade,
// white where it is cutting now and cooling behind; the spray leaves from where the blade meets the armour right now
let _sec = null;
function cutSection(R) {
  if (_sec) return _sec;
  const g = R.models.enemy_ms && R.models.enemy_ms.geo; if (!g) return null;
  const part = g.parts.find((p) => p.name === 'torso'); if (!part) return null;
  const V8 = (v) => [g.verts[v * 8], g.verts[v * 8 + 1], g.verts[v * 8 + 2]], segs = [];
  for (const gr of part.groups) for (let k = gr.first; k + 2 < gr.first + gr.count; k += 3) {
    const P = [V8(g.indices[k]), V8(g.indices[k + 1]), V8(g.indices[k + 2])], pts = [];
    for (let e = 0; e < 3; e++) { const a = P[e], b = P[(e + 1) % 3], da = a[1] - CUT_Y, db = b[1] - CUT_Y;
      if ((da < 0) !== (db < 0)) { const u = da / (da - db); pts.push([a[0] + (b[0] - a[0]) * u, CUT_Y, a[2] + (b[2] - a[2]) * u]); } }
    if (pts.length === 2) segs.push(pts);
  }
  // the blade through the section, sampled in story time: (hilt, tip) in the torso's frame
  const blade = [];
  for (let tt = CUT_T - 0.06; tt <= CUT_SPLIT + 0.0001; tt += 0.0005) {
    const h = duelHero(tt), e = duelEnemy2(tt); if (!h || !e) continue;
    const H = duelFK({ ...h, saber: 1 }, 'gundam'), E = duelFK(e, 'enemy_ms'), inv = M.invert(M.new(), E.torso);
    blade.push({ t: tt, a: M.transformPoint([0, 0, 0], inv, H.saber[0]), b: M.transformPoint([0, 0, 0], inv, madd(H.saber[0], H.saber[2], 13)) });
  }
  // when the blade crosses a point q (x, z on the plane): the side of the blade line changes while q lies within its length
  const side = (bl, q) => { const dx = bl.b[0] - bl.a[0], dz = bl.b[2] - bl.a[2]; return dx * (q[2] - bl.a[2]) - dz * (q[0] - bl.a[0]); };
  const within = (bl, q) => { const dx = bl.b[0] - bl.a[0], dz = bl.b[2] - bl.a[2], L2 = dx * dx + dz * dz, s = ((q[0] - bl.a[0]) * dx + (q[2] - bl.a[2]) * dz) / L2; return s >= -0.02 && s <= 1.02; };
  // (the front is led by CUT_LEAD: the side test is taken against the blade line moved that far the way it is going)
  const nside = (bl, q, sg) => { const dx = bl.b[0] - bl.a[0], dz = bl.b[2] - bl.a[2]; return side(bl, q) / Math.hypot(dx, dz) - sg * CUT_LEAD; };
  const sgn = (() => { const b0 = blade[0], b1 = blade[blade.length - 1], m = [(b1.a[0] + b1.b[0]) / 2, 0, (b1.a[2] + b1.b[2]) / 2]; return side(b0, m) > 0 ? 1 : -1; })();   // which side the blade moves toward
  const passT = (q) => { for (let i = 1; i < blade.length; i++) { const s0 = nside(blade[i - 1], q, sgn), s1 = nside(blade[i], q, sgn); if ((s0 < 0) !== (s1 < 0) && within(blade[i], q)) return blade[i - 1].t + (blade[i].t - blade[i - 1].t) * s0 / (s0 - s1); } return Infinity; };
  const pieces = [];   // each outline segment split finely, with the moment its two ends were cut
  for (const [a, b] of segs) { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.25)); for (let i = 0; i < n; i++) { const p = lerpv(a, b, i / n), q = lerpv(a, b, (i + 1) / n); pieces.push({ p, q, tp: passT(p), tq: passT(q) }); } }
  return (_sec = { segs, blade, pieces });
}
/** dev: the waist section and the blade's crossing times (see cutSection) */
export const cutSectionInfo = (R) => { const S = cutSection(R); if (!S) return null; const xs = S.segs.flat(); const fin = S.pieces.filter((p) => isFinite(p.tp)); return { segs: S.segs.length, x: [Math.min(...xs.map((p) => p[0])), Math.max(...xs.map((p) => p[0]))], z: [Math.min(...xs.map((p) => p[2])), Math.max(...xs.map((p) => p[2]))], pieces: S.pieces.length, cut: fin.length, t: [Math.min(...fin.map((p) => p.tp)), Math.max(...fin.map((p) => p.tp))] }; };
function drawCutDetail(R, t) {
  if (t < CUT_T - 0.06 || t > CUT_SPLIT + 1.2) return;
  const SEC = cutSection(R); if (!SEC) return;
  const e = duelEnemy2(Math.min(t, CUT_SPLIT)); if (!e || !e.vis) return;
  const E = duelFK(e, 'enemy_ms'), TW = (p) => M.transformPoint([0, 0, 0], E.torso, p);
  const live = t < CUT_SPLIT;
  // the melt line, from where the blade is NOW (no timing): every piece of the outline its line has already gone past is
  // molten — white-hot right at the blade, cooling to orange-red the further behind it lies
  let cur = null;
  if (live) {
    const at = (x) => { const h = duelHero(x), e2 = duelEnemy2(x); if (!h || !e2) return null; const H = duelFK({ ...h, saber: 1 }, 'gundam'), inv = M.invert(M.new(), duelFK(e2, 'enemy_ms').torso);
      return { a: M.transformPoint([0, 0, 0], inv, H.saber[0]), b: M.transformPoint([0, 0, 0], inv, madd(H.saber[0], H.saber[2], 13)) }; };
    const b0 = at(t), b1 = at(t + 0.002);
    if (b0 && b1) {
      const dx = b0.b[0] - b0.a[0], dz = b0.b[2] - b0.a[2], L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;   // the blade line's normal in the plane
      const mid1 = [(b1.a[0] + b1.b[0]) / 2, (b1.a[2] + b1.b[2]) / 2], sg = Math.sign(nx * (mid1[0] - b0.a[0]) + nz * (mid1[1] - b0.a[2])) || 1;
      cur = { b0, sd: (q) => sg * (nx * (q[0] - b0.a[0]) + nz * (q[2] - b0.a[2])) };   // > 0: ahead of the blade (not reached)
    }
  }
  if (cur) for (const pc of SEC.pieces) {
    const dp = cur.sd(pc.p) - CUT_LEAD, dq = cur.sd(pc.q) - CUT_LEAD; if (dp > 0 && dq > 0) continue;
    let p = pc.p, q = pc.q;
    if (dp > 0) p = lerpv(pc.q, pc.p, -dq / (dp - dq)); else if (dq > 0) q = lerpv(pc.p, pc.q, -dp / (dq - dp));   // (cut off exactly at the blade)
    const k = Math.exp(-Math.max(0, -Math.max(dp, dq)) / 1.2) * 0.85 + 0.25;   // white at the blade, cooling behind it
    const pa = TW(p), pb = TW(q);
    R.beam(pa, pb, 0.22, [1.9 * k + 1.1, 0.75 * k * k + 0.22, 0.12 * k * k + 0.02], 1, 8);
    R.beam(pa, pb, 0.6, [0.5 * k + 0.3, 0.08 * k + 0.03, 0.01], 0.35, 2);
  }
  // where the blade meets the armour now: its segment against the outline — molten spray leaves from each crossing
  if (live) {
    const bl = cur ? cur.b0 : null, hits = []; if (!bl) return;   // (the blade where it is now)
    for (const [a, b] of SEC.segs) {
      const r = [bl.b[0] - bl.a[0], bl.b[2] - bl.a[2]], sv = [b[0] - a[0], b[2] - a[2]], den = r[0] * sv[1] - r[1] * sv[0]; if (Math.abs(den) < 1e-9) continue;
      const wx = a[0] - bl.a[0], wz = a[2] - bl.a[2], u = (wx * sv[1] - wz * sv[0]) / den, v = (wx * r[1] - wz * r[0]) / den;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) hits.push([a[0] + sv[0] * v, CUT_Y, a[2] + sv[1] * v]);
    }
    hits.sort((x, y) => x[0] - y[0]);
    const ends = hits.length > 2 ? [hits[0], hits[hits.length - 1]] : hits;   // (the outermost entry and exit)
    ends.forEach((hp, side) => {
      const pw = TW(hp), out = V.norm([0, 0, 0], V.sub([0, 0, 0], pw, TW([0, CUT_Y, 0.43])));
      R.glow(pw, 0.4, [2.4, 1.2, 0.4], 0.2); R.light(pw, 14, [1, 0.5, 0.2], 1.2);
      for (let i = 0; i < 450; i++) {                                               // molten metal thrown off in round gobbets, story-fast
        const life = 0.012 + hash(i + side * 5000) * 0.035, ph = ((t / life) + hash(i + 3 + side * 5000)) % 1;
        const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 3.1 + side * 7 + Math.floor(t / life) * 0.37), out, 1.4), D_SWEEP(), 0.8));
        const sp = life * (140 + 220 * hash(i + 9)), q = madd(pw, sd, ph * sp);
        molten(R, q, ph, 6 + 14 * hash(i + side * 5000 + 17));
      }
    });
  }
}
let _dsw = null; const D_SWEEP = () => _dsw || (_dsw = (() => { const ev = DUEL_EVENTS.find((x) => x.slash); return ev ? ev.dir : [0, 0, 1]; })());
// the pass-cut itself: a flash along the blade's path through its waist, a spray of molten sparks along the swing
function drawSlash(R, c, t) {
  drawCutDetail(R, t);
  const lt = t - CUT_SPLIT; if (lt < -0.02 || lt > 1.2) return;
  const ev = DUEL_EVENTS.find((x) => x.slash); if (!ev) return;
  const P = ev.pos, d = ev.dir;
  if (lt >= 0) {
    const k = Math.exp(-lt * 7);
    R.glow(P, 1 + 2 * k, [2.2 * k, 1.4 * k, 0.6 * k], 0.3);
    R.light(P, 40, [1, 0.6, 0.3], 4 * k);
    moltenBurst(R, P, d, lt, 77, 600, 1.0, 34, 1.1);
    if (lt < 0.3) R.ripple(P, 6 + 40 * easeOut(lt / 0.3), [0.4, 0.4, 0.4], (1 - lt / 0.3) * 1.2);
  }
}
// THRUSTER TRAILS (the Unicorn look): while a machine is boosting, a thin glowing line traces the path its backpack took
// over the last ~0.7 s — bright and tight at the machine, fading and thinning behind; nothing when it drifts
function boostTrail(R, t, who) {
  const col = arguments[3];
  const N = 14, span = 0.7;
  const pt = (x) => { const q = trailSample(who, x); return [q.pos[0], q.pos[1] + 4, q.pos[2]]; };
  let a = pt(t);
  for (let i = 1; i <= N; i++) {
    const x = t - (i / N) * span; if (who === 'hero' && t >= 163 && x < 163) break;   // (scene 30's run is turned from 163: no line back to the unturned path)
    const q = trailSample(who, x), b = pt(x);
    const boost = sat(((q.boost ?? 0) - 0.55) / 0.4) * sat((V.dist(a, b) / (span / N) - 25) / 40);   // only real boosts, not drift
    const f = 1 - (i - 0.5) / N, k = boost * f * f;
    if (k > 0.02) R.beam(a, b, 0.35 + 0.5 * f, [col[0] * k, col[1] * k, col[2] * k], 0.9, 10, 0, 0.3);
    a = b;
  }
}
function drawEnemyMS(R, t, s, idx) {
  if (idx === 2 && t > E2_FIN + 0.03 && t < 200) { drawBreakup(R, t, 2); return null; }
  if (idx === 1 && t > E1_FIN + 0.05 && t < 195) { drawBreakup(R, t, 1); return null; }
  if (!s.vis) return null;
  if (idx === 2 && s.cutKf === undefined && ((s.cutK || 0) > 0 || (t >= CUT_SEAM_T && t < 199))) return drawHalves(R, t, s);   // (from the blade's first touch: the seam melts open in place)
  const e = R.add('enemy_ms', msMatrix(tmpM, s));
  if (!e) return null;
  e.pose = s.pose; e.seed = 8 + idx; e.wear = 1; e.texSet = R.texLoaded & 4 ? 2 : 0;
  if (s.noRifle) {                                                    // (in the holster on its right thigh until it draws it)
    e.hidden = { ...(e.hidden || {}), rifle: 1 };
    const lw = R.partWorld('enemy_ms', e, 'leg_R_upper'); if (lw) { const g = R.add('enemy_rifle', M.mul(new Float32Array(16), lw, enemyHolsterLocal())); if (g) { g.seed = 10; g.wear = 0.4; g.texSet = R.texLoaded & 64 ? 4 : 0; } }
  }
  if (!s.shieldLost) { shieldScorch(e, t); drawBlockSplash(R, t); drawBigShield(R, e, s, t); }
  // (its rifle charge no longer shown: the shot cuts away as the muzzle comes up)
  if (idx === 2 && s.shieldLost) { e.hidden = { ...(e.hidden || {}), shield: 1 }; drawLostShield(R, t); }
  if (idx === 2 && transK(t) > 0.001) drawRails(R, t, s);
  if (idx === 2 && t >= RIFLE_DROP_T) { e.hidden = { ...(e.hidden || {}), rifle: 1 }; drawDroppedRifle(R, t); }
  if (!(e.hidden && e.hidden.rifle)) enemyRifleAt(R, e.m, s.pose);   // its own rifle model in place of the built-in one
  e.hidden = { ...(e.hidden || {}), rifle: 1 };
  const fn = idx === 1 ? enemyMS1 : enemyMS2;
  const ebk = sat(((s.boost ?? 0.5) - 0.6) / 0.4);   // quick-boosts: the nozzles flare
  engineGlows(R, 'enemy_ms', e, ENEMY_ENGINE.map((c) => c * 1.3), 1.3 * (1 + 0.9 * ebk), s.thr ?? 0.8, 2.4 + 2.2 * ebk, t > 169.5 && t < 200 ? null : { past: (tau) => { const q = fn(t - tau); return { m: msMatrix(new Float32Array(16), q), pose: q.pose }; }, particles: true });
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
  if (t > 170 && t < 200) meltHole(e, 'enemy', t, s.shieldLost ? 'leg_R_upper' : null);
  const eye = emitWorld(R, 'enemy_ms', e, 'eye');
  const eyeFl = idx === 1 ? 1 + 3 * Math.exp(-Math.abs(t - ENEMY_EYE - 0.04) * 30) : 1;   // its eye glints as it levels the rifle
  if (eye) {   // VANGUARD's eyes: a small glint on each (no big round glow), flaring in the standoff
    const pts = R.models.enemy_ms.emitPoints.eye || [];
    for (let i = 0; i < pts.length; i++) { const p = emitWorld(R, 'enemy_ms', e, 'eye', i); if (p) R.glow(p, 0.3 * (0.8 + 0.2 * eyeFl), [2.6 * eyeFl, 0.5 * eyeFl, 0.7 * eyeFl], 0.2); }
    e.matOverride = { ...(e.matOverride || {}), eye: { base: [0.35, 0.06, 0.18], metal: 0, rough: 0.3, emissive: [5 * eyeFl, 0.8 * eyeFl, 2.6 * eyeFl] }   /* magenta visor (scheme A) */ };
  }
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
// the rifle flung away before the well (FLING_T): from his hand at the release, out to his right and tumbling, keeping
// only part of his speed — he dives on and leaves it behind
export const FLING_T = 257.8;
let _fl = null;
function flungRifle(t) {
  if (!_fl) {
    const s0 = gundamState(FLING_T), fk = duelFK({ ...s0, saber: 0 }, 'gundam'), m0 = Float32Array.from(fk.rifle);
    const vS = V.scale([0, 0, 0], V.sub([0, 0, 0], gundamState(FLING_T + 0.02).pos, gundamState(FLING_T - 0.02).pos), 25);
    const right = V.norm([0, 0, 0], M.transformDir([0, 0, 0], fk.torso, [-1, 0, 0]));
    _fl = { m0, p0: [m0[12], m0[13], m0[14]], v: V.madd([0, 0, 0], V.scale([0, 0, 0], vS, 0.55), right, 45) };
  }
  const lt = t - FLING_T; if (lt < 0) return null;
  const m = Float32Array.from(_fl.m0), p = V.madd([0, 0, 0], _fl.p0, _fl.v, lt);
  const spin = new Float32Array(16); M.fromTRS(spin, [0, 0, 0], Q.fromEuler([0, 0, 0, 1], lt * 4.2, lt * 1.3, lt * 0.7), 1);
  const out = M.mul(new Float32Array(16), m, spin); out[12] = p[0]; out[13] = p[1]; out[14] = p[2];
  return out;
}
function rifleShot(R, t, t0, from, to, hit = false, mz = null, pw = 1, hold = 0) {   // pw: output (the aimed shot: 2.2 — a thicker beam and an energy backblast); hold: a sustained burn — the line stays joined to the muzzle at full strength that long (story s) before its tail leaves
  const lt0 = t - t0;
  if (lt0 < 0 || lt0 > 0.7 + hold) return;
  const lt = lt0 < 0.05 ? lt0 : Math.max(0.05, lt0 - hold);   // (the line's fade / tail clock waits out the burn)
  if (mz) from = mz;                                                 // the line leaves from where the muzzle IS now (it moves while the beam burns), still ending on its target
  const L = V.dist(from, to);
  // a beam-rifle LINE (the Unicorn look): the head races out at 5 km/s, the tail leaves the muzzle 0.12 s later — at
  // 60–90 m a bolt would cross in under a frame; a line reads for several frames and thins as it goes
  const speed = 5000;
  const head = Math.min(1, (lt0 * speed) / L), tail = Math.min(1, Math.max(0, ((lt - 0.12) * speed) / L));
  const a = lerpv(from, to, tail), b = lerpv(from, to, head), kk = 1 - 0.6 * sat((lt - 0.05) / 0.25);
  if (head > tail) { R.beam(a, b, (1.5 * kk + 0.4) * pw, [0.9 * kk, 2.0 * kk, 2.9 * kk], 1, 20, 0.6, 0.8); R.beam(a, b, 4.4 * pw, [0.5 * kk, 1.1 * kk, 1.6 * kk], 0.04, 3, 2, 0.6); }   // a HEAVY beam, twice the old bolt's thickness; cyan like his core (white core kept low)
  if (lt0 < 0.16) { R.glow(from, 7 * (1 - lt0 / 0.16), [0.9, 2.0, 2.9], 0.5); R.light(from, 60, [0.4, 0.8, 1], 4); }
  if (hold > 0 && lt0 < hold + 0.05) { const fl = 0.85 + 0.15 * Math.sin(t * 310) * Math.sin(t * 173); R.glow(from, 2.2 * pw * fl, [0.5, 1.1, 1.6], 0.5); R.light(from, 70, [0.4, 0.8, 1], 5 * fl); }   // the burn: the muzzle stays lit
  const lb = hold > 0 ? lt0 * 3.5 : lt0;   // (the backblast keeps its own quick clock through the burn's bullet time)
  if (pw > 1 && lb < 0.6) {   // THE BACKBLAST: the shot's energy bursts out of the muzzle in a shock ring and vents back out of the breech
    const dir = V.norm([0, 0, 0], V.sub([0, 0, 0], to, from)), k = 1 - lb / 0.6, e = easeOut(sat(lb / 0.35));
    R.glow(from, 6.5 * pw * Math.exp(-lb * 10), [1.4, 2.6, 3.6], 0.45);
    if (lb < 0.35) R.ripple(madd(from, dir, 8), 5 + 26 * pw * e, [0.3, 0.6, 0.9], (1 - lb / 0.35) * 0.7);   // (out ahead of the muzzle, gentle: it warped him)
    const br = madd(from, dir, -16);                                      // the breech, behind the grip
    if (lb < 0.45) { const kb = 1 - lb / 0.45; R.beam(br, madd(br, dir, -(5 + 28 * e)), (2.2 + 3 * e) * kb, [0.7 * kb, 1.6 * kb, 2.4 * kb], 0.55, 3, 1.5, 1.2); R.glow(br, 5 * kb, [0.8 * kb, 1.8 * kb, 2.6 * kb], 0.5); }
    sparkBurst(R, br, V.scale([0, 0, 0], dir, -1), lb, 1777, 40, 0.75, 55, 0.45, [1.2, 2.6, 3.4]);
    sparkBurst(R, from, dir, lb, 1781, 30, 1.3, 45, 0.35, [1.6, 2.8, 3.6]);
    R.light(from, 90, [0.4, 0.8, 1], 9 * k);
  }
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
  // (no thruster trails: the lines left behind the machines read awkwardly)
  // (his rifle shots: drawHeroFire)
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
          spark(R, p, 0.7 + 0.5 * (1 - u2), [b, b * 0.6, b * 0.3]);
        }
      }
      const mf = Math.exp(-(t - tf) * 12); if (t - tf < 0.3) { R.glow(from, 2.2, [3 * mf, 1.6 * mf, 0.5 * mf], 0.6); R.light(from, 30, [1, 0.6, 0.3], 4 * mf); }
    }
  }
  drawSeraphFire(R, t);                                             // the cannon shots + the finale beam
  drawHeroFire(R, t);                                               // his rifle
  // contact effects from the choreography (exact world contact points)
  for (const ev of [...DUEL_EVENTS, ...AUTO_FX]) {                  // choreographed + hitbox-detected contacts
    const lt = t - ev.t;
    if (lt < 0 || lt > 0.7 || !ev.pos) continue;
    if (ev.slash || (ev.shotDir && !ev.cut)) continue;   // (beam hits: the effect rides on the hit part — meltHole; the cut: drawSlash)
    const st = ev.strength ?? 1;
    const k = Math.exp(-lt * 7);
    if (ev.type === 'clash' || ev.type === 'block' || ev.type === 'spark' || ev.type === 'hit') {
      // (no glow disc at the contact: a round blob of light sat in the middle of every spark burst — the sparks + light spill carry it)
      R.light(ev.pos, 90, [1, 0.65, 0.5], (ev.shotDir ? 3 : 14) * k * st);   // (beam hits on the white enemy: a small light, or it blooms out)
      const n = ev.type === 'spark' ? 10 : 22;
      for (let i = 0; i < n; i++) {
        const d = randDir([0, 0, 0], ev.t * 13.1 + i * 3.7);
        const life = 0.25 + hash(ev.t + i) * 0.4;
        if (lt > life) continue;
        const a = lt / life;
        const p = madd(ev.pos, d, (8 + 22 * hash(i + ev.t * 3)) * st * easeOut(a));
        const q = madd(p, d, -3 * (1 - a));
        const b = (1 - a) * 4;
        spark(R, p, 0.45 + 0.4 * (1 - a), [b, b * 0.7, b * 0.4]);
      }
      if (ev.type !== 'spark' && lt < 0.25) R.ripple(ev.pos, (6 + 10 * st) * (0.2 + easeOut(lt / 0.25)), [0.2, 0.2, 0.2], (1 - lt / 0.25) * 1.2);
    }
    if (ev.cut && lt < (ev.t > 190 ? 3.2 : 1.6)) {       // the kill shot: metal crumples, armour shards + sparks spray out along the swing
      const ls = ev.t > 190 ? lt * 0.35 : lt;            // the finisher plays out in slow motion
      const d = V.norm([0, 0, 0], V.sub([0, 0, 0], ev.cut[1], ev.cut[0]));
      const kc = Math.exp(-ls * 4);
      R.light(ev.pos, 60, [1, 0.6, 0.35], 10 * kc);
      if (ls < 0.5) {
        R.ripple(ev.pos, 8 + 90 * easeOut(ls / 0.5), [0.5, 0.5, 0.5], (1 - ls / 0.5) * 1.0);
        R.ripple(ev.pos, 4 + 40 * easeOut(ls / 0.35), [0.5, 0.5, 0.5], sat(1 - ls / 0.35) * 1.6);
      }
      for (let i = 0; i < (ev.t > 190 ? 0 : 70); i++) {   // spark fan, biased along the swing (not on the finisher: its armour fans out instead)
        const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 3.9 + 11), d, 1.1));
        const life = 0.3 + hash(i + 40) * 0.9; if (ls > life) continue;
        const a = ls / life, p = madd(ev.pos, sd, (6 + 40 * hash(i + 7)) * easeOut(a)), q = madd(p, sd, -(2 + 4 * (1 - a)));
        const b = 5 * (1 - a) * (1 - a);
        spark(R, p, 0.45 + 0.45 * (1 - a), [b, b * 0.65, b * 0.3]);
      }
      for (let i = 0; i < 0; i++) {                   // (no foreign plates: the victim's own mesh crumples / breaks up)
        const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 5.3 + 1), d, 1.4));
        const p = madd(ev.pos, sd, (3 + 26 * hash(i + 3)) * easeOut(sat(ls / 1.6)));
        M.fromTRS(_dbM, p, Q.fromEuler(_dbQ, ls * 5 + i, ls * 3 + i * 2, ls * 4), 0.06 + 0.07 * hash(i));
        const de = R.add('debris', _dbM);
        if (de) { de.hidden = debrisOnly(R, 'hull' + (i % 4)); de.damage = 0.5; }
      }
      if (ls < 0.35 && ev.t < 190) {                      // pile-driver: the blow punches clean THROUGH — a white-hot shaft out the back
        const kp = 1 - ls / 0.35, len = 6 + 30 * easeOut(sat(ls / 0.12));
        R.beam(ev.pos, madd(ev.pos, d, len), 0.9 * kp + 0.3, [4 * kp, 3 * kp, 2 * kp], 1, 12);
      }
    }
  }
  { const cl = halfCentre(HALF_BLAST.lower, -1), cu = halfCentre(HALF_BLAST.upper, 1);   // each half goes up on its own
    if (cl) explosion(R, t, HALF_BLAST.lower, cl, 11, 503, 'ship');
    if (cu) explosion(R, t, HALF_BLAST.upper, cu, 18, 502, 'ship'); }
  return g;
}

// VANGUARD's beam rifle: bolts (a 70 m streak racing out at 2.2 km/s along the line fixed at the moment of firing), a
// short charge glint and a muzzle flash; light spills on Sigma as one goes past him — every one misses. The finale: a
// dozen homing heavy beams out of its back (drawUlt).
// Crimson-pink (its paint); the white core kept low (intensity).
const SER_COL = [3.0, 0.55, 0.9];
function serBeam(R, a, b, k, r = 1.3) {
  // seen from close up (the finale close-up sits in the beam) it is dimmed with camera distance, or it whites the frame out
  const cp = ctx.cam && ctx.cam.pos; let nk = 1;
  if (cp) { const d = V.sub([0, 0, 0], b, a), L2 = V.dot(d, d) || 1, u = clamp(V.dot(V.sub([0, 0, 0], cp, a), d) / L2, 0, 1); nk = clamp(V.dist(cp, madd(a, d, u)) / (60 * r), 0.2, 1); }
  const q = k * nk;
  R.beam(a, b, r, [SER_COL[0] * q, SER_COL[1] * q, SER_COL[2] * q], 0.55 * nk, 30, 3, 1.4);
  R.beam(a, b, r * 3.4, [SER_COL[0] * q, SER_COL[1] * q, SER_COL[2] * q], 0.045, 2, 3, 0.6);
}
const _shotLine = new Map();
function shotLine(ts) {
  let L = _shotLine.get(ts);
  if (!L) { const m = seraphMuzzle(ts); if (!m) return null; L = { from: m.pos, dir: m.dir }; _shotLine.set(ts, L); }
  return L;
}
// the one bolt of its that lands (on his left pauldron): the line ends there
const _stop = new Map();
function shotStop(ts) {
  if (!_stop.has(ts)) {
    const ev = DUEL_EVENTS.find((e) => e.heroHit && Math.abs(e.t - ts) < 0.1), L = shotLine(ts);
    _stop.set(ts, ev && L ? { pos: ev.pos, d: Math.max(5, V.dot(V.sub([0, 0, 0], ev.pos, L.from), L.dir)) } : null);
  }
  return _stop.get(ts);
}
// ---- its ULTIMATE (duel.js ultBeams / ultSwarm): the back charges while it gathers itself in, then an Itano circus of 48 missiles burst
// out of it in every direction, bend round and home onto him, converging (in a chain of blasts) where he was
const _ultBack = [0, 3.4, -2.0];
// a missile's burst: an orange fireball cluster round a brief white flash — no refracting shock rings, no HDR white core
// (hundreds of these go off in the circus; the generic explosion()'s blown-out centre stacked into a white wall)
function missileBurst(R, lt, p, size, seed, lit) {
  if (lt < 0 || lt > 0.8) return;
  if (lt < 0.07) { const f = 1 - lt / 0.07; R.glow(p, size * (0.3 + 0.3 * f), [3.3 * f, 1.8 * f, 3 * f], 0.25); }
  for (let j = 0; j < 3; j++) {
    const d0 = j * 0.04, life = 0.5 + 0.25 * hash(seed + j * 3.1), a = (lt - d0) / life; if (a < 0 || a > 1) continue;
    const q = madd(p, randDir([0, 0, 0], seed * 7.7 + j * 2.3), size * 0.35 * j * (0.4 + 0.6 * a));
    R.fireball(q, size * (0.3 + 0.55 * easeOut(Math.min(1, a * 1.6))) * (j ? 0.7 : 1), a, hash(seed + j) * 50 + j, [1, 0.5, 0.85], j ? 0.68 : 0.9);   // (pink-tinted: an energy round going off)
  }
  if (lit && lt < 0.3) R.light(p, size * 10, [1, 0.4, 0.75], 9 * (1 - lt / 0.3));
}
function drawUlt(R, t) {
  if (t < 189.8 || t > 191.9) return;
  const B = ultBeams();
  if (t < FINALE_T + 1.4) {                                     // THE CHARGE on its back, then THE LAUNCH: flash + halo + shock rings
    const e = enemyMS2(Math.min(t, FINALE_T)); const tm = e && e.vis ? duelFK(e, 'enemy_ms').torso : null;
    if (tm) {
      const bp = M.transformPoint([0, 0, 0], tm, _ultBack), back = V.norm([0, 0, 0], M.transformDir([0, 0, 0], tm, [0, 0, -1]));
      const s1 = V.norm([0, 0, 0], V.cross([0, 0, 0], back, [0, 1, 0])), s2 = V.cross([0, 0, 0], back, s1);
      if (t < FINALE_T) {                                           // energy gathering at its launch ports, brighter and brighter
        const c = sat((t - 189.8) / (FINALE_T - 189.8)), q = c * c;
        const tF = duelFK(enemyMS2(FINALE_T), 'enemy_ms').torso, inv = M.invert(M.new(), tF), bF = M.transformPoint([0, 0, 0], tF, _ultBack);
        B.forEach((b, i) => {                                        // each beam's port: the beam's exit, carried on the body
          const dl = M.transformDir([0, 0, 0], inv, V.norm([0, 0, 0], V.sub([0, 0, 0], b.p0, bF)));
          const port = M.transformPoint([0, 0, 0], tm, V.madd([0, 0, 0], _ultBack, dl, 1.2));
          const fl = 0.85 + 0.15 * Math.sin(t * 40 + i * 1.7);
          R.glow(port, 0.3 + 2.2 * q * fl, [3.4 * q, 0.9 * q, 1.8 * q], 0.3);
          R.glow(port, 0.12 + 0.5 * q, [4 * q, 3 * q, 3.6 * q], 0.2);       // the white-hot core of each port
        });
        R.glow(bp, 0.5 + 2.2 * q, [2.4 * q, 0.6 * q, 1.2 * q], 0.4); R.light(bp, 70, [1, 0.3, 0.5], 10 * q);
        for (let i = 0; i < 16; i++) {                               // a few faint motes drawn in toward it
          const L = 0.5 + 0.3 * hash(i + 700), ph = ((t / L) + hash(i + 701)) % 1, d = randDir([0, 0, 0], i * 3.3 + Math.floor(t / L + hash(i + 701)) * 1.7), k = ph * c * 1.2;
          R.glow(madd(bp, d, 3 + 12 * (1 - ph)), 0.15 + 0.2 * ph, [2.4 * k, 0.6 * k, 1.4 * k], 0.2);
        }
      } else {
        const lt = t - FINALE_T;
        if (lt < 0.06) { const f = 1 - lt / 0.06; R.glow(bp, 6 + 22 * f, [6 * f, 4 * f, 5 * f], 0.4); R.light(bp, 200, [1, 0.5, 0.7], 30 * f); }   // the white flash
        // (2026-10-03: no halo ring of light points and no shock rings round it any more — they read as rounds bursting in
        // a circle; the flash and the sparks carry the launch)
        if (lt < 0.15) {
          sparkBurst(R, bp, back, lt, 811, 160, 1.6, 90, 1.2, [5, 2, 3.2]);
        }
      }
    }
  }
  const S = ultSwarm(), c = circusClock(t);                       // ITANO CIRCUS (film-second circus clock): 48 missiles, smoke trails
  for (let i = 0; i < S.length; i++) {
    const m = S[i]; if (c < m.lc) continue;
    const life = m.hit ? m.sc : m.sc + 0.6, cEnd = Math.min(c, life), fade = c > life ? 1 - sat((c - life) / 0.3) : 1;   // trails hang on after the strike (or the miss flying off), then thin away
    if (fade > 0.01) {
      const c0 = Math.max(m.lc, cEnd - 0.7), n = 28; let pa = missilePosC(m, cEnd);   // (thin trails, gone in 0.7 s)
      for (let j = 1; j <= n; j++) {                                  // its path over the last 0.35 s: thin at the head, swelling as it fades
        const cj = Math.max(m.lc, cEnd - (cEnd - c0) * j / n), pb = missilePosC(m, cj), age = c - cj;
        const w = 0.3 + 0.55 * sat(age / 0.5), k = 0.07 * fade * (1 - sat(age / 0.7)) * sat((cj - m.lc) / 0.1 + 0.15);   // (dim: they overlap, additive)
        R.beam(pb, pa, w, [4, 0.35, 2.6], k * 0.33, 6, 1.0, 0.6);   // a pink energy trail (tint-led: the beam's white core scales with intensity)   // pink: they are energy rounds
        if (j <= 3 && c < m.sc) R.beam(pb, pa, 0.3, [3.2, 0.9, 2.6], 0.6, 12, 0, 1);   // the hot pink core right behind the head
        pa = pb;
      }
    }
    if (c < life) {
      const head = missilePosC(m, c);
      R.glow(head, 1.4, [8, 2.2, 6], 0.3); R.glow(head, 0.5, [10, 6.4, 9.2], 0.2);   // the head: a pink energy round, white-pink core
      if (i % 40 === 0) R.light(head, 60, [1, 0.3, 0.75], 6);
      if (c - m.lc < 0.12) { const f = 1 - (c - m.lc) / 0.12; R.glow(m.p0, 1.2 + 1.5 * f, [3 * f, 1 * f, 2.4 * f], 0.35); }   // the pop out of the port
      if (i % 5 === 0 && c - m.lc < 1.0) { const a = (c - m.lc) / 1.0; R.glow(m.p0, 2 + 7 * easeOut(a), [0.22 * (1 - a), 0.2 * (1 - a), 0.26 * (1 - a)], 0.9); }   // the launch smoke puffing off the ports
    } else if (m.hit && c - m.sc < 0.8) {                                        // THE STRIKE: one after another, each a fireball on his heels
      missileBurst(R, c - m.sc, m.p3, (9 + 6.75 * hash(i + 3)) * (m.sc >= CIRCUS_B3 ? 2 : 1), 610 + i, i % 6 === 0);   // (x1.5 the blast; x2 more in the last cut: the big one he slips)   // (big: the lens is right on them)
    }
  }


}
// ---- THE TRANSFORMING SHOT: two rails slide out of the rifle either side (copies of the rifle part, offset along its side
// axis and forward), crackling arcs between rails and muzzle while it charges; then a thick homing beam whose head is a
// big spinning energy body (a rotating icosahedral lattice of light round a white core), bending round after him
const _rT2 = new Float32Array(16), _rM2 = new Float32Array(16);
let _railHide = null;
// THE LOAD (duel.js heroDraw): the spent E-pac pops out of the receiver at HERO_EJECT and tumbles away (a steam puff,
// a couple of sparks); the fresh pac glows in his left hand until it is slammed home at HERO_LOAD (a spark flash);
// the indicator strip on top of the rifle goes dark at the eject and lights in two steps at HERO_LOCK
const _ejT = new Float32Array(16), _ejQ = [0, 0, 0, 1];
function drawLoad(R, t) {
  if (t < HERO_GRAB || t > 176.4) return;
  const F = heroRifleFrame(t); if (!F) return;
  const up = V.norm([0, 0, 0], V.cross([0, 0, 0], F.dir, V.cross([0, 0, 0], [0, 1, 0], F.dir)));
  const strip = t < HERO_EJECT ? 0.5 : t < HERO_LOCK ? 0 : t < HERO_LOCK + 0.1 ? 0.5 : 1;   // dark between the eject and the lock
  const flash = t > HERO_LOCK && t < HERO_LOCK + 0.25 ? 1 + 1.5 * Math.exp(-(t - HERO_LOCK) * 20) : 1;
  if (strip > 0) for (let i = 0; i < 6; i++) { const p = madd(madd(madd(F.p, F.dir, -2.6 + 1.05 * i), up, 2.4), F.left, 1.15); const k = strip * flash * 0.7; R.glow(p, 0.22, [0.3 * k, 1.8 * k, 1.1 * k], 0.2); }
  const ej = heroEject(), le = t - HERO_EJECT;
  if (le >= 0 && le < 1.6) {                                           // the spent pac: popped up and back, tumbling
    const v = V.add([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], ej.up, 4), V.scale([0, 0, 0], ej.back, 7)), ej.vShip);
    const p = madd(ej.p, v, le);
    Q.fromEuler(_ejQ, le * 12.5, le * 4, le * 7); M.fromTRS(_ejT, p, _ejQ, 0.28);
    const d = R.add('debris', _ejT); if (d) { const hk = 0.8 * Math.exp(-le * 1.5); d.hidden = debrisOnly(R, 'hull1'); d.seed = 3.3; d.matOverride = { hull: { base: [0.35, 0.36, 0.4], metal: 0.8, rough: 0.35, emissive: [0.3 * hk, 1.2 * hk, 1.6 * hk] } }; }   // the spent pac, still glowing faintly
    R.glow(p, 1.1, [0.4, 1.3, 1.8].map((c) => c * Math.exp(-le * 1.2)), 0.25);
    if (le < 0.5) { const k = 1 - le / 0.5; for (let i = 0; i < 5; i++) R.glow(madd(ej.p, randDir([0, 0, 0], i * 3.7 + 9), 0.4 + 2.5 * le), 0.5 + 1.2 * le, [0.35 * k, 0.35 * k, 0.37 * k], 0.5); }   // a steam puff
    if (le < 0.3) sparkBurst(R, ej.p, ej.up, le, 91, 6, 0.8, 18, 0.3, [4, 2.4, 0.9]);
  }
  const cap = heroCap(t);
  if (cap) { const c0 = madd(cap.p, cap.axis, 0.9), a = madd(c0, cap.axis, -1.1), b = madd(c0, cap.axis, 1.1); R.beam(a, b, 0.6, [0.7, 2.2, 3.2], 1, 4); R.glow(c0, 1.6, [0.5, 1.5, 2.2], 0.3); R.light(c0, 14, [0.4, 0.8, 1], 2); }   // the fresh pac, sticking out of his fist
  const lt = t - HERO_LOAD;
  if (lt >= 0 && lt < 0.4) { const fl = Math.exp(-lt * 14); R.glow(F.rear, 0.8 + 2.4 * fl, [1.6 * fl, 2.4 * fl, 3.2 * fl], 0.3); R.light(F.rear, 20, [0.6, 0.8, 1], 3 * fl); sparkBurst(R, F.rear, up, lt, 57, 24, 0.9, 16, 0.35, [4, 2.6, 1.2]); }
}
// its rifle charging (ENEMY_CHARGE0 → 1): light gathering along the barrel into the muzzle, crackling
function drawEnemyCharge(R, t) {
  const F = enemyRifleFrame(t); if (!F) return;
  const step = Math.min(3, Math.floor((t - ENEMY_CHARGE0) / 0.35) + 1), stepT = ENEMY_CHARGE0 + (step - 1) * 0.35;   // 3 steps, not a smooth fill
  const c = t < ENEMY_CHARGE0 ? 0 : (step - 1 + sat((t - stepT) / 0.05)) / 3, fade = t > ENEMY_CHARGE1 ? 0.35 + 0.65 * Math.exp(-(t - ENEMY_CHARGE1) * 4) : 1, q = c * fade;
  if (t > ENEMY_CHARGE1 - 0.1 && t < ENEMY_CHARGE1 + 0.5) { const ls = t - ENEMY_CHARGE1 + 0.1, k = 1 - ls / 0.6; for (let i = 0; i < 8; i++) R.glow(madd(madd(F.p, F.side, (i % 2 ? 1 : -1) * (0.8 + 2.5 * ls)), F.up, 0.5 + 1.5 * ls * hash(i + 3)), 0.5 + 1.4 * ls, [0.4 * k, 0.4 * k, 0.42 * k], 0.5); }   // vents puff steam
  if (q < 0.01) return;
  for (let i = 0; i < 8; i++) {
    const f = i / 7, ph = (t * 3 + f) % 1, p = lerpv(F.p, F.muzzle, f);
    R.glow(p, 0.3 + 0.35 * q, [2.6 * q * (0.6 + 0.4 * ph), 0.5 * q, 0.9 * q], 0.25);
  }
  R.glow(F.muzzle, 0.5 + 2.2 * q * (1 + 0.1 * Math.sin(t * 70)), [3 * q, 0.6 * q, 1 * q], 0.35); R.light(F.muzzle, 30, [1, 0.3, 0.45], 4 * q);
}
function drawRails(R, t, s) {
  const k = easeOut(transK(t)), F = enemyRifleFrame(t); if (!F) return;
  if (!_railHide) { _railHide = {}; for (const p of R.models.enemy_ms.parts) if (p.name !== 'rifle') _railHide[p.name] = 1; }
  msMatrix(_rM2, s);
  for (const sd of [-1, 1]) {
    const off = V.add([0, 0, 0], V.scale([0, 0, 0], F.up, sd * 1.35 * k), V.scale([0, 0, 0], F.dir, 1.6 * k));   // the rails open up and down like jaws, sliding forward
    M.fromTRS(_rT2, off, [0, 0, 0, 1], 1);
    enemyRifleAt(R, _rM2, s.pose, _rT2);
    // the rail's inner edge glows with the charge
    const c = t < TRANS_SHOT ? sat((t - TRANS0 - 0.2) / (TRANS_SHOT - TRANS0 - 0.2)) : Math.exp(-(t - TRANS_SHOT) * 5);
    if (c > 0.02) {
      const a = V.add([0, 0, 0], F.p, off), b = V.add([0, 0, 0], F.muzzle, off);
      R.beam(madd(a, F.up, -sd * 0.45), madd(b, F.up, -sd * 0.45), 0.14, [3 * c, 0.6 * c, 1 * c], 1, 10);
    }
  }
  const c = t < TRANS_SHOT ? sat((t - TRANS0 - 0.2) / (TRANS_SHOT - TRANS0 - 0.2)) : 0;
  if (c > 0.02) {                                               // charging: crackling arcs between the rails, light gathering at the muzzle
    const q = c * c * (1 + 0.15 * Math.sin(t * 90));
    R.glow(F.muzzle, 0.6 + 3.5 * q, [3 * q, 0.6 * q, 1 * q], 0.35); R.light(F.muzzle, 35, [1, 0.3, 0.45], 5 * q);
    const seed = Math.floor(t * 60);
    for (let j = 0; j < 4; j++) {
      const u = (j + 0.5) / 4, pa = madd(madd(lerpv(F.p, F.muzzle, 0.3 + 0.7 * u), F.up, -0.9), F.dir, 1.6), pb = madd(pa, F.up, 1.8);
      let prev = pa;
      for (let i = 1; i <= 6; i++) {
        const f = i / 6, pt = i === 6 ? pb : madd(lerpv(pa, pb, f), randDir([0, 0, 0], seed * 7.1 + j * 13 + i), 0.35);
        R.beam(prev, pt, 0.05, [2.5 * c, 1.2 * c, 2.8 * c], 1, 8); prev = pt;
      }
    }
  }
}
// the shot: a blinding ball of light at the centre, ONE energy source orbiting it on a helix round its line of flight,
// both trailing light — the ball a thick fading streak, the orbiter a thin spiral; it bursts behind him at TRANS_HIT
function drawTransShot(R, t) {
  if (t < TRANS_SHOT - 0.01 || t > TRANS_HIT + 3) return;
  const lt = t - TRANS_SHOT, P = transPath();
  if (lt >= 0 && lt < 0.35) { const kf = Math.exp(-lt * 9); R.glow(P.p0, 2 + 6 * kf, [3 * kf, 0.6 * kf, 1 * kf], 0.35); R.light(P.p0, 70, [1, 0.3, 0.45], 9 * kf); R.ripple(P.p0, 8 + 40 * easeOut(lt / 0.35), [0.5, 0.5, 0.5], (1 - lt / 0.35) * 1.3); }
  if (t < TRANS_SHOT) return;
  const ball = (h, g, tr0, trFn, orb) => {                           // a light-ball: trail, core, body, halo (+ the orbiter)
    const N = 22, span = Math.min(0.07, t - tr0);
    let pa = h, oa = orb ? transOrb(t) : null;
    for (let i = 1; i <= N; i++) {
      const tt = t - span * i / N, f = 1 - (i - 0.5) / N, pb = trFn(tt);
      R.beam(pa, pb, (0.15 + 0.85 * f * f) * g, [SER_COL[0] * 0.8 * f, SER_COL[1] * 0.8 * f, SER_COL[2] * 0.8 * f], 0.5 + 0.5 * f, 8);
      if (orb) { const ob = transOrb(tt); R.beam(oa, ob, 0.06 + 0.3 * f, [3.2 * f, 1.6 * f, 2.6 * f], 1, 10); oa = ob; }
      pa = pb;
    }
    R.glow(h, 1.1 * g, [5, 3.8, 4.4], 0.25); R.glow(h, 2.1 * g, [2.8, 0.7, 1.3], 0.35); R.glow(h, 3.8 * g, [0.7, 0.12, 0.28], 0.45);
    R.light(h, 60, [1, 0.35, 0.55], 4 * g);
    if (orb) { const o = transOrb(t); R.glow(o, 0.6 * g, [5, 3.5, 4.5], 0.2); R.glow(o, 1.2 * g, [2, 0.6, 1.3], 0.3); R.beam(h, o, 0.08, [1.6, 0.5, 1.0], 0.5, 6); }
  };
  if (t <= TRANS_PASS) ball(transHead(t), sat(lt / 0.06), TRANS_SHOT, transHead, true);
  // CUT THROUGH: a flash where the blade met it, then the ball's energy in solid pieces (duel.js energyShards) — each a
  // glowing lump flying on with its momentum; the ones that meet his body strike it with a few sparks and are gone
  const lc = t - TRANS_PASS;
  if (lc >= 0 && lc < SHARD_LIFE + 0.2 && !inCatchCut(t)) {
    const P0 = transHead(TRANS_PASS), f = Math.exp(-lc * 9);
    R.glow(P0, 1 + 3 * f, [3.5 * f, 2 * f, 3 * f], 0.3); R.light(P0, 70, [1, 0.45, 0.8], 5 * Math.exp(-lc * 4));
    for (const sh of energyShards()) {
      if (t >= sh.hitT) {                                            // struck him: sparks off the armour where it hit
        const a = t - sh.hitT; if (a > 0.25) continue;
        const k = Math.exp(-a * 14);
        R.glow(sh.hitP, 0.5 + 1.2 * k, [3 * k, 1.6 * k, 2.2 * k], 0.25);
        if (a < 0.08) R.light(sh.hitP, 12, [1, 0.6, 0.5], 2 * k);
        sparkBurst(R, sh.hitP, sh.hitN, a, 1300 + sh.seed * 17, 14, 0.9, 30, 0.22, [4, 2.4, 1.6]);
        continue;
      }
      const life = sat(lc / SHARD_LIFE), fade = Math.pow(1 - life, 1.3); if (fade < 0.02) continue;
      const p = madd(sh.p0, sh.v, lc), tail = madd(p, sh.v, -Math.min(lc, 0.006));
      const col = lerpv([3.0, 1.0, 2.0], [1.8, 0.4, 1.7], life), fl = 0.8 + 0.2 * Math.sin(lc * 80 + sh.seed);   // (the ball's own magenta, cooling violet)
      // an irregular plasma lump: a torn, writhing head and a few smaller ragged pieces strung out behind it
      R.orb(p, sh.r * 1.3 * (1 - 0.4 * life), col, 1.6 * fade * fl, 400 + sh.seed, 0.9);
      for (let k = 1; k <= 3; k++) {
        const q = madd(madd(p, sh.v, -0.0035 * k), randDir([0, 0, 0], sh.seed * 13 + k), sh.r * 0.5);
        R.orb(q, sh.r * (1.0 - 0.22 * k) * (1 - 0.4 * life), col, 1.2 * fade * fl * (1 - 0.2 * k), 430 + sh.seed * 3 + k, 1.0);
      }
      R.beam(tail, p, sh.r * 0.4, [col[0] * fade * 0.4, col[1] * fade * 0.4, col[2] * fade * 0.4], 0.5, 2);   // a faint streak
    }
  }
}
function drawSeraphFire(R, t) {
  drawTransShot(R, t);
  for (const ts of [...SERAPH_SHOTS, ...ENEMY_BURST]) {
    if (ts === TRANS_SHOT) continue;                           // (the transforming shot: drawTransShot)
    if (t < ts - 0.15 || t > ts + 0.8) continue;
    const L = shotLine(ts); if (!L) continue;
    if (t < ts) {                                              // a charge glint at the muzzle
      const m = seraphMuzzle(t), c = sat((t - (ts - 0.15)) / 0.15);
      if (m) { R.glow(m.pos, 0.5 + 1.2 * c * c, [3 * c, 0.6 * c, 0.9 * c], 0.3); R.light(m.pos, 30, [1, 0.3, 0.45], 2 * c); }
      continue;
    }
    const lt = t - ts, stop = shotStop(ts), head = Math.min(stop ? stop.d : 1500, 5000 * lt + 3), tail = Math.max(0, 5000 * (lt - 0.12)), kk = 1 - 0.6 * sat((lt - 0.05) / 0.25);
    const mNow = seraphMuzzle(t), F = mNow ? mNow.pos : L.from, E = madd(L.from, L.dir, stop ? stop.d : 1500), Ld = V.dist(F, E);   // (from its muzzle as it is now, to where the shot was going)
    if (head > tail) {                                          // a beam line, like his (see rifleShot)
      const a = lerpv(F, E, Math.min(1, tail / Ld)), b = lerpv(F, E, Math.min(1, head / Ld));
      R.beam(a, b, 0.75 * kk + 0.2, [SER_COL[0] * kk, SER_COL[1] * kk, SER_COL[2] * kk], 1, 20, 0.6, 0.8);
      R.beam(a, b, 2.4, [SER_COL[0] * 0.6 * kk, SER_COL[1] * 0.6 * kk, SER_COL[2] * 0.6 * kk], 0.04, 3, 2, 0.6);
    }
    const kf = Math.exp(-lt * 12);
    if (lt < 0.25) { R.glow(F, 1 + 2.5 * kf, [3 * kf, 0.6 * kf, 0.9 * kf], 0.35); R.light(F, 60, [1, 0.3, 0.45], 6 * kf); }
    const g = gundamState(t); if (g && g.vis && head > tail) {   // light spilling on him as it goes past
      const d = V.sub([0, 0, 0], g.pos, L.from), u = V.dot(d, L.dir);
      if (u > tail - 20 && u < head + 20) R.light(madd(L.from, L.dir, clamp(u, tail, head)), 50, [1, 0.3, 0.45], 5);
    }
  }
  drawUlt(R, t);
}
// ---- Sigma's beam rifle: fast cyan bolts; the reversal shot takes SERAPH's left wing; the charged shot is a magnum —
// a thick beam that goes straight through its chest and on out into space
const HERO_COL = [0.9, 2.3, 3.4];
const BLOCK_BURN = 0.25;   // the aimed shot on the shield (scene 41, 2026-10-04): a 1.5 s burn on screen (timemap SLOW_RANGES 178.7–178.96), dragged down across the plate
function drawHeroFire(R, t) {
  for (const sh of DUEL_SHOTS) {
    if (t < sh.t - 0.01 || t > sh.t + 0.9 + (sh.block ? BLOCK_BURN : 0)) continue;
    const lt = t - sh.t;
    if (!sh.kill) {
      if (sh.block) {                                                  // the block: a live ray from his muzzle, cut off where it meets the plate
        const bh = blockHitAt(t), bc = t > sh.t + 0.1 ? blockHitAt(Math.min(t, sh.t + 0.26)) : null;   // (after the drag it stays on the plate's last point: no line on through it)
        const from = bh ? bh.from : sh.from, to = bh && bh.inside ? bh.p : bc ? bc.p : bh ? V.add([0, 0, 0], bh.from, V.scale([0, 0, 0], bh.dir, 1500)) : sh.to;
        rifleShot(R, t, sh.t, from, to, false, null, 2.2, BLOCK_BURN); continue;   // (the aimed, shouldered shot the shield takes: full output, held on the plate as it drags down across it)
      }
      const mz = duelMuzzle(t);
      rifleShot(R, t, sh.t, sh.from, sh.to, false, mz && lt < 0.7 ? mz.pos : null);   // (no flash ball on the wing hit: the sparks + light carry it)
      continue;
    }
    // the magnum
    const k = lt < 0.35 ? 1 : Math.max(0, 1 - (lt - 0.35) / 0.3), reach = Math.min(1, lt / 0.05);
    const end = madd(sh.from, sh.dir, 2500 * reach);
    if (k > 0) { R.beam(sh.from, end, 1.6, [HERO_COL[0] * k, HERO_COL[1] * k, HERO_COL[2] * k], 0.6, 30, 3, 1.5); R.beam(sh.from, end, 5, [HERO_COL[0] * k, HERO_COL[1] * k, HERO_COL[2] * k], 0.04, 2, 3, 0.6); }
    const kf = Math.exp(-lt * 8);
    R.glow(sh.from, 1.5 + 4 * kf, [0.9 * kf, 2.2 * kf, 3.2 * kf], 0.4); R.light(sh.from, 90, [0.4, 0.8, 1], 14 * kf);
    if (lt < 0.35) R.ripple(sh.from, 8 + 50 * easeOut(lt / 0.35), [0.5, 0.5, 0.5], (1 - lt / 0.35) * 1.2);
  }
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
  const s = { vis: true, pos: addv(HANGAR, [0, 9, 0]), fwd: [0, 0, 1], pose: {}, saber: 0, weapon: 'back', thr: 0, damage: 0, eye: 0, roll: 0, pitch: 0 };   // rifle slung on his back
  if (phase === 'standby') {
    blendPose('stand', 'stand', 0, s.pose);
    s.weapon = 'none';                             // rifle racked while standing by
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
// a weapon impact: brief HDR flash + a cone of spark particles thrown back off the struck surface + a little light
function coImpact(R, t, t0, p, back, size) {
  const lt = t - t0;
  if (lt < 0 || lt > 0.7) return;
  const kf = Math.exp(-lt * 10);
  R.glow(p, (1.5 + 1.5 * kf) * size, [12 * kf, 8 * kf, 4.5 * kf], 0.2);
  if (lt < 0.12) R.light(p, 60 * size, [1, 0.7, 0.45], 8 * (1 - lt / 0.12));
  const sd0 = V.norm([0, 0, 0], V.cross([0, 0, 0], back, [0, 1, 0])), up0 = V.cross([0, 0, 0], sd0, back);
  for (let i = 0; i < 18; i++) {
    const a = hash(t0 * 7 + i) * 6.283, sp = Math.pow(hash(t0 * 3 + i), 0.7) * 1.1;
    const d = V.norm([0, 0, 0], V.add([0, 0, 0], back, V.add([0, 0, 0], V.scale([0, 0, 0], sd0, Math.cos(a) * sp), V.scale([0, 0, 0], up0, Math.sin(a) * sp))));
    const life = 0.2 + hash(t0 + i * 1.3) * 0.45; if (lt > life) continue;
    const u = lt / life, b = (1.5 + 6 * Math.exp(-lt * 6)) * (1 - u) * (1 - u);
    spark(R, V.madd([0, 0, 0], p, d, (3 + 16 * hash(i + t0)) * size * (1 - (1 - u) * (1 - u))), (0.35 + 0.8 * (1 - u)) * size, [b, b * 0.65, b * 0.3]);
  }
}
function coFighter(t, k, cam, fwd, side) {
  const [t0, off, h, sp, , sg] = CO_FLY[k];
  const lt = t - t0;
  // enters from behind the camera, crosses the frame toward the enemy line with a lazy S-curve
  const along = 18 + lt * sp;
  const lat = off + sg * 8 * Math.sin(lt * 1.6) + sg * lt * 6;
  return addv(madd(madd(cam, fwd, along), side, lat), [0, h + 6 * Math.sin(lt * 2.1 + k), 0]);
}
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
  // crossing capital-ship slugs close overhead: a WALL of fire both ways (16), some whipping right past the lens
  for (let j = 0; j < 16; j++) {
    const tf = 8.35 + j * 0.34 + hash(j) * 0.25;
    const a = addv(madd(madd(cam, fwd, -200), side, -300 + hash(j + 2) * 160), [0, 10 + hash(j + 4) * 80, 0]);
    const b = addv(madd(madd(cam, fwd, 700), side, 250 - hash(j + 5) * 260), [0, -30 + hash(j + 6) * 70, 0]);
    bolt(R, t, tf, tf + 0.8, j % 2 ? b : a, j % 2 ? a : b, 90, 1.6, j % 2 ? [3.2, 1.0, 0.3] : [0.7, 1.5, 3.4], 1.2);
  }
  // the dreadnought's turrets answer: red slugs from its hull out toward our line (they fly on past)
  for (const tf of CO_TURRET) {
    const k = Math.floor(tf * 7);
    const from = addv(madd(madd(tgt, side, -140 + hash(k) * 280), fwd, -20), [0, 10 + hash(k + 1) * 30, 0]);
    const dir = V.norm([0, 0, 0], addv(madd(madd([0, 0, 0], fwd, -1), side, (hash(k + 2) - 0.5) * 1.2), [0, 0.15 + hash(k + 3) * 0.3, 0]));
    bolt(R, t, tf, tf + 1.6, from, madd(from, dir, 2400), 60, 1.2, [3.4, 0.8, 0.3], 1.2);
  }
  // heavy slugs from our line LAND on the dreadnought: flash, a spray of sparks off the armour, a small blast
  for (const h of CO_HULL_HITS) {
    const hp = addv(madd(madd(tgt, side, -150 + hash(h.i + 20) * 300), fwd, -30), [0, -10 + hash(h.i + 21) * 40, 0]);
    const from = addv(madd(madd(cam, fwd, -300), side, -260 + hash(h.i + 22) * 120), [0, 40, 0]);
    bolt(R, t, h.t - 0.45, h.t, from, hp, 90, 1.8, [0.7, 1.5, 3.4], 1.3);
    coImpact(R, t, h.t, hp, V.norm([0, 0, 0], V.sub([0, 0, 0], from, hp)), 1.6);
    explosion(R, t, h.t + 0.05, hp, 12 + 6 * hash(h.i + 23), 950 + h.i, 'small', 3.5);
  }
  // every fighter kill is a real hit: the burst closes in, the last three land (sparks), then it blows
  for (const kl of CO_KILLS) {
    const vic = (tt) => coFighter(tt, kl.k, cam, fwd, side);
    for (const sh of kl.shots) {
      if (t < sh.tf || t > sh.tf + 3) continue;
      const [kind, si] = kl.shooter;
      const from = kind === 'f' ? coFighter(sh.tf, si, cam, fwd, side)
        : kind === 'turret' ? addv(madd(tgt, side, -40 + 30 * sh.j), [0, 25, 0])
        : addv(madd(madd(cam, fwd, -150), side, -120), [0, 30, 0]);
      const col = kind === 'f' && !CO_FLY[si][4] ? [0.8, 1.6, 3.2] : kind === 'fleet' ? [0.7, 1.5, 3.4] : [3.2, 0.9, 0.35];
      const TT = kind === 'f' ? 0.12 : 0.25;
      if (sh.hit) {
        const to = vic(sh.tf + TT);
        bolt(R, t, sh.tf, sh.tf + TT, from, to, 14, 0.4, col, 1.2);
        coImpact(R, t, sh.tf + TT, V.madd([0, 0, 0], vic(Math.min(t, kl.td)), randDir([0, 0, 0], sh.j * 5.1 + kl.k), 1.2), V.norm([0, 0, 0], V.sub([0, 0, 0], from, to)), 0.8);
      } else {
        const aim = addv(vic(sh.tf + TT), [(hash(sh.j + kl.k) - 0.5) * 18, (hash(sh.j + kl.k + 3) - 0.5) * 12, 0]);
        const d = V.norm([0, 0, 0], V.sub([0, 0, 0], aim, from)), sp = V.dist(aim, from) / TT;
        bolt(R, t, sh.tf, sh.tf + 3000 / sp, from, madd(from, d, 3000), 14, 0.4, col, 1.2);
      }
    }
  }
  // close debris drifting across the lens
  for (let i = 0; i < 16; i++) {
    const p = addv(madd(madd(cam, fwd, 25 + hash(i) * 120), side, -70 + hash(i + 1) * 140 - (t - 8) * (4 + 6 * hash(i + 2))), [0, -30 + hash(i + 3) * 60, 0]);
    M.fromTRS(_dbM, p, Q.fromEuler(_dbQ, t * (0.4 + hash(i + 4)) + i, t * 0.3 + i, t * 0.5), 0.08 + 0.18 * hash(i + 5));
    const de = R.add('debris', _dbM);
    if (de) { de.hidden = debrisOnly(R, 'hull' + (i % 4)); de.damage = 0.4 + 0.3 * hash(i + 6); }
  }
  // flak bursting along the enemy line (small, real blasts)
  for (let i = 0; i < 10; i++) {
    const tb = 8.4 + i * 0.55;
    if (t < tb || t > tb + 2) continue;
    const p = addv(madd(madd(tgt, fwd, -60 - hash(i) * 200), side, -220 + hash(i + 1) * 440), [0, -60 + hash(i + 2) * 140, 0]);
    explosion(R, t, tb, p, 4 + 3 * hash(i + 3), 970 + i, 'small', 3);
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
  // (before the whip the sky stays still and peaceful: nothing of the battle shows)
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
  shake(c, 0.08 + 0.27 * (1 - smooth(64.1, 64.9, t)), 6);   // (eases down: the step at 64.5 made the frame jump)
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
  // (both suns stay where they are in every space scene — no per-shot sun moves)
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
  // (both suns stay fixed — the old per-shot key from behind the camera made this scene lit differently)
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
  let side = V.norm([0, 0, 0], V.cross([0, 0, 0], st.fwd, [0, 1, 0]));
  if (V.dot(side, V.sub([0, 0, 0], motherPoint([0, 0, 0], t, [0, 0, 0]), st.pos)) > 0) side = V.scale(side, side, -1);   // outboard: never between it and the flagship
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
// (their 24 shots: world.js STRIKE_SHOTS, shared with the sound)
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
  // their shots: a HIT strikes the wingman (flash + sparks riding on his hull); a MISS flies on out into space
  for (const sh of STRIKE_SHOTS) {
    const { tf, tgtK, hit, n } = sh, lt = t - tf;
    if (lt < 0 || lt > 12) continue;
    const from = strikePos(tf, BANDITS[n % 3]).p;
    if (hit) {
      const vict = STRIKE[tgtK];
      if (lt < 0.2) { bolt(R, t, tf, tf + 0.2, from, strikePos(tf + 0.2, vict).p, 12, 0.2, [3, 1.2, 0.4], 1); continue; }
      const li = lt - 0.2;
      if (li > 0.6 || (vict[3] && t > vict[3])) continue;
      const tp = V.madd([0, 0, 0], strikePos(t, vict).p, randDir([0, 0, 0], n * 3.7), 1.3);
      const kf = Math.exp(-li * 9);
      R.glow(tp, 2 + 2.5 * kf, [4 * kf, 2.6 * kf, 1.4 * kf], 0.6);
      R.glow(tp, 1, [1.5 * (1 - li / 0.6), 0.45 * (1 - li / 0.6), 0.1 * (1 - li / 0.6)], 0.3);
      if (li < 0.1) R.light(tp, 30, [1, 0.7, 0.5], 5 * (1 - li / 0.1));
      for (let i = 0; i < 12; i++) {
        const life = 0.16 + hash(n * 7 + i) * 0.3; if (li > life) continue;
        const u = li / life, d = randDir([0, 0, 0], n * 5.3 + i * 2.1), b = 4 * (1 - u) * (1 - u);
        spark(R, madd(tp, d, (1.5 + 8 * hash(n + i * 3)) * easeOut(u)), 0.45 + 0.35 * (1 - u), [b, b * 0.7, b * 0.35]);
      }
    } else {
      const tp = strikePos(tf + 0.2, STRIKE[tgtK]).p;
      const to = V.add([0, 0, 0], tp, [(hash(n) - 0.5) * 16, (hash(n + 1) - 0.5) * 11, 0]);   // wide
      const dir = V.norm([0, 0, 0], V.sub([0, 0, 0], to, from)), sp = V.dist(to, from) / 0.2, FAR = 4000;
      bolt(R, t, tf, tf + FAR / sp, from, madd(from, dir, FAR), 12, 0.2, [3, 1.2, 0.4], 1);
    }
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
  c.post.bloom = 0.3 + 0.3 * (t > 153.5 ? Math.exp(-(t - 153.5) * 2) : 0);
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
  const g = gundamState(t).pos;   // (follows him on his squared-up run — duel.js scene30Pos)
  const v = V.norm([0, 0, 0], V.sub([0, 0, 0], gundamState(Math.min(t + 0.25, 169.95)).pos, Math.min(t + 0.25, 169.95) > t + 0.01 ? g : gundamState(t - 0.25).pos));   // (his heading from where he goes next: before 163 the path is the unturned one)
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
  if (c.t >= 170 && c.t < 176.4) { c.post.motionBlur = 0; c.post.shakeBlur = 0; }   // the draw + load: crisp, no motion blur
  if (k.name.startsWith('D21') || k.name.startsWith('D16c')) { c.post.motionBlur = 0; c.post.shakeBlur = 0; }   // the Itano-circus one take and the rifle catch: crisp, no motion blur   // the Itano-circus one take: crisp, no motion blur
  if (k.name.startsWith('D12')) c.post.distort = 0;           // scene 45 (the dive): no screen distortion
                                   // (the strong fill + rim were for the mechs, which no longer take either — on the
  c.post.lensA = { enable: 0 };   // distant ships they only washed the hulls out white)   the well is far away: no background lensing (it smeared the planet into grey)
  // (2026-10-01: slow motion, bullet time and the Sandevistan no longer re-grade the picture — the shifts in saturation,
  // tint, vignette and contrast made the colour jump from cut to cut; they keep only their light streaks / fringing)
  if (k.slowmo) c.post.streak = 0.45;
  if (k.sande) c.post.ca = 0.004;
  { // bullet time: only the light streaks stretch while time crawls (no grade change)
    const bs = slowHit(FILM_NOW);
    if (bs > 0) c.post.streak = Math.max(c.post.streak ?? 0.22, lerp(0.22, 0.45, bs));
  }

  // ---- the second RONIN from above (180.9–184.4): sensor spike → a silhouette against the light → the dive
  {
    const t = c.t, R = c.R;
    drawSlash(R, c, t);                                        // the pass-cut (CUT_T)
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
  // over the lance's shoulder: high behind the emitter and a little to the side, looking straight at the mothership
  // (the barrel runs up from the bottom of the frame toward it); the lens tightens so the target reads — ~35 % of the
  // frame width — instead of a speck hidden behind the barrel
  const back = V.norm([0, 0, 0], V.sub([0, 0, 0], em, hit));
  const sideV = V.norm([0, 0, 0], V.cross([0, 0, 0], back, [0, 1, 0]));
  const cp = addv(madd(madd(em, back, 62 - u * 12), sideV, 16), [0, 20, 0]);
  const dist = V.dist(cp, hit), ang = 650 / dist / 0.35;                 // horizontal field for the ship at 35 %
  const fovV = Math.min(34, Math.max(6, 2 * Math.atan(Math.tan(ang / 2) / (16 / 9)) / DEG)) * (1 - 0.12 * u);   // slow push
  camLook(c, cp, lerpv(cp, hit, 0.98), fovV, 0);
  handheld(c, 0.08);
  shake(c, 0.1 + u * 0.3, 6);
  c.post.lensB = { enable: 1, pos: em, thetaE: 0.08 + 0.05 * u, horizon: 0, swirl: 0, glow: 0 };
  c.post.godray = { pos: em, intensity: 0.15 + 0.1 * u, decay: 0.955 };
  c.env.shadowRadius = 400;
});
shot(212, 216.35, 'S13c the charge peaks', (c) => {
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
shot(216.35, 218, 'S14a lance fires',   // (2026-10-03: from 216.35 — the lance leaving its bow cannon is seen in S13c first)
  (c) => {
  const { t, u } = c;
  const hit = motherPoint([0, 0, 0], t, LANCE_HIT);
  const em = GUN.dread ? dreadEmitter(c.R, t, GUN.dread) : dreadPos(t);
  const mid = lerpv(em, hit, 0.72);
  camLook(c, addv(hit, [520, 180, -700]), lerpv(hit, em, 0.25), 55, 0.1);
  shake(c, 1.4 * Math.exp(-(t - 216) * 1.2), 12);
  c.post.flash = t < 216.5 ? 0.8 : 0;
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
  camLook(c, madd(cam, dir, u * 30), V.lerp([0, 0, 0], addv(madd(S, dir, 260), [0, 6, 0]), addv(g.pos, [0, 6, 0]), 0.55), 48, 0.03);   // (following him out round the hull)
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
shot(263.3, 266.95, 'B2 the blade at ten times its output', (c) => {
  c.env.sunDisc = 0.12;
  const { t } = c;
  const g = gundamState(t);
  // beside him, a little ahead: the hilt comes up in both hands and the blade roars out, far past its length, at the dome
  camLook(c, addv(g.pos, [34 - (t - 265.1) * 3, 7, -10 + (t - 265.1) * 2]), addv(g.pos, [0, 5, 16]), 44, 0.06);
  const ig = Math.exp(-Math.max(0, t - 266.0) * 5) * (t > 266.0 ? 1 : 0);
  shake(c, 0.3 + 1.6 * ig, 16);
  c.post.flash = 0.1 * ig;
  c.env.rim = [0.6, 1.0, 1.9, 1.4]; c.env.fill = [0.3, 0.32, 0.4, 0.5];
  c.post.lensA = { enable: 0 };
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 200;
});
// the thrust: wide and low off his left, the whole blade and the dome's face in frame — he lunges, the tip goes in and
// the barrier cracks open from the point in one blow
shot(266.95, 268.05, 'B2b the thrust — one blow through the barrier', (c) => {
  c.env.sunDisc = 0.12;
  const { t } = c;
  const g = gundamState(t), P = addv(WELL, [g.pos[0] - WELL[0], g.pos[1] - WELL[1] + 4.2, -SHIELD_R]);
  camLook(c, addv(P, [-120 + (t - 266.95) * 8, 20, -70]), addv(P, [0, -2, -34]), 44, -0.05);   // (him, the whole blade and the dome's face)
  const hk = berserkHitK(t);
  shake(c, 0.25 + hk * 2.6, 16);
  c.post.flash = t > THRUST_T ? 0.2 * Math.exp(-(t - THRUST_T) * 8) : 0;
  c.post.shakeBlur = 0.003 * hk;
  c.env.rim = [0.6, 1.0, 1.9, 1.6]; c.env.fill = [0.3, 0.32, 0.4, 0.5];
  c.post.lensA = { enable: 0 };
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 200;
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
  // two-handed ram (saber levelled, body behind it) driving into the core
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
  // the saber drives into the core: crater flash, shock ring, sparks and plates thrown back at the camera
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
      spark(R, p, 0.7 + 0.6 * (1 - a), [5 * (1 - a), 2.5 * (1 - a), 1 * (1 - a)]);
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
shot(292, 300.35, 'S19a main cannon charge', (c) => {
  const { t, u } = c;
  const mc = mainCannon(c.R, t);
  const fwd = rotY([0, 0, 0], [0, 0, 1], motherYaw(t));
  camLook(c, addv(madd(mc, fwd, 140 - u * 60), [90, 40 - u * 10, 0]), madd(mc, fwd, -120), 46, 0.06);
  handheld(c, 0.4);
  c.env.shadowCenter = mc; c.env.shadowRadius = 260;
});
shot(300.35, 303, 'S19b FIRE',   // (from 300.35: the beam leaving the muzzle is seen in S19a first)
  (c) => {
  const { t, u } = c;
  const mc = mainCannon(c.R, t);
  const d = dreadPos(t);
  camLook(c, addv(lerpv(mc, d, 0.1), [520, 240, 60]), lerpv(mc, d, 0.4), 52, -0.1);
  shake(c, 1.6 * Math.exp(-(t - 300) * 1.5), 14);
  c.post.flash = t < 300.5 ? 0.7 : 0;
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
  c.env.stars = 0.6 + k2 * 0.3;
  // the sun comes up over Earth's limb: eased round from F2's sun onto the sunrise point while the camera is on the fleet
  // and the limb, its disc up for the rise (the camera passes straight through it) and gone as we turn to the title
  // (only the DISC moves onto the sunrise point: the light and the atmosphere keep F2's sun, so Earth's limb stays blue)
  const sk = smooth(360.5, 365.5, t);
  c.env.sunDir = SUN_HOME;
  c.env.sunDiscDir = V.norm([0, 0, 0], V.lerp([0, 0, 0], SUN_HOME, S, sk));
  c.env.sunDisc = Math.max(1 - smooth(359, 362, t), sk) * (1 - smooth(369.6, 371.6, t));
  c.post.exposure = lerp(0.9, 0.75, smooth(362, 366.5, t));             // (a hard 0.9 -> 0.75 at 358 read as a lighting jump)
  c.post.fade = 1 - smooth(391.5, 393.3, t);
  { const vis = sat((V.dot(dir, c.env.sunDiscDir) - 0.82) / 0.16) * c.env.sunDisc;   // lens flare while the sun is in frame
    c.post.flare = vis > 0.001 ? { pos: madd(pos, c.env.sunDiscDir, 150000), intensity: 1.3 * vis } : null; }
  c.post.streak = lerp(0.22, 0, smooth(362, 366.5, t));             // continuous with F2's default at the cut
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
/** dev: render the frame at a STORY time (also inside spans the film cuts out) */
export const frameStory = (R, story) => { STORY_AT = story; try { return frame(R, filmT(story)); } finally { STORY_AT = null; } };
let STORY_AT = null;
export function frame(R, film) {
  FILM_NOW = film;
  const t = STORY_AT ?? storyT(film);                                 // (includes the duel's bullet time — timemap.js)
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
  if (t >= 120 && t < 150.6) { ctx.post.motionBlur = 0; ctx.post.shakeBlur = 0; }
  if (t >= EARTH_T) { ctx.post.saturation = 0.9; ctx.post.contrast = 1.08; ctx.post.gradeShadows = [0.92, 0.98, 1.06]; ctx.post.gradeHighlights = [1.08, 1.0, 0.9]; }   // (home keeps its original grade)   // the fighters' dogfight (120–150.6): crisp, no motion blur
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
    const g = gundamState(wt);
    if (g.berserk) ctx.post.berserk = Math.max(ctx.post.berserk || 0, g.berserk * (0.35 + 0.65 * berserkHitK(wt)));
  }
  if (ctx.hangar) {
    R._time = t;
    drawHangar(R, t, ctx.hangar);
    const gs = gundamHangarState(t, ctx.hangar);
    drawGundam(R, t, gs, { noTrail: true });
  }
  if (globalThis.__camMod) globalThis.__camMod(ctx, t);   // (dev: a test camera for CDP checks — unset in the film)
  return ctx;
}

// ---------------- the enemy ion bolt Sigma dodges on the launch run (duel.js DODGE): aimed at where he WOULD have been
// (his undodged path) from far ahead, at ion-bolt speed; he rolls out sideways and it tears through the empty space
function drawDodgeBolt(R, t) {
  const T = DODGE.t;
  if (t < T - 0.62 || t > T + 0.9) return;
  const hs = duelHero(T), fwd = V.norm([0, 0, 0], hs.fwd), r = dodgeRight(T);
  const aim = V.add([0, 0, 0], gundamLaunchPath(T), [0, 3, 0]);                  // his chest on the undodged path
  const dir = V.norm([0, 0, 0], V.add([0, 0, 0], V.scale([0, 0, 0], fwd, -0.9), V.scale([0, 0, 0], r, -0.35)));   // from ahead, a little right
  const a = madd(aim, dir, -1300 * 0.62), b = madd(aim, dir, 1300 * 1.5);
  bolt(R, t, T - 0.62, T + 1.5, a, b, 70, 2.2, [3.4, 0.7, 0.4], 1.8);
  const hp = V.lerp([0, 0, 0], a, b, (t - (T - 0.62)) / 2.12);
  R.glow(hp, 16, [2.2, 0.5, 0.25], 0.5); R.light(hp, 90, [1, 0.3, 0.15], 4);   // it lights him as it goes past
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
  const tear = smooth(THRUST_T, 268.0, t);   // the hole the blade burns open
  let lastHit = -1; for (const h of B_HITS) if (t >= h) lastHit = h;
  const hitAge = lastHit < 0 ? 9 : t - lastHit;
  // at 268 the whole grid lights once and dies away (the barrier collapses)
  const flash = 0;                                          // (the old whole-grid flash is replaced by the collapse wave)
  const alive = t < 268 ? sh.up : Math.exp(-Math.max(0, t - 268.9) * 4);
  const collapse = t >= 268 ? t - 268 : 0;
  R.shield(WELL, SHIELD_R, iuv, flash, t >= 268 ? 1 : tear, hitAge, [0.35, 0.7, 1.8], alive * (0.9 + tear * 0.5) * near, collapse);
  if (t > THRUST_T && t < 268.4) {   // the tip in the barrier: a blinding point, lightning racing out across the dome from it
    const lt = t - THRUST_T, P = addv(WELL, [g.pos[0] - WELL[0], g.pos[1] - WELL[1] + 4.2, -SHIELD_R]), k = (0.6 + 0.4 * smooth(0, 0.58, lt)) * (1 - smooth(0.58, 0.98, lt));
    R.glow(P, 8 + 18 * k, [2.5 * k, 4 * k, 8 * k], 0.5); R.light(P, 260, [0.5, 0.8, 1.6], 30 * k);
    if (lt < 0.5) R.ripple(P, 10 + 120 * easeOut(lt / 0.5), [0.3, 0.5, 1], (1 - lt / 0.5) * 1.5);
    for (let a = 0; a < 16; a++) {   // jagged arcs along the surface, re-rolled every few frames, reaching further as it gives
      const sd = a * 7.31 + Math.floor(t * 40) * 1.7, th = a / 16 * 2 * Math.PI + (hash(sd) - 0.5) * 0.4, len = (20 + 70 * hash(sd + 1)) * (0.4 + 0.6 * smooth(0, 0.58, lt));
      let prev = P;
      for (let j = 1; j <= 6; j++) {
        const r = len * j / 6, q = [P[0] + Math.cos(th) * r + (hash(sd + j) - 0.5) * r * 0.25, P[1] + Math.sin(th) * r + (hash(sd + j + 9) - 0.5) * r * 0.25, 0];
        q[2] = WELL[2] - Math.sqrt(Math.max(0, SHIELD_R * SHIELD_R - (q[0] - WELL[0]) ** 2 - (q[1] - WELL[1]) ** 2));   // (on the dome)
        R.beam(prev, q, 0.25 * k, [2 * k, 3.2 * k, 6 * k], 1, 12); prev = q;
      }
    }
  }
  if (t > THRUST_T - 0.03 && t < 268.6) {   // the barrier pierced: space itself buckles round the point (shape 16)
    const lt = t - THRUST_T, P = addv(WELL, [g.pos[0] - WELL[0], g.pos[1] - WELL[1] + 4.2, -SHIELD_R]);
    const k = smooth(-0.03, 0.08, lt) * (1 - smooth(0.9, 1.18, lt));
    R.anomaly(P, 28 + 70 * easeOut(sat(lt / 0.9)), [0.6, 0.45, 1.2], 1.6 * k, 5);
    R.anomaly(P, 14 + 20 * sat(lt / 0.5), [0.9, 0.6, 1.4], 2.2 * k, 9);   // (the tighter knot right at the tip)
  }
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
    // the lance keeps ITS purple in every shot: a shot that drains the colour (S14b 'tinnitus', saturation 0.35–0.75)
    // would turn it white, so its chroma is pre-boosted by 1 / saturation (the rest of the frame stays drained)
    const satK = Math.pow(1 / Math.max(0.3, c?.post?.saturation ?? 1), 1.4);
    const LC = (() => { const l = (LANCE_COL[0] + LANCE_COL[1] + LANCE_COL[2]) / 3; return LANCE_COL.map((v) => Math.max(0, l + (v - l) * satK)); })();
    // seen up close (S14b / S15) the white-hot core filled the frame and clipped to white: dim it with camera distance
    const cp = c?.cam?.pos, segD = (() => { if (!cp) return 1e4; const d = V.sub([0, 0, 0], end, em), L2 = V.dot(d, d) || 1, u = clamp(V.dot(V.sub([0, 0, 0], cp, em), d) / L2, 0, 1); return V.dist(cp, madd(em, d, u)); })();
    const nearK = clamp(segD / 500, 0.45, 1);   // close up the core is dimmed a little so it stays in colour
    // (the beam shader adds a fixed white core ∝ intensity on top of the tint: scale the intensity, not the tint)
    R.beam(em, end, 5 * k, [LC[0] * k, LC[1] * k, LC[2] * k], 1.1 * nearK, 36, 3.5, 1.5);
    // wide violet halo: faint through the INTENSITY (the beam shader's white core scales with it — a tiny tint at full
    // intensity made this 14 m halo a white beam, which is what turned the lance white in the close shots)
    R.beam(em, end, 14 * k, [LC[0] * k, LC[1] * k, LC[2] * k], 0.05, 2, 3, 0.6);
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
        if (prev) R.beam(prev, p, 1.2 * k, [LC[0] * k, LC[1] * 1.1 * k, LC[2] * k], nearK, 14);
        prev = p;
      }
    }
    if (reach >= 1) {
      R.glow(hit, 60 * k, [2.5 * k * satK, 1.4 * k, 3 * k * satK], 0.5);
      R.light(hit, 170, [1, 0.5, 1.2], 6 * k);                   // lights the wound only (900 m washed the whole flagship white)
      // glancing blow: the deflected beam carries on off the hull at the mirrored angle, spraying molten sparks
      const n = V.norm([0, 0, 0], V.sub([0, 0, 0], motherPoint([0, 0, 0], t, [LANCE_HIT[0] + 10, LANCE_HIT[1], LANCE_HIT[2]]), motherPoint([0, 0, 0], t, LANCE_HIT)));
      // glances OFF — kicked out away from the hull and up, so it never runs on through the ship's side structure
      const upM = V.norm([0, 0, 0], V.sub([0, 0, 0], motherPoint([0, 0, 0], t, [LANCE_HIT[0], LANCE_HIT[1] + 10, LANCE_HIT[2]]), motherPoint([0, 0, 0], t, LANCE_HIT)));
      const dn = V.dot(dir, n), rdir = V.norm([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], dir, n, -2 * dn), n, 2.2), upM, 0.8));
      const kr = k * Math.min(1, (lt - 0.9) / 0.15);
      const rEnd = madd(hit, rdir, 60000 * Math.min(1, (lt - 0.9) / 0.6));   // flies on out to the end of space
      R.beam(hit, rEnd, 3.2 * kr, [LC[0] * 0.8 * kr, LC[1] * 0.8 * kr, LC[2] * 0.8 * kr], 1.1 * nearK, 30, 3, 1.2);
      R.beam(hit, rEnd, 10 * kr, [LC[0] * kr, LC[1] * kr, LC[2] * kr], 0.04, 2, 3, 0.6);
      for (let i = 0; i < 40; i++) {
        const sd = V.norm([0, 0, 0], V.madd([0, 0, 0], V.madd([0, 0, 0], randDir([0, 0, 0], i * 3.3 + Math.floor(t * 8)), rdir, 1.6), n, 0.6));
        const ph = ((t * 3 + hash(i)) % 1), p = madd(hit, sd, 10 + ph * 140), q = madd(p, sd, -12 * (1 - ph));
        spark(R, p, 3 + 3 * (1 - ph), [5 * (1 - ph) * k, 2 * (1 - ph) * k, 0.6 * (1 - ph) * k]);
      }
    }
  }
  // mothership hit explosions chain
  const chain = [[216.9, [64, 30, 70], 55], [218.2, [62, -15, 0], 38], [219.4, [60, 34, -10], 40], [221, [58, -20, 95], 36], [223, [62, 40, 60], 30]];   // secondary blasts along the scorched flank
  fxOpts.noRipple = true;   // (no space distortion round the torn flank)
  for (const [t0, lp, sz] of chain) explosion(R, t, t0, motherPoint([0, 0, 0], t0, lp), sz, t0 * 3, 'ship', 3.5);   // light the flank locally, not the whole ship
  fxOpts.noRipple = false;
  // main cannon
  if (t > MAIN_CHARGE && t < MAIN_FIRE + 5) {
    const mc = mainCannon(R, t);
    const fwd = rotY([0, 0, 0], [0, 0, 1], motherYaw(t));
    if (t < MAIN_FIRE) {
      const k = smooth(MAIN_CHARGE, MAIN_FIRE, t);
      // the charge: an energy sphere inside the bore (inner r 7.2 m; it sits on the emitter ring 2.4 m inside the
      // muzzle), brightening and swelling — never wider than the bore, nothing drawn in from around the ship
      const pulse = 0.88 + 0.12 * Math.sin(t * (8 + 26 * k));
      R.orb(madd(mc, fwd, -2.4), 0.8 + 6.0 * Math.pow(k, 0.8), [0.5, 0.95, 2.2], (0.3 + 2.8 * k) * pulse, 5);
      R.light(mc, 500, ION_COL, 15 * k);
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
cut(121.8, 123.6, 'X enemy fire over the line', (c) => { lineRide(c, 4, 0.2, -30, 18, 48, 0.1); shake(c, 0.5, 9); });   // outboard: the flagship's turned flank (motherYaw) filled the inboard side
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
  // (recomposed: high three-quarter looking down across the battle, the planet's curve big behind it, a slow push)
  againstPlanet(c, [30, 0, -680], 820 - u * 140, 260, 520, 44, -0.12, 0.1, true);
  handheld(c, 0.4); c.env.shadowRadius = 900; c.env.shadowCenter = [0, 0, -700];
  // (against the planet the hulls face away from the key: a soft fill + rim and a stop more so they read)
  c.env.fill = [0.5, 0.52, 0.6, 0.7]; c.env.rim = [0.7, 0.72, 0.85, 0.8]; c.post.exposure = 1.3;
});
cut(196.8, 200, 'X wide over the planet', (c) => {
  const { t, u } = c;
  againstPlanet(c, [0, 0, -900], 1500, 80, -500 + u * 80, 38, -0.05, 0.05, true);
  handheld(c, 0.3); c.env.shadowRadius = 1000; c.env.shadowCenter = [0, 0, -800];
});
cut(308.4, 310, 'X tracers into the wreck', (c) => { lineRide(c, 10, 0.8, 26, 14, 52, -0.1); shake(c, 0.4, 8); });
SHOTS.unshift(...CUTS);
