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

# The cars the game drives along the city's trips (src/cars.ts), which are no sprite of the rules: a car of each colour
# of CAR_COLOURS in tools/designs.py, from the cutouts the zones park, facing each way it drives, north, east, south and
# west, frame colour * 4 + way. A car stands in the middle of a frame of one tile, which the game draws
# whole, centred on the car's place in its lane.

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

# the cutout of each colour, in the order of CAR_COLOURS in tools/designs.py, which names each frame the atlas build
# packs: red, blue, yellow, white, green, orange. Blender has no Pillow, which designs.py imports, so the order is
# written again here
CUTOUTS = ['car-03', 'car-04', 'car-08', 'car-01', 'car-18', 'car-19']
# each way's turn, anticlockwise from nose north, as car() takes it, in the order north, east, south, west
TURNS = [0, 270, 180, 90]


def car(name, turn):
    def build():
        t.car(name, 0.5, 0.5, turn)
    return build


builders = {colour * len(TURNS) + way: car(name, turn)
            for colour, name in enumerate(CUTOUTS) for way, turn in enumerate(TURNS)}
t.render_sprites(__file__, builders, tiles=1)
