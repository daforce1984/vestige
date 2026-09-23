// GLB loader: flattens a glTF scene into "parts" (animatable nodes) with geometry grouped per material.
// Geometry is baked into each part's local space so a part can be posed by a single matrix.
import { M } from './math.js';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readAccessor(gl, bin, idx) {
  const acc = gl.accessors[idx];
  const bv = gl.bufferViews[acc.bufferView];
  const T = COMP[acc.componentType];
  const nc = NCOMP[acc.type];
  const stride = bv.byteStride || 0;
  const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new (T === Float32Array ? Float32Array : Uint32Array)(acc.count * nc);
  if (!stride || stride === nc * T.BYTES_PER_ELEMENT) {
    const src = new T(bin.buffer, bin.byteOffset + base, acc.count * nc);
    out.set(src);
  } else {
    const dv = new DataView(bin.buffer, bin.byteOffset);
    for (let i = 0; i < acc.count; i++)
      for (let c = 0; c < nc; c++) {
        const o = base + i * stride + c * T.BYTES_PER_ELEMENT;
        out[i * nc + c] = T === Float32Array ? dv.getFloat32(o, true) : T === Uint16Array ? dv.getUint16(o, true) : T === Uint8Array ? dv.getUint8(o) : dv.getUint32(o, true);
      }
  }
  return out;
}

function nodeLocal(n) {
  if (n.matrix) return Float32Array.from(n.matrix);
  return M.fromTRS(M.new(), n.translation || [0, 0, 0], n.rotation || [0, 0, 0, 1], n.scale || [1, 1, 1]);
}

function normalMatrix(m) {
  // inverse-transpose of upper 3x3 (returned as 9 floats, column-major)
  const inv = M.invert(M.new(), m);
  return [inv[0], inv[4], inv[8], inv[1], inv[5], inv[9], inv[2], inv[6], inv[10]];
}

/**
 * @param {ArrayBuffer} buf GLB
 * @param {Set<string>} keep node names that stay separately animatable
 * returns { parts, materials, empties, verts: Float32Array(pos3,nrm3), indices: Uint32Array, bounds }
 */
