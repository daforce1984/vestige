import { Renderer } from './renderer.js';
import { frame, findShot, DURATION, SHOTS, prepHalfBlasts } from './shots.js';
import { storyT, filmT, insertFilm, inSkip, TEAR_F0, TEAR_F1 } from './timemap.js';
import { DUEL_CAMS, enemyGripCheck } from './duel.js';
import { openGallery, galleryOpen, galleryKey } from './gallery.js';
import { DREAD_CHUNKS } from './dread_chunks.js';
import { prepWreck, prepWrecks } from './world.js';

const MS_KEEP = ['ms_root', 'pelvis', 'torso', 'head', 'backpack', 'arm_L_upper', 'arm_L_lower', 'hand_L', 'saber_hilt', 'arm_R_upper', 'arm_R_lower', 'hand_R', 'rifle', 'shield',
  'leg_L_upper', 'leg_L_lower', 'foot_L', 'leg_R_upper', 'leg_R_lower', 'foot_R'];
const MODELS = [
  { name: 'mothership', detail: 4.5, prepass: true, hullDetail: true, cold: { mat: 'engine', absX: 70 } },   // (the two small side boosters: no glowing disc — 2026-10-07)   // layered greebles: depth prepass keeps close-ups at 24 fps
  { name: 'ion_frigate', detail: 0.9 },
  { name: 'wreck_interior', detail: 0, url: 'assets/wreck_interior.glb' },
  // the fighters' wrecks: each craft cut into its pieces at load, in memory (renderer cellSplit), with our own interior inside
  { name: 'interceptor_cells', detail: 0, url: 'assets/light_fighter_game_lod.glb', texSet: 6, texBit: 1024, cells: { grid: [3, 2, 3], seed: 11, interior: 'assets/wreck_interior.glb' } },
  { name: 'enemy_fighter_cells', detail: 0, url: 'assets/spaceship_game.glb', texSet: 5, texBit: 256, cells: { grid: [3, 2, 3], seed: 13, interior: 'assets/wreck_interior.glb' } },   // a generic craft interior inside broken fighters (tools/make_wreck_interior.py)
  { name: 'ion_frigate_cells', detail: 0, url: 'assets/ion_frigate_lod.glb', cells: { grid: [4, 3, 10], seed: 17, interior: 'assets/ion_frigate_interior.glb', interiorAbs: true, fill: [[-37, 4, 6.0, -5.0, 5.6], [4, 24, 3.3, -3.8, 2.9]] } },   // (fill: a solid lump of wreckage in every piece — chunks, not hollow plates)   // (its own decks, rooms and gear: tools/make_ion_frigate_interior.py)   // (2026-10-07) its wreck: cut fine at load like the fighters (renderer cellSplit), flown by js/wreck.js
  { name: 'assault_frigate', detail: 0.8 },
  ...['interceptor', 'interceptor_b', 'interceptor_c'].map((name) => ({ name, detail: 0, url: 'assets/light_fighter_game.glb', texSet: 6, texBit: 1024 })),   // our fighters: assets/light_fighter.glb (user-supplied) via tools/build_rifles.py
  { name: 'enemy_frigate', detail: 0 },   // every enemy frigate: blender/ships_enemy_frigate_v16.py (our own, after the shape of 'Cargo Spaceship' by blaice)
  { name: 'enemy_dreadnought', detail: 0.6, scale: 1.65, url: 'assets/dreadnought_game.glb', texSet: 7, texBit: 4096 },
  { name: 'enemy_dreadnought_chunks', detail: 0.6, scale: 1.65, url: 'assets/dreadnought_chunks.glb', texSet: 7, texBit: 4096, keep: DREAD_CHUNKS.map((c) => c.name) },   // its wreck, pre-broken (tools/make_dread_chunks.py; flown by js/wreck.js)
  { name: 'enemy_dreadnought_lod', detail: 0.6, scale: 1.65, url: 'assets/dreadnought_game_lod.glb', texSet: 7, texBit: 4096 },   // far away (5.7k triangles)   // a little bigger than our flagship: 'Space Battleship Aquamarine' (Kai Xiang, CC BY 4.0) via tools/build_rifles.py
  ...['enemy_fighter', 'enemy_fighter_b', 'enemy_fighter_c'].map((name) => ({ name, detail: 0, url: 'assets/spaceship_game.glb', texSet: 5, texBit: 256, engines: [[0, 0.74, -4.89, 0.33]] })),   // every enemy fighter: assets/spaceship.glb (user-supplied) via tools/build_rifles.py
  { name: 'gundam', detail: 0, keep: MS_KEEP },
  { name: 'enemy_ms', detail: 0, keep: MS_KEEP, keepGeo: true },
  { name: 'hero_rifle', detail: 0, url: 'assets/rifle2_game.glb' },   // Sigma's rifle: assets/rifle2.glb (user-supplied) via tools/build_rifles.py
  { name: 'enemy_rifle', detail: 0, url: 'assets/rifle1_game.glb' },  // VANGUARD's rifle: assets/rifle1.glb (user-supplied), drawn on its rifle part
  { name: 'gravity_well', detail: 2.5, keep: ['ring', 'core', 'pylons'], resphere: ['core'] },   // (its core rebuilt as a smooth sphere)
  { name: 'hangar', detail: 0, metalize: true, prepass: true, texSet: 9, texBit: 1 << 16 },   // (prepass: its layered walls, catwalks and railings shaded once a pixel — 211 → 87 ms in scene 6)   // (texSet 9: its surface detail atlas, after Sigma's rifle — tools/make_hangar_atlas.py)
  { name: 'shield_drone', detail: 0.4 },   // VANGUARD's shield drone (blender/shield_drone.py, 2026-10-07), in the shield part's frame
  { name: 'mace', detail: 0 },
  { name: 'dock_rig', detail: 0.5, keep: ['frame', 'clampL', 'clampR', 'door', 'mouth'], hullDetail: true },
  { name: 'mech_hand', detail: 0, keep: ['palm', 'f0_1', 'f0_2', 'f0_3', 'f1_1', 'f1_2', 'f1_3', 'f2_1', 'f2_2', 'f2_3', 'f3_1', 'f3_2', 'f3_3', 'thumbR_1', 'thumbR_2', 'thumbL_1', 'thumbL_2'] },
  { name: 'mother_bay', detail: 0, sortAxis: [1, 0, 0], prepass: true },
  { name: 'bay_props', detail: 0.3, keep: ['crate0', 'crate1', 'container', 'barrel', 'tank', 'panel0', 'panel1', 'rib', 'cable', 'toolcart', 'seat', 'person0', 'person1', 'person2', 'person3'] },
  { name: 'moon', detail: 0, drawLast: true },
  { name: 'ion_frigate_lod', detail: 0 }, { name: 'assault_frigate_lod', detail: 0 }, ...['interceptor_lod', 'interceptor_b_lod', 'interceptor_c_lod'].map((name) => ({ name, detail: 0, url: 'assets/light_fighter_game_lod.glb', texSet: 6, texBit: 1024 })), ...['enemy_fighter_lod', 'enemy_fighter_b_lod', 'enemy_fighter_c_lod'].map((name) => ({ name, detail: 0, url: 'assets/spaceship_game.glb', texSet: 5, texBit: 256, engines: [[0, 0.74, -4.89, 0.33]] })), { name: 'enemy_frigate_lod', detail: 0 }, { name: 'ion_frigate_far', detail: 0 }, { name: 'assault_frigate_far', detail: 0 }, { name: 'enemy_frigate_far', detail: 0 },   // blender/make_lods.py (distance LOD; the light fighter's: 1.8k triangles)                                        // tools/make_moon.py
  { name: 'wound_rim', detail: 0 },                                   // tools/make_wound_rim.py
  { name: 'asteroids', detail: 0, lodK: 12, keep: ['ast0', 'ast1', 'ast2', 'ast3', 'ast4', 'ast5'] },   // tools/make_asteroids.py   (lodK 12: at 3× its size the swap to the 3k copy popped as the scene-95 camera drifted)
  { name: 'asteroids_lod', detail: 0, keep: ['ast0', 'ast1', 'ast2', 'ast3', 'ast4', 'ast5'] },   // (blender/decimate_glb.py 0.15: 3k triangles a rock)
  { name: 'debris', detail: 0.6, keep: ['rock0', 'rock1', 'rock2', 'rock3', 'hull0', 'hull1', 'hull2', 'hull3'] },
].map((m) => ({ ...m, url: m.url || `assets/${m.name}.glb` }));

