// Film time <-> story time.
// Two stretches of screen time are inserted into the story clock:
//  1. The mech melee runs at HEAVY_V (scale-correct timing: an 18 m machine can't move at a man's speed — Pacific Rim
//     weight), and on top of that BULLET TIME on every blow: from just before each contact to 0.5 s (screen) after it
//     the picture runs at SLOW_V, then it releases back. Adds DUEL_EXTRA seconds of film.
//  2. The shield tear: a 0.8 s story moment (267.2–268.0) that plays out over 10.8 s of screen time in first person.
// All choreography/audio tables are written in STORY time; the player clock is FILM time.
export const TEAR_S0 = 267.2, TEAR_S1 = 268.0;          // story window
const TEAR_LEN = 10.8;                                  // film length of the tear window

// every blow of the fight (story time): the swatted bolt (duel.js DODGE.t), then the DUEL_EVENTS clash/block/hit
export const SLOW_HITS = [178.73, 179.95, 183.28, 190.95, 192.05];   // the gunfight: the shield block, its inverted shot, the shield torn off, slipping the full-power beam, the saber cut
// sustained bullet time: the SANDEVISTAN dash (duel.js SANDE0–SANDE1) — the world all but stops while he crosses it
// [from, to, picture speed]: the Sandevistan dash (he still has to read FAST), and inside it the blade going through its
// waist in extreme bullet time (0.1 s of story → ~4 s on screen: the parts being cut and thrown off)
export const SLOW_RANGES = [[183.95, 184.5, 0.45], [184.8, 185.02, 0.1], [191.28, 192.2, 0.4], [192.015, 192.1, 0.025]];   // (+ its rifle transforming)
export const SLOW_V = 0.2;                              // picture speed while slowed
const SLOW_POST = 0.5 * SLOW_V;                         // story seconds held slow after the contact = 0.5 s on screen
// per-blow window (story s): full slow on [h − pre, h + post], smooth ramps rin / rout either side.
// Blows close together get shorter windows so every one still releases before the next comes in.
export const SLOW_WIN = SLOW_HITS.map((h, i) => {
  const gp = i ? h - SLOW_HITS[i - 1] : 1, gn = i < SLOW_HITS.length - 1 ? SLOW_HITS[i + 1] - h : 1;
  return { h, pre: Math.min(0.05, 0.15 * gp), rin: Math.min(0.12, 0.2 * gp), post: Math.min(SLOW_POST, 0.35 * gn), rout: Math.min(0.14, 0.25 * gn) };
});
// the heavy clock: the whole melee (the charge → RONIN #2's death) at HEAVY_V, eased in / out over ~0.5 s
export const HEAVY_V = 0.62, HEAVY_S0 = 998, HEAVY_S1 = 999;   // (the gunfight runs at full speed — no heavy clock)
const heavyK = (s) => ss((s - HEAVY_S0) / 0.5) * (1 - ss((s - HEAVY_S1) / 0.5));
const ss = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0..1 slow-motion amount at story time s */
export function slowK(s) {
  let k = 0;
  for (const w of SLOW_WIN) {
    const a = w.h - w.pre, b = w.h + w.post;
    if (s < a - w.rin || s > b + w.rout) continue;
    k = Math.max(k, s < a ? ss((s - (a - w.rin)) / w.rin) : s > b ? 1 - ss((s - b) / w.rout) : 1);
  }
  return k;
}
/** picture speed (story seconds per film second) at story time s, ignoring the tear */
function rangeV(s, b) {   // the slowest range speed at s (eased in / out over ~0.1 s / 0.03 s for the short one)
  let v = b;
  for (const [a, e, rv] of SLOW_RANGES) { const w = Math.min(0.1, (e - a) * 0.4); if (s > a - w && s < e + w) { const k = s < a ? ss((s - (a - w)) / w) : s > e ? 1 - ss((s - e) / w) : 1; v = Math.min(v, b + (rv - b) * k); } }
  return v;
}
const vAt = (s) => { const b = 1 - (1 - HEAVY_V) * heavyK(s); return Math.min(rangeV(s, b), b + (SLOW_V - b) * slowK(s)); };
// cumulative table: u(s) = s + ∫ (1/v − 1) ds over the duel range
const D0 = SLOW_WIN[0].h - SLOW_WIN[0].pre - SLOW_WIN[0].rin - 0.01;
const DL = SLOW_WIN[SLOW_WIN.length - 1];
const D1 = Math.max(DL.h + DL.post + DL.rout, HEAVY_S0 < 500 ? HEAVY_S1 + 0.5 : 0, ...SLOW_RANGES.map((r) => r[1] + 0.15)) + 0.01;
const DS = 0.0005, DN = Math.ceil((D1 - D0) / DS);
const EXTRA = new Float64Array(DN + 1);
for (let i = 1; i <= DN; i++) { const s = D0 + (i - 0.5) * DS; EXTRA[i] = EXTRA[i - 1] + DS * (1 / vAt(s) - 1); }
export const DUEL_EXTRA = EXTRA[DN];
function duelU(s) {
  if (s <= D0) return s;
  if (s >= D1) return s + DUEL_EXTRA;
  const x = (s - D0) / DS, i = Math.floor(x), f = x - i;
  return s + EXTRA[i] + (EXTRA[Math.min(DN, i + 1)] - EXTRA[i]) * f;
}
function duelS(u) {
  if (u <= D0) return u;
  if (u >= D1 + DUEL_EXTRA) return u - DUEL_EXTRA;
  let lo = D0, hi = D1;
  for (let i = 0; i < 44; i++) { const m = (lo + hi) / 2; if (duelU(m) < u) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export const TEAR_F0 = TEAR_S0 + DUEL_EXTRA;            // film time when the tear window starts
export const TEAR_F1 = TEAR_F0 + TEAR_LEN;              // film time when the tear window ends
export const INSERT_EXTRA = TEAR_LEN - (TEAR_S1 - TEAR_S0);   // 10.0 s
export const STORY_DURATION = 393;   // title card holds 20 s
export const FILM_DURATION = STORY_DURATION + DUEL_EXTRA + INSERT_EXTRA;

// progress shape inside the tear window: a long struggle, then the barrier gives way at the end
const shape = (u) => 0.3 * u + 0.7 * Math.pow(u, 5);
function shapeInv(y) { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (shape(m) < y) lo = m; else hi = m; } return (lo + hi) / 2; }

export function storyT(film) {
  if (film <= TEAR_F0) return duelS(film);
  if (film < TEAR_F1) return TEAR_S0 + (TEAR_S1 - TEAR_S0) * shape((film - TEAR_F0) / TEAR_LEN);
  return film - DUEL_EXTRA - INSERT_EXTRA;
}
export function filmT(story) {
  if (story <= TEAR_S0) return duelU(story);
  if (story < TEAR_S1) return TEAR_F0 + TEAR_LEN * shapeInv((story - TEAR_S0) / (TEAR_S1 - TEAR_S0));
  return story + DUEL_EXTRA + INSERT_EXTRA;
}
/** a time written relative to the tear insert (lines.json "filmTime", designed with the tear at 267.2) → film time */
export const insertFilm = (t) => t - TEAR_S0 + TEAR_F0;
/** 0..1 progress through the stretched first-person tear (film based), or -1 outside */
export function tearU(film) { return film > TEAR_F0 && film < TEAR_F1 ? (film - TEAR_F0) / TEAR_LEN : -1; }
/** duel bullet-time picture speed at a film time (1 = normal, SLOW_V = fully slowed) */
export function slowSpeed(film) { const s = storyT(film); return s > D0 && s < D1 ? vAt(s) : 1; }
/** 0..1 how deep in a blow's bullet time the picture is at a film time (the heavy clock alone doesn't count) */
export function slowHit(film) { const s = storyT(film); return s > D0 && s < D1 ? slowK(s) : 0; }
