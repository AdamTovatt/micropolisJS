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

# A 3x3 commercial zone: a strip of shops across the north with a blue fascia, a small shop in the
# north-west, a wide car park with the zone's letter painted on it, and a small white office with a
# blue sign on bare ground in the south.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(27)

M = {
    'soil': t.weathered(t.textured('soil', 'bare-soil.png', 0.9, 0.9, shade=1.15), dirt=0.2, dirt_scale=2),
    'meadow': t.textured('meadow', 'wild-meadow.png', 1.4, 1.4, tint='c8f08c', shade=1.15),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'facade': t.textured('facade', 'concrete-facade.png', 0.8, 0.8, tint='dcd8d0', shade=1.1),
    'white_facade': t.textured('white_facade', 'white-facade.png', 0.8, 0.8, shade=1.2),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.0),
    'pale_roof': t.textured('pale_roof', 'roof-membrane.png', 0.8, 0.8, tint='f0e4cc', shade=2.1),
    'fascia': t.plain('fascia', '2f5fb8', 0.6),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'paint': t.plain('paint', 'e8e6e0', 0.9),
}

# --- ground: bare earth with some meadow, a paved walk along the shops, the car park ---
t.box(0, 0, -0.05, 3, 3, 0, M['soil'], name='soil')
for (cx, cy, rx, ry) in [(0.35, 0.35, 0.25, 0.2), (2.6, 0.3, 0.25, 0.18), (0.25, 2.65, 0.15, 0.2)]:
    t.prism(t.patch(cx, cy, rx, ry, rng), 0, 0.002, M['meadow'], name='grass_left')
t.box(0.2, 2.18, 0, 2.85, 2.32, 0.003, M['pavers'], name='walk')
t.box(0.22, 0.95, 0, 2.85, 2.18, 0.004, M['asphalt'], name='car_park')
t.zone_letter('C', 2.1, 1.6, 0.004, 0.45, M['paint'], thickness=0.004)
parked = random.Random(17)
t.parking_row(1.1, 2.16, 8, 'x', -1, ['car-04', 'car-11', None, 'car-16', 'car-02', 'car-07', None, 'car-08'],
              M['white_line'], parked, bay=0.2, depth=0.27)
t.parking_row(0.26, 1.0, 5, 'y', +1, ['car-18', None, 'car-05', 'car-09', None], M['white_line'], parked,
              bay=0.2, depth=0.27)
t.parking_row(0.75, 1.6, 4, 'x', -1, ['car-13', 'car-01', None, 'car-15'], M['white_line'], parked,
              bay=0.2, depth=0.27)
t.parking_row(0.75, 1.6, 4, 'x', +1, [None, 'car-06', 'car-03', None], M['white_line'], parked, bay=0.2,
              depth=0.27)
t.parking_row(0.75, 0.98, 9, 'x', +1, ['car-12', None, 'car-10', 'car-19', None, None, 'car-21', 'car-14', None],
              M['white_line'], parked, bay=0.2, depth=0.27)

# --- the strip of shops, with a blue fascia along its front ---
SH = 0.26
S = [(0.95, 2.35), (2.75, 2.35), (2.75, 2.72), (0.95, 2.72)]
t.building(S, SH, M['facade'], M['roof'], M['rim'])
t.box(0.95, 2.33, 0.16, 2.75, 2.35, 0.22, M['fascia'], name='fascia')
t.roof_clutter([(1.0, 2.4, 2.7, 2.68)], SH, rng, M['unit'], M['fan'], count=5)

# --- the small shop in the north-west ---
t.building([(0.32, 2.38), (0.85, 2.38), (0.85, 2.75), (0.32, 2.75)], 0.2, M['facade'], M['pale_roof'], M['rim'])
t.roof_clutter([(0.36, 2.42, 0.81, 2.71)], 0.2, rng, M['unit'], M['fan'], count=1)

# --- the small office on the bare ground in the south ---
O = [(1.7, 0.42), (2.45, 0.42), (2.45, 0.82), (1.7, 0.82)]
t.building(O, 0.2, M['white_facade'], M['pale_roof'], M['rim'])
t.box(1.85, 0.4, 0.12, 2.3, 0.42, 0.17, M['fascia'], name='sign')
t.box(1.35, 0.45, 0, 1.6, 0.6, 0.08, M['white_facade'], M['pale_roof'], name='cabin')

# --- trees on the bare ground ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
for i, (x, y) in enumerate([(0.3, 0.3), (0.75, 0.55), (2.65, 0.35), (1.15, 0.2), (0.12, 2.1), (2.92, 1.5)]):
    size = rng.uniform(0.22, 0.29)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