// Subtitles come from the voice sheet (assets/voice/lines.json): English line + Korean translation.
const WHO = { NARRATOR: '', CMDR: 'FLEET COMMAND', SENSOR: 'SENSORS', PILOT: 'SIGMA', WING: 'STRIKE LEAD' };
let SUBS = [];
async function loadSubs() {
  try {
    const d = await (await fetch('assets/voice/lines.json')).json();
    SUBS = d.lines.filter((l) => !inSkip(l.t) && !(l.filmTime && TEAR_F1 - TEAR_F0 < 2)).map((l) => [l.filmTime ? insertFilm(l.t) : filmT(l.t), l.filmTime ? insertFilm(l.t) + (l.dur || 3) + 0.35 : Math.min(filmT(l.cut ?? 1e9), filmT(l.t) + (l.dur || 3) + 0.35), WHO[l.voice] ?? l.voice,
      l.text.replace(/\[[^\]]*\]\s*/g, '').trim(), l.ko || '', l.voice === 'NARRATOR']);
  } catch (e) { console.warn('subtitles unavailable', e); }
}
// typed HUD card after the cold open (film time): [start, text, chars/s, css class]
export const TYPE_LINES = [
  [14.2, '12 HOURS EARLIER', 22, 'l0'],
  [15.15, 'GALACTIC COORDINATE SYSTEM (IAU 1958)', 32, 'dim'],
  [16.55, 'l 327.41°   b −04.17°   d 26,412 ly', 30, ''],
  [17.95, 'KESTREL VEIL · OUTER MARCHES · SECTOR 09', 30, ''],
];
const TYPE_END = 21.2, TYPE_FADE = 0.8;
const typerEl = document.getElementById('typer');
let lastType = '';
function drawTyper(t) {
  if (!typerEl) return;
  if (t < TYPE_LINES[0][0] - 0.05 || t > TYPE_END + TYPE_FADE) { if (lastType) { typerEl.innerHTML = ''; typerEl.style.opacity = 0; lastType = ''; } return; }
  let html = '', caretAt = -1;
  TYPE_LINES.forEach(([t0, text, cps, cls], i) => {
    const n = Math.max(0, Math.min(text.length, Math.floor((t - t0) * cps)));
    if (t >= t0) caretAt = i;
    html += `<div class="${cls}">${text.slice(0, n)}${'$CARET' + i}</div>`;
  });
  const blink = Math.floor(t * 3) % 2 === 0;
  html = html.replace(/\$CARET(\d)/g, (_, i) => (+i === caretAt && blink ? '<span class="caret"></span>' : ''));
  if (html !== lastType) { typerEl.innerHTML = html; lastType = html; }
  typerEl.style.opacity = t > TYPE_END ? Math.max(0, 1 - (t - TYPE_END) / TYPE_FADE).toFixed(3) : 1;
}
const TITLES = [
  [371.8, 391.8, '<div class="title">VESTIGE</div><div class="tech"><b>ENGINE</b>HTML5 · raw WebGPU + WGSL (no engine / no framework) · deterministic 24 fps timeline · seek-safe choreography<br><b>RENDERING</b>4× MSAA HDR (rgba16float) · reversed-Z depth · depth prepass · shadow map · PBR metal/roughness · GPU instancing · procedural planet, atmosphere & starfield<br><b>SHADERS</b>procedural melt / fracture / crush deformation · molten torn edges · hex energy shields & containment fields · cross-billboard thrusters · hyperspace windows & stretch · gravity lensing<br><b>POST</b>bloom · depth of field · motion blur · anamorphic streaks · god rays · shader lens flare · radial blur · signal interference · filmic grade<br><b>ANIMATION</b>FK pose tracks · contact solver · damped-spring ragdoll & inertia · deterministic debris / shatter physics · spline cameras<br><b>ASSETS</b>Blender Python procedural ships & sets · CC0 ATLAS/09, RONIN/04 by Ramon Linares · Earth maps © Solar System Scope CC BY 4.0<br><b>MODELS</b>“Space Battleship Aquamarine” by Kai Xiang (CC BY 4.0, modified) · “Cargo Spaceship” by blaice (CC BY 4.0, modified) · Moon surface: NASA’s Scientific Visualization Studio CGI Moon Kit (LRO LROC / LOLA, public domain) · “Futuristic Sci-Fi Rifle” by Janis Zeps (CC BY 4.0, modified) · “NANITE SYSTEMS Assault Rifle” by Frostoise (CC BY-NC-SA 4.0, modified) · “Spaceship” by Jefferson Frenay (CC BY-NC-ND 4.0) · “Light Fighter Spaceship” by Kerem Kavalci (Sketchfab Standard) · “3D Mech Asset” by TryoutIndie.Dev (MIT) — all via Sketchfab / itch.io · licences: creativecommons.org/licenses/by/4.0, /by-nc-sa/4.0, /by-nc-nd/4.0 · sketchfab.com/licenses · a non-commercial fan work<br><b>AUDIO</b>Web Audio API mixing & synthesis · ElevenLabs v3 voices · MiniMax Music 3 via ComfyUI · SFX from Pixabay<br><b>MADE WITH</b>Claude Code (Claude Opus 5.5) · a fan tribute</div>'],
];

