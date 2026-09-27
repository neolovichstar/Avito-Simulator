#!/usr/bin/env python3
"""
Flatten app icon PNGs: kill the transparent corners + semi-transparent
anti-aliased fringe (which renders as dark/black edges over light UI).

Method: multi-source BFS from fully-opaque pixels. Every unknown pixel
(alpha < 250) gets the average colour of its already-known 8-neighbours.
Gradient backgrounds smear smoothly, no halos remain, output is fully
opaque so the CSS border-radius mask is the ONLY shape definition.
"""
import os
import numpy as np
from PIL import Image

DIR = 'public/img/apps'
ALPHA_KNOWN = 250  # >= this alpha = trusted source pixel

def flatten(path: str) -> None:
    im = Image.open(path).convert('RGBA')
    arr = np.array(im).astype(np.float64)
    h, w = arr.shape[:2]
    rgb = arr[..., :3]
    alpha = arr[..., 3]

    known = alpha >= ALPHA_KNOWN
    if known.all():
        return  # already opaque

    # BFS layers: repeatedly fill unknown pixels adjacent to known ones
    filled = known.copy()
    out_rgb = rgb.copy()
    # colours of semi-transparent pixels are polluted (black-ish AA),
    # so treat them as unknown and re-derive from opaque neighbours only

    kernels = [
        (-1, -1), (-1, 0), (-1, 1),
        (0, -1),           (0, 1),
        (1, -1),  (1, 0),  (1, 1),
    ]

    remaining = int((~filled).sum())
    while remaining > 0:
        # candidate pixels: unknown but with at least one known neighbour
        neigh_count = np.zeros((h, w), dtype=np.int16)
        acc = np.zeros((h, w, 3), dtype=np.float64)
        for dy, dx in kernels:
            src = filled
            shifted = np.zeros_like(filled)
            ay0, ay1 = max(0, -dy), h - max(0, dy)
            ax0, ax1 = max(0, -dx), w - max(0, dx)
            by0, by1 = max(0, dy), h - max(0, -dy)
            bx0, bx1 = max(0, dx), w - max(0, -dx)
            shifted[ay0:ay1, ax0:ax1] = src[by0:by1, bx0:bx1]
            sr = np.zeros((h, w, 3), dtype=np.float64)
            sr[ay0:ay1, ax0:ax1] = out_rgb[by0:by1, bx0:bx1]
            neigh_count += shifted
            acc += sr * shifted[..., None]

        candidates = (~filled) & (neigh_count > 0)
        if not candidates.any():
            break  # isolated holes: fall back below
        ys, xs = np.nonzero(candidates)
        cnt = neigh_count[candidates].astype(np.float64)[:, None]
        out_rgb[candidates] = acc[candidates] / cnt
        filled[candidates] = True
        remaining = int((~filled).sum())

    # any leftovers (shouldn't happen for these icons): paint with global edge mean
    if remaining > 0:
        edge_mean = out_rgb[filled].mean(axis=0) if filled.any() else np.array([128, 128, 128.0])
        out_rgb[~filled] = edge_mean
        filled[:] = True

    final = np.dstack([out_rgb.clip(0, 255).astype(np.uint8), np.full((h, w), 255, dtype=np.uint8)])
    Image.fromarray(final, 'RGBA').save(path, optimize=True)
    print(f'flattened: {os.path.basename(path)} ({w}x{h})')

def main() -> None:
    files = sorted(f for f in os.listdir(DIR) if f.endswith('.png'))
    for f in files:
        flatten(os.path.join(DIR, f))

if __name__ == '__main__':
    main()
