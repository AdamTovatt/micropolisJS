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

# A 3x3 commercial zone: one tall round white office tower on a plaza, with a row of parking bays
# down the west side and gardens of trees and flowering shrubs round its foot.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(37)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.3, 0.3), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'white_wall': t.textured('white_wall', 'white-facade.png', 0.9, 0.7, shade=1.25),
    'roof': t.textured('roof', 'roof-membrane.png', 1.0, 1.0, shade=1.15),
    'rim': t.plain('rim', 'ece8e0', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
}

# --- ground: a plaza, the parking down the west side, gardens round the tower ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.1, 0.25, 0, 0.5, 2.8, 0.004, M['asphalt'], name='parking')
t.parking_row(0.12, 0.3, 13, 'y', +1, ['car-03', None, 'car-12', 'car-17', None, None, 'car-09', 'car-01', None,
                                       'car-10', None, 'car-19', 'car-05'],
              M['white_line'], random.Random(9), depth=0.3)
t.box(0.6, 0.15, 0, 2.85, 0.5, 0.005, M['grass'], name='garden_south')
t.box(2.55, 0.5, 0, 2.85, 2.85, 0.005, M['grass'], name='garden_east')

# --- the tower ---
CX, CY, R, H = 1.32, 1.12, 0.66, 1.6
t.round_building(CX, CY, R, H, M['white_wall'], M['roof'], M['rim'])
t.zone_letter('C', CX, CY, H + 0.002, 0.48, M['paint'])
s = R * 0.62
t.roof_clutter([(CX - s, CY - s, CX + s, CY - 0.28)], H, rng, M['unit'], M['fan'], count=2)
t.roof_clutter([(CX - s, CY + 0.28, CX + s, CY + s)], H, rng, M['unit'], M['fan'], count=2)

# --- trees and flowering shrubs ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(x, 0.3) for x in (0.75, 1.3, 1.9, 2.45)] + [(2.72, y) for y in (0.8, 1.4, 2.0, 2.6)] +
         [(0.75, 2.6), (1.3, 2.8), (0.68, 2.05)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.28)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
for i, (x, y) in enumerate([(0.68, 0.62), (2.3, 0.62), (2.42, 1.2), (0.62, 1.5)]):
    t.shrub(['plant-14', 'plant-16', 'plant-17', 'plant-12'][i], x, y, 0.16, 0.05)

t.render(scene, t.out_dir(__file__), tiles=3)
