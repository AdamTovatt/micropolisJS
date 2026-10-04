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

# A steel mill, industrial (3, 1): a long rolling shed down the west side with a rail siding
# into its south end, a conveyor from it up to a charging tower, heaps of ore and coal, gravel
# and scrap, and a loader. The game animates the north and north-east tiles of this zone (649
# and 650, cycling through 892 to 895 and 896 to 899), so a furnace stack stands in the first
# and the tower's stack in the second, each smoking in four frames.

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

FURNACE_STACK = (1.56, 2.3, 0.44)    # where each stack stands, and how high its mouth is
TOWER_STACK = (2.56, 2.18, 0.42)


def materials():
    return {
        'earth': t.weathered(t.textured('earth', 'bare-soil.png', 1.0, 1.0, tint='d8ccb8', shade=1.05), dirt=0.25),
        'yard': t.concrete_yard(),
        'walls': t.weathered(t.textured('walls', 'corrugated-steel.png', 0.5, 0.5, tint='f0e0d0', shade=1.1),
                             dirt=0.3),
        'roof': t.weathered(t.textured('roof', 'corrugated-steel.png', 0.5, 0.5, tint='f4e4d4', shade=1.25,
                                       turned=True), dirt=0.35, dirt_scale=6),
        'brick': t.textured('brick', 'brick-wall.png', 0.3, 0.3, tint='ff8c78', shade=1.6),
        'steel': t.plain('steel', '6a737c', 0.5, 0.5),
        'green_steel': t.plain('green_steel', '4a6a52', 0.5, 0.4),
        'belt': t.plain('belt', '2a2a2a', 0.8),
        'soot': t.plain('soot', '2a2624', 0.9),
        'ore': t.mottled('ore', '6a5040', '4a382c', 30),
        'coal': t.mottled('coal', '3a3a3c', '242426', 30),
        'gravel': t.textured('gravel', 'track-ballast.png', 0.2, 0.2, tint='d8dce0', shade=1.1),
        'ballast': t.textured('ballast', 'track-ballast.png', 0.25, 0.25, tint='e4e0d8', shade=1.1),
        'rail': t.plain('rail', 'b8b8b4', 0.3, 0.4),
        'yellow': t.plain('yellow', 'e0a820', 0.5),
        'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
        'smoke': t.chimney_smoke(),
    }


SCRAP_COLOURS = ('8a4a2a', '6a3a22', '9a5a32', '7a7c80', '5e3420', '4a4c50')


def build(frame):
    rng, m = random.Random(648), materials()
    scrap = [t.plain(f'scrap_{i}', c, 0.7, 0.2) for i, c in enumerate(SCRAP_COLOURS)]

    # --- ground: earth, a concrete apron east of the shed, the letter, and the siding ---
    t.box(0, 0, -0.05, 3, 3, 0, m['earth'], name='earth')
    t.box(1.22, 1.1, 0, 2.95, 2.0, 0.001, m['yard'], name='apron')
    t.zone_letter('I', 1.5, 1.5, 0.002, 0.42, m['green_paint'], thickness=0.004)
    t.box(0.64, 0.04, 0, 0.92, 0.95, 0.002, m['ballast'], name='siding')
    for x in (0.74, 0.82):
        t.box(x - 0.005, 0.04, 0.002, x + 0.005, 0.95, 0.006, m['rail'], name='rail')

    # --- the rolling shed ---
    t.house(0.42, 0.9, 1.18, 2.76, 0.21, 0.08, m['walls'], m['roof'], ridge='y')

    # --- the furnace house and its stack, in the north tile ---
    x, y, top = FURNACE_STACK
    t.box(1.3, 2.12, 0, 1.82, 2.56, 0.14, m['brick'], m['steel'], name='furnace_house')
    t.cylinder(x, y, 0, top, 0.05, t.stack_brick(), 20)
    t.cylinder(x, y, top, top + 0.004, 0.036, m['soot'], 20)

    # --- the charging tower in the north-east tile, the conveyor up to it, and its stack ---
    t.box(2.34, 2.06, 0, 2.68, 2.4, 0.3, m['green_steel'], m['steel'], name='tower')
    sx, sy, stop = TOWER_STACK
    t.cylinder(sx, sy, 0.3, stop, 0.032, m['steel'], 16)
    t.cylinder(sx, sy, stop, stop + 0.004, 0.022, m['soot'], 16)
    t.strut((1.18, 2.3, 0.2), (2.34, 2.3, 0.28), 0.03, m['belt'])
    for u in (0.25, 0.5, 0.75):
        px = 1.18 + u * (2.34 - 1.18)
        t.strut((px, 2.3, 0), (px, 2.3, 0.2 + u * 0.08), 0.01, m['green_steel'])

    # --- heaps: ore and coal west of the shed, gravel on the apron, scrap in the south-east ---
    t.mound(0.22, 2.08, 0.18, 0.24, 0.1, m['ore'])
    t.mound(0.24, 1.36, 0.2, 0.32, 0.11, m['coal'])
    t.mound(2.05, 1.55, 0.26, 0.24, 0.12, m['gravel'])
    t.mound(2.62, 1.5, 0.18, 0.18, 0.09, m['gravel'])
    for _ in range(240):
        a, r = rng.uniform(0, 2 * math.pi), rng.random() ** 0.5
        px, py = 2.42 + r * 0.48 * math.cos(a), 0.5 + r * 0.38 * math.sin(a)
        top = 0.1 * (1 - r * r) * rng.uniform(0.6, 1) + 0.01
        t.prism(t.rotated_rect(min(px, 2.9 - t.SHEAR * top), max(py, 0.08), rng.uniform(0.04, 0.11),
                               rng.uniform(0.03, 0.07), rng.uniform(0, 180)),
                max(0.0, top - 0.02), top, rng.choice(scrap), name='scrap')

    # --- the conveyor from the shed's south end to the scrap, and the loader ---
    t.strut((1.18, 0.78, 0.06), (1.95, 0.7, 0.13), 0.025, m['belt'])
    t.excavator(0.28, 0.6, 30, m['yellow'], reach=0.3, size=1.3)

    for (x, y, top), seed in ((FURNACE_STACK, 1), (TOWER_STACK, 2)):
        if frame is not None:
            t.smoke(x, y, top, frame, 4, m['smoke'], puffs=3, size=0.045, drift=(-0.03, 0.0), seed=seed)


t.render_animated(__file__, build, 4)
