// WGSL for the film renderer. Reversed-Z depth (near=1, far=0).

export const COMMON = /* wgsl */ `
// NaN → 0, ±inf clamped: one bad HDR pixel must never blow up into a full-screen bloom flash
fn sane(c: vec3f) -> vec3f { return clamp(select(c, vec3f(0.0), c != c), vec3f(0.0), vec3f(64.0)); }

struct Frame {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  shadowVP: mat4x4f,
  camPos: vec4f,      // w = time
  sunDir: vec4f,      // xyz toward sun, w = shadow enable
  sunCol: vec4f,      // rgb, w = ambient scale
  ambUp: vec4f,
  ambDown: vec4f,
  screen: vec4f,      // w, h, 1/w, 1/h
  misc: vec4f,        // x = numLights, y = sun disc intensity, z = near, w = far
  bg: vec4f,          // x nebula, y stars, z pixel angle, w hyperspace/warp streak
  planet: vec4f,      // xyz dir, w angular radius (0 = off)
  planetCol: vec4f,   // rgb, w = ring
  camRight: vec4f,
  camUp: vec4f,
  rimCol: vec4f,      // rim light color, w = strength
  fill: vec4f,        // camera-side cinematic fill light rgb, w = wrap
  lensA: vec4f,       // xyz direction camera->lens, w Einstein angle (rad)
  lensA2: vec4f,      // horizon angle, swirl, glow, enable
  lensB: vec4f,
  lensB2: vec4f,
  sky: vec4f,         // slate-blue space haze colour, w = strength
  interior: vec4f,    // hangar box reflection: centre xyz, w = enable
  lights: array<vec4f, 32>,
};
@group(0) @binding(0) var<uniform> F: Frame;

fn hash31(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.zyx + 31.32);
  return fract((q.x + q.y) * q.z);
}
fn hash33(p: vec3f) -> vec3f {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yxx) * q.zyx);
}
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3f(1,0,0)), u.x),
                 mix(hash31(i + vec3f(0,1,0)), hash31(i + vec3f(1,1,0)), u.x), u.y),
             mix(mix(hash31(i + vec3f(0,0,1)), hash31(i + vec3f(1,0,1)), u.x),
                 mix(hash31(i + vec3f(0,1,1)), hash31(i + vec3f(1,1,1)), u.x), u.y), u.z);
}
fn fbm(p0: vec3f, oct: i32) -> f32 {
  var p = p0; var a = 0.5; var s = 0.0;
  for (var i = 0; i < oct; i++) { s += a * vnoise(p); p = p * 2.03 + vec3f(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
// analytic environment used for hull reflections: sun, planet glow, space gradient.
fn envRefl(r: vec3f, rough: f32) -> vec3f {
  let spread = mix(1.0, 0.08, 1.0 - rough);
  var c = mix(F.ambDown.rgb * 1.6, F.ambUp.rgb * 1.2, r.y * 0.5 + 0.5);
  let sd = max(dot(r, F.sunDir.xyz), 0.0);
  c += F.sunCol.rgb * (pow(sd, mix(40.0, 2400.0, 1.0 - rough)) * mix(1.5, 22.0, 1.0 - rough) + pow(sd, 6.0) * 0.12);
  if (F.planet.w > 0.0) {
    let pd = dot(r, F.planet.xyz);
    let edge = cos(F.planet.w);
    let inside = smoothstep(edge - 0.08 * spread - 0.02, edge + 0.02, pd);
    let lit = clamp(dot(F.planet.xyz, F.sunDir.xyz) * 0.5 + 0.6, 0.15, 1.0);
    c += select(F.planetCol.rgb * 0.35, vec3f(0.12, 0.2, 0.32), F.planetCol.w > 0.5) * inside * lit;
    // bright atmosphere rim of the planet shows up as a streak on glossy hulls
    c += vec3f(0.35, 0.55, 1.0) * exp(-abs(pd - edge) * 40.0 / spread) * 0.6 * lit;
  }
  return c;
}
// box-projected hangar interior (the "cube" the hangar metal reflects): walls, lamp rows, floor stripes
fn envInterior(p: vec3f, r: vec3f, rough: f32) -> vec3f {
  let c = F.interior.xyz;
  let lo = c + vec3f(-12.0, -1.0, -62.0); let hi = c + vec3f(12.0, 23.0, 30.0);
  let rs = select(r, sign(r + vec3f(1e-9)) * 1e-5, abs(r) < vec3f(1e-5));
  let t1 = (lo - p) / rs; let t2 = (hi - p) / rs;
  let tf = max(t1, t2);
  let tx = min(min(tf.x, tf.y), tf.z);
  let h = p + r * max(tx, 0.0) - c;
  var col = vec3f(0.05, 0.055, 0.065);
  let blur = mix(0.02, 0.4, rough);
  if (h.y > 22.5) {                                                      // ceiling with lamp rows
    let lz = fract((h.z + 45.0) / 30.0);
    let lamp = (1.0 - smoothstep(0.05, 0.05 + blur, abs(lz - 0.5))) * (1.0 - smoothstep(2.0, 2.0 + blur * 10.0, abs(h.x)));
    col = vec3f(0.02) + vec3f(2.2, 2.0, 1.8) * lamp;
  } else if (h.y < -0.5) {                                               // deck: dark plates + yellow guide stripes
    let stripe = 1.0 - smoothstep(0.2, 0.2 + blur * 4.0, abs(abs(h.x) - 5.0));
    col = vec3f(0.035) + vec3f(0.6, 0.45, 0.05) * stripe * 0.4;
  } else {                                                               // walls: light strips
    let strip = 1.0 - smoothstep(0.15, 0.15 + blur * 3.0, abs(fract(h.y / 6.0) - 0.5));
    col = vec3f(0.025, 0.027, 0.032) + vec3f(0.5, 0.6, 0.8) * strip * 0.12;
  }
  return col;
}
fn linearDepth(d: f32) -> f32 {
  let n = F.misc.z; let f = F.misc.w;
  return n * f / (d * (f - n) + n);
}
`;

// ---------------------------------------------------------------- background
export const BG = COMMON + /* wgsl */ `
@group(0) @binding(1) var earthSmp: sampler;
@group(0) @binding(2) var earthDN: texture_2d<f32>;    // rgb day, a = night lights
@group(0) @binding(3) var earthCl: texture_2d<f32>;    // r = clouds
const PI = 3.14159265;
// world normal on the planet -> earth texture uv (visible disc centred on lat0/lon0)
fn earthUV(n: vec3f, P: vec3f, spin: f32) -> vec2f {
  let e3 = -P;
  let e1 = normalize(cross(vec3f(0.0, 1.0, 0.0), e3));
  let e2 = cross(e3, e1);
  let a = dot(n, e1); let b = dot(n, e2); let c = dot(n, e3);
  let lat0 = 0.62; let lon0 = 0.28 + spin;
  let C = vec3f(cos(lat0) * sin(lon0), sin(lat0), cos(lat0) * cos(lon0));
  let E = vec3f(cos(lon0), 0.0, -sin(lon0));
  let N = cross(C, E);
  let v = normalize(a * E + b * N + c * C);
  let lat = asin(clamp(v.y, -1.0, 1.0));
  let lon = atan2(v.x, v.z);
  return vec2f(lon / (2.0 * PI) + 0.5, 0.5 - lat / PI);
}
struct VO { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  var o: VO; o.pos = vec4f(p, 0.0, 1.0); o.ndc = p; return o;
}

fn starLayer(d: vec3f, scale: f32, seed: f32, dens: f32) -> vec3f {
  let p = d * scale;
  let c = floor(p);
  var col = vec3f(0.0);
  for (var k = 0; k < 2; k++) {
    let cc = c + vec3f(f32(k) * 0.5);
    let h = hash33(cc + seed);
    if (h.z > dens) { continue; }
    let sp = cc + h;
    let sd = normalize(sp);
    let ang = acos(clamp(dot(sd, d), -1.0, 1.0));
    let px = F.bg.z;
    let mag = pow(hash31(cc * 1.3 + seed), 6.0);
    let r = ang / (px * (0.42 + mag * 0.45));
    let temp = hash31(cc + 7.0);
    let tint = mix(vec3f(1.0, 0.72, 0.5), vec3f(0.6, 0.78, 1.0), temp);
    let tw = 0.93 + 0.07 * sin(F.camPos.w * (1.0 + h.x * 2.0) + h.y * 40.0);
    col += tint * exp(-r * r) * (0.1 + mag * 2.2) * tw;
  }
  return col;
}

fn nebula(d: vec3f) -> vec3f {
  let q = d * 1.6 + vec3f(0.0, 0.0, 3.0);
  let w = vec3f(fbm(q * 1.3, 4), fbm(q * 1.3 + 5.2, 4), fbm(q * 1.3 + 9.1, 4));
  let n = fbm(q + w * 1.8, 6);
  let band = exp(-pow(dot(d, normalize(vec3f(0.35, 0.9, -0.25))) * 2.6, 2.0));
  let dens = smoothstep(0.35, 0.85, n) * (0.35 + 0.9 * band);
  let dust = smoothstep(0.45, 0.7, fbm(q * 3.1 + 2.0, 5));
  let c1 = vec3f(0.10, 0.14, 0.2);
  let c2 = vec3f(0.05, 0.2, 0.26);
  let c3 = vec3f(0.7, 0.45, 0.25);
  var col = mix(c1, c2, smoothstep(0.3, 0.7, w.x));
  col = mix(col, c3, smoothstep(0.62, 0.9, n) * 0.6);
  col *= dens * (1.0 - dust * 0.75);
  col += vec3f(0.02, 0.025, 0.05) * band;
  let lum = dot(col, vec3f(0.3, 0.5, 0.2));
  return mix(vec3f(lum), col, 0.7);
}

// gravitational lensing of the BACKGROUND only: bends the view ray around the lens direction.
// (Done here instead of as a screen-space post effect, so ships in front are never duplicated.)
fn bendRay(d0: vec3f, L: vec4f, L2: vec4f, glow: ptr<function, vec3f>, hole: ptr<function, f32>) -> vec3f {
  if (L2.w <= 0.0) { return d0; }
  let Ld = normalize(L.xyz);
  let c = clamp(dot(d0, Ld), -1.0, 1.0);
  let th = acos(c);
  if (th > 1.5) { return d0; }
  let fadeL = 1.0 - smoothstep(0.7, 1.5, th);
  let thE = L.w * L2.w;
  let hr = L2.x * L2.w;
  if (hr > 0.0) {
    *hole = max(*hole, 1.0 - smoothstep(hr * 0.94, hr * 1.02, th));
    let ringc = exp(-pow((th - hr * 1.06) / (hr * 0.018), 2.0));
    let axis0 = normalize(cross(Ld, vec3f(0.0, 1.0, 0.0)) + 1e-5);
    let ang = atan2(dot(cross(axis0, d0), Ld), dot(axis0, d0));
    let disk = exp(-pow((th - hr * 1.6) / (hr * 0.45), 2.0)) * (0.6 + 0.4 * sin(ang * 3.0 + F.camPos.w * 2.0));
    *glow += (vec3f(1.0, 0.92, 0.82) * ringc * 0.45 + vec3f(0.9, 0.7, 0.5) * disk * 0.05) * L2.z;
  }
  // deflection toward the lens + frame-dragging swirl around it
  let defl = thE * thE / max(th, 1e-4) * fadeL;
  let axis = normalize(cross(Ld, d0) + 1e-6);
  let bentTh = th + defl;                   // source lies further out: rays bend around the mass
  let perp = normalize(d0 - Ld * c + 1e-6);
  var d = normalize(Ld * cos(bentTh) + perp * sin(bentTh));
  let sw = L2.y * thE / (th + thE * 0.5) * fadeL;
  let cs = cos(sw); let sn = sin(sw);
  d = d * cs + cross(Ld, d) * sn + Ld * dot(Ld, d) * (1.0 - cs);
  return d;
}

struct SVO { @builtin(position) pos: vec4f, @location(0) dir: vec3f };
// sky drawn on a sphere around the camera (no screen-space reconstruction, no seams)
@vertex fn vsSphere(@location(0) p: vec3f) -> SVO {
  var o: SVO;
  let wp = F.camPos.xyz + p * 300000.0;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  o.pos.z = 0.0;                                         // reversed-Z far plane: always behind everything
  o.dir = p;
  return o;
}
@fragment fn fsSphere(i: SVO) -> @location(0) vec4f { return vec4f(skyColor(normalize(i.dir)), 1.0); }
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let wp = F.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  return vec4f(skyColor(normalize(wp.xyz / wp.w - F.camPos.xyz)), 1.0);
}
fn skyColor(d0: vec3f) -> vec3f {
  var lglow = vec3f(0.0); var lhole = 0.0;
  var d = bendRay(d0, F.lensA, F.lensA2, &lglow, &lhole);
  d = bendRay(d, F.lensB, F.lensB2, &lglow, &lhole);
  var col = nebula(d) * F.bg.x;
  var stars = starLayer(d, 110.0, 0.0, 0.018) * 1.0 + starLayer(d, 260.0, 3.0, 0.008) * 0.45 + starLayer(d, 620.0, 11.0, 0.005) * 0.25;
  col += stars * F.bg.y;
  // sun
  let sd = max(dot(d, F.sunDir.xyz), 0.0);
  col += F.sunCol.rgb * (pow(sd, 300.0) * 1.2 + pow(sd, 20.0) * 0.08) * F.misc.y;
  // soft slate-blue space haze (brighter toward the sun and the planet), like a painted concept backdrop
  let hz = 0.55 + 0.45 * (pow(sd, 3.0) * 0.6 + pow(max(dot(d, normalize(F.planet.xyz + vec3f(1e-5))), 0.0), 4.0) * 0.5) + d.y * 0.15;
  col += F.sky.rgb * F.sky.w * hz;
  // planet (gas giant)
  if (F.planet.w > 0.0) {
    let P = F.planet.xyz;
    let ca = dot(d, P);
    let ar = F.planet.w;
    let s = sin(ar);
    let o = (d - P * ca) / s;
    let r2 = dot(o, o);
    let ang = acos(clamp(ca, -1.0, 1.0));
    let sunL = dot(d, F.sunDir.xyz);
    if (ang < ar && ca > 0.0) {
      let n = normalize(o - P * sqrt(max(1.0 - r2, 0.0)));
      let ndl = dot(n, F.sunDir.xyz);
      let term = smoothstep(-0.08, 0.2, ndl);
      let limb = pow(max(dot(n, -P), 0.0), 0.45);
      if (F.planetCol.w > 0.5) {
        // textured Earth (Solar System Scope maps): day albedo, ocean glint, drifting clouds, city lights, atmosphere
        let uv = earthUV(n, P, F.camPos.w * 0.0004);
        let dn = textureSampleLevel(earthDN, earthSmp, uv, 0.0);
        let cuv = earthUV(n, P, F.camPos.w * 0.0007 + 0.003);
        let cloud = textureSampleLevel(earthCl, earthSmp, cuv, 0.0).r;
        let dayAlb = pow(dn.rgb, vec3f(2.2)) * 0.9;
        let ocean = smoothstep(0.02, 0.0, dayAlb.r - dayAlb.b * 0.7);
        let sunN = max(ndl, 0.0);
        var alb = mix(dayAlb, vec3f(0.85, 0.87, 0.9), cloud * 0.92);
        col = alb * sunN * 1.25 * limb;
        let spec = pow(max(dot(reflect(-F.sunDir.xyz, n), -d), 0.0), 80.0) * ocean * (1.0 - cloud) * 1.2;
        col += vec3f(1.0, 0.85, 0.65) * spec * term;
        // moonlit night side + city lights (dimmed under clouds)
        col += alb * vec3f(0.35, 0.42, 0.55) * 0.035 * limb * (1.0 - term);
        let city = pow(dn.a, 1.6);
        col += vec3f(1.0, 0.62, 0.28) * city * 0.9 * (1.0 - term) * (1.0 - cloud * 0.85);
        let atm = pow(1.0 - max(dot(n, -P), 0.0), 5.0);
        col += vec3f(0.3, 0.55, 1.0) * atm * 0.8 * smoothstep(-0.12, 0.35, ndl);
        col = mix(col, col * vec3f(0.8, 0.9, 1.15) + vec3f(0.01, 0.02, 0.05) * sunN, 0.35 * (1.0 - limb));
      } else {
        let lat = n.y;
        let bands = fbm(vec3f(lat * 9.0 + fbm(n * 4.0, 3) * 0.8, n.x * 0.7, n.z * 0.7), 4);
        var alb = mix(F.planetCol.rgb * 0.25, F.planetCol.rgb * 0.9, smoothstep(0.3, 0.7, bands));
        alb = mix(alb, vec3f(0.85, 0.75, 0.6), smoothstep(0.62, 0.75, bands) * 0.4);
        let rim = pow(1.0 - max(dot(n, -P), 0.0), 3.0);
        col = alb * (max(ndl, 0.0) * 0.6 * term * limb + 0.004) + F.planetCol.rgb * rim * 0.3 * term;
      }
    } else {
      // thin atmospheric halo outside the disc
      let h = exp(-(ang - ar) / (ar * 0.01));
      let lit = smoothstep(-0.4, 0.4, dot(normalize(d - P * ca), F.sunDir.xyz));
      col += select(F.planetCol.rgb * 0.5, vec3f(0.3, 0.55, 1.0) * 0.8, F.planetCol.w > 0.5) * h * lit;
    }
  }
  // hyperspace streak tunnel
  if (F.bg.w > 0.0) {
    let a = atan2(d.y, d.x);
    let streak = pow(hash31(vec3f(floor(a * 120.0), 1.0, 2.0)), 18.0);
    col += vec3f(0.5, 0.75, 1.0) * streak * F.bg.w * 6.0 * smoothstep(0.2, 1.0, abs(d.z));
  }
  col = col * (1.0 - lhole) + lglow;
  return col;
}
`;

