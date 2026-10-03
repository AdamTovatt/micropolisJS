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

# A 3x3 residential zone: a red brick L block down the west side and a blue block to the
# north-east, round a paved square with a tree, a playground and a small car park.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(16)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.2, dirt_scale=2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.22, 0.22), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'sand': t.textured('sand', 'play-sand.png', 0.3, 0.3),
    'red_facade': t.textured('red_facade', 'brick-facade.png', 0.5, 0.5, tint='ff8c78', shade=2.0),
    'blue_facade': t.textured('blue_facade', 'white-facade.png', 0.5, 0.5, tint='8aa2dc', shade=1.05),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.3),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
    'play_red': t.plain('play_red', 'c8432f', 0.5),
    'play_yellow': t.plain('play_yellow', 'e0a22a', 0.5),
    'stone': t.plain('stone', 'bdb6a8', 0.7),
}

# --- ground: a lawn, with a paved square between the blocks ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(0.95, 0.85, 0, 1.85, 2.75, 0.003, M['pavers'], name='square')
t.box(0.95, 0.85, 0, 2.85, 1.0, 0.004, M['pavers'], name='path_east')

# a round bed with a tree in the middle of the square
t.cylinder(1.4, 1.45, 0, 0.03, 0.17, M['stone'], 32)
t.cylinder(1.4, 1.45, 0.03, 0.032, 0.15, M['grass'], 32)

# --- a small car park on the south edge, and a playground in the south-east corner ---
t.box(0.95, 0.1, 0, 1.9, 0.75, 0.004, M['asphalt'], name='car_park')
t.parking_row(1.0, 0.12, 5, 'x', +1, ['car-02', 'car-15', None, 'car-08', 'car-19'], M['white_line'],
              random.Random(4), depth=0.27)
t.box(2.1, 0.15, 0, 2.8, 0.72, 0.006, M['sand'], name='sandpit')
t.box(2.25, 0.3, 0.006, 2.4, 0.36, 0.07, M['play_yellow'], name='slide')
t.box(2.55, 0.45, 0.006, 2.6, 0.62, 0.08, M['play_red'], name='swing_frame')

# --- the blocks ---
RED = [(0.3, 0.3), (0.85, 0.3), (0.85, 1.8), (1.25, 1.8), (1.25, 2.45), (0.3, 2.45)]
BLUE = [(1.88, 1.05), (2.5, 1.05), (2.5, 2.45), (1.7, 2.45), (1.7, 2.0), (1.88, 2.0)]
t.building(RED, 0.5, M['red_facade'], M['roof'], M['rim'])
t.building(BLUE, 0.45, M['blue_facade'], M['roof'], M['rim'])
t.zone_letter('R', 0.58, 1.25, 0.502, 0.4, M['green_paint'])
t.roof_clutter([(0.34, 1.6, 0.81, 2.4)], 0.5, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.34, 0.34, 0.81, 0.95)], 0.5, rng, M['unit'], M['fan'], count=2)
t.roof_clutter([(1.92, 1.1, 2.46, 2.4)], 0.45, rng, M['unit'], M['fan'], count=4)

# --- trees round the edge and in the square ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
t.tree('plant-03', 1.4, 1.45, 0.3)
spots = ([(x, 2.88) for x in (0.2, 0.7, 1.2, 1.7, 2.2, 2.75)] + [(0.1, y) for y in (0.5, 1.1, 1.7, 2.3)] +
         [(2.8, y) for y in (1.3, 1.9, 2.4)] + [(0.4, 0.1), (2.05, 0.9), (1.05, 2.2), (1.6, 2.4)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.3)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
