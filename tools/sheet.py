#!/usr/bin/env python3
"""Contact sheet: sheet.py out.jpg cols img1 img2 ... (labels = file names)"""
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
W = 800
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    h = int(im.height * W / im.width)
    im = im.resize((W, h))
    ImageDraw.Draw(im).text((8, 8), f.split('/')[-1], fill=(255, 255, 0))
    ims.append(im)
H = max(i.height for i in ims)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows))
for k, im in enumerate(ims):
    sheet.paste(im, ((k % cols) * W, (k // cols) * H))
sheet.save(out, quality=85)
