import { Renderer } from './renderer.js';
import { frame, findShot, DURATION, SHOTS } from './shots.js';
import { storyT, filmT } from './timemap.js';
import { DUEL_CAMS, bulletTime } from './duel.js';

const MS_KEEP = ['ms_root', 'pelvis', 'torso', 'head', 'backpack', 'arm_L_upper', 'arm_L_lower', 'hand_L', 'saber_hilt', 'arm_R_upper', 'arm_R_lower', 'hand_R', 'rifle', 'shield',
  'leg_L_upper', 'leg_L_lower', 'foot_L', 'leg_R_upper', 'leg_R_lower', 'foot_R'];
const MODELS = [
  { name: 'mothership', detail: 4.5, prepass: true, hullDetail: true },   // layered greebles: depth prepass keeps close-ups at 24 fps
  { name: 'ion_frigate', detail: 0.9 },
  { name: 'assault_frigate', detail: 0.8 },
  { name: 'interceptor', detail: 0 }, { name: 'interceptor_b', detail: 0 }, { name: 'interceptor_c', detail: 0 },
  { name: 'enemy_frigate', detail: 0.9 },
  { name: 'enemy_dreadnought', detail: 2.4, scale: 1.65 },   // a little bigger than our flagship
  { name: 'enemy_fighter', detail: 0 }, { name: 'enemy_fighter_b', detail: 0 }, { name: 'enemy_fighter_c', detail: 0 },
  { name: 'gundam', detail: 0, keep: MS_KEEP },
  { name: 'enemy_ms', detail: 0, keep: MS_KEEP },
  { name: 'gravity_well', detail: 2.5, keep: ['ring', 'core', 'pylons'] },
  { name: 'hangar', detail: 0, metalize: true },
  { name: 'mace', detail: 0 },
  { name: 'dock_rig', detail: 0.5, keep: ['frame', 'clampL', 'clampR', 'door', 'mouth'], hullDetail: true },
  { name: 'mech_hand', detail: 0, keep: ['palm', 'f0_1', 'f0_2', 'f0_3', 'f1_1', 'f1_2', 'f1_3', 'f2_1', 'f2_2', 'f2_3', 'f3_1', 'f3_2', 'f3_3', 'thumbR_1', 'thumbR_2', 'thumbL_1', 'thumbL_2'] },
  { name: 'mother_bay', detail: 0, sortAxis: [1, 0, 0], prepass: true },
  { name: 'bay_props', detail: 0.3, keep: ['crate0', 'crate1', 'container', 'barrel', 'tank', 'panel0', 'panel1', 'rib', 'cable', 'toolcart', 'seat', 'person0', 'person1', 'person2', 'person3'] },
  { name: 'dread_lance', detail: 0, scale: 1.65 },                     // tools/make_dread_lance.py (same ×1.65 as the dreadnought)
  { name: 'moon', detail: 0 },
  { name: 'ion_frigate_lod', detail: 0 }, { name: 'assault_frigate_lod', detail: 0 }, { name: 'interceptor_lod', detail: 0 }, { name: 'interceptor_b_lod', detail: 0 }, { name: 'interceptor_c_lod', detail: 0 }, { name: 'enemy_fighter_lod', detail: 0 }, { name: 'enemy_fighter_b_lod', detail: 0 }, { name: 'enemy_fighter_c_lod', detail: 0 }, { name: 'enemy_frigate_lod', detail: 0 },   // blender/make_lods.py (distance LOD)                                        // tools/make_moon.py
  { name: 'wound_rim', detail: 0 },                                   // tools/make_wound_rim.py
  { name: 'asteroids', detail: 0, keep: ['ast0', 'ast1', 'ast2', 'ast3', 'ast4', 'ast5'] },   // tools/make_asteroids.py
  { name: 'debris', detail: 0.6, keep: ['rock0', 'rock1', 'rock2', 'rock3', 'hull0', 'hull1', 'hull2', 'hull3'] },
].map((m) => ({ ...m, url: `assets/${m.name}.glb` }));

