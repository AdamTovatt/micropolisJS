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

# A 3x3 residential zone of three tall apartment towers on a plaza: two in the north, one with a
# blue cross on its roof and one with a glass pyramid, and a third on a glass podium in the south,
# with parking down the west side and trees along the edges.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(61)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.25, 0.25), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'facade': t.textured('facade', 'concrete-facade.png', 0.5, 0.45, tint='e4e8ee', shade=1.3),
    'glass': t.textured('glass', 'glass-curtain-wall.png', 0.4, 0.4, rough=0.25, shade=0.85),
    'skylight': t.textured('skylight', 'glass-curtain-wall.png', 0.2, 0.2, rough=0.2, shade=0.8),
    'roof': t.textured('roof', 'roof-membrane.png', 0.9, 0.9, tint='e6e8ea', shade=2.3),
    'rim': t.plain('rim', 'eceae4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
    'blue_paint': t.plain('blue_paint', '3a6fd0', 0.8),
}

# --- ground: a plaza, lawn strips along the edges, parking down the west side ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.0, 0, 0.16, 3.0, 0.004, M['grass'], name='verge_west')
t.box(2.84, 0.0, 0, 3.0, 3.0, 0.004, M['grass'], name='verge_east')
t.box(0.16, 0.0, 0, 2.84, 0.14, 0.003, M['grass'], name='verge_south')
t.box(0.18, 0.2, 0, 0.5, 1.55, 0.005, M['asphalt'], name='parking')
t.parking_row(0.2, 0.25, 7, 'y', +1, ['car-02', 'car-15', None, 'car-08', 'car-19', None, 'car-04'],
              M['white_line'], random.Random(8), depth=0.28)


def tower(x0, y0, x1, y1, z0, h):
    t.box(x0, y0, z0, x1, y1, h, M['facade'], M['roof'], name='tower')
    t.parapet([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], h, M['rim'])


# --- the north-west tower, with a blue cross on its roof ---
NH = 0.9
tower(0.3, 1.82, 0.92, 2.5, 0, NH)
t.box(0.53, 2.06, NH, 0.69, 2.26, NH + 0.006, M['blue_paint'], name='cross_ns')
for (x0, y0, x1, y1) in [(0.47, 2.12, 0.53, 2.2), (0.69, 2.12, 0.75, 2.2)]:
    t.box(x0, y0, NH, x1, y1, NH + 0.006, M['blue_paint'], name='cross_ew')
t.roof_clutter([(0.34, 2.3, 0.88, 2.46)], NH, rng, M['unit'], M['fan'], count=2)

# --- the north-east tower, with a glass pyramid over its middle ---
tower(1.42, 1.82, 2.3, 2.5, 0, NH)
t.pitched_roof(1.58, 1.95, 2.14, 2.37, NH, 0.12, M['skylight'], hip=True, overhang=0)

# --- the south tower on its glass podium ---
t.box(0.62, 0.3, 0, 2.15, 1.28, 0.2, M['glass'], M['roof'], name='podium')
t.parapet([(0.62, 0.3), (2.15, 0.3), (2.15, 1.28), (0.62, 1.28)], 0.2, M['rim'])
SH = 0.8
tower(0.85, 0.48, 1.85, 1.2, 0.2, SH)
t.zone_letter('R', 1.25, 0.84, SH + 0.002, 0.4, M['green_paint'])
t.roof_clutter([(1.5, 0.52, 1.81, 1.16)], SH, rng, M['unit'], M['fan'], count=2)

# --- trees along the edges ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(0.07, y) for y in (0.3, 0.9, 1.5, 2.1, 2.7)] + [(2.9, y) for y in (0.3, 0.9, 1.5)] +
         [(x, 0.07) for x in (0.7, 1.3, 1.9, 2.5)] + [(2.55, 0.6), (2.55, 1.2), (1.15, 2.75), (0.15, 2.9)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