// ---------------------------------------------------------------- meshes
export const MESH = COMMON + /* wgsl */ `
struct Inst {
  m: mat4x4f,
  base: vec4f,   // rgb, metal
  emis: vec4f,   // rgb, rough
  p0: vec4f,     // flash, damage, detailScale, revealZ
  p1: vec4f,     // revealDir(0 off), revealWidth, emissiveBoost, seed
  tint: vec4f,   // reveal glow color, w unused
  dmg: vec4f,    // damage centre (local) + radius (0 = whole object)
  clipMin: vec4f, // fracture chunk: local AABB min, w = enable
  clipMax: vec4f, // local AABB max, w = torn-edge heat
  extra: vec4f,   // x = texture set (0 none, 1 hero, 2 enemy), y = crush amount, zw = crush dir xy
  crush: vec4f,   // world-space crush centre + radius (dir z derived)
  shade: vec4f,   // x = open-space light scale (interiors), y = soot amount
};
// crumple: pulls the surface in around the impact point and pushes it along the blow, with noisy folds
fn crushW(w: vec3f, inst: Inst) -> vec3f {
  let k = inst.extra.y;
  if (k <= 0.0) { return w; }
  let d = w - inst.crush.xyz;
  let r = abs(inst.crush.w);
  let fall = smoothstep(r, r * 0.2, length(d));
  if (fall <= 0.0) { return w; }
  let dz = sign(inst.crush.w) * sqrt(max(0.0, 1.0 - dot(inst.extra.zw, inst.extra.zw)));
  let dir = vec3f(inst.extra.z, inst.extra.w, dz);
  let fold = vec3f(vnoise(w * 0.28), vnoise(w * 0.28 + 17.0), vnoise(w * 0.28 + 31.0)) - 0.5;
  // cup-shaped dent: strongest at the centre, rim bulges slightly outward; broad folds, no spikes
  let bowl = fall * fall;
  let squash = d * (1.0 - 0.45 * k * bowl) + dir * (0.4 * r * k * bowl) + fold * (r * 0.16 * k * fall);
  return inst.crush.xyz + squash;
}
@group(0) @binding(1) var<storage, read> I: array<Inst>;
@group(0) @binding(2) var shadowTex: texture_depth_2d;
@group(0) @binding(3) var shadowSmp: sampler_comparison;
@group(0) @binding(4) var texSmp: sampler;
@group(0) @binding(5) var texA1: texture_2d<f32>;
@group(0) @binding(6) var texM1: texture_2d<f32>;
@group(0) @binding(7) var texA2: texture_2d<f32>;
@group(0) @binding(8) var texM2: texture_2d<f32>;

struct VO {
  @builtin(position) @invariant pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) lp: vec3f,
  @location(3) ln: vec3f,
  @location(4) @interpolate(flat) ii: u32,
  @location(5) uv: vec2f,
};

@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f, @builtin(instance_index) ii: u32) -> VO {
  let m = I[ii].m;
  let w = vec4f(crushW((m * vec4f(p, 1.0)).xyz, I[ii]), 1.0);
  var o: VO;
  o.pos = F.viewProj * w;
  o.wp = w.xyz;
  o.n = normalize((m * vec4f(n, 0.0)).xyz);
  o.lp = p; o.ln = n; o.ii = ii; o.uv = uv;
  return o;
}

// depth prepass (dense interiors): uses the regular vs; the fragment only applies the cut-away discards so holes stay open
@fragment fn fsDepth(i: VO) -> @location(0) vec4f { let c = cutAway(i, I[i.ii]); return vec4f(c.x * 0.0); }

@vertex fn vsShadow(@location(0) p: vec3f, @builtin(instance_index) ii: u32) -> @builtin(position) vec4f {
  return F.shadowVP * vec4f(crushW((I[ii].m * vec4f(p, 1.0)).xyz, I[ii]), 1.0);
}

fn gridLines(uv: vec2f, cell: vec2f, w: f32) -> vec3f {
  let g = uv / cell;
  let f = abs(fract(g) - 0.5);
  let fw = fwidth(g) * 1.2 + 1e-4;
  let l = 1.0 - min(smoothstep(0.5 - w - fw.x, 0.5 - fw.x * 0.3, f.x) + smoothstep(0.5 - w - fw.y, 0.5 - fw.y * 0.3, f.y), 1.0);
  return vec3f(l, floor(g));
}

fn panel(lp: vec3f, ln: vec3f, s: f32, seed: f32) -> vec3f {
  // returns (line darkness 0..1, plate albedo variation, window mask)
  let a = abs(ln);
  var uv: vec2f;
  if (a.x > a.y && a.x > a.z) { uv = lp.zy; } else if (a.y > a.z) { uv = lp.xz; } else { uv = lp.xy; }
  let big = gridLines(uv + seed, vec2f(4.0, 2.2) * s, 0.02);
  let small = gridLines(uv * 1.0 + seed * 3.0 + vec2f(0.37, 0.11) * s, vec2f(1.3, 0.8) * s, 0.035);
  let id = big.yz;
  let r = hash31(vec3f(id, seed));
  let r2 = hash31(vec3f(small.yz, seed + 4.0));
  let fwb = length(fwidth(uv / (vec2f(4.0, 2.2) * s)));
  let fws = length(fwidth(uv / (vec2f(1.3, 0.8) * s)));
  let line = max((1.0 - big.x) * (1.0 - smoothstep(0.12, 0.35, fwb)), (1.0 - small.x) * 0.45 * (1.0 - smoothstep(0.1, 0.3, fws)));
  let vary = (r - 0.5) * 0.16 + (r2 - 0.5) * 0.06 + select(0.0, -0.12, r > 0.86);
  return vec3f(line, vary, r2);
}


// ================================================================== cinematic hull detail (flagship, shade.z = class)
// Procedural armour in METRES of model space, anti-aliased by the pixel footprint pw (no derivatives inside, so it
// can run in non-uniform flow): staggered plate courses with sub-plates, recessed seams with bevelled raised edges,
// rivet rows, and per-plate decals that match the material — hazard stripes, stencilled hull numbers, maintenance
// text blocks, vent grilles, access hatches, chevrons, the fleet emblem — weathered (chipped paint, grime streaks,
// worn bare-metal edges). Returns colour/rough/metal edits + a tangent-plane normal tilt.
struct HD { col: vec3f, mixk: f32, rough: f32, metal: f32, tilt: vec2f, ao: f32, paint: vec3f };
fn seg7(p: vec2f, d: i32) -> f32 { return seg7w(p, d, 0.16); }
fn seg7w(p: vec2f, d: i32, w: f32) -> f32 {           // 7-segment digit, p in [0,1]x[0,1.8]; returns 1 inside a lit segment
  // segment bits: a b c d e f g (top, top-right, bottom-right, bottom, bottom-left, top-left, middle)
  var bits = array<u32, 10>(0x3Fu, 0x06u, 0x5Bu, 0x4Fu, 0x66u, 0x6Du, 0x7Du, 0x07u, 0x7Fu, 0x6Fu);
  let m = bits[u32(clamp(d, 0, 9))];
  var on = 0.0;
  let hx = abs(p.x - 0.5) < 0.42; let vx0 = abs(p.x - 0.08) < w * 0.5; let vx1 = abs(p.x - 0.92) < w * 0.5;
  if ((m & 1u) != 0u && hx && abs(p.y - 1.72) < w * 0.5) { on = 1.0; }
  if ((m & 2u) != 0u && vx1 && p.y > 0.92 && p.y < 1.72) { on = 1.0; }
  if ((m & 4u) != 0u && vx1 && p.y > 0.08 && p.y < 0.88) { on = 1.0; }
  if ((m & 8u) != 0u && hx && abs(p.y - 0.08) < w * 0.5) { on = 1.0; }
  if ((m & 16u) != 0u && vx0 && p.y > 0.08 && p.y < 0.88) { on = 1.0; }
  if ((m & 32u) != 0u && vx0 && p.y > 0.92 && p.y < 1.72) { on = 1.0; }
  if ((m & 64u) != 0u && hx && abs(p.y - 0.9) < w * 0.5) { on = 1.0; }
  return on;
}
fn boxd(p: vec2f, c: vec2f, h: vec2f) -> f32 { let d = abs(p - c) - h; return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0); }
fn hullDetail(uv: vec2f, cls: f32, seed: f32, pw: f32, vertical: bool) -> HD {
  var o: HD; o.paint = vec3f(0.0); o.col = vec3f(0.0); o.mixk = 0.0; o.rough = 0.0; o.metal = -1.0; o.tilt = vec2f(0.0); o.ao = 1.0;
  let aa = clamp(1.0 - pw * 4.0, 0.0, 1.0);                         // fine detail fades before it can alias
  let aa2 = clamp(1.0 - pw * 12.0, 0.0, 1.0);
  // --- plate courses: rows 4.5 m, staggered, plate widths vary per row
  let H = select(9.0, 1.0e6, vertical);                               // side walls: ONE plate (no seam grid)
  let ry = floor(uv.y / H);
  let W = select(16.0 + 12.0 * hash31(vec3f(ry, seed, 3.0)), 1.0e6, vertical);
  let xo = uv.x + hash31(vec3f(ry, seed, 7.0)) * W;
  var cell = vec2f(floor(xo / W), ry);
  var q = vec2f(xo - cell.x * W, uv.y - ry * H);
  var sz = vec2f(W, H);
  let hc = hash31(vec3f(cell, seed + 1.0));
  if (hc > 2.0) {                                                    // (no 2×2 sub-plate split: it read as patchwork)
    let sx = step(W * 0.5, q.x); let sy = step(H * 0.5, q.y);
    sz = sz * 0.5; q = q - vec2f(sx, sy) * sz; cell = cell * 2.0 + vec2f(sx, sy) + 100.0;
  }
  let h = hash31(vec3f(cell, seed + 2.0)); let h2 = hash31(vec3f(cell, seed + 5.0));
  let de = min(min(q.x, sz.x - q.x), min(q.y, sz.y - q.y));        // distance to the plate edge (m)
  // plate-to-plate variation (albedo, sheen)
  // big courses (24 x 12 m) shift the tone a little, plates vary within them: the hull reads as assembled armour
  let bc = floor(uv / vec2f(24.0, 12.0));
  let bh = hash31(vec3f(bc, seed + 21.0));
  o.col = vec3f(1.0); o.mixk = 0.0;                                   // one tone for every plate
  o.rough = 0.0;
  // recessed seam + bevelled raised edge (normal tilts away from the seam)
  let seamW = 0.025;                                                  // fine seams, only visible up close
  let seam = (1.0 - smoothstep(seamW, seamW + pw * 1.5 + 0.01, de)) * mix(0.55, 1.0, aa);
  let raised = step(0.35, h);
  let bev = (1.0 - smoothstep(seamW, seamW + 0.07, de)) * raised * aa;
  var ed = vec2f(0.0);
  if (de == q.x) { ed = vec2f(-1.0, 0.0); } else if (de == sz.x - q.x) { ed = vec2f(1.0, 0.0); } else if (de == q.y) { ed = vec2f(0.0, -1.0); } else { ed = vec2f(0.0, 1.0); }
  o.tilt = -ed * bev * 0.55;
  o.ao = 1.0 - seam * 0.75;
  // rivet rows 0.2 m in from every edge, every 0.45 m
  if (aa2 > 0.0 && de < 0.3) {
    let along = select(q.y, q.x, abs(ed.y) > 0.5);
    let rv = length(vec2f((fract(along / 0.45) - 0.5) * 0.45, de - 0.2));
    let rivet = (1.0 - smoothstep(0.035, 0.05, rv)) * aa2;
    o.tilt += normalize(vec2f((fract(along / 0.45) - 0.5), de - 0.2) + 1e-4) * rivet * 0.5;
    o.col *= 1.0 + rivet * 0.35;
  }
  // worn bare-metal edges along raised plates (chipped by noise)
  if (de < seamW + 0.09 && raised > 0.0 && aa > 0.0) {
    let wear = (1.0 - smoothstep(seamW + 0.02, seamW + 0.09, de)) * 0.5 * aa;   // uniform edge highlight (no noise inside a plate)
    o.col = mix(o.col, vec3f(2.2), wear * 0.6); o.rough -= wear * 0.2;
  }
  // --- decals: FEW and GIANT (5× the plate-sized ones): painted across the plating on a 150 × 56 m grid, bold stroke
  // font, each fully inside its grid cell (a margin all round), so none is ever clipped
  var paint = vec3f(0.0); var pa = 0.0;
  // placed by hand on the flat side walls (wall band y −31…+60): fully inside the wall, bold, 5× the old size
  if (vertical && cls != 4.0 && cls != 5.0) {
    let zz = abs(uv.x);
    // hull number "07" — 40 m tall, centred on z = −60 (both flanks)
    let dh = 40.0; let dw = dh * (1.3 / 1.85);
    let lx = uv.x - (select(60.0, -60.0, uv.x < 0.0)) + dw;            // local x from the number's left edge
    let pn = vec2f(lx, uv.y - (13.0 - dh * 0.5)) / (dh / 1.85);
    if (pn.x > 0.0 && pn.x < 2.6 && pn.y > 0.0 && pn.y < 1.85) {
      let k = floor(pn.x / 1.3); let px = vec2f(pn.x - k * 1.3, pn.y);
      let dg = select(seg7w(px, 7, 0.32), seg7w(px, 0, 0.32), k == 0.0);
      paint = vec3f(0.6, 0.61, 0.63); pa = max(pa, dg);
    }
    // fleet emblem, 30 m radius, on the aft wall section (z ≈ −235)
    let ec = vec2f(select(235.0, -235.0, uv.x < 0.0), 12.0);
    let v = (uv - ec) / 30.0; let r = length(v);
    let ring = step(abs(r - 0.88), 0.09);
    let tv = max(abs(v.x) * 0.87 + v.y * 0.5, -v.y);
    let tri = step(tv, 0.56) * step(0.3, tv);
    if (max(ring, tri) > 0.0) { paint = vec3f(0.6, 0.61, 0.63); pa = 1.0; }
    // a long hazard band low on the forward wall (z 100…170)
    if (uv.y > -24.0 && uv.y < -17.0 && zz > 100.0 && zz < 170.0) { let st = step(0.5, fract((uv.x + uv.y) / 8.0)); paint = mix(vec3f(0.02), vec3f(0.62, 0.42, 0.05), st); pa = 1.0; }
  }
  if (pa > 0.0) {
    pa *= 0.9;
  }
  o.mixk = pa;
  if (pa > 0.0) { o.metal = 0.15; o.rough += 0.1; }
  o.paint = paint * (0.75 + 0.25 * h2);
  return o;
}

fn shadowAt(wp: vec3f, n: vec3f) -> f32 {
  if (F.sunDir.w < 0.5) { return 1.0; }
  let sp = F.shadowVP * vec4f(wp + n * 0.35, 1.0);
  let uv = sp.xy * vec2f(0.5, -0.5) + 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || sp.z > 1.0 || sp.z < 0.0) { return 1.0; }
  let ts = 1.0 / f32(textureDimensions(shadowTex).x);
  var s = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      s += textureSampleCompareLevel(shadowTex, shadowSmp, uv + vec2f(f32(x), f32(y)) * ts * 1.5, sp.z - 0.0015);
    }
  }
  return s / 9.0;
}

// cut-away effects shared by the colour pass and the depth prepass: melt hole, fracture chunks, hyperspace reveal.
// Discards the removed surface; returns (torn-edge heat, hyperspace glow).
fn cutAway(i: VO, inst: Inst) -> vec2f {
  var hyper = 0.0;
  // fracture chunk: keep only this cell of the hull; jagged boundary, glowing torn edges
  var tornEdge = 0.0;
  // MELT hole (clipMin.w = 2): hull wall facing +X melts open around clipMin.xyz (local), radius clipMax.x,
  // depth clipMax.y, heat clipMax.w. Below the centre the edge runs down in molten fingers.
  if (inst.clipMin.w > 1.5 && length(vec2f(i.lp.y - inst.clipMin.y, (i.lp.z - inst.clipMin.z) * 0.62)) < inst.clipMax.x * 2.2) {   // near the hole only
    let r = inst.clipMax.x;
    let q = i.lp - inst.clipMin.xyz;
    // boundary shared EXACTLY with the thick molten rim mesh (tools/make_wound_rim.py): |v| < r·B(θ)
    let v = vec2f(q.z * 0.62, q.y);
    let th = atan2(v.y, v.x);
    let drip = 0.28 * pow(max(0.0, sin(7.0 * th + 1.1)), 3.0) * max(0.0, -sin(th));
    let hb = 1.0 + 0.10 * sin(3.0 * th + 1.0) + 0.06 * sin(5.0 * th + 2.3) + 0.035 * sin(9.0 * th + 0.7) + 0.02 * sin(14.0 * th + 4.1) + drip;
    let fing = drip * 8.0;
    let d2 = length(v) / hb + (vnoise(i.lp * 0.35) - 0.5) * r * 0.03;   // gouge: stretched along the ship (grazing hit)
    let inDepth = q.x > -inst.clipMax.y;
    if (d2 < r && inDepth) { discard; }
    if (inDepth) {
      let e = max(d2 - r, 0.0);
      tornEdge = inst.clipMax.w * (exp(-e / (r * 0.05)) * 1.4 + exp(-e / (r * 0.22)) * 0.35);
      // molten runs below the hole: bright streaks that follow the fingers
      if (q.y < 0.0) { tornEdge += inst.clipMax.w * 0.5 * smoothstep(0.1, 0.9, fing / 2.2) * exp(-e / (r * 0.5)); }
    }
  }
  if (abs(inst.clipMin.w) > 0.5 && inst.clipMin.w < 1.5) {
    let span = inst.clipMax.xyz - inst.clipMin.xyz;
    let jag = (vnoise(i.lp * (3.0 / max(max(span.x, span.y), span.z)) + inst.p1.w) - 0.5) * 0.35 * min(min(span.x, span.y), span.z);
    let dl = i.lp - inst.clipMin.xyz + jag;
    let dh = inst.clipMax.xyz - i.lp + jag;
    let inside = min(min(min(dl.x, dl.y), dl.z), min(min(dh.x, dh.y), dh.z));
    let sc = min(0.01 * min(min(span.x, span.y), span.z) + 0.12, 0.6);
    if (inst.clipMin.w > 0.5) {
      if (inside < 0.0) { discard; }
      tornEdge = inst.clipMax.w * exp(-inside / sc);
    } else {
      if (inside > 0.0) { discard; }                  // hole punched out of the hull
      tornEdge = inst.clipMax.w * exp(inside / (sc * 1.5));
    }
  }
  if (inst.p1.x != 0.0) {
    let dd = (i.lp.z - inst.p0.w) * inst.p1.x;
    if (dd > 0.0) { discard; }
    hyper = exp(dd / max(inst.p1.y, 0.01));
  }
  return vec2f(tornEdge, hyper);
}

@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let inst = I[i.ii];
  // derivatives must run in uniform control flow: evaluate panel detail first
  let pnl = panel(i.lp, normalize(i.ln), max(inst.p0.z, 0.25), inst.p1.w);
  let pwLP = length(fwidth(i.lp));                                    // pixel footprint in model metres (uniform flow)
  let curv = length(fwidth(normalize(i.ln))) / max(pwLP, 1e-4);   // edge sharpness (uniform flow)
  // baked PBR textures (sampled in uniform control flow, selected below)
  let tA1 = textureSample(texA1, texSmp, i.uv); let tM1 = textureSample(texM1, texSmp, i.uv);
  let tA2 = textureSample(texA2, texSmp, i.uv); let tM2 = textureSample(texM2, texSmp, i.uv);
  let faceN = normalize(cross(dpdx(i.wp), dpdy(i.wp)));           // facet normal for crumpled metal
  let cut = cutAway(i, inst);
  var tornEdge = cut.x;
  let hyper = cut.y;
  var n = normalize(i.n);
  var crumple = 0.0;
  if (inst.extra.y > 0.0) {
    crumple = inst.extra.y * smoothstep(abs(inst.crush.w), abs(inst.crush.w) * 0.3, length(i.wp - inst.crush.xyz));
    var fN = faceN; if (dot(fN, n) < 0.0) { fN = -fN; }
    n = normalize(mix(n, fN, clamp(crumple * 1.5, 0.0, 1.0)));
  }
  if (!ff) { n = -n; }
  let V = normalize(F.camPos.xyz - i.wp);
  let det = inst.p0.z;
  var base = inst.base.rgb;
  var rough = inst.emis.w;
  var metal = inst.base.w;
  let texSet = i32(inst.extra.x);
  var texAO = 1.0;
  if (texSet > 0 && dot(inst.emis.rgb, vec3f(1.0)) < 0.01) {
    let ta = select(tA2, tA1, texSet == 1); let tm = select(tM2, tM1, texSet == 1);
    base = pow(ta.rgb, vec3f(2.2)); texAO = tm.r; rough = tm.g; metal = tm.b;
    if (texSet == 1) {                                   // Sigma: matte paint, and the chipped bare metal is scuffed, not a mirror
      rough = max(rough, mix(0.72, 0.5, metal));
      metal = metal * 0.75;
    }
  }
  // cinematic hull detail (flagship: shade.z = material class 1 hull, 2 plate, 3 hull2, 4 greeble, 5 trim)
  let hullFlag = inst.shade.z > 0.5 && dot(inst.emis.rgb, vec3f(1.0)) < 0.01;   // flagship armour (any distance)
  let hullOn = hullFlag && pwLP < 1.5;   // beyond ~1.5 m/pixel the plating is sub-pixel: skip it
  if (hullFlag) { base = vec3f(0.092, 0.098, 0.114) * select(1.0, 1.12, inst.shade.z > 4.5); rough = 0.46; metal = 0.75; }   // every armour class: ONE gunmetal   // hull / plate / hull2: ONE gunmetal (no patchwork of materials)
  if (hullOn) {
    let ln = normalize(i.ln); let a = abs(ln);
    var uvp: vec2f; var tU = vec3f(0.0, 0.0, 1.0); var tV = vec3f(0.0, 1.0, 0.0);
    if (a.x > a.y && a.x > a.z) { uvp = vec2f(-i.lp.z * sign(ln.x), i.lp.y); tU = vec3f(0.0, 0.0, -sign(ln.x)); tV = vec3f(0.0, 1.0, 0.0); }
    else if (a.y > a.z) { uvp = i.lp.xz; tU = vec3f(1.0, 0.0, 0.0); tV = vec3f(0.0, 0.0, 1.0); }
    else { uvp = i.lp.xy; tU = vec3f(1.0, 0.0, 0.0); tV = vec3f(0.0, 1.0, 0.0); }
    let hd = hullDetail(uvp, inst.shade.z, inst.p1.w, pwLP, a.x > 0.8);   // giant decals only on the flat side walls
    base = mix(base * hd.col, hd.paint, hd.mixk);
    rough = clamp(rough + hd.rough, 0.12, 1.0);
    if (hd.metal >= 0.0) { metal = mix(metal, hd.metal, hd.mixk); }
    texAO *= hd.ao;
    let wt = normalize((inst.m * vec4f(tU * hd.tilt.x + tV * hd.tilt.y, 0.0)).xyz + vec3f(1e-6));
    n = normalize(n + wt * length(hd.tilt));
  }
  // procedural asteroid (texSet = -1, tools/make_asteroids.py geometry): triplanar-free 3D regolith colour + bump.
  // Model space is ~unit radius, so every frequency scales with the rock.
  if (texSet == -1 || texSet == -3) {
    let moonK = select(0.0, 1.0, texSet == -3);                       // -3: the moon (seen from 110 km: smoother, brighter highlands)
    let q = i.lp;
    let big = fbm(q * 2.2 + inst.p1.w, 4);
    let mid = fbm(q * 7.0 + 3.1 + inst.p1.w, 3);
    base = mix(vec3f(0.034, 0.032, 0.03), vec3f(0.1, 0.09, 0.08), smoothstep(0.3, 0.72, big));   // dark basalt .. dusty regolith (albedo ~0.05–0.12)
    base *= mix(0.8, 1.12, mid);
    base = mix(base, base * vec3f(1.15, 0.95, 0.8), smoothstep(0.55, 0.8, fbm(q * 3.5 + 9.0, 3)) * 0.5);   // iron-stained patches
    base += vec3f(0.025) * smoothstep(0.85, 0.92, vnoise(q * 70.0 + inst.p1.w));                         // mineral grains
    rough = 0.93; metal = 0.0;
    // bump: height field gradient by central differences (fine pits and grit that the mesh cannot hold)
    let e = 0.004;
    let hq = fbm(q * 9.0 + 1.7, 3) * 0.6 + vnoise(q * 40.0) * 0.4;
    let gx = (fbm((q + vec3f(e, 0.0, 0.0)) * 9.0 + 1.7, 3) * 0.6 + vnoise((q + vec3f(e, 0.0, 0.0)) * 40.0) * 0.4 - hq) / e;
    let gy = (fbm((q + vec3f(0.0, e, 0.0)) * 9.0 + 1.7, 3) * 0.6 + vnoise((q + vec3f(0.0, e, 0.0)) * 40.0) * 0.4 - hq) / e;
    let gz = (fbm((q + vec3f(0.0, 0.0, e)) * 9.0 + 1.7, 3) * 0.6 + vnoise((q + vec3f(0.0, 0.0, e)) * 40.0) * 0.4 - hq) / e;
    var gw = (inst.m * vec4f(gx, gy, gz, 0.0)).xyz;
    gw = gw / max(length(inst.m[0].xyz), 1e-3);
    gw = gw - n * dot(gw, n);
    n = normalize(n - gw * 0.022 * (1.0 - 0.8 * moonK));
    texAO = mix(mix(0.55, 1.0, smoothstep(0.2, 0.6, hq)), 1.0, moonK * 0.85);   // pits hold shadow (barely, on the moon)
    base = mix(base, base * 2.3 + vec3f(0.02), moonK);
  }
  // battle wear (mechs): chipped paint on edges, grime in crevices + streaks, scorch marks
  let wear = select(inst.tint.w, 0.0, texSet > 0);
  if (wear > 0.0 && dot(inst.emis.rgb, vec3f(1.0)) < 0.01) {
    let q = i.lp;
    let chipN = fbm(q * 6.5 + inst.p1.w, 3);
    let chip = smoothstep(0.7, 0.76, chipN + clamp(curv * 0.03, 0.0, 0.1)) * wear * 0.7;
    let chipSpots = smoothstep(0.8, 0.83, fbm(q * 14.0 + 3.0, 2)) * 0.3 * wear;
    let bare = max(chip, chipSpots);
    base = mix(base, vec3f(0.26, 0.25, 0.24), bare);
    metal = mix(metal, 0.25, bare); rough = mix(rough, 0.75, bare);
    let grime = smoothstep(0.35, 0.8, fbm(q * 0.6 + 7.0, 4)) * 0.45 + (1.0 - smoothstep(0.0, 0.25, curv)) * 0.0;
    let streak = smoothstep(0.55, 0.9, vnoise(vec3f(q.x * 3.0, q.y * 0.35, q.z * 3.0) + 11.0)) * 0.35;
    base *= 1.0 - (grime + streak) * wear * 0.6;
    rough = mix(rough, 0.85, (grime + streak) * wear * 0.5);
    // scorch: a few blast marks per part, soot centre with a brown heat ring
    let cell = floor(q / 3.2);
    let hsh = hash33(cell + inst.p1.w);
    let dc = length(q - (cell + hsh) * 3.2) / (0.4 + hsh.z * 0.7);
    let scorch = step(0.8, hsh.x) * (1.0 - smoothstep(0.3, 1.0, dc + (vnoise(q * 3.0) - 0.5) * 0.4)) * wear;
    base = mix(base, vec3f(0.06, 0.05, 0.045), scorch * 0.6);
    base = mix(base, base * vec3f(0.75, 0.55, 0.4), exp(-pow((dc - 1.0) / 0.2, 2.0)) * step(0.8, hsh.x) * wear * 0.5);
    rough = mix(rough, 0.95, scorch);
  }
  var emis = inst.emis.rgb * inst.p1.z;
  // molten armour cut face (texSet = -2, assets/wound_rim.glb; heat in p1.z): white-hot rolled lip, glowing runs and
  // drips flowing down the ~9 m cut face, a dark cooling slag crust breaking up the glow deeper in
  if (texSet == -2) {
    let q = i.lp;
    let heat = inst.p1.z;
    let pu = i.uv.x;                                                    // profile: 0 flange edge, 0.27 lip crest, 1 inner edge
    let dk = clamp((pu - 0.27) / 0.73, 0.0, 1.0);
    let flange = 1.0 - smoothstep(0.12, 0.25, pu);                      // outer curl on the skin
    let flow = vnoise(vec3f(q.z * 30.0, q.y * 5.0 + F.camPos.w * 0.35, q.x * 0.5)) * 0.6 + vnoise(vec3f(q.z * 70.0, q.y * 14.0 + F.camPos.w * 0.8, q.x)) * 0.4;
    // cooled slag crust plates; glow survives in the cracks between them and in the running drips
    let cr = fbm(vec3f(q.z * 22.0, q.y * 22.0, q.x * 1.1) + 5.0, 3);
    let crust = smoothstep(0.38, 0.5, cr) * clamp(0.35 + dk * 0.9 + flange * 0.6 - heat * 0.2, 0.0, 1.0);
    let crack = 1.0 - smoothstep(0.0, 0.05, abs(cr - 0.44));
    // laminated armour: the cut face shows the stacked plates (dark seams every ~1.3 m of depth)
    let lam = smoothstep(0.82, 0.95, fract(dk * 8.0)) * step(0.36, pu);
    var temp = heat * (0.9 * pow(1.0 - dk, 2.2) + 0.5 * flow * (1.0 - 0.7 * dk)) * (1.0 - 0.9 * crust) * (1.0 - 0.6 * flange);
    temp += heat * 1.1 * pow(1.0 - clamp(abs(pu - 0.27) / 0.06, 0.0, 1.0), 2.0) * (1.0 - 0.5 * crust);   // the rolled lip: hottest line
    temp += heat * 0.8 * crack * (1.0 - dk * 0.5);
    temp *= 1.0 - 0.7 * lam;
    let glow = vec3f(1.0, 0.16, 0.03) * smoothstep(0.06, 0.45, temp) + vec3f(1.0, 0.45, 0.1) * smoothstep(0.4, 0.95, temp) + vec3f(0.9, 0.8, 0.6) * smoothstep(0.9, 1.6, temp);
    emis = glow * temp * 1.5 * (0.92 + 0.08 * sin(F.camPos.w * 9.0 + q.z * 40.0));
    base = mix(vec3f(0.06, 0.05, 0.045), vec3f(0.1, 0.085, 0.075), crust) * (1.0 - 0.5 * lam);
    rough = mix(0.28, 0.85, crust); metal = mix(0.85, 0.3, crust);
  }
  let isEmissive = dot(inst.emis.rgb, vec3f(1.0)) > 0.01;
  var ao = 1.0;
  if (det > 0.0 && !isEmissive) {
    if (!hullFlag) { base *= (1.0 + pnl.y * 0.8) * (1.0 - pnl.x * 0.14); }   // (the flagship has its own plating)
    let grime = fbm(i.lp / (det * 7.0) + inst.p1.w, select(4, 2, hullOn));
    let streaks = vnoise(vec3f(i.lp.x / (det * 1.5), i.lp.y / (det * 12.0), i.lp.z / (det * 1.5)));
    if (!hullFlag) { base *= mix(0.55, 1.08, smoothstep(0.25, 0.75, grime)) * mix(0.85, 1.0, streaks); }   // flagship: one tone per plate
    if (!hullFlag) { rough = clamp(rough + pnl.y * 0.8, 0.15, 1.0); ao = 1.0 - pnl.x * 0.12; }
  }
  // damage: scorch + glowing cracks
  var dmg = inst.p0.y;
  if (inst.dmg.w > 0.0) {
    let dd = length(i.lp - inst.dmg.xyz) / inst.dmg.w;
    if (dd > 1.4) { dmg = 0.0; } else { dmg *= smoothstep(1.0, 0.3, dd + (vnoise(i.lp * 0.05) - 0.5) * 0.6); }   // skip the noise far away
  }
  dmg = max(dmg, crumple * 0.45);
  if (dmg > 0.0) {
    let q = i.lp / max(det, 0.5) * 0.35;
    let nz = fbm(q + inst.p1.w, 4);
    let burn = smoothstep(1.0 - dmg * 0.9, 1.05 - dmg * 0.9 + 0.1, nz + 0.25);
    base = mix(base, vec3f(0.025, 0.022, 0.02), burn * 0.95);
    let crack = pow(1.0 - abs(fbm(q * 3.0 + 7.0, 3) * 2.0 - 1.0), 18.0) * burn;
    let flick = 0.7 + 0.3 * sin(F.camPos.w * 13.0 + nz * 30.0);
    emis += vec3f(3.0, 0.8, 0.15) * crack * 0.6 * flick * smoothstep(0.5, 0.9, nz);
  }
  let sh = shadowAt(i.wp, n);
  let L = F.sunDir.xyz;
  let H = normalize(L + V);
  let ndl = max(dot(n, L), 0.0);
  let ndv = max(dot(n, V), 1e-3);
  let spec_pow = mix(900.0, 8.0, rough);
  let F0 = mix(vec3f(0.04), base, metal);
  let fres = F0 + (1.0 - F0) * pow(1.0 - ndv, 5.0);
  let diffC = base * (1.0 - metal);
  // GGX / Smith / Schlick (energy-sane specular; metals get their colour from reflection, not diffuse)
  let nh = max(dot(n, H), 0.0);
  let a = max(rough * rough, 0.002);
  let a2 = a * a;
  let dd = nh * nh * (a2 - 1.0) + 1.0;
  let D = a2 / (3.14159 * dd * dd);
  let kq = (rough + 1.0) * (rough + 1.0) / 8.0;
  let G = (ndl / (ndl * (1.0 - kq) + kq)) * (ndv / (ndv * (1.0 - kq) + kq));
  let Fh = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  let specG = D * G * Fh / max(4.0 * ndl * ndv, 1e-3);
  var col = F.sunCol.rgb * sh * ndl * (diffC / 3.14159 * 2.6 + min(specG, vec3f(40.0)));
  let amb = mix(F.ambDown.rgb, F.ambUp.rgb, n.y * 0.5 + 0.5) * F.sunCol.w;
  col += (diffC + F0 * 0.3) * amb * ao * texAO;
  // environment reflection with a brushed-metal streak (anisotropic look along the hull's long axis)
  let Rv = reflect(-V, n);
  let brushed = select(0.75 + 0.5 * vnoise(vec3f(i.lp.x * 0.6, i.lp.y * 0.6, i.lp.z * 0.02) + inst.p1.w), 1.0, inst.shade.z > 0.5);
  let rockK = select(1.0, 0.12, texSet == -1 || texSet == -3);                        // dusty rock: almost no sheen
  let reflK = fres * (1.0 - rough * 0.8) * brushed * mix(0.2, 0.85, metal) * rockK;
  var envC = envRefl(Rv, rough);
  if (F.interior.w > 0.5) { envC = envInterior(i.wp, Rv, rough); }
  col += envC * reflK * ao * mix(0.35, 1.0, sh);
  // rim (nebula backlight) for silhouettes
  let rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  col += F.rimCol.rgb * rim * F.rimCol.w * ao * (0.5 + 0.5 * base) * mix(0.3, 1.0, rockK) * select(1.0, 0.3, texSet > 0) * inst.shade.w;   // mechs: subtle rim; shade.w = per-entry rim scale
  // cinematic fill from slightly above the camera: keeps the dark side of hulls readable
  let fillDir = normalize(V + vec3f(0.0, 0.35, 0.0));
  let fl = clamp((dot(n, fillDir) + F.fill.w) / (1.0 + F.fill.w), 0.0, 1.0);
  col += F.fill.rgb * fl * (diffC + F0 * 0.3) * ao * mix(0.55, 1.0, rockK);
  // interiors: scale the open-space light, then soot — blotchy burnt grime (point lights below still light it)
  col *= inst.shade.x;
  if (inst.shade.y > 0.0) {
    let sn = vnoise(i.lp * 0.12 + inst.p1.w) * 0.65 + vnoise(i.lp * 0.5) * 0.35;
    col *= 1.0 - inst.shade.y * smoothstep(0.3, 0.75, sn) * 0.85;
  }
  // point lights
  let nl = i32(F.misc.x);
  for (var k = 0; k < nl; k++) {
    let lpv = F.lights[k * 2];
    let lc = F.lights[k * 2 + 1];
    let dv = lpv.xyz - i.wp;
    let dist = length(dv);
    let att = pow(clamp(1.0 - dist / lpv.w, 0.0, 1.0), 2.0);
    if (att <= 0.0) { continue; }
    let ld = dv / dist;
    let lh = normalize(ld + V);
    col += lc.rgb * att * (diffC * max(dot(n, ld), 0.0) * 1.0 + fres * pow(max(dot(n, lh), 0.0), spec_pow) * 0.5);
  }
  col += emis;
  col += inst.tint.rgb * hyper * 6.0;
  if (inst.clipMin.w > 1.5) {                                        // melt hole: red → white-hot molten rim
    col += mix(vec3f(3.2, 0.8, 0.16), vec3f(4.5, 3.0, 1.5), clamp(tornEdge - 0.9, 0.0, 1.0)) * tornEdge * (0.7 + 0.3 * sin(F.camPos.w * 17.0 + i.lp.x));
  } else {                                                           // broken-off chunk: only the torn edge smoulders dark cherry red
    col += vec3f(1.1, 0.12, 0.03) * tornEdge * tornEdge * (0.8 + 0.2 * sin(F.camPos.w * 11.0 + i.lp.x * 0.3));
  }
  col += vec3f(inst.p0.x);
  return vec4f(sane(col), 1.0);
}
`;

