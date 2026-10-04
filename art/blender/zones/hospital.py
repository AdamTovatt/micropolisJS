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

# The hospital, tiles 405 to 413, which a residential zone builds when the city needs one: a
# white block in the shape of a T with a red cross on its roof, a helicopter pad on its wing,
# an ambulance bay and a car park, among trees.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(409)

M = {
    'lawn': t.textured('lawn', 'lawn-grass.png', 0.25, 0.25, tint='d8ffb0', shade=1.3),
    'paving': t.textured('paving', 'paving-slabs.png', 0.15, 0.15, tint='fff4e4', shade=1.5),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.4, 0.4), dirt=0.15),
    'walls': t.textured('walls', 'white-facade.png', 0.85, 0.85, shade=1.3),
    'glass': t.textured('glass', 'glass-curtain-wall.png', 0.8, 0.8, rough=0.15, shade=0.6),
    'roof': t.mottled('roof', 'e8e6e0', 'd4d2cc', 14),
    'rim': t.plain('rim', 'c8c6c0', 0.6),
    'red': t.plain('red', 'd82020', 0.6),
    'white': t.plain('white', 'f4f4f0', 0.6),
    'pad': t.plain('pad', '5a5c60', 0.7),
    'line': t.plain('line', 'ecebe6', 0.8),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
}

# --- ground: lawn, the forecourt and drive round to the entrance, and the car park ---
t.box(0, 0, -0.05, 3, 3, 0, M['lawn'], name='lawn')
t.box(0.2, 0.15, 0, 2.2, 0.75, 0.003, M['paving'], name='forecourt')
t.box(2.25, 0.2, 0, 2.85, 1.9, 0.004, M['asphalt'], name='car_park')
t.parking_row(2.5, 0.3, 8, 'y', -1, ['car-03', None, 'car-12', 'car-08', None, 'car-15', 'car-02', None],
              M['line'], rng, bay=0.19, depth=0.24)
t.parking_row(2.6, 0.3, 8, 'y', +1, [None, 'car-19', 'car-05', None, None, 'car-10', None, 'car-16'],
              M['line'], rng, bay=0.19, depth=0.24)

# --- the hospital: a long block along the south and a wing running north from its middle ---
south = [(0.25, 0.8), (2.1, 0.8), (2.1, 1.45), (0.25, 1.45)]
wing = [(0.85, 1.45), (1.5, 1.45), (1.5, 2.45), (0.85, 2.45)]
t.building(south, 0.36, M['walls'], M['roof'], M['rim'])
t.building(wing, 0.26, M['walls'], M['roof'], M['rim'])
# the entrance: a glass porch over the forecourt, with two ambulances at it
t.box(0.95, 0.55, 0, 1.4, 0.8, 0.12, M['glass'], M['roof'], name='porch')
t.car('car-13', 0.75, 0.42, 90)
t.car('car-06', 1.65, 0.42, 90)

# the red cross on the main roof, and the helicopter pad on the wing's
z = 0.362
t.box(0.97, 0.88, z, 1.38, 1.37, z + 0.006, M['white'], name='cross_ground')
# one outline, since two bars overlapping at one height would render a dark square where they cross
a0, a1, b0, b1 = 1.13, 1.22, 1.08, 1.17   # the vertical bar's x and the horizontal bar's y
t.prism([(a0, 0.92), (a1, 0.92), (a1, b0), (1.35, b0), (1.35, b1), (a1, b1), (a1, 1.33), (a0, 1.33),
         (a0, b1), (1.0, b1), (1.0, b0), (a0, b0)], z + 0.006, z + 0.01, M['red'], name='cross')
zw = 0.262
t.cylinder(1.175, 2.05, zw, zw + 0.006, 0.24, M['pad'], 40)
t.cylinder(1.175, 2.05, zw + 0.006, zw + 0.008, 0.22, M['white'], 40)
t.cylinder(1.175, 2.05, zw + 0.006, zw + 0.009, 0.2, M['pad'], 40)
t.zone_letter('H', 1.175, 2.05, zw + 0.009, 0.2, M['white'], thickness=0.004)
t.roof_clutter([(0.35, 0.9, 0.95, 1.38), (1.45, 0.9, 2.0, 1.38)], z, rng, M['unit'], M['fan'], count=4,
               avoid=[(0.95, 0.86, 1.4, 1.39)])

# --- trees round the lawns ---
spots = [(0.2, 1.9), (0.35, 2.6), (0.2, 2.25), (1.85, 1.75), (2.0, 2.45), (1.75, 2.75), (2.6, 2.4),
         (2.75, 2.75), (0.6, 2.75)]
for x, y in spots:
    size = rng.uniform(0.24, 0.32)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(rng.choice(['plant-01', 'plant-03', 'plant-06', 'plant-09', 'plant-13']), x, y, size,
           rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
