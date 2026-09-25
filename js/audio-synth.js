// audio-synth.js — procedural instruments + SFX voices for the Score (pure WebAudio, no samples).
//
// Every voice is a plain function  fn(E, t, p)  where
//   E : the Score engine (ctx, shared buffers/curves, current session buses, active-source set)
//   t : absolute AudioContext time the event starts
//   p : params from the CUES / music event (p.dur = remaining duration for long events)
// Each call builds a tiny node graph inside a Voice; when all its sources have ended the
// Voice disconnects every node it created, so nothing accumulates over the 6 minutes.

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const R = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const nt = (p) => (p.note !== undefined ? p.note : p.notes[0]);

// ---------------------------------------------------------------- shared buffers / curves
export function buildShared(ctx) {
  const sr = ctx.sampleRate;
  const mk = (sec, ch, fill) => {
    const b = ctx.createBuffer(ch, Math.floor(sec * sr), sr);
    for (let c = 0; c < ch; c++) fill(b.getChannelData(c), c);
    return b;
  };
  const normalize = (d) => {
    let pk = 0;
    for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
    if (pk > 0) for (let i = 0; i < d.length; i++) d[i] /= pk;
  };
  const white = mk(4, 1, (d) => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  const brown = mk(4, 1, (d) => {
    let l = 0;
    for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l; }
    normalize(d);
  });
  // sparse random crackles (fire, sparks, sizzle)
  const crackle = mk(4, 1, (d) => {
    let i = 0;
    while (i < d.length) {
      i += Math.floor(R(0.003, 0.035) * sr);
      const amp = Math.pow(Math.random(), 1.6) * (Math.random() < 0.5 ? -1 : 1);
      const len = Math.floor(R(15, 220));
      for (let k = 0; k < len && i + k < d.length; k++) d[i + k] += amp * Math.exp(-k / (len / 4)) * (Math.random() * 2 - 1);
    }
    normalize(d);
  });
  // vast hall impulse: ~5.5 s, bright early, darker late, stereo-decorrelated
  const RT = 5.5;
  const impulse = mk(RT, 2, (d) => {
    let lp = 0;
    const pre = Math.floor(0.018 * sr);
    for (let i = 0; i < d.length; i++) {
      if (i < pre) { d[i] = 0; continue; }
      const t = (i - pre) / sr;
      const env = Math.exp(-t * 1.45) * Math.pow(1 - t / RT, 1.5) * Math.min(1, t / 0.03);
      const k = 0.1 + 0.85 * Math.exp(-t * 0.9);
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * env;
    }
  });
  const curve = (fn) => {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = fn(x); }
    return c;
  };
  const curves = {
    soft: curve((x) => Math.tanh(2 * x) / Math.tanh(2)),
    hard: curve((x) => Math.tanh(6 * x) / Math.tanh(6)),
    fold: curve((x) => Math.sin(x * Math.PI * 1.5) * 0.8 + Math.tanh(4 * x) * 0.2),
    crush: curve((x) => Math.round(Math.tanh(1.6 * x) * 7) / 7),   // stair curve: bit-crushed radio
  };
  return { buf: { white, brown, crackle, impulse }, curves };
}

// ---------------------------------------------------------------- Voice (node lifetime)
export class Voice {
  constructor(E, bus = 'music', o = {}) {
    this.E = E; this.c = E.ctx;
    this.nodes = []; this.pending = 0;
    this.out = this.g(o.gain ?? 1);
    let tail = this.out;
    if (o.pan || o.mp) {
      this.pan = this.add(this.c.createStereoPanner());
      this.pan.pan.value = clamp(o.pan, -1, 1);
      tail.connect(this.pan); tail = this.pan;
    }
    const s = E.sess;
    tail.connect(s[bus] || s.sfx);
    const verb = o.verb ?? 0;
    if (verb > 0) { const sg = this.g(verb); tail.connect(sg); sg.connect(bus === 'music' ? s.verbM : s.verbS); }
  }
  add(n) { this.nodes.push(n); return n; }
  g(v = 1) { const n = this.add(this.c.createGain()); n.gain.value = v; return n; }
  f(type, freq, Q = 0.7) {
    const n = this.add(this.c.createBiquadFilter());
    n.type = type; n.frequency.value = freq; n.Q.value = Q; return n;
  }
  ws(name) { const n = this.add(this.c.createWaveShaper()); n.curve = this.E.curves[name]; n.oversample = '2x'; return n; }
  osc(type, freq, t0, t1, detune = 0) {
    const o = this.add(this.c.createOscillator());
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    this._run(o, t0, t1); return o;
  }
  noise(kind, t0, t1, rate = 1) {
    const b = this.add(this.c.createBufferSource());
    b.buffer = this.E.buf[kind]; b.loop = true; b.playbackRate.value = rate;
    this._run(b, t0, t1, Math.random() * (b.buffer.duration - 0.05));
    return b;
  }
  panRamp(p0, p1, t0, t1) {
    if (!this.pan) return;
    this.pan.pan.setValueAtTime(clamp(p0, -1, 1), t0);
    this.pan.pan.linearRampToValueAtTime(clamp(p1, -1, 1), t1);
  }
  _run(src, t0, t1, off, bufDur) {
    if (bufDur !== undefined) src.start(t0, off, bufDur);
    else if (off !== undefined) src.start(t0, off); else src.start(t0);
    src.stop(Math.max(t1, t0 + 0.02));
    this.pending++;
    this.E.active.add(src);
    src.onended = () => {
      this.E.active.delete(src);
      if (--this.pending <= 0) this.dispose();
    };
  }
  dispose() {
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* already */ } }
    this.nodes.length = 0;
  }
}

// ---------------------------------------------------------------- envelope helpers
// attack/hold/release; swell = crescendo over the whole duration
function envAR(pr, t, dur, atk, rel, peak, swell) {
  pr.setValueAtTime(0, t);
  if (swell) {
    pr.linearRampToValueAtTime(peak * 0.03, t + Math.min(0.3, dur * 0.2));
    pr.exponentialRampToValueAtTime(Math.max(peak, 1e-4), t + Math.max(dur, 0.05));
  } else {
    pr.linearRampToValueAtTime(peak, t + Math.max(0.003, Math.min(atk, dur)));
  }
  pr.setTargetAtTime(0, t + dur, Math.max(0.005, rel / 5));
}
// percussive: instant attack, exponential decay (time-constant tc)
function perc(pr, t, peak, tc, atk = 0.003) {
  pr.setValueAtTime(0, t);
  pr.linearRampToValueAtTime(peak, t + atk);
  pr.setTargetAtTime(0, t + atk + 0.001, tc);
}
// exponential riser, abrupt cut
function riseCut(pr, t, t1, peak, cut = 0.03) {
  pr.setValueAtTime(1e-4, t);
  pr.exponentialRampToValueAtTime(Math.max(peak, 1e-4), t1);
  pr.linearRampToValueAtTime(0, t1 + cut);
}
function sweep(pr, t0, v0, t1, v1) {
  pr.setValueAtTime(v0, t0);
  pr.exponentialRampToValueAtTime(v1, Math.max(t1, t0 + 0.005));
}

// =================================================================== MUSIC INSTRUMENTS

// Bowed string section: 3 detuned saws per note → lowpass (bow bloom) → env. Optional tremolo / bend.
function strings(E, t, p) {
  const n = p.notes, dur = p.dur, vel = p.vel ?? 0.4, atk = p.atk ?? 0.9, rel = p.rel ?? 1.6;
  const end = t + dur, stop = end + rel * 1.4 + 0.05;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.55, pan: p.pan ?? 0 });
  const cut = (p.cut ?? (450 + 3000 * vel)) * (p.bright ?? 1);
  const f = v.f('lowpass', cut, 0.6);
  f.frequency.setValueAtTime(cut * 0.4, t);
  f.frequency.linearRampToValueAtTime(cut, t + Math.min(dur, atk * 1.3 + 0.05));
  const g = v.g(0);
  f.connect(g);
  let tail = g;
  if (p.trem) {
    const tg = v.g(0.55);
    const lfo = v.osc('sine', p.trem, t, stop), lg = v.g(0.45);
    lfo.connect(lg); lg.connect(tg.gain); g.connect(tg); tail = tg;
  }
  tail.connect(v.out);
  const vA = v.osc('sine', R(4.3, 5.0), t, stop), vB = v.osc('sine', R(5.1, 5.8), t, stop);
  const gA = v.g(p.vib ?? 6), gB = v.g(p.vib ?? 6);
  vA.connect(gA); vB.connect(gB);
  let k = 0;
  for (const m of n) for (const d of [-8, 0, 7]) {
    const d0 = d + R(-3, 3);
    const o = v.osc('sawtooth', mtof(m), t, stop, d0);
    if (p.bend) { o.detune.setValueAtTime(d0, t); o.detune.linearRampToValueAtTime(d0 + p.bend, end); }
    (k++ & 1 ? gA : gB).connect(o.detune);
    o.connect(f);
  }
  envAR(g.gain, t, dur, atk, rel, vel * 0.2 / Math.sqrt(n.length), p.swell);
}

// Choir: saw stack → parallel formant band-passes (vowel) + body; slow vibrato & drift; vowel morph.
const VOWELS = {
  ah: [[800, 1, 80], [1150, 0.5, 90], [2900, 0.18, 120]],
  oh: [[450, 1, 70], [800, 0.45, 80], [2830, 0.1, 100]],
  oo: [[325, 1, 50], [700, 0.25, 60], [2530, 0.05, 170]],
  eh: [[550, 1, 60], [1770, 0.4, 100], [2590, 0.22, 120]],
};
function choir(E, t, p) {
  const n = p.notes, dur = p.dur, vel = p.vel ?? 0.4, atk = p.atk ?? 1.8, rel = p.rel ?? 2.2;
  const end = t + dur, stop = end + rel * 1.4 + 0.05;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.75, pan: p.pan ?? 0 });
  const pre = v.g(1), g = v.g(0);
  g.connect(v.out);
  const V1 = VOWELS[p.vowel || 'ah'], V2 = p.vowel2 ? VOWELS[p.vowel2] : null;
  const MK = 3.4;
  for (let i = 0; i < 3; i++) {
    const [fr, amp, bw] = V1[i];
    const bp = v.f('bandpass', fr, fr / (bw * 1.6));
    const ga = v.g(amp * MK);
    pre.connect(bp); bp.connect(ga); ga.connect(g);
    if (V2) {
      const tA = t + dur * 0.2, tB = t + dur * 0.8;
      bp.frequency.setValueAtTime(fr, tA); bp.frequency.linearRampToValueAtTime(V2[i][0], tB);
      ga.gain.setValueAtTime(amp * MK, tA); ga.gain.linearRampToValueAtTime(V2[i][1] * MK, tB);
    }
  }
  const body = v.f('lowpass', 700, 0.5), bg = v.g(0.14);
  pre.connect(body); body.connect(bg); bg.connect(g);
  const vA = v.osc('sine', R(4.7, 5.3), t, stop), vB = v.osc('sine', R(5.4, 6.0), t, stop);
  const gA = v.g(p.vib ?? 12), gB = v.g(p.vib ?? 12);
  vA.connect(gA); vB.connect(gB);
  const dr = v.osc('sine', R(0.12, 0.3), t, stop), dg = v.g(7);
  dr.connect(dg);
  let k = 0;
  for (const m of n) for (const d of [-13, 0, 12]) {
    const d0 = d + R(-4, 4);
    const o = v.osc('sawtooth', mtof(m), t, stop, d0);
    if (p.bend) { o.detune.setValueAtTime(d0, t); o.detune.linearRampToValueAtTime(d0 + p.bend, end); }
    (k++ & 1 ? gA : gB).connect(o.detune); dg.connect(o.detune);
    o.connect(pre);
  }
  envAR(g.gain, t, dur, atk, rel, vel * 0.26 / Math.sqrt(n.length), p.swell);
}

// Brass (horns / trombones): saws + sub-octave square → brassy lowpass envelope → soft clip.
function brass(E, t, p) {
  const n = p.notes, dur = p.dur, vel = p.vel ?? 0.6;
  const atk = p.atk ?? (p.swell ? dur : 0.05), rel = p.rel ?? 0.35;
  const end = t + dur, stop = end + rel * 1.4 + 0.05;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.45, pan: p.pan ?? 0 });
  const f = v.f('lowpass', 200, 1.8), pre = v.g(0.35 / Math.sqrt(n.length)), sh = v.ws('soft'), g = v.g(0);
  f.connect(pre); pre.connect(sh); sh.connect(g); g.connect(v.out);
  const pk = (500 + 3600 * vel) * (p.bright ?? 1);
  const fr = f.frequency;
  fr.setValueAtTime(180, t);
  if (p.swell) fr.exponentialRampToValueAtTime(pk, end);
  else { fr.exponentialRampToValueAtTime(pk, t + atk + 0.04); fr.setTargetAtTime(pk * 0.55, t + atk + 0.05, 0.3); }
  fr.setTargetAtTime(180, end, rel / 4);
  for (const m of n) {
    for (const d of [-6, 6]) {
      const o = v.osc('sawtooth', mtof(m), t, stop, d);
      if (!p.swell) { o.detune.setValueAtTime(d - 35, t); o.detune.linearRampToValueAtTime(d, t + 0.07); }
      o.connect(f);
    }
    const sq = v.osc('square', mtof(m) / 2, t, stop), sg = v.g(0.22);
    sq.connect(sg); sg.connect(f);
  }
  envAR(g.gain, t, dur, atk, rel, vel * 0.5, p.swell);
}

// Heroic synth lead: saw pair + square, delayed vibrato, optional glide.
function lead(E, t, p) {
  const m = nt(p), dur = p.dur, vel = p.vel ?? 0.7, rel = p.rel ?? 0.25;
  const end = t + dur, stop = end + rel * 1.4 + 0.05;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.5, pan: p.pan ?? 0 });
  const f = v.f('lowpass', 1200, 2.2), pre = v.g(0.3), sh = v.ws('soft'), g = v.g(0);
  f.connect(pre); pre.connect(sh); sh.connect(g); g.connect(v.out);
  const pk = 1800 + 3000 * vel;
  f.frequency.setValueAtTime(700, t);
  f.frequency.exponentialRampToValueAtTime(pk, t + 0.06);
  f.frequency.setTargetAtTime(pk * 0.6, t + 0.08, 0.4);
  const vib = v.osc('sine', 5.6, t, stop), vg = v.g(0);
  vib.connect(vg);
  vg.gain.setValueAtTime(0, t + Math.min(0.28, dur * 0.4));
  vg.gain.linearRampToValueAtTime(p.vib ?? 20, t + Math.min(0.9, dur));
  const fq = mtof(m);
  const oscs = [v.osc('sawtooth', fq, t, stop, -6), v.osc('sawtooth', fq, t, stop, 6), v.osc('square', fq, t, stop, 0)];
  const sqg = v.g(0.45);
  oscs.forEach((o, i) => {
    if (p.from) { o.frequency.setValueAtTime(mtof(p.from), t); o.frequency.exponentialRampToValueAtTime(fq, t + 0.07); }
    vg.connect(o.detune);
    if (i === 2) { o.connect(sqg); sqg.connect(f); } else o.connect(f);
  });
  envAR(g.gain, t, dur, 0.015, rel, vel * 0.42);
}

