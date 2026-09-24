// WebGPU renderer for the film.
// Memory policy: every GPU buffer / texture / bind group is created at init() or on resize().
// The frame loop only calls queue.writeBuffer() into preallocated buffers from preallocated typed arrays.
// Resize destroys the previous size-dependent textures explicitly; dispose() tears everything down.
import { BG, MESH, DEPTH_RESOLVE, SPRITE, LENS, BLOOM, FINAL, BLIT, CELESTIAL } from './shaders.js';
import { M, V, Q } from './math.js';
import { parseGLB } from './gltf.js';

const MAX_INST = 16384;
const INST_FLOATS = 60;
const MAX_SPRITES = 40000;
const MAX_LIGHTS = 16;
const FRAME_BYTES = 512 + 512;  // 3 mat4 + 20 vec4 + 32 light vec4
const POST_FLOATS = 92;
const BLOOM_LEVELS = 6;
const SAMPLES = 4;
const HDR = 'rgba16float';

// uniform load-time scale: vertices, part rest transforms, empties and bounds (everything derived stays consistent)
function scaleGLB(g, k) {
  for (let i = 0; i < g.verts.length; i += 8) { g.verts[i] *= k; g.verts[i + 1] *= k; g.verts[i + 2] *= k; }
  for (const p of g.parts) { for (const m of [p.rest, p.worldRest]) { m[12] *= k; m[13] *= k; m[14] *= k; } }
  for (const n in g.empties) { const e = g.empties[n]; e.pos = e.pos.map((v) => v * k); e.mat[12] *= k; e.mat[13] *= k; e.mat[14] *= k; }
  g.bounds.min = g.bounds.min.map((v) => v * k); g.bounds.max = g.bounds.max.map((v) => v * k);
}

