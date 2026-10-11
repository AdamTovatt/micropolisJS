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

"""Cutting the things a painting holds off its flat magenta ground, as the parks' trees (trees.py) and the walkers'
figures (walkers.py) are painted: each thing as an RGBA image, the magenta taken out of its colours. Needs Pillow, NumPy
and SciPy.
"""

import numpy as np
from PIL import Image
from scipy import ndimage

MAGENTA = np.array([1.0, 0.0, 1.0])     # the painting's ground
CLEAR = 0.6             # how far a pixel is magenta, from 0 to 1, at or over which it is clear
OPAQUE = 0.2            # and at or under which it is opaque
SMALLEST = 0.002        # the least share of the painting a thing covers, under which a fleck of paint is no thing
MARGIN = 1.06           # the side of the square a thing is cut into, over the largest thing's: room round it


def cut(painting, px, what):
    # The things on the painting, each an RGBA image px a side and its square's alpha at the painting's own size, as
    # {'image', 'alpha'}, in the order they lie on the painting, row by row: a thing is in the row of the one above it
    # unless its top lies below that one's middle. Every thing is cut into a square of one size, the largest's, so they
    # keep their sizes. Fails naming the painting and what it should hold where it holds none.
    rgb = np.asarray(Image.open(painting).convert('RGB')).astype(np.float64) / 255
    # how far each pixel is the ground's magenta: as far as its red and blue stand over its green
    magenta = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, 1)
    alpha = np.clip((CLEAR - magenta) / (CLEAR - OPAQUE), 0, 1)
    # the paint's own colour where the ground shows through it, the magenta taken out, and what of it is left at the
    # edges, where red and blue both stand over green, taken down to green, since nothing painted is magenta
    held = np.maximum(alpha, 1e-6)[..., None]
    colour = np.clip((rgb - (1 - alpha)[..., None] * MAGENTA) / held, 0, 1)
    colour = without_spill(colour)
    labels, _ = ndimage.label(alpha > 0.5)
    found = []
    for k, (rows, columns) in enumerate(ndimage.find_objects(labels)):
        if (labels == k + 1).sum() < SMALLEST * alpha.size:
            continue
        own = ndimage.binary_dilation(labels == k + 1, iterations=2)
        found.append({'top': rows.start, 'bottom': rows.stop, 'middle': (rows.start + rows.stop) / 2,
                      'left': columns.start, 'right': columns.stop, 'own': own})
    if not found:
        raise SystemExit(f'{painting} holds no {what}')

    side = int(round(MARGIN * max(max(t['bottom'] - t['top'], t['right'] - t['left']) for t in found)))
    rgba = np.dstack([colour, alpha])
    for thing in found:
        top = (thing['top'] + thing['bottom'] - side) // 2
        left = (thing['left'] + thing['right'] - side) // 2
        own = np.pad(rgba * thing['own'][..., None], ((side, side), (side, side), (0, 0)))
        square = own[top + side:top + 2 * side, left + side:left + 2 * side]
        image = Image.fromarray(np.round(square * 255).astype(np.uint8), 'RGBA')
        thing['image'] = despilled(image.resize((px, px), Image.LANCZOS))
        thing['alpha'] = square[..., 3]

    found.sort(key=lambda thing: thing['top'])
    rows = [[found[0]]]
    for thing in found[1:]:
        if thing['top'] > rows[-1][0]['middle']:
            rows.append([])
        rows[-1].append(thing)
    return [{'image': thing['image'], 'alpha': thing['alpha']}
            for row in rows for thing in sorted(row, key=lambda thing: thing['left'])]


def without_spill(colour):
    # The colours given, red, green and blue from 0 to 1, with as much of red and blue as both stand over green taken
    # down to green: the magenta ground's spill, since nothing painted is magenta
    spill = np.clip(np.minimum(colour[..., 0], colour[..., 2]) - colour[..., 1], 0, 1)
    held = colour.copy()
    held[..., 0] -= spill
    held[..., 2] -= spill
    return held


def despilled(image):
    # An RGBA image with the magenta's spill taken out of its colours, as resampling a thing's edge mixes it back in
    pixels = np.asarray(image).astype(np.float64) / 255
    pixels[..., :3] = without_spill(pixels[..., :3])
    return Image.fromarray(np.round(pixels * 255).astype(np.uint8), 'RGBA')
