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

"""The committed images are the atlas build's output from the committed painted layers: a painted
layer changed without a rebuild, or an image edited by hand, fails here. Images are compared by
their pixels, not their PNG bytes, which differ between zlib versions."""

import json
import os

import numpy as np
import pytest
from PIL import Image

import manifests
from atlas import GUTTER
from designs import IMAGES, SHEET_COLUMNS, SHEET_PX, SPRITE_CELL

RENDER = os.path.join(IMAGES, 'render')
ATLASES = sorted(f for f in os.listdir(RENDER) if f.endswith('.png'))
SHEETS = {'tiles.png': (SHEET_PX, SHEET_COLUMNS), 'sprites.png': (SPRITE_CELL, None)}


def test_the_manifest_is_the_builds(built):
    with open(os.path.join(RENDER, 'manifest.json')) as f:
        committed = f.read()
    with open(os.path.join(built, 'render', 'manifest.json')) as f:
        rebuilt = f.read()
    if rebuilt != committed:
        a, b = json.loads(committed), json.loads(rebuilt)
        differ = [f'{part} {key}' for part in ('atlases', 'tiles', 'sprites')
                  for key in sorted(set(a[part]) | set(b[part])) if a[part].get(key) != b[part].get(key)]
        pytest.fail(f'images/render/manifest.json is not the build\'s: {", ".join(differ) or "its text"} differ')


def test_the_build_writes_the_committed_atlases(built):
    assert sorted(f for f in os.listdir(os.path.join(built, 'render')) if f.endswith('.png')) == ATLASES


def _differing(image, committed, rebuilt):
    # what two images of one size differ in: a sheet's cells, by tile id or by sprite type and
    # frame, or an atlas's rectangles, with their gutters, by what the committed manifest has
    # them draw, and any pixels outside them all
    changed = (committed != rebuilt).any(axis=-1)
    if image in SHEETS:
        cell, columns = SHEETS[image]
        cells = sorted({(y // cell, x // cell) for y, x in zip(*np.nonzero(changed))})
        if columns:
            return 'tile ids ' + ', '.join(str(row * columns + column) for row, column in cells)
        return 'sprite frames ' + ', '.join(f'type {row + 1} frame {column + 1}' for row, column in cells)
    atlas = os.path.splitext(os.path.basename(image))[0]
    outside = changed.copy()
    found = []
    for what, r in manifests.rectangles(manifests.read(RENDER)):
        if r['atlas'] != atlas:
            continue
        box = (slice(max(r['y'] - GUTTER, 0), r['y'] + r['height'] + GUTTER),
               slice(max(r['x'] - GUTTER, 0), r['x'] + r['width'] + GUTTER))
        if changed[box].any():
            found.append(what)
        outside[box] = False
    if outside.any():
        found.append(f'{outside.sum()} pixels outside every rectangle')
    return ', '.join(found)


@pytest.mark.parametrize('image', ['tiles.png', 'sprites.png', 'dirtbg.png'] + [f'render/{a}' for a in ATLASES])
def test_the_committed_image_is_the_builds(built, image):
    committed, rebuilt = Image.open(os.path.join(IMAGES, image)), Image.open(os.path.join(built, image))
    assert (rebuilt.mode, rebuilt.size) == (committed.mode, committed.size)
    a, b = np.asarray(committed.convert('RGBA')), np.asarray(rebuilt.convert('RGBA'))
    if not np.array_equal(a, b):
        pytest.fail(f'images/{image} is not the build\'s: {_differing(image, a, b)} differ')