// front-to-back triangle order inside every draw group (by centroid along `axis`, e.g. [1,0,0] = +X first) so early-Z
// rejects hidden layers — used for the interior bay, which is always seen from outside the starboard hull
function sortTriangles(g, axis) {
  const V = g.verts, I = g.indices;
  for (const p of g.parts) for (const gr of p.groups) {
    const n = gr.count / 3, key = new Float32Array(n), ord = new Uint32Array(n);
    for (let t = 0; t < n; t++) {
      let k = 0;
      for (let j = 0; j < 3; j++) { const v = I[gr.first + t * 3 + j] * 8; k += V[v] * axis[0] + V[v + 1] * axis[1] + V[v + 2] * axis[2]; }
      key[t] = -k; ord[t] = t;
    }
    ord.sort((a, b) => key[a] - key[b]);
    const src = I.slice(gr.first, gr.first + gr.count);
    for (let t = 0; t < n; t++) for (let j = 0; j < 3; j++) I[gr.first + t * 3 + j] = src[ord[t] * 3 + j];
  }
  // groups themselves: nearest (largest mean projection) first
  for (const p of g.parts) p.groups.sort((a, b) => {
    const m = (gr) => { let k = 0; for (let i = 0; i < gr.count; i += 3) { const v = I[gr.first + i] * 8; k += V[v] * axis[0] + V[v + 1] * axis[1] + V[v + 2] * axis[2]; } return k / Math.max(1, gr.count / 3); };
    return m(b) - m(a);
  });
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.models = {};
    this.modelList = [];
    this.renderScale = 1;
    this.sizeRes = [];           // size-dependent GPU resources (destroyed on resize)
    this.frameData = new Float32Array(FRAME_BYTES / 4);
    this.postData = new Float32Array(POST_FLOATS);
    this.instData = new Float32Array(MAX_INST * INST_FLOATS);
    this.sprData = new Float32Array(MAX_SPRITES * 16);
    this.nSprites = 0;
    this.lights = [];
    for (let i = 0; i < 64; i++) this.lights.push({ p: [0, 0, 0], r: 0, c: [0, 0, 0], w: 0 });
    this.nLights = 0;
    this.nearFar = new Float32Array(4);
    this.stats = { draws: 0, inst: 0, sprites: 0 };
    this._tmpM = M.new(); this._tmpM2 = M.new(); this._q = [0, 0, 0, 1];
  }

  async init() {
    if (!navigator.gpu) throw new Error('WebGPU not available');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('no GPU adapter');
    this.device = await adapter.requestDevice({
      requiredLimits: { maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 256 << 20) },
    });
    const dev = this.device;
    dev.lost.then((info) => { console.error('GPU device lost:', info.message); this.lost = true; });
    dev.onuncapturederror = (e) => console.error('WebGPU error:', e.error.message);
    this.ctx = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: dev, format: this.format, alphaMode: 'opaque' });

    this.frameUBO = dev.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.postUBO = dev.createBuffer({ size: POST_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.nearFarUBO = dev.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.instBuf = dev.createBuffer({ size: this.instData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.sprBuf = dev.createBuffer({ size: this.sprData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.linSmp = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.cmpSmp = dev.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
    this.shadowSize = 4096;
    this.shadowTex = dev.createTexture({ size: [this.shadowSize, this.shadowSize], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.shadowView = this.shadowTex.createView();

    const mod = (code, label) => {
      const m = dev.createShaderModule({ code, label });
      m.getCompilationInfo().then((ci) => ci.messages.forEach((msg) => { if (msg.type === 'error') console.error(label, msg.lineNum + ':' + msg.linePos, msg.message); }));
      return m;
    };
    const bgMod = mod(BG, 'bg'), meshMod = mod(MESH, 'mesh'), drMod = mod(DEPTH_RESOLVE, 'depthResolve'),
      sprMod = mod(SPRITE, 'sprite'), lensMod = mod(LENS, 'lens'), bloomMod = mod(BLOOM, 'bloom'), finalMod = mod(FINAL, 'final');

    const vbLayout = [{ arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x2' }] }];
    const msaa = { count: SAMPLES };
    this.bgPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'bg',
      vertex: { module: bgMod, entryPoint: 'vs' },
      fragment: { module: bgMod, entryPoint: 'fs', targets: [{ format: HDR }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
      multisample: msaa,
    });
    this.meshBGL = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const meshLayout = dev.createPipelineLayout({ bindGroupLayouts: [this.meshBGL] });
    this.meshPipe = dev.createRenderPipeline({
      layout: meshLayout, label: 'mesh',
      vertex: { module: meshMod, entryPoint: 'vs', buffers: vbLayout },
      fragment: { module: meshMod, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: msaa,
    });
    // depth prepass + depth-equal shading for models flagged `prepass` (early-Z despite `discard` in the mesh shader)
    this.depthPrePipe = dev.createRenderPipeline({
      layout: meshLayout, label: 'mesh-depth-pre',
      vertex: { module: meshMod, entryPoint: 'vs', buffers: vbLayout },
      fragment: { module: meshMod, entryPoint: 'fsDepth', targets: [{ format: HDR, writeMask: 0 }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
      multisample: msaa,
    });
    this.meshEqPipe = dev.createRenderPipeline({
      layout: meshLayout, label: 'mesh-equal',
      vertex: { module: meshMod, entryPoint: 'vs', buffers: vbLayout },
      fragment: { module: meshMod, entryPoint: 'fs', targets: [{ format: HDR }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'equal' },
      multisample: msaa,
    });
    this.shadowBGL = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.shadowPipe = dev.createRenderPipeline({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [this.shadowBGL] }), label: 'shadow',
      vertex: { module: meshMod, entryPoint: 'vsShadow', buffers: [{ arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.0 },
    });
    this.drPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'depthResolve',
      vertex: { module: drMod, entryPoint: 'vs' },
      fragment: { module: drMod, entryPoint: 'fs', targets: [] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'always' },
    });
    const premul = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    const addB = { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } };
    this.sprPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'sprite',
      vertex: { module: sprMod, entryPoint: 'vs' },
      fragment: { module: sprMod, entryPoint: 'fs', targets: [{ format: HDR, blend: premul }, { format: 'rg16float', blend: addB }] },
      depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' },
    });
    this.lensPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'lens',
      vertex: { module: lensMod, entryPoint: 'vs' },
      fragment: { module: lensMod, entryPoint: 'fs', targets: [{ format: HDR }] },
    });
    this.downPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'bloomDown',
      vertex: { module: bloomMod, entryPoint: 'vs' },
      fragment: { module: bloomMod, entryPoint: 'down', targets: [{ format: HDR }] },
    });
    this.upPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'bloomUp',
      vertex: { module: bloomMod, entryPoint: 'vs' },
      fragment: { module: bloomMod, entryPoint: 'up', targets: [{ format: HDR, blend: addB }] },
    });
    // shutter accumulation: final pass writes weight 1/N of each sub-frame into an HDR accumulator
    const accB = { color: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'constant', dstFactor: 'one', operation: 'add' } };
    this.accumPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'finalAccum',
      vertex: { module: finalMod, entryPoint: 'vs' },
      fragment: { module: finalMod, entryPoint: 'fs', targets: [{ format: HDR, blend: accB }] },
    });
    const blitMod = mod(BLIT, 'blit');
    this.blitPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'present',
      vertex: { module: blitMod, entryPoint: 'vs' },
      fragment: { module: blitMod, entryPoint: 'fs', targets: [{ format: this.format }] },
    });
    this.finalPipe = dev.createRenderPipeline({
      layout: 'auto', label: 'final',
      vertex: { module: finalMod, entryPoint: 'vs' },
      fragment: { module: finalMod, entryPoint: 'fs', targets: [{ format: this.format }] },
    });

    // model textures (mechs): [hero albedo, hero orm, enemy albedo, enemy orm]; 1x1 placeholders until loaded
    this.texSmp = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat', maxAnisotropy: 8 });
    this.modelTex = [0, 1, 2, 3].map(() => dev.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT }));
    this._makeMeshBG();
    this.shadowBG = dev.createBindGroup({
      layout: this.shadowBGL,
      entries: [{ binding: 0, resource: { buffer: this.frameUBO } },
        { binding: 1, resource: { buffer: this.instBuf } }],
    });
    // planet textures: 1x1 placeholders until loadPlanet() replaces them
    this.earthSmp = dev.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'clamp-to-edge' });
    this.earthDN = dev.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    this.earthCl = dev.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    // celestial bodies: one shared UV sphere, drawn per body with its own shading kind
    {
      const SEG = 128, RING = 64, pos = [], idx = [];
      for (let r = 0; r <= RING; r++) {
        const th = (r / RING) * Math.PI;
        for (let sgi = 0; sgi <= SEG; sgi++) {
          const ph = (sgi / SEG) * Math.PI * 2;
          pos.push(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph));
        }
      }
      for (let r = 0; r < RING; r++) for (let sgi = 0; sgi < SEG; sgi++) {
        const a = r * (SEG + 1) + sgi, b = a + SEG + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
      this.celVB = dev.createBuffer({ size: pos.length * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      dev.queue.writeBuffer(this.celVB, 0, new Float32Array(pos));
      this.celIB = dev.createBuffer({ size: idx.length * 4, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      dev.queue.writeBuffer(this.celIB, 0, new Uint32Array(idx));
      this.celCount = idx.length;
      this.celData = new Float32Array(16);
      this.celBuf = dev.createBuffer({ size: 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      this.skyPipe = dev.createRenderPipeline({
        layout: 'auto', label: 'skySphere',
        vertex: { module: bgMod, entryPoint: 'vsSphere', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
        fragment: { module: bgMod, entryPoint: 'fsSphere', targets: [{ format: HDR }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'always' },
        multisample: msaa,
      });
      const celMod = mod(CELESTIAL, 'celestial');
      this.celPipe = dev.createRenderPipeline({
        layout: 'auto', label: 'celestial',
        vertex: { module: celMod, entryPoint: 'vs', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
        fragment: { module: celMod, entryPoint: 'fs', targets: [{ format: HDR }] },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' },
        multisample: msaa,
      });
    }
    this._makeBgBG();
    this.resize();
    this._onResize = () => { this._needResize = true; };
    window.addEventListener('resize', this._onResize);
  }

  _makeMeshBG() {
    this.meshBG = this.device.createBindGroup({
      layout: this.meshBGL,
      entries: [{ binding: 0, resource: { buffer: this.frameUBO } }, { binding: 1, resource: { buffer: this.instBuf } },
        { binding: 2, resource: this.shadowView }, { binding: 3, resource: this.cmpSmp }, { binding: 4, resource: this.texSmp },
        ...this.modelTex.map((tx, k) => ({ binding: 5 + k, resource: tx.createView() }))],
    });
  }
  /** load model textures (slot 0/1 hero albedo/orm, 2/3 enemy albedo/orm). Missing files keep the placeholder. */
  async loadModelTextures(urls) {
    const dev = this.device;
    await Promise.all(urls.map(async (url, k) => {
      try {
        const r = await fetch(url); if (!r.ok) return;
        const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const tex = dev.createTexture({ size: [bmp.width, bmp.height], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
        dev.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex }, [bmp.width, bmp.height]);
        bmp.close();
        this.modelTex[k].destroy(); this.modelTex[k] = tex;
        this.texLoaded = (this.texLoaded || 0) | (1 << k);
      } catch (e) { /* keep placeholder */ }
    }));
    this._makeMeshBG();
  }
  _makeBgBG() {
    this.skyBG = this.device.createBindGroup({
      layout: this.skyPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.frameUBO } }, { binding: 1, resource: this.earthSmp },
        { binding: 2, resource: this.earthDN.createView() }, { binding: 3, resource: this.earthCl.createView() }],
    });
    this.celBG = this.device.createBindGroup({
      layout: this.celPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.frameUBO } }, { binding: 1, resource: { buffer: this.celBuf } }, { binding: 2, resource: this.earthSmp },
        { binding: 3, resource: this.earthDN.createView() }, { binding: 4, resource: this.earthCl.createView() }],
    });
    this.bgBG = this.device.createBindGroup({
      layout: this.bgPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.frameUBO } }, { binding: 1, resource: this.earthSmp },
        { binding: 2, resource: this.earthDN.createView() }, { binding: 3, resource: this.earthCl.createView() }],
    });
  }

  /** Load planet maps once. Old placeholder textures are destroyed; ImageBitmaps are closed after upload. */
  async loadPlanet(dayNightUrl, cloudsUrl) {
    const dev = this.device;
    const load = async (url, fmt) => {
      const bmp = await createImageBitmap(await (await fetch(url)).blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const tex = dev.createTexture({ size: [bmp.width, bmp.height], format: fmt, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
      dev.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex }, [bmp.width, bmp.height]);
      bmp.close();
      return tex;
    };
    const [dn, cl] = await Promise.all([load(dayNightUrl, 'rgba8unorm'), load(cloudsUrl, 'rgba8unorm')]);
    this.earthDN.destroy(); this.earthCl.destroy();
    this.earthDN = dn; this.earthCl = cl;
    this._makeBgBG();
  }

  // ---------------------------------------------------------------- models
  async loadModels(specs) {
    // specs: [{name, url, keep:[...], detail}]
    const parsed = (await Promise.all(specs.map(async (s) => {
      try {
        const r = await fetch(s.url);
        if (!r.ok) throw new Error(r.status);
        const g = parseGLB(await r.arrayBuffer(), new Set(s.keep || []));
        if (s.scale && s.scale !== 1) scaleGLB(g, s.scale);
        if (s.sortAxis) sortTriangles(g, s.sortAxis);
        return { s, g };
      } catch (e) { console.warn('model missing:', s.url, e.message); return null; }
    }))).filter(Boolean);
    let vTotal = 0, iTotal = 0;
    for (const { g } of parsed) { vTotal += g.verts.length; iTotal += g.indices.length; }
    const verts = new Float32Array(vTotal), idx = new Uint32Array(iTotal);
    let vo = 0, io = 0;
    for (const { s, g } of parsed) {
      verts.set(g.verts, vo); idx.set(g.indices, io);
      const model = {
        name: s.name, detail: s.detail ?? 1, hullClass: s.hullDetail ? { hull: 1, plate: 2, hull2: 3, greeble: 4, trim: 5 } : null, parts: g.parts, materials: g.materials, empties: g.empties, bounds: g.bounds,
        baseVertex: vo / 8, baseIndex: io, entries: [], partIndex: {}, draws: [], prepass: !!s.prepass,
      };
      // engine nozzle faces are drawn as glow sprites too; keep the surface emission modest so they don't bloom into disks
      // PBR remap for hull paints: darker albedo, some metalness, tighter roughness (ships read too bright/flat before)
      for (const mt of g.materials) {
        const em = mt.emissive[0] + mt.emissive[1] + mt.emissive[2];
        if (em > 0.01 || /glass|window|eye|core|engine/i.test(mt.name)) continue;
        const lum = 0.3 * mt.base[0] + 0.59 * mt.base[1] + 0.11 * mt.base[2];
        if (mt.metal < 0.5) { mt.metal = Math.max(mt.metal, lum > 0.35 ? 0.45 : 0.3); mt.rough = Math.min(Math.max(mt.rough, 0.3), 0.55); }
        mt.base = mt.base.map((v) => v * (lum > 0.45 ? 0.62 : 0.8));
      }
      if (s.metalize) for (const mt of g.materials) {
        if (mt.emissive[0] + mt.emissive[1] + mt.emissive[2] > 0.01) continue;
        mt.metal = 0.85; mt.rough = Math.min(Math.max(mt.rough, 0.3), 0.45); mt.base = mt.base.map((v) => Math.min(0.26, Math.max(0.1, v * 0.4)));   // dark gunmetal bay
      }
      for (const mt of g.materials) if (/^core/i.test(mt.name)) mt.emissive = mt.emissive.map((v) => v * 0.18);
      for (const mt of g.materials) if (/^engine/i.test(mt.name)) { mt.emissive = mt.emissive.map((v) => v * 0.06); mt.base = mt.base.map((v) => v * 0.15); mt.metal = 0.9; }
      g.parts.forEach((p, i) => { model.partIndex[p.name] = i; });
      g.parts.forEach((p, pi) => p.groups.forEach((gr) => model.draws.push({ part: pi, mat: g.materials[gr.mat], first: gr.first, count: gr.count, matName: g.materials[gr.mat].name })));
      model.partWorld = g.parts.map(() => M.new());
      model.poseQ = g.parts.map(() => [0, 0, 0, 1]);
      model.tris = g.indices.length / 3;
      this.models[s.name] = model;
      this.modelList.push(model);
      model.emitPoints = {};
      for (const mname of ['engine', 'muzzle', 'eye']) model.emitPoints[mname] = emissiveClusters(g, mname);
      vo += g.verts.length; io += g.indices.length;
    }
    const dev = this.device;
    this.vbuf = dev.createBuffer({ size: verts.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(this.vbuf, 0, verts);
    this.ibuf = dev.createBuffer({ size: idx.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
    dev.queue.writeBuffer(this.ibuf, 0, idx);
    return this.models;
  }

  // ---------------------------------------------------------------- size-dependent resources
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(64, Math.floor(this.canvas.clientWidth * dpr * this.renderScale));
    const h = Math.max(64, Math.floor(this.canvas.clientHeight * dpr * this.renderScale));
    if (w === this.width && h === this.height) return;
    for (const t of this.sizeRes) t.destroy();
    this.sizeRes.length = 0;
    this.width = w; this.height = h;
    this.canvas.width = w; this.canvas.height = h;
    const dev = this.device;
    const tex = (fmt, size, usage, samples = 1) => {
      const t = dev.createTexture({ size, format: fmt, usage, sampleCount: samples });
      this.sizeRes.push(t);
      return t;
    };
    const RA = GPUTextureUsage.RENDER_ATTACHMENT, TB = GPUTextureUsage.TEXTURE_BINDING;
    this.msColor = tex(HDR, [w, h], RA, SAMPLES);
    this.msDepth = tex('depth32float', [w, h], RA | TB, SAMPLES);
    this.hdr = tex(HDR, [w, h], RA | TB);
    this.depth1 = tex('depth32float', [w, h], RA | TB);
    this.dist = tex('rg16float', [w, h], RA | TB);
    this.scene2 = tex(HDR, [w, h], RA | TB);
    this.bloom = [];
    let bw = w, bh = h;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      this.bloom.push(tex(HDR, [bw, bh], RA | TB));
    }
    this.views = {
      msColor: this.msColor.createView(), msDepth: this.msDepth.createView(), hdr: this.hdr.createView(),
      depth1: this.depth1.createView(), dist: this.dist.createView(), scene2: this.scene2.createView(),
      bloom: this.bloom.map((b) => b.createView()),
    };
    const V_ = this.views;
    this.drBG = dev.createBindGroup({ layout: this.drPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: V_.msDepth }] });
    this.sprBG = dev.createBindGroup({
      layout: this.sprPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.frameUBO } }, { binding: 1, resource: { buffer: this.sprBuf } }, { binding: 2, resource: V_.depth1 }],
    });
    this.lensBG = dev.createBindGroup({
      layout: this.lensPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.postUBO } }, { binding: 1, resource: this.linSmp }, { binding: 2, resource: V_.hdr },
        { binding: 3, resource: V_.dist }, { binding: 4, resource: V_.depth1 }, { binding: 5, resource: { buffer: this.nearFarUBO } }],
    });
    const bl = (pipe, src) => dev.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [{ binding: 1, resource: this.linSmp }, { binding: 2, resource: src }],
    });
    this.downBG = [bl(this.downPipe, V_.scene2), ...V_.bloom.slice(0, -1).map((v) => bl(this.downPipe, v))];
    this.upBG = V_.bloom.map((v) => bl(this.upPipe, v));
    this.accum = tex(HDR, [w, h], RA | TB);
    this.views.accum = this.accum.createView();
    this.blitBG = dev.createBindGroup({ layout: this.blitPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.views.accum }] });
    const finalEntries = [{ binding: 0, resource: { buffer: this.postUBO } }, { binding: 1, resource: this.linSmp }, { binding: 2, resource: V_.scene2 },
      { binding: 3, resource: V_.bloom[0] }, { binding: 4, resource: V_.bloom[2] }];
    this.accumBG = dev.createBindGroup({ layout: this.accumPipe.getBindGroupLayout(0), entries: finalEntries });
    this.finalBG = dev.createBindGroup({
      layout: this.finalPipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.postUBO } }, { binding: 1, resource: this.linSmp }, { binding: 2, resource: V_.scene2 },
        { binding: 3, resource: V_.bloom[0] }, { binding: 4, resource: V_.bloom[2] }],
    });
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    for (const t of this.sizeRes) t.destroy();
    this.sizeRes.length = 0;
    for (const b of [this.frameUBO, this.postUBO, this.nearFarUBO, this.instBuf, this.sprBuf, this.vbuf, this.ibuf]) b?.destroy();
    this.shadowTex?.destroy(); this.modelTex?.forEach((x) => x.destroy()); this.earthDN?.destroy(); this.earthCl?.destroy(); this.celVB?.destroy(); this.celIB?.destroy(); this.celBuf?.destroy();
    this.device?.destroy();
  }

  // ---------------------------------------------------------------- per-frame scene API
  begin() {
    for (const m of this.modelList) m.entries.length = 0;
    this.nSprites = 0;
    this.nLights = 0;
    if (!this._entryPool) { this._entryPool = []; for (let i = 0; i < 4096; i++) this._entryPool.push(newEntry()); }
    this._entryUsed = 0;
  }

  /** add a model instance. Returns an entry whose fields can be tweaked (flash, damage, reveal*, pose...) */
  add(name, matrix) {
    const model = this.models[name];
    if (!model) return null;
    const e = this._entryPool[this._entryUsed++] || newEntry();
    e.m.set(matrix);
    e.flash = 0; e.damage = 0; e.revealDir = 0; e.revealZ = 0; e.revealWidth = 1; e.emissive = 1; e.seed = model.entries.length * 7.13;
    e.tint[0] = 0.4; e.tint[1] = 0.7; e.tint[2] = 1.0;
    e.pose = null; e.hidden = null; e.matOverride = null;
    e.dmgR = 0; e.clip = null; e.clipHeat = 1; e.clipInv = false; e.stretch = 0; e.stretchOut = false; e.stretchAnchor = undefined; e.wear = 0; e.texSet = 0; e.crush = null; e.melt = null; e.shadeK = 1; e.soot = 0; e.hideMats = null;
    model.entries.push(e);
    return e;
  }

  // shape 0 glow, 1 fireball, 2 smoke, 3 beam, 4 ring, 5 hyperspace window
  sprite(shape, a, b, c, col, alpha) {
    if (this.nSprites >= MAX_SPRITES) return;
    const o = this.nSprites++ * 16, d = this.sprData;
    d[o] = a[0]; d[o + 1] = a[1]; d[o + 2] = a[2]; d[o + 3] = shape;
    d[o + 4] = b[0]; d[o + 5] = b[1]; d[o + 6] = b[2]; d[o + 7] = b[3] || 0;
    d[o + 8] = c[0]; d[o + 9] = c[1]; d[o + 10] = c[2]; d[o + 11] = c[3] || 0;
    d[o + 12] = col[0]; d[o + 13] = col[1]; d[o + 14] = col[2]; d[o + 15] = alpha;
  }
  glow(p, radius, col, halo = 0.6) { this.sprite(0, p, [radius, 0, halo, 0], Z4, col, 0); }
  fire(p, radius, age, seed, col = ONE, opacity = 1) { this.sprite(1, p, [radius, seed * 3.1, age, seed], Z4, col, opacity); }
  smoke(p, radius, age, seed, col, opacity = 1) { this.sprite(2, p, [radius, seed * 3.1, age, seed], Z4, col, opacity); }
  beam(p0, p1, radius, col, intensity = 1, sharp = 20, distort = 0, flow = 1) { this.sprite(3, p0, [p1[0], p1[1], p1[2], 0], [radius, sharp, distort, flow], col, intensity); }
  arc(p0, p1, halfWidth, col, intensity = 1, seed = 0, rate = 9) { this.sprite(12, p0, [p1[0], p1[1], p1[2], 0], [halfWidth, seed, rate, 0], col, intensity); }   // arc discharge (shader lightning)
  ring(center, axU, axV, col, phase) { this.sprite(4, center, axU, axV, col, phase); }
  bayField(center, axU, axV, age, col, intensity) { this.sprite(11, center, [axU[0], axU[1], axU[2], age], axV, col, intensity); }
  plume(nozzle, axis, halfW, col, intensity) { this.sprite(10, nozzle, axis, halfW, col, intensity); }
  flame(nozzle, axisLen, halfWidth, col, intensity, seed = 0, speed = 1) { this.sprite(7, nozzle, axisLen, [halfWidth, seed, speed, 0], col, intensity); }
  shield(p, radius, impactUV, flash, tear, hitAge, col, intensity, collapse = 0) { this.sprite(9, p, [radius, collapse, flash, 0], [impactUV[0], impactUV[1], tear, hitAge], col, intensity); }
  ripple(p, radius, col, strength) { this.sprite(8, p, [radius, 0, 0, 0], Z4, col, strength); }
  haze(p, radius, strength, seed = 0) { this.sprite(6, p, [radius, seed, 0, seed], Z4, Z4, strength); }
  hyperWindow(center, axU, axV, col, intensity) { this.sprite(5, center, axU, axV, col, intensity); }

  light(p, radius, col, intensity) {
    if (this.nLights >= this.lights.length) return;
    const l = this.lights[this.nLights++];
    l.p[0] = p[0]; l.p[1] = p[1]; l.p[2] = p[2]; l.r = radius;
    l.c[0] = col[0] * intensity; l.c[1] = col[1] * intensity; l.c[2] = col[2] * intensity; l.w = intensity * radius;
  }

  /** world-space position of a named empty on an entry (after pose). */
  emptyWorld(out, name, entry, emptyName) {
    const model = this.models[name];
    const em = model.empties[emptyName];
    if (!em) return M.transformPoint(out, entry.m, [0, 0, 0]);
    this._partMatrices(model, entry);
    return M.transformPoint(out, model.partWorld[em.part], em.pos);
  }
  partWorld(name, entry, partName) {
    const model = this.models[name];
    this._partMatrices(model, entry);
    return model.partWorld[model.partIndex[partName] ?? 0];
  }

  _partMatrices(model, e) {
    const parts = model.parts;
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      if (p === 0) {
        model.partWorld[0].set(e.m);
        if (e.stretch > 0.001) {           // hyperspace stretch: long along the local forward axis, thinner across
          // anchored: arrivals keep the BOW where the ship ends up (the stretch trails behind); departures keep the STERN
          const w = model.partWorld[0], z = 1 + e.stretch;
          const za = e.stretchAnchor ?? (e.stretchOut ? model.bounds.min[2] : model.bounds.max[2]);
          for (let k = 0; k < 3; k++) { w[12 + k] += w[8 + k] * za * (1 - z); w[8 + k] *= z; }
        }
        continue;
      }
      const pw = model.partWorld[part.parent];
      const pr = e.pose && e.pose[part.name];
      if (pr) {
        Q.fromEuler(this._q, pr[0], pr[1], pr[2]);
        M.fromTRS(this._tmpM, [0, 0, 0], this._q, 1);
        M.mul(this._tmpM2, part.rest, this._tmpM);
        M.mul(model.partWorld[p], pw, this._tmpM2);
      } else M.mul(model.partWorld[p], pw, part.rest);
    }
  }

  // ---------------------------------------------------------------- render
  /**
   * sub/of: shutter sub-frame index and count. With of > 1, each call accumulates 1/of of the image;
   * the canvas is presented after the last sub-frame.
   */
  render(cam, env, post, sub = 0, of = 1) {
    if (this.lost) return;
    if (this._needResize) { this._needResize = false; this.resize(); }
    const dev = this.device;
    const W = this.width, H = this.height;
    // camera
    const view = this._view || (this._view = M.new()), proj = this._proj || (this._proj = M.new());
    const vp = this._vp || (this._vp = M.new()), ivp = this._ivp || (this._ivp = M.new());
    M.lookAt(view, cam.pos, cam.target, cam.up);
    const near = cam.near || 0.5, far = cam.far || 200000;
    M.perspective(proj, cam.fov, W / H, near, far);
    M.mul(vp, proj, view);
    M.invert(ivp, vp);

    // ---- instances
    let n = 0;
    const draws = this._draws || (this._draws = []);
    draws.length = 0;
    const I = this.instData;
    for (const model of this.modelList) {
      const ents = model.entries;
      if (!ents.length) continue;
      // compute part matrices for all entries -> store per entry
      for (const e of ents) {
        this._partMatrices(model, e);
        if (!e.partM || e.partM.length < model.parts.length) e.partM = model.parts.map(() => new Float32Array(16));
        for (let p = 0; p < model.parts.length; p++) e.partM[p].set(model.partWorld[p]);
      }
      for (const d of model.draws) {
        const first = n;
        for (const e of ents) {
          if (n >= MAX_INST) break;
          if (e.hidden && e.hidden[model.parts[d.part].name]) continue;
          if (e.hideMats && e.hideMats[d.matName]) continue;          // per-entry material hiding (e.g. craft replaced by live models)
          const o = n * INST_FLOATS;
          I.set(e.partM[d.part], o);
          const mt = (e.matOverride && e.matOverride[d.matName]) || d.mat;
          I[o + 16] = mt.base[0]; I[o + 17] = mt.base[1]; I[o + 18] = mt.base[2]; I[o + 19] = mt.metal;
          I[o + 20] = mt.emissive[0]; I[o + 21] = mt.emissive[1]; I[o + 22] = mt.emissive[2]; I[o + 23] = mt.rough;
          I[o + 24] = e.flash; I[o + 25] = e.damage; I[o + 26] = model.detail; I[o + 27] = e.revealZ;
          I[o + 28] = e.revealDir; I[o + 29] = e.revealWidth; I[o + 30] = e.emissive; I[o + 31] = e.seed;
          I[o + 32] = e.tint[0]; I[o + 33] = e.tint[1]; I[o + 34] = e.tint[2]; I[o + 35] = e.wear || 0;
          I[o + 36] = e.dmgC[0]; I[o + 37] = e.dmgC[1]; I[o + 38] = e.dmgC[2]; I[o + 39] = e.dmgR;
          const cl = e.clip;
          const ml = e.melt;           // [cx, cy, cz, radius, depth, heat] (model-local)
          if (ml) { I[o + 40] = ml[0]; I[o + 41] = ml[1]; I[o + 42] = ml[2]; I[o + 43] = 2; I[o + 44] = ml[3]; I[o + 45] = ml[4]; I[o + 46] = 0; I[o + 47] = ml[5]; }
          else if (cl) { I[o + 40] = cl[0]; I[o + 41] = cl[1]; I[o + 42] = cl[2]; I[o + 43] = e.clipInv ? -1 : 1; I[o + 44] = cl[3]; I[o + 45] = cl[4]; I[o + 46] = cl[5]; I[o + 47] = e.clipHeat ?? 1; }
          else { I[o + 43] = 0; }
          I[o + 48] = e.texSet || 0;
          const cr = e.crush;          // world-space crumple: [x, y, z, radius, amount, dirX, dirY, dirZ]
          if (cr) { I[o + 49] = cr[4]; I[o + 50] = cr[5]; I[o + 51] = cr[6]; I[o + 52] = cr[0]; I[o + 53] = cr[1]; I[o + 54] = cr[2]; I[o + 55] = cr[3]; }
          else { I[o + 49] = 0; }
          I[o + 56] = e.shadeK ?? 1; I[o + 57] = e.soot || 0; I[o + 58] = model.hullClass ? (model.hullClass[d.matName] || 0) : 0; I[o + 59] = 0;
          n++;
        }
        if (n > first) draws.push(model.baseIndex + d.first, d.count, model.baseVertex, first, n - first, model.prepass ? 1 : 0);
      }
    }
    if (n) dev.queue.writeBuffer(this.instBuf, 0, I, 0, n * INST_FLOATS);
    if (this.nSprites) dev.queue.writeBuffer(this.sprBuf, 0, this.sprData, 0, this.nSprites * 16);
    this.stats.draws = draws.length / 5; this.stats.inst = n; this.stats.sprites = this.nSprites;

    // ---- frame uniforms
    const f = this.frameData;
    f.set(vp, 0); f.set(ivp, 16);
    // shadow matrix: ortho around env.shadowCenter radius env.shadowRadius
    const sv = this._sv || (this._sv = M.new()), sp = this._sp || (this._sp = M.new()), svp = this._svp || (this._svp = M.new());
    const sd = env.sunDir, sc = env.shadowCenter || cam.target, sr = env.shadowRadius || 500;
    const seye = [sc[0] + sd[0] * sr * 3, sc[1] + sd[1] * sr * 3, sc[2] + sd[2] * sr * 3];
    M.lookAt(sv, seye, sc, Math.abs(sd[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]);
    M.ortho(sp, -sr, sr, -sr, sr, 0, sr * 6);
    M.mul(svp, sp, sv);
    f.set(svp, 32);
    f[48] = cam.pos[0]; f[49] = cam.pos[1]; f[50] = cam.pos[2]; f[51] = env.time;
    f[52] = sd[0]; f[53] = sd[1]; f[54] = sd[2]; f[55] = env.shadows === false ? 0 : 1;
    f[56] = env.sunCol[0]; f[57] = env.sunCol[1]; f[58] = env.sunCol[2]; f[59] = env.ambient ?? 1;
    f.set(env.ambUp, 60); f[63] = 0; f.set(env.ambDown, 64); f[67] = 0;
    f[68] = W; f[69] = H; f[70] = 1 / W; f[71] = 1 / H;
    // lights: keep the strongest MAX_LIGHTS
    let nl = this.nLights;
    if (nl > MAX_LIGHTS) {
      const arr = this.lights.slice(0, nl).sort((a, b) => b.w - a.w);
      for (let i = 0; i < MAX_LIGHTS; i++) this._copyLight(i, arr[i]);
      nl = MAX_LIGHTS;
    } else for (let i = 0; i < nl; i++) this._copyLight(i, this.lights[i]);
    f[72] = nl; f[73] = env.sunDisc ?? 0; f[74] = near; f[75] = far;
    f[76] = env.nebula ?? 1; f[77] = env.stars ?? 1; f[78] = cam.fov / H; f[79] = env.warp ?? 0;
    const pl = env.planet;
    if (pl) { f[80] = pl.dir[0]; f[81] = pl.dir[1]; f[82] = pl.dir[2]; f[83] = env.planetInSky ? pl.radius : 0; f[84] = pl.col[0]; f[85] = pl.col[1]; f[86] = pl.col[2]; f[87] = pl.earth ? 1 : 0; }
    else { f[83] = 0; }
    f[88] = view[0]; f[89] = view[4]; f[90] = view[8]; f[91] = 0;
    f[92] = view[1]; f[93] = view[5]; f[94] = view[9]; f[95] = 0;
    const rc = env.rim || [0.3, 0.4, 0.8, 0.5];
    f[96] = rc[0]; f[97] = rc[1]; f[98] = rc[2]; f[99] = rc[3];
    const fc = env.fill || [0, 0, 0, 0];
    f[100] = fc[0]; f[101] = fc[1]; f[102] = fc[2]; f[103] = fc[3];
    // lenses: angles relative to the camera (background-only lensing in the sky shader)
    const putLens = (o, L) => {
      for (let k = 0; k < 8; k++) f[o + k] = 0;
      if (!L || !L.enable) return;
      const dx = L.pos[0] - cam.pos[0], dy = L.pos[1] - cam.pos[1], dz = L.pos[2] - cam.pos[2], dl = Math.hypot(dx, dy, dz) || 1;
      f[o] = dx / dl; f[o + 1] = dy / dl; f[o + 2] = dz / dl; f[o + 3] = L.thetaE * cam.fov;
      f[o + 4] = (L.horizon || 0) * cam.fov; f[o + 5] = L.swirl || 0; f[o + 6] = L.glow ?? 1; f[o + 7] = L.enable;
    };
    putLens(104, post.lensA); putLens(112, post.lensB);
    const sk = env.sky || [0.03, 0.05, 0.08, 1];
    f[120] = sk[0]; f[121] = sk[1]; f[122] = sk[2]; f[123] = sk[3];
    const ic = env.interior; f[124] = ic ? ic[0] : 0; f[125] = ic ? ic[1] : 0; f[126] = ic ? ic[2] : 0; f[127] = ic ? 1 : 0;
    dev.queue.writeBuffer(this.frameUBO, 0, f);
    // bodies: placed far along their sky direction from the camera (sky-at-infinity, but real geometry)
    const cd = this.celData; this.celN = 0;
    if (pl && !env.planetInSky) {
      const D = 120000, o = this.celN++ * 8;
      cd[o] = cam.pos[0] + pl.dir[0] * D; cd[o + 1] = cam.pos[1] + pl.dir[1] * D; cd[o + 2] = cam.pos[2] + pl.dir[2] * D; cd[o + 3] = D * Math.sin(pl.radius);
      cd[o + 4] = pl.earth ? 1 : pl.kind === 'moon' ? 2 : 0; cd[o + 5] = env.time * 0.0004 + 0.28; cd[o + 6] = 0; cd[o + 7] = 0;
    }
    if ((env.sunDisc ?? 0) > 0.01) {
      const D = 300000, o = this.celN++ * 8;
      cd[o] = cam.pos[0] + sd[0] * D; cd[o + 1] = cam.pos[1] + sd[1] * D; cd[o + 2] = cam.pos[2] + sd[2] * D; cd[o + 3] = D * 0.0045;
      cd[o + 4] = 3; cd[o + 5] = 0; cd[o + 6] = 0; cd[o + 7] = 0;
    }
    if (this.celN) dev.queue.writeBuffer(this.celBuf, 0, cd, 0, this.celN * 8);
    this.nearFar[0] = near; this.nearFar[1] = far;
    dev.queue.writeBuffer(this.nearFarUBO, 0, this.nearFar);

    // ---- post uniforms
    const P = this.postData;
    P.fill(0);
    const setLens = (o, L) => {
      if (!L || !L.enable) return;
      const s = this._proj3(vp, L.pos);
      if (!s) return;
      P[o] = s[0]; P[o + 1] = s[1]; P[o + 2] = L.thetaE; P[o + 3] = L.horizon || 0;
      P[o + 4] = L.swirl || 0; P[o + 5] = s[2]; P[o + 6] = L.glow ?? 1; P[o + 7] = L.enable;
    };
    // (lensing moved to the sky shader)
    if (post.godray && post.godray.intensity > 0) {
      const s = this._proj3(vp, post.godray.pos);
      if (s) { P[16] = s[0]; P[17] = s[1]; P[18] = post.godray.intensity; P[19] = post.godray.decay ?? 0.96; }
    }
    P[20] = post.exposure ?? 1; P[21] = post.bloom ?? 0.08; P[22] = post.ca ?? 0.002; P[23] = post.grain ?? 0.04;
    P[24] = post.fade ?? 1; P[25] = post.flash ?? 0; P[26] = post.letterbox ?? 1; P[27] = post.vignette ?? 0.9;
    P[28] = post.distort ?? 1; P[29] = post.streak ?? 0.5; P[30] = env.time; P[31] = post.saturation ?? 1;
    const gs = post.gradeShadows || [0.92, 1.0, 1.1], gh = post.gradeHighlights || [1.08, 1.0, 0.92];
    P[32] = gs[0]; P[33] = gs[1]; P[34] = gs[2]; P[35] = post.contrast ?? 1.05;
    P[36] = gh[0]; P[37] = gh[1]; P[38] = gh[2]; P[39] = post.shakeBlur ?? 0;
    P[40] = W; P[41] = H; P[42] = post.motionBlur ?? 0; P[43] = post.berserk ?? 0;
    if (!this._prevVP) { this._prevVP = M.new(); this._prevVP.set(vp); }
    P.set(this._prevVP, 44); P.set(ivp, 60);
    const df = post.dof; P[76] = df ? df.focus : 0; P[77] = df ? df.range : 1; P[78] = df ? df.blur : 0; P[79] = df ? 1 : 0;
    const rb = post.radial; let rs = rb && rb.strength > 0.001 ? this._proj3(vp, rb.pos) : null;
    if (rs) { P[80] = rs[0]; P[81] = rs[1]; P[82] = rb.strength; P[83] = 1; } else P[83] = 0;
    P[84] = post.interference ?? 0; P[85] = env.time; P[86] = post.redFlood ?? 1; P[87] = post.mbNear ?? 0;
    const sf = post.flare, sfs = sf && sf.intensity > 0.001 ? this._proj3(vp, sf.pos) : null;
    if (sfs) { P[88] = sfs[0]; P[89] = sfs[1]; P[90] = sf.intensity; P[91] = 1; } else P[91] = 0;
    if (post.commitVP !== false) this._prevVP.set(vp);
    dev.queue.writeBuffer(this.postUBO, 0, P);

    // ---- encode
    const enc = dev.createCommandEncoder();
    const V_ = this.views;
    const drawAll = (pass, only = -1) => {           // only: -1 all, 0 regular models, 1 prepass models
      pass.setVertexBuffer(0, this.vbuf);
      pass.setIndexBuffer(this.ibuf, 'uint32');
      let any = false;
      for (let k = 0; k < draws.length; k += 6) {
        if (only >= 0 && draws[k + 5] !== only) continue;
        pass.drawIndexed(draws[k + 1], draws[k + 4], draws[k], draws[k + 2], draws[k + 3]); any = true;
      }
      return any;
    };
    if (env.shadows !== false && n) {
      const sp_ = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
      sp_.setPipeline(this.shadowPipe); sp_.setBindGroup(0, this.shadowBG); drawAll(sp_); sp_.end();
    }
    const mp = enc.beginRenderPass({
      colorAttachments: [{ view: V_.msColor, resolveTarget: V_.hdr, loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }],
      depthStencilAttachment: { view: V_.msDepth, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    mp.setPipeline(this.skyPipe); mp.setBindGroup(0, this.skyBG);
    mp.setVertexBuffer(0, this.celVB); mp.setIndexBuffer(this.celIB, 'uint32'); mp.drawIndexed(this.celCount);
    if (this.celN) {
      mp.setPipeline(this.celPipe); mp.setBindGroup(0, this.celBG);
      mp.setVertexBuffer(0, this.celVB); mp.setIndexBuffer(this.celIB, 'uint32');
      mp.drawIndexed(this.celCount, this.celN);
    }
    if (n) {
      mp.setPipeline(this.meshPipe); mp.setBindGroup(0, this.meshBG); drawAll(mp, 0);
      mp.setPipeline(this.depthPrePipe);
      if (drawAll(mp, 1)) { mp.setPipeline(this.meshEqPipe); drawAll(mp, 1); }
    }
    mp.end();
    const dr = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: V_.depth1, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' } });
    dr.setPipeline(this.drPipe); dr.setBindGroup(0, this.drBG); dr.draw(3); dr.end();
    const ep = enc.beginRenderPass({
      colorAttachments: [{ view: V_.hdr, loadOp: 'load', storeOp: 'store' }, { view: V_.dist, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      depthStencilAttachment: { view: V_.depth1, depthReadOnly: true },
    });
    if (this.nSprites) { ep.setPipeline(this.sprPipe); ep.setBindGroup(0, this.sprBG); ep.draw(6, this.nSprites); }
    ep.end();
    const fs = (view, pipe, bg, load = false) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
      p.setPipeline(pipe); p.setBindGroup(0, bg); p.draw(3); p.end();
    };
    fs(V_.scene2, this.lensPipe, this.lensBG);
    for (let i = 0; i < BLOOM_LEVELS; i++) fs(V_.bloom[i], this.downPipe, this.downBG[i]);
    for (let i = BLOOM_LEVELS - 1; i > 0; i--) fs(V_.bloom[i - 1], this.upPipe, this.upBG[i], true);
    if (of <= 1) fs(this.ctx.getCurrentTexture().createView(), this.finalPipe, this.finalBG);
    else {
      const p = enc.beginRenderPass({ colorAttachments: [{ view: V_.accum, loadOp: sub === 0 ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
      p.setPipeline(this.accumPipe); p.setBindGroup(0, this.accumBG); p.setBlendConstant([1 / of, 1 / of, 1 / of, 1 / of]); p.draw(3); p.end();
      if (sub === of - 1) {
        const q = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
        q.setPipeline(this.blitPipe); q.setBindGroup(0, this.blitBG); q.draw(3); q.end();
      }
    }
    dev.queue.submit([enc.finish()]);
  }

  _copyLight(i, l) {
    const o = 128 + i * 8, f = this.frameData;
    f[o] = l.p[0]; f[o + 1] = l.p[1]; f[o + 2] = l.p[2]; f[o + 3] = l.r;
    f[o + 4] = l.c[0]; f[o + 5] = l.c[1]; f[o + 6] = l.c[2]; f[o + 7] = 0;
  }

  // project world point -> [u, v, viewDepth] (u,v in 0..1, v down) or null if behind
  _proj3(vp, p) {
    const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
    const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
    const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
    if (w <= 0.01) return null;
    const r = this._p3 || (this._p3 = [0, 0, 0]);
    r[0] = x / w * 0.5 + 0.5; r[1] = 0.5 - y / w * 0.5; r[2] = w;
    return r;
  }
  project(p) { return this._vp ? this._proj3(this._vp, p) : null; }
}

const Z4 = [0, 0, 0, 0];
const ONE = [1, 1, 1];
function newEntry() {
  return { m: new Float32Array(16), flash: 0, damage: 0, revealDir: 0, revealZ: 0, revealWidth: 1, emissive: 1, seed: 0, tint: [0.4, 0.7, 1], pose: null, hidden: null, matOverride: null, partM: null, dmgC: [0, 0, 0], dmgR: 0, clip: null, clipHeat: 1 };
}

// Cluster vertices of an emissive material into a few glow points (per part), in part space.
function emissiveClusters(g, matName) {
  const mi = g.materials.findIndex((m) => m.name.toLowerCase().startsWith(matName));
  if (mi < 0) return [];
  const out = [];
  g.parts.forEach((part, pi) => {
    for (const gr of part.groups) {
      if (gr.mat !== mi) continue;
      const pts = [];
      const seen = new Set();
      for (let k = gr.first; k < gr.first + gr.count; k++) {
        const v = g.indices[k];
        if (seen.has(v)) continue;
        seen.add(v);
        pts.push([g.verts[v * 8], g.verts[v * 8 + 1], g.verts[v * 8 + 2]]);
      }
      if (!pts.length) continue;
      // bbox-based cell size
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (const p of pts) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); }
      const ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      // union-find over grid cells ~ ext/10
      const cell = Math.max(ext / 10, 1e-3);
      const cells = new Map();
      for (const p of pts) {
        const key = Math.floor(p[0] / cell) + ',' + Math.floor(p[1] / cell) + ',' + Math.floor(p[2] / cell);
        let c = cells.get(key);
        if (!c) cells.set(key, (c = { s: [0, 0, 0], n: 0, mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9] }));
        c.s[0] += p[0]; c.s[1] += p[1]; c.s[2] += p[2]; c.n++;
        for (let a = 0; a < 3; a++) { c.mn[a] = Math.min(c.mn[a], p[a]); c.mx[a] = Math.max(c.mx[a], p[a]); }
      }
      // merge neighbouring cells greedily
      const list = [...cells.values()].map((c) => ({ p: [c.s[0] / c.n, c.s[1] / c.n, c.s[2] / c.n], n: c.n, r: Math.max(c.mx[0] - c.mn[0], c.mx[1] - c.mn[1], c.mx[2] - c.mn[2]) * 0.5 }));
      const merged = [];
      for (const c of list) {
        const m = merged.find((q) => Math.hypot(q.p[0] - c.p[0], q.p[1] - c.p[1], q.p[2] - c.p[2]) < cell * 1.6);
        if (m) {
          const t = m.n + c.n;
          for (let a = 0; a < 3; a++) m.p[a] = (m.p[a] * m.n + c.p[a] * c.n) / t;
          m.n = t; m.r = Math.max(m.r, c.r, cell * 0.5);
        } else merged.push({ ...c, r: Math.max(c.r, cell * 0.3) });
      }
      merged.sort((a, b) => b.n - a.n);
      for (const m of merged.slice(0, 24)) out.push({ part: pi, pos: m.p, r: m.r });
    }
  });
  return out;
}
