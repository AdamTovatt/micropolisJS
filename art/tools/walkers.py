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

"""The small people the game draws its walkers as (docs/render-assets.md): each a head and shoulders seen from above,
cut from the painting in art/painted/raw/walkers, people on a flat magenta ground, their shoulders in white clothing,
which the game tints its walker's colour, round a head of dark hair, which stays dark under the tint. The atlas build
(atlas.py) packs them with the sprites and writes them into the manifest's walkers section. Needs Pillow, NumPy and
SciPy.
"""

import os

from PIL import Image

import magenta

HERE = os.path.dirname(os.path.abspath(__file__))
PAINTING = os.path.join(HERE, '..', 'painted', 'raw', 'walkers', 'people.png')

FIGURE_PX = 16          # a figure's square in the atlas, a few times as large as at 64 px a tile: a whole multiple of
                        # 4, as the atlas asks
AXES = ('vertical', 'horizontal')   # the axes of the map a walker walks along, each with a figure of its own


def build_figures(painting=PAINTING):
    # The figures, in the order they lie on the painting, row by row (magenta.cut), each as RGBA images FIGURE_PX a side
    # for each axis of the map a walker walks along, its shoulders running across it: vertical, as painted, its
    # shoulders running across the map, and horizontal, the painting mirrored over its diagonal from the top-left, so
    # its shoulders run down the map and the light still falls from the upper left
    return [{'vertical': figure['image'], 'horizontal': figure['image'].transpose(Image.Transpose.TRANSPOSE)}
            for figure in magenta.cut(painting, FIGURE_PX, 'figure')]
