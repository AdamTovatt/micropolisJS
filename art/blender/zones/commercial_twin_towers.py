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

# A 3x3 commercial zone: two blue glass office towers side by side on a paved plaza, with a low
# block in front of each and a row of trees between them.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(27)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.3, 0.3), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'glass': t.textured('glass', 'glass-curtain-wall.png', 0.55, 0.55, rough=0.25, shade=0.6),
    'stone': t.textured('stone', 'concrete-facade.png', 0.45, 0.4, shade=1.2),
    'roof': t.textured('roof', 'roof-membrane.png', 1.0, 1.0, shade=1.15),
    'rim': t.plain('rim', 'd8d6cf', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
    'skylight': t.textured('skylight', 'glass-curtain-wall.png', 0.2, 0.2, rough=0.2, shade=0.8),
}

# --- ground: a plaza, with lawn strips on the west and east edges ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.2, 0, 0.12, 2.8, 0.004, M['grass'], name='verge_west')
t.box(2.88, 0.2, 0, 3.0, 2.8, 0.004, M['grass'], name='verge_east')


def tower(x0, y0, x1, y1, h):
    # a glass tower with light trim down its corners, and a parapet
    t.box(x0, y0, 0, x1, y1, h, M['glass'], M['roof'], name='tower')
    e = 0.012
    for (cx, cy) in [(x0, y0), (x1, y0), (x0, y1)]:
        t.box(cx - e, cy - e, 0, cx + e, cy + e, h, M['rim'], name='corner_trim')
    t.parapet([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], h, M['rim'])


H = 1.05
WEST = (0.3, 0.85, 0.98, 2.2)
EAST = (1.36, 0.85, 2.08, 2.2)
tower(*WEST, H)
tower(*EAST, H)
t.zone_letter('C', 0.64, 1.95, H + 0.002, 0.34, M['paint'])
t.roof_clutter([(0.34, 0.9, 0.94, 1.7)], H, rng, M['unit'], M['fan'], count=5)
t.roof_clutter([(1.4, 0.9, 1.75, 2.15)], H, rng, M['unit'], M['fan'], count=5, avoid=[(1.82, 1.4, 2.04, 1.7)])
t.box(1.82, 1.4, H, 2.04, 1.7, H + 0.02, M['rim'], M['skylight'], name='skylight')

# --- a low block in front of each tower ---
t.building([(0.2, 0.18), (1.12, 0.18), (1.12, 0.62), (0.2, 0.62)], 0.16, M['stone'], M['roof'], M['rim'])
t.building([(1.3, 0.18), (2.45, 0.18), (2.45, 0.62), (1.3, 0.62)], 0.16, M['stone'], M['roof'], M['rim'])
t.roof_clutter([(0.24, 0.22, 1.08, 0.58)], 0.16, rng, M['unit'], M['fan'], count=3)

# --- trees: a row between the towers' fronts and the low blocks, and along the edges ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(x, 0.73) for x in (0.4, 0.75, 1.5, 1.85, 2.2)] + [(2.65, y) for y in (0.5, 1.0, 1.5, 2.0, 2.5)] +
         [(0.15, 2.85), (0.65, 2.85), (1.2, 2.85), (1.8, 2.88), (2.3, 2.85)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.26)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