const qs = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const canvas = $('#c');
const R = new Renderer(canvas);
if (qs.get('scale')) R.renderScale = parseFloat(qs.get('scale'));
let score = null;
let stopAt = null;                                        // film time to stop at ("mech battle only" button)
let playing = false, frozen = null;
let clockStart = 0, clockOffset = 0;   // fallback clock when audio is unavailable

function now() {
  if (frozen !== null) return frozen;
  if (!playing) return clockOffset;
  if (score) return score.time;
  return clockOffset + (performance.now() - clockStart) / 1000;
}

async function play(from) {
  playing = true;
  if (typeof hideSceneTag === 'function') hideSceneTag();
  clockOffset = from; clockStart = performance.now();
  if (score) { try { score.start(from); } catch (e) { console.error(e); } }
}
function pause() {
  const t = now();
  playing = false; clockOffset = t;
  if (score) score.stop();
  showSceneTag();
}
// paused: which scene is this? (numbered in timeline order, with the shot's own code/name and the film time)
// every camera cut counts as a scene: a shot with its own cuts (the duel) contributes one scene per cut
const DUEL_SHOT = SHOTS.find((sh) => sh.name.includes('DUEL'));
const SCENE_ORDER = [...SHOTS.filter((sh) => sh !== DUEL_SHOT),
  ...(DUEL_SHOT ? DUEL_CAMS.filter((c) => c.t1 > DUEL_SHOT.t0 && c.t0 < DUEL_SHOT.t1).map((c) => ({ t0: Math.max(c.t0, DUEL_SHOT.t0), t1: Math.min(c.t1, DUEL_SHOT.t1), name: DUEL_SHOT.name + ' · ' + c.name, cam: c })) : []),
].sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
const sceneTag = document.createElement('div');
sceneTag.id = 'scenetag';
document.body.appendChild(sceneTag);
function sceneAt(st) {
  const sh = findShot(st);
  if (sh === DUEL_SHOT) { const c = SCENE_ORDER.find((x) => x.cam && st >= x.t0 && st < x.t1); if (c) return c; }
  return sh;
}
function showSceneTag() {
  const ft = now(), sc = sceneAt(storyT(ft)), i = SCENE_ORDER.indexOf(sc);
  const mm = Math.floor(ft / 60), ss = (ft % 60).toFixed(1).padStart(4, '0');
  sceneTag.innerHTML = `<b>SCENE ${i + 1}</b> / ${SCENE_ORDER.length}<span>${sc.name}</span><em>${mm}:${ss}  (story ${storyT(ft).toFixed(2)} s)</em>`;
  // GO TO SCENE (2026-10-07): while paused, pick any scene and jump straight to its first frame (still paused)
  const pick = document.createElement('select'); pick.className = 'goto'; pick.title = 'go to scene';
  SCENE_ORDER.forEach((x, k) => { const o = document.createElement('option'); o.value = k; o.textContent = `${k + 1}. ${x.name.replace(/^.*DUEL[^·]*· /, '')}`; if (k === i) o.selected = true; pick.appendChild(o); });
  pick.onchange = () => { const x = SCENE_ORDER[+pick.value]; if (x) { seek(filmT(x.t0) + 0.002); pick.blur(); } };
  pick.onkeydown = (ev) => ev.stopPropagation();   // (its own arrow keys / typing; not the film's)
  sceneTag.appendChild(pick);
  // the sounds used in this scene: ▶ auditions it, clicking the name copies it
  const f0 = filmT(sc.t0), f1 = filmT(sc.t1), list = score && score.soundsIn ? score.soundsIn(f0, f1) : [];
  if (list.length) {
    const box = document.createElement('div'); box.className = 'snd';
    box.innerHTML = `<i>SOUNDS (${list.length}) — ▶ play · click a name to copy</i>`;
    for (const it of list) {
      const row = document.createElement('div'); row.className = 'row';
      const pl = document.createElement('button'); pl.textContent = '▶'; pl.title = 'play ' + it.file;
      pl.onclick = (ev) => { ev.stopPropagation(); score.preview(it); };
      const nm = document.createElement('code'); nm.textContent = it.name; nm.title = it.file + ' — click to copy';
      nm.onclick = (ev) => { ev.stopPropagation(); copyText(it.name).then(() => { nm.classList.add('ok'); setTimeout(() => nm.classList.remove('ok'), 700); }); };
      const meta = document.createElement('small'); meta.textContent = `${it.kind}${it.n > 1 ? ' ×' + it.n : ''} · +${Math.max(0, it.t - f0).toFixed(2)}s`;
      row.append(pl, nm, meta); box.appendChild(row);
    }
    sceneTag.appendChild(box);
  }
  sceneTag.classList.add('on');
}
function copyText(txt) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).catch(() => fallbackCopy(txt));
  return Promise.resolve(fallbackCopy(txt));
}
function fallbackCopy(txt) { const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { /* ok */ } ta.remove(); }
// ←/→: one scene (camera cut) at a time
function stepScene(dir) {
  const st = storyT(now());
  const starts = [...new Set(SCENE_ORDER.map((x) => x.t0))].sort((a, b) => a - b);
  const cur = [...starts].reverse().find((x) => x <= st + 0.001) ?? starts[0];
  const to = dir > 0 ? starts.find((x) => x > st + 0.001)
    : st - cur > 0.3 ? cur : [...starts].reverse().find((x) => x < cur - 0.0005);   // ←: back to this cut's start, again → previous cut
  if (to === undefined) return;
  seek(filmT(to) + 0.002);
  if (!playing) showSceneTag();   // (2026-10-07: while it plays, no info window — it stayed up)
}
function hideSceneTag() { sceneTag.classList.remove('on'); }
function seek(t) {
  t = Math.max(0, Math.min(DURATION, t));
  if (playing) { if (score) score.stop(); play(t); } else { clockOffset = t; showSceneTag(); }
}

