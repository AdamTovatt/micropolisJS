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

# The airport, tiles 709 to 744, a 6x6 zone laid out as the original's: a runway along the north
# and one down the east, the terminal with airliners at its apron, the control tower, a hangar,
# and the car park. Its radar stands in the tile the game animates (711, cycling through 832 to
# 839 once the airport has power), its antenna turning an eighth of a turn each frame.

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

RADAR = (2.45, 5.4)


def materials():
    return {
        'grass': t.textured('grass', 'lawn-grass.png', 0.5, 0.5, tint='c8e8a0', shade=1.1),
        'apron': t.concrete_yard('apron'),
        'runway': t.weathered(t.textured('runway', 'asphalt.png', 0.5, 0.5, shade=1.0), dirt=0.15, period=1),
        'paint': t.plain('paint', 'f0efe8', 0.6),
        'yellow_paint': t.plain('yellow_paint', 'e8c030', 0.6),
        'glass': t.textured('glass', 'glass-curtain-wall.png', 0.8, 0.8, rough=0.15, shade=0.6),
        'terminal_roof': t.mottled('terminal_roof', 'd8d6d0', 'c2c0ba', 14),
        'rim': t.plain('rim', 'b0aea8', 0.7),
        'concrete': t.plain('concrete', 'c8c4bc', 0.8),
        'walls': t.textured('walls', 'corrugated-steel.png', 0.5, 0.5, tint='e0e4e8', shade=1.15),
        'hangar_roof': t.weathered(t.textured('hangar_roof', 'corrugated-steel.png', 0.4, 0.4, tint='eceae6',
                                              shade=1.25), dirt=0.2),
        'plane': t.plain('plane', 'eeeeec', 0.4, 0.1),
        'tail_blue': t.plain('tail_blue', '2f5fae', 0.5),
        'tail_red': t.plain('tail_red', 'c03a30', 0.5),
        'radar': t.plain('radar', 'd8d8d4', 0.5, 0.3),
        'mast': t.plain('mast', '7a7e84', 0.5, 0.4),
        'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.25, 0.25, shade=1.1), dirt=0.12),
    }


def runway(x0, y0, x1, y1, along, m):
    t.box(x0, y0, 0, x1, y1, 0.002, m['runway'], name='runway')
    if along == 'x':
        mid = (y0 + y1) / 2
        t.dashes(x0 + 0.4, mid, x1 - 0.4, mid, m['paint'], dash=0.18, gap=0.12, width=0.02, z=0.003)
        for x in (x0 + 0.08, x1 - 0.2):
            for k in range(5):
                y = y0 + 0.06 + k * (y1 - y0 - 0.12) / 4
                t.box(x, y - 0.012, 0.002, x + 0.12, y + 0.012, 0.003, m['paint'], name='threshold')
    else:
        mid = (x0 + x1) / 2
        t.dashes(mid, y0 + 0.4, mid, y1 - 0.4, m['paint'], dash=0.18, gap=0.12, width=0.02, z=0.003)
        for y in (y0 + 0.08, y1 - 0.2):
            for k in range(5):
                x = x0 + 0.06 + k * (x1 - x0 - 0.12) / 4
                t.box(x - 0.012, y, 0.002, x + 0.012, y + 0.12, 0.003, m['paint'], name='threshold')


def build(frame):
    rng, m = random.Random(709), materials()

    # --- ground: grass between the runways, the apron and the taxiways ---
    t.box(0, 0, -0.05, 6, 6, 0, m['grass'], name='grass')
    runway(0.15, 4.25, 5.85, 4.75, 'x', m)
    runway(4.65, 0.15, 5.15, 4.25, 'y', m)
    t.box(0.25, 2.9, 0, 4.3, 3.95, 0.0015, m['apron'], name='apron')
    t.box(1.6, 3.95, 0, 1.9, 4.25, 0.0015, m['apron'], name='taxiway')
    t.box(4.3, 3.2, 0, 4.65, 3.5, 0.0015, m['apron'], name='taxiway')
    t.box(4.3, 3.35 - 0.006, 0.0015, 4.65, 3.35 + 0.006, 0.0025, m['yellow_paint'], name='taxi_line')
    for x in (0.95, 2.2, 3.45):
        t.box(x - 0.006, 2.9, 0.0015, x + 0.006, 3.6, 0.0025, m['yellow_paint'], name='stand_line')

    # --- the terminal, the control tower and the hangar ---
    t.building([(0.3, 2.25), (3.6, 2.25), (3.6, 2.88), (0.3, 2.88)], 0.13, m['glass'], m['terminal_roof'], m['rim'])
    for x in (0.95, 2.2, 3.45):
        t.box(x - 0.04, 2.88, 0.06, x + 0.04, 3.25, 0.1, m['concrete'], name='airbridge')
    t.cylinder(3.95, 2.55, 0, 0.36, 0.06, m['concrete'], 20)
    t.cylinder(3.95, 2.55, 0.36, 0.44, 0.12, m['glass'], 24)
    t.cylinder(3.95, 2.55, 0.44, 0.46, 0.13, m['terminal_roof'], 24)
    t.house(3.3, 0.45, 4.35, 1.75, 0.18, 0.08, m['walls'], m['hangar_roof'], ridge='y')

    # --- airliners at the stands and one taxiing to the runway ---
    for x, trim in ((0.95, m['tail_blue']), (2.2, m['tail_red']), (3.45, m['tail_blue'])):
        t.plane(x, 3.55, 0, m['plane'], trim)
    t.plane(2.9, 4.5, 270, m['plane'], m['tail_red'])

    # --- the car park and the road round it ---
    t.box(0.3, 0.3, 0, 2.9, 1.95, 0.002, m['asphalt'], name='car_park')
    cars = [f'car-{i:02d}' for i in (1, 3, 4, 5, 8, 9, 10, 11, 12, 15, 16, 17, 18, 19)]
    for y in (0.45, 1.15):
        t.parking_row(0.45, y, 13, 'x', 1, [rng.choice(cars + [None, None]) for _ in range(13)], m['paint'], rng)

    # --- the radar: a lattice mast and an antenna that turns ---
    x, y = RADAR
    t.box(x - 0.12, y - 0.12, 0, x + 0.12, y + 0.12, 0.05, m['concrete'], name='radar_hut')
    for dx, dy in ((-0.07, -0.07), (0.07, -0.07), (0.07, 0.07), (-0.07, 0.07)):
        t.strut((x + dx, y + dy, 0.05), (x + dx * 0.3, y + dy * 0.3, 0.26), 0.01, m['mast'])
    turn = 0 if frame is None else frame * 45
    t.prism(t.rotated_rect(x, y, 0.54, 0.06, turn), 0.26, 0.29, m['radar'], name='antenna')
    a = math.radians(turn)
    t.prism(t.rotated_rect(x - math.sin(a) * 0.05, y + math.cos(a) * 0.05, 0.46, 0.035, turn), 0.26, 0.33,
            m['radar'], name='reflector')

    # --- a cargo shed and fuel tanks north of the runway ---
    t.house(0.4, 4.95, 1.6, 5.6, 0.14, 0.06, m['walls'], m['hangar_roof'], ridge='x')
    for tx in (3.6, 3.95):
        t.cylinder(tx, 5.3, 0, 0.1, 0.13, m['plane'], 32)


t.render_animated(__file__, build, 8, tiles=6)
