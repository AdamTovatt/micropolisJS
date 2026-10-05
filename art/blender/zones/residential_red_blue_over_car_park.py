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

# A 3x3 residential zone packed with blocks: a large red block in the middle, a blue block to the
# north-west, a red block to the north-east, a grey block down the east side, and a long row of
# parking bays along the south edge.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(15)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.2, dirt_scale=2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.22, 0.22), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'red_facade': t.textured('red_facade', 'brick-facade.png', 0.5, 0.5, tint='ff8c78', shade=2.0),
    'blue_facade': t.textured('blue_facade', 'white-facade.png', 0.5, 0.5, tint='9ab0e8', shade=1.2),
    'grey_facade': t.textured('grey_facade', 'concrete-facade.png', 0.55, 0.5, shade=0.95),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.2),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: paving between the blocks, the parking along the south edge ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(0.2, 0.42, 0, 2.9, 2.85, 0.003, M['pavers'], name='paving')
t.box(0.5, 0.04, 0, 2.95, 0.42, 0.004, M['asphalt'], name='parking')
names = ['car-01', 'car-04', None, 'car-11', 'car-18', 'car-08', None, 'car-15', 'car-02', 'car-19', None, 'car-12',
         'car-09']
t.parking_row(0.55, 0.06, 13, 'x', +1, names, M['white_line'], random.Random(6), depth=0.3)

# --- the blocks ---
t.building([(0.3, 1.78), (0.88, 1.78), (0.88, 2.65), (0.3, 2.65)], 0.55, M['blue_facade'], M['roof'], M['rim'])
t.building([(1.35, 2.02), (2.45, 2.02), (2.45, 2.72), (1.35, 2.72)], 0.4, M['red_facade'], M['roof'], M['rim'])
t.building([(2.12, 0.5), (2.66, 0.5), (2.66, 1.95), (2.12, 1.95)], 0.45, M['grey_facade'], M['roof'], M['rim'])
t.building([(0.6, 0.62), (2.05, 0.62), (2.05, 1.65), (0.6, 1.65)], 0.6, M['red_facade'], M['roof'], M['rim'])
t.zone_letter('R', 1.33, 1.15, 0.602, 0.42, M['green_paint'])
t.roof_clutter([(0.64, 0.66, 1.05, 1.61), (1.6, 0.66, 2.01, 1.61)], 0.6, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.34, 1.82, 0.84, 2.61)], 0.55, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(1.39, 2.06, 2.41, 2.68)], 0.4, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(2.16, 0.54, 2.62, 1.91)], 0.45, rng, M['unit'], M['fan'], count=3)

# --- trees along the west and north edges ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(0.08, y) for y in (0.3, 0.9, 1.5, 2.1, 2.7)] + [(x, 2.88) for x in (0.6, 1.1, 1.6, 2.1, 2.6)] +
         [(2.85, y) for y in (0.7, 1.4, 2.1)] + [(1.05, 1.85), (1.15, 2.3)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
