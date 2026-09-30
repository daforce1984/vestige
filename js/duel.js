// Mech-vs-mech duel for story time 160–200 s: THE GUNFIGHT — Sigma (ATLAS, beam rifle) against VANGUARD (repainted
// crimson; beam rifle + shield). Keyframed, seek-safe, pure functions of t.
//
// Reference studied for rhythm / staging only (nothing copied): the ranged mobile-suit duels of Mobile Suit Gundam
// Unicorn — two machines circling far apart on opposite ends of a turning diameter, quick-boost side-steps out of each
// shot, a shield taking a hit, the opponent jumping and flipping to fire inverted, a zig-zag advance, a long circling run
// trading fire, one full-power shot slipped at the last instant and a single decisive magnum shot across the distance;
// Armored Core "Locked In" for the quick-boost language (sharp starts, long settles). They never close to melee:
// the nearest they come is ~60 m.
// Motion data: the source mechs' own animation clips (CC0 — js/motion.js / tools/extract_motion.py): VANGUARD's
// RifleBurst (aim), ShieldGuard (the block), BoostJump (the jump) and Backflip (the inverted shot) drive its poses.
//
// Exports used by shots.js / audio.js / main.js: duelHero / duelEnemy1 (≤ 180.9) / duelEnemy2 (≥ 180.9) states,
// duelCamera + DUEL_CAMS, DUEL_EVENTS, DUEL_SHOTS (Sigma's shots), SERAPH_SHOTS (= the enemy's shots; name kept),
// seraphMuzzle (enemy muzzle), FINALE_T/END (its full-power shot), SHIELD_HIT_T (the shot that tears its shield off),
// KILL_SHOT_T, rifleCharge, duelFK.
import { M, V, Q, sat, clamp, lerp, easeIn, easeOut, easeInOut, noise1, smooth, DEG } from './math.js';
import { GC, POSES, blendPose, breathe, gundamLaunchPath } from './world.js';
import { clipPose } from './motion.js';
import { filmT, storyT } from './timemap.js';

