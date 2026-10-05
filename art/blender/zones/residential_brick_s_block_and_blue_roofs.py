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

# A 3x3 residential zone: a long brick block winding from the north edge down the west side and
# across the south, a pale house with a blue mansard roof in the north-east, a smaller one in the
# south-east with a paved forecourt, and a car park and a garden in the bend of the brick block.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(51)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.25, dirt_scale=2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'brick': t.textured('brick', 'brick-facade.png', 0.8, 0.8, tint='ffbe8c', shade=2.4, hue=0.04),
    'pale_facade': t.textured('pale_facade', 'white-facade.png', 0.45, 0.45, tint='e8e2d6', shade=1.2),
    'dark_roof': t.textured('dark_roof', 'roof-membrane.png', 0.8, 0.8, shade=0.75),
    'grey_roof': t.textured('grey_roof', 'roof-membrane.png', 0.8, 0.8, shade=1.6),
    'blue_slate': t.textured('blue_slate', 'slate-roof.png', 0.3, 0.3, tint='8fa6e8', shade=1.3),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: lawn, with a path round the brick block and the houses ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='ground')
t.prism([(0.12, 0.28), (2.0, 0.28), (2.0, 1.2), (1.35, 1.2), (1.35, 2.75), (0.12, 2.75)], 0, 0.002,
        M['pavers'], name='path_round_brick')
t.prism([(1.35, 1.3), (2.85, 1.3), (2.85, 2.85), (1.35, 2.85)], 0, 0.002, M['pavers'], name='paved_court')
t.box(2.0, 0.12, 0, 2.8, 0.3, 0.003, M['pavers'], name='forecourt')

# --- the brick block: one outline from the north edge, down the west side and across the south ---
BRICK = [(0.25, 0.42), (1.82, 0.42), (1.82, 1.05), (1.2, 1.05), (1.2, 1.45), (0.65, 1.45), (0.65, 1.95),
         (1.22, 1.95), (1.22, 2.6), (0.25, 2.6)]
BH = 0.42
t.building(BRICK, BH, M['brick'], M['dark_roof'], M['rim'])
t.zone_letter('R', 0.78, 1.0, BH + 0.002, 0.42, M['green_paint'])
t.roof_clutter([(0.3, 2.0, 1.18, 2.56)], BH, rng, M['unit'], M['fan'], count=4)
t.roof_clutter([(1.22, 0.46, 1.78, 1.0)], BH, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.3, 1.45, 0.62, 1.92)], BH, rng, M['unit'], M['fan'], count=1)

# --- the car park and the garden in the bend ---
t.box(0.7, 1.5, 0, 1.3, 1.92, 0.004, M['asphalt'], name='car_park')
t.parking_row(0.75, 1.92, 3, 'x', -1, ['car-05', None, 'car-11'], M['white_line'], random.Random(4), depth=0.26)
for (x, y) in [(1.5, 1.45), (1.6, 0.95)]:
    t.tree('plant-0' + str(rng.choice((1, 3, 6))), x, y, 0.22, rng.choice((0, 90, 180, 270)))
for (x, y, plant) in [(1.45, 1.75, 'plant-16'), (1.55, 2.2, 'plant-12'), (1.48, 2.55, 'plant-14')]:
    t.shrub(plant, x, y, 0.14, 0.04)

# --- the houses: pale walls under blue slate, the larger with a flat grey top ---
t.box(1.85, 1.75, 0, 2.55, 2.55, 0.3, M['pale_facade'], name='north_house')
t.mansard_roof(1.85, 1.75, 2.55, 2.55, 0.3, 0.1, 0.13, M['blue_slate'], M['grey_roof'])
t.roof_clutter([(1.9, 1.8, 2.5, 2.5)], 0.4, rng, M['unit'], M['fan'], count=2)
t.box(2.1, 0.45, 0, 2.6, 1.15, 0.26, M['pale_facade'], name='south_house')
t.mansard_roof(2.1, 0.45, 2.6, 1.15, 0.26, 0.1, 0.14, M['blue_slate'])

# --- trees round the edge ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(0.06, y) for y in (0.4, 1.0, 1.6, 2.2, 2.8)] + [(x, 2.88) for x in (0.6, 1.25, 1.85, 2.45)] +
         [(2.88, y) for y in (0.5, 1.1, 1.7, 2.3)] + [(x, 0.08) for x in (0.35, 0.95, 1.55)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.31)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
