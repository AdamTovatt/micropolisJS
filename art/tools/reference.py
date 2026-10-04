# micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
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

"""Crop one zone out of a reference sheet in art/references, by row and column from 1.

    python art/tools/reference.py commercial 2 3 tower.png
    python art/tools/reference.py residential all overview.png

`all` writes the whole sheet with each zone's row and column printed on it. Needs Pillow.
"""

import argparse
import os

from PIL import Image, ImageDraw

REFERENCES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'references')

# each zone's frame on its sheet, as pixel spans: columns west to east, rows north to south
GRIDS = {
    'residential': {
        'cols': [(11, 285), (301, 569), (586, 860), (877, 1149), (1164, 1436), (1452, 1724)],
        'rows': [(35, 312), (327, 599), (614, 887)],
    },
    'commercial': {
        'cols': [(6, 257), (267, 527), (536, 798), (808, 1058), (1067, 1313), (1323, 1599), (1608, 1865)],
        'rows': [(6, 262), (272, 522), (531, 813)],
    },
    'industrial': {
        'cols': [(27, 330), (360, 664), (694, 997)],
        'rows': [(27, 330), (360, 664), (694, 998)],
    },
}


def crop(sheet, row, col, size=256):
    grid = GRIDS[sheet]
    (x0, x1), (y0, y1) = grid['cols'][col - 1], grid['rows'][row - 1]
    image = Image.open(os.path.join(REFERENCES, sheet + '-sheet.png')).convert('RGB')
    return image.crop((x0, y0, x1, y1)).resize((size, size), Image.LANCZOS)


def overview(sheet):
    image = Image.open(os.path.join(REFERENCES, sheet + '-sheet.png')).convert('RGB')
    draw = ImageDraw.Draw(image)
    grid = GRIDS[sheet]
    for r, (y0, _) in enumerate(grid['rows'], start=1):
        for c, (x0, _) in enumerate(grid['cols'], start=1):
            draw.rectangle((x0 + 4, y0 + 4, x0 + 44, y0 + 22), fill=(0, 0, 0))
            draw.text((x0 + 8, y0 + 8), f'{r},{c}', fill=(255, 255, 255))
    return image


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('sheet', choices=sorted(GRIDS))
    p.add_argument('row', help="row from 1, or 'all' for the labelled whole sheet")
    p.add_argument('rest', nargs='+', metavar='[col] out')
    a = p.parse_args()
    if a.row == 'all':
        overview(a.sheet).save(a.rest[0])
    else:
        crop(a.sheet, int(a.row), int(a.rest[0])).save(a.rest[1])
