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

# Power lines: every piece the wire tool lays (210 to 220, by which neighbours conduct, WireTable
# in the C# rules' ConnectingTool), and the line over water (208, 209), on poles standing in the water where
# the original sinks the cable. Also the warning an unpowered zone blinks in place of its middle
# tile (827).

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402

PIECES = {210: 'EW', 211: 'NS', 212: 'NE', 213: 'ES', 214: 'SW', 215: 'NW',
          216: 'NEW', 217: 'NES', 218: 'ESW', 219: 'NSW', 220: 'NESW'}
OVER_WATER = {208: 'EW', 209: 'NS'}

# the lightning bolt, in a unit square, drawn clockwise from its top
BOLT = [(0.62, 1.0), (0.3, 0.45), (0.5, 0.45), (0.36, 0.0), (0.72, 0.58), (0.52, 0.58), (0.7, 1.0)]


def piece(sides):
    def build():
        ts.land()
        ts.power_line(sides)
    return build


def over_water(sides):
    def build():
        ts.water()
        footing = ts.material('footing', lambda: t.plain('footing', '9a968e'))
        t.cylinder(0.5, 0.5, ts.WATER_Z - 0.06, 0.006, 0.045, footing, 20)
        ts.power_line(sides)
    return build


def no_power():
    # A warning plate over the whole tile: dark, edged in red, with a yellow bolt crossed out.
    # The game shows it in place of an unpowered zone's middle tile, blinking.
    plate = t.plain('plate', '3a3c40', 0.6)
    red = t.plain('warning_red', 'e02818', 0.5)
    yellow = t.plain('bolt', 'ffd400', 0.4)
    t.box(0, 0, -0.1, 1, 1, 0.002, plate, name='plate')
    edge = 0.06
    for x0, y0, x1, y1 in ((0, 0, 1, edge), (0, 1 - edge, 1, 1), (0, edge, edge, 1 - edge),
                           (1 - edge, edge, 1, 1 - edge)):
        t.box(x0, y0, 0.002, x1, y1, 0.005, red, name='edge')
    size = 0.7
    t.prism([(0.15 + size * x, 0.15 + size * y) for x, y in BOLT], 0.002, 0.008, yellow, name='bolt')
    ts.strip([(0.16, 0.16), (0.84, 0.84)], 0.05, 0.002, 0.009, red, name='cross')


builders = {827: no_power}
for tile, sides in PIECES.items():
    builders[tile] = piece(sides)
for tile, sides in OVER_WATER.items():
    builders[tile] = over_water(sides)

t.render_tiles(__file__, builders)
