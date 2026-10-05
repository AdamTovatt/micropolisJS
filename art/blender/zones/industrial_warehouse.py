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

# A distribution warehouse, industrial (2, 1): a long steel warehouse across the north with a
# row of loading bays, lorries at the bays and parked in the yard, a small shed in the south-west
# corner and pallets of goods.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(657)

M = {
    'yard': t.concrete_yard(),
    'walls': t.textured('walls', 'corrugated-steel.png', 0.5, 0.5, tint='e0e4e8', shade=1.15),
    'roof': t.weathered(t.textured('roof', 'corrugated-steel.png', 0.5, 0.5, tint='f4e8dc', shade=1.3), dirt=0.3,
                        dirt_scale=6),
    'roof_turned': t.textured('roof_turned', 'corrugated-steel.png', 0.5, 0.5, shade=1.2, turned=True),
    'door': t.plain('door', '2a2c30', 0.6),
    'dock': t.plain('dock', '6a7078', 0.6),
    'line': t.plain('line', 'ecebe6', 0.8),
    'concrete': t.plain('concrete', 'b4b0a8'),
    'crate': t.mottled('crate', 'c09868', '8e6c44', 30),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'white': t.plain('white', 'e8e8e4', 0.5),
    'blue': t.plain('blue', '2f5fae', 0.5),
    'red': t.plain('red', 'c03a30', 0.5),
    'yellow': t.plain('yellow', 'e2b628', 0.5),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: the yard, the bays painted on it, a low wall along the south ---
t.box(0, 0, -0.05, 3, 3, 0, M['yard'], name='yard')
for i in range(8):
    x = 0.42 + i * 0.3
    t.box(x - 0.006, 1.42, 0, x + 0.006, 1.78, 0.002, M['line'], name='bay_line')
t.box(0.7, 0.03, 0, 2.95, 0.06, 0.03, M['concrete'], name='wall')

# --- the warehouse, its loading bays along the south wall and the letter on its roof ---
t.box(0.2, 1.8, 0, 2.76, 2.82, 0.2, M['walls'], M['roof'], name='warehouse')
for i in range(7):
    x = 0.57 + i * 0.3
    t.box(x - 0.09, 1.785, 0, x + 0.09, 1.8, 0.12, M['door'], name='bay_door')
    t.box(x - 0.1, 1.74, 0, x + 0.1, 1.785, 0.03, M['dock'], name='dock')
t.zone_letter('I', 1.48, 2.32, 0.2, 0.52, M['green_paint'])
for x, y in ((0.55, 2.6), (2.45, 2.6), (0.75, 2.05), (2.3, 2.1)):
    t.box(x - 0.03, y - 0.025, 0.2, x + 0.03, y + 0.025, 0.225, M['unit'], name='vent')

# --- the small shed in the south-west corner ---
t.house(0.1, 0.12, 0.6, 0.98, 0.14, 0.05, M['walls'], M['roof_turned'], ridge='y')

# --- lorries: two backed up to the bays, one turning in the yard, three parked along the south ---
t.lorry(0.87, 1.5, 180, M['blue'], M['white'])
t.lorry(1.47, 1.52, 180, M['white'], M['white'], length=0.3)
t.lorry(2.25, 1.15, 115, M['red'], M['white'])
t.lorry(1.0, 0.72, 270, M['yellow'], M['white'])
t.lorry(1.0, 0.36, 270, M['red'], M['white'])
t.lorry(2.12, 0.3, 270, M['blue'], M['white'])

# --- pallets of goods ---
for area in ((2.48, 0.5, 2.9, 0.82), (2.55, 0.12, 2.9, 0.34), (2.06, 0.56, 2.36, 0.74), (0.04, 1.84, 0.18, 2.4),
             (2.6, 1.34, 2.9, 1.62)):
    t.crates(*area, M['crate'], rng)

t.render(scene, t.out_dir(__file__), tiles=3)
