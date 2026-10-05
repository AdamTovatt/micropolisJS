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

# A 3x3 commercial zone: a tall dark blue glass office in the west, with two lower stone wings to
# its east, one with a skylight, and a small garden court between the wings.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(15)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.3, 0.3), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'glass': t.textured('glass', 'glass-curtain-wall.png', 0.5, 0.5, rough=0.25, shade=0.45),
    'stone': t.textured('stone', 'concrete-facade.png', 0.45, 0.4, tint='e8e2d6', shade=1.3),
    'roof': t.textured('roof', 'roof-membrane.png', 1.0, 1.0, shade=1.2),
    'skylight': t.textured('skylight', 'glass-curtain-wall.png', 0.2, 0.2, rough=0.2, shade=0.8),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
}

# --- ground: a plaza, a lawn strip round the edge, and the garden court between the wings ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(0.18, 0.15, 0, 2.82, 2.8, 0.003, M['pavers'], name='plaza')
t.box(1.62, 1.72, 0, 2.45, 1.98, 0.005, M['grass'], name='court')

# --- the tower ---
TX0, TY0, TX1, TY1, TH = 0.32, 0.4, 1.26, 2.4, 1.05
t.box(TX0, TY0, 0, TX1, TY1, TH, M['glass'], M['roof'], name='tower')
e = 0.012
for (cx, cy) in [(TX0, TY0), (TX1, TY0), (TX0, TY1)]:
    t.box(cx - e, cy - e, 0, cx + e, cy + e, TH, M['rim'], name='corner_trim')
t.parapet([(TX0, TY0), (TX1, TY0), (TX1, TY1), (TX0, TY1)], TH, M['rim'])
t.zone_letter('C', 0.79, 1.4, TH + 0.002, 0.42, M['paint'])
t.cylinder(0.79, 2.05, TH, TH + 0.06, 0.07, M['unit'], 20)
t.roof_clutter([(0.36, 0.45, 1.22, 0.95)], TH, rng, M['unit'], M['fan'], count=3)

# --- the wings ---
t.building([(1.36, 2.02), (2.42, 2.02), (2.42, 2.55), (1.36, 2.55)], 0.26, M['stone'], M['roof'], M['rim'])
t.roof_clutter([(1.4, 2.06, 2.38, 2.51)], 0.26, rng, M['unit'], M['fan'], count=4)
t.building([(1.36, 0.42), (2.48, 0.42), (2.48, 1.66), (1.36, 1.66)], 0.32, M['stone'], M['roof'], M['rim'])
t.box(1.7, 0.9, 0.32, 1.98, 1.2, 0.34, M['rim'], M['skylight'], name='skylight')
t.roof_clutter([(1.4, 0.46, 2.44, 0.85), (2.05, 0.9, 2.44, 1.62)], 0.32, rng, M['unit'], M['fan'], count=3)

# --- trees round the edge, and shrubs in the court ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(x, 0.07) for x in (0.4, 1.0, 1.6, 2.2, 2.8)] + [(2.88, y) for y in (0.7, 1.3, 1.9, 2.5)] +
         [(0.07, y) for y in (0.8, 1.5, 2.2)] + [(0.3, 2.88), (1.0, 2.88), (1.7, 2.88), (2.4, 2.88)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.17, 0.22)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
for i, x in enumerate((1.72, 1.92, 2.12, 2.32)):
    t.shrub(['plant-22', 'plant-26', 'plant-24', 'plant-28'][i], x, 1.85, 0.11, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
