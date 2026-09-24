// audio.js — score + sound design for "HOMEWORLD × GUNDAM — 중력의 저편" v3 (382 s)
// Pure WebAudio. Layers:
//   • Pixabay SFX samples  assets/sfx/sfx.json + *.mp3  (built by tools/build_sfx.py) — SAMPLE_CUES
//   • synthesized SFX sweeteners (./audio-synth.js)                                      — CUES
//   • English VO           assets/voice/lines.json + <id>.mp3
//   • AI music stems       assets/music/manifest.json + *.mp3 (the synth score is the fallback) — SECTIONS
//
//   import Score from './audio.js';
//   const score = new Score();
//   await score.init();          // create in a user gesture; fetches + decodes media
//   score.start(0);              // or start(t) to seek; call again to re-seek
//   ... each frame: const t = score.time;   // film master clock (seconds)
//   score.stop(); score.setVolume(0.8);

import { INSTR, VOICE_PRE, buildShared } from './audio-synth.js';
import { buildMusic, heartbeatTimes } from './audio-music.js';
import { ION_SHOTS, ION_BOLT_SPEED } from './ionfire.js';
import { warpSchedule, EXTRA_H, EXTRA_E, EF, MISSILES } from './world.js';
import { DUEL_EVENTS, AUTO_FX, duelHero, duelEnemy1, duelEnemy2 } from './duel.js';   // pure data/functions (no DOM/GPU)

import { filmT, TEAR_S0, TEAR_S1, TEAR_F1, FILM_DURATION, STORY_DURATION } from './timemap.js';
// The Score clock is FILM time. Every table below (CUES, SAMPLE_CUES, SECTIONS, AUTOMATION, ION_SHOTS, DUEL_EVENTS,
// lines.json `t`) is STORY time and is mapped with filmT() when events are built. The first-person tear insert
// (film TEAR_S0–TEAR_F1) is designed directly in film time (insertCues). Voice lines with "filmTime": true are film time.
export const DURATION = FILM_DURATION;          // 392

// =====================================================================================
// PUBLIC KNOBS
// =====================================================================================
export const ASSET_BASE = '../assets/';          // relative to this module
export const USE_VOICES = true;
export const USE_STEMS = true;                   // load assets/music/manifest.json if present
export const USE_SAMPLES = true;                 // load assets/sfx/sfx.json + mp3s
// stems mode: synthesized score reduced to a thin sync layer
export const STEM_SYNC_LAYER = true;
export const SYNC_GAIN = 0.55;
export const SYNC_KEEP_ALWAYS = ['braam', 'boom'];
export const SYNC_KEEP_NEAR_HITS = ['riser', 'revswell', 'cymbal'];
export const SYNC_HITS = [8.6, 120, 158, 216, 262, 268, 273, 280, 300];
export const STEM_GAIN = 0.8;
export const STEM_XFADE = 2.0;
export const PRELOAD = 20;                       // JIT-decode stems / long samples this far ahead (s)
export const HARD_CUTS = [14.0, 63.0];                      // everything started before a cut dies at it
// voice-over + ducking
export const VOICE_GAIN = { narrator: 1.0, radio: 0.72, broken: 0.95 };   // broken = band-limited, needs more
export const DUCK_MUSIC_DB = -9;                 // music under voices AND under big hits (cue opt `duck`)
export const DUCK_SFX_DB = -2.5;                 // SFX under voices only
export const DUCK_ATTACK = 0.08, DUCK_RELEASE = 0.4, HIT_DUCK_RELEASE = 0.9;
// samples
export const SAMPLE_GAIN = 0.85;                 // master trim for all Pixabay samples
export const RATE_VAR = 0.08;                    // ± playbackRate variation per cue
export const GAIN_VAR_DB = 2;                    // ± gain variation per cue
export const VOICE_TRIM = { CMDR: 0.8, SENSOR: 0.8 };   // per-speaker level: fleet command + sensors sit back 20 %
export const MAX_SAMPLES = 96;                   // simultaneous sample voices (lowest prio / oldest stolen)
export const LAZY_BYTES = 1.5e6;                 // samples decoding larger than this (and all loops) are JIT
// synth texture under the samples (EVE bed + railguns), density scaled down in v3
export const BATTLE_TEXTURE = [
  { t0: 120.3, t1: 216, density: 0.45 },
  { t0: 286, t1: 312, density: 0.4 },
];
// mech duel (160–200) — driven by duel.js (DUEL_EVENTS + per-mech states)
export const DUEL_GAIN = 1.0;                   // master trim of the duel layer
export const DUEL_DUCK_DB = -6;                 // music duck on clashes / hits
export const DUEL_RIFLE = [];   // Sigma carries no rifle any more (mace only)

// ship-to-ship ion fire: ONE deliberate sound per visible bolt, from the shared schedule in ionfire.js
export const ION_GAIN = 0.8;                    // overall level of the bolt shots
export const ION_THUD_GAIN = 0.55;              // the small hull-impact thud after each bolt
export const ION_COLD_OPEN = [139.4, 153.4, -139.4, 8.6];   // world range [a,b) shown at film = world + shift, from film 8.6

// Ending (stems mode): F_homeward resolves Eb→Ab (measured). Its final chord region is replayed an octave
// down (rate 0.5 keeps the key) and an Ab-major pad swells under the title (371.8), fading 379.5–381.8.
export const STEM_TAIL = { file: 'F_homeward.mp3', t: 368.8, from: 55.0, len: 3.0, rate: 0.5, gain: 0.85, fadeIn: 1.8, fadeOut: 2.5 };
export const ENDING_PAD = [
  [367.5, 'strings', { notes: [44, 51, 56, 60, 63], dur: 14.3, vel: 0.3, atk: 4, rel: 1.5 }],        // Ab major
  [368.5, 'choir',   { notes: [56, 60, 63], dur: 13.3, vel: 0.32, atk: 3.5, rel: 1.5, vowel: 'oo', vowel2: 'ah' }],
  [371.8, 'choir',   { notes: [68, 72, 75], dur: 10, vel: 0.36, atk: 1.2, rel: 1.5, vowel: 'ah' }],   // swell under the title
  [371.8, 'glass',   { notes: [80, 84, 87], dur: 10, vel: 0.08, atk: 2, rel: 1.5 }],
  [368,   'sub',     { note: 32, dur: 13.8, vel: 0.35, atk: 3, rel: 1.5 }],
];

// =====================================================================================
// MUSIC SECTIONS (synth fallback score). `from` = generator's native start (re-timed for v3).
// =====================================================================================
export const SECTIONS = [
  // ACT I — calm, under the narrator; killed dead at 63.0
  { id: 'S0',   t0: 0,   t1: 8.3, gen: 'voidDrone', from: 0 },        // cold open: peaceful (clipped at 8.3)
  { id: 'S0b',  t0: 8.6, t1: 14,  gen: 'volley', from: 120 },         // cold-open battle wall (dies at the 14.0 cut)
  { id: 'S2',   t0: 16,  t1: 36,  gen: 'lamentA' },                   // MOTHERSHIP ARRIVAL + belly pass
  { id: 'S3',   t0: 36,  t1: 50,  gen: 'lamentB4' },                  // fleet assembles
  { id: 'S4',   t0: 50,  t1: 63,  gen: 'hangar', from: 48 },          // hangar + the promise
  // ACT II
  { id: 'S5',   t0: 63.04, t1: 70, gen: 'warning' },                  // crash cut
  { id: 'S6',   t0: 70,  t1: 80,  gen: 'well', from: 76 },            // well reveal
  { id: 'S7',   t0: 80,  t1: 100, gen: 'enemy', from: 92 },           // enemy windows 81–83, DREADNOUGHT 84–99
  { id: 'S7b',  t0: 100, t1: 108, gen: 'standoff' },
  { id: 'S8',   t0: 108, t1: 120, gen: 'formation' },                 // charge
  // ACT III (grid unchanged)
  { id: 'S9',   t0: 120, t1: 134, gen: 'volley' },
  { id: 'S10',  t0: 134, t1: 150, gen: 'dogfight' },
  { id: 'S11a', t0: 150, t1: 158, gen: 'launchBuild' },
  { id: 'S11b', t0: 158, t1: 190, gen: 'heroic' },
  { id: 'S12b', t0: 190, t1: 194, gen: 'slowmo' },
  { id: 'S12c', t0: 194, t1: 200, gen: 'heroicTail' },
  // ACT IV
  { id: 'S13',  t0: 200, t1: 216, gen: 'lanceCluster' },
  { id: 'S14',  t0: 216, t1: 226, gen: 'lanceAftermath' },
  { id: 'S15',  t0: 226, t1: 240, gen: 'burning' },
  { id: 'S16',  t0: 240, t1: 262, gen: 'dive' },
  // ACT V
  { id: 'S17',  t0: 262, t1: 278, gen: 'core' },
  { id: 'S18',  t0: 278, t1: 292, gen: 'implosion' },
  { id: 'S19',  t0: 292, t1: 310, gen: 'mainCannon' },
  { id: 'S20',  t0: 310, t1: 320, gen: 'retreat' },
  // ACT VI
  { id: 'S21',  t0: 320, t1: 340, gen: 'drift' },
  { id: 'S22',  t0: 340, t1: 356, gen: 'homeward' },                  // homecoming
  { id: 'S23',  t0: 356, t1: 372, gen: 'title' },
  { id: 'S24',  t0: 369, t1: 382, gen: 'titleTail' },                 // synth mode: carries D major to 381.8                     // epilogue
];

// Deterministic PRNG (identical every run / seek)
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function battleTexture(windows) {
  const out = [];
  windows.forEach((w, wi) => {
    const r = rng(7919 + wi * 104729), R = (a, b) => a + r() * (b - a), d = w.density ?? 1;
    out.push([w.t0, 'battleBed', { dur: w.t1 - w.t0, vel: 0.55 }]);
  });
  return out;
}

// ion volleys: [t, main-cannon?, beam body seconds]
// [t, main, body, fail]: before the well collapses (280) every ion charge FAILS — the well drains the coils (power-down whine,
// no beam); after it the volleys land again and the flagship's main gun fires at 300
export const VOLLEYS = [[120, 0, 0, 1], [129, 0, 0, 1], [136, 0, 0, 1], [150.5, 0, 0, 1], [165, 0, 0, 1], [182, 0, 0, 1],
  [288.9, 0, 1.7], [292.5, 0, 1.7], [297.0, 0, 1.7], [300, 1, 5], [303.5, 0, 1.7]];
// HEAVY ion volley: heavy_beam attack + beam_blast1/4 layer (pitched down) + hl_beam sustained body; secondary
// laser_cannon shots from the other frigates. The main cannon plays every layer at ~0.6.
function volley(t, main, body, i, fail) {
  if (fail) return [                                                       // stalled charge bleeding away: a falling whine
    [t - 1.1, 'charge_up', { rate: 0.8, rateTo: 0.25, gain: 0.55, dur: 2.4, fadeOut: 1.0, far: 0.35, pan: i % 2 ? 0.4 : -0.4, prio: 6 }],
  ];
  if (main) return [                                                       // the flagship's main ion cannon: 'beam'
    [t, 'beam', { at: 'hit', gain: 1.4, rate: 0.9, prio: 9, duck: 3, norand: true }],
    [t, 'hl_beam', { loop: true, rate: 0.6, dur: body, gain: 0.5, fadeIn: 0.3, fadeOut: 1.5, prio: 7 }],
  ];
  const r = main ? 0.6 : 0.8, blast = i % 2 ? 'beam_blast4' : 'beam_blast1';
  const c = [
    [t, 'heavy_beam', { rate: r, gain: main ? 1.3 : 1.1, dur: main ? 5 : 2.6, fadeOut: main ? 1.5 : 0.9, prio: 9, duck: main ? 3 : 2, norand: true }],
    [t, blast, { at: 'hit', rate: r, gain: main ? 1.1 : 0.9, prio: 8, norand: true }],
    [t + 0.05, 'hl_beam', { loop: true, rate: r, dur: body, gain: main ? 1.1 : 0.85, fadeIn: 0.12, fadeOut: main ? 1.5 : 0.8, prio: 8 }],
  ];
  if (!main) [0.16, 0.38].forEach((dt, k) => c.push([t + dt, 'laser_cannon:s' + ((i * 2 + k) % 6), { gain: 0.45, pan: k ? 0.45 : -0.5, far: k ? 0.35 : 0.1, prio: 6 }]));
  return c;
}

