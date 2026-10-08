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

"""Reading a manifest (docs/render-assets.md) for the tests."""

import json
import os


def read(render):
    # the manifest in a directory of atlases
    with open(os.path.join(render, 'manifest.json')) as f:
        return json.load(f)


def rectangles(manifest):
    # every rectangle the manifest names, with what it draws: 'tile <id> <layer>',
    # 'sprite <type> frame <frame>', 'car <colour> <way>' or 'grass <set> tile <n>'
    for tile, layers in manifest['tiles'].items():
        for layer, rect in layers.items():
            # beside its layers, a tile names how much of the world grass it lets through
            if layer != 'grass':
                yield f'tile {tile} {layer}', rect
    for sprite_type, frames in manifest['sprites'].items():
        for frame, rect in frames.items():
            yield f'sprite {sprite_type} frame {frame}', rect
    for colour, ways in manifest['cars'].items():
        for way, rect in ways.items():
            yield f'car {colour} {way}', rect
    for name, grass_set in manifest.get('grass', {}).get('sets', {}).items():
        for n, rect in enumerate(grass_set['tiles']):
            yield f'grass {name} tile {n}', rect
