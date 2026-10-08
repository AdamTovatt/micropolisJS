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

"""Which joined tiles the game draws as water, from the join's water masks, what their grounds let through, and the
16 px sheet's cells of the water and the tiles drawn as it."""

import json
import os

import numpy as np
import pytest
from PIL import Image

import manifests
from designs import LAND_MASK, LAYERS, SHEET_COLUMNS, SHEET_PX, WATER_HIGH, WATER_LOW, WATER_MASK, Asset

SIDE = 8                        # the synthetic tiles' pixels a side, so a mask's share is a count of 64
PAINTED_WATER = (54, 107, 143)  # the ground's colour under the water mask, as the open water's painting gives it
PAINTED_LAND = (99, 115, 35)    # and elsewhere


def _asset(directory, water_pixels, land_pixels=0, masks=(LAND_MASK, WATER_MASK)):
    # a joined single tile of SIDE pixels whose water mask covers its first water_pixels pixels, row by row, and whose
    # land mask the next land_pixels, its ground the painted water under the water mask and land elsewhere
    os.makedirs(directory)
    with open(os.path.join(directory, 'layers.json'), 'w') as f:
        json.dump({'tiles': 1, 'tile_px': SIDE}, f)
    order = np.arange(SIDE * SIDE).reshape(SIDE, SIDE)
    water = order < water_pixels
    land = (order >= water_pixels) & (order < water_pixels + land_pixels)
    ground = np.where(water[..., None], PAINTED_WATER, PAINTED_LAND)
    Image.fromarray(np.dstack([ground, np.full((SIDE, SIDE), 255)]).astype(np.uint8), 'RGBA').save(
        os.path.join(directory, 'ground.png'))
    for layer in LAYERS[1:]:
        Image.new('RGBA', (SIDE, SIDE)).save(os.path.join(directory, f'{layer}.png'))
    for mask, where in ((LAND_MASK, land), (WATER_MASK, water)):
        if mask in masks:
            Image.fromarray(np.where(where, 255, 0).astype(np.uint8), 'L').save(os.path.join(directory, mask))
    return Asset(directory), water, land


@pytest.mark.parametrize('water_pixels, is_water', [(31, False), (32, True), (33, True)])
def test_a_tile_is_water_from_half_its_ground_the_open_waters(tmp_path, water_pixels, is_water):
    asset, _, _ = _asset(str(tmp_path / 'tile'), water_pixels)
    assert asset.is_water() == is_water


def _clear(ground):
    return np.asarray(ground.getchannel('A')) == 0


def test_a_tile_drawn_as_water_lets_the_grass_through_under_both_masks(tmp_path):
    asset, water, land = _asset(str(tmp_path / 'tile'), 40, 10)
    assert np.array_equal(_clear(asset.ground_over_grass()), water | land)


def test_a_tile_drawn_as_land_keeps_its_painted_water(tmp_path):
    asset, water, land = _asset(str(tmp_path / 'tile'), 20, 10)
    assert np.array_equal(_clear(asset.ground_over_grass()), land)


def test_the_sheet_keeps_the_painted_water_of_a_tile_drawn_as_water(tmp_path):
    asset, _, land = _asset(str(tmp_path / 'tile'), 40, 10)
    assert np.array_equal(_clear(asset.ground_over_sheet_grass()), land)


@pytest.mark.parametrize('kept', [LAND_MASK, WATER_MASK])
def test_a_tile_with_one_mask_and_not_the_other_is_refused(tmp_path, kept):
    with pytest.raises(FileNotFoundError, match=({LAND_MASK, WATER_MASK} - {kept}).pop()):
        _asset(str(tmp_path / 'tile'), 40, 10, masks=(kept,))


def test_a_tile_with_neither_mask_lets_nothing_through(tmp_path):
    asset, _, _ = _asset(str(tmp_path / 'tile'), 40, 10, masks=())
    assert not asset.is_water() and not _clear(asset.ground_over_grass()).any()


def _watery(cell):
    # the share of a cell's pixels nearer the painted water's colour than the land's
    rgb = cell[..., :3].astype(int)
    return (((rgb - PAINTED_WATER) ** 2).sum(-1) < ((rgb - PAINTED_LAND) ** 2).sum(-1)).mean()


def test_the_sheet_draws_the_water_and_the_tiles_drawn_as_it_with_their_painted_water(built):
    # the minimap colours each tile from its 16 px cell, so the river, its shores and the bridges over them show water
    # there, not the grass the game's ground lets through for its own water: every cell of a tile the manifest marks
    # water shows it over at least a quarter, as a rail bridge's, whose deck covers most of its water, just does
    sheet = np.asarray(Image.open(os.path.join(built, 'tiles.png')).convert('RGBA'))
    manifest = manifests.read(os.path.join(built, 'render'))
    marked = sorted(int(t) for t, entry in manifest['tiles'].items() if entry.get('water'))
    assert set(range(WATER_LOW, WATER_HIGH + 1)) <= set(marked)

    def cell(tile_id):
        x, y = tile_id % SHEET_COLUMNS * SHEET_PX, tile_id // SHEET_COLUMNS * SHEET_PX
        return sheet[y:y + SHEET_PX, x:x + SHEET_PX]
    assert [(t, round(_watery(cell(t)), 2)) for t in marked if _watery(cell(t)) < 0.25] == []
