// Shot list: camera + shot-specific content for every second of the film.
import { M, V, Q, hash, noise1, sat, smooth, ease, easeOut, easeIn, easeInOut, lerp, spline, DEG, clamp } from './math.js';
import { explosion, hyperWindow, engineGlows, emitWorld, bolt, hitFlash, trail, randDir } from './fx.js';
import {
  drawWorld, mat, matEuler, motherMatrix, motherPoint, motherYaw, ionFrigate, assaultFrigate, enemyFrigate, dreadPos, dreadEmitter,
  WELL, DREAD, HANGAR, BC, GC, IONF, ASF, EF, GUN, POSES, blendPose, breathe, gundamLaunchPath, fighterPos, PAIRS,
  HIIG_ENGINE, ENEMY_ENGINE, HYPER_BLUE, HYPER_RED, ION_COL, LANCE_COL, BEAM_PINK, LANCE_FIRE, MAIN_FIRE, IMPLODE, LANCE_HIT, DREAD_DIE,
  modelLen, modelSize, ionMuzzle, missilePos, MISSILES, debrisOnly, allParts, rotY,
  EXTRA_H, EXTRA_E, extraHPos, extraEPos,
} from './world.js';

export const DURATION = 372;
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
    time: t, sunDir: SUN, sunCol: [2.05, 1.78, 1.42], ambUp: [0.05, 0.06, 0.09], ambDown: [0.05, 0.08, 0.14], ambient: 1,
    rim: [0.45, 0.62, 0.95, 0.75], fill: [0.22, 0.24, 0.3, 0.35], nebula: 0.22, stars: 1, sunDisc: 1,
    planet: { dir: PLANET, radius: PL_R, col: [0.3, 0.5, 1.0], earth: true },
    shadows: true, shadowCenter: [0, 0, 0], shadowRadius: 400,
  };
}
function basePost() {
  return {
    exposure: 0.9, bloom: 0.022, ca: 0.0006, grain: 0.008, fade: 1, flash: 0, letterbox: 1, vignette: 0.8,
    distort: 1, streak: 0.22, saturation: 0.92, contrast: 1.22, gradeShadows: [0.88, 0.98, 1.08], gradeHighlights: [1.12, 1.0, 0.86],
    shakeBlur: 0, lensA: null, lensB: null, godray: null,
  };
}

// ------------------------------------------------------------------ camera helpers
function camLook(ctx, pos, target, fov = 45, roll = 0) {
  const c = ctx.cam;
  V.copy(c.pos, pos); V.copy(c.target, target);
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
  return { enable: 1, pos: WELL, thetaE: Math.min(0.5, Math.sqrt(2 * Rs / d) / fov * 0.5), horizon: horizon ? Math.min(0.35, 2.6 * Rs / d / fov * 0.5) : 0, swirl, glow };
}
// the well switches on at 70.0 in one violent step (small precursor 63–70), second pulse at 74.5
function wellOn(t) { return 0.12 * smooth(63, 69.5, t) + 0.6 * easeOut(sat((t - 70) / 0.9)) + 0.28 * easeOut(sat((t - 74.5) / 0.8)); }
function wellMass(t) { return 25 * wellOn(t) * (t > 262 ? 1 + smooth(262, 278, t) * 0.8 : 1) * (t > IMPLODE - 2 ? Math.max(0, 1 - (t - (IMPLODE - 2)) / 2) : 1); }

// ------------------------------------------------------------------ mobile suits
const tmpM = M.new();

export function gundamState(t) {
  const s = { vis: true, pos: [0, 0, 0], fwd: [0, 0, -1], roll: 0, pitch: 0, pose: {}, saber: 0, saberLen: 16, thr: 0.4, damage: 0, eye: 1 };
  if (t < 159.5 || (t > 292 && t < 320) || t > 346) { s.vis = false; return s; }
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
    s.pos = addv(CP, [6, -4 + Math.sin(t * 0.7), -34]);
    const u = easeInOut(sat((t - 229) / 6));
    s.fwd = [Math.sin(u * Math.PI) * 1, 0, -Math.cos(u * Math.PI)];
    blendPose('stand', 'flight', smooth(237.5, 240, t), s.pose);
    breathe(s.pose, t, 1 - u);
    s.thr = 0.3 + smooth(238, 239.5, t) * 0.7;
  } else if (t < 262) {
    const start = addv(CP, [6, -4, -34]);
    const end = addv(WELL, [0, -10, -260]);
    const u = (t - 240) / 22;
    const e = u < 0.2 ? 0.5 * (u / 0.2) * (u / 0.2) * 0.2 : 0.02 + (u - 0.2) / 0.8 * 0.98 * (1 - 0.35 * Math.pow((u - 0.2) / 0.8, 3)) + 0.35 * Math.pow((u - 0.2) / 0.8, 3) * 0.98 * ((u - 0.2) / 0.8);
    s.pos = lerpv(start, end, clamp(e, 0, 1));
    s.pos[0] += Math.sin(t * 0.9) * 20 * (1 - u); s.pos[1] += Math.sin(t * 0.6) * 15 * (1 - u);
    s.fwd = V.sub([0, 0, 0], end, start);
    blendPose('flight', 'flight', 0, s.pose);
    s.pitch = 0.9 * (1 - smooth(258, 262, t)); s.thr = 1;
    s.roll = Math.sin(t * 0.5) * 0.25;
  } else if (t < 278) {
    const a = addv(WELL, [0, -10, -260]), b = addv(WELL, [0, 0, -175]), c = addv(WELL, [0, 5, -95]);
    s.pos = t < 272.4 ? lerpv(a, b, easeOut((t - 262) / 10)) : lerpv(b, c, easeOut(sat((t - 272.4) / 1.4)));
    s.pos[0] += noise1(t * 6) * 1.2; s.pos[1] += noise1(t * 7 + 3) * 1.2;
    s.fwd = [0, 0, 1];
    if (t < 272.4) blendPose('flight', 'maxSaber', smooth(263, 266, t), s.pose);
    else blendPose('maxSaber', 'bigSlash', sat((t - 272.4) / 0.9), s.pose);
    s.saber = smooth(265, 266.2, t);
    s.saberLen = 16 + 150 * smooth(266, 268, t);
    s.thr = 1; s.damage = 0.15 + smooth(262, 278, t) * 0.25;
  } else if (t < 292) {
    const u = easeOut(sat((t - IMPLODE) / 10));
    s.pos = lerpv(addv(WELL, [0, 5, -95]), addv(WELL, [40, 60, -1150]), t < IMPLODE ? 0 : u);
    s.fwd = [Math.sin(t * 1.3), Math.sin(t * 0.7) * 0.3, Math.cos(t * 1.3)];
    s.roll = t * 0.9;
    blendPose('bigSlash', 'limp', smooth(278, 281, t), s.pose);
    s.saber = 1 - smooth(279, 280, t);
    s.saberLen = 166 * (1 - smooth(277, 280, t)) + 16;
    s.thr = 0; s.damage = 0.22;
    s.eye = 0.6 + 0.4 * Math.sin(t * 30);
  } else if (t < 346) {
    const base = addv(WELL, [40, 60, -1150]);
    s.pos = addv(base, [Math.sin(t * 0.1) * 4, Math.sin(t * 0.13) * 3, -(t - 320) * 0.5]);
    s.fwd = [Math.sin(t * 0.05 + 1), 0.1, -Math.cos(t * 0.05 + 1)];
    s.roll = 0.3 + Math.sin(t * 0.07) * 0.2;
    blendPose('limp', 'flight', smooth(334, 338, t), s.pose);
    breathe(s.pose, t, 0.5);
    s.damage = 0.22;
    s.eye = t < 333 ? (hash(Math.floor(t * 12)) > 0.35 ? 0.9 : 0.1) * smooth(324, 326, t) : 1;
    s.thr = smooth(334, 336, t);
    if (t > 336) {
      const u = easeIn((t - 336) / 10);
      s.pos = addv(s.pos, [0, 0, -u * 900]);
      s.fwd = [0, 0.05, -1];
    }
  }
  return s;
}