// ---------------------------------------------------------------- depth resolve (MSAA -> 1x)
export const DEPTH_RESOLVE = /* wgsl */ `
@group(0) @binding(0) var d: texture_depth_multisampled_2d;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) p: vec4f) -> @builtin(frag_depth) f32 {
  let c = vec2i(p.xy);
  // keep nearest sample (reversed-Z -> max)
  return max(max(textureLoad(d, c, 0), textureLoad(d, c, 1)), max(textureLoad(d, c, 2), textureLoad(d, c, 3)));
}
`;

// ---------------------------------------------------------------- sprites / beams / effects
export const SPRITE = COMMON + /* wgsl */ `
struct Spr { a: vec4f, b: vec4f, c: vec4f, d: vec4f };
@group(0) @binding(1) var<storage, read> S: array<Spr>;
@group(0) @binding(2) var depthTex: texture_depth_2d;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) si: u32,
  @location(2) ext: vec2f,   // streak: length/radius, unused
  @location(3) vz: f32,      // view distance
};

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) si: u32) -> VO {
  let s = S[si];
  let corner = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(1,1), vec2f(-1,-1), vec2f(1,1), vec2f(-1,1))[vi];
  let shape = i32(s.a.w);
  var wp: vec3f;
  var uv = corner;
  var ext = vec2f(0.0);
  if (shape == 3 || shape == 12) {
    // streak / beam capsule from a.xyz to b.xyz, radius c.x (12: arc discharge channel, same camera-facing ribbon)
    let p0 = s.a.xyz; let p1 = s.b.xyz; let r = s.c.x;
    let ax = p1 - p0;
    let L = max(length(ax), 1e-4);
    let dir = ax / L;
    let mid = (p0 + p1) * 0.5;
    var side = cross(dir, F.camPos.xyz - mid);
    if (length(side) < 1e-5) { side = F.camRight.xyz; }
    side = normalize(side);
    let t = corner.x * 0.5 + 0.5;
    wp = mix(p0 - dir * r, p1 + dir * r, t) + side * corner.y * r;
    uv = vec2f(mix(-r, L + r, t), corner.y);
    ext = vec2f(L, r);
  } else if (shape == 7) {
    // homeland-style exhaust flame: camera-facing trapezoid from the nozzle (wide) to the tail (0.34 wide)
    let L = max(length(s.b.xyz), 1e-4);
    let dir = s.b.xyz / L;
    var side = cross(dir, F.camPos.xyz - s.a.xyz);
    if (length(side) < 1e-5) { side = F.camRight.xyz; }
    side = normalize(side);
    let tt = corner.y * 0.5 + 0.5;                 // 0 nozzle .. 1 tail
    let hw = s.c.x * mix(1.0, 0.34, tt);
    wp = s.a.xyz + dir * L * tt + side * corner.x * hw;
    uv = vec2f(corner.x, tt);
  } else if (shape == 4 || shape == 5) {
    wp = s.a.xyz + s.b.xyz * corner.x + s.c.xyz * corner.y;
  } else if (shape == 11) {
    // bay energy field: rectangle centre a, half-extent axes b, c (b.w = seconds since something pushed through)
    wp = s.a.xyz + s.b.xyz * corner.x + s.c.xyz * corner.y;
    uv = corner;
  } else if (shape == 10) {
    // thruster plume plane (one arm of a cross): nozzle a, exhaust axis b (full length), half-width vector c
    let tt = corner.y * 0.5 + 0.5;                 // 0 nozzle .. 1 tip
    wp = s.a.xyz + s.b.xyz * tt + s.c.xyz * corner.x * mix(1.0, 0.12, tt);   // cone: full nozzle width → thin tip
    uv = vec2f(corner.x, tt);
  } else {
    let r = s.b.x; let rot = s.b.y;
    let cs = vec2f(cos(rot), sin(rot));
    let c = vec2f(corner.x * cs.x - corner.y * cs.y, corner.x * cs.y + corner.y * cs.x);
    wp = s.a.xyz + (F.camRight.xyz * c.x + F.camUp.xyz * c.y) * r;
  }
  var o: VO;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  o.uv = uv; o.si = si; o.ext = ext;
  o.vz = o.pos.w;
  return o;
}

struct FO { @location(0) col: vec4f, @location(1) dist: vec4f };

fn softFade(p: vec4f, vz: f32, k: f32) -> f32 {
  let d = textureLoad(depthTex, vec2i(p.xy), 0);
  if (d <= 0.0) { return 1.0; }
  let sceneZ = linearDepth(d);
  return clamp((sceneZ - vz) / k, 0.0, 1.0);
}

@fragment fn fs(i: VO) -> FO {
  let s = S[i.si];
  let shape = i32(s.a.w);
  var o: FO;
  var col = vec3f(0.0);
  var alpha = 0.0;
  var dist = vec2f(0.0);
  let tint = s.d.rgb;
  let t = F.camPos.w;
  if (shape == 0) {
    // glow: core + halo
    let r = length(i.uv);
    if (r > 1.0) { discard; }
    let core = exp(-r * r * 18.0);
    let halo = exp(-r * 7.0) * (1.0 - r);
    col = tint * (core * 1.0 + halo * s.b.z * 0.45);
    col *= softFade(i.pos, i.vz, s.b.x * 0.5);
  } else if (shape == 1 || shape == 2) {
    // homeland-style fireball: metaball "cauliflower" (10 big + 20 small puffs), warped filaments,
    // baked fire ramp (white core -> yellow -> orange -> red), additive. age = b.z, seed = b.w
    let age = s.b.z; let seed = s.b.w;
    let rr0 = length(i.uv);
    if (rr0 > 1.0) { discard; }
    let ang = seed * 6.283 + age * (hash31(vec3f(seed, 1.0, 2.0)) - 0.5) * 1.4;
    let cs = cos(ang); let sn = sin(ang);
    var p = vec2f(i.uv.x * cs - i.uv.y * sn, i.uv.x * sn + i.uv.y * cs);
    let W = select(0.075, 0.05, shape == 2);
    p += (vec2f(vnoise(vec3f(p * 2.1, seed)), vnoise(vec3f(p * 2.1 + 3.7, seed))) - 0.5) * W * 2.0
       + (vec2f(vnoise(vec3f(p * 5.3, seed + 9.0)), vnoise(vec3f(p * 5.3 + 1.3, seed + 9.0))) - 0.5) * W * 0.9;
    var dens = 0.0;
    for (var k = 0; k < 10; k++) {
      let h = hash33(vec3f(seed, f32(k), 7.0));
      let th = h.x * 6.283; let rr = pow(h.y, 0.6) * 0.30;
      let c = vec2f(cos(th), sin(th)) * rr;
      let r = 0.26 * (0.62 + h.z * 0.7);
      let dv = p - c;
      dens += exp(-dot(dv, dv) / (r * r) * 1.35);
      // two small puffs clinging to each big one (fractal edge)
      for (var m = 0; m < 2; m++) {
        let g = hash33(vec3f(seed, f32(k), 11.0 + f32(m)));
        let th2 = g.x * 6.283; let d2 = r * (0.55 + g.y * 0.6);
        let c2 = c + vec2f(cos(th2), sin(th2)) * d2;
        let r2 = 0.13 * (0.5 + g.z * 0.85);
        let dv2 = p - c2;
        dens += exp(-dot(dv2, dv2) / (r2 * r2) * 1.35);
      }
    }
    dens = 1.0 - exp(-dens * 1.25);
    dens *= max(0.0, 1.0 - pow(length(p) / 0.97, 3.2));
    if (shape == 1) {
      // churning internal detail: turbulent fbm advected outward over the fireball's life
      let churn = fbm(vec3f(p * 5.5 + vec2f(seed, age * 1.7), age * 2.3 + seed), 4);
      let ridge = 1.0 - abs(vnoise(vec3f(p * 11.0, seed + age * 3.0)) * 2.0 - 1.0);
      let detail = 0.3 + churn * 0.95 + ridge * 0.35;
      var kk = clamp(dens * detail * (1.0 - age * 0.62), 0.0, 1.0);
      // hot pockets burst through near the core, cool faster at the rim
      kk *= mix(1.0, 0.55, smoothstep(0.35, 0.95, length(p)) * age);
      var ramp: vec3f;
      if (kk > 0.80) { ramp = vec3f(1.0); }
      else if (kk > 0.62) { let q = (kk - 0.62) / 0.18; ramp = vec3f(1.0, 0.86 + q * 0.14, 0.46 + q * 0.54); }
      else if (kk > 0.44) { let q = (kk - 0.44) / 0.18; ramp = vec3f(1.0, 0.52 + q * 0.34, 0.08 + q * 0.38); }
      else if (kk > 0.24) { let q = (kk - 0.24) / 0.20; ramp = vec3f(0.92 + q * 0.08, 0.20 + q * 0.32, 0.03 + q * 0.05); }
      else { let q = kk / 0.24; ramp = vec3f(0.42 + q * 0.50, 0.07 + q * 0.13, 0.02); }
      let fade = pow(max(1.0 - age, 0.0), 1.1);
      col = ramp * pow(kk, 1.6) * tint * s.d.a * fade * 1.7;
      // soot fringe: dark smoky edge that occludes what's behind (premultiplied), grows as it cools
      let soot = smoothstep(0.08, 0.35, dens) * (1.0 - smoothstep(0.35, 0.7, kk)) * smoothstep(0.1, 0.6, age);
      alpha = soot * 0.75 * s.d.a;
      col += vec3f(0.035, 0.028, 0.022) * alpha;
      // embers: tiny bright specks scattered in the cloud
      let ec = floor(p * 38.0);
      let eh = hash31(vec3f(ec, seed));
      let ep = fract(p * 38.0) - 0.5;
      let ember = step(0.965, eh) * exp(-dot(ep, ep) * 40.0) * dens * (1.0 - age) * (0.6 + 0.4 * sin(t * 30.0 + eh * 50.0));
      col += vec3f(3.0, 1.6, 0.5) * ember * s.d.a;
      dist = normalize(i.uv + 1e-5) * dens * fade * 0.008;
    } else {
      let kq = clamp((dens - 0.16) / 0.7, 0.0, 1.0);
      alpha = pow(kq, 1.45) * 0.6 * s.d.a * (1.0 - age);
      col = tint * (0.3 + dens * 0.34) * alpha;
    }
    let sf = softFade(i.pos, i.vz, s.b.x * 0.6);
    col *= sf; alpha *= sf;
  } else if (shape == 7) {
    // exhaust flame: along/across falloff, turbulence growing toward the tail, white-hot core near the nozzle
    let tt = i.uv.y; let cc = abs(i.uv.x);
    let along = smoothstep(1.0, 0.06, tt) * pow(1.0 - tt, 0.55);
    let across = smoothstep(1.0, 0.0, pow(cc, 1.35 - tt * 0.5));
    let sp = t * 9.0 * s.c.z;
    let nz = vnoise(vec3f(i.uv.x * 2.0, tt * 3.6 - sp, s.c.y)) * 0.55 + vnoise(vec3f(i.uv.x * 4.5, tt * 6.8 - sp * 1.6, s.c.y + 3.0)) * 0.3
           + vnoise(vec3f(i.uv.x * 9.5, tt * 10.4 - sp * 2.3, s.c.y + 7.0)) * 0.15;
    let turb = 1.0 + (nz - 0.5) * (0.25 + tt * 0.95);
    let core = exp(-pow(cc / 0.30, 2.0)) * pow(1.0 - tt, 2.0);
    let k = clamp(along * across * turb * 0.78 + core * 0.55, 0.0, 1.0);
    col = (tint * k + vec3f(1.0) * core * 0.8 * s.d.a) * s.d.a;
    alpha = 0.0;
    dist = vec2f(nz - 0.5, 0.0) * k * 0.004;
  } else if (shape == 11) {
    // translucent blue containment field: faint sheet, slow hex lattice, drifting scan bands, bright frame edges,
    // and a ripple ring spreading from the centre after something passes through (b.w = age, < 0 = none)
    let q = i.uv;
    let edge = max(abs(q.x), abs(q.y));
    let frameGlow = smoothstep(0.86, 1.0, edge);
    let hp = q * vec2f(18.0, 11.0);
    let hr = vec2f(1.0, 1.7320508);
    let ha = hp - hr * floor(hp / hr) - hr * 0.5;
    let hb = (hp - hr * 0.5) - hr * floor((hp - hr * 0.5) / hr) - hr * 0.5;
    let g = select(hb, ha, dot(ha, ha) < dot(hb, hb));
    let hd = max(dot(abs(g), normalize(vec2f(1.0, 1.7320508))), abs(g.x));
    let lattice = 1.0 - smoothstep(0.0, 0.04, abs(hd - 0.49));
    let band = 0.5 + 0.5 * sin(q.y * 14.0 - t * 2.2);
    let age = s.b.w;
    var ripple = 0.0;
    if (age >= 0.0 && age < 2.0) {
      let rd = length(q * vec2f(1.0, 0.62));
      ripple = exp(-pow((rd - age * 0.9) / 0.06, 2.0)) * (1.0 - age / 2.0) * 2.5 * smoothstep(0.08, 0.3, age);   // a ring from the start (no bright dot at the centre)
    }
    let sheet = 0.06 + 0.05 * band + 0.18 * lattice * (0.6 + 0.4 * band) + 0.9 * frameGlow + ripple;
    col = tint * sheet * s.d.a;
    alpha = 0.0;
    dist = q * 0.004 * (0.3 + ripple) * s.d.a;
  } else if (shape == 10) {
    // plume: white-hot core at the nozzle, tapering, fading to the tip; soft sides so the plane never reads as a card
    let x = i.uv.x; let tt = i.uv.y;
    // cone plume (additive): the thick first third is bright and glowing, it thins and turns transparent to the tip
    let w = 0.6;
    let across = exp(-pow(x / w, 2.0) * 2.0);
    let along = pow(1.0 - tt, 1.3) * smoothstep(0.0, 0.04, tt + 0.02);
    let hot = exp(-tt * 5.0);                                           // the thick section: additive hot glow
    let core = exp(-pow(x / 0.22, 2.0)) * pow(1.0 - tt, 3.0);
    col = (tint * across * along * (1.0 + 1.6 * hot) + tint * exp(-pow(x / 0.9, 2.0)) * hot * 0.8 + vec3f(1.0, 0.95, 0.9) * core * 0.7 * length(tint)) * s.d.a;
    alpha = 0.0;
    dist = vec2f(x, 0.0) * 0.004 * along * s.d.a;
  } else if (shape == 9) {
    // energy barrier: ONLY a regular blue hex grid, invisible at rest, lit where it is hit and fading as the
    // pulse spreads. c.xy = impact (disc uv), c.z = tear 0..1 (opening), c.w = seconds since hit, b.z = global flash
    let r = length(i.uv);
    if (r > 1.0) { discard; }
    let nz = sqrt(max(1.0 - r * r, 0.0));
    let imp = s.c.xy; let tear = s.c.z; let age = s.c.w;
    let rel = i.uv - imp;
    let pullK = tear * 0.22 * exp(-dot(rel * vec2f(1.2, 2.2), rel * vec2f(1.2, 2.2)) * 5.0);
    let uvp = i.uv - vec2f(rel.x / (abs(rel.x) + 0.04) * pullK, 0.0);
    let hp = uvp / max(nz + 0.25, 0.25) * 9.0;
    let hr = vec2f(1.0, 1.7320508);
    let ha = hp - hr * floor(hp / hr) - hr * 0.5;
    let hb = (hp - hr * 0.5) - hr * floor((hp - hr * 0.5) / hr) - hr * 0.5;
    let g = select(hb, ha, dot(ha, ha) < dot(hb, hb));
    let hd = max(dot(abs(g), normalize(vec2f(1.0, 1.7320508))), abs(g.x));
    let line = 1.0 - smoothstep(0.018, 0.0, abs(hd - 0.485));      // 0 on the hex border
    let edge = 1.0 - line;
    let di = length(uvp - imp);
    var pulse = 0.0;
    for (var k = 0; k < 3; k++) {
      let a = age - f32(k) * 0.09;
      if (a < 0.0 || a > 1.4) { continue; }
      pulse += exp(-pow((di - a * 1.1) / (0.03 + a * 0.05), 2.0)) * exp(-a * 3.2) * exp(-di * 3.8) * (1.0 - f32(k) * 0.3);
    }
    let hot = exp(-age * 4.0) * exp(-di * 8.0);
    var e = edge * (pulse * 2.4 + hot * 1.4 + s.b.z);
    // COLLAPSE (b.y = seconds since the barrier broke): a front races out from the tear; each cell flashes as the front
    // reaches it (small random delay), then blows out and fades — the grid visibly disintegrates from the wound outward
    let cl = s.b.y;
    if (cl > 0.0) {
      let cid = hp - g;
      let hsh = fract(sin(dot(floor(cid * 4.0 + 0.5), vec2f(12.9898, 78.233))) * 43758.5453);
      let lt = cl - (di * 0.42 + hsh * 0.12);
      let front = exp(-pow((di - cl / 0.42) / 0.05, 2.0));
      if (lt < 0.0) { e = edge * (0.35 + 0.4 * front) + e * 0.3; }
      else if (lt < 0.14) { e = edge * 5.0 + (1.0 - smoothstep(0.0, 0.45, length(g))) * 1.4 * (1.0 - lt / 0.14); }
      else { e = edge * 2.5 * exp(-(lt - 0.14) * 9.0); }
      e += front * 1.2;
    }
    if (tear > 0.001) {
      let ed = length(rel / vec2f(0.02 + tear * 0.3, 0.16 + tear * 0.1));
      e *= smoothstep(0.95, 1.05, ed);                                // opening: no hexes inside
      e += edge * exp(-max(ed - 1.0, 0.0) * 4.0) * tear * 1.8;       // hexes strained around it
    }
    col = tint * e * s.d.a;
    alpha = 0.0;
    dist = vec2f(0.0);
  } else if (shape == 8) {
    // refractive ripple ring (camera-facing): hyperspace rifts and blast wavefronts
    let r = length(i.uv);
    if (r > 1.0) { discard; }
    let ring = exp(-pow((r - 0.9) / 0.07, 2.0));
    let inner = smoothstep(0.9, 0.2, r) * 0.25;
    dist = normalize(i.uv + 1e-5) * (ring + inner * 0.3) * 0.045 * s.d.a;
    col = tint * ring * 0.12 * s.d.a;
    alpha = 0.0;
  } else if (shape == 6) {
    // heat haze: pure refraction, no colour
    let r = length(i.uv);
    if (r > 1.0) { discard; }
    let q = vec3f(i.uv * 3.0, s.b.w + t * 2.5);
    let g = vec2f(vnoise(q + vec3f(0.1, 0.0, 0.0)) - vnoise(q - vec3f(0.1, 0.0, 0.0)), vnoise(q + vec3f(0.0, 0.1, 0.0)) - vnoise(q - vec3f(0.0, 0.1, 0.0)));
    dist = g * s.d.a * 0.03 * smoothstep(1.0, 0.3, r);
  } else if (shape == 12) {
    // ARC DISCHARGE: a fractal lightning channel between the two terminals — mid-point-style multi-octave wander
    // pinned at both ends, a white-hot core with a coloured sheath and a wide ionisation glow, forked side branches,
    // re-striking at c.z Hz with a short crossfade (never a single-frame strobe). c.x = channel half-width (wander
    // room), c.y = seed
    let L = i.ext.x;
    let u = clamp(i.uv.x / max(L, 1e-3), 0.0, 1.0);
    let v = i.uv.y;
    let rate = max(s.c.z, 0.1);
    let ph = t * rate + s.c.y * 7.13;
    let k0 = floor(ph); let w = fract(ph);
    var lum = 0.0; var glow = 0.0;
    for (var ps = 0; ps < 2; ps++) {
      let sd = s.c.y * 13.7 + (k0 + f32(ps)) * 3.91;
      let wgt = select(1.0 - smoothstep(0.55, 1.0, w), smoothstep(0.0, 0.45, w), ps == 1);   // crossfade strikes
      if (wgt <= 0.001) { continue; }
      let pin = sin(3.14159 * u);
      // jagged: a piecewise-linear random walk (sharp kinks, like a real stepped leader) at two scales + fine noise
      var d = 0.0;
      let n1 = u * 9.0; let i1 = floor(n1);
      d += mix(hash31(vec3f(i1, sd, 1.0)), hash31(vec3f(i1 + 1.0, sd, 1.0)), fract(n1)) - 0.5;
      let n2 = u * 31.0; let i2 = floor(n2);
      d += (mix(hash31(vec3f(i2, sd, 2.0)), hash31(vec3f(i2 + 1.0, sd, 2.0)), fract(n2)) - 0.5) * 0.4;
      d += (vnoise(vec3f(u * 120.0, sd, 3.0)) - 0.5) * 0.08;
      d *= 0.7 * pin;                                                  // stays well inside the ribbon
      let dm = abs(v - d);
      let jitter = 0.85 + 0.15 * vnoise(vec3f(u * 40.0, t * 30.0, sd));                       // current flicker along it
      lum += (exp(-pow(dm / 0.045, 2.0)) * 1.6 + exp(-dm * 9.0) * 0.45) * wgt * jitter;
      glow += exp(-dm * 4.5) * 0.18 * wgt;
      // two forks leaving the main channel and dying out
      for (var b = 0; b < 2; b++) {
        let ub = 0.18 + 0.55 * hash31(vec3f(sd, f32(b), 1.0));
        if (u > ub) {
          let du = u - ub;
          let dirb = select(-1.0, 1.0, hash31(vec3f(sd, f32(b), 2.0)) > 0.5);
          var db = d + dirb * du * 1.6;
          db += (vnoise(vec3f(u * 12.0, sd + f32(b) * 9.0, 3.0)) - 0.5) * 0.35 * du * 3.0;
          let fade = 1.0 - smoothstep(0.0, 0.22, du);
          let dbm = abs(v - db);
          lum += (exp(-pow(dbm / 0.03, 2.0)) * 1.1 + exp(-dbm * 12.0) * 0.3) * fade * wgt;
        }
      }
    }
    let endK = (exp(-u * 60.0) + exp(-(1.0 - u) * 60.0)) * exp(-v * v * 30.0);   // hot terminal spots (round, not the whole ribbon)
    // soft window: nothing reaches the ribbon's edges or its capsule ends, so the quad boundary can never show
    let win = (1.0 - smoothstep(0.6, 0.95, abs(v))) * smoothstep(0.0, 0.02, u) * smoothstep(1.0, 0.98, u) * step(0.0, i.uv.x) * step(i.uv.x, L);
    col = (vec3f(1.0, 0.97, 1.0) * clamp(lum - 0.9, 0.0, 3.0) * 0.8 + tint * (lum + glow) + tint * endK * 0.6) * s.d.a * win;
    alpha = 0.0;
    dist = vec2f(0.0, v) * glow * 0.01 * s.d.a * win;
  } else if (shape == 3) {
    // beam capsule: uv.x along (world units), uv.y across (-1..1)
    let L = i.ext.x; let r = i.ext.y;
    let ax = i.uv.x;
    var dd = abs(i.uv.y);
    if (ax < 0.0) { dd = length(vec2f(ax / r, i.uv.y)); }
    if (ax > L) { dd = length(vec2f((ax - L) / r, i.uv.y)); }
    if (dd > 1.0) { discard; }
    let sharp = s.c.y;
    let core = exp(-dd * dd * sharp);
    let glow = exp(-dd * 5.0) * (1.0 - dd);
    let flow = 0.85 + 0.15 * sin(ax * 0.15 - t * 60.0 * s.c.w);
    col = (vec3f(1.0) * core * core * 0.9 + tint * (core + glow * 0.8)) * s.d.a * flow;
    let nz = vnoise(vec3f(ax * 0.05, dd * 3.0, t * 8.0)) - 0.5;
    dist = vec2f(nz, i.uv.y) * glow * s.c.z * 0.02;
  } else if (shape == 4) {
    // shock ring (oriented quad), b/c = axes, d.a = ring position 0..1
    let r = length(i.uv);
    if (r > 1.0) { discard; }
    let rp = s.d.a;
    let th = 0.035;
    let ring = exp(-pow((r - rp) / th, 2.0));
    let ang = atan2(i.uv.y, i.uv.x);
    let n = vnoise(vec3f(ang * 6.0, r * 8.0, t));
    col = tint * ring * (0.3 + 0.5 * n) * (1.0 - rp * 0.6) * 0.5;
    dist = normalize(i.uv + 1e-5) * ring * 0.025 * (1.0 - rp);
  } else if (shape == 5) {
    // hyperspace window: glowing rectangular frame + faint sheet
    let q = abs(i.uv);
    let e = max(q.x, q.y);
    if (e > 1.0) { discard; }
    let frame = exp(-pow((1.0 - e) * 30.0, 2.0)) + exp(-(1.0 - e) * 12.0) * 0.12;
    let sheet = 0.004 + 0.012 * vnoise(vec3f(i.uv * 6.0, t * 3.0));
    let scan = 0.5 + 0.5 * sin(i.uv.y * 60.0 + t * 20.0);
    col = tint * (frame * 1.6 + sheet * (0.6 + 0.4 * scan)) * s.d.a;
    dist = i.uv * 0.01 * s.d.a * (1.0 - e);
  }
  o.col = vec4f(sane(col), clamp(alpha, 0.0, 1.0));
  o.dist = vec4f(select(dist, vec2f(0.0), dist != dist), 0.0, 0.0);
  return o;
}
`;

