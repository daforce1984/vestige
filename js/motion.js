// Motion clips: the source mechs' own animations (CC0, Ramon Linares — ATLAS / VANGUARD / AETHER / SERAPH), extracted
// by tools/extract_motion.py as per-part pose quaternions at 24 fps (engine convention: part rotation in its contract
// parent's frame; the parts are unrotated at rest). Sampled with slerp and returned as engine Euler poses.
import { M, Q, clamp } from './math.js';
import CLIPS from './motion_clips.js';

const euler3 = (m) => [Math.asin(clamp(-m[9], -1, 1)), Math.atan2(m[8], m[10]), Math.atan2(m[1], m[5])];   // 4×4 col-major → [x, y, z] (Ry·Rx·Rz)
const _m = M.new(), _q = [0, 0, 0, 1];
function slerpN(a, b, u, o) {   // nlerp (frames are 1/24 s apart)
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3], s = d < 0 ? -1 : 1;
  for (let i = 0; i < 4; i++) o[i] = a[i] + (s * b[i] - a[i]) * u;
  const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1; for (let i = 0; i < 4; i++) o[i] /= l;
  return o;
}
export const clipDur = (name) => CLIPS[name].dur;
/** pose {part:[x,y,z]} of clip `name` at clip time ct (s), clamped to the clip */
export function clipPose(name, ct, out = {}) {
  const c = CLIPS[name]; if (!c) throw new Error('no clip ' + name);
  const x = clamp(ct * c.fps, 0, c.n - 1), i = Math.min(c.n - 2, Math.floor(x)), u = x - i;
  for (const p in c.q) {
    const a = c.q[p][i], b = c.q[p][i + 1];
    slerpN(a, b, u, _q);
    M.fromTRS(_m, [0, 0, 0], _q, 1);
    out[p] = euler3(_m);
  }
  return out;
}
/** pelvis displacement (contract units, model space) of the clip at ct */
export function clipRoot(name, ct) {
  const c = CLIPS[name], x = clamp(ct * c.fps, 0, c.n - 1), i = Math.min(c.n - 2, Math.floor(x)), u = x - i;
  const a = c.root[i], b = c.root[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
export const CLIP_NAMES = Object.keys(CLIPS);
