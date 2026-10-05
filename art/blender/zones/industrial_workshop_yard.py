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

# A small workshop, industrial (1, 2): a steel shed along the north side, a smaller shed in the
# south-east corner, and a yard of crates, drums and lorries. A boiler house stands in the
# north-west corner, whose chimney smokes in eight frames: the tile the game animates in the
# lowest industrial zone (621, cycling through 852 to 859).

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402


def materials():
    return {
        'yard': t.concrete_yard(),
        'walls': t.textured('walls', 'corrugated-steel.png', 0.5, 0.5, shade=1.1),
        'roof': t.weathered(t.textured('roof', 'corrugated-steel.png', 0.5, 0.5, tint='f4e8dc', shade=1.3),
                            dirt=0.3, dirt_scale=6),
        'roof_turned': t.weathered(t.textured('roof_turned', 'corrugated-steel.png', 0.5, 0.5, tint='e8ddd0',
                                              shade=1.2, turned=True), dirt=0.25, dirt_scale=5),
        'soot': t.plain('soot', '2a2624', 0.9),
        'brick': t.textured('brick', 'brick-wall.png', 0.3, 0.3, tint='ff8c78', shade=1.8),
        'concrete': t.plain('concrete', 'b4b0a8'),
        'door': t.plain('door', '2a2a2c', 0.6),
        'crate': t.mottled('crate', 'b89060', '8a6a40', 30),
        'red_drum': t.plain('red_drum', 'a83a28', 0.5),
        'blue_drum': t.plain('blue_drum', '2a5ea8', 0.5),
        'skip': t.plain('skip', '3a6aa0', 0.6),
        'cab_blue': t.plain('cab_blue', '3a5a9a', 0.5),
        'white': t.plain('white', 'e6e6e2', 0.5),
        'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
        'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
        'smoke': t.chimney_smoke(),
    }


def build(frame):
    rng, m = random.Random(621), materials()

    # --- ground: the yard, and a low wall round the west and south with a gate ---
    t.box(0, 0, -0.05, 3, 3, 0, m['yard'], name='yard')
    t.box(0.03, 0.05, 0, 0.06, 2.95, 0.03, m['concrete'], name='wall')
    t.box(0.06, 0.03, 0, 1.45, 0.06, 0.03, m['concrete'], name='wall')
    t.box(2.0, 0.03, 0, 2.95, 0.06, 0.03, m['concrete'], name='wall')

    # --- the main shed along the north side, with its door to the yard and the letter on its roof ---
    t.box(0.96, 2.06, 0, 2.72, 2.74, 0.2, m['walls'], m['roof'], name='shed')
    t.box(1.7, 2.045, 0, 2.0, 2.06, 0.13, m['door'], name='door')
    t.zone_letter('I', 1.75, 2.4, 0.2, 0.5, m['green_paint'])
    for x, y in ((2.35, 2.55), (2.5, 2.25), (1.2, 2.6)):
        t.box(x - 0.03, y - 0.025, 0.2, x + 0.03, y + 0.025, 0.225, m['unit'], name='vent')

    # --- the smaller shed in the south-east corner, its ridge running north-south ---
    t.house(2.14, 0.14, 2.78, 1.0, 0.13, 0.06, m['walls'], m['roof_turned'], ridge='y')

    # --- the boiler house and its chimney in the north-west corner ---
    t.box(0.18, 2.3, 0, 0.58, 2.66, 0.12, m['brick'], m['soot'], name='boiler_house')
    t.cylinder(0.3, 2.4, 0, 0.42, 0.045, t.stack_brick(), 16)
    t.cylinder(0.3, 2.4, 0.42, 0.425, 0.032, m['soot'], 16)
    if frame is not None:
        t.smoke(0.3, 2.4, 0.42, frame, 8, m['smoke'], seed=1)

    # --- crates and drums round the yard ---
    for area in ((0.1, 1.75, 0.42, 2.2), (0.66, 2.0, 0.9, 2.3), (0.68, 2.74, 0.92, 2.92), (0.98, 1.76, 1.62, 1.98),
                 (0.7, 0.3, 1.4, 0.72), (0.12, 0.1, 0.6, 0.38), (0.82, 0.1, 1.38, 0.26)):
        t.crates(*area, m['crate'], rng)
    t.barrels(2.08, 1.84, 2.36, 2.02, m['red_drum'], rng)
    t.barrels(2.56, 1.8, 2.72, 2.0, m['blue_drum'], rng)
    t.barrels(0.38, 0.56, 0.6, 0.84, m['blue_drum'], rng)
    t.box(2.38, 1.6, 0, 2.62, 1.72, 0.035, m['skip'], name='skip')

    # --- a flatbed lorry crossing the yard, and a small box lorry backed up to the shed ---
    t.lorry(0.82, 1.42, 270, m['white'], kind='flat', load=m['crate'])
    t.lorry(1.92, 0.72, 180, m['cab_blue'], m['white'], length=0.4)


t.render_animated(__file__, build, 8)
