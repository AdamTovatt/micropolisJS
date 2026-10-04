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

# Rail: every piece the rail tool lays (226 to 236, by which neighbours are rail, RailTable in
# src/connector.js), the track over water (224, 225), and where it crosses a power line (221,
# 222) or a road (237, 238). Over water the original draws the track sunk under it; here it
# crosses on a low bridge, as a road does.

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402

PIECES = {226: 'EW', 227: 'NS', 228: 'NE', 229: 'ES', 230: 'SW', 231: 'NW',
          232: 'NEW', 233: 'NES', 234: 'ESW', 235: 'NSW', 236: 'NESW'}
BRIDGES = {224: 'EW', 225: 'NS'}
UNDER_POWER = {221: ('EW', 'NS'), 222: ('NS', 'EW')}   # the track's sides, then the power line's
ROAD_CROSSINGS = {237: ('EW', 'NS'), 238: ('NS', 'EW')}  # the track's sides, then the road's

BRIDGE_HALF = 0.15   # the rail bridge's half-width


def materials():
    return {
        'deck': ts.material('rail_deck', lambda: t.weathered(t.textured('rail_deck', 'concrete-facade.png', 0.3,
                                                                        0.3, shade=0.8), dirt=0.25)),
        'girder': ts.material('girder', lambda: t.plain('girder', '5c6670', 0.5, 0.5)),
        'post': ts.material('crossing_post', lambda: t.plain('crossing_post', 'eeeeea', 0.6)),
        'red': ts.material('red', lambda: t.plain('red', 'ff3020')),
    }


def piece(sides):
    def build():
        ts.land()
        ts.track(sides)
    return build


def under_power(track_sides, line_sides):
    def build():
        ts.land()
        ts.track(track_sides)
        ts.power_line(line_sides, pole=False)
    return build


def road_crossing(track_sides, road_sides):
    # a level crossing: the road over the track's bed, the rails through it, a stop line on each
    # side, and a warning post with a red lamp at each corner of the road where it meets the track
    def build():
        m, r = materials(), ts.road_materials()
        ts.land()
        ts.track(track_sides)
        ts.road(road_sides)
        dx, dy = ts.SIDES[road_sides[0]]          # along the road
        ax, ay = -dy, dx                          # across it
        stop = ts.BALLAST + 0.03
        for along_, lane in ((1, 1), (-1, -1)):   # each approach lane, on its own right
            mid = (0.5 + dx * along_ * stop, 0.5 + dy * along_ * stop)
            p = (mid[0] + ax * lane * 0.01, mid[1] + ay * lane * 0.01)
            q = (mid[0] + ax * lane * ts.ROAD, mid[1] + ay * lane * ts.ROAD)
            ts.strip([p, q], 0.02, 0.0025, 0.0035, r['paint'], name='stop_line')
        for along_ in (-1, 1):
            for across in (-1, 1):
                x = 0.5 + dx * along_ * (ts.BALLAST + 0.02) + ax * across * (ts.ROAD + 0.05)
                y = 0.5 + dy * along_ * (ts.BALLAST + 0.02) + ay * across * (ts.ROAD + 0.05)
                t.cylinder(x, y, 0, 0.09, 0.006, m['post'], 8)
                t.box(x - 0.01, y - 0.01, 0.075, x + 0.01, y + 0.01, 0.092, m['red'], name='lamp')
    return build


def bridge(sides):
    # a low concrete deck with a steel girder along each side, carrying the track; it crosses the
    # tile's edges by design, the next tile carrying it on
    def build():
        m = materials()
        ts.water()
        base = ts.DECK_Z
        if sides == 'EW':
            x0, x1 = -ts.deck_past('W'), 1 + ts.deck_past('E')
            parts = [t.box(x0, 0.5 - BRIDGE_HALF, base - 0.012, x1, 0.5 + BRIDGE_HALF, base, m['deck'], name='deck')]
            for side in (-1, 1):
                y = 0.5 + side * (BRIDGE_HALF - 0.008)
                parts.append(t.box(x0, y - 0.008, base, x1, y + 0.008, ts.DECK_TOP, m['girder'], name='girder'))
        else:
            y0, y1 = -ts.deck_past('S'), 1 + ts.deck_past('N')
            parts = [t.box(0.5 - BRIDGE_HALF, y0, base - 0.012, 0.5 + BRIDGE_HALF, y1, base, m['deck'], name='deck')]
            for side in (-1, 1):
                x = 0.5 + side * (BRIDGE_HALF - 0.008)
                parts.append(t.box(x - 0.008, y0, base, x + 0.008, y1, ts.DECK_TOP, m['girder'], name='girder'))
        for p in parts:
            t.spans_edge(p)
        ts.track(sides, base=base, past=ts.deck_past)
    return build


builders = {}
for tile, sides in PIECES.items():
    builders[tile] = piece(sides)
for tile, sides in BRIDGES.items():
    builders[tile] = bridge(sides)
for tile, (track_sides, line_sides) in UNDER_POWER.items():
    builders[tile] = under_power(track_sides, line_sides)
for tile, (track_sides, road_sides) in ROAD_CROSSINGS.items():
    builders[tile] = road_crossing(track_sides, road_sides)

t.render_tiles(__file__, builders)