const STRAFE = [addv(GC, [60, 10, 120]), addv(GC, [100, 40, 40]), addv(GC, [40, 70, -10]), addv(GC, [-30, 40, 20]), addv(GC, [-20, 30, 30])];
function strafePos(t) { return sp(STRAFE, sat((t - 170) / 10)); }
export function enemyMS1(t) {
  const s = { vis: t > 160 && t < 180.3, pos: [0, 0, 0], fwd: [0, 0, 1], pose: {} };
  s.pos = addv(GC, [-60 + 50 * Math.sin(1.3 * t), 20 + 30 * Math.sin(0.9 * t), -120 + 30 * Math.cos(1.1 * t)]);
  s.fwd = V.sub([0, 0, 0], t < 170 ? gundamLaunchPath(t) : strafePos(t), s.pos);
  blendPose('aim', 'aim', 0, s.pose);
  s.pose.torso = [0.1, 0.3, 0];
  return s;
}
export function enemyMS2(t) {
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

export function drawGundam(R, t, s, opts = {}) {
  if (!s.vis) return null;
  const e = R.add('gundam', msMatrix(tmpM, s));
  if (!e) return null;
  e.pose = s.pose; e.damage = s.damage; e.seed = 5.5;
  const eyeK = s.eye * (opts.eye ?? 1);
  e.matOverride = { eye: { base: [0.2, 0.9, 0.5], metal: 0, rough: 0.3, emissive: [0.5 * 2.5 * eyeK, 2.2 * 2.5 * eyeK, 1.2 * 2.5 * eyeK] } };
  if (s.thr > 0.02) engineGlows(R, 'gundam', e, [0.7, 0.9, 2.0], 0.55, s.thr, 1.2);
  const eye = emitWorld(R, 'gundam', e, 'eye');
  if (eye && eyeK > 0.05) R.glow(eye, 1.4 * eyeK, [0.8 * eyeK, 3 * eyeK, 1.6 * eyeK], 0.5);
  if (s.saber > 0) {
    const [a, b] = saberSegment(R, 'gundam', e, 'hand_L', s.saberLen * s.saber);
    const big = s.saberLen > 40;
    R.beam(a, b, big ? 5 + Math.sin(t * 40) * 0.5 : 0.55, BEAM_PINK, big ? 1.6 : 0.9, big ? 14 : 30, big ? 2.5 : 0.8, 1);
    R.beam(a, b, big ? 14 : 1.6, [BEAM_PINK[0] * 0.12, BEAM_PINK[1] * 0.12, BEAM_PINK[2] * 0.12], 1, 3, 0.4, 0.5);
    R.light(lerpv(a, b, 0.5), big ? 900 : 60, [1, 0.4, 0.8], big ? 18 : 6);
    GUN.saber = [a, b];
  } else GUN.saber = null;
  GUN.gundam = e;
  return e;
}
function drawEnemyMS(R, t, s, idx) {
  if (!s.vis) return null;
  const e = R.add('enemy_ms', msMatrix(tmpM, s));
  if (!e) return null;
  e.pose = s.pose; e.seed = 8 + idx;
  engineGlows(R, 'enemy_ms', e, ENEMY_ENGINE, 0.55, 0.8, 1.2);
  const eye = emitWorld(R, 'enemy_ms', e, 'eye');
  if (eye) R.glow(eye, 1.6, [3.5, 0.3, 1.2], 0.6);
  if (s.saber > 0) {
    const [a, b] = saberSegment(R, 'enemy_ms', e, 'hand_R', 14 * s.saber);
    R.beam(a, b, 0.55, SABER_ORANGE, 0.9, 30, 0.8, 1);
    R.light(lerpv(a, b, 0.5), 60, [1, 0.5, 0.2], 5);
  }
  return e;
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
function drawMSBattle(R, t) {
  const g = gundamState(t);
  const ge = drawGundam(R, t, g);
  const e1 = enemyMS1(t), e2 = enemyMS2(t);
  const ee1 = drawEnemyMS(R, t, e1, 1);
  drawEnemyMS(R, t, e2, 2);
  // rifle shots
  if (ge && t > 171 && t < 180.5) {
    const muzzle = R.models.gundam.empties.rifle_muzzle ? R.emptyWorld([0, 0, 0], 'gundam', ge, 'rifle_muzzle') : g.pos;
    GUN.muzzle = muzzle;
    for (const [t0, hit, off] of [[172, false, [18, 8, 0]], [174, false, [-14, -10, 6]], [176.5, false, [10, -12, -4]], [179, true, [0, 0, 0]]]) {
      if (t < t0 - 0.01 || t > t0 + 0.8) continue;
      const tg = addv(enemyMS1(t0 + 0.05).pos, off);
      tg[1] += 9;
      rifleShot(R, t, t0, muzzle, tg, hit);
    }
  }
  // E1 machine gun
  if (e1.vis && t > 172 && t < 178.5 && g.vis) {
    for (let k = 0; k < 24; k++) {
      const tf = 172 + k * 0.26;
      if (t < tf || t > tf + 0.5) continue;
      const from = addv(enemyMS1(tf).pos, [0, 10, 0]);
      const to = addv(gundamState(tf + 0.35).pos, [(hash(k) - 0.5) * 20, (hash(k + 3) - 0.5) * 16 + 8, (hash(k + 5) - 0.5) * 10]);
      bolt(R, t, tf, tf + 0.35, from, to, 14, 0.35, [3, 1.4, 0.4], 1);
    }
  }
  if (t > 179.1 && t < 180.3) hitFlash(R, t, 179.1, addv(enemyMS1(179.1).pos, [0, 9, 0]), 8, [1, 0.5, 0.3]);
  explosion(R, t, 180.2, addv(enemyMS1(180.2).pos, [0, 9, 0]), 16, 501, 'ship');
  // saber clash sparks
  if (t > 186 && t < 190.5) {
    const X = addv(CP, [0, 12, 0]);
    const k = 1 + Math.sin(t * 31) * 0.4;
    R.glow(X, 2.2 * k, [2.5, 1.6, 2], 0.5);
    R.light(X, 90, [1, 0.6, 0.7], 10 * k);
    for (let i = 0; i < 26; i++) {
      const per = 0.35 + hash(i) * 0.3;
      const ph = ((t - 186) / per + hash(i + 9)) % 1;
      const d = randDir([0, 0, 0], i * 3.1 + Math.floor((t - 186) / per + hash(i + 9)) * 5.3);
      const p = madd(X, d, ph * 26);
      const q = madd(X, d, ph * 26 - 3);
      const b = (1 - ph) * 4;
      R.beam(q, p, 0.12, [b, b * 0.7, b * 0.4], 1, 10);
    }
  }
  // cut through E2
  if (t > 192.4 && t < 194.2) {
    const P = addv(enemyMS2(t).pos, [0, 9, 0]);
    const k = sat((t - 192.4) / 0.2) * (1 - sat((t - 193.6) / 0.6));
    R.beam(addv(P, [-9, 7, 0]), addv(P, [9, -7, 0]), 0.8 * k, [3, 1.2, 2], 2, 20);
    R.light(P, 50, [1, 0.5, 0.3], 6 * k);
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
  const flick = on > 0 && on < 1 ? (hash(Math.floor(t * 20)) > 0.4 ? 1 : 0.3) : 1;
  const lampE = phase === 'launch' ? [6 * on * flick + 0.2, 5.6 * on * flick + 0.05, 5 * on * flick + 0.05] : [1.2, 0.15, 0.1];
  const guideE = phase === 'launch' ? [0.5, 2.5 * (0.3 + on), 4 * (0.3 + on)] : [1.5, 0.2, 0.1];
  e.matOverride = {
    lamp: { base: [0.9, 0.9, 0.9], metal: 0, rough: 0.4, emissive: lampE },
    guide: { base: [0.2, 0.4, 0.6], metal: 0, rough: 0.4, emissive: guideE },
  };
  e.seed = 2; e.emissive = 1;
  // lamp point lights along the ceiling
  for (let i = 0; i < 6; i++) {
    const z = -50 + i * 15;
    const lp = addv(HANGAR, [0, 18, z]);
    if (phase === 'launch') R.light(lp, 45, [1, 0.95, 0.85], 3.2 * on * flick);
    else R.light(lp, 40, [1, 0.12, 0.08], 1.2 * (0.6 + 0.4 * Math.sin(t * 3 + i)));
  }
  // cinematic key + fill on the mech in its cradle
  R.light(addv(HANGAR, [12, 12, 20]), 60, [1, 0.92, 0.85], phase === 'launch' ? 1.6 : 0.8);
  R.light(addv(HANGAR, [-10, 6, 10]), 50, [0.5, 0.6, 0.9], 0.9);
  {
  }
  // chasing guide lights toward the mouth
  if (phase === 'launch') {
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 18; i++) {
        const z = -55 + i * 5;
        const ph = ((t * 2.5 - i * 0.12) % 1 + 1) % 1;
        const k = Math.pow(1 - ph, 6) * on * 4;
        R.glow(addv(HANGAR, [side * 5, 0.4, z]), 0.8, [0.4 * k, 1.5 * k, 3 * k], 0.4);
      }
    }
  }
}

// ------------------------------------------------------------------ shots
function gundamHangarState(t, phase) {
  const s = { vis: true, pos: addv(HANGAR, [0, 9, 0]), fwd: [0, 0, 1], pose: {}, saber: 0, thr: 0, damage: 0, eye: 0, roll: 0, pitch: 0 };
  if (phase === 'standby') {
    blendPose('stand', 'stand', 0, s.pose);
    return s;
  }
  // launch: crouch on catapult, eyes ignite 153, catapult 158
  blendPose('stand', 'crouch', smooth(154.5, 156.8, t), s.pose);
  s.eye = smooth(153, 153.25, t);
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
shot(0, 7.5, 'S1a corporate card', (c) => {
  const { t } = c;
  camLook(c, [0, 0, 0], madd([0, 0, 0], PLANET, -1000), 40, 0.02);
  c.env.stars = smooth(1, 6, t) * 0.5; c.env.nebula = 0; c.env.sunDisc = 0; c.env.planet = null;
  c.post.fade = smooth(0.2, 2, t);
  c.world = false;
});
shot(7.5, 16, 'S1b sunrise over the limb', (c) => {
  const { t, u } = c;
  // look along the limb toward the rising sun; slow tilt
  const dir = V.norm([0, 0, 0], V.lerp([0, 0, 0], PLANET, SUN, 0.5 + u * 0.04));
  camLook(c, [0, 0, 0], madd([0, 0, 0], dir, 1000), 34, 0.18 - u * 0.05);
  c.env.stars = 0.6; c.env.sunDisc = smooth(9, 15, t) * 0.08;
  c.post.exposure = 0.8;
  c.post.fade = smooth(7.5, 9.5, t);
  c.post.godray = null;
  c.world = false;
  // a lone fighter streaks across the planet like the reference's opening
  const R = c.R;
  const p = madd(madd([0, 0, 0], dir, 900), V.norm([0, 0, 0], V.cross([0, 0, 0], dir, [0, 1, 0])), -500 + (t - 7.5) * 90);
  const e = R.add('interceptor', mat(M.new(), p, V.norm([0, 0, 0], V.cross([0, 0, 0], dir, [0, 1, 0]))));
  if (e) { R._time = t; engineGlows(R, 'interceptor', e, HIIG_ENGINE, 4, 1, 6); }
});
function hangarEnv(c, phase) {
  const e = c.env;
  e.sunCol = [0.25, 0.25, 0.3]; e.ambient = phase === 'launch' ? 1.6 * smooth(150, 151.5, c.t) + 0.3 : 0.45;
  e.ambUp = [0.06, 0.06, 0.07]; e.ambDown = [0.03, 0.03, 0.035];
  e.shadows = false; e.sunDisc = 0; e.planet = null; e.fill = [0.12, 0.12, 0.14, 0.3];
  e.rim = phase === 'launch' ? [0.3, 0.45, 0.8, 0.35] : [0.8, 0.12, 0.1, 0.35];
}
// ---- escorts: three interceptors cruising slowly near the arrival point (scale reference, Dune-style)
function escortPos(t, k) {
  return [-40 + k * 26 + Math.sin(t * 0.3 + k) * 2, -95 + k * 7 + Math.sin(t * 0.4 + k * 2) * 1.5, 120 + (t - 16) * 9 - k * 18];
}
function drawEscorts(R, t, n = 3, scaleGlow = 0.8) {
  for (let k = 0; k < n; k++) {
    const e = R.add('interceptor', mat(M.new(), escortPos(t, k), [0, 0, 1], [0, 1, 0], Math.sin(t * 0.5 + k) * 0.1));
    if (e) { R._time = t; engineGlows(R, 'interceptor', e, HIIG_ENGINE, scaleGlow, 1, 4); }
  }
}
shot(16, 30, 'A2 THE ARRIVAL', (c) => {
  const { t, u, R } = c;
  drawEscorts(R, t);
  // low camera just behind the escorts, looking back/up at the window; slow tilt up as the prow passes overhead
  const e0 = escortPos(t, 1);
  const pos = V.add([0, 0, 0], e0, [18, -10, 34]);
  const lookZ = lerp(-300, 260, easeInOut(sat((t - 19) / 11)));
  const lookY = lerp(-10, 90, easeInOut(sat((t - 21) / 9)));
  camLook(c, pos, [0, lookY, lookZ], lerp(46, 58, easeInOut(sat((t - 22) / 8))), 0.04);
  handheld(c, 0.12);
  c.env.shadowCenter = [0, 0, lookZ * 0.5]; c.env.shadowRadius = 420;
  c.post.fade = smooth(16, 17.2, t);
  c.env.fill = [0.3, 0.32, 0.4, 0.4];
});
shot(30, 40, 'A3 belly pass', (c) => {
  const { t, u, R } = c;
  const b = R.models.mothership.bounds;
  // dolly slowly under the hull from bow to stern, looking up; interceptors cross underneath
  const z = lerp(b.max[2] + 40, b.min[2] + 60, easeInOut(u));
  camLook(c, motherPoint([0, 0, 0], t, [b.min[0] * 0.35, b.min[1] - 55, z]), motherPoint([0, 0, 0], t, [b.min[0] * 0.1, b.min[1] + 20, z - 160]), 62, 0.12);
  handheld(c, 0.1);
  for (let k = 0; k < 3; k++) {
    const p = motherPoint([0, 0, 0], t, [-60 + k * 30, b.min[1] - 30 - k * 4, z + 120 - (t - 30) * 30 - k * 15]);
    const e = R.add('interceptor', mat(M.new(), p, rotY([0, 0, 0], [0, 0, -1], motherYaw(t))));
    if (e) engineGlows(R, 'interceptor', e, HIIG_ENGINE, 0.7, 1, 4);
  }
  c.env.shadowCenter = motherPoint([0, 0, 0], t, [0, 0, z]); c.env.shadowRadius = 260;
  c.env.fill = [0.35, 0.37, 0.45, 0.5];
});
shot(40, 46, 'A4 fleet assembles', (c) => {
  const { t, u } = c;
  againstPlanet(c, [-40, 0, 250], 1050 - u * 60, 110, 300, 42, -0.04);
  c.env.shadowCenter = [0, 0, 250]; c.env.shadowRadius = 520;
  c.env.fill = [0.4, 0.42, 0.5, 0.5]; c.env.rim = [0.6, 0.75, 1.1, 1.0];
});
shot(46, 50, 'A5 frigate through window', (c) => {
  const { t, u } = c;
  const f = IONF[3];
  const L = modelLen(c.R, 'ion_frigate');
  camLook(c, addv(f.p, [85 - u * 20, 18, -L * 0.3 + u * 30]), addv(f.p, [0, 0, -L * 0.4 + u * L * 0.6]), 46, 0.08);
  handheld(c, 0.3);
  c.env.shadowCenter = f.p; c.env.shadowRadius = 90;
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
  const pos = motherPoint([0, 0, 0], t, [26, 34, -L * 0.05 + u * 30]);
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
  c.env.planet = { dir: V.norm([0, 0, 0], [0.12, -0.3, 1]), radius: 0.42, col: [0.3, 0.5, 1.0], earth: true };
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
});
shot(100, 110, 'B4 standoff', (c) => {
  const { t, u } = c;
  againstPlanet(c, [0, 0, -400], 1500 - u * 150, 260, -420 + u * 60, 40, 0.04, 0.05, true);
  c.env.shadowCenter = [0, 0, -400]; c.env.shadowRadius = 900;
});
shot(110, 120, 'B5 ion muzzle charge', (c) => {
  const { t, u } = c;
  const st = ionFrigate(t, 0);
  const L = modelLen(c.R, 'ion_frigate');
  const m = ionMuzzle(c.R, t, 0);
  const side = V.norm([0, 0, 0], V.cross([0, 0, 0], st.fwd, [0, 1, 0]));
  camLook(c, madd(madd(m, st.fwd, -L * 0.45 + u * 10), side, 30 + u * 4).map((v, i) => v + (i === 1 ? 12 : 0)), madd(m, st.fwd, 12), 44, 0.06);
  handheld(c, 0.3);
  c.env.shadowCenter = st.pos; c.env.shadowRadius = 70;
  const R = c.R;
  const k = sat((t - 110) / 10);
  for (let i = 0; i < 50; i++) {
    const s2 = i * 2.7;
    const per = 0.8 + hash(s2) * 0.5;
    const ph = ((t - 110) / per + hash(s2 + 1)) % 1;
    const dd = randDir([0, 0, 0], s2 + Math.floor((t - 110) / per + hash(s2 + 1)) * 3.1);
    const r0 = 40 * (1 - ph);
    R.beam(madd(m, dd, r0 + 5), madd(m, dd, r0), 0.15, [0.5 * k * ph * 3, 0.9 * k * ph * 3, 2 * k * ph * 3], 1, 10);
  }
  R.glow(m, 3 + k * 7, [0.8 * k * 2, 1.3 * k * 2, 2.4 * k * 2], 0.5);
  R.light(m, 60, ION_COL, 6 * k);
});
shot(120, 123.6, 'S9a volley', (c) => {
  const { t, u } = c;
  camLook(c, [-330 + u * 30, 60, -60 - u * 60], [60, 0, -760], 50, -0.12);
  shake(c, t < 121 ? 1.2 * (1 - (t - 120)) : 0.15, 9);
  c.post.flash = t < 120.15 ? 0.6 * (1 - (t - 120) / 0.15) : 0;
  c.env.shadowCenter = [-150, 0, 0]; c.env.shadowRadius = 400;
  c.post.streak = 0.4;
});
shot(123.6, 127.8, 'S9b enemy frigate dies', (c) => {
  const { t, u } = c;
  const p = EF[0].p;
  camLook(c, addv(p, [230 - u * 40, 70, 260 - u * 30]), addv(p, [30, 0, 0]), 40);
  shake(c, t > 124 && t < 125.5 ? 0.9 : 0.1, 8);
  c.env.shadowCenter = p; c.env.shadowRadius = 200;
});
shot(127.8, 134, 'S9c wide battle', (c) => {
  const { t, u } = c;
  camLook(c, [700 - u * 100, 320, -300], [0, 0, -700], 38, 0.06);
  handheld(c, 0.3);
  c.env.shadowRadius = 700; c.env.shadowCenter = [0, 0, -500];
});
// interceptor strafing run along the enemy line, chased by a red fighter (scripted so it always reads)
function strafeRun(t) { return [-520 + (t - 134) * 150, 40 + Math.sin(t * 1.3) * 18, -980 + Math.sin(t * 0.7) * 30]; }
shot(134, 141, 'S10a dogfight chase', (c) => {
  const { t, R } = c;
  const a = strafeRun(t), v = V.norm([0, 0, 0], V.sub([0, 0, 0], strafeRun(t + 0.05), a));
  const roll = Math.sin(t * 1.7) * 0.7;
  const e = R.add('interceptor', mat(M.new(), a, v, [0, 1, 0], roll));
  if (e) { R._time = t; engineGlows(R, 'interceptor', e, HIIG_ENGINE, 0.6, 1, 3); }
  const b = strafeRun(t - 0.35); b[1] += 6; b[0] -= 4;
  const ef = R.add('enemy_fighter', mat(M.new(), b, v, [0, 1, 0], -roll));
  if (ef) engineGlows(R, 'enemy_fighter', ef, ENEMY_ENGINE, 0.6, 1, 3);
  // enemy fighter's guns
  for (let k = 0; k < 10; k++) {
    const tf = 134 + k * 0.62;
    const from = V.add([0, 0, 0], strafeRun(tf - 0.35), [-4, 6, 0]);
    const to = V.add([0, 0, 0], strafeRun(tf + 0.1), [(hash(k) - 0.5) * 10, (hash(k + 1) - 0.5) * 8, 0]);
    bolt(R, t, tf, tf + 0.2, from, to, 12, 0.18, [3, 1.2, 0.4], 1);
  }
  const cam = V.add([0, 0, 0], V.madd([0, 0, 0], a, v, -26), [2, 7, 8]);
  camLook(c, cam, V.madd([0, 0, 0], a, v, 30), 52, roll * 0.4);
  shake(c, 0.35, 12);
  c.env.shadowCenter = a; c.env.shadowRadius = 60;
  c.post.shakeBlur = 0.0006;
});
shot(141, 145, 'S10b missiles', (c) => {
  const { t, u } = c;
  const tg = EF[2].p;
  camLook(c, addv(tg, [-160 + u * 30, 90, 330 - u * 50]), addv(tg, [0, 10, 40]), 44, -0.05);
  shake(c, t > 141 && t < 142.2 ? 0.8 : 0.15, 8);
  c.env.shadowCenter = tg; c.env.shadowRadius = 150;
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
  c.post.shakeBlur = t > 157.9 ? 0.002 : 0;
});
shot(159.4, 163, 'S11d fly-by', (c) => {
  const { t, u } = c;
  const g = gundamLaunchPath(Math.max(t, 159.6));
  const exitW = motherPoint([0, 0, 0], t, GUN.exitLocal || [60, 0, 0]);
  const cp = addv(gundamLaunchPath(162.2), [-18, 14, 60]);
  camLook(c, cp, addv(lerpv(exitW, g, 0.2 + 0.8 * smooth(159.5, 160.5, t)), [0, 6, 0]), 44, 0.04);
  shake(c, t > 161.4 && t < 162.6 ? 0.6 : 0.1, 10);
  c.env.shadowCenter = g; c.env.shadowRadius = 120;
});
shot(163, 170, 'S11e chase to battle', (c) => {
  const { t, u } = c;
  const g = gundamLaunchPath(t);
  const g2 = gundamLaunchPath(t - 0.25);
  const v = V.norm([0, 0, 0], V.sub([0, 0, 0], g, g2));
  camLook(c, addv(madd(g, v, -38), [8, 10, 0]), madd(g, v, 200), 52, Math.sin(t * 0.7) * 0.15);
  shake(c, 0.2, 9);
  c.env.shadowCenter = g; c.env.shadowRadius = 70;
});
shot(170, 176, 'S12a rifle strafing', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  const e1 = enemyMS1(t).pos;
  camLook(c, addv(g.pos, [26, 8 - u * 4, 32]), lerpv(g.pos, e1, 0.35), 46, -0.08);
  handheld(c, 0.8);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 90;
});
shot(176, 180.8, 'S12b enemy hit', (c) => {
  const { t, u } = c;
  const e1 = enemyMS1(Math.min(t, 180)).pos;
  camLook(c, addv(e1, [-40 + u * 10, 22, -45]), addv(e1, [0, 9, 0]), 40);
  shake(c, t > 180.2 ? 1.1 * Math.exp(-(t - 180.2) * 2) : 0.2, 10);
  c.env.shadowCenter = e1; c.env.shadowRadius = 70;
});
shot(180.8, 186, 'S12c dive from above', (c) => {
  const { t, u } = c;
  camLook(c, addv(CP, [-38 + u * 8, -6, 42]), addv(enemyMS2(t).pos, [0, 8, 0]), 52, 0.12);
  handheld(c, 0.6);
  c.env.shadowCenter = CP; c.env.shadowRadius = 150;
});
shot(186, 190, 'S12d saber lock', (c) => {
  const { t, u } = c;
  const a = -0.35 + u * 0.3;
  camLook(c, addv(CP, [Math.cos(a) * 34, 13 - u * 2, Math.sin(a) * 30]), addv(CP, [0, 11, 0]), 42, 0.05);
  shake(c, 0.45, 20);
  c.env.shadowCenter = CP; c.env.shadowRadius = 40;
  c.post.bloom = 0.03;
});
shot(190, 194.6, 'S12e slow-motion slash', (c) => {
  const { t, u } = c;
  const a = 1.2 + u * 0.9;
  camLook(c, addv(CP, [Math.sin(a) * 40, 9 + u * 6, Math.cos(a) * 40]), addv(CP, [0, 10, -10 * u]), 44, -0.1 + u * 0.1);
  c.post.saturation = 0.75; c.post.streak = 0.45; c.post.ca = 0.4 * (0.004);
  c.post.gradeHighlights = [1.2, 1.0, 0.85];
  shake(c, t > 194 ? 1 : 0, 10);
  c.env.shadowCenter = CP; c.env.shadowRadius = 50;
});
shot(194.6, 200, 'S12f aftermath', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [-16 - u * 20, 6 + u * 4, -30 - u * 18]), addv(g.pos, [0, 6, 0]), 40);
  handheld(c, 0.3);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 60;
});

