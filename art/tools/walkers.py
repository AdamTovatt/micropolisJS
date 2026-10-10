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

"""The dabs of paint the game draws its walkers as (docs/render-assets.md): each cut from the painting in
art/painted/raw/walkers, white paint on black, its paint's lightness its opacity, centred in a square DAB_PX a side.
The game tints each dab its walker's colour. The atlas build (atlas.py) packs them with the sprites and writes them into
the manifest's walkers section. Needs Pillow, NumPy and SciPy.
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
PAINTING = os.path.join(HERE, '..', 'painted', 'raw', 'walkers', 'dabs.png')

DAB_PX = 32             # a dab's square in the atlas: a whole multiple of 4, as the atlas asks
CLEAR = 0.15            # the paint's lightness, from 0 to 1, at or under which a dab is clear
OPAQUE = 0.45           # and at or over which it is opaque
SMALLEST = 0.002        # the least share of the painting a dab covers, under which a fleck of paint is no dab


def build_dabs(painting=PAINTING):
    # The dabs, as RGBA images DAB_PX a side, in the order they lie on the painting, row by row: a dab is in the row of
    # the one above it unless its top lies below that one's middle
    rgb = np.asarray(Image.open(painting).convert('RGB')).astype(np.float64) / 255
    light = rgb.max(axis=2)
    alpha = np.clip((light - CLEAR) / (OPAQUE - CLEAR), 0, 1)
    labels, _ = ndimage.label(alpha > 0)
    found = []
    for k, (rows, columns) in enumerate(ndimage.find_objects(labels)):
        own = labels == k + 1
        if own.sum() < SMALLEST * light.size:
            continue
        # the dab's own pixels, in a square round its middle, so it keeps its shape
        rgba = np.dstack([rgb, alpha]) * own[..., None]
        side = max(rows.stop - rows.start, columns.stop - columns.start)
        top = (rows.start + rows.stop - side) // 2
        left = (columns.start + columns.stop - side) // 2
        padded = np.pad(rgba, ((side, side), (side, side), (0, 0)))
        square = padded[top + side:top + 2 * side, left + side:left + 2 * side]
        image = Image.fromarray(np.round(square * 255).astype(np.uint8), 'RGBA')
        found.append({'top': rows.start, 'middle': (rows.start + rows.stop) / 2, 'left': columns.start,
                      'image': image.resize((DAB_PX, DAB_PX), Image.LANCZOS)})
    if not found:
        raise SystemExit(f'{painting} holds no dab of paint')

    found.sort(key=lambda dab: dab['top'])
    rows = [[found[0]]]
    for dab in found[1:]:
        if dab['top'] > rows[-1][0]['middle']:
            rows.append([])
        rows[-1].append(dab)
    return [dab['image'] for row in rows for dab in sorted(row, key=lambda dab: dab['left'])]
