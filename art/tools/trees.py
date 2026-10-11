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

"""The parks (docs/render-assets.md): the trees the game stands on a park's ninths, each cut from the painting in
art/painted/raw/trees, trees on a flat magenta ground, with the soft shadow each casts, and the constants of the
manifest's parks section, which the atlas build (atlas.py) writes as they are. Needs Pillow, NumPy and SciPy.
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
PAINTING = os.path.join(HERE, '..', 'painted', 'raw', 'trees', 'trees.png')

CROWN_PX = 36           # a tree's square in the atlas, as large as the largest tree at 64 px a tile: a whole multiple
                        # of 4, as the atlas asks
SHADOW_SPAN = 2         # the side of a tree's shadow's square, in sides of the tree's square, centred on it
SHADOW_PX = CROWN_PX * SHADOW_SPAN
MAGENTA = np.array([1.0, 0.0, 1.0])     # the painting's ground
CLEAR = 0.6             # how far a pixel is magenta, from 0 to 1, at or over which it is clear
OPAQUE = 0.2            # and at or under which it is opaque
SMALLEST = 0.002        # the least share of the painting a tree covers, under which a fleck of paint is no tree
MARGIN = 1.06           # the side of the square a tree is cut into, over the largest tree's: room round its crown,
                        # so it keeps within its ninth

# The shadow a tree casts right and down, away from the sun the art is lit by: how far, in sides of the tree's square,
# how dark, from 0 to 1, and how soft, the blur's deviation in sides of the tree's square
SHADOW = {'offset': 0.32, 'darkness': 0.85, 'blur': 0.07}

# The manifest's parks section but for its trees' rectangles: where a park's lush grass fades out over its edge, cut, and
# over how much of the surface the parks make, feather, and how far the canopy's wobble moves that edge, from 0 to 1;
# and the trees: the seed of the hash that picks which ninths hold one, which, how large and where in its ninth, the
# share of the ninths that do, the groves' noise, which moves that share from ninth to ninth, on the grass mask's
# gradients (grass.py), the side of the smallest tree's square and the largest's, in ninths, and the side of each tree's
# shadow's square in its own square's sides
PARKS = {'cut': 0.42, 'feather': 0.5, 'wobble': 0.6}
TREES = {'seed': 28673, 'leafy': 0.75,
         'groves': {'octaves': [{'cell': 2.0, 'seed': 28675, 'weight': 2.2, 'turn': [0.819648, 0.572867]}]},
         'smallest': 0.7, 'largest': 1.6, 'shadowSpan': SHADOW_SPAN}


def build_trees(painting=PAINTING):
    # The trees, each as an RGBA image CROWN_PX a side and its shadow, black whose alpha is its darkness, SHADOW_PX a
    # side, in the order they lie on the painting, row by row: a tree is in the row of the one above it unless its top
    # lies below that one's middle. Every tree is cut into a square of one size, the largest's, so they keep their sizes.
    rgb = np.asarray(Image.open(painting).convert('RGB')).astype(np.float64) / 255
    # how far each pixel is the ground's magenta: as far as its red and blue stand over its green
    magenta = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, 1)
    alpha = np.clip((CLEAR - magenta) / (CLEAR - OPAQUE), 0, 1)
    # the paint's own colour where the ground shows through it, the magenta taken out, and what of it is left at the
    # crowns' edges, where red and blue both stand over green, taken down to green, since no tree is magenta
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
        raise SystemExit(f'{painting} holds no tree')

    side = int(round(MARGIN * max(max(t['bottom'] - t['top'], t['right'] - t['left']) for t in found)))
    rgba = np.dstack([colour, alpha])
    trees = []
    for tree in found:
        top = (tree['top'] + tree['bottom'] - side) // 2
        left = (tree['left'] + tree['right'] - side) // 2
        own = np.pad(rgba * tree['own'][..., None], ((side, side), (side, side), (0, 0)))
        square = own[top + side:top + 2 * side, left + side:left + 2 * side]
        crown = Image.fromarray(np.round(square * 255).astype(np.uint8), 'RGBA')
        trees.append({**tree, 'crown': despilled(crown.resize((CROWN_PX, CROWN_PX), Image.LANCZOS)),
                      'shadow': shadow_of(square[..., 3], side)})

    trees.sort(key=lambda tree: tree['top'])
    rows = [[trees[0]]]
    for tree in trees[1:]:
        if tree['top'] > rows[-1][0]['middle']:
            rows.append([])
        rows[-1].append(tree)
    return [{'crown': tree['crown'], 'shadow': tree['shadow']}
            for row in rows for tree in sorted(row, key=lambda tree: tree['left'])]


def without_spill(colour):
    # The colours given, red, green and blue from 0 to 1, with as much of red and blue as both stand over green taken
    # down to green: the magenta ground's spill, since no tree is magenta
    spill = np.clip(np.minimum(colour[..., 0], colour[..., 2]) - colour[..., 1], 0, 1)
    held = colour.copy()
    held[..., 0] -= spill
    held[..., 2] -= spill
    return held


def despilled(image):
    # An RGBA image with the magenta's spill taken out of its colours, as resampling a crown's edge mixes it back in
    pixels = np.asarray(image).astype(np.float64) / 255
    pixels[..., :3] = without_spill(pixels[..., :3])
    return Image.fromarray(np.round(pixels * 255).astype(np.uint8), 'RGBA')


def shadow_of(alpha, side):
    # The shadow of a crown whose alpha fills a square `side` a side: the crown's alpha moved SHADOW's offset right and
    # down, blurred, and as dark as SHADOW's darkness where the crown is whole, in a square SHADOW_SPAN times as wide
    # centred on the crown's, SHADOW_PX a side
    canvas = np.zeros((SHADOW_SPAN * side, SHADOW_SPAN * side))
    at = (SHADOW_SPAN - 1) * side // 2 + int(round(SHADOW['offset'] * side))
    canvas[at:at + side, at:at + side] = alpha
    soft = ndimage.gaussian_filter(canvas, SHADOW['blur'] * side) * SHADOW['darkness']
    black = np.zeros(canvas.shape + (4,))
    black[..., 3] = np.clip(soft, 0, 1)
    image = Image.fromarray(np.round(black * 255).astype(np.uint8), 'RGBA')
    return image.resize((SHADOW_PX, SHADOW_PX), Image.LANCZOS)


def sheet_park(lush, trees, tile_px):
    # A park's 16 px sheet cell, at tile_px a tile, for the minimap: the lush grass, with a tree on two ninths in three,
    # each with its shadow, in a fixed pattern
    ninth = tile_px / 3
    cell = Image.fromarray(lush).convert('RGBA').resize((tile_px, tile_px), Image.LANCZOS)
    # each tree and its ninth's top-left, in the cell's pixels
    planted = [(trees[n % len(trees)], (int(round(n % 3 * ninth)), int(round(n // 3 * ninth))))
               for n in range(9) if n % 3 != 1]
    # the shadows on a canvas reaching past the cell on every side, as far as a shadow reaches past its ninth
    pad = int(round((SHADOW_SPAN - 1) * ninth / 2))
    shadows = Image.new('RGBA', (tile_px + 2 * pad, tile_px + 2 * pad))
    for tree, at in planted:
        side = int(round(SHADOW_SPAN * ninth))
        shadows.alpha_composite(tree['shadow'].resize((side, side), Image.LANCZOS), at)
    cell.alpha_composite(shadows.crop((pad, pad, pad + tile_px, pad + tile_px)))
    for tree, at in planted:
        cell.alpha_composite(tree['crown'].resize((int(round(ninth)), int(round(ninth))), Image.LANCZOS), at)
    return cell