// Short string (16th ostinato / spiccato)
function stac(E, t, p) {
  const m = nt(p), vel = p.vel ?? 0.5, dur = p.dur ?? 0.12, stop = t + dur + 0.3;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.28, pan: p.pan ?? R(-0.35, 0.35) });
  const f = v.f('lowpass', 800, 1.1), g = v.g(0);
  f.frequency.setValueAtTime(900 + 3600 * vel, t);
  f.frequency.setTargetAtTime(600, t + 0.01, 0.07);
  f.connect(g); g.connect(v.out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.2, t + 0.005);
  g.gain.setTargetAtTime(vel * 0.08, t + 0.01, 0.05);
  g.gain.setTargetAtTime(0, t + dur, 0.04);
  const fq = mtof(m);
  v.osc('sawtooth', fq, t, stop, -8).connect(f);
  v.osc('sawtooth', fq, t, stop, 8).connect(f);
}

// Bass (8ths) / uneasy pulse (p.bright)
function bass(E, t, p) {
  const m = nt(p), dur = p.dur ?? 0.22, vel = p.vel ?? 0.6, stop = t + dur + 0.3;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.1, pan: p.pan ?? 0 });
  const f = v.f('lowpass', 300, 2.2), g = v.g(0);
  f.frequency.setValueAtTime(250 + 1500 * vel * (p.bright ?? 1), t);
  f.frequency.setTargetAtTime(200, t + 0.01, p.decay ?? 0.1);
  f.connect(g); g.connect(v.out);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.33, t + 0.006);
  g.gain.setTargetAtTime(vel * 0.2, t + 0.02, 0.2);
  g.gain.setTargetAtTime(0, t + dur, 0.04);
  const fq = mtof(m);
  v.osc('sawtooth', fq, t, stop, -4).connect(f);
  v.osc('square', fq, t, stop, 5).connect(f);
  const s = v.osc('sine', fq, t, stop), sg = v.g(1.3);
  s.connect(sg); sg.connect(g);
}

// Sub-bass sine (+ quiet 2nd harmonic so it is felt on small speakers too)
function sub(E, t, p) {
  const fq = p.freq ?? mtof(nt(p)), dur = p.dur, vel = p.vel ?? 0.5, atk = p.atk ?? 0.8, rel = p.rel ?? 1.5;
  const stop = t + dur + rel * 1.4 + 0.05;
  const v = new Voice(E, 'music', { verb: 0 });
  const g = v.g(0); g.connect(v.out);
  const o = v.osc('sine', fq, t, stop);
  const o2 = v.osc('sine', fq * 2, t, stop), g2 = v.g(0.12);
  if (p.glide) { sweep(o.frequency, t, fq, t + dur, p.glide); sweep(o2.frequency, t, fq * 2, t + dur, p.glide * 2); }
  if (p.wobble) { // slow beating/dread
    const l = v.osc('sine', p.wobble, t, stop), lg = v.g(0.35), wg = v.g(0.65);
    l.connect(lg); lg.connect(wg.gain); o.connect(wg); wg.connect(g);
  } else o.connect(g);
  o2.connect(g2); g2.connect(g);
  envAR(g.gain, t, dur, atk, rel, vel * 0.55, p.swell);
}

// Glass harmonics / star shimmer
function glass(E, t, p) {
  const n = p.notes, dur = p.dur, vel = p.vel ?? 0.1, atk = p.atk ?? 2, rel = p.rel ?? 3;
  const stop = t + dur + rel * 1.4 + 0.05;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.9, pan: p.pan ?? 0 });
  const g = v.g(0); g.connect(v.out);
  for (const m of n) {
    const ng = v.g(0.5);
    const l = v.osc('sine', R(2.5, 7), t, stop), lg = v.g(0.5);
    l.connect(lg); lg.connect(ng.gain);
    v.osc('sine', mtof(m), t, stop).connect(ng);
    const o2 = v.osc('sine', mtof(m) * 2.005, t, stop), g2 = v.g(0.18);
    o2.connect(g2); g2.connect(ng);
    ng.connect(g);
  }
  envAR(g.gain, t, dur, atk, rel, vel * 0.25 / Math.sqrt(n.length), p.swell);
}

// Harp / celesta pluck
function harp(E, t, p) {
  const m = nt(p), vel = p.vel ?? 0.3, dec = p.dec ?? 2.2, stop = t + dec * 1.4;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.6, pan: p.pan ?? R(-0.4, 0.4) });
  const f = v.f('lowpass', 4500, 0.7), g = v.g(0);
  f.frequency.setTargetAtTime(1400, t + 0.01, 0.35);
  f.connect(g); g.connect(v.out);
  const fq = mtof(m);
  v.osc('triangle', fq, t, stop).connect(f);
  const o2 = v.osc('sine', fq * 2, t, stop), g2 = v.g(0.3); o2.connect(g2); g2.connect(f);
  const o3 = v.osc('sine', fq * 3.01, t, stop), g3 = v.g(0.1); o3.connect(g3); g3.connect(f);
  perc(g.gain, t, vel * 0.35, dec / 4.5, 0.004);
}

// Taiko / low tom
function taiko(E, t, p) {
  const vel = p.vel ?? 0.8, f0 = p.f ?? 55, dec = p.dec ?? 0.9, stop = t + dec * 1.6 + 0.1;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.45, pan: p.pan ?? R(-0.15, 0.15) });
  const o = v.osc('sine', f0 * 2.4, t, stop), g = v.g(0);
  o.frequency.setValueAtTime(f0 * 2.4, t);
  o.frequency.exponentialRampToValueAtTime(f0, t + 0.045);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + dec);
  o.connect(g); g.connect(v.out);
  perc(g.gain, t, vel * 0.9, dec / 4.5);
  const n = v.noise('white', t, t + 0.2), nf = v.f('bandpass', 350 + 500 * vel, 0.8), ng = v.g(0);
  n.connect(nf); nf.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.6, 0.03);
  const sh = v.osc('triangle', f0 * 3.1, t, t + 0.3), shg = v.g(0);
  sh.connect(shg); shg.connect(v.out);
  perc(shg.gain, t, vel * 0.15, 0.05);
}

function kick(E, t, p) {
  const vel = p.vel ?? 0.8, stop = t + 0.6;
  const v = new Voice(E, 'music', { verb: 0.08 });
  const o = v.osc('sine', 160, t, stop), g = v.g(0);
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.08);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
  o.connect(g); g.connect(v.out);
  perc(g.gain, t, vel * 0.85, 0.09);
  const n = v.noise('white', t, t + 0.03), hp = v.f('highpass', 2500, 0.7), ng = v.g(0);
  n.connect(hp); hp.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.15, 0.006);
}

function snare(E, t, p) {
  const vel = p.vel ?? 0.6, dec = p.dec ?? 0.05, stop = t + dec * 6 + 0.1;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.3, pan: p.pan ?? 0.06 });
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 2200, 0.7), hp = v.f('highpass', 650, 0.7), ng = v.g(0);
  n.connect(bp); bp.connect(hp); hp.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.55, dec);
  const b = v.osc('triangle', 200, t, t + 0.2), bg = v.g(0);
  b.frequency.setValueAtTime(200, t); b.frequency.exponentialRampToValueAtTime(150, t + 0.06);
  b.connect(bg); bg.connect(v.out);
  perc(bg.gain, t, vel * 0.35, 0.03);
}

function hat(E, t, p) {
  const vel = p.vel ?? 0.3, dec = p.dec ?? 0.018;
  const v = new Voice(E, 'music', { verb: 0.12, pan: p.pan ?? R(-0.25, 0.25) });
  const n = v.noise('white', t, t + dec * 6 + 0.05), hp = v.f('highpass', 7500, 0.8), g = v.g(0);
  n.connect(hp); hp.connect(g); g.connect(v.out);
  perc(g.gain, t, vel * 0.22, dec);
}

// Crash cymbal, or reverse-cymbal swell (p.rev) ending exactly at t+dur
function cymbal(E, t, p) {
  const vel = p.vel ?? 0.5, dur = p.dur ?? 3, stop = t + dur + (p.rev ? 0.1 : dur * 0.5);
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.5, pan: p.pan ?? 0 });
  const n = v.noise('white', t, stop), hp = v.f('highpass', 4200, 0.5), pk = v.f('peaking', 7500, 1), g = v.g(0);
  pk.gain.value = 6;
  n.connect(hp); hp.connect(pk); pk.connect(g); g.connect(v.out);
  const mg = v.g(0.05), mh = v.f('highpass', 2500, 0.7);
  for (const fr of [3170, 4830, 6140, 7890]) v.osc('square', fr * R(0.98, 1.02), t, stop).connect(mg);
  mg.connect(mh); mh.connect(g);
  if (p.rev) riseCut(g.gain, t, t + dur, vel * 0.4, 0.02);
  else perc(g.gain, t, vel * 0.4, dur / 5, 0.004);
}

// Cinematic low impact
function boom(E, t, p) {
  const vel = p.vel ?? 1, f = p.f ?? 42, dur = p.dur ?? 4, stop = t + dur + 0.3;
  const v = new Voice(E, p.bus || 'music', { verb: p.verb ?? 0.6 });
  const o = v.osc('sine', f * 3, t, stop), g = v.g(0);
  o.frequency.setValueAtTime(f * 3, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
  o.frequency.exponentialRampToValueAtTime(f * 0.55, t + dur);
  o.connect(g); g.connect(v.out);
  perc(g.gain, t, vel * 0.9, dur / 4);
  const pre = v.g(2.5), sh = v.ws('hard'), lp = v.f('lowpass', 700, 0.7), g2 = v.g(0);
  o.connect(pre); pre.connect(sh); sh.connect(lp); lp.connect(g2); g2.connect(v.out);
  perc(g2.gain, t, vel * 0.22, 0.18);
  const n = v.noise('brown', t, t + 2), nf = v.f('lowpass', 2500, 0.7), ng = v.g(0);
  sweep(nf.frequency, t, 2500, t + 0.8, 120);
  n.connect(nf); nf.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.7, 0.35);
}

// BRAAM: detuned low saw cluster → hard clip → resonant lowpass swell
function braam(E, t, p) {
  const root = p.root ?? 38, dur = p.dur ?? 3.5, vel = p.vel ?? 0.9, stop = t + dur + 1.8;
  const v = new Voice(E, 'music', { verb: p.verb ?? 0.55 });
  const pre = v.g(0.2), sh = v.ws('hard'), lp = v.f('lowpass', 120, 4), g = v.g(0);
  pre.connect(sh); sh.connect(lp); lp.connect(g); g.connect(v.out);
  const lf = lp.frequency;
  lf.setValueAtTime(120, t);
  lf.exponentialRampToValueAtTime(1500 + 1400 * vel, t + 0.14);
  lf.setTargetAtTime(380, t + 0.25, dur / 2.5);
  lf.setTargetAtTime(110, t + dur, 0.35);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.06);
  g.gain.setTargetAtTime(vel * 0.32, t + 0.3, dur / 2);
  g.gain.setTargetAtTime(0, t + dur, 0.35);
  for (const m of [root - 12, root, root + 7, root + 12]) for (const d of [-14, 13]) {
    const o = v.osc('sawtooth', mtof(m), t, stop, d);
    o.detune.setValueAtTime(d, t + 0.2);
    o.detune.linearRampToValueAtTime(d - 30, t + dur);
    o.connect(pre);
  }
  const s = v.osc('sine', mtof(root - 12), t, stop), sg = v.g(0);
  s.connect(sg); sg.connect(v.out);
  envAR(sg.gain, t, dur, 0.04, 1.2, vel * 0.45);
}

// Riser: filtered noise + rising saw, cut at the end
function riser(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.5, end = t + dur;
  const v = new Voice(E, 'music', { verb: 0.5 });
  const g = v.g(0); g.connect(v.out);
  const n = v.noise('white', t, end + 0.1), bp = v.f('bandpass', 300, 1.4);
  sweep(bp.frequency, t, p.f0 ?? 300, end, p.f1 ?? 7000);
  n.connect(bp); bp.connect(g);
  const o = v.osc('sawtooth', mtof(p.m0 ?? 45), t, end + 0.1), lp = v.f('lowpass', 800, 1.5), og = v.g(0.35);
  sweep(o.frequency, t, mtof(p.m0 ?? 45), end, mtof(p.m1 ?? 81));
  sweep(lp.frequency, t, 600, end, 6000);
  o.connect(lp); lp.connect(og); og.connect(g);
  riseCut(g.gain, t, end, vel * 0.35, 0.04);
}

// Reverse swell (sucked-in), optionally tonal
function revswell(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.5, end = t + dur;
  const v = new Voice(E, p.bus || 'music', { verb: 0.35 });
  const g = v.g(0); g.connect(v.out);
  const n = v.noise('white', t, end + 0.1), lp = v.f('lowpass', 200, 0.9);
  sweep(lp.frequency, t, 200, end, p.fTop ?? 9000);
  n.connect(lp); lp.connect(g);
  if (p.notes) for (const m of p.notes) {
    const o = v.osc('sawtooth', mtof(m), t, end + 0.1, R(-8, 8)), og = v.g(0.25 / Math.sqrt(p.notes.length));
    o.connect(og); og.connect(lp);
  }
  riseCut(g.gain, t, end, vel * 0.45, 0.025);
}

// =================================================================== SFX

// Hyperspace window arrival. pre=0.7 s: the event is scheduled 0.7 s early so the
// "crack" lands exactly on the cue time.
function hyperIn(E, t, p) {
  const vel = p.vel ?? 0.8, big = !!p.big, dark = !!p.dark, arr = t + 0.7;
  const L = big ? 5 : 2.6, stop = arr + L + 0.3;
  const v = new Voice(E, 'sfx', { verb: 0.55, pan: p.pan ?? 0 });
  // whoosh
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 250, 1.2), ng = v.g(0);
  bp.frequency.setValueAtTime(250, t);
  bp.frequency.exponentialRampToValueAtTime(dark ? 2400 : 5200, arr);
  bp.frequency.exponentialRampToValueAtTime(500, arr + L * 0.8);
  n.connect(bp); bp.connect(ng); ng.connect(v.out);
  ng.gain.setValueAtTime(1e-4, t);
  ng.gain.exponentialRampToValueAtTime(vel * 0.55, arr);
  ng.gain.setTargetAtTime(0, arr + 0.03, L / 5);
  // arrival crack
  const c = v.noise('white', arr, arr + 0.2), ch = v.f('highpass', 1800, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, arr, vel * 0.45, 0.03);
  // shimmer
  const sg = v.g(0), tg = v.g(0.6), tl = v.osc('sine', dark ? 13 : 23, t, stop), tlg = v.g(0.4);
  tl.connect(tlg); tlg.connect(tg.gain); sg.connect(tg); tg.connect(v.out);
  const fr = dark ? [880, 932, 1245, 1319] : [1760, 2349, 2637, 3520];
  for (const f of fr) {
    const o = v.osc(dark ? 'sawtooth' : 'sine', f * R(0.99, 1.01), t, stop);
    o.frequency.setValueAtTime(f * 0.8, t);
    o.frequency.exponentialRampToValueAtTime(f, arr);
    o.frequency.exponentialRampToValueAtTime(f * (dark ? 0.9 : 1.15), arr + L);
    if (dark) { const lp = v.f('lowpass', 1800, 1); o.connect(lp); lp.connect(sg); } else o.connect(sg);
  }
  sg.gain.setValueAtTime(0, t);
  sg.gain.linearRampToValueAtTime(vel * (dark ? 0.035 : 0.055), arr);
  sg.gain.setTargetAtTime(0, arr + 0.05, L / 3.5);
  // thump
  const th = v.osc('sine', big ? 70 : 95, arr, stop), thg = v.g(0);
  sweep(th.frequency, arr, big ? 70 : 95, arr + (big ? 3 : 0.7), big ? 19 : 34);
  th.connect(thg); thg.connect(v.out);
  perc(thg.gain, arr, vel * (big ? 1 : 0.6), big ? 1.1 : 0.22);
  if (big || dark) { // growl
    const gr = v.osc('sawtooth', big ? 36.7 : 55, arr, stop), gp = v.g(0.5), gs = v.ws('hard'), gl = v.f('lowpass', 400, 2), gg = v.g(0);
    gr.frequency.setValueAtTime(big ? 36.7 : 55, arr);
    gr.frequency.linearRampToValueAtTime(big ? 30 : 48, arr + L);
    gr.connect(gp); gp.connect(gs); gs.connect(gl); gl.connect(gg); gg.connect(v.out);
    envAR(gg.gain, arr, L * 0.5, 0.02, L * 0.5, vel * (big ? 0.3 : 0.12));
  }
}
hyperIn.pre = 0.7;