// --------------------------------------------------------------- overlay text
const subEl = $('#sub'), titleEl = $('#title');
let lastSub = -1, lastTitle = -1;
function updateText(film) {
  const t = storyT(film);
  let si = -1;
  for (let i = 0; i < SUBS.length; i++) if (film >= SUBS[i][0] && film < SUBS[i][1]) { si = i; break; }
  if (si !== lastSub) {
    lastSub = si;
    if (si >= 0) {
      const [, , who, en, ko, narr] = SUBS[si];
      subEl.className = narr ? 'on narr' : 'on';
      subEl.innerHTML = `${who ? `<span class="who">${who}</span>` : ''}<span class="en">${en}</span><span class="ko">${ko}</span>`;
    }
    else subEl.className = '';
  }
  drawTyper(t);
  let ti = -1;
  for (let i = 0; i < TITLES.length; i++) if (t >= TITLES[i][0] && t < TITLES[i][1]) { ti = i; break; }
  if (ti !== lastTitle) { lastTitle = ti; if (ti >= 0) titleEl.innerHTML = TITLES[ti][2]; }
  if (ti >= 0) {
    const [a, b] = TITLES[ti];
    const fd = Math.min(1.5, (b - a) / 3);
    titleEl.style.opacity = Math.min(1, (t - a) / fd, (b - t) / fd).toFixed(3);
  } else titleEl.style.opacity = 0;
}