// =====================================================================================
// SYNTH SFX CUES — [filmTime, type, params] (sweeteners / sounds with no sample)
// =====================================================================================
export const CUES = [
  // ---------------- ACT I
  // ---- COLD OPEN: peaceful pad 0–8.3 (never filtered in stems mode)
  [0,     'sub',        { note: 26, dur: 8.3, vel: 0.3, atk: 3, rel: 0.4 }],
  [0.5,   'strings',    { notes: [50, 57, 62], dur: 7.8, vel: 0.15, atk: 3, rel: 0.4 }],
  [0.8,   'glass',      { notes: [81, 86], dur: 7.5, vel: 0.05, atk: 3, rel: 0.4 }],
  [8.6,   'boom',       { bus: 'sfx', f: 36, vel: 0.9, dur: 3.5, verb: 0.4 }],
  [8.6,   'battleBed',  { dur: 5.4, vel: 0.6 }],
  [29,    'hullRumble', { dur: 12, pan0: -0.8, pan1: 0.8, vel: 0.5 }],     // belly pass sub
  [50,    'hangarAmb',  { dur: 14 }],
  // ---------------- ACT II
  // (red alert: the thin synth stinger + klaxon replaced by heavy hull horns in the sample cues)
  ...[63.04, 64.9, 66.8].map((t, i) => [t, 'boom', { bus: 'sfx', f: 28, vel: 0.9 - i * 0.15, dur: 2.2, verb: 0.5 }]),
  [76,    'groan',      { f: 38, dur: 3, pan: -0.4 }],
  [92,    'groan',      { f: 30, dur: 4, pan: 0.3, vel: 0.6 }],
  [104,   'groan',      { f: 50, dur: 2.5, pan: -0.3, vel: 0.45 }],        // fleet turns
  [110,   'ionCharge',  { dur: 6.5, vel: 0.35 }],
  // ---------------- ACT III
  // sub-bass thump under every ion volley (the samples carry the beam; this carries the weight)
  ...VOLLEYS.filter((v) => !v[3]).map(([t, main]) => [t, 'boom', { bus: 'sfx', f: main ? 30 : 38, vel: main ? 1 : 0.75, dur: main ? 5 : 2.6, verb: 0.35 }]),
  [135,   'flyby',      { pan0: -0.9, pan1: 0.9, vel: 0.5 }],
  [143,   'flyby',      { pan0: 0.9, pan1: -0.9, f0: 1300, f1: 700, vel: 0.5 }],
  [150,   'hangarLights', { n: 3, gap: 0.55 }],
  [150,   'hangarAmb',  { dur: 8, vel: 0.7 }],
  [153,   'eyes',       { vel: 0.6 }],
  [157.9, 'catapult',   { vel: 0.7 }],
  [161,   'flyby',      { dur: 2.4, pan0: -0.9, pan1: 0.9, f0: 520, f1: 260, big: 1, vel: 0.6 }],
  [190,   'slowmo',     { dur: 4 }],
  // ---------------- ACT IV
  [200,   'lanceCharge',{ dur: 16, vel: 0.6 }],
  [216,   'lanceFire',  { vel: 0.8 }],
  [226,   'fireAmb',    { dur: 14 }],
  [226.5, 'alarmMuffled', { dur: 8 }],
  [229.5, 'groan',      { f: 42, dur: 3, pan: 0.4 }],
  [240,   'dive',       { dur: 3.5, vel: 0.6 }],
  [240,   'warp',       { dur: 22, vel: 0.6 }],
  // ---------------- ACT V
  [262,   'wellHum',    { dur: 16, vel: 0.5 }],
  [262,   'growl',      { dur: 1.9, vel: 0.9 }],
  ...[263.4, 265.0, 266.6].map((t, i) => [t, 'shieldHit', { vel: 0.8 + 0.1 * i, pan: [-0.2, 0.25, 0][i] }]),
  ...[[263.55, 1.45, 380, 1100], [265.15, 1.45, 520, 1500], [266.75, 0.5, 700, 1300]].map(([t, dur, f0, f1], i) => [t, 'shieldStrain', { dur, f0, f1, vel: 0.35 + 0.12 * i }]),
  [267.25,'tear',       { dur: 0.75, vel: 0.95 }],   // hands in the shield, ripping it open
  [268,   'shatter',    { vel: 1, shards: 2, count: 46 }],
  [278,   'engulf',     { dur: 2.02, vel: 1 }],      // swallowed by the implosion light → 280 white-out
  [273,   'crunch',     { vel: 1 }],
  [278,   'implosion',  { dur: 2, vel: 0.8 }],
  [280,   'shockwave',  { vel: 0.8 }],
  [292,   'ionCharge',  { dur: 8, big: 1, vel: 0.45 }],
  [303,   'groan',      { f: 30, dur: 3.5, pan: -0.3, vel: 0.8 }],
  [305.4, 'groan',      { f: 26, dur: 2.5, pan: 0.3, vel: 0.8 }],
  [306,   'explosion',  { size: 'huge', pan: 0, vel: 0.7 }],
  // ---------------- ACT VI
  [320,   'debrisAmb',  { dur: 20 }],
  // ---------------- EVE-style synth texture under the sample tracer walls
  // ---------------- hyperspace stretch (world.js): hull snaps back at arrive + ~0.8·dur; departures stretch & squeal
  // (hyperspace in/out = Pixabay 'Atomic Impact' samples, see the SFX cue list)
  ...battleTexture(BATTLE_TEXTURE),
];

// =====================================================================================
// SAMPLE CUES — [filmTime, 'name' | 'name:slice', opts]   (names = assets/sfx/sfx.json)
//   gain, rate (±RATE_VAR applied unless norand), rateTo (ramp over the cue), pan | pan0/pan1 ('rnd'),
//   far 0..1 (distance attenuation + low-pass), dur (truncate / loop length), fadeIn, fadeOut,
//   at: 'hit'  → align the sample's marked hit point (sfx.json `hit`) to filmTime;
//       number without `dur` → lead-in: that many (buffer) seconds of the slice play before filmTime;
//       number with `dur`    → region pick: start that far into the sample (e.g. a part of a long file),
//   loop: true (use the seamless loop), bus ('sfx' default, 'dry' bypasses the master low-pass),
//   duck: seconds (duck music DUCK_MUSIC_DB for that long — big hits), prio (voice stealing, 0..9)
// =====================================================================================
const HB = heartbeatTimes(244, 262);
// enemy frigate (capital) kills: [t, far]
const hash01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // = math.js hash
// enemy capital losses (world.js EF / EXTRA_E die times — all after the well collapses): [t, far]
const CAPITAL_KILLS = [...EF.filter((f) => f.die).map((f, i) => [f.die, [0, 0.2, 0.1, 0.3][i % 4]]),
  ...EXTRA_E.filter((f) => f.die).map((f, i) => [f.die, 0.2 + 0.1 * (i % 3)])].sort((a, b) => a[0] - b[0]);
