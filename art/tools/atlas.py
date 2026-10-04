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

"""Build the map's atlases and their manifest (docs/render-assets.md), the 16 px sheets and the
page background, from one set of layers: the painted layers in art/painted/out, or the renders in
art/blender/out, which are laid out alike.

    python art/tools/atlas.py --source art/painted/out

Writes render/ (the manifest and its atlases, replacing the atlases it wrote before), tiles.png and
sprites.png, and dirtbg.png into images/, or the directory --out names. The 16 px sheets are the
original ones in art/sheets/ with every tile id and sprite frame it has art for drawn into its
cell, so the build reads nothing it wrote. Which design fills which tile ids is in designs.py: the
single-tile sets by SINGLE_TILES, the zones by ZONES, their animations by FRAMES, the vehicles by
SPRITES. Needs Pillow and NumPy.
"""

import argparse
import json
import os
import re

import numpy as np
from PIL import Image

from designs import (DIRT, FRAMES, IMAGES, ORIGINAL_SPRITES, ORIGINAL_TILES, SHEET_COLUMNS, SHEET_PX,
                     OVER_SHADOWS, SINGLE_TILES, SPRITE_CELL, SPRITES, TILE_PX, ZONES, load, single_tile,
                     single_tile_ids, sprite_frame, tile_asset, zone_frame)

GUTTER = 4                     # each rectangle's edge pixels repeated this far outward, from a multiple of 4,
                               # so the two mip levels down to 16 px a tile don't bleed (docs/render-assets.md)
ATLAS_SIDE = 4096              # the largest atlas the format allows


def visible(image):
    return np.asarray(image.getchannel('A')).max() > 0


def assets(source):
    # Every asset with its first tile id, and the frames of each animated tile: (id, asset, column, row)
    found, frames = [], []
    for name in SINGLE_TILES:
        for tile in single_tile_ids(name):
            found.append((tile, load(source, tile_asset(name, tile))))
    for name, first in ZONES.items():
        found.append((first, load(source, name)))
    for name, tiles in FRAMES.items():
        size = load(source, name).tiles
        for tile, ids in tiles.items():
            offset = tile - ZONES[name]
            for k, frame_id in enumerate(ids):
                frame = load(source, zone_frame(name, k))
                frames.append((frame_id, frame, offset % size, offset // size))
    return found, frames


class Atlases:
    # Rectangles packed in shelves into atlases of at most ATLAS_SIDE a side, named <kind>-<n>, each
    # starting on a multiple of 4 with GUTTER pixels of its own edge round it
    def __init__(self, kind, mode):
        self.kind, self.mode, self.pages, self.extents = kind, mode, [], []

    def pack(self, images):
        # `images` maps a key to an image; returns a rectangle for each key, packing the tallest first
        rects = {}
        x = y = shelf = 0
        for key in sorted(images, key=lambda k: (-images[k].height, -images[k].width, str(k))):
            image = images[key]
            if image.width % 4 or image.height % 4:
                raise SystemExit(f'{self.kind} {key} is {image.size}: not whole multiples of 4, so the next '
                                 f'rectangle would not start on one')
            w, h = image.width + 2 * GUTTER, image.height + 2 * GUTTER
            if not self.pages or x + w > ATLAS_SIDE:
                x, y, shelf = 0, y + shelf, 0
            if not self.pages or y + h > ATLAS_SIDE:
                self.pages.append(Image.new(self.mode, (ATLAS_SIDE, ATLAS_SIDE)))
                self.extents.append([0, 0])
                x = y = shelf = 0
            padded = np.pad(np.asarray(image.convert(self.mode)), ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)),
                            mode='edge')
            self.pages[-1].paste(Image.fromarray(padded, self.mode), (x, y))
            rects[key] = {'atlas': f'{self.kind}-{len(self.pages) - 1}', 'x': x + GUTTER, 'y': y + GUTTER,
                          'width': image.width, 'height': image.height}
            extent = self.extents[-1]
            extent[0], extent[1] = max(extent[0], x + w), max(extent[1], y + h)
            x, shelf = x + w, max(shelf, h)
        return rects

    def save(self, directory):
        # each page cut down to what it holds; returns the manifest's atlases
        names = {}
        for n, (page, (right, bottom)) in enumerate(zip(self.pages, self.extents)):
            name = f'{self.kind}-{n}'
            page.crop((0, 0, right, bottom)).save(os.path.join(directory, f'{name}.png'), optimize=True)
            names[name] = f'{name}.png'
        return names