// --------------------------------------------------------------- loop
let fpsAcc = 0, fpsN = 0, fps = 0, lastT = performance.now(), cpuMs = 0, gpuMs = 0;   // (cpuMs: the frame's JS; gpuMs: until the GPU has finished it)
const hud = $('#hud');
const debug = qs.has('debug');
// 24 fps playback: the film clock is quantized to 1/24 s frames; each frame averages `shutter`
// sub-frames spread over a 180-degree shutter (half the frame interval) for film-style motion blur.
const FPS = 24;
// default: 1 sample + reprojection motion blur (no ghost copies). ?shutter=N forces sub-frame accumulation.
let shutter = qs.has('shutter') ? Math.max(1, parseInt(qs.get('shutter'))) : 1;
const autoShutter = false;
let lastShot = null, lastFi = -1;
let lastFrame = -1, gpuPending = 0, slowFrames = 0, fastFrames = 0;
function renderFilmFrame(fi) {
  const t0 = fi / FPS;
  // all shutter samples stay inside the shot that owns this frame (never blend across a cut)
  const sh = findShot(storyT(t0));
  const continuous = sh === lastShot && fi === lastFi + 1;   // blur only between consecutive frames of one shot
  lastShot = sh; lastFi = fi;
  for (let k = 0; k < shutter; k++) {
    let tt = t0 + (shutter > 1 ? (k / (shutter - 1) - 0.5) * (0.5 / FPS) : 0);

    const ctx = frame(R, Math.max(0, tt));
    ctx.post.motionBlur = shutter === 1 && continuous ? (ctx.post.motionBlur ?? 1) : 0;
    R.render(ctx.cam, ctx.env, ctx.post, k, shutter);
  }
}
function loop() {
  const tRaw = now();
  const fi = Math.floor(tRaw * FPS + 1e-6);
  if (fi !== lastFrame && gpuPending < 2) {   // (up to 2 frames in flight: the submit→done round trip no longer caps the frame rate)
    lastFrame = fi;
    const t = fi / FPS;
    const w0 = performance.now();
    try {
      renderFilmFrame(fi);
      cpuMs = cpuMs * 0.9 + (performance.now() - w0) * 0.1;
    } catch (e) {
      if (!loop.errs) loop.errs = 0;
      if (loop.errs++ < 5) console.error('frame error at t=' + t.toFixed(2), e);
    }
    // measure real GPU completion to adapt the shutter sample count (keeps a steady 24 fps)
    gpuPending++;
    R.device.queue.onSubmittedWorkDone().then(() => {
      gpuPending--;
      const ms = performance.now() - w0;
      gpuMs = gpuMs * 0.9 + ms * 0.1;
      if (autoShutter) {
        if (ms > 36) { if (++slowFrames > 6 && shutter > 1) { shutter--; slowFrames = 0; } } else slowFrames = 0;
        if (ms < 18) { if (++fastFrames > 96 && shutter < 4) { shutter++; fastFrames = 0; } } else fastFrames = 0;
      }
    });
    updateText(t);
    const n = performance.now();
    fpsAcc += n - lastT; fpsN++; lastT = n;
    if (fpsAcc > 1000) { fps = (1000 * fpsN) / fpsAcc; fpsAcc = 0; fpsN = 0; }
    const perf = `FPS ${fps.toFixed(1)} · frame ${gpuMs.toFixed(1)} ms (JS ${cpuMs.toFixed(1)} ms) · max ${(1000 / Math.max(gpuMs, 1)).toFixed(0)} fps`;
    hud.textContent = debug ? `t=${t.toFixed(2)} f=${fi}  ${findShot(storyT(t)).name}  ${perf} shutter=${shutter}  draws=${R.stats.draws} inst=${R.stats.inst} spr=${R.stats.sprites}` : perf;   // (always on: the frame rate and what a frame costs)
    $('#bar').style.width = `${(100 * t) / DURATION}%`;
  }
  if (playing && stopAt !== null && tRaw >= stopAt) {         // "mech battle only": stop after the duel, back to the menu
    stopAt = null; pause(); clockOffset = 0; $('#start').classList.remove('hidden');   // ▶ 재생 then plays the film from the top
  }
  if (playing && tRaw >= DURATION + 1) { pause(); clockOffset = DURATION; $('#start').classList.remove('hidden'); $('#start .go').textContent = '↻ 다시 보기'; }
  if (!R.lost) requestAnimationFrame(loop);
}