// ---------------------------------------------------------------- post: lens / distortion
export const POST_COMMON = /* wgsl */ `
// NaN → 0, ±inf clamped: one bad HDR pixel must never blow up into a full-screen bloom flash
fn sane(c: vec3f) -> vec3f { return clamp(select(c, vec3f(0.0), c != c), vec3f(0.0), vec3f(64.0)); }

struct Post {
  lensA: vec4f,   // uv.xy, thetaE (in screen-height units), horizon radius
  lensA2: vec4f,  // swirl, linear depth, glow strength, enable
  lensB: vec4f,
  lensB2: vec4f,
  godray: vec4f,  // uv.xy, intensity, decay
  a: vec4f,       // exposure, bloom, CA, grain
  b: vec4f,       // fade (0 = black), flash, letterbox, vignette
  c: vec4f,       // distortion scale, anamorphic streak, time, saturation
  grade: vec4f,   // shadows tint rgb, contrast
  gradeHi: vec4f, // highlights tint rgb, shake blur
  screen: vec4f,  // w, h, motion-blur strength, unused
  prevVP: mat4x4f,
  invVP: mat4x4f,
  dof: vec4f,     // focus distance, focus range, max blur (uv), enable
  radial: vec4f,  // radial zoom blur: centre uv, strength, enable
  intf: vec4f,    // signal interference: strength, time seed, berserk red-flood amount, motion-blur subject mask distance (m)
  flare: vec4f,   // sun lens flare: screen uv, intensity, enable
};
@group(0) @binding(0) var<uniform> P: Post;
@group(0) @binding(1) var smp: sampler;

struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  var o: VO; o.pos = vec4f(p, 0.0, 1.0); o.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); return o;
}
`;

