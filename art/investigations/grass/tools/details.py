# micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
# Copyright (C) 2026 Adam Tovatt
#
# This code is released under the GNU GPL v3, with some additional terms.
# Please see the files LICENSE and COPYING for details. Alternatively,
# consult http://micropolisjs.graememcc.co.uk/LICENSE and
# http://micropolisjs.graememcc.co.uk/COPYING
#
# The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
# (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
# city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
#

"""Layer 3: small ground details, cut from a painted sheet on a flat background, scattered one per tile at most by an
integer hash of the tile.

  details.py cut <sheet.png> <outdir>   a 4 x 4 grid of details: each cell's detail over transparency, alpha from its
                                        distance to the flat background's colour, cropped, scaled to its size on the map
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wang import gradient_noise, lattice_hash, PX  # noqa: E402

# the sheet's details in reading order: (name, size on the map in pixels at 64 a tile)
KINDS = ['tuft', 'tuft', 'tuft', 'clover',
         'dirt', 'dirt', 'dirt', 'dirt',
         'daisies', 'buttercups', 'stones', 'straw',
         'daisies', 'buttercups', 'stones', 'straw']
SIZE = {'tuft': 32, 'clover': 30, 'dirt': 44, 'daisies': 38, 'buttercups': 38, 'stones': 32, 'straw': 36}
DETAIL_SEED = 0x3001
DENSITY = 0.6         # the share of tiles that carry a detail where the clustering noise is at its fullest
CLUSTER_CELL = 3.5    # tiles: the clustering noise's lattice, so details come in drifts with bare land between
SCALES = (0.7, 0.85, 1.0)   # a detail's size, by its hash

# how often each kind is chosen, in straw and in lush regions
WEIGHTS = {'straw': {'straw': 35, 'dirt': 30, 'stones': 15, 'tuft': 10, 'daisies': 5, 'buttercups': 5, 'clover': 0},
           'lush': {'tuft': 25, 'clover': 15, 'daisies': 20, 'buttercups': 20, 'dirt': 10, 'stones': 10, 'straw': 0}}


def cut(sheet, out):
    a = np.asarray(Image.open(sheet).convert('RGB')).astype(np.float64)
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3),
                             a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((dist - 14) / 30, 0, 1)
    alpha = ndimage.gaussian_filter(alpha, 1.0)
    os.makedirs(out, exist_ok=True)
    cell = a.shape[0] // 4
    for k, kind in enumerate(KINDS):
        y, x = k // 4 * cell, k % 4 * cell
        al = alpha[y:y + cell, x:x + cell]
        # the detail is the biggest blob in its cell
        lab, n = ndimage.label(al > 0.2)
        if n == 0:
            continue
        big = 1 + int(np.argmax(ndimage.sum(np.ones_like(al), lab, range(1, n + 1))))
        keep = ndimage.binary_dilation(lab == big, iterations=6)
        al = al * keep
        ys, xs = np.nonzero(al > 0.02)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.dstack([a[y:y + cell, x:x + cell], al * 255])[y0:y1, x0:x1]
        im = Image.fromarray(np.clip(rgba, 0, 255).round().astype(np.uint8), 'RGBA')
        side = SIZE[kind]
        scale = side / max(im.size)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        # softened so it sits in the grass rather than on it: the edge feathered over a pixel or so at the map's
        # size, and the colour a quarter of the way to the ground it was painted on
        d = np.asarray(im).astype(np.float64)
        d = np.pad(d, ((2, 2), (2, 2), (0, 0)))
        d[..., 3] = ndimage.gaussian_filter(d[..., 3], 0.9) * 0.9
        d[..., :3] = d[..., :3] * 0.75 + bg * 0.25
        im = Image.fromarray(np.clip(d, 0, 255).round().astype(np.uint8), 'RGBA')
        im.save(os.path.join(out, f'{k:02d}-{kind}.png'))


def load(out):
    found = {}
    for f in sorted(os.listdir(out)):
        if f.endswith('.png'):
            kind = f[3:-4]
            found.setdefault(kind, []).append(np.asarray(Image.open(os.path.join(out, f))).astype(np.float64))
    return found


def scatter(img, decals, gx0, gy0, gw, gh, straw_share):
    # Each tile carries a detail when its hash says so: the kind by the region's weights at the tile's middle, the
    # variant, a quarter turn and a mirror by further bits, and a place inside the tile, so a detail never crosses a
    # tile edge and a shader need only look at the tile's own. straw_share(wx, wy) is the region mask.
    for j in range(gh):
        for i in range(gw):
            x, y = gx0 + i, gy0 + j
            h = int(lattice_hash(x, y, DETAIL_SEED))
            c = gradient_noise(np.array(x + 0.5), np.array(y + 0.5), CLUSTER_CELL, DETAIL_SEED + 2, 0.27)
            density = DENSITY * float(np.clip((c + 0.05) / 0.35, 0, 1))
            if (h & 1023) >= density * 1024:
                continue
            h2 = int(lattice_hash(x, y, DETAIL_SEED + 1))
            region = 'straw' if straw_share(np.array(x + 0.5), np.array(y + 0.5)) >= 0.5 else 'lush'
            weights = WEIGHTS[region]
            total = sum(weights.values())
            pick = (h >> 10) % total
            for kind, w in weights.items():
                if pick < w:
                    break
                pick -= w
            variants = decals[kind]
            d = variants[(h2 & 0xFF) % len(variants)]
            s = SCALES[(h2 >> 27) % len(SCALES)]
            im = Image.fromarray(d.round().astype(np.uint8), 'RGBA')
            d = np.asarray(im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))),
                                     Image.LANCZOS)).astype(np.float64)
            d = np.rot90(d, (h2 >> 8) & 3)
            if (h2 >> 10) & 1:
                d = d[:, ::-1]
            dh, dw = d.shape[:2]
            ox = (h2 >> 11) % (PX - dw + 1)
            oy = (h2 >> 19) % (PX - dh + 1)
            X, Y = i * PX + ox, j * PX + oy
            region_px = img[Y:Y + dh, X:X + dw]
            al = d[..., 3:4] / 255
            img[Y:Y + dh, X:X + dw] = region_px * (1 - al) + d[..., :3] * al
    return img


if __name__ == '__main__':
    if sys.argv[1] == 'cut':
        cut(sys.argv[2], sys.argv[3])
