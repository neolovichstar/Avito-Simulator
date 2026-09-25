#!/usr/bin/env python3
"""Crop app icons from logo-pack sheets: detect bboxes vs bg, cut, round corners."""
import numpy as np
from PIL import Image, ImageDraw
import os

OUT = "/home/z/my-project/public/img/apps"
os.makedirs(OUT, exist_ok=True)
SS = 4  # supersample for smooth corners


def find_bands(profile, min_len=120, min_val=8):
    """Contiguous bands where profile > min_val."""
    bands, start = [], None
    for i, v in enumerate(profile):
        if v > min_val and start is None:
            start = i
        elif v <= min_val and start is not None:
            if i - start >= min_len:
                bands.append((start, i))
            start = None
    if start is not None and len(profile) - start >= min_len:
        bands.append((start, len(profile)))
    return bands


def crop_sheet(path, mapping):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    diff = np.abs(a - bg).sum(axis=2)
    mask = diff > 60
    rows = find_bands(mask.sum(axis=1))
    cols = find_bands(mask.sum(axis=0))
    print(f"{path}: bg={bg.astype(int)} rows={rows} cols={cols}")
    assert len(rows) >= 1 and len(cols) >= 1, "grid not found"
    results = {}
    for name, (rr, cc) in mapping.items():
        rband = rows[min(rr, len(rows) - 1)]
        cband = cols[min(cc, len(cols) - 1)]
        sub = mask[rband[0]:rband[1], cband[0]:cband[1]]
        ys, xs = np.where(sub)
        y0, y1 = rband[0] + ys.min(), rband[0] + ys.max() + 1
        x0, x1 = cband[0] + xs.min(), cband[0] + xs.max() + 1
        results[name] = im.crop((x0, y0, x1, y1))
        print(f"  {name}: bbox=({x0},{y0},{x1},{y1}) size={x1-x0}x{y1-y0}")
    return results


def round_crop(icon, out_name, target=256, radius_frac=0.2255):
    w, h = icon.size
    side = max(w, h)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(icon.convert("RGBA"), ((side - w) // 2, (side - h) // 2))
    sq = sq.resize((target * SS, target * SS), Image.LANCZOS)
    m = Image.new("L", (target * SS, target * SS), 0)
    d = ImageDraw.Draw(m)
    r = int(radius_frac * target * SS)
    d.rounded_rectangle([0, 0, target * SS - 1, target * SS - 1], radius=r, fill=255)
    sq.putalpha(m)
    sq = sq.resize((target, target), Image.LANCZOS)
    out = os.path.join(OUT, out_name)
    sq.save(out)
    print(f"  -> saved {out}")


pack1 = {
    "avito":      (0, 0),  # green tag check on white -> Resale
    "bank":       (0, 1),  # green ruble
    "leaderboard":(0, 2),  # chart with star
    "taxes":      (0, 3),  # dark doc %
    "browser":    (1, 0),  # blue globe
    "settings":   (1, 1),  # gray gear
    "repair":     (1, 2),  # orange wrench
    "auction":    (1, 3),  # amber gavel
}
pack2 = {
    "career":     (0, 0),  # green trophy (left)
    "delivery":   (0, 1),  # teal truck (right)
}

icons1 = crop_sheet("/tmp/logos_pack1.png", pack1)
icons2 = crop_sheet("/tmp/logos_pack2.png", pack2)

for name, icon in {**icons1, **icons2}.items():
    round_crop(icon, f"{name}.png")

sheet = Image.new("RGBA", (256 * 5 + 40, 256 * 2 + 30), (40, 44, 48, 255))
order = ["avito", "bank", "leaderboard", "taxes", "browser", "settings", "repair", "auction", "career", "delivery"]
for i, name in enumerate(order):
    ic = Image.open(os.path.join(OUT, f"{name}.png"))
    x = (i % 5) * (256 + 8) + 4
    y = (i // 5) * (256 + 8) + 4
    sheet.alpha_composite(ic, (x, y))
sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
sheet.save("/tmp/logos_sheet.png")
print("contact sheet -> /tmp/logos_sheet.png")
