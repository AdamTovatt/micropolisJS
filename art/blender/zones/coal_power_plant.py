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

# The coal power plant, tiles 745 to 760, a 4x4 zone: a brick turbine hall down the west side,
# a boiler house in the north-east under four stacks, a coal heap and its conveyor in the south,
# and a transformer yard in the south-east. The game sets the four tiles of the north-east
# quarter to their smoke animations (747, 748, 751 and 752, cycling through 916 to 931), so one
# stack stands in each of those tiles and smokes in four frames.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

STACKS = [(2.18, 3.15), (3.18, 3.15), (2.18, 2.15), (3.18, 2.15)]   # in each tile's south-west, so the smoke stays in it
STACK_TOP = 0.85


def materials():
    return {
        'yard': t.concrete_yard(),
        'earth': t.weathered(t.textured('earth', 'bare-soil.png', 1.0, 1.0, tint='c8bca8', shade=0.9), dirt=0.3),
        'facade': t.textured('facade', 'brick-facade.png', 0.85, 0.85, tint='ff8c78', shade=2.0),
        'grey_facade': t.textured('grey_facade', 'concrete-facade.png', 0.85, 0.85, shade=1.0),
        'roof': t.weathered(t.mottled('roof', '8c8c88', '72726e', 14), dirt=0.2),
        'rim': t.plain('rim', '8c8a84', 0.8),
        'coal': t.mottled('coal', '2e2e30', '1c1c1e', 30),
        'belt': t.plain('belt', '2a2a2a', 0.8),
        'steel': t.plain('steel', '7a8088', 0.5, 0.5),
        'transformer': t.plain('transformer', '6a7a6a', 0.6, 0.3),
        'gravel': t.textured('gravel', 'track-ballast.png', 0.3, 0.3, tint='e0dcd4', shade=1.1),
        'soot': t.plain('soot', '2a2624', 0.9),
        'yellow': t.plain('yellow', 'e2b628', 0.6),
        'smoke': t.haze('coal_smoke', '5e5a56', '3e3a36'),
    }


def build(frame):
    rng, m = random.Random(745), materials()
    t.box(0, 0, -0.05, 4, 4, 0, m['yard'], name='yard')

    # --- the turbine hall, the boiler house and the stacks ---
    t.building([(0.2, 1.4), (1.95, 1.4), (1.95, 3.72), (0.2, 3.72)], 0.24, m['facade'], m['roof'], m['rim'])
    for i in range(5):
        y = 1.65 + i * 0.45
        t.box(0.45, y - 0.08, 0.24, 1.7, y + 0.08, 0.27, m['roof'], name='roof_light')
    t.building([(2.05, 1.95), (3.85, 1.95), (3.85, 3.55), (2.05, 3.55)], 0.16, m['grey_facade'], m['roof'], m['rim'])
    for x, y in STACKS:
        t.cylinder(x, y, 0, STACK_TOP, 0.07, t.stack_brick(), 24)
        t.cylinder(x, y, STACK_TOP, STACK_TOP + 0.004, 0.052, m['soot'], 24)
        if frame is not None:
            t.smoke(x, y, STACK_TOP, frame, 4, m['smoke'], puffs=3, size=0.05, drift=(0.03, 0.055), seed=x * 3 + y)

    # --- the coal heap on bare ground, and the conveyor up into the hall ---
    t.box(0.15, 0.15, 0, 2.2, 1.25, 0.001, m['earth'], name='coal_ground')
    t.mound(0.75, 0.7, 0.5, 0.4, 0.12, m['coal'])
    t.mound(1.6, 0.62, 0.4, 0.32, 0.09, m['coal'])
    t.strut((1.2, 0.95, 0.04), (1.35, 1.6, 0.2), 0.03, m['belt'])

    # --- the transformer yard, on gravel inside its fence ---
    t.box(2.45, 0.2, 0, 3.85, 1.7, 0.001, m['gravel'], name='switchyard')
    for i in range(3):
        for j in range(2):
            x, y = 2.75 + i * 0.4, 0.55 + j * 0.65
            t.box(x - 0.09, y - 0.07, 0, x + 0.09, y + 0.07, 0.08, m['transformer'], name='transformer')
            t.cylinder(x, y + 0.14, 0, 0.18, 0.012, m['steel'], 8)
    for x0, y0, x1, y1 in ((2.45, 0.2, 3.85, 0.2), (2.45, 1.7, 3.85, 1.7), (2.45, 0.2, 2.45, 1.7),
                           (3.85, 0.2, 3.85, 1.7)):
        t.strut((x0, y0, 0.035), (x1, y1, 0.035), 0.004, m['steel'])
    t.box(2.3, 1.75, 0, 2.35, 1.95, 0.03, m['yellow'], name='bollard')


t.render_animated(__file__, build, 4, tiles=4)