export const DUEL_T0 = 160, DUEL_T1 = 200;
export const CP = [GC[0], GC[1] + 25, GC[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const lrp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const G = (x, y, z) => [GC[0] + x, GC[1] + y, GC[2] + z];
const C = (x, y, z) => [CP[0] + x, CP[1] + y, CP[2] + z];

// ============================================================================ pose channels
export const PARTS = ['pelvis', 'torso', 'head', 'arm_L_upper', 'arm_L_lower', 'hand_L', 'arm_R_upper', 'arm_R_lower', 'hand_R',
  'leg_L_upper', 'leg_L_lower', 'foot_L', 'leg_R_upper', 'leg_R_lower', 'foot_R', 'rifle', '_body'];
// _body = [pitch (+ leans forward / nose down), yaw offset (+ turns to own left), roll (+ own right side down)]
const NCH = PARTS.length * 3;
const PIDX = Object.fromEntries(PARTS.map((p, i) => [p, i * 3]));
// Conventions (checked in Blender, see blender/duel_preview.py):
//   torso/pelvis/head rx+ bend forward, ry+ turn to own left, rz+ lean to own right
//   arm_*_upper rx− raise forward (−90 horizontal, −180 overhead); rz: L + / R − = abduct sideways; ry: L + / R − = swing outward
//   arm_*_lower rx− = elbow flex;  hand rx: 0 → blade ⟂ forearm (toward the palm-front), +90 → blade continues the forearm
//   leg_*_upper rx− = thigh forward; leg_*_lower rx+ = knee flex; foot rx+ = toes down
function P(deg) {            // pose from degrees {part:[x,y,z]}
  const a = new Float64Array(NCH);
  for (const k in deg) { const i = PIDX[k]; if (i === undefined) throw new Error('bad part ' + k); a[i] = deg[k][0] * DEG; a[i + 1] = deg[k][1] * DEG; a[i + 2] = deg[k][2] * DEG; }
  return a;
}
function PR(rad) {           // pose from radians (world.js POSES)
  const a = new Float64Array(NCH);
  for (const k in rad) { const i = PIDX[k]; if (i === undefined) continue; a[i] = rad[k][0]; a[i + 1] = rad[k][1]; a[i + 2] = rad[k][2]; }
  return a;
}
function W(base, over) {      // base pose with part overrides (degrees)
  const a = Float64Array.from(base);
  for (const k in over) { const i = PIDX[k]; a[i] = over[k][0] * DEG; a[i + 1] = over[k][1] * DEG; a[i + 2] = over[k][2] * DEG; }
  return a;
}
function mirror(src) {       // left/right swap (for the right-handed RONIN): x kept, y/z negated
  const a = new Float64Array(NCH);
  for (const p of PARTS) {
    const q = p.includes('_L') ? p.replace('_L', '_R') : p.includes('_R') ? p.replace('_R', '_L') : p;
    const i = PIDX[p], j = PIDX[q];
    a[j] = src[i]; a[j + 1] = -src[i + 1]; a[j + 2] = -src[i + 2];
  }
  return a;
}
const DEF_NO_BODY = (a) => { const b = Float64Array.from(a); b[PIDX._body] = b[PIDX._body + 1] = b[PIDX._body + 2] = 0; return b; };
// ============================================================================ pose library — Sigma (ATLAS; rifle in the right hand)
const L = {};
L.flight = W(PR(POSES.flight), { _body: [28, 0, 0] });
L.aim = PR(POSES.aim);
L.aimReady = W(L.aim, { arm_R_upper: [-60, 5, -10], arm_R_lower: [-45, 0, 0], torso: [8, -15, 0] });
// one-handed rifle aim (rifle on hand_R, barrel = hand +Z): upper arm up, elbow slightly bent, wrist ~+90° levels
// the barrel. The exact angles at each shot are solved so the barrel points at the target (SOLVE 'aim').
L.aimRifle = P({
  pelvis: [0, -15, 0], torso: [6, -25, 0], head: [4, 22, 0],
  arm_R_upper: [-82, 8, -8], arm_R_lower: [-18, 0, 0], hand_R: [95, 0, 0],
  arm_L_upper: [-45, -10, 20], arm_L_lower: [-85, 0, 0], hand_L: [10, 0, 0],
  leg_L_upper: [-25, 0, 8], leg_L_lower: [45, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [15, 0, -8], leg_R_lower: [40, 0, 0], foot_R: [30, 0, 0],
});
L.aimLow = W(L.aimRifle, { arm_R_upper: [-30, 5, -14], arm_R_lower: [-40, 0, 0], hand_R: [105, 0, 0], torso: [8, -12, 0], head: [2, 12, 0] });
L.aimPB = W(L.aimRifle, { torso: [4, -30, 0], leg_L_upper: [-40, 0, 10], leg_L_lower: [55, 0, 0], leg_R_upper: [25, 0, -8], leg_R_lower: [45, 0, 0], _body: [-6, 0, 0] });
// bare-hand boxing guard (before the saber is lit)
L.guardBare = P({
  pelvis: [0, -20, 0], torso: [14, -12, 0], head: [8, 12, 0],
  arm_L_upper: [-45, -15, 12], arm_L_lower: [-95, 0, 0], hand_L: [20, 0, 0],
  arm_R_upper: [-35, 10, -15], arm_R_lower: [-100, 0, 0], hand_R: [10, 0, 0],
  leg_L_upper: [-35, 0, 8], leg_L_lower: [45, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [20, 0, -8], leg_R_lower: [60, 0, 0], foot_R: [35, 0, 0],
});
L.sway = W(L.guardBare, { torso: [-22, -5, 0], head: [-15, 0, 0], leg_L_upper: [-60, 0, 10], leg_L_lower: [70, 0, 0], leg_R_upper: [-30, 0, -8], leg_R_lower: [80, 0, 0], _body: [-38, 0, 0] });
// right forearm (arm cannon) raised on the right side to catch a backhand
L.forearmBlock = W(L.guardBare, { arm_R_upper: [-75, -35, -30], arm_R_lower: [-95, 0, 0], hand_R: [0, 0, 0], torso: [10, -25, 0], head: [5, -20, 0] });
L.kneeWind = W(L.guardBare, { arm_L_upper: [-70, -10, 10], arm_L_lower: [-40, 0, 0], arm_R_upper: [-70, 10, -10], arm_R_lower: [-40, 0, 0], leg_L_upper: [10, 0, 5], leg_L_lower: [90, 0, 0], foot_L: [40, 0, 0], leg_R_upper: [-10, 0, -8], leg_R_lower: [30, 0, 0], torso: [5, 0, 0] });
L.knee = W(L.guardBare, { torso: [28, 0, 0], head: [15, 0, 0], arm_L_upper: [-40, -15, 10], arm_L_lower: [-70, 0, 0], arm_R_upper: [-40, 15, -10], arm_R_lower: [-70, 0, 0], leg_L_upper: [-105, 0, 5], leg_L_lower: [110, 0, 0], foot_L: [35, 0, 0], leg_R_upper: [20, 0, -8], leg_R_lower: [25, 0, 0], foot_R: [40, 0, 0], _body: [8, 0, 0] });
L.kickWind = W(L.guardBare, { torso: [0, 10, 0], leg_R_upper: [-85, 0, -5], leg_R_lower: [115, 0, 0], foot_R: [10, 0, 0], leg_L_upper: [10, 0, 8], leg_L_lower: [35, 0, 0], _body: [-10, 0, 0] });
L.kick = W(L.guardBare, { pelvis: [0, 22, 0], torso: [-12, 15, 0], head: [10, 0, 0], leg_R_upper: [-82, 18, 0], leg_R_lower: [5, 0, 0], foot_R: [-35, 0, 0], leg_L_upper: [15, 0, 8], leg_L_lower: [40, 0, 0], foot_L: [30, 0, 0], arm_L_upper: [-30, 0, 35], arm_L_lower: [-60, 0, 0], _body: [-14, 0, 0] });
L.shield = P({ torso: [22, 10, 0], head: [25, 0, 0], arm_L_upper: [-95, -35, 0], arm_L_lower: [-100, 0, 0], arm_R_upper: [-50, 20, -10], arm_R_lower: [-90, 0, 0], leg_L_upper: [-60, 0, 10], leg_L_lower: [90, 0, 0], leg_R_upper: [-40, 0, -10], leg_R_lower: [100, 0, 0], foot_L: [30, 0, 0], foot_R: [30, 0, 0], _body: [-12, 0, 0] });
L.lookUp = P({ torso: [-18, 8, 0], head: [-45, 10, 0], arm_L_upper: [-40, 0, 20], arm_L_lower: [-60, 0, 0], arm_R_upper: [-70, 0, -15], arm_R_lower: [-40, 0, 0], leg_L_upper: [-25, 0, 8], leg_L_lower: [40, 0, 0], leg_R_upper: [10, 0, -8], leg_R_lower: [50, 0, 0], foot_L: [20, 0, 0], foot_R: [30, 0, 0], _body: [-18, 0, 0] });
L.boost = W(L.flight, { head: [-40, 0, 0], _body: [-10, 0, 0] });
// saber (left hand)
// ready guard (standoffs): squared up to the opponent, mace angled forward-up at him (~48° over the horizontal, head in
// front of the face — solved with the duel FK; the old guard held it straight up like a torch), elbow soft, the arm
// cannon raised in front as a shield, legs split front/back instead of tucked symmetrically
L.guard = P({
  pelvis: [0, -10, 0], torso: [14, -6, 0], head: [2, 6, 0],
  arm_L_upper: [-23, -13, -29], arm_L_lower: [-54, 0, 0], hand_L: [19, 5, 0],
  arm_R_upper: [-52, 18, -16], arm_R_lower: [-92, 0, 0],
  leg_L_upper: [-30, 0, 9], leg_L_lower: [32, 0, 0], foot_L: [14, 0, 0],
  leg_R_upper: [14, 0, -6], leg_R_lower: [52, 0, 0], foot_R: [30, 0, 0], _body: [6, 0, 0],
});
// idle / at-the-ready (before the fight is on): relaxed, the mace hanging from a loose arm by his side, head up and
// watching (arm angles FK-solved so the mace really hangs head-down)
L.idle = P({   // RELAXED, at ease (scenes 32–36): upright, both arms hanging loose a little out from the body in an A, the
  // beam rifle hanging muzzle-down from the right fist
  pelvis: [0, -4, 0], torso: [6, -2, 0], head: [2, 4, 0],
  arm_L_upper: [6, 0, 26], arm_L_lower: [-16, 0, 0], hand_L: [6, 0, 0],
  arm_R_upper: [4, -6, -26], arm_R_lower: [-18, 0, 0], hand_R: [80, 0, 0],
  leg_L_upper: [-12, 0, 8], leg_L_lower: [18, 0, 0], foot_L: [8, 0, 0],
  leg_R_upper: [4, 0, -8], leg_R_lower: [20, 0, 0], foot_R: [12, 0, 0], _body: [2, 0, 0],
});
L.hitTorso = W(L.guard, { torso: [-30, 15, 0], head: [-25, 10, 0], arm_L_upper: [-60, 20, 60], arm_L_lower: [-30, 0, 0], arm_R_upper: [-50, 0, -60], arm_R_lower: [-30, 0, 0], leg_L_upper: [-60, 0, 15], leg_L_lower: [50, 0, 0], leg_R_upper: [-40, 0, -15], leg_R_lower: [60, 0, 0], _body: [-25, 0, 10] });
// iai pass-cut: wind (blade low across to the right), mid (arm straight out-left, blade continues the arm), end (swept back)
L.iaiWind = P({
  pelvis: [0, -30, 0], torso: [35, -45, 0], head: [5, 40, 0],
  arm_L_upper: [-60, -70, -10], arm_L_lower: [-25, 0, 0], hand_L: [110, 0, 0],
  arm_R_upper: [-30, 0, -30], arm_R_lower: [-80, 0, 0],
  leg_L_upper: [-80, 0, 10], leg_L_lower: [110, 0, 0], foot_L: [30, 0, 0],
  leg_R_upper: [-20, 0, -10], leg_R_lower: [120, 0, 0], foot_R: [40, 0, 0], _body: [22, 0, 0],
});
L.iaiMid = P({
  pelvis: [0, 10, 0], torso: [20, 20, 0], head: [5, 30, 0],
  arm_L_upper: [-88, 100, 0], arm_L_lower: [-5, 0, 0], hand_L: [90, 0, 0],
  arm_R_upper: [-10, 0, -45], arm_R_lower: [-40, 0, 0],
  leg_L_upper: [-30, 0, 10], leg_L_lower: [30, 0, 0], foot_L: [30, 0, 0],
  leg_R_upper: [45, 0, -10], leg_R_lower: [20, 0, 0], foot_R: [50, 0, 0], _body: [25, 0, 0],
});
L.iaiEnd = P({
  pelvis: [0, 25, 0], torso: [20, 48, 0], head: [5, -10, 0],
  arm_L_upper: [-38, 72, 15], arm_L_lower: [-40, 0, 0], hand_L: [30, 0, 0],   // follow-through across the body, elbow soft (no wrap-back)
  arm_R_upper: [-20, 0, -40], arm_R_lower: [-60, 0, 0],
  leg_L_upper: [-20, 0, 10], leg_L_lower: [40, 0, 0], foot_L: [30, 0, 0],
  leg_R_upper: [30, 0, -10], leg_R_lower: [50, 0, 0], foot_R: [40, 0, 0], _body: [10, 0, 0],
});
// the rifle put away over the shoulder (onto the pack) before the saber is drawn
// ---- the gunfight (beam rifle in the right hand; the exact aim is laid per frame — aimRifle)
L.flyAim = W(L.aimRifle, { leg_L_upper: [-20, 0, 10], leg_L_lower: [50, 0, 0], leg_R_upper: [15, 0, -8], leg_R_lower: [60, 0, 0], _body: [18, 0, 0] });
L.dodgeAimL = W(L.flyAim, { torso: [5, 20, -15], head: [0, -15, 8], _body: [0, 15, 22] });
L.dodgeAimR = W(L.flyAim, { torso: [5, -20, 15], head: [0, 15, -8], _body: [0, -15, -22] });
L.dodgeUpAim = W(L.flyAim, { leg_L_upper: [-80, 0, 10], leg_L_lower: [110, 0, 0], leg_R_upper: [-70, 0, -10], leg_R_lower: [120, 0, 0], _body: [-20, 0, 0] });
L.aimUp = W(L.aimRifle, { torso: [-15, 0, 0], head: [-30, 0, 0], leg_L_upper: [-30, 0, 10], leg_L_lower: [60, 0, 0], leg_R_upper: [10, 0, -8], leg_R_lower: [70, 0, 0], _body: [-25, 0, 0] });
L.flee = W(L.flight, { head: [-20, 0, 0], arm_R_upper: [-20, 0, -20], arm_R_lower: [-40, 0, 0], hand_R: [60, 0, 0] });
L.brace = W(L.aimRifle, { torso: [10, -12, 0], arm_L_upper: [-70, -35, -10], arm_L_lower: [-60, 0, 0], hand_L: [10, 0, 0],
  leg_L_upper: [-50, 0, 12], leg_L_lower: [70, 0, 0], leg_R_upper: [20, 0, -10], leg_R_lower: [75, 0, 0], _body: [6, 0, 0] });
L.recoilShot = W(L.brace, { torso: [-8, -12, 0], head: [-10, 20, 0], _body: [-10, 0, 0] });
// SANDEVISTAN: the rifle slung over the shoulder, the saber drawn low and back in the left hand, body flat along the dash
L.finish = W(L.iaiEnd, { torso: [8, 30, 0], arm_L_upper: [-22, 45, 18], arm_L_lower: [-42, 0, 0], hand_L: [15, 0, 0], _body: [0, 0, 0] });   // blade lowered, arm relaxed
L.windup = W(L.flight, { torso: [4, -15, 0], head: [0, 15, 0], _body: [20, 0, 0] });   // the torso turned into the grab, the eyes kept on it
L.port = W(L.flyAim, { arm_R_upper: [-35, 65, -5], arm_R_lower: [-95, 0, 0], hand_R: [70, 0, 0], torso: [6, 10, 0] });   // the rifle pulled in across the chest to load
L.stow = W(L.flyAim, { arm_R_upper: [-155, -25, -18], arm_R_lower: [-95, 0, 0], hand_R: [20, 0, 0], head: [0, 15, 0] });
L.sandeDash = W(L.iaiWind, { torso: [30, -35, 0], head: [-25, 35, 0], arm_R_upper: [-10, 0, -35], arm_R_lower: [-50, 0, 0], leg_L_upper: [-30, 0, 10], leg_L_lower: [60, 0, 0], leg_R_upper: [25, 0, -10], leg_R_lower: [70, 0, 0], _body: [45, 0, 0] });
// zero-g ragdoll: after an impulse at t0 every joint swings loose as a heavy damped oscillation (0.8–1.8 Hz, decaying
// over a few seconds), then keeps a slow floating drift. Deterministic (seeded per joint). pose values are radians.
const RAG = { torso: 0.35, head: 0.5, pelvis: 0.15, arm_L_upper: 0.7, arm_R_upper: 0.7, arm_L_lower: 0.6, arm_R_lower: 0.6, hand_L: 0.5, hand_R: 0.5,
  leg_L_upper: 0.45, leg_R_upper: 0.45, leg_L_lower: 0.5, leg_R_lower: 0.5, foot_L: 0.4, foot_R: 0.4 };
const _h = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function ragdoll(pose, t0, t, strength = 1, seed = 0) {
  const lt = t - t0;
  if (lt <= 0) return pose;
  for (const p in RAG) {
    const a = pose[p] || (pose[p] = [0, 0, 0]);
    for (let k = 0; k < 3; k++) {
      const s = seed * 7.1 + p.length * 3.3 + k * 11.7 + (p.charCodeAt(p.length - 1) || 0);
      const w = 2 * Math.PI * (0.8 + _h(s) * 1.0), ph = _h(s + 1) * 6.283, amp = RAG[p] * (k === 0 ? 1 : 0.45) * strength;
      const swing = amp * Math.exp(-lt / 2.4) * Math.sin(w * lt + ph) * sat(lt / 0.12);
      const drift = amp * 0.035 * Math.sin(lt * (0.08 + _h(s + 2) * 0.06) * 2 * Math.PI + ph);   // barely-there, very slow float (no swaying)
      a[k] += swing + drift * sat(lt / 1.5);
    }
  }
  return pose;
}
function ragdollArr(arr, t0, t, strength, seed) {
  const o = ragdoll({}, t0, t, strength, seed);
  for (const p in o) { const i = PIDX[p]; if (i === undefined) continue; arr[i] += o[p][0]; arr[i + 1] += o[p][1]; arr[i + 2] += o[p][2]; }
}
export function maceWrist(rx) {
  const hi = 20 * DEG, lo = -25 * DEG;
  return rx > hi ? hi + (rx - hi) * 0.3 : rx < lo ? lo + (rx - lo) * 0.3 : rx;
}

// joint limits (degrees, hero/left-hand convention; the right side is mirrored). _body is unlimited.
const LIM_DEG = {
  pelvis: [[-40, 40], [-50, 50], [-30, 30]], torso: [[-45, 60], [-65, 65], [-30, 30]], head: [[-60, 45], [-70, 70], [-30, 30]],
  arm_L_upper: [[-195, 70], [-95, 150], [-60, 110]], arm_L_lower: [[-150, 10], [-30, 30], [-20, 20]], hand_L: [[-80, 135], [-100, 100], [-60, 60]],
  leg_L_upper: [[-125, 60], [-40, 40], [-20, 60]], leg_L_lower: [[-5, 150], [-10, 10], [-10, 10]], foot_L: [[-50, 60], [-20, 20], [-25, 25]],
};
export const JOINT_LIMITS = {};
for (const p in LIM_DEG) {
  const r = LIM_DEG[p].map(([a, b]) => [a * DEG, b * DEG]);
  JOINT_LIMITS[p] = r;
  if (p.includes('_L')) JOINT_LIMITS[p.replace('_L', '_R')] = [r[0], [-r[1][1], -r[1][0]], [-r[2][1], -r[2][0]]];
}
// ============================================================================ interpolation (C1 Hermite) + hit-stop warp
// Keys are [t, value, tag]. Between keys: cubic Hermite with non-uniform Catmull-Rom tangents (monotone-clamped per
// channel so poses never wobble past a key). Tags only shape the tangents:
//   'in'   strike lands on this key: arrives fast (1.6× slope); if it is an IMPACT the outgoing tangent is 0
//          (hit-stop hold, then an eased release) — the only intended velocity breaks in the whole duel.
//   next key tagged 'in'  → this key is the anticipation apex: velocity 0 (the wind-up settles, then explodes).
//   'hold' → velocity 0.   'cr' (positions) → plain Catmull-Rom, no clamp (free arcs).   other tags → smooth.
export const HITSTOPS = [
  // [t, freeze, release] — the gunfight: only the killing cut bites (a short hold as the blade goes through)
];
export const SHOT_TIMES = [];
// impacts: filters are bypassed here so contacts / aims are exact and crisp
export const IMPACTS = [...HITSTOPS.map((h) => h[0]), ...SHOT_TIMES];
const isImpact = (t) => IMPACTS.some((x) => Math.abs(x - t) < 1e-6);
const isClashT = () => false;
// fast whiff strikes also bypass the spring lag (crisp, exact), but keep their follow-through tangents
const CRISP = [...IMPACTS];
// BULLET TIME (slow motion on every blow) lives in timemap.js: the film clock is stretched round each contact.
// Hit-stop: freeze d, then an eased release (Hermite offset, speed ramps 0 → >1 → 1) so anchors keep their times.
export function warp(t) {
  let off = 0;
  for (const [ts, d, r] of HITSTOPS) {
    if (t <= ts || t >= ts + d + r) continue;
    if (t < ts + d) { off += t - ts; continue; }
    const u = (t - ts - d) / r, u2 = u * u, u3 = u2 * u;
    off += (2 * u3 - 3 * u2 + 1) * d + (u3 - 2 * u2 + u) * r;   // o(0)=d, o'(0)=1 (still frozen), o(1)=0, o'(1)=0
  }
  return t - off;
}
function findSeg(keys, t) { let lo = 0, hi = keys.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (keys[m][0] <= t) lo = m; else hi = m; } return lo; }
function computeTangents(keys, dim, free) {
  const n = keys.length;
  for (let i = 0; i < n; i++) {
    const k = keys[i];
    k.mi = k.mi || new Float64Array(dim); k.mo = k.mo || new Float64Array(dim);
    const tagIn = k[2], tagNext = i < n - 1 ? keys[i + 1][2] : null;
    const tL = i > 0 ? k[0] - keys[i - 1][0] : 0, tR = i < n - 1 ? keys[i + 1][0] - k[0] : 0;
    const impact = isImpact(k[0]);
    for (let c = 0; c < dim; c++) {
      const sl = i > 0 ? (k[1][c] - keys[i - 1][1][c]) / tL : 0, sr = i < n - 1 ? (keys[i + 1][1][c] - k[1][c]) / tR : 0;
      let m = 0;
      if (i > 0 && i < n - 1) {
        m = (sl * tR + sr * tL) / (tL + tR);
        // monotone, and never faster through a key than the SLOWER side: a move that leaves a slow / resting key starts
        // slow and accelerates through its segment (no constant-speed starts), and decelerates into a slower one
        if (!free && !(tagIn === 'cr' || tagNext === 'cr')) { if (sl * sr <= 0) m = 0; else { const lim = Math.min(Math.abs(sl), Math.abs(sr)); m = clamp(m, -lim, lim); } }
      }
      let mi = m, mo = m;
      if (tagNext === 'in' || tagIn === 'hold' || tagNext === 'hold') { mi = 0; mo = 0; }
      if (tagIn === 'in' && i > 0) { mi = 1.6 * sl; mo = impact ? (isClashT(k[0]) || tagNext === 'in' ? 0 : 0.3 * sl) : (tagNext === 'in' ? 0 : m); if (!impact) mi = mo; }
      k.mi[c] = mi; k.mo[c] = mo;
    }
  }
}
// Pose track (Float64Array poses). fn(t, out, chans?) evaluates all channels or only the listed ones.
function poseTrack(keys) {
  keys = keys.map((k) => [k[0], Float64Array.from(k[1]), k[2]]).sort((a, b) => a[0] - b[0]);
  const fn = (t, out, chans) => {
    if (fn.dirty) { computeTangents(keys, NCH, false); fn.dirty = false; }
    const n = keys.length;
    if (t <= keys[0][0] || t >= keys[n - 1][0]) { const k = keys[t <= keys[0][0] ? 0 : n - 1][1]; if (chans) for (const c of chans) out[c] = k[c]; else out.set(k); return out; }
    const i = findSeg(keys, t), A = keys[i], B = keys[i + 1], dt = B[0] - A[0];
    const u = (t - A[0]) / dt, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = (u3 - 2 * u2 + u) * dt, h01 = -2 * u3 + 3 * u2, h11 = (u3 - u2) * dt;
    if (chans) for (const c of chans) out[c] = h00 * A[1][c] + h10 * A.mo[c] + h01 * B[1][c] + h11 * B.mi[c];
    else for (let c = 0; c < NCH; c++) out[c] = h00 * A[1][c] + h10 * A.mo[c] + h01 * B[1][c] + h11 * B.mi[c];
    return out;
  };
  fn.keys = keys; fn.dirty = true;
  return fn;
}
// Position track: Hermite + an arc bulge on long dashes (sin² profile keeps it C1), so boosts curve instead of
// flying straight lines.
function posTrack(keys) {
  keys = keys.map((k) => [k[0], k[1].slice(), k[2]]).sort((a, b) => a[0] - b[0]);
  const fn = (t) => {
    if (fn.dirty) {
      computeTangents(keys, 3, false);
      keys.forEach((k, i) => {
        const B = keys[i + 1]; k.arc = null;
        if (!B || B[2] === 'cr' || k[2] === 'cr') return;
        const d = sub(B[1], k[1]), L = Math.hypot(d[0], d[1], d[2]);
        if (L < 6) return;
        const f = scl(d, 1 / L), upv = sub([0, 1, 0], scl(f, f[1]));
        const lat = nrm([f[2], 0, -f[0]]), side = (i % 2 ? 1 : -1);
        const dir = nrm(add(scl(nrm(upv), 0.75), scl(lat, 0.65 * side)));
        k.arc = scl(dir, Math.min(6, 0.14 * L));
      });
      fn.dirty = false;
    }
    const n = keys.length;
    if (t <= keys[0][0]) return keys[0][1].slice();
    if (t >= keys[n - 1][0]) return keys[n - 1][1].slice();
    const i = findSeg(keys, t), A = keys[i], B = keys[i + 1], dt = B[0] - A[0];
    const u = (t - A[0]) / dt, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = (u3 - 2 * u2 + u) * dt, h01 = -2 * u3 + 3 * u2, h11 = (u3 - u2) * dt;
    const o = [0, 0, 0], bump = A.arc ? Math.sin(Math.PI * u) ** 2 : 0;
    for (let c = 0; c < 3; c++) o[c] = h00 * A[1][c] + h10 * A.mo[c] + h01 * B[1][c] + h11 * B.mi[c] + (A.arc ? A.arc[c] * bump : 0);
    return o;
  };
  fn.keys = keys; fn.dirty = true;
  return fn;
}
// scalar track (saber, boost …): smoothstep between keys ('lin' = linear, 'out' = cubic out)
const EASE = { lin: (u) => u, out: (u) => 1 - Math.pow(1 - u, 3), io: (u) => u * u * (3 - 2 * u) };
function scalarTrack(keys) {
  keys.sort((a, b) => a[0] - b[0]);
  return (t) => {
    const n = keys.length;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    const i = findSeg(keys, t);
    const [t0, a] = keys[i], [t1, b, e] = keys[i + 1];
    return a + (b - a) * (EASE[e] || EASE.io)(sat((t - t0) / (t1 - t0)));
  };
}
// additive impulses: [t0, pose-delta, attack, release, osc?]. osc → damped spring release (kick, overshoot, settle).
function impulses(list) {
  return (t, out) => {
    for (const [t0, d, at, rel, osc] of list) {
      if (t < t0 || t > t0 + at + rel) continue;
      let k;
      if (t < t0 + at) k = Math.sin(0.5 * Math.PI * (t - t0) / at) ** 2;            // C1 ease-in-out attack
      else { const x = t - t0 - at; k = osc ? Math.exp(-5.5 * x) * Math.cos(osc * x) * (1 - x / rel) : 1 - smooth(0, rel, x); }
      for (let c = 0; c < NCH; c++) out[c] += d[c] * k;
    }
    return out;
  };
}
// ---------------------------------------------------------------- spring follow-through (overlapping action)
// y = x(t−d) − Σ e(τ_k)·[x(t−d−kΔ) − x(t−d−(k+1)Δ)] : the output of a damped spring driven by the key curve x.
// e(τ) is the spring's step-response error, so y lags, overshoots and settles (2–3 visible wobbles).
// Torso leads, upper arm +1 fr, forearm +2 fr, hand +3 fr; head is the most damped (it stabilises).
const SPRING_K = 20;   // taps (8 left a ripple on the motion after every move)
function springGroup(parts, w, z, d) {
  const chans = parts.flatMap((p) => [PIDX[p], PIDX[p] + 1, PIDX[p] + 2]);
  const Wn = 3.5 / (z * w), D = Wn / SPRING_K, wd = w * Math.sqrt(1 - z * z);
  const e = []; for (let k = 0; k < SPRING_K; k++) { const x = (k + 0.5) * D; e.push(Math.exp(-z * w * x) * (Math.cos(wd * x) + (z * w / wd) * Math.sin(wd * x))); }
  return { chans, d, D, e };
}
const GROUPS = [
  // heavy machines: low spring frequencies (limbs lag and settle with weight), damped close to critical — the parts
  // trail and settle ONCE; the old 0.5 damping rang 2–3 times after every blow, and under bullet time that ringing
  // read as the whole machine / the blade swaying back and forth
  // only the secondary chains: the head (always) and the legs (exact only round the kicks). The torso / arms carry the
  // weapons and every contact must be exact — blending a lagged pose out and back in round each blow made a little
  // back-and-forth hitch after every move, so they follow their keys directly (the keys themselves ease in / out)
  Object.assign(springGroup(['head'], 13, 0.99, 1 / 48), { crisp: null }),
  Object.assign(springGroup(['leg_L_upper', 'leg_R_upper', 'leg_L_lower', 'leg_R_lower', 'foot_L', 'foot_R'], 18, 0.99, 1 / 48), { crisp: null }),
];
// filter strength: 0 at impacts (exact, crisp contact), back to 1 within ~0.15 s
function springAmount(tw) {
  let s = 1;
  for (const ti of CRISP) { const x = Math.abs(tw - ti); if (x < 0.32) s *= smooth(0.03, 0.32, x); }   // eased wide: no hitch
  return s;
}
const _xa = new Float64Array(NCH), _xb = new Float64Array(NCH), _y = new Float64Array(NCH);
function springPose(track, tw, out) {
  track(tw, out);
  for (const g of GROUPS) {
    let amt = 1; if (g.crisp) for (const ti of g.crisp) { const x = Math.abs(tw - ti); if (x < 0.32) amt *= smooth(0.03, 0.32, x); }
    if (amt <= 0) continue;
    track(tw - g.d, _xa, g.chans);
    for (const c of g.chans) _y[c] = _xa[c];
    for (let k = 0; k < SPRING_K; k++) {
      track(tw - g.d - (k + 1) * g.D, _xb, g.chans);
      const ek = g.e[k];
      for (const c of g.chans) { _y[c] -= ek * (_xa[c] - _xb[c]); _xa[c] = _xb[c]; }
    }
    for (const c of g.chans) out[c] += amt * (_y[c] - out[c]);
  }
  return out;
}
const POS_SPRING = (() => { const w = 15, z = 0.99, Wn = 3.5 / (z * w), D = Wn / SPRING_K, wd = w * Math.sqrt(1 - z * z); const e = []; for (let k = 0; k < SPRING_K; k++) { const x = (k + 0.5) * D; e.push(Math.exp(-z * w * x) * (Math.cos(wd * x) + (z * w / wd) * Math.sin(wd * x))); } return { D, e }; })();
function springPos(track, tw) {
  const x = track(tw), amt = 0;   // (the position spring's exact-contact blend made the same hitch — the keys ease instead)
  if (amt <= 0) return x;
  const y = x.slice(); let a = x;
  for (let k = 0; k < SPRING_K; k++) { const b = track(tw - (k + 1) * POS_SPRING.D); const ek = POS_SPRING.e[k]; for (let c = 0; c < 3; c++) y[c] -= ek * (a[c] - b[c]); a = b; }
  return lrp(x, y, amt);
}
// anticipation squash: a crouch (legs load, torso folds) just before every fast dash, generated from the position keys
function squashFrom(track, strength = 1) {
  const list = [];
  const ks = track.keys;
  for (let i = 0; i < ks.length - 1; i++) {
    const L = V.dist(ks[i][1], ks[i + 1][1]), dt = ks[i + 1][0] - ks[i][0], v = L / dt;
    if (L > 7 && v > 28 && !isImpact(ks[i][0])) list.push([ks[i][0], Math.min(1, v / 70) * strength]);
  }
  const D = P({ torso: [10, 0, 0], leg_L_upper: [-18, 0, 0], leg_R_upper: [-18, 0, 0], leg_L_lower: [32, 0, 0], leg_R_lower: [32, 0, 0], foot_L: [-8, 0, 0], foot_R: [-8, 0, 0], arm_L_upper: [6, 0, 0], arm_R_upper: [6, 0, 0], _body: [5, 0, 0] });
  return (tw, out) => {
    for (const [t0, k] of list) {
      const x = (tw - (t0 - 0.2)) / 0.26;       // bump over [t0-0.2, t0+0.06], peak just before launch
      if (x <= 0 || x >= 1) continue;
      const b = Math.sin(Math.PI * x) ** 2 * k;
      for (let c = 0; c < NCH; c++) out[c] += D[c] * b;
    }
    return out;
  };
}
// weight / centre of mass. The weapon arm and chest carry the swing; the parts that do NOT carry the weapon react to
// it with a lag (they never move the weapon, so solved contacts stay exact): the hips counter-rotate the chest's twist,
// the legs brace (knees bend, stance widens) in proportion to the swing speed, the head holds the gaze steady.
const _wa = new Float64Array(NCH), _wb = new Float64Array(NCH);
const WCH = [PIDX.torso, PIDX.torso + 1, PIDX.torso + 2, PIDX._body, PIDX._body + 1, PIDX._body + 2];
let twistK = 1;
function weightShift(track, tw, out, weaponArm = 'arm_L_upper') {
  const h = 1 / 24, lag = 1 / 24;
  const chans = [...WCH, PIDX[weaponArm], PIDX[weaponArm] + 1, PIDX[weaponArm] + 2];
  track(tw - lag - h, _wa, chans); track(tw - lag + h, _wb, chans);
  const d = (c) => (_wb[c] - _wa[c]) / (2 * h);
  const twist = d(PIDX.torso + 1) + d(PIDX._body + 1);                          // chest / body yaw rate (rad/s)
  const swing = Math.hypot(d(PIDX[weaponArm]), d(PIDX[weaponArm] + 1), d(PIDX[weaponArm] + 2));   // weapon arm speed
  const lean = d(PIDX.torso) + d(PIDX._body);                                  // chest pitch rate
  let near = 1; for (const ti of IMPACTS) near = Math.min(near, smooth(0.04, 0.25, Math.abs(tw - ti)));   // exact at contacts (kicks use the legs)
  twistK = near;
  const brace = clamp(swing * 0.05, 0, 0.45) * near;
  out[PIDX.pelvis + 1] -= clamp(twist * 0.07, -0.35, 0.35) * twistK;
  out[PIDX.pelvis] -= clamp(lean * 0.04, -0.2, 0.2) * twistK;
  out[PIDX.leg_L_upper] -= brace * 0.7; out[PIDX.leg_R_upper] -= brace * 0.45;
  out[PIDX.leg_L_lower] += brace * 1.1; out[PIDX.leg_R_lower] += brace * 0.8;
  out[PIDX.leg_L_upper + 2] += brace * 0.25; out[PIDX.leg_R_upper + 2] -= brace * 0.25;
  out[PIDX.head + 1] -= clamp(twist * 0.05, -0.3, 0.3);
  out[PIDX.head] -= clamp(lean * 0.03, -0.15, 0.15);
  return out;
}
// continuous micro-motion (real time t, so even hit-stop holds tremble slightly): thruster-hover breathing + weight shift
function micro(t, out, seed, amp = 1) {
  const s = (f, p) => Math.sin(t * f + seed * p);
  out[PIDX.torso] += 0.022 * amp * s(2.1, 1.3); out[PIDX.torso + 2] += 0.012 * amp * s(0.73, 2.1);
  out[PIDX.pelvis + 1] += -0.2 * out[PIDX.torso + 1] * 0.25 + 0.015 * amp * s(0.61, 0.7);   // hips counter the chest twist
  out[PIDX.head + 1] += 0.03 * amp * s(0.9, 3.1); out[PIDX.head] += 0.015 * amp * s(1.7, 0.4);
  out[PIDX.arm_L_upper + 2] += 0.015 * amp * s(1.7, 1.9); out[PIDX.arm_R_upper + 2] -= 0.015 * amp * s(1.9, 2.3);
  out[PIDX.leg_L_upper] += 0.02 * amp * s(1.1, 0.9); out[PIDX.leg_R_upper] += 0.02 * amp * s(1.3, 1.7);
  out[PIDX._body + 2] += 0.015 * amp * s(0.7, 2.7);
  return out;
}
const hover = (t, seed, amp) => [amp * (0.6 * Math.sin(t * 0.83 + seed) + 0.4 * Math.sin(t * 1.91 + seed * 2.3)), amp * 0.8 * (0.6 * Math.sin(t * 1.13 + seed * 1.7) + 0.4 * Math.sin(t * 2.37 + seed)), amp * (0.6 * Math.sin(t * 0.71 + seed * 3.1) + 0.4 * Math.sin(t * 1.57 + seed * 0.3))];

// ============================================================================ VANGUARD pose library (from its own clips)
// VANGUARD's rig rests in an A-pose (arms ~43° out): its arms hang by the sides with arm_L_upper rz ≈ −35°,
// arm_R_upper rz ≈ +35°. Clip poses come straight from js/motion.js (radians, engine convention).
function fromClip(name, ct, over = {}, skip = []) {
  const o = clipPose(name, ct), a = new Float64Array(NCH);
  for (const p in o) { if (skip.includes(p)) continue; const i = PIDX[p]; if (i === undefined) continue; a[i] = o[p][0]; a[i + 1] = o[p][1]; a[i + 2] = o[p][2]; }
  for (const k in over) { const i = PIDX[k]; a[i] = over[k][0] * DEG; a[i + 1] = over[k][1] * DEG; a[i + 2] = over[k][2] * DEG; }
  return a;
}
function withArm(base, src, side) {   // copy one arm (upper, lower, hand) from another pose
  const a = Float64Array.from(base);
  for (const p of ['arm_' + side + '_upper', 'arm_' + side + '_lower', 'hand_' + side]) for (let c = 0; c < 3; c++) a[PIDX[p] + c] = src[PIDX[p] + c];
  return a;
}
const VG = {};
// at ease in the standoff: arms down by its sides, the rifle hanging from the right fist, the shield on the left forearm
// (the enemy is TryoutIndie's white real-robot mech — its own clips: GunPose / Boost_* / Jump / Idle_Pose; rest = arms
// hanging straight down beside the thighs)
const withParts = (base, src, parts) => { const a = Float64Array.from(base); for (const p of parts) for (let c = 0; c < 3; c++) a[PIDX[p] + c] = src[PIDX[p] + c]; return a; };
const LEGS = ['pelvis', 'leg_L_upper', 'leg_L_lower', 'foot_L', 'leg_R_upper', 'leg_R_lower', 'foot_R'];
VG.idle = fromClip('tryout.Idle_Pose', 0);
VG.aim = fromClip('tryout.GunPose', 0);                                          // the rifle up in both hands
VG.guard = W(VG.aim, { torso: [8, -12, 0], head: [-5, 8, 0], arm_L_upper: [-45, 80, 10], arm_L_lower: [-90, 0, 0], hand_L: [0, 0, 0], _body: [0, -10, 0] });   // squared up to him, the shield held diagonally across its front
VG.guardAim = VG.aim;
VG.crouch = withParts(VG.aim, fromClip('tryout.Jump', 0.3), LEGS);               // loading the jump
VG.boost = withParts(VG.aim, fromClip('tryout.Jump', 0.62), LEGS);               // driving up, the rifle still on him
VG.tuck = VG.boost;
VG.fly = withParts(W(VG.aim, { _body: [10, 0, 0] }), fromClip('tryout.Boost_Forward', 0), LEGS);   // on thrusters: legs trailing
VG.charge = withParts(W(VG.aim, { _body: [38, 0, 0], head: [-25, 0, 0] }), fromClip('tryout.Boost_Forward', 0), LEGS);   // flat out: leaning hard into the burn, legs trailing
VG.chargeEmpty = withParts(VG.charge, VG.idle, ['arm_L_upper', 'arm_L_lower', 'hand_L', 'arm_R_upper', 'arm_R_lower', 'hand_R']);   // flat out, empty-handed
VG.reach = W(VG.chargeEmpty, { arm_R_upper: [-165, 0, 25], arm_R_lower: [-85, 0, 0], head: [-10, 20, 0] });            // right hand back over its shoulder
VG.stepL = withParts(W(VG.aim, { _body: [0, 10, 16] }), fromClip('tryout.Boost_Left', 0), [...LEGS, 'torso']);
VG.stepR = withParts(W(VG.aim, { _body: [0, -10, -16] }), fromClip('tryout.Boost_Right', 0), [...LEGS, 'torso']);
VG.hit = W(VG.aim, { torso: [-22, 25, 12], head: [-18, 12, 0], arm_L_upper: [10, -25, 40], arm_L_lower: [-10, 0, 0], _body: [-18, 30, 18] });
// the full-power shot: feet set wide like a gunner on a firing step, weight low and forward, both hands on the rifle
VG.brace = W(VG.aim, { pelvis: [0, -10, 0], torso: [14, 8, 0], head: [-6, -6, 0], leg_L_upper: [-45, 0, 12], leg_L_lower: [70, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [22, 0, -12], leg_R_lower: [60, 0, 0], foot_R: [30, 0, 0], _body: [8, 0, 0] });
VG.limp = P({ pelvis: [10, 0, 0], torso: [28, 10, 15], head: [30, 0, 0], arm_L_upper: [20, 0, 10], arm_L_lower: [-35, 0, 0], arm_R_upper: [25, 0, -8], arm_R_lower: [-40, 0, 0],
  leg_L_upper: [-40, 0, 5], leg_L_lower: [70, 0, 0], leg_R_upper: [-25, 0, -5], leg_R_lower: [60, 0, 0], _body: [0, 0, 0] });
VG.recoil = W(VG.brace, { torso: [-6, 8, 0], head: [-10, 0, 0], _body: [-8, 0, 0] });
// its ULTIMATE: it gathers itself in (curled, arms drawn in across the chest, knees up) while the back charges, then throws
// itself open — chest out, arms flung wide, head back — as the beams burst out of its back
VG.gather = W(VG.idle, { torso: [28, 0, 0], head: [18, 0, 0], arm_L_upper: [-35, -25, -15], arm_L_lower: [-70, 0, 0], arm_R_upper: [-35, 25, 15], arm_R_lower: [-70, 0, 0],
  leg_L_upper: [-60, 0, 5], leg_L_lower: [90, 0, 0], foot_L: [20, 0, 0], leg_R_upper: [-50, 0, -5], leg_R_lower: [85, 0, 0], foot_R: [20, 0, 0], _body: [10, 0, 0] });
VG.ult = W(VG.idle, { torso: [-25, 0, 0], head: [-25, 0, 0], arm_L_upper: [-20, 0, 65], arm_L_lower: [-15, 0, 0], arm_R_upper: [-20, 0, -65], arm_R_lower: [-15, 0, 0],
  leg_L_upper: [15, 0, 18], leg_L_lower: [20, 0, 0], leg_R_upper: [15, 0, -18], leg_R_lower: [20, 0, 0], _body: [-12, 0, 0] });
VG.ultDown = W(VG.ult, { torso: [-18, 12, 0], head: [-10, 25, 0], arm_L_upper: [0, 0, 22], arm_L_lower: [-12, 0, 0], hand_L: [0, 0, 0], arm_R_upper: [0, 0, -22], arm_R_lower: [-12, 0, 0], hand_R: [0, 0, 0] });   // spent: arms held a little open, an A (the cut still goes square through them)
export const POSE_LIB = { hero: L, vanguard: VG };

// ============================================================================ choreography
// Frame: HM = where Sigma held in the standoff, D1 = Sigma → VANGUARD, L1 = Sigma's left. The fight turns round MID:
// both machines ride opposite ends of a turning diameter (ringH / ringE: angle φ, radius r, height h).
const HM = G(42, 52, 10);
const D1 = nrm([-38, 0, -32]);
const L1 = [D1[2], 0, -D1[0]];
const F1 = (a, l, h) => [HM[0] + D1[0] * a + L1[0] * l, HM[1] + h, HM[2] + D1[2] * a + L1[2] * l];
// the fight is fought at ~3x the first cut's range (180–300 m apart): radii below are authored at the old scale and
// multiplied by RS (heights by HS); the ring centre sits so Sigma's standoff spot is its φ = 0 point
const RS = 3, HS = 2;
const MID = F1(-5.5 + 33 * RS, 1.5, -2);
const ringH = (phi, r, h) => [MID[0] - r * RS * (Math.cos(phi) * D1[0] + Math.sin(phi) * L1[0]), MID[1] + h * HS, MID[2] - r * RS * (Math.cos(phi) * D1[2] + Math.sin(phi) * L1[2])];
const ringE = (phi, r, h) => ringH(phi + Math.PI, r, h);

// the enemy's shots (name kept from the SERAPH version): at range, from the top of its flip (inverted), in the zig-zag
// advance, round the circling run. Its full-power shot: FINALE_T (he slips it).
export const SERAPH_SHOTS = [176.75, 177.5, 178.35, 181.4, 182.1, 182.8, 184.45, 185.35, 186.4, 187.45];
export const FINALE_T = 190.85, FINALE_END = 191.35;
export const ENEMY_GRAB = 173.45, ENEMY_EYE = 173.95, ENEMY_CHARGE0 = 174.1, ENEMY_CHARGE1 = 175.15;   // it rips its rifle off its hip, levels it, its eye glints, it charges (3 steps)
// the transforming shot (see transPath): the rifle opens out TRANS0 →, fires at TRANS_SHOT, the energy body bursts at TRANS_HIT
export const TRANS0 = 183.95, TRANS_SHOT = 184.45, TRANS_PASS = 184.95, TRANS_HIT = 185.13;   // fires → a hair past his head → bursts behind him
export const transK = (t) => smooth(TRANS0, TRANS0 + 0.35, t) * (1 - smooth(184.95, 185.35, t));
// ULTIMATE (FINALE_T): a dozen heavy beams burst out of its back in every direction, bend round and home onto him — they
// converge on where he was at ULT_HIT; he is already gone (the Sandevistan, SANDE0). Each beam: a cubic Bézier from the
// back (p0) out along its launch direction (p1), swinging round (p2) onto the target (p3); ti launch, ta arrival.
export const ULT_N = 12, ULT_HIT = 191.44;
const ULT_BACK = [0, 3.4, -2.0];   // torso-local: between the backpack thrusters
const hsh = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
let _ult = null;
export function ultBeams() {
  if (_ult) return _ult;
  const e = enemyRaw_(FINALE_T), E = duelFK(e, 'enemy_ms'), p0 = partPoint(E, 'torso', ULT_BACK);
  const f = nrm([e.fwd[0], 0, e.fwd[2]]), back = scl(f, -1), side = [f[2], 0, -f[0]], upv = [0, 1, 0];
  const tgt0 = add(heroRawPos(SANDE0 + 0.03), [0, 9, 0]), dist = V.dist(p0, tgt0);
  _ult = [];
  for (let i = 0; i < ULT_N; i++) {
    const a = 2 * Math.PI * (i + 0.3 * hsh(i)) / ULT_N, c = (58 + 22 * hsh(i + 20)) * DEG;
    const rad = add(scl(side, Math.cos(a)), scl(upv, Math.sin(a) * 0.9 + 0.25));
    const d = nrm(add(scl(back, Math.cos(c)), scl(nrm(rad), Math.sin(c))));
    const p3 = add(tgt0, [(hsh(i + 40) - 0.5) * 10, (hsh(i + 60) - 0.5) * 8, (hsh(i + 80) - 0.5) * 10]);
    const L = dist * (0.35 + 0.2 * hsh(i + 5)), p1 = add(p0, scl(d, L));
    const p2 = add(lrp(p1, p3, 0.55), scl(d, L * 0.35));
    const ti = FINALE_T + 0.018 * i, ta = ULT_HIT + 0.012 * i;
    _ult.push({ p0: add(p0, scl(d, 2.5)), p1, p2, p3, ti, ta });
  }
  return _ult;
}
export const ultPoint = (b, u) => { const v = 1 - u; return add(add(scl(b.p0, v * v * v), scl(b.p1, 3 * v * v * u)), add(scl(b.p2, 3 * v * u * u), scl(b.p3, u * u * u))); };
// ITANO CIRCUS (Macross Plus YF-21 vs X-9 as the reference) — a long chase: story C0–C1 is stretched to ~8.6 s of film
// (timemap SLOW_RANGES) and everything in it runs on the CIRCUS CLOCK = film seconds since the launch, so it moves at
// full speed on screen: he breaks away in a wide evasive run (circusOffset, back on his mark by the end), and three
// waves of missiles pop out of its ports, hairpin, sweep after him in big S-curves and burst one after another on his
// heels from ~2.6 s to the end
export const CIRCUS_C0 = 190.9, CIRCUS_C1 = 191.1;
const _cf0 = filmT(FINALE_T);
export const circusClock = (t) => filmT(t) - _cf0;                  // film seconds since the launch
export const circusStory = (c) => storyT(_cf0 + c);                 // … and back to story time
export const CIRCUS_END = circusClock(CIRCUS_C1);
export const CIRCUS_B1 = 3.5, CIRCUS_B2 = 4.5, CIRCUS_B3 = 5.9;   // the circus's cuts (circus clock): one take | on his tail | head-on | wide
const chaseK = (c) => smooth(0.3, 1.8, c) * (1 - smooth(CIRCUS_END - 1.8, CIRCUS_END - 0.15, c));
let _chaseAx = null;
function chaseAxes() {   // the frame his run is laid out in: along the line to it, sideways, up — and run = the one take's screen-left
  if (_chaseAx) return _chaseAx;
  const f = nrm(flat(sub(e2Pos(FINALE_T), heroPos0(FINALE_T)), 0)), sd = nrm(V.cross([0, 0, 0], f, [0, 1, 0]));
  const camOff = add(add(scl(sd, -140), scl(f, 170)), [0, 330, 0]), F = nrm(scl(camOff, -1)), Rt = nrm(V.cross([0, 0, 0], F, [0, 1, 0]));
  const run = nrm(flat(scl(Rt, -1), 0));
  return (_chaseAx = { f, sd, camOff, run });
}
/** his evasive run as an offset from his story position (zero at both ends) */
export function circusOffset(t) {
  const c = circusClock(t); if (c <= 0 || c >= CIRCUS_END) return [0, 0, 0];
  const { f, run: sd } = chaseAxes();   // (runs toward the one take's screen-left)
  // ONE WAY: he breaks off to his side and keeps running that way, accelerating (~520 m out by the end), a slow rise and
  // fall on it and small jinks; the one take ends on him out there and the cut (D22) hides his return to his mark
  const g = Math.pow(sat((c - 0.35) / (CIRCUS_END - 0.35)), 1.3), jk = smooth(0.35, 1.2, c);
  const x = 1040 * g + 14 * Math.sin(2.6 * c) * jk, y = 160 * Math.sin(Math.PI * g) + 9 * Math.sin(3.3 * c + 1) * jk, z = 0;   // (twice the speed: ~1 km out by the end)
  return add(add(scl(sd, x), [0, y, 0]), scl(f, z));
}
export const ULT_M = 480;   // (ten times the first cut: a sky full of them)
let _sw = null;
export function ultSwarm() {
  if (_sw) return _sw;
  // after the reference (Macross Delta, the missile volley at 9:31): VOLLEYS — 8 salvos of 60 leave the ports together
  // and fly as a flock (thin parallel trails sweeping round in one long arc), then peel apart and come curling in at him
  // from every side; 1 in 3 bursts where he's just been, the rest whip past through the space he left
  const B = ultBeams(), HP = (c) => add(heroRawPos(circusStory(c)), [0, 9, 0]);
  const order = Array.from({ length: ULT_M }, (_, k) => k).sort((a, b) => hsh(a * 3.7 + 1) - hsh(b * 3.7 + 1));
  const NV = 8, PER = ULT_M / NV, p0c = B.reduce((acc, b) => add(acc, scl(b.p0, 1 / B.length)), [0, 0, 0]);
  const e = enemyRaw_(FINALE_T), fE = nrm([e.fwd[0], 0, e.fwd[2]]), sE = [fE[2], 0, -fE[0]];
  _sw = [];
  for (let k = 0; k < ULT_M; k++) {
    const r = order.indexOf(k), v = Math.floor(r / PER), i = r % PER, b = B[i % ULT_N], h = (n) => hsh(k * 7.31 + n), hv = (n) => hsh(v * 17.3 + n);
    const lc = 0.1 + v * (CIRCUS_END - 2.6) / (NV - 1) + i * 0.004;                     // salvo v: 60 out of the ports in a quarter second
    const sc = lc + 1.8 + (v === NV - 1 ? 0.3 : 1.0) * (i / PER) + 0.12 * h(18);          // … arriving over a second, one after another (the last salvo all but together: the big one he slips at the end)
    // the flock: one shared swing for the salvo (up and out of its back, round to one side), each missile a lane in it
    const dV = nrm(add(add(scl(fE, -0.6), [0, 0.9, 0]), scl(sE, (hv(1) - 0.5) * 2.2)));
    const lane = add(scl(sE, (h(2) - 0.5) * 18), [0, (h(3) - 0.5) * 14, 0]);
    const q1 = add(add(p0c, scl(dV, 220 + 60 * hv(2))), lane);
    // then each peels off onto its own line in at him, from all round
    const th = 2 * Math.PI * h(4), ph = Math.acos(1.6 * h(5) - 0.8), dirk = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    const hit = k % 3 === 0, tgt = HP(sc - (hit ? 0.05 + 0.2 * h(6) : 0));
    const p2 = add(add(HP(sc - 0.35), scl(dirk, 130 + 60 * h(7))), scl(lane, 0.5));
    const p3 = hit ? add(tgt, [(h(8) - 0.5) * 8, (h(9) - 0.5) * 6, (h(10) - 0.5) * 8]) : add(tgt, scl(dirk, -(25 + 20 * h(11))));   // a miss crosses past him and on
    _sw.push({ p0: b.p0, q1, p2, p3, lc, sc, ti: circusStory(lc), ta: circusStory(sc), port: i % ULT_N, hit, volley: v });
  }
  return _sw;
}
/** a missile's position at circus clock c (null before launch) */
export function missilePosC(m, c) {
  if (c < m.lc) return null;
  if (c > m.sc && !m.hit) {                                                            // a miss: straight on past him
    if (!m.vEnd) m.vEnd = scl(sub(missilePosC(m, m.sc), missilePosC(m, m.sc - 0.02)), 50);
    return add(m.p3, scl(m.vEnd, c - m.sc));
  }
  const u = Math.min(1, (c - m.lc) / (m.sc - m.lc)), x = u * (0.45 + 0.55 * u), v = 1 - x;   // quick off the port, one smooth sweep
  return add(add(scl(m.p0, v * v * v), scl(m.q1, 3 * v * v * x)), add(scl(m.p2, 3 * v * x * x), scl(m.p3, x * x * x)));
}
export const missilePos = (m, t) => missilePosC(m, circusClock(t));
// Sigma's shots: 178.7 is taken on the shield; 183.25 tears the shield off; the charged 192.35 goes through its chest
// how each shot is fired: 'hip' from the hip, 'aim' two-handed on the shoulder, 'snap' one arm thrown out, 'burst' three quick
export const HERO_STYLE = ['hip', 'aim', 'aim', 'snap', 'burst', 'hip', 'aim', 'aim', 'aim', 'burst'];
export const ENEMY_STYLE = { 176.75: 'aim', 177.5: 'hip', 178.35: 'aim', 179.95: 'snap', 181.4: 'burst', 182.1: 'hip', 182.8: 'aim', 184.45: 'aim', 185.35: 'snap', 186.4: 'burst', 187.45: 'hip' };
export const HERO_SHOTS = [177.2, 177.85, 178.7, 180.55, 181.7, 182.4, 183.25, 185.9, 186.85, 187.9];
// the bursts: two more quick shots after a 'burst' shot (both sides), laid on just past the target
export const HERO_BURST = HERO_SHOTS.filter((t, i) => HERO_STYLE[i] === 'burst').flatMap((t) => [t + 0.12, t + 0.24]);
export const ENEMY_BURST = SERAPH_SHOTS.filter((t) => ENEMY_STYLE[t] === 'burst').flatMap((t) => [t + 0.12, t + 0.24]);
export const BLOCK_T = 178.7, SHIELD_HIT_T = 183.25;
// shots that REALLY land: they burn a hole through the armour where they hit (shots.js: per-part melt holes)
export const THIGH_T = 186.85, HERO_HIT_T = 185.35;          // his shot into its right thigh; its shot into his left pauldron
const THIGH_P = [-0.87, -2.2, 0.3], PAULDRON_P = [2.3, 1.5, 0];
// THE FINISH (Cyberpunk 2077 "Sandevistan"): having slipped its full-power shot he slings the rifle, draws the beam saber
// and crosses the ~95 m in a blink — the world all but frozen round him (a long bullet-time window, timemap.js), a trail
// of neon afterimages behind — and cuts it in half at the waist as he passes
export const SANDE0 = 191.3, SANDE1 = 192.2, CUT_T = 192.05;
export const CUT_Y = 3.7;   // (above the pelvis block's top, so the halves don't overlap)
export const CUT_SPLIT = CUT_T + 0.04;
let _cutArms = null;
/** the cut plane (torso-local y = CUT_Y) in each upper arm's own frame at the cut: its local y there (arms hang along the torso) */
export function cutArms() {
  if (_cutArms) return _cutArms;
  const E = duelFK(enemyRaw_(CUT_T), 'enemy_ms'), P = partPoint(E, 'torso', [0, CUT_Y, 0]);
  _cutArms = {};
  for (const p of ['arm_L_upper', 'arm_R_upper']) _cutArms[p] = M.transformPoint([0, 0, 0], M.invert(M.new(), E[p]), P)[1];
  return _cutArms;
}   // the blade is through: the halves start to part   // the cut: torso-local height of the waist line (VANGUARD torso pivot 10.9 m)
export const KILL_SHOT_T = CUT_T;   // (old name: the killing blow)
export const WING_HIT_T = SHIELD_HIT_T;   // (old name)
export const SERAPH_HANDOFF = 180.9;       // duelEnemy1 → duelEnemy2 (one machine; the slot changes on a cut)

// the circling run (183.8–188.4): both ride the ring fast (φ sweeps 3.2 rad, ~40 m/s at the peak), weaving up and down
// in counterpoint; quick-boost jinks out of each other's shots
const RUN0 = 183.8, RUN1 = 188.4, PH0 = 1.84, PH1 = 5.05, PE0 = 1.74;
const runU = (t) => { const u = sat((t - RUN0) / (RUN1 - RUN0)); return u * u * (3 - 2 * u); };
const jink = (t, t0, dur = 0.8) => { const x = (t - t0) / dur; return x <= 0 || x >= 1 ? 0 : easeOut(Math.min(1, x / 0.3)) * (1 - smooth(0.3, 1, x)); };
const runH = (t) => ringH(PH0 + (PH1 - PH0) * runU(t) - 0.12 * jink(t, 186.35), 40 + 2 * Math.sin((t - RUN0) * 1.3), -2 + 6 * Math.sin((t - RUN0) * 2.7) - 7 * jink(t, 185.3));
const runE = (t) => ringE(PE0 + (PH1 - PH0 + 0.05) * runU(t) + 0.14 * jink(t, 184.85) - 0.14 * jink(t, 185.85) + 0.12 * jink(t, 186.83), 38 - 2 * Math.sin((t - RUN0) * 1.1), 6 - 6 * Math.sin((t - RUN0) * 2.7 + 0.8));
const RUN_KEYS = (f) => { const k = []; for (let t = 184.1; t < RUN1 - 0.05; t += 0.3) k.push([+t.toFixed(3), f(t), 'cr']); return k; };
const PHH = PH1, PHE = PE0 + (PH1 - PH0 + 0.05);   // where the run ends

// ---------------- VANGUARD
const E_BACK = scl(D1, 33 * RS * 2 - 66);           // where the ring fight starts for it, at the fight's range
const E_MARK = () => add(G(-6, 49.5, -27), E_BACK);
const e1Pos = posTrack([
  // no standoff: from ~700 m it drives straight at him, jinking, firing twice on the way in
  [170.0, add(E_MARK(), add(scl(D1, 450), [0, 60, 0]))],
  [173.2, add(E_MARK(), add(scl(D1, 230), [0, 30, 0])), 'cr'],       // flat out at him, rifle levelled in both hands
  [176.45, E_MARK(), 'io'],
  [176.75, ringE(0.02, 33, -2.5), 'io'],              // fires first
  [177.1, ringE(0.16, 33, -1), 'io'],
  [177.35, ringE(0.36, 30, 2.5), 'out'],              // flicks aside from his answer (177.2)
  [177.6, ringE(0.44, 30, 2.5), 'io'],                // fires 177.5
  [177.85, ringE(0.56, 32, 0), 'io'],
  [178.1, ringE(0.76, 35, -4), 'out'],                // and again (177.85)
  [178.4, ringE(0.84, 35, -4), 'io'],                 // fires 178.35
  [178.72, ringE(0.96, 34, -2.5), 'io'],              // takes his 178.7 on the shield
  [179.0, ringE(1.02, 34.5, -2), 'out'],              // (pushed back a little)
  [179.3, ringE(1.1, 34, -3), 'io'],                  // crouches …
  [179.62, ringE(1.2, 37, 8), 'out'],                 // … and boost-jumps
  [179.95, ringE(1.26, 41, 16), 'io'],                // at the top of the boost: fires down at him
  [180.4, ringE(1.3, 46, 21), 'io'],
  [180.9, ringE(1.36, 50, 23), 'io'],
]);
const e2Pos = posTrack([
  [180.8, ringE(1.35, 49.6, 23)], [180.9, ringE(1.36, 50, 23), 'io'],
  // ---- the zig-zag advance: quick-boost, fire, quick-boost …
  [181.15, ringE(1.52, 47, 19), 'out'],               // out of his 180.55 line
  [181.4, ringE(1.55, 46, 18), 'io'],                 // fires
  [181.75, ringE(1.36, 42, 14), 'out'],               // (his 181.7)
  [182.1, ringE(1.34, 40, 12), 'io'],                 // fires
  [182.45, ringE(1.58, 36, 9), 'out'],                // (his 182.4)
  [182.8, ringE(1.6, 34, 8), 'io'],                   // fires
  [183.27, ringE(1.66, 31, 6.5), 'io'],               // his 183.25 tears the shield off
  [183.55, ringE(1.7, 34, 8), 'out'],                 // knocked back, spinning
  [183.8, runE(183.8), 'io'],
  ...RUN_KEYS(runE),                                  // ---- the circling run
  [RUN1, ringE(PHE, 40, 4), 'io'],
  // ---- breaks away, turns, braces and charges the full-power shot
  [189.2, ringE(PHE + 0.06, 58, 3), 'out'],
  [189.75, ringE(PHE + 0.07, 62, 2), 'io'],
  [190.85, ringE(PHE + 0.07, 62, 2), 'io'],           // fires at full power
  [191.3, ringE(PHE + 0.07, 63.5, 2.2), 'out'],       // (the recoil)
  [191.9, ringE(PHE + 0.07, 63, 2), 'io'],
  [192.4, ringE(PHE + 0.09, 62.5, 3), 'io'],          // (cut in half at CUT_T)
  [193.2, ringE(PHE + 0.1, 64, 1), 'out'], [194.0, ringE(PHE + 0.11, 65, -1), 'io'],
]);
// the Sandevistan dash: from where he slipped the shot, straight at it in three hard zig-zag legs, passing it on his
// RIGHT so the blade (left hand) sweeps through its waist (CUT_T), and on past
const E_CUT = e2Pos(CUT_T), D_S0 = ringH(PHH + 0.35, 35, -3.5);
const D_U = nrm([E_CUT[0] - D_S0[0], 0, E_CUT[2] - D_S0[2]]), D_L = [D_U[2], 0, -D_U[0]];   // dash direction, his left
const DP = (a, l, h) => [E_CUT[0] + D_U[0] * a + D_L[0] * l, E_CUT[1] + h, E_CUT[2] + D_U[2] * a + D_L[2] * l];
const D_LEN = Math.hypot(E_CUT[0] - D_S0[0], E_CUT[2] - D_S0[2]);
// ---------------- Sigma
const heroPos = posTrack([
  // no standoff: out of the launch he drives straight at it, jinking out of its two shots, answering
  [170.0, G(60, 10, 120)],
  [173.2, G(54, 38, 58), 'cr'],                         // flat out at it, both hands on the rifle
  [176.5, G(46, 50, 14), 'io'],
  // ---- the exchange at range (the ring): quick-boosts out of each shot, answers from the hold
  [176.95, ringH(0.3, 34, 0.5), 'out'],                  // out of its first shot (176.75)
  [177.35, ringH(0.42, 33, 1), 'io'],                    // fires 177.2
  [177.65, ringH(0.64, 31, -3.5), 'out'],                // down, out of the second (177.5)
  [177.95, ringH(0.76, 32, -3.5), 'io'],                 // fires 177.85
  [178.25, ringH(0.88, 34, 0), 'io'],
  [178.55, ringH(1.08, 36, 5), 'out'],                   // up over the third (178.35)
  [178.9, ringH(1.18, 36, 4.5), 'io'],                   // fires 178.7 — the shield takes it
  [179.4, ringH(1.28, 35, 2), 'io'],
  [179.85, ringH(1.4, 36, 0), 'io'],                     // it jumps: he tracks it
  [180.3, ringH(1.62, 38, -5), 'out'],                   // rolls out from under its inverted shot (179.95)
  [180.75, ringH(1.66, 38, -4), 'io'],                   // fires 180.55
  // ---- it comes at him in a zig-zag: he gives ground, answering
  [181.3, ringH(1.8, 40, -6), 'out'],                    // side-step (its 181.4 shot)
  [181.75, ringH(1.82, 41, -6), 'io'],                   // fires 181.7
  [182.05, ringH(1.62, 43, -1), 'out'],                  // (182.1)
  [182.45, ringH(1.6, 44, -1), 'io'],                    // fires 182.4
  [182.75, ringH(1.76, 45, -5), 'out'],                  // (182.8)
  [183.3, ringH(1.78, 45, -5), 'io'],                    // fires 183.25: the shield is torn off its arm
  [183.8, runH(183.8), 'io'],
  ...RUN_KEYS(runH),                                     // ---- the circling run
  [RUN1, ringH(PHH, 40, -2), 'io'],
  // ---- it breaks away to charge a full-power shot; he stops, turns, and slips it at the last instant
  [189.2, ringH(PHH + 0.04, 36, -3), 'io'],
  [190.72, ringH(PHH + 0.05, 36, -3), 'io'],
  [191.0, ringH(PHH + 0.33, 35, -3.5), 'out'],           // the slip: ~10 m sideways as it fires (190.85)
  [SANDE0, D_S0, 'io'],                                  // slung the rifle, saber lit
  [191.47, DP(-D_LEN * 0.8, -9, 2), 'cr'],              // SANDEVISTAN: three hard legs …
  [191.66, DP(-D_LEN * 0.5, 5, -1), 'cr'],
  [191.86, DP(-D_LEN * 0.2, -11, 1.5), 'cr'],
  [192.0, DP(-5, -12.5, 1.8), 'cr'],                    // … in at its left side
  [CUT_T, DP(1, -12, 1.8), 'cr'],                       // THE CUT, passing
  [192.3, DP(16, -11, 2.2), 'out'],                      // carried on past it
  [192.9, DP(24, -3, 2), 'io'],
  [193.8, DP(36, -12, 3), 'io'], [194.6, DP(44, -14, 3), 'io'],   // on away from it (the reactor goes behind him)
]);
const heroPose = poseTrack([
  [169.3, L.flight], [170.0, L.flight], [170.2, L.windup, 'out'], [170.5, L.flyAim, 'out'],   // winds up, rips the rifle off his back (the arms are IK'd: heroDraw)
  [176.55, L.flyAim, 'io'], [176.95, L.dodgeAimL, 'out'], [177.3, L.flyAim, 'io'],
  [177.65, L.dodgeAimR, 'out'], [177.95, L.flyAim, 'io'], [178.25, L.flyAim, 'io'],
  [178.55, L.dodgeUpAim, 'out'], [178.9, L.aimRifle, 'io'], [179.4, L.flyAim, 'io'],
  [179.85, L.aimUp, 'io'], [180.1, L.dodgeAimR, 'io'], [180.4, L.aimUp, 'io'], [180.75, L.aimRifle, 'io'],
  [181.3, L.dodgeAimL, 'out'], [181.75, L.aimRifle, 'io'], [182.05, L.dodgeAimR, 'out'], [182.45, L.aimRifle, 'io'],
  [182.75, L.dodgeAimL, 'out'], [183.3, L.aimRifle, 'io'],
  [183.9, L.flyAim, 'io'], [185.3, L.flyAim], [185.55, L.dodgeUpAim, 'out'], [185.9, L.flyAim, 'io'],
  [186.4, L.dodgeAimR, 'out'], [186.8, L.flyAim, 'io'], [188.3, L.flyAim],
  [189.2, L.aimRifle, 'io'], [190.72, L.aimRifle], [190.93, L.flee, 'io'], [191.09, L.flee], [191.17, L.stow, 'io'],   // (the Itano-circus run: flat out in flight) [SANDE0, L.sandeDash, 'io'],
  [191.95, L.sandeDash], [CUT_T - 0.04, L.iaiWind, 'io'], [CUT_T + 0.03, L.iaiMid, 'in'], [192.3, L.iaiEnd, 'out'],
  [193.2, L.iaiEnd], [194.6, L.finish, 'io'],
]);
const heroImp = impulses([
  // beam-rifle recoil: hand kicks up and back, torso rocks, a damped settle
  ...HERO_SHOTS.map((t) => [t + 0.001, P({ arm_R_upper: [10, 0, 0], arm_R_lower: [-14, 0, 0], hand_R: [-16, 0, 0], torso: [-6, 5, 0], head: [-4, 0, 0], _body: [-4, 0, 0] }), 0.035, 0.5, 16]),
]);
// the finale: the rifle charges (190.95 → the shot at 192.35) — its glow and the muzzle gather light, then all of it goes
export const rifleCharge = () => 0;   // (the finish is the saber now)
export const maceCharge = () => 0;
const heroBoost = scalarTrack([[170, 1], [175.9, 1], [176.5, 0.7],
  ...[176.75, 177.5, 178.35, 180.0, 181.05, 181.85, 182.55, 185.3, 186.35, 190.72].flatMap((t) => [[t - 0.02, 0.6], [t + 0.03, 1, 'lin'], [t + 0.3, 0.6]]),
  [183.8, 0.7], [184.3, 1], [187.8, 1], [188.4, 0.7], [189.2, 0.5], [191.25, 0.5], [SANDE0, 1, 'lin'], [192.3, 1], [192.7, 0.6], [194.6, 0.3]]);
// barrel rolls: out from under the inverted shot (179.95), and the end of the zig-zag
const heroRoll = (tw) => { let r = 0; for (const [t0, d, s] of [[179.98, 0.36, -1]]) { const u = sat((tw - t0) / d); r += s * 2 * Math.PI * u * u * (3 - 2 * u); } return r; };

const enemyPose = poseTrack([
  [169.5, VG.fly], [170.6, VG.chargeEmpty, 'io'], [173.3, VG.chargeEmpty], [173.75, VG.charge, 'out'], [175.7, VG.charge], [176.3, VG.fly, 'io'],   // hand to the hip rifle, the draw, a hard stop   // the charge: flat out, the rifle levelled in both hands
  [176.62, VG.aim, 'io'], [177.1, VG.fly, 'io'],   // levels the rifle; fires first
  [177.35, VG.stepL, 'out'], [177.6, VG.fly, 'io'], [178.1, VG.stepR, 'out'], [178.4, VG.fly, 'io'],
  [178.6, VG.guard, 'io'], [178.9, VG.guard], [179.1, VG.fly, 'io'],   // the shield up for his 178.7
  [179.3, VG.crouch, 'io'], [179.55, VG.boost, 'out'],
  [179.82, W(VG.aim, { _body: [28, 0, 0] }), 'io'], [180.15, W(VG.aim, { _body: [22, 0, 0] })],   // over him: nose-down, the rifle on him
  [180.5, VG.boost, 'io'], [180.9, VG.fly, 'io'],
  [181.15, VG.stepR, 'out'], [181.4, VG.fly, 'io'], [181.75, VG.stepL, 'out'], [182.1, VG.fly, 'io'],
  [182.45, VG.stepR, 'out'], [182.8, VG.fly, 'io'], [183.2, VG.fly],
  [183.4, VG.hit, 'out'], [183.8, VG.aim, 'io'],       // the shield gone, it fights on one-handed
  [184.2, VG.fly, 'io'], [188.4, VG.fly],
  [189.2, VG.fly, 'io'], [189.8, VG.gather, 'io'], [190.8, VG.gather], [FINALE_T + 0.08, VG.ult, 'out'], [191.6, VG.ult], [191.85, VG.ultDown, 'io'],   // the ultimate, then its arms drop (the rifle thrown away: arms flung wide, it is open to the cut)
  [CUT_T - 0.02, VG.ultDown], [CUT_T + 0.25, W(VG.hit, { torso: [-35, 10, 20] }), 'out'], [193.4, VG.limp, 'io'],
]);
const enemyImp = impulses([
  ...SERAPH_SHOTS.map((ts) => [ts + 0.001, P({ arm_R_upper: [-12, 0, 0], torso: [-6, 0, 0], _body: [-4, 0, 0] }), 0.03, 0.45, 14]),   // recoil
  [TRANS_SHOT + 0.002, P({ arm_R_upper: [-30, 0, 0], arm_L_upper: [-24, 0, 0], torso: [-26, 0, 0], head: [-16, 0, 0], _body: [-24, 0, 0] }), 0.05, 0.9, 6],   // the heavy shot throws it back hard             // the shield takes it
  [FINALE_T, P({ torso: [-12, 0, 0], head: [-10, 0, 0], _body: [-8, 0, 0] }), 0.05, 0.6],                               // the beams tear out of its back
]);
// the backflip (179.62–180.4): the body turns over backwards; limbs from VANGUARD's own Backflip clip (1.0 → 2.7 s)
const FLIP0 = 179.6, FLIP1 = 180.42;
const flipK = (tw) => { const u = sat((tw - FLIP0) / (FLIP1 - FLIP0)); return u; };
function flipLayer(tw, out) {
  return 0;                                             // (no backflip any more: it boosts straight up and fires down)
  const u = flipK(tw); if (u <= 0 || u >= 1) return 0;
  const w = smooth(0, 0.12, u) * (1 - smooth(0.88, 1, u));
  const cp = clipPose('vanguard.Backflip', 1.0 + 1.7 * u);
  for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L', 'leg_L_upper', 'leg_L_lower', 'foot_L', 'leg_R_upper', 'leg_R_lower', 'foot_R', 'head']) {
    const i = PIDX[p], v = cp[p]; if (!v) continue;
    for (let c = 0; c < 3; c++) out[i + c] = lerp(out[i + c], v[c], w);
  }
  const e = u * u * (3 - 2 * u);
  return -2 * Math.PI * e;                              // body pitch (backwards)
}
// the shield-hit spin (183.28 →): knocked half round, then back to face him
const shieldSpin = (tw) => { const x = tw - SHIELD_HIT_T - 0.03; return x <= 0 || x > 0.9 ? 0 : 1.3 * Math.sin(Math.PI * Math.min(1, x / 0.9)) * Math.exp(-x * 1.2); };
const enemyRoll = () => 0;   // (no barrel roll: it quick-boosts sideways out of his 186.85 — runE)
// where it aims (its rifle laid on him, the lead locked a quarter second before each shot — he quick-boosts out of it)
// (where his left pauldron is at the hit — worked out once; while it is being worked out his pose asks for the enemy's,
// which would ask for this again, so that inner call aims at him the ordinary way)
let _pauldronW = null, _pauldronBusy = false;
function pauldronW() {
  if (!_pauldronW) { _pauldronBusy = true; try { _pauldronW = partPoint(duelFK(duelHero_(HERO_HIT_T + 0.04), 'gundam'), 'arm_L_upper', PAULDRON_P); } finally { _pauldronBusy = false; } }
  return _pauldronW;
}
function enemyAim(tw) {
  if (tw > HERO_HIT_T - 0.45 && tw < HERO_HIT_T + 0.3 && !_pauldronBusy) return pauldronW();   // this one lands
  const ts = SERAPH_SHOTS.find((x) => tw > x - 0.45 && tw < x + 0.3), ta = ts !== undefined ? ts - 0.25 : tw - 0.1;
  const p = heroRawPos(ta), q = heroRawPos(ta - 0.1), lead = ts !== undefined ? (ts - ta) / 0.1 : 1.2;
  return add(add(p, scl(sub(p, q), lead)), [0, 9, 0]);
}
const ENEMY_AIM = (tw) => { let k = smooth(ENEMY_GRAB, ENEMY_GRAB + 0.27, tw) * (1 - smooth(178.45, 178.6, tw)) + smooth(179.1, 179.3, tw) * (1 - smooth(179.45, 179.6, tw))
    + smooth(180.5, 180.9, tw) * (1 - smooth(183.25, 183.35, tw)) + smooth(183.8, 184.1, tw) * (1 - smooth(189.3, 189.7, tw));   // (the rifle goes down for the ultimate)
  for (const ts of SERAPH_SHOTS) k = Math.max(k, smooth(ts - 0.35, ts - 0.2, tw) * (1 - smooth(ts + 0.12, ts + 0.3, tw)));
  return Math.min(1, k); };
const enemyBoost = scalarTrack([[170, 1], [175.9, 1], [176.5, 0.6],
  ...[177.2, 177.85, 179.5, 180.9, 181.55, 182.25, 183.3, 184.85, 185.85, 186.86, 188.5].flatMap((t) => [[t - 0.02, 0.5], [t + 0.03, 1, 'lin'], [t + 0.35, 0.55]]),
  [183.8, 0.7], [184.3, 1], [187.8, 1], [189.5, 0.6], [190.83, 0.6], [190.9, 1, 'lin'], [191.3, 0.75], [192.4, 0.1], [200, 0.1]]);

// TWO-HANDED AIM (the enemy's 8.6 m rifle): the rifle is PLACED — its grip in front of the chest, a little right of the
// centre line, the barrel on the target, its top toward the chest's up — and both arms are solved onto it by IK: the
// right fist on the grip, the left on the fore-end. (Swinging the gun arm alone left the fore-end out of the left arm's reach.)
// k = aim weight (pose → placed rifle), kL = the left hand's weight (off while the shield is up / after the cut)
// recoil: the muzzle climbs with the body's kick (fraction of the range raised at the target), then settles
const kickCurve = (x) => (x <= 0 || x > 0.9 ? 0 : (1 - Math.exp(-x * 45)) * Math.exp(-x * 5.5));
const recoilKick = (tw) => { let k = 0.42 * kickCurve(tw - TRANS_SHOT); for (const ts of SERAPH_SHOTS) if (ts !== TRANS_SHOT) k = Math.max(k, 0.08 * kickCurve(tw - ts)); return k; };
// the shield arm while it still has the shield: carried out front-left (the shield guarding its flank), the forearm up —
// unless it is blocking (VG.guard keys own it then)
const SHIELD_CARRY = { arm_L_upper: [-35, 25, 40], arm_L_lower: [-65, 0, 0], hand_L: [0, 0, 0] };
function shieldArm(s, tw) {
  const k = (1 - smooth(178.45, 178.6, tw) * (1 - smooth(179.05, 179.25, tw)));   // (the block: VG.guard)
  if (k <= 0) return;
  s.pose = { ...s.pose };
  for (const p in SHIELD_CARRY) { const a = s.pose[p] || [0, 0, 0], b = SHIELD_CARRY[p].map((x) => x * DEG); s.pose[p] = [0, 1, 2].map((c) => lerp(a[c], b[c], k)); }
}
// THE BLOCK: the shield forearm laid diagonally across its front, the shield's face (the forearm's +X) toward him —
// the wrist placed low in front of the chest, the forearm rising across it to the elbow (arm IK on the hand frame)
function guardIK(s, tw) {   // the shield raised in front of its head, its face square to him (arm IK + the shield swivel, 4 corrections)
  const k = smooth(178.45, 178.6, tw) * (1 - smooth(179.05, 179.25, tw)); if (k <= 0) return;
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  const n = nrm(flat(sub(heroRawPos(tw), s.pos), 0)), side = nrm(V.cross([0, 0, 0], [0, 1, 0], n));
  const Y = nrm(add(scl([0, 1, 0], 0.92), scl(side, -0.35))), X = nrm(sub(n, scl(Y, V.dot(n, Y)))), Z = V.cross([0, 0, 0], X, Y), Rs = [...X, ...Y, ...Z];
  let fk = duelFK(s, 'enemy_ms');
  const C = add(partPoint(fk, 'head', [0, 0.8, 0]), scl(n, 3.5));      // the shield's face centre: in front of its face
  let W = add(C, [0, -2.5, 0]);
  for (let it = 0; it < 4; it++) {
    armIK(s, fk, 'enemy_ms', 'L', W, Rs);
    fk = duelFK(s, 'enemy_ms'); s.pose.shield = euler3(r3mul(r3T(r3(fk.arm_L_lower)), Rs));
    fk = duelFK(s, 'enemy_ms'); W = add(W, sub(C, partPoint(fk, 'shield', SHIELD_C)));
  }
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
  s.pose.shield = s.pose.shield.map((v) => v * k);
}
const TWO_HAND = (tw) => (1 - smooth(178.4, 178.55, tw) * (1 - smooth(179.05, 179.25, tw))) * (1 - smooth(183.25, 183.3, tw) * (1 - smooth(183.8, 184.1, tw))) * smooth(SHIELD_HIT_T + 0.3, SHIELD_HIT_T + 0.55, tw);   // (one-handed while the shield is on its left forearm: the rifle went through it)
const HAND_TO_RIFLE = () => sub(PIV.enemy_ms.rifle, PIV.enemy_ms.hand_R);
function aim2H(s, target, k, kL, gripL = [-0.35, 3.9, 2.3]) {
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L', 'arm_R_upper', 'arm_R_lower', 'hand_R']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  let fk = duelFK(s, 'enemy_ms');
  const grip = M.transformPoint([0, 0, 0], fk.torso, gripL);
  const d = nrm(sub(target, grip)), up0 = nrm(M.transformDir([0, 0, 0], fk.torso, [0, 1, 0]));
  const U = nrm(sub(up0, scl(d, V.dot(up0, d)))), X = V.cross([0, 0, 0], U, d);
  const b = VAN_BARREL, u0 = GUN_UP.enemy_ms, u = nrm(sub(u0, scl(b, V.dot(u0, b)))), x = V.cross([0, 0, 0], u, b);
  // world rotation taking the rifle frame (x, u, b) onto (X, U, d)
  const Rw = r3mul([...X, ...U, ...d], r3T([...x, ...u, ...b]));
  const hr = HAND_TO_RIFLE();
  armIK(s, fk, 'enemy_ms', 'R', sub(grip, r3v(Rw, hr)), Rw);
  fk = duelFK(s, 'enemy_ms');
  const fore = M.transformPoint([0, 0, 0], fk.rifle, scl(VAN_MUZZLE, 0.2));
  armIK(s, fk, 'enemy_ms', 'L', sub(fore, r3v(Rw, hr)), Rw);
  for (const p in keep) { const w = p.includes('_L') || p === 'hand_L' ? k * kL : k; s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], w)); }
}
// ---------------- Sigma's aim: laid on the target round each shot. Misses go just past (it quick-boosts); 178.7 lands on
// the shield (it blocks), 183.25 on the shield (torn off), the charged shot on its chest
const HERO_AIM = (tw) => { let k = (tw >= HERO_SNAP1 ? 1 : 0) * (1 - smooth(190.9, 190.93, tw));   // (off for the Itano-circus run)   // (before HERO_SNAP1: heroDraw places it)
  for (const ts of HERO_SHOTS) k = Math.max(k, smooth(ts - 0.4, ts - 0.2, tw) * (1 - smooth(ts + 0.12, ts + 0.3, tw)));
  return Math.min(1, k); };
