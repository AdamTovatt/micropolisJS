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

# A 3x3 commercial zone: a long stone office block down the west side with domed vents and
# skylights on its roof, two lower blocks in the north-east and south-east, a parking court
# between them, and trees along the edges.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(35)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.25, 0.25), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'facade': t.textured('facade', 'white-facade.png', 0.8, 0.8, tint='ece8e0', shade=1.15),
    'roof': t.textured('roof', 'roof-membrane.png', 0.9, 0.9, shade=1.25),
    'skylight': t.textured('skylight', 'glass-curtain-wall.png', 0.2, 0.2, rough=0.2, shade=0.7),
    'vent': t.plain('vent', '6d7a90', 0.4, 0.4),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'paint': t.plain('paint', 'ece8de', 0.9),
}

# --- ground: a plaza, lawn verges along the edges, the parking court ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.0, 0, 0.16, 3.0, 0.004, M['grass'], name='verge_west')
t.box(2.8, 0.0, 0, 3.0, 3.0, 0.004, M['grass'], name='verge_east')
t.box(0.16, 2.82, 0, 2.8, 3.0, 0.004, M['grass'], name='verge_north')
t.box(1.45, 0.82, 0, 2.75, 1.68, 0.003, M['asphalt'], name='parking_court')
parked = random.Random(15)
t.parking_row(1.55, 1.66, 6, 'x', -1, ['car-02', None, 'car-11', 'car-18', None, 'car-07'], M['white_line'],
              parked, bay=0.19, depth=0.27)
t.parking_row(1.55, 0.84, 6, 'x', +1, ['car-14', 'car-09', None, 'car-01', 'car-16', None], M['white_line'],
              parked, bay=0.19, depth=0.27)

# --- the long block down the west side ---
H = 0.55
W = [(0.3, 0.15), (1.28, 0.15), (1.28, 2.55), (0.3, 2.55)]
t.building(W, H, M['facade'], M['roof'], M['rim'])
t.zone_letter('C', 0.82, 1.3, H + 0.002, 0.44, M['paint'])
for (x, y) in [(0.8, 2.15), (0.6, 0.55), (1.0, 0.55)]:
    t.cylinder(x, y, H, H + 0.03, 0.09, M['rim'], 24)
    t.cylinder(x, y, H + 0.03, H + 0.06, 0.07, M['vent'], 24)
for y in (1.72, 1.86):
    t.box(0.45, y, H, 1.13, y + 0.1, H + 0.025, M['rim'], M['skylight'], name='skylight')
t.roof_clutter([(0.35, 2.3, 1.23, 2.5), (0.35, 0.75, 1.23, 1.0)], H, rng, M['unit'], M['fan'], count=2)

# --- the north-east and south-east blocks ---
NE = [(1.45, 1.82), (2.52, 1.82), (2.52, 2.5), (1.45, 2.5)]
t.building(NE, 0.4, M['facade'], M['roof'], M['rim'])
t.roof_clutter([(1.5, 1.87, 2.47, 2.45)], 0.4, rng, M['unit'], M['fan'], count=4)
SE = [(1.5, 0.15), (2.4, 0.15), (2.4, 0.68), (1.5, 0.68)]
t.building(SE, 0.3, M['facade'], M['roof'], M['rim'])
t.roof_clutter([(1.55, 0.2, 2.35, 0.63)], 0.3, rng, M['unit'], M['fan'], count=3)

# --- trees along the verges ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(0.08, y) for y in (0.3, 0.9, 1.5, 2.1, 2.7)] + [(2.9, y) for y in (0.3, 0.9, 1.5, 2.1)] +
         [(x, 2.91) for x in (0.6, 1.3, 2.0)] + [(2.6, 0.35)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
