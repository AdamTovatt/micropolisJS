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

# A large factory, industrial (3, 2): a tall boiler hall across the north with three stacks, a
# middle block, a brick works in the south-west with the letter on its roof, a steel shed in the
# south-east, a tall tank and pipes between them. The game animates the north and north-east
# tiles of this zone (676 and 677, cycling through 900 to 903 and 904 to 907), so the stacks
# stand in those two and smoke in four frames.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

# each stack: where it stands, its mouth's height and whether it is banded red and white
STACKS = [(1.3, 2.36, 0.44, False), (1.86, 2.4, 0.4, True), (2.3, 2.38, 0.38, True)]


def materials():
    return {
        'yard': t.concrete_yard(),
        'facade': t.textured('facade', 'brick-facade.png', 0.85, 0.85, tint='ff8c78', shade=2.0),
        'grey_facade': t.textured('grey_facade', 'concrete-facade.png', 0.85, 0.85, shade=1.0),
        'brick': t.textured('brick', 'brick-wall.png', 0.3, 0.3, tint='ff8c78', shade=1.8),
        'roof': t.weathered(t.mottled('roof', '8c8c88', '72726e', 14), dirt=0.2),
        'rim': t.plain('rim', '8c8a84', 0.8),
        'walls': t.textured('walls', 'corrugated-steel.png', 0.5, 0.5, shade=1.1),
        'shed_roof': t.weathered(t.textured('shed_roof', 'corrugated-steel.png', 0.5, 0.5, tint='f4e4d4',
                                            shade=1.25, turned=True), dirt=0.35, dirt_scale=6),
        'tank': t.weathered(t.mottled('tank', 'd8d6d0', 'bcbab4', 10), dirt=0.15),
        'pipe': t.plain('pipe', 'b4b8bc', 0.4, 0.5),
        'red': t.plain('red', 'b8382c', 0.7),
        'white': t.plain('white', 'e4e2dc', 0.7),
        'soot': t.plain('soot', '2a2624', 0.9),
        'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
        'crate': t.mottled('crate', 'c09868', '8e6c44', 30),
        'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
        'smoke': t.chimney_smoke(),
    }


def stack(x, y, top, banded, m):
    if banded:
        bands = 6
        for i in range(bands):
            z0, z1 = top * i / bands, top * (i + 1) / bands
            t.cylinder(x, y, z0, z1, 0.05, m['red'] if i % 2 == 0 else m['white'], 20)
    else:
        t.cylinder(x, y, 0, top, 0.055, t.stack_brick(), 20)
    t.cylinder(x, y, top, top + 0.004, 0.038, m['soot'], 20)


def build(frame):
    rng, m = random.Random(675), materials()
    t.box(0, 0, -0.05, 3, 3, 0, m['yard'], name='yard')

    # --- the buildings ---
    t.building([(1.46, 1.5), (2.74, 1.5), (2.74, 2.66), (1.46, 2.66)], 0.26, m['grey_facade'], m['roof'], m['rim'])
    t.building([(0.86, 1.5), (1.46, 1.5), (1.46, 2.32), (0.86, 2.32)], 0.18, m['grey_facade'], m['roof'], m['rim'])
    t.building([(0.18, 0.3), (1.5, 0.3), (1.5, 1.42), (0.18, 1.42)], 0.2, m['facade'], m['roof'], m['rim'])
    t.zone_letter('I', 0.84, 0.86, 0.2, 0.46, m['green_paint'])
    t.house(1.95, 0.3, 2.72, 1.38, 0.16, 0.07, m['walls'], m['shed_roof'], ridge='y')
    t.roof_clutter([(1.6, 1.6, 2.6, 2.1), (0.95, 1.6, 1.4, 2.2)], 0.26, rng, m['unit'], m['pipe'], count=5)

    # --- the tall tank in the north-west, and pipes from it to the hall ---
    t.cylinder(0.4, 2.1, 0, 0.3, 0.16, m['tank'], 32)
    t.sphere(0.4, 2.1, 0.3, 0.16, m['tank'])
    for dz in (0.06, 0.1):
        t.strut((0.56, 2.1, dz), (0.86, 2.1, dz), 0.012, m['pipe'])
    t.strut((1.5, 1.45, 0.08), (1.95, 1.2, 0.08), 0.015, m['pipe'])

    # --- crates by the shed ---
    t.crates(1.55, 0.2, 1.9, 0.6, m['crate'], rng)

    # --- the stacks ---
    for x, y, top, banded in STACKS:
        stack(x, y, top, banded, m)
        if frame is not None:
            t.smoke(x, y, top, frame, 4, m['smoke'], puffs=3, size=0.045, drift=(-0.03, 0.0), seed=x * 5 + y)


t.render_animated(__file__, build, 4)