const MISS = [[0, 6], [6, 1], null, [-6, 4], [2, -6], [6, 3], null, [-7, 0], [5, -5], [-5, 5]];   // [side, up] (m) across the line of fire
const SHIELD_C = [1.351, -2.337, 0.17];   // the centre of the shield's outer face, in its part frame (assets/enemy_ms.glb)
function heroAimPoint(tw) {
  let bi = 0; for (let i = 0; i < HERO_SHOTS.length; i++) if (Math.abs(tw - HERO_SHOTS[i]) < Math.abs(tw - HERO_SHOTS[bi])) bi = i;
  const ts = HERO_SHOTS[bi], es = enemyRaw_(ts + 0.02), fk = es ? duelFK(es, 'enemy_ms') : null;
  if (!fk) return add(enemyRawPos(ts), [0, 10, 0]);
  if (ts === BLOCK_T || ts === SHIELD_HIT_T) return partPoint(fk, 'shield', SHIELD_C);
  if (ts === THIGH_T) return partPoint(fk, 'leg_R_upper', THIGH_P);
  const c = partPoint(fk, 'torso', [0, 2.5, 0]), d = nrm(sub(c, heroRawPos(ts))), sd = nrm([d[2], 0, -d[0]]), upv = nrm(V.cross([0, 0, 0], sd, d)), m = MISS[bi] || [0, 0];
  return add(c, add(scl(sd, m[0]), scl(upv, m[1])));
}