export const SAMPLE_CUES = [
  // ---------------- ambience beds
  [0,     'space_amb', { loop: true, dur: 14, gain: 0.45, fadeIn: 3, prio: 9 }],     // dies at the 14.0 cut
  // typed HUD card after the cold open (main.js TYPE_LINES): typing sound for exactly as long as each line types
  ...[[14.2, 16, 22], [15.15, 37, 32], [16.55, 35, 30], [17.95, 39, 30]].map(([t, n, cps]) => [t, 'typing', { dur: Math.min(1.75, n / cps), fadeOut: 0.06, gain: 0.35, prio: 8, norand: true }]),
  [16,    'space_amb', { loop: true, dur: 47, gain: 0.55, fadeIn: 2, prio: 9 }],
  // ---------------- COLD OPEN 8.3–14: whip-pan, then a sudden full battle wall; 14.0 hard cut
  [8.3,   'whoosh:a',  { at: 0.5, dur: 1.2, rate: 1.8, gain: 1, pan0: -0.7, pan1: 0.7, prio: 9, norand: true }],
  [8.6,   'braam',     { gain: 1.1, prio: 9, duck: 2.5, norand: true }],
  // cold-open volleys: no rising blast lead-in (it would leak into the peaceful 0–8.3), blast peak only
  ...[8.65, 10.0, 11.5, 12.9].flatMap((t, i) => volley(t, 0, 1.4, i).map((c) => (c[1].startsWith('beam_blast')
    ? [c[0], c[1], { ...c[2], at: c[1] === 'beam_blast1' ? 2.15 : 1.7, dur: 0.9, fadeOut: 0.3 }] : c))),
  [9.4,   'hl_big_explosion', { rate: 0.85, gain: 1.3, pan: 0.3, prio: 9, duck: 1.5, norand: true }],
  [9.45,  'expl_debris', { gain: 0.6, pan: 0.35, prio: 7 }],
  [9.4,   'debris_impact', { at: 1.0, dur: 3, gain: 0.7, pan: 0.3, prio: 7 }],
  [9.5,   'flyby_fast', { at: 2.0, dur: 3, gain: 1.1, pan0: -0.9, pan1: 0.9, prio: 9, norand: true }],   // close fly-by, peak 10.3
  [11.2,  'hl_explosion', { rate: 0.9, gain: 1.2, pan: -0.4, prio: 9, norand: true }],
  [11.5,  'metal_groan', { at: 2.8, dur: 2.2, gain: 0.8, pan: -0.4, prio: 7 }],
  [12.4,  'expl_distant_huge', { gain: 0.6, far: 0.4, pan: 0.6, prio: 6 }],
  [14.0,  'rumble_dark', { loop: true, dur: 2.2, gain: 0.35, fadeIn: 0.4, fadeOut: 0.6, prio: 8, norand: true }],   // near-silence 14–16
  [63.5,  'space_amb', { loop: true, dur: 308.3, gain: 0.5, fadeIn: 8, fadeOut: 4, prio: 9 }],
  // RED ALERT (gravity core): heavy — deep hull horns (braam slowed right down), a muffled low siren inside the hull
  [63.04, 'hit_heavy', { rate: 0.6, gain: 1.1, prio: 9, duck: 1.5, norand: true }],
  ...[63.04, 64.9, 66.8].map((t, i) => [t, 'braam', { rate: 0.5, gain: 1.05 - i * 0.12, dur: 1.9, fadeOut: 0.7, lp: 1400, prio: 9, norand: true }]),
  [63.3, 'alarm',     { rate: 0.55, lp: 900, gain: 0.75, dur: 6.2, fadeOut: 1.5, prio: 8, norand: true }],
  [63.04, 'alarm_amb', { loop: true, rate: 0.7, lp: 800, dur: 57, gain: 0.45, fadeIn: 1, fadeOut: 3, prio: 7 }],
  // ---------------- MOTHERSHIP ARRIVAL 16–30
  [19,    'braam',     { gain: 1, prio: 9, duck: 2.5, norand: true }],
  [24,    'braam2',    { at: 0.15, gain: 0.9, prio: 9, duck: 2.5, norand: true }],
  // belly pass 30–40: long slowed flyby
  [30,    'flyby_large', { rate: 0.7, gain: 1.15, pan0: -0.8, pan1: 0.8, prio: 8, norand: true }],
  [30,    'hl_thruster', { loop: true, dur: 10, rate: 0.6, gain: 0.35, fadeIn: 2, fadeOut: 2.5, pan0: -0.7, pan1: 0.7, prio: 6, norand: true }],
  [34.5,  'flyby_short', { rate: 0.75, far: 0.35, pan0: 0.7, pan1: -0.6, prio: 5 }],   // interceptors under it
  // ---------------- frigate windows 40.5–48.5
  ...[40.5, 42.5, 44.5, 46.5, 48.5].flatMap((t, i) => {
    const pan = [-0.6, 0.5, -0.2, 0.7, -0.4][i];
    return [
    ];
  }),
  // ---------------- hangar 50–57
  // (hangar standby: the gritty servo whines removed — they read as electrical crackle)
  // ---------------- well reveal 70
  // simple & heavy: a beat of silence (music ducked), then one enormous hit as space caves in, a second pulse at 74.5
  [70,    'boom_cine', { gain: 1, prio: 9, duck: 4, norand: true }],
  [70,    'braam',     { rate: 0.8, gain: 1, prio: 9, duck: 4, norand: true }],
  [70,    'hit_heavy', { gain: 0.9, prio: 9, norand: true }],
  [70.3,  'black_hole', { loop: true, dur: 50, gain: 1, fadeIn: 1.5, fadeOut: 6, rate: 0.7, rateTo: 0.9, prio: 9, norand: true }],
  [70.2,  'rumble_dark', { loop: true, dur: 11, gain: 0.9, fadeIn: 0.2, fadeOut: 3, prio: 8, norand: true }],
  [74.5,  'braam2',    { at: 0.15, rate: 0.85, gain: 1, prio: 9, duck: 3, norand: true }],
  [74.5,  'expl_distant_huge', { rate: 0.7, gain: 0.8, prio: 8, norand: true }],
  [77.2,  'metal_groan', { rate: 0.8, gain: 0.9, pan: -0.4, prio: 7, norand: true }],
  // ---------------- enemy windows 81–83 + DREADNOUGHT 84–99
  ...[81.6, 82.3].flatMap((t, i) => [
  ]),
  [84,    'rumble_dark', { loop: true, dur: 16, gain: 1, fadeIn: 2, fadeOut: 3, prio: 9, norand: true }],
  [85,    'braam',     { gain: 1, prio: 9, duck: 2.5, norand: true }],
  [90,    'braam2',    { at: 0.15, gain: 0.95, prio: 9, duck: 2.5, norand: true }],
  [95,    'braam',     { rate: 0.89, gain: 1, prio: 9, duck: 3, norand: true }],
  [99.5,  'metal_groan', { far: 0.3, gain: 0.6, pan: 0.4, prio: 5 }],
  [104,   'metal_groan', { far: 0.5, gain: 0.5, pan: -0.5, rate: 0.85, prio: 5 }],
  // ---------------- charge 110–120
  [110,   'hl_charge', { gain: 0.95, dur: 7.2, fadeOut: 1.6, prio: 8, norand: true }],
  // ...the charge stalls at ~116 and bleeds away toward the well: falling whines, then a dead click after "FIRE!"
  [116.1, 'charge_up', { rate: 0.9, rateTo: 0.3, gain: 0.85, dur: 3.4, fadeOut: 1.4, prio: 8, norand: true }],
  [116.5, 'charge_up', { rate: 0.75, rateTo: 0.25, gain: 0.5, dur: 3, fadeOut: 1.2, pan: 0.5, far: 0.3, prio: 6 }],
  [116.8, 'charge_up', { rate: 0.8, rateTo: 0.25, gain: 0.5, dur: 3, fadeOut: 1.2, pan: -0.5, far: 0.3, prio: 6 }],
  [120.05, 'metal_knock', { rate: 0.5, gain: 0.5, prio: 7, norand: true }],
  // point defence swats down every missile of the salvo (world.js MISSILES / missileEnd)
  ...MISSILES.map((m, i) => [m.t0 + m.dur * (0.45 + hash01(m.seed * 3.9 + 1) * 0.3), 'hl_explosion', { rate: 1.35, gain: 0.45, far: 0.35 + 0.1 * (i % 3), pan: i % 2 ? 0.4 : -0.4, prio: 4 }]),
  // ---------------- volleys
  ...VOLLEYS.flatMap(([t, main, body, fail], i) => volley(t, main, body, i, fail)),
  // ---------------- missiles
  ...[136, 136.6, 137.3, 141.8, 142.4, 143].map((t, i) => [t, 'missile', { pan0: i % 2 ? 0.6 : -0.6, pan1: i % 2 ? -0.4 : 0.5, gain: 0.8, far: (i % 3) * 0.15, prio: 6 }]),
  // ---------------- ship kills (enemy losses only after the well collapses; the mech kills in the duel)
  ...CAPITAL_KILLS.map(([t, far], i) => [t + 0.03, ['expl_epic', 'expl_metal', 'expl_distant_huge', 'expl_distant'][i % 4], { far, pan: [0.4, -0.3, 0.2, -0.5, 0.5, -0.1][i % 6], gain: 0.5, prio: 5 }]),
  ...[[180.2, 'expl_metal'], [180.25, 'expl_debris'], [194, 'expl_epic'], [194.05, 'expl_debris']].map(([t, sp]) => [t + 0.03, sp, { far: 0, gain: 0.5, prio: 5 }]),
  // homeland explosions (its conventions: size → playbackRate; capital = big_explosion 0.98→0.74 + explosion 0.86→0.76)
  ...CAPITAL_KILLS.flatMap(([t, far], i) => {
    const pan = [0.4, -0.3, 0.2, -0.5, 0.5, -0.1][i % 6];
    return [
      [t, 'hl_big_explosion', { rate: 0.92, gain: 1.1, far, pan, prio: far < 0.2 ? 8 : 7, duck: far < 0.2 ? 1.6 : 0 }],   // enemy frigate: capital kill
      [t, 'hl_explosion', { rate: 0.84, gain: 0.9, far, pan, prio: 6 }],
    ];
  }),
  ...CAPITAL_KILLS.map(([t, far], i) => [t + 0.3 + 0.1 * (i % 6), i % 2 ? 'debris_impact' : 'metal_groan',
    i % 2 ? { at: 1.0, dur: 3.5, fadeOut: 1, gain: 0.6, far, pan: [0.4, -0.3, 0.2, -0.5, 0.5, -0.1][i % 6], prio: 5 }
          : { at: 2.8, dur: 2.6, fadeOut: 0.8, rate: 0.8, gain: 0.65, far, pan: [0.4, -0.3, 0.2, -0.5, 0.5, -0.1][i % 6], prio: 5 }]),
  ...[180.2, 194].flatMap((t) => [                                                                                   // enemy mechs explode
    [t, 'hl_explosion', { rate: 1.0, gain: 1.3, prio: 9, duck: 2, norand: true }],
    [t, 'hl_big_explosion', { rate: 1.05, gain: 1.0, prio: 9, norand: true }],
    [t + 0.05, 'expl_debris', { gain: 0.9, prio: 8, norand: true }],
  ]),
  // the strike leader's wingmen die one by one (shots.js STRIKE): close, loud, each with a debris rattle
  ...[[136.1, 0.5], [137.9, -0.4], [139.7, 0.2]].flatMap(([t, pan]) => [
    [t, 'hl_explosion', { rate: 1.12, gain: 1.05, pan, prio: 9, duck: 0.8, norand: true }],
    [t + 0.03, 'expl_debris', { rate: 1.1, gain: 0.55, pan, prio: 7, norand: true }],
  ]),
  ...Array.from({ length: 24 }, (_, n) => [134.3 + n * 0.26, 'laser_shot', { gain: 0.35, rate: 1.25, far: 0.25, pan: [-0.3, 0.1, 0.4][n % 3], prio: 5 }]),   // the bandits' guns
  // fighter kills (small)
  ...[138, 141.6, 145, 148.6, 152, 157, 163, 171, 178, 189].map((t, i) => [t, 'hl_explosion', { rate: 1.22, gain: 0.75, far: 0.3 + 0.1 * (i % 3), pan: 'rnd', prio: 5 }]),
  ...[138, 145, 152, 163, 178].map((t, i) => [t + 0.04, 'expl_debris', { rate: 1.15, gain: 0.3, far: 0.4, pan: 'rnd', prio: 3 }]),
  // ---------------- mech launch 150–161
  [151,   'servo',     { gain: 0.6, pan: -0.2, prio: 6 }],
  [152.2, 'servo',     { gain: 0.6, pan: 0.3, rate: 0.85, prio: 6 }],
  [153,   'mech_powerup', { gain: 1, prio: 8, norand: true }],
  [154.4, 'servo',     { gain: 0.6, pan: 0, rate: 1.1, prio: 6 }],
  [155,   'mech_steps:four', { gain: 0.9, prio: 7, norand: true }],
  [157.9, 'whoosh:a',  { gain: 1, prio: 8, pan0: -0.3, pan1: 0.6, norand: true }],
  [157.9, 'rumble',    { gain: 0.8, prio: 8, duck: 1.5 }],
  [157.9, 'hl_thruster', { loop: true, dur: 12.1, rate: 0.95, rateTo: 1.15, gain: 0.4, fadeIn: 0.4, fadeOut: 2, prio: 6, norand: true }],
  [161,   'flyby_fast', { at: 'hit', gain: 1, pan0: -0.9, pan1: 0.9, prio: 8, norand: true }],
  // ---------------- mech duel
  ...Array.from({ length: 24 }, (_, k) => [172 + k * 0.26, k % 3 ? 'laser_shot' : 'laser_shot2', { dur: 0.6, fadeOut: 0.2, rate: 1.05 + 0.1 * Math.sin(k * 2.3), gain: 0.7, far: 0.15, pan: 0.45, prio: 7 }]),   // enemy mech wrist laser (one per bolt, shots.js)
  [190,   'whoosh_rev', { rate: 0.6, gain: 0.7, prio: 7, norand: true }],
  // ---------------- lance 200–216
  [200,   'rumble_dark', { loop: true, dur: 16, gain: 1.1, fadeIn: 3, rate: 0.9, prio: 9, norand: true }],
  [201.5, 'charge_weapon', { bus: 'dry', rate: 0.6, gain: 1.3, prio: 10, norand: true, dur: 14.5, fadeOut: 0.05 }],
  // the lance charge must be HEARD: a long rising power whine under it (dry bus, climbs in pitch to the shot), a final spike
  [200.2, 'hl_charge2', { bus: 'dry', rate: 0.62, rateTo: 1.2, dur: 15.8, gain: 1.2, fadeIn: 2.0, fadeOut: 0.05, prio: 10, norand: true }],
  [212.4, 'charge_up', { bus: 'dry', rate: 0.75, rateTo: 1.5, dur: 3.6, gain: 1.1, fadeIn: 0.3, fadeOut: 0.05, prio: 10, norand: true }],
  [216,   'big_beam:fire', { rate: 0.8, gain: 1.2, prio: 9, duck: 4, norand: true }],
  [216,   'expl_nuke', { gain: 1, prio: 9, norand: true }],
  [216.05,'shockwave', { gain: 0.9, prio: 9, norand: true }],
  ...[[217, 'expl_epic'], [218.5, 'expl_metal'], [219.6, 'expl_debris'], [221, 'expl_epic'], [223, 'expl_metal']].map(([t, s], i) =>
    [t + 0.03, s, { gain: 0.55, pan: [0, -0.4, 0.3, -0.2, 0.4][i], far: i ? 0.15 : 0, prio: 6 }]),
  ...[217, 218.5, 219.6, 221, 223].flatMap((t, i) => [
    [t, 'hl_big_explosion', { rate: [0.8, 0.9, 0.95, 0.82, 0.88][i], gain: 1.2, pan: [0, -0.4, 0.3, -0.2, 0.4][i], prio: 9, norand: true }],
    [t, 'hl_explosion', { rate: 0.78, gain: 0.9, pan: [0, -0.4, 0.3, -0.2, 0.4][i], prio: 7 }],
  ]),
  [218,   'tinnitus',  { bus: 'dry', dur: 6.3, gain: 0.8, fadeIn: 0.2, fadeOut: 2, prio: 9, norand: true }],
  // aftermath 226–240
  [226.3, 'power_down', { gain: 0.8, prio: 7 }],
  [227,   'metal_groan', { gain: 0.8, pan: -0.3, prio: 7 }],
  [231.5, 'metal_groan', { gain: 0.7, pan: 0.4, rate: 0.85, far: 0.2, prio: 7 }],
  [233,   'power_down', { gain: 0.6, rate: 0.8, pan: 0.3, far: 0.3, prio: 6 }],
  [238,   'metal_groan', { gain: 0.7, pan: 0, rate: 0.75, prio: 7 }],
  // ---------------- dive 240–262 + core 262–280
  [240,   'whoosh:c',  { gain: 0.9, rate: 0.8, prio: 8, norand: true }],
  [240,   'hl_thruster', { loop: true, dur: 22, rate: 0.9, rateTo: 1.1, gain: 0.32, fadeIn: 1, fadeOut: 2, prio: 6, norand: true }],
  [240,   'black_hole', { loop: true, dur: 38, gain: 1.1, fadeIn: 3, rate: 0.7, rateTo: 1.45, prio: 9, norand: true }],
  ...HB.map((t, i) => [t - 0.1, 'heartbeat:s' + (i % 3), { gain: 0.6 + 0.4 * i / HB.length, prio: 8, norand: true }]),
  // ---- WELL ASSAULT 262–273: berserk mech tears through the core's energy shield (no dialogue)
  // ---- the second RONIN from above: warning pulse, sting, ignition roar, the dive
  ...[180.95, 181.15, 181.35].map((t) => [t, 'alarm', { dur: 0.16, fadeOut: 0.05, rate: 1.4, gain: 0.55, prio: 7, norand: true }]),
  [181.0, 'braam2',    { at: 0.15, rate: 1.1, gain: 0.8, prio: 8, norand: true }],
  // launch run: an enemy ion bolt screams in, Sigma rolls out of its way (duel.js DODGE 166.65)
  [166.03, 'laser_cannon:s2', { dur: 1.2, fadeOut: 0.5, rate: 0.7, gain: 0.5, far: 0.55, pan: 0.3, prio: 7, norand: true }],
  [166.35, 'flyby_fast', { rate: 0.8, gain: 0.8, pan0: 0.1, pan1: 0.5, dur: 0.5, fadeOut: 0.2, prio: 8, norand: true }],   // incoming
  [166.65, 'metal_knock', { at: 'hit', rate: 0.72, gain: 1.2, pan: 0.3, prio: 10, norand: true }],                             // off the vambrace
  [166.65, 'axe_metal1', { at: 'hit', rate: 0.85, gain: 0.8, pan: 0.3, prio: 9, norand: true }],
  [166.66, '@sparkBurst', { vel: 0.8, pan: 0.35 }],
  [166.7, 'flyby_fast', { rate: 1.1, gain: 0.7, pan0: 0.4, pan1: 0.95, prio: 8, norand: true }],                                // ricochet away
  [182.05, 'hl_thruster', { loop: true, dur: 1.4, rate: 0.9, rateTo: 1.4, gain: 0.9, fadeIn: 0.05, fadeOut: 0.5, prio: 8, norand: true }],
  [182.5, 'flyby_fast', { rate: 0.8, gain: 1.0, pan0: 0.6, pan1: -0.4, prio: 8, norand: true }],
  [262,   'mech_powerup', { rate: 0.5, gain: 1.1, prio: 9, norand: true }],          // feral roar
  [262.05,'servo',     { rate: 0.5, gain: 0.9, prio: 8, norand: true }],
  [262,   'braam',     { rate: 0.85, gain: 1, prio: 9, duck: 2, norand: true }],
  ...[263.4, 265.0, 266.6].flatMap((t, i) => [[t, 'hit_heavy', { gain: 0.9 + 0.1 * i, rate: 1.05 - 0.07 * i, prio: 9, duck: 1.1, norand: true }]]),
  [267.25,'metal_groan', { at: 2.9, dur: 0.8, rate: 1.25, gain: 0.8, fadeOut: 0.05, prio: 8, norand: true }],   // servo strain
  [267.3, 'servo',     { rate: 0.7, gain: 0.8, dur: 0.7, fadeOut: 0.05, prio: 8, norand: true }],
  [268,   'boom_cine', { gain: 1.1, prio: 9, duck: 2.5, norand: true }],               // SHATTER
  // barrier collapse: the energy dies with a deep power-down, a shock hit, and a glassy cascade as cells blow out
  [268.02, 'power_down', { rate: 0.55, gain: 1.1, prio: 9, norand: true }],
  [268.05, 'shockwave', { gain: 0.9, rate: 0.8, prio: 8, norand: true }],
  [268.1, 'expl_debris', { gain: 0.8, rate: 1.3, prio: 7, norand: true }],
  ...Array.from({ length: 14 }, (_, i) => [268.03 + Math.pow(i / 13, 1.4) * 1.1, '@metalRing', { vel: 0.5 * (1 - i / 16), f0: 1800 + 900 * Math.sin(i * 2.7), dec: 0.35, pan: Math.sin(i * 1.9) * 0.7 }]),
  [268,   'whoosh_rev', { at: 'hit', rate: 1.2, gain: 0.6, prio: 7, norand: true }],
  [270,   'whoosh:c',  { rate: 1.1, gain: 1, dur: 2.8, fadeOut: 0.3, prio: 8, norand: true }],   // rush into the core
  [270,   'hl_thruster', { loop: true, dur: 2.8, rate: 1.1, rateTo: 1.5, gain: 0.8, fadeIn: 0.3, fadeOut: 0.1, prio: 8, norand: true }],
  [270.3, 'charge_weapon', { rate: 0.8, gain: 0.8, dur: 2.6, fadeOut: 0.2, prio: 8, norand: true }],   // mace energises
  [273,   'hit_heavy', { gain: 1, prio: 9, duck: 2, norand: true }],
  [273,   'braam2',    { at: 0.15, gain: 1, prio: 9, norand: true }],
  [273,   'expl_metal', { gain: 1, rate: 0.8, prio: 9, norand: true }],
  [273.1, 'metal_groan', { at: 2.8, dur: 3, fadeOut: 1, rate: 0.7, gain: 1, prio: 8, norand: true }],
  [272.8, 'whoosh:b',  { rate: 1.3, gain: 0.8, prio: 8 }],
  [280,   'whoosh_rev', { at: 'hit', rate: 0.75, gain: 1, prio: 9, norand: true }],
  [280,   'expl_nuke', { gain: 1.1, prio: 9, duck: 4, norand: true }],
  [280,   'boom_cine', { gain: 1, prio: 9, norand: true }],
  [280.05,'shockwave', { gain: 1, prio: 9, norand: true }],
  [283,   'expl_distant_huge', { gain: 0.6, far: 0.4, prio: 6 }],
  // ---------------- main cannon 292–306
  [295.7, 'rumble_dark', { loop: true, dur: 4.4, gain: 0.9, fadeIn: 1, fadeOut: 0.3, prio: 8, norand: true }],
  [295.7, 'hl_charge2', { at: 14.5, dur: 4.3, gain: 1, fadeIn: 0.4, fadeOut: 0.05, prio: 8, norand: true }],
  [296.2, 'charge_up', { rate: 0.25, gain: 1, prio: 8, norand: true }],
  [300.35,'hl_big_explosion', { rate: 0.74, gain: 1.4, prio: 9, duck: 3, norand: true }],   // impact on the dreadnought
  [300,   'boom_cine', { gain: 1, prio: 9, norand: true }],
  [303,   'expl_debris', { gain: 1, pan: -0.3, prio: 8 }],
  [303.3, 'metal_groan', { gain: 0.9, rate: 0.7, prio: 8 }],
  [304.1, 'expl_epic', { gain: 1, pan: 0.35, far: 0.1, prio: 8 }],
  [304.8, 'debris_impact', { at: 'hit', gain: 0.9, prio: 8 }],
  [305.4, 'expl_metal', { gain: 0.9, pan: -0.2, prio: 8 }],
  ...[[303.3, 0.9, -0.4], [304.1, 0.95, 0.35], [305.4, 0.88, -0.2]].map(([t, r, pan]) => [t, 'hl_explosion', { rate: r, gain: 1, pan, prio: 8 }]),
  [303.8, 'debris_impact', { at: 1.0, dur: 4, gain: 0.75, pan: 0.3, prio: 7 }],
  [305.9, 'metal_groan', { at: 2.8, dur: 3, rate: 0.7, gain: 0.8, pan: -0.3, prio: 7 }],
  [306.6, 'debris_impact', { at: 1.0, dur: 4.5, gain: 0.9, prio: 8, norand: true }],
  [306.9, 'metal_groan', { at: 2.8, dur: 3.2, rate: 0.62, gain: 0.85, pan: 0.2, prio: 7, norand: true }],
  [306,   'hl_big_explosion', { bus: 'dry', rate: 0.68, gain: 1.9, prio: 10, duck: 4.5, duckDb: -10, norand: true }],   // DREADNOUGHT dies
  ...[0.3, 0.65, 1.0, 1.4].map((d, i) => [306 + d, 'hl_big_explosion', { rate: 0.8 + 0.05 * i, gain: 0.9, pan: [-0.4, 0.35, -0.2, 0.5][i], prio: 8, norand: true }]),   // chain
  [306,   'hl_explosion', { rate: 0.76, gain: 1.1, prio: 9, norand: true }],
  [306.08,'expl_epic', { gain: 0.6, prio: 7 }],
  [306.05,'expl_nuke', { bus: 'dry', gain: 1.3, rate: 0.8, prio: 10, norand: true }],
  [306.1, 'shockwave', { gain: 1.1, rate: 0.85, prio: 9, norand: true }],
  [306.3, 'debris_impact', { gain: 0.7, far: 0.2, pan: 0.3, prio: 7 }],
  // ---------------- enemy flee windows 311.5–317
  // ---------------- NEW ENDING: 344 the fleet jumps out, 347.5 arrival at Earth, narration from ~348.5
  // Sigma comes to: thrusters cough (334.2–335.6), catch, and the burn builds to full by ~338
  ...[334.3, 334.75, 335.2].map((t, i) => [t, 'hl_thruster', { loop: true, dur: 0.3, rate: 0.6, gain: 0.35 + 0.1 * i, fadeIn: 0.03, fadeOut: 0.15, prio: 7, norand: true }]),
  [335.6, 'hl_thruster', { loop: true, dur: 5.0, rate: 0.62, rateTo: 1.1, gain: 1.0, fadeIn: 1.8, fadeOut: 1.0, prio: 8, norand: true }],   // builds to a hard burn home
  [344.0, 'whoosh:c',  { rate: 0.9, gain: 0.8, prio: 8, norand: true }],
  [348,   'braam',     { rate: 0.8, gain: 0.6, fadeOut: 1.5, prio: 8, norand: true }],
  [348.2, 'flyby_large', { rate: 0.45, gain: 0.6, fadeIn: 2, pan0: -0.3, pan1: 0.3, prio: 7, norand: true }],   // mothership emerging, slow
];

