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

# A 3x3 residential zone: a blue C-shaped block open to the east round a car park, and a blue
# slab down the east side, a storey lower at its south end, with a footpath between them.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(21)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.2, dirt_scale=2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.22, 0.22), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'blue_facade': t.textured('blue_facade', 'white-facade.png', 0.5, 0.5, tint='7f98d8', shade=1.0),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.3),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: a lawn, a path round the blocks and between them, the car park in the court ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.prism([(0.1, 0.1), (2.85, 0.1), (2.85, 0.22), (0.22, 0.22), (0.22, 2.75), (0.1, 2.75)],
        0, 0.003, M['pavers'], name='path_round')
t.box(1.78, 0.22, 0, 1.95, 2.85, 0.004, M['pavers'], name='path_between')
t.box(0.95, 0.95, 0, 1.75, 1.97, 0.005, M['asphalt'], name='court_car_park')
parked = random.Random(5)
t.parking_row(1.2, 1.0, 5, 'y', -1, ['car-04', 'car-11', None, 'car-18', 'car-02'], M['white_line'], parked,
              depth=0.24)
t.parking_row(1.48, 1.0, 5, 'y', +1, ['car-09', None, 'car-16', 'car-01', 'car-12'], M['white_line'], parked,
              depth=0.24)

# --- the blocks ---
C_BLOCK = [(0.3, 0.3), (1.72, 0.3), (1.72, 0.92), (0.92, 0.92), (0.92, 2.0), (1.72, 2.0), (1.72, 2.5),
           (0.3, 2.5)]
# kept low enough that the sun still reaches the court between the arms
t.building(C_BLOCK, 0.36, M['blue_facade'], M['roof'], M['rim'])
t.building([(2.02, 1.45), (2.58, 1.45), (2.58, 2.55), (2.02, 2.55)], 0.5, M['blue_facade'], M['roof'], M['rim'])
t.building([(2.02, 0.3), (2.58, 0.3), (2.58, 1.42), (2.02, 1.42)], 0.42, M['blue_facade'], M['roof'], M['rim'])
t.zone_letter('R', 0.61, 1.45, 0.362, 0.4, M['green_paint'])
t.roof_clutter([(0.34, 2.04, 1.68, 2.46)], 0.36, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.34, 0.34, 1.68, 0.88)], 0.36, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(2.06, 1.5, 2.54, 2.5)], 0.5, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(2.06, 0.34, 2.54, 1.38)], 0.42, rng, M['unit'], M['fan'], count=2)

# --- trees round the edge ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(x, 2.88) for x in (0.25, 0.8, 1.35, 2.3, 2.8)] + [(0.08, y) for y in (0.5, 1.1, 1.7, 2.3)] +
         [(2.85, y) for y in (0.5, 1.0, 1.5, 2.0)] + [(x, 0.05) for x in (0.6, 1.3, 2.3)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.22, 0.28)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
