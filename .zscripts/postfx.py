#!/usr/bin/env python3
"""Amateurize a listing photo: handheld micro-rotation, flat amateur grade, cheap-sensor grain.
Usage: postfx.py <src.jpg> <dst.jpg> <seed>
Deterministic by seed (filename) — reruns are stable."""
import sys, hashlib
from PIL import Image, ImageEnhance

src, dst, seed = sys.argv[1], sys.argv[2], sys.argv[3]
im = Image.open(src).convert("RGB")
w, h = im.size

# 1) handheld micro-rotation (0.3-1.0 deg), crop-in to hide filled corners
hsh = int(hashlib.md5(seed.encode()).hexdigest(), 16)
angle = ((hsh % 100) / 100 * 0.7 + 0.3) * (1 if hsh % 2 else -1)
im = im.rotate(angle, resample=Image.BICUBIC, fillcolor=(235, 235, 232))
cw, ch = int(w * 0.975), int(h * 0.975)
im = im.crop(((w - cw) // 2, (h - ch) // 2, (w - cw) // 2 + cw, (h - ch) // 2 + ch))

# 2) flat amateur grade: slightly brighter, flatter contrast, a bit washed
im = ImageEnhance.Brightness(im).enhance(1.045)
im = ImageEnhance.Contrast(im).enhance(0.93)
im = ImageEnhance.Color(im).enhance(0.92)

# 3) cheap-sensor grain
noise = Image.effect_noise(im.size, 16).convert("RGB")
im = Image.blend(im, noise, 0.045)

im.save(dst, "JPEG", quality=88, optimize=True)