// Hyperspace exit: reversed rising whoosh, abrupt cut on the cue time, then a pop
function hyperOut(E, t, p) {
  const vel = p.vel ?? 0.7, dark = !!p.dark, ex = t + 1.4, stop = ex + 2;
  const v = new Voice(E, 'sfx', { verb: 0.6, pan: p.pan ?? 0 });
  const n = v.noise('white', t, ex + 0.05), bp = v.f('bandpass', 300, 1.3), ng = v.g(0);
  sweep(bp.frequency, t, 300, ex, dark ? 3500 : 7000);
  n.connect(bp); bp.connect(ng); ng.connect(v.out);
  riseCut(ng.gain, t, ex, vel * 0.5, 0.02);
  const sg = v.g(0); sg.connect(v.out);
  for (const f of dark ? [440, 466, 660] : [880, 1320, 1760]) {
    const o = v.osc(dark ? 'sawtooth' : 'sine', f, t, ex + 0.05);
    sweep(o.frequency, t, f * 0.5, ex, f * 2);
    if (dark) { const lp = v.f('lowpass', 2000, 1); o.connect(lp); lp.connect(sg); } else o.connect(sg);
  }
  riseCut(sg.gain, t, ex, vel * 0.06, 0.02);
  const th = v.osc('sine', 120, ex, stop), tg = v.g(0);
  sweep(th.frequency, ex, 120, ex + 0.5, 40);
  th.connect(tg); tg.connect(v.out);
  perc(tg.gain, ex, vel * 0.5, 0.15);
  const c = v.noise('white', ex, ex + 0.3), ch = v.f('highpass', 1500, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, ex, vel * 0.3, 0.06);
}
hyperOut.pre = 1.4;

// Two-tone ship alarm
function klaxon(E, t, p) {
  const reps = p.reps ?? 6, per = p.per ?? 1.25, hi = p.hi ?? 700, lo = p.lo ?? 525, vel = p.vel ?? 0.5;
  const L = reps * per, stop = t + L + 0.3;
  const v = new Voice(E, 'sfx', { verb: 0.5, pan: p.pan ?? 0 });
  const bp = v.f('bandpass', 1100, 1.2), pre = v.g(0.6), sh = v.ws('soft'), g = v.g(0);
  bp.connect(pre); pre.connect(sh); sh.connect(g); g.connect(v.out);
  const o1 = v.osc('square', hi, t, stop), o2 = v.osc('square', hi, t, stop, 9);
  o1.connect(bp); o2.connect(bp);
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < reps; i++) {
    const ti = t + i * per, pk = vel * 0.3;
    for (const o of [o1, o2]) {
      o.frequency.setValueAtTime(hi * 0.97, ti);
      o.frequency.linearRampToValueAtTime(hi, ti + 0.05);
      o.frequency.setValueAtTime(lo, ti + per * 0.42);
    }
    g.gain.setValueAtTime(0, ti);
    g.gain.linearRampToValueAtTime(pk, ti + 0.02);
    g.gain.setValueAtTime(pk, ti + per * 0.8);
    g.gain.linearRampToValueAtTime(0, ti + per * 0.86);
  }
}

// Radio: click + squelch + beep at start, static bed, squelch tail at end of line
function radio(E, t, p) {
  const len = p.len ?? 3.4, vel = p.vel ?? 0.5, stop = t + len + 0.5;
  const v = new Voice(E, p.bus || 'sfx', { verb: 0.05, pan: p.pan ?? 0 });
  const burst = (t0, fc, pk, tc) => {
    const n = v.noise('white', t0, t0 + tc * 7 + 0.02), bp = v.f('bandpass', fc, 1.2), hp = v.f('highpass', 400, 0.7), g = v.g(0);
    n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(v.out);
    perc(g.gain, t0, pk, tc, 0.002);
  };
  const beep = (t0, f, d, pk) => {
    const o = v.osc('sine', f, t0, t0 + d + 0.05), g = v.g(0);
    o.connect(g); g.connect(v.out);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(pk, t0 + 0.005);
    g.gain.setValueAtTime(pk, t0 + d); g.gain.linearRampToValueAtTime(0, t0 + d + 0.01);
  };
  if (!p.skipStart) {
    burst(t, 3500, vel * 0.5, 0.004);          // click
    burst(t + 0.01, 1800, vel * 0.35, 0.05);   // squelch
    beep(t + 0.09, 1320, 0.07, vel * 0.1);
  }
  // static bed under the line
  const s = v.noise('white', t + 0.1, t + len), sb = v.f('bandpass', 2200, 0.9), sg = v.g(0);
  s.connect(sb); sb.connect(sg); sg.connect(v.out);
  envAR(sg.gain, t + 0.1, len - 0.2, 0.1, 0.1, vel * 0.018);
  // tail
  burst(t + len, 2400, vel * 0.3, 0.05);
  beep(t + len + 0.08, 880, 0.045, vel * 0.07);
  beep(t + len + 0.16, 880, 0.045, vel * 0.07);
}
radio.pre = 0.12;

// Ion cannon charge whine (p.big = mothership main array)
function ionCharge(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.6, big = !!p.big, end = t + dur, stop = end + 0.1;
  const v = new Voice(E, 'sfx', { verb: 0.45, pan: p.pan ?? 0 });
  const f0 = big ? 55 : 110, f1 = big ? 1100 : 1760;
  const g = v.g(0), tg = v.g(0.5);
  g.connect(tg); tg.connect(v.out);
  const lfo = v.osc('sine', 5, t, stop), lg = v.g(0.5);
  sweep(lfo.frequency, t, big ? 3 : 5, end, 32);
  lfo.connect(lg); lg.connect(tg.gain);
  const bp = v.f('bandpass', f0 * 4, 2);
  sweep(bp.frequency, t, f0 * 4, end, f1 * 3);
  bp.connect(g);
  const o = v.osc('sawtooth', f0, t, stop); sweep(o.frequency, t, f0, end, f1); o.connect(bp);
  const o2 = v.osc('sine', f0 * 2, t, stop), o2g = v.g(0.5); sweep(o2.frequency, t, f0 * 2, end, f1 * 2);
  o2.connect(o2g); o2g.connect(g);
  const n = v.noise('white', t, stop), hp = v.f('highpass', 3000, 0.7), ng = v.g(0.25);
  sweep(hp.frequency, t, 3000, end, 9000);
  n.connect(hp); hp.connect(ng); ng.connect(g);
  if (big) {
    const s = v.osc('sine', 41, t, stop), sg = v.g(0.9);
    sweep(s.frequency, t, 41, end, 82);
    s.connect(sg); sg.connect(g);
  }
  riseCut(g.gain, t, end, vel * (big ? 0.55 : 0.4), 0.03);
}

// Ion cannon fire: deep zap + thump + crack + long sizzle
function ionFire(E, t, p) {
  const vel = p.vel ?? 1, big = !!p.big, siz = p.sizzle ?? (big ? 5 : 3), stop = t + siz * 1.5 + 0.5;
  const v = new Voice(E, 'sfx', { verb: 0.6, pan: p.pan ?? 0 });
  const z = v.osc('sawtooth', big ? 900 : 1400, t, t + 1.5), zp = v.g(0.45), zs = v.ws('hard'), zl = v.f('lowpass', 4000, 2), zg = v.g(0);
  sweep(z.frequency, t, big ? 900 : 1400, t + (big ? 0.8 : 0.45), big ? 28 : 45);
  sweep(zl.frequency, t, 4500, t + 0.6, 280);
  z.connect(zp); zp.connect(zs); zs.connect(zl); zl.connect(zg); zg.connect(v.out);
  perc(zg.gain, t, vel * 0.4, big ? 0.35 : 0.18);
  const th = v.osc('sine', 160, t, t + 3), tg = v.g(0);
  sweep(th.frequency, t, 160, t + (big ? 1.6 : 0.9), 26);
  th.connect(tg); tg.connect(v.out);
  perc(tg.gain, t, vel * 0.85, big ? 0.6 : 0.33);
  const c = v.noise('white', t, t + 0.4), ch = v.f('highpass', 1500, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, t, vel * 0.45, 0.04);
  const s = v.noise('white', t, stop), sb = v.f('bandpass', 5000, 0.7), sg = v.g(0);
  s.connect(sb); sb.connect(sg); sg.connect(v.out);
  sg.gain.setValueAtTime(1e-4, t); sg.gain.exponentialRampToValueAtTime(vel * 0.12, t + 0.05);
  sg.gain.setTargetAtTime(0, t + 0.1, siz / 3);
  const cr = v.noise('crackle', t, stop), crh = v.f('highpass', 2000, 0.7), crg = v.g(0);
  cr.connect(crh); crh.connect(crg); crg.connect(v.out);
  crg.gain.setValueAtTime(1e-4, t); crg.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.08);
  crg.gain.setTargetAtTime(0, t + 0.12, siz / 3);
}

// Sustained beam roar (volley beams / main cannon beam)
function ionBeam(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.4, f = p.f ?? 55, stop = t + dur + 2;
  const v = new Voice(E, 'sfx', { verb: 0.5, pan: p.pan ?? 0 });
  const g = v.g(0); g.connect(v.out);
  const lp = v.f('lowpass', 900, 2), pre = v.g(0.4), sh = v.ws('soft');
  const w = v.osc('sine', 0.6, t, stop), wg = v.g(350);
  w.connect(wg); wg.connect(lp.frequency);
  lp.connect(pre); pre.connect(sh); sh.connect(g);
  for (const k of [1, 1.007, 2.01, 3.02]) v.osc('sawtooth', f * k, t, stop).connect(lp);
  const n = v.noise('white', t, stop), nb = v.f('bandpass', 4200, 1), ng = v.g(0.35);
  n.connect(nb); nb.connect(ng); ng.connect(g);
  const cr = v.noise('crackle', t, stop), ch = v.f('highpass', 2500, 0.7), cg = v.g(0.5);
  cr.connect(ch); ch.connect(cg); cg.connect(g);
  envAR(g.gain, t, dur, 0.15, 1.3, vel * 0.4);
}

const EXP = {
  small: { L: 1.4, f: 85, lp: 5000, cr: 0.45, v: 0.6 },
  medium: { L: 2.8, f: 62, lp: 3500, cr: 0.7, v: 0.85 },
  huge: { L: 5.5, f: 45, lp: 2800, cr: 1, v: 1 },
};
function explosion(E, t, p) {
  const size = p.size || 'medium', s = EXP[size], vel = (p.vel ?? 1) * s.v, L = s.L, stop = t + L * 1.5 + 0.3;
  const far = p.far ? 0.3 : 1;   // distant: darker, more reverb
  const v = new Voice(E, 'sfx', { verb: p.far ? 0.8 : size === 'huge' ? 0.7 : 0.5, pan: p.pan ?? 0 });
  if (p.far) { const o = v.out; const fl = v.f('lowpass', 900, 0.7); v.out = v.g(1); v.out.connect(fl); fl.connect(o); }
  // blast body
  const lp = v.f('lowpass', s.lp * far, 0.8), bg = v.g(0);
  sweep(lp.frequency, t, s.lp * far, t + L * 0.6, 150);
  v.noise('white', t, stop).connect(lp);
  const bn = v.noise('brown', t, stop), bng = v.g(2); bn.connect(bng); bng.connect(lp);
  lp.connect(bg); bg.connect(v.out);
  perc(bg.gain, t, vel * 0.45, L / 5, 0.006);
  // thump
  const th = v.osc('sine', s.f * 2.2, t, stop), tg = v.g(0);
  sweep(th.frequency, t, s.f * 2.2, t + L * 0.5, s.f * 0.45);
  th.connect(tg); tg.connect(v.out);
  perc(tg.gain, t, vel * 0.9, L / 6);
  // crackle tail
  const cr = v.noise('crackle', t + 0.06, stop), ch = v.f('highpass', 1200, 0.7), cg = v.g(0);
  cr.connect(ch); ch.connect(cg); cg.connect(v.out);
  cg.gain.setValueAtTime(1e-4, t + 0.06);
  cg.gain.exponentialRampToValueAtTime(vel * 0.4 * s.cr, t + 0.18);
  cg.gain.setTargetAtTime(0, t + 0.25, L / 3);
  if (size === 'huge') {
    const cn = v.noise('brown', t, t + 1.5), cp = v.g(3), cs = v.ws('hard'), cl = v.f('lowpass', 1500, 0.7), cgg = v.g(0);
    cn.connect(cp); cp.connect(cs); cs.connect(cl); cl.connect(cgg); cgg.connect(v.out);
    perc(cgg.gain, t, vel * 0.3, 0.25);
    const rn = v.noise('brown', t, stop), rl = v.f('lowpass', 90, 0.8), rg = v.g(0);
    rn.connect(rl); rl.connect(rg); rg.connect(v.out);
    perc(rg.gain, t, vel * 0.9, L / 2.5, 0.05);
  }
}

// Fighter tracer burst: one gated noise source + a gated blip oscillator (cheap)
function tracers(E, t, p) {
  const dur = p.dur ?? 0.9, rate = p.rate ?? 15, vel = p.vel ?? 0.5, stop = t + dur + 0.2;
  const v = new Voice(E, 'sfx', { mp: true, verb: 0.3, pan: p.pan0 ?? 0 });
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 2600, 2.5), g = v.g(0);
  n.connect(bp); bp.connect(g); g.connect(v.out);
  const o = v.osc('square', 1800, t, stop), og = v.g(0), ol = v.f('lowpass', 3000, 1);
  o.connect(ol); ol.connect(og); og.connect(v.out);
  g.gain.setValueAtTime(0, t); og.gain.setValueAtTime(0, t);
  const N = Math.floor(dur * rate);
  for (let i = 0; i < N; i++) {
    const ti = t + i / rate + R(0, 0.012);
    g.gain.setValueAtTime(vel * 0.55, ti); g.gain.setTargetAtTime(0, ti + 0.002, 0.012);
    og.gain.setValueAtTime(vel * 0.06, ti); og.gain.setTargetAtTime(0, ti + 0.002, 0.01);
    o.frequency.setValueAtTime(1900, ti); o.frequency.exponentialRampToValueAtTime(700, ti + 0.03);
  }
  v.panRamp(p.pan0 ?? 0, p.pan1 ?? 0, t, t + dur);
}

