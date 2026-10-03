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

"""Lay rendered zones out in a grid and composite their layers as the game will.

Every zone's ground first, then the shadows of all zones merged by taking the darkest at
each pixel, so overlapping shadows never darken twice, then every zone's objects:

    python art/tools/preview.py out.png commercial_glass_tower,residential_apartment_slabs \\
        commercial_office_park,residential_courtyard_block

Each argument after the output is a row, west to east, of zone names under art/blender/out;
an empty name leaves a bare lawn. Needs Pillow.
"""

import argparse
import json
import os

from PIL import Image, ImageChops

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'blender', 'out')


def zone(name):
    d = os.path.join(OUT, name)
    with open(os.path.join(d, 'layers.json')) as f:
        info = json.load(f)
    layers = {k: Image.open(os.path.join(d, k + '.png')).convert('RGBA') for k in ('ground', 'shadow', 'objects')}
    return info, layers


def preview(rows, out_path, empty=(86, 118, 52)):
    grid = [[zone(n) if n else None for n in row] for row in rows]
    sizes = {info['tiles'] * info['tile_px'] for row in grid for z in row if z for info in [z[0]]}
    if len(sizes) != 1:
        raise ValueError('the zones must all be one size')
    zpx = sizes.pop()
    w, h = zpx * max(len(r) for r in grid), zpx * len(grid)
    ground = Image.new('RGBA', (w, h), (*empty, 255))
    shadow = Image.new('L', (w, h), 0)
    objects = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for r, row in enumerate(grid):
        for c, z in enumerate(row):
            if z is None:
                continue
            info, layers = z
            x, y = c * zpx, r * zpx
            ground.alpha_composite(layers['ground'], (x, y))
            objects.alpha_composite(layers['objects'], (x, y))
            m, px = info['shadow_margin'], info['tile_px']
            alpha = Image.new('L', (w, h), 0)
            alpha.paste(layers['shadow'].getchannel('A'), (x - m['left'] * px, y - m['top'] * px))
            shadow = ImageChops.lighter(shadow, alpha)
    dark = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    dark.putalpha(shadow)
    ground.alpha_composite(dark)
    ground.alpha_composite(objects)
    ground.convert('RGB').save(out_path)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('out')
    p.add_argument('rows', nargs='+', help='comma-separated zone names, one argument per row')
    a = p.parse_args()
    preview([row.split(',') for row in a.rows], a.out)
