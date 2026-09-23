// audio-music.js — the score, written as generators that expand the SECTIONS table
// (defined in audio.js) into a flat list of note events {t, type, p}.
// Nothing here touches WebAudio; it is pure data, built once in init().
//
// Key: D minor.  Battle / heroic material sits on one 120 bpm grid anchored at 96.0 s
// (bar = 2 s), so 120.0, 158.0, 200.0, 262.0 and 300.0 all land on downbeats.

const GRID0 = 96, BEAT = 0.5, BAR = 2;
export const bt = (bar, beat = 0) => GRID0 + bar * BAR + beat * BEAT;
const bar = (t) => Math.round((t - GRID0) / BAR);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (t0, t1, v0, v1) => (t) => v0 + (v1 - v0) * clamp01((t - t0) / (t1 - t0));

// ------------------------------------------------------------------ harmony
// b = bass MIDI, u = mid voicing, x = passing tone (semitones above root) used by the ostinato
export const CH = {
  Dm:   { b: 38, u: [50, 57, 62, 65], x: 10 },
  D:    { b: 38, u: [50, 57, 62, 66], x: 9 },
  Bb:   { b: 34, u: [50, 58, 62, 65], x: 9 },
  C:    { b: 36, u: [52, 55, 60, 64], x: 10 },
  G:    { b: 31, u: [50, 55, 59, 62], x: 9 },
  Gm:   { b: 31, u: [50, 55, 58, 62], x: 10 },
  A:    { b: 33, u: [52, 57, 61, 64], x: 10 },
  Asus: { b: 33, u: [52, 57, 62, 64], x: 10 },
  F:    { b: 41, u: [53, 57, 60, 65], x: 9 },
  Eb:   { b: 39, u: [51, 55, 58, 63], x: 10 },
};

// Lament (own "Adagio"-style suspension chain). 4 SATB lines, 32 units each.
// Bars: Dm | Bbmaj7→Bb | Gm→Gm7 | Asus4→A | Dm/F | Gm | Bbmaj7 (peak F5) | Asus4→A
const LAMENT_A = [
  [[69, 4], [69, 2], [70, 2], [70, 2], [72, 1], [74, 1], [74, 2], [73, 2], [74, 3], [76, 1], [77, 2], [76, 1], [74, 1], [77, 4], [76, 4]],
  [[65, 4], [65, 4], [67, 2], [65, 2], [64, 4], [65, 4], [70, 4], [69, 4], [62, 2], [61, 2]],
  [[57, 4], [58, 4], [62, 4], [57, 4], [62, 4], [62, 4], [62, 4], [57, 4]],
  [[50, 4], [46, 4], [43, 4], [45, 4], [41, 4], [43, 4], [46, 4], [45, 4]],
];
// Bars: Dm7 | Gm/Bb | F/A | Gm | Dm/F | Eø7 | A7sus→A7 | Dm
const LAMENT_B = [
  [[74, 2], [72, 2], [70, 4], [69, 2], [72, 2], [70, 3], [69, 1], [69, 4], [70, 4], [69, 2], [67, 2], [65, 4]],
  [[65, 4], [67, 4], [65, 4], [62, 4], [65, 4], [67, 4], [62, 2], [61, 2], [62, 4]],
  [[57, 4], [62, 4], [60, 4], [58, 4], [62, 4], [62, 4], [52, 2], [55, 2], [57, 4]],
  [[38, 4], [46, 4], [45, 4], [43, 4], [41, 4], [40, 4], [45, 4], [38, 4]],
];
// Title cadence (seconds): F | Bb | Asus4→A | D major (Picardy)
const TITLE = [
  [[72, 4], [74, 3], [76, 1.5], [76, 1.5], [78, 6]],
  [[65, 4], [65, 3], [62, 1.5], [61, 1.5], [62, 6]],
  [[57, 4], [58, 3], [57, 3], [54, 6]],
  [[41, 4], [34, 3], [33, 3], [38, 6]],
];

// Heroic theme (Gundam launch), 8 bars of 4 beats, D major with borrowed bVI / bVII.
const HERO_MEL = [
  [69, 1], [74, 1.5], [76, 0.5], [78, 1],
  [77, 3], [74, 1],
  [76, 1.5], [72, 0.5], [79, 2],
  [78, 3], [69, 1],
  [74, 1], [76, 0.5], [78, 0.5], [79, 1], [81, 1],
  [82, 2], [81, 1], [77, 1],
  [79, 1.5], [76, 0.5], [72, 1], [76, 1],
  [81, 4],
];
const HERO_CH = ['D', 'Bb', 'C', 'D', 'G', 'Bb', 'C', 'Asus'];
// same contour in D minor for the singularity core
const CORE_MEL = [
  [69, 1], [74, 1.5], [76, 0.5], [77, 1],
  [77, 3], [74, 1],
  [76, 1.5], [72, 0.5], [79, 2],
  [81, 3], [77, 1],
  [76, 4],
];
const CORE_CH = ['Dm', 'Bb', 'C', 'Dm', 'A'];

// Accelerating heartbeat (Act IV dive) — shared with the SFX cue list.
export function heartbeatTimes(t0 = 244, t1 = 262) {
  const out = [];
  let t = t0;
  while (t < t1 - 0.3) {
    out.push(Math.round(t * 1000) / 1000);
    const k = (t - t0) / (t1 - t0);
    t += 1.15 - 0.73 * Math.pow(k, 1.1);
  }
  return out;
}

// ------------------------------------------------------------------ helpers
class Seq {
  constructor() { this.ev = []; }
  add(t, type, p) { this.ev.push({ t, type, p }); return this; }
}
const V = (o, t, d = 0.4) => (typeof o === 'function' ? o(t) : (o ?? d));