// ============ ACT IV — GRAVITY LANCE
shot(200, 206, 'S13a lance charge', (c) => {
  const { t, u } = c;
  const d = dreadPos(t);
  const em = GUN.dread ? dreadEmitter(c.R, t, GUN.dread) : addv(d, [0, 0, 200]);
  camLook(c, addv(em, [-240 + u * 50, 60, 260 - u * 40]), addv(em, [0, 0, -60]), 42, -0.05);
  handheld(c, 0.4);
  c.post.lensB = { enable: 1, pos: em, thetaE: 0.03 + 0.1 * smooth(200, 216, t), horizon: 0, swirl: 3, glow: 0 };
  c.post.godray = { pos: em, intensity: 0.15 * smooth(200, 214, t), decay: 0.95 };
  c.env.shadowCenter = d; c.env.shadowRadius = 300;
  c.post.gradeShadows = [1.05, 0.9, 1.1];
});
shot(206, 211, 'S13b mothership in crosshair', (c) => {
  const { t, u } = c;
  const hit = motherPoint([0, 0, 0], t, LANCE_HIT);
  camLook(c, addv(hit, [-120 - u * 30, 40, -520 + u * 80]), addv(hit, [0, 0, 60]), 40);
  handheld(c, 0.5);
  c.env.shadowRadius = 350;
});
shot(211, 216, 'S13c gundam looks', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [9 - u * 2, 12, 20]), addv(g.pos, [0, 6, -400]), 36, 0.04);
  handheld(c, 0.3);
  const d = dreadPos(t);
  c.post.godray = { pos: GUN.dread ? dreadEmitter(c.R, t, GUN.dread) : d, intensity: 0.35 * (0.6), decay: 0.955 };
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 40;
});
shot(216, 218, 'S14a lance fires', (c) => {
  const { t, u } = c;
  const hit = motherPoint([0, 0, 0], t, LANCE_HIT);
  const em = GUN.dread ? dreadEmitter(c.R, t, GUN.dread) : dreadPos(t);
  const mid = lerpv(em, hit, 0.72);
  camLook(c, addv(hit, [520, 180, -700]), lerpv(hit, em, 0.25), 55, 0.1);
  shake(c, 1.4 * Math.exp(-(t - 216) * 1.2), 12);
  c.post.flash = t < 216.2 ? 0.8 : 0;
  c.post.lensB = { enable: 1, pos: em, thetaE: 0.12, horizon: 0, swirl: 4, glow: 0 };
  c.post.shakeBlur = 0.002;
  c.env.shadowRadius = 600;
});
shot(218, 226, 'S14b tinnitus', (c) => {
  const { t, u } = c;
  const hit = motherPoint([0, 0, 0], t, LANCE_HIT);
  camLook(c, addv(hit, [160 - u * 30, 30 + u * 10, -240 + u * 30]), addv(hit, [0, 0, 40]), 44, 0.18 - u * 0.1);
  handheld(c, 1.0);
  c.post.saturation = 0.35 + u * 0.4; c.post.shakeBlur = 0.002 * (1 - u); c.post.exposure = 1.25 - u * 0.2;
  c.post.ca = 0.4 * (0.006 * (1 - u) + 0.002);
  c.env.shadowCenter = hit; c.env.shadowRadius = 260;
});
shot(226, 234, 'S15a mothership burning', (c) => {
  const { t, u } = c;
  const L = modelLen(c.R, 'mothership');
  camLook(c, motherPoint([0, 0, 0], t, [260 - u * 30, -40 + u * 20, -L * 0.2 + u * 60]), motherPoint([0, 0, 0], t, [0, 0, -40 + u * 40]), 38);
  handheld(c, 0.3);
  c.env.shadowRadius = 380;
});
shot(234, 240, 'S15b gundam resolve', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  const f = V.norm([0, 0, 0], g.fwd);
  camLook(c, addv(madd(g.pos, f, 16 - u * 3), [3, 8.5, 0]), addv(g.pos, [0, 8.5, 0]), 30);
  handheld(c, 0.25);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 30;
  c.post.lensA = wellLens(c, wellMass(t), 1.2, true, 1);
});
shot(240, 247, 'S16a dive start', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [-22 + u * 10, 10, -40 - u * 10]), madd(g.pos, [0, 0, 1], 300), 56, 0.1 * Math.sin(t));
  shake(c, 0.35, 10);
  c.post.lensA = wellLens(c, wellMass(t), 1.3, true, 1);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 50;
});
shot(247, 255, 'S16b time dilation', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [10, -6, 28 + u * 6]), addv(g.pos, [0, 8, 0]), 50 + u * 12, 0.3 * Math.sin(t * 0.4));
  shake(c, 0.3 + u * 0.4, 10);
  c.post.lensA = wellLens(c, wellMass(t) * (1 + u), 2 + u * 2, true, 1.2);
  c.post.ca = 0.4 * (0.004 + u * 0.01); c.post.shakeBlur = u * 0.002;
  c.env.warp = u * 0.25;
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 50;
});
shot(255, 262, 'S16c event horizon', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(g.pos, [-6, 14, -34]), addv(WELL, [0, 0, 0]), 62 - u * 8, 0.05);
  shake(c, 0.6, 12);
  c.post.lensA = wellLens(c, wellMass(t) * 2, 4, true, 1.6);
  c.post.ca = 0.4 * (0.012); c.post.shakeBlur = 0.0015;
  c.env.warp = 0.3;
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 80;
});

