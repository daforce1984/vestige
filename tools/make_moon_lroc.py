"""The moon's real surface for the bake (2026-10-06): NASA's CGI Moon Kit (Scientific Visualization Studio, public domain —
https://svs.gsfc.nasa.gov/4720): the LRO LROC colour mosaic and the LOLA elevation map, packed into one RGBA PNG on our
equirect grid (4096 x 2048): R, G = elevation (16 bit, hi / lo byte, 0 … 65535 over its range), B = albedo (luminance, sRGB),
A = 255. The originals stay in the git-ignored assets/src/moon/.
usage: uv run --with pillow --with numpy --with tifffile --with imagecodecs tools/make_moon_lroc.py"""
import os, numpy as np, tifffile
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'src', 'moon')
W, H = 4096, 2048
alb = tifffile.imread(os.path.join(SRC, 'lroc_color_poles_4k.tif')).astype(np.float32)
lum = alb[..., 0] * 0.2126 + alb[..., 1] * 0.7152 + alb[..., 2] * 0.0722
lum = np.asarray(Image.fromarray(lum.astype(np.uint8)).resize((W, H), Image.LANCZOS))
h = tifffile.imread(os.path.join(SRC, 'ldem_16_uint.tif')).astype(np.float32)
h = np.asarray(Image.fromarray(h).resize((W, H), Image.LANCZOS))   # (mode F)
lo, hi = float(h.min()), float(h.max())
n = np.clip((h - lo) / (hi - lo) * 65535.0 + 0.5, 0, 65535).astype(np.uint32)
rgba = np.stack([(n >> 8).astype(np.uint8), (n & 255).astype(np.uint8), lum.astype(np.uint8), np.full((H, W), 255, np.uint8)], -1)
Image.fromarray(rgba, 'RGBA').save(os.path.join(ROOT, 'assets', 'tex', 'moon_lroc.png'), optimize=True)
mean = float(h.mean())
print('saved moon_lroc.png; elevation units 0.5 m: lo', lo, 'hi', hi, 'mean', round(mean, 1), '-> range m', (hi - lo) * 0.5, ' mean (normalised)', round((mean - lo) / (hi - lo), 5))