// render one melodic line; each note is one event (legato overlap), `oct` adds an octave double
function line(S, t0, unit, notes, type, o = {}) {
  let t = t0;
  for (const [m, u] of notes) {
    const d = u * unit;
    if (m != null) {
      const mm = m + (o.shift || 0);
      const ns = o.oct ? [mm, mm + o.oct] : [mm];
      S.add(t, type, { ...(o.p || {}), notes: ns, note: mm, dur: d + (o.overlap ?? 0.15), vel: V(o.vel, t) });
    }
    t += d;
  }
  return t;
}
// take units [u0,u1) of a line
function slice(notes, u0, u1) {
  const out = []; let u = 0;
  for (const [m, d] of notes) {
    const a = Math.max(u, u0), b = Math.min(u + d, u1);
    if (b > a) out.push([m, b - a]);
    u += d;
  }
  return out;
}
// four-part chorale: which = {S:'choir'|'strings'|..., ...}
function chorale(S, t0, unit, L, u0, u1, parts) {
  const names = ['S', 'A', 'T', 'B'];
  names.forEach((nm, i) => {
    const specs = parts[nm];
    if (!specs) return;
    for (const sp of [].concat(specs)) line(S, t0, unit, slice(L[i], u0, u1), sp.type, sp);
  });
}
function roll(S, t0, t1, v0, v1, rate = 16) {
  for (let t = t0; t < t1 - 1e-6; t += 1 / rate) S.add(t, 'snare', { vel: v0 + (v1 - v0) * (t - t0) / (t1 - t0), dec: 0.035, verb: 0.35 });
}
function accel(S, t0, t1, i0, i1, v0, v1, f = 60) {
  let t = t0;
  while (t < t1) {
    const k = (t - t0) / (t1 - t0);
    S.add(t, 'taiko', { vel: v0 + (v1 - v0) * k, f: f * (1 + 0.25 * k) });
    t += i0 * Math.pow(i1 / i0, k);
  }
}
// cinematic hit: boom + crash + (braam) + brass/strings stab
function hit(S, t, o = {}) {
  const vel = o.vel ?? 1;
  S.add(t, 'boom', { vel, f: o.f ?? 40, dur: o.boomDur ?? 4 });
  S.add(t, 'cymbal', { vel: 0.8 * vel, dur: 4 });
  S.add(t, 'taiko', { vel, f: 48, dec: 1.4 });
  if (o.braam !== false) S.add(t, 'braam', { root: o.root ?? 38, dur: o.braamDur ?? 3.5, vel });
  if (o.chord) {
    S.add(t, 'brass', { notes: o.chord, dur: o.stab ?? 1.2, vel: vel * 0.95, rel: 0.6 });
    S.add(t, 'strings', { notes: o.chord.map((n) => n + 12), dur: o.stab ?? 1.2, vel: vel * 0.7, atk: 0.02, rel: 0.8 });
  }
}

// one bar of drums at t
function drumBar(S, t, style, vel) {
  const B = BEAT;
  const tk = (beat, v, f = 55, dec = 0.9) => S.add(t + beat * B, 'taiko', { vel: v * vel, f, dec });
  const kk = (beat, v) => S.add(t + beat * B, 'kick', { vel: v * vel });
  const sn = (beat, v) => S.add(t + beat * B, 'snare', { vel: v * vel });
  const hh = (beat, v) => S.add(t + beat * B, 'hat', { vel: v * vel });
  if (style === 'sparse') {
    tk(0, 1, 48, 1.3); tk(2, 0.6, 60); tk(3.5, 0.5, 72, 0.6); kk(0, 0.7);
  } else if (style === 'battle') {
    tk(0, 1, 50, 1.1); tk(1.5, 0.55, 75, 0.5); tk(2, 0.85, 55); tk(2.75, 0.45, 80, 0.4); tk(3, 0.8, 62); tk(3.5, 0.55, 75, 0.5);
    kk(0, 0.9); kk(2, 0.8); sn(1, 0.75); sn(3, 0.8);
    for (let i = 0; i < 8; i++) hh(i * 0.5, i % 2 ? 0.45 : 0.7);
  } else if (style === 'hero') {
    tk(0, 1, 50, 1.1); tk(2.5, 0.6, 70, 0.5);
    kk(0, 1); kk(1.5, 0.7); kk(2, 0.9); kk(3.5, 0.5);
    sn(1, 0.85); sn(3, 0.9);
    for (let i = 0; i < 8; i++) hh(i * 0.5, i % 2 ? 0.5 : 0.8);
  } else if (style === 'double') {
    for (let i = 0; i < 8; i++) tk(i * 0.5, i % 2 ? 0.55 : 0.9, i % 4 === 0 ? 48 : 66, 0.6);
    for (let i = 0; i < 4; i++) kk(i, 0.9);
    sn(1, 0.9); sn(3, 0.95); sn(3.75, 0.5);
    for (let i = 0; i < 16; i++) hh(i * 0.25, i % 2 ? 0.35 : 0.6);
  }
}