function missile(E, t, p) {
  const dur = p.dur ?? 1.8, vel = p.vel ?? 0.6, stop = t + dur + 0.4;
  const v = new Voice(E, 'sfx', { mp: true, verb: 0.35, pan: p.pan0 ?? 0 });
  const pop = v.noise('white', t, t + 0.1), ph = v.f('highpass', 1000, 0.7), pg = v.g(0);
  pop.connect(ph); ph.connect(pg); pg.connect(v.out);
  perc(pg.gain, t, vel * 0.5, 0.015);
  const g = v.g(0); g.connect(v.out);
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 2500, 1.5);
  sweep(bp.frequency, t, 2600, t + dur, 800);
  n.connect(bp); bp.connect(g);
  const r = v.noise('brown', t, stop), rl = v.f('lowpass', 350, 0.8), rg = v.g(1.2);
  r.connect(rl); rl.connect(rg); rg.connect(g);
  g.gain.setValueAtTime(1e-4, t);
  g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.1);
  g.gain.setTargetAtTime(0, t + dur * 0.65, dur * 0.12);
  v.panRamp(p.pan0 ?? -0.6, p.pan1 ?? 0.6, t, t + dur);
}

// Doppler fly-by (fighter or Gundam with p.big)
function flyby(E, t, p) {
  const dur = p.dur ?? 2.4, vel = p.vel ?? 0.7, f0 = p.f0 ?? 1100, f1 = p.f1 ?? 620, mid = t + dur * 0.5, stop = t + dur + 0.3;
  const v = new Voice(E, 'sfx', { mp: true, verb: 0.35, pan: p.pan0 ?? -0.9 });
  const g = v.g(0); g.connect(v.out);
  const bp = v.f('bandpass', f0 * 2, 3), wg = v.g(0.6);
  for (const k of [1, 1.5, 2.01]) {
    const o = v.osc('sawtooth', f0 * k, t, stop);
    o.frequency.setValueAtTime(f0 * k, mid - 0.2);
    o.frequency.exponentialRampToValueAtTime(f1 * k, mid + 0.3);
    o.connect(bp);
  }
  bp.frequency.setValueAtTime(f0 * 2, mid - 0.2);
  bp.frequency.exponentialRampToValueAtTime(f1 * 2, mid + 0.3);
  bp.connect(wg); wg.connect(g);
  const n = v.noise('white', t, stop), nl = v.f('lowpass', 800, 0.8);
  nl.frequency.setValueAtTime(700, t);
  nl.frequency.exponentialRampToValueAtTime(7000, mid);
  nl.frequency.exponentialRampToValueAtTime(900, t + dur);
  n.connect(nl); nl.connect(g);
  if (p.big) {
    const r = v.noise('brown', t, stop), rl = v.f('lowpass', 250, 0.7), rg = v.g(1.5);
    r.connect(rl); rl.connect(rg); rg.connect(g);
  }
  g.gain.setValueAtTime(1e-4, t);
  g.gain.exponentialRampToValueAtTime(vel * 0.55, mid);
  g.gain.exponentialRampToValueAtTime(1e-3, t + dur);
  v.panRamp(p.pan0 ?? -0.9, p.pan1 ?? 0.9, t, t + dur);
}

// Mobile-suit eyes ignite: bright sting
function eyes(E, t, p) {
  const vel = p.vel ?? 0.7, stop = t + 4;
  const v = new Voice(E, 'sfx', { verb: 0.8 });
  const g = v.g(0), tg = v.g(0.6), l = v.osc('sine', 11, t, stop), lg = v.g(0.4);
  l.connect(lg); lg.connect(tg.gain); g.connect(tg); tg.connect(v.out);
  for (const m of [86, 93, 98, 102]) v.osc('sine', mtof(m), t, stop).connect(g);
  perc(g.gain, t, vel * 0.1, 0.8, 0.01);
  const n = v.noise('white', t, t + 0.8), bp = v.f('bandpass', 2500, 4), sg = v.g(0);
  sweep(bp.frequency, t, 2500, t + 0.35, 9000);
  n.connect(bp); bp.connect(sg); sg.connect(v.out);
  perc(sg.gain, t, vel * 0.5, 0.12);
  const th = v.osc('sine', 70, t, t + 1.5), thg = v.g(0);
  sweep(th.frequency, t, 70, t + 0.6, 38);
  th.connect(thg); thg.connect(v.out);
  perc(thg.gain, t, vel * 0.6, 0.2);
  const z = v.osc('sawtooth', 120, t, t + 0.6), zp = v.g(0.6), zs = v.ws('hard'), zh = v.f('highpass', 800, 0.7), zg = v.g(0);
  z.connect(zp); zp.connect(zs); zs.connect(zh); zh.connect(zg); zg.connect(v.out);
  perc(zg.gain, t, vel * 0.12, 0.08);
}

// metallic clunk helper (inside a voice)
function clunkIn(v, t, vel, ringVel = 0.08) {
  const n = v.noise('brown', t, t + 0.6), lp = v.f('lowpass', 500, 0.8), g = v.g(0);
  n.connect(lp); lp.connect(g); g.connect(v.out);
  perc(g.gain, t, vel * 0.9, 0.06);
  const rg = v.g(0); rg.connect(v.out);
  for (const f of [97, 233, 389, 611, 947]) v.osc('sine', f * R(0.97, 1.03), t, t + 1.8).connect(rg);
  perc(rg.gain, t, vel * ringVel, 0.3);
}
function clank(E, t, p) {
  const v = new Voice(E, 'sfx', { verb: 0.7, pan: p.pan ?? 0 });
  clunkIn(v, t, p.vel ?? 0.5, 0.06);
}
function hangarLights(E, t, p) {
  const nC = p.n ?? 3, gap = p.gap ?? 0.55, vel = p.vel ?? 0.8, hum = p.hum ?? 4;
  const v = new Voice(E, 'sfx', { verb: 0.6, pan: p.pan ?? 0 });
  for (let i = 0; i < nC; i++) clunkIn(v, t + i * gap, vel * (1 - i * 0.1));
  const th = t + nC * gap, stop = th + hum + 1;
  const g = v.g(0), lp = v.f('lowpass', 500, 0.8);
  lp.connect(g); g.connect(v.out);
  v.osc('sine', 60, th, stop).connect(lp);
  v.osc('sine', 120, th, stop).connect(lp);
  const bz = v.osc('sawtooth', 120, th, stop), bzg = v.g(0.2); bz.connect(bzg); bzg.connect(lp);
  envAR(g.gain, th, hum, 0.25, 0.8, vel * 0.1);
}

// Catapult: clunk + steam + rising roar
function catapult(E, t, p) {
  const vel = p.vel ?? 1, L = 3.8, stop = t + L + 0.6;
  const v = new Voice(E, 'sfx', { mp: true, verb: 0.4, pan: 0 });
  clunkIn(v, t, vel, 0.12);
  const s = v.noise('white', t, t + 2), sh = v.f('highpass', 3000, 0.7), sg = v.g(0);
  s.connect(sh); sh.connect(sg); sg.connect(v.out);
  perc(sg.gain, t, vel * 0.25, 0.5, 0.01);
  const rg = v.g(0); rg.connect(v.out);
  const r = v.noise('white', t, stop), rl = v.f('lowpass', 300, 0.8);
  sweep(rl.frequency, t, 300, t + 2.2, 5000);
  r.connect(rl); rl.connect(rg);
  const e1 = v.osc('sawtooth', 55, t, stop), e2 = v.osc('sawtooth', 82.5, t, stop), ep = v.g(0.3), es = v.ws('soft'), el = v.f('lowpass', 1500, 1), eg = v.g(0.6);
  sweep(e1.frequency, t, 55, t + 2.2, 220); sweep(e2.frequency, t, 82.5, t + 2.2, 330);
  e1.connect(ep); e2.connect(ep); ep.connect(es); es.connect(el); el.connect(eg); eg.connect(rg);
  rg.gain.setValueAtTime(1e-4, t);
  rg.gain.exponentialRampToValueAtTime(vel * 0.55, t + 2);
  rg.gain.setTargetAtTime(0, t + 2.3, 0.45);
  const sc = v.noise('white', t + 0.1, t + 2), sb = v.f('bandpass', 3500, 8), scg = v.g(0);
  sweep(sb.frequency, t + 0.1, 3500, t + 1.8, 6000);
  sc.connect(sb); sb.connect(scg); scg.connect(v.out);
  envAR(scg.gain, t + 0.1, 1.6, 0.1, 0.2, vel * 0.25);
  v.panRamp(0, 0.7, t + 0.5, t + L);
}

// Beam rifle "pew" with resonance
function beamRifle(E, t, p) {
  const vel = p.vel ?? 0.9, stop = t + 1.2;
  const v = new Voice(E, 'sfx', { verb: 0.55, pan: p.pan ?? 0 });
  const o = v.osc('sawtooth', 2600, t, stop), bp = v.f('bandpass', 3000, 8), pre = v.g(1.5), sh = v.ws('soft'), g = v.g(0);
  sweep(o.frequency, t, 2600, t + 0.28, 320);
  sweep(bp.frequency, t, 3200, t + 0.3, 500);
  o.connect(bp); bp.connect(pre); pre.connect(sh); sh.connect(g); g.connect(v.out);
  perc(g.gain, t, vel * 0.35, 0.09);
  const b = v.osc('sine', 900, t, stop), bg = v.g(0);
  sweep(b.frequency, t, 900, t + 0.25, 120);
  b.connect(bg); bg.connect(v.out);
  perc(bg.gain, t, vel * 0.3, 0.08);
  const n = v.noise('white', t, t + 0.3), nh = v.f('highpass', 2000, 0.7), ng = v.g(0);
  n.connect(nh); nh.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.4, 0.03);
  const s = v.osc('sine', 80, t, stop), sg = v.g(0);
  sweep(s.frequency, t, 80, t + 0.3, 40);
  s.connect(sg); sg.connect(v.out);
  perc(sg.gain, t, vel * 0.55, 0.1);
}

// saber hum core (inside a voice) → returns gain to envelope
function saberCore(v, t, stop, f = 55, drive = 0.5) {
  const lp = v.f('lowpass', 700, 1.5), pre = v.g(drive), sh = v.ws('soft'), g = v.g(0);
  lp.connect(pre); pre.connect(sh); sh.connect(g); g.connect(v.out);
  const w = v.osc('sine', R(0.5, 0.9), t, stop), wg = v.g(250), wd = v.g(6);
  w.connect(wg); wg.connect(lp.frequency); w.connect(wd);
  const oscs = [v.osc('sawtooth', f, t, stop), v.osc('sawtooth', f * 2.013, t, stop), v.osc('square', f * 1.498, t, stop)];
  oscs.forEach((o) => { wd.connect(o.detune); o.connect(lp); });
  const cr = v.noise('crackle', t, stop), cb = v.f('bandpass', 3000, 0.8), cg = v.g(0.12);
  cr.connect(cb); cb.connect(cg); cg.connect(g);
  return { g, lp, oscs };
}
function saberIgnite(E, t, p) {
  const vel = p.vel ?? 0.8, stop = t + 1.4;
  const v = new Voice(E, 'sfx', { verb: 0.5, pan: p.pan ?? 0 });
  const { g, lp, oscs } = saberCore(v, t, stop, 55, 0.7);
  oscs.forEach((o, i) => { const f = o.frequency.value; sweep(o.frequency, t, f * 0.45, t + 0.35, f); });
  sweep(lp.frequency, t, 300, t + 0.35, 2600);
  lp.frequency.setTargetAtTime(900, t + 0.4, 0.2);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.3);
  g.gain.setTargetAtTime(0, t + 0.5, 0.2);
  const n = v.noise('white', t, t + 0.5), nb = v.f('bandpass', 3500, 1), ng = v.g(0);
  n.connect(nb); nb.connect(ng); ng.connect(v.out);
  perc(ng.gain, t + 0.05, vel * 0.3, 0.1);
}
function saberHum(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.4, stop = t + dur + 1;
  const v = new Voice(E, 'sfx', { verb: 0.35, pan: p.pan ?? 0 });
  const { g } = saberCore(v, t, stop, p.f ?? 55, 0.5);
  envAR(g.gain, t, dur, 0.3, 0.6, vel * 0.3);
}
function saberClash(E, t, p) {
  const vel = p.vel ?? 1, stop = t + 2.5;
  const v = new Voice(E, 'sfx', { verb: 0.6, pan: p.pan ?? 0 });
  const n = v.noise('white', t, t + 0.6), nb = v.f('bandpass', 2500, 0.7), ng = v.g(0);
  n.connect(nb); nb.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.5, 0.07);
  const cr = v.noise('crackle', t, stop), ch = v.f('highpass', 2000, 0.7), cg = v.g(0);
  cr.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, t, vel * 0.7, 0.45);
  const rg = v.g(0); rg.connect(v.out);
  for (const f of [1170, 1760, 2630, 3310]) v.osc('sine', f * R(0.98, 1.02), t, stop).connect(rg);
  perc(rg.gain, t, vel * 0.06, 0.4);
  const z = v.osc('sawtooth', 300, t, t + 0.8), zp = v.g(0.8), zs = v.ws('hard'), zl = v.f('lowpass', 2500, 1), zg = v.g(0);
  sweep(z.frequency, t, 300, t + 0.4, 60);
  z.connect(zp); zp.connect(zs); zs.connect(zl); zl.connect(zg); zg.connect(v.out);
  perc(zg.gain, t, vel * 0.3, 0.12);
  const s = v.osc('sine', 90, t, t + 1), sg = v.g(0);
  sweep(s.frequency, t, 90, t + 0.4, 40);
  s.connect(sg); sg.connect(v.out);
  perc(sg.gain, t, vel * 0.6, 0.15);
}
// Saber max output roar
function saberRoar(E, t, p) {
  const dur = p.dur ?? 6, vel = p.vel ?? 0.9, stop = t + dur + 1.2;
  const v = new Voice(E, 'sfx', { verb: 0.55, pan: p.pan ?? 0 });
  const { g, lp, oscs } = saberCore(v, t, stop, 49, 1.8);
  oscs.forEach((o) => { const f = o.frequency.value; sweep(o.frequency, t, f * 0.6, t + 1.2, f * 1.12); });
  sweep(lp.frequency, t, 400, t + 1.2, 3500);
  lp.frequency.setTargetAtTime(1600, t + 1.4, 0.8);
  envAR(g.gain, t, dur, 0.9, 0.9, vel * 0.5);
  const r = v.noise('brown', t, stop), rl = v.f('lowpass', 260, 0.8), rg = v.g(0);
  r.connect(rl); rl.connect(rg); rg.connect(v.out);
  envAR(rg.gain, t, dur, 1, 1, vel * 0.7);
  const cr = v.noise('crackle', t, stop), ch = v.f('highpass', 1500, 0.7), cg = v.g(0);
  cr.connect(ch); ch.connect(cg); cg.connect(v.out);
  envAR(cg.gain, t, dur, 0.6, 0.8, vel * 0.45);
}
function slash(E, t, p) {
  const vel = p.vel ?? 1, stop = t + 3;
  const v = new Voice(E, 'sfx', { verb: 0.6, pan: p.pan ?? 0 });
  const n = v.noise('white', t, t + 0.9), bp = v.f('bandpass', 600, 2), ng = v.g(0);
  bp.frequency.setValueAtTime(600, t);
  bp.frequency.exponentialRampToValueAtTime(5000, t + 0.2);
  bp.frequency.exponentialRampToValueAtTime(700, t + 0.7);
  n.connect(bp); bp.connect(ng); ng.connect(v.out);
  ng.gain.setValueAtTime(1e-4, t);
  ng.gain.exponentialRampToValueAtTime(vel * 0.6, t + 0.18);
  ng.gain.setTargetAtTime(0, t + 0.22, 0.15);
  const z = v.osc('sawtooth', 220, t, t + 1.4), zp = v.g(0.9), zs = v.ws('hard'), zl = v.f('lowpass', 3000, 1.5), zg = v.g(0);
  sweep(z.frequency, t, 240, t + 0.8, 45);
  z.connect(zp); zp.connect(zs); zs.connect(zl); zl.connect(zg); zg.connect(v.out);
  perc(zg.gain, t + 0.1, vel * 0.35, 0.25);
  const cr = v.noise('crackle', t, stop), ch = v.f('highpass', 1800, 0.7), cg = v.g(0);
  cr.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, t + 0.15, vel * 0.7, 0.6);
  const s = v.osc('sine', 110, t, stop), sg = v.g(0);
  sweep(s.frequency, t + 0.15, 110, t + 1.2, 30);
  s.connect(sg); sg.connect(v.out);
  perc(sg.gain, t + 0.15, vel * 0.8, 0.35);
}

