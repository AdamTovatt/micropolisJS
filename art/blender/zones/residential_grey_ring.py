# micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
# Copyright (C) 2026 Adam Tovatt
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

# A 3x3 residential zone: grey apartment blocks of different heights in a ring round a wooded
# courtyard, one with a brown gravel roof, and a path round the outside.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(14)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.2, dirt_scale=2),
    'garden': t.textured('garden', 'lawn-grass.png', 0.25, 0.25, shade=1.3),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.22, 0.22), dirt=0.2, dirt_scale=3),
    'grey_facade': t.textured('grey_facade', 'concrete-facade.png', 0.55, 0.5, shade=1.0),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.2),
    'brown_roof': t.textured('brown_roof', 'roof-membrane.png', 0.8, 0.8, tint='e0c39a', shade=1.9),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: lawn, a path round the ring, the garden inside it ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.prism([(0.1, 0.1), (2.75, 0.1), (2.75, 2.9), (2.62, 2.9), (2.62, 0.22), (0.22, 0.22), (0.22, 2.9),
         (0.1, 2.9)], 0, 0.003, M['pavers'], name='path_round')
t.box(0.85, 1.0, 0, 1.75, 2.45, 0.004, M['garden'], name='garden')

# --- the ring, block by block: (outline, height, roof) ---
blocks = [
    ([(0.4, 2.0), (1.0, 2.0), (1.0, 2.75), (0.4, 2.75)], 0.52, 'roof'),       # north-west
    ([(1.0, 2.45), (1.75, 2.45), (1.75, 2.75), (1.0, 2.75)], 0.32, 'roof'),   # north link
    ([(1.75, 1.6), (2.35, 1.6), (2.35, 2.75), (1.75, 2.75)], 0.52, 'brown_roof'),  # north-east
    ([(1.75, 0.4), (2.35, 0.4), (2.35, 1.6), (1.75, 1.6)], 0.42, 'roof'),     # east
    ([(0.4, 0.4), (1.75, 0.4), (1.75, 1.0), (0.4, 1.0)], 0.45, 'roof'),       # south
    ([(0.4, 1.0), (0.85, 1.0), (0.85, 2.0), (0.4, 2.0)], 0.32, 'roof'),       # west link
]
for outline, height, roof in blocks:
    t.building(outline, height, M['grey_facade'], M[roof], M['rim'])
t.zone_letter('R', 1.25, 0.7, 0.452, 0.4, M['green_paint'])
t.roof_clutter([(0.44, 2.04, 0.96, 2.71)], 0.52, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.44, 0.44, 0.9, 0.96)], 0.45, rng, M['unit'], M['fan'], count=2)
t.roof_clutter([(1.79, 0.44, 2.31, 1.56)], 0.42, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(1.79, 1.64, 2.31, 2.71)], 0.52, rng, M['unit'], M['fan'], count=3)

# --- trees in the courtyard and round the outside ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(1.1, 1.3), (1.45, 1.2), (1.3, 1.65), (1.05, 2.0), (1.5, 2.05)] +
         [(0.05, y) for y in (0.5, 1.2, 1.9, 2.6)] + [(x, 0.05) for x in (0.6, 1.3, 2.0, 2.7)] +
         [(2.85, y) for y in (0.6, 1.3, 2.0, 2.7)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.28)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
