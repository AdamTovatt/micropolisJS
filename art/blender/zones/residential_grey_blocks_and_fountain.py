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

# A 3x3 residential zone: two blue-grey L blocks, one down the west side and across the south, the
# other across the north and down the east, round a garden court, with a round fountain plaza in the
# south-east corner and trees along the edges.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(33)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.25, dirt_scale=2),
    'lawn': t.textured('lawn', 'lawn-grass.png', 0.25, 0.25, shade=1.35),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2), dirt=0.2, dirt_scale=3),
    'stone': t.textured('stone', 'paving-slabs.png', 0.15, 0.15, tint='fff4e0', shade=1.5),
    'facade': t.textured('facade', 'white-facade.png', 0.8, 0.8, tint='a4b0c8', shade=1.25),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, tint='c8d0e0', shade=3.2),
    'rim': t.plain('rim', '6a7890', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
    'water': t.plain('water', '3d8fb6', 0.1),
}

# --- ground: lawn, a path round the blocks, the court's garden ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='ground')
t.prism([(0.1, 0.16), (1.9, 0.16), (1.9, 0.28), (0.22, 0.28), (0.22, 2.4), (0.95, 2.4), (0.95, 2.65),
         (2.6, 2.65), (2.6, 2.8), (0.1, 2.8)], 0, 0.002, M['pavers'], name='path_round')
t.box(0.85, 0.98, 0, 1.72, 1.92, 0.003, M['lawn'], name='court_lawn')
t.box(1.22, 0.98, 0, 1.34, 1.92, 0.005, M['pavers'], name='court_path_ns')
t.box(0.85, 1.4, 0, 1.22, 1.5, 0.005, M['pavers'], name='court_path_west')
t.box(1.34, 1.4, 0, 1.72, 1.5, 0.005, M['pavers'], name='court_path_east')

# --- the blocks ---
H = 0.32
WEST = [(0.22, 0.28), (1.75, 0.28), (1.75, 0.98), (0.85, 0.98), (0.85, 2.4), (0.22, 2.4)]
NORTH = [(0.95, 1.92), (1.72, 1.92), (1.72, 1.28), (2.6, 1.28), (2.6, 2.65), (0.95, 2.65)]
for outline in (WEST, NORTH):
    t.building(outline, H, M['facade'], M['roof'], M['rim'])
t.zone_letter('R', 2.2, 2.05, H + 0.002, 0.42, M['green_paint'])
t.roof_clutter([(1.0, 2.0, 1.75, 2.6)], H, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.27, 1.0, 0.8, 2.35)], H, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.9, 0.32, 1.7, 0.94)], H, rng, M['unit'], M['fan'], count=2)

# --- the fountain plaza ---
t.prism(t.circle(2.35, 0.7, 0.36), 0, 0.004, M['stone'], name='plaza')
t.cylinder(2.35, 0.7, 0, 0.035, 0.17, M['stone'], 32)
t.cylinder(2.35, 0.7, 0.035, 0.037, 0.15, M['water'], 32)
t.cylinder(2.35, 0.7, 0.035, 0.08, 0.02, M['stone'], 12)

# --- shrubs in the court, trees round the edge ---
for (x, y, plant) in [(1.0, 1.15, 'plant-14'), (1.55, 1.7, 'plant-16'), (1.55, 1.15, 'plant-12'),
                      (1.0, 1.75, 'plant-17')]:
    t.tree(plant, x, y, 0.2)
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(0.07, y) for y in (0.4, 1.0, 1.6, 2.2, 2.8)] + [(x, 2.9) for x in (0.4, 1.1, 1.8, 2.5)] +
         [(2.85, y) for y in (0.4, 1.3, 1.9, 2.5)] + [(x, 0.06) for x in (0.6, 1.3, 2.0)] +
         [(1.95, 1.05), (2.75, 0.95)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.31)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
