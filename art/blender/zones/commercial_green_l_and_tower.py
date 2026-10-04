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

# A 3x3 commercial zone: a pale green office block in an L down the west side, a green glass tower
# in the north-east where the L's arm meets it, and a low green block south of the tower.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(25)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.3, 0.3), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'pale_green': t.textured('pale_green', 'white-facade.png', 0.45, 0.45, tint='a9d4b4', shade=1.0),
    'green_glass': t.textured('green_glass', 'glass-curtain-wall.png', 0.5, 0.5, rough=0.25, shade=0.75,
                              hue=-0.2),
    'roof': t.textured('roof', 'roof-membrane.png', 1.0, 1.0, shade=1.25),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
}

# --- ground: a lawn, a plaza round the buildings ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(0.2, 0.2, 0, 2.75, 2.78, 0.003, M['pavers'], name='plaza')

# --- the L block ---
L_BLOCK = [(0.3, 0.35), (0.95, 0.35), (0.95, 2.1), (1.25, 2.1), (1.25, 2.62), (0.3, 2.62)]
t.building(L_BLOCK, 0.38, M['pale_green'], M['roof'], M['rim'])
t.roof_clutter([(0.34, 0.4, 0.91, 2.0)], 0.38, rng, M['unit'], M['fan'], count=5)

# --- the tower, and the low block south of it ---
TX0, TY0, TX1, TY1, TH = 1.25, 1.18, 2.3, 2.18, 0.75
t.box(TX0, TY0, 0, TX1, TY1, TH, M['green_glass'], M['roof'], name='tower')
e = 0.012
for (cx, cy) in [(TX0, TY0), (TX1, TY0), (TX0, TY1)]:
    t.box(cx - e, cy - e, 0, cx + e, cy + e, TH, M['rim'], name='corner_trim')
t.parapet([(TX0, TY0), (TX1, TY0), (TX1, TY1), (TX0, TY1)], TH, M['rim'])
t.zone_letter('C', 1.8, 1.7, TH + 0.002, 0.4, M['paint'])
t.roof_clutter([(1.3, 1.23, 2.25, 1.45)], TH, rng, M['unit'], M['fan'], count=2)
t.building([(1.68, 0.4), (2.38, 0.4), (2.38, 1.1), (1.68, 1.1)], 0.22, M['pale_green'], M['roof'], M['rim'])
t.roof_clutter([(1.72, 0.44, 2.34, 1.06)], 0.22, rng, M['unit'], M['fan'], count=2)

# --- trees and shrubs ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(x, 0.08) for x in (0.4, 1.0, 1.6, 2.3, 2.85)] + [(2.88, y) for y in (0.7, 1.4, 2.1, 2.7)] +
         [(0.08, y) for y in (0.8, 1.6, 2.4)] + [(0.5, 2.88), (1.3, 2.88), (2.0, 2.88)] + [(1.25, 0.65), (1.3, 0.95)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.17, 0.23)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
for i, y in enumerate((0.5, 0.75, 1.0)):
    t.shrub(['plant-22', 'plant-26', 'plant-24'][i], 1.55, y, 0.1, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