// ============ ACT V — SINGULARITY
shot(262, 270, 'S17a max output', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  const a = -0.9 + u * 0.7;
  camLook(c, addv(g.pos, [Math.sin(a) * 60, 5 + u * 20, -Math.cos(a) * 60]), addv(g.pos, [0, 30 * smooth(265, 268, t) + 9, 20]), 50, 0.05);
  shake(c, t > 266 ? 0.6 : 0.3, 10);
  c.post.lensA = wellLens(c, wellMass(t) * 1.5, 3, true, 1.4);
  c.post.ca = 0.4 * (0.007);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 150;
});
shot(270, 275, 'S17b the slash', (c) => {
  const { t, u } = c;
  const g = gundamState(t);
  camLook(c, addv(WELL, [220 - u * 60, 60, -260 + u * 40]), addv(WELL, [0, 0, -60]), 52, 0.15);
  shake(c, t > 272.6 ? 1.3 : 0.4, 12);
  c.post.lensA = wellLens(c, wellMass(t) * 1.4, 3, true, 1.4);
  c.post.flash = t > 272.7 && t < 273.2 ? 0.25 * (1 - (t - 272.7) / 0.5) : 0;
  c.post.exposure = 0.7;
  c.post.streak = 0.5;
  c.env.shadowCenter = WELL; c.env.shadowRadius = 260;
});
shot(275, 280.2, 'S17c collapse', (c) => {
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
  camLook(c, [-900, 400, 1200 + u * 200], addv(WELL, [0, 0, -800]), 50, 0.1);
  shake(c, 1.6 * Math.exp(-(t - 280.2) * 0.6), 10);
  c.post.flash = Math.max(0, 0.8 - (t - 280.2) / 0.6);
  c.post.shakeBlur = 0.003 * Math.exp(-(t - 280.2));
  c.env.shadowRadius = 900; c.env.shadowCenter = [0, 0, 600];
});
shot(286, 292, 'S18b fleet struck', (c) => {
  const { t, u } = c;
  camLook(c, motherPoint([0, 0, 0], t, [-220, 60, -420 + u * 60]), motherPoint([0, 0, 0], t, [0, 0, 120]), 44, -0.1 + u * 0.1);
  shake(c, 0.6 * (1 - u), 8);
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
  shake(c, t > 306 ? 1.2 * Math.exp(-(t - 306) * 0.8) : 0.3, 9);
  c.post.flash = t > 306 && t < 307 ? 0.9 * (1 - (t - 306)) : 0;
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
  camLook(c, addv(g.pos, [-6, 11, 24 - u * 4]), addv(g.pos, [0, 14, -60]), 34 + u * 10);
  handheld(c, 0.2);
  c.env.shadowCenter = g.pos; c.env.shadowRadius = 50;
  c.debris = true;
});
shot(340, 348, 'F1 HOMECOMING', (c) => {
  const { t, u, R } = c;
  // escorts close to camera, the fleet streaming past toward the sunlit planet, the mothership last and huge
  const mp = motherPoint([0, 0, 0], t, [0, 0, 0]);
  const side = V.norm([0, 0, 0], V.cross([0, 0, 0], PLANET, [0, 1, 0]));
  const pos = V.add([0, 0, 0], V.madd([0, 0, 0], mp, side, 380), [0, -140, 0]);
  camLook(c, V.madd([0, 0, 0], pos, PLANET, (t - 340) * 6), V.madd([0, 0, 0], mp, PLANET, 250 + u * 200), 44, -0.06);
  for (let k = 0; k < 3; k++) {
    const p = V.madd([0, 0, 0], V.add([0, 0, 0], pos, [-30 + k * 22, 18 + k * 5, 0]), PLANET, 60 + (t - 340) * (26 + k * 3));
    const e = R.add('interceptor', mat(M.new(), p, PLANET));
    if (e) engineGlows(R, 'interceptor', e, HIIG_ENGINE, 0.7, 1, 4);
  }
  handheld(c, 0.12);
  c.env.shadowCenter = mp; c.env.shadowRadius = 520;
  c.env.fill = [0.35, 0.37, 0.45, 0.5];
});
shot(348, 356, 'F2 into the sunrise', (c) => {
  const { t, u } = c;
  // from ahead and below: the fleet descends toward the planet, sun rising over the limb behind them
  const mp = motherPoint([0, 0, 0], t, [0, 0, 0]);
  const pos = V.add([0, 0, 0], V.madd([0, 0, 0], mp, PLANET, 1400 - u * 200), [0, -60, 0]);
  camLook(c, pos, lerpv(mp, V.madd([0, 0, 0], mp, SUN, 900), 0.15 + u * 0.1), 42, 0.03);
  c.env.shadowRadius = 700;
  c.env.fill = [0.4, 0.42, 0.5, 0.5];
  c.post.fade = 1 - smooth(355, 356, t) * 0.5;
});
shot(356, 372.5, 'S23 title', (c) => {
  const { t, u } = c;
  // bookend: the same sunrise over the limb as the opening, the fleet gone
  const dir = V.norm([0, 0, 0], V.lerp([0, 0, 0], PLANET, SUN, 0.5 + u * 0.04));
  camLook(c, [0, 0, 0], madd([0, 0, 0], dir, 1000), 34, 0.12 - u * 0.05);
  c.world = false;
  c.env.stars = 0.6; c.env.sunDisc = smooth(358, 368, t) * 0.12;
  c.post.exposure = 0.75;
  c.post.fade = smooth(356, 358, t) * (1 - smooth(369, 372, t));
  c.post.godray = { pos: madd([0, 0, 0], SUN, 50000), intensity: 0.1 * smooth(360, 368, t), decay: 0.965 };
});

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

