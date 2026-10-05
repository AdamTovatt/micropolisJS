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

"""The paint build's join, and the painted single tiles against the layers it works from, committed
in art/painted/built: a tile repainted without its built layers, or built layers that the join would
turn into other painted layers than the committed ones, fail here, naming the tiles. Without the
renders, the tests check only that each pixel of a painted tile is one the join could have written;
the join itself runs on the committed layers with --renders. Images are compared by their pixels, not
their PNG bytes, which differ between zlib versions."""

import json
import os

import numpy as np
import pytest
from PIL import Image

from designs import BUILT, BUILT_LAYERS, PAINTED, built_layers, built_tiles, is_joined, single_tile_assets
from paint import donor_paintings, join


def _pixels(root, asset):
    # a single tile's BUILT_LAYERS under `root`, by name, as RGBA arrays
    return {k: np.asarray(image) for k, image in built_layers(asset, root).items()}


def _pixels_that_differ(a, b):
    return int((a != b).any(axis=-1).sum())


def _differing(tiles, a, b, count):
    # each layer of each of `tiles` in which `count` finds pixels of the layer in `a` and in `b` that differ, with
    # how many
    found = []
    for asset in tiles:
        ours, theirs = _pixels(a, asset), _pixels(b, asset)
        for layer in BUILT_LAYERS:
            n = count(layer, ours[layer], theirs[layer])
            if n:
                found.append(f'{asset}/{layer}.png ({n} pixels)')
    return found


def _tiles(joined):
    # the single tiles with built layers the join gives donors' paintings to, or leaves, never none
    tiles = [a for a in built_tiles() if is_joined(a) == joined]
    assert tiles, f'no single tile the join {"joins" if joined else "leaves"}'
    return tiles


def test_every_painted_single_tile_has_its_built_layers():
    assert built_tiles() == sorted(single_tile_assets())
    for asset in built_tiles():
        built_layers(asset)


def test_a_tile_the_join_leaves_is_its_built_layers():
    differ = _differing(_tiles(joined=False), PAINTED, BUILT, lambda layer, painted, built:
                        _pixels_that_differ(painted, built))
    if differ:
        pytest.fail(f'painted single tiles the join leaves differ from their built layers: {", ".join(differ)}')


def test_every_pixel_of_a_joined_tile_is_its_built_layers_or_any_donors_painting_there():
    # The join writes a pixel's colour from a donor's painting of that layer, at the same pixel, or
    # leaves the built layer's, and keeps the built layer's alpha. Which donor gives a pixel is the
    # renders' to say, which CI has not, so this takes any donor's: the join from the renders, with
    # --renders below, is the strict check
    donors = donor_paintings()

    def strays(layer, painted, built):
        kept = (painted == built).all(axis=-1)
        for _, given, donor in donors:
            if given == layer:
                kept |= (painted[..., :3] == donor[..., :3]).all(axis=-1) & (painted[..., 3] == built[..., 3])
        return int((~kept).sum())

    differ = _differing(_tiles(joined=True), PAINTED, BUILT, strays)
    if differ:
        pytest.fail(f'painted single tiles hold pixels neither their built layers nor any donor painted: '
                    f'{", ".join(differ)}')


def test_the_join_from_the_built_layers_is_the_painted_layers(renders, tmp_path):
    # the whole join, run by hand with --renders: what it writes from the built layers and the renders must be the
    # committed painted layers
    join(out=str(tmp_path), renders=renders)
    joined = _tiles(joined=True)
    assert built_tiles(str(tmp_path)) == joined
    differ = _differing(joined, PAINTED, str(tmp_path), lambda layer, painted, rejoined:
                        _pixels_that_differ(painted, rejoined))
    if differ:
        pytest.fail(f'the join from art/painted/built and the renders differs from the painted single tiles: '
                    f'{", ".join(differ)}')


# The join's rules, on a row of four pixels: two ground donors whose renders agree everywhere but the third pixel,
# where only the second's matches, and an objects donor opaque everywhere but the second pixel
SIDE = 4
GREY, NEAR, FAR, LIGHT, BLACK = (100, 100, 100), (103, 100, 100), (104, 100, 100), (200, 200, 200), (0, 0, 0)
DONORS = [('land/0000', '', ('ground',)), ('water/0002', '', ('ground',)), ('rail/0224', '', ('objects',))]