export const LENS = POST_COMMON + /* wgsl */ `
@group(0) @binding(2) var sceneTex: texture_2d<f32>;
@group(0) @binding(3) var distTex: texture_2d<f32>;
@group(0) @binding(4) var depthTex: texture_depth_2d;
@group(0) @binding(5) var<uniform> near_far: vec4f;

fn linD(d: f32) -> f32 { return near_far.x * near_far.y / (d * (near_far.y - near_far.x) + near_far.x); }

fn applyLens(uv: vec2f, L: vec4f, L2: vec4f, pixDepth: f32, glow: ptr<function, vec3f>, hole: ptr<function, f32>) -> vec2f {
  if (L2.w <= 0.0) { return uv; }
  let asp = P.screen.x / P.screen.y;
  var r = (uv - L.xy) * vec2f(asp, 1.0);
  let d = max(length(r), 1e-4);
  // only lens what lies behind the lens plane
  let behind = smoothstep(L2.y * 0.85, L2.y * 1.05, pixDepth);
  let thE = L.z * L2.w;
  let defl = thE * thE / d;
  let ang = L2.x * thE / (d + thE * 0.5) * behind;
  let cs = cos(ang); let sn = sin(ang);
  r = vec2f(r.x * cs - r.y * sn, r.x * sn + r.y * cs);
  let src = r - normalize(r) * defl * behind;
  let hr = L.w * L2.w;
  if (hr > 0.0) {
    *hole = max(*hole, (1.0 - smoothstep(hr * 0.92, hr * 1.02, d)) * behind);
    let ringc = exp(-pow((d - hr * 1.1) / (hr * 0.035), 2.0));
    let disk = exp(-pow((d - hr * 1.6) / (hr * 0.45), 2.0)) * (0.6 + 0.4 * sin(atan2(r.y, r.x) * 3.0 + P.c.z * 2.0));
    *glow += (vec3f(1.2, 0.8, 1.6) * ringc * 1.1 + vec3f(0.55, 0.22, 1.0) * disk * 0.3) * L2.z;
  }
  return L.xy + src / vec2f(asp, 1.0);
}

@fragment fn fs(i: VO) -> @location(0) vec4f {
  var uv = i.uv;
  let dims = vec2f(textureDimensions(sceneTex));
  let dd = textureLoad(distTex, vec2i(uv * dims), 0).xy;
  uv += dd * P.c.x;
  let pd = textureLoad(depthTex, vec2i(uv * dims), 0);
  let pixDepth = select(1e9, linD(pd), pd > 0.0);
  var glow = vec3f(0.0);
  var hole = 0.0;
  uv = applyLens(uv, P.lensA, P.lensA2, pixDepth, &glow, &hole);
  uv = applyLens(uv, P.lensB, P.lensB2, pixDepth, &glow, &hole);
  // mirror-wrap to avoid edge smear
  uv = 1.0 - abs(1.0 - abs(uv));
  var col = sane(textureSampleLevel(sceneTex, smp, uv, 0.0).rgb);
  // depth of field: gather blur sized by the circle of confusion
  if (P.dof.w > 0.5) {
    let coc = clamp(abs(pixDepth - P.dof.x) / max(P.dof.y, 1e-3), 0.0, 1.0) * P.dof.z;
    if (coc > 0.0004) {
      var acc = col; var wsum = 1.0;
      for (var k = 0; k < 16; k++) {
        let a = f32(k) * 2.39996;
        let rr = sqrt((f32(k) + 0.5) / 16.0);
        let o = vec2f(cos(a), sin(a)) * rr * coc * vec2f(P.screen.y / P.screen.x, 1.0);
        let sd = textureLoad(depthTex, vec2i((uv + o) * dims), 0);
        let sz = select(1e9, linD(sd), sd > 0.0);
        let sc = clamp(abs(sz - P.dof.x) / max(P.dof.y, 1e-3), 0.0, 1.0);
        let w = select(1.0, sc, sz < pixDepth);                 // sharp foreground shouldn't bleed into the blur
        acc += textureSampleLevel(sceneTex, smp, uv + o, 0.0).rgb * w; wsum += w;
      }
      col = acc / wsum;
    }
  }
  // camera motion blur by reprojection (180-degree shutter): no ghost copies, off across cuts
  if (P.screen.z > 0.0) {
    let ndc = vec2f(i.uv.x * 2.0 - 1.0, 1.0 - i.uv.y * 2.0);
    let dd = max(pd, 1e-7);
    let wp4 = P.invVP * vec4f(ndc, dd, 1.0);
    let pp = P.prevVP * vec4f(wp4.xyz / wp4.w, 1.0);
    if (pp.w > 0.0) {
      let prevUV = vec2f(pp.x / pp.w * 0.5 + 0.5, 0.5 - pp.y / pp.w * 0.5);
      var vel = (i.uv - prevUV) * 0.5 * P.screen.z;
      let vl = length(vel);
      if (vl > 0.04 * max(P.screen.z, 1.0)) { vel = vel / vl * 0.04 * max(P.screen.z, 1.0); }
      // tracked subject (closer than intf.w metres) stays crisp: the camera moves WITH it, so reprojection blur is wrong there
      if (P.intf.w > 0.0) { vel *= smoothstep(P.intf.w * 0.8, P.intf.w * 1.6, pixDepth); }
      // with depth of field on, the tracked (in-focus) subject stays crisp and only the background streaks
      if (P.dof.w > 0.5) { vel *= smoothstep(0.15, 0.7, clamp(abs(pixDepth - P.dof.x) / max(P.dof.y, 1e-3), 0.0, 1.0)); }
      let jit = fract(52.9829189 * fract(dot(i.pos.xy, vec2f(0.06711056, 0.00583715)))) - 0.5;
      if (length(vel) > 0.0008) {
        var acc = col;
        for (var k = 1; k <= 8; k++) {
          let o = (f32(k) + jit) / 8.0 * 2.0 - 1.0;
          acc += textureSampleLevel(sceneTex, smp, uv - vel * o * 0.5, 0.0).rgb;
        }
        col = acc / 9.0;
      }
    }
  }
  col = col * (1.0 - hole) + glow;
  return vec4f(col, 1.0);
}
`;