// accompaniment groove: one chord per bar
function groove(S, bar0, chords, o = {}) {
  chords.forEach((cn, i) => {
    const b = bar0 + i, c = CH[cn], t = bt(b), vel = V(o.vel, t, 0.6);
    if (o.ost) {
      const pat = [0, 0, 7, 0, 0, 0, 7, 0, 0, 0, 7, 0, 0, 12, c.x, 7];
      const root = c.b + 12;
      const step = o.ost === 16 ? 1 : 2;
      for (let k = 0; k < 16; k += step) {
        const tt = t + k * 0.125, acc = k % 4 === 0 ? 1 : 0.72;
        S.add(tt, 'stac', { note: root + pat[k], dur: o.ost === 16 ? 0.11 : 0.22, vel: vel * 0.85 * acc });
        if (o.ostHi) S.add(tt, 'stac', { note: root + 12 + pat[k], dur: 0.1, vel: vel * 0.5 * acc });
      }
    }
    if (o.bass) for (let k = 0; k < 8; k++) S.add(t + k * 0.25, 'bass', { note: c.b, dur: 0.21, vel: vel * (k % 2 ? 0.55 : 0.8) });
    if (o.sub !== false) S.add(t, 'sub', { note: c.b - 12 >= 24 ? c.b - 12 : c.b, dur: 1.95, vel: 0.5 * vel, atk: 0.02, rel: 0.25 });
    if (o.pad) S.add(t, 'strings', { notes: c.u, dur: 2.05, vel: vel * 0.55, atk: 0.25, rel: 0.7 });
    if (o.brassPad) S.add(t, 'brass', { notes: c.u, dur: 2, vel: vel * 0.4, atk: 0.3, rel: 0.4 });
    if (o.brass) for (const [bb, d] of [[0, 0.7], [0.75, 0.25], [1, 1], [2.5, 0.5], [3, 1]]) {
      S.add(t + bb * BEAT, 'brass', { notes: c.u, dur: d * BEAT * 0.9, vel: vel * 0.7 });
    }
    if (o.choir) S.add(t, 'choir', { notes: c.u.slice(1).map((n) => n + 12), dur: 2.1, vel: vel * 0.5, atk: 0.35, rel: 1, vowel: 'ah' });
    if (o.drums) drumBar(S, t, o.drums, vel);
  });
}

// heroic theme over nBars starting at bar0
function heroTheme(S, bar0, nBars, o = {}) {
  const MEL = o.mel || HERO_MEL, CHS = o.chords || HERO_CH;
  let b = 0;
  for (const [m, d] of MEL) {
    if (b >= nBars * 4) break;
    const t = bt(bar0, b), dur = d * BEAT;
    S.add(t, 'lead', { note: m, dur: dur * 0.96 + 0.03, vel: o.leadVel ?? 0.8 });
    S.add(t, 'brass', { notes: [m - 12], dur: dur * 0.95, vel: o.brassVel ?? 0.55, atk: 0.04 });
    if (o.choirMel) S.add(t, 'choir', { notes: [m], dur: dur + 0.1, vel: 0.4, atk: 0.08, rel: 0.6, vowel: 'ah' });
    b += d;
  }
  const chords = [];
  for (let i = 0; i < nBars; i++) chords.push(CHS[i % CHS.length]);
  groove(S, bar0, chords, {
    vel: o.vel ?? 0.8, ost: 16, ostHi: !!o.full, bass: true, pad: true, brassPad: true,
    choir: !!o.choir, drums: o.drums ?? 'hero',
  });
  for (let i = 0; i < nBars; i += 4) S.add(bt(bar0 + i), 'cymbal', { vel: 0.55, dur: 3 });
}