// Subtitles come from the voice sheet (assets/voice/lines.json): English line + Korean translation.
const WHO = { NARRATOR: '', CMDR: 'FLEET COMMAND', SENSOR: 'SENSORS', PILOT: 'SIGMA', WING: 'STRIKE LEAD' };
let SUBS = [];
async function loadSubs() {
  try {
    const d = await (await fetch('assets/voice/lines.json')).json();
    SUBS = d.lines.map((l) => [l.filmTime ? l.t : filmT(l.t), l.filmTime ? l.t + (l.dur || 3) + 0.35 : Math.min(filmT(l.cut ?? 1e9), filmT(l.t) + (l.dur || 3) + 0.35), WHO[l.voice] ?? l.voice,
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
  [371.8, 391.8, '<div class="title">VESTIGE</div><div class="tech"><b>ENGINE</b>HTML5 · raw WebGPU + WGSL (no engine / no framework) · deterministic 24 fps timeline · seek-safe choreography<br><b>RENDERING</b>4× MSAA HDR (rgba16float) · reversed-Z depth · depth prepass · shadow map · PBR metal/roughness · GPU instancing · procedural planet, atmosphere & starfield<br><b>SHADERS</b>procedural melt / fracture / crush deformation · molten torn edges · hex energy shields & containment fields · cross-billboard thrusters · hyperspace windows & stretch · gravity lensing<br><b>POST</b>bloom · depth of field · motion blur · anamorphic streaks · god rays · shader lens flare · radial blur · signal interference · filmic grade<br><b>ANIMATION</b>FK pose tracks · contact solver · damped-spring ragdoll & inertia · deterministic debris / shatter physics · spline cameras<br><b>ASSETS</b>Blender Python procedural ships & sets · CC0 ATLAS/09, RONIN/04 by Ramon Linares · Earth maps © Solar System Scope CC BY 4.0<br><b>AUDIO</b>Web Audio API mixing & synthesis · ElevenLabs v3 voices · MiniMax Music 3 via ComfyUI · SFX from Pixabay<br><b>MADE WITH</b>Claude Code (Claude Opus 5.5) · a fan tribute</div>'],
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
  const ft = now(), sc = sceneAt(bulletTime(storyT(ft))), i = SCENE_ORDER.indexOf(sc);
  const mm = Math.floor(ft / 60), ss = (ft % 60).toFixed(1).padStart(4, '0');
  sceneTag.innerHTML = `<b>SCENE ${i + 1}</b> / ${SCENE_ORDER.length}<span>${sc.name}</span><em>${mm}:${ss}  (story ${storyT(ft).toFixed(2)} s)</em>`;
  sceneTag.classList.add('on');
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
let fpsAcc = 0, fpsN = 0, fps = 0, lastT = performance.now();
const hud = $('#hud');
const debug = qs.has('debug');
// 24 fps playback: the film clock is quantized to 1/24 s frames; each frame averages `shutter`
// sub-frames spread over a 180-degree shutter (half the frame interval) for film-style motion blur.
const FPS = 24;
// default: 1 sample + reprojection motion blur (no ghost copies). ?shutter=N forces sub-frame accumulation.
let shutter = qs.has('shutter') ? Math.max(1, parseInt(qs.get('shutter'))) : 1;
const autoShutter = false;
let lastShot = null, lastFi = -1;
let lastFrame = -1, gpuBusy = false, slowFrames = 0, fastFrames = 0;
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
  if (fi !== lastFrame && !gpuBusy) {
    lastFrame = fi;
    const t = fi / FPS;
    const w0 = performance.now();
    try {
      renderFilmFrame(fi);
    } catch (e) {
      if (!loop.errs) loop.errs = 0;
      if (loop.errs++ < 5) console.error('frame error at t=' + t.toFixed(2), e);
    }
    // measure real GPU completion to adapt the shutter sample count (keeps a steady 24 fps)
    gpuBusy = true;
    R.device.queue.onSubmittedWorkDone().then(() => {
      gpuBusy = false;
      const ms = performance.now() - w0;
      if (autoShutter) {
        if (ms > 36) { if (++slowFrames > 6 && shutter > 1) { shutter--; slowFrames = 0; } } else slowFrames = 0;
        if (ms < 18) { if (++fastFrames > 96 && shutter < 4) { shutter++; fastFrames = 0; } } else fastFrames = 0;
      }
    });
    updateText(t);
    const n = performance.now();
    fpsAcc += n - lastT; fpsN++; lastT = n;
    if (fpsAcc > 1000) { fps = (1000 * fpsN) / fpsAcc; fpsAcc = 0; fpsN = 0; }
    if (debug) hud.textContent = `t=${t.toFixed(2)} f=${fi}  ${findShot(storyT(t)).name}  fps=${fps.toFixed(1)} shutter=${shutter}  draws=${R.stats.draws} inst=${R.stats.inst} spr=${R.stats.sprites}`;
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
    await Promise.all([R.loadModels(MODELS), loadSubs(), R.loadModelTextures(['assets/tex/gundam_albedo.png', 'assets/tex/gundam_orm.png', 'assets/tex/enemy_ms_albedo.png', 'assets/tex/enemy_ms_orm.png']), R.loadPlanet('assets/planet/earth_day_night.webp', 'assets/planet/earth_clouds.webp')]);
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
    freeze(t) { frozen = t; lastFrame = -1; return t; }, unfreeze() { frozen = null; }, get shutter() { return shutter; }, set shutter(v) { shutter = v; lastFrame = -1; },
    seek, pause, play: () => play(now()), shots: () => findShot(now()).name,
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
// the mech battle (scene 32, the Sigma vs RONIN duel) on its own: from just before the first exchange to the last blast
const DUEL_FROM = 169.8, DUEL_UNTIL = 195.2;
$('#duelBtn').addEventListener('click', () => startFilm(DUEL_FROM, DUEL_UNTIL));
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); if (playing) pause(); else play(now()); }
  else if (e.code === 'Escape') { if (playing) pause(); }
  else if (e.code === 'ArrowRight') seek(now() + 5);
  else if (e.code === 'ArrowLeft') seek(now() - 5);
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