// ============================================================================ state assembly
const _pose = new Float64Array(NCH);
// soft joint limit: identity inside, eases smoothly (C1) into the stop over the last 8° — no kink at the limit
const SOFT = 8 * DEG;
function softLimit(x, lo, hi) {
  if (x > hi - SOFT) return hi - SOFT + SOFT * Math.tanh((x - (hi - SOFT)) / SOFT);
  if (x < lo + SOFT) return lo + SOFT - SOFT * Math.tanh((lo + SOFT - x) / SOFT);
  return x;
}
function poseObj(arr, limits = true) {   // hero: joint limits (ATLAS convention); VANGUARD's A-pose rig: none
  const o = {};
  for (const p of PARTS) {
    if (p === '_body') continue;
    const i = PIDX[p], Lm = limits ? JOINT_LIMITS[p] : null;
    o[p] = Lm ? [softLimit(arr[i], Lm[0][0], Lm[0][1]), softLimit(arr[i + 1], Lm[1][0], Lm[1][1]), softLimit(arr[i + 2], Lm[2][0], Lm[2][1])] : [arr[i], arr[i + 1], arr[i + 2]];
  }
  return o;
}
const flat = (d, k = 0.35) => nrm([d[0], d[1] * k, d[2]]);
// rough heading: toward where the other machine is AROUND now (its offset averaged over ±0.5 s) — in the standoff the
// two size each other up and turn cleanly instead of servoing onto every little hover wobble of the other
const _RW = [[-0.5, 1], [-0.25, 2], [0, 3], [0.25, 2], [0.5, 1]];
function roughDir(from, to, tw) { let d = [0, 0, 0]; for (const [o, w] of _RW) d = add(d, scl(sub(to(tw + o), from(tw + o)), w)); return flat(d); }
const ROUGH = () => 0;          // (no standoff: they face each other straight away)
function yawRot(f, a) { const c = Math.cos(a), s = Math.sin(a); return [f[0] * c + f[2] * s, f[1], -f[0] * s + f[2] * c]; }
let STATE_CACHE = false;
function velOf(fn, t) { const h = 1 / 48; const a = fn(t - h), b = fn(t + h); return scl(sub(b, a), 1 / (2 * h)); }
function base(vis) { return { vis, pos: [0, 0, 0], fwd: [0, 0, 1], roll: 0, pitch: 0, pose: {}, saber: 0, saberLen: 12.9, thr: 0.4, damage: 0, eye: 1, vel: [0, 0, 0], speed: 0, smear: 0, boost: 0 }; }
// inertia: lean into accelerations that last (pitch forward when thrusting, rock back when braking, bank into lateral pulls)
function inertiaLean(s, fwdBase) {
  if (!s._pf) return [0, 0];
  const t = s._t, vh = 0.1, vel = (x) => scl(sub(s._pf(x + vh), s._pf(x - vh)), 1 / (2 * vh));
  let acc = [0, 0, 0], wsum = 0;
  for (const [o, w] of [[-0.2, 1], [-0.1, 2], [0, 3], [0.1, 2], [0.2, 1]]) { acc = add(acc, scl(sub(vel(t + o + 0.18), vel(t + o - 0.18)), w / 0.36)); wsum += w; }
  acc = scl(acc, 1 / wsum);
  const f = nrm([fwdBase[0], 0, fwdBase[2]]), r = [f[2], 0, -f[0]];
  const k = 1 - (s._idle || 0);
  return [clamp((acc[0] * f[0] + acc[2] * f[2]) * 0.0016, -0.22, 0.22) * k, clamp(-(acc[0] * r[0] + acc[2] * r[2]) * 0.0013, -0.2, 0.2) * k];
}
// AMBAC — the whole machine answers its thrusters (Gundam UC mobile suits swing their limbs to steer and balance):
// the body pitches / banks INTO an acceleration (a thruster burst tips it), the legs trail BEHIND the motion (thighs
// swing back when it drives forward, sideways away from a lateral boost, knees fold with speed), the free arm is flung
// against the acceleration. Velocity from the position track (±0.06 s), acceleration over ±0.08 s, soft-saturated.
const sat1 = (x, s0) => Math.tanh(x / s0);
function ambac(s, arr, fwdBase) {
  if (!s._pf) return [0, 0];
  const t = s._t, vh = 0.06, vel = (x) => scl(sub(s._pf(x + vh), s._pf(x - vh)), 1 / (2 * vh));
  const v = vel(t);
  let a = [0, 0, 0];
  for (const [o, w] of [[-0.08, 1], [0, 2], [0.08, 1]]) a = add(a, scl(sub(vel(t + o + 0.08), vel(t + o - 0.08)), w / 0.16 / 4));
  const f = nrm([fwdBase[0], 0, fwdBase[2]]), l = [f[2], 0, -f[0]];               // forward, own left (horizontal)
  const vf = V.dot(v, f), vl = V.dot(v, l), af = V.dot(a, f), al = V.dot(a, l), au = a[1];
  const k = 1 - (s._idle || 0);
  if (k <= 0) return [0, 0];
  const sf = sat1(vf, 45), sl = sat1(vl, 45), sa = sat1(af, 160), sal = sat1(al, 160), sau = sat1(au, 160), spd = sat1(Math.hypot(vf, vl, v[1]), 60);
  // legs trail the motion
  arr[PIDX.leg_L_upper] += (0.55 * sf + 0.25 * sau) * k; arr[PIDX.leg_R_upper] += (0.45 * sf + 0.25 * sau) * k;
  arr[PIDX.leg_L_upper + 2] -= 0.45 * sl * k; arr[PIDX.leg_R_upper + 2] -= 0.45 * sl * k;
  arr[PIDX.leg_L_lower] += 0.35 * spd * k; arr[PIDX.leg_R_lower] += 0.45 * spd * k;
  arr[PIDX.foot_L] += 0.3 * spd * k; arr[PIDX.foot_R] += 0.3 * spd * k;
  // the free (left) arm flung against the acceleration, the chest twisting a little with it
  arr[PIDX.arm_L_upper] += 0.5 * sa * k; arr[PIDX.arm_L_upper + 2] -= 0.55 * sal * k;
  arr[PIDX.torso + 1] += 0.18 * sal * k; arr[PIDX.head + 1] -= 0.12 * sal * k;   // (the head holds the target)
  // the body tips into the burst: pitch with forward accel, bank (own side down) into a lateral one
  return [(0.2 * sa - 0.1 * sau) * k, -0.28 * sal * k];   // (halved: the whole machine tipping hard swung the boosters about)
}
function finish(s, arr, fwdBase, limits = true) {
  const b = PIDX._body;
  const [lp, lr] = ambac(s, arr, fwdBase);
  s.pitch = arr[b] + lp; s.roll = arr[b + 2] + lr;
  s.fwd = yawRot(fwdBase, arr[b + 1]);
  s.pose = poseObj(arr, limits);
  s.speed = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
  s.smear = sat((s.speed - 35) / 110);
  return s;
}

// CIRCLING in the standoff (170.8–176.6): the two machines drift sideways round each other, opposite ways, sizing each
// other up — then settle back on their marks just before the first shot
const CIRC_AX = (() => { const a = [-4 - 60, 0, -26 - 28]; const l = Math.hypot(a[0], a[2]); return [a[2] / l, 0, -a[0] / l]; })();
const circ = () => 0;   // (no standoff circling)
// STRAFING at range (the gunfight): both slide sideways across the line of fire, opposite ways, while they trade shots
const strafe = (tw, sgn) => { const k = smooth(176.4, 177.2, tw) * (1 - smooth(189.0, 189.8, tw)); return k > 0 ? scl(L1, sgn * 25 * k * Math.sin((tw - 176.4) * 1.15)) : [0, 0, 0]; };
function heroPos0(tw) {
  if (tw < 170) return add(gundamLaunchPath(tw), dodgeOffset(tw));   // (the launch run: he jinks out of the ion bolt)
  const c = circ(tw);
  return add(add(add(springPos(heroPos, tw), scl(hover(tw, 1.3, 0.35), 0)), [CIRC_AX[0] * -6 * c, 1.2 * c, CIRC_AX[2] * -6 * c]), strafe(tw, 1));
}
const heroRawPos = (tw) => (tw > CIRCUS_C0 - 0.1 && tw < CIRCUS_C1 + 0.1 ? add(heroPos0(tw), circusOffset(tw)) : heroPos0(tw));   // (+ the Itano-circus run)
function enemyRawPos(tw) {
  if (tw < SERAPH_HANDOFF) { const c = circ(tw); return add(add(add(e1Pos(tw), hover(tw, 7.1, 0)), [CIRC_AX[0] * 6 * c, -0.8 * c, CIRC_AX[2] * 6 * c]), add(transShove(tw), strafe(tw, -1))); }
  return add(add(e2Pos(tw), transShove(tw)), strafe(tw, -1));
}
// the charged shot's recoil shoves the whole machine back along its line of fire (~8 m, recovering)
const transShove = (tw) => { const x = tw - TRANS_SHOT; if (x <= 0 || x > 1.5) return [0, 0, 0]; const k = 8 * (1 - Math.exp(-x * 30)) * Math.exp(-x * 2.2);
  const f = flat(sub(heroRawPos(TRANS_SHOT), e2Pos(TRANS_SHOT)), 0); return [-f[0] * k, 0.15 * k, -f[2] * k]; };
const heroSquash = squashFrom(heroPos), e1Squash = squashFrom(e1Pos), e2Squash = squashFrom(e2Pos);

