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

# A 3x3 commercial zone: a stepped concrete office building to the north, a low store
# to the south-east, a small paved plaza between them, and parking wrapped around the
# west and south.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(11)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.25, dirt_scale=2),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.22, 0.22), dirt=0.2, dirt_scale=3),
    'sand': t.weathered(t.mottled('sand', 'd8b98a', 'c9a774', 30), dirt=0.15),
    'office_facade': t.textured('office_facade', 'concrete-facade.png', 0.5, 0.45, shade=1.3),
    'store_facade': t.textured('store_facade', 'glass-curtain-wall.png', 0.35, 0.35, rough=0.25, shade=0.7),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.5),
    'light_roof': t.textured('light_roof', 'roof-membrane.png', 0.8, 0.8, shade=2.0),
    'rim': t.plain('rim', 'd8d6cf', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
    'slide': t.plain('slide', 'e0a22a', 0.5),
}

# --- ground: the access road in an L round the west and south, and parking off it ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='ground')
t.prism([(0.6, 0.45), (2.75, 0.45), (2.75, 0.72), (0.87, 0.72), (0.87, 2.6), (0.6, 2.6)],
        0, 0.004, M['asphalt'], name='access_road')
t.dashes(0.735, 0.75, 0.735, 2.55, M['white_line'])
t.dashes(0.9, 0.585, 2.7, 0.585, M['white_line'])
t.box(0.22, 0.75, 0, 0.6, 2.2, 0.004, M['asphalt'], name='west_bays')
t.box(0.87, 0.8, 0, 1.18, 1.72, 0.004, M['asphalt'], name='east_bays')
t.box(1.05, 0.15, 0, 2.6, 0.45, 0.004, M['asphalt'], name='south_bays')
parked = random.Random(4)
t.parking_row(0.6, 0.8, 7, 'y', -1, ['car-01', 'car-04', 'car-08', None, 'car-11', 'car-02', 'car-18'],
              M['white_line'], parked, depth=0.35)
t.parking_row(0.87, 0.84, 5, 'y', +1, ['car-05', None, 'car-09', 'car-16', 'car-12'],
              M['white_line'], parked, depth=0.29)
t.parking_row(1.1, 0.45, 8, 'x', -1, ['car-17', None, 'car-03', None, None, 'car-10', None, 'car-19'],
              M['white_line'], parked, depth=0.28)

# --- the office building: a lower podium with the tower stepped back on it ---
t.building([(1.0, 1.95), (2.48, 1.95), (2.48, 2.72), (1.0, 2.72)], 0.32, M['office_facade'], M['roof'], M['rim'])
t.building([(1.12, 2.06), (2.36, 2.06), (2.36, 2.62), (1.12, 2.62)], 0.5, M['office_facade'], M['light_roof'], M['rim'])
t.roof_clutter([(1.16, 2.1, 2.32, 2.58)], 0.5, rng, M['unit'], M['fan'], count=7)
t.box(0.62, 2.62, 0, 0.98, 2.9, 0.1, M['office_facade'], M['light_roof'], name='kiosk')

# --- the store, with its letter ---
STORE = [(1.85, 0.78), (2.6, 0.78), (2.6, 1.6), (1.85, 1.6)]
t.building(STORE, 0.2, M['store_facade'], M['roof'], M['rim'])
t.zone_letter('C', 2.225, 1.19, 0.202, 0.46, M['paint'])
t.roof_clutter([(2.45, 1.4, 2.58, 1.58)], 0.2, rng, M['unit'], M['fan'], count=1)

# --- a paved plaza with a sandpit and a hedge, between the car park and the store ---
t.box(1.22, 0.78, 0, 1.78, 1.85, 0.003, M['pavers'], name='plaza')
t.box(1.36, 0.98, 0, 1.72, 1.5, 0.006, M['sand'], name='sandpit')
t.box(1.48, 1.15, 0.006, 1.62, 1.21, 0.07, M['slide'], name='slide')
t.box(1.4, 1.36, 0.006, 1.46, 1.42, 0.05, M['slide'], name='play_post')
for y in (0.9, 1.1, 1.3, 1.5, 1.7):
    t.shrub('plant-21', 1.27, y, 0.14, 0.04, 90)

# --- trees round the edge ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13', 'plant-10']
spots = ([(0.1, y) for y in (0.35, 0.85, 1.4, 1.95, 2.5)] + [(0.35, 2.75), (2.75, 2.8), (2.4, 2.88)] +
         [(2.85, y) for y in (0.9, 1.4, 1.9, 2.35)] + [(x, 0.08) for x in (0.4, 0.9, 1.45, 2.0, 2.6)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.27, 0.34)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
