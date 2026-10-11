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

"""The walkers' figures, cut from their painting, and the walkers section the atlas build writes."""

import json
import os

import numpy as np
import pytest

import walkers

# The figures the committed painting, art/painted/raw/walkers/people.png, holds
PAINTED_FIGURES = 12


def shape_of(image):
    # An RGBA figure's pixels as whole numbers, which of them show, and its lightness
    pixels = np.asarray(image).astype(int)
    return pixels, pixels[..., 3] > 128, pixels[..., :3].max(axis=2)


def test_every_figure_is_a_head_of_dark_hair_on_light_shoulders():
    figures = walkers.build_figures()
    assert len(figures) == PAINTED_FIGURES
    for figure in figures:
        pixels, shown, lightness = shape_of(figure['vertical'])
        assert figure['vertical'].size == (walkers.FIGURE_PX, walkers.FIGURE_PX)
        # clear at its corners
        assert pixels[0, 0, 3] == 0 and pixels[-1, -1, 3] == 0
        # light clothing, which takes the tint, at least a quarter of it, round a dark head in the middle
        middle = walkers.FIGURE_PX // 2
        assert np.percentile(lightness[shown], 75) > 180
        assert lightness[middle - 1:middle + 1, middle - 1:middle + 1].mean() < 90
        # nothing magenta where it shows
        assert (np.minimum(pixels[..., 0], pixels[..., 2]) - pixels[..., 1])[shown].max() <= 0


@pytest.mark.parametrize('axis, across', [('vertical', 1), ('horizontal', 0)])
def test_each_figure_runs_its_shoulders_across_its_axis_lit_from_the_upper_left(axis, across):
    for figure in walkers.build_figures():
        _, shown, lightness = shape_of(figure[axis])
        spans = [np.ptp(np.nonzero(shown)[k]) for k in (0, 1)]
        # wider across the axis it walks along than along it, as shoulders running across it are
        assert spans[across] > 1.2 * spans[1 - across]
        # its light falling from the upper left: over its clothing, lighter than its dark head, the middle of its
        # lightness up and left of the clothing's own middle, which a figure turned a quarter would put up and right
        clothing = shown & (lightness > 100)
        rows, columns = np.nonzero(clothing)
        weight = lightness[clothing].astype(float)
        assert (weight * rows).sum() / weight.sum() < rows.mean()
        assert (weight * columns).sum() / weight.sum() < columns.mean()


def test_the_manifest_names_every_figure_for_either_axis(built):
    with open(os.path.join(built, 'render', 'manifest.json')) as f:
        figures = json.load(f)['walkers']['figures']
    assert len(figures) == PAINTED_FIGURES
    for figure in figures:
        assert set(figure) == set(walkers.AXES)
        assert figure['vertical']['width'] == figure['horizontal']['width'] == walkers.FIGURE_PX
