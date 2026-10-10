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

"""The surfaces of the walkways that cross a road, rail or water without a crossing (docs/render-assets.md): a
footbridge's plank deck, from a painting of planks that repeats, scaled whole to DECK_PX a side, which the game lays
across DECK_TILES tiles; and an underpass's stair mouth, from a painting of steps going down into the dark, scaled whole
to STAIRS_PX a side, which the game draws over each ninth of walkway beside one where an underpass goes under the road
or rail. Both are cut from the paintings in art/painted/raw/walkways. The atlas build (atlas.py) packs them with the
grass and writes them into the manifest's walkway section. Needs Pillow.
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PAINTINGS = os.path.join(HERE, '..', 'painted', 'raw', 'walkways')

DECK_PX = 192           # the deck's square in the atlas, the painting's twelve planks across DECK_TILES tiles
DECK_TILES = 3          # the tiles one repeat of the deck spans, so about four planks a tile
STAIRS_PX = 64          # the stair mouth's square, a ninth's at the closest zoom


def build(paintings=PAINTINGS):
    # The deck and the stair mouth, as RGB images, by their names in the manifest's walkway section
    def scaled(name, side):
        return Image.open(os.path.join(paintings, f'{name}.png')).convert('RGB').resize((side, side), Image.LANCZOS)

    return {'deck': scaled('deck', DECK_PX), 'stairs': scaled('stairs', STAIRS_PX)}
