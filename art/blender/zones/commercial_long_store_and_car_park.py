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

# A 3x3 commercial zone: a long low store across the north with skylights and plant on its roof, a
# car park with the zone's letter painted on it, a small grey building beside a garden in the
# south-west, and two blue buildings on bare ground along the east side.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(25)

M = {
    'soil': t.weathered(t.textured('soil', 'bare-soil.png', 0.9, 0.9, shade=1.15), dirt=0.2, dirt_scale=2),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'store_facade': t.textured('store_facade', 'concrete-facade.png', 0.8, 0.8, tint='d8d4cc', shade=1.1),
    'blue_facade': t.textured('blue_facade', 'white-facade.png', 0.8, 0.8, tint='6f8ee0', shade=1.1),
    'grey_facade': t.textured('grey_facade', 'concrete-facade.png', 0.8, 0.8, shade=0.95),
    'dark_roof': t.textured('dark_roof', 'roof-membrane.png', 0.8, 0.8, shade=0.75),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.3),
    'skylight': t.textured('skylight', 'glass-curtain-wall.png', 0.2, 0.2, rough=0.2, shade=0.7),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'blue_rim': t.plain('blue_rim', '2f56b8', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'paint': t.plain('paint', 'e8e6e0', 0.9),
}

# --- ground: bare earth, paving along the store, the car park, a garden in the south-west ---
t.box(0, 0, -0.05, 3, 3, 0, M['soil'], name='soil')
t.box(0.12, 1.85, 0, 2.85, 2.1, 0.002, M['pavers'], name='store_front')
t.box(0.22, 0.12, 0, 2.08, 1.85, 0.003, M['asphalt'], name='car_park')
t.zone_letter('C', 1.45, 1.15, 0.003, 0.55, M['paint'], thickness=0.004)
parked = random.Random(7)
t.parking_row(0.26, 1.0, 4, 'y', +1, ['car-08', None, 'car-02', 'car-17'], M['white_line'], parked,
              bay=0.2, depth=0.27)
t.parking_row(0.75, 1.82, 6, 'x', -1, ['car-12', 'car-05', None, 'car-19', None, 'car-03'], M['white_line'],
              parked, bay=0.2, depth=0.27)
t.parking_row(2.04, 0.2, 7, 'y', -1, ['car-10', 'car-01', None, 'car-15', 'car-09', None, 'car-04'],
              M['white_line'], parked, bay=0.2, depth=0.27)
t.box(0.12, 0.12, 0, 1.15, 0.92, 0.004, M['grass'], name='garden')

# --- the long store, its roof with skylights, and plant over its east end ---
SH = 0.3
S = [(0.3, 2.12), (2.6, 2.12), (2.6, 2.72), (0.3, 2.72)]
t.building(S, SH, M['store_facade'], M['dark_roof'], M['rim'])
for i in range(5):
    x = 0.5 + i * 0.26
    t.box(x, 2.3, SH, x + 0.14, 2.55, SH + 0.03, M['rim'], M['skylight'], name='skylight')
t.box(1.95, 2.22, SH, 2.5, 2.62, SH + 0.08, M['store_facade'], M['roof'], name='plant_room')
t.roof_clutter([(1.98, 2.25, 2.47, 2.59)], SH + 0.08, rng, M['unit'], M['fan'], count=3)

# --- the small grey building in the garden ---
t.building([(0.22, 0.25), (0.82, 0.25), (0.82, 0.6), (0.22, 0.6)], 0.2, M['grey_facade'], M['roof'], M['rim'])
t.roof_clutter([(0.26, 0.29, 0.78, 0.56)], 0.2, rng, M['unit'], M['fan'], count=2)

# --- the blue buildings along the east side ---
for (x0, y0, x1, y1, h) in [(2.22, 0.98, 2.68, 1.55, 0.28), (2.24, 0.3, 2.58, 0.82, 0.22)]:
    outline = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    t.prism(outline, 0, h, M['blue_facade'], M['dark_roof'])
    t.parapet(outline, h, M['blue_rim'])
    t.roof_clutter([(x0 + 0.04, y0 + 0.04, x1 - 0.04, y1 - 0.04)], h, rng, M['unit'], M['fan'], count=1)

# --- trees in the garden and along the store's front ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = [(0.95, 0.3), (1.05, 0.7), (0.4, 0.8), (1.75, 1.95), (2.1, 1.95), (2.4, 1.95), (0.1, 1.5), (0.1, 2.0),
         (2.85, 2.3), (2.85, 0.6), (2.85, 1.3)]
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