// Gravity lance charge: detuned low saws with warping pitch + ascending whine + suck
function lanceCharge(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.8, end = t + dur, stop = end + 0.1;
  const v = new Voice(E, 'sfx', { verb: 0.5, pan: 0 });
  const g = v.g(0); g.connect(v.out);
  const pre = v.g(0.3), sh = v.ws('hard'), lp = v.f('lowpass', 120, 3);
  sweep(lp.frequency, t, 120, end, 2400);
  pre.connect(sh); sh.connect(lp); lp.connect(g);
  [36.7, 38.9, 55, 58.3].forEach((f, i) => {
    const o = v.osc('sawtooth', f, t, stop);
    const l = v.osc('sine', R(0.08, 0.3) * (1 + i * 0.3), t, stop), lg = v.g(30);
    lg.gain.setValueAtTime(30, t); lg.gain.linearRampToValueAtTime(220, end);
    l.connect(lg); lg.connect(o.detune);
    o.detune.setValueAtTime(0, t); o.detune.linearRampToValueAtTime(i % 2 ? 500 : -300, end);
    o.connect(pre);
  });
  const w = v.osc('sine', 400, t, stop), wl = v.osc('sine', 6, t, stop), wlg = v.g(40), wg = v.g(0.18);
  sweep(w.frequency, t, 400, end, 3000);
  sweep(wl.frequency, t, 3, end, 18);
  wl.connect(wlg); wlg.connect(w.frequency); w.connect(wg); wg.connect(g);
  const n = v.noise('white', end - 3.5, stop), nl = v.f('lowpass', 200, 1), ng = v.g(0);
  sweep(nl.frequency, end - 3.5, 200, end, 9000);
  n.connect(nl); nl.connect(ng); ng.connect(v.out);
  riseCut(ng.gain, end - 3.5, end, vel * 0.4, 0.02);
  g.gain.setValueAtTime(1e-4, t);
  g.gain.exponentialRampToValueAtTime(vel * 0.5, end);
  g.gain.linearRampToValueAtTime(0, end + 0.04);
}
// Gravity lance fire: warped massive bass sweep
function lanceFire(E, t, p) {
  const vel = p.vel ?? 1, L = 4.5, stop = t + L + 0.5;
  const v = new Voice(E, 'sfx', { verb: 0.7, pan: 0 });
  const g = v.g(0); g.connect(v.out);
  const pre = v.g(0.7), sh = v.ws('fold'), lp = v.f('lowpass', 3000, 2);
  sweep(lp.frequency, t, 3000, t + L, 150);
  pre.connect(sh); sh.connect(lp); lp.connect(g);
  const fm = v.osc('sine', 7, t, stop), fmg = v.g(25);
  sweep(fm.frequency, t, 11, t + L, 3);
  fm.connect(fmg);
  for (const [type, f0] of [['sawtooth', 200], ['sine', 100], ['sawtooth', 151]]) {
    const o = v.osc(type, f0, t, stop);
    sweep(o.frequency, t, f0, t + L * 0.8, f0 * 0.11);
    fmg.connect(o.frequency); o.connect(pre);
  }
  perc(g.gain, t, vel * 0.6, L / 3.5, 0.01);
  const zc = v.osc('sawtooth', 5000, t, t + 0.6), zg = v.g(0);
  sweep(zc.frequency, t, 5000, t + 0.4, 200);
  zc.connect(zg); zg.connect(v.out);
  perc(zg.gain, t, vel * 0.12, 0.12);
  const n = v.noise('brown', t, stop), nl = v.f('lowpass', 1500, 0.7), ng = v.g(0);
  sweep(nl.frequency, t, 1500, t + L, 100);
  n.connect(nl); nl.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.8, L / 4, 0.02);
}

// Tinnitus ring — routed to the 'dry' bus so the master muffle does not touch it
function tinnitus(E, t, p) {
  const dur = p.dur ?? 6, vel = p.vel ?? 0.5, stop = t + dur + 0.5;
  const v = new Voice(E, 'dry', { verb: 0 });
  const g = v.g(0); g.connect(v.out);
  const f = p.f ?? 7200;
  v.osc('sine', f, t, stop).connect(g);
  const o2 = v.osc('sine', f + 7, t, stop), g2 = v.g(0.5); o2.connect(g2); g2.connect(g);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.09, t + 0.25);
  g.gain.setTargetAtTime(vel * 0.06, t + 0.4, 1.5);
  g.gain.setTargetAtTime(0, t + dur - 2, 0.6);
}

// Metal groan / hull creak
function groan(E, t, p) {
  const dur = p.dur ?? 2.5, f = p.f ?? 45, vel = p.vel ?? 0.6, stop = t + dur + 0.6;
  const v = new Voice(E, 'sfx', { verb: 0.6, pan: p.pan ?? 0 });
  const o = v.osc('sawtooth', f, t, stop), bp = v.f('bandpass', 220, 12), pre = v.g(3), sh = v.ws('soft'), g = v.g(0);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * 1.15, t + dur * 0.3);
  o.frequency.linearRampToValueAtTime(f * 0.78, t + dur);
  const w = v.osc('sine', R(3, 7), t, stop), wg = v.g(f * 0.04);
  w.connect(wg); wg.connect(o.frequency);
  sweep(bp.frequency, t, 260, t + dur, 120);
  o.connect(bp); bp.connect(pre); pre.connect(sh); sh.connect(g); g.connect(v.out);
  envAR(g.gain, t, dur, dur * 0.3, 0.5, vel * 0.3);
}

// Ambiences -------------------------------------------------------------------------
function spaceAmb(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.35, stop = t + dur + 3;
  const v = new Voice(E, 'sfx', { verb: 0.4 });
  const n = v.noise('brown', t, stop), lp = v.f('lowpass', 180, 0.7), g = v.g(0);
  const l = v.osc('sine', 0.07, t, stop), lg = v.g(90); l.connect(lg); lg.connect(lp.frequency);
  n.connect(lp); lp.connect(g); g.connect(v.out);
  envAR(g.gain, t, dur, Math.min(6, dur / 3), 2.5, vel * 0.5);
}
function hullRumble(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.6, stop = t + dur + 3;
  const v = new Voice(E, 'sfx', { mp: true, verb: 0.3, pan: p.pan0 ?? -0.8 });
  const g = v.g(0); g.connect(v.out);
  const n = v.noise('brown', t, stop), lp = v.f('lowpass', 220, 0.8);
  n.connect(lp); lp.connect(g);
  for (const f of [41, 55, 82.4]) { const o = v.osc('sine', f, t, stop), og = v.g(0.18); o.connect(og); og.connect(g); }
  const hum = v.osc('sawtooth', 110, t, stop), hl = v.f('lowpass', 300, 1), hg = v.g(0.08);
  hum.connect(hl); hl.connect(hg); hg.connect(g);
  g.gain.setValueAtTime(1e-4, t);
  g.gain.exponentialRampToValueAtTime(vel * 0.5, t + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(1e-3, t + dur);
  v.panRamp(p.pan0 ?? -0.8, p.pan1 ?? 0.8, t, t + dur);
}
function hangarAmb(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.5, stop = t + dur + 2;
  const v = new Voice(E, 'sfx', { verb: 0.5 });
  const g = v.g(0); g.connect(v.out);
  const h = v.osc('sine', 50, t, stop), h2 = v.osc('sine', 100, t, stop), hg = v.g(0.3);
  h.connect(hg); h2.connect(hg); hg.connect(g);
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 420, 0.5), ng = v.g(0.12);
  n.connect(bp); bp.connect(ng); ng.connect(g);
  envAR(g.gain, t, dur, 1.2, 1.5, vel * 0.3);
}
function warp(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.6, stop = t + dur + 2;
  const v = new Voice(E, 'sfx', { verb: 0.7 });
  const g = v.g(0); g.connect(v.out);
  const o = v.osc('sawtooth', 90, t, stop), bp = v.f('bandpass', 300, 9), og = v.g(0.8);
  const l = v.osc('sine', 0.13, t, stop), lg = v.g(35); l.connect(lg); lg.connect(o.frequency);
  const l2 = v.osc('sine', 0.21, t, stop), l2g = v.g(150); l2.connect(l2g); l2g.connect(bp.frequency);
  o.connect(bp); bp.connect(og); og.connect(g);
  for (const f of [1320, 1398]) { // doppler-ish descending eerie tones
    const s = v.osc('sine', f, t, stop), sg = v.g(0.05);
    sweep(s.frequency, t, f, t + dur, f * 0.5);
    s.connect(sg); sg.connect(g);
  }
  const n = v.noise('brown', t, stop), nl = v.f('lowpass', 120, 0.7), ng = v.g(0.8);
  n.connect(nl); nl.connect(ng); ng.connect(g);
  envAR(g.gain, t, dur, dur * 0.5, 2, vel * 0.35, false);
}
function wellHum(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.7, stop = t + dur + 2.5;
  const v = new Voice(E, 'sfx', { verb: 0.4 });
  const g = v.g(0), pg = v.g(0.6); g.connect(pg); pg.connect(v.out);
  const pl = v.osc('sine', 0.5, t, stop), plg = v.g(0.4); pl.connect(plg); plg.connect(pg.gain);
  v.osc('sine', 28, t, stop).connect(g);
  v.osc('sine', 31, t, stop).connect(g);
  const s = v.osc('triangle', 56, t, stop), sg = v.g(0.2); s.connect(sg); sg.connect(g);
  const n = v.noise('brown', t, stop), nl = v.f('lowpass', 90, 0.8), ng = v.g(0.9);
  n.connect(nl); nl.connect(ng); ng.connect(g);
  envAR(g.gain, t, dur, 2.5, 2, vel * 0.5);
}
function fireAmb(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.6, stop = t + dur + 2;
  const v = new Voice(E, 'sfx', { verb: 0.45 });
  const g = v.g(0); g.connect(v.out);
  const cr = v.noise('crackle', t, stop), cb = v.f('bandpass', 1600, 0.6), cg = v.g(0.6);
  cr.connect(cb); cb.connect(cg); cg.connect(g);
  const cr2 = v.noise('crackle', t, stop, 0.5), cl = v.f('lowpass', 700, 0.7), cg2 = v.g(0.5);
  cr2.connect(cl); cl.connect(cg2); cg2.connect(g);
  const r = v.noise('brown', t, stop), rl = v.f('lowpass', 160, 0.8), rg = v.g(1);
  const l = v.osc('sine', 0.3, t, stop), lg = v.g(60); l.connect(lg); lg.connect(rl.frequency);
  r.connect(rl); rl.connect(rg); rg.connect(g);
  envAR(g.gain, t, dur, 1.5, 2, vel * 0.4);
}
function alarmMuffled(E, t, p) {
  const dur = p.dur ?? 8, vel = p.vel ?? 0.4, per = 0.9, stop = t + dur + 0.5;
  const v = new Voice(E, 'sfx', { verb: 0.6, pan: p.pan ?? 0.4 });
  const o = v.osc('square', 988, t, stop), lp = v.f('lowpass', 900, 1), g = v.g(0);
  o.connect(lp); lp.connect(g); g.connect(v.out);
  g.gain.setValueAtTime(0, t);
  for (let ti = t; ti < t + dur; ti += per) {
    g.gain.setValueAtTime(0, ti);
    g.gain.linearRampToValueAtTime(vel * 0.06, ti + 0.01);
    g.gain.setValueAtTime(vel * 0.06, ti + 0.3);
    g.gain.linearRampToValueAtTime(0, ti + 0.32);
  }
}
function debrisAmb(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.5, stop = t + dur + 1;
  const v = new Voice(E, 'sfx', { verb: 0.8 });
  const g = v.g(0); g.connect(v.out);
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 3200, 6), tick = v.g(0);
  n.connect(bp); bp.connect(tick); tick.connect(g);
  tick.gain.setValueAtTime(0, t);
  for (let ti = t + R(0.3, 1); ti < t + dur - 0.5; ti += R(0.4, 2.2)) {
    tick.gain.setValueAtTime(R(0.3, 1), ti); tick.gain.setTargetAtTime(0, ti + 0.002, 0.02);
  }
  const h = v.osc('sine', 55, t, stop), hg = v.g(0.25); h.connect(hg); hg.connect(g);
  const w = v.noise('brown', t, stop), wl = v.f('lowpass', 150, 0.7), wg = v.g(0.5);
  w.connect(wl); wl.connect(wg); wg.connect(g);
  envAR(g.gain, t, dur, 2, 2, vel * 0.3);
}
function flicker(E, t, p) {
  const dur = p.dur ?? 3, vel = p.vel ?? 0.4, stop = t + dur + 0.2;
  const v = new Voice(E, 'sfx', { verb: 0.3, pan: p.pan ?? 0.2 });
  const o = v.osc('sawtooth', 120, t, stop), bp = v.f('bandpass', 1400, 2), g = v.g(0);
  o.connect(bp); bp.connect(g); g.connect(v.out);
  g.gain.setValueAtTime(0, t);
  for (let ti = t; ti < t + dur; ti += R(0.04, 0.35)) {
    g.gain.setValueAtTime(Math.random() < 0.55 ? vel * 0.07 : 0, ti);
  }
  g.gain.setValueAtTime(0, t + dur);
}
function dive(E, t, p) {
  const dur = p.dur ?? 3.5, vel = p.vel ?? 0.8, stop = t + dur + 0.5;
  const v = new Voice(E, 'sfx', { mp: true, verb: 0.5, pan: 0 });
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 3000, 1.3), g = v.g(0);
  sweep(bp.frequency, t, 3500, t + dur, 180);
  n.connect(bp); bp.connect(g); g.connect(v.out);
  g.gain.setValueAtTime(1e-4, t);
  g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.4);
  g.gain.setTargetAtTime(0, t + 0.6, dur / 3);
  const s = v.osc('sine', 90, t, stop), sg = v.g(0);
  sweep(s.frequency, t, 90, t + dur, 28);
  s.connect(sg); sg.connect(v.out);
  envAR(sg.gain, t, dur * 0.6, 0.3, dur * 0.5, vel * 0.6);
  v.panRamp(-0.4, 0.4, t, t + dur);
}
// lub-dub
function heartbeat(E, t, p) {
  const vel = p.vel ?? 0.8, stop = t + 0.9;
  const v = new Voice(E, 'sfx', { verb: 0.15 });
  const lp = v.f('lowpass', 180, 0.9); lp.connect(v.out);
  const beat = (t0, f0, f1, pk) => {
    const o = v.osc('sine', f0, t0, stop), g = v.g(0);
    sweep(o.frequency, t0, f0, t0 + 0.12, f1);
    o.connect(g); g.connect(lp);
    perc(g.gain, t0, pk, 0.06, 0.008);
  };
  beat(t, 62, 40, vel * 1.1);
  beat(t + 0.2, 55, 37, vel * 0.75);
}
// Implosion: reverse suck, cut at t+dur
function implosion(E, t, p) {
  const dur = p.dur ?? 2, vel = p.vel ?? 1, end = t + dur;
  const v = new Voice(E, 'sfx', { verb: 0.3, pan: 0 });
  const g = v.g(0); g.connect(v.out);
  const n = v.noise('white', t, end + 0.05), lp = v.f('lowpass', 200, 1.2);
  sweep(lp.frequency, t, 150, end, 12000);
  n.connect(lp); lp.connect(g);
  for (const m of [38, 45, 50, 57]) {
    const o = v.osc('sawtooth', mtof(m), t, end + 0.05), og = v.g(0.18);
    sweep(o.frequency, t, mtof(m), end, mtof(m + 24));
    o.connect(og); og.connect(lp);
  }
  const s = v.osc('sine', 25, t, end + 0.05), sg = v.g(0.8);
  sweep(s.frequency, t, 22, end, 90);
  s.connect(sg); sg.connect(g);
  riseCut(g.gain, t, end, vel * 0.55, 0.012);
}
// Shockwave — the biggest boom of the film
function shockwave(E, t, p) {
  const vel = p.vel ?? 1, L = 7, stop = t + L + 0.5;
  const v = new Voice(E, 'sfx', { verb: 0.8, pan: 0 });
  const s = v.osc('sine', 55, t, stop), sg = v.g(0);
  sweep(s.frequency, t, 70, t + 5, 18);
  s.connect(sg); sg.connect(v.out);
  perc(sg.gain, t, vel * 1.0, 1.8, 0.01);
  const n = v.noise('brown', t, stop), nb = v.g(2), nl = v.f('lowpass', 3000, 0.8), ng = v.g(0);
  v.noise('white', t, t + 3).connect(nl);
  sweep(nl.frequency, t, 3500, t + 3, 110);
  n.connect(nb); nb.connect(nl); nl.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.6, 1.4, 0.008);
  const c = v.noise('brown', t, t + 2), cs2 = v.osc('sawtooth', 40, t, t + 2), cp = v.g(3), cs = v.ws('hard'), cl = v.f('lowpass', 1500, 0.7), cg = v.g(0);
  c.connect(cp); cs2.connect(cp); cp.connect(cs); cs.connect(cl); cl.connect(cg); cg.connect(v.out);
  perc(cg.gain, t, vel * 0.3, 0.4);
  const cr = v.noise('white', t, t + 0.3), crh = v.f('highpass', 3000, 0.7), crg = v.g(0);
  cr.connect(crh); crh.connect(crg); crg.connect(v.out);
  perc(crg.gain, t, vel * 0.5, 0.03);
  const k = v.noise('crackle', t + 0.1, stop), kh = v.f('highpass', 1200, 0.7), kg = v.g(0);
  k.connect(kh); kh.connect(kg); kg.connect(v.out);
  kg.gain.setValueAtTime(1e-4, t + 0.1);
  kg.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.4);
  kg.gain.setTargetAtTime(0, t + 0.5, 1.8);
  const w = v.noise('white', t + 0.5, stop), wb = v.f('bandpass', 2000, 1), wg = v.g(0);
  sweep(wb.frequency, t + 0.5, 2000, t + L, 250);
  w.connect(wb); wb.connect(wg); wg.connect(v.out);
  envAR(wg.gain, t + 0.5, L - 1.5, 0.8, 1.5, vel * 0.15);
}
// Mothership main cannon: enormous
function mainFire(E, t, p) {
  const vel = p.vel ?? 1;
  ionFire(E, t, { vel, big: true, sizzle: 6, pan: 0 });
  ionBeam(E, t + 0.05, { dur: 4.5, vel: 0.65, f: 41, pan: 0 });
  boom(E, t, { vel, f: 34, dur: 6, bus: 'sfx', verb: 0.7 });
  const v = new Voice(E, 'sfx', { verb: 0.5 });
  const z = v.osc('sawtooth', 3000, t, t + 1.2), zp = v.g(0.7), zs = v.ws('hard'), zg = v.g(0);
  sweep(z.frequency, t, 3000, t + 0.9, 60);
  z.connect(zp); zp.connect(zs); zs.connect(zg); zg.connect(v.out);
  perc(zg.gain, t, vel * 0.2, 0.3);
}
// Slow-motion: deep time-stretch whoosh + reverse suck back into real time
function slowmo(E, t, p) {
  const dur = p.dur ?? 4, vel = p.vel ?? 0.6, stop = t + dur + 0.5;
  const v = new Voice(E, 'sfx', { verb: 0.8 });
  const g = v.g(0); g.connect(v.out);
  const o = v.osc('sine', 110, t, stop), o2 = v.osc('sine', 164, t, stop);
  sweep(o.frequency, t, 110, t + 1, 40); sweep(o2.frequency, t, 164, t + 1, 61);
  o.connect(g); o2.connect(g);
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 1200, 2), ng = v.g(0.5);
  sweep(bp.frequency, t, 2500, t + 1.2, 250);
  n.connect(bp); bp.connect(ng); ng.connect(g);
  envAR(g.gain, t, dur - 0.8, 0.2, 0.8, vel * 0.35);
  revswell(E, t + dur - 1.2, { dur: 1.2, vel: vel * 0.8, bus: 'sfx', fTop: 7000 });
}

