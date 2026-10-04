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

# A 3x3 residential zone on rough ground: a blue block with a hipped roof over its north end, a long
# green house with a gable roof, a small car park between them, and woods to the south with a
# playground in a clearing.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(24)

M = {
    'meadow': t.weathered(t.textured('meadow', 'wild-meadow.png', 1.4, 1.4, shade=1.1), dirt=0.2, dirt_scale=1.5),
    'soil': t.weathered(t.textured('soil', 'bare-soil.png', 0.9, 0.9, shade=1.1), dirt=0.15),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'sand': t.textured('sand', 'play-sand.png', 0.3, 0.3),
    'blue_facade': t.textured('blue_facade', 'white-facade.png', 0.45, 0.45, tint='9ab0e8', shade=1.4),
    'green_facade': t.textured('green_facade', 'white-facade.png', 0.45, 0.45, tint='7fb08a', shade=1.0),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.35),
    'blue_slate': t.textured('blue_slate', 'slate-roof.png', 0.35, 0.35, tint='8fa6e8', shade=1.3),
    'green_metal': t.textured('green_metal', 'slate-roof.png', 0.3, 0.3, tint='8ad49a', shade=1.6),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
    'play_red': t.plain('play_red', 'c8432f', 0.5),
    'play_yellow': t.plain('play_yellow', 'e0a22a', 0.5),
}

# --- ground: rough meadow with worn soil round the buildings and the car park ---
t.box(0, 0, -0.05, 3, 3, 0, M['meadow'], name='meadow')
t.prism([(0.15, 0.95), (2.75, 0.85), (2.85, 2.85), (0.15, 2.85)], 0, 0.002, M['soil'], name='worn_ground')
t.box(0.95, 1.5, 0, 1.75, 2.6, 0.004, M['asphalt'], name='car_park')
parked = random.Random(3)
t.parking_row(1.2, 1.55, 5, 'y', -1, ['car-12', 'car-02', None, 'car-18', None], M['white_line'], parked,
              depth=0.24)
t.parking_row(1.48, 1.55, 5, 'y', +1, [None, 'car-09', None, None, 'car-04'], M['white_line'], parked, depth=0.24)
t.box(0.35, 0.2, 0, 0.95, 0.65, 0.006, M['sand'], name='sandpit')
t.box(0.5, 0.35, 0.006, 0.62, 0.41, 0.06, M['play_yellow'], name='slide')
t.box(0.75, 0.45, 0.006, 0.79, 0.6, 0.07, M['play_red'], name='swing_frame')

# --- the blue block: flat-roofed in the south with the zone's letter, hipped over its north end ---
t.building([(0.28, 1.05), (0.85, 1.05), (0.85, 2.0), (0.28, 2.0)], 0.32, M['blue_facade'], M['roof'], M['rim'])
t.house(0.28, 2.0, 0.85, 2.62, 0.32, 0.16, M['blue_facade'], M['blue_slate'], hip=True)
t.zone_letter('R', 0.565, 1.5, 0.322, 0.36, M['green_paint'])

# --- the green house: long, with a gable roof whose ridge runs north to south ---
t.house(1.95, 1.25, 2.55, 2.65, 0.26, 0.17, M['green_facade'], M['green_metal'], ridge='y')

# --- woods across the south, trees along the north and east edges ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13', 'plant-04']
spots = ([(1.25, 0.25), (1.6, 0.6), (1.95, 0.25), (2.3, 0.65), (2.65, 0.3), (1.2, 0.95), (2.0, 0.95),
          (0.2, 0.85), (2.8, 1.2)] + [(x, 2.88) for x in (0.35, 1.0, 1.6, 2.2, 2.75)] + [(2.85, y) for y in (1.8, 2.4)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.33)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