// tracer walls: many minigun / heavy_mg bursts, near and far (deterministic)
// First-person shield tear insert, FILM time TEAR_S0 (267.2) → TEAR_F1 (278.0): a long struggle, then the barrier gives.
// Music: stem E holds (it stops at 267.2 and resumes at 278.0 from its story-267.2 offset); this string-cluster /
// choir / sub / taiko bed keeps growing underneath. Everything is cut clean at 278.0 so the shatter lands hard.
export const INSERT_GAIN = 1.0;
function insertCues() {
  const out = [], r = rng(26726), R = (a, b) => a + r() * (b - a), F0 = TEAR_S0, F1 = TEAR_F1, L = F1 - F0, G = INSERT_GAIN;
  const u = (t) => Math.max(0, Math.min(1, (t - F0) / L));
  // struggle bed (both modes)
  out.push([F0, '@strings', { notes: [50, 51, 56, 57, 62, 63], dur: L, vel: 0.5 * G, atk: 2, rel: 0.05, trem: 9, swell: true, bend: 700 }]);
  out.push([F0 + 0.3, '@choir', { notes: [62, 63, 65, 68], dur: L - 0.3, vel: 0.55 * G, atk: 3, rel: 0.05, vowel: 'ah', vowel2: 'eh', swell: true, bend: 300 }]);
  out.push([F0, '@sub', { note: 26, dur: L, vel: 0.55 * G, atk: 1, rel: 0.05, wobble: 3 }]);
  out.push([F1 - 3.2, '@riser', { dur: 3.19, vel: 0.6 * G }]);
  for (let t = F0 + 0.3; t < F1 - 0.08; t += 1.1 * Math.pow(0.12 / 1.1, u(t))) out.push([t, '@taiko', { vel: G * (0.35 + 0.65 * u(t)), f: 48 + 14 * u(t), dec: 0.8 }]);
  // barrier tearing crackle, rising all the way
  out.push([F0 + 0.05, '@tear', { dur: L - 0.07, vel: G * 0.45 }]);          // softened: the crackle grated
  // continuous servo strain, pitch rising with progress
  for (let k = 0, t = F0 + 0.2; t < F1 - 0.6; k++, t += 1.05) {
    const q = u(t);
    out.push(k % 2
      ? [t, 'mech_powerup', { at: 0.5, dur: 1.4, fadeOut: 0.2, rate: 0.4 + 0.4 * q, gain: G * (0.4 + 0.3 * q), pan: R(-0.2, 0.2), prio: 8, norand: true }]
      : [t, 'servo', { dur: 1.2, fadeOut: 0.15, rate: 0.45 + 0.5 * q, gain: G * (0.45 + 0.35 * q), pan: R(-0.2, 0.2), prio: 8, norand: true }]);
  }
  [268.6, 271.4, 274.3].forEach((t, i) => out.push([t, '@growl', { dur: 1.6, vel: G * (0.5 + 0.15 * i) }]));   // (last shout removed)
  // metal creaking / groaning
  [268.5, 270.2, 272.0, 273.8, 275.4, 277.0].forEach((t, i) => out.push([t, 'metal_groan', { at: 2.8, dur: 2.4, fadeOut: 0.6, rate: R(0.7, 0.9),
    gain: G * (0.6 + 0.3 * u(t)), pan: i % 2 ? 0.4 : -0.4, prio: 8, norand: true }]));
  // armour plates ripping off
  [271, 272.6, 274.2, 275.8].forEach((t, i) => {
    const pan = [-0.5, 0.5, -0.3, 0.35][i];
    out.push([t, 'debris_impact', { at: 'hit', gain: G * 0.9, pan, prio: 9, norand: true }]);
    out.push([t, '@crunch', { vel: G * 0.9, pan }]);
    out.push([t, 'hit_heavy', { dur: 1.0, fadeOut: 0.4, rate: 1.1, gain: G * 0.6, pan, prio: 8, norand: true }]);
    out.push([t + 0.04, 'expl_debris', { rate: 1.3, gain: G * 0.4, pan, prio: 7, norand: true }]);
  });
  // cockpit alarm: faster and faster
  for (let k = 0, t = F0 + 0.4; t < F1 - 0.05; k++, t += 0.9 * Math.pow(0.12 / 0.9, u(t))) out.push([t, '@beep', { f: k % 2 ? 2093 : 1760, vel: G * (0.35 + 0.3 * u(t)) }]);
  // heavy breathing
  for (let t = F0 + 0.1; t < F1 - 0.9; ) { const per = 1.5 - 0.75 * u(t); out.push([t, '@breath', { vel: G * (0.45 + 0.4 * u(t)), inhale: per * 0.4, exhale: per * 0.5 }]); t += per; }
  // digital glitch bursts, denser
  for (let t = F0 + 0.5; t < F1 - 0.1; t += 1.3 * Math.pow(0.18 / 1.3, u(t)) * R(0.7, 1.3)) out.push([t, '@glitch', { dur: R(0.1, 0.3), vel: G * (0.35 + 0.3 * u(t)) }]);
  // the barrier gives way — extra weight on the shatter (story 268.0 → film 278.0 cues also land here)
  out.push([F1, 'braam', { gain: 1.1, prio: 9, duck: 2.5, norand: true }]);
  out.push([F1, 'hit_heavy', { gain: 1.1, prio: 9, norand: true }]);
  out.push([F1, 'expl_nuke', { rate: 1.2, gain: 0.7, prio: 9, norand: true }]);
  return out;
}
export const INSERT_CUES = insertCues();

