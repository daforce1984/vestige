// Mech-vs-mech duel choreography for film time 160–200 s (keyframed, seek-safe, pure functions of t).
//
// Reference studied for timing / rhythm / camera only (no designs copied):
//   * PRIMARY: Secret Level — Armored Core "Locked In" (Prime Video)  https://www.youtube.com/watch?v=TiQCkRQwEqk
//   * Mobile Suit Gundam 00 — Masurao vs Susanowo sword duel          https://www.youtube.com/watch?v=-EAfZeIDL9Y
//   * Pacific Rim (2013) — Gipsy Danger vs Otachi, sword finish        https://www.youtube.com/watch?v=AYQjmj7cSM0
//   Beat sheet + numbers: blender/DUEL_NOTES.md.  Previews: blender/duel_dump.mjs → blender/duel_preview.py.
//   Contacts are exact: a small solver (see SOLVE) refines the key poses at every clash/hit so blades really cross.
//
// ─────────────────────────────────────────────── HOOK-IN (js/shots.js) ───────────────────────────────────────────────
//   import { duelHero, duelEnemy1, duelEnemy2, duelCamera, DUEL_EVENTS } from './duel.js';
//
//   gundamState(t):   first line after the vis check →   { const d = duelHero(t); if (d) return d; }
//                     (replaces the t<170 / t<180 / t<186 / t<190 / t<194 / t<226(→200) branches; t≥200 keeps the old code,
//                      duelHero(200-) hands over continuously to the old 194–226 'aftermath' formula)
//   enemyMS1(t):      first line →  { const d = duelEnemy1(t); if (d) return d; }
//   enemyMS2(t):      first line →  { const d = duelEnemy2(t); if (d) return d; }
//   shots 170–200:    delete S12a…S12f and add one shot:
//     shot(170, 200, 'S12 DUEL', (c) => {
//       const k = duelCamera(c.t);
//       camLook(c, k.pos, k.target, k.fov, k.roll);
//       shake(c, k.shake, k.shakeFreq); handheld(c, k.handheld);
//       c.env.shadowCenter = k.focus; c.env.shadowRadius = k.shadowRadius;
//       c.post.flash = Math.max(c.post.flash, k.flash); c.post.shakeBlur = k.blur;
//       if (k.slowmo) { c.post.saturation = 0.75; c.post.streak = 0.45; c.post.gradeHighlights = [1.2, 1.0, 0.85]; }
//     });
//     (findShot can also use DUEL_CAMS for the per-cut names.)
//   drawMSBattle: E1 now closes to melee (saber on 176.9–180.2) — drawEnemyMS already draws s.saber>0;
//     the old fixed "saber clash sparks at CP+[0,12,0]" (186–190.5) → drive sparks/flash/shake from DUEL_EVENTS
//     (each has an exact world contact point `p`, `hitstop`, `strength`); the 192.4 cut beam → DUEL_EVENTS 'hit' with `cut:[a,b]`.
//   State extras: vel (m/s world), speed, smear (0..1 for motion-blur / thruster streaks), boost (0..1 thruster burst).
//   RIFLE: fire each bolt from the muzzle —  for (const s of DUEL_SHOTS) { … rifleShot(R, t, s.t, s.from, s.to, s.hit) }
//     DUEL_SHOTS[i] = { t, from (muzzle world pos at t), dir (barrel unit vector), to (aim point on E1), hit, aimError }
//     duelMuzzle(t) → { pos, dir } of `rifle_muzzle` at any t (FK with the gundam.glb rifle/rifle_muzzle offsets).
//   Motion: C1 Hermite keys + spring follow-through (torso→upper arm→forearm→hand 0/1/2/3-frame lag, 2–3 settle
//     wobbles), arc'd dash paths, auto crouch before dashes, continuous hover micro-motion; filters bypass impacts.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { M, V, Q, sat, clamp, lerp, easeIn, easeOut, easeInOut, noise1, smooth, DEG } from './math.js';
import { GC, POSES, blendPose, breathe, gundamLaunchPath } from './world.js';

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
  'leg_L_upper', 'leg_L_lower', 'foot_L', 'leg_R_upper', 'leg_R_lower', 'foot_R', '_body'];
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

