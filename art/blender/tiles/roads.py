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

# Roads: every piece the road tool lays (66 to 76, by which neighbours are roads, RoadTable in
# src/connector.js), the bridges over water (64, 65), the roads under a power line (77, 78, 239),
# the traffic on each of those but 239, and the drawbridges open for a ship.
#
# Traffic is four frames of each of those fifteen tiles, which the game cycles through
# (src/animationManager.ts): light traffic at 80 to 94, then each frame 16 on, and heavy traffic
# at 144 to 158 the same way. The game shows a tile's frames in the order +0, +48, +32, +16, so
# that is the order the cars move in.
#
# A drawbridge opens round a ship in the channel (openBridge in src/road.js): the two tiles each
# side of the middle become water, and the tile beyond each end swings its span round, so that it
# lies across the tile beside it, north of a bridge running east-west and east of one running
# north-south. Here it is a swing bridge: in the original's view the spans rise, but in this one a
# raised span would lean over the water tiles it opened, which then show nothing of it.

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402

PIECES = {66: 'EW', 67: 'NS', 68: 'NE', 69: 'ES', 70: 'SW', 71: 'NW',
          72: 'NEW', 73: 'NES', 74: 'ESW', 75: 'NSW', 76: 'NESW'}
BRIDGES = {64: 'EW', 65: 'NS'}
# the road's sides, then the power line's. 239 is a second north-south road under an east-west
# line, which no tool lays (tileValues.ts calls it bogus) but the issue asks for, drawn as 78
UNDER_POWER = {77: ('EW', 'NS'), 78: ('NS', 'EW'), 239: ('NS', 'EW')}
LIGHT, HEAVY = 80 - 64, 144 - 64           # from a road tile to its first frame of traffic
FRAMES = (0, 48, 32, 16)                   # each frame's tile, from the first, in the order shown
OPEN_WATER = [79, 95, 111, 127, 143, 159, 175, 191, 207]  # an open drawbridge's middle, and its frames

DECK_HALF = ts.ROAD + 0.06   # a bridge deck's half-width: the road and a narrow walkway each side
SPAN = 1.15                  # how far a drawbridge's swung span reaches from its pivot


def materials():
    return {
        'deck': ts.material('deck', lambda: t.weathered(t.textured('deck', 'concrete-facade.png', 0.3, 0.3,
                                                                   shade=0.9), dirt=0.2)),
        'rail': ts.material('railing', lambda: t.plain('railing', 'b8bcc0', 0.5, 0.4)),
        'pier': ts.material('pier', lambda: t.plain('pier', '8c8a84')),
        'signal': ts.material('signal', lambda: t.plain('signal', '2e3034', 0.5)),
        'red': ts.material('red', lambda: t.plain('red', 'ff3020')),
        'green': ts.material('green', lambda: t.plain('green', '30e060')),
    }


def crossing_extras():
    # zebra crossings on each arm of a crossroads, and a traffic signal on each corner
    m, r = materials(), ts.road_materials()
    for s in 'NESW':
        dx, dy = ts.SIDES[s]
        ex, ey = 0.5 + dx / 2, 0.5 + dy / 2       # the arm's end
        ax, ay = -dy, dx                          # across the arm
        for k in range(8):
            u = -ts.ROAD + 0.025 + k * 0.05
            near, far = 0.035, 0.13                 # the stripes' reach in from the edge
            p = (ex - dx * near + ax * u, ey - dy * near + ay * u)
            q = (ex - dx * far + ax * u, ey - dy * far + ay * u)
            ts.strip([p, q], 0.026, 0.0025, 0.0035, r['paint'], name='zebra')
    for cx in (0.5 - ts.ROAD - 0.05, 0.5 + ts.ROAD + 0.05):
        for cy in (0.5 - ts.ROAD - 0.05, 0.5 + ts.ROAD + 0.05):
            t.cylinder(cx, cy, 0, 0.1, 0.007, m['signal'], 8)
            t.box(cx - 0.012, cy - 0.012, 0.085, cx + 0.012, cy + 0.012, 0.125, m['signal'], name='signal')
            lamp = m['green'] if (cx < 0.5) == (cy < 0.5) else m['red']
            t.box(cx - 0.008, cy - 0.008, 0.125, cx + 0.008, cy + 0.008, 0.129, lamp, name='lamp')