// Full SFX layer for the mech duel, derived at build time from duel.js:
//   DUEL_EVENTS → clash/block (hit_heavy slice + saber crackle + inharmonic ring), hit (heavy impact + sub + crunch + servo),
//   spark (crackle), hit-stop freeze stings, swing whooshes 0.1–0.2 s before each strike;
//   per-mech state (duelHero/duelEnemy1/duelEnemy2 sampled every 20 ms) → saber ignite/extinguish edges, saber hum
//   modulated by swing speed, thruster boosts (boost rising edges), servo/hydraulic moves (joint angular-speed peaks).
function duelCues() {
  const out = [], r = rng(8080), R = (a, b) => a + r() * (b - a), G = DUEL_GAIN;
  // choreographed events + contacts found by the hitbox sweep (duel.js AUTO_FX): every real touch gets its sound
  const EV = [...DUEL_EVENTS, ...AUTO_FX.map((e) => ({ ...e, strength: e.strength * 0.8 }))].filter((e) => e.t >= 150 && e.t <= 200).sort((a, b) => a.t - b.t);
  const strikes = EV.filter((e) => e.type === 'clash' || e.type === 'block' || e.type === 'hit');
  const swing = (e) => /whoosh|whiff|slash|cut|thrust/i.test(e.note || '');
  // ---- events
  for (const e of EV) {
    const st = e.strength ?? 0.7, pan = e.on === 'enemy' ? R(0.15, 0.45) : e.on === 'hero' ? R(-0.45, -0.15) : R(-0.15, 0.15);
    if (e.type === 'clash' || e.type === 'block' || e.type === 'hit' || (e.type === 'shake' && swing(e))) {
      out.push([e.t - R(0.1, 0.2), r() < 0.5 ? 'whoosh:a' : 'whoosh:b',
        { at: 0.55, dur: 0.6, fadeOut: 0.2, rate: R(1.7, 2.1), gain: G * (0.45 + 0.35 * st), pan: -pan, prio: 7, norand: true }]);
    }
    if (e.type === 'clash' || e.type === 'block') {
      // steel on steel: a heavy knock, an axe-on-metal body, sub weight and a long low ring
      out.push([e.t, 'metal_knock', { at: 'hit', rate: R(0.7, 0.82), gain: G * (0.8 + 0.4 * st), pan, prio: 9, duck: 0.7, duckDb: DUEL_DUCK_DB, norand: true }]);
      out.push([e.t, r() < 0.5 ? 'axe_metal1' : 'axe_metal3', { at: 'hit', rate: R(0.78, 0.9), gain: G * (0.6 + 0.4 * st), pan, prio: 9, norand: true }]);
      out.push([e.t, '@boom', { bus: 'sfx', f: 48, vel: G * 0.45 * st, dur: 0.9, verb: 0.25 }]);
      out.push([e.t, '@metalRing', { vel: G * 0.9 * st, f0: R(170, 320), dec: 1.2 + 0.8 * st, pan }]);
    } else if (e.type === 'hit') {
      // body blows: the mace (or a knee / kick) caving in armour
      out.push([e.t, r() < 0.5 ? 'axe_metal1' : 'axe_metal3', { at: 'hit', rate: R(0.66, 0.76), gain: G * (0.9 + 0.3 * st), pan, prio: 9, duck: 0.9, duckDb: DUEL_DUCK_DB, norand: true }]);
      out.push([e.t, 'debris_impact', { at: 0.8, dur: 1.6, fadeOut: 0.6, lp: 1800, gain: G * 0.5 * st, pan, prio: 8, norand: true }]);
      out.push([e.t, '@boom', { bus: 'sfx', f: 38, vel: G * 0.8 * st, dur: 1.4, verb: 0.3 }]);
      out.push([e.t, '@crunch', { vel: G * st, pan }]);
      out.push([e.t + 0.08, 'servo', { rate: R(1.2, 1.4), dur: 0.6, fadeOut: 0.2, gain: G * 0.45, pan, prio: 6 }]);
      if (e.cut) {                                                     // mace kill: armour crushed flat, a huge iron clang
        out.push([e.t, 'metal_crush', { at: 'hit', rate: 0.8, gain: G * 1.1, pan, prio: 9, norand: true }]);
        out.push([e.t + 0.02, 'metal_door', { at: 'hit', rate: 0.72, gain: G * 1.0, pan: pan * 0.5, prio: 9, norand: true }]);
        out.push([e.t, '@boom', { bus: 'sfx', f: 30, vel: G, dur: 2.2, verb: 0.4 }]);
      }
    } else if (e.type === 'spark') {
      out.push([e.t, '@sparkBurst', { vel: G * (0.4 + 0.5 * st), pan }]);
      out.push([e.t, '@metalRing', { vel: G * 0.25 * st, f0: R(1400, 2200), dec: 0.25, pan }]);
    }
    if (e.hitstop > 0) out.push([e.t + 0.005, '@freezeSting', { dur: e.hitstop, vel: G * (0.4 + 0.4 * st) }]);
  }
  // ---- hero's mace: deploys with a hydraulic lock + ring (184.0), stowed at 195
  out.push([184.0, 'servo', { rate: 0.8, dur: 0.6, fadeOut: 0.2, gain: G * 0.8, pan: -0.2, prio: 8, norand: true }]);
  out.push([184.3, '@metalRing', { vel: G * 0.9, f0: 520, dec: 1.2, pan: -0.2 }]);
  out.push([184.3, 'hit_heavy', { dur: 0.5, fadeOut: 0.3, rate: 1.5, gain: G * 0.4, pan: -0.2, prio: 7, norand: true }]);
  out.push([195.1, 'servo', { rate: 0.9, dur: 0.6, fadeOut: 0.2, gain: G * 0.5, pan: -0.2, prio: 6, norand: true }]);
  // ---- hero beam rifle: heavy report + low boom; the last shot hits point-blank (sizzle)
  DUEL_RIFLE.forEach((t, i) => {
    out.push([t, 'beam_blast1', { at: 2.15, dur: 0.8, fadeOut: 0.3, rate: 1.1, gain: G * 1.0, pan: -0.15, prio: 9, duck: 0.6, duckDb: DUEL_DUCK_DB, norand: true }]);
    out.push([t, 'laser_shot', { gain: G * 0.8, rate: R(0.9, 1.0), pan: -0.15, prio: 8, norand: true }]);
    out.push([t, '@boom', { bus: 'sfx', f: 55, vel: G * 0.55, dur: 1.0, verb: 0.3 }]);
    if (i === DUEL_RIFLE.length - 1) out.push([t + 0.06, '@sizzle', { vel: G * 0.8, pan: 0.3 }]);
  });
  // ---- per-mech states
  const DT = 0.02, T0 = 150, T1 = 200;
  const mechs = [['hero', duelHero, -0.2], ['e1', duelEnemy1, 0.35], ['e2', duelEnemy2, 0.25]];
  for (const [name, fn, pan] of mechs) {
    const S = [];
    for (let t = T0; t <= T1 + 1e-6; t += DT) { const s = fn(t); S.push({ t, on: !!(s && s.vis !== false), s }); }
    const val = (i, k) => (S[i].on && S[i].s[k] != null ? S[i].s[k] : 0);
    // saber edges + hum (swing-speed modulated)
    let lit = null;
    for (let i = 1; i < (name === 'hero' ? 0 : S.length); i++) {
      const a = val(i - 1, 'saber'), b = val(i, 'saber'), t = S[i].t;
      if (a < 0.5 && b >= 0.5) {
        lit = t;
        out.push([t - 0.12, 'saber_ignite', { rate: name === 'hero' ? 1 : 0.85, gain: G * (name === 'hero' ? 1 : 0.8), pan, prio: 9, norand: true }]);
        out.push([t - 0.12, '@saberIgnite', { vel: G * 0.5, pan }]);
      }
      if ((a >= 0.5 && b < 0.5) || (lit !== null && i === S.length - 1)) {
        const off = t, dur = off - lit;
        if (dur > 0.3) {
          const mod = [];
          for (let tt = lit; tt <= off; tt += 0.1) {
            const k = Math.min(S.length - 1, Math.round((tt - T0) / DT)), sp = Math.min(1, val(k, 'speed') / 60);
            const nearStrike = strikes.reduce((m, e) => Math.max(m, Math.exp(-Math.abs(e.t - 0.1 - tt) * 8)), 0);
            const sw = Math.min(1, 0.6 * sp + nearStrike);
            mod.push([+(tt - lit).toFixed(3), 0.9 + 0.3 * sw, 0.55 + 0.6 * sw]);
          }
          out.push([lit, 'saber_hum', { loop: true, dur, gain: G * (name === 'hero' ? 0.75 : 0.6), fadeIn: 0.25, fadeOut: 0.25, pan, prio: 8, norand: true, mod }]);
          if (a >= 0.5 && b < 0.5 && name === 'hero') out.push([off, 'power_down', { rate: 1.4, gain: G * 0.5, pan, prio: 6, norand: true }]);
        }
        lit = null;
      }
    }
    // thruster boosts: boost rising edges (jump ≥0.3 within 0.2 s, to ≥0.85), debounced
    let lastDash = -9;
    for (let i = 10; i < S.length; i++) {
      const t = S[i].t, b = val(i, 'boost'), b0 = val(i - 10, 'boost');
      if (b >= 0.85 && b - b0 >= 0.3 && t - lastDash > 0.6) {
        lastDash = t;
        out.push([t - 0.05, 'hl_thruster', { loop: true, dur: 0.9, rate: R(1.15, 1.35), gain: G * 0.6, fadeIn: 0.04, fadeOut: 0.5, pan, prio: 7, norand: true }]);
        out.push([t - 0.1, 'whoosh:b', { at: 0.55, dur: 0.7, fadeOut: 0.25, rate: R(1.3, 1.6), gain: G * 0.5, pan, prio: 6, norand: true }]);
      }
    }
    // servo / hydraulics on big pose changes: joint angular-speed peaks, quiet, pitched down
    const w = S.map((x, i) => {
      if (!i || !x.on || !S[i - 1].on || !x.s.pose || !S[i - 1].s.pose) return 0;
      let sum = 0;
      for (const j in x.s.pose) { const p0 = S[i - 1].s.pose[j], p1 = x.s.pose[j]; if (p0 && p1) for (let c = 0; c < 3; c++) sum += Math.abs(p1[c] - p0[c]); }
      return sum / DT;
    });
    const sorted = w.filter((x) => x > 0).sort((a, b) => a - b), th = sorted[Math.floor(sorted.length * 0.9)] || Infinity;
    let lastServo = -9;
    for (let i = 1; i < w.length - 1; i++) {
      if (w[i] >= th && w[i] >= w[i - 1] && w[i] >= w[i + 1] && S[i].t - lastServo > 0.45) {
        lastServo = S[i].t;
        const k = Math.min(1, w[i] / (th * 2));
        out.push([S[i].t - 0.05, r() < 0.6 ? 'servo' : 'mech_steps:four',
          { at: r() < 0.5 ? 0 : 0.3, dur: 0.5, fadeOut: 0.2, rate: R(0.55, 0.75), gain: G * (0.2 + 0.2 * k), pan: pan + R(-0.1, 0.1), prio: 5, norand: true }]);
      }
    }
  }
  // ---- hangar launch additions (clamp release + hydraulics before the 157.9 catapult)
  out.push([156.9, 'hit_heavy', { rate: 0.7, lp: 1200, gain: G * 0.5, prio: 7, norand: true }]);
  out.push([157.3, 'servo', { rate: 0.6, gain: G * 0.6, prio: 7, norand: true }]);
  out.push([157.35, '@steam', { dur: 1.2, vel: 0.5 }]);
  return out;
}

