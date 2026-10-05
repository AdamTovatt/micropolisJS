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

# A 3x3 residential zone: a red apartment block and a navy one wrapped around a courtyard
# garden with a fountain, and a car park in the south-east corner.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(5)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.25, dirt_scale=2),
    'lawn': t.textured('lawn', 'lawn-grass.png', 0.25, 0.25, shade=1.35),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2), dirt=0.2, dirt_scale=3),
    'red_facade': t.textured('red_facade', 'concrete-facade.png', 0.6, 0.55, tint='e0604a', shade=1.7),
    'navy_facade': t.textured('navy_facade', 'concrete-facade.png', 0.6, 0.55, tint='6b80b8', shade=1.5),
    'slate_roof': t.textured('slate_roof', 'roof-membrane.png', 0.8, 0.8, shade=0.7),
    'grey_roof': t.textured('grey_roof', 'roof-membrane.png', 0.8, 0.8, shade=1.5),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
    'stone': t.plain('stone', 'bdb6a8', 0.7),
    'water': t.plain('water', '3d7fa6', 0.1),
}

# --- ground ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='ground')
# a path all round the buildings, and the drive into the car park
# (one outline, so no two surfaces meet at the same height)
t.prism([(0.12, 0.18), (1.78, 0.18), (1.78, 0.33), (0.27, 0.33), (0.27, 2.48), (2.62, 2.48),
         (2.62, 2.62), (0.12, 2.62)], 0, 0.003, M['pavers'], name='path_round')
t.box(1.64, 1.05, 0, 2.95, 1.2, 0.003, M['pavers'], name='path_east')

# --- the car park on the south edge: an aisle down the middle, bays either side ---
t.box(2.08, 0.0, 0, 2.88, 1.0, 0.004, M['asphalt'], name='car_park')
parked = random.Random(6)
t.parking_row(2.36, 0.08, 5, 'y', -1, ['car-01', 'car-04', None, 'car-18', 'car-08'],
              M['white_line'], parked, depth=0.27)
t.parking_row(2.6, 0.08, 5, 'y', +1, ['car-15', None, 'car-09', 'car-02', None],
              M['white_line'], parked, depth=0.27)

# --- the buildings ---
RED = [(0.27, 0.33), (1.64, 0.33), (1.64, 0.73), (0.68, 0.73), (0.68, 2.48), (0.27, 2.48)]
NAVY = [(0.68, 2.04), (1.65, 2.04), (1.65, 1.32), (2.5, 1.32), (2.5, 2.48), (0.68, 2.48)]
t.building(RED, 0.6, M['red_facade'], M['slate_roof'], M['rim'])
t.building(NAVY, 0.5, M['navy_facade'], M['grey_roof'], M['rim'])
t.zone_letter('R', 2.1, 1.95, 0.502, 0.42, M['green_paint'])
t.roof_clutter([(0.72, 2.08, 1.62, 2.45)], 0.5, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.3, 0.9, 0.66, 2.4)], 0.6, rng, M['unit'], M['fan'], count=2)

# --- the courtyard: lawn, cross paths, a fountain, a hedge round the edge ---
t.box(0.68, 0.73, 0, 1.65, 2.04, 0.004, M['pavers'], name='courtyard')
t.box(0.76, 0.81, 0, 1.57, 1.96, 0.006, M['lawn'], name='courtyard_lawn')
t.box(1.13, 0.81, 0, 1.2, 1.96, 0.008, M['pavers'], name='cross_path_ns')
t.box(0.76, 1.35, 0, 1.57, 1.42, 0.008, M['pavers'], name='cross_path_ew')
t.cylinder(1.165, 1.385, 0, 0.03, 0.1, M['stone'], 24)
t.cylinder(1.165, 1.385, 0.03, 0.032, 0.085, M['water'], 24)
t.cylinder(1.165, 1.385, 0.03, 0.07, 0.015, M['stone'], 12)
for x in (0.86, 1.02, 1.31, 1.47):
    t.shrub('plant-21', x, 1.9, 0.14, 0.04)
for (x, y, plant) in [(0.92, 1.12, 'plant-14'), (1.42, 1.65, 'plant-16'), (1.42, 1.1, 'plant-12'),
                      (0.9, 1.68, 'plant-17')]:
    t.tree(plant, x, y, 0.2)

# --- trees round the edge ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(0.08, y) for y in (0.45, 0.95, 1.45, 1.95, 2.45)] +
         [(x, 2.85) for x in (0.3, 0.85, 1.4, 1.95, 2.5, 2.9)] +
         [(2.85, y) for y in (1.45, 1.9, 2.35)] +
         [(x, 0.08) for x in (0.4, 0.95, 1.5)] + [(1.85, 0.55), (1.85, 0.95)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.27, 0.34)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