// ================================================================ v2: EVE-style battle texture
// Autocannon burst: one gated noise source + one gated thump oscillator (cheap, dense)
function autocannon(E, t, p) {
  const dur = p.dur ?? 1.2, rate = p.rate ?? 11, vel = p.vel ?? 0.5, far = !!p.far, stop = t + dur + 0.6;
  const v = new Voice(E, 'sfx', { mp: true, verb: far ? 0.6 : 0.35, pan: p.pan0 ?? 0 });
  const lp = v.f('lowpass', far ? 1600 : 6000, 0.7); lp.connect(v.out);
  const n = v.noise('white', t, stop), bp = v.f('bandpass', far ? 700 : 1100, 1.2), g = v.g(0);
  n.connect(bp); bp.connect(g); g.connect(lp);
  const th = v.osc('sine', 120, t, stop), tg = v.g(0);
  th.connect(tg); tg.connect(lp);
  g.gain.setValueAtTime(0, t); tg.gain.setValueAtTime(0, t);
  const N = Math.max(1, Math.floor(dur * rate));
  for (let i = 0; i < N; i++) {
    const ti = t + i / rate + R(0, 0.01), a = vel * R(0.75, 1);
    g.gain.setValueAtTime(a * 0.6, ti); g.gain.setTargetAtTime(0, ti + 0.002, 0.025);
    tg.gain.setValueAtTime(a * 0.7, ti); tg.gain.setTargetAtTime(0, ti + 0.002, 0.03);
    th.frequency.setValueAtTime(150, ti); th.frequency.exponentialRampToValueAtTime(55, ti + 0.05);
  }
  v.panRamp(p.pan0 ?? 0, p.pan1 ?? 0, t, t + dur);
}
// Railgun: supersonic crack + descending zap + metallic ring + thump
function railgun(E, t, p) {
  const vel = p.vel ?? 0.8, far = !!p.far, stop = t + 2;
  const v = new Voice(E, 'sfx', { verb: far ? 0.7 : 0.5, pan: p.pan ?? 0 });
  const out = v.f('lowpass', far ? 2200 : 16000, 0.7); out.connect(v.out);
  const c = v.noise('white', t, t + 0.2), ch = v.f('highpass', 2500, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(out);
  perc(cg.gain, t, vel * 0.6, 0.02, 0.001);
  const z = v.osc('sawtooth', 5200, t, t + 0.5), zb = v.f('bandpass', 4000, 6), zg = v.g(0);
  sweep(z.frequency, t, 5200, t + 0.12, 700); sweep(zb.frequency, t, 4500, t + 0.14, 900);
  z.connect(zb); zb.connect(zg); zg.connect(out);
  perc(zg.gain, t, vel * 0.5, 0.08, 0.001);
  const rg = v.g(0); rg.connect(out);
  for (const f of [1830, 2710, 3950, 5230]) v.osc('sine', f * R(0.97, 1.03), t, stop).connect(rg);
  perc(rg.gain, t, vel * 0.05, 0.45);
  const s = v.osc('sine', 95, t, t + 0.8), sg = v.g(0);
  sweep(s.frequency, t, 95, t + 0.25, 40);
  s.connect(sg); sg.connect(out);
  perc(sg.gain, t, vel * 0.6, 0.12);
}
// Constant low battle bed: sub rumble + distant crackle, slowly breathing
function battleBed(E, t, p) {
  const dur = p.dur, vel = p.vel ?? 0.5, stop = t + dur + 3;
  const v = new Voice(E, 'sfx', { verb: 0.4 });
  const g = v.g(0), tg = v.g(0.75); g.connect(tg); tg.connect(v.out);
  const tl = v.osc('sine', 0.23, t, stop), tlg = v.g(0.25); tl.connect(tlg); tlg.connect(tg.gain);
  const b1 = v.noise('brown', t, stop), l1 = v.f('lowpass', 110, 0.8), g1 = v.g(1);
  const ll = v.osc('sine', 0.1, t, stop), llg = v.g(40); ll.connect(llg); llg.connect(l1.frequency);
  b1.connect(l1); l1.connect(g1); g1.connect(g);
  const b2 = v.noise('brown', t, stop, 0.5), l2 = v.f('lowpass', 60, 0.8), g2 = v.g(0.8);
  b2.connect(l2); l2.connect(g2); g2.connect(g);
  const cr = v.noise('crackle', t, stop, 0.7), cb = v.f('bandpass', 800, 0.5), cg = v.g(0.12);
  cr.connect(cb); cb.connect(cg); cg.connect(g);
  envAR(g.gain, t, dur, 2, 2.5, vel * 0.5);
}
// Alarm stinger: dissonant distorted cluster slam for the Act I → Act II crash cut
function stinger(E, t, p) {
  const vel = p.vel ?? 1, stop = t + 4.5;
  const v = new Voice(E, 'sfx', { verb: 0.6 });
  const pre = v.g(0.18), sh = v.ws('hard'), lp = v.f('lowpass', 200, 2), g = v.g(0);
  pre.connect(sh); sh.connect(lp); lp.connect(g); g.connect(v.out);
  lp.frequency.setValueAtTime(200, t);
  lp.frequency.exponentialRampToValueAtTime(5000, t + 0.03);
  lp.frequency.setTargetAtTime(900, t + 0.05, 0.5);
  for (const m of [50, 51, 56, 62, 63]) for (const d of [-12, 12]) v.osc('sawtooth', mtof(m), t, stop, d).connect(pre);
  perc(g.gain, t, vel * 0.55, 0.9, 0.004);
  const hs = v.g(0), hb = v.f('bandpass', 2500, 2);
  v.osc('sawtooth', mtof(93), t, stop).connect(hb); v.osc('sawtooth', mtof(94), t, stop).connect(hb);
  hb.connect(hs); hs.connect(v.out);
  perc(hs.gain, t, vel * 0.12, 0.6, 0.004);
  const c = v.noise('white', t, t + 0.3), ch = v.f('highpass', 1500, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, t, vel * 0.6, 0.04, 0.001);
  const s = v.osc('sine', 80, t, t + 2), sg = v.g(0);
  sweep(s.frequency, t, 80, t + 0.8, 30);
  s.connect(sg); sg.connect(v.out);
  perc(sg.gain, t, vel, 0.35, 0.003);
}

// ================================================================ v2: media voices
// Voice-over line (AudioBuffer). Event starts VOICE_PRE s before the speech so the radio
// click/beep leads in. p: {buf, radio, gain, dur (remaining incl. pre), into, cut}
export const VOICE_PRE = 0.15;
function voiceLine(E, t, p) {
  const buf = p.buf, into = p.into || 0, end = t + p.dur;
  const sp = t + Math.max(0, VOICE_PRE - into), off = Math.max(0, into - VOICE_PRE);
  if (!buf || off >= buf.duration - 0.02 || end - sp < 0.03) return;
  const v = new Voice(E, 'voice', { verb: p.radio ? 0.03 : 0.14 });
  const src = v.add(E.ctx.createBufferSource());
  src.buffer = buf;
  const gain = p.gain ?? 1, g = v.g(0);
  g.connect(v.out);
  if (p.broken) {
    // BROKEN radio: narrow band, bit-crush stair curve, random dropouts, crackle bursts, heterodyne whistle
    const hp = v.f('highpass', 500, 0.9), lp = v.f('lowpass', 2800, 1.1), pk = v.f('peaking', 1500, 1.5);
    pk.gain.value = 5;
    const pre = v.g(1.1), cr = v.ws('crush'), post = v.g(1.0), gate = v.g(1);
    src.connect(hp); hp.connect(lp); lp.connect(pk); pk.connect(pre); pre.connect(cr); cr.connect(post); post.connect(gate); gate.connect(g);
    // (no dropouts / crackle / hiss / whistle: they read as grating noise)
  } else if (p.radio) {
    const hp = v.f('highpass', 300, 0.7), lp = v.f('lowpass', 3400, 0.9), pk = v.f('peaking', 1800, 1.2);
    pk.gain.value = 4;
    const pre = v.g(0.9), sh = v.ws('soft'), post = v.g(1.1);   // mild saturation
    src.connect(hp); hp.connect(lp); lp.connect(pk); pk.connect(pre); pre.connect(sh); sh.connect(post); post.connect(g);
  } else src.connect(g);
  g.gain.setValueAtTime(0, sp);
  g.gain.linearRampToValueAtTime(gain, sp + (off > 0 ? 0.02 : 0.003));
  if (p.cut) { g.gain.setValueAtTime(gain, Math.max(sp + 0.01, end - 0.006)); g.gain.linearRampToValueAtTime(0, end); }
  v._run(src, sp, end + 0.005, off);
  // (no radio click/squelch/static under the lines: the crackle was grating — the band-limited EQ carries the radio feel)
}
// Music stem (AudioBuffer). One AudioBufferSourceNode per playing stem.
// p: {buf, dur (remaining, incl. fade-out), into, offset, gain, fadeIn, fadeOut}
function stem(E, t, p) {
  const buf = p.buf, into = p.into || 0, off = (p.offset || 0) + into;
  if (!buf || off >= buf.duration - 0.05) return;
  const d = Math.min(p.dur, buf.duration - off), end = t + d;
  const v = new Voice(E, 'music', { verb: 0 });
  const src = v.add(E.ctx.createBufferSource());
  src.buffer = buf;
  const gain = p.gain ?? 1, g = v.g(0);
  src.connect(g); g.connect(v.out);
  const fi = Math.max(into > 0 ? 0.03 : 0.005, (p.fadeIn || 0) - into);
  const fo = Math.max(0.004, Math.min(p.fadeOut || 0, d - fi));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + fi);
  g.gain.setValueAtTime(gain, Math.max(t + fi, end - fo));
  g.gain.linearRampToValueAtTime(0, end);
  v._run(src, t, end + 0.005, off);
}