export function frame(R, t) {
  const s = findShot(t);
  ctx.R = R; ctx.t = t; ctx.lt = t - s.t0; ctx.u = sat((t - s.t0) / (s.t1 - s.t0));
  ctx.env = spaceEnv(t); ctx.post = basePost();
  ctx.world = true; ctx.hangar = null; ctx.debris = false;
  ctx.cam.near = 0.3; ctx.cam.far = 400000;
  R.begin();
  if (!GUN.exitLocal) {
    const ex = R.models.mothership?.empties?.hangar_exit;
    GUN.exitLocal = ex ? ex.pos : [60, 0, 60];
  }
  s.fn(ctx);
  // near plane relative to subject distance for depth precision
  ctx.cam.near = Math.max(0.2, Math.min(4, V.dist(ctx.cam.pos, ctx.cam.target) * 0.01));
  if (ctx.world) {
    drawWorld(R, t, {});
    drawMSBattle(R, t);
    drawLanceAndCannon(R, t, ctx);
    drawImplosion(R, t, ctx);
    if (ctx.debris || (t > 280 && t < 346)) drawDebrisField(R, t);
    if (t > 62 && t < IMPLODE + 0.5 && !ctx.post.lensA) ctx.post.lensA = wellLens(ctx, wellMass(t), 1.2, true, 1);
  }
  if (ctx.hangar) {
    R._time = t;
    drawHangar(R, t, ctx.hangar);
    const gs = gundamHangarState(t, ctx.hangar);
    drawGundam(R, t, gs);
  }
  return ctx;
}