def piece(sides, density=None, frame=0, seed=0):
    def build():
        ts.land()
        ts.road(sides)
        if len(sides) == 4:
            crossing_extras()
        if density:
            ts.traffic(ts.lanes(sides), density, frame, seed)
    return build


def under_power(road_sides, line_sides, density=None, frame=0, seed=0):
    def build():
        ts.land()
        ts.road(road_sides)
        ts.power_line(line_sides, pole=False)
        if density:
            ts.traffic(ts.lanes(road_sides), density, frame, seed)
    return build


def deck(x0, y0, x1, y1, run, m, r):
    # A stretch of bridge deck over the rectangle (x0, y0)-(x1, y1), running along x or y: the
    # slab, the road on it, a walkway and a railing along each side. It crosses the tile's edges
    # by design, the next tile carrying it on.
    base = ts.DECK_Z
    parts = [t.box(x0, y0, base - 0.012, x1, y1, base, m['deck'], name='deck')]
    if run == 'x':
        mid, lo, hi = (y0 + y1) / 2, x0, x1
        parts.append(t.box(lo, mid - ts.ROAD, base, hi, mid + ts.ROAD, base + 0.002, r['asphalt'], name='deck_road'))
        for side in (-1, 1):
            parts.append(t.box(lo, min(mid + side * ts.ROAD, mid + side * DECK_HALF), base,
                               hi, max(mid + side * ts.ROAD, mid + side * DECK_HALF), base + 0.004,
                               r['pavement'], name='walkway'))
            edge = mid + side * (DECK_HALF - 0.005)
            parts.append(t.box(lo, edge - 0.005, base + 0.004, hi, edge + 0.005, ts.DECK_TOP, m['rail'],
                               name='railing'))
    else:
        mid, lo, hi = (x0 + x1) / 2, y0, y1
        parts.append(t.box(mid - ts.ROAD, lo, base, mid + ts.ROAD, hi, base + 0.002, r['asphalt'], name='deck_road'))
        for side in (-1, 1):
            parts.append(t.box(min(mid + side * ts.ROAD, mid + side * DECK_HALF), lo, base,
                               max(mid + side * ts.ROAD, mid + side * DECK_HALF), hi, base + 0.004,
                               r['pavement'], name='walkway'))
            edge = mid + side * (DECK_HALF - 0.005)
            parts.append(t.box(edge - 0.005, lo, base + 0.004, edge + 0.005, hi, ts.DECK_TOP, m['rail'],
                               name='railing'))
    for p in parts:
        t.spans_edge(p)


def pier(x, y, m):
    t.cylinder(x, y, ts.WATER_Z - 0.05, ts.DECK_Z - 0.02, 0.035, m['pier'], 16)


def bridge(sides, density=None, frame=0, seed=0):
    def build():
        m, r = materials(), ts.road_materials()
        ts.water()
        if sides == 'EW':
            deck(-ts.deck_past('W'), 0.5 - DECK_HALF, 1 + ts.deck_past('E'), 0.5 + DECK_HALF, 'x', m, r)
            for y in (0.5 - DECK_HALF + 0.05, 0.5 + DECK_HALF - 0.05):
                pier(0.5, y, m)
            ts.dashed([(0, 0.5), (1, 0.5)], r['paint'], ts.DECK_Z + 0.003)
        else:
            deck(0.5 - DECK_HALF, -ts.deck_past('S'), 0.5 + DECK_HALF, 1 + ts.deck_past('N'), 'y', m, r)
            for x in (0.5 - DECK_HALF + 0.05, 0.5 + DECK_HALF - 0.05):
                pier(x, 0.5, m)
            ts.dashed([(0.5, 0), (0.5, 1)], r['paint'], ts.DECK_Z + 0.003)
        if density:
            ts.traffic(ts.lanes(sides), density, frame, seed, base=ts.DECK_Z + 0.002)
    return build


