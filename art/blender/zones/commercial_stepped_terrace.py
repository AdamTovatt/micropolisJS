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

# A 3x3 commercial zone: a stone office building that steps down in terraces to the
# south-west from a tower in the north-east corner, with a low wing to the north-west, a
# small block in front, and a paved court on the west side.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(36)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.25, dirt_scale=2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.25, 0.25), dirt=0.2, dirt_scale=3),
    'stone': t.textured('stone', 'concrete-facade.png', 0.42, 0.36, tint='efe6d4', shade=1.4),
    'terrace': t.weathered(t.mottled('terrace', 'cfc7b6', 'bdb5a4', 40), dirt=0.15),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.2),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
}

# --- ground: lawn, a paved court on the west side and a path along the south ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(0.1, 0.9, 0, 0.6, 1.75, 0.003, M['pavers'], name='court')
t.box(0.1, 0.15, 0, 2.7, 0.3, 0.004, M['pavers'], name='path_south')

# --- the tower in the north-east corner ---
TX0, TY0, TX1, TY1, TH = 1.6, 1.6, 2.35, 2.42, 1.15
t.building([(TX0, TY0), (TX1, TY0), (TX1, TY1), (TX0, TY1)], TH, M['stone'], M['roof'], M['rim'])
t.roof_clutter([(TX0 + 0.05, TY0 + 0.05, TX1 - 0.05, TY0 + 0.3)], TH, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(TX1 - 0.18, TY0 + 0.3, TX1 - 0.04, TY1 - 0.05)], TH, rng, M['unit'], M['fan'], count=3)
t.zone_letter('C', TX0 + 0.3, TY1 - 0.24, TH + 0.002, 0.34, M['paint'])

# --- the terraces: each step lower, its front moved out to the south and west ---
STEPS, DX, DY, DH = 8, 0.1, 0.14, 0.125
for i in range(1, STEPS + 1):
    x0 = TX0 - i * DX
    y0 = TY0 - i * DY
    h = TH - i * DH
    # one L-shaped step wrapping the tower's west and south sides
    t.prism([(x0, y0), (TX1, y0), (TX1, TY0 - (i - 1) * DY), (TX0 - (i - 1) * DX, TY0 - (i - 1) * DY),
             (TX0 - (i - 1) * DX, TY1), (x0, TY1)], 0, h, M['stone'], M['terrace'], name='terrace')

# --- a low wing to the north-west, and a small block in front of the terraces ---
# the wing runs east until it meets the lowest step
t.building([(0.25, 2.05), (TX0 - STEPS * DX + 0.02, 2.05), (TX0 - STEPS * DX + 0.02, 2.55), (0.25, 2.55)],
           0.22, M['stone'], M['roof'], M['rim'])
t.building([(0.5, 0.42), (1.0, 0.42), (1.0, 0.85), (0.5, 0.85)], 0.3, M['stone'], M['roof'], M['rim'])
t.roof_clutter([(0.52, 0.44, 0.98, 0.83)], 0.3, rng, M['unit'], M['fan'], count=3)

# --- trees round the edge ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = [(0.2, 2.85), (0.75, 2.85), (1.35, 2.88), (0.12, 0.6), (0.12, 1.95), (2.7, 0.55), (2.85, 1.0),
         (2.85, 1.55), (1.3, 0.08), (2.2, 0.08), (0.35, 0.08)]
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.3)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
bushes = ['plant-22', 'plant-26', 'plant-29', 'plant-23']
for i, y in enumerate((1.0, 1.25, 1.5)):
    t.shrub(bushes[i], 0.68, y, 0.1, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
