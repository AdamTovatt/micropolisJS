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

# A 3x3 commercial zone: a tall white office tower standing on a wide podium whose roof is a row of
# white pyramids along its west and south sides, on a plaza with trees along the north and south.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(31)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.25, 0.25), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'facade': t.textured('facade', 'white-facade.png', 0.8, 0.8, shade=1.25),
    'podium': t.textured('podium', 'glass-curtain-wall.png', 0.3, 0.3, rough=0.25, shade=0.55),
    'pyramid': t.mottled('pyramid', 'eef0f2', 'c8ccd0', scale=30, rough=0.4),
    'roof': t.textured('roof', 'roof-membrane.png', 0.9, 0.9, tint='e6e8ea', shade=2.2),
    'rim': t.plain('rim', 'eceae4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'paint': t.plain('paint', 'ece8de', 0.9),
}

# --- ground: a plaza, lawn along the west and east edges ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.0, 0, 0.18, 3.0, 0.004, M['grass'], name='verge_west')
t.box(2.82, 0.0, 0, 3.0, 3.0, 0.004, M['grass'], name='verge_east')

# --- the podium, roofed with white pyramids where the tower does not stand ---
PH = 0.2
P = [(0.32, 0.4), (2.6, 0.4), (2.6, 2.45), (0.32, 2.45)]
t.building(P, PH, M['podium'], M['roof'], M['rim'])
cell = 0.4
for j in range(5):
    y = 0.45 + j * cell
    t.pitched_roof(0.38, y, 0.38 + cell - 0.04, y + cell - 0.04, PH, 0.22, M['pyramid'], hip=True, overhang=0)
for i in range(1, 5):
    x = 0.38 + i * cell + 0.04
    t.pitched_roof(x, 0.45, x + cell - 0.04, 0.45 + cell - 0.04, PH, 0.22, M['pyramid'], hip=True, overhang=0)

# --- the tower ---
TH = 1.5
T = [(0.92, 1.3), (2.1, 1.3), (2.1, 2.25), (0.92, 2.25)]
t.prism(T, PH, TH, M['facade'], M['roof'])
t.parapet(T, TH, M['rim'])
t.zone_letter('C', 1.55, 1.8, TH + 0.002, 0.44, M['paint'])
t.roof_clutter([(0.97, 1.35, 1.25, 2.2)], TH, rng, M['unit'], M['fan'], count=3)

# --- trees along the north and south edges and the verges ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(x, 0.15) for x in (0.6, 1.1, 1.6, 2.1, 2.6)] + [(x, 2.75) for x in (0.3, 0.8, 1.3)] +
         [(0.09, y) for y in (0.5, 1.2, 1.9, 2.6)] + [(2.91, y) for y in (0.5, 1.2)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