// --------------------------------------------------------------- boot
async function boot() {
  const status = $('#status');
  try {
    await R.init();
    status.textContent = '모델 로딩…';
    await Promise.all([R.loadModels(MODELS), loadSubs(), R.loadModelTextures(['assets/tex/gundam_albedo.png', 'assets/tex/gundam_orm.png', 'assets/tex/enemy_ms_albedo.png', 'assets/tex/enemy_ms_orm.png', 'assets/tex/rifle2_game_albedo.png', 'assets/tex/rifle2_game_orm.png', 'assets/tex/rifle1_game_albedo.png', 'assets/tex/rifle1_game_orm.png', 'assets/tex/spaceship_game_albedo.png', 'assets/tex/spaceship_game_orm.png', 'assets/tex/light_fighter_game_albedo.png', 'assets/tex/light_fighter_game_orm.png', 'assets/tex/dreadnought_game_albedo.png', 'assets/tex/dreadnought_game_orm.png', 'assets/tex/cargo_game_albedo.png', 'assets/tex/cargo_game_orm.png', 'assets/tex/hangar_albedo.png', 'assets/tex/hangar_orm.png']), R.loadPlanet('assets/planet/earth_day_night.webp', 'assets/planet/earth_clouds.webp'), R.loadMoonData('assets/tex/moon_lroc.png')]);
    prepWreck();   // the dreadnought's wreck flight, baked now (~0.6 s) rather than as a hitch when it blows
    prepWrecks(R);   // every frigate / fighter wreck's flight, too (in the background, one per idle slice)
    setTimeout(() => prepHalfBlasts(R), 50);   // VANGUARD's two halves blowing apart (scene 71), baked too
    {
      // our flagship after the Buzz Hound corvette: its windows, lights and engines glow teal-green
      const mm = R.models.mothership, T = { window: [0.35, 1.0, 0.75], amber: [0.3, 1.0, 0.7], blue_light: [0.25, 1.0, 0.8], engine: [0.55, 1.0, 0.9] };
      if (mm) for (const m of mm.materials) if (T[m.name]) m.emissive = T[m.name];
    }
    const tris = R.modelList.reduce((s, m) => s + m.tris, 0);
    status.textContent = `준비 완료 · ${R.modelList.length} models · ${(tris / 1000).toFixed(0)}k tris`;
    $('#start .go').disabled = false; $('#duelBtn').disabled = false;
  } catch (e) {
    console.error(e);
    status.textContent = '오류: ' + e.message;
    return;
  }
  if (qs.has('t')) clockOffset = parseFloat(qs.get('t'));
  if (qs.has('freeze')) frozen = clockOffset;
  requestAnimationFrame(loop);
  window.FILM = {
    R, get t() { return now(); }, get score() { return score; },
    freeze(t) { frozen = t; lastFrame = -1; return t; },
    // profiling: render the frame at film time `film` n times; average JS ms, ms until the GPU finished, and the counts
    async bench(film, n = 8, mod = null) {
      const js = [], tot = [];
      for (let i = 0; i < n + 2; i++) {
        await R.device.queue.onSubmittedWorkDone();
        const w0 = performance.now(), ctx = frame(R, film); ctx.post.motionBlur = 0; if (mod) mod(ctx); R.render(ctx.cam, ctx.env, ctx.post, 0, 1);
        const w1 = performance.now(); await R.device.queue.onSubmittedWorkDone(); const w2 = performance.now();
        if (i >= 2) { js.push(w1 - w0); tot.push(w2 - w0); }
      }
      const med = (a) => +a.sort((x, y) => x - y)[a.length >> 1].toFixed(1);   // (medians: the GPU is shared, single frames spike)
      return { film, js: med(js), total: med(tot), draws: R.stats.draws, inst: R.stats.inst, sprites: R.stats.sprites };
    }, unfreeze() { frozen = null; }, get shutter() { return shutter; }, set shutter(v) { shutter = v; lastFrame = -1; },
    seek, pause, play: () => play(now()), shots: () => findShot(now()).name,
    gripCheck: enemyGripCheck,   // VANGUARD's fist on its rifle's grip (duel.js grip helpers): worst error while held + at the grab
    stats: () => ({ ...R.stats, fps, w: R.width, h: R.height, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }),
  };
}

