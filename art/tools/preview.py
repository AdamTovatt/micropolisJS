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

"""Lay rendered zones out in a grid and composite their layers as the game will.

Every zone's ground first, then the shadows of all zones merged by taking the darkest at
each pixel, so overlapping shadows never darken twice, then every zone's objects:

    python art/tools/preview.py out.png commercial_glass_tower,residential_apartment_slabs \\
        commercial_office_park,residential_courtyard_block

Each argument after the output is a row, west to east, of zone names under art/blender/out;
an empty name leaves a bare lawn. A number names a single tile by its id, rendered by the tile
set (art/blender/tiles/) that designs.py gives it into art/blender/out/<set>/<id>, so a row of
ids is a strip of map:

    python art/tools/preview.py map.png 0,13,13,0 9,2,2,17 0,5,5,0 --original

--original also writes <out>-original.png, the same grid from the game's original 16 px tiles
(art/sheets/tiles-original.png) scaled up to the same size. --root draws from another directory of
layers in the same layout, such as the painted ones in art/painted/out. Needs Pillow.
"""

import argparse
import os

from PIL import Image, ImageChops

from designs import ORIGINAL_TILES, RENDERS, SHEET_COLUMNS, SHEET_PX, load, single_tile


def original(rows, out_path, tile_px):
    # the grid as the game's original 16 px tiles draw it, each scaled up to tile_px; a name that
    # is not a tile id is left black
    sheet = Image.open(ORIGINAL_TILES).convert('RGB')
    w, h = tile_px * max(len(r) for r in rows), tile_px * len(rows)
    grid = Image.new('RGB', (w, h))
    for r, row in enumerate(rows):
        for c, name in enumerate(row):
            if name.isdigit():
                x, y = int(name) % SHEET_COLUMNS * SHEET_PX, int(name) // SHEET_COLUMNS * SHEET_PX
                tile = sheet.crop((x, y, x + SHEET_PX, y + SHEET_PX))
                grid.paste(tile.resize((tile_px, tile_px), Image.NEAREST), (c * tile_px, r * tile_px))
    grid.save(out_path)


def zone(name, root=RENDERS):
    # a zone by its name, or a single tile by its id
    if not name.isdigit():
        return load(root, name)
    asset = single_tile(int(name))
    if asset is None:
        raise ValueError(f'no tile set renders tile {name} (SINGLE_TILES in designs.py)')
    return load(root, asset)


def preview(rows, out_path, empty=(86, 118, 52), root=RENDERS):
    grid = [[zone(n, root) if n else None for n in row] for row in rows]
    sizes = {z.size for row in grid for z in row if z}
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
            x, y = c * zpx, r * zpx
            ground.alpha_composite(z.layers['ground'], (x, y))
            objects.alpha_composite(z.layers['objects'], (x, y))
            m, px = z.margin, z.tile_px
            alpha = Image.new('L', (w, h), 0)
            alpha.paste(z.layers['shadow'].getchannel('A'), (x - m['left'] * px, y - m['top'] * px))
            shadow = ImageChops.lighter(shadow, alpha)
    dark = Image.new('RGBA', (w, h), (0, 0, 0, 255))
    dark.putalpha(shadow)
    ground.alpha_composite(dark)
    ground.alpha_composite(objects)
    ground.convert('RGB').save(out_path)
    return next(z.tile_px for row in grid for z in row if z)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('out')
    p.add_argument('rows', nargs='+', help='comma-separated zone names or tile ids, one argument per row')
    p.add_argument('--original', action='store_true', help="also write <out>-original.png from the game's tiles")
    p.add_argument('--root', default=RENDERS, help='the directory of layers to draw from, such as art/painted/out')
    a = p.parse_args()
    rows = [row.split(',') for row in a.rows]
    tile_px = preview(rows, a.out, root=a.root)
    if a.original:
        stem, _ = os.path.splitext(a.out)
        original(rows, stem + '-original.png', tile_px)
