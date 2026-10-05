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

# A 3x3 residential zone: a green L-shaped apartment block and a green wing to its north-east,
# round a garden of trees, with a car park in the south-east corner.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(22)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.3, dirt_scale=2),
    'garden': t.textured('garden', 'lawn-grass.png', 0.25, 0.25, shade=1.3),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2), dirt=0.25, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'green_facade': t.textured('green_facade', 'concrete-facade.png', 0.6, 0.55, tint='6fb070', shade=2.1),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.3),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: a lawn, a path round the buildings, the garden between them ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.prism([(0.12, 0.1), (2.1, 0.1), (2.1, 0.22), (0.25, 0.22), (0.25, 2.65), (2.8, 2.65), (2.8, 2.78),
         (0.12, 2.78)], 0, 0.003, M['pavers'], name='path_round')
t.box(1.05, 0.62, 0, 2.12, 1.72, 0.004, M['garden'], name='garden')

# --- the car park in the south-east corner: an aisle down the middle, bays either side ---
t.box(2.2, 0.08, 0, 2.95, 1.25, 0.004, M['asphalt'], name='car_park')
parked = random.Random(9)
t.parking_row(2.47, 0.12, 6, 'y', -1, ['car-04', 'car-11', None, 'car-02', 'car-18', None],
              M['white_line'], parked, depth=0.25)
t.parking_row(2.68, 0.12, 6, 'y', +1, ['car-09', None, 'car-16', 'car-01', None, 'car-12'],
              M['white_line'], parked, depth=0.25)

# --- the buildings ---
L_BLOCK = [(0.3, 0.3), (1.88, 0.3), (1.88, 0.72), (0.84, 0.72), (0.84, 2.5), (0.3, 2.5)]
WING = [(1.07, 1.82), (2.4, 1.82), (2.4, 2.5), (1.07, 2.5)]
t.building(L_BLOCK, 0.52, M['green_facade'], M['roof'], M['rim'])
t.building(WING, 0.46, M['green_facade'], M['roof'], M['rim'])
t.zone_letter('R', 1.92, 2.15, 0.462, 0.4, M['green_paint'])
t.roof_clutter([(0.34, 0.8, 0.8, 2.45)], 0.52, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(1.12, 1.86, 1.55, 2.45)], 0.46, rng, M['unit'], M['fan'], count=2)

# --- trees in the garden and round the edge ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = [(1.25, 1.5), (1.6, 1.55), (1.95, 1.45), (1.3, 0.95), (1.75, 1.05), (0.1, 0.6), (0.1, 1.3),
         (0.1, 2.0), (0.55, 2.88), (1.3, 2.88), (2.0, 2.88), (2.8, 2.3), (2.75, 1.65), (0.6, 0.08),
         (1.4, 0.06)]
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.31)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
bushes = ['plant-22', 'plant-26', 'plant-29', 'plant-23', 'plant-24', 'plant-28']
for i, x in enumerate((1.15, 1.45, 1.75, 2.05)):
    t.shrub(bushes[i], x, 1.76, 0.1, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
