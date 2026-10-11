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

"""The parks' trees, cut from their painting, and the parks' tiles the atlas build writes."""

import json
import os

import numpy as np
import pytest
from PIL import Image

import trees
from designs import PARK_HIGH, PARK_LOW

# The trees the committed painting, art/painted/raw/trees/trees.png, holds
PAINTED_TREES = 12


def test_every_tree_is_cut_whole_with_none_of_the_magenta_left():
    cut = trees.build_trees()
    assert len(cut) == PAINTED_TREES
    for tree in cut:
        crown = np.asarray(tree['crown']).astype(int)
        assert tree['crown'].size == (trees.CROWN_PX, trees.CROWN_PX)
        # a crown standing in its square, clear at its corners, with nothing magenta where it shows, past the faintest
        # edge the resampling leaves, whose colour no one sees
        assert crown[..., 3].mean() > 0.3 * 255
        assert crown[0, 0, 3] == 0 and crown[-1, -1, 3] == 0
        shown = crown[..., 3] > 32
        assert (np.minimum(crown[..., 0], crown[..., 2]) - crown[..., 1])[shown].max() <= 0


def test_each_shadow_falls_right_and_down_of_its_crown():
    for tree in trees.build_trees():
        shadow = np.asarray(tree['shadow']).astype(float)
        assert tree['shadow'].size == (trees.SHADOW_PX, trees.SHADOW_PX)
        assert not shadow[..., :3].any()
        # the middle of its darkness right and down of its square's middle, where the crown's is
        weight = shadow[..., 3]
        rows, columns = np.indices(weight.shape)
        middle = (trees.SHADOW_PX - 1) / 2
        assert (weight * columns).sum() / weight.sum() > middle + 1
        assert (weight * rows).sum() / weight.sum() > middle + 1
        assert weight.max() > 0.5 * 255


def test_the_parks_let_all_the_grass_through_and_name_every_tree(built):
    with open(os.path.join(built, 'render', 'manifest.json')) as f:
        manifest = json.load(f)
    for tile_id in range(PARK_LOW, PARK_HIGH + 1):
        entry = manifest['tiles'][str(tile_id)]
        assert entry['grass'] == 'all' and 'objects' not in entry and 'shadow' not in entry
        ground = Image.open(os.path.join(built, 'render', manifest['atlases'][entry['ground']['atlas']]))
        rect = entry['ground']
        assert not np.asarray(ground.crop((rect['x'], rect['y'], rect['x'] + rect['width'],
                                           rect['y'] + rect['height'])))[..., 3].any()
    parks = manifest['parks']
    assert {key: parks[key] for key in trees.PARKS} == trees.PARKS
    assert {key: parks['trees'][key] for key in trees.TREES} == trees.TREES
    assert len(parks['trees']['kinds']) == PAINTED_TREES


def test_a_painting_of_magenta_alone_holds_no_tree(tmp_path):
    painting = tmp_path / 'empty.png'
    Image.new('RGB', (64, 48), (255, 0, 255)).save(painting)
    with pytest.raises(SystemExit, match='holds no tree'):
        trees.build_trees(str(painting))
