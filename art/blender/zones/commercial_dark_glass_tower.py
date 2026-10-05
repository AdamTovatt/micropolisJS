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

# A 3x3 commercial zone: one very tall dark glass office tower on a paved plaza, with a pale roof
# and its letter in blue, a kiosk in the north-west corner and trees round the edge.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(32)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.3, 0.3), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'dark_glass': t.textured('dark_glass', 'glass-curtain-wall.png', 0.5, 0.5, rough=0.25, shade=0.38),
    'pale_roof': t.textured('pale_roof', 'roof-membrane.png', 1.0, 1.0, tint='f0e4cc', shade=2.3),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'blue_paint': t.plain('blue_paint', '2f5fb8', 0.8),
    'kiosk': t.plain('kiosk', 'd9d4c8', 0.7),
}

# --- ground: a plaza, with lawn along the west and south edges ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.0, 0, 0.14, 3.0, 0.004, M['grass'], name='verge_west')
t.box(0.14, 0.0, 0, 3.0, 0.14, 0.003, M['grass'], name='verge_south')

# --- the tower: tall enough that its roof sits in the zone's north-east corner ---
TX0, TY0, TX1, TY1, TH = 0.42, 0.42, 1.8, 1.8, 2.15
t.box(TX0, TY0, 0, TX1, TY1, TH, M['dark_glass'], M['pale_roof'], name='tower')
e = 0.014
for (cx, cy) in [(TX0, TY0), (TX1, TY0), (TX0, TY1)]:
    t.box(cx - e, cy - e, 0, cx + e, cy + e, TH, M['rim'], name='corner_trim')
t.parapet([(TX0, TY0), (TX1, TY0), (TX1, TY1), (TX0, TY1)], TH, M['rim'])
t.zone_letter('C', 1.15, 1.1, TH + 0.002, 0.44, M['blue_paint'])
t.roof_clutter([(TX0 + 0.05, TY0 + 0.05, TX0 + 0.35, TY1 - 0.05)], TH, rng, M['unit'], M['fan'], count=4)

# --- a kiosk, and trees round the edge ---
t.box(0.3, 2.45, 0, 0.6, 2.75, 0.12, M['kiosk'], M['pale_roof'], name='kiosk')
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(0.07, y) for y in (0.4, 1.0, 1.6, 2.2)] + [(x, 0.07) for x in (0.6, 1.2, 1.8, 2.4)] +
         [(2.85, y) for y in (0.5, 1.1)] + [(2.2, 0.55), (0.9, 2.3)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
