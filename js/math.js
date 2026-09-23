// Minimal column-major math for the film engine. All matrices are Float32Array(16).
// Functions write into an `out` argument so the frame loop allocates nothing.

export const V = {
  new: (x = 0, y = 0, z = 0) => [x, y, z],
  set: (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; },
  copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
  add: (o, a, b) => { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  sub: (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  scale: (o, a, s) => { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  madd: (o, a, b, s) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  lerp: (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (o, a, b) => {
    const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  },
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm: (o, a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o; },
};

export const M = {
  new: () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity: (o) => { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  copy: (o, a) => { o.set(a); return o; },
  mul: (o, a, b) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  },
  // TRS from translation, quaternion [x,y,z,w], scale (number or [x,y,z])
  fromTRS: (o, t, q, s) => {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const sx = typeof s === 'number' ? s : s[0], sy = typeof s === 'number' ? s : s[1], sz = typeof s === 'number' ? s : s[2];
    const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2,
      wx = w * x2, wy = w * y2, wz = w * z2;
    o[0] = (1 - (yy + zz)) * sx; o[1] = (xy + wz) * sx; o[2] = (xz - wy) * sx; o[3] = 0;
    o[4] = (xy - wz) * sy; o[5] = (1 - (xx + zz)) * sy; o[6] = (yz + wx) * sy; o[7] = 0;
    o[8] = (xz + wy) * sz; o[9] = (yz - wx) * sz; o[10] = (1 - (xx + yy)) * sz; o[11] = 0;
    o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1;
    return o;
  },
  perspective: (o, fovy, aspect, near, far) => {
    // WebGPU clip z in [0,1], reversed-Z (near->1, far->0) for precision at huge scales
    const f = 1 / Math.tan(fovy / 2);
    o.fill(0);
    o[0] = f / aspect; o[5] = f;
    o[10] = near / (far - near); o[11] = -1;
    o[14] = far * near / (far - near);
    return o;
  },
  ortho: (o, l, r, b, t, n, f) => {
    o.fill(0);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -1 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -n / (f - n); o[15] = 1;
    return o;
  },
  lookAt: (o, eye, target, up) => {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    o[15] = 1;
    return o;
  },
  invert: (o, a) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return o;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  transformPoint: (o, m, p) => {
    const x = p[0], y = p[1], z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return o;
  },
  transformDir: (o, m, p) => {
    const x = p[0], y = p[1], z = p[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z;
    o[1] = m[1] * x + m[5] * y + m[9] * z;
    o[2] = m[2] * x + m[6] * y + m[10] * z;
    return o;
  },
};

export const Q = {
  new: () => [0, 0, 0, 1],
  // intrinsic yaw(Y) * pitch(X) * roll(Z)
  fromEuler: (o, x, y, z) => {
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    // q = qy * qx * qz
    const qx = [sx, 0, 0, cx], qy = [0, sy, 0, cy], qz = [0, 0, sz, cz];
    Q.mul(o, qy, qx); Q.mul(o, o, qz);
    return o;
  },
  mul: (o, a, b) => {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
    o[0] = ax * bw + aw * bx + ay * bz - az * by;
    o[1] = ay * bw + aw * by + az * bx - ax * bz;
    o[2] = az * bw + aw * bz + ax * by - ay * bx;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
  },
  // rotation that makes +Z point along dir, with up hint
  lookRotation: (o, dir, up = [0, 1, 0]) => {
    const z = V.norm([0, 0, 0], dir);
    let x = V.cross([0, 0, 0], up, z);
    if (V.len(x) < 1e-5) x = V.cross(x, [1, 0, 0], z);
    V.norm(x, x);
    const y = V.cross([0, 0, 0], z, x);
    const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2];
    const tr = m00 + m11 + m22;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      o[3] = 0.25 * s; o[0] = (m21 - m12) / s; o[1] = (m02 - m20) / s; o[2] = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      o[3] = (m21 - m12) / s; o[0] = 0.25 * s; o[1] = (m01 + m10) / s; o[2] = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      o[3] = (m02 - m20) / s; o[0] = (m01 + m10) / s; o[1] = 0.25 * s; o[2] = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      o[3] = (m10 - m01) / s; o[0] = (m02 + m20) / s; o[1] = (m12 + m21) / s; o[2] = 0.25 * s;
    }
    return o;
  },
  slerp: (o, a, b, t) => {
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let k0 = 1 - t, k1 = t;
    if (c < 0.9995) {
      const th = Math.acos(c), s = Math.sin(th);
      k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s;
    }
    o[0] = a[0] * k0 + bx * k1; o[1] = a[1] * k0 + by * k1; o[2] = a[2] * k0 + bz * k1; o[3] = a[3] * k0 + bw * k1;
    const l = Math.hypot(o[0], o[1], o[2], o[3]); o[0] /= l; o[1] /= l; o[2] /= l; o[3] /= l;
    return o;
  },
};

// ---------- scalar helpers ----------
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const sat = (x) => clamp(x, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ease = (t) => { t = sat(t); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => { t = sat(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (t) => 1 - Math.pow(1 - sat(t), 3);
export const easeIn = (t) => Math.pow(sat(t), 3);
export const DEG = Math.PI / 180;

export function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
// smooth 1D value noise, deterministic
export function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u) * 2 - 1;
}
// Catmull-Rom through an array of [x,y,z] keys, t in [0,1]
export function spline(out, pts, t) {
  const n = pts.length - 1;
  const ft = sat(t) * n, i = Math.min(n - 1, Math.floor(ft)), u = ft - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  for (let k = 0; k < 3; k++) {
    out[k] = 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return out;
}
