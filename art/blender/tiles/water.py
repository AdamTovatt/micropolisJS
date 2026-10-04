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

# The river: open water (2, 3 and the ships' channel, 4) and its shores (5 to 20). The map
# generator gives a water tile next to land one of eight shores, by which of its four neighbours
# are water (riverEdges in src/mapGenerator.js), and picks either of two tiles for each at random:
# a strip of land along one side, or water in one corner with land along the two sides away from
# it. Each pair is the same shore with a different wobble.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402

# a strip of land along one side; the shore's land side, in the order the shore ends and starts
STRIPS = {5: 'N', 9: 'E', 13: 'S', 17: 'W'}
# water in one corner, land along the two sides away from it
CORNERS = {7: 0, 11: 3, 15: 2, 19: 1}  # quarter turns from water in the south-west corner


def open_water():
    ts.water()


def strip(side, seed):
    def build():
        rng = random.Random(seed)
        q = ts.TURNS[side]
        points = ts.turn(ts.straight_shore(rng), q)
        corners = ts.turn([(1, 1), (0, 1)], q)
        ts.water()
        ts.shore(points, corners, ts.land_material(), ts.bank_material())
    return build


def corner(quarters, seed):
    def build():
        rng = random.Random(seed)
        points = ts.turn(ts.corner_shore(rng), quarters)
        corners = ts.turn([(1, 0), (1, 1), (0, 1)], quarters)
        ts.water()
        ts.shore(points, corners, ts.land_material(), ts.bank_material())
    return build


builders = {2: open_water, 3: open_water, 4: open_water}
for tile, side in STRIPS.items():
    builders[tile] = strip(side, tile)
    builders[tile + 1] = strip(side, tile + 100)
for tile, quarters in CORNERS.items():
    builders[tile] = corner(quarters, tile)
    builders[tile + 1] = corner(quarters, tile + 100)

t.render_tiles(__file__, builders)