function ionShotCues() {
  const out = [], r = rng(97531), R = (a, b) => a + r() * (b - a);
  // shot sources: laser_cannon slices (heavy) and beam_blast peaks — [spec, region start or 0, dur]
  const SRC = [['laser_cannon:s0', 0, 0.9], ['laser_cannon:s2', 0, 0.9], ['laser_cannon:s4', 0, 0.9], ['beam_blast1', 2.15, 0.7], ['beam_blast4', 1.7, 0.7]];
  const [ca, cb, shift, from] = ION_COLD_OPEN;
  const shots = [...ION_SHOTS.filter((s) => s.t >= ca && s.t < cb).map((s) => ({ ...s, t: s.t + shift })).filter((s) => s.t >= from), ...ION_SHOTS];
  for (const s of shots) {
    const near = s.near ?? 0.5, far = Math.max(0, Math.min(0.85, (1 - near) / 0.75 * 0.85)), pan = R(-0.6, 0.6);
    for (let b = 0; b < (s.burst || 1); b++) {
      const t = s.t + b * 0.22, [spec, at, dur] = SRC[Math.floor(r() * SRC.length)];
      const rate = s.side === 'E' ? R(0.65, 0.85) : R(0.75, 0.95);
      out.push([t, spec, { ...(at ? { at } : {}), dur: dur * 1.8, fadeOut: 0.6, rate, norand: true, gain: ION_GAIN * (0.5 + 0.5 * near) * (b ? 0.8 : 1),
        far, pan: pan + (b ? 0.1 : 0), prio: 6 }]);
    }
    // impact thud: bolt travel time ≈ distance / ION_BOLT_SPEED (farther shots land later), 0.5–1.2 s
    const travel = Math.min(1.2, Math.max(0.5, (300 + 1100 * (1 - near)) / ION_BOLT_SPEED));
    out.push([s.t + travel, '@ionThud', { vel: ION_THUD_GAIN * (0.4 + 0.6 * near), far, pan: -pan * 0.7 }]);
  }
  return out;
}
// hyperspace in/out: one 'Atomic Impact' per warp, landing on the visual snap (world.js warpSchedule). Events within 0.25 s are
// merged; big ships are deep and loud, line ships lighter and farther.
function warpCues() {
  // EVERY warp gets its own warp_out2 on its visual snap, and it is ALWAYS clearly heard: it plays on the dry bus
  // (past the sfx ducking / filtering) with top priority, louder the bigger the ship (line ship < frigate < capital),
  // and briefly pulls the rest of the mix down. Ships snapping in the same instant (< 0.15 s) share one cue.
  // The enemy's arrival wave (80–84) stays one single hit (no clatter).
  const ev = warpSchedule().filter((e) => !(e.t > 80 && e.t < 84.8 && e.size < 3)), out = [];
  const LVL = { 1: 1.0, 2: 1.35, 3: 1.8 }, RATE = { 1: 1.06, 2: 0.98, 3: 0.9 }, DUCK = { 1: [0.8, -4], 2: [1.4, -7], 3: [2.5, -10] };
  out.push([81.6, 'warp_out2', { bus: 'dry', gain: 1.9, rate: 0.88, prio: 10, duck: 2.2, duckDb: -10, norand: true }]);   // the whole enemy line arrives
  for (let i = 0; i < ev.length;) {
    let j = i, size = 0, n = 0;
    while (j < ev.length && ev[j].t - ev[i].t < 0.15) { size = Math.max(size, ev[j].size); n++; j++; }
    const t = ev[i].t;
    i = j;
    const pan = size === 3 ? 0 : Math.sin(t * 7.3) * (size === 2 ? 0.3 : 0.45);
    out.push([t, 'warp_out2', { bus: 'dry', gain: Math.min(2.1, LVL[size] + 0.08 * (n - 1)), rate: RATE[size], pan, prio: 10, norand: true,
      duck: DUCK[size][0], duckDb: DUCK[size][1] }]);
  }
  return out;
}
// our line ships dying: a heavy explosion and a groan of tearing hull for every loss (world.js EXTRA_H[i].die)
function lossCues() {
  const out = [];
  EXTRA_H.forEach((f, i) => {
    if (!f.die) return;
    const far = 0.15 + 0.3 * ((i * 7) % 5) / 5, pan = Math.sin(i * 2.3) * 0.6;
    out.push([f.die, 'hl_big_explosion', { rate: 0.9, gain: 1.0, far, pan, prio: 8, duck: far < 0.25 ? 1.2 : 0 }]);
    out.push([f.die + 0.4, 'metal_groan', { at: 2.8, dur: 2.2, fadeOut: 0.8, rate: 0.75, gain: 0.7, far: far + 0.1, pan, prio: 6 }]);
  });
  return out;
}
SAMPLE_CUES.push(...ionShotCues(), ...duelCues(), ...warpCues(), ...lossCues());

// =====================================================================================
// MASTER AUTOMATION — keyframes [filmTime, value], exponential interpolation.
//   lowpass : master low-pass (Hz) → slow-mo 190–194, deafness 217–226, flash 280
//   music   : music level          → near-silence 218–224
//   master  : overall fade         → out by 381.8
//   warp    : sample playbackRate multiplier → slow-motion pitch-down 190–194
// duckMusic / duckSfx are generated from the voice schedule and the `duck` sample cues.
// =====================================================================================
export const AUTOMATION = {
  lowpass: [[0, 20000], [190.1, 20000], [190.6, 900], [193.6, 900], [194.05, 20000],
            [216.8, 20000], [217.5, 380], [223.5, 380], [226, 20000],
            [278.3, 20000], [279.95, 520], [280.0, 20000],            // engulfed: everything but the swell closes down
            [280.02, 20000], [280.15, 2200], [284, 20000]],
  music:   [[0, 1], [69.3, 1], [69.6, 0.03], [70.02, 0.03], [70.4, 1], [217.2, 1], [218, 0.2], [223, 0.2], [226, 1], [277.9, 1], [279.95, 0.25], [280.02, 1]],
  master:  [[0, 1], [379.5, 1], [381.8, 0.0003]],
  warp:    [[0, 1], [190.05, 1], [190.5, 0.62], [193.6, 0.62], [194.05, 1]],
};

// =====================================================================================
const LOOKAHEAD = 1.5;
const TICK_MS = 60;
const RESUME_MIN = 1.5;
const LEAD = 0.06;

function valueAt(kf, t) {
  if (t <= kf[0][0]) return kf[0][1];
  for (let i = 0; i < kf.length - 1; i++) {
    const [ta, a] = kf[i], [tb, b] = kf[i + 1];
    if (t < tb) return tb > ta ? a * Math.pow(b / a, (t - ta) / (tb - ta)) : b;
  }
  return kf[kf.length - 1][1];
}
const dbToGain = (db) => Math.pow(10, db / 20);
// events of these types that span the tear insert are stretched to its film length (beds / pads = "hold");
// everything else (hits, braams, one-shot samples) keeps its real duration
const STRETCH_TYPES = new Set(['spaceAmb', 'hullRumble', 'hangarAmb', 'warp', 'wellHum', 'fireAmb', 'debrisAmb', 'battleBed', 'alarmMuffled',
  'sub', 'strings', 'choir', 'glass', 'saberHum', 'ionBeam']);
const resumable = (e) => !!e.p.resume || (e.p.dur || 0) >= RESUME_MIN;

