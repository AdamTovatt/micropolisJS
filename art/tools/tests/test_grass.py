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

"""The world grass and the canopy: the conformance vectors the client is held to are the ones grass.py computes,
a set's tiles meet whatever tiles lie beside them, by their blend weights and by the tiles built, and every tile is
used. The sets themselves are checked through the atlas build, whose committed atlas and manifest hold them."""

import json

import numpy as np
import pytest

import grass


def test_the_conformance_vectors_are_the_builds():
    with open(grass.VECTORS) as f:
        committed = json.load(f)
    assert committed == grass.vectors(), 'conformance/grass.json is not what grass.py --vectors writes'


@pytest.mark.parametrize('edge', ['north', 'west'])
def test_tiles_that_share_an_edges_corners_agree_on_it(edge):
    # On a tile's edge only that edge's two corners weigh anything, by the position along it alone: tiles that share
    # those corners draw the same edge, whatever their other corners and centres
    along = (np.arange(64) + 0.5) / 64
    u, v = (along, np.zeros(64)) if edge == 'north' else (np.zeros(64), along)
    weights = grass.blend_weights(u, v)
    kept = (0, 1) if edge == 'north' else (0, 2)
    for k, w in enumerate(weights):
        if k not in kept:
            assert not w.any(), f'the {edge} edge weighs a patch other than its corners'
    assert np.allclose(weights[kept[0]] + weights[kept[1]], 1)


SETS = {**grass.SETS, 'canopy': grass.CANOPY_SET, 'water': grass.WATER_SET}


def lines(tiles):
    # The edges of two tiles that share its corners, of the tiles given, across which the step between the pixels
    # either side is over 1.5 times the steps beside it, between each tile's edge pixels and the pixels next in: the
    # same rows of the painting lie either side, so a line would show as a step out of keeping with its neighbours,
    # whatever the painting's strokes there
    tiles = [t.astype(np.float64) for t in tiles]
    colours = grass.CONSTANTS['colours']
    corners = [(t % colours, t // colours % colours, t // colours ** 2 % colours, t // colours ** 3)
               for t in range(len(tiles))]

    def step(a, b):
        return np.abs(a - b).mean()
    found = []
    for a, (nw, ne, sw, se) in enumerate(corners):
        for b, (bnw, bne, bsw, _) in enumerate(corners):
            first, then = tiles[a], tiles[b]
            if (ne, se) == (bnw, bsw):
                beside = (step(first[:, -1], first[:, -2]) + step(then[:, 1], then[:, 0])) / 2
                if step(first[:, -1], then[:, 0]) > 1.5 * beside:
                    found.append(f'tile {a} meets tile {b} east of it with a line')
            if (sw, se) == (bnw, bne):
                beside = (step(first[-1], first[-2]) + step(then[1], then[0])) / 2
                if step(first[-1], then[0]) > 1.5 * beside:
                    found.append(f'tile {a} meets tile {b} south of it with a line')
    return found


@pytest.mark.parametrize('name', sorted(SETS))
def test_the_built_tiles_meet_without_a_line(name):
    # These sets step 1.45 times the steps beside an edge at most
    assert lines(grass.build_set(SETS[name])) == []


def test_a_tile_turned_half_round_meets_its_neighbours_with_lines():
    # A tile turned half round no longer meets the tiles that share its corners, which step 2.14 times and more
    tiles = grass.build_set(grass.SETS['straw'])
    turned = 1 + 2 * 3
    tiles[turned] = np.rot90(tiles[turned], 2)
    found = lines(tiles)
    assert any(f'tile {turned} meets' in line for line in found), 'no line east or south of the tile turned'
    assert any(line.endswith(f'tile {turned} east of it with a line') for line in found), \
        'no line west of the tile turned'
    assert all(f'tile {turned} ' in line for line in found), 'a line between tiles not turned'


def test_the_weights_sum_to_one_across_a_tile():
    k = (np.arange(64) + 0.5) / 64
    u, v = np.meshgrid(k, k)
    assert np.allclose(sum(grass.blend_weights(u, v)), 1)


def test_every_corner_colour_and_tile_comes_up_on_the_map():
    ys, xs = np.mgrid[0:grass.MAP_HEIGHT, 0:grass.MAP_WIDTH]
    tiles = grass.wang_tile(xs, ys)
    assert sorted(set(tiles.ravel().tolist())) == list(range(grass.CONSTANTS['colours'] ** 4))


def test_straw_covers_most_of_the_map():
    # About 70% of the land straw, as the mask's centre and width are tuned for (grass.CONSTANTS)
    share = grass.field()[..., 0].mean() / 255
    assert 0.6 < share < 0.8
