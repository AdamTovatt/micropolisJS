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

# A 3x3 residential zone: two concrete apartment slabs sharing a garden with footpaths and a
# playground, and a car park on the east edge.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(3)

M = {
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.25),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.22, 0.22), dirt=0.2, dirt_scale=3),
    'sand': t.weathered(t.mottled('sand', 'd8b98a', 'c9a774', 30), dirt=0.15),
    'grey_roof': t.textured('grey_roof', 'roof-membrane.png', 0.9, 0.9, shade=1.7),
    'brown_roof': t.textured('brown_roof', 'roof-membrane.png', 0.9, 0.9, tint='e0c39a', shade=1.9),
    'dark_facade': t.textured('dark_facade', 'concrete-facade.png', 0.65, 0.6, shade=0.62),
    'light_facade': t.textured('light_facade', 'concrete-facade.png', 0.65, 0.6, tint='f4efe6'),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
    'play_red': t.plain('play_red', 'c8432f', 0.5),
    'play_yellow': t.plain('play_yellow', 'e0a22a', 0.5),
}

# --- ground: lawn, with footpaths between the blocks (each at its own height, so no two
# surfaces meet at the same level where they cross) ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(0.3, 1.38, 0, 2.2, 1.48, 0.003, M['pavers'], name='path_east_west')
t.box(1.18, 0.97, 0, 1.28, 1.95, 0.004, M['pavers'], name='path_between_blocks')
t.box(0.5, 0.4, 0, 0.78, 0.9, 0.003, M['pavers'], name='patio')
t.box(0.3, 1.48, 0, 0.4, 2.4, 0.004, M['pavers'], name='path_west')

# --- a playground on the lawn west of the middle path ---
t.box(0.5, 1.02, 0, 0.98, 1.32, 0.006, M['sand'], name='sandpit')
t.box(0.6, 1.12, 0.006, 0.74, 1.18, 0.07, M['play_yellow'], name='slide')
t.box(0.82, 1.08, 0.006, 0.86, 1.26, 0.08, M['play_red'], name='swing_frame')

# --- the car park on the east edge: an aisle down the middle, bays either side ---
t.box(2.13, 1.55, 0, 2.97, 2.72, 0.004, M['asphalt'], name='car_park')
parked = random.Random(8)
t.parking_row(2.43, 1.58, 6, 'y', -1, ['car-18', 'car-04', None, 'car-01', 'car-12', 'car-09'],
              M['white_line'], parked, depth=0.27)
t.parking_row(2.67, 1.58, 6, 'y', +1, ['car-11', None, 'car-02', 'car-17', None, 'car-16'],
              M['white_line'], parked, depth=0.27)

# --- the slabs ---
NORTH = [(0.42, 1.95), (1.95, 1.95), (1.95, 2.55), (0.42, 2.55)]
SOUTH = [(0.8, 0.34), (2.54, 0.34), (2.54, 0.97), (0.8, 0.97)]
H = 0.45
t.building(NORTH, H, M['dark_facade'], M['grey_roof'], M['rim'])
t.building(SOUTH, H, M['light_facade'], M['brown_roof'], M['rim'])
t.roof_clutter([(0.42, 1.95, 1.95, 2.55)], H, rng, M['unit'], M['fan'], count=5)
t.zone_letter('R', 1.85, 0.66, H + 0.002, 0.42, M['green_paint'])
t.roof_clutter([(0.8, 0.34, 1.5, 0.97)], H, rng, M['unit'], M['fan'], count=3)

# --- trees and shrubs ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-12', 'plant-13', 'plant-07']
spots = ([(x, 2.88) for x in (0.12, 0.6, 1.1, 1.62, 2.12, 2.6)] +      # north edge
         [(0.1, y) for y in (0.3, 0.8, 1.3, 1.8, 2.3)] +                # west edge
         [(x, 0.1) for x in (1.05, 1.6, 2.15, 2.75)] +                   # south edge
         [(2.85, y) for y in (0.5, 0.95, 1.35)] +                        # east edge, south of the car park
         [(1.65, 1.2), (2.0, 1.25), (0.6, 1.72), (1.7, 1.72)])           # in the garden
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.27, 0.34)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
bushes = ['plant-22', 'plant-26', 'plant-29', 'plant-23', 'plant-24', 'plant-28']
for i, x in enumerate((0.55, 0.85, 1.5, 1.8)):
    t.shrub(bushes[i], x, 1.86, 0.11, 0.04)
for i, x in enumerate((0.95, 1.5, 1.85, 2.2)):
    t.shrub(bushes[(i + 2) % len(bushes)], x, 1.06, 0.11, 0.04)
for i, y in enumerate((0.45, 0.85)):
    t.shrub(bushes[i + 3], 0.42, y, 0.1, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