// aftermath formula of the old gundamState (194–226) for a seamless hand-over at 200
function oldAftermath(t) {
  const s = { pos: C(6 + Math.sin(t * 0.5) * 1.5, -4 + Math.sin(t * 0.7) * 1.2, -34), fwd: [Math.sin((t - 194) * 0.05) * 0.3, 0, -1], pose: {} };
  blendPose('saberSlash', 'stand', sat((t - 194) / 2.5), s.pose);
  breathe(s.pose, t, 1);
  return s;
}
const _c_duelHero = new Map();
// the launch run's evasive manoeuvre: an enemy ion bolt aimed at where Sigma WOULD be at DODGE.t; he rolls and jinks
// sideways ~10 m (lead-in 0.5 s, back on the line by +1.1 s), the bolt tears through the empty space
export const DODGE = { t: 166.65, side: 1 };
// RONIN #1's wrist-gun bursts (shots.js: fired at 172 + k·0.26, 0.35 s flight): Sigma swats EVERY bolt aside with the
// right vambrace — the forearm stays up in a guard and flicks out to meet each impact, alternating sides
export const E1_BOLTS = Array.from({ length: 24 }, (_, k) => 172 + k * 0.26 + 0.35);
function volleyParry(tw, out) {
  return;                                                   // (no gunfire any more → no parries)
  if (tw < 171.7 || tw > 178.0) return;
  const guard = smooth(171.7, 172.2, tw) * (1 - smooth(177.35, 177.8, tw));
  if (guard <= 0) return;
  let flick = 0, twist = 0;
  E1_BOLTS.forEach((ti, k) => {
    // a real SWAT: the forearm whips across (0.12 s before → 0.12 s after the bolt), meeting it mid-swing, then eases back
    const x = (tw - ti) / 0.12;
    const sd = k % 2 ? 1 : -1;
    const sw = x < -1.5 || x > 2.5 ? 0 : Math.tanh(x * 1.6) * Math.exp(-Math.max(0, x) * 0.9) * (x < -1 ? (x + 1.5) * 2 : 1);
    flick += sw * sd; twist += sw * sd * 0.6;
  });
  out[PIDX.arm_R_upper] += (-1.2) * guard;
  out[PIDX.arm_R_upper + 1] += (0.45 + 1.25 * flick) * guard;          // big, full-arm swats
  out[PIDX.arm_R_upper + 2] += (0.1 - 0.55 * flick) * guard;
  out[PIDX.arm_R_lower + 1] += 0.3 * flick * guard;
  out[PIDX.arm_R_lower] += -1.3 * guard;
  out[PIDX.hand_R] += -0.25 * guard;
  out[PIDX.torso + 1] += (-0.12 + 0.3 * twist) * guard;               // the shoulders turn into each swat
}
export function dodgeRight(tw) { const d = nrm(sub(gundamLaunchPath(tw + 0.05), gundamLaunchPath(tw))); return nrm([d[2], 0, -d[0]]); }
// forearm comes up across the chest (0.3 s before), takes the bolt on the armour at DODGE.t and sweeps it outward;
// the body gives a little to the hit and the arm settles back with weight
// the backhand SWAT (FK-solved): the right fist rests folded over the LEFT chest (forearm across it, elbow forward),
// then the arm whips open up and out to his upper right, straight — the back of the hand/vambrace knocking the bolt away
const SWAT_A = { arm_R_upper: [-3, 101, -47], arm_R_lower: [-76, 0, 0], hand_R: [-34, 0, 0] };
const SWAT_B = { arm_R_upper: [-144, -7, -28], arm_R_lower: [-1, 0, 0], hand_R: [17, 0, 0] };   // flung out to the upper RIGHT (~45° up), straight
function parryPose(tw, out) {
  const T = DODGE.t;
  const up = smooth(T - 0.45, T - 0.14, tw), sweep = smooth(T - 0.07, T + 0.12, tw), back = smooth(T + 0.5, T + 1.15, tw);
  const k = up * (1 - back), lt = tw - T;
  if (k <= 0) return;
  const kick = lt > 0 && lt < 0.8 ? Math.exp(-lt * 6) * Math.sin(lt * 18) : 0;                  // impact shudder
  for (const part in SWAT_A) for (let c = 0; c < 3; c++) {
    const i = PIDX[part] + c;
    out[i] = lerp(out[i], lerp(SWAT_A[part][c], SWAT_B[part][c], sweep) * DEG, k);
  }
  out[PIDX.arm_R_upper] -= 0.1 * kick;
  out[PIDX.torso + 1] += (-0.3 + 0.7 * sweep) * k;                                               // chest winds left, turns through right
  out[PIDX.pelvis + 1] += (-0.1 + 0.22 * sweep) * k;
  out[PIDX.torso] += 0.06 * kick; out[PIDX.head + 1] += (-0.15 + 0.1 * sweep) * k;
  out[PIDX._body + 2] += 0.05 * kick;
}
function dodgeOffset(tw) {
  return [0, 0, 0];                                         // (no dodge on the launch run any more)
  const u = (tw - (DODGE.t - 0.5)) / 1.6;
  if (u <= 0 || u >= 1) return [0, 0, 0];
  const k = 13 * DODGE.side * Math.sin(Math.PI * u) ** 2 * (1 - 0.35 * u);
  const r = dodgeRight(tw);
  return [r[0] * k, 2.5 * Math.sin(Math.PI * u) ** 2, r[2] * k];
}
export function duelHero(t) {
  if (!STATE_CACHE) return duelHero_(t);
  let r = _c_duelHero.get(t);
  if (r === undefined) { r = duelHero_(t); if (_c_duelHero.size > 64) _c_duelHero.clear(); _c_duelHero.set(t, r); }
  return r;
}
function duelHero_(t) {
  if (t < DUEL_T0 || t >= DUEL_T1) return null;
  const s = base(true);
  const tw = warp(t);
  s.pos = add(heroRawPos(tw), transDodge(tw));                      // (the charged shot: he slips it hard, afterimages behind)
  s.vel = velOf((x) => heroRawPos(warp(x)), t); s._pf = (x) => heroRawPos(warp(x)); s._t = t;
  springPose(heroPose, tw, _pose); heroImp(tw, _pose);
  // IDLE (170–175.8, scenes 32–36): the body is held still — no squash / weight-shift / jitter / inertia lean; only a
  // slow float and breathing
  const idleK = 0;   // (no standoff)
  if (tw >= 170) {
    const pre = idleK > 0 ? Float64Array.from(_pose) : null;
    heroSquash(tw, _pose); weightShift(heroPose, tw, _pose, 'arm_R_upper');
    if (pre) for (let i = 0; i < _pose.length; i++) _pose[i] = lerp(_pose[i], pre[i], idleK);
  }
  micro(t, _pose, 1.3, (1 - idleK) * (tw < 177 ? lerp(1, 0.35, ROUGH(tw)) : 1));
  if (idleK > 0) {
    _pose[PIDX.torso] += Math.sin(t * 1.05) * 0.03 * idleK; _pose[PIDX.head] += Math.sin(t * 1.05 - 0.6) * 0.02 * idleK;   // slow, heavy breaths
    _pose[PIDX.arm_R_upper] += Math.sin(t * 1.05 - 1.2) * 0.02 * idleK;                                                   // the hanging rifle lags them
  }
  s._idle = idleK;
  s.anchor = s.pos.slice();                                   // (the idle camera follows this, so the float shows on screen)
  if (idleK > 0) s.pos = add(s.pos, [Math.sin(t * 0.6) * 0.06 * idleK, Math.sin(t * 0.75 + 0.4) * 0.22 * idleK, Math.sin(t * 0.5 + 1) * 0.06 * idleK]);
  // facing
  let f;
  if (tw < 170.3) {
    const p2 = gundamLaunchPath(tw + 0.05), p1 = gundamLaunchPath(tw);
    const path = nrm(sub(p2, p1));
    const toE = flat(sub(enemyRawPos(tw), s.pos));
    f = nrm(lrp(path, toE, smooth(169.3, 170.3, tw)));
    _pose[PIDX._body + 2] += Math.sin(tw * 0.8) * 0.1 * (1 - smooth(169, 170, tw));
  } else {
    f = flat(sub(enemyRawPos(tw), s.pos), 0.6);               // always squared up to it (strafing sideways round the ring)
    if (ROUGH(tw) > 0) f = nrm(lrp(f, roughDir(heroRawPos, enemyRawPos, tw), ROUGH(tw)));
  }
  // the dash: he faces where he is going (the cut sweeps sideways out of the left hand as he passes)
  const dk = smooth(191.1, SANDE0, tw) * (1 - smooth(192.35, 192.9, tw));
  if (dk > 0) f = nrm(lrp(f, D_U, dk));
  const cc = circusClock(tw), ck = cc > 0 && cc < CIRCUS_END ? chaseK(cc) : 0;
  if (ck > 0) {                                                      // the run: nose along his flight, banking hard into each turn
    const va = sub(circusOffset(circusStory(cc + 0.04)), circusOffset(circusStory(cc - 0.04))), vb = sub(circusOffset(circusStory(cc + 0.12)), circusOffset(circusStory(cc + 0.04)));
    const fv = nrm(add(va, scl(f, 1e-3))); f = nrm(lrp(f, nrm([fv[0], 0, fv[2]]), ck));
    const turn = V.cross([0, 0, 0], nrm(va), nrm(vb))[1];
    _pose[PIDX._body + 2] += ck * clamp(turn * 18, -1.1, 1.1) + ck * 2 * Math.PI * smooth(3.9, 4.6, cc);   // (+ one full barrel roll mid-run)
    _pose[PIDX._body] += ck * clamp(-fv[1] * 1.2, -0.7, 0.7);
  }
  _pose[PIDX._body + 2] += heroRoll(tw);
  s.eye = 1 + 2.2 * Math.exp(-Math.abs(tw - HERO_FLARE - 0.03) * 40) * (tw > HERO_FLARE - 0.03 ? 1 : 0);   // the eye flares once he is on it
  s.weapon = tw < HERO_GRAB ? 'back' : tw > THROW0 && tw < CATCH_T ? 'thrown' : tw < 191.22 || tw >= 200 ? 'rifle' : tw < 194.1 ? 'saber' : 'none';   // slung over the shoulder at 191.2
  s.saber = Math.max(smooth(191.26, 191.36, tw) * (1 - smooth(193.85, 194.1, tw)), transSaber(tw));
  s.saberL = transSaber(tw) > 0;                                     // (the blade lit in his left hand)
  s.hiltL = hiltInHand(tw);                                          // the hilt in his left hand (else it hangs on his hip)
  s.saberPow = s.saberL ? 2 : 1;                                     // full output against the charged shot: twice as thick
  s.sande = Math.max(sat((tw - SANDE0 + 0.05) / 0.1) * (1 - smooth(CUT_T - 0.05, CUT_T - 0.025, tw)), transGhost(tw));
  s.ghostFrom = tw < SANDE0 - 0.1 ? TRANS_PASS - 0.1 : SANDE0 - 0.02;   // afterimages (shots.js); gone for the close-up of the cut
  s.boost = Math.max(heroBoost(tw), ck);
  s.thr = clamp(0.3 + s.boost * 0.7, 0, 1);
  finish(s, _pose, f);
  { if (tw >= HERO_GRAB - 0.16 && tw < HERO_SNAP1) heroDraw(s, tw); else { const ak = HERO_AIM(tw); if (ak > 0) heroAim2H(s, heroAimPoint(tw), ak); } throwFling(s, tw); heroLeft(s, tw); transTwist(s, tw); saberDrawIK(s, tw); transCutIK(s, tw); saberRightGrip(s, tw); }   // the rifle laid on its target, held upright
  slashIK(s, tw);                                                   // the pass-cut: the blade swept exactly through its waist
  hitReact('hero', tw, s, 'gundam');
  // hand-over to the old aftermath formula (identical at t = 200)
  if (t > 194.0) {
    const o = oldAftermath(t);
    const k = easeInOut(sat((t - 194.6) / 2.4));
    s.pos = lrp(s.pos, o.pos, easeInOut(sat((t - 194.0) / 3.0)));
    s.fwd = nrm(lrp(nrm(s.fwd), o.fwd, k));
    s.pitch *= 1 - k; s.roll *= 1 - k;
    for (const p in o.pose) { const a = s.pose[p] || [0, 0, 0], b = o.pose[p]; s.pose[p] = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
    for (const p in s.pose) if (!o.pose[p]) s.pose[p] = s.pose[p].map((v) => v * (1 - k));
    s.thr = lerp(s.thr, 0.3, k);
  }
  return s;
}

// ---------------- VANGUARD state (one machine; duelEnemy1 draws it until the 180.9 cut, duelEnemy2 after)
const _c_en = new Map();
function enemyRaw_(t) {
  if (!STATE_CACHE) return enemyState_(t);
  let r = _c_en.get(t);
  if (r === undefined) { r = enemyState_(t); if (_c_en.size > 96) _c_en.clear(); _c_en.set(t, r); }
  return r;
}
export function duelEnemy1(t) { if (t < DUEL_T0 || t >= DUEL_T1) return null; const s = enemyRaw_(t); return t < SERAPH_HANDOFF && t > 160 ? s : { ...s, vis: false }; }
export function duelEnemy2(t) { if (t < DUEL_T0 || t >= DUEL_T1) return null; const s = enemyRaw_(t); return t >= SERAPH_HANDOFF && t < 199.9 ? s : { ...s, vis: false }; }   // (its halves / their chunks until the duel ends)
const _epose = new Float64Array(NCH);
let _cutPose = null;
const cutPose = () => _cutPose || (_cutPose = JSON.parse(JSON.stringify(enemyState_(CUT_T - 1e-4).pose)));
function enemyState_(t) {
  const s = base(true);
  const tw = warp(t);
  if (tw < 170) {   // before the duel: an erratic pattern out in the fleet, continuous into the keyed track at 170
    const old = (x) => G(-60 + 50 * Math.sin(1.3 * x), 20 + 30 * Math.sin(0.9 * x), -120 + 30 * Math.cos(1.1 * x));
    const k = smooth(166, 170, tw);
    s.pos = lrp(old(tw), e1Pos(170), k);
    s.vel = velOf((x) => lrp(old(x), e1Pos(170), smooth(166, 170, x)), t);
    s.fwd = flat(sub(gundamLaunchPath(tw), s.pos));
    s.pose = poseObj(micro(t, Float64Array.from(VG.fly), 7.1), false);
    s.speed = Math.hypot(...s.vel); s.smear = sat((s.speed - 35) / 110);
    s.muzzleOff = true;
    return s;
  }
  s.pos = enemyRawPos(tw);
  s.vel = velOf((x) => enemyRawPos(warp(x)), t); s._pf = (x) => enemyRawPos(warp(x)); s._t = t;
  enemyPose(tw, _epose); enemyImp(tw, _epose);
  const idleK = 0;   // (no standoff)
  { const pre = idleK > 0 ? Float64Array.from(_epose) : null;
    (tw < SERAPH_HANDOFF ? e1Squash : e2Squash)(tw, _epose);
    if (pre) for (let i = 0; i < _epose.length; i++) _epose[i] = lerp(_epose[i], pre[i], idleK); }
  micro(t, _epose, 7.1, (1 - idleK) * (tw > CUT_T ? 0.3 : 1));
  if (idleK > 0) {   // zero-g float: every joint drifts on its own slow phase, the limbs lagging the body
    const F = [['torso', 0, 0.02, 1.3, 0], ['torso', 2, 0.012, 0.9, 1.1], ['head', 0, 0.03, 1.3, -0.7], ['head', 1, 0.025, 0.7, 2],
      ['arm_R_upper', 0, 0.02, 1.3, -0.5], ['arm_R_lower', 0, 0.018, 1.3, -1.0], ['arm_L_upper', 0, 0.02, 1.2, 0.4],
      ['leg_L_upper', 0, 0.04, 1.1, 0.3], ['leg_L_lower', 0, 0.05, 1.1, -0.4], ['leg_R_upper', 0, 0.05, 0.95, 1.9], ['leg_R_lower', 0, 0.06, 0.95, 1.2]];
    for (const [p, c, a, w, ph] of F) _epose[PIDX[p] + c] += Math.sin(t * w + ph) * a * idleK;
  }
  s._idle = idleK;
  s.anchor = s.pos.slice();
  if (idleK > 0) s.pos = add(s.pos, [Math.sin(t * 0.8 + 2) * 0.12 * idleK, Math.sin(t * 1.1 + 1.3) * 0.4 * idleK, Math.sin(t * 0.6) * 0.12 * idleK]);
  const flip = flipLayer(tw, _epose);
  _epose[PIDX._body] += flip;
  _epose[PIDX._body + 2] += enemyRoll(tw);
  let f = flat(sub(heroRawPos(Math.min(tw, 191.6)), s.pos), 0.6);   // squared up to him (it can't follow the Sandevistan) …
  if (ROUGH(tw) > 0) f = nrm(lrp(f, roughDir(enemyRawPos, heroRawPos, tw), ROUGH(tw)));
  f = yawRot(f, shieldSpin(tw));                                   // … knocked half round by the shield hit
  s.cutK = tw > CUT_SPLIT ? tw - CUT_SPLIT : 0;                      // cut in half (shots.js draws the two halves)
  s.shieldLost = tw >= SHIELD_HIT_T + 0.03;
  s.noRifle = tw > 168 && tw < ENEMY_GRAB;                         // (on its hip until it draws it)
  s.boost = enemyBoost(tw);
  s.thr = tw > CUT_T ? 0 : clamp(0.4 + s.boost * 0.6, 0, 1);
  s.damage = 0.12 * smooth(SHIELD_HIT_T, SHIELD_HIT_T + 0.1, t) + 0.3 * smooth(CUT_T, CUT_T + 1, t);
  s.eye = tw > CUT_T + 0.1 ? Math.max(0, 1 - (tw - CUT_T - 0.1) / 1.2) * (Math.sin(t * 50) > -0.2 ? 1 : 0.2) : 1;
  finish(s, _epose, f, false);
  const ak = ENEMY_AIM(tw);
  if (tw < SHIELD_HIT_T + 0.03) { shieldArm(s, tw); guardIK(s, tw); }   // the shield arm carried out front-left, clear of the rifle; the block: across its front
  if (ak > 0 && !(tw > CUT_T)) {   // the rifle levelled on where he is going, in both hands — the muzzle kicks up with the body on each shot
    const tg = enemyAim(tw), kick = recoilKick(tw);
    const wHip = styleW(tw, SERAPH_SHOTS, ENEMY_STYLE, 'hip'), wSnap = styleW(tw, SERAPH_SHOTS, ENEMY_STYLE, 'snap'), kL = TWO_HAND(tw) * (1 - Math.max(wHip, wSnap));
    aim2H(s, tg, ak, kL, lrp([-0.35, 3.9, 2.3], [-1.6, 1.2, 2.2], wHip));
    if (wSnap > 0) aimEnemy(s, tg, wSnap * ak);                          // the snap shot: its arm thrown out
    holdWrist(s, tw, [TRANS0], _wristT, (x) => enemyRaw_(x), TRANS_SHOT - TRANS0);   // the transformation: arm + rifle held as one
    holdWrist(s, tw, [...SERAPH_SHOTS, ...ENEMY_BURST], _wristE, (x) => enemyRaw_(x));
    if (kick > 0) {                                                        // the recoil: the arm (wrist + rifle as one) thrown up
      kickArm(s, 'enemy_ms', Math.atan(kick) * ak);
      if (kL > 0) { const fk = duelFK(s, 'enemy_ms'), Rw = r3(fk.hand_R), fore = M.transformPoint([0, 0, 0], fk.rifle, scl(VAN_MUZZLE, 0.2));
        const o = { arm_L_upper: s.pose.arm_L_upper.slice(), arm_L_lower: s.pose.arm_L_lower.slice(), hand_L: (s.pose.hand_L || [0, 0, 0]).slice() };
        armIK(s, fk, 'enemy_ms', 'L', sub(fore, r3v(Rw, HAND_TO_RIFLE())), Rw);   // the left hand stays on the fore-end
        for (const p in o) s.pose[p] = [0, 1, 2].map((c) => lerp(o[p][c], s.pose[p][c], kL)); }
    }
  }
  if (tw > CUT_T) {   // cut: the machine keeps the pose it was cut in (both halves), sagging only slowly toward limp — the aim
    const P0 = cutPose(), k = 0.6 * smooth(0, 2.2, tw - CUT_T);                    // IK switching off made the arms jump
    for (const p in P0) { const a = P0[p], b = s.pose[p] || a; s.pose[p] = [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  }
  return hitReact(tw < SERAPH_HANDOFF ? 'e1' : 'e2', tw, s, 'enemy_ms');
}
// ============================================================================ forward kinematics (same math as renderer + msMatrix)
// pivots in model space (glTF, +Z forward, +X = model's left) from assets/*.glb
const PIV = {
  gundam: {
    ms_root: [0, 9.1, 0], pelvis: [0, 9.1, 0], torso: [0, 10.4, 0], head: [0, 15.7, 0.15],
    arm_L_upper: [4.6, 14.2, 0], arm_L_lower: [5.35, 12.0, 0.05], hand_L: [6.0, 8.25, 0.3],
    arm_R_upper: [-4.6, 14.2, 0], arm_R_lower: [-5.35, 12.0, 0.05], hand_R: [-6.0, 8.25, 0.3],
    leg_L_upper: [2.2, 9.35, 0], leg_L_lower: [3.0, 6.65, 0.2], foot_L: [3.65, 1.7, 0],
    leg_R_upper: [-2.2, 9.35, 0], leg_R_lower: [-3.0, 6.65, 0.2], foot_R: [-3.65, 1.7, 0],
  },
  enemy_ms: {   // TryoutIndie '3D Mech Asset' (MIT; assets/enemy_ms.glb via blender/convert_tryout.py; VANGUARD in assets/v15_backup)
    ms_root: [0, 9.651, 0], pelvis: [0, 9.651, 0], torso: [0, 10.462, 0], head: [0, 15.454, 0],
    arm_L_upper: [3.371, 15.776, 0], arm_L_lower: [3.371, 12.331, -0.175], hand_L: [3.371, 9.388, 0.241],
    arm_R_upper: [-3.371, 15.776, 0], arm_R_lower: [-3.371, 12.331, -0.175], hand_R: [-3.371, 9.388, 0.241],
    leg_L_upper: [1.897, 10.462, 0], leg_L_lower: [1.897, 6.198, 0.132], foot_L: [1.897, 0.284, 0],
    leg_R_upper: [-1.897, 10.462, 0], leg_R_lower: [-1.897, 6.198, 0.132], foot_R: [-1.897, 0.284, 0],
    rifle: [-3.344, 8.550, 0.232],
  },
};
const PARENT = { ms_root: null, pelvis: 'ms_root', torso: 'ms_root', head: 'torso', arm_L_upper: 'torso', arm_L_lower: 'arm_L_upper', hand_L: 'arm_L_lower',
  arm_R_upper: 'torso', arm_R_lower: 'arm_R_upper', hand_R: 'arm_R_lower', leg_L_upper: 'pelvis', leg_L_lower: 'leg_L_upper', foot_L: 'leg_L_lower',
  leg_R_upper: 'pelvis', leg_R_lower: 'leg_R_upper', foot_R: 'leg_R_lower' };
const FK_ORDER = Object.keys(PARENT);
// assets/gundam.glb node translations (glTF): rifle ← hand_R, rifle_muzzle ← rifle; barrel = rifle local +Z.
// (re-check with: python3 -c "…" in blender/DUEL_NOTES.md if the rifle is re-modelled; sanity check compares them)
export const RIFLE_T = [-0.10266, -0.84395, 0.50666];   // (raised 2026-09-29: the grip in the fist, not the receiver under it)
export const MUZZLE_T = [0, 1.96, 21.48];   // the rifle's muzzle (blender/build_hero_rifle.py: the long thin Beretta-style barrel)
export const HERO_RIFLE_S = [1, 1, 1];     // its scale on the hand (blender/build_hero_rifle.py builds it at size: ~25 m, twice the old one)
export const RIFLE_Q = [-0.130526, 0, 0, 0.991445];   // the rifle node's rotation on hand_R (assets/gundam.glb): the grip raked 15° like a pistol grip
// VANGUARD's rifle (assets/enemy_ms.glb): rifle_muzzle in the rifle part's frame; the barrel runs from the grip pivot to it
export const VAN_MUZZLE = [0.4134, -8.6024, 0.7292];            // the enemy rifle (rifle part frame)
const VAN_BARREL = nrm([0.1296, -0.9892, 0.0678]);
export function msMatrixOf(s, out = M.new()) {
  const f = nrm(s.fwd);
  const yaw = Math.atan2(f[0], f[2]);
  const pitch = -Math.asin(clamp(f[1], -1, 1)) + (s.pitch || 0);
  const q = Q.fromEuler([0, 0, 0, 1], pitch, yaw, s.roll || 0);
  M.fromTRS(out, [0, 0, 0], q, 1);
  const hip = M.transformDir([0, 0, 0], out, [0, 9, 0]);
  out[12] = s.pos[0] - hip[0]; out[13] = s.pos[1] - hip[1]; out[14] = s.pos[2] - hip[2];
  return out;
}
// Sigma's blade line (hand_L grip point, along hand +Z) — the beam saber of the well assault (shots.js ramBase)
export const MACE_LEN = 12.9;
export const SERAPH_GUN = null;   // (SERAPH's arm cannon is gone: VANGUARD holds a rifle part)
/** world matrices of every part + saber segment. model: 'gundam' | 'enemy_ms' */
export function duelFK(s, model) {
  const piv = PIV[model];
  const W0 = msMatrixOf(s);
  const out = { root: W0 };
  const q = [0, 0, 0, 1], T = M.new(), Rm = M.new();
  for (const p of FK_ORDER) {
    const par = PARENT[p];
    const pw = par ? out[par] : W0;
    const pp = par ? piv[par] : [0, 0, 0];
    const r = s.pose[p] || [0, 0, 0];
    Q.fromEuler(q, r[0], r[1], r[2]);
    M.fromTRS(Rm, [piv[p][0] - pp[0], piv[p][1] - pp[1], piv[p][2] - pp[2]], q, 1);
    out[p] = M.mul(M.new(), pw, Rm);
  }
  if (model === 'gundam') {   // rifle (mesh node on hand_R) + rifle_muzzle empty, offsets from assets/gundam.glb
    out.rifle = M.mul(M.new(), out.hand_R, M.fromTRS(M.new(), RIFLE_T, RIFLE_Q, 1));
    out.muzzle = M.transformPoint([0, 0, 0], out.rifle, MUZZLE_T);
    out.muzzleDir = nrm(M.transformDir([0, 0, 0], out.rifle, [0, 0, 1]));
  }
  if (model === 'enemy_ms') {   // VANGUARD: its rifle is a posed part on hand_R; muzzle + barrel direction from the rifle frame
    const r = s.pose.rifle || [0, 0, 0], pr = piv.rifle, ph = piv.hand_R;
    Q.fromEuler(q, r[0], r[1], r[2]);
    out.rifle = M.mul(M.new(), out.hand_R, M.fromTRS(M.new(), [pr[0] - ph[0], pr[1] - ph[1], pr[2] - ph[2]], q, 1));
    out.muzzle = M.transformPoint([0, 0, 0], out.rifle, VAN_MUZZLE);
    out.muzzleDir = nrm(M.transformDir([0, 0, 0], out.rifle, VAN_BARREL));
    const sr = s.pose && s.pose.shield;                             // the shield part rides the forearm (pivot at the elbow), swivelling on its mount
    if (sr) { Q.fromEuler(q, sr[0], sr[1], sr[2]); out.shield = M.mul(M.new(), out.arm_L_lower, M.fromTRS(M.new(), [0, 0, 0], q, 1)); } else out.shield = out.arm_L_lower;
    return out;
  }
  const a = M.transformPoint([0, 0, 0], out.hand_L, [0, -1.2, 0.6]);   // the hilt; the blade runs along hand +Z
  const dir = nrm(M.transformDir([0, 0, 0], out.hand_L, [0, 0, 1]));
  out.saber = [a, add(a, scl(dir, MACE_LEN * (s.saber > 0 ? s.saber : 1))), dir];
  return out;
}
export const partPoint = (fk, part, local = [0, 0, 0]) => M.transformPoint([0, 0, 0], fk[part], local);
// closest points between segments p1-q1 and p2-q2
export function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = V.dot(d1, d1), e = V.dot(d2, d2), f = V.dot(d2, r);
  let s, t;
  const c = V.dot(d1, r), b = V.dot(d1, d2), den = a * e - b * b;
  s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  const c1 = add(p1, scl(d1, s)), c2 = add(p2, scl(d2, t));
  return { d: V.dist(c1, c2), c1, c2, mid: lrp(c1, c2, 0.5), s, t };
}
function segPoint(p, q, x) { const d = sub(q, p); const u = clamp(V.dot(sub(x, p), d) / V.dot(d, d), 0, 1); const c = add(p, scl(d, u)); return { d: V.dist(c, x), c, u }; }

// ---------------------------------------------------------------- analytic helpers (3×3 column-major; FK Euler R = Ry·Rx·Rz)
const r3 = (m) => [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
const r3mul = (a, b) => { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; return o; };
const r3T = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
const r3v = (a, v) => [a[0] * v[0] + a[3] * v[1] + a[6] * v[2], a[1] * v[0] + a[4] * v[1] + a[7] * v[2], a[2] * v[0] + a[5] * v[1] + a[8] * v[2]];
function r3axis(ax, ang) {   // rotation about unit axis
  const [x, y, z] = ax, c = Math.cos(ang), s = Math.sin(ang), k = 1 - c;
  return [c + x * x * k, y * x * k + z * s, z * x * k - y * s, x * y * k - z * s, c + y * y * k, z * y * k + x * s, x * z * k + y * s, y * z * k - x * s, c + z * z * k];
}
function r3between(a, b) {   // minimal rotation taking direction a onto direction b
  const u = nrm(a), v = nrm(b), ax = V.cross([0, 0, 0], u, v), sn = Math.hypot(ax[0], ax[1], ax[2]), cs = V.dot(u, v);
  if (sn < 1e-9) return cs > 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : r3axis(nrm(Math.abs(u[0]) < 0.9 ? V.cross([0, 0, 0], u, [1, 0, 0]) : V.cross([0, 0, 0], u, [0, 1, 0])), Math.PI);
  return r3axis(scl(ax, 1 / sn), Math.atan2(sn, cs));
}
const euler3 = (m) => [Math.asin(clamp(-m[7], -1, 1)), Math.atan2(m[6], m[8]), Math.atan2(m[1], m[4])];   // → [x, y, z]
const r3x = (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, s, 0, -s, c]; };
/**
 * Place the wrist pivot of one arm at world point `P` with world hand rotation `Hw` (3×3), shoulder → elbow → wrist:
 * the elbow hinge (lower rx) is solved from the reach distance, the upper arm is swung by the minimal rotation from
 * its current pose (keeps the elbow's swivel), the wrist takes whatever rotation is left. Writes s.pose, returns the
 * residual (m) — > 0 only when P is out of reach (the arm then points straight at it).
 */
function armIK(s, fk, model, side, P, Hw) {
  const piv = PIV[model], up = 'arm_' + side + '_upper', lo = 'arm_' + side + '_lower', hd = 'hand_' + side;
  const eOff = sub(piv[lo], piv[up]), wOff = sub(piv[hd], piv[lo]);
  const S = M.transformPoint([0, 0, 0], fk.torso, sub(piv[up], piv.torso));
  const T = r3(fk.torso), U0 = r3(fk[up]);
  const reach = (th) => Math.hypot(...add(eOff, r3v(r3x(th), wOff)));
  const d = V.dist(P, S), lim = JOINT_LIMITS[lo][0];
  let th;
  const hi = Math.min(0, lim[1]), lowTh = Math.max(-150 * DEG, lim[0]);
  if (d >= reach(hi)) th = hi;
  else if (d <= reach(lowTh)) th = lowTh;
  else { let a = lowTh, b = hi; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (reach(m) < d) a = m; else b = m; } th = (a + b) / 2; }
  const vLoc = add(eOff, r3v(r3x(th), wOff));
  const U = r3mul(r3between(r3v(U0, vLoc), sub(P, S)), U0);
  const upL = euler3(r3mul(r3T(T), U));
  const handL = euler3(r3mul(r3T(r3mul(U, r3x(th))), Hw));
  s.pose[up] = upL; s.pose[lo] = [th, 0, 0]; s.pose[hd] = handL;
  return Math.max(0, d - reach(hi));
}

// ---------------------------------------------------------------- laying a rifle on a target
// 1) swing the gun arm about the shoulder so the barrel points at the target (minimal rotation), 2) TWIST the forearm
// about the barrel so the rifle is held upright — its top toward the chest's up. (The minimal swing alone left the
// rifle rolled on its side or upside down whenever the arm came up from a hanging pose.)
// rifle "top" in the rifle part's frame: ATLAS's rifle is modelled bore-above-grip along +Y; VANGUARD's measured from
// its mesh (the barrel sits on the grip's +up side)
const GUN_UP = { gundam: [0, 1, 0], enemy_ms: [-0.0337, 0.064, 0.9974] };
function layRifle(s, model, target, k, twist = 1) {
  s.pose = { ...s.pose };
  for (let it = 0; it < 3; it++) {
    let fk = duelFK(s, model);
    const d0 = fk.muzzleDir, d1 = nrm(sub(target, fk.muzzle));
    const A = r3between(d0, lrp(d0, d1, k));
    s.pose.arm_R_upper = euler3(r3mul(r3T(r3(fk.torso)), r3mul(A, r3(fk.arm_R_upper))));
    if (twist <= 0) continue;
    fk = duelFK(s, model);
    const d = fk.muzzleDir, upW = nrm(M.transformDir([0, 0, 0], fk.rifle, GUN_UP[model]));
    const want0 = nrm(M.transformDir([0, 0, 0], fk.torso, [0, 1, 0]));
    const want = nrm(sub(want0, scl(d, V.dot(want0, d)))), cur = nrm(sub(upW, scl(d, V.dot(upW, d))));
    const ang = Math.atan2(V.dot(V.cross([0, 0, 0], cur, want), d), V.dot(cur, want)) * k * twist;
    const B = r3axis(d, ang);
    s.pose.arm_R_lower = euler3(r3mul(r3T(r3(fk.arm_R_upper)), r3mul(B, r3(fk.arm_R_lower))));
  }
  return s;
}
const aimRifle = (s, target, k) => layRifle(s, 'gundam', target, k);
// SIGMA'S HOLD (after DOOM's shotgun): the rifle is PLACED — grip at the right of his chest, a little forward, the stock
// back along the forearm to the right shoulder, the barrel on the target, its top toward his chest's up — and the right
// arm solved onto the grip by IK (the left comes onto the fore-end: heroLeft). No more arm-out pistol aim.
const HERO_GRIP = [-2.7, 2.7, 2.8];                     // torso frame
// HIS GUN ARM, THE WRIST LOCKED (the rifle 100 % with the forearm): the hand is held at one fixed angle on the forearm
// (HERO_WRIST); from the rifle's wanted world rotation Rr the forearm's rotation follows exactly (Rf = Rr·(Rh0·Rq)⁻¹),
// so the barrel lands exactly on the target; then only the shoulder turns, swinging the elbow so the grip comes as
// close as the arm allows to where it is wanted
const HERO_WRIST = [95, 0, 0];
let _rh0 = null; const RH0 = () => _rh0 || (_rh0 = r3(M.fromTRS(M.new(), [0, 0, 0], Q.fromEuler([0, 0, 0, 1], ...HERO_WRIST.map((v) => v * DEG)), 1)));
function heroArmPlace(s, fk, gripDes, Rr) {
  const T = r3(fk.torso), piv = PIV.gundam, vU = sub(piv.arm_R_lower, piv.arm_R_upper), vF = sub(piv.hand_R, piv.arm_R_lower);
  const Rf = r3mul(Rr, r3T(r3mul(RH0(), RQ3()))), Rh = r3mul(Rf, RH0());
  const S = partPoint(fk, 'arm_R_upper'), Ed = sub(sub(gripDes, r3v(Rf, vF)), r3v(Rh, RIFLE_T));
  const E = add(S, scl(nrm(sub(Ed, S)), Math.hypot(...vU)));
  const Ru = r3mul(r3between(nrm(r3v(T, vU)), nrm(sub(E, S))), T);
  s.pose = { ...s.pose };
  s.pose.arm_R_upper = euler3(r3mul(r3T(T), Ru));
  s.pose.arm_R_lower = euler3(r3mul(r3T(Ru), Rf));
  s.pose.hand_R = HERO_WRIST.map((v) => v * DEG);
}
let _rq = null; const RQ3 = () => _rq || (_rq = r3(M.fromTRS(M.new(), [0, 0, 0], RIFLE_Q, 1)));
const styleW = (tw, list, styles, want) => { let w = 0; list.forEach((ts, i) => { const st = Array.isArray(styles) ? styles[i] : styles[ts]; if (st === want) w = Math.max(w, smooth(ts - 0.45, ts - 0.25, tw) * (1 - smooth(ts + 0.25, ts + 0.5, tw))); }); return w; };
const HERO_GRIP_HIP = [-2.9, 0.9, 2.3];
function heroAim2H(s, target, k) {
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_R_upper', 'arm_R_lower', 'hand_R']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  const tw = warp(s._t), wHip = styleW(tw, HERO_SHOTS, HERO_STYLE, 'hip');
  const fk = duelFK(s, 'gundam'), grip = M.transformPoint([0, 0, 0], fk.torso, lrp(HERO_GRIP, HERO_GRIP_HIP, wHip));
  const d = nrm(sub(target, grip)), up0 = nrm(M.transformDir([0, 0, 0], fk.torso, [0, 1, 0]));
  const U = nrm(sub(up0, scl(d, V.dot(up0, d)))), X = V.cross([0, 0, 0], U, d);
  const Rh = r3mul([...X, ...U, ...d], r3T(RQ3()));                       // hand rotation so the rifle frame lands on (X, U, d)
  heroArmPlace(s, fk, grip, r3mul(Rh, RQ3()));                      // (the wrist locked: arm + rifle as one — see heroArmPlace)
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
  const wSnap = styleW(tw, HERO_SHOTS, HERO_STYLE, 'snap'); if (wSnap > 0) aimRifle(s, target, wSnap * k);   // the snap shot: one arm thrown out
  let hk = 0; for (const ts of [...HERO_SHOTS, ...HERO_BURST]) hk = Math.max(hk, 0.1 * kickCurve(tw - ts));
  holdWrist(s, tw, [...HERO_SHOTS, ...HERO_BURST], _wristH, (x) => duelHero_(x), 0.1);
  kickArm(s, 'gundam', hk * k);                                        // his recoil: the arm, wrist and rifle kick up together
}
// THE DRAW + LOAD (170–173.1, on the move; after the Unicorn's Magnum handling — fast moves, dead holds): wind-up, he
// rips the rifle off his back (HERO_GRAB) and it stops muzzle-up beside his head; tipped to the lens, the spent E-pac
// pops out of the receiver (HERO_EJECT) and the strip goes dark; his left hand slams a fresh pac in off his hip
// (HERO_LOAD), the strip lights in two steps (HERO_LOCK); it snaps down onto the target (HERO_SNAP0 → 1, a little
// overshoot) and he holds dead still while his eye flares
export const HERO_GRAB = 170.28, HERO_EJECT = 170.95, HERO_LOAD = 171.55, HERO_LOCK = 171.75, HERO_SNAP0 = 170.72, HERO_SNAP1 = 171.05, HERO_FLARE = 172.4;   // (no reload any more: HERO_EJECT/LOAD/LOCK unused)
const HERO_FORE = [0, -0.7, 4.5], HERO_REAR = [1.6, -1.0, 1.85], HERO_HIP = [2.7, -1.4, 0.6], HERO_LH = [0.10266, -0.84395, 0.50666];
// the back mount (torso frame): grip behind his right shoulder, the barrel slung diagonally down across his back to
// the left hip, its flank against the pack — carried like this from the launch until he rips it off at HERO_GRAB
const HERO_BACK_G = [-3.0, 4.8, -3.4], HERO_BACK_D = [0.55, -0.78, -0.28];
/** the slung rifle's torso-local 4x4 (column-major; rifle node frame, same basis heroDraw builds at roll 0) */
export function heroBackMount() {
  const d = nrm(HERO_BACK_D), U = nrm(sub([0, 1, 0], scl(d, d[1]))), X = V.cross([0, 0, 0], U, d), g = HERO_BACK_G;
  return new Float32Array([...X, 0, ...U, 0, ...d, 0, ...g, 1]);
}
// placed-rifle keys (torso frame): [t, grip, barrel direction, roll about the barrel (deg), ease]
const HERO_DRAWK = [
  [HERO_GRAB - 0.16, HERO_BACK_G, HERO_BACK_D, 0],                     // the hand on the grip behind his shoulder (= the back mount)
  [HERO_GRAB, HERO_BACK_G, HERO_BACK_D, 0],
  [170.45, [-3.3, 4.4, 1.0], [0.05, 1, 0.25], 0, 'back'],                // ripped up: muzzle-up beside his head, hard stop
  [170.72, [-3.3, 4.4, 1.0], [0.05, 1, 0.25], 0],
];
const easeBack = (u) => { const c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };   // ~3-5 % overshoot
function drawKey(tw) {
  const K = HERO_DRAWK; let i = 0; while (i < K.length - 2 && tw > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], u = sat((tw - a[0]) / (b[0] - a[0])), e = b[4] === 'back' ? easeBack(u) : u * u * (3 - 2 * u);
  const L = (x, y) => [0, 1, 2].map((c) => x[c] + (y[c] - x[c]) * e);
  return { g: L(a[1], b[1]), d: L(a[2], b[2]), roll: a[3] + (b[3] - a[3]) * e };
}
function heroDraw(s, tw) {
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_R_upper', 'arm_R_lower', 'hand_R']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  const fk = duelFK(s, 'gundam'), T = r3(fk.torso), kd = drawKey(Math.min(tw, HERO_SNAP0));
  let grip = M.transformPoint([0, 0, 0], fk.torso, kd.g), d = nrm(r3v(T, kd.d)), roll = kd.roll * DEG;
  if (tw > HERO_SNAP0) {                                              // the snap onto the target (ease-out-back)
    const u = easeBack(sat((tw - HERO_SNAP0) / (HERO_SNAP1 - HERO_SNAP0))), G1 = M.transformPoint([0, 0, 0], fk.torso, HERO_GRIP), d1 = nrm(sub(heroAimPoint(tw), G1));
    grip = lrp(grip, G1, u); d = nrm(lrp(d, d1, u)); roll *= 1 - Math.min(1, u);
  }
  const up0 = nrm(M.transformDir([0, 0, 0], fk.torso, [0, 1, 0])), U0 = nrm(sub(up0, scl(d, V.dot(up0, d))));
  const X0 = V.cross([0, 0, 0], U0, d), U = add(scl(U0, Math.cos(roll)), scl(X0, Math.sin(roll))), X = V.cross([0, 0, 0], U, d);
  const Rh = r3mul([...X, ...U, ...d], r3T(RQ3()));
  heroArmPlace(s, fk, grip, r3mul(Rh, RQ3()));                      // (the wrist locked: arm + rifle as one — see heroArmPlace)
  const k = smooth(HERO_GRAB - 0.2, HERO_GRAB - 0.1, tw);            // the hand gets to the grip fast
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
}
const heroLeftW = (tw) => smooth(HERO_SNAP0, HERO_SNAP0 + 0.2, tw) * (1 - smooth(190.85, 191.05, tw)) * (1 - saberBusy(tw)) * (1 - Math.max(styleW(tw, HERO_SHOTS, HERO_STYLE, 'hip'), styleW(tw, HERO_SHOTS, HERO_STYLE, 'snap')));   // on from the pac grab through the whole gunfight
const HERO_CAP_L = [0.1, -1.0, 0.6];   // the E-pac in his left hand (hand frame)
function heroLeftWrist(fk, tw, Rw) {   // wrist target: the pac off the hip → slammed into the breech → the hand on the fore-end
  const hip = M.transformPoint([0, 0, 0], fk.torso, HERO_HIP), rear = M.transformPoint([0, 0, 0], fk.rifle, HERO_REAR), fore = M.transformPoint([0, 0, 0], fk.rifle, HERO_FORE);
  return sub(fore, r3v(Rw, HERO_LH));   // (straight onto the fore-end as the rifle comes down: the weight ramps in)
}
function heroLeft(s, tw) {
  const k = heroLeftW(tw); if (k <= 0) return;
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  const fk = duelFK(s, 'gundam'), Rw = r3(fk.hand_R);
  armIK(s, fk, 'gundam', 'L', heroLeftWrist(fk, tw, Rw), Rw);
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
}
/** the spent E-pac popping out at HERO_EJECT: its rifle-frame start + the rifle frame at that moment (shots.js flies it) */
let _ej = null;
export function heroEject() {
  if (_ej) return _ej;
  const h = duelHero(HERO_EJECT), fk = duelFK(h, 'gundam'), v0 = scl(sub(heroRawPos(HERO_EJECT + 0.02), heroRawPos(HERO_EJECT - 0.02)), 25);
  const right = scl(nrm(M.transformDir([0, 0, 0], fk.torso, [1, 0, 0])), -1);   // ejected out to his right, like a rifle's ejection port
  _ej = { p: M.transformPoint([0, 0, 0], fk.rifle, [0.62, 3.6, 0.4]), up: nrm(M.transformDir([0, 0, 0], fk.rifle, [0, 1, 0])), back: right, vShip: v0 };
  return _ej;
}
/** the E-cap in his left hand (171.85 → HERO_LOAD), world position + its axis; null when not held */
export function heroCap(t) {
  return null;   // (the reload was cut)
  const h = duelHero(t); if (!h) return null;
  const fk = duelFK(h, 'gundam');
  return { p: M.transformPoint([0, 0, 0], fk.hand_L, HERO_CAP_L), axis: nrm(fk.muzzleDir) };
}
/** his rifle's frame at t (grip, barrel direction, his left) */
export function heroRifleFrame(t) {
  const h = duelHero(t); if (!h) return null;
  const fk = duelFK(h, 'gundam');
  return { p: M.transformPoint([0, 0, 0], fk.rifle, [0, 0, 0]), dir: fk.muzzleDir, left: nrm(M.transformDir([0, 0, 0], fk.torso, [1, 0, 0])), rear: M.transformPoint([0, 0, 0], fk.rifle, HERO_REAR) };
}
const aimEnemy = (s, target, k) => layRifle(s, 'enemy_ms', target, k);
// RECOIL: the gun arm thrown up about the shoulder — the forearm, the wrist and the rifle move as one (the wrist joint
// is not bent), the muzzle climbing by `ang` (rad) about the barrel's side axis
// the wrist is held at its angle from just before the shot while the recoil plays out (forearm, wrist and rifle as one)
const lastShot = (tw, list, win = 0.9) => { let b = null; for (const ts of list) if (tw > ts && tw - ts < win && (b === null || ts > b)) b = ts; return b; };
const _wristE = new Map(), _wristH = new Map(), _wristT = new Map();
function holdWrist(s, tw, list, cache, stateAt, hold = 0.2) {   // (the whole gun arm, relative to the torso: it rides the body's kick)
  const ts = lastShot(tw, list, hold + 0.3); if (ts === null) return;
  let ref = cache.get(ts); if (!ref) { const q = stateAt(ts - 0.004).pose; ref = {}; for (const p of ['arm_R_upper', 'arm_R_lower', 'hand_R']) ref[p] = (q[p] || [0, 0, 0]).slice(); cache.set(ts, ref); }
  const w = 1 - smooth(ts + hold, ts + hold + 0.25, tw);               // held through the kick, then back onto the aim
  s.pose = { ...s.pose };
  for (const p in ref) { const c = s.pose[p] || [0, 0, 0]; s.pose[p] = [0, 1, 2].map((i) => lerp(c[i], ref[p][i], w)); }
}
function kickArm(s, model, ang) {
  if (!(ang > 1e-4)) return;
  s.pose = { ...s.pose };
  const fk = duelFK(s, model), d = fk.muzzleDir, ax = nrm(V.cross([0, 0, 0], d, [0, 1, 0]));
  s.pose.arm_R_upper = euler3(r3mul(r3T(r3(fk.torso)), r3mul(r3axis(ax, ang), r3(fk.arm_R_upper))));
}
// ---------------------------------------------------------------- the pass-cut (CUT_T)
// The left hand is placed by IK so the blade, held out to his left at waist height, sweeps flat from forward-left to
// back-left as he passes — pointing EXACTLY at its waist at CUT_T (so the cut is real), 90° of sweep over ~0.25 s.
const SLASH_W = (tw) => smooth(CUT_T - 0.3, CUT_T - 0.14, tw) * (1 - smooth(CUT_T + 0.18, CUT_T + 0.4, tw));
let _slashRef = null;
function slashRef() {   // the blade direction onto the waist at CUT_T, levelled in its torso's cut plane (computed once)
  if (_slashRef) return _slashRef;
  _slashRef = { pending: true };
  const h = duelHero_(CUT_T), fk = duelFK(h, 'gundam'), e = enemyRaw_(CUT_T), E = duelFK(e, 'enemy_ms');
  const waist = partPoint(E, 'torso', [0, CUT_Y, 0]), upE = nrm(M.transformDir([0, 0, 0], E.torso, [0, 1, 0]));
  const hilt = onPlane(hiltAt(fk), waist, upE);
  _slashRef = { dir: nrm(sub(waist, hilt)), waist };
  return _slashRef;
}
const onPlane = (p, o, n) => sub(p, scl(n, V.dot(sub(p, o), n)));                 // p moved along n onto the plane (o, n)
const rotAxis = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a), kv = V.dot(k, v), x = V.cross([0, 0, 0], k, v); return [0, 1, 2].map((i) => v[i] * c + x[i] * s + k[i] * kv * (1 - c)); };
const hiltAtTrans = (fk, ang = 0) => M.transformPoint([0, 0, 0], fk.torso, [3.2 * Math.sin(ang), 3.1, 3.2 * Math.cos(ang) + 2.8]);   // the charged-shot cut: both hands swung round in front of him on an arc (ang: right −, left +), arms out
function hiltAt(fk) {   // where the hilt is held: out to his left of the chest, a little forward, at the waist line
  const T = fk.torso;
  return add(M.transformPoint([0, 0, 0], T, [3.4, 1.2, 1.6]), [0, 0, 0]);
}
function slashIK(s, tw) {
  const k = SLASH_W(tw);
  if (k <= 0) return;
  const ref = slashRef(); if (ref.pending) return;
  // the blade is held IN its torso's cut plane (torso-local y = CUT_Y): the hilt on that plane, the sweep about its up axis,
  // so the slice the renderer makes (a torso-local horizontal plane) is exactly where the blade goes through
  const E = duelFK(enemyRaw_(s._t), 'enemy_ms'), upE = nrm(M.transformDir([0, 0, 0], E.torso, [0, 1, 0])), waist = partPoint(E, 'torso', [0, CUT_Y, 0]);
  const base = nrm(sub(ref.dir, scl(upE, V.dot(ref.dir, upE))));
  const a = clamp((tw - CUT_T) / 0.12, -1.3, 1.3) * 50 * DEG;      // + before the cut toward forward, − after toward back
  let dir = rotAxis(base, upE, a);
  if (V.dot(rotAxis(base, upE, 0.3), D_U) < V.dot(base, D_U)) dir = rotAxis(base, upE, -a);   // (sign: earlier = more forward)
  const upv = upE, xv = V.cross([0, 0, 0], upv, dir);
  const Hw = [...xv, ...upv, ...dir];
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  const fk = duelFK(s, 'gundam'), hilt = onPlane(hiltAt(fk), waist, upE);
  armIK(s, fk, 'gundam', 'L', sub(hilt, r3v(Hw, [0, -1.2, 0.6])), Hw);
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
}
/** cheap per-time sample for the thruster trails: hip position + boost amount (no pose / IK) */
export function trailSample(who, t) {
  const tw = warp(t);
  return who === 'hero' ? { pos: heroRawPos(tw), boost: heroBoost(tw) } : { pos: enemyRawPos(tw), boost: enemyBoost(tw) };
}
/** VANGUARD's rifle muzzle + barrel direction at story time t (name kept from SERAPH) */
export function seraphMuzzle(t) {
  const st = enemyRaw_(t);
  if (!st || !st.vis || st.muzzleOff) return null;
  const fk = duelFK(st, 'enemy_ms');
  return { pos: fk.muzzle, dir: fk.muzzleDir };
}
// ---- THE TRANSFORMING SHOT (mid-fight, its shot at TRANS_SHOT): the rifle opens out — two rails slide out of it either
// side (transK), charging arcs between them — then it fires a heavy homing beam with a big spinning energy body at its
// head, which bends round after him; he slips it at the last moment and it bursts behind him (TRANS_HIT)
/** the enemy rifle's frame at t: grip position, barrel direction, the rifle's side and top axes (world) */
export function enemyRifleFrame(t) {
  const st = enemyRaw_(t); if (!st) return null;
  const fk = duelFK(st, 'enemy_ms'), up0 = nrm(M.transformDir([0, 0, 0], fk.rifle, GUN_UP.enemy_ms)), d = fk.muzzleDir;
  const side = nrm(V.cross([0, 0, 0], d, up0)), up1 = nrm(V.cross([0, 0, 0], side, d));
  return { p: M.transformPoint([0, 0, 0], fk.rifle, [0, 0, 0]), muzzle: fk.muzzle, dir: d, side, up: up1, fk };
}
let _tp = null;
/** the shot's path: a cubic Bézier from the muzzle bending round onto a point a hair to the left of his head (the cockpit
 *  line) at TRANS_PASS — his head where it would be without the neck-snap — then straight on at the same speed */
