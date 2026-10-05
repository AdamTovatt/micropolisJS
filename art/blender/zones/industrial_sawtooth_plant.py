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

# A dense processing plant, industrial (3, 3): a hall under five pitched roofs side by side,
# silos in the north-east corner and along the south, two storage tanks in the south-east, and a
# process building with the letter on its roof. The game animates the north-east and east tiles
# of this zone (686 and 689, cycling through 908 to 911 and 912 to 915), so a stack among the
# silos and one on the process building smoke in four frames.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

STACKS = [(2.58, 2.22, 0.34), (2.28, 1.42, 0.34)]   # in the north-east tile, then the east


def materials():
    return {
        'yard': t.concrete_yard(),
        'walls': t.textured('walls', 'corrugated-steel.png', 0.5, 0.5, shade=1.05),
        'roof': t.weathered(t.textured('roof', 'corrugated-steel.png', 0.4, 0.4, tint='eceae6', shade=1.25,
                                       turned=True), dirt=0.25, dirt_scale=6),
        'flat_roof': t.weathered(t.mottled('flat_roof', '8c8c88', '72726e', 14), dirt=0.2),
        'rim': t.plain('rim', '8c8a84', 0.8),
        'door': t.plain('door', '2c3a52', 0.6),
        'silo': t.weathered(t.mottled('silo', 'd4d6d8', 'b4b6b8', 12), dirt=0.12),
        'tank': t.weathered(t.mottled('tank', 'dedcd6', 'c4c2bc', 10), dirt=0.15),
        'yellow': t.plain('yellow', 'd8a830', 0.5),
        'steel': t.plain('steel', '9ca0a4', 0.4, 0.5),
        'soot': t.plain('soot', '2a2624', 0.9),
        'crate': t.mottled('crate', 'c09868', '8e6c44', 30),
        'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
        'smoke': t.chimney_smoke(),
    }


def build(frame):
    rng, m = random.Random(684), materials()
    t.box(0, 0, -0.05, 3, 3, 0, m['yard'], name='yard')

    # --- the hall: walls under five pitched roofs, loading doors along the south ---
    x0, x1, y0, y1, h = 0.1, 1.86, 0.96, 2.78, 0.17
    t.box(x0, y0, 0, x1, y1, h, m['walls'], name='hall')
    span = (x1 - x0) / 5
    for i in range(5):
        t.pitched_roof(x0 + i * span, y0, x0 + (i + 1) * span, y1, h, 0.12, m['roof'], ridge='y', overhang=0.0)
    for i in range(4):
        x = x0 + (i + 0.5) * (x1 - x0) / 4
        t.box(x - 0.08, y0 - 0.012, 0, x + 0.08, y0, 0.1, m['door'], name='door')

    # --- the silos and the stack in the north-east corner ---
    for x, y in ((2.24, 2.62), (2.54, 2.62), (2.24, 2.3)):
        t.cylinder(x, y, 0, 0.25, 0.12, m['silo'], 32)
        t.cylinder(x, y, 0.25, 0.27, 0.07, m['silo'], 32)

    # --- the process building with the letter, and its stack ---
    t.building([(2.06, 0.92), (2.86, 0.92), (2.86, 1.72), (2.06, 1.72)], 0.14, m['walls'], m['flat_roof'], m['rim'])
    t.zone_letter('I', 2.62, 1.2, 0.14, 0.36, m['green_paint'])
    for x, y, top in STACKS:
        t.cylinder(x, y, 0, top, 0.045, m['steel'], 20)
        t.cylinder(x, y, top, top + 0.004, 0.032, m['soot'], 20)
        if frame is not None:
            t.smoke(x, y, top, frame, 4, m['smoke'], puffs=3, size=0.045, drift=(-0.03, 0.0), seed=x * 3 + y)

    # --- the silos along the south and the tanks in the south-east ---
    for x in (0.26, 0.6, 0.94):
        t.cylinder(x, 0.36, 0, 0.24, 0.15, m['silo'], 32)
        t.cylinder(x, 0.36, 0.24, 0.26, 0.09, m['silo'], 32)
    for x in (1.96, 2.54):
        t.cylinder(x, 0.38, 0, 0.15, 0.26, m['tank'], 48)
        t.cylinder(x, 0.38, 0.15, 0.16, 0.245, m['tank'], 48)
        t.box(x, 0.37, 0.16, x + 0.26, 0.39, 0.165, m['yellow'], name='walkway')
    t.strut((1.12, 0.36, 0.06), (1.7, 0.38, 0.06), 0.014, m['steel'])
    t.strut((2.22, 0.38, 0.09), (2.28, 0.38, 0.09), 0.014, m['steel'])

    # --- pallets by the doors ---
    t.crates(1.2, 0.62, 1.7, 0.86, m['crate'], rng)


t.render_animated(__file__, build, 4)
