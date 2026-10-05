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

# A 3x3 commercial zone: a stone office with a stepped-back top floor in the north-west, a
# car park with a small blue office and two vans to its east, a lane across the middle, and a
# red brick store in a little park on the south side.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(17)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.25, dirt_scale=2),
    'soil': t.textured('soil', 'bare-soil.png', 0.6, 0.6, shade=1.1),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.22, 0.22), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'stone': t.textured('stone', 'concrete-facade.png', 0.45, 0.4, tint='efe3cc', shade=1.35),
    'brick': t.textured('brick', 'brick-wall.png', 0.25, 0.25, shade=1.1),
    'blue_wall': t.textured('blue_wall', 'white-facade.png', 0.4, 0.4, tint='7f98d8'),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.3),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
}

# --- ground: worn grass and soil, a lane across the middle that stops short of both edges ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(1.3, 1.4, 0, 2.9, 2.9, 0.003, M['soil'], name='yard')
t.box(0.25, 1.12, 0, 2.75, 1.35, 0.004, M['asphalt'], name='lane')
t.dashes(0.3, 1.235, 2.7, 1.235, M['white_line'])

# --- the car park east of the office: two rows off an aisle down its middle ---
t.box(1.35, 1.35, 0, 2.2, 2.85, 0.005, M['asphalt'], name='car_park')
parked = random.Random(7)
t.parking_row(1.65, 1.42, 7, 'y', -1, ['car-01', 'car-04', None, 'car-11', 'car-18', None, 'car-08'],
              M['white_line'], parked, depth=0.27)
t.parking_row(1.92, 1.42, 7, 'y', +1, ['car-05', None, 'car-16', 'car-02', None, 'car-09', 'car-12'],
              M['white_line'], parked, depth=0.27)
t.car('car-07', 2.55, 2.15, 90)
t.car('car-06', 2.5, 1.7, 90)

# --- the office, with its top floor stepped back, and the small blue office ---
t.building([(0.15, 1.55), (1.2, 1.55), (1.2, 2.75), (0.15, 2.75)], 0.28, M['stone'], M['roof'], M['rim'])
t.building([(0.32, 1.75), (1.02, 1.75), (1.02, 2.55), (0.32, 2.55)], 0.42, M['stone'], M['roof'], M['rim'])
t.zone_letter('C', 0.67, 2.15, 0.422, 0.36, M['paint'])
t.roof_clutter([(0.19, 1.59, 1.16, 1.72)], 0.28, rng, M['unit'], M['fan'], count=2)
t.building([(2.3, 2.42), (2.85, 2.42), (2.85, 2.82), (2.3, 2.82)], 0.14, M['blue_wall'], M['roof'], M['rim'])

# --- the store in a park on the south side, with a few parking bays beside it ---
t.building([(1.15, 0.12), (2.05, 0.12), (2.05, 0.78), (1.15, 0.78)], 0.24, M['brick'], M['roof'], M['rim'])
t.roof_clutter([(1.2, 0.17, 2.0, 0.73)], 0.24, rng, M['unit'], M['fan'], count=3)
t.box(0.4, 0.82, 0, 1.15, 1.12, 0.005, M['asphalt'], name='store_bays')
t.parking_row(0.45, 1.12, 4, 'x', -1, ['car-17', 'car-03', None, 'car-10'], M['white_line'], parked, depth=0.28)
t.box(2.15, 0.2, 0, 2.85, 0.9, 0.003, M['pavers'], name='terrace')

# --- trees ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = [(0.2, 0.15), (0.5, 0.45), (0.85, 0.2), (0.15, 0.75), (2.35, 0.55), (2.7, 0.35), (2.85, 1.0),
         (2.85, 1.55), (1.3, 1.0), (0.1, 1.3), (0.25, 2.88), (0.85, 2.88)]
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.22, 0.3)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