export default class Score {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.active = new Set();   // live AudioScheduledSourceNodes (removed on 'ended')
    this.sess = null;
    this.events = [];
    this.voiceLines = [];
    this.stems = null;
    this.samples = {};         // name → {meta, bytes, buf, lazy, windows, decoding, failed}
    this.lazy = [];            // JIT-decoded items (stems + big samples)
    this.smpVoices = new Set();
    this.mode = 'synth';
    this.auto = AUTOMATION;
    this._waiting = new Set();
    this._stats = { stolen: 0, dropped: 0, peakSamples: 0, peakDecoded: 0 };
    this._ptr = 0; this._timer = null; this._t0 = 0; this._lat = 0; this._offset = 0; this._pausedAt = 0; this._vol = 0.9;
  }

  get duration() { return DURATION; }
  get playing() { return this.running; }
  info() {
    return {
      mode: this.mode, events: this.events.length, voices: this.voiceLines.length,
      samples: Object.keys(this.samples).length,
      sampleCues: this.events.filter((e) => e.type === 'smp').length,
      stems: this.stems ? this.stems.map((s) => ({ file: s.file, t: s.t, decoded: !!s.buf })) : null,
      decodedMB: +(this.decodedBytes() / 1e6).toFixed(1), activeSources: this.active.size,
      sampleVoices: this.smpVoices.size, ...this._stats,
    };
  }
  decodedBytes() {
    const b = (x) => (x ? x.length * x.numberOfChannels * 4 : 0);
    let n = 0;
    for (const s of new Set(Object.values(this.samples))) n += b(s.buf);
    for (const s of this.stems || []) n += b(s.buf);
    for (const l of this.voiceLines) n += b(l.buf);
    return n;
  }

  async init() {
    if (this.ctx) { if (this.ctx.state !== 'running') { try { await this.ctx.resume(); } catch (e) { /* gesture */ } } return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'playback' });
    const resumeP = ctx.resume().catch(() => {});
    const { buf, curves } = buildShared(ctx);
    this.buf = buf; this.curves = curves;
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.musicBus = G(0.75); this.musicAuto = G(1); this.musicDuck = G(1);
    this.sfxBus = G(0.9); this.sfxDuck = G(1);
    this.dryBus = G(1); this.voiceBus = G(1); this.verbRet = G(0.6); this.mix = G(1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 18; hp.Q.value = 0.7;
    this.masterLP = ctx.createBiquadFilter(); this.masterLP.type = 'lowpass'; this.masterLP.frequency.value = 20000; this.masterLP.Q.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.006; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.fade = G(1); this.out = G(this._vol);
    this.musicBus.connect(this.musicAuto); this.musicAuto.connect(this.musicDuck); this.musicDuck.connect(this.mix);
    this.sfxBus.connect(this.sfxDuck); this.sfxDuck.connect(this.mix);
    this.verbRet.connect(this.mix);
    this.mix.connect(hp); hp.connect(this.masterLP); this.masterLP.connect(comp);
    this.dryBus.connect(comp);
    this.voiceBus.connect(lim);
    comp.connect(lim); lim.connect(this.fade); this.fade.connect(this.out); this.out.connect(ctx.destination);

    await Promise.all([this._loadVoices(), this._loadStems(), this._loadSamples()]);
    this.mode = this.stems ? 'stems' : 'synth';
    this.events = this._buildEvents();
    const mapKf = (kf) => kf.map(([t, v]) => [filmT(t), v]);
    this.auto = { ...Object.fromEntries(Object.entries(AUTOMATION).map(([k, kf]) => [k, mapKf(kf)])), ...this._duckKeyframes() };
    this._maintain(0);
    await resumeP;
  }

  // ---------------------------------------------------------------- media loading
  _url(rel) { return new URL(ASSET_BASE + rel, import.meta.url).href; }
  async _fetch(rel, kind) {
    const r = await fetch(this._url(rel));
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + rel);
    return kind === 'json' ? r.json() : r.arrayBuffer();
  }

  async _loadVoices() {
    if (!USE_VOICES) return;
    let data;
    try { data = await this._fetch('voice/lines.json', 'json'); } catch (e) { console.warn('[audio] voice lines unavailable — continuing without VO:', e.message || e); return; }
    const lines = Array.isArray(data) ? data : data.lines || [];
    const got = await Promise.all(lines.map(async (l) => {
      try { return { ...l, buf: await this.ctx.decodeAudioData(await this._fetch('voice/' + l.id + '.mp3')) }; }
      catch (e) { console.warn('[audio] voice', l.id, 'failed:', e.message || e); return null; }
    }));
    for (const l of got) if (l) {   // film-time start / cut (lines with "filmTime": true are already film time)
      l.tf = l.filmTime ? l.t : filmT(l.t);
      l.cutF = l.cut != null ? (l.filmTime ? l.cut : filmT(l.cut)) : undefined;
    }
    this.voiceLines = got.filter(Boolean).sort((a, b) => a.tf - b.tf);
  }

  async _loadSamples() {
    if (!USE_SAMPLES) return;
    let table;
    try { table = (await this._fetch('sfx/sfx.json', 'json')).samples; } catch (e) { console.warn('[audio] sfx samples unavailable — synth SFX only:', e.message || e); return; }
    const sr = this.ctx.sampleRate;
    const aliases = Object.entries(table).filter(([, m]) => m.alias);
    await Promise.all(Object.entries(table).filter(([, m]) => !m.alias).map(async ([name, meta]) => {
      try {
        const bytes = await this._fetch('sfx/' + meta.file);
        const lazy = !!meta.loop || meta.dur * sr * meta.ch * 4 > LAZY_BYTES;
        const s = { name, meta, bytes: lazy ? bytes : null, buf: null, lazy, windows: [], decoding: false, failed: false };
        if (!lazy) s.buf = await this.ctx.decodeAudioData(bytes);   // short one-shot: decode once, keep
        this.samples[name] = s;
      } catch (e) { console.warn('[audio] sample', name, 'failed:', e.message || e); }
    }));
    // byte-identical sources are built once and shared (e.g. hl_warp_in → hl_warp_out)
    for (const [name, m] of aliases) if (this.samples[m.alias]) this.samples[name] = this.samples[m.alias];
  }

  async _loadStems() {
    if (!USE_STEMS) return;
    let man;
    try { man = await this._fetch('music/manifest.json', 'json'); } catch (e) { console.info('[audio] no music manifest — using the synthesized score'); return; }
    const list = (Array.isArray(man) ? man : man.stems || []).filter((s) => s && s.file && Number.isFinite(+s.t)).sort((a, b) => a.t - b.t);
    const loaded = await Promise.all(list.map(async (s) => {
      try { return { ...s, t: +s.t, bytes: await this._fetch('music/' + s.file), buf: null, decoding: false, failed: false }; }
      catch (e) { console.warn('[audio] stem', s.file, 'failed:', e.message || e); return null; }
    }));
    const stems = loaded.filter(Boolean);
    if (!stems.length) { console.warn('[audio] manifest present but no stem loaded — using the synthesized score'); return; }
    stems.forEach((s, i) => {
      const next = stems[i + 1];
      let end = s.end ?? (next ? next.t : STORY_DURATION);
      let fadeOut = s.fadeOut ?? (next ? STEM_XFADE : 3);
      let tail = s.end === undefined && next ? fadeOut : 0;       // crossfade tail runs past next.t
      for (const c of HARD_CUTS) if (s.t < c && c < end + tail) { end = c; fadeOut = 0.004; tail = 0; }
      s.fadeOut = fadeOut; s.dur = end + tail - s.t; s.gain = (s.gain ?? 1) * STEM_GAIN;
      s.windows = [];
    });
    this.stems = stems;
  }

  // JIT decode: items whose usage window is near the playhead are decoded; far ones release PCM.
  _maintain(ft) {
    for (const s of this.lazy) {
      const want = s.windows.some(([a, b]) => ft >= a - PRELOAD && ft < b + 1);
      if (want && !s.buf && !s.decoding && !s.failed) {
        s.decoding = true;
        this.ctx.decodeAudioData(s.bytes.slice(0))
          .then((b) => { s.buf = b; })
          .catch((e) => { s.failed = true; console.warn('[audio] decode failed', s.name || s.file, e); })
          .finally(() => { s.decoding = false; });
      } else if (!want && s.buf) s.buf = null;   // playing sources keep their own reference
    }
    this._stats.peakDecoded = Math.max(this._stats.peakDecoded, this.decodedBytes());
  }

  // a voice line ends at its buffer end, its JSON `cut`, or the next HARD_CUT — whichever is first
  _voiceEnd(l) {   // film time
    const nextCut = HARD_CUTS.map(filmT).find((c) => c > l.tf + 1e-6) ?? Infinity;
    return Math.min(l.tf + l.buf.duration, l.cutF ?? Infinity, nextCut);
  }

  // ---------------------------------------------------------------- ducking
  _duckKeyframes() {
    const voiceIv = this.voiceLines.map((l) => {
      const end = this._voiceEnd(l), hard = end < l.tf + l.buf.duration - 1e-3;
      return { a: l.tf, b: end, rel: hard ? 0.01 : DUCK_RELEASE, att: DUCK_ATTACK };
    });
    const hitIv = this.events.filter((e) => e.p.duckFor).map((e) => ({ a: e.p.hitT, b: e.p.hitT + e.p.duckFor, rel: HIT_DUCK_RELEASE, att: 0.04,
      g: e.p.duckDb !== undefined ? dbToGain(e.p.duckDb) : undefined }));
    const mk = (ivs, g) => {
      ivs = ivs.slice().sort((x, y) => x.a - y.a);
      const m = [];
      for (const v of ivs) {
        const last = m[m.length - 1];
        const vg = v.g ?? g;
        if (last && v.a - v.att <= last.b + last.rel + 0.05) { last.g = Math.min(last.g, vg); if (v.b >= last.b) { last.b = v.b; last.rel = v.rel; } }
        else m.push({ ...v, g: vg });
      }
      const kf = [[0, 1]];
      for (const v of m) {
        const t0 = Math.max(v.a - v.att, kf[kf.length - 1][0] + 0.001);
        kf.push([t0, 1], [Math.max(v.a, t0 + 0.001), v.g], [Math.max(v.b, v.a + 0.002), v.g], [Math.max(v.b, v.a + 0.002) + v.rel, 1]);
      }
      return kf;
    };
    return { duckMusic: mk([...voiceIv, ...hitIv], dbToGain(DUCK_MUSIC_DB)), duckSfx: mk(voiceIv, dbToGain(DUCK_SFX_DB)) };
  }

  // ---------------------------------------------------------------- event list
  _sampleEvent(t, spec, o, r) {
    const [name, slice] = spec.split(':');
    const s = this.samples[name];
    if (!s) return null;
    const m = s.meta;
    let off = 0, sdur = m.dur;
    if (slice) { const sl = m.slices && m.slices[slice]; if (!sl) { console.warn('[audio] no slice', spec); return null; } [off, sdur] = sl; }
    const vary = !(o.norand || o.loop);
    const rate = (o.rate ?? 1) * (vary ? 1 + (r() * 2 - 1) * RATE_VAR : 1);
    const gain = (o.gain ?? 1) * SAMPLE_GAIN * (vary ? dbToGain((r() * 2 - 1) * GAIN_VAR_DB) : 1);
    // alignment: at = 'hit' (marked hit point) or seconds into the slice
    let lead = 0;
    if (o.at === 'hit') lead = Math.max(0, ((m.hit ?? off) - off)) / rate;
    else if (typeof o.at === 'number' && !o.loop) {
      // for continuous material (e.g. minigun) `at` > slice length means "start this far into it"
      if (o.at > 0 && o.dur !== undefined && (slice === undefined || o.at < sdur)) { off += o.at; sdur -= o.at; }
      else lead = o.at / rate;
    }
    const p = {
      ref: s, off, sdur, rate, rateTo: o.rateTo, gain, far: o.far || 0, fadeIn: o.fadeIn, fadeOut: o.fadeOut,
      bus: o.bus, prio: o.prio ?? 5, verb: o.verb, lp: o.lp,
    };
    if (o.pan1 !== undefined) { p.pan0 = o.pan0 ?? 0; p.pan1 = o.pan1; }
    else p.pan = o.pan === 'rnd' ? (r() * 2 - 1) * 0.8 : (o.pan ?? 0);
    if (o.loop && m.loop) { p.loop = m.loop; p.dur = o.dur ?? 10; }
    else { p.dur = Math.min(sdur / rate, o.dur ?? Infinity); }
    p.resume = p.dur >= RESUME_MIN;
    if (o.duck) { p.duckFor = o.duck; p.hitT = t; if (o.duckDb !== undefined) p.duckDb = o.duckDb; }
    return { t: t - lead, anchor: t, type: 'smp', p };
  }

  _buildEvents() {
    const ev = [];
    for (const [t, type, p = {}] of CUES) {
      const fn = INSTR[type];
      if (!fn) { console.warn('[audio] unknown cue type', type); continue; }
      ev.push({ t: t - (fn.pre || 0), anchor: t, type, p });
    }
    // samples (synth heartbeat is the fallback when no samples loaded)
    const r = rng(1337);
    let nSmp = 0;
    for (const [t, spec, o = {}] of SAMPLE_CUES) {
      if (spec[0] === '@') { ev.push({ t, type: spec.slice(1), p: o }); continue; }   // synth voice inside the sample table
      const e = this._sampleEvent(t, spec, o, r); if (e) { ev.push(e); nSmp++; }
    }
    if (!this.samples.heartbeat) for (const [i, t] of heartbeatTimes(244, 262).entries()) ev.push({ t, type: 'heartbeat', p: { vel: 0.55 + 0.45 * i / 24 } });
    if (!this.samples.tinnitus) ev.push({ t: 217.8, type: 'tinnitus', p: { dur: 6.4 } });
    // music
    const stems = this.mode === 'stems';
    const nearHit = (e) => SYNC_HITS.some((h) => e.t >= h - 6 && e.t <= h + 0.05);
    for (const e of buildMusic(SECTIONS)) {
      if (!INSTR[e.type]) { console.warn('[audio] unknown instrument', e.type); continue; }
      if (stems) {
        if (!STEM_SYNC_LAYER) continue;
        const keep = SYNC_KEEP_ALWAYS.includes(e.type) || (SYNC_KEEP_NEAR_HITS.includes(e.type) && nearHit(e));
        if (keep) ev.push({ t: e.t, type: e.type, p: { ...e.p, vel: (e.p.vel ?? 1) * SYNC_GAIN } });
      } else ev.push(e);
    }
    for (const l of this.voiceLines) {
      const speech = this._voiceEnd(l) - l.tf;
      if (!(speech > 0.05)) continue;
      ev.push({ film: true, t: l.tf - VOICE_PRE, type: 'voiceLine', p: { buf: l.buf, id: l.id, radio: !!l.radio, broken: l.radioFx === 'broken', cut: this._voiceEnd(l) < l.tf + l.buf.duration - 1e-3, resume: true,
        dur: VOICE_PRE + speech, gain: (l.radioFx === 'broken' ? VOICE_GAIN.broken : l.radio ? VOICE_GAIN.radio : VOICE_GAIN.narrator) * (VOICE_TRIM[l.voice] ?? 1) } });
    }
    if (stems) {   // ending extension to 381.8: F's final Ab chord replayed an octave down + an Ab-major pad
      const st = this.stems.find((x) => x.file === STEM_TAIL.file) || this.stems[this.stems.length - 1];
      const tl = STEM_TAIL, dur = tl.len / tl.rate;
      ev.push({ t: tl.t, type: 'smp', p: { ref: st, off: tl.from, sdur: tl.len, rate: tl.rate, dur, gain: st.gain * tl.gain, bus: 'music',
        fadeIn: tl.fadeIn, fadeOut: tl.fadeOut, prio: 9, verb: 0.35, resume: true } });
      for (const [t, type, p] of ENDING_PAD) ev.push({ t, type, p });
    }
    if (stems) this.stems.forEach((s) => {
      const base = { ref: s, resume: true, offset: s.offset || 0, gain: s.gain, fadeIn: s.fadeIn || 0, fadeOut: s.fadeOut };
      const a = s.t, b = s.t + s.dur;
      if (a < TEAR_S0 && b > TEAR_S0) {   // e.g. E_climax: play to TEAR_S0, hold through the insert, resume at TEAR_F1
        ev.push({ film: true, t: a, type: 'stem', p: { ...base, dur: TEAR_S0 - a + 0.45, fadeOut: 0.45 } });
        ev.push({ film: true, t: TEAR_F1, type: 'stem', p: { ...base, offset: base.offset + (TEAR_S0 - a), dur: b - TEAR_S0, fadeIn: 0.02 } });
      } else ev.push({ film: true, t: filmT(a), type: 'stem', p: { ...base, dur: filmT(b) - filmT(a) } });
    });
    // first-person insert (film time)
    for (const [t, spec, o = {}] of INSERT_CUES) {
      if (spec[0] === '@') { ev.push({ film: true, t, type: spec.slice(1), p: o }); continue; }
      const e = this._sampleEvent(t, spec, o, r); if (e) { e.film = true; ev.push(e); nSmp++; }
    }
    // ---- STORY → FILM time. Anchored (lead-in) events keep their lead; beds/loops spanning the insert stretch;
    //      one-shot samples keep real length; story-window events are replaced by the insert and dropped.
    const mapped = [];
    for (const e of ev) {
      if (e.film) { mapped.push(e); continue; }
      const anchor = e.anchor ?? e.t, lead = anchor - e.t;
      if (anchor > TEAR_S0 + 1e-6 && anchor < TEAR_S1 - 1e-6) continue;
      const t = filmT(anchor) - lead;
      let p = e.p;
      const stretch = p.dur && (p.loop || (STRETCH_TYPES.has(e.type) && p.dur >= RESUME_MIN));
      if (stretch) p = { ...p, dur: filmT(e.t + p.dur) - filmT(e.t) };
      if (p.hitT !== undefined) p = { ...p, hitT: filmT(p.hitT) };
      mapped.push({ ...e, t, p });
    }
    ev.length = 0; ev.push(...mapped);
    // JIT-decode windows (film time) for lazy samples and stems
    for (const s of new Set([...Object.values(this.samples), ...(this.stems || [])])) s.windows = [];
    for (const e of ev) if (e.p.ref && e.p.ref.windows) e.p.ref.windows.push([e.t, e.t + (e.p.dur || e.p.ref.meta?.dur || 5)]);
    this.lazy = [...new Set(Object.values(this.samples))].filter((s) => s.lazy && s.windows.length).concat((this.stems || []).filter((s) => s.windows.length));
    ev.sort((a, b) => a.t - b.t);
    this.sampleCueCount = nSmp;
    return ev;
  }

  // ---------------------------------------------------------------- sample voice management
  _admit(prio, when) {
    const now = this.ctx.currentTime;
    for (const h of this.smpVoices) if (h.dead) this.smpVoices.delete(h);
    if (this.smpVoices.size < MAX_SAMPLES) return true;
    let victim = null;
    for (const h of this.smpVoices) if (!victim || h.prio < victim.prio || (h.prio === victim.prio && h.t0 < victim.t0)) victim = h;
    if (!victim || victim.prio > prio) { this._stats.dropped++; return false; }
    this._steal(victim, now);
    return true;
  }
  _steal(h, now) {
    h.dead = true;
    this.smpVoices.delete(h);
    this._stats.stolen++;
    try {
      h.g.gain.cancelScheduledValues(now);
      h.g.gain.setValueAtTime(h.g.gain.value, now);
      h.g.gain.linearRampToValueAtTime(0, now + 0.04);
      h.src.stop(Math.max(now + 0.05, h.t0 + 0.001));
    } catch (e) { /* ok */ }
  }
  _track(h) { this.smpVoices.add(h); this._stats.peakSamples = Math.max(this._stats.peakSamples, this.smpVoices.size); }
  _untrack(h) { h.dead = true; this.smpVoices.delete(h); }
  _warpAt(f) { return this.auto.warp ? valueAt(this.auto.warp, f) : 1; }
  // multiply a playbackRate param by AUTOMATION.warp over [t, end] (absolute ctx times)
  _warp(param, t, end, base) {
    const kf = this.auto.warp, T0 = this._t0, f0 = t - T0, f1 = end - T0;
    if (!kf || f1 < kf[1][0] || f0 > kf[kf.length - 1][0]) return;
    param.setValueAtTime(base * valueAt(kf, f0), t);
    for (const [kt, kv] of kf) if (kt > f0 && kt < f1 + 3) param.linearRampToValueAtTime(base * kv, T0 + kt);
  }

  // ---------------------------------------------------------------- sessions / segments
  _segOf(t) { let k = 0; while (k < HARD_CUTS.length && t >= HARD_CUTS[k] - 1e-6) k++; return k; }
  _newSession() {
    const c = this.ctx;
    const G = (dest) => { const g = c.createGain(); g.connect(dest); return g; };
    const segs = [];
    for (let k = 0; k <= HARD_CUTS.length; k++) {
      const conv = c.createConvolver();
      conv.buffer = this.buf.impulse;
      const vhp = c.createBiquadFilter(); vhp.type = 'highpass'; vhp.frequency.value = 140;
      vhp.connect(conv);
      const convOut = G(this.verbRet);
      conv.connect(convOut);
      segs.push({ music: G(this.musicBus), sfx: G(this.sfxBus), dry: G(this.dryBus), verbM: G(vhp), verbS: G(vhp), vhp, conv, convOut });
    }
    return { segs, voice: G(this.voiceBus), music: segs[0].music, sfx: segs[0].sfx, dry: segs[0].dry, verbM: segs[0].verbM, verbS: segs[0].verbS };
  }
  _gates(s) { return [s.voice, ...s.segs.flatMap((g) => [g.music, g.sfx, g.dry, g.verbM, g.verbS, g.convOut])]; }
  _killSession(s) {
    const now = this.ctx.currentTime, gates = this._gates(s);
    for (const g of gates) { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(g.gain.value, now); g.gain.linearRampToValueAtTime(0, now + 0.08); }
    setTimeout(() => { for (const n of [...gates, ...s.segs.flatMap((g) => [g.vhp, g.conv])]) { try { n.disconnect(); } catch (e) { /* ok */ } } }, 400);
  }

  _applyAutomation(offset, now) {
    const T0 = this._t0, A = this.auto;
    const map = [['lowpass', [this.masterLP.frequency]], ['music', [this.musicAuto.gain]], ['master', [this.fade.gain]],
      ['duckMusic', [this.musicDuck.gain]], ['duckSfx', [this.sfxDuck.gain]]];
    for (const [name, params] of map) {
      const kf = A[name];
      for (const pr of params) {
        pr.cancelScheduledValues(now);
        pr.setValueAtTime(kf ? valueAt(kf, offset) : 1, now);
        if (kf) for (const [kt, kv] of kf) if (kt > offset) pr.exponentialRampToValueAtTime(kv, T0 + kt);
      }
    }
    this.sess.segs.forEach((sg, k) => {
      if (k >= HARD_CUTS.length) return;
      const cut = HARD_CUTS[k];
      for (const g of [sg.music, sg.sfx, sg.dry, sg.verbM, sg.verbS, sg.convOut]) {
        if (offset >= cut) { g.gain.value = 0; continue; }
        g.gain.setValueAtTime(1, T0 + cut - 0.002);
        g.gain.linearRampToValueAtTime(0, T0 + cut);
      }
    });
  }

  // Film time (s) of what is being heard now. Monotonic while playing; keeps counting past DURATION.
  get time() {
    if (!this.ctx || !this.running) return this._pausedAt;
    return Math.max(this._offset, this.ctx.currentTime - this._t0 - this._lat);
  }

  start(offset = 0) {
    if (!this.ctx) throw new Error('Score.init() must be awaited before start()');
    const ctx = this.ctx;
    offset = Math.max(0, +offset || 0);
    this._halt();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    this._lat = ctx.outputLatency || ctx.baseLatency || 0;
    this._t0 = now + LEAD - offset;
    this._offset = offset;
    this.sess = this._newSession();
    this.running = true;
    this._applyAutomation(offset, now);
    this._maintain(offset);
    const ev = this.events, segNow = this._segOf(offset);
    let i = 0;
    for (; i < ev.length && ev[i].t < offset; i++) {
      const e = ev[i], d = e.p.dur || 0;
      if (resumable(e) && e.t + d > offset + 0.1 && this._segOf(e.t) === segNow) this._fire(e, now + LEAD, e.t + d - offset, offset - e.t);
    }
    this._ptr = i;
    this._pump();
    this._timer = setInterval(() => this._pump(), TICK_MS);
  }

  _pump() {
    if (!this.running) return;
    const ctx = this.ctx, now = ctx.currentTime, horizon = now + LOOKAHEAD, ev = this.events;
    this._maintain(now - this._t0 + LOOKAHEAD);
    for (const e of this._waiting) {           // media whose PCM just finished decoding
      const ref = e.p.ref;
      if (ref.failed) { this._waiting.delete(e); continue; }
      if (!ref.buf) continue;
      this._waiting.delete(e);
      const at = this._t0 + e.t, late = now + 0.05 - at;
      if (late <= 0) this._fire(e, at);
      else if (resumable(e) && e.p.dur - late > 0.3) this._fire(e, now + 0.05, e.p.dur - late, late);
      else if (late < 0.25) this._fire(e, now + 0.05);
    }
    while (this._ptr < ev.length) {
      const e = ev[this._ptr], at = this._t0 + e.t;
      if (at > horizon) break;
      this._ptr++;
      const late = now - at;
      if (late > 0) {
        const d = e.p.dur || 0;
        if (resumable(e) && d - late > 0.1) this._fire(e, now + 0.01, d - late, late);
        else if (late < 0.25) this._fire(e, now + 0.01);
      } else this._fire(e, at);
    }
  }

  _fire(e, when, dur, into) {
    const fn = INSTR[e.type];
    let p = dur !== undefined ? { ...e.p, dur, into } : e.p;
    if (e.p.ref) {
      const ref = e.p.ref;
      if (!ref.buf) { if (!ref.failed) this._waiting.add(e); return; }
      p = { ...p, buf: ref.buf };
    }
    const sg = this.sess.segs[this._segOf(e.t)];
    this.sess.music = sg.music; this.sess.sfx = sg.sfx; this.sess.dry = sg.dry; this.sess.verbM = sg.verbM; this.sess.verbS = sg.verbS;
    try { fn(this, when, p); } catch (err) { console.warn('[audio] voice failed', e.type, err); }
  }

  _halt() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this.running = false;
    this._waiting.clear();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.sess) { this._killSession(this.sess); this.sess = null; }
    for (const src of this.active) { try { src.stop(now + 0.1); } catch (e) { /* ok */ } }
    for (const h of this.smpVoices) h.dead = true;
    this.smpVoices.clear();
  }

  stop() { this._pausedAt = this.time; this._halt(); }

  setVolume(v) {
    this._vol = Math.max(0, +v || 0);
    if (this.out) this.out.gain.setTargetAtTime(this._vol, this.ctx.currentTime, 0.05);
  }
}