export const BLOOM = POST_COMMON + /* wgsl */ `
@group(0) @binding(2) var src: texture_2d<f32>;
@fragment fn down(i: VO) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  let uv = i.uv;
  var c = textureSampleLevel(src, smp, uv, 0.0).rgb * 0.125;
  c += (textureSampleLevel(src, smp, uv + ts * vec2f(-1, -1), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(1, -1), 0.0).rgb +
        textureSampleLevel(src, smp, uv + ts * vec2f(-1, 1), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(1, 1), 0.0).rgb) * 0.125;
  c += (textureSampleLevel(src, smp, uv + ts * vec2f(-2, -2), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(2, -2), 0.0).rgb +
        textureSampleLevel(src, smp, uv + ts * vec2f(-2, 2), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(2, 2), 0.0).rgb) * 0.03125;
  c += (textureSampleLevel(src, smp, uv + ts * vec2f(-2, 0), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(2, 0), 0.0).rgb +
        textureSampleLevel(src, smp, uv + ts * vec2f(0, -2), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(0, 2), 0.0).rgb) * 0.0625;
  return vec4f(min(c, vec3f(4000.0)), 1.0);
}
@fragment fn up(i: VO) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  let uv = i.uv;
  var c = textureSampleLevel(src, smp, uv, 0.0).rgb * 4.0;
  c += (textureSampleLevel(src, smp, uv + ts * vec2f(-1, 0), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(1, 0), 0.0).rgb +
        textureSampleLevel(src, smp, uv + ts * vec2f(0, -1), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(0, 1), 0.0).rgb) * 2.0;
  c += textureSampleLevel(src, smp, uv + ts * vec2f(-1, -1), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(1, -1), 0.0).rgb +
       textureSampleLevel(src, smp, uv + ts * vec2f(-1, 1), 0.0).rgb + textureSampleLevel(src, smp, uv + ts * vec2f(1, 1), 0.0).rgb;
  return vec4f(c / 16.0, 1.0);
}
`;

