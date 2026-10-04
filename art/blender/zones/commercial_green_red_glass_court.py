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

# A 3x3 commercial zone: a green-trimmed office block in an L along the west and north, a blue glass
# block in the south-east, a red brick block in the south-west corner, and a garden of trees in
# the court between them.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(18)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.3, 0.3), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'garden': t.textured('garden', 'lawn-grass.png', 0.25, 0.25, shade=1.3),
    'pale_green': t.textured('pale_green', 'white-facade.png', 0.45, 0.45, tint='a9d4b4', shade=1.0),
    'glass': t.textured('glass', 'glass-curtain-wall.png', 0.45, 0.45, rough=0.25, shade=0.6),
    'brick': t.textured('brick', 'brick-facade.png', 0.45, 0.45, tint='ff8c78', shade=2.0),
    'roof': t.textured('roof', 'roof-membrane.png', 1.0, 1.0, shade=1.25),
    'green_rim': t.plain('green_rim', '3f7a4f', 0.6),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
}

# --- ground: a lawn, a path round the buildings, the garden court ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(0.15, 0.12, 0, 2.85, 2.85, 0.003, M['pavers'], name='plaza')
t.box(0.88, 1.55, 0, 1.45, 2.15, 0.005, M['garden'], name='court')

# --- the buildings ---
L_BLOCK = [(0.35, 0.95), (0.85, 0.95), (0.85, 2.18), (2.4, 2.18), (2.4, 2.72), (0.35, 2.72)]
t.building(L_BLOCK, 0.36, M['pale_green'], M['roof'], M['green_rim'])
t.roof_clutter([(0.39, 1.0, 0.81, 2.1), (0.9, 2.22, 2.36, 2.68)], 0.36, rng, M['unit'], M['fan'], count=4)
t.building([(1.5, 0.3), (2.4, 0.3), (2.4, 1.6), (1.5, 1.6)], 0.42, M['glass'], M['roof'], M['rim'])
t.zone_letter('C', 1.95, 0.95, 0.422, 0.42, M['paint'])
t.roof_clutter([(1.54, 1.35, 2.36, 1.56)], 0.42, rng, M['unit'], M['fan'], count=2)
t.building([(0.35, 0.25), (1.45, 0.25), (1.45, 0.88), (0.35, 0.88)], 0.26, M['brick'], M['roof'], M['rim'])
t.roof_clutter([(0.39, 0.29, 1.41, 0.84)], 0.26, rng, M['unit'], M['fan'], count=3)

# --- trees in the court and round the edge ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(1.0, 1.7), (1.3, 1.95), (1.05, 2.05), (1.3, 1.62), (1.15, 1.25)] +
         [(0.07, y) for y in (0.5, 1.2, 1.9, 2.6)] + [(2.88, y) for y in (0.5, 1.2, 1.9, 2.6)] +
         [(x, 0.06) for x in (0.6, 1.4, 2.2)] + [(x, 2.9) for x in (0.6, 1.4, 2.2)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.18, 0.25)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
