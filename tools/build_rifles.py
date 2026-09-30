"""Game-ready rifles and ships from the Sketchfab GLBs the user supplied (assets/rifle2.glb → Sigma, assets/rifle1.glb → VANGUARD).
Each is re-posed into its hand's rifle frame (origin at the pistol grip, scaled to the mech's fist), flattened to one
material, and its textures packed into one atlas pair:
  assets/tex/<name>_albedo.png  RGB albedo, A = emissive mask (glows in the shader)
  assets/tex/<name>_orm.png     R = AO, G = roughness, B = metal (glTF metallic-roughness channels)
usage: uv run --with pygltflib --with numpy --with pillow tools/build_rifles.py"""
import os, sys, numpy as np
from PIL import Image
from pygltflib import GLTF2, Scene, Node, Mesh, Primitive, Attributes, Buffer, BufferView, Accessor, Material, PbrMetallicRoughness
sys.path.insert(0, os.path.dirname(__file__))
from glbload import load, image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda p: os.path.join(ROOT, 'assets', p)

def build(src, name, grip, R, S, cell, emissive_mask, engines=()):
    prims, g, blob = load(A(src))
    texOf = lambda m: g.materials[m].pbrMetallicRoughness.baseColorTexture.index
    mats = []; first = {}
    for m in sorted({p['mat'] for p in prims}):   # (materials sharing one texture set share one atlas cell)
        if texOf(m) not in first: first[texOf(m)] = m; mats.append(m)
    nm = len(mats); cols = min(3, nm); rows = (nm + cols - 1) // cols
    alb = Image.new('RGBA', (cols * cell, rows * cell)); orm = Image.new('RGB', (cols * cell, rows * cell), (255, 128, 0))
    slot = {}
    for k, m in enumerate(mats):
        c, r = k % cols, k // cols; slot[m] = (c, r)
        mt = g.materials[m]; pr = mt.pbrMetallicRoughness
        a = image(g, blob, g.textures[pr.baseColorTexture.index].source).convert('RGB').resize((cell, cell), Image.LANCZOS)
        mask = emissive_mask(g, blob, mt, a).resize((cell, cell), Image.LANCZOS)
        alb.paste(Image.merge('RGBA', (*a.split(), mask)), (c * cell, r * cell))
        if pr.metallicRoughnessTexture is not None:
            orm.paste(image(g, blob, g.textures[pr.metallicRoughnessTexture.index].source).convert('RGB').resize((cell, cell), Image.LANCZOS), (c * cell, r * cell))
    os.makedirs(A('tex'), exist_ok=True)
    alb.save(A(f'tex/{name}_albedo.png')); orm.save(A(f'tex/{name}_orm.png'))
    P, N, U, I = [], [], [], []; base = 0
    for p in prims:
        c, r = slot[first[texOf(p['mat'])]]
        P.append(S * ((p['pos'] - grip) @ R.T)); N.append(p['nrm'] @ R.T)
        uv = p['uv'].copy(); uv[:, 0] = (c + np.clip(uv[:, 0], 0, 1)) / cols; uv[:, 1] = (r + np.clip(uv[:, 1], 0, 1)) / rows; U.append(uv)
        I.append(p['idx'] + base); base += len(p['pos'])
    nI = sum(len(i) for i in I)
    for (cx, cy, cz, rad) in engines:   # small 'engine' discs at the nozzles (facing back): the renderer's thruster emitters
        c0 = S * ((np.array([cx, cy, cz]) - grip) @ R.T); k = np.arange(12) * np.pi / 6
        ring = np.stack([c0[0] + S * rad * np.cos(k), c0[1] + S * rad * np.sin(k), np.full(12, c0[2] - 0.02)], 1)
        P.append(np.vstack([c0 - [0, 0, 0.02], ring])); N.append(np.tile([0., 0., -1.], (13, 1))); U.append(np.zeros((13, 2)))
        I.append(np.array([[base, base + 1 + j, base + 1 + (j + 1) % 12] for j in range(12)]).reshape(-1)); base += 13
    P = np.concatenate(P).astype(np.float32); N = np.concatenate(N).astype(np.float32); U = np.concatenate(U).astype(np.float32); I = np.concatenate(I).astype(np.uint32)
    data = P.tobytes() + N.tobytes() + U.tobytes() + I.tobytes()
    o = [0, len(P.tobytes()), len(P.tobytes()) + len(N.tobytes()), len(P.tobytes()) + len(N.tobytes()) + len(U.tobytes())]
    out = GLTF2(scene=0, scenes=[Scene(nodes=[0])], nodes=[Node(name='rifle', mesh=0)],
        meshes=[Mesh(primitives=[Primitive(attributes=Attributes(POSITION=0, NORMAL=1, TEXCOORD_0=2), indices=3, material=0)] + ([Primitive(attributes=Attributes(POSITION=0, NORMAL=1, TEXCOORD_0=2), indices=4, material=1)] if engines else []))],
        materials=[Material(name=name, pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=[1, 1, 1, 1], metallicFactor=1, roughnessFactor=1)),
                   Material(name='engine', emissiveFactor=[1, 0.4, 0.1], pbrMetallicRoughness=PbrMetallicRoughness(baseColorFactor=[0.3, 0.1, 0.05, 1], metallicFactor=0, roughnessFactor=0.5))],
        buffers=[Buffer(byteLength=len(data))],
        bufferViews=[BufferView(buffer=0, byteOffset=o[0], byteLength=len(P.tobytes()), target=34962), BufferView(buffer=0, byteOffset=o[1], byteLength=len(N.tobytes()), target=34962),
                     BufferView(buffer=0, byteOffset=o[2], byteLength=len(U.tobytes()), target=34962), BufferView(buffer=0, byteOffset=o[3], byteLength=nI * 4, target=34963),
                     BufferView(buffer=0, byteOffset=o[3] + nI * 4, byteLength=len(I.tobytes()) - nI * 4, target=34963)],
        accessors=[Accessor(bufferView=0, componentType=5126, count=len(P), type='VEC3', min=P.min(0).tolist(), max=P.max(0).tolist()),
                   Accessor(bufferView=1, componentType=5126, count=len(N), type='VEC3'), Accessor(bufferView=2, componentType=5126, count=len(U), type='VEC2'),
                   Accessor(bufferView=3, componentType=5125, count=nI, type='SCALAR'), Accessor(bufferView=4, componentType=5125, count=max(0, len(I) - nI), type='SCALAR')])
    out.set_binary_blob(data); out.save_binary(A(f'{name}.glb'))
    print(name, 'verts', len(P), 'tris', len(I) // 3, 'bounds', P.min(0).round(2), P.max(0).round(2), 'atlas', alb.size)

def emis_tex(g, blob, mt, alb):   # rifle1: the material's own emissive map (luminance)
    if mt.emissiveTexture is None: return Image.new('L', alb.size, 0)
    e = np.asarray(image(g, blob, g.textures[mt.emissiveTexture.index].source).convert('RGB'), np.float32).max(2)
    return Image.fromarray(np.clip(e * 1.5, 0, 255).astype(np.uint8)).resize(alb.size)
def emis_green(g, blob, mt, alb):   # rifle2: no emissive map — its glowing inlays are the saturated green in the albedo
    a = np.asarray(alb, np.float32); gr = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
    return Image.fromarray(np.clip((gr - 40) * 4, 0, 255).astype(np.uint8))

# (2026-09-30: the user swapped them — Sigma carries rifle2, VANGUARD rifle1)
# Sigma: rifle2, muzzle toward +z, top +y = already his rifle frame (+Z barrel, +Y top); grip stub on the origin
build('rifle2.glb', 'rifle2_game', np.array([0, 0.12, -1.6]), np.eye(3), 4.125, 1024, emis_green)   # (×2.75, then 1.5× bigger on request)
# VANGUARD: rifle1 (bullpup), muzzle toward −z, top +y → its rifle part frame (barrel −Y, top +Z): (x, y, z) → (−x, z, y)
build('rifle1.glb', 'rifle1_game', np.array([0, -0.85, -1.23]), np.array([[-1, 0, 0], [0, 0, 1], [0, 1, 0]]), 1.4, 768, emis_tex)
# the enemy fighters (every enemy_fighter* variant): assets/spaceship.glb (user-supplied), nose +z already; centred, ×0.95, its
# one texture set packed the same way (red lights in the emissive map), an 'engine' disc on the rear nozzle
build('spaceship.glb', 'spaceship_game', np.array([0, 1.67, 0]), np.eye(3), 0.95, 1024, emis_tex, engines=[(0, 2.45, -5.14, 0.35)])