// ================================================================ v3: sample player
// One Pixabay sample (or slice / loop). p (prepared by Score._buildEvents):
//   ref {buf} (resolved into p.buf), off/sdur = slice in buffer seconds, loop [start,len],
//   dur = real seconds, rate (+rateTo ramp), gain, pan | pan0→pan1, far 0..1 (attenuation + low-pass),
//   fadeIn/fadeOut, bus ('sfx' | 'dry' | 'music'), prio (voice stealing), into (resume)
function smp(E, t, p) {
  const buf = p.buf, rate = p.rate || 1, into = p.into || 0, far = p.far || 0;
  let off, bufDur, end;
  if (p.loop) {
    const [ls, len] = p.loop;
    off = ls + ((into * rate) % len);
    end = t + p.dur;
  } else {
    off = (p.off || 0) + into * rate;
    bufDur = (p.sdur ?? buf.duration - (p.off || 0)) - into * rate;
    if (p.dur !== undefined) bufDur = Math.min(bufDur, p.dur * rate);
    if (!(bufDur > 0.02) || off >= buf.duration - 0.01) return;
    end = t + bufDur / rate;
  }
  if (!E._admit(p.prio ?? 5, t)) return;
  const moving = p.pan1 !== undefined;
  const v = new Voice(E, p.bus || 'sfx', { mp: moving, pan: moving ? p.pan0 : (p.pan || 0), verb: p.verb ?? (0.12 + 0.55 * far) });
  let tail = v.out;
  const cut = p.lp ?? (far > 0 ? 500 + 15500 * Math.pow(1 - far, 2.2) : 0);
  if (cut) { const lp = v.f('lowpass', cut, 0.7); lp.connect(v.out); tail = lp; }
  const src = v.add(E.ctx.createBufferSource());
  src.buffer = buf;
  src.playbackRate.value = rate;
  if (p.loop) { src.loop = true; src.loopStart = p.loop[0]; src.loopEnd = p.loop[0] + p.loop[1]; }
  const g = v.g(0);
  let gm = null;
  if (p.mod) { gm = v.g(1); src.connect(gm); gm.connect(g); } else src.connect(g);
  g.connect(tail);
  const gain = (p.gain ?? 1) * (1 - 0.65 * far);
  const fi = Math.max(into > 0 ? 0.03 : 0.004, (p.fadeIn || 0) - into);
  const fo = Math.min(p.fadeOut || 0, Math.max(0, end - t - fi));
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + fi);
  if (fo > 0) { g.gain.setValueAtTime(gain, end - fo); g.gain.linearRampToValueAtTime(0, end); }
  if (p.mod) {   // swing-speed modulation (saber hum): rate & gain keyframes, multiplied by the slow-mo warp
    let first = true;
    for (const [dt, rm, gmul] of p.mod) {
      const at = t + dt - into;
      if (at < t - 0.05) continue;
      if (at > end) break;
      const r = rate * rm * E._warpAt(at - E._t0);
      if (first) { src.playbackRate.setValueAtTime(r, Math.max(t, at)); gm.gain.setValueAtTime(gmul, Math.max(t, at)); first = false; }
      else { src.playbackRate.linearRampToValueAtTime(r, at); gm.gain.linearRampToValueAtTime(gmul, at); }
    }
  } else if (p.rateTo) { src.playbackRate.setValueAtTime(rate, t); src.playbackRate.linearRampToValueAtTime(p.rateTo, end); }
  else E._warp(src.playbackRate, t, end, rate);   // global slow-motion pitch-down (AUTOMATION.warp)
  if (moving) v.panRamp(p.pan0, p.pan1, t, end);
  if (p.loop) v._run(src, t, end + 0.01, off);
  else v._run(src, t, end + 3, off, bufDur);      // buffer-time duration; generous stop for warped playback
  const h = { g, src, prio: p.prio ?? 5, t0: t };
  const prev = src.onended;
  src.onended = () => { E._untrack(h); prev(); };
  E._track(h);
}

// ================================================================ v5: berserk assault on the shield
// Feral mech roar: distorted, FM-wobbled low saw stack with a pitch lunge
function growl(E, t, p) {
  const dur = p.dur ?? 1.8, vel = p.vel ?? 0.9, stop = t + dur + 0.6;
  const v = new Voice(E, 'sfx', { verb: 0.45 });
  const pre = v.g(0.5), sh = v.ws('hard'), lp = v.f('lowpass', 300, 2.5), g = v.g(0);
  pre.connect(sh); sh.connect(lp); lp.connect(g); g.connect(v.out);
  lp.frequency.setValueAtTime(250, t);
  lp.frequency.exponentialRampToValueAtTime(1600, t + 0.25);
  lp.frequency.setTargetAtTime(420, t + 0.35, dur / 3);
  const fm = v.osc('sine', 31, t, stop), fmg = v.g(18);
  fm.connect(fmg);
  for (const [f0, d] of [[41, 0], [55, 7], [55.4, -9], [82.5, 4]]) {
    const o = v.osc('sawtooth', f0, t, stop, d);
    o.frequency.setValueAtTime(f0 * 0.7, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.25, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + dur);
    fmg.connect(o.frequency); o.connect(pre);
  }
  envAR(g.gain, t, dur, 0.06, 0.5, vel * 0.5);
}
// Energy-shield impact: fast FM crackle + crackle bed + sub knock
function shieldHit(E, t, p) {
  // a fist on an ENERGY BARRIER: a huge concussive "thoom" (the field takes the blow), an electric discharge that
  // crackles out across the surface, and the whole field ringing like a struck bell — low, beating, fading
  const vel = p.vel ?? 0.9, stop = t + 2.6;
  const v = new Voice(E, 'sfx', { verb: 0.6, pan: p.pan ?? 0, gain: 0.8 });
  // 1. concussion: two pitch-dropping sines + a low noise thump
  for (const [f0, f1, a, tc] of [[62, 30, 1.0, 0.45], [96, 44, 0.55, 0.3]]) {
    const o = v.osc('sine', f0, t, stop), og = v.g(0);
    sweep(o.frequency, t, f0, t + 0.5, f1);
    o.connect(og); og.connect(v.out); perc(og.gain, t, vel * a, tc, 0.004);
  }
  const th = v.noise('white', t, t + 0.5), tl = v.f('lowpass', 700, 0.8), tg = v.g(0);
  th.connect(tl); tl.connect(tg); tg.connect(v.out); perc(tg.gain, t, vel * 0.6, 0.09, 0.002);
  // 2. discharge: bright crackle spreading across the field, flickering, with a short sizzle tail
  const cr = v.noise('crackle', t, stop), cb = v.f('bandpass', 4200, 0.8), cg = v.g(0), fl = v.g(0.6);
  cr.connect(cb); cb.connect(cg); cg.connect(fl); fl.connect(v.out);
  sweep(cb.frequency, t, 5200, t + 0.9, 2400);
  perc(cg.gain, t + 0.01, vel * 0.55, 0.4, 0.003);
  const flk = v.osc('square', 34, t, stop), fk = v.g(0.35); flk.connect(fk); fk.connect(fl.gain);
  // 3. the field rings: a low, slightly detuned chord (beats), swelling in and dying away
  const rg = v.g(0), rl = v.f('lowpass', 900, 0.6);
  rg.connect(rl); rl.connect(v.out);
  for (const f of [110, 110 * 1.006, 164.8, 246.9, 329.6 * 0.997]) { const o = v.osc('sine', f, t, stop); o.connect(rg); }
  rg.gain.setValueAtTime(0, t); rg.gain.linearRampToValueAtTime(vel * 0.09, t + 0.06); rg.gain.setTargetAtTime(0, t + 0.12, 0.55);
  // a glassy shimmer sliding down under the ring
  const sh = v.osc('triangle', 1300, t, stop), sb = v.f('bandpass', 1300, 4), sgn = v.g(0);
  sweep(sh.frequency, t, 1300, t + 1.2, 420); sweep(sb.frequency, t, 1300, t + 1.2, 420);
  sh.connect(sb); sb.connect(sgn); sgn.connect(v.out); perc(sgn.gain, t + 0.02, vel * 0.05, 0.5, 0.01);
}
// small-craft laser: a tight pitch-dropping zap with a bit of body and a click — each shot a little different
function blaster(E, t, p) {
  const vel = p.vel ?? 0.5, f0 = p.f0 ?? 1700, end = t + 0.3;
  const v = new Voice(E, 'sfx', { verb: 0.22, pan: p.pan ?? 0 });
  const o = v.osc('sawtooth', f0, t, end), lp = v.f('lowpass', 6000, 1.4), g = v.g(0);
  sweep(o.frequency, t, f0, t + 0.13, f0 * 0.2); sweep(lp.frequency, t, 6500, t + 0.14, 600);
  o.connect(lp); lp.connect(g); g.connect(v.out); perc(g.gain, t, vel * 0.3, 0.055, 0.0008);
  const s = v.osc('sine', f0 * 0.45, t, end), sg = v.g(0);
  sweep(s.frequency, t, f0 * 0.45, t + 0.16, 80);
  s.connect(sg); sg.connect(v.out); perc(sg.gain, t, vel * 0.45, 0.07, 0.0008);
  const n = v.noise('white', t, t + 0.04), nb = v.f('bandpass', 4000, 1.3), ng = v.g(0);
  n.connect(nb); nb.connect(ng); ng.connect(v.out); perc(ng.gain, t, vel * 0.22, 0.012, 0.0004);
}
// Rising shield-strain whine between impacts (cut at the end)
function shieldStrain(E, t, p) {
  const dur = p.dur ?? 1.5, vel = p.vel ?? 0.5, end = t + dur;
  const v = new Voice(E, 'sfx', { verb: 0.5 });
  const g = v.g(0), tg = v.g(0.6);
  g.connect(tg); tg.connect(v.out);
  const l = v.osc('sine', 6, t, end + 0.05), lg = v.g(0.4);
  sweep(l.frequency, t, p.trem0 ?? 6, end, 28);
  l.connect(lg); lg.connect(tg.gain);
  const bp = v.f('bandpass', 800, 3); bp.connect(g);
  const f0 = p.f0 ?? 420, f1 = p.f1 ?? 1700;
  const o = v.osc('sine', f0, t, end + 0.05), o2 = v.osc('sine', f0 * 2.01, t, end + 0.05), og = v.g(0.35);   // (a sawtooth whine read as cheap)
  sweep(o.frequency, t, f0, end, f1); sweep(o2.frequency, t, f0 * 2.01, end, f1 * 2.01); sweep(bp.frequency, t, f0 * 2, end, f1 * 2);
  o.connect(bp); o2.connect(og); og.connect(g);
  riseCut(g.gain, t, end, vel * 0.16, 0.03);
}
// Shield SHATTER: bright glassy burst + pitch-down sweep + glass ring + crystalline shard tinkles
function shatter(E, t, p) {
  const vel = p.vel ?? 1, shardDur = p.shards ?? 2, stop = t + shardDur + 2;
  const v = new Voice(E, 'sfx', { verb: 0.75 });
  const n = v.noise('white', t, t + 1.5), hp = v.f('highpass', 3500, 0.7), pk = v.f('peaking', 8000, 1.2), ng = v.g(0);
  pk.gain.value = 8;
  n.connect(hp); hp.connect(pk); pk.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.6, 0.25, 0.001);
  const sw = v.osc('sawtooth', 3200, t, t + 1.4), sb = v.f('bandpass', 3000, 5), sg = v.g(0);
  sweep(sw.frequency, t, 3200, t + 0.9, 160); sweep(sb.frequency, t, 3500, t + 0.9, 300);
  sw.connect(sb); sb.connect(sg); sg.connect(v.out);
  perc(sg.gain, t, vel * 0.35, 0.3, 0.001);
  const rg = v.g(0); rg.connect(v.out);
  for (const f of [2093, 2794, 3520, 4699, 6272]) v.osc('sine', f * R(0.98, 1.03), t, t + 3).connect(rg);
  perc(rg.gain, t, vel * 0.06, 0.7, 0.002);
  // shards: short high sine pings, dense at first then thinning, scattered in stereo
  const N = p.count ?? 46;
  for (let i = 0; i < N; i++) {
    const k = Math.pow(i / N, 1.8), ti = t + 0.05 + k * shardDur + R(0, 0.04);
    const pn = v.add(E.ctx.createStereoPanner()); pn.pan.value = R(-0.9, 0.9); pn.connect(v.out);
    const o = v.osc('sine', R(2800, 9500), ti, ti + 0.4), og = v.g(0);
    o.connect(og); og.connect(pn);
    perc(og.gain, ti, vel * R(0.02, 0.07) * (1 - 0.6 * k), R(0.03, 0.09), 0.001);
  }
}
// Digital glitch / static burst (screen-glitch sweetener)
function glitch(E, t, p) {
  const dur = p.dur ?? 0.35, vel = p.vel ?? 0.5, end = t + dur;
  const v = new Voice(E, 'sfx', { verb: 0.08, pan: p.pan ?? R(-0.4, 0.4) });
  const n = v.noise('white', t, end + 0.02), bp = v.f('bandpass', 3000, 4), g = v.g(0);
  n.connect(bp); bp.connect(g); g.connect(v.out);
  const sq = v.osc('square', 800, t, end + 0.02), sl = v.f('lowpass', 5000, 0.7), sgn = v.g(0);
  sq.connect(sl); sl.connect(sgn); sgn.connect(v.out);
  g.gain.setValueAtTime(0, t); sgn.gain.setValueAtTime(0, t);
  for (let ti = t; ti < end; ti += R(0.012, 0.04)) {
    const on = Math.random() < 0.7;
    bp.frequency.setValueAtTime(R(600, 9000), ti);
    sq.frequency.setValueAtTime(R(90, 2400), ti);
    g.gain.setValueAtTime(on ? vel * R(0.2, 0.5) : 0, ti);
    sgn.gain.setValueAtTime(on && Math.random() < 0.5 ? vel * 0.06 : 0, ti);
  }
  g.gain.setValueAtTime(0, end); sgn.gain.setValueAtTime(0, end);
}

