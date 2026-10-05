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

# A brick factory, industrial (2, 2): a two-storey brick works with the letter on its flat roof,
# a low kiln house to the east with four short stacks, a tall old chimney to the west, and
# pallets of bricks. The game animates the north-east and east tiles of this zone (641 and 644,
# cycling through 884 to 887 and 888 to 891), so two stacks stand in each and smoke in four
# frames; the tall chimney, in a tile that never animates, is cold.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

STACKS = [(2.3, 1.22), (2.6, 1.22), (2.3, 2.02), (2.6, 2.02)]   # two in the east tile, two in the north-east
STACK_TOP = 0.34


def materials():
    return {
        'yard': t.concrete_yard(),
        'facade': t.textured('facade', 'brick-facade.png', 0.85, 0.85, tint='ff8c78', shade=2.0),
        'brick': t.textured('brick', 'brick-wall.png', 0.3, 0.3, tint='ff8c78', shade=1.8),
        'roof': t.weathered(t.mottled('roof', '8c8c88', '72726e', 14), dirt=0.2),
        'rim': t.plain('rim', 'a0583e', 0.8),
        'concrete': t.plain('concrete', 'b4b0a8'),
        'soot': t.plain('soot', '2a2624', 0.9),
        'pallet_bricks': t.mottled('pallet_bricks', 'b8583a', '8e4028', 40),
        'crate': t.mottled('crate', 'c09868', '8e6c44', 30),
        'drum': t.plain('drum', '5a646e', 0.5, 0.3),
        'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
        'slate': t.textured('slate', 'slate-roof.png', 0.3, 0.3, shade=1.6),
        'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
        'smoke': t.chimney_smoke(),
    }


def build(frame):
    rng, m = random.Random(639), materials()
    t.box(0, 0, -0.05, 3, 3, 0, m['yard'], name='yard')

    # --- the works, with its roof hut, roof units and the letter ---
    t.building([(0.72, 0.72), (2.0, 0.72), (2.0, 2.18), (0.72, 2.18)], 0.24, m['facade'], m['roof'], m['rim'])
    t.house(0.85, 1.5, 1.12, 1.82, 0.27, 0.04, m['brick'], m['slate'], ridge='y')
    t.zone_letter('I', 1.45, 1.48, 0.24, 0.48, m['green_paint'])
    for x, y in ((1.0, 2.0), (1.12, 2.0), (1.8, 1.9), (1.8, 1.25)):
        t.box(x - 0.03, y - 0.025, 0.24, x + 0.03, y + 0.025, 0.262, m['unit'], name='vent')

    # --- the kiln house to the east and its four stacks ---
    t.box(2.0, 0.78, 0, 2.78, 2.26, 0.13, m['brick'], m['roof'], name='kiln_house')
    for x, y in STACKS:
        t.cylinder(x, y, 0, STACK_TOP, 0.07, t.stack_brick(), 20)
        t.cylinder(x, y, STACK_TOP, STACK_TOP + 0.004, 0.052, m['soot'], 20)
        if frame is not None:
            t.smoke(x, y, STACK_TOP, frame, 4, m['smoke'], puffs=3, size=0.045, drift=(-0.025, 0.0),
                    seed=x * 7 + y)

    # --- the old chimney to the west, on its base ---
    t.box(0.28, 1.0, 0, 0.66, 1.36, 0.08, m['brick'], m['concrete'], name='chimney_base')
    t.cylinder(0.46, 1.5, 0, 0.72, 0.065, t.stack_brick(), 20)
    t.cylinder(0.46, 1.5, 0.72, 0.724, 0.048, m['soot'], 20)

    # --- pallets of bricks to the north, crates and drums by the works ---
    t.crates(1.5, 2.45, 2.15, 2.92, m['pallet_bricks'], rng, size=0.09, height=0.05, fill=0.9)
    t.crates(0.42, 0.42, 0.7, 0.78, m['crate'], rng)
    t.crates(1.6, 0.3, 1.95, 0.6, m['crate'], rng)
    t.barrels(2.05, 0.45, 2.3, 0.65, m['drum'], rng)


t.render_animated(__file__, build, 4)
