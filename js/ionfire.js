// Shared ship-to-ship ion fire schedule (deterministic, pure). Used by the renderer (world.js) and the score (audio.js)
// so every visible bolt has its own sound. Before the well collapses only the enemy fires (denser); afterwards both sides, about one bolt per second.
// shot: { t, side: 'H'|'E' (who fires), shooter, target, burst (1..2), near (0..1 loudness hint) }
function h(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export const ION_WINDOWS = [[104.5, 199.5], [286.5, 311.5]];   // silence on the lines while the lance charges
export const ION_SHOTS = [];
let k = 0;
for (const [a, b] of ION_WINDOWS) {
  for (let t = a; t < b; k++) {
    // before the well dies (window 1) the gravity well drains every Hiigaran ion coil: ONLY the enemy fires (a massacre);
    // after it collapses (window 2) both lines trade fire again
    const side = a < 280 ? 'E' : (h(k * 3.7) < 0.55 ? 'H' : 'E');
    ION_SHOTS.push({ t: +t.toFixed(3), side, shooter: Math.floor(h(k * 5.1) * (side === 'H' ? 18 : 22)), target: Math.floor(h(k * 7.3) * (side === 'H' ? 22 : 18)),
      burst: h(k * 9.9) < 0.3 ? 2 : 1, near: +(0.25 + h(k * 11.3) * 0.75).toFixed(2) });
    t += a < 280 ? 0.5 + h(k * 13.7) * 0.6 : 0.75 + h(k * 13.7) * 0.9;
  }
}
export const ION_BOLT_SPEED = 1300;   // world units per second
