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

"""The table of designs in designs.py against the painted layers, and the build's atlases against
the limits docs/render-assets.md sets."""

import os
from collections import Counter

import numpy as np
from PIL import Image

import manifests
from atlas import ATLAS_SIDE, GUTTER
from designs import (FRAMES, LAYERS, PAINTED, SHEET_COLUMNS, SINGLE_TILES, SPRITES, TILE_PX, ZONES, asset_names,
                     is_vehicle, load)

TILE_IDS = range(SHEET_COLUMNS * SHEET_COLUMNS)    # 0 to 1023 (docs/render-assets.md)
SPRITE_TYPES = range(1, 8)


def _painted():
    # every directory of layers under art/painted/out, by its asset name
    return {os.path.relpath(d, PAINTED).replace(os.sep, '/') for d, _, files in os.walk(PAINTED)
            if 'layers.json' in files}


def test_every_design_the_table_names_is_painted():
    assert sorted(set(asset_names()) - _painted()) == []


def test_every_painted_design_is_in_the_table():
    assert sorted(_painted() - set(asset_names())) == []


def test_every_painted_design_has_its_layers():
    # all three, but a vehicle's frame, which has no ground
    missing = [f'{asset}/{layer}.png' for asset in sorted(_painted()) for layer in LAYERS
               if not (is_vehicle(asset) and layer == 'ground')
               and not os.path.exists(os.path.join(PAINTED, asset, f'{layer}.png'))]
    grounds = [f'{asset}/ground.png' for asset in sorted(_painted())
               if is_vehicle(asset) and os.path.exists(os.path.join(PAINTED, asset, 'ground.png'))]
    assert missing + grounds == []


def _assigned():
    # every tile id the table assigns, once for each time it does
    ids = [t for groups in SINGLE_TILES.values() for group in groups.values() for t in group]
    for zone, first in ZONES.items():
        n = load(PAINTED, zone).tiles
        ids += [first + row * n + column for row in range(n) for column in range(n)]
    ids += [t for tiles in FRAMES.values() for frames in tiles.values() for t in frames]
    return ids


def test_no_tile_id_is_assigned_twice():
    assert sorted(t for t, n in Counter(_assigned()).items() if n > 1) == []


def test_every_assigned_id_is_a_tile_id():
    assert sorted(t for t in _assigned() if t not in TILE_IDS) == []


def test_every_animated_tile_is_in_its_zone():
    outside = []
    for zone, tiles in FRAMES.items():
        n = load(PAINTED, zone).tiles
        outside += [f'{zone} {tile}' for tile in tiles if not 0 <= tile - ZONES[zone] < n * n]
    assert outside == []


def test_no_sprite_type_is_two_vehicles():
    types = Counter(sprite['type'] for sprite in SPRITES.values())
    assert sorted(t for t, n in types.items() if n > 1) == []


def test_every_sprite_type_is_one_the_game_has():
    assert sorted(v for v, sprite in SPRITES.items() if sprite['type'] not in SPRITE_TYPES) == []


def test_the_manifest_keys_are_in_range(built):
    manifest = manifests.read(os.path.join(built, 'render'))
    assert sorted(t for t in manifest['tiles'] if int(t) not in TILE_IDS) == []
    assert sorted(t for t, layers in manifest['tiles'].items() if 'ground' not in layers) == []
    assert sorted(t for t in manifest['sprites'] if int(t) not in SPRITE_TYPES) == []


def test_every_atlas_fits_the_format(built):
    # at most ATLAS_SIDE a side; every rectangle on a multiple of 4 inside a gutter of its own edge
    # pixels GUTTER wide, which lies inside the atlas and overlaps no other rectangle's; and every
    # shadow as large as its reach, the anchor and the tiles past it on each side
    render = os.path.join(built, 'render')
    manifest = manifests.read(render)
    atlases = {name: np.asarray(Image.open(os.path.join(render, path)).convert('RGBA'))
               for name, path in manifest['atlases'].items()}
    taken = {name: np.zeros(a.shape[:2], bool) for name, a in atlases.items()}
    assert sorted(name for name, a in atlases.items() if max(a.shape[:2]) > ATLAS_SIDE) == []
    for what, r in manifests.rectangles(manifest):
        a = atlases[r['atlas']]
        x, y, w, h = r['x'], r['y'], r['width'], r['height']
        assert w >= 1 and h >= 1, what
        assert x % 4 == 0 and y % 4 == 0, what
        assert x >= GUTTER and y >= GUTTER and x + w + GUTTER <= a.shape[1] and y + h + GUTTER <= a.shape[0], what
        padded = a[y - GUTTER:y + h + GUTTER, x - GUTTER:x + w + GUTTER]
        edge = np.pad(a[y:y + h, x:x + w], ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode='edge')
        assert np.array_equal(padded, edge), f'{what}: its gutter is not its edge'
        claimed = taken[r['atlas']][y - GUTTER:y + h + GUTTER, x - GUTTER:x + w + GUTTER]
        assert not claimed.any(), f'{what} overlaps another rectangle'
        claimed[...] = True
        if 'reach' in r:
            reach = r['reach']
            size = ((reach['left'] + 1 + reach['right']) * TILE_PX, (reach['top'] + 1 + reach['bottom']) * TILE_PX)
            assert (w, h) == size, f'{what} is not the size of its reach'
