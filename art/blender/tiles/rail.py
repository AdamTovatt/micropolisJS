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

# Rail: every piece the rail tool lays (226 to 236, by which neighbours are rail, RailTable in
# the C# rules' ConnectingTool), the track over water (224, 225), and where it crosses a power line (221,
# 222) or a road (237, 238), and the station on straight track (1020, 1021), which the original
# never had. Over water the original draws the track sunk under it; here it crosses on a low
# bridge, as a road does.

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
STATIONS = {1020: 'EW', 1021: 'NS'}   # the station on straight track, its track's sides

BRIDGE_HALF = 0.15   # the rail bridge's half-width

PLATFORM_FROM, PLATFORM_TO = 0.14, 0.34   # a platform's edges, out from the track's middle
PLATFORM_END = 0.06                       # how far each platform stops short of the tile's ends
PLATFORM_Z = 0.03                         # the platform's top
SHELTER_FROM, SHELTER_TO = 0.3, 0.7       # the shelter's ends, along the track
SHELTER_Z = 0.13                          # the underside of its roof


def materials():
    return {
        'deck': ts.material('rail_deck', lambda: t.weathered(t.textured('rail_deck', 'concrete-facade.png', 0.25,
                                                                        0.25, shade=0.8), dirt=0.25, period=1)),
        'girder': ts.material('girder', lambda: t.plain('girder', '5c6670', 0.5, 0.5)),
        'post': ts.material('crossing_post', lambda: t.plain('crossing_post', 'eeeeea', 0.6)),
        'red': ts.material('red', lambda: t.plain('red', 'ff3020')),
        'platform': ts.material('platform', lambda: t.concrete_yard('platform')),
        'edge': ts.material('platform_edge', lambda: t.plain('platform_edge', 'e8c840', 0.7)),
        'canopy': ts.material('canopy', lambda: t.plain('canopy', '3f5f4a', 0.6)),
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


def station(sides):
    # a station on straight track: a low concrete platform along each side, short of the tile's
    # ends so the track runs on into its neighbours, a yellow line along each platform's edge, and
    # a shelter on the north or west platform, a roof on four posts
    def build():
        m = materials()
        ts.land()
        ts.track(sides)

        def rect(a0, a1, b0, b1, z0, z1, material, name):
            # a box from a0 to a1 along the track and b0 to b1 across it, from the track's middle,
            # across growing north of an east-west track and west of a north-south one
            if sides == 'EW':
                return t.box(a0, 0.5 + b0, z0, a1, 0.5 + b1, z1, material, name=name)
            return t.box(0.5 - b1, a0, z0, 0.5 - b0, a1, z1, material, name=name)

        ends = (PLATFORM_END, 1 - PLATFORM_END)
        for side in (-1, 1):
            near, far = sorted((side * PLATFORM_FROM, side * PLATFORM_TO))
            rect(*ends, near, far, 0, PLATFORM_Z, m['platform'], 'platform')
            edge = side * (PLATFORM_FROM + 0.015)
            rect(*ends, edge - 0.008, edge + 0.008, PLATFORM_Z, PLATFORM_Z + 0.001, m['edge'], 'platform_edge')

        for a in (SHELTER_FROM + 0.02, SHELTER_TO - 0.04):
            for b in (PLATFORM_FROM + 0.06, PLATFORM_TO - 0.04):
                rect(a, a + 0.02, b, b + 0.02, PLATFORM_Z, SHELTER_Z, m['girder'], 'post')
        rect(SHELTER_FROM, SHELTER_TO, PLATFORM_FROM + 0.04, PLATFORM_TO - 0.02, SHELTER_Z, SHELTER_Z + 0.012,
             m['canopy'], 'canopy')
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
for tile, sides in STATIONS.items():
    builders[tile] = station(sides)

t.render_tiles(__file__, builders)