// ---------------- lance + main cannon beams
function drawLanceAndCannon(R, t, c) {
  // gravity lance: twisted purple beam
  if (t > LANCE_FIRE && t < LANCE_FIRE + 5 && GUN.dread) {
    const em = dreadEmitter(R, t, GUN.dread);
    const hit = motherPoint([0, 0, 0], t, LANCE_HIT);
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
      R.light(hit, 900, [1, 0.5, 1.2], 30 * k);
    }
  }
  // mothership hit explosions chain
  const chain = [[217, [40, 20, -60], 70], [218.5, [30, -25, -130], 40], [219.6, [50, 40, 10], 45], [221, [20, -10, -210], 50], [223, [45, 5, 60], 35]];
  for (const [t0, lp, sz] of chain) explosion(R, t, t0, motherPoint([0, 0, 0], t0, lp), sz, t0 * 3, 'ship');
  // main cannon
  if (t > 292 && t < MAIN_FIRE + 5) {
    const mc = mainCannon(R, t);
    const fwd = rotY([0, 0, 0], [0, 0, 1], motherYaw(t));
    if (t < MAIN_FIRE) {
      const k = smooth(292, MAIN_FIRE, t);
      R.glow(mc, 10 + 60 * k, [1.5 * k, 2.5 * k, 5 * k], 1);
      R.light(mc, 500, ION_COL, 15 * k);
      for (let i = 0; i < 90; i++) {
        const s = i * 1.91;
        const per = 0.9 + hash(s) * 0.6;
        const ph = ((t - 292) / per + hash(s + 1)) % 1;
        const d = randDir([0, 0, 0], s + Math.floor((t - 292) / per + hash(s + 1)) * 2.3);
        const r0 = 220 * (1 - ph);
        R.beam(madd(mc, d, r0 + 20), madd(mc, d, r0), 0.8, [0.6 * k * ph * 3, 1.0 * k * ph * 3, 2.2 * k * ph * 3], 1, 10);
      }
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
      R.beam(madd(WELL, d, r0 + 60), madd(WELL, d, r0), 3, [1.5 * k * ph, 0.8 * k * ph, 3 * k * ph], 1, 10);
    }
  }
  if (t >= IMPLODE) {
    const lt = t - IMPLODE;
    const k = Math.exp(-lt * 1.1);
    R.glow(WELL, 250 + lt * 260, [4 * k, 3.4 * k, 5 * k], 0.4);
    R.haze(WELL, 500 + lt * 500, Math.exp(-lt * 0.6) * 0.8, 7);
    R.light(WELL, 6000, [0.9, 0.8, 1.2], 60 * k);
    // expanding shockwave disk facing the fleet
    const rr = 150 + lt * 520;
    for (let j = 0; j < 3; j++) {
      const r2 = rr * (1 - j * 0.12);
      R.ring(WELL, [r2, 0, 0, 0], [0, r2 * 0.95, 0, 0], [2.5 * k, 1.6 * k, 3.5 * k], 0.8 + j * 0.05);
      R.ring(WELL, [r2, 0, 0, 0], [0, 0, r2, 0], [1.5 * k, 1 * k, 2.5 * k], 0.85);
    }
  }
}