export const FINAL = POST_COMMON + /* wgsl */ `
@group(0) @binding(2) var sceneTex: texture_2d<f32>;
@group(0) @binding(3) var bloom0: texture_2d<f32>;
@group(0) @binding(4) var bloom2: texture_2d<f32>;

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
fn h12(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453); }

@fragment fn fs(i: VO) -> @location(0) vec4f {
  let uv = i.uv;
  let asp = P.screen.x / P.screen.y;
  // letterbox 2.39:1 (b.z = amount 0..1)
  let lbAsp = 1.0 / 2.39 * asp;
  let bar = (1.0 - min(lbAsp, 1.0)) * 0.5 * P.b.z;
  if (uv.y < bar || uv.y > 1.0 - bar) { return vec4f(0.0, 0.0, 0.0, 1.0); }
  // BERSERK: red flood, digital glitch bands, vertical jitter (P.screen.w = strength)
  var guv = uv;
  let bz = P.screen.w;
  if (bz > 0.0) {
    let band = floor(uv.y * 38.0);
    let g = h12(vec2f(band, floor(P.c.z * 24.0)));
    if (g > 1.0 - 0.28 * bz) { guv.x += (h12(vec2f(band, P.c.z)) - 0.5) * 0.06 * bz; }
    guv.y += (h12(vec2f(floor(P.c.z * 30.0), 3.0)) - 0.5) * 0.01 * bz;
    // STRAIN (bz > 1): blocky datamosh tiles, heavy horizontal tearing, frame roll
    let over = clamp(bz - 1.0, 0.0, 1.0);
    if (over > 0.0) {
      let tile = floor(uv * vec2f(16.0, 9.0));
      let tr = h12(tile + floor(P.c.z * 18.0));
      if (tr > 1.0 - over * 0.22) { guv += (vec2f(h12(tile + 3.1), h12(tile + 7.7)) - 0.5) * 0.08 * over; }
      let slab = h12(vec2f(floor(uv.y * 12.0), floor(P.c.z * 20.0)));
      if (slab > 1.0 - over * 0.3) { guv.x += (slab - 0.5) * 0.18 * over; }
      guv.y = fract(guv.y + step(0.93, h12(vec2f(floor(P.c.z * 10.0), 1.0))) * 0.06 * over);
    }
  }
  // chromatic aberration grows toward edges
  let cc = guv - 0.5;
  let ca = P.a.z * (0.2 + dot(cc, cc) * 3.0);
  var col = vec3f(
    textureSampleLevel(sceneTex, smp, guv + cc * (ca + bz * 0.02), 0.0).r,
    textureSampleLevel(sceneTex, smp, guv, 0.0).g,
    textureSampleLevel(sceneTex, smp, guv - cc * (ca + bz * 0.02), 0.0).b);
  // radial zoom blur toward a point (falling into the well): streaks grow with distance from the centre
  if (P.radial.w > 0.5) {
    let dv = guv - P.radial.xy;
    var acc = col; var wsum = 1.0;
    let jit = h12(uv * P.screen.xy + P.c.z) - 0.5;
    for (var k = 1; k <= 12; k++) {
      let s = (f32(k) + jit) / 12.0 * P.radial.z;
      let w = 1.0 - f32(k) / 14.0;
      acc += textureSampleLevel(sceneTex, smp, guv - dv * s, 0.0).rgb * w; wsum += w;
    }
    col = acc / wsum;
  }
  // GRAVITY ANOMALY near the well (replaces the old line-noise interference): space itself misbehaves —
  // gravitational-wave ripples run out from the well, frame-dragging shears the image round it, light is red/blue-
  // shifted radially (not a horizontal RGB split), and a faint time-dilation echo trails every edge outward
  if (P.intf.x > 0.0) {
    let it = P.intf.x;
    let tm = P.intf.y;
    let ctr = select(vec2f(0.5), P.radial.xy, P.radial.w > 0.5);
    let asp = vec2f(P.screen.x / P.screen.y, 1.0);
    let dv = (guv - ctr) * asp;
    let r = length(dv) + 1e-4;
    let dir = dv / r;
    // ripples: travelling rings, stronger mid-frame, soft near the centre so the subject stays readable
    let wave = sin(r * 38.0 - tm * 5.5) * 0.6 + sin(r * 17.0 - tm * 2.3 + 1.7) * 0.4;
    let fall = smoothstep(0.03, 0.25, r) * exp(-r * 1.4);
    var off = dir * wave * fall * 0.010 * it;
    // frame dragging: a slow swirl whose twist grows toward the well
    let ang = it * 0.06 / (r * 3.0 + 0.4) * sin(tm * 0.7 + r * 4.0);
    let rot = vec2f(dv.x * cos(ang) - dv.y * sin(ang), dv.x * sin(ang) + dv.y * cos(ang)) - dv;
    off += rot;
    let base = guv + off / asp;
    // radial gravitational shift: red stretched outward, blue pulled inward
    let cs = dir / asp * 0.006 * it * smoothstep(0.02, 0.4, r);
    let rs = textureSampleLevel(sceneTex, smp, base + cs, 0.0).r;
    let gs = textureSampleLevel(sceneTex, smp, base, 0.0).g;
    let bs = textureSampleLevel(sceneTex, smp, base - cs, 0.0).b;
    // time-dilation echo: a faint ghost displaced outward along the gravity gradient
    let echo = textureSampleLevel(sceneTex, smp, base + dir / asp * 0.018 * it, 0.0).rgb;
    let warped = vec3f(rs, gs, bs) * (1.0 - 0.18 * it) + echo * vec3f(0.55, 0.7, 1.0) * 0.18 * it;
    col = mix(col, warped, clamp(it * 2.2, 0.0, 1.0));
    // the crest of each ripple briefly bends a little more light toward the lens: a faint bright ring
    col *= 1.0 + max(wave, 0.0) * fall * 0.12 * it;
  }
  // shake blur
  if (P.gradeHi.w > 0.0) {
    var acc = col;
    for (var k = 1; k <= 6; k++) {
      let o = vec2f(sin(f32(k) * 2.4 + P.c.z * 30.0), cos(f32(k) * 1.7 + P.c.z * 27.0)) * P.gradeHi.w * f32(k) / 6.0;
      acc += textureSampleLevel(sceneTex, smp, uv + o, 0.0).rgb;
    }
    col = acc / 7.0;
  }
  let bl = textureSampleLevel(bloom0, smp, uv, 0.0).rgb;
  col += bl * P.a.y;
  // anamorphic streak (horizontal smear of a low bloom mip)
  if (P.c.y > 0.0) {
    var st = vec3f(0.0);
    for (var k = -8; k <= 8; k++) {
      let w = exp(-abs(f32(k)) * 0.28);
      st += textureSampleLevel(bloom2, smp, uv + vec2f(f32(k) * 0.018, 0.0), 0.0).rgb * w;
    }
    col += st * vec3f(0.45, 0.6, 1.0) * P.c.y * 0.08;
  }
  // SUN LENS FLARE (shader): round glare + fine starburst + chromatic ghosts along the sun→centre line + halo ring
  if (P.flare.w > 0.5) {
    let asp2 = vec2f(P.screen.x / P.screen.y, 1.0);
    let sp = P.flare.xy;
    let d = (uv - sp) * asp2;
    let r = length(d);
    let onS = smoothstep(0.0, 0.1, min(sp.x, sp.y)) * smoothstep(0.0, 0.1, min(1.0 - sp.x, 1.0 - sp.y));   // fully gone by the time the sun reaches the frame edge (no stray ghosts)
    let I = P.flare.z * onS;
    let ang = atan2(d.y, d.x);
    let rays = pow(abs(sin(ang * 6.0 + 0.4)), 40.0) * 0.6 + pow(abs(sin(ang * 11.0 + 1.3)), 70.0) * 0.4;
    var fl = vec3f(1.0, 0.92, 0.8) * exp(-r * 38.0) * 3.0                       // hot core
           + vec3f(1.0, 0.7, 0.42) * (exp(-r * r * 60.0) * 0.28 + exp(-r * 5.0) * 0.06)   // warm glare: soft gaussian + faint wide tail (no hard-edged disc)
           + vec3f(1.0, 0.75, 0.5) * rays * exp(-r * 9.0) * 0.35;               // starburst (short, subtle)
    let axis = vec2f(0.5) - sp;
    for (var k = 0; k < 5; k++) {
      let f = array<f32, 5>(0.45, 0.7, 1.05, 1.35, 1.7)[k];
      let rad = array<f32, 5>(0.035, 0.018, 0.06, 0.028, 0.09)[k];
      let tintk = array<vec3f, 5>(vec3f(0.9, 0.55, 0.25), vec3f(0.35, 0.7, 0.5), vec3f(0.3, 0.4, 0.9), vec3f(0.9, 0.4, 0.6), vec3f(0.4, 0.55, 0.9))[k];
      let gp = sp + axis * f;
      let gd = length((uv - gp) * asp2) / rad;
      fl += tintk * (smoothstep(1.0, 0.75, gd) * 0.08 + exp(-pow((gd - 0.95) * 9.0, 2.0)) * 0.05);
    }
    let hr = length((uv - (sp + axis * 1.0)) * asp2);
    fl += vec3f(0.45, 0.6, 0.9) * exp(-pow((hr - 0.32) * 28.0, 2.0)) * 0.03;          // halo ring
    col += fl * I;
  }
  // god rays: radial march over bloom toward light
  if (P.godray.z > 0.0) {
    var gr = vec3f(0.0);
    let dlt = (uv - P.godray.xy) / 48.0;
    var suv = uv; var wgt = 1.0;
    for (var k = 0; k < 48; k++) {
      suv -= dlt;
      gr += textureSampleLevel(bloom2, smp, suv, 0.0).rgb * wgt;
      wgt *= P.godray.w;
    }
    col += gr / 48.0 * P.godray.z;
  }
  col += vec3f(P.b.y * 0.7);          // flash as light (before tonemap), not a post-gamma grey wash
  col *= P.a.x;
  // grade: split toning
  let lum = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  col = mix(col * P.grade.rgb, col * P.gradeHi.rgb, smoothstep(0.02, 1.2, lum));
  col = aces(col);
  let l2 = dot(col, vec3f(0.2126, 0.7152, 0.0722));
  col = mix(vec3f(l2), col, P.c.w);
  col = clamp((col - 0.5) * P.grade.w + 0.5, vec3f(0.0), vec3f(1.0));
  // vignette
  let v = 1.0 - dot(cc * vec2f(1.0, 1.25), cc * vec2f(1.0, 1.25)) * P.b.w;
  col *= v;
  // grain
  let g = h12(uv * P.screen.xy + fract(P.c.z * 7.13) * 100.0) - 0.5;
  col += g * P.a.w * (0.4 + 0.6 * (1.0 - l2));
  if (bz > 0.0) {
    let lum0 = dot(col, vec3f(0.3, 0.55, 0.15));
    col = mix(col, vec3f(lum0 * 1.35, lum0 * 0.25, lum0 * 0.18) + col * vec3f(0.35, 0.05, 0.05), min(bz * 0.55, 0.75) * P.intf.z);   // intf.z = red-flood amount
    col *= 1.0 - bz * 0.25 * step(0.5, fract(uv.y * P.screen.y * 0.5));   // scanlines
  }
  col = mix(vec3f(0.0), col, P.b.x);
  col = pow(max(col, vec3f(0.0)), vec3f(1.0 / 2.2));
  return vec4f(col, 1.0);
}
`;

