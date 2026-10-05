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

"""Cut the objects out of a sprite sheet drawn on a black background.

Each object becomes its own transparent PNG, cropped to fit, named <prefix>-NN in
reading order (top row first, left to right). The background is the near-black area
connected to the sheet's border, so dark gaps inside an object, such as the shade
between a tree's leaves, stay part of it.

    python art/tools/cutout.py art/sheets/cars.png art/cutouts/cars car

Needs Pillow, NumPy and SciPy.
"""

import argparse
import os

import numpy as np
from PIL import Image
from scipy import ndimage


def cut(sheet_path, out_dir, prefix, threshold, group_px, min_area):
    rgb = np.asarray(Image.open(sheet_path).convert('RGB'))
    dark = rgb.max(axis=2) <= threshold
    regions, _ = ndimage.label(dark)
    border = np.unique(np.concatenate([regions[0], regions[-1], regions[:, 0], regions[:, -1]]))
    background = np.isin(regions, border[border > 0])
    solid = ~background

    # group nearby fragments (a plant's leaves, a car's mirrors) into one object
    groups, count = ndimage.label(ndimage.binary_dilation(solid, iterations=group_px),
                                  structure=np.ones((3, 3)))
    found = []
    for i, box in enumerate(ndimage.find_objects(groups), start=1):
        part = solid[box] & (groups[box] == i)
        if part.sum() >= min_area:
            found.append((box, part))

    # reading order: cluster into rows by vertical centre, then left to right
    found.sort(key=lambda f: (f[0][0].start + f[0][0].stop) / 2)
    rows, row = [], []
    for f in found:
        centre = (f[0][0].start + f[0][0].stop) / 2
        if row and centre - (row[-1][0][0].start + row[-1][0][0].stop) / 2 > (row[-1][0][0].stop - row[-1][0][0].start) / 2:
            rows.append(row)
            row = []
        row.append(f)
    if row:
        rows.append(row)
    ordered = [f for r in rows for f in sorted(r, key=lambda f: f[0][1].start)]

    os.makedirs(out_dir, exist_ok=True)
    for n, (box, part) in enumerate(ordered, start=1):
        # pull the edge in by a pixel and soften it, so no black fringe from the sheet survives
        edge = ndimage.binary_erosion(part, iterations=1)
        alpha = ndimage.gaussian_filter(edge.astype(float), 0.7)
        alpha = (np.clip(alpha * 1.15, 0, 1) * 255).astype(np.uint8)
        rgba = np.dstack([rgb[box], alpha])
        rgba = np.pad(rgba, ((2, 2), (2, 2), (0, 0)))
        name = f'{prefix}-{n:02d}.png'
        Image.fromarray(rgba, 'RGBA').save(os.path.join(out_dir, name))
        print(f'{name}: {rgba.shape[1]}x{rgba.shape[0]}')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('sheet')
    p.add_argument('out_dir')
    p.add_argument('prefix')
    p.add_argument('--threshold', type=int, default=14, help='brightest channel value still counted as background')
    p.add_argument('--group', type=int, default=4, help='pixels across which fragments join into one object')
    p.add_argument('--min-area', type=int, default=400, help='smallest object kept, in pixels')
    a = p.parse_args()
    cut(a.sheet, a.out_dir, a.prefix, a.threshold, a.group, a.min_area)