def build(source, out=IMAGES):
    found, frames = assets(source)
    render = os.path.join(out, 'render')
    ground, shadows, objects = {}, {}, {}
    reach = {}
    sheet_tiles = {}

    def claim(tile_id, what):
        if tile_id in ground:
            raise SystemExit(f'tile {tile_id} has art twice, the second from {what}')
        if not 0 <= tile_id < SHEET_COLUMNS * SHEET_COLUMNS:
            raise SystemExit(f'tile {tile_id}, from {what}, is not a tile id')

    for first, asset in found:
        composite = asset.composite()
        for row in range(asset.tiles):
            for column in range(asset.tiles):
                tile_id = first + row * asset.tiles + column
                claim(tile_id, f'the asset at {first}')
                ground[tile_id] = asset.tile('ground', column, row).convert('RGB')
                o = asset.tile('objects', column, row)
                if visible(o):
                    objects[tile_id] = o
                x, y = column * TILE_PX, row * TILE_PX
                sheet_tiles[tile_id] = composite.crop((x, y, x + TILE_PX, y + TILE_PX))
        # the shadow whole, on the anchor: the zone's centre, one tile in from its top-left, or the
        # tile itself, reaching as docs/render-assets.md works it out
        a = 1 if asset.tiles > 1 else 0
        if visible(asset.layers['shadow']):
            anchor = first + a * asset.tiles + a
            m = asset.margin
            shadows[anchor] = asset.layers['shadow']
            reach[anchor] = {'left': a + m['left'], 'top': a + m['top'],
                             'right': asset.tiles - 1 - a + m['right'], 'bottom': asset.tiles - 1 - a + m['bottom']}
    for tile_id, frame, column, row in frames:
        claim(tile_id, f'a frame of tile {tile_id}')
        ground[tile_id] = frame.tile('ground', column, row).convert('RGB')
        o = frame.tile('objects', column, row)
        if visible(o):
            objects[tile_id] = o
        x, y = column * TILE_PX, row * TILE_PX
        sheet_tiles[tile_id] = frame.composite().crop((x, y, x + TILE_PX, y + TILE_PX))
    for tile_id in sorted(OVER_SHADOWS):
        if tile_id not in ground:
            raise SystemExit(f'tile {tile_id}, drawn over shadows, has no art')
        o = ground[tile_id].convert('RGBA')
        if tile_id in objects:
            o.alpha_composite(objects[tile_id])
        objects[tile_id] = o

    sprites = {}
    for vehicle, sprite in SPRITES.items():
        for k in range(sprite['frames']):
            frame = load(source, sprite_frame(vehicle, k))
            image = frame.layers['shadow'].copy()
            image.alpha_composite(frame.layers['objects'])
            square = sprite['square']
            inset = (frame.tiles - square) * TILE_PX // 2
            image = image.crop((inset, inset, inset + square * TILE_PX, inset + square * TILE_PX))
            # the game counts a sprite's frames from 1, the renders from 0
            sprites[(sprite['type'], k + 1)] = image

    os.makedirs(render, exist_ok=True)
    for old in os.listdir(render):
        if re.fullmatch(r'(ground|shadow|objects|sprites)-\d+\.png', old):
            os.remove(os.path.join(render, old))
    packed = {}
    atlases = {}
    for kind, mode, images in (('ground', 'RGB', ground), ('objects', 'RGBA', objects),
                               ('shadow', 'RGBA', shadows), ('sprites', 'RGBA', sprites)):
        pages = Atlases(kind, mode)
        packed[kind] = pages.pack(images)
        atlases.update(pages.save(render))

    tiles = {}
    for tile_id in sorted(ground):
        entry = {'ground': packed['ground'][tile_id]}
        if tile_id in packed['shadow']:
            entry['shadow'] = {**packed['shadow'][tile_id], 'reach': reach[tile_id]}
        if tile_id in packed['objects']:
            entry['objects'] = packed['objects'][tile_id]
        tiles[str(tile_id)] = entry
    sprite_entries = {}
    for (sprite_type, frame), rect in sorted(packed['sprites'].items()):
        sprite_entries.setdefault(str(sprite_type), {})[str(frame)] = rect
    manifest = {'version': 1, 'atlases': atlases, 'tiles': tiles, 'sprites': sprite_entries}
    with open(os.path.join(render, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')

    # the 16 px sheets, for what the game still draws from them (the splash screen's map and the
    # monster TV): the original sheet, with each tile as the game draws its asset alone, scaled down
    # into its id's cell, and each vehicle frame into its cell
    sheet = Image.open(ORIGINAL_TILES).convert('RGBA')
    for tile_id, image in sheet_tiles.items():
        x, y = tile_id % SHEET_COLUMNS * SHEET_PX, tile_id // SHEET_COLUMNS * SHEET_PX
        sheet.paste(image.resize((SHEET_PX, SHEET_PX), Image.LANCZOS), (x, y))
    sheet.save(os.path.join(out, 'tiles.png'), optimize=True)
    sprite_sheet = Image.open(ORIGINAL_SPRITES).convert('RGBA')
    for (sprite_type, frame), image in sprites.items():
        side = image.width * SHEET_PX // TILE_PX
        x, y = (frame - 1) * SPRITE_CELL, (sprite_type - 1) * SPRITE_CELL
        sprite_sheet.paste(Image.new('RGBA', (side, side)), (x, y))
        sprite_sheet.paste(image.resize((side, side), Image.LANCZOS), (x, y))
    sprite_sheet.save(os.path.join(out, 'sprites.png'), optimize=True)

    # the page's background: bare land, which repeats without a seam as every land tile on the map does
    load(source, single_tile(DIRT)).layers['ground'].convert('RGB').save(os.path.join(out, 'dirtbg.png'), optimize=True)

    print(f'{len(tiles)} tile ids, {len(shadows)} shadows and {len(sprites)} sprite frames from {source}, in '
          f'{len(atlases)} atlases: ' + ', '.join(f'{n} {Image.open(os.path.join(render, p)).size}'
                                                 for n, p in atlases.items()))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--source', required=True, help='the layers to build from: art/painted/out or art/blender/out')
    p.add_argument('--out', default=IMAGES, help='the directory to write into, images/ by default')
    a = p.parse_args()
    build(a.source, a.out)