export function parseGLB(buf, keep = new Set()) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const chunk = new Uint8Array(buf, off + 8, len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  const gl = json;
  const materials = (gl.materials || []).map((m) => {
    const pbr = m.pbrMetallicRoughness || {};
    const es = m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
    const e = m.emissiveFactor || [0, 0, 0];
    return {
      name: m.name || '',
      base: (pbr.baseColorFactor || [0.8, 0.8, 0.8, 1]).slice(0, 3),
      metal: pbr.metallicFactor ?? 1,
      rough: pbr.roughnessFactor ?? 1,
      emissive: [e[0] * es, e[1] * es, e[2] * es],
    };
  });
  if (!materials.length) materials.push({ name: 'default', base: [0.7, 0.7, 0.7], metal: 0, rough: 0.6, emissive: [0, 0, 0] });

  const nodes = gl.nodes || [];
  const parent = new Array(nodes.length).fill(-1);
  nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)));
  const world = new Array(nodes.length);
  const computeWorld = (i) => {
    if (world[i]) return world[i];
    const l = nodeLocal(nodes[i]);
    world[i] = parent[i] >= 0 ? M.mul(M.new(), computeWorld(parent[i]), l) : l;
    return world[i];
  };
  nodes.forEach((_, i) => computeWorld(i));

  // parts: index 0 = model root (identity)
  const parts = [{ name: '__root', parent: -1, rest: M.new(), worldRest: M.new(), groups: [] }];
  const partOfNode = new Array(nodes.length).fill(-1);
  const resolvePart = (i) => {
    if (i < 0) return 0;
    if (partOfNode[i] >= 0) return partOfNode[i];
    let p;
    if (keep.has(nodes[i].name)) {
      const pp = resolvePart(parent[i]);
      const rest = M.mul(M.new(), M.invert(M.new(), parts[pp].worldRest), world[i]);
      p = parts.length;
      parts.push({ name: nodes[i].name, parent: pp, rest, worldRest: world[i], groups: [] });
    } else p = resolvePart(parent[i]);
    partOfNode[i] = p;
    return p;
  };
  nodes.forEach((_, i) => resolvePart(i));

  // empties / named nodes: position relative to their part
  const empties = {};
  nodes.forEach((n, i) => {
    if (!n.name) return;
    const p = partOfNode[i];
    const rel = M.mul(M.new(), M.invert(M.new(), parts[p].worldRest), world[i]);
    empties[n.name] = { part: p, pos: [rel[12], rel[13], rel[14]], mat: rel };
  });

  // geometry: bucket[part][material] -> {pos[], nrm[], idx[]}
  const buckets = new Map();
  const bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
  nodes.forEach((n, ni) => {
    if (n.mesh === undefined) return;
    const p = partOfNode[ni];
    const toPart = M.mul(M.new(), M.invert(M.new(), parts[p].worldRest), world[ni]);
    const nm = normalMatrix(toPart);
    for (const prim of gl.meshes[n.mesh].primitives) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const pos = readAccessor(gl, bin, prim.attributes.POSITION);
      const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(gl, bin, prim.attributes.NORMAL) : null;
      const uvs = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(gl, bin, prim.attributes.TEXCOORD_0) : null;
      const vc = pos.length / 3;
      let idx = prim.indices !== undefined ? readAccessor(gl, bin, prim.indices) : Uint32Array.from({ length: vc }, (_, k) => k);
      const key = p + ':' + (prim.material ?? 0);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { part: p, mat: prim.material ?? 0, v: [], i: [], vc: 0 }));
      const base = b.vc;
      const wp = world[ni];
      for (let k = 0; k < vc; k++) {
        const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
        const px = toPart[0] * x + toPart[4] * y + toPart[8] * z + toPart[12];
        const py = toPart[1] * x + toPart[5] * y + toPart[9] * z + toPart[13];
        const pz = toPart[2] * x + toPart[6] * y + toPart[10] * z + toPart[14];
        let nx = 0, ny = 1, nz = 0;
        if (nrm) {
          const a = nrm[k * 3], bb = nrm[k * 3 + 1], c = nrm[k * 3 + 2];
          nx = nm[0] * a + nm[3] * bb + nm[6] * c; ny = nm[1] * a + nm[4] * bb + nm[7] * c; nz = nm[2] * a + nm[5] * bb + nm[8] * c;
          const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        }
        b.v.push(px, py, pz, nx, ny, nz, uvs ? uvs[k * 2] : 0, uvs ? uvs[k * 2 + 1] : 0);
        // bounds in model (rest world) space
        const wx = wp[0] * x + wp[4] * y + wp[8] * z + wp[12], wy = wp[1] * x + wp[5] * y + wp[9] * z + wp[13], wz = wp[2] * x + wp[6] * y + wp[10] * z + wp[14];
        if (wx < bmin[0]) bmin[0] = wx; if (wy < bmin[1]) bmin[1] = wy; if (wz < bmin[2]) bmin[2] = wz;
        if (wx > bmax[0]) bmax[0] = wx; if (wy > bmax[1]) bmax[1] = wy; if (wz > bmax[2]) bmax[2] = wz;
      }
      for (let k = 0; k < idx.length; k++) b.i.push(idx[k] + base);
      b.vc += vc;
    }
  });

  // concatenate
  let vTotal = 0, iTotal = 0;
  for (const b of buckets.values()) { vTotal += b.v.length; iTotal += b.i.length; }
  const verts = new Float32Array(vTotal), indices = new Uint32Array(iTotal);
  let vo = 0, io = 0;
  for (const b of buckets.values()) {
    verts.set(b.v, vo);
    const baseVertex = vo / 8;
    for (let k = 0; k < b.i.length; k++) indices[io + k] = b.i[k] + baseVertex;
    parts[b.part].groups.push({ mat: b.mat, first: io, count: b.i.length });
    vo += b.v.length; io += b.i.length;
  }
  return { parts, materials, empties, verts, indices, bounds: { min: bmin, max: bmax } };
}