export function transPath() {
  if (_tp) return _tp;
  _tp = { pending: true };
  const m = seraphMuzzle(TRANS_SHOT), T0 = TRANS_PASS - 0.12;
  const h0 = duelHero(T0), fk = duelFK(h0, 'gundam');
  const head = add(partPoint(fk, 'head', [0, 1.4, 0.4]), sub(heroRawPos(TRANS_PASS), heroRawPos(T0)));
  const left = nrm(M.transformDir([0, 0, 0], fk.torso, [1, 0, 0]));
  const up0 = nrm(M.transformDir([0, 0, 0], fk.torso, [0, 1, 0]));
  const dirIn = nrm(sub(head, m.pos)), P = sub(head, scl(dirIn, 8));   // STRAIGHT at his head — his blade meets it 8 m out in front
  const dist = V.dist(m.pos, P), p1 = lrp(m.pos, P, 1 / 3), p2 = lrp(m.pos, P, 2 / 3);
  _tp = { p0: m.pos, p1, p2, p3: P, dirIn, left, up: up0, ts: TRANS_SHOT, tp: TRANS_PASS, speed: 0.9 * dist / (TRANS_PASS - TRANS_SHOT) };
  return _tp;
}
// his slip out of the charged shot: ~9 m to his right (away from its line) in 0.07 s, held, back over 0.7 s
const transSlip = (tw) => smooth(TRANS_PASS - 0.09, TRANS_PASS - 0.02, tw) * (1 - smooth(TRANS_PASS + 0.3, TRANS_PASS + 1.0, tw));
export const transGhost = (tw) => 0 * smooth(TRANS_PASS - 0.1, TRANS_PASS - 0.07, tw) * (1 - smooth(TRANS_PASS + 0.15, TRANS_PASS + 0.35, tw));
function transDodge(tw) {
  return [0, 0, 0];                                                  // (no slip any more: he cuts the shot in half — transCutIK)
  const k = transSlip(tw); if (k <= 0) return [0, 0, 0];
  const f = flat(sub(enemyRawPos(TRANS_PASS), heroRawPos(TRANS_PASS)), 0), right = [-f[2], 0, f[0]];
  return scl(right, 9 * k);
}
// HE CUTS IT IN HALF: his left hand lets go of the fore-end, the saber ignites (TRANS_PASS − 0.35) and he sweeps it down
// through the light-ball exactly as it arrives (the blade passes through its centre at TRANS_PASS); the two halves part
// either side of the cut plane (transCutAxis) and burst behind him
const transSaber = (tw) => smooth(SD_OUT, SD_OUT + 0.03, tw) * (1 - smooth(TRANS_PASS + 0.45, TRANS_PASS + 0.57, tw));   // lit once it's out of the mount
// THE DRAW (before the cut): the rifle is flung away (THROW0), the left hand drops to the hilt on his left hip, rips it
// out forward, the blade lights, both hands take it up overhead — then the sweep (transCutIK); afterwards the blade goes
// out and the hilt goes back on the hip. Hilt poses in his torso frame: [t, position, blade direction]
export const SD_REACH = 184.6, SD_GRAB = 184.66, SD_OUT = 184.72, SD_GUARD = 184.8, SD_SWEEP = 184.83, SD_HOLSTER0 = 185.44, SD_HOLSTER = 185.62;
export const SABER_MOUNT_P = [2.3, -2.4, -0.6], SABER_MOUNT_D = nrm([0.25, -0.55, -0.8]);   // the hilt hanging on his left hip, emitter down-back
const SD_KEYS = [[SD_GRAB, SABER_MOUNT_P, SABER_MOUNT_D],
  [SD_OUT, [1.8, 0.8, 4.8], nrm([0.35, -0.15, 1])],                   // lit pointing out ahead of him, away from his body
  [SD_OUT + 0.04, [0.2, 3.8, 5.0], nrm([-0.3, 0.6, 0.75])],          // brought up in front of him, blade raised and forward
  [SD_GUARD, [-2.3, 3.3, 4.0], nrm([-0.92, 0.2, 0.33])],             // wound round to his right, blade out to that side — exactly where the cut starts
  [SD_SWEEP, [-2.37, 3.1, 4.0], nrm([-0.95, 0.05, 0.3])]];           // (onto the start of the cut's arc)