async function startFilm(from, until = null) {
  $('#start').classList.add('hidden');
  if (!score) {
    try {
      const mod = await import('./audio.js');
      score = new mod.default();
      await score.init();
    } catch (e) { console.warn('audio unavailable:', e); score = null; }
  }
  frozen = null;
  stopAt = until;
  if (playing) pause();
  play(from);
}
$('#start .go').addEventListener('click', () => startFilm(clockOffset >= DURATION ? 0 : clockOffset));
// the mech battle on its own: from the swatted bolt (scene 30) through the duel to the last blast
const DUEL_FROM = 150.0, DUEL_UNTIL = 195.2;   // story   // (2026-10-07) from Sigma getting ready to launch (scene 26, S11a hangar lights) — was 165.9, the bolt he swats away on the way in
$('#duelBtn').addEventListener('click', () => startFilm(filmT(DUEL_FROM), filmT(DUEL_UNTIL)));
$('#refBtn').addEventListener('click', openGallery);   // the reference images (js/gallery.js)
document.addEventListener('keydown', (e) => {
  if (galleryOpen()) { galleryKey(e); return; }   // (the reference gallery has the keyboard while open)
  if (e.target && e.target.tagName === 'SELECT') return;   // (the scene picker has the keyboard)
  if (e.code === 'Space') { e.preventDefault(); if (!$('#start').classList.contains('hidden')) return; if (playing) pause(); else play(now()); }   // (not from the main menu: the film starts from its buttons)
  else if (e.code === 'Escape') { if (playing) pause(); }
  else if (e.code === 'ArrowRight') { if (e.shiftKey) seek(now() + 5); else stepScene(1); }
  else if (e.code === 'ArrowLeft') { if (e.shiftKey) seek(now() - 5); else stepScene(-1); }
  else if (e.code === 'KeyF') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (e.code === 'KeyH') document.body.classList.toggle('nohud');
});
$('#progress').addEventListener('click', (e) => seek((e.offsetX / e.currentTarget.clientWidth) * DURATION));
window.addEventListener('pagehide', () => { score?.stop(); R.dispose(); });
boot();

// cursor: always visible while paused; while playing it shows when the mouse moves and hides again after 5 s still
let lastMouse = -1e9;
window.addEventListener('mousemove', () => { lastMouse = performance.now(); syncCursor(); }, { passive: true });
function syncCursor() {
  const hide = playing && performance.now() - lastMouse > 5000;
  if (document.body.classList.contains('idle') !== hide) document.body.classList.toggle('idle', hide);
}
setInterval(syncCursor, 100);
// Esc in fullscreen is taken by the browser to leave fullscreen: treat that as "pause" too
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && playing) pause(); });