def open_water():
    ts.water()


def drawbridge(fixed, swing, pivot_here):
    # One tile of an open drawbridge. The pivot's tile holds the deck from the `fixed` side to the
    # pivot in its middle, and the span swung round toward the `swing` side; the tile on that side
    # holds the rest of the span, built in the same place relative to the pivot.
    def build():
        m, r = materials(), ts.road_materials()
        ts.water()
        sx, sy = ts.SIDES[swing]
        ox, oy = (0, 0) if pivot_here else (-sx, -sy)  # the pivot tile's place, from this tile
        cx, cy = 0.5 + ox, 0.5 + oy
        if pivot_here:
            fx, fy = ts.SIDES[fixed]
            past = ts.deck_past(fixed)
            gap = DECK_HALF + 0.03
            if fx:
                lo, hi = sorted((0.5 + fx * (0.5 + past), 0.5 + fx * gap))
                deck(lo, 0.5 - DECK_HALF, hi, 0.5 + DECK_HALF, 'x', m, r)
            else:
                lo, hi = sorted((0.5 + fy * (0.5 + past), 0.5 + fy * gap))
                deck(0.5 - DECK_HALF, lo, 0.5 + DECK_HALF, hi, 'y', m, r)
            t.cylinder(0.5, 0.5, ts.WATER_Z - 0.05, ts.DECK_Z - 0.021, DECK_HALF + 0.03, m['pier'], 32)
        tail = DECK_HALF + 0.04
        if sx:
            lo, hi = sorted((cx - sx * tail, cx + sx * SPAN))
            deck(lo, cy - DECK_HALF, hi, cy + DECK_HALF, 'x', m, r)
        else:
            lo, hi = sorted((cy - sy * tail, cy + sy * SPAN))
            deck(cx - DECK_HALF, lo, cx + DECK_HALF, hi, 'y', m, r)
    return build


builders = {}
for tile, sides in PIECES.items():
    builders[tile] = piece(sides)
for tile, sides in BRIDGES.items():
    builders[tile] = bridge(sides)
for tile, (road_sides, line_sides) in UNDER_POWER.items():
    builders[tile] = under_power(road_sides, line_sides)
for base in range(64, 79):
    for density, first in (('light', LIGHT), ('heavy', HEAVY)):
        seed = base * 10 + (density == 'heavy')
        for frame, offset in enumerate(FRAMES):
            tile = base + first + offset
            if base in PIECES:
                builders[tile] = piece(PIECES[base], density, frame, seed)
            elif base in BRIDGES:
                builders[tile] = bridge(BRIDGES[base], density, frame, seed)
            else:
                builders[tile] = under_power(*UNDER_POWER[base], density, frame, seed)
for tile in OPEN_WATER:
    builders[tile] = open_water
# east-west bridges open north: the west pivot (828) and the tile north of it (829), the east
# pivot (830) and the tile north of it (831); north-south bridges open east: the north pivot
# (948) and the tile east of it (949), the south pivot (950) and the tile east of it (951)
builders[828] = drawbridge('W', 'N', True)
builders[829] = drawbridge('W', 'N', False)
builders[830] = drawbridge('E', 'N', True)
builders[831] = drawbridge('E', 'N', False)
builders[948] = drawbridge('N', 'E', True)
builders[949] = drawbridge('N', 'E', False)
builders[950] = drawbridge('S', 'E', True)
builders[951] = drawbridge('S', 'E', False)

t.render_tiles(__file__, builders)