const SH_KEYS = [[SD_HOLSTER0, [1.4, 0.4, 2.8], nrm([0.2, -0.3, 1])], [SD_HOLSTER, SABER_MOUNT_P, SABER_MOUNT_D]];
export const hiltInHand = (tw) => tw >= SD_GRAB && tw < SD_HOLSTER;
const saberBusy = (tw) => smooth(SD_REACH - 0.02, SD_REACH + 0.02, tw) * (1 - smooth(SD_HOLSTER + 0.02, SD_HOLSTER + 0.12, tw));
function keyPose(K, tw) {
  let i = 0; while (i < K.length - 2 && tw > K[i + 1][0]) i++;
  const a = K[i], b = K[i + 1], u = sat((tw - a[0]) / (b[0] - a[0])), e = u * u * (3 - 2 * u);
  return { P: lrp(a[1], b[1], e), D: nrm(lrp(a[2], b[2], e)) };
}
function hiltFrame(fk, P, D) {   // hilt world position + hand rotation for a torso-local hilt pose
  const T = r3(fk.torso), p = M.transformPoint([0, 0, 0], fk.torso, P), d = nrm(r3v(T, D)), u0 = r3v(T, [0, 0, 1]);
  const upv = nrm(sub(u0, scl(d, V.dot(u0, d)))), xv = V.cross([0, 0, 0], upv, d);
  return { p, d, Hw: [...xv, ...upv, ...d] };
}
function saberDrawIK(s, tw) {   // the left hand: to the hip, rip it out, overhead (and later: back onto the hip)
  const wD = smooth(SD_REACH, SD_REACH + 0.05, tw) * (1 - smooth(SD_OUT + 0.045, SD_GUARD - 0.005, tw));
  const wH = smooth(SD_HOLSTER0 - 0.06, SD_HOLSTER0, tw) * (1 - smooth(SD_HOLSTER, SD_HOLSTER + 0.1, tw));
  const k = Math.max(wD, wH); if (k <= 0) return;
  const kp = wD >= wH ? keyPose(SD_KEYS, Math.max(tw, SD_GRAB)) : keyPose(SH_KEYS, tw);
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  const fk = duelFK(s, 'gundam'), F = hiltFrame(fk, kp.P, kp.D);
  armIK(s, fk, 'gundam', 'L', sub(F.p, r3v(F.Hw, [0, -1.2, 0.6])), F.Hw);
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
}
function saberRightGrip(s, tw) {   // the right hand joins below the left once the rifle is gone: a two-handed grip for the cut
  const k = smooth(SD_OUT + 0.02, SD_GUARD - 0.01, tw) * (1 - smooth(TRANS_PASS + 0.1, TRANS_PASS + 0.2, tw)); if (k <= 0) return;
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_R_upper', 'arm_R_lower', 'hand_R']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  const fk = duelFK(s, 'gundam'), hm = fk.hand_L, d = nrm(M.transformDir([0, 0, 0], hm, [0, 0, 1])), Hw = r3(hm);
  const hiltL = M.transformPoint([0, 0, 0], hm, [0, -1.2, 0.6]), hiltR = sub(hiltL, scl(d, 1.7));
  armIK(s, fk, 'gundam', 'R', sub(hiltR, r3v(Hw, [0, -1.2, 0.6])), Hw);
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
}
function throwFling(s, tw) {   // the right arm: wound in across his chest, then flung out hard to his right — the rifle leaves at THROW0
  if (tw < THROW0 - 0.07 || tw > THROW0 + 0.14) return;
  const a = tw < THROW0 - 0.02 ? 35 * smooth(THROW0 - 0.07, THROW0 - 0.02, tw) : tw < THROW0 ? lerp(35, -80, smooth(THROW0 - 0.02, THROW0, tw)) : lerp(-80, -95, smooth(THROW0, THROW0 + 0.05, tw)) * (1 - smooth(THROW0 + 0.06, THROW0 + 0.14, tw));
  s.pose = { ...s.pose };
  const fk = duelFK(s, 'gundam'), ax = nrm(M.transformDir([0, 0, 0], fk.torso, [0, 0, 1]));
  s.pose.arm_R_upper = euler3(r3mul(r3T(r3(fk.torso)), r3mul(r3axis(ax, a * DEG), r3(fk.arm_R_upper))));
}
const transCutW = (tw) => smooth(SD_OUT + 0.045, SD_GUARD - 0.005, tw) * (1 - smooth(TRANS_PASS + 0.3, TRANS_PASS + 0.5, tw));   // (its held start pose IS the wind-up: raised → wound up → cut, one line)
let _tcut = null;
function transCutRef() {   // the blade's line onto the ball at the pass (from where his hilt is then), computed once
  if (_tcut) return _tcut;
  if (!_tp || _tp.pending) return null;
  _tcut = { pending: true };
  const h = duelHero_(TRANS_PASS), fk = duelFK(h, 'gundam'), hilt = hiltAtTrans(fk), P = transHead(TRANS_PASS);
  const base = nrm(sub(P, hilt)), a = nrm(V.cross([0, 0, 0], base, nrm(M.transformDir([0, 0, 0], fk.torso, [1, 0, 0]))));   // swept in the plane of (the line to the ball, his right-left): one big stroke from his right across to his left
  _tcut = { base, a, reach: V.dist(P, hilt) };
  return _tcut;
}
export const transCutAxis = () => { const r = transCutRef(); return r && !r.pending ? r.a : [1, 0, 0]; };
function transTwist(s, tw) {   // the body: wound round to his right for the draw-back, uncoiling hard through the cut
  const wind = smooth(SD_GUARD - 0.06, SD_SWEEP, tw), cut = smooth(SD_SWEEP, TRANS_PASS + 0.12, tw), rel = smooth(TRANS_PASS + 0.2, TRANS_PASS + 0.5, tw);
  const yaw = (-50 * wind * (1 - cut) + 45 * cut) * (1 - rel);   // (a big wind-up and a full follow-through) if (Math.abs(yaw) < 0.01) return;
  s.pose = { ...s.pose }; const t0 = s.pose.torso || [0, 0, 0]; s.pose.torso = [t0[0], t0[1] + yaw * DEG, t0[2]];
}
function transCutIK(s, tw) {
  const k = transCutW(tw); if (k <= 0) return;
  const ref = transCutRef(); if (!ref || ref.pending) return;
  const u = tw - TRANS_PASS, x = u < 0 ? clamp(-u / 0.02, 0, 1) : clamp(u / 0.05, 0, 1);
  const ang = Math.sign(u) * (1 - (1 - x) * (1 - x)) * 110 * DEG;   // held out far right, whipped across (fastest through the ball) to far left
  const dir = rotAxis(ref.base, ref.a, ang), upv = nrm(V.cross([0, 0, 0], dir, ref.a)), xv = V.cross([0, 0, 0], upv, dir), Hw = [...xv, ...upv, ...dir];
  s.pose = { ...s.pose };
  const keep = {}; for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  const fk = duelFK(s, 'gundam'), hilt = hiltAtTrans(fk, ang);
  armIK(s, fk, 'gundam', 'L', sub(hilt, r3v(Hw, [0, -1.2, 0.6])), Hw);
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
}
// the rifle tossed aside for the cut: it leaves his right hand as the saber lights, tumbles once end over end out to his
// right and drops back into the same hand after the blade is through (the path is anchored to his grip at both ends)
export const THROW0 = TRANS_PASS - 0.32, CATCH_T = TRANS_PASS + 0.85;
let _thr = null;
function m2q(m) {   // column-major r3 → quaternion [x, y, z, w]
  const [a, b, c, d, e, f, g, h, i] = m, tr = a + e + i;
  if (tr > 0) { const S = Math.sqrt(tr + 1) * 2; return [(f - h) / S, (g - c) / S, (b - d) / S, 0.25 * S]; }
  if (a > e && a > i) { const S = Math.sqrt(1 + a - e - i) * 2; return [0.25 * S, (d + b) / S, (g + c) / S, (f - h) / S]; }
  if (e > i) { const S = Math.sqrt(1 + e - a - i) * 2; return [(d + b) / S, 0.25 * S, (h + f) / S, (g - c) / S]; }
  const S = Math.sqrt(1 + i - a - e) * 2; return [(g + c) / S, (h + f) / S, 0.25 * S, (b - d) / S];
}
/** the thrown rifle's world matrix at t (null outside the throw) */
export function heroRifleThrow(t) {
  if (t <= THROW0 || t >= CATCH_T) return null;
  if (!_thr) {
    const f0 = duelFK(duelHero(THROW0), 'gundam'), f1 = duelFK(duelHero(CATCH_T), 'gundam');
    const right = scl(nrm(M.transformDir([0, 0, 0], f0.torso, [1, 0, 0])), -1), upv = nrm(M.transformDir([0, 0, 0], f0.torso, [0, 1, 0]));
    _thr = { p0: M.transformPoint([0, 0, 0], f0.rifle, [0, 0, 0]), p1: M.transformPoint([0, 0, 0], f1.rifle, [0, 0, 0]), q0: m2q(r3(f0.rifle)), q1: m2q(r3(f1.rifle)), right, up: upv };
  }
  // on FILM time (the draw runs in bullet time, the rifle mustn't hang there): hurled far out in a second, drifting,
  // swinging back in at the end to meet his hand
  const dF = filmT(t) - filmT(THROW0), DF = filmT(CATCH_T) - filmT(THROW0), u = sat(dF / DF), e = u * u * (3 - 2 * u);
  const out = (1 - Math.exp(-dF * 1.8)) * (1 - smooth(DF - 1.6, DF, dF));
  const p = add(add(lrp(_thr.p0, _thr.p1, e), scl(_thr.right, 65 * out)), scl(_thr.up, 16 * out));
  const q = Q.slerp([0, 0, 0, 1], _thr.q0, _thr.q1, e);
  const m = M.fromTRS(new Float32Array(16), p, q, 1);
  const sp = 4 * Math.PI * e, c = Math.cos(sp), sn = Math.sin(sp);   // two full end-over-end turns about its own x (back in the hand the right way up)
  const rx = new Float32Array([1, 0, 0, 0, 0, c, sn, 0, 0, -sn, c, 0, 0, 0, 0, 1]);
  return M.mul(new Float32Array(16), m, rx);
}
/** the light-ball's position at t: along the curve to the pass, then straight on */
export function transHead(t) {
  const P = transPath();
  if (t > P.tp) return add(P.p3, scl(P.dirIn, P.speed * (t - P.tp)));
  const u = sat((t - P.ts) / (P.tp - P.ts)), v = 1 - u;
  return [0, 1, 2].map((i) => P.p0[i] * v * v * v + 3 * P.p1[i] * v * v * u + 3 * P.p2[i] * v * u * u + P.p3[i] * u * u * u);
}
/** the energy source orbiting the ball: a helix round its line of flight */
export function transOrb(t) {
  const c = transHead(t), T = nrm(sub(transHead(t + 0.004), transHead(t - 0.004))), e1 = nrm(V.cross([0, 0, 0], T, [0, 1, 0])), e2 = V.cross([0, 0, 0], T, e1), a = (t - TRANS_SHOT) * 48;
  return add(c, add(scl(e1, 2.4 * Math.cos(a)), scl(e2, 2.4 * Math.sin(a))));
}
/** where his 178.7 shot splashes on the shield: part-local spot, and at time t its world position + the face normal */
let _bs = null;
export const BLOCK_SPOT = () => _bs || (_bs = (() => { const e = DUEL_EVENTS.find((x) => x.block), fk = duelFK(enemyRaw_(e.t), 'enemy_ms'); return { t: e.t, local: M.transformPoint([0, 0, 0], M.invert(M.new(), fk.shield), e.pos) }; })());
export function blockFrame(t) {
  const st = enemyRaw_(t); if (!st) return null;
  const fk = duelFK(st, 'enemy_ms');
  return { p: M.transformPoint([0, 0, 0], fk.shield, blockLocalAt(t)), S: fk.shield, n: nrm(M.transformDir([0, 0, 0], fk.shield, [1, 0, 0])), up: nrm(M.transformDir([0, 0, 0], fk.shield, [0, 1, 0])) };
}
// THE BLOCK, done properly: the beam is a ray from his muzzle (as it moves with his recoil) and it stops where it meets
// the struck face of the (enlarged) shield; the path it drags across the plate is kept in the shield's own frame
// the spare plates rack out of the shield in two hard, overshooting steps each way (clunk-clunk), just before the shot hits
const clunk = (t, t0, d = 0.018) => { const u = sat((t - t0) / d); if (u <= 0) return 0; const c = 2.6; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
export const SHIELD_CLUNKS = [178.625, 178.645, 178.665, 178.685];   // (after the D09 cut has settled, inside the block's bullet time)
export const bigShieldScale = (t) => { const back = smooth(179.1, 179.35, t);
  const sy = 1 + 0.5 * clunk(t, SHIELD_CLUNKS[0]) + 0.5 * clunk(t, SHIELD_CLUNKS[2]), sz = 1 + 0.5 * clunk(t, SHIELD_CLUNKS[1]) + 0.5 * clunk(t, SHIELD_CLUNKS[3]);
  return { sy: 1 + (sy - 1) * (1 - back), sz: 1 + (sz - 1) * (1 - back) }; };
const BLOCK_C0 = BLOCK_T + 0.012, BLOCK_C1 = BLOCK_T + 0.26;   // the beam in contact with the plate
let _bside = 0;
function blockFaceX(t) {   // the local x of the struck (outer) face of the enlarged plate, the side turned to him
  if (!_bside) { const m = duelMuzzle(BLOCK_T), fk = duelFK(enemyRaw_(BLOCK_T), 'enemy_ms'), oL = M.transformPoint([0, 0, 0], M.invert(M.new(), fk.shield), m.pos); _bside = oL[0] < SHIELD_C[0] ? -1 : 1; }
  const th = 1 + 0.3 * (bigShieldScale(t).sy - 1);
  return SHIELD_C[0] + ((_bside < 0 ? 0.55 : 1.83) - SHIELD_C[0]) * th;
}
/** the beam's contact point on the plate at t (shield frame): it drags diagonally down across the face with a waver */
export function blockLocalAt(t) {
  const u = smooth(BLOCK_C0, BLOCK_C1, t) * 0.85 + sat((t - BLOCK_C0) / (BLOCK_C1 - BLOCK_C0)) * 0.15, { sy, sz } = bigShieldScale(Math.min(t, BLOCK_C1));
  return [blockFaceX(Math.min(t, BLOCK_C1)), SHIELD_C[1] + sy * (2.3 - 4.6 * u), SHIELD_C[2] + sz * (-0.95 + 1.7 * u + 0.25 * Math.sin(u * 9.5))];
}
export function blockHitAt(t) {
  const m = duelMuzzle(t), st = enemyRaw_(t); if (!m || !st) return null;
  const fk = duelFK(st, 'enemy_ms'), S = fk.shield, local = blockLocalAt(t), p = M.transformPoint([0, 0, 0], S, local);
  return { p, local, inside: t >= BLOCK_C0 - 0.012 && t <= BLOCK_C1, n: nrm(M.transformDir([0, 0, 0], S, [_bside, 0, 0])), from: m.pos, dir: nrm(sub(p, m.pos)) };
}
let _bpath = null;
/** the beam's track across the plate: [{t, local}] (shield frame) */
export function blockPath() {
  if (_bpath) return _bpath;
  _bpath = [];
  for (let t = BLOCK_C0; t <= BLOCK_C1 + 1e-6; t += 0.004) _bpath.push({ t, local: blockLocalAt(t) });
  return _bpath;
}
/** world position + unit direction of the hero's rifle muzzle at story time t */
export function duelMuzzle(t) {
  const s = duelHero(t);
  if (!s) return null;
  const fk = duelFK(s, 'gundam');
  return { pos: fk.muzzle, dir: fk.muzzleDir };
}

// ---------------------------------------------------------------- HIT REACTION (partial ragdoll)
// A beam hit physically shoves the part it lands on: the struck joint and the ones above it (weights 1 / 0.6 / 0.3)
// swing about the lever from each joint to the hit point, along the shot — one critically damped hump (0 at the hit
// frame; peak ≈ 0.14 s; settled by 1 s).
const REACT_CHAIN = (() => {
  const c = { torso: ['torso'], head: ['head', 'torso'], pelvis: ['pelvis'], shield: ['arm_L_lower', 'arm_L_upper', 'torso'] };
  for (const S of ['L', 'R']) {
    c['arm_' + S + '_upper'] = ['arm_' + S + '_upper', 'torso']; c['arm_' + S + '_lower'] = ['arm_' + S + '_lower', 'arm_' + S + '_upper', 'torso'];
    c['hand_' + S] = ['hand_' + S, 'arm_' + S + '_lower', 'arm_' + S + '_upper'];
  }
  return c;
})();
const REACT_W = [1, 0.6, 0.3];
let REACTS = [];
function hitReact(who, tw, s, model) {
  if (!REACTS.length || !s || !s.vis) return s;
  for (const r of REACTS) {
    if (r.who !== who && !(r.who.startsWith('e') && who.startsWith('e'))) continue;
    const lt = tw - r.t;
    if (lt <= 0 || lt > 1) continue;
    const env = (lt * 7) * Math.exp(1 - lt * 7) * (1 - lt);
    if (env < 1e-3) continue;
    s.pose = { ...s.pose };
    (REACT_CHAIN[r.part] || [r.part]).forEach((j, i) => {
      const fk = duelFK(s, model);
      if (!fk[j] || !fk[r.part]) return;
      const Pp = M.transformPoint([0, 0, 0], fk[r.part], r.local), pivot = M.transformPoint([0, 0, 0], fk[j], [0, 0, 0]);
      const ax = V.cross([0, 0, 0], sub(Pp, pivot), r.dir), Ln = Math.hypot(ax[0], ax[1], ax[2]);
      if (Ln < 1e-6) return;
      const A = r3axis(scl(ax, 1 / Ln), r.amp * env * REACT_W[i]);
      const par = PARENT[j], Wp = r3(par ? fk[par] : fk.root);
      s.pose[j] = euler3(r3mul(r3T(Wp), r3mul(A, r3(fk[j]))));
    });
  }
  return s;
}

// ============================================================================ events
// [t, type, strength, spec]: the shots themselves are drawn by shots.js; these carry shake / sound / hits
const EV = [
  ...SERAPH_SHOTS.map((t) => [t, 'shake', 0.28, { on: t < SERAPH_HANDOFF ? 'e1' : 'e2', note: 'VANGUARD fires' }]),
  [BLOCK_T + 0.03, 'hit', 0.6, { kind: 'shot', part: ['e1', 'shield', SHIELD_C], block: true, note: 'the shield takes his shot' }],
  [SHIELD_HIT_T + 0.03, 'hit', 0.9, { kind: 'shot', part: ['e2', 'shield', SHIELD_C], note: 'his shot tears the shield off its arm' }],
  [THIGH_T + 0.03, 'hit', 0.7, { kind: 'shot', part: ['e2', 'leg_R_upper', THIGH_P], note: 'his shot burns through its right thigh' }],
  [HERO_HIT_T + 0.04, 'hit', 0.7, { kind: 'heroHit', part: ['hero', 'arm_L_upper', PAULDRON_P], note: 'its shot burns through his left pauldron' }],
  [FINALE_T, 'shake', 0.6, { on: 'e2', note: 'VANGUARD fires at full power' }],
  [ULT_HIT, 'shake', 0.9, { on: 'hero', note: 'the beams converge where he was' }],
  [CUT_T, 'hit', 1.0, { kind: 'slash', note: 'the beam saber cuts it in half at the waist' }],
  [194.0, 'shake', 1.2, { on: 'e2', note: 'VANGUARD explodes' }],
];
const MODEL = { hero: 'gundam', e1: 'enemy_ms', e2: 'enemy_ms' };
export const stateOf = (who, t) => (who === 'hero' ? duelHero(t) : who === 'e1' ? duelEnemy1(t) : duelEnemy2(t));
function solveEvent([t, type, strength, spec]) {
  const ev = { t, type, strength, on: spec.on || 'enemy', note: spec.note, hitstop: (HITSTOPS.find((h) => Math.abs(h[0] - t) < 1e-6) || [0, 0])[1] };
  if (spec.kind === 'shot') {                   // a beam hit: the point on the struck part, along the shot
    const E = duelFK(enemyRaw_(t), 'enemy_ms');
    const Pp = partPoint(E, spec.part[1], spec.part[2]), m = duelMuzzle(t - 0.05), d = m ? nrm(sub(Pp, m.pos)) : [0, 0, -1];
    ev.pos = Pp; ev.gap = 0; ev.on = 'enemy'; ev.shotDir = d; ev.block = !!spec.block; ev.part = spec.part[1];
    if (spec.cut) ev.cut = [add(Pp, scl(d, -6)), add(Pp, scl(d, 6))];
  } else if (spec.kind === 'heroHit') {         // the enemy's shot landing on him
    const H = duelFK(duelHero_(t), 'gundam'), Pp = partPoint(H, spec.part[1], spec.part[2]), m = seraphMuzzle(t - 0.04), d = m ? nrm(sub(Pp, m.pos)) : [0, 0, 1];
    ev.pos = Pp; ev.on = 'hero'; ev.shotDir = d; ev.part = spec.part[1]; ev.heroHit = true;
  } else if (spec.kind === 'slash') {           // the saber through its waist: the point on its torso, the dash direction
    const E = duelFK(enemyRaw_(t), 'enemy_ms');
    ev.pos = partPoint(E, 'torso', [0, CUT_Y, 0]); ev.on = 'enemy'; ev.slash = true; ev.dir = D_U.slice();
  } else {
    const who = spec.on === 'hero' ? 'hero' : 'e2';
    ev.pos = (who === 'hero' ? duelHero(t) : enemyRaw_(t)).pos.slice(); ev.on = who === 'hero' ? 'hero' : 'enemy';
  }
  return ev;
}
/** [{t, type, pos, on, strength, hitstop, note, shotDir?, cut?}] */
export const DUEL_EVENTS = EV.map(solveEvent);
// Sigma's shots: fired along the barrel at the moment of firing, out to the aim point (and on, for the misses)
export const DUEL_SHOTS = HERO_SHOTS.map((t) => { const m = duelMuzzle(t); const tgt = heroAimPoint(t), hit = t === BLOCK_T || t === SHIELD_HIT_T || t === THIGH_T;
  const Ln = hit ? V.dist(tgt, m.pos) : 1500; return { t, from: m.pos, dir: m.dir, to: add(m.pos, scl(m.dir, Ln)), hit, kill: false, block: t === BLOCK_T, shield: t === SHIELD_HIT_T }; })
  .concat(HERO_BURST.map((t) => { const m = duelMuzzle(t); return { t, from: m.pos, dir: m.dir, to: add(m.pos, scl(m.dir, 1500)), hit: false, kill: false }; }));
// the reactions to the hits (the shield arm knocked back; the kill is the breakup)
REACTS = DUEL_EVENTS.filter((e) => e.shotDir && !e.cut && !e.block).map((e) => {
  const hero = !!e.heroHit, st = hero ? duelHero_(e.t) : enemyRaw_(e.t), fk = duelFK(st, hero ? 'gundam' : 'enemy_ms'), part = e.part === 'shield' ? 'arm_L_lower' : e.part;
  return { who: hero ? 'hero' : 'e2', t: e.t, part, local: M.transformPoint([0, 0, 0], M.invert(M.new(), fk[part]), e.pos), dir: e.shotDir, amp: e.block ? 0.35 : 0.6 };
});
// the holes the landed shots burn: part, part-local centre, radius, depth (through the part along its local X), from when
export const HOLES = [
  (() => { const e = DUEL_EVENTS.find((x) => Math.abs(x.t - SHIELD_HIT_T - 0.03) < 1e-6), fk = duelFK(enemyRaw_(e.t), 'enemy_ms'); return { who: 'enemy', part: 'shield', t: e.t, local: M.transformPoint([0, 0, 0], M.invert(M.new(), fk.shield), e.pos), r: 1.1, depth: 3 }; })(),   // the shot that tears it off
  { who: 'enemy', part: 'leg_R_upper', t: THIGH_T + 0.03, local: THIGH_P, r: 0.85, depth: 2.4 },
  { who: 'hero', part: 'arm_L_upper', t: HERO_HIT_T + 0.04, local: PAULDRON_P, r: 0.85, depth: 1.2 },
];
_c_en.clear(); _c_duelHero.clear();
export const AUTO_CONTACTS = [], AUTO_FX = [];
export const applyImpulses = (who, t, s) => s;
// ============================================================================ camera
// Fast cuts (0.6–2.5 s). fn(t, u) returns {pos, target, fov, roll, shake, ...}.
const hp = (t) => duelHero(t).pos, ep = (t) => enemyRaw_(t).pos, e1p = ep, e2p = ep;
// un-floated positions: the calm opening cameras (scenes 32–35) follow these, so the idle float reads on screen
const hpA = (t) => duelHero(t).anchor || hp(t), e1A = (t) => enemyRaw_(t).anchor || ep(t);
const up = (p, h) => [p[0], p[1] + h, p[2]];
const evShake = (t, list, decay = 5) => { let s = 0; for (const e of DUEL_EVENTS) { if (list && !list.includes(e.type)) continue; if (t >= e.t && t < e.t + 1.2) s = Math.max(s, e.strength * Math.exp(-(t - e.t) * decay)); } return s; };
const evFlash = (t) => { let f = 0; for (const e of DUEL_EVENTS) { if (e.type === 'shake' || e.type === 'spark' || (e.shotDir && !e.cut)) continue; const d = t - e.t; if (d >= 0 && d < 0.09) f = Math.max(f, 0.35 * e.strength); } return f; };   // (no white-out on the wing hit)
const evPos = (te) => DUEL_EVENTS.find((e) => Math.abs(e.t - te) < 1e-6).pos;
// side vector of a two-shot line (perpendicular, horizontal)
const sideOf = (a, b) => { const d = nrm(sub(b, a)); return nrm([d[2], 0, -d[0]]); };
// cinematic placement helpers (frame of the line between them at time T: a toward the enemy, l to his left, h up)
const mid = (T) => lrp(hp(T), ep(T), 0.5);
const axisAt = (T) => nrm(flat(sub(ep(T), hp(T)), 0));
const at = (p, a, l, h, T) => { const d = axisAt(T), sd = [d[2], 0, -d[0]]; return [p[0] + d[0] * a + sd[0] * l, p[1] + h, p[2] + d[2] * a + sd[2] * l]; };
const pan = (fixed, subj, k) => lrp(fixed, subj, k);
let _cutW = null; const CUT_W = () => _cutW || (_cutW = DUEL_EVENTS.find((e) => e.slash).pos);   // a partial pan: the operator lets the subject drift in the frame
function two(a, b, { side = 1, dist = 1.6, lift = 4, along = 0.5, fov = 40, bias = 0.5 } = {}) {
  const mid = lrp(a, b, along), sd = sideOf(a, b), span = V.dist(a, b);
  const pos = add(add(mid, scl(sd, side * Math.max(28, span * dist))), [0, lift, 0]);
  return { pos, target: up(lrp(a, b, bias), 4), fov };
}
function ots(from, to, { right = 1, back = 16, lift = 6, fov = 42, side = 7 } = {}) {   // over-the-shoulder of `from`
  const d = nrm(sub(to, from)), sd = [d[2], 0, -d[0]];
  return { pos: add(add(from, scl(d, -back)), add(scl(sd, -right * side), [0, lift, 0])), target: up(lrp(from, to, 0.75), 3), fov };
}
export const DUEL_CAMS = [
  // ---- THE CHARGE (no standoff): out of the launch they drive straight at each other from ~700 m, jinking, firing
  // ---- THE DRAW + LOAD (Unicorn-style: short cuts, a close-up on each thing that matters)
  { t0: 170.0, t1: 170.72, name: 'D01a beside him — he rips the rifle off his back', fn: (t, u) => { const H = hp(t), f = nrm(sub(hp(t + 0.1), H)), sd = nrm(V.cross([0, 0, 0], f, [0, 1, 0]));
    return { pos: add(add(add(H, scl(sd, -15)), scl(f, 3)), [0, 6, 0]), target: add(add(H, scl(f, 1)), [0, 6, 0]), fov: 46, handheld: 0.06 }; } },
  { t0: 170.72, t1: 172.4, snap: 1.6, name: 'D01b from his side, a little back — both hands on it, it comes down onto the target', fn: (t, u) => { const T = 170.72, H = hp(t), f = nrm(sub(ep(T), hp(T))), sd = nrm(V.cross([0, 0, 0], f, [0, 1, 0]));
    return { pos: add(add(add(H, scl(sd, -(46 - 4 * u))), scl(f, 4)), [0, 8, 0]), target: add(add(H, scl(f, 4)), [0, 4, 0]), fov: 38, handheld: 0.03 }; } },   // side-on (his right), ~45 m off: the rifle's whole length across frame
  { t0: 172.4, t1: 173.2, name: 'D01d his face — the eye flares, dead still', fn: (t, u) => { const h = duelHero(t), fk = duelFK(h, 'gundam'), E = partPoint(fk, 'head', [0, 1.2, 0.8]), f = nrm(sub(ep(t), hp(t)));
    return { pos: add(add(E, scl(f, 13 - 1.2 * u)), [0, 0.5, 0]), target: E, fov: 34, handheld: 0.02 }; } },
  { t0: 173.2, t1: 173.95, name: 'D02a low behind it — it rips its rifle off its hip', fn: (t, u) => { const E = ep(t), f = nrm(sub(ep(t + 0.1), E)), sd = nrm(V.cross([0, 0, 0], f, [0, 1, 0]));
    return { pos: add(add(add(E, scl(f, -12)), scl(sd, 11)), [0, -6, 0]), target: add(add(E, scl(f, 4)), [0, 7, 0]), fov: 46, handheld: 0.06 }; } },
  { t0: 173.95, t1: 174.15, snap: 1.6, name: 'D02b CU its eye — a glint', fn: (t, u) => { const e = enemyRaw_(t), fk = duelFK(e, 'enemy_ms'), E = partPoint(fk, 'head', [0, 0.6, 1.2]), f = nrm(M.transformDir([0, 0, 0], fk.head, [0, 0, 1]));
    return { pos: add(add(E, scl(f, 9)), [0, 0.8, 0]), target: E, fov: 36, handheld: 0.02 }; } },
  { t0: 174.15, t1: 176.4, snap: 1.6, name: 'D02c on its muzzle — the charge runs down the barrel', fn: (t, u) => { const F = enemyRifleFrame(t), c = add(F.muzzle, scl(F.dir, -3));
    return { pos: add(add(add(F.muzzle, scl(F.dir, 7 - 1.5 * u)), scl(F.side, 5)), scl(F.up, 2)), target: c, fov: 44, handheld: 0.03 }; } },
  // ---- THE GUNFIGHT, shot like a film: every camera is PLACED once for its cut (from where the machines are when the
  // cut starts) and then only pans after them, or dollies slowly — it never rides along. Shot size and angle change
  // cut to cut: extreme wides, long-lens compression, low and high angles, close-ups, fly-bys past the lens.
  { t0: 176.4, t1: 177.05, name: 'D06 EWS — the line of fire', fn: (t, u) => { const T = 176.4, M = mid(T);
    return { pos: at(M, 0, 480, 60, T), target: M, fov: 24, handheld: 0.04, baseShake: 0.02 }; } },
  { t0: 177.05, t1: 177.8, snap: 1.7, roll: 0.12, name: 'D07 low angle on him', fn: (t, u) => { const T = 177.05, H = hp(T);
    return { pos: at(H, 30, -48, -26, T), target: pan(up(H, 4), up(hp(t), 4), 0.8), fov: 36, handheld: 0.1 }; } },
  { t0: 177.8, t1: 178.55, snap: 2.2, roll: -0.06, name: 'D08 long lens on it', fn: (t, u) => { const T = 177.8, E = ep(T);
    return { pos: at(E, -150, -40, 6, T), target: pan(up(E, 2), up(ep(t), 2), 0.9), fov: 12, handheld: 0.06 }; } },
  { t0: 178.55, t1: 179.25, snap: 1.8, name: 'D09 front on — the shield across its front takes his shot, the energy splashing off', slowmo: true, fn: (t, u) => { const T = 178.6, E = ep(T), f = nrm(flat(sub(hp(T), E), 0)), sd = [f[2], 0, -f[0]];
    return { pos: add(add(add(E, scl(f, 30)), scl(sd, 4)), [0, 8, 0]), target: pan(up(E, 8), up(ep(t), 8), 0.8), fov: 38, handheld: 0.03, baseShake: 0.02 }; } },
  { t0: 180.45, t1: 181.4, roll: -0.1, name: 'D11 profile — he rolls out and answers', fn: (t, u) => { const T = 180.45, H = hp(T);
    return { pos: add(at(H, 0, 38, 2, T), scl(sub(hp(t), H), 0.4)), target: up(hp(t), 3), fov: 38, handheld: 0.08 }; } },   // a slow dolly, half his speed
  { t0: 181.4, t1: 182.45, snap: 2.4, name: 'D12 long lens down the line — the zig-zag', fn: (t, u) => { const T = 181.4, H = hp(T);
    return { pos: at(H, -120, -10, 8, T), target: pan(up(ep(T), 2), up(ep(t), 2), 0.75), fov: 11, handheld: 0.05 }; } },
  { t0: 182.45, t1: 183.15, name: 'D13 high angle over the exchange', fn: (t, u) => { const T = 182.45, M = mid(T);
    return { pos: at(M, -30, 70, 230, T), target: pan(M, mid(t), 0.6), fov: 34, handheld: 0.05 }; } },
  { t0: 183.15, t1: 183.9, snap: 1.8, roll: 0.1, name: 'D14 low CU — the shield torn off', slowmo: true, fn: (t, u) => { const T = 183.2, E = ep(T);
    return { pos: at(E, -12, 16, -8, T), target: pan(up(E, 2), up(ep(t), 2), 0.7), fov: 40, handheld: 0.05 }; } },
  { t0: 183.9, t1: 184.42, name: 'D15a CU — its rifle transforms and charges', slowmo: true, fn: (t, u) => { const F = enemyRifleFrame(t), c = add(F.p, scl(F.dir, 3.5));
    return { pos: add(add(add(c, scl(F.side, 12 - 2 * u)), scl(F.up, 1.5)), scl(F.dir, 3.5 - 1 * u)), target: add(c, scl(F.dir, 0.5 * u)), fov: 44, handheld: 0.03, baseShake: 0.02 }; } },   // out beside the barrel, ahead of it
  { t0: 184.42, t1: 184.475, roll: 0.03, name: 'D15b head-on to it — it fires the charged shot straight out of frame at him', slowmo: true, fn: (t, u) => {
      const T = 184.42, e = enemyRaw_(T), fk = duelFK(e, 'enemy_ms'), C = partPoint(fk, 'torso', [0, 2.5, 0]), f = nrm(flat(sub(hp(T), ep(T)), 0)), sd = nrm(V.cross([0, 0, 0], f, [0, 1, 0]));
      return { pos: add(add(add(C, scl(f, 46 - 4 * u)), scl(sd, 11)), [0, 3, 0]), target: add(C, [0, 1, 0]), fov: 40, handheld: 0.04, baseShake: 0.03 }; } },   // in front of it, just off its line of fire
  { t0: 184.475, t1: 184.57, roll: -0.05, name: 'D15b2 back behind it, looking at him — the charged shot boring away toward him', slowmo: true, fn: (t, u) => {
      const T = 184.475, c = ots(ep(T), hp(T), { right: 1, back: 26, lift: 9, fov: 42, side: 11 });
      return { pos: c.pos, target: lrp(transHead(Math.max(t, TRANS_SHOT)), up(hp(t), 6), 0.35 + 0.3 * u), fov: 42, handheld: 0.05, baseShake: 0.03 }; } },
  { t0: 184.57, t1: 184.8, roll: 0.06, name: 'D15s on him, 3/4 front — he flings the rifle away, rips the saber off his hip, lights it and takes it up overhead in both hands', slowmo: true, fn: (t, u) => {
      const H = up(hp(t), 7), f = nrm(flat(sub(ep(184.57), hp(184.57)), 0)), sd = nrm(V.cross([0, 0, 0], f, [0, 1, 0]));
      return { pos: add(add(add(H, scl(f, 40 - 4 * u)), scl(sd, -17 + 6 * u)), [0, 1 + 4 * u, 0]), target: add(H, [0, -1.5 + 4.5 * u, 0]), fov: 44, handheld: 0.04 }; } },   // (the ball still on its way: it's behind the lens)
  { t0: 184.8, t1: 184.93, name: 'D15c behind the light-ball — it bores in at his cockpit (slow motion)', slowmo: true, fn: (t, u) => { const P = transPath(), h = transHead(t), T = nrm(sub(transHead(t + 0.01), h)), e1 = nrm(V.cross([0, 0, 0], T, [0, 1, 0]));
    return { pos: add(add(sub(h, scl(T, 26)), scl(e1, 8)), [0, 4, 0]), target: lrp(add(h, scl(T, 20)), P.p3, 0.6), fov: 46, handheld: 0.03, baseShake: 0.03 }; } },
  { t0: 184.93, t1: 185.25, roll: 0.05, name: 'D15d high above him — one big swing right to left, the full-power blade smashes the light-ball apart', slowmo: true, fn: (t, u) => { const P = transPath(), sd = nrm(V.cross([0, 0, 0], P.dirIn, [0, 1, 0]));
    return { pos: add(add(add(up(hp(t), 8), scl(P.dirIn, 16)), scl(sd, 4)), [0, 44, 0]), target: add(up(hp(t), 6), scl(P.dirIn, -10)), fov: 56, handheld: 0.03, baseShake: 0.04 }; } },   // high above and behind him looking down: the flat swing reads as one big arc across the frame, right to left
  { t0: 185.2, t1: CATCH_T - 0.12, roll: 0.2, name: 'D16 fly-by — he tears past the lens', fn: (t, u) => { const P = hp(185.85), o = nrm(flat(sub(P, MID), 0));
    return { pos: add(add(P, scl(o, 13)), [0, 4, 0]), target: up(hp(t), 2), fov: 50, handheld: 0.08 }; } },
  { t0: CATCH_T - 0.12, t1: CATCH_T + 0.05, roll: 0.08, name: 'D16c beside him, full figure — he flies through and snatches the rifle out of the air as it comes back in (bullet time)', slowmo: true, fn: (t, u) => {
      const h = duelHero(t), fk = duelFK(h, 'gundam'), Hd = partPoint(fk, 'hand_R'),   // (riding with his hand)
           T = r3(fk.torso), fw = nrm(r3v(T, [0, 0, 1])), rt = scl(nrm(r3v(T, [1, 0, 0])), -1), upv = nrm(r3v(T, [0, 1, 0]));
      const B = up(h.pos, 7);
      return { pos: add(add(add(B, scl(fw, 14)), scl(rt, 44 - 4 * u)), scl(upv, 4)), target: add(lrp(B, Hd, 0.4), scl(rt, 4 * (1 - u))), fov: 44, handheld: 0.04 }; } },   // out to his right, his whole body in frame: he flies on through and snatches the rifle as it comes back in
  { t0: CATCH_T + 0.05, t1: 186.4, roll: 0.2, name: 'D16 fly-by — he tears past the lens (rifle back in hand)', fn: (t, u) => { const P = hp(185.85), o = nrm(flat(sub(P, MID), 0));
    return { pos: add(add(P, scl(o, 13)), [0, 4, 0]), target: up(hp(t), 2), fov: 50, handheld: 0.08 }; } },
  { t0: 186.4, t1: 187.45, roll: -0.16, name: 'D17 fly-by — it quick-boosts aside', fn: (t, u) => { const P = ep(186.95), o = nrm(flat(sub(P, MID), 0));
    return { pos: add(add(P, scl(o, 17)), [0, -3, 0]), target: up(ep(t), 2), fov: 48, handheld: 0.08 }; } },
  { t0: 187.45, t1: 188.4, name: 'D18 over his shoulder, locked off', fn: (t, u) => { const T = 187.45, c0 = ots(hp(T), ep(T), { right: -1, back: 34, lift: 8, fov: 30, side: 16 });
    return { pos: c0.pos, target: pan(lrp(hp(T), ep(T), 0.7), lrp(hp(t), ep(t), 0.7), 0.6), fov: 30, handheld: 0.06 }; } },
  { t0: 188.4, t1: 189.6, name: 'D19 EWS — it breaks away', fn: (t, u) => { const T = 188.4, M = mid(T);
    return { pos: at(M, -60, -400, -70, T), target: pan(M, mid(t), 0.5), fov: 36, handheld: 0.04 }; } },
  { t0: 189.6, t1: 190.7, snap: 1.6, roll: 0.06, name: 'D20 CU on it — it gathers itself in, its back ports brightening', fn: (t, u) => { const e = enemyRaw_(t), fk = duelFK(e, 'enemy_ms'), C = partPoint(fk, 'torso', [0, 3, 0]), f = nrm(flat(sub(hp(189.6), ep(189.6)), 0)), sd = nrm(V.cross([0, 0, 0], f, [0, 1, 0]));
    return { pos: add(add(add(C, scl(f, -10 + 2 * u)), scl(sd, 14 - 3 * u)), [0, 6 - u, 0]), target: add(C, [0, 1, 0]), fov: 40, handheld: 0.03, baseShake: 0.03 }; } },   // close, 3/4 from behind and above: its head and the ports on its back
  // THE ITANO CIRCUS — ONE TAKE on a long lens from far off: it opens on the launch, whips onto him and zooms right in,
  // then rides him the whole run (the operator a beat behind), the missiles bursting along the line he's just left
  { t0: 190.7, t1: circusStory(CIRCUS_B1), name: 'D21 the Itano circus, one take — long lens from far off, tracking him through the swarm', slowmo: true, fn: (t, u) => {
      const c = circusClock(t), H0 = hp(190.9), E0 = ep(190.9), f = nrm(flat(sub(E0, H0), 0)), sd = nrm(V.cross([0, 0, 0], f, [0, 1, 0]));
      const H = up(hp(t), 8), Hl = up(hp(circusStory(Math.max(0, c - 0.35))), 8);   // (the operator a good third of a second behind him)
      const Hc = up(hp(circusStory(Math.max(0, c - 0.6))), 8), pos = add(add(H0, chaseAxes().camOff), scl(sub(Hc, H0), 0.55));   // the camera itself dragged along after him, well behind   // high up on its side of him, looking back down at him: it (and the stream of missiles leaving it) stays out of the long lens; only the ones closing on him come in
      const vRun = nrm(add(sub(H, Hl), [1e-4, 0, 0])), onHim = smooth(1.0, 2.2, c), tgt = lrp(up(E0, 6), lrp(Hl, H, 0.25), onHim);   // barely keeping up with him: he pulls toward the edge of frame   // (leading him: room ahead on the left)
      const fov = lerp(38, 16, smooth(1.4, 2.6, c)) + 1.5 * Math.sin(c * 0.9) * smooth(2, 3, c);   // pulled well back
      return { pos, target: tgt, fov, handheld: 0.12, baseShake: 0.04 }; } },   // (a rougher hand: the operator straining after him)
  // … and the back half cut up: on his tail, then head-on as he comes at the lens with it all behind him, then wide
  { t0: circusStory(CIRCUS_B1), t1: circusStory(CIRCUS_B2), roll: 0.1, name: 'D21b on his tail — the swarm closing, bursts right behind him', slowmo: true, fn: (t, u) => {
      const c = circusClock(t), H = up(hp(t), 8), Hl = up(hp(circusStory(c - 0.25)), 8), v = nrm(add(sub(H, Hl), [1e-4, 0, 0])), sd = nrm(V.cross([0, 0, 0], v, [0, 1, 0]));
      return { pos: add(add(add(Hl, scl(v, -95)), scl(sd, 30)), [0, 34, 0]), target: add(H, scl(v, 40)), fov: 46, handheld: 0.12, baseShake: 0.06 }; } },
  { t0: circusStory(CIRCUS_B2), t1: circusStory(CIRCUS_B3), roll: -0.12, name: 'D21c head-on, low — he comes at the lens with the whole swarm behind him', slowmo: true, fn: (t, u) => {
      const c = circusClock(t), H = up(hp(t), 8), T0 = circusStory(CIRCUS_B2), T1 = circusStory(CIRCUS_B3), P0 = hp(T0), P1 = hp(T1), v = nrm(sub(P1, P0)), sd = nrm(V.cross([0, 0, 0], v, [0, 1, 0]));
      const base = add(add(add(P1, scl(v, 90)), scl(sd, 30 - 20 * u)), [0, -25, 0]);   // parked ahead of where he's going, sliding a little
      return { pos: base, target: add(H, scl(v, -30 * (1 - u))), fov: 40 - 8 * u, handheld: 0.1, baseShake: 0.05 }; } },
  { t0: circusStory(CIRCUS_B3), t1: CIRCUS_C1, roll: 0.06, name: 'D21d wide from the side — he slips the last salvo clean, it all goes up behind him', slowmo: true, fn: (t, u) => {
      const c = circusClock(t), H = up(hp(t), 8), Hl = up(hp(circusStory(c - 0.4)), 8), T0 = circusStory(CIRCUS_B3), P0 = hp(T0), v = nrm(sub(hp(CIRCUS_C1), P0)), sd = nrm(V.cross([0, 0, 0], v, [0, 1, 0]));
      return { pos: add(add(P0, scl(sd, -340)), [0, 60, 0]), target: lrp(Hl, H, 0.3), fov: 26, handheld: 0.08, baseShake: 0.03 }; } },
  { t0: CIRCUS_C1, t1: 191.95, name: 'D22 Sandevistan', slowmo: true, sande: true, fn: (t, u) => { const Pm = lrp(D_S0, E_CUT, 0.5);
    return { pos: add(add(Pm, scl(D_L, -150)), [0, 12, 0]), target: pan(Pm, up(hp(t), 2), 0.85), fov: 44, handheld: 0.03, baseShake: 0.02 }; } },
  // the approach to the cut, from high over its shoulder, looking down across the line of the pass
  { t0: 191.95, t1: 192.015, name: 'D23a into the cut', slowmo: true, sande: true, fn: (t, u) => { const c = add(E_CUT, [0, 2, 0]);
    return { pos: add(add(E_CUT, scl(D_U, 6)), add(scl(D_L, 10), [0, 46, 0])), target: add(add(c, scl(D_L, -5)), scl(D_U, 3)), fov: 46, handheld: 0.03, baseShake: 0.02 }; } },
  // THE CUT in extreme bullet time: tight on its waist from the far side, the blade coming through toward the lens, the
  // armour parting along the slit, molten spray and cut plates flung off — the camera drifts along with the cut front
  { t0: 192.015, t1: 192.1, name: 'D23b the cut, close', slowmo: true, sande: true, fn: (t, u) => { const W = CUT_W();
    return { pos: add(add(W, scl(D_L, 2 - 1.5 * u)), add(scl(D_U, -12 + 1.5 * u), [0, 1.2 - 0.4 * u, 0])), target: add(W, [0, 0.4, 0]), fov: 36, handheld: 0.02, baseShake: 0 }; } },   // square on to its chest: the seam melts open across it
  { t0: 192.1, t1: 192.55, name: 'D23c it comes apart', slowmo: true, sande: true, fn: (t, u) => { const W = CUT_W();
    return { pos: add(add(W, scl(D_L, 26)), add(scl(D_U, -10), [0, 6, 0])), target: add(W, [0, 1, 0]), fov: 40, handheld: 0.03 }; } },
  // ahead of where he comes out of it: he glides toward the lens, the halves drifting apart behind him, then the reactor
  { t0: 192.55, t1: 194.6, name: 'D24 it comes apart behind him', slowmo: true, fn: (t, u) => {
    return { pos: DP(46, -34, 6), target: add(pan(E_CUT, lrp(hp(t), ep(Math.min(t, 194)), 0.55), 0.6), [0, 9, 0]), fov: 44, handheld: 0.03 }; } },   // (both halves' blasts in frame)
  { t0: 194.6, t1: 197.2, name: 'D25 aftermath', fn: (t, u) => { const h = hp(t); return { pos: add(h, [-16 - u * 12, 6 + u * 3, -30 - u * 10]), target: up(h, 6), fov: 40, handheld: 0.3 }; } },
  { t0: 197.2, t1: 200.0, name: 'D26 aftermath wide', fn: (t, u) => { const h = hp(t); return { pos: add(h, [-40 - u * 10, 12 + u * 4, -48 - u * 8]), target: up(h, 6), fov: 38, handheld: 0.3 }; } },
];
export function duelCamera(t) {
  const c = DUEL_CAMS.find((s) => t >= s.t0 && t < s.t1);
  if (!c) return null;
  const u = sat((t - c.t0) / (c.t1 - c.t0));
  const k = c.fn(t, u);
  // Unicorn-style snap zoom: the cut opens wide and punches in on its subject in ~0.18 s
  if (c.snap) k.fov = lerp(k.fov * c.snap, k.fov, easeOut(sat((t - c.t0) / 0.18)));
  if (c.roll) k.roll = (k.roll ?? 0) + c.roll;                     // dutch angle on the action cuts
  const shake = (k.baseShake ?? 0.12) + evShake(t, null, 4.5) * 1.1;   // baseShake 0: a locked-off camera
  const focus = k.target;
  return {
    name: c.name, pos: k.pos, target: k.target, fov: k.fov ?? 40, roll: k.roll ?? 0,
    shake, shakeFreq: 9, handheld: k.handheld ?? 0.25, flash: evFlash(t), blur: 0.0015 * evShake(t, ['hit'], 8),
    slowmo: !!c.slowmo, sande: !!c.sande, focus, shadowRadius: 70,
  };
}

STATE_CACHE = true;   // all states are now fixed functions of t (memoised per t)
