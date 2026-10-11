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

import magenta

HERE = os.path.dirname(os.path.abspath(__file__))
PAINTING = os.path.join(HERE, '..', 'painted', 'raw', 'trees', 'trees.png')

CROWN_PX = 36           # a tree's square in the atlas, as large as the largest tree at 64 px a tile: a whole multiple
                        # of 4, as the atlas asks
SHADOW_SPAN = 2         # the side of a tree's shadow's square, in sides of the tree's square, centred on it
SHADOW_PX = CROWN_PX * SHADOW_SPAN

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
    # side, in the order they lie on the painting, row by row (magenta.cut), each cut into a square of the largest's
    # size, so they keep their sizes
    return [{'crown': tree['image'], 'shadow': shadow_of(tree['alpha'])}
            for tree in magenta.cut(painting, CROWN_PX, 'tree')]


def shadow_of(alpha):
    # The shadow of a crown whose alpha fills a square: the crown's alpha moved SHADOW's offset right and down, blurred,
    # and as dark as SHADOW's darkness where the crown is whole, in a square SHADOW_SPAN times as wide centred on the
    # crown's, SHADOW_PX a side
    side = alpha.shape[0]
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
