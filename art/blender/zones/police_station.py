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

# The police station, tiles 770 to 778, a 3x3 zone: a blue-grey station with PD on its roof, as
# the original's, a radio mast, and a car park in front with the patrol cars.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(770)

M = {
    'lawn': t.textured('lawn', 'lawn-grass.png', 0.25, 0.25, tint='d8ffb0', shade=1.3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.25, 0.25, shade=1.1), dirt=0.12),
    'paving': t.textured('paving', 'paving-slabs.png', 0.15, 0.15, tint='fff4e4', shade=1.5),
    'facade': t.textured('facade', 'white-facade.png', 0.85, 0.85, tint='9ab0e8', shade=1.4),
    'roof': t.mottled('roof', '3a5a9a', '2f4c86', 14),
    'rim': t.plain('rim', 'd8d4cc', 0.7),
    'glass': t.textured('glass', 'glass-curtain-wall.png', 0.8, 0.8, rough=0.15, shade=0.6),
    'yellow_paint': t.plain('yellow_paint', 'f0c828', 0.7),
    'line': t.plain('line', 'ecebe6', 0.8),
    'mast': t.plain('mast', '9a9ea4', 0.5, 0.4),
    'light_bar': t.plain('light_bar', '2a5ae8', 0.4),
}

# --- ground: lawns, the path to the door, the car park ---
t.box(0, 0, -0.05, 3, 3, 0, M['lawn'], name='lawn')
t.box(0.2, 0.15, 0, 2.8, 1.05, 0.002, M['asphalt'], name='car_park')
t.box(1.3, 1.05, 0, 1.7, 1.2, 0.002, M['paving'], name='path')

# --- the station, its glass entrance, its letters and the radio mast ---
t.building([(0.35, 1.2), (2.65, 1.2), (2.65, 2.7), (0.35, 2.7)], 0.2, M['facade'], M['roof'], M['rim'])
t.box(1.25, 1.12, 0, 1.75, 1.2, 0.12, M['glass'], name='entrance')
t.zone_letter('P', 1.25, 1.95, 0.2, 0.52, M['yellow_paint'])
t.zone_letter('D', 1.75, 1.95, 0.2, 0.52, M['yellow_paint'])
for dx, dy in ((-0.03, -0.03), (0.03, -0.03), (0.03, 0.03), (-0.03, 0.03)):
    t.strut((2.35 + dx, 2.4 + dy, 0.2), (2.35 + dx * 0.3, 2.4 + dy * 0.3, 0.55), 0.005, M['mast'])

# --- the car park: patrol cars in the front row, staff cars behind ---
patrol = ['car-02', 'car-02', None, 'car-02', 'car-02', None, None, 'car-09', 'car-04', None, 'car-17', 'car-11', None]
t.parking_row(0.35, 1.0, 13, 'x', -1, patrol, M['line'], bay=0.18, depth=0.3)
staff = [rng.choice(['car-01', 'car-03', 'car-05', 'car-08', 'car-10', 'car-12', None, None]) for _ in range(13)]
t.parking_row(0.35, 0.2, 13, 'x', 1, staff, M['line'], rng, bay=0.18, depth=0.3)
for i in (0, 1, 3, 4):
    x = 0.35 + (i + 0.5) * 0.18
    t.box(x - 0.03, 0.82 - 0.008, 0.05, x + 0.03, 0.82 + 0.008, 0.058, M['light_bar'], name='light_bar')

t.render(scene, t.out_dir(__file__), tiles=3)