// ============================================================================ pose library (hero = left-hand saber)
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
  // mace dangling head-down from a loose left fist (wrist left un-clamped while idle — FK-solved so the haft hangs down)
  pelvis: [0, -4, 0], torso: [6, -2, 0], head: [2, 4, 0],
  arm_L_upper: [6, 0, 26], arm_L_lower: [-16, 0, 0], hand_L: [86, 0, 0],
  arm_R_upper: [4, -6, -26], arm_R_lower: [-18, 0, 0], hand_R: [6, 0, 0],
  leg_L_upper: [-12, 0, 8], leg_L_lower: [18, 0, 0], foot_L: [8, 0, 0],
  leg_R_upper: [4, 0, -8], leg_R_lower: [20, 0, 0], foot_R: [12, 0, 0], _body: [2, 0, 0],
});
L.ignite = W(L.guard, { arm_L_upper: [-70, -30, 0], arm_L_lower: [-60, 0, 0], hand_L: [60, 0, 0], head: [-15, 5, 0] });
L.highBlock = W(L.guard, { torso: [-5, -5, 0], head: [-30, 0, 0], arm_L_upper: [-150, -35, -10], arm_L_lower: [-45, 0, 0], hand_L: [40, 80, 0], arm_R_upper: [-140, 20, 10], arm_R_lower: [-50, 0, 0], leg_L_upper: [-50, 0, 10], leg_L_lower: [75, 0, 0], leg_R_upper: [0, 0, -8], leg_R_lower: [85, 0, 0], _body: [-10, 0, 0] });
L.highBlockHit = W(L.highBlock, { torso: [5, -5, 0], arm_L_upper: [-140, -35, -10], arm_L_lower: [-65, 0, 0], leg_L_upper: [-65, 0, 10], leg_L_lower: [100, 0, 0], leg_R_upper: [-15, 0, -8], leg_R_lower: [110, 0, 0] });
L.raise = P({
  pelvis: [0, 10, 0], torso: [-8, 25, 0], head: [5, -18, 0],
  arm_L_upper: [-160, 10, 20], arm_L_lower: [-35, 0, 0], hand_L: [20, 0, 0],
  arm_R_upper: [-35, 0, -35], arm_R_lower: [-60, 0, 0],
  leg_L_upper: [-50, 0, 10], leg_L_lower: [70, 0, 0], foot_L: [25, 0, 0],
  leg_R_upper: [25, 0, -8], leg_R_lower: [50, 0, 0], foot_R: [30, 0, 0], _body: [-8, 0, 0],
});
L.cutMid = P({   // diagonal down-cut at contact (blade up-forward)
  pelvis: [0, -10, 0], torso: [15, -10, 4], head: [10, 5, 0],
  arm_L_upper: [-120, -18, 10], arm_L_lower: [-15, 0, 0], hand_L: [70, 0, 0],
  arm_R_upper: [-20, 0, -40], arm_R_lower: [-60, 0, 0],
  leg_L_upper: [-40, 0, 10], leg_L_lower: [50, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [30, 0, -8], leg_R_lower: [60, 0, 0], foot_R: [35, 0, 0], _body: [6, 0, 0],
});
L.cutDown = P({  // follow-through low across to the right
  pelvis: [0, -25, 0], torso: [30, -32, 8], head: [15, 18, 0],
  arm_L_upper: [-55, -40, -10], arm_L_lower: [-10, 0, 0], hand_L: [85, 0, 0],
  arm_R_upper: [-10, 0, -45], arm_R_lower: [-60, 0, 0],
  leg_L_upper: [-25, 0, 10], leg_L_lower: [40, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [35, 0, -10], leg_R_lower: [70, 0, 0], foot_R: [35, 0, 0], _body: [12, 0, 0],
});
L.backMid = P({  // backhand horizontal at contact: arm straight forward, blade continuing the arm
  pelvis: [0, 5, 0], torso: [10, 5, 0], head: [5, -5, 0],
  arm_L_upper: [-88, -5, 0], arm_L_lower: [-5, 0, 0], hand_L: [90, 0, 0],
  arm_R_upper: [-25, 0, -30], arm_R_lower: [-70, 0, 0],
  leg_L_upper: [-35, 0, 12], leg_L_lower: [45, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [25, 0, -8], leg_R_lower: [60, 0, 0], foot_R: [35, 0, 0],
});
L.backEnd = W(L.backMid, { torso: [8, 30, 0], pelvis: [0, 20, 0], arm_L_upper: [-85, 65, 10], head: [5, -20, 0] });
L.thrustWind = P({
  pelvis: [0, 15, 0], torso: [5, 28, 0], head: [5, -25, 0],
  arm_L_upper: [-25, 5, 22], arm_L_lower: [-70, 0, 0], hand_L: [95, 0, 0],
  arm_R_upper: [-50, 0, -25], arm_R_lower: [-70, 0, 0],
  leg_L_upper: [-45, 0, 10], leg_L_lower: [75, 0, 0], foot_L: [25, 0, 0],
  leg_R_upper: [15, 0, -8], leg_R_lower: [80, 0, 0], foot_R: [35, 0, 0], _body: [-6, 0, 0],
});
L.thrust = P({
  pelvis: [0, -20, 0], torso: [15, -28, 0], head: [10, 22, 0],
  arm_L_upper: [-88, -10, 0], arm_L_lower: [-2, 0, 0], hand_L: [90, 0, 0],
  arm_R_upper: [-10, 0, -40], arm_R_lower: [-40, 0, 0],
  leg_L_upper: [-50, 0, 8], leg_L_lower: [30, 0, 0], foot_L: [10, 0, 0],
  leg_R_upper: [40, 0, -8], leg_R_lower: [15, 0, 0], foot_R: [40, 0, 0], _body: [16, 0, 0],
});
L.duck = W(L.guard, { torso: [40, -10, 0], head: [20, 10, 0], arm_L_upper: [-40, -20, 20], arm_L_lower: [-30, 0, 0], hand_L: [60, 0, 0], leg_L_upper: [-95, 0, 10], leg_L_lower: [120, 0, 0], leg_R_upper: [-60, 0, -10], leg_R_lower: [130, 0, 0], _body: [20, 0, 0] });
L.chargeWind = W(L.guard, { torso: [30, 30, 0], head: [10, -25, 0], arm_L_upper: [-10, 20, 30], arm_L_lower: [-40, 0, 0], hand_L: [120, 0, 0], arm_R_upper: [-30, 30, -20], arm_R_lower: [-110, 0, 0], leg_L_upper: [-70, 0, 10], leg_L_lower: [100, 0, 0], leg_R_upper: [-20, 0, -10], leg_R_lower: [110, 0, 0], _body: [15, 30, 0] });
L.charge = W(L.chargeWind, { torso: [25, 40, 0], head: [5, -35, 0], arm_R_upper: [-20, 40, -10], arm_R_lower: [-120, 0, 0], leg_L_upper: [-30, 0, 10], leg_L_lower: [40, 0, 0], leg_R_upper: [30, 0, -10], leg_R_lower: [30, 0, 0], foot_R: [50, 0, 0], _body: [20, 55, 0] });
L.lock = P({
  pelvis: [0, -10, 0], torso: [22, -8, 0], head: [12, 5, 0],
  arm_L_upper: [-105, -25, 5], arm_L_lower: [-35, 0, 0], hand_L: [75, 0, 0],
  arm_R_upper: [-80, 30, -5], arm_R_lower: [-45, 0, 0],
  leg_L_upper: [-35, 0, 10], leg_L_lower: [40, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [40, 0, -10], leg_R_lower: [35, 0, 0], foot_R: [45, 0, 0], _body: [12, 0, 0],
});
L.lock2 = W(L.lock, { torso: [26, -2, 3], arm_L_upper: [-100, -20, 5], arm_L_lower: [-42, 0, 0], leg_R_upper: [45, 0, -10], _body: [15, 0, 0] });
L.hitBack = W(L.guard, { torso: [35, 0, 0], head: [30, 0, 0], arm_L_upper: [-35, 45, 75], arm_L_lower: [-30, 0, 0], hand_L: [-45, 0, 0], arm_R_upper: [-40, 0, -40], arm_R_lower: [-40, 0, 0], leg_L_upper: [-60, 0, 10], leg_L_lower: [70, 0, 0], leg_R_upper: [-50, 0, -10], leg_R_lower: [80, 0, 0], _body: [-25, 0, 0] });
L.recover = W(L.guard, { torso: [25, -10, 0], head: [-5, 10, 0], leg_L_upper: [-50, 0, 10], leg_L_lower: [80, 0, 0], leg_R_upper: [10, 0, -10], leg_R_lower: [90, 0, 0] });
L.parry = W(L.cutDown, { torso: [20, -30, 5], arm_L_upper: [-80, -45, 0], arm_L_lower: [-10, 0, 0], hand_L: [60, 0, 0], _body: [5, -10, 0] });
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
L.finish = W(L.iaiEnd, { torso: [8, 30, 0], arm_L_upper: [-22, 45, 18], arm_L_lower: [-42, 0, 0], hand_L: [15, 0, 0], _body: [0, 0, 0] });   // mace lowered, arm relaxed
// defender poses (hero-side authoring; RONIN uses mirror())
L.sideBlock = P({   // blade vertical-ish on own weapon side, catching a cut from the upper weapon side
  pelvis: [0, -10, 0], torso: [10, -15, 0], head: [-5, 10, 0],
  arm_L_upper: [-100, 25, 20], arm_L_lower: [-55, 0, 0], hand_L: [10, 0, 0],
  arm_R_upper: [-30, 0, -25], arm_R_lower: [-80, 0, 0],
  leg_L_upper: [-30, 0, 10], leg_L_lower: [50, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [25, 0, -8], leg_R_lower: [70, 0, 0], foot_R: [35, 0, 0], _body: [-5, 0, 0],
});
L.crossBlock = W(L.sideBlock, { arm_L_upper: [-80, -45, 0], arm_L_lower: [-60, 0, 0], hand_L: [10, 0, 0], torso: [12, -25, 0] });
L.dodge = W(L.guard, { torso: [5, 25, -20], head: [0, -20, 10], arm_L_upper: [-40, 30, 40], arm_L_lower: [-50, 0, 0], arm_R_upper: [-30, 0, -50], leg_L_upper: [-10, 0, 30], leg_L_lower: [60, 0, 0], leg_R_upper: [-40, 0, -5], leg_R_lower: [70, 0, 0], _body: [0, 20, 25] });
L.foreWind = P({   // horizontal forehand wind-up: arm out to own weapon side and back
  pelvis: [0, 25, 0], torso: [5, 40, 0], head: [5, -35, 0],
  arm_L_upper: [-80, 100, 5], arm_L_lower: [-30, 0, 0], hand_L: [70, 0, 0],
  arm_R_upper: [-40, 0, -30], arm_R_lower: [-70, 0, 0],
  leg_L_upper: [-40, 0, 10], leg_L_lower: [60, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [20, 0, -8], leg_R_lower: [70, 0, 0], foot_R: [35, 0, 0], _body: [0, 0, 0],
});
L.foreMid = W(L.backMid, { torso: [12, -8, 0], pelvis: [0, -8, 0] });
L.foreEnd = W(L.backMid, { pelvis: [0, -30, 0], torso: [20, -40, 5], head: [5, 30, 0], arm_L_upper: [-80, -75, -5], _body: [8, 0, 0] });
L.overMid = W(L.cutMid, { arm_L_upper: [-125, 0, 10], torso: [18, 0, 0] });
L.hitTorso = W(L.guard, { torso: [-30, 15, 0], head: [-25, 10, 0], arm_L_upper: [-60, 20, 60], arm_L_lower: [-30, 0, 0], arm_R_upper: [-50, 0, -60], arm_R_lower: [-30, 0, 0], leg_L_upper: [-60, 0, 15], leg_L_lower: [50, 0, 0], leg_R_upper: [-40, 0, -15], leg_R_lower: [60, 0, 0], _body: [-25, 0, 10] });
L.doubled = W(L.hitTorso, { torso: [45, 0, 0], head: [35, 0, 0], arm_L_upper: [-30, 0, 20], arm_L_lower: [-70, 0, 0], arm_R_upper: [-30, 0, -20], arm_R_lower: [-70, 0, 0], leg_L_upper: [-80, 0, 10], leg_L_lower: [110, 0, 0], leg_R_upper: [-70, 0, -10], leg_R_lower: [110, 0, 0], _body: [25, 0, 0] });
L.tumble = W(L.hitTorso, { torso: [-35, 20, 15], head: [-30, 10, 0], _body: [-40, 10, 20] });
L.limp = W(PR(POSES.limp), {});
L.hitCut = W(L.limp, { torso: [-20, 25, 20], head: [-30, 20, 0], arm_L_upper: [-70, 30, 50], _body: [-10, 15, 15] });
L.plunge = W(L.cutDown, { arm_L_upper: [-95, -20, 0], arm_L_lower: [-20, 0, 0], hand_L: [70, 0, 0], torso: [25, -15, 0], _body: [10, 0, 0] });
L.dive = W(L.flight, { arm_L_upper: [-170, 10, 20], arm_L_lower: [-30, 0, 0], hand_L: [30, 0, 0], _body: [55, 0, 0] });
// SHAFT BLOCK (scene 48): the mace held two-handed flat over the head like a quarterstaff — the arms are placed by IK
// (staffHold); these carry the legs / chest: braced wide, knees giving under the blow, then driving up to throw it off
L.staffBlock = W(L.guard, { pelvis: [0, -5, 0], torso: [-4, 0, 0], head: [-28, 0, 0], leg_L_upper: [-45, 0, 14], leg_L_lower: [70, 0, 0], foot_L: [20, 0, 0], leg_R_upper: [8, 0, -14], leg_R_lower: [75, 0, 0], foot_R: [30, 0, 0], _body: [-6, 0, 0] });
L.staffHit = W(L.staffBlock, { torso: [8, 0, 0], head: [-18, 0, 0], leg_L_upper: [-64, 0, 14], leg_L_lower: [108, 0, 0], leg_R_upper: [-14, 0, -14], leg_R_lower: [118, 0, 0], foot_R: [40, 0, 0], _body: [2, 0, 0] });
L.staffPush = W(L.staffBlock, { torso: [-12, 0, 0], head: [-32, 0, 0], leg_L_upper: [-28, 0, 12], leg_L_lower: [36, 0, 0], leg_R_upper: [16, 0, -12], leg_R_lower: [42, 0, 0], _body: [-10, 0, 0] });
// RONIN #2 over the top (authored in the hero convention, mirrored below): the overhead cut that meets the shaft, thrown
// up off it, a tight backward somersault (knees to chest, free hand on the shins, katana tucked along the body), opening
// out, and a heavy landing — knees deep, katana low in both hands — before it comes again
L.overCut = W(L.overMid, { torso: [22, 0, 0], head: [6, 0, 0], leg_L_upper: [-55, 0, 10], leg_L_lower: [85, 0, 0], leg_R_upper: [-5, 0, -10], leg_R_lower: [95, 0, 0], foot_L: [25, 0, 0], foot_R: [35, 0, 0], _body: [-10, 0, 0] });
L.recoil = W(L.raise, { torso: [-25, 0, 0], head: [-20, 0, 0], arm_L_upper: [-170, 0, 20], arm_L_lower: [-20, 0, 0], leg_L_upper: [-20, 0, 10], leg_L_lower: [40, 0, 0], leg_R_upper: [10, 0, -10], leg_R_lower: [50, 0, 0], _body: [-25, 0, 0] });
L.tuck = P({ torso: [45, 0, 0], head: [25, 0, 0], arm_L_upper: [-40, 0, 25], arm_L_lower: [-95, 0, 0], hand_L: [20, 0, 0], arm_R_upper: [-75, 0, -15], arm_R_lower: [-80, 0, 0],
  leg_L_upper: [-125, 0, 12], leg_L_lower: [145, 0, 0], foot_L: [35, 0, 0], leg_R_upper: [-120, 0, -12], leg_R_lower: [145, 0, 0], foot_R: [35, 0, 0] });
L.untuck = P({ torso: [15, 0, 0], head: [-5, 0, 0], arm_L_upper: [-50, 0, 40], arm_L_lower: [-40, 0, 0], hand_L: [20, 0, 0], arm_R_upper: [-40, 0, -45], arm_R_lower: [-30, 0, 0],
  leg_L_upper: [-50, 0, 12], leg_L_lower: [70, 0, 0], foot_L: [20, 0, 0], leg_R_upper: [-10, 0, -12], leg_R_lower: [60, 0, 0], foot_R: [30, 0, 0] });
L.land = P({ pelvis: [0, -10, 0], torso: [30, -5, 0], head: [-10, 5, 0], arm_L_upper: [-40, -10, 20], arm_L_lower: [-60, 0, 0], hand_L: [20, 0, 0], arm_R_upper: [-30, 20, -20], arm_R_lower: [-70, 0, 0],
  leg_L_upper: [-80, 0, 12], leg_L_lower: [120, 0, 0], foot_L: [30, 0, 0], leg_R_upper: [-20, 0, -12], leg_R_lower: [125, 0, 0], foot_R: [40, 0, 0], _body: [10, 0, 0] });

// RONIN (right-hand katana) = mirrored library
const R = {};
for (const k in L) R[k] = mirror(L[k]);
R.aim = W(mirror(L.aim), {});           // aims the left-arm gun
// the approach (no gunfire any more): a swordsman closing in on boosters — body upright and leaning into the flight,
// katana held low and back in the sword hand, the free arm forward for balance, legs split front/back
// (authored in the hero's convention, then mirrored; the old pose lay flat like a flying superhero with a levelled gun arm)
const _approach = P({
  pelvis: [4, 8, 0], torso: [16, 12, 0], head: [-14, -10, 0],
  arm_L_upper: [22, 8, 28], arm_L_lower: [-32, 0, 0], hand_L: [55, 0, 0],
  arm_R_upper: [-50, 12, -18], arm_R_lower: [-78, 0, 0], hand_R: [10, 0, 0],
  leg_L_upper: [-34, 0, 8], leg_L_lower: [52, 0, 0], foot_L: [20, 0, 0],
  leg_R_upper: [22, 0, -8], leg_R_lower: [68, 0, 0], foot_R: [34, 0, 0], _body: [14, 0, 0],
});
R.assault = mirror(_approach);
R.assaultB = mirror(W(_approach, { torso: [20, 20, 3], head: [-16, -18, 0], arm_R_upper: [-58, 22, -22], leg_L_upper: [-24, 0, 8], leg_L_lower: [40, 0, 0], leg_R_upper: [28, 0, -8], leg_R_lower: [78, 0, 0], _body: [18, 6, 4] }));
// ready to charge (scenes 32–35): katana in BOTH hands in front of the belly, point up at Sigma (FK-solved: blade ~30°
// over the horizontal on the centre line), leaning in, sword-side leg forward and bent, the other trailing — coiled
R.ready = W(mirror(P({
  pelvis: [4, -10, 0], torso: [18, -6, 0], head: [-14, 6, 0],
  arm_R_upper: [-40, 10, -15], arm_R_lower: [-70, 0, 0],
  leg_L_upper: [-42, 0, 8], leg_L_lower: [64, 0, 0], foot_L: [18, 0, 0],
  leg_R_upper: [26, 0, -8], leg_R_lower: [40, 0, 0], foot_R: [40, 0, 0], _body: [12, 0, 0],
})), { arm_R_upper: [-20, 4, 38], arm_R_lower: [-27, 0, 0], hand_R: [16, 0, 0] });
// TAUNT (RONIN #1's entrance): katana swung up to rest on its shoulder, the free hand held out to Sigma palm-up,
// beckoning — chest back, head cocked. (hero convention: weapon arm = L, free arm = R; mirrored for RONIN)
R.taunt = mirror(P({
  pelvis: [0, 12, 0], torso: [-8, 16, 0], head: [-10, -12, 14],
  arm_L_upper: [-62, -24, 58], arm_L_lower: [-128, 0, 0], hand_L: [38, 0, 0],
  arm_R_upper: [-72, 12, -12], arm_R_lower: [-16, 0, 0], hand_R: [-25, 0, 0],
  leg_L_upper: [-16, 0, 8], leg_L_lower: [22, 0, 0], foot_L: [12, 0, 0],
  leg_R_upper: [12, 0, -6], leg_R_lower: [36, 0, 0], foot_R: [24, 0, 0], _body: [-5, 0, 0],
}));
export const POSE_LIB = { hero: L, ronin: R };
// The hero swings a mace, not a sword: a club is held in a fist grip (haft roughly ⟂ forearm), so the wrist flex that
// let the saber "continue the forearm" (+90°) is compressed into a natural cocked wrist (soft knee at 20°, 90° → ~41°).
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
  // [t, freeze, release]   (24 fps: 0.083 = 2 fr, 0.125 = 3 fr, 0.167 = 4 fr)
  // heavy machines don't freeze on contact, they SHOULDER through it: a 1-frame bite, then a long eased release
  // (the old 2–4 frame freezes on every contact read as stutter at 24 fps)
  // every blow is also in bullet time (timemap.js, 0.2×), so the bites here are short in story time
  [178.0, 0.012, 0.15], [178.2, 0.012, 0.3], [178.55, 0.012, 0.3],
  [184.5, 0.025, 0.4], [186.0, 0.012, 0.3], [186.45, 0.012, 0.26], [187.6, 0.012, 0.3],
  [188.2, 0.012, 0.3], [188.85, 0.012, 0.18], [189.45, 0.012, 0.3],
  [179.0, 0.035, 0.45],                     // mace smash on RONIN #1
  [190.9, 0.04, 0.5], [192.4, 0.06, 0.6],   // slow-motion section: longer holds
];
export const SHOT_TIMES = [];          // Sigma fights with the mace only (no rifle)
// impacts: filters are bypassed here so contacts / aims are exact and crisp
export const IMPACTS = [...HITSTOPS.map((h) => h[0]), ...SHOT_TIMES, 189.08];
const isImpact = (t) => IMPACTS.some((x) => Math.abs(x - t) < 1e-6);
const isClashT = (t) => EV.some((e) => e[1] === 'clash' && Math.abs(e[0] - t) < 1e-6) || Math.abs(t - 189.08) < 1e-6;
// fast whiff strikes also bypass the spring lag (crisp, exact), but keep their follow-through tangents
const CRISP = [...IMPACTS, 177.6, 186.85, 187.2];
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
  Object.assign(springGroup(['leg_L_upper', 'leg_R_upper', 'leg_L_lower', 'leg_R_lower', 'foot_L', 'foot_R'], 18, 0.99, 1 / 48), { crisp: [178.2, 178.55, 189.45] }),
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

// ============================================================================ choreography
// Fight 1 frame: origin HM (hero melee spot), D1 = hero→E1 axis, L1 = hero's left.
const HM = G(42, 52, 10);
const D1 = nrm([-38, 0, -32]);
const L1 = [D1[2], 0, -D1[0]];
const F1 = (a, l, h) => [HM[0] + D1[0] * a + L1[0] * l, HM[1] + h, HM[2] + D1[2] * a + L1[2] * l];

// ---------------- hero
const heroPos = posTrack([
  [170.0, G(60, 10, 120)],
  [171.2, G(72, 18, 98), 'cr'], [172.3, G(80, 26, 80), 'cr'],
  [174.0, G(74, 40, 44), 'io'], [175.25, G(60, 46, 28), 'io'],
  [175.45, G(57, 39, 25), 'out'],                       // drop-hop
  [176.5, G(46, 50, 14), 'io'],
  [177.35, F1(0, 0, 0), 'io'],
  [177.47, F1(0, 0, 0), 'io'],
  [177.62, F1(-5, 0, -2), 'out'],                       // sway back under E1's slash
  [177.95, F1(-2, 0, -1), 'io'],
  [178.0, F1(-2.2, 0, -1), 'in'],                       // forearm block
  [178.08, F1(-1.8, 0, -1), 'out'],
  [178.2, F1(3.5, 0, -0.5), 'in'],                      // knee
  [178.35, F1(3, 0, 0), 'out'],
  [178.55, F1(3, 0, 0.5), 'io'],                        // push kick
  [178.75, F1(4, 0, 1.6), 'out'],                      // boost after the reeling enemy
  [179.0, F1(12, 0, 3.2), 'in'],                        // MACE SMASH
  [179.2, F1(13.5, 0, 3.5), 'out'],
  [180.2, F1(11, 0, 3), 'io'],
  [180.6, F1(5, 0, 2), 'out'],                          // blast shove
  [180.9, F1(4.5, 0, 2), 'out'],
  [182.6, C(16, 10, 24), 'io'],                         // boost to meet the diving E2
  [183.5, C(4, 3, 17), 'io'],
  [184.35, C(0, 0, 14), 'io'],
  [184.5, C(0, -1.2, 14), 'in'],                         // overhead block impact on the shaft
  [184.7, C(0, -3.4, 14), 'out'],                        // sinks under the weight of the blow
  [184.95, C(0, -2.2, 13.6), 'io'],                      // drives up, throwing it off
  [185.45, C(0, -4, 14), 'io'],
  [185.85, C(0, -1, 8), 'io'],                          // dash in during the raise
  [186.0, C(0, 0, 6), 'in'],                            // S1 clash
  [186.2, C(0, 0, 5), 'out'],
  [186.45, C(1, 0, 3), 'io'],                           // S2 clash
  [186.6, C(1, 0, 4), 'out'],
  [186.85, C(1, -1, -1), 'in'],                         // S3 thrust (E2 sidesteps)
  [187.05, C(1, -1, -2), 'out'],
  [187.3, C(1, -5, 0), 'out'],                          // duck under the counter
  [187.6, C(1, -2, 1), 'io'],                           // block overhead
  [187.8, C(1, -3, 2), 'out'],
  [188.2, C(4, 0, -5), 'in'],                           // shoulder charge
  [188.45, C(4, 0, -3), 'out'],
  [188.85, C(3, 0, -3), 'io'],                          // bind
  [189.1, C(3, 0, -2.2), 'io'], [189.35, C(3, 0, -3.2), 'io'],
  [189.45, C(3, 0, -2.5), 'in'],                        // kicked
  [189.8, C(2, -2, 8), 'out'],
  [190.4, C(2, -1, 9), 'io'],                           // ---- slow motion from 190
  [190.9, C(4.5, -1, 9.5), 'io'],                       // parry
  [191.3, C(12, -1, 8), 'out'],                          // side-step
  [191.9, C(14, -2, 7), 'io'],                          // wind
  [192.4, C(16, -2, -5), 'in'],                         // PASS CUT
  [192.9, C(14, -3, -21), 'lin'],
  [193.6, C(9, -4, -31), 'out'],
  [194.6, C(6, -4, -34), 'out'],
]);
const heroPose = poseTrack([
  [169.3, L.flight], [170.4, L.idle, 'io'],                  // 170–175.35: at ease, arms in an A, mace hanging (scenes 32–36)
  [175.35, L.idle, 'io'],
  [176.2, L.guard, 'io'],                                     // brings the mace up during the visor close-up, ready for the charge
  [177.35, L.guard], [177.47, L.guard],
  [177.62, L.sway, 'out'], [177.9, L.forearmBlock, 'io'], [178.0, W(L.forearmBlock, { arm_R_upper: [-68, -35, -35] }), 'in'],
  [178.07, L.kneeWind, 'out'], [178.2, L.knee, 'in'], [178.35, L.guardBare, 'out'],
  [178.47, L.kickWind, 'io'], [178.55, L.kick, 'in'], [178.8, L.raise, 'out'],
  [179.0, L.cutMid, 'in'], [179.18, L.cutDown, 'out'], [179.9, L.cutDown], [180.4, L.shield, 'io'], [180.95, L.shield],   // overhead mace smash
  [181.15, L.lookUp, 'snap'], [182.0, L.lookUp], [182.6, L.boost, 'io'], [183.4, L.guardBare, 'io'],
  [184.0, L.ignite, 'io'], [184.3, L.staffBlock, 'out'], [184.5, L.staffHit, 'in'], [184.66, L.staffHit], [184.9, L.staffPush, 'io'],   // shaft block, throws it off
  [185.3, L.guard, 'out'],
  [185.45, L.guard], [185.85, L.raise, 'io'], [186.0, L.cutMid, 'in'], [186.15, W(L.cutMid, { arm_L_upper: [-105, -25, 10] }), 'out'],
  [186.35, W(L.foreEnd, { arm_L_upper: [-105, -70, -5], hand_L: [80, 0, 0] }), 'io'], [186.45, L.backMid, 'in'], [186.52, L.backMid],
  [186.72, L.thrustWind, 'out'], [186.85, L.thrust, 'in'], [187.05, L.thrust, 'out'],
  [187.28, L.duck, 'out'], [187.45, L.highBlock, 'snap'], [187.6, L.highBlockHit, 'in'],
  [187.95, L.chargeWind, 'out'], [188.2, L.charge, 'in'], [188.42, W(L.charge, { _body: [15, 45, 0] }), 'out'],
  [188.7, L.guard, 'io'], [188.85, L.lock, 'in'], [189.08, L.lock2, 'io'], [189.3, L.lock, 'io'],
  [189.45, L.hitBack, 'in'], [189.8, L.recover, 'out'],
  [190.45, L.guard, 'io'], [190.9, L.parry, 'in'], [191.25, L.parry, 'out'],
  [191.9, L.iaiWind, 'io'], [192.4, L.iaiMid, 'in'], [192.95, L.iaiEnd, 'out'], [193.7, L.iaiEnd, 'out'],
  [194.6, L.finish, 'io'],
]);
const heroImp = impulses([
  // rifle recoil: hand kicks up and back, torso rocks, then a damped settle (osc)
  ...SHOT_TIMES.map((t) => [t + 0.001, P({ arm_R_upper: [10, 0, 0], arm_R_lower: [-14, 0, 0], hand_R: [-16, 0, 0], torso: [-6, 5, 0], head: [-4, 0, 0], _body: [-4, 0, 0] }), 0.035, 0.5, 16]),
  [179.0, P({ arm_L_upper: [14, 0, 0], torso: [10, 0, 0], _body: [8, 0, 0] }), 0.03, 0.45],   // smash recoil
  [184.5, P({ arm_L_upper: [12, 0, 0], torso: [8, 0, 0], _body: [6, 0, 0] }), 0.03, 0.35],   // block recoils
  [186.0, P({ arm_L_upper: [10, 0, 0], _body: [-4, 0, 0] }), 0.03, 0.25],
  [186.45, P({ arm_L_upper: [0, 10, 0] }), 0.03, 0.2],
  [187.6, P({ arm_L_upper: [10, 0, 0], _body: [5, 0, 0] }), 0.03, 0.3],
  [188.85, P({ arm_L_upper: [8, 0, 0] }), 0.03, 0.25],
  [189.45, P({ torso: [20, 0, 0], head: [25, 0, 0], _body: [-10, 0, 0] }), 0.04, 0.4],
  [190.9, P({ arm_L_upper: [0, -10, 0] }), 0.06, 0.6],
]);
// two hands on the shaft (scene 48): left fist on the grip, right fist 42 % up the haft, the mace flat over the head
const STAFF = (tw) => smooth(184.05, 184.3, tw) * (1 - smooth(184.95, 185.25, tw));
function staffHold(s, k, tw) {
  const piv = PIV.gundam, fk = duelFK(s, 'gundam'), W0 = fk.root;
  const h = 8.8 + 1.4 * smooth(184.62, 184.9, tw);
  const base = M.transformPoint([0, 0, 0], W0, add(piv.torso, [4.4, h, 2.4]));
  const dir = nrm(M.transformDir([0, 0, 0], W0, [-1, 0.06, 0.1])), upv = nrm(M.transformDir([0, 0, 0], W0, [0, 1, 0]));
  const yL = nrm(sub(scl(dir, V.dot(upv, dir)), upv)), xL = V.cross([0, 0, 0], yL, dir);
  const Hw = [...xL, ...yL, ...dir], G = [0, -1.2, 0.6];
  const keep = {}; for (const p of ['arm_L_upper', 'arm_L_lower', 'hand_L', 'arm_R_upper', 'arm_R_lower', 'hand_R']) keep[p] = (s.pose[p] || [0, 0, 0]).slice();
  s.pose = { ...s.pose };
  armIK(s, fk, 'gundam', 'L', sub(base, r3v(Hw, G)), Hw);
  armIK(s, duelFK(s, 'gundam'), 'gundam', 'R', sub(add(base, scl(dir, 0.42 * s.saberLen)), r3v(Hw, G)), Hw);
  for (const p in keep) s.pose[p] = [0, 1, 2].map((c) => lerp(keep[p][c], s.pose[p][c], k));
}
// THE CHARGE before the last blow: as he coils back (191.3 →) the mace drinks power — its emissive panels go from calm
// to blinding — and it all goes into the hit at 192.4
export const maceCharge = (t) => smooth(191.3, 192.05, t) * (1 - smooth(192.42, 192.75, t));
const heroSaber = scalarTrack([[160, 1], [200, 1]]);        // the mace is in hand for the whole fight
const heroBoost = scalarTrack([[170, 0.8], [171.0, 0.5], [175.25, 0.5], [175.3, 1, 'lin'], [175.6, 0.5], [177.35, 0.6],
  [178.15, 0.6], [178.2, 1, 'lin'], [178.5, 0.5], [178.78, 0.5], [178.84, 1, 'lin'], [179.2, 0.6],   // thruster-driven smash [181.2, 0.4], [181.4, 1, 'lin'], [182.9, 0.9], [184.4, 0.6], [185.45, 0.6], [185.5, 1, 'lin'], [186.0, 0.7],
  [186.75, 0.7], [186.8, 1, 'lin'], [187.1, 0.6], [188.0, 0.6], [188.05, 1, 'lin'], [188.4, 0.7], [191.8, 0.6], [191.9, 1, 'lin'], [193.2, 1], [194.6, 0.3]]);

// ---------------- enemy 1 (RONIN/04 #1): boost-dodging gunner, then closes to melee and loses
const e1Pos = posTrack([
  [170.0, G(-30, 40, -40)],
  [172.6, G(-14, 46, -26), 'io'],                     // closes in, then hangs there sizing Sigma up
  [175.0, G(-9, 48, -27), 'io'], [176.45, G(-6, 49.5, -27), 'io'],
  [176.95, G(-7, 50.5, -27), 'io'],                    // ignition: crouch while the boosters flare (AC-style 0.3 s tell)
  [177.35, F1(21, 1, 0), 'out2'],                      // 40 m assault-boost charge in 0.4 s
  [177.6, F1(18.5, 0, 0), 'out'],                      // slash (hero sways)
  [177.95, F1(14, 0, 0.3), 'io'],
  [178.0, F1(13.2, 0, 0.3), 'in'],                     // backhand — blocked
  [178.2, F1(9.3, 0, 0.5), 'io'],                      // walks into the knee
  [178.5, F1(11.8, 0, 1.4), 'out'],
  [178.55, F1(12.2, 0, 1.5), 'lin'],                   // push kick lands
  [179.0, F1(24, 0, 4), 'out'],
  [179.1, F1(26.5, -0.5, 4.6), 'lin'],                 // mace smash
  [180.2, F1(38, -4, 8), 'out'],
]);
const e1Pose = poseTrack([
  [170, R.ready], [172.3, R.ready, 'io'], [172.75, R.taunt, 'io'], [173.6, R.taunt], [174.25, R.ready, 'io'],   // the taunt, then back to two hands
  [176.45, R.ready, 'io'],                                     // 170–176.45: two-handed, ready to charge, floating
  [176.95, W(R.foreWind, { torso: [30, -40, 0], _body: [30, 0, 0] }), 'io'], [177.35, R.foreWind, 'out'],
  [177.6, R.foreMid, 'in'], [177.72, R.foreEnd, 'out'], [177.88, R.foreEnd], [178.0, R.backMid, 'in'],
  [178.1, W(R.backMid, { arm_R_upper: [-125, -25, -55], arm_R_lower: [-30, 0, 0] }), 'out'],   // the blocked blade is knocked up and away
  [178.2, W(R.doubled, { arm_R_upper: [-110, -20, -60], arm_R_lower: [-35, 0, 0] }), 'in'], [178.45, W(R.doubled, { arm_R_upper: [-95, -15, -55] }), 'out'],   // doubled over, the sword flung out wide [178.55, R.hitTorso, 'in'], [179.0, R.tumble, 'out'],
  [179.08, R.hitCut, 'in'], [179.8, R.limp, 'out'], [180.2, R.limp],
]);
const e1Imp = impulses([
  [177.0, P({ arm_L_upper: [8, 0, 0] }), 0.07, 0.5],
  [179.0, P({ torso: [-12, 20, 10], head: [-20, 0, 0] }), 0.03, 0.6],
]);
const e1Saber = scalarTrack([[169.5, 1], [179.9, 1], [180.1, 0.3, 'lin'], [180.2, 0, 'lin']]);

// ---------------- enemy 2 (RONIN/04 #2): dive attack, sword duel, killed by the pass-cut
const e2Pos = posTrack([
  [180.8, C(60, 240, -200)],
  [182.0, C(40, 150, -120), 'cr'], [183.2, C(16, 72, -46), 'cr'], [184.0, C(6, 30, -10), 'cr'], [184.3, C(2, 17, 1), 'io'],
  [184.5, C(0, 13, 4), 'in'],                         // overhead cut — caught on the mace shaft
  [184.7, C(0, 18, 0), 'out'],                        // thrown up off it
  [185.15, C(0, 21, -7), 'io'],                       // backward somersault: apex
  [185.55, C(0, 9, -13), 'io'],                       // opening out, coming down
  [185.8, C(0, -0.5, -15), 'out'],                    // lands heavy, knees deep
  [186.0, C(0, 1, -15), 'io'],
  [186.2, C(0, 0, -17), 'out'], [186.45, C(0, 0, -18.5), 'io'],
  [186.65, C(0, 0, -15), 'io'],
  [186.9, C(10, 0, -13), 'out'],                       // side-step the thrust
  [187.2, C(8, 2.5, -12.5), 'in'],                     // counter cut, high over the ducking hero
  [187.35, C(6, 1, -11), 'out'],
  [187.6, C(6, 2, -13.5), 'in'],                       // overhead — blocked
  [187.95, C(5, 1, -12), 'out'],
  [188.2, C(5, 1, -11), 'io'],                         // shoulder-charged
  [188.55, C(4, 4, -24), 'out'],
  [188.85, C(3, 1, -20), 'in'],                        // lunge into the bind
  [189.1, C(3, 1, -20.8), 'io'], [189.35, C(3, 1, -19.5), 'io'],
  [189.45, C(3, 0, -10.5), 'in'],                      // kick
  [189.8, C(3, 0, -13), 'out'],
  [190.0, C(3, 1, -15), 'io'],                         // ---- slow motion: wind the killing thrust
  [190.9, C(2, 0, -9.5), 'in'],                        // thrust — parried
  [191.3, C(0, 0, -3), 'out'],
  [192.4, C(-1, 0, -3), 'io'],                         // cut
  [193.2, C(-1.5, -1, -2.5), 'out'],
  [194.0, C(-2, -3, -2), 'io'],
]);
const e2Pose = poseTrack([
  [180.8, R.dive], [183.5, R.dive], [184.25, R.raise, 'io'], [184.5, R.overCut, 'in'], [184.62, R.recoil, 'out'],
  [184.85, R.tuck, 'io'], [185.3, R.tuck], [185.55, R.untuck, 'io'], [185.8, R.land, 'io'], [186.0, R.sideBlock, 'in'], [186.2, R.guard, 'out'],
  [186.45, R.crossBlock, 'in'], [186.6, R.guard, 'out'], [186.9, R.dodge, 'out'],
  [187.05, R.foreWind, 'io'], [187.2, W(R.foreMid, { arm_R_upper: [-100, 5, 0], hand_R: [98, 0, 0], torso: [0, 8, 0] }), 'in'], [187.35, R.foreEnd, 'out'],
  [187.47, R.raise, 'io'], [187.6, R.overMid, 'in'],
  [187.95, W(R.guard, { arm_R_upper: [-125, 20, -10], hand_R: [25, 0, 0] })], [188.2, R.hitTorso, 'in'], [188.5, R.tumble, 'out'], [188.68, R.raise, 'io'], [188.85, R.lock, 'in'],
  [189.08, R.lock2, 'io'], [189.3, W(R.kickWind, { arm_R_upper: [-150, 25, -20], arm_R_lower: [-40, 0, 0], hand_R: [10, 0, 0] }), 'io'], [189.37, W(R.kickWind, { arm_R_upper: [-150, 25, -20], hand_R: [10, 0, 0] }), 'io'], [189.45, R.kick, 'in'],
  [189.75, R.thrustWind, 'out'], [190.1, R.thrustWind], [190.9, R.thrust, 'in'], [191.3, W(R.thrust, { _body: [22, -10, 0] }), 'out'],
  [192.3, W(R.thrust, { _body: [20, -12, 0] })], [192.5, R.hitCut, 'in'], [193.2, W(R.doubled, { _body: [35, 10, 25] }), 'out'], [194.0, W(R.limp, { _body: [40, 20, 35] }), 'io'],
]);
const e2Imp = impulses([
  [186.0, P({ arm_R_upper: [12, 0, 0], _body: [-5, 0, 0] }), 0.03, 0.3],
  [186.45, P({ arm_R_upper: [0, 10, 0], torso: [0, 8, 0] }), 0.03, 0.25],
  [187.6, P({ arm_R_upper: [10, 0, 0] }), 0.03, 0.25],
  [190.9, P({ arm_R_upper: [0, 20, 0], torso: [0, 12, 0] }), 0.08, 0.7],
]);
// backward somersault off the shaft (184.62–185.6): one full turn about the hips, slow out of the recoil, fastest tucked
const FLIP_A = 184.62, FLIP_B = 185.6;
const e2Flip = (t) => { const u = sat((t - FLIP_A) / (FLIP_B - FLIP_A)); return u <= 0 || u >= 1 ? 0 : -2 * Math.PI * u * u * u * (u * (6 * u - 15) + 10); };
const E2_FLIP = (tw) => smooth(FLIP_A - 0.05, FLIP_A + 0.08, tw) * (1 - smooth(FLIP_B - 0.08, FLIP_B + 0.1, tw));
const e2Saber = scalarTrack([[181.0, 0], [181.5, 1, 'out'], [192.6, 1], [193.0, 0, 'io']]);

// ============================================================================ state assembly
const _pose = new Float64Array(NCH);
// soft joint limit: identity inside, eases smoothly (C1) into the stop over the last 8° — no kink at the limit
const SOFT = 8 * DEG;
function softLimit(x, lo, hi) {
  if (x > hi - SOFT) return hi - SOFT + SOFT * Math.tanh((x - (hi - SOFT)) / SOFT);
  if (x < lo + SOFT) return lo + SOFT - SOFT * Math.tanh((lo + SOFT - x) / SOFT);
  return x;
}
function poseObj(arr) {   // also enforces the joint limits (snap overshoot / additive impulses can't break a joint)
  const o = {};
  for (const p of PARTS) {
    if (p === '_body') continue;
    const i = PIDX[p], L = JOINT_LIMITS[p];
    o[p] = L ? [softLimit(arr[i], L[0][0], L[0][1]), softLimit(arr[i + 1], L[1][0], L[1][1]), softLimit(arr[i + 2], L[2][0], L[2][1])] : [arr[i], arr[i + 1], arr[i + 2]];
  }
  return o;
}
const flat = (d, k = 0.35) => nrm([d[0], d[1] * k, d[2]]);
// rough heading: toward where the other machine is AROUND now (its offset averaged over ±0.5 s) — before the melee the
// fighters size each other up and turn cleanly, instead of servoing onto every little hover wobble of the other
const _RW = [[-0.5, 1], [-0.25, 2], [0, 3], [0.25, 2], [0.5, 1]];
function roughDir(from, to, tw) { let d = [0, 0, 0]; for (const [o, w] of _RW) d = add(d, scl(sub(to(tw + o), from(tw + o)), w)); return flat(d); }
let _hhd = null, _ehd = null;
const HERO_HOLD_DIR = () => _hhd || (_hhd = roughDir(heroRawPos, e1RawPos, 170.3));   // looked at RONIN once, at 170.3
const E1_HOLD_DIR = () => _ehd || (_ehd = roughDir(e1RawPos, heroRawPos, 170.3));
const ROUGH = (tw) => 1 - smooth(176.6, 176.95, tw);          // 1 while sizing each other up, 0 from the charge on (exact contacts)
function yawRot(f, a) { const c = Math.cos(a), s = Math.sin(a); return [f[0] * c + f[2] * s, f[1], -f[0] * s + f[2] * c]; }
let STATE_CACHE = false;  // state memo per t — enabled only after the contact solver has finished (see end of module)
let SOLVING = false;   // the contact solver skips velocity estimation
function velOf(fn, t) { if (SOLVING) return [0, 0, 0]; const h = 1 / 48; const a = fn(t - h), b = fn(t + h); return scl(sub(b, a), 1 / (2 * h)); }
function base(vis) { return { vis, pos: [0, 0, 0], fwd: [0, 0, 1], roll: 0, pitch: 0, pose: {}, saber: 0, saberLen: 12.9, thr: 0.4, damage: 0, eye: 1, vel: [0, 0, 0], speed: 0, smear: 0, boost: 0 }; }
// inertia: lean into accelerations (pitch forward when thrusting, rock back when braking, bank into lateral pulls);
// faded out around contact frames so solved contacts stay exact
function inertiaLean(s, fwdBase) {
  if (SOLVING || !s._pf) return [0, 0];
  // acceleration of the SUSTAINED motion: velocities over ±0.1 s, differenced across ±0.18 s and averaged over a
  // ±0.2 s window — the body leans into a thrust or a brake that lasts, not into every closely spaced key (the old
  // ±1/24 s estimate flipped sign between the keys round each clash and rocked the whole machine back and forth)
  const t = s._t, vh = 0.1, vel = (x) => scl(sub(s._pf(x + vh), s._pf(x - vh)), 1 / (2 * vh));
  let acc = [0, 0, 0], wsum = 0;
  for (const [o, w] of [[-0.2, 1], [-0.1, 2], [0, 3], [0.1, 2], [0.2, 1]]) { acc = add(acc, scl(sub(vel(t + o + 0.18), vel(t + o - 0.18)), w / 0.36)); wsum += w; }
  acc = scl(acc, 1 / wsum);
  const f = nrm([fwdBase[0], 0, fwdBase[2]]), r = [f[2], 0, -f[0]];
  let near = 1; for (const ti of IMPACTS) near = Math.min(near, smooth(0.1, 0.5, Math.abs(t - ti)));
  const k = near * (1 - (s._idle || 0));
  return [clamp((acc[0] * f[0] + acc[2] * f[2]) * 0.0016, -0.22, 0.22) * k, clamp(-(acc[0] * r[0] + acc[2] * r[2]) * 0.0013, -0.2, 0.2) * k];
}
function finish(s, arr, fwdBase) {
  const b = PIDX._body;
  const [lp, lr] = inertiaLean(s, fwdBase);
  s.pitch = arr[b] + lp; s.roll = arr[b + 2] + lr;
  s.fwd = yawRot(fwdBase, arr[b + 1]);
  s.pose = poseObj(arr);
  s.speed = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
  s.smear = sat((s.speed - 35) / 110);
  return s;
}

// CIRCLING (170.8–176.6): the two machines drift sideways round each other, opposite ways, sizing each other up —
// then settle back on their marks just before the charge (so every solved contact after 177 is untouched)
const CIRC_AX = (() => { const a = [-4 - 60, 0, -26 - 28]; const l = Math.hypot(a[0], a[2]); return [a[2] / l, 0, -a[0] / l]; })();   // ⟂ to the hero→E1 line
const circ = (tw) => easeInOut(sat((tw - 170.8) / 4.2)) * (1 - easeInOut(sat((tw - 175.9) / 0.7)));
function heroRawPos(tw) {
  if (tw < 170) return gundamLaunchPath(tw);
  const c = circ(tw);
  return add(add(springPos(heroPos, tw), scl(hover(tw, 1.3, 0.35), smooth(170, 171, tw))), [CIRC_AX[0] * -6 * c, 1.2 * c, CIRC_AX[2] * -6 * c]);
}
function e1RawPos(tw) { const c = circ(tw); return add(add(springPos(e1Pos, tw), hover(tw, 7.1, lerp(0.45, 0.3, smooth(176.3, 176.9, tw)))), [CIRC_AX[0] * 6 * c, -0.8 * c, CIRC_AX[2] * 6 * c]); }   // (1.2 m of hover read as wobble)
function e2RawPos(tw) { return add(springPos(e2Pos, tw), hover(tw, 3.7, 0.3 * (1 - E2_DIVE(tw)))); }
// the dive from above (180.6–184.25, scenes 43–46): one clean committed plunge — no hover, jitter, squash, weight-shift,
// inertia lean or re-aiming at Sigma's every wobble
const E2_DIVE = (tw) => smooth(180.6, 180.9, tw) * (1 - smooth(183.9, 184.25, tw));
const heroSquash = squashFrom(heroPos), e1Squash = squashFrom(e1Pos), e2Squash = squashFrom(e2Pos);
const HIP = 0;   // pos is the hip (msMatrix puts model [0,9,0] at pos)

// aftermath formula of the old gundamState (194–226) for a seamless hand-over at 200
function oldAftermath(t) {
  const s = { pos: C(6 + Math.sin(t * 0.5) * 1.5, -4 + Math.sin(t * 0.7) * 1.2, -34), fwd: [Math.sin((t - 194) * 0.05) * 0.3, 0, -1], pose: {} };
  blendPose('saberSlash', 'stand', sat((t - 194) / 2.5), s.pose);
  breathe(s.pose, t, 1);
  return s;
}

// ---- physical response to contacts: the struck body is shoved along the blow and staggers, the striker recoils a
// little; clashes throw both apart. Zero at the contact frame (so solved contacts stay exact), peaks ~0.15 s later,
// settles by ~0.9 s. Returns a world offset + a body pitch/roll jolt (radians).
let _COLL = null;
function collisions() {
  if (_COLL) return _COLL;
  const raw = { hero: heroRawPos, e1: e1RawPos, e2: e2RawPos };
  const foe = (t) => (t < 181 ? 'e1' : 'e2');
  _COLL = [];
  for (const [t, type, st, sp] of EV) {
    if (type !== 'hit' && type !== 'block' && type !== 'clash') continue;
    let att, vic;
    if (sp.kind === 'blade-blade') { att = 'hero'; vic = foe(t); }
    else if (sp.kind === 'blade-part') { att = sp.blade; vic = sp.part[0]; }
    else if (sp.kind === 'part-part') { att = sp.a[0]; vic = sp.b[0]; }
    else continue;
    if (sp.cut) continue;                                          // the kills are handled by the breakup
    const d = nrm(sub(raw[vic](t), raw[att](t)));
    _COLL.push({ t, att, vic, d, str: st, clash: type === 'clash' });
  }
  return _COLL;
}
const pulse = (lt, w) => (lt <= 0 ? 0 : lt * w * Math.exp(1 - lt * w));   // 0 → peak 1 at 1/w → decays
function collisionOffset(who, tw) {
  const off = [0, 0, 0]; let jolt = 0;
  for (const c of collisions()) {
    const lt = tw - c.t;
    if (lt <= 0 || lt > 0.8) continue;
    let a = 0;
    if (c.vic === who) a = (c.clash ? 0.6 : 3.2) * c.str;
    else if (c.att === who) a = -(c.clash ? 0.6 : 0.9) * c.str;
    if (!a) continue;
    const p = pulse(lt, 9) * (1 - lt / 0.8);
    if (!c.clash) { off[0] += c.d[0] * a * p; off[1] += c.d[1] * a * p; off[2] += c.d[2] * a * p; }   // blades: jolt only (keeps binds exact)
    if (!c.clash) jolt += (a > 0 ? -0.22 : 0.08) * c.str * pulse(lt, 8);
  }
  return { off, jolt };
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
  const u = (tw - (DODGE.t - 0.5)) / 1.6;
  if (u <= 0 || u >= 1) return [0, 0, 0];
  const k = 13 * DODGE.side * Math.sin(Math.PI * u) ** 2 * (1 - 0.35 * u);
  const r = dodgeRight(tw);
  return [r[0] * k, 2.5 * Math.sin(Math.PI * u) ** 2, r[2] * k];
}
export function duelHero(t) {
  if (!STATE_CACHE) return duelHero_(t);
  let r = _c_duelHero.get(t);
  if (r === undefined) { r = duelHero_(t); if (AUTO_READY && r) r = applyImpulses('hero', t, r); if (_c_duelHero.size > 64) _c_duelHero.clear(); _c_duelHero.set(t, r); }
  return r;
}
function duelHero_(t) {
  if (t < DUEL_T0 || t >= DUEL_T1) return null;
  const s = base(true);
  const tw = warp(t);
  s.pos = heroRawPos(tw);
  const co = collisionOffset('hero', tw); s.pos = add(s.pos, co.off);
  s.vel = velOf((x) => heroRawPos(warp(x)), t); s._pf = (x) => heroRawPos(warp(x)); s._t = t;
  springPose(heroPose, tw, _pose); heroImp(tw, _pose); volleyParry(tw, _pose);
  // IDLE (173.4–175.1, scene 35): the body is held still — no squash / weight-shift / jitter / inertia lean / turning
  // after RONIN; only a slow float (below: the whole machine drifts up and down a little) and breathing
  const idleK = smooth(169.8, 170.3, tw) * (1 - smooth(175.3, 175.8, tw));   // scenes 32–36 (at ease until the visor lights)
  if (tw >= 170) {
    const pre = idleK > 0 ? Float64Array.from(_pose) : null;
    heroSquash(tw, _pose); weightShift(heroPose, tw, _pose, 'arm_L_upper');
    if (pre) for (let i = 0; i < _pose.length; i++) _pose[i] = lerp(_pose[i], pre[i], idleK);
  }
  micro(t, _pose, 1.3, (1 - idleK) * (tw < 177 ? lerp(1, 0.35, ROUGH(tw)) : 1));
  if (idleK > 0) {
    _pose[PIDX.torso] += Math.sin(t * 1.05) * 0.03 * idleK; _pose[PIDX.head] += Math.sin(t * 1.05 - 0.6) * 0.02 * idleK;   // slow, heavy breaths
    _pose[PIDX.arm_L_upper] += Math.sin(t * 1.05 - 1.2) * 0.025 * idleK;                                                   // the hanging mace lags them
  }
  s._idle = idleK;
  s.anchor = s.pos.slice();                                   // (the idle camera follows this, so the float shows on screen)
  if (idleK > 0) s.pos = add(s.pos, [Math.sin(t * 0.6) * 0.06 * idleK, Math.sin(t * 0.75 + 0.4) * 0.22 * idleK, Math.sin(t * 0.5 + 1) * 0.06 * idleK]);   // a slow, heavy float
  _pose[PIDX._body] += co.jolt; _pose[PIDX.torso] += co.jolt * 0.8; _pose[PIDX.head] += co.jolt * 0.6;   // impact jolt
  _pose[PIDX.hand_L] = lerp(maceWrist(_pose[PIDX.hand_L]), _pose[PIDX.hand_L], idleK);   // at ease the fist is loose: the mace dangles
  // facing
  let f;
  if (tw < 170.3) {
    const p2 = gundamLaunchPath(tw + 0.05), p1 = gundamLaunchPath(tw);
    const path = nrm(sub(p2, p1));
    const toE = flat(sub(e1RawPos(tw), s.pos));
    f = nrm(lrp(path, toE, smooth(169.3, 170.3, tw)));
    s.roll = 0;
    // gentle banking; an enemy ion bolt comes straight at him and he simply bats it away with the right vambrace (DODGE)
    _pose[PIDX._body + 2] += Math.sin(tw * 0.8) * 0.1 * (1 - smooth(169, 170, tw));
    parryPose(tw, _pose);
  } else if (tw < 180.25) {
    f = flat(sub(e1RawPos(tw), s.pos));
    if (ROUGH(tw) > 0) f = nrm(lrp(f, roughDir(heroRawPos, e1RawPos, tw), ROUGH(tw)));
    // (sizing each other up: the rough, averaged heading above turns them slowly as they circle — no servoing)
  } else {
    const toE1 = flat(sub(e1RawPos(180.2), s.pos));
    const toE2 = flat(sub(e2RawPos(tw), s.pos), tw < 184 ? 0.6 : 0.35);
    f = nrm(lrp(toE1, toE2, smooth(180.95, 181.3, tw)));
    // the killing blow is a 180° SPINNING strike: from facing RONIN #2 he coils the other way (70°), then whips round
    // with his back passing the enemy, accelerating all the way into the contact — the mace arm, out to his left,
    // meets the torso at the fastest point of the spin (facing the dash line, as before) — and the spin bleeds off
    // in the follow-through
    if (tw > 191.3) f = yawRot(flat(sub(e2RawPos(Math.min(tw, 192.4)), s.pos), 0.35), spinYaw(tw) * DEG);
  }
  s.saber = heroSaber(tw);
  s.boost = heroBoost(tw);
  s.thr = clamp(0.3 + s.boost * 0.7, 0, 1);
  finish(s, _pose, f);
  { const ks = STAFF(tw); if (ks > 0) staffHold(s, ks, tw); }
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
  s.damage = 0.02 * smooth(189.4, 189.6, t);
  return s;
}

const _c_duelEnemy1 = new Map();
function spinYaw(t) {       // degrees, relative to facing RONIN #2 (270 = facing the dash line, mace arm on the enemy)
  if (t < 191.3) return 0;
  if (t < 191.85) return 70 * easeInOut((t - 191.3) / 0.55);                      // coil
  if (t < 192.4) { const u = (t - 191.85) / 0.55; return 70 + 200 * u * u; }       // whip round, fastest at contact
  if (t < 193.1) { const u = (t - 192.4) / 0.7; return 270 + 35 * (1 - (1 - u) * (1 - u)); }   // follow-through
  return 305 - 5 * easeInOut(sat((t - 193.1) / 0.8));
}
export function duelEnemy1(t) {
  if (!STATE_CACHE) return duelEnemy1_(t);
  let r = _c_duelEnemy1.get(t);
  if (r === undefined) { r = solid('e1', t, enemyFree('e1', t)); if (_c_duelEnemy1.size > 64) _c_duelEnemy1.clear(); _c_duelEnemy1.set(t, r); }
  return r;
}
// ---------------------------------------------------------------- weapons are solid: katana vs mace
// Per frame, the katana (capsule r 0.3) may not sink into the mace (shaft r 0.45, head r 2.1). The side it must stay
// on is the side it came from (looked up in the last frames where the two were apart), so a blade can never tunnel
// through the other weapon between frames — a blow that would pass through is stopped on the surface. The katana is
// pushed out by swinging the sword arm about its shoulder; the left fist re-closes on the hilt.
const _c_free = { e1: new Map(), e2: new Map() };
export function enemyFree(who, t) {
  const c = _c_free[who];
  let r = c.get(t);
  if (r === undefined) { r = who === 'e1' ? duelEnemy1_(t) : duelEnemy2_(t); if (AUTO_READY && r) r = applyImpulses(who, t, r); if (c.size > 256) c.clear(); c.set(t, r); }
  return r;
}
const maceCaps = (hs) => maceCapsOf(duelFK({ ...hs, saber: Math.max(hs.saber, 1e-3) }, 'gundam'));
const bodyCaps = (model, fk) => HITBOX[model].map(([part, a, b, r]) => [M.transformPoint([0, 0, 0], fk[part], a), M.transformPoint([0, 0, 0], fk[part], b), r]);
function closestPair(A, B) {   // deepest-penetrating pair of capsule lists → { q, depth, i, j }
  let best = null;
  for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
    const q = segSeg(A[i][0], A[i][1], B[j][0], B[j][1]), depth = A[i][2] + B[j][2] - q.d;
    if (!best || depth > best.depth) best = { q, depth, i, j };
  }
  return best;
}
// the mace is one rigid body: one side for the katana to stay on, taken (mace → katana) from the last frame where the
// katana was clearly clear of it
function approachNormal(who, t, offAt = null) {   // offAt(tt): the hold already applied at an earlier time
  for (let k = 1; k <= 12; k++) {
    const tt = t - k / 24, hs = duelHero_(tt), es = enemyFree(who, tt);
    if (!hs || !es || !es.vis || !(es.saber > 0.5)) break;
    const c = closestPair(maceCaps(hs), katanaCapsOf(duelFK(offAt ? { ...es, pos: add(es.pos, offAt(tt)) } : es, 'enemy_ms')));
    if (c.depth < -0.4) return nrm(sub(c.q.c2, c.q.c1));
  }
  return null;
}
/** debug: deepest penetrations between two posed machines (weapon-weapon, body-body incl. mace→body, katana→Sigma) */
export function solidReport(H, E, eArmed, hArmed) {
  const mace = hArmed ? maceCapsOf(H) : [], kat = eArmed ? katanaCapsOf(E) : [], hb = bodyCaps('gundam', H), eb = bodyCaps('enemy_ms', E);
  const ww = mace.length && kat.length ? closestPair(mace, kat).depth : -9, b = closestPair(hb, eb), kb = kat.length ? closestPair(hb, kat).depth : -9;
  return { ww, bb: b.depth, bbParts: HITBOX.gundam[b.i][0] + '/' + HITBOX.enemy_ms[b.j][0], kb };
}
// ---- SOLIDITY as a continuous motion (not a per-frame projection, which popped: the blade stuck to the surface, then
// teleported through once its side was lost). RONIN is simply HELD BACK — one world offset for the whole machine —
// computed by a forward simulation on a 96 Hz grid: each frame starts from the last offset relaxing back to zero
// (τ 0.12 s), any penetration (katana vs mace on the side it came from, katana vs Sigma, body vs body / mace) is resolved
// from there, the change per frame is rate-limited, and the track is lightly blurred. At runtime: free motion + offset.
const HOLD_MAX = 4;   // m — the hold stays a small correction; deeper overlaps are fixed in the choreography itself
const SOLID_DT = 1 / 96, SOLID_T0 = 170.3, SOLID_T1 = 194.3, SOLID_N = Math.ceil((SOLID_T1 - SOLID_T0) / SOLID_DT) + 1;
let SOLID = null;
function resolveOffset(who, t, st, H, ctx) {   // translation that frees `st` (already offset) from Sigma and his mace
  const killed = t >= KILL_T[who], armed = st.saber > 0.5;
  const mace = H.mace, hb = H.body;
  let off = [0, 0, 0];
  for (let it = 0; it < 10; it++) {
    const E = duelFK({ ...st, pos: add(st.pos, off) }, 'enemy_ms');
    let best = null;
    if (armed && mace.length) {
      const kat = katanaCapsOf(E), c = closestPair(mace, kat);
      if (c.depth > -0.05) {
        if (!ctx.side) ctx.side = approachNormal(who, t, ctx.offAt) || (c.q.d > 1e-4 ? nrm(sub(c.q.c2, c.q.c1)) : null);
        if (ctx.side) { const dp = mace[c.i][2] + kat[c.j][2] - V.dot(sub(c.q.c2, c.q.c1), ctx.side); if (dp > 0.005) best = { n: ctx.side, d: dp }; }
        ctx.lastContact = t;
      }
    }
    // (katana into Sigma's armour is not shoved out here — pushing the whole machine for a blade that passes too low read
    // as a lurch; those passes are fixed in the choreography)
    { const c = closestPair(killed ? hb : [...hb, ...mace], bodyCaps('enemy_ms', E));
      if (c.depth > 0.005 && (!best || c.depth > best.d)) best = { n: c.q.d > 1e-4 ? nrm(sub(c.q.c2, c.q.c1)) : nrm(sub(st.pos, H.pos)), d: c.depth }; }
    if (!best) break;
    off = add(off, scl(best.n, best.d + 0.01));
  }
  return off;
}
function buildSolid() {
  // reactive (causal) and smooth: the hold only ever answers a contact that is happening, relaxes back slowly enough
  // (τ 0.3 s) to carry through a quick exchange instead of letting go and grabbing again, and never changes faster
  // than 60 m/s of story time
  const out = {}, relax = Math.exp(-SOLID_DT / 0.3), vmax = 120 * SOLID_DT;
  for (const who of ['e1', 'e2']) {
    const raw = new Float64Array(SOLID_N * 3), ctx = {};
    ctx.offAt = (tt) => { const j = Math.max(0, Math.min(SOLID_N - 1, Math.round((tt - SOLID_T0) / SOLID_DT))); return [raw[j * 3], raw[j * 3 + 1], raw[j * 3 + 2]]; };
    let prev = [0, 0, 0];
    for (let i = 0; i < SOLID_N; i++) {
      const t = SOLID_T0 + i * SOLID_DT, fr = enemyFree(who, t), hs = duelHero(t);
      if (!fr || !fr.vis || !hs || !hs.vis) { prev = scl(prev, relax); raw.set(prev, i * 3); continue; }
      if (ctx.lastContact !== undefined && t - ctx.lastContact > 0.25) { ctx.side = null; ctx.lastContact = undefined; }   // contact episode over
      const Hf = duelFK({ ...hs, saber: Math.max(hs.saber, 1e-3) }, 'gundam');
      const H = { mace: hs.saber > 0.5 ? maceCapsOf(Hf) : [], body: bodyCaps('gundam', Hf), pos: hs.pos };
      const base = scl(prev, relax);
      let c = add(base, resolveOffset(who, t, { ...fr, pos: add(fr.pos, base) }, H, ctx));
      const dc = sub(c, prev), L = Math.hypot(dc[0], dc[1], dc[2]);
      if (L > vmax) c = add(prev, scl(dc, vmax / L));
      const Lc = Math.hypot(c[0], c[1], c[2]); if (Lc > HOLD_MAX) c = scl(c, HOLD_MAX / Lc);   // never a big visible shove
      raw.set(c, i * 3); prev = c;
    }
    const sg = 3, Rr = 9, G = []; let gs = 0; for (let j = -Rr; j <= Rr; j++) { const g = Math.exp(-(j * j) / (2 * sg * sg)); G.push(g); gs += g; }
    const sm = new Float64Array(SOLID_N * 3);
    for (let i = 0; i < SOLID_N; i++) for (let j = -Rr; j <= Rr; j++) { const q = Math.min(SOLID_N - 1, Math.max(0, i + j)), g = G[j + Rr] / gs; for (let k = 0; k < 3; k++) sm[i * 3 + k] += raw[q * 3 + k] * g; }
    out[who] = sm;
  }
  return out;
}
function solid(who, t, fr) {
  if (!SOLID || !fr || !fr.vis || t < SOLID_T0 || t > SOLID_T1 - SOLID_DT) return fr;
  const x = (t - SOLID_T0) / SOLID_DT, i = Math.floor(x), f = x - i, T = SOLID[who];
  const d = (k) => T[i * 3 + k] + (T[(i + 1) * 3 + k] - T[i * 3 + k]) * f;
  const o = [d(0), d(1), d(2)];
  if (Math.abs(o[0]) + Math.abs(o[1]) + Math.abs(o[2]) < 1e-5) return fr;
  return { ...fr, pos: add(fr.pos, o), _held: Math.hypot(o[0], o[1], o[2]) };   // the whole machine moves: the grip is unchanged
}
// the killing blows: the mace goes THROUGH (the breakup takes over) — no body push from then on
const KILL_T = { e1: 178.95, e2: 192.35 };
/**
 * Everything is solid, every frame (hero = the reference, RONIN yields):
 *   katana vs mace   — the katana stays on the side it came from and is stopped on the surface (sword arm swung about
 *                      its shoulder, the rest shoves the machine back), so a blow can never pass through the other weapon;
 *   katana vs Sigma  — the blade is stopped on his armour the same way;
 *   RONIN's body vs Sigma's body / the mace — the machine is shoved out along the contact normal.
 * Capsules are fitted to the meshes (HITBOX, MACE_SEG, KATANA). The left fist re-closes on the hilt after every push.
 */
function weaponConstrain(who, t, s) {
  if (!s || !s.vis) return s;
  const hs = duelHero(t);
  if (!hs || !hs.vis) return s;
  const H = duelFK({ ...hs, saber: Math.max(hs.saber, 1e-3) }, 'gundam');
  const mace = hs.saber > 0.5 ? maceCapsOf(H) : [], heroBody = bodyCaps('gundam', H), piv = PIV.enemy_ms, armed = s.saber > 0.5;
  const killed = t >= KILL_T[who];
  let out = s, side;
  const own = () => { if (out === s) out = { ...s, pose: { ...s.pose } }; return out; };
  const pushBlade = (E, x, n, depth) => {   // move katana point x by depth·n: sword arm about its shoulder, remainder = body
    const o = own(), SR = M.transformPoint([0, 0, 0], E.torso, sub(piv.arm_R_upper, piv.torso)), goal = add(x, scl(n, depth + 0.01));
    const A = r3between(sub(x, SR), sub(goal, SR));
    o.pose.arm_R_upper = euler3(r3mul(r3T(r3(E.torso)), r3mul(A, r3(E.arm_R_upper))));
    o.pos = add(o.pos, sub(goal, add(SR, r3v(A, sub(x, SR)))));
    o._pushed = (o._pushed || 0) + depth;
    gripLock(o);
  };
  for (let it = 0; it < 40; it++) {
    const E = duelFK(out, 'enemy_ms');
    let done = true;
    if (armed && mace.length) {                                   // katana vs mace
      const kat = katanaCapsOf(E), c = closestPair(mace, kat);
      if (c.depth > 0.002) {
        if (side === undefined) side = approachNormal(who, t);
        const n = side || (c.q.d > 1e-4 ? nrm(sub(c.q.c2, c.q.c1)) : null);
        if (n) {
          const depth = mace[c.i][2] + kat[c.j][2] - V.dot(sub(c.q.c2, c.q.c1), n);
          if (depth > 0.002) { pushBlade(E, c.q.c2, n, depth); done = false; continue; }
        }
      }
    }
    if (armed) {                                                  // katana vs Sigma's armour
      const c = closestPair(heroBody, katanaCapsOf(E));
      if (c.depth > 0.02 && c.q.d > 1e-4) { pushBlade(E, c.q.c2, nrm(sub(c.q.c2, c.q.c1)), c.depth); done = false; continue; }
    }
    const eb = bodyCaps('enemy_ms', E);                           // bodies (and the mace into RONIN's body)
    const c = closestPair(killed ? heroBody : [...heroBody, ...mace], eb);
    if (c.depth > 0.02) {
      const n = c.q.d > 1e-4 ? nrm(sub(c.q.c2, c.q.c1)) : nrm(sub(out.pos, hs.pos));
      const o = own(); o.pos = add(o.pos, scl(n, c.depth + 0.01)); o._bodyPush = (o._bodyPush || 0) + c.depth;
      done = false; continue;
    }
    if (done) break;
  }
  return out;
}
// SAMURAI GRIP: RONIN holds the katana in BOTH hands — the left hand is solved (FK coordinate descent, joint-limited)
// onto the hilt just below the right fist, aligned with the blade. Only the left arm moves: the blade and every solved
// contact stay exactly where the choreography put them.
const TH_VARS = [['arm_L_upper', 0], ['arm_L_upper', 1], ['arm_L_upper', 2], ['arm_L_lower', 0], ['hand_L', 0], ['hand_L', 1], ['hand_L', 2],
  ['arm_R_upper', 0], ['arm_R_upper', 1], ['arm_R_upper', 2], ['arm_R_lower', 0], ['hand_R', 0], ['hand_R', 1]];
const EV_T = () => EV.filter((e) => e[1] !== 'shake').map((e) => e[0]);
// per-frame GRIP LOCK on top of the baked keys: a small, local left-arm-only descent from the baked pose closes the
// last gap so the left fist sits exactly on the hilt (starting from the smooth baked pose keeps it continuous)
const LOCK_VARS = [['arm_L_upper', 0], ['arm_L_upper', 1], ['arm_L_upper', 2], ['arm_L_lower', 0], ['hand_L', 0], ['hand_L', 1], ['hand_L', 2]];
function gripLock(s) {
  if (SOLVING || !s || !s.vis || !(s.saber > 0.5)) return s;
  const gw = s._grip ?? 1;
  if (gw <= 0.001) return s;                                  // hand off the hilt (taunt)
  // exact: the left fist is placed on the hilt just below the right one, turned the same way (analytic arm IK)
  const pose = s.pose, free = Object.fromEntries(['arm_L_upper', 'arm_L_lower', 'hand_L'].map((p) => [p, (pose[p] || [0, 0, 0]).slice()]));
  s.pose = { ...pose };
  reachFix(s, gw);
  const fk0 = duelFK(s, 'enemy_ms');
  const Hr = r3(fk0.hand_R), tgt = M.transformPoint([0, 0, 0], fk0.hand_R, GRIP_R);
  const P = sub(tgt, r3v(Hr, GRIP_L));
  s.gripReach = armIK(s, fk0, 'enemy_ms', 'L', P, Hr);
  if (gw < 1) for (const p in free) s.pose[p] = [0, 1, 2].map((c) => lerp(free[p][c], s.pose[p][c], gw));   // eases onto / off the hilt
  const fk = duelFK(s, 'enemy_ms');
  s.twoHandErr = V.dist(M.transformPoint([0, 0, 0], fk.hand_L, GRIP_L), M.transformPoint([0, 0, 0], fk.hand_R, GRIP_R));
  return s;
}
// ---------------------------------------------------------------- analytic arm IK (exact, per frame)
// Rotations are 3×3 column-major arrays; the FK's Euler order is R = Ry(y)·Rx(x)·Rz(z).
const r3 = (m) => [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
const r3mul = (a, b) => { const o = new Array(9); for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; return o; };
const r3T = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
const r3v = (a, v) => [a[0] * v[0] + a[3] * v[1] + a[6] * v[2], a[1] * v[0] + a[4] * v[1] + a[7] * v[2], a[2] * v[0] + a[5] * v[1] + a[8] * v[2]];
const r3x = (t) => { const c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, c, s, 0, -s, c]; };
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
// how far (m) the hilt sits beyond the left arm's reach (0 = the left fist can close on it)
let _armReach = null;   // [min (elbow folded to 150°), max (straight)] shoulder → wrist distance, with a small margin
const ARM_REACH_ = () => _armReach || (_armReach = (() => {
  const piv = PIV.enemy_ms, e = sub(piv.arm_L_lower, piv.arm_L_upper), w = sub(piv.hand_L, piv.arm_L_lower);
  return [Math.hypot(...add(e, r3v(r3x(-150 * DEG), w))) + 0.08, Math.hypot(...add(e, w)) - 0.05];
})());
function gripDeficit(fk) {
  const Hr = r3(fk.hand_R), P = sub(M.transformPoint([0, 0, 0], fk.hand_R, GRIP_R), r3v(Hr, GRIP_L));
  const S = M.transformPoint([0, 0, 0], fk.torso, sub(PIV.enemy_ms.arm_L_upper, PIV.enemy_ms.torso));
  const [lo, hi] = ARM_REACH_(), dist = V.dist(P, S);
  return { d: dist > hi ? dist - hi : dist < lo ? lo - dist : 0, far: dist > lo, P, S };   // d: how far out of range (either way)
}
// a two-handed grip keeps the hilt near the centre line: if the sword arm has the hilt out of the left hand's reach,
// the sword arm draws in (swung about its shoulder) until the left fist can close on it
// Around its own sword contacts the blade must not leave the solved contact: there the whole machine shifts so the
// blade pivots about the contact point instead (keep → 1 at the contact frame).
const E_BLADE_T = { e1: [178.0], e2: [184.5, 186.0, 186.45, 187.6, 188.85, 189.08, 190.9] };
function reachFix(s, w = 1) {
  const upR = 'arm_R_upper', piv = PIV.enemy_ms, t = s._t ?? 0, who = t < 180.25 ? 'e1' : 'e2';
  let keep = 0; for (const te of E_BLADE_T[who]) keep = Math.max(keep, 1 - smooth(0.04, 0.4, Math.abs(t - te)));
  let hw = null;
  if (keep > 0) { const hs = duelHero(t); if (hs) { const H = duelFK({ ...hs, saber: Math.max(hs.saber, 1e-3) }, 'gundam'); hw = H.saber; } }
  for (let it = 0; it < 4; it++) {
    const fk = duelFK(s, 'enemy_ms'), g = gripDeficit(fk);
    if (g.d <= 0.01) return;
    const SR = M.transformPoint([0, 0, 0], fk.torso, sub(piv[upR], piv.torso));
    const X = g.P, X2 = add(X, scl(nrm(sub(g.S, X)), (g.d + 0.06) * w * (g.far ? 1 : -1)));   // too far: draw in; jammed: push out
    const A = r3between(sub(X, SR), sub(X2, SR));
    s.pose[upR] = euler3(r3mul(r3T(r3(fk.torso)), r3mul(A, r3(fk[upR]))));
    if (hw) {   // the contact point on the blade (nearest the hero's weapon) goes back where it was
      const Xa = segSeg(hw[0], hw[1], fk.saber[0], fk.saber[1]).c2, Xb = add(SR, r3v(A, sub(Xa, SR)));
      s.pos = add(s.pos, scl(sub(Xa, Xb), keep));
    }
  }
}
function twoHand(s) {
  return gripLock(s);
  if (SOLVING || !s || !s.vis || !(s.saber > 0.5)) return s;
  // SAMURAI GRIP: both fists on the hilt. The katana is modelled into RONIN's right fist (hand_R mesh): hilt axis in
  // hand_R space from the pommel (−0.2, −2.0, −2.0) up through the fist, direction ≈ (−0.02, 0.31, 0.95). The left fist
  // closes on it 1.5 m lower. Both arms may move (the stance draws in to the centre line), but the blade is held where
  // the choreography put it — rigidly at contact frames, loosely in between.
  const fk0 = duelFK(s, 'enemy_ms');
  const B0 = fk0.saber[0].slice(), B1 = fk0.saber[1].slice();
  let near = 0; for (const te of EV_T()) near = Math.max(near, 1 - smooth(0.05, 0.3, Math.abs((s._t ?? 0) - te)));
  const wBlade = 0.15 + 40 * near;
  const pose = s.pose;
  for (const [p] of TH_VARS) pose[p] = (pose[p] || [0, 0, 0]).slice();
  const cost = () => {
    const fk = duelFK(s, 'enemy_ms');
    const tgt = M.transformPoint([0, 0, 0], fk.hand_R, [-0.2, -1.88, -1.45]);
    const dir = nrm(M.transformDir([0, 0, 0], fk.hand_R, [-0.02, 0.31, 0.95]));
    const g = M.transformPoint([0, 0, 0], fk.hand_L, [0.2, -1.4, 0]);
    const hd = nrm(M.transformDir([0, 0, 0], fk.hand_L, [0.02, 0.31, 0.95]));
    return V.dist(g, tgt) ** 2 + 6 * (1 - V.dot(hd, dir)) + wBlade * (V.dist(fk.saber[0], B0) ** 2 + 0.3 * V.dist(fk.saber[1], B1) ** 2);
  };
  const cur = TH_VARS.map(([p, k]) => pose[p][k]);
  let best = cost(), bestV = cur.slice();
  const mir = { arm_L_upper: 'arm_R_upper', arm_L_lower: 'arm_R_lower', hand_L: 'hand_R' };
  TH_VARS.forEach(([p, k]) => { if (mir[p]) { const r = pose[mir[p]] || [0, 0, 0]; pose[p][k] = k === 0 ? r[0] : -r[k]; } });
  const cm = cost(); if (cm < best) { best = cm; bestV = TH_VARS.map(([p, k]) => pose[p][k]); }
  TH_VARS.forEach(([p, k], i) => { pose[p][k] = bestV[i]; });
  for (let step = 0.5; step > 0.008; step *= 0.6) {
    for (let it = 0; it < 5; it++) {
      let imp = false;
      for (const [p, k] of TH_VARS) {
        const L = JOINT_LIMITS[p]?.[k] || [-3.5, 3.5];
        for (const sg of [1, -1]) {
          const v0 = pose[p][k]; pose[p][k] = clamp(v0 + sg * step, L[0], L[1]);
          const c = cost(); if (c < best - 1e-6) { best = c; imp = true; break; } pose[p][k] = v0;
        }
      }
      if (!imp) break;
    }
  }
  const fk = duelFK(s, 'enemy_ms');
  const tg = M.transformPoint([0, 0, 0], fk.hand_R, [-0.2, -1.88, -1.45]), g = M.transformPoint([0, 0, 0], fk.hand_L, [0.2, -1.4, 0]);
  s.twoHandErr = V.dist(g, tg); s.bladeShift = V.dist(fk.saber[0], B0);
  return s;
}
function duelEnemy1_(t) {
  if (t < DUEL_T0 || t >= DUEL_T1) return null;
  const s = base(t > 160 && t < 180.3);
  s.saberLen = 14;
  if (!s.vis) return s;
  const tw = warp(t);
  if (tw < 170) {   // pre-duel: old erratic pattern, continuous into the keyed track at 170
    const old = (x) => G(-60 + 50 * Math.sin(1.3 * x), 20 + 30 * Math.sin(0.9 * x), -120 + 30 * Math.cos(1.1 * x));
    const k = smooth(166, 170, tw);
    s.pos = lrp(old(tw), e1Pos(170), k);
    s.vel = velOf((x) => lrp(old(x), e1Pos(170), smooth(166, 170, x)), t);
    const f = flat(sub(gundamLaunchPath(tw), s.pos));
    s.fwd = f;
    s.pose = poseObj(micro(t, Float64Array.from(R.aim), 7.1));
    s.speed = Math.hypot(...s.vel); s.smear = sat((s.speed - 35) / 110);
    return s;
  }
  s.pos = e1RawPos(tw);
  const co = collisionOffset('e1', tw); s.pos = add(s.pos, co.off);
  s.vel = velOf((x) => e1RawPos(warp(x)), t); s._pf = (x) => e1RawPos(warp(x)); s._t = t;
  springPose(e1Pose, tw, _pose); e1Imp(tw, _pose);
  // 170–176.45 (scenes 32–35): holds still — heading set once, no squash / weight-shift / jitter / lean, only a float
  const e1K = smooth(169.8, 170.3, tw) * (1 - smooth(176.3, 176.6, tw));
  { const pre = e1K > 0 ? Float64Array.from(_pose) : null;
    e1Squash(tw, _pose); weightShift(e1Pose, tw, _pose, 'arm_R_upper');
    if (pre) for (let i = 0; i < _pose.length; i++) _pose[i] = lerp(_pose[i], pre[i], e1K); }
  micro(t, _pose, 7.1, tw > 179 ? 0.3 : 1 - e1K);
  if (e1K > 0) {   // zero-g float: every joint drifts on its own slow phase, the limbs lagging the body like in water
    const F = [['torso', 0, 0.022, 1.3, 0], ['torso', 2, 0.012, 0.9, 1.1], ['head', 0, 0.03, 1.3, -0.7], ['head', 1, 0.025, 0.7, 2],
      ['arm_R_upper', 0, 0.02, 1.3, -0.5], ['arm_R_lower', 0, 0.018, 1.3, -1.0], ['hand_R', 0, 0.02, 1.3, -1.4],
      ['leg_L_upper', 0, 0.04, 1.1, 0.3], ['leg_L_lower', 0, 0.05, 1.1, -0.4], ['foot_L', 0, 0.07, 1.1, -1.1],
      ['leg_R_upper', 0, 0.05, 0.95, 1.9], ['leg_R_lower', 0, 0.06, 0.95, 1.2], ['foot_R', 0, 0.08, 0.95, 0.5],
      ['leg_L_upper', 2, 0.02, 0.7, 2.5], ['leg_R_upper', 2, 0.02, 0.8, 0.9]];
    for (const [p, c, a, w, ph] of F) _pose[PIDX[p] + c] += Math.sin(t * w + ph) * a * e1K;
  }
  // the beckon: the held-out free hand curls up twice ("come on"), the forearm following a little
  const bk = smooth(172.8, 172.95, tw) * (1 - smooth(173.45, 173.6, tw));
  if (bk > 0) { const c = Math.pow(Math.max(0, Math.sin((tw - 172.85) * Math.PI * 2 * 1.45)), 2);
    _pose[PIDX.hand_L] += 0.75 * c * bk; _pose[PIDX.arm_L_lower] += 0.22 * c * bk; }
  s._grip = (1 - smooth(172.35, 172.6, tw) * (1 - smooth(173.7, 174.2, tw))) * (1 - smooth(179.02, 179.12, tw));   // left hand off the hilt for the taunt / when smashed
  s._idle = e1K;
  s.anchor = s.pos.slice();
  if (e1K > 0) s.pos = add(s.pos, [Math.sin(t * 0.8 + 2) * 0.12 * e1K, Math.sin(t * 1.1 + 1.3) * 0.4 * e1K, Math.sin(t * 0.6) * 0.12 * e1K]);
  if (tw > 179.0) ragdollArr(_pose, 179.0, tw, 1.2, 1);          // smashed: goes limp, limbs flail with the blow's momentum
  _pose[PIDX._body] += co.jolt; _pose[PIDX.torso] += co.jolt * 0.8; _pose[PIDX.head] += co.jolt * 0.6;   // impact jolt
  let f;
  const h = heroRawPos(Math.min(tw, 179.0));
  f = flat(sub(h, s.pos));
  if (ROUGH(tw) > 0) f = nrm(lrp(f, roughDir(e1RawPos, heroRawPos, tw), ROUGH(tw)));
  if (tw > 179.0) {                                   // dead: tumbling away
    const u = tw - 179.0;
    f = yawRot(f, u * 0.9);
    _pose[PIDX._body] += -u * 0.6; _pose[PIDX._body + 2] += u * 0.8;
  }
  s.saber = e1Saber(tw);
  s.boost = Math.max(sat((Math.hypot(...s.vel) - 20) / 60), smooth(176.65, 176.95, tw) * (1 - smooth(177.3, 177.5, tw)),
    0.9 * smooth(172.2, 172.32, tw) * (1 - smooth(172.5, 172.85, tw)));   // brakes onto its mark: one thruster burst
  s.thr = tw > 179 ? 0.15 + 0.5 * (Math.sin(t * 37) > 0.3 ? 1 : 0) : clamp(0.4 + s.boost * 0.6, 0, 1);
  s.damage = 0.1 * smooth(178.2, 178.3, t) + 0.15 * smooth(178.55, 178.6, t) + 0.5 * smooth(179.0, 179.2, t);
  s.eye = tw > 179 ? (Math.sin(t * 43) > 0 ? 0.9 : 0.15) : 1;
  return twoHand(finish(s, _pose, f));
}

const _c_duelEnemy2 = new Map();
export function duelEnemy2(t) {
  if (!STATE_CACHE) return duelEnemy2_(t);
  let r = _c_duelEnemy2.get(t);
  if (r === undefined) { r = solid('e2', t, enemyFree('e2', t)); if (_c_duelEnemy2.size > 64) _c_duelEnemy2.clear(); _c_duelEnemy2.set(t, r); }
  return r;
}
function duelEnemy2_(t) {
  if (t < DUEL_T0 || t >= DUEL_T1) return null;
  const s = base(t > 180.8 && t < 194.2);
  s.saberLen = 14;
  if (!s.vis) return s;
  const tw = warp(t);
  s.pos = e2RawPos(tw);
  const co = collisionOffset('e2', tw); s.pos = add(s.pos, co.off);
  s.vel = velOf((x) => e2RawPos(warp(x)), t); s._pf = (x) => e2RawPos(warp(x)); s._t = t;
  springPose(e2Pose, tw, _pose); e2Imp(tw, _pose);
  const dk = Math.max(E2_DIVE(tw), E2_FLIP(tw));
  { const pre = dk > 0 ? Float64Array.from(_pose) : null;
    e2Squash(tw, _pose); weightShift(e2Pose, tw, _pose, 'arm_R_upper');
    if (pre) for (let i = 0; i < _pose.length; i++) _pose[i] = lerp(_pose[i], pre[i], dk); }
  micro(t, _pose, 3.7, (tw > 192.4 ? 0.3 : 1) * (1 - dk));
  s._idle = dk;
  s._grip = (1 - smooth(184.6, 184.72, tw) * (1 - smooth(185.55, 185.72, tw))) * (1 - smooth(192.45, 192.6, tw));   // free hand off for the somersault / cut down
  _pose[PIDX._body] += co.jolt; _pose[PIDX.torso] += co.jolt * 0.8; _pose[PIDX.head] += co.jolt * 0.6;   // impact jolt
  _pose[PIDX._body] += e2Flip(tw);
  const h = heroRawPos(Math.min(tw, 192.4));
  // over the top (184–185.6): upright, heading level — it cuts DOWN at Sigma and turns over in a clean vertical somersault
  let f = flat(sub(h, s.pos), tw < 184.0 ? 0.8 : lerp(0.35, 0.05, smooth(183.95, 184.2, tw) * (1 - smooth(185.55, 185.85, tw))));
  const dv = E2_DIVE(tw); if (dv > 0) f = nrm(lrp(f, flat(sub(heroRawPos(184.5), s.pos), 0.8), dv));   // aims at where it will strike, not at the wobble
  if (tw > 192.4) {
    const u = tw - 192.4;
    f = yawRot(f, -u * 0.35);
    _pose[PIDX._body] += -u * 0.12; _pose[PIDX._body + 2] += u * 0.25;
  }
  s.saber = e2Saber(tw);
  s.boost = sat((Math.hypot(...s.vel) - 15) / 50);
  s.thr = tw > 192.4 ? 0.1 : clamp(0.45 + s.boost * 0.55, 0, 1);
  s.damage = 0.12 * smooth(188.2, 188.3, t) + 0.6 * smooth(192.4, 193.2, t);
  s.eye = tw > 192.5 ? Math.max(0, 1 - (tw - 192.5) / 1.2) * (Math.sin(t * 50) > -0.2 ? 1 : 0.2) : 1;
  return twoHand(finish(s, _pose, f));
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
  enemy_ms: {
    ms_root: [0, 9.96, 0], pelvis: [0, 9.96, 0], torso: [0, 11.25, 0], head: [0, 14.68, -0.17],
    arm_L_upper: [2.59, 13.67, -0.17], arm_L_lower: [3.43, 11.42, 0.06], hand_L: [3.99, 9.0, 0.28],
    arm_R_upper: [-2.59, 13.67, -0.17], arm_R_lower: [-3.43, 11.42, 0.06], hand_R: [-3.99, 9.0, 0.28],
    leg_L_upper: [1.18, 9.96, 0], leg_L_lower: [1.97, 5.79, -0.06], foot_L: [2.76, 1.41, -0.17],
    leg_R_upper: [-1.18, 9.96, 0], leg_R_lower: [-1.97, 5.79, -0.06], foot_R: [-2.76, 1.41, -0.17],
  },
};
const PARENT = { ms_root: null, pelvis: 'ms_root', torso: 'ms_root', head: 'torso', arm_L_upper: 'torso', arm_L_lower: 'arm_L_upper', hand_L: 'arm_L_lower',
  arm_R_upper: 'torso', arm_R_lower: 'arm_R_upper', hand_R: 'arm_R_lower', leg_L_upper: 'pelvis', leg_L_lower: 'leg_L_upper', foot_L: 'leg_L_lower',
  leg_R_upper: 'pelvis', leg_R_lower: 'leg_R_upper', foot_R: 'leg_R_lower' };
const FK_ORDER = Object.keys(PARENT);
// assets/gundam.glb node translations (glTF): rifle ← hand_R, rifle_muzzle ← rifle; barrel = rifle local +Z.
// (re-check with: python3 -c "…" in blender/DUEL_NOTES.md if the rifle is re-modelled; sanity check compares them)
export const RIFLE_T = [-0.10266, -1.69395, 0.25666];
export const MUZZLE_T = [0, 0.55, 8.4];
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
// the weapons as modelled (measured from assets/mace.glb and the ronin_blade faces of enemy_ms.glb hand_R):
//   mace — grip point at hand_L (0,−1.2,0.6), haft along hand +Z: pommel −1, haft r 0.42 to 7.4, flanged head r ≈1.9
//          7.6–10.2, spike to 12.9;   katana — hand_R local guard → mid → tip, blade half-width ≈ 0.28
export const MACE_LEN = 12.9;
const MACE_SEG = [[-1.0, 7.4, 0.42], [7.6, 10.2, 1.9], [10.4, 12.5, 0.55]];
export const KATANA = { guard: [-0.29, -1.45, 0.3], mid: [-0.34, -0.25, 4.6], tip: [-0.6, 1.46, 8.52], r: 0.28 };
const maceCapsOf = (fk) => { const [a, , d] = fk.saber; return MACE_SEG.map(([z0, z1, r]) => [add(a, scl(d, z0)), add(a, scl(d, z1)), r]); };
const katanaCapsOf = (fk) => [[fk.saber[0], fk.katMid, KATANA.r], [fk.katMid, fk.saber[1], KATANA.r]];
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
    out.rifle = M.mul(M.new(), out.hand_R, M.fromTRS(M.new(), RIFLE_T, [0, 0, 0, 1], 1));
    out.muzzle = M.transformPoint([0, 0, 0], out.rifle, MUZZLE_T);
    out.muzzleDir = nrm(M.transformDir([0, 0, 0], out.rifle, [0, 0, 1]));
  }
  if (model === 'enemy_ms') {   // the katana as modelled in RONIN's right fist (guard → tip, slightly curved)
    const g = M.transformPoint([0, 0, 0], out.hand_R, KATANA.guard), tp = M.transformPoint([0, 0, 0], out.hand_R, KATANA.tip);
    out.saber = [g, tp, nrm(sub(tp, g))]; out.katMid = M.transformPoint([0, 0, 0], out.hand_R, KATANA.mid);
    return out;
  }
  const a = M.transformPoint([0, 0, 0], out.hand_L, [0, -1.2, 0.6]);   // the mace grip point; the haft runs along hand +Z
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

// ============================================================================ events (contact points solved with FK)
// who: attacker; pos: exact world contact point (also 'hero' | 'enemy' tags kept in `on`)
const EV = [
  // t, type, strength, contact spec
  [177.6, 'shake', 0.25, { on: 'hero', note: 'E1 horizontal slash whiffs over the swaying hero' }],
  [178.0, 'block', 0.6, { kind: 'blade-part', blade: 'e1', part: ['hero', 'arm_R_lower', [0, -2, 0]], note: 'E1 backhand caught on the hero arm cannon' }],
  [178.2, 'hit', 0.8, { kind: 'part-part', a: ['hero', 'leg_L_lower', [0, 0, 1]], b: ['e1', 'torso', [0, 0, 2.4]], note: 'hero knee to E1 gut' }],
  [178.55, 'hit', 0.9, { kind: 'part-part', a: ['hero', 'foot_R', [0, -1, 0.5]], b: ['e1', 'torso', [0, 1, 2.4]], note: 'push kick' }],
  [179.0, 'hit', 1.0, { kind: 'blade-part', blade: 'hero', part: ['e1', 'torso', [0, 1, 0]], cut: true, note: 'MACE SMASH on RONIN #1' }],
  [179.15, 'shake', 1.0, { on: 'e1', note: 'E1 explodes (right after the smash)' }],
  [184.5, 'clash', 1.0, { kind: 'blade-blade', note: 'E2 dive plunge blocked overhead' }],
  [186.0, 'clash', 0.8, { kind: 'blade-blade', note: 'S1 diagonal blocked' }],
  [186.45, 'clash', 0.6, { kind: 'blade-blade', note: 'S2 backhand blocked' }],
  [186.85, 'shake', 0.2, { on: 'hero', note: 'S3 thrust — E2 side-steps (whoosh)' }],
  [187.2, 'shake', 0.2, { on: 'hero', note: 'E2 counter cut over the ducking hero (whoosh)' }],
  [187.6, 'clash', 0.8, { kind: 'blade-blade', note: 'E2 overhead blocked' }],
  [188.2, 'hit', 0.9, { kind: 'part-part', a: ['hero', 'arm_R_upper', [0, 0, 0]], b: ['e2', 'torso', [0, 1.5, 2.2]], note: 'shoulder charge' }],
  [188.85, 'clash', 0.7, { kind: 'blade-blade', note: 'bind / blade lock' }],
  ...[188.95, 189.02, 189.08, 189.15].map((t) => [t, 'spark', 0.4, { kind: 'blade-blade', note: 'lock grind' }]),
  [189.45, 'hit', 0.8, { kind: 'part-part', a: ['e2', 'foot_L', [0, -1, 0.5]], b: ['hero', 'torso', [0, 1, 3.2]], note: 'E2 kick breaks the lock' }],
  [190.9, 'clash', 0.7, { kind: 'blade-blade', note: 'slow-mo parry of the thrust' }],
  [192.4, 'hit', 1.0, { kind: 'blade-part', blade: 'hero', part: ['e2', 'torso', [0, 1, 0]], cut: true, note: 'DECISIVE pass-cut' }],
  [194.0, 'shake', 1.2, { on: 'e2', note: 'E2 explodes' }],
];
const MODEL = { hero: 'gundam', e1: 'enemy_ms', e2: 'enemy_ms' };
const stateOf = (who, t) => (who === 'hero' ? duelHero(t) : who === 'e1' ? duelEnemy1(t) : duelEnemy2(t));
function fkAt(who, t) { const s = stateOf(who, t); return duelFK({ ...s, saber: 1 }, MODEL[who]); }
// ---------------------------------------------------------------- contact solver
// Hand-authored key poses are refined at module load so blades really meet at every clash and limbs really land
// on every hit: coordinate descent on a few channels of the keys that sit exactly at the contact time.
const TRACKS = { hero: { pose: heroPose, pos: heroPos }, e1: { pose: e1Pose, pos: e1Pos }, e2: { pose: e2Pose, pos: e2Pos } };
const keyAt = (track, t) => { const k = track.keys.find((q) => Math.abs(q[0] - t) < 1e-6); if (!k) throw new Error('duel: no key at ' + t); return k; };
const band = (x, lo, hi) => (x < lo ? lo - x : x > hi ? x - hi : 0);
// body volumes (part, local point, radius m) — lit blades must stay out of the opponent except at intended hits
export const BODY_VOL = {
  gundam: [['torso', [0, 2, 0], 3.2], ['head', [0, 1, 0], 1.8], ['pelvis', [0, 0, 0], 2.6], ['leg_L_lower', [0, -2, 0], 1.5], ['leg_R_lower', [0, -2, 0], 1.5], ['arm_L_upper', [0, -1, 0], 1.6], ['arm_R_upper', [0, -1, 0], 1.6]],
  enemy_ms: [['torso', [0, 1.5, 0], 2.4], ['head', [0, 1, 0], 1.5], ['pelvis', [0, 0, 0], 2.0], ['leg_L_lower', [0, -2, 0], 1.1], ['leg_R_lower', [0, -2, 0], 1.1], ['arm_L_upper', [0, -1, 0], 1.2], ['arm_R_upper', [0, -1, 0], 1.2]],
};
function bladeIntrusion(blade, fk, model, margin = 0.6) {
  let pen = 0;
  for (const [p, l, r] of BODY_VOL[model]) { const d = segPoint(blade[0], blade[1], partPoint(fk, p, l)).d; pen += Math.max(0, r + margin - d); }
  return pen;
}
let REACH_W = 1;   // contact solve pass 1: contact only (0); pass 2: contact + two-hand reach (1)
function contactCost(ev, t) {
  const foe = t < 180.25 ? 'e1' : 'e2';
  const H = fkAt('hero', t), E = fkAt(foe, t);
  const F = { hero: H, e1: E, e2: E };
  const own = ev.kind === 'blade-blade' || (ev.kind === 'blade-part' && ev.blade !== 'hero');   // RONIN's sword is in play
  return contactCost_(ev, t, H, E, F) + REACH_W * (own && GRIP_ON[foe](t) ? 4 * Math.max(0, gripDeficit(E).d) : 0);   // two hands stay on the hilt
}
function contactCost_(ev, t, H, E, F) {
  if (ev.kind === 'blade-blade') {
    const r = segSeg(H.saber[0], H.saber[1], E.saber[0], E.saber[1]);
    return r.d + 8 * (band(r.s, ev.hs?.[0] ?? 0.3, ev.hs?.[1] ?? 0.85) + band(r.t, ev.es?.[0] ?? 0.3, ev.es?.[1] ?? 0.85))
      + 4 * (bladeIntrusion(H.saber, E, 'enemy_ms') + bladeIntrusion(E.saber, H, 'gundam'));
  }
  if (ev.kind === 'part-part') {
    const pa = partPoint(F[ev.a[0]], ev.a[1], ev.a[2]), pb = partPoint(F[ev.b[0]], ev.b[1], ev.b[2]);
    const lit = t > 184 ? 4 * (bladeIntrusion(H.saber, E, 'enemy_ms') + bladeIntrusion(E.saber, H, 'gundam')) : 0;
    return Math.abs(V.dist(pa, pb) - (ev.gap ?? 1.0)) + lit;
  }
  if (ev.kind === 'aim') {   // rifle barrel onto the target line
    const tgt = aimTarget(ev.t), to = nrm(sub(tgt, H.muzzle));
    const ang = Math.acos(clamp(V.dot(to, H.muzzleDir), -1, 1));
    const fk = F.hero, sh = partPoint(fk, 'arm_R_upper'), hd = partPoint(fk, 'hand_R');
    return ang * 20 + 0.2 * Math.max(0, sh[1] - hd[1] - 2.5);   // keep the hand up near shoulder height
  }
  const bl = F[ev.blade].saber, x = partPoint(F[ev.part[0]], ev.part[1], ev.part[2]);
  const r = segPoint(bl[0], bl[1], x);
  return r.d + 8 * band(r.u, ev.u?.[0] ?? 0.3, ev.u?.[1] ?? 0.85);
}
function solveContact(ev) {
  const t = ev.t;
  const offs = new Map();   // several position params may share one key: key = base + Σ dir·acc
  const params = ev.adj.map(([who, kind, a, b]) => {
    const tr = TRACKS[who][kind], key = keyAt(tr, t);
    if (kind === 'pose') { const i = PIDX[a] + b; const lim = JOINT_LIMITS[a]?.[b] || [-9, 9]; return { get: () => key[1][i], set: (v) => { key[1][i] = clamp(v, lim[0], lim[1]); tr.dirty = true; }, step: 0.18, w: 0.03 }; }
    if (!offs.has(key)) offs.set(key, { base: key[1].slice(), list: [] });
    const o = offs.get(key), me = { dir: nrm(a), acc: 0 };
    o.list.push(me);
    const apply = () => { for (let k = 0; k < 3; k++) key[1][k] = o.base[k] + o.list.reduce((sum, q) => sum + q.dir[k] * q.acc, 0); tr.dirty = true; };
    return { get: () => me.acc, set: (v) => { me.acc = clamp(v, -(b ?? 6), b ?? 6); apply(); }, step: 1.5, w: 0.004 };
  });
  const init = params.map((p) => p.get());
  const cost = () => contactCost(ev, t) + params.reduce((s, p, i) => s + p.w * (p.get() - init[i]) ** 2, 0);
  SOLVING = true;
  const steps0 = params.map((p) => p.step);
  const descend = (iters) => {
    let best = cost();
    params.forEach((p, i) => { p.step = steps0[i]; });
    for (let it = 0; it < iters; it++) {
      let improved = false;
      for (const p of params) {
        for (const sgn of [1, -1]) {
          const v0 = p.get(); p.set(v0 + sgn * p.step);
          const c = cost();
          if (c < best - 1e-6) { best = c; improved = true; } else p.set(v0);
        }
      }
      if (!improved) { for (const p of params) p.step *= 0.5; if (params[0].step < 0.002) break; }
    }
    return best;
  };
  let best = descend(80);
  // stuck in a local minimum (the blades still apart)? a few deterministic random restarts around the start
  if (contactCost(ev, t) > 0.08) {
    const keep = params.map((p) => p.get()); let bestV = keep.slice();
    let seed = Math.round(t * 1000) >>> 0; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    for (let r = 0; r < 8 && contactCost(ev, t) > 0.02; r++) {
      params.forEach((p, i) => p.set(init[i] + rnd() * steps0[i] * 2.5));
      const c = descend(60);
      if (c < best - 1e-6) { best = c; bestV = params.map((p) => p.get()); }
    }
    params.forEach((p, i) => p.set(bestV[i]));
  }
  SOLVING = false;
  return contactCost(ev, t);
}
const TO_E2 = [0, 0, -1];
// shot targets: where E1's chest is just before it quick-boosts (misses) / at the shot (179 hits)
function aimTarget(t) { const tt = t === 179 ? 179 : t - 0.1; return partPoint(duelFK({ ...duelEnemy1(tt), saber: 1 }, 'enemy_ms'), 'torso', [0, 1, 0.5]); }
const AIM_ADJ = [['hero', 'pose', 'arm_R_upper', 0], ['hero', 'pose', 'arm_R_upper', 1], ['hero', 'pose', 'arm_R_lower', 0], ['hero', 'pose', 'hand_R', 0], ['hero', 'pose', 'hand_R', 1], ['hero', 'pose', 'torso', 1]];
const SOLVE = [
  ...SHOT_TIMES.map((t) => ({ t, kind: 'aim', adj: AIM_ADJ, copyTo: t === 179 ? [178.84] : [t - 0.12] })),
  { t: 178.0, kind: 'blade-part', blade: 'e1', part: ['hero', 'arm_R_lower', [0, -2.2, 0]], u: [0.25, 0.8],
    adj: [['e1', 'pose', 'arm_R_upper', 0], ['e1', 'pose', 'arm_R_upper', 1], ['e1', 'pose', 'arm_R_upper', 2], ['e1', 'pose', 'arm_R_lower', 0], ['e1', 'pose', 'hand_R', 0], ['e1', 'pose', 'hand_R', 1], ['e1', 'pose', 'torso', 1], ['e1', 'pos', D1, 5], ['e1', 'pos', [0, 1, 0], 3], ['e1', 'pos', L1, 3]] },
  { t: 178.2, kind: 'part-part', a: ['hero', 'leg_L_lower', [0, 0, 1]], b: ['e1', 'torso', [0, 0, 2.4]], gap: 1.9, adj: [['hero', 'pos', D1, 5], ['hero', 'pos', [0, 1, 0], 3], ['hero', 'pos', L1, 2], ['hero', 'pose', 'leg_L_upper', 0], ['hero', 'pose', 'leg_L_upper', 1]] },
  { t: 178.55, kind: 'part-part', a: ['hero', 'foot_R', [0, -1, 0.5]], b: ['e1', 'torso', [0, 1, 2.4]], gap: 2.0, adj: [['hero', 'pos', D1, 6], ['hero', 'pos', [0, 1, 0], 3], ['hero', 'pose', 'leg_R_upper', 0]] },
  { t: 179.0, kind: 'blade-part', blade: 'hero', part: ['e1', 'torso', [0, 1, 0]], u: [0.6, 0.78], adj: [['hero', 'pose', 'arm_L_upper', 0], ['hero', 'pose', 'arm_L_upper', 1], ['hero', 'pose', 'arm_L_lower', 0], ['hero', 'pose', 'hand_L', 0], ['hero', 'pos', D1, 5], ['hero', 'pos', [0, 1, 0], 4], ['e1', 'pos', [0, 1, 0], 3], ['e1', 'pos', D1, 4], ['hero', 'pose', 'torso', 0]] },
  { t: 184.5, kind: 'blade-blade', hs: [0.12, 0.34], es: [0.4, 0.75], adj: [['e2', 'pose', 'arm_R_upper', 0], ['e2', 'pose', 'arm_R_upper', 1], ['e2', 'pose', 'arm_R_upper', 2], ['e2', 'pose', 'arm_R_lower', 0], ['e2', 'pose', 'hand_R', 0], ['e2', 'pose', 'torso', 0], ['e2', 'pos', [0, 1, 0], 5], ['e2', 'pos', [0, 0, 1], 5], ['e2', 'pos', [1, 0, 0], 4]] },   // on the SHAFT
  { t: 186.0, kind: 'blade-blade', hs: [0.3, 0.75], es: [0.3, 0.75], adj: [['e2', 'pose', 'arm_R_upper', 0], ['e2', 'pose', 'arm_R_upper', 1], ['e2', 'pose', 'arm_R_upper', 2], ['e2', 'pose', 'arm_R_lower', 0], ['e2', 'pose', 'hand_R', 0], ['e2', 'pose', 'hand_R', 1], ['e2', 'pose', 'torso', 1], ['e2', 'pos', [1, 0, 0], 5], ['e2', 'pos', [0, 1, 0], 5], ['e2', 'pos', [0, 0, 1], 6]] },
  { t: 186.45, kind: 'blade-blade', hs: [0.3, 0.75], es: [0.3, 0.75], adj: [['e2', 'pose', 'arm_R_upper', 0], ['e2', 'pose', 'arm_R_upper', 1], ['e2', 'pose', 'arm_R_upper', 2], ['e2', 'pose', 'arm_R_lower', 0], ['e2', 'pose', 'hand_R', 0], ['e2', 'pose', 'hand_R', 1], ['e2', 'pose', 'torso', 1], ['e2', 'pos', [1, 0, 0], 5], ['e2', 'pos', [0, 1, 0], 5], ['e2', 'pos', [0, 0, 1], 6]] },
  { t: 187.6, kind: 'blade-blade', hs: [0.25, 0.6], es: [0.45, 0.85], adj: [['hero', 'pose', 'arm_L_upper', 0], ['hero', 'pose', 'arm_L_upper', 1], ['hero', 'pose', 'arm_L_lower', 0], ['hero', 'pose', 'hand_L', 1]] },
  { t: 188.2, kind: 'part-part', a: ['hero', 'arm_R_upper', [0, 0, 0]], b: ['e2', 'torso', [0, 1.5, 2.2]], gap: 3.6, adj: [['hero', 'pos', TO_E2, 6], ['hero', 'pos', [1, 0, 0], 4], ['hero', 'pos', [0, 1, 0], 3]] },
  ...[188.85, 189.08].map((t) => ({ t, kind: 'blade-blade', hs: [0.2, 0.45], es: [0.2, 0.5], adj: [['e2', 'pose', 'arm_R_upper', 0], ['e2', 'pose', 'arm_R_upper', 1], ['e2', 'pose', 'arm_R_upper', 2], ['e2', 'pose', 'arm_R_lower', 0], ['e2', 'pose', 'hand_R', 0], ['e2', 'pose', 'torso', 1], ['hero', 'pose', 'arm_L_upper', 1], ['hero', 'pose', 'hand_L', 0]] })),
  { t: 189.45, kind: 'part-part', a: ['e2', 'foot_L', [0, -1, 0.5]], b: ['hero', 'torso', [0, 1, 3.2]], gap: 2.0, adj: [['e2', 'pos', [0, 0, 1], 6], ['e2', 'pos', [0, 1, 0], 3], ['e2', 'pos', [1, 0, 0], 3], ['e2', 'pose', 'leg_L_upper', 0], ['e2', 'pose', 'leg_L_upper', 1], ['hero', 'pose', 'arm_L_upper', 1], ['hero', 'pose', 'hand_L', 0], ['e2', 'pose', 'arm_R_upper', 0], ['e2', 'pose', 'hand_R', 0]] },
  { t: 190.9, kind: 'blade-blade', hs: [0.2, 0.5], es: [0.45, 0.85], adj: [['hero', 'pose', 'arm_L_upper', 0], ['hero', 'pose', 'arm_L_upper', 1], ['hero', 'pose', 'hand_L', 0], ['hero', 'pose', 'arm_L_lower', 0], ['e2', 'pos', [1, 0, 0], 3], ['e2', 'pos', [0, 1, 0], 3], ['e2', 'pos', [0, 0, 1], 4]] },
  { t: 192.4, kind: 'blade-part', blade: 'hero', part: ['e2', 'torso', [0, 1, 0]], u: [0.6, 0.78], adj: [['hero', 'pose', 'arm_L_upper', 0], ['hero', 'pose', 'arm_L_upper', 1], ['hero', 'pose', 'arm_L_lower', 0], ['hero', 'pose', 'hand_L', 0], ['e2', 'pos', [1, 0, 0], 4], ['e2', 'pos', [0, 1, 0], 4], ['e2', 'pos', [0, 0, 1], 4]] },
];
// ---------------------------------------------------------------- SAMURAI GRIP bake (two hands on the katana)
// Solved on the POSE KEYS (so the motion between keys stays smooth): both arms may move to bring the left fist onto
// the hilt just below the right, keeping the blade near where it was; after the contact solver, the keys at contact
// times get a left-arm-only pass so the blade stays exactly on its solved contact.
const GRIP_R = [-0.2, -1.88, -1.45], GRIP_DIR_R = [-0.02, 0.31, 0.95], GRIP_L = [0.2, -1.4, 0], GRIP_DIR_L = [0.02, 0.31, 0.95];
function gripErr(fk) {
  const tgt = M.transformPoint([0, 0, 0], fk.hand_R, GRIP_R), dir = nrm(M.transformDir([0, 0, 0], fk.hand_R, GRIP_DIR_R));
  const g = M.transformPoint([0, 0, 0], fk.hand_L, GRIP_L), hd = nrm(M.transformDir([0, 0, 0], fk.hand_L, GRIP_DIR_L));
  // roll about the hilt: two fists stacked on one hilt face the same way (knuckles/fingers wrap the same side) —
  // the mirrored hand_L's local −Y (fingers) must match hand_R's local −Y
  const yl = nrm(M.transformDir([0, 0, 0], fk.hand_L, [0, -1, 0])), yr = nrm(M.transformDir([0, 0, 0], fk.hand_R, [0, -1, 0]));
  return V.dist(g, tgt) ** 2 + 6 * (1 - V.dot(hd, dir)) + 3 * (1 - V.dot(yl, yr));
}
function gripBake(who, t, parts, wBlade) {
  const tr = TRACKS[who].pose, key = keyAt(tr, t);
  const vars = [];
  for (const p of parts) for (const k of (p.includes('lower') ? [0] : [0, 1, 2])) vars.push([PIDX[p] + k, JOINT_LIMITS[p]?.[k] || [-3.5, 3.5]]);
  SOLVING = true;
  const fk0 = fkAt(who, t), B0 = fk0.saber[0].slice(), B1 = fk0.saber[1].slice();
  const cost = () => { const fk = fkAt(who, t); return gripErr(fk) + wBlade * (V.dist(fk.saber[0], B0) ** 2 + 0.3 * V.dist(fk.saber[1], B1) ** 2); };
  let best = cost();
  for (let step = 0.45; step > 0.01; step *= 0.55) {
    for (let it = 0; it < 4; it++) {
      let imp = false;
      for (const [i, L] of vars) for (const sg of [1, -1]) {
        const v0 = key[1][i]; key[1][i] = clamp(v0 + sg * step, L[0], L[1]); tr.dirty = true;
        const c = cost(); if (c < best - 1e-6) { best = c; imp = true; break; } key[1][i] = v0; tr.dirty = true;
      }
      if (!imp) break;
    }
  }
  SOLVING = false;
  return Math.sqrt(gripErr(fkAt(who, t)));
}
const ARMS_BOTH = ['arm_L_upper', 'arm_L_lower', 'hand_L', 'arm_R_upper', 'arm_R_lower', 'hand_R'], ARM_L = ['arm_L_upper', 'arm_L_lower', 'hand_L'];
const GRIP_ON = { e1: (t) => t >= 170 && t <= 179.02 && !(t > 172.4 && t < 174.2), e2: (t) => t >= 180.8 && t <= 192.45 && !(t > 184.58 && t < 185.62) };
export const GRIP_REPORT = [];
for (const who of ['e1', 'e2']) for (const k of TRACKS[who].pose.keys) if (GRIP_ON[who](k[0])) GRIP_REPORT.push([who, k[0], +gripBake(who, k[0], [...ARMS_BOTH, 'torso'], 0.04).toFixed(2)]);
export const SOLVE_REPORT = SOLVE.map((ev) => {
  REACH_W = 0; const pass1 = solveContact(ev); ev._pass1 = pass1;
  REACH_W = 1; const residual = solveContact(ev);
  for (const tc of ev.copyTo || []) {   // hold the solved aim steady from the end of the raise to the shot
    const src = keyAt(TRACKS.hero.pose, ev.t), dst = keyAt(TRACKS.hero.pose, tc);
    for (const p of ['arm_R_upper', 'arm_R_lower', 'hand_R', 'torso']) for (let c = 0; c < 3; c++) dst[1][PIDX[p] + c] = src[1][PIDX[p] + c];
    TRACKS.hero.pose.dirty = true;
  }
  const foe = ev.t < 180.25 ? 'e1' : 'e2';
  SOLVING = true; const H = fkAt('hero', ev.t), E = fkAt(foe, ev.t); const contact = contactCost_(ev, ev.t, H, E, { hero: H, e1: E, e2: E }), reach = gripDeficit(E).d; SOLVING = false;
  return { t: ev.t, kind: ev.kind, residual, contact, reach, pass1: ev._pass1 };
});
// contact keys: the right arm now holds the solved blade — close the left fist on the hilt with the left arm only
for (const ev of SOLVE) for (const who of ['e1', 'e2']) {
  if (!GRIP_ON[who](ev.t)) continue;
  if (!TRACKS[who].pose.keys.some((q) => Math.abs(q[0] - ev.t) < 1e-6)) continue;
  GRIP_REPORT.push([who + '*', ev.t, +gripBake(who, ev.t, ARM_L, 0).toFixed(2)]);
}
/** world position + unit direction of the hero's rifle muzzle at film time t */
export function duelMuzzle(t) {
  const s = duelHero(t);
  if (!s) return null;
  const fk = duelFK(s, 'gundam');
  return { pos: fk.muzzle, dir: fk.muzzleDir };
}
/** the four rifle shots: fire a bolt from `from` along `dir` (aimed at `to`; misses because E1 quick-boosts away) */
export const DUEL_SHOTS = SHOT_TIMES.map((t) => { const m = duelMuzzle(t); const to = aimTarget(t); return { t, from: m.pos, dir: m.dir, to, hit: t === 179, aimError: Math.acos(clamp(V.dot(nrm(sub(to, m.pos)), m.dir), -1, 1)) }; });

function solveEvent([t, type, strength, spec]) {
  const foe = t < 180.25 ? 'e1' : 'e2';
  const ev = { t, type, strength, on: spec.on || 'enemy', note: spec.note, hitstop: (HITSTOPS.find((h) => Math.abs(h[0] - t) < 1e-6) || [0, 0])[1] };
  const H = fkAt('hero', t), E = fkAt(foe, t);
  if (spec.kind === 'blade-blade') {
    const r = segSeg(H.saber[0], H.saber[1], E.saber[0], E.saber[1]);
    ev.pos = r.mid; ev.gap = r.d; ev.on = 'both';
  } else if (spec.kind === 'part-part') {
    const A = spec.a[0] === 'hero' ? H : E, B = spec.b[0] === 'hero' ? H : E;
    const pa = partPoint(A, spec.a[1], spec.a[2]), pb = partPoint(B, spec.b[1], spec.b[2]);
    ev.pos = lrp(pa, pb, 0.5); ev.gap = V.dist(pa, pb); ev.on = spec.b[0] === 'hero' ? 'hero' : 'enemy';
  } else if (spec.kind === 'blade-part') {
    const Bl = spec.blade === 'hero' ? H : E, Pt = spec.part[0] === 'hero' ? H : E;
    const x = partPoint(Pt, spec.part[1], spec.part[2]);
    const r = segPoint(Bl.saber[0], Bl.saber[1], x);
    ev.pos = r.c; ev.gap = r.d; ev.on = spec.part[0] === 'hero' ? 'hero' : 'enemy';
    if (spec.cut) {
      const Bp = fkAt('hero', t - 0.08), Bn = fkAt('hero', t + 0.08);
      const a = segPoint(Bp.saber[0], Bp.saber[1], x).c, b = segPoint(Bn.saber[0], Bn.saber[1], x).c;
      ev.cut = [add(r.c, scl(sub(a, r.c), 1.6)), add(r.c, scl(sub(b, r.c), 1.6))];
    }
  } else {
    const who = spec.on === 'hero' ? 'hero' : spec.on === 'e1' ? 'e1' : spec.on === 'e2' ? 'e2' : foe;
    ev.pos = stateOf(who, t).pos.slice(); ev.on = who === 'hero' ? 'hero' : 'enemy';
  }
  return ev;
}
/** [{t, type, pos:[x,y,z] (exact contact), on:'hero'|'enemy'|'both', strength, hitstop, note, gap, cut?}] */
export const DUEL_EVENTS = EV.map(solveEvent);

// ============================================================================ camera
// Fast cuts (0.6–2.5 s). fn(t, u) returns {pos, target, fov, roll, shake, ...}.
const hp = (t) => duelHero(t).pos, e1p = (t) => duelEnemy1(Math.min(t, 180.19)).pos, e2p = (t) => duelEnemy2(t).pos;
// un-floated positions: the calm opening cameras (scenes 32–35) follow these, so the idle float reads on screen
const hpA = (t) => duelHero(t).anchor || hp(t), e1A = (t) => duelEnemy1(Math.min(t, 180.19)).anchor || e1p(t);
const up = (p, h) => [p[0], p[1] + h, p[2]];
const evShake = (t, list, decay = 5) => { let s = 0; for (const e of [...DUEL_EVENTS, ...(AUTO_READY ? AUTO_FX : [])]) { if (list && !list.includes(e.type)) continue; if (t >= e.t && t < e.t + 1.2) s = Math.max(s, e.strength * Math.exp(-(t - e.t) * decay)); } return s; };
const evFlash = (t) => { let f = 0; for (const e of DUEL_EVENTS) { if (e.type === 'shake' || e.type === 'spark') continue; const d = t - e.t; if (d >= 0 && d < 0.09) f = Math.max(f, 0.35 * e.strength); } return f; };
const evPos = (te) => DUEL_EVENTS.find((e) => Math.abs(e.t - te) < 1e-6).pos;
// side vector of a two-shot line (perpendicular, horizontal)
const sideOf = (a, b) => { const d = nrm(sub(b, a)); return nrm([d[2], 0, -d[0]]); };
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
  // ---- ranged exchange (AC 'Locked In' language: wide, mostly static frames; the quick-boosts happen inside the frame)
  { t0: 170.0, t1: 171.6, name: 'D01 wide establish', fn: (t, u) => { const h = hpA(t), e = e1A(t); const d = nrm(sub(e1A(170), hpA(170))), sd = [d[2], 0, -d[0]]; return { pos: add(add(h, scl(d, -48 + u * 6)), add(scl(sd, 24), [0, 14, 0])), target: lrp(h, e, 0.45), fov: 50, handheld: 0.1, baseShake: 0 }; } },   // steady: axis fixed at the cut
  // STANDOFF (Leone): each cut tighter than the last — over the shoulder, the taunt, his hand answering, its eye, his
  // visor — slow push-ins, no shake; then the charge explodes out of the stillness
  { t0: 171.6, t1: 172.7, name: 'D02 OTS hero — RONIN brakes in', fn: (t, u) => { const h = hpA(t), e = e1A(t), d = nrm(sub(e1A(171.6), hpA(171.6))), sd = [d[2], 0, -d[0]];
    return { pos: add(add(h, scl(d, -26 + u * 6)), add(scl(sd, 11), [0, 10, 0])), target: up(e, 2), fov: 38 - u * 4, handheld: 0.05, baseShake: 0 }; } },
  { t0: 172.7, t1: 173.9, name: 'D03 the taunt', fn: (t, u) => { const e = e1A(t), d0 = nrm(sub(hpA(172.7), e1A(172.7))), a = 0.18 * easeInOut(u);
    const d = [d0[0] * Math.cos(a) + d0[2] * Math.sin(a), 0, -d0[0] * Math.sin(a) + d0[2] * Math.cos(a)], sd = [d[2], 0, -d[0]];
    return { pos: add(add(e, scl(d, 34 - u * 6)), add(scl(sd, -10), [0, 5, 0])), target: up(e, 3), fov: 36 - u * 3, handheld: 0.05, baseShake: 0 }; } },
  { t0: 173.9, t1: 174.7, name: 'D04 at ease — the hanging mace', fn: (t, u) => { const s = duelHero(t), fk = duelFK({ ...s, saber: 1 }, 'gundam'), [a, , md] = fk.saber;
    const chest = partPoint(fk, 'torso', [0, 2, 0]), mh = add(a, scl(md, 8.9)), c = add(lrp(chest, mh, 0.3), [0, 1.5, 0]);
    const d = nrm(sub(e1A(173.9), hpA(173.9))), sd = [d[2], 0, -d[0]];
    return { pos: add(add(c, scl(d, 34 - 4 * u)), add(scl(sd, -12), [0, 2, 0])), target: c, fov: 40, handheld: 0.03, baseShake: 0 }; } },   // the whole of him at ease, arms loose, the mace hanging
  { t0: 174.7, t1: 175.5, name: 'D05 its eye', fn: (t, u) => { const s = duelEnemy1(t), fk = duelFK({ ...s, saber: 1 }, 'enemy_ms'), hd = partPoint(fk, 'head', [0, 0.6, 0]);
    const d = nrm(sub(hpA(174.7), e1A(174.7))), sd = [d[2], 0, -d[0]];
    return { pos: add(add(hd, scl(d, 11 - u * 2.5)), add(scl(sd, 3.5), [0, 0.8, 0])), target: hd, fov: 30 - u * 3, handheld: 0.02, baseShake: 0 }; } },
  { t0: 175.5, t1: 176.4, name: 'D05b his visor', fn: (t, u) => { const s = duelHero(t), fk = duelFK({ ...s, saber: 1 }, 'gundam'), hd = partPoint(fk, 'head', [0, 0.6, 0]);
    const d = nrm(sub(e1A(175.5), hpA(175.5))), sd = [d[2], 0, -d[0]];
    return { pos: add(add(hd, scl(d, 10 - u * 2.5)), add(scl(sd, -3.5), [0, 0.6, 0])), target: hd, fov: 30 - u * 3, handheld: 0.02, baseShake: 0 }; } },
  { t0: 176.4, t1: 177.5, name: 'D06 profile — the charge', fn: (t, u) => { const c = two(hpA(t), e1A(t), { side: -1, dist: 0.9, lift: 5, fov: 44, bias: 0.55 }); return { ...c, handheld: 0.15 }; } },   // from the other side: the blue sun no longer sits between them
  // ---- melee with E1
  { t0: 177.5, t1: 177.74, name: 'D07a insert: slash whips past', fn: (t, u) => { const h = hp(t), e = e1p(t); const d = nrm(sub(e, h)), sd = [d[2], 0, -d[0]]; return { pos: add(add(h, scl(d, 4)), add(scl(sd, -9), [0, 9, 0])), target: up(lrp(h, e, 0.6), 8), fov: 32, roll: -0.15 }; } },
  { t0: 177.74, t1: 178.12, name: 'D07b close two-shot block', fn: (t) => two(hp(t), e1p(t), { side: 1, dist: 1.3, lift: 3, fov: 36, bias: 0.4 }) },
  { t0: 178.12, t1: 178.85, name: 'D08 low impact: knee + kick', fn: (t, u) => { const h = hp(t), e = e1p(t); const m = lrp(h, e, 0.5), sd = sideOf(h, e); return { pos: add(add(m, scl(sd, -30)), [0, -9, 0]), target: up(m, 3), fov: 40, roll: -0.1 }; } },
  { t0: 178.85, t1: 179.6, name: 'D09 OTS point-blank shot', fn: (t) => ({ ...ots(hp(t), e1p(t), { right: 1, back: 30, lift: 8, fov: 38, side: 13 }) }) },
  { t0: 179.6, t1: 180.9, name: 'D10 E1 dies', fn: (t, u) => { const e = e1p(Math.min(t, 180.2)), h = hp(t); const d = nrm(sub(e, h)); const sd = [d[2], 0, -d[0]]; return { pos: add(add(h, scl(d, -26)), add(scl(sd, 18), [0, 8, 0])), target: up(lrp(h, e, 0.7), 6), fov: 44, handheld: 0.4 }; } },
  // ---- E2 arrives
  { t0: 180.9, t1: 181.6, name: 'D11a sensor spike', fn: (t, u) => { const s = duelHero(t); const fk = duelFK({ ...s, saber: 1 }, 'gundam'); const hd = partPoint(fk, 'head', [0, 0.5, 0]); const f = nrm(s.fwd); const sd = nrm([f[2], 0, -f[0]]); return { pos: add(add(hd, scl(f, 10 - u * 2)), add(scl(sd, 3.5), [0, 2.2, 0])), target: add(hd, [0, 0.6 + u * 1.2, 0]), fov: 26, handheld: 0.25 }; } },
  { t0: 181.6, t1: 182.6, name: 'D11b the shadow', fn: (t, u) => { const h = hp(t); const e = e2p(t); const f = nrm(duelHero(t).fwd); const sd = nrm([f[2], 0, -f[0]]); return { pos: add(add(h, scl(f, -16)), add(scl(sd, 12), [0, -3, 0])), target: lrp(up(h, 30), e, 0.97), fov: 24 - u * 5, roll: 0.05, handheld: 0.2 }; } },
  { t0: 182.6, t1: 183.6, name: 'D12 the dive', fn: (t, u) => { const h = hp(t); const e = e2p(t); const d = nrm(sub(h, e)); const sd = nrm([d[2], 0, -d[0]]); return { pos: add(add(e, scl(d, -18)), add(scl(sd, 7), [0, 4, 0])), target: lrp(e, up(h, 6), 0.6), fov: 58 + u * 10, roll: 0.35 * Math.sin(u * 2), handheld: 0.6 }; } },
  { t0: 183.6, t1: 184.45, name: 'D13 saber ignite close', fn: (t, u) => { const s = duelHero(t); const fk = duelFK({ ...s, saber: 1 }, 'gundam'); const hand = partPoint(fk, 'hand_L'); const f = nrm(s.fwd); const sd = [f[2], 0, -f[0]]; return { pos: add(add(hand, scl(f, 9)), add(scl(sd, 7 - u * 2), [0, 1, 0])), target: lrp(hand, fk.saber[1], 0.25), fov: 34 }; } },
  // low behind Sigma, looking up past the mace held flat overhead at RONIN coming down on it; eases back and tilts up as
  // it is thrown off and turns over (the heading is fixed at the cut, the frame follows the somersault slowly)
  { t0: 184.45, t1: 185.75, name: 'D14 shaft block + somersault', fn: (t, u) => { const h = hp(t), e = e2p(t), d0 = flat(sub(e2p(184.45), hp(184.45)), 0), sd = [d0[2], 0, -d0[0]];
    return { pos: add(add(h, scl(d0, -28 - 6 * easeInOut(u))), add(scl(sd, -22 - 4 * easeInOut(u)), [0, 3 + 2 * u, 0])), target: lrp(up(h, 9), e, 0.5 + 0.15 * easeInOut(u)), fov: 46, handheld: 0.12 }; } },
  // ---- sword exchange
  { t0: 185.75, t1: 186.3, name: 'D15 profile dash + S1', fn: (t, u) => { const c = two(hp(t), e2p(t), { side: 1, dist: 1.3, lift: 4, fov: 40, bias: 0.45 }); return { ...c, target: lrp(c.target, evPos(186.0), 0.45) }; } },   // the clash in frame
  { t0: 186.3, t1: 187.0, name: 'D16 OTS E2 → hero', fn: (t) => ots(e2p(t), hp(t), { right: -1, back: 30, lift: 8, fov: 42, side: 17 }) },
  { t0: 187.0, t1: 187.75, name: 'D17 low angle duck', fn: (t, u) => { const h = hp(t), e = e2p(t); const m = lrp(h, e, 0.4), sd = sideOf(h, e); return { pos: add(add(m, scl(sd, 30)), [0, -12, 0]), target: lrp(up(m, 6), evPos(187.6), 0.45), fov: 46, roll: 0.14 }; } },
  { t0: 187.75, t1: 188.5, name: 'D18 wide shoulder charge', fn: (t) => two(hp(t), e2p(t), { side: -1, dist: 1.8, lift: 8, fov: 42, bias: 0.55 }) },
  { t0: 188.5, t1: 189.4, name: 'D19 blade-lock close-up', fn: (t, u) => { const ev = DUEL_EVENTS.find((e) => e.t === 188.85); const X = ev.pos; const h = hp(t), e = e2p(t); const sd = sideOf(h, e); return { pos: add(add(X, scl(sd, 30 - u * 4)), [0, 1, 0]), target: lrp(X, lrp(up(h, 8), up(e, 8), 0.5), 0.4), fov: 38 }; } },
  { t0: 189.4, t1: 190.0, name: 'D20 kick', fn: (t) => two(hp(t), e2p(t), { side: 1, dist: 1.5, lift: 2, fov: 40, bias: 0.4 }) },
  // ---- slow motion finish
  { t0: 190.0, t1: 191.4, name: 'D21 slow-mo thrust comes in', slowmo: true, fn: (t, u) => ({ ...ots(hp(t), e2p(t), { right: 1, back: 30, lift: 6, fov: 42, side: 19 }) }) },
  // the charge: close on the mace head as he pulls it back and it floods with light (slow push-in, the fist in frame)
  { t0: 191.4, t1: 192.2, name: 'D22 the mace charges', slowmo: true, fn: (t, u) => { const s = duelHero(t), fk = duelFK({ ...s, saber: 1 }, 'gundam'), [a, , d] = fk.saber;
    const head = add(a, scl(d, 8.9)), sd = nrm(V.cross([0, 0, 0], d, [0, 1, 0])), f = nrm(s.fwd);
    const toE = sub(e2p(t), head), side = V.dot(sd, toE) < 0 ? sd : scl(sd, -1);   // from the side away from RONIN (never inside it)
    return { pos: add(add(head, scl(side, 12 - 3 * easeInOut(u))), add(scl(d, -3), [0, 3, 0])), target: lrp(head, a, 0.18), fov: 36 - 4 * u, roll: 0.05, handheld: 0.06, baseShake: 0.02 + 0.06 * u }; } },
  { t0: 192.2, t1: 193.0, name: 'D23 slow-mo THE CUT', slowmo: true, fn: (t, u) => { const ev = DUEL_EVENTS.find((e) => e.t === 192.4); const X = ev.pos; return { pos: add(X, [-6, 5, -26]), target: lrp(X, up(hp(t), 6), 0.35), fov: 42 }; } },
  { t0: 193.0, t1: 194.6, name: 'D24 slow-mo walk-away explosion', slowmo: true, fn: (t, u) => { const h = hp(t), e = e2p(Math.min(t, 194.1)); return { pos: add(h, [-18 + u * 2, 3, -24 + u * 3]), target: up(lrp(h, e, 0.3), 5), fov: 46 }; } },
  { t0: 194.6, t1: 197.2, name: 'D25 aftermath', fn: (t, u) => { const h = hp(t); return { pos: add(h, [-16 - u * 12, 6 + u * 3, -30 - u * 10]), target: up(h, 6), fov: 40, handheld: 0.3 }; } },
  { t0: 197.2, t1: 200.0, name: 'D26 aftermath wide', fn: (t, u) => { const h = hp(t); return { pos: add(h, [-40 - u * 10, 12 + u * 4, -48 - u * 8]), target: up(h, 6), fov: 38, handheld: 0.3 }; } },
];
export function duelCamera(t) {
  const c = DUEL_CAMS.find((s) => t >= s.t0 && t < s.t1);
  if (!c) return null;
  const u = sat((t - c.t0) / (c.t1 - c.t0));
  const k = c.fn(t, u);
  const shake = (k.baseShake ?? 0.12) + evShake(t, null, 4.5) * 1.1;   // baseShake 0: a locked-off camera
  const focus = k.target;
  return {
    name: c.name, pos: k.pos, target: k.target, fov: k.fov ?? 40, roll: k.roll ?? 0,
    shake, shakeFreq: 9, handheld: k.handheld ?? 0.25, flash: evFlash(t), blur: 0.0015 * evShake(t, ['clash', 'hit'], 8),
    slowmo: !!c.slowmo, focus, shadowRadius: 70,
  };
}

STATE_CACHE = true;   // all solving done: states are now fixed functions of t

// ============================================================================ hitboxes + automatic contacts
// Every mech part and weapon carries a capsule hitbox (part-local segment + radius, from the model pivots). The whole
// fight is swept at 96 Hz after solving; wherever two capsules START to interpenetrate with a real closing speed —
// scripted or not — a contact is recorded with its exact world point, normal and closing speed. The contacts drive
// sparks / flashes (shots.js), impact sounds (audio.js) and a physical response: both bodies receive an impulse
// (Newton's third law) that shoves them along the normal and twists them about their hips by the lever arm, through a
// damped spring (zero at the contact frame, so solved contacts stay exact).
const mx = (a) => [-a[0], a[1], a[2]];
const capsL = (part, a, b, r) => [[part, a, b, r], [part.replace('_L', '_R'), mx(a), mx(b), r]];
// fitted to the real meshes (blender/ → assets/*.glb): per part, the principal axis of its vertices (2–98 %) and the
// 85th-percentile radius — part-local, same frames as duelFK. The backpack rides on the torso.
const HITBOX = {
  gundam: [
    ['foot_L', [-0.25, -0.78, -1.07], [0.67, -1.03, 1.72], 1.33],
    ['leg_L_lower', [-0.02, -0.64, 0.05], [0.51, -3.64, -0.37], 1.66],
    ['leg_L_upper', [0.83, -1.76, 0.81], [-0.14, -0.61, 0.06], 1.58],
    ['foot_R', [-0.67, -0.98, 1.69], [0.26, -0.79, -1.05], 1.33],
    ['leg_R_lower', [0.02, -0.63, 0.06], [-0.53, -3.65, -0.4], 1.64],
    ['leg_R_upper', [-0.84, -1.8, 0.8], [0.14, -0.57, 0.04], 1.54],
    ['pelvis', [-1.4, 0.43, 0.52], [1.59, 0.45, 0.27], 1.48],
    ['hand_L', [-0.28, -1.29, 1.26], [0.09, -0.15, 0.25], 0.88],
    ['arm_L_lower', [0.87, -2.69, 0.91], [0.31, -0.58, -0.34], 1.37],
    ['arm_L_upper', [0.91, -1.0, -0.45], [0.08, 1.96, 0.06], 1.7],
    ['hand_R', [0.29, -1.32, 1.3], [-0.11, -0.15, 0.27], 0.88],
    ['arm_R_lower', [-1.18, -3.17, 0.66], [-0.27, -0.53, -0.26], 1.37],
    ['arm_R_upper', [0.03, 1.89, 0.1], [-0.89, -1.05, -0.52], 1.68],
    ['torso', [-0.54, 1.05, -3.53], [0.53, 1.02, -3.53], 1.98],
    ['head', [-0.02, 0.76, 1.12], [-0.05, 1.23, -1.77], 1.06],
    ['torso', [-0.26, 4.62, 0.12], [0.11, 2.03, 0.54], 3.02],
  ],
  enemy_ms: [
    ['foot_L', [-0.2, -0.54, -0.37], [0.58, -0.84, 1.64], 0.81],
    ['leg_L_lower', [0.69, -3.71, 0.21], [-0.01, -0.4, 0.17], 0.92],
    ['leg_L_upper', [0.65, -3.28, 0.16], [0.17, -0.45, -0.12], 1.14],
    ['foot_R', [-0.55, -0.82, 1.64], [0.23, -0.53, -0.39], 0.81],
    ['leg_R_lower', [0.04, -0.4, 0.17], [-0.65, -3.7, 0.22], 0.93],
    ['leg_R_upper', [-0.62, -3.29, 0.17], [-0.17, -0.46, -0.13], 1.14],
    ['pelvis', [-1.22, -0.24, 0.26], [1.26, -0.23, 0.25], 1.7],
    ['hand_L', [0.1, -0.9, -0.43], [0.11, -0.28, -0.19], 0.51],
    ['arm_L_lower', [0.93, -1.93, 0.0], [0.3, -0.34, -0.31], 0.75],
    ['arm_L_upper', [-0.1, 0.71, -0.14], [0.84, -1.48, -0.23], 1.14],
    ['hand_R', [-0.22, -1.22, -0.14], [-0.08, -0.56, -0.34], 0.67],
    ['arm_R_lower', [-0.71, -1.92, -0.21], [-0.07, -0.3, -0.31], 0.69],
    ['arm_R_upper', [0.11, 0.72, -0.12], [-0.76, -1.42, -0.23], 1.14],
    ['torso', [-0.03, 1.4, -2.62], [0.0, 0.17, -2.75], 1.72],
    ['head', [-0.03, 0.56, -0.1], [-0.03, 1.47, 0.94], 1.29],
    ['torso', [-0.98, 1.55, -0.78], [0.4, 1.72, 0.12], 2.03],
  ],

};
function capsules(who, s) {
  const model = MODEL[who], fk = duelFK({ ...s, saber: Math.max(s.saber, 1e-3) }, model), out = [];
  for (const [part, a, b, r] of HITBOX[model]) out.push({ who, part, kind: 'body', a: M.transformPoint([0, 0, 0], fk[part], a), b: M.transformPoint([0, 0, 0], fk[part], b), r });
  if (s.saber > 0.5) for (const [a, b, r] of who === 'hero' ? maceCapsOf(fk) : katanaCapsOf(fk)) out.push({ who, part: 'weapon', kind: 'weapon', a, b, r });
  return out;
}
let AUTO_READY = false;
export const AUTO_CONTACTS = (() => {
  const list = [], dt = 1 / 96, last = new Map(), prevIn = new Map();
  const scripted = DUEL_EVENTS.filter((e) => e.type !== 'shake').map((e) => e.t);
  let prev = null;
  for (let t = 170.3; t < 194.0; t += dt) {
    const foe = t < 180.15 ? 'e1' : t > 181.0 && t < 192.35 ? 'e2' : null;
    if (!foe) { prev = null; continue; }
    const hs = duelHero(t), fs = stateOf(foe, t);
    if (!hs || !fs || !fs.vis) { prev = null; continue; }
    const A = capsules('hero', hs), B = capsules(foe, fs);
    const cur = { A, B, foe };
    if (prev && prev.foe === foe) {
      for (let i = 0; i < A.length; i++) for (let j = 0; j < B.length; j++) {
        const ca = A[i], cb = B[j];
        if (ca.kind === 'body' && cb.kind === 'body' && (ca.part === 'pelvis' || cb.part === 'pelvis')) continue;
        const q = segSeg(ca.a, ca.b, cb.a, cb.b), key = i * 64 + j;
        const depth = ca.r + cb.r - q.d + 0.08;   // solid bodies / weapons only ever touch (the constraint keeps them apart)
        const was = prevIn.get(key) || false, now = depth > 0;
        prevIn.set(key, now);
        if (!now || was) continue;
        // closing speed of the two touching points (same segment parameters one step earlier)
        const pa = prev.A[i], pb = prev.B[j];
        if (!pa || !pb) continue;
        const va = scl(sub(q.c1, lrp(pa.a, pa.b, q.s)), 1 / dt), vb = scl(sub(q.c2, lrp(pb.a, pb.b, q.t)), 1 / dt);
        const n = q.d > 1e-4 ? nrm(sub(q.c2, q.c1)) : nrm(sub(vb, va));
        const vn = V.dot(sub(va, vb), n);
        if (vn < 4) continue;
        if (scripted.some((x) => Math.abs(x - t) < 0.12)) continue;          // the choreographed contact already covers it
        const kind = ca.kind === 'weapon' && cb.kind === 'weapon' ? 'weapon-weapon' : ca.kind === 'weapon' || cb.kind === 'weapon' ? 'weapon-body' : 'body-body';
        const pk = ca.part + '|' + cb.part;
        if (t - (last.get(pk) ?? -9) < 0.25) continue;
        last.set(pk, t);
        const pos = lrp(add(q.c1, scl(n, ca.r)), sub(q.c2, scl(n, cb.r)), 0.5);
        list.push({ t: +t.toFixed(4), pos, n, vn, kind, a: 'hero', b: foe, partA: ca.part, partB: cb.part, strength: clamp(vn / 60, 0.15, 1) });
      }
    }
    prev = cur;
  }
  // one physical event per exchange: contacts closer than 0.2 s merge into the hardest one (weapons outrank bodies);
  // body-on-body brushes right around a choreographed hit belong to that hit
  const score = (c) => c.vn * (c.kind === 'body-body' ? 0.5 : 1);
  const kept = [];
  for (const c of list) {
    if (c.kind === 'body-body' && scripted.some((x) => Math.abs(x - c.t) < 0.3)) continue;
    const k = kept[kept.length - 1];
    if (k && c.t - k.t < 0.2) { if (score(c) > score(k)) kept[kept.length - 1] = c; continue; }
    kept.push(c);
  }
  return kept;
})();
AUTO_READY = true;
// the same contacts in DUEL_EVENTS form, for the effect / shake code (sparks + flash-free glow, no cut)
export const AUTO_FX = AUTO_CONTACTS.map((c) => ({ t: c.t, pos: c.pos, type: c.kind === 'weapon-weapon' ? 'clash' : c.kind === 'weapon-body' ? 'hit' : 'spark', strength: c.strength, auto: true }));
// physical response of `who` to every contact (auto + scripted hits/clashes/blocks): shove along the normal and a twist
// from the lever arm about the hip, through a damped spring (0 at contact, peak ~0.12 s, settled by ~0.9 s)
const IMPULSES = [
  ...AUTO_CONTACTS.map((c) => ({ t: c.t, pos: c.pos, n: c.n, vn: c.vn, a: c.a, b: c.b, kind: c.kind })),
  ...DUEL_EVENTS.filter((e) => e.pos && ['clash', 'block'].includes(e.type))   /* hits: collisionOffset */.map((e) => ({ t: e.t, pos: e.pos, n: null, vn: 25 * (e.strength ?? 1), a: 'hero', b: e.t < 180.5 ? 'e1' : 'e2', kind: 'weapon-weapon' })),
];
const MASS = { hero: 1.25, e1: 1, e2: 1 };   // Sigma is the heavier machine
function impulseResponse(who, tw, s) {
  if (!AUTO_READY) return null;
  const off = [0, 0, 0], ang = [0, 0, 0];
  let near = 1; for (const ti of IMPACTS) near = Math.min(near, smooth(0.03, 0.2, Math.abs(tw - ti)));
  if (near <= 0) return null;
  const f = nrm([s.fwd[0], 0, s.fwd[2]]), r = [f[2], 0, -f[0]];
  for (const c of IMPULSES) {
    const lt = tw - c.t;
    if (lt <= 0 || lt > 0.9 || (c.a !== who && c.b !== who)) continue;
    const other = c.a === who ? c.b : c.a;
    const raw = (w, x) => (w === 'hero' ? duelHero_(x) : w === 'e1' ? duelEnemy1_(x) : duelEnemy2_(x));
    let n = c.n || nrm(sub(raw(other, c.t).pos, raw(who, c.t).pos));
    const sign = c.a === who ? -1 : 1;                                    // impulse on `who` points away from the other
    const J = clamp(c.vn, 0, 80) * (c.kind === 'weapon-weapon' ? 0.02 : c.kind === 'weapon-body' ? 0.05 : 0.035) * (MASS[other] / MASS[who]);
    const env = pulse(lt, 8) * (1 - lt / 0.9) * near;
    for (let k = 0; k < 3; k++) off[k] += n[k] * sign * J * env;
    const lever = sub(c.pos, s.pos), tq = V.cross([0, 0, 0], lever, scl(n, sign * J));      // twist about the hip
    ang[0] += clamp(V.dot(tq, r), -8, 8) * 0.012 * env; ang[1] += clamp(tq[1], -8, 8) * 0.01 * env; ang[2] += clamp(V.dot(tq, f), -8, 8) * 0.012 * env;
  }
  return { off, ang };
}
export function applyImpulses(who, t, s) {
  if (!s) return s;
  const res = impulseResponse(who, warp(t), s);
  if (!res) return s;
  const o = { ...s, pos: add(s.pos, res.off), pitch: (s.pitch || 0) + res.ang[0], roll: (s.roll || 0) + res.ang[2] };
  o.fwd = yawRot(s.fwd, res.ang[1]);
  return o;
}

// the solidity corrections, smoothed in time (needs the impulse-driven free motion, so after AUTO_READY)
SOLID = buildSolid();
_c_duelEnemy1.clear(); _c_duelEnemy2.clear();
