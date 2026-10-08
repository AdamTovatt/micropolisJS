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

"""The world grass: the conformance vectors the client is held to are the ones grass.py computes, a set's tiles meet
whatever tiles lie beside them, by their blend weights and by the tiles built, and every tile is used. The sets
themselves are checked through the atlas build, whose committed atlas and manifest hold them."""

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


@pytest.mark.parametrize('name', sorted(grass.SETS))
def test_the_built_tiles_meet_without_a_line(name):
    # Across the edge of every two tiles that share its corners, the step between the pixels either side is within
    # 1.5 times an ordinary step between neighbouring pixels inside a tile; tiles mirrored at random so their edges
    # no longer meet step 1.67 times it and more, these sets 1.37 at most
    tiles = [t.astype(np.float64) for t in grass.build_set(name)]
    colours = grass.CONSTANTS['colours']
    corners = [(t % colours, t // colours % colours, t // colours ** 2 % colours, t // colours ** 3)
               for t in range(len(tiles))]
    across = np.mean([np.abs(np.diff(t, axis=1)).mean() for t in tiles])
    down = np.mean([np.abs(np.diff(t, axis=0)).mean() for t in tiles])
    for a, (nw, ne, sw, se) in enumerate(corners):
        for b, (bnw, bne, bsw, _) in enumerate(corners):
            if (ne, se) == (bnw, bsw):
                step = np.abs(tiles[a][:, -1] - tiles[b][:, 0]).mean()
                assert step <= 1.5 * across, f'{name} tile {a} meets tile {b} east of it with a line'
            if (sw, se) == (bnw, bne):
                step = np.abs(tiles[a][-1] - tiles[b][0]).mean()
                assert step <= 1.5 * down, f'{name} tile {a} meets tile {b} south of it with a line'


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
