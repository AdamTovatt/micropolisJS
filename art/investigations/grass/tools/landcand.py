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

"""Bare-land grass candidates.

  ref   <name> <r,g,b> <out.png>        the model input: land-grass.png tiled 6x6 to 1024, recoloured to the target mean
  tile  <painting.png> <r,g,b> <out.png> the 64 px land tile: the most even tile-sized crop of the painting (1024/6 px),
                                         scaled to 64, its mean moved to the target
  variant <tile.png> <dst>              a copy of painted/out and painted/built with this land, joined into every single
                                         tile that takes land as its donor

Run from the repository root with the art venv.
"""
import os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, 'art/tools')

TILES = 6
SIDE = 1024


def rgb(s):
    return np.array([float(v) for v in s.split(',')])


def ref(target, out):
    tex = Image.open('art/textures/land-grass.png').convert('RGB')
    cell = SIDE // TILES + 1
    t = tex.resize((cell, cell), Image.LANCZOS)
    canvas = Image.new('RGB', (cell * TILES, cell * TILES))
    for j in range(TILES):
        for i in range(TILES):
            canvas.paste(t, (i * cell, j * cell))
    a = np.asarray(canvas.crop((0, 0, SIDE, SIDE))).astype(np.float32)
    a = a - a.reshape(-1, 3).mean(0) + target
    Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8)).save(out)


def tile(painting, target, out):
    p = np.asarray(Image.open(painting).convert('RGB')).astype(np.float32)
    n = p.shape[0] // TILES
    best = None
    # crops on a half-tile grid, away from the painting's border, where the model vignettes
    for y in range(n // 2, p.shape[0] - 2 * n, n // 2):
        for x in range(n // 2, p.shape[1] - 2 * n, n // 2):
            c = p[y:y + n, x:x + n]
            broad = ndimage.gaussian_filter(c, (n / 8, n / 8, 0))
            score = broad.std(axis=(0, 1)).sum() + 0.5 * np.abs(c.reshape(-1, 3).mean(0) - target).sum()
            if best is None or score < best[0]:
                best = (score, c)
    c = Image.fromarray(np.clip(best[1], 0, 255).round().astype(np.uint8)).resize((64, 64), Image.LANCZOS)
    a = np.asarray(c).astype(np.float32)
    a = a - a.reshape(-1, 3).mean(0) + target
    Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8)).save(out)


def variant(tile_png, dst):
    import paint
    if os.path.exists(dst):
        shutil.rmtree(dst)
    out, built = os.path.join(dst, 'out'), os.path.join(dst, 'built')
    shutil.copytree('art/painted/out', out)
    shutil.copytree('art/painted/built', built)
    Image.open(tile_png).convert('RGB').save(os.path.join(built, 'land', '0000', 'ground.png'))
    paint.join(built=built, out=out)


def world(painting, target, out, tiles=4, band=24):
    # a `tiles`-tile repeat at 64 px a tile: the middle tiles x tiles of the painting (1024/6 px a tile), faded at its
    # edges into its half-shifted copy as wrapped() does, its broad patches evened over a wide blur, its mean the target
    p = Image.open(painting).convert('RGB')
    n = p.width * tiles // TILES
    o = (p.width - n) // 2
    a = np.asarray(p.crop((o, o, o + n, o + n)).resize((tiles * 64, tiles * 64), Image.LANCZOS)).astype(np.float32)
    side = a.shape[0]
    for axis in (0, 1):
        k = np.arange(side, dtype=np.float32)
        w = np.minimum(1.0, np.minimum(k, side - 1 - k) / band)
        w = w[:, None, None] if axis == 0 else w[None, :, None]
        a = a * w + np.roll(a, side // 2, axis=axis) * (1 - w)
    broad = ndimage.gaussian_filter(a, (16, 16, 0), mode='wrap')
    a = a - broad + broad.mean(axis=(0, 1))
    a = a - a.reshape(-1, 3).mean(0) + target
    Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8)).save(out)


def mask_joined(layers_out):
    # the joined single tiles' grounds with alpha = 1 - grass, so the world texture shows through their land
    import designs
    from variants import soft_mask
    for asset in designs.single_tile_assets():
        if not designs.is_joined(asset):
            continue
        path = os.path.join(layers_out, asset, 'ground.png')
        p = np.asarray(Image.open(path).convert('RGBA')).copy()
        m = soft_mask(Image.open(os.path.join('art/blender/out', asset, 'ground.png')))
        p[..., 3] = np.clip((1 - m) * 255, 0, 255).round().astype(np.uint8)
        Image.fromarray(p, 'RGBA').save(path)


if __name__ == '__main__':
    step = sys.argv[1]
    if step == 'world':
        world(sys.argv[2], rgb(sys.argv[3]), sys.argv[4])
    elif step == 'mask-joined':
        mask_joined(sys.argv[2])
    if step == 'ref':
        ref(rgb(sys.argv[3]), sys.argv[4])
    elif step == 'tile':
        tile(sys.argv[2], rgb(sys.argv[3]), sys.argv[4])
    elif step == 'variant':
        variant(sys.argv[2], sys.argv[3])