export const BLIT = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  return vec4f(p, 0.0, 1.0);
}
@fragment fn fs(@builtin(position) p: vec4f) -> @location(0) vec4f {
  return vec4f(textureLoad(src, vec2i(p.xy), 0).rgb, 1.0);
}
`;

// ---------------------------------------------------------------- planet / sun as real sphere meshes
export const CELESTIAL = COMMON + /* wgsl */ `
struct Body { a: vec4f, b: vec4f };   // a = centre.xyz, radius ; b = kind (0 gas,1 earth,2 moon,3 sun), spin, _, _
@group(0) @binding(1) var<storage, read> B: array<Body>;
@group(0) @binding(2) var esmp: sampler;
@group(0) @binding(3) var eDN: texture_2d<f32>;
@group(0) @binding(4) var eCl: texture_2d<f32>;
struct VO { @builtin(position) pos: vec4f, @location(0) n: vec3f, @location(1) @interpolate(flat) bi: u32 };
@vertex fn vs(@location(0) p: vec3f, @builtin(instance_index) bi: u32) -> VO {
  let b = B[bi];
  var o: VO;
  o.pos = F.viewProj * vec4f(b.a.xyz + p * b.a.w, 1.0);
  o.n = p; o.bi = bi;
  return o;
}
const PI2 = 3.14159265;
fn eUV(n: vec3f, spin: f32) -> vec2f {
  let lat = asin(clamp(n.y, -1.0, 1.0));
  let lon = atan2(n.x, n.z) + spin;
  return vec2f(lon / (2.0 * PI2) + 0.5, 0.5 - lat / PI2);
}
fn craters(n: vec3f, scale: f32, seed: f32) -> vec2f {
  let p = n * scale; let c = floor(p);
  var bowl = 0.0; var rim = 0.0;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { for (var z = -1; z <= 1; z++) {
    let cell = c + vec3f(f32(x), f32(y), f32(z));
    let h = hash33(cell + seed);
    if (h.x > 0.5) { continue; }
    let r = 0.2 + 0.45 * h.y;
    let d = length(p - (cell + h)) / r;
    bowl += 1.0 - smoothstep(0.0, 1.0, d);
    rim += exp(-pow((d - 1.0) / 0.13, 2.0));
  } } }
  return vec2f(bowl, rim);
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let b = B[i.bi];
  let kind = i32(b.b.x);
  let n = normalize(i.n);
  let L = F.sunDir.xyz;
  let ndl = dot(n, L);
  let V = normalize(F.camPos.xyz - (b.a.xyz + n * b.a.w));
  let limb = pow(max(dot(n, V), 0.0), 0.4);
  var col = vec3f(0.0);
  if (kind == 3) {
    return vec4f(F.sunCol.rgb * 30.0 * (0.8 + 0.2 * limb), 1.0);
  }
  let term = smoothstep(-0.06, 0.18, ndl);
  let rimAtm = pow(1.0 - max(dot(n, V), 0.0), 4.0);
  if (kind == 2) {
    // cratered grey moon: maria, three crater octaves, and one great impact scar with radial ejecta
    let q = n * 2.5;
    let maria = smoothstep(0.45, 0.62, fbm(q + 3.0, 5));
    var alb = mix(0.46, 0.27, maria) * (0.85 + 0.3 * fbm(n * 18.0, 3));
    let c1 = craters(n, 7.0, 1.0); let c2 = craters(n, 19.0, 7.0); let c3 = craters(n, 48.0, 13.0);
    let bowl = c1.x * 0.5 + c2.x * 0.35 + c3.x * 0.2;
    let rim = c1.y * 0.35 + c2.y * 0.25 + c3.y * 0.12;
    let C = normalize(vec3f(-0.55, 0.35, -0.75));
    let ca = acos(clamp(dot(n, C), -1.0, 1.0));
    let ang = atan2(dot(cross(C, vec3f(0.0, 1.0, 0.0)), n), dot(cross(C, vec3f(1.0, 0.0, 0.0)), n));
    let ray = pow(vnoise(vec3f(ang * 14.0, 0.0, 3.0)), 3.0) * smoothstep(0.55, 0.2, ca) * smoothstep(0.12, 0.2, ca);
    let scarBowl = 1.0 - smoothstep(0.0, 0.14, ca);
    let scarRim = exp(-pow((ca - 0.14) / 0.02, 2.0));
    alb = alb * (1.0 - scarBowl * 0.25) + ray * 0.22 + scarRim * 0.2;
    let relief = clamp(1.0 - bowl * 0.4 * (1.0 - max(ndl, 0.0)) + rim * 0.5 * max(ndl, 0.0), 0.3, 1.6);
    col = vec3f(alb) * vec3f(1.0, 0.98, 0.95) * max(ndl, 0.0) * 1.35 * relief * limb;
    col += vec3f(alb) * vec3f(0.35, 0.42, 0.55) * 0.05 * (1.0 - term);    // earthshine
  } else if (kind == 1) {
    let dn = textureSampleLevel(eDN, esmp, eUV(n, b.b.y), 0.0);
    let cloud = textureSampleLevel(eCl, esmp, eUV(n, b.b.y * 1.6 + 0.01), 0.0).r;
    let dayAlb = pow(dn.rgb, vec3f(2.2)) * 0.9;
    let ocean = smoothstep(0.02, 0.0, dayAlb.r - dayAlb.b * 0.7);
    let alb = mix(dayAlb, vec3f(0.85, 0.87, 0.9), cloud * 0.92);
    col = alb * max(ndl, 0.0) * 1.25 * limb;
    let spec = pow(max(dot(reflect(-L, n), V), 0.0), 80.0) * ocean * (1.0 - cloud) * 1.2;
    col += vec3f(1.0, 0.85, 0.65) * spec * term;
    col += alb * vec3f(0.35, 0.42, 0.55) * 0.035 * limb * (1.0 - term);
    col += vec3f(1.0, 0.62, 0.28) * pow(dn.a, 1.6) * 0.9 * (1.0 - term) * (1.0 - cloud * 0.85);
    col += vec3f(0.3, 0.55, 1.0) * rimAtm * 0.9 * smoothstep(-0.12, 0.35, ndl);
    // dawn corona: forward-scattered sunlight along the rim near the terminator (sunrise over the limb)
    let fwdScat = pow(max(dot(-V, L), 0.0), 6.0);
    col += vec3f(1.0, 0.78, 0.5) * pow(1.0 - max(dot(n, V), 0.0), 7.0) * exp(-abs(ndl) * 14.0) * (0.4 + 3.5 * fwdScat);
  } else {
    let bands = fbm(vec3f(n.y * 9.0 + fbm(n * 4.0, 3) * 0.8, n.x * 0.7, n.z * 0.7), 4);
    let alb = mix(F.planetCol.rgb * 0.25, F.planetCol.rgb * 0.9, smoothstep(0.3, 0.7, bands));
    col = alb * max(ndl, 0.0) * 0.9 * limb + F.planetCol.rgb * rimAtm * 0.3 * term;
  }
  // haze over the disc so the planet sits in the same air as the backdrop
  col = mix(col, F.sky.rgb * 2.0, clamp(F.sky.w * 0.25, 0.0, 0.4) * (1.0 - limb));
  return vec4f(col, 1.0);
}
`;
