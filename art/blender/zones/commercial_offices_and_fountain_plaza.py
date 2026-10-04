# micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
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

# A 3x3 commercial zone: a stone office block across the north, with a raised square in the middle
# of its roof carrying the zone's letter in blue, a paved plaza with a round fountain and a food
# van in front of it, and thick planting down both sides.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(34)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.25, 0.25), dirt=0.2, dirt_scale=3),
    'stone': t.textured('stone', 'paving-slabs.png', 0.15, 0.15, tint='fff4e0', shade=1.5),
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.25, dirt_scale=2),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'facade': t.textured('facade', 'concrete-facade.png', 0.8, 0.8, tint='ece4d4', shade=1.3),
    'roof': t.textured('roof', 'roof-membrane.png', 0.9, 0.9, tint='f0e4cc', shade=1.9),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'blue_paint': t.plain('blue_paint', '2f5fb8', 0.8),
    'water': t.plain('water', '2f7fd0', 0.1),
    'van': t.plain('van', 'e8902c', 0.4, 0.2),
    'van_roof': t.plain('van_roof', 'f2f0ea', 0.5),
}

# --- ground: lawn down both sides, a plaza in the middle, parking along the west edge ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='ground')
t.box(0.62, 0.1, 0, 2.38, 2.85, 0.003, M['pavers'], name='plaza')
t.box(0.06, 1.3, 0, 0.36, 2.7, 0.004, M['asphalt'], name='parking')
t.parking_row(0.08, 1.35, 6, 'y', +1, ['car-03', 'car-12', None, 'car-17', 'car-05', None], M['white_line'],
              random.Random(14), bay=0.2, depth=0.27)

# --- the office block, with a raised square in the middle of its roof ---
H, RH = 0.72, 0.82
O = [(0.72, 1.32), (2.12, 1.32), (2.12, 2.5), (0.72, 2.5)]
t.building(O, H, M['facade'], M['roof'], M['rim'])
R = [(1.02, 1.62), (1.78, 1.62), (1.78, 2.32), (1.02, 2.32)]
t.prism(R, H, RH, M['facade'], M['roof'])
t.parapet(R, RH, M['rim'])
t.zone_letter('C', 1.4, 1.97, RH + 0.002, 0.44, M['blue_paint'])
t.roof_clutter([(0.76, 1.36, 0.98, 2.46), (1.82, 1.36, 2.08, 2.46)], H, rng, M['unit'], M['fan'], count=2)

# --- the fountain and the food van on the plaza ---
CX, CY = 1.45, 0.62
t.prism(t.circle(CX, CY, 0.36), 0, 0.005, M['stone'], name='fountain_plaza')
t.cylinder(CX, CY, 0, 0.035, 0.2, M['stone'], 32)
t.cylinder(CX, CY, 0.035, 0.037, 0.18, M['water'], 32)
t.cylinder(CX, CY, 0.035, 0.09, 0.025, M['stone'], 12)
t.box(1.95, 0.95, 0, 2.1, 1.2, 0.07, M['van'], M['van_roof'], name='food_van')

# --- planting down both sides ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(x, y) for x in (0.15, 0.45) for y in (0.25, 0.7, 1.1)] + [(0.5, 1.6), (0.5, 2.2), (0.5, 2.8)] +
         [(x, y) for x in (2.55, 2.85) for y in (0.25, 0.7, 1.15, 1.6, 2.05, 2.5)] + [(0.9, 0.2), (2.0, 0.2)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.31)
    x, y = t.keep_inside(x + rng.uniform(-0.04, 0.04), y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
for (x, y) in [(0.75, 1.15), (2.2, 1.15), (0.8, 0.9), (2.25, 0.9)]:
    t.shrub('plant-' + str(rng.choice((14, 16, 17))), x, y, 0.14, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
