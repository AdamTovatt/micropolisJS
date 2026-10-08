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

"""Make prototype copies of art/painted/out:

  match <dst>  B: every ground's grass moved to the bare land's grass statistics
  mask  <dst>  A/C: every ground.png gets alpha = 1 - grass mask (grass from the render's ground)

Run from the repository root with the art venv. Grass is paint.py's is_grass on the *render's*
ground, softened by a small blur, so the mask is Blender's boundary, as hold_ground uses it.
"""
import os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, 'art/tools')
from paint import is_grass  # noqa: E402

SRC, RENDERS = 'art/painted/out', 'art/blender/out'


def soft_mask(render_ground):
    g = is_grass(np.asarray(render_ground.convert('RGB'))).astype(np.float32)
    return ndimage.gaussian_filter(g, 0.6)


def grounds(root):
    for d, _, files in os.walk(root):
        if 'ground.png' in files and 'layers.json' in files:
            yield os.path.relpath(d, root)


def land_stats():
    p = np.asarray(Image.open(f'{SRC}/land/0000/ground.png').convert('RGB')).astype(np.float32)
    flat = p.reshape(-1, 3)
    return flat.mean(0), flat.std(0)


def match(dst, keep_detail=(0.6, 1.0)):
    mt, st = land_stats()
    for rel in grounds(dst):
        r = os.path.join(RENDERS, rel, 'ground.png')
        if not os.path.exists(r):
            continue
        path = os.path.join(dst, rel, 'ground.png')
        img = Image.open(path).convert('RGBA')
        p = np.asarray(img).astype(np.float32)
        m = soft_mask(Image.open(r))
        hard = m > 0.5
        if hard.sum() < 50:
            continue
        rgb = p[..., :3]
        ma, sa = rgb[hard].mean(0), rgb[hard].std(0) + 1e-3
        k = np.clip(st / sa, *keep_detail)
        moved = mt + (rgb - ma) * k
        out = rgb * (1 - m[..., None]) + moved * m[..., None]
        p[..., :3] = np.clip(out, 0, 255)
        Image.fromarray(p.round().astype(np.uint8), 'RGBA').save(path)


def mask(dst):
    for rel in grounds(dst):
        r = os.path.join(RENDERS, rel, 'ground.png')
        if not os.path.exists(r):
            continue
        path = os.path.join(dst, rel, 'ground.png')
        img = Image.open(path).convert('RGBA')
        p = np.asarray(img).copy()
        m = soft_mask(Image.open(r))
        p[..., 3] = np.clip((1 - m) * 255, 0, 255).round().astype(np.uint8)
        Image.fromarray(p, 'RGBA').save(path)


if __name__ == '__main__':
    what, dst = sys.argv[1], sys.argv[2]
    if os.path.exists(dst):
        shutil.rmtree(dst)
    shutil.copytree(SRC, dst)
    {'match': match, 'mask': mask}[what](dst)
