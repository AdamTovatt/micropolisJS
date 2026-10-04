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

"""Put a rendered zone beside the reference it was modelled on, for one round of review.

Three panels: the reference cell, the zone composited as the game will draw it at twice its size,
and the zone among empty lawns, so its shadows show crossing its borders.

    python art/tools/compare.py commercial_glass_tower commercial 2 3 round1.png

Needs Pillow.
"""

import argparse
import os

from PIL import Image, ImageDraw

from preview import preview
from reference import crop


def compare(zone, sheet, row, col, out_path):
    city_path = out_path + '.city.png'
    preview([[zone, ''], ['', '']], city_path)
    city = Image.open(city_path).convert('RGB')
    os.remove(city_path)
    size = 384
    panels = [('Reference: %s (%d, %d)' % (sheet, row, col), crop(sheet, row, col, size)),
              (zone + ', shown at 2x', city.crop((0, 0, city.width // 2, city.height // 2)).resize((size, size),
                                                                                                Image.NEAREST)),
              ('With empty neighbours', city.resize((size, size), Image.LANCZOS))]
    gap = 12
    img = Image.new('RGB', (gap + len(panels) * (size + gap), size + 44), (40, 40, 40))
    draw = ImageDraw.Draw(img)
    for k, (label, panel) in enumerate(panels):
        x = gap + k * (size + gap)
        draw.text((x, 10), label, fill=(255, 255, 255))
        img.paste(panel, (x, 32))
    img.save(out_path)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('zone', help='a zone rendered into art/blender/out')
    p.add_argument('sheet', choices=['residential', 'commercial'])
    p.add_argument('row', type=int)
    p.add_argument('col', type=int)
    p.add_argument('out')
    a = p.parse_args()
    compare(a.zone, a.sheet, a.row, a.col, a.out)
