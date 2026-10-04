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

# A 3x3 residential zone: a blue apartment block in an L along the south and east, with a taller
# wing at its west end, and two small houses with hipped roofs, one blue and one red, in the
# garden it encloses.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(23)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.2, dirt_scale=2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.22, 0.22), dirt=0.2, dirt_scale=3),
    'blue_facade': t.textured('blue_facade', 'white-facade.png', 0.5, 0.5, tint='9ab0e8', shade=1.4),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.35),
    'blue_slate': t.textured('blue_slate', 'slate-roof.png', 0.35, 0.35, tint='8fa6e8', shade=1.4),
    'red_tiles': t.textured('red_tiles', 'slate-roof.png', 0.35, 0.35, tint='ff7a5c', shade=2.2),
    'white_wall': t.plain('white_wall', 'e6e2d8', 0.7),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: a lawn, and a path round the outside of the block ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.prism([(0.1, 0.1), (2.85, 0.1), (2.85, 2.9), (2.72, 2.9), (2.72, 0.22), (0.22, 0.22), (0.22, 2.75),
         (0.1, 2.75)], 0, 0.003, M['pavers'], name='path_round')

# --- the block: the tall wing in the west, the L along the south and up the east ---
t.building([(0.3, 0.38), (0.86, 0.38), (0.86, 2.4), (0.3, 2.4)], 1.0, M['blue_facade'], M['roof'], M['rim'])
L_BLOCK = [(0.86, 0.3), (2.6, 0.3), (2.6, 1.85), (1.65, 1.85), (1.65, 0.98), (0.86, 0.98)]
t.building(L_BLOCK, 0.48, M['blue_facade'], M['roof'], M['rim'])
t.zone_letter('R', 2.13, 1.45, 0.482, 0.4, M['green_paint'])
t.roof_clutter([(0.34, 1.4, 0.82, 2.36)], 1.0, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.9, 0.34, 2.56, 0.94)], 0.48, rng, M['unit'], M['fan'], count=4)

# --- two small houses in the garden ---
t.house(1.15, 2.15, 1.6, 2.7, 0.2, 0.12, M['blue_facade'], M['blue_slate'], hip=True)
t.house(1.75, 2.0, 2.4, 2.45, 0.13, 0.1, M['white_wall'], M['red_tiles'], hip=True)

# --- trees in the garden and round the edge ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = [(1.2, 1.6), (1.35, 1.25), (1.1, 1.95), (0.05, 0.6), (0.05, 1.5), (0.05, 2.4), (2.85, 0.6),
         (2.88, 1.35), (2.88, 2.1), (0.6, 2.88), (1.5, 0.08), (2.3, 0.08), (2.5, 2.75)]
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.28)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