function drawDebrisField(R, t) {
  const base = addv(WELL, [40, 60, -1150]);
  const m = M.new();
  for (let i = 0; i < 26; i++) {
    const d = randDir([0, 0, 0], i * 7.7);
    const p = madd(base, d, 40 + hash(i * 3.3) * 260);
    p[2] += (t - 280) * (hash(i) - 0.5) * 2;
    const e = R.add('debris', matEuler(m, p, t * 0.05 * (hash(i + 1) - 0.5), t * 0.04 * (hash(i + 2) - 0.5) + i, i * 0.7, 1 + hash(i + 4) * 2.5));
    if (!e) continue;
    const names = ['rock0', 'rock1', 'rock2', 'rock3', 'hull0', 'hull1', 'hull2', 'hull3'];
    e.hidden = debrisOnly(R, names[i % names.length]);
    e.damage = i % 8 >= 4 ? 0.3 : 0;
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
cut(121.8, 123.6, 'X ion beams over the line', (c) => { lineRide(c, 4, 0.2, 30, 18, 48, -0.1); shake(c, 0.5, 9); });
cut(125.6, 127.8, 'X tracer wall flythrough', (c) => { lineRide(c, 7, 1.2 - c.u * 0.6, -22, 8, 58, 0.15); shake(c, 0.3, 10); c.post.shakeBlur = 0.0008; });
cut(129.8, 131.8, 'X enemy frigate dies', (c) => { deathCam(c, 1, 240 - c.u * 20, 0.6, 40); shake(c, c.t > 130.4 ? 0.9 : 0.2, 9); });
cut(131.8, 134, 'X hull skim', (c) => {
  const { t, u } = c;
  const L = modelLen(c.R, 'mothership');
  camLook(c, motherPoint([0, 0, 0], t, [70, 42, -L * 0.3 + u * 140]), motherPoint([0, 0, 0], t, [-40, 60, L * 0.5]), 62, 0.2);
  shake(c, 0.4, 12); c.post.shakeBlur = 0.001; c.env.shadowRadius = 200;
});
cut(143.8, 145.4, 'X frigate dies close', (c) => { deathCam(c, 3, 230, -0.9, 42); shake(c, c.t > 144.4 ? 1 : 0.3, 10); });
cut(148.6, 150, 'X second kill', (c) => { deathCam(c, 4, 260, 2.2, 38); shake(c, c.t > 149.2 ? 0.9 : 0.2, 9); });
cut(166.8, 169, 'X carnage over the planet', (c) => {
  const { t, u } = c;
  againstPlanet(c, [0, 0, -700], 1300 - u * 120, 60, 300, 40, 0.06, 0.05, true);
  handheld(c, 0.4); c.env.shadowRadius = 900; c.env.shadowCenter = [0, 0, -700];
});
cut(196.8, 199.6, 'X wide over the planet', (c) => {
  const { t, u } = c;
  againstPlanet(c, [0, 0, -900], 1500, 80, -500 + u * 80, 38, -0.05, 0.05, true);
  handheld(c, 0.3); c.env.shadowRadius = 1000; c.env.shadowCenter = [0, 0, -800];
});
cut(211.2, 213.4, 'X last kill before the lance', (c) => { deathCam(c, 11, 260, 1.2, 40); shake(c, c.t > 212.5 ? 1 : 0.3, 9); });
cut(305.6, 308, 'X tracers into the wreck', (c) => { lineRide(c, 10, 0.8, 26, 14, 52, -0.1); shake(c, 0.4, 8); });
SHOTS.unshift(...CUTS);
