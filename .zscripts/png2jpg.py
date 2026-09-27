#!/usr/bin/env python3
"""Convert a PNG to JPG (flatten to RGB, quality 88). Usage: png2jpg.py <src.png> <dst.jpg>"""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src)
if im.mode in ("RGBA", "LA", "P"):
    im = im.convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[-1])
    im = bg
elif im.mode != "RGB":
    im = im.convert("RGB")
im.save(dst, "JPEG", quality=88, optimize=True)
