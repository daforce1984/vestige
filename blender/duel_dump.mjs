// Dump duel FK states for blender/duel_preview.py.  node blender/duel_dump.mjs out.json 186.0 188.9:cam ...  (":cam" = duelCamera view, ":other" = opposite side)
// usage: node dump.mjs out.json t1 t2 ...   (a time may be suffixed with :cam to use duelCamera, default side 'choreo' cam)
import * as D from '../js/duel.js';
import { writeFileSync } from 'fs';
const [out, ...ts] = process.argv.slice(2);
const frames = [];
const PARTS = ['ms_root', ...D.PARTS.filter((p) => p !== '_body')];
for (const spec of ts) {
  const [tt, mode] = spec.split(':'); const t = +tt;
  const h = D.duelHero(t), e1 = D.duelEnemy1(t), e2 = D.duelEnemy2(t);
  const mechs = [];
  const add = (s, model, tag) => {
    if (!s || !s.vis) return;
    const fk = D.duelFK(s, model);
    const mats = {}; for (const p of PARTS) mats[p] = Array.from(fk[p]);
    if (fk.rifle) mats.rifle = Array.from(fk.rifle);
    mechs.push({ model, tag, mats, saber: s.saber > 0.02 ? [fk.saber[0], fk.saber[1]] : null, pos: s.pos });
  };
  add(h, 'gundam', 'hero');
  const shot = D.DUEL_SHOTS.find((q) => t >= q.t - 0.001 && t < q.t + 0.25);
  const mz = D.duelMuzzle(t);
  var bolt = shot ? [shot.from, shot.from.map((x, i) => x + shot.dir[i] * Math.min(70, Math.hypot(...shot.to.map((y, j) => y - shot.from[j])) + 15))] : null; add(e1, 'enemy_ms', 'e1'); add(e2, 'enemy_ms', 'e2');
  let cam;
  const foe = e1 && e1.vis ? e1 : e2 && e2.vis ? e2 : null;
  if (mode === 'aim') {   // close 3/4 view on the hero's rifle arm, from its right-front
    const f = h.fwd.map((x) => x / Math.hypot(...h.fwd)), r = [-f[2], 0, f[0]];
    const fkH = D.duelFK(h, 'gundam'), hand = D.partPoint(fkH, 'hand_R');
    cam = { pos: [hand[0] + r[0] * 22 + f[0] * 16, hand[1] + 5, hand[2] + r[2] * 22 + f[2] * 16], target: [hand[0] + f[0] * 8, hand[1], hand[2] + f[2] * 8], fov: 42, roll: 0, name: 'aim' };
  } else if (mode === 'cam') { const c = D.duelCamera(t); cam = { pos: c.pos, target: c.target, fov: c.fov, roll: c.roll, name: c.name }; }
  else {
    const a = h.pos, b = foe ? foe.pos : [h.pos[0], h.pos[1], h.pos[2] - 20];
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 3, (a[2] + b[2]) / 2];
    let d = [b[0] - a[0], 0, b[2] - a[2]]; const l = Math.hypot(...d) || 1; d = d.map((x) => x / l);
    const sd = mode === 'other' ? -1 : 1;
    const span = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const dist = Math.max(42, span * 1.25);
    cam = { pos: [m[0] + d[2] * dist * sd, m[1] + 6, m[2] - d[0] * dist * sd], target: m, fov: 40, roll: 0, name: 'choreo' };
  }
  frames.push({ t, mode: mode || 'side', mechs, cam, bolt });
}
writeFileSync(out, JSON.stringify(frames));
console.log('frames', frames.length);