// ================================================================ v6
// Small impact thud of an ion bolt hitting a hull (distance → level + low-pass)
function ionThud(E, t, p) {
  const vel = p.vel ?? 0.5, far = p.far ?? 0, stop = t + 1.2;
  const v = new Voice(E, 'sfx', { verb: 0.2 + 0.5 * far, pan: p.pan ?? 0 });
  const lp = v.f('lowpass', 600 + 9000 * Math.pow(1 - far, 2), 0.7); lp.connect(v.out);
  const s = v.osc('sine', 130, t, stop), sg = v.g(0);
  sweep(s.frequency, t, 140, t + 0.18, 48);
  s.connect(sg); sg.connect(lp);
  perc(sg.gain, t, vel * 0.8, 0.09);
  const n = v.noise('brown', t, t + 0.5), nl = v.f('lowpass', 900, 0.8), ng = v.g(0);
  n.connect(nl); nl.connect(ng); ng.connect(lp);
  perc(ng.gain, t, vel * 0.7, 0.06);
  const c = v.noise('crackle', t, t + 0.9), ch = v.f('highpass', 1500, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(lp);
  perc(cg.gain, t + 0.01, vel * 0.25, 0.18);
}
// Hyperspace "elastic snap": the stretched hull springs back — pitch-bent whoosh + damped boing
function warpSnap(E, t, p) {
  const deep = !!p.deep, vel = p.vel ?? 0.6, L = deep ? 1.4 : 0.6, stop = t + L + 0.4;
  const v = new Voice(E, 'sfx', { verb: deep ? 0.6 : 0.4, pan: p.pan ?? 0 });
  const f0 = deep ? 380 : 1300, f1 = deep ? 42 : 170;
  const o = v.osc('sine', f0, t, stop), o2 = v.osc('triangle', f0 * 1.5, t, stop), og = v.g(0);
  sweep(o.frequency, t, f0, t + L * 0.45, f1); sweep(o2.frequency, t, f0 * 1.5, t + L * 0.45, f1 * 1.5);
  const wob = v.osc('sine', deep ? 7 : 16, t, stop), wg = v.g(0);
  wob.connect(wg); wg.connect(o.frequency); wg.connect(o2.frequency);
  wg.gain.setValueAtTime(f1 * 0.35, t + L * 0.3); wg.gain.setTargetAtTime(0, t + L * 0.35, L * 0.2);   // damped elastic wobble
  o.connect(og); o2.connect(og); og.connect(v.out);
  perc(og.gain, t, vel * 0.35, L * 0.35, 0.004);
  const n = v.noise('white', t, stop), bp = v.f('bandpass', deep ? 1200 : 4000, 1.6), ng = v.g(0);
  sweep(bp.frequency, t, deep ? 1600 : 6000, t + L * 0.5, deep ? 120 : 500);
  n.connect(bp); bp.connect(ng); ng.connect(v.out);
  perc(ng.gain, t, vel * 0.45, L * 0.25, 0.003);
}
// Hyperspace stretching squeal on departure: rising strained tone + noise, cut when the ship is gone
function warpSqueal(E, t, p) {
  const dur = p.dur ?? 2.2, deep = !!p.deep, vel = p.vel ?? 0.5, end = t + dur;
  const v = new Voice(E, 'sfx', { verb: 0.5, pan: p.pan ?? 0 });
  const g = v.g(0); g.connect(v.out);
  const f0 = deep ? 70 : 280, f1 = deep ? 900 : 3200;
  const bp = v.f('bandpass', f0 * 3, 4); bp.connect(g);
  const vib = v.osc('sine', 5, t, end + 0.05), vg = v.g(0);
  sweep(vib.frequency, t, 5, end, 22);
  vib.connect(vg);
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(60, end);
  for (const [type, k] of [['sawtooth', 1], ['sine', 2.01], ['square', 0.5]]) {
    const o = v.osc(type, f0 * k, t, end + 0.05);
    sweep(o.frequency, t, f0 * k, end, f1 * k);
    vg.connect(o.detune); o.connect(bp);
  }
  sweep(bp.frequency, t, f0 * 3, end, f1 * 2);
  const n = v.noise('white', t, end + 0.05), nb = v.f('bandpass', 800, 2), ng = v.g(0.5);
  sweep(nb.frequency, t, 800, end, 7000);
  n.connect(nb); nb.connect(ng); ng.connect(g);
  riseCut(g.gain, t, end, vel * 0.3, 0.03);
}
// Shield tear: hands ripping the shield open — electrical tearing rising into the shatter
function tear(E, t, p) {
  const dur = p.dur ?? 0.75, vel = p.vel ?? 0.9, end = t + dur;
  const v = new Voice(E, 'sfx', { verb: 0.4 });
  const g = v.g(0); g.connect(v.out);
  const cr = v.noise('crackle', t, end + 0.05, 1.6), cb = v.f('bandpass', 1500, 0.8), cg = v.g(1.4);
  sweep(cb.frequency, t, 1200, end, 6000);
  cr.connect(cb); cb.connect(cg); cg.connect(g);
  const n = v.noise('white', t, end + 0.05), nb = v.f('bandpass', 900, 3), am = v.g(0.5), ng = v.g(0.6);
  const rip = v.osc('square', 23, t, end + 0.05), rg = v.g(0.5);   // ragged ripping AM
  sweep(rip.frequency, t, 18, end, 70);
  rip.connect(rg); rg.connect(am.gain);
  sweep(nb.frequency, t, 900, end, 4500);
  n.connect(nb); nb.connect(am); am.connect(ng); ng.connect(g);
  const c = v.osc('sawtooth', 300, t, end + 0.05), m = v.osc('sine', 61, t, end + 0.05), mg = v.g(150), sb = v.f('bandpass', 900, 3), sg = v.g(0.35);
  sweep(c.frequency, t, 300, end, 2100); sweep(sb.frequency, t, 700, end, 4200);
  m.connect(mg); mg.connect(c.frequency); c.connect(sb); sb.connect(sg); sg.connect(g);
  const gr = v.osc('sawtooth', 48, t, end + 0.05), gb = v.f('bandpass', 260, 9), gp = v.g(2.5), gs = v.ws('soft'), gg = v.g(0.35);
  sweep(gr.frequency, t, 48, end, 80);
  gr.connect(gb); gb.connect(gp); gp.connect(gs); gs.connect(gg); gg.connect(g);
  riseCut(g.gain, t, end, vel * 0.5, 0.02);
}
// Engulfed: a rising, overwhelming reverse swell that swallows everything (routed around the master low-pass)
function engulf(E, t, p) {
  const dur = p.dur ?? 2, vel = p.vel ?? 1, end = t + dur;
  const v = new Voice(E, 'dry', { verb: 0 });
  const g = v.g(0), lp = v.f('lowpass', 400, 0.7);
  sweep(lp.frequency, t, 400, end, 14000);
  lp.connect(g); g.connect(v.out);
  for (const m of [38, 45, 50, 57, 62, 69, 74, 81]) {
    const o = v.osc('sawtooth', mtof(m), t, end + 0.05, R(-12, 12)), og = v.g(0.08);
    sweep(o.frequency, t, mtof(m) * 0.94, end, mtof(m) * 1.06);
    o.connect(og); og.connect(lp);
  }
  const n = v.noise('white', t, end + 0.05), ng = v.g(0.9);
  n.connect(ng); ng.connect(lp);
  const s = v.osc('sine', 30, t, end + 0.05), sg = v.g(0.8);
  sweep(s.frequency, t, 28, end, 60);
  s.connect(sg); sg.connect(g);
  riseCut(g.gain, t, end, vel * 0.6, 0.015);
}

// ================================================================ v7: mech duel
// Blade-on-blade metallic ring: inharmonic partials (struck plate), click transient
function metalRing(E, t, p) {
  const vel = p.vel ?? 0.8, f0 = p.f0 ?? 880, dec = p.dec ?? 0.9, stop = t + dec * 1.6;
  const v = new Voice(E, 'sfx', { verb: 0.5, pan: p.pan ?? 0 });
  const g = v.g(0); g.connect(v.out);
  [[1, 1], [2.76, 0.7], [5.4, 0.5], [8.93, 0.35], [13.34, 0.2]].forEach(([k, a]) => {
    const o = v.osc('sine', f0 * k * R(0.995, 1.005), t, stop), og = v.g(a);
    o.connect(og); og.connect(g);
  });
  perc(g.gain, t, vel * 0.12, dec / 3, 0.001);
  const c = v.noise('white', t, t + 0.1), ch = v.f('highpass', 4000, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, t, vel * 0.35, 0.012, 0.001);
}
// Hit-stop "freeze": a short suspended tonal sting for the frozen frames
function freezeSting(E, t, p) {
  const hold = Math.max(0.06, p.dur ?? 0.1), vel = p.vel ?? 0.5, stop = t + hold + 0.6;
  const v = new Voice(E, 'sfx', { verb: 0.6 });
  const g = v.g(0), lp = v.f('lowpass', 7000, 0.7); lp.connect(g); g.connect(v.out);
  for (const m of [88, 95, 102]) v.osc('sine', mtof(m) * R(0.998, 1.002), t, stop).connect(lp);
  const n = v.noise('white', t, t + hold), nb = v.f('bandpass', 9000, 3), ng = v.g(0.2);
  n.connect(nb); nb.connect(ng); ng.connect(g);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.1, t + 0.004);
  g.gain.setValueAtTime(vel * 0.1, t + hold);
  g.gain.setTargetAtTime(0, t + hold, 0.09);
  lp.frequency.setValueAtTime(7000, t + hold); lp.frequency.exponentialRampToValueAtTime(900, t + hold + 0.3);
}
// Metal crunch for body blows
function crunch(E, t, p) {
  const vel = p.vel ?? 0.8, stop = t + 0.9;
  const v = new Voice(E, 'sfx', { verb: 0.3, pan: p.pan ?? 0 });
  const n = v.noise('brown', t, stop), pre = v.g(4), sh = v.ws('hard'), bp = v.f('bandpass', 1400, 0.8), g = v.g(0);
  n.connect(pre); pre.connect(sh); sh.connect(bp); bp.connect(g); g.connect(v.out);
  perc(g.gain, t, vel * 0.35, 0.09, 0.002);
  const c = v.noise('crackle', t, stop), ch = v.f('highpass', 1800, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, t + 0.01, vel * 0.5, 0.15, 0.002);
}
// Small spark crackle burst (blade-lock grind)
function sparkBurst(E, t, p) {
  const vel = p.vel ?? 0.5, stop = t + 0.5;
  const v = new Voice(E, 'sfx', { verb: 0.35, pan: p.pan ?? R(-0.3, 0.3) });
  const c = v.noise('crackle', t, stop, R(1.2, 1.8)), ch = v.f('highpass', 2500, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, t, vel * 0.7, 0.07, 0.001);
  const o = v.osc('sine', R(2600, 4200), t, t + 0.3), og = v.g(0);
  o.connect(og); og.connect(v.out);
  perc(og.gain, t, vel * 0.04, 0.06, 0.001);
}
// Beam hit sizzle (armour burning)
function sizzle(E, t, p) {
  const vel = p.vel ?? 0.7, dur = p.dur ?? 1.3, stop = t + dur + 0.4;
  const v = new Voice(E, 'sfx', { verb: 0.35, pan: p.pan ?? 0 });
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 5500, 0.9), g = v.g(0);
  n.connect(bp); bp.connect(g); g.connect(v.out);
  perc(g.gain, t, vel * 0.18, dur / 3, 0.005);
  const c = v.noise('crackle', t, stop), ch = v.f('highpass', 2200, 0.7), cg = v.g(0);
  c.connect(ch); ch.connect(cg); cg.connect(v.out);
  perc(cg.gain, t, vel * 0.55, dur / 3.5, 0.005);
}

// Hydraulic / steam hiss (clamp release)
function steam(E, t, p) {
  const dur = p.dur ?? 1.2, vel = p.vel ?? 0.5, stop = t + dur + 0.5;
  const v = new Voice(E, 'sfx', { verb: 0.4, pan: p.pan ?? 0 });
  const n = v.noise('white', t, stop), hp = v.f('highpass', 2500, 0.7), bp = v.f('peaking', 6000, 1), g = v.g(0);
  bp.gain.value = 5;
  n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(v.out);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.3, t + 0.03); g.gain.setTargetAtTime(0, t + 0.1, dur / 3);
}

// Cockpit warning beep (short, urgent)
function beep(E, t, p) {
  const vel = p.vel ?? 0.4, d = p.dur ?? 0.08, f = p.f ?? 1760, stop = t + d + 0.1;
  const v = new Voice(E, 'sfx', { verb: 0.08, pan: p.pan ?? -0.1 });
  const o = v.osc('square', f, t, stop), lp = v.f('lowpass', 3500, 0.8), g = v.g(0);
  o.connect(lp); lp.connect(g); g.connect(v.out);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.12, t + 0.004);
  g.gain.setValueAtTime(vel * 0.12, t + d); g.gain.linearRampToValueAtTime(0, t + d + 0.01);
}
// Heavy breath (in → out) inside the helmet
function breath(E, t, p) {
  const vel = p.vel ?? 0.5, ti = p.inhale ?? 0.55, to = p.exhale ?? 0.75, stop = t + ti + to + 0.3;
  const v = new Voice(E, 'sfx', { verb: 0.05 });
  const n = v.noise('white', t, stop), bp = v.f('bandpass', 900, 0.9), lp = v.f('lowpass', 2600, 0.7), g = v.g(0);
  n.connect(bp); bp.connect(lp); lp.connect(g); g.connect(v.out);
  bp.frequency.setValueAtTime(1300, t); bp.frequency.linearRampToValueAtTime(800, t + ti + to);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.18, t + ti * 0.8); g.gain.linearRampToValueAtTime(vel * 0.05, t + ti);
  g.gain.linearRampToValueAtTime(vel * 0.3, t + ti + 0.12); g.gain.setTargetAtTime(0, t + ti + 0.2, to / 3);
  const gr = v.osc('sawtooth', 70, t + ti, stop), gb = v.f('bandpass', 450, 3), gg = v.g(0);   // throat rasp on the exhale
  gr.connect(gb); gb.connect(gg); gg.connect(v.out);
  perc(gg.gain, t + ti + 0.05, vel * 0.08, to / 3, 0.05);
}

export const INSTR = {
  // music
  strings, choir, brass, lead, stac, bass, sub, glass, harp, taiko, kick, snare, hat, cymbal, boom, braam, riser, revswell,
  // sfx
  hyperIn, hyperOut, klaxon, radio, ionCharge, ionFire, ionBeam, explosion, tracers, missile, flyby, eyes, clank,
  hangarLights, catapult, beamRifle, saberIgnite, saberHum, saberClash, saberRoar, slash, lanceCharge, lanceFire,
  tinnitus, groan, spaceAmb, hullRumble, hangarAmb, warp, wellHum, fireAmb, alarmMuffled, debrisAmb, flicker, dive,
  heartbeat, implosion, shockwave, mainFire, slowmo,
  // v2
  autocannon, railgun, battleBed, stinger, voiceLine, stem, smp,
  // v5
  growl, shieldHit, shieldStrain, shatter, glitch, blaster,
  // v6
  ionThud, warpSnap, warpSqueal, tear, engulf,
  // v7
  metalRing, freezeSting, crunch, sparkBurst, sizzle, steam,
  // v8 (first-person tear insert)
  beep, breath,
};
