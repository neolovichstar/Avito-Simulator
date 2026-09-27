#!/usr/bin/env python3
"""Нарезка спрайт-листов ассетов (аватары/обои/погода/empty-state) на отдельные файлы."""
import os
import numpy as np
from PIL import Image

SRC = '/home/z/my-project/upload/sheets'
OUT = '/home/z/my-project/public/img'

# sheet -> (output_dir, names in row-major order, format)
PLAN = {
    'sheet-01.png': ('weather', ['snow', 'fog', 'night', 'rainbow'], 'webp'),
    'sheet-02.png': ('weather', ['sun', 'clouds', 'rain', 'storm'], 'webp'),
    'sheet-03.png': ('empty', ['deal-success', 'deal-fail', 'repair', 'delivery'], 'webp'),
    'sheet-04.png': ('empty', ['chat', 'gallery', 'notify', 'notes'], 'webp'),
    'sheet-05.png': ('wall', ['terrazzo', 'fabric', 'depth', 'marble-dark', 'paper'], 'webp'),
    'sheet-06.png': ('wall', ['emerald', 'metropolis', 'gold', 'jade', 'leather'], 'webp'),
    'sheet-07.png': ('avatars', None, 'webp'),  # a01..a10
    'sheet-08.png': ('avatars', None, 'webp'),  # a11..a20
    'sheet-09.png': ('avatars', None, 'webp'),  # a21..a30
    'sheet-10.png': ('avatars', None, 'webp'),  # a31..a40
}

THRESH = 26  # порог отличия от фона


def runs(profile: np.ndarray, min_gap: int = 6, min_run: int = 24):
    """Непрерывные диапазоны ненулевых значений профиля."""
    on = profile > max(2, profile.max() * 0.04)
    res, start = [], None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_run:
                res.append((start, i))
            start = None
    if start is not None and len(on) - start >= min_run:
        res.append((start, len(on)))
    # склеить диапазоны, разделённые узкими щелями (< min_gap)
    merged = []
    for r in res:
        if merged and r[0] - merged[-1][1] < min_gap:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(list(r))
    return [tuple(r) for r in merged]


def cells_of(path: str):
    im = Image.open(path)
    has_alpha = im.mode == 'RGBA'
    if has_alpha:
        a = np.asarray(im)
        alpha = a[..., 3]
        # прозрачный фон?
        corners = np.concatenate([alpha[:4, :4].ravel(), alpha[:4, -4:].ravel(),
                                  alpha[-4:, :4].ravel(), alpha[-4:, -4:].ravel()])
        transparent_bg = np.median(corners) < 20
        if transparent_bg:
            mask = alpha > 24
        else:
            rgb = a[..., :3].astype(int)
            bg = np.median(rgb.reshape(-1, 3)[np.repeat(alpha[:4, :4] > 20, 16).reshape(-1)] if False else rgb.reshape(-1, 3), axis=0)
            mask = np.abs(rgb - bg).sum(axis=2) > THRESH
    else:
        rgb = np.asarray(im.convert('RGB')).astype(int)
        c = np.concatenate([rgb[:4, :4].reshape(-1, 3), rgb[:4, -4:].reshape(-1, 3),
                            rgb[-4:, :4].reshape(-1, 3), rgb[-4:, -4:].reshape(-1, 3)])
        bg = np.median(c, axis=0)
        mask = np.abs(rgb - bg).sum(axis=2) > THRESH
    cols = runs(mask.sum(axis=0))
    rows = runs(mask.sum(axis=1))
    return im, cols, rows, mask


def save(im, box, out_path, max_side=None, quality=86):
    crop = im.crop(box)
    if crop.mode == 'RGBA' and out_path.endswith('.webp'):
        pass  # сохраняем альфу
    else:
        crop = crop.convert('RGB')
    if max_side and max(crop.size) > max_side:
        w, h = crop.size
        k = max_side / max(w, h)
        crop = crop.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    crop.save(out_path, 'WEBP', quality=quality, method=6)
    return crop.size


def main():
    avatar_idx = 1
    manifest = []
    for sheet, (outdir, names, ext) in PLAN.items():
        im, cols, rows, _ = cells_of(os.path.join(SRC, sheet))
        expected = {(len(names)): True}.get(len(names)) if names else None
        # Для аватарных листов names=None -> сетка cols x rows полностью
        if names and len(names) == len(cols) * len(rows):
            cells = [(r, c) for r in rows for c in cols]
        else:
            cells = [(r, c) for r in rows for c in cols]
        os.makedirs(os.path.join(OUT, outdir), exist_ok=True)
        n = 0
        for ri, (r0, r1) in enumerate(rows):
            for ci, (c0, c1) in enumerate(cols):
                idx = ri * len(cols) + ci
                if names:
                    if idx >= len(names):
                        continue
                    base = names[idx]
                else:
                    base = f'a{avatar_idx:02d}'
                    avatar_idx += 1
                # инсет против ореола фона
                inset = 2 if (c1 - c0) > 80 else 1
                box = (c0 + inset, r0 + inset, c1 - inset, r1 - inset)
                # квадратизация для аватаров
                if outdir == 'avatars':
                    w, h = box[2] - box[0], box[3] - box[1]
                    s = min(w, h)
                    box = (box[0] + (w - s) // 2, box[1] + (h - s) // 2,
                           box[0] + (w - s) // 2 + s, box[1] + (h - s) // 2 + s)
                    size = save(im, box, os.path.join(OUT, outdir, f'{base}.{ext}'), max_side=320, quality=84)
                elif outdir == 'weather':
                    size = save(im, box, os.path.join(OUT, outdir, f'{base}.{ext}'), max_side=640, quality=84)
                elif outdir == 'empty':
                    size = save(im, box, os.path.join(OUT, outdir, f'{base}.{ext}'), max_side=720, quality=86)
                else:  # wall
                    size = save(im, box, os.path.join(OUT, outdir, f'{base}.{ext}'), max_side=1080, quality=88)
                manifest.append(f'{sheet} -> {outdir}/{base}.{ext} {size}')
                n += 1
        print(f'{sheet}: cols={len(cols)} rows={len(rows)} saved={n}')
    print('\n'.join(manifest))


if __name__ == '__main__':
    main()