def _write(path, row):
    # an image whose every row is `row`, a colour per column, RGB or RGBA
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(np.array([row] * SIDE, np.uint8)).save(path)


def _render(root, asset, ground, objects):
    _write(os.path.join(root, asset, 'ground.png'), ground)
    _write(os.path.join(root, asset, 'objects.png'), objects)
    _write(os.path.join(root, asset, 'shadow.png'), [(0, 0, 0, 0)] * SIDE)
    with open(os.path.join(root, asset, 'layers.json'), 'w') as f:
        json.dump({'tiles': 1, 'tile_px': SIDE}, f)


def _built(root, asset, ground, objects):
    _write(os.path.join(root, asset, 'ground.png'), [ground] * SIDE)
    _write(os.path.join(root, asset, 'objects.png'), objects)


@pytest.fixture
def layers(tmp_path):
    # the renders and built layers of the donors, of a tile they join and of a house, which the join leaves
    renders, built = str(tmp_path / 'renders'), str(tmp_path / 'built')
    opaque = [(*GREY, 255)] * SIDE
    _render(renders, 'land/0000', [GREY] * SIDE, opaque)
    _render(renders, 'water/0002', [GREY, GREY, LIGHT, GREY], opaque)
    _render(renders, 'rail/0224', [GREY] * SIDE, [(*GREY, 255), (*GREY, 128), (*GREY, 255), (*GREY, 255)])
    _render(renders, 'roads/0066', [NEAR, FAR, LIGHT, BLACK],
            [(*GREY, 255), (*GREY, 255), (*GREY, 200), (*BLACK, 255)])
    _built(built, 'land/0000', (10, 10, 10), [(10, 10, 10, 255)] * SIDE)
    _built(built, 'water/0002', (20, 20, 20), [(20, 20, 20, 255)] * SIDE)
    _built(built, 'rail/0224', (30, 30, 30), [(30, 30, 30, 255)] * SIDE)
    _built(built, 'roads/0066', (50, 50, 50), [(60, 60, 60, 77)] * SIDE)
    _built(built, 'houses/0249', (70, 70, 70), [(70, 70, 70, 255)] * SIDE)
    return renders, built


def test_join_takes_the_first_donor_whose_render_is_within_the_tolerance(layers, tmp_path):
    renders, built = layers
    join(built=built, out=str(tmp_path / 'out'), renders=renders, donors=DONORS)
    ground = _pixels(str(tmp_path / 'out'), 'roads/0066')['ground'][0, :, :3]
    # within 3 levels of both ground donors, the first's; 4 levels off, the tile's own; matching only the second,
    # the second's; matching neither, the tile's own
    assert ground.tolist() == [[10] * 3, [50] * 3, [20] * 3, [50] * 3]


def test_join_takes_objects_only_where_both_are_opaque_and_keeps_their_alpha(layers, tmp_path):
    renders, built = layers
    join(built=built, out=str(tmp_path / 'out'), renders=renders, donors=DONORS)
    objects = _pixels(str(tmp_path / 'out'), 'roads/0066')['objects'][0]
    # both opaque and alike, the donor's colour; the donor half transparent, the tile's half, or unlike, the tile's own
    assert objects.tolist() == [[30, 30, 30, 77], [60, 60, 60, 77], [60, 60, 60, 77], [60, 60, 60, 77]]


def test_join_leaves_a_tile_not_joined(layers, tmp_path):
    renders, built = layers
    join(built=built, out=str(tmp_path / 'out'), renders=renders, donors=DONORS)
    assert built_tiles(str(tmp_path / 'out')) == ['land/0000', 'rail/0224', 'roads/0066', 'water/0002']


def test_join_fails_naming_a_donor_with_no_built_layers(layers, tmp_path):
    renders, built = layers
    with pytest.raises(FileNotFoundError, match='woods/0037'):
        join(built=built, out=str(tmp_path / 'out'), renders=renders, donors=[*DONORS, ('woods/0037', '', ('ground',))])