// ------------------------------------------------------------------ section generators
const GEN = {
  // S24 369–382 (synth mode): D-major pad carries the title card (371.8) into the 379.5–381.8 fade
  titleTail(S, s) {
    const d = s.t1 - s.t0;
    S.add(s.t0, 'strings', { notes: [38, 50, 57, 62, 66], dur: d, vel: 0.3, atk: 3, rel: 1.5 });
    S.add(s.t0 + 0.5, 'choir', { notes: [62, 66, 69], dur: d - 0.5, vel: 0.3, atk: 3, rel: 1.5, vowel: 'oo', vowel2: 'ah' });
    S.add(371.8, 'choir', { notes: [74, 78, 81], dur: s.t1 - 371.8, vel: 0.34, atk: 1.2, rel: 1.5, vowel: 'ah' });
    S.add(371.8, 'glass', { notes: [86, 90, 93], dur: s.t1 - 371.8, vel: 0.08, atk: 2, rel: 1.5 });
    S.add(s.t0, 'sub', { note: 26, dur: d, vel: 0.35, atk: 3, rel: 1.5 });
  },
  // S1 0–14: black, low choir drone D minor, stars fade in
  voidDrone(S, s) {
    S.add(0, 'sub', { note: 26, dur: 14.5, vel: 0.5, atk: 6, rel: 3 });
    S.add(0.3, 'choir', { notes: [38, 45, 50], dur: 14.2, vel: 0.5, atk: 6, rel: 3, vowel: 'oo', vowel2: 'oh' });
    S.add(6, 'choir', { notes: [57, 62], dur: 8.5, vel: 0.3, atk: 4, rel: 3, vowel: 'oo' });
    S.add(5, 'glass', { notes: [86, 93], dur: 9, vel: 0.12, atk: 4, rel: 3 });
    S.add(12, 'revswell', { dur: 2, vel: 0.12 });
  },
  // S2 14–34: the lament, choir swells to the F5 peak at ~29 s
  lamentA(S, s) {
    const u = (s.t1 - s.t0) / 32, cres = (t) => 0.3 + 0.45 * Math.sin(Math.PI * Math.pow(clamp01((t - s.t0) / (s.t1 - s.t0 + 1)), 2.4));
    chorale(S, s.t0, u, LAMENT_A, 0, 32, {
      S: [{ type: 'choir', vel: cres, p: { atk: 1, rel: 1.8, vowel: 'ah' } }, { type: 'strings', vel: (t) => cres(t) * 0.6, p: { atk: 0.8, vib: 9 } }],
      A: [{ type: 'choir', vel: (t) => cres(t) * 0.8, p: { atk: 1.2, rel: 1.8, vowel: 'oh' } }, { type: 'strings', vel: (t) => cres(t) * 0.55 }],
      T: { type: 'strings', vel: (t) => cres(t) * 0.7 },
      B: [{ type: 'strings', vel: (t) => cres(t) * 0.8, oct: -12 }, { type: 'sub', shift: -12, vel: 0.4, p: { atk: 1, rel: 1.5 } }],
    });
  },
  // S3 34–48: gentler continuation (Lament B, first half)
  lamentB4(S, s) {
    const u = (s.t1 - s.t0) / 16;
    chorale(S, s.t0, u, LAMENT_B, 0, 16, {
      S: { type: 'choir', vel: 0.3, p: { atk: 1.2, rel: 2, vowel: 'oo' } },
      A: { type: 'strings', vel: 0.22 },
      T: { type: 'strings', vel: 0.24 },
      B: [{ type: 'strings', vel: 0.28, oct: -12 }, { type: 'sub', shift: -12, vel: 0.3 }],
    });
    S.add(s.t0 + 2, 'glass', { notes: [81, 88], dur: 11, vel: 0.06, atk: 3 });
  },
  // S4 48–63: hangar — calm, hopeful (corporate-propaganda serenity); hard-cut at 63 by the engine
  hangar(S, s) {
    S.add(48, 'strings', { notes: [53, 60, 64, 67], dur: 7.5, vel: 0.24, atk: 2.5, rel: 2 });     // Fadd9
    S.add(55.5, 'strings', { notes: [46, 58, 62, 65, 69], dur: 8, vel: 0.26, atk: 2.5, rel: 2 }); // Bbmaj7
    S.add(48, 'choir', { notes: [69, 72], dur: 15, vel: 0.16, atk: 3, vowel: 'oo' });
    S.add(48, 'sub', { note: 29, dur: 7.5, vel: 0.3, atk: 3 });
    S.add(55.5, 'sub', { note: 34, dur: 8, vel: 0.3, atk: 2 });
    const arp = [65, 69, 72, 76, 77, 76, 72, 69];
    for (let i = 0; i < 28; i++) S.add(48.5 + i * 0.5, 'harp', { note: (i >= 14 ? 5 : 0) + arp[i % 8], vel: 0.12, dec: 2.4 });
    S.add(52, 'glass', { notes: [84, 88], dur: 11, vel: 0.06, atk: 3 });
  },
  // S5 63.04–76: klaxons, dread (starts right after the 40 ms crash-cut silence)
  warning(S, s) {
    const T = s.t0, E = s.t1;
    for (let t = T; t < E - 1e-6; t += 0.25) {
      const k = Math.round((t - T) / 0.25) % 8, acc = k === 0 || k === 3 || k === 6;
      const note = Math.floor((t - T) / 2) % 4 === 2 ? 39 : 38;
      S.add(t, 'bass', { note, dur: 0.2, vel: acc ? 0.85 : 0.3, bright: 0.7, decay: 0.08 });   // darker, heavier pulse
    }
    S.add(T, 'strings', { notes: [50, 51, 57], dur: E - T, vel: 0.35, atk: 3, rel: 1, trem: 12, swell: true });
    S.add(T, 'braam', { root: 39, dur: 2.5, vel: 0.8 });
    S.add(68, 'brass', { notes: [39, 46, 51], dur: 3.5, vel: 0.5, swell: true });
    S.add(72, 'brass', { notes: [38, 45, 50, 51], dur: 4, vel: 0.65, swell: true });
    S.add(T, 'sub', { note: 26, dur: E - T, vel: 0.5, atk: 0.05 });
    for (const [t, v] of [[T, 1], [67, 0.8], [71, 0.85], [73, 0.7], [74, 0.8], [75, 0.9]]) S.add(t, 'taiko', { vel: v, f: 48, dec: 1.2 });
    roll(S, 74, 76, 0.1, 0.7);
    S.add(74, 'revswell', { dur: 2, vel: 0.5 });
  },
  // S6 76–92: gravity well reveal — sub dread, low choir cluster, lensing shimmer
  well(S, s) {
    hit(S, 76, { root: 38, vel: 0.85, braamDur: 4 });
    S.add(76, 'sub', { note: 26, dur: 16, vel: 0.7, atk: 1, wobble: 0.5 });
    S.add(76.5, 'sub', { note: 27, dur: 15.5, vel: 0.3, atk: 4 });
    S.add(77, 'choir', { notes: [38, 39, 45, 50, 51], dur: 15, vel: 0.5, atk: 6, rel: 2, vowel: 'oo', vowel2: 'ah' });
    S.add(80, 'glass', { notes: [86, 87, 93, 98], dur: 12, vel: 0.1, atk: 4, rel: 2 });
    S.add(82, 'revswell', { dur: 2, vel: 0.3 });
    S.add(84, 'braam', { root: 39, dur: 3, vel: 0.6 });
    S.add(84, 'strings', { notes: [74, 75], dur: 8, vel: 0.2, atk: 3, trem: 9, swell: true });
    S.add(88, 'braam', { root: 38, dur: 3, vel: 0.75 });
    S.add(89, 'revswell', { dur: 3, vel: 0.45, notes: [50, 51, 57] });
    S.add(88, 'taiko', { vel: 0.8, f: 45, dec: 1.4 });
  },
  // S7 92–108: the enemy arrives; drums at 96, dreadnought braam at 100
  enemy(S, s) {
    S.add(92, 'sub', { note: 26, dur: 4, vel: 0.5, atk: 1 });
    for (let t = 92; t < 96 - 1e-6; t += 0.25) {
      const k = Math.round((t - 92) / 0.25) % 8, acc = k === 0 || k === 3 || k === 6;
      S.add(t, 'bass', { note: 38, dur: 0.18, vel: acc ? 0.8 : 0.3, bright: 1.5, decay: 0.06 });
    }
    for (const [t, r] of [[93, 38], [95, 39], [97, 40]]) S.add(t, 'brass', { notes: [r, r + 7, r + 12], dur: 1.1, vel: 0.8, rel: 0.5 });
    groove(S, bar(96), ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'A'], {
      vel: ramp(96, 108, 0.5, 0.7), ost: 8, bass: false, pad: true, drums: 'sparse',
    });
    hit(S, 100, { root: 38, vel: 1, braamDur: 4.5, chord: [38, 45, 50] });
    S.add(100, 'choir', { notes: [50, 57, 62], dur: 8, vel: 0.35, atk: 2, vowel: 'ah' });
  },
  // v3 standoff 100–108: two battle lines facing — held breath, low pedal, distant drums
  standoff(S, s) {
    S.add(s.t0, 'strings', { notes: [38, 45, 50], dur: s.t1 - s.t0 + 0.5, vel: 0.3, atk: 2, rel: 1.2, trem: 7 });
    S.add(s.t0, 'sub', { note: 26, dur: s.t1 - s.t0, vel: 0.45, atk: 1.5, rel: 0.5 });
    S.add(s.t0 + 1, 'choir', { notes: [57, 62, 63], dur: s.t1 - s.t0 - 1, vel: 0.3, atk: 3, rel: 1, vowel: 'oo', swell: true });
    for (let t = s.t0; t < s.t1 - 0.1; t += 2) S.add(t, 'taiko', { vel: 0.45 + 0.05 * (t - s.t0) / 2, f: 46, dec: 1.2 });
  },
  // S8 108–120: fleet turns, brass ostinato, ion charge build → silence gap → HIT
  formation(S, s) {
    groove(S, bar(108), ['Dm', 'Bb', 'Gm', 'C', 'Asus', 'A'], {
      vel: ramp(108, 120, 0.55, 0.85), ost: 16, bass: true, brass: true, pad: true, drums: 'battle',
    });
    S.add(112, 'choir', { notes: [62, 65, 69], dur: 7.8, vel: 0.5, atk: 1, vowel: 'oh', vowel2: 'ah', swell: true });
    roll(S, 116, 119.8, 0.08, 0.85, 16);
    S.add(116, 'riser', { dur: 3.85, vel: 0.6 });
    S.add(118, 'cymbal', { rev: true, dur: 1.9, vel: 0.6 });
  },
  // S9 120–134: ion volley — massive hit, full battle
  volley(S, s) {
    hit(S, 120, { root: 38, vel: 1, braamDur: 5, chord: [50, 57, 62, 65, 69], stab: 1.5 });
    S.add(120, 'choir', { notes: [62, 65, 69, 74], dur: 8, vel: 0.6, atk: 0.3, vowel: 'ah' });
    groove(S, bar(120), ['Dm', 'Dm', 'Bb', 'Bb', 'C', 'C', 'A'], {
      vel: 0.85, ost: 16, ostHi: true, bass: true, brass: true, drums: 'battle', pad: true,
    });
    S.add(128, 'brass', { notes: [57, 62, 65], dur: 4, vel: 0.5, swell: true });
  },
  // S10 134–150: dogfight
  dogfight(S, s) {
    groove(S, bar(134), ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'], {
      vel: 0.8, ost: 16, ostHi: true, bass: true, drums: 'battle', pad: true,
    });
    line(S, 134, BEAT, [[69, 8], [70, 8], [70, 4], [67, 4], [69, 4], [73, 4]], 'brass', { vel: 0.5, oct: -12, overlap: 0.05, p: { atk: 0.35, rel: 0.5 } });
    line(S, 142, BEAT, [[81, 4], [82, 4], [79, 4], [76, 2], [81, 2]], 'strings', { vel: 0.35, overlap: 0.05, p: { atk: 0.3, vib: 12 } });
    S.add(134, 'cymbal', { vel: 0.5, dur: 3 });
    S.add(142, 'cymbal', { vel: 0.5, dur: 3 });
  },
  // S11a 150–158: lights, eyes sting 153, build to launch
  launchBuild(S, s) {
    groove(S, bar(150), ['Dm', 'Bb', 'C', 'Asus'], { vel: ramp(150, 158, 0.35, 0.8), ost: 8, pad: true });
    S.add(153, 'brass', { notes: [62, 66, 69, 74], dur: 1.6, vel: 0.9, rel: 0.8 });
    S.add(153, 'boom', { vel: 0.6, f: 45, dur: 3 });
    S.add(153, 'cymbal', { vel: 0.5, dur: 3 });
    S.add(153, 'glass', { notes: [81, 86, 90], dur: 3, vel: 0.12, atk: 0.05, rel: 2 });
    accel(S, 154, 157.8, 0.5, 0.125, 0.35, 0.95, 55);
    roll(S, 156, 157.8, 0.15, 0.9, 20);
    S.add(154, 'riser', { dur: 3.8, vel: 0.65 });
    S.add(154, 'choir', { notes: [57, 62, 64, 69], dur: 3.8, vel: 0.55, atk: 0.5, vowel: 'ah', swell: true, rel: 0.2 });
    S.add(156, 'cymbal', { rev: true, dur: 1.9, vel: 0.7 });
  },
  // S11b/S12 158–190: HEROIC THEME ×2
  heroic(S, s) {
    hit(S, 158, { root: 38, vel: 1, chord: [50, 57, 62, 66, 69] });
    heroTheme(S, bar(158), 8, { vel: 0.8 });
    heroTheme(S, bar(174), 8, { vel: 0.9, full: true, choir: true, choirMel: true, leadVel: 0.85 });
    S.add(174, 'boom', { vel: 0.7, f: 42, dur: 3 });
    // countermelody (high strings) in the second statement
    line(S, 174, BEAT, [[86, 4], [86, 2], [84, 2], [84, 4], [86, 4], [83, 4], [86, 4], [84, 4], [88, 4]], 'strings', { vel: 0.3, overlap: 0.08, p: { atk: 0.2, vib: 10 } });
  },
  // S12b 190–194: slow motion — suspended Bb, muffled (see AUTOMATION.lowpass)
  slowmo(S, s) {
    S.add(190, 'choir', { notes: [58, 62, 65, 70], dur: 4, vel: 0.65, atk: 0.4, rel: 0.3, vowel: 'ah' });
    S.add(190, 'strings', { notes: [46, 53, 58, 62], dur: 4, vel: 0.5, atk: 0.3, rel: 0.3 });
    S.add(190, 'sub', { note: 34, dur: 4, vel: 0.5, atk: 0.2, rel: 0.3 });
    S.add(190, 'boom', { vel: 0.5, f: 36, dur: 4 });
    S.add(192.2, 'revswell', { dur: 1.8, vel: 0.6, notes: [62, 66, 69] });
  },
  // S12c 194–200: return, cadence on A → dread
  heroicTail(S, s) {
    hit(S, 194, { root: 38, vel: 0.95, chord: [50, 58, 62, 65] });
    heroTheme(S, bar(194), 3, { vel: 0.9, full: true, choir: true, mel: [[77, 3], [74, 1], [76, 1.5], [72, 0.5], [79, 2], [81, 4]], chords: ['Bb', 'C', 'Asus'] });
    S.add(198, 'strings', { notes: [57, 61, 64, 69], dur: 2.2, vel: 0.5, atk: 0.2, rel: 0.5 });
  },
  // S13 200–216: dissonant cluster choir crescendo, accelerating taiko, rising gliss
  lanceCluster(S, s) {
    const cl = [[200, 50], [200, 57], [200, 62], [202, 63], [204, 61], [204, 58], [206, 64], [206, 56], [208, 65], [208, 59], [210, 66], [210, 60], [212, 67], [212, 55], [213.5, 68], [213.5, 54]];
    for (const [t, m] of cl) S.add(t, 'choir', { notes: [m], dur: 216 - t, vel: 0.55, atk: 1, rel: 0.25, vowel: 'ah', vowel2: 'eh', swell: true, bend: 40 });
    S.add(200, 'strings', { notes: [50, 62], dur: 16, vel: 0.5, atk: 2, rel: 0.2, bend: 1200, trem: 13, swell: true });
    S.add(200, 'strings', { notes: [74, 75], dur: 16, vel: 0.4, atk: 3, rel: 0.2, bend: 700, swell: true });
    S.add(200, 'sub', { note: 26, dur: 16, vel: 0.6, atk: 3, rel: 0.2, wobble: 1.5 });
    accel(S, 200, 215.8, 2, 0.1, 0.35, 1, 50);
    S.add(208, 'braam', { root: 39, dur: 3, vel: 0.7 });
    S.add(212, 'braam', { root: 40, dur: 2.5, vel: 0.85 });
    roll(S, 213, 215.9, 0.1, 0.9, 24);
    S.add(213, 'revswell', { dur: 3, vel: 0.7, notes: [50, 56, 62] });
  },
  // S14 216–226: lance fires; music drops to near-silence (tinnitus is an SFX cue)
  lanceAftermath(S, s) {
    hit(S, 216, { root: 38, vel: 1, braamDur: 3, boomDur: 5 });
    S.add(219, 'sub', { note: 26, dur: 7, vel: 0.35, atk: 3 });
    S.add(222, 'choir', { notes: [50, 57], dur: 4.5, vel: 0.2, atk: 3, vowel: 'oo' });
    S.add(224, 'strings', { notes: [50, 57, 62], dur: 2.6, vel: 0.15, atk: 2 });
  },
  // S15 226–240: burning mothership — fragile lament; A-major swell on "…내가 간다." (236)
  burning(S, s) {
    const u = 0.8, t0 = 226.4;
    chorale(S, t0, u, LAMENT_A, 0, 16, {
      S: { type: 'choir', vel: 0.35, p: { atk: 1.2, rel: 2, vowel: 'oo' } },
      A: { type: 'strings', vel: 0.2, p: { vib: 8 } },
      T: { type: 'strings', vel: 0.22 },
      B: [{ type: 'strings', vel: 0.25, oct: -12 }, { type: 'sub', shift: -12, vel: 0.3 }],
    });
    S.add(236, 'brass', { notes: [45, 52, 57, 61], dur: 3.6, vel: 0.55, swell: true, rel: 0.8 });
    S.add(236, 'taiko', { vel: 0.6, f: 45, dec: 1.4 });
    S.add(238.5, 'revswell', { dur: 1.5, vel: 0.5 });
  },
  // S16 240–262: dive into the well — time dilation (everything bends down), rising line
  dive(S, s) {
    S.add(240, 'boom', { vel: 0.8, f: 38, dur: 4 });
    S.add(240, 'sub', { note: 26, dur: 22, vel: 0.55, atk: 2, rel: 0.3 });
    S.add(240, 'strings', { notes: [38, 45, 50], dur: 22, vel: 0.35, atk: 3, rel: 0.3, bend: -200 });
    S.add(241, 'choir', { notes: [50, 57, 62], dur: 21, vel: 0.4, atk: 4, rel: 0.3, vowel: 'oo', vowel2: 'ah', bend: -100 });
    [74, 75, 76, 77, 78, 79, 80, 81].forEach((m, i) => {
      const t = 240.5 + i * 2.6;
      S.add(t, 'strings', { notes: [m], dur: 3, vel: 0.18 + i * 0.04, atk: 1, rel: 0.6, trem: 10 + i });
    });
    S.add(248, 'glass', { notes: [86, 87], dur: 14, vel: 0.08, atk: 5, rel: 0.3 });
    S.add(250, 'revswell', { dur: 2, vel: 0.25 });
    S.add(256, 'revswell', { dur: 2, vel: 0.3 });
    S.add(258, 'riser', { dur: 3.95, vel: 0.5 });
    S.add(260, 'cymbal', { rev: true, dur: 1.95, vel: 0.6 });
  },
  // S17 262–278: the core — full orchestra in D minor, break before the slash (273)
  core(S, s) {
    hit(S, 262, { root: 38, vel: 1, chord: [50, 57, 62, 65, 69] });
    heroTheme(S, bar(262), 5, { vel: 0.9, full: true, choir: true, choirMel: true, mel: CORE_MEL, chords: CORE_CH, drums: 'double' });
    S.add(266, 'braam', { root: 38, dur: 2.5, vel: 0.7 });
    S.add(270, 'riser', { dur: 1.95, vel: 0.5 });
    hit(S, 273, { root: 38, vel: 1, braamDur: 4, chord: [50, 57, 62, 65] });
    S.add(273, 'choir', { notes: [62, 65, 69, 74], dur: 5, vel: 0.65, atk: 0.2, rel: 0.2, vowel: 'ah', swell: true });
    S.add(273, 'strings', { notes: [74, 77, 81], dur: 5, vel: 0.45, atk: 0.5, trem: 14, rel: 0.2 });
    S.add(273, 'sub', { note: 26, dur: 5, vel: 0.6, atk: 0.1, rel: 0.2 });
    roll(S, 275, 278, 0.1, 0.8, 20);
    S.add(278, 'strings', { notes: [50, 57, 62], dur: 2, vel: 0.6, atk: 1.9, rel: 0.02, bend: 1200, swell: true });
    S.add(278, 'revswell', { dur: 2, vel: 0.9, notes: [38, 50, 57, 62], fTop: 12000 });
  },
  // S18 280–292: shockwave aftermath — open fifths, distant, then a first hint of D major
  implosion(S, s) {
    hit(S, 280, { root: 38, vel: 1, braamDur: 6, boomDur: 6 });
    S.add(281, 'glass', { notes: [86, 93, 98], dur: 10, vel: 0.1, atk: 3, rel: 3 });
    S.add(282, 'choir', { notes: [50, 57, 62, 69], dur: 10, vel: 0.35, atk: 4, vowel: 'ah' });
    S.add(281, 'sub', { note: 26, dur: 11, vel: 0.4, atk: 3 });
    S.add(286, 'strings', { notes: [62, 66, 69], dur: 6.2, vel: 0.3, atk: 4, rel: 0.8 });
  },
  // S19 292–310: main-cannon build, triumphant D-major theme at 300
  mainCannon(S, s) {
    groove(S, bar(292), ['Bb', 'C', 'Asus', 'A'], { vel: ramp(292, 300, 0.4, 0.9), ost: 16, bass: true, pad: true, brassPad: true });
    accel(S, 294, 299.8, 0.5, 0.125, 0.4, 1, 55);
    roll(S, 297, 299.8, 0.1, 0.9, 20);
    S.add(296, 'riser', { dur: 3.8, vel: 0.65 });
    S.add(296, 'choir', { notes: [57, 62, 64, 69], dur: 3.8, vel: 0.6, atk: 0.5, vowel: 'ah', swell: true, rel: 0.2 });
    S.add(298, 'cymbal', { rev: true, dur: 1.9, vel: 0.7 });
    hit(S, 300, { root: 38, vel: 1, braamDur: 4, chord: [50, 57, 62, 66, 69] });
    heroTheme(S, bar(300), 4, { vel: 1, full: true, choir: true, choirMel: true, leadVel: 0.9 });
    S.add(308, 'brass', { notes: [50, 57, 62, 66, 69, 74], dur: 3.5, vel: 0.85, atk: 0.1, rel: 1.5 });
    S.add(308, 'choir', { notes: [62, 66, 69, 74, 78], dur: 4, vel: 0.6, atk: 0.2, rel: 2.5, vowel: 'ah' });
    S.add(308, 'strings', { notes: [62, 66, 69, 74], dur: 4, vel: 0.55, atk: 0.1, rel: 2 });
    S.add(308, 'sub', { note: 26, dur: 3.5, vel: 0.6, atk: 0.05, rel: 1.5 });
    S.add(308, 'cymbal', { vel: 0.7, dur: 4 });
    S.add(308, 'boom', { vel: 0.8, f: 40, dur: 4 });
    for (let t = 308; t < 310.5; t += 0.0625) S.add(t, 'taiko', { vel: 0.7 * (1 - (t - 308) / 3), f: 60, dec: 0.3 });
  },
  // S20 310–320: enemies flee; the orchestra relaxes, descending
  retreat(S, s) {
    S.add(310.5, 'strings', { notes: [50, 57, 62, 66], dur: 4, vel: 0.35, atk: 1, rel: 1.5 });
    S.add(314, 'strings', { notes: [46, 53, 57, 62], dur: 3.3, vel: 0.28, atk: 1, rel: 1.5 });
    S.add(317, 'strings', { notes: [43, 50, 58, 62], dur: 3.3, vel: 0.22, atk: 1, rel: 2 });
    S.add(310.5, 'choir', { notes: [69], dur: 3.6, vel: 0.28, atk: 1, vowel: 'oo' });
    S.add(314, 'choir', { notes: [69], dur: 3.2, vel: 0.25, atk: 1, vowel: 'oo' });
    S.add(317, 'choir', { notes: [70], dur: 3.2, vel: 0.22, atk: 1, vowel: 'oo' });
    S.add(310.5, 'sub', { note: 26, dur: 4, vel: 0.35 });
    S.add(314, 'sub', { note: 34, dur: 3.2, vel: 0.3 });
    S.add(317, 'sub', { note: 31, dur: 3.2, vel: 0.3 });
  },
  // S21 320–340: drifting, mournful solo choir
  drift(S, s) {
    const u = (s.t1 - s.t0) / 32;
    chorale(S, s.t0, u, LAMENT_B, 0, 32, {
      S: { type: 'choir', vel: 0.32, p: { atk: 1.5, rel: 2, vowel: 'oo', vib: 9 } },
      A: { type: 'strings', vel: 0.16 },
      T: { type: 'strings', vel: 0.17 },
      B: [{ type: 'strings', vel: 0.2, oct: -12 }, { type: 'sub', shift: -12, vel: 0.25 }],
    });
    [[322, 86], [324.6, 81], [327.1, 84], [330.2, 77], [333, 86], [335.4, 81], [338, 74]].forEach(([t, m]) => S.add(t, 'harp', { note: m, vel: 0.14, dec: 3 }));
  },
  // S22 340–356: homeward — lament returns in full (Adagio feel), builds to the title
  homeward(S, s) {
    const u = (s.t1 - s.t0) / 32, cres = ramp(340, 356, 0.35, 0.7);
    chorale(S, s.t0, u, LAMENT_A, 0, 32, {
      S: [{ type: 'choir', vel: cres, p: { atk: 0.8, rel: 1.6, vowel: 'ah' } }, { type: 'strings', vel: (t) => cres(t) * 0.6, p: { vib: 9 } }],
      A: [{ type: 'choir', vel: (t) => cres(t) * 0.75, p: { atk: 0.9, vowel: 'ah' } }, { type: 'strings', vel: (t) => cres(t) * 0.55 }],
      T: { type: 'strings', vel: (t) => cres(t) * 0.7 },
      B: [{ type: 'strings', vel: (t) => cres(t) * 0.8, oct: -12 }, { type: 'sub', shift: -12, vel: 0.45 }],
    });
    S.add(352, 'taiko', { vel: 0.4, f: 45, dec: 1.4 });
    S.add(354, 'taiko', { vel: 0.55, f: 45, dec: 1.4 });
    S.add(354, 'cymbal', { rev: true, dur: 1.95, vel: 0.5 });
  },
  // S23 356–372: title — F → Bb → Asus → A → D major (Picardy); fades by 372
  title(S, s) {
    S.add(356, 'boom', { vel: 0.6, f: 36, dur: 5 });
    S.add(356, 'cymbal', { vel: 0.45, dur: 5 });
    chorale(S, 356, 1, TITLE, 0, 16, {
      S: [{ type: 'choir', vel: 0.6, p: { atk: 0.6, rel: 3, vowel: 'ah' } }, { type: 'strings', vel: 0.4, p: { vib: 9 } }],
      A: [{ type: 'choir', vel: 0.5, p: { atk: 0.8, rel: 3, vowel: 'ah' } }, { type: 'strings', vel: 0.35 }],
      T: [{ type: 'strings', vel: 0.4 }, { type: 'brass', vel: 0.3, p: { atk: 1, rel: 2 } }],
      B: [{ type: 'strings', vel: 0.45, oct: -12 }, { type: 'sub', shift: -12, vel: 0.45, p: { rel: 3 } }],
    });
    const arp = (t0, notes, step) => notes.forEach((m, i) => S.add(t0 + i * step, 'harp', { note: m, vel: 0.2, dec: 2.8 }));
    arp(356, [65, 69, 72, 77, 81, 84, 89, 84, 81, 77, 72, 69], 0.33);
    arp(366, [62, 66, 69, 74, 78, 81, 86, 90], 0.3);
    S.add(366, 'glass', { notes: [86, 90, 93], dur: 5, vel: 0.1, atk: 1.5, rel: 2 });
  },
};

// Expand the SECTIONS table into events.
// Optional `from`: the generator was written for a section starting at `from`; its material is
// generated there, shifted to t0 and clipped at t1 (lets v3 re-time the pre-battle acts).
export function buildMusic(SECTIONS) {
  const S = new Seq();
  for (const sec of SECTIONS) {
    const g = GEN[sec.gen];
    if (!g) { console.warn('[audio] unknown section generator', sec.gen); continue; }
    if (sec.from === undefined) { g(S, sec); continue; }
    const d = sec.t0 - sec.from, tmp = new Seq();
    g(tmp, { ...sec, t0: sec.from, t1: sec.t1 - d });
    for (const e of tmp.ev) if (e.t + d < sec.t1 && e.t + d >= sec.t0 - 0.5) S.add(e.t + d, e.type, e.p);
  }
  return S.ev;
}
