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

# A 3x3 commercial zone: a tall red brick L block down the west side with a glass pyramid on its
# roof, a lower brick block in the north-east, and a grey office tower in the south-east, with a
# garden between the brick blocks and trees along the edges.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(16)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.25, 0.25), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'brick': t.textured('brick', 'brick-facade.png', 0.9, 0.9, tint='ff8c78', shade=2.0),
    'grey_facade': t.textured('grey_facade', 'concrete-facade.png', 0.5, 0.45, tint='c8ccd4', shade=0.9),
    'roof': t.textured('roof', 'roof-membrane.png', 0.9, 0.9, shade=1.3),
    'grey_roof': t.textured('grey_roof', 'roof-membrane.png', 0.9, 0.9, shade=1.0),
    'skylight': t.textured('skylight', 'glass-curtain-wall.png', 0.2, 0.2, rough=0.2, shade=0.8),
    'rim': t.plain('rim', 'e6e2da', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'paint': t.plain('paint', 'e4e0d6', 0.9),
}

# --- ground: a plaza, a lawn verge down the west side, the garden between the brick blocks ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.0, 0, 0.15, 3.0, 0.004, M['grass'], name='verge_west')
t.box(0.15, 0.0, 0, 3.0, 0.14, 0.003, M['grass'], name='verge_south')
t.box(1.0, 1.62, 0, 1.52, 2.85, 0.004, M['grass'], name='garden')

# --- the brick L block: a narrow north wing, a wide south end ---
LH = 0.8
L = [(0.25, 0.32), (1.3, 0.32), (1.3, 1.45), (0.88, 1.45), (0.88, 2.52), (0.25, 2.52)]
t.building(L, LH, M['brick'], M['roof'], M['rim'])
t.pitched_roof(0.34, 2.12, 0.74, 2.46, LH, 0.12, M['skylight'], hip=True, overhang=0)
t.zone_letter('C', 0.84, 0.88, LH + 0.002, 0.42, M['paint'])
t.roof_clutter([(0.3, 1.5, 0.84, 2.05)], LH, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(0.3, 0.36, 0.55, 1.4)], LH, rng, M['unit'], M['fan'], count=2)

# --- the north-east brick block ---
NH = 0.5
NE = [(1.62, 1.68), (2.48, 1.68), (2.48, 2.52), (1.62, 2.52)]
t.building(NE, NH, M['brick'], M['roof'], M['rim'])
t.zone_letter('C', 2.05, 2.1, NH + 0.002, 0.4, M['paint'])

# --- the grey tower, with a round vent on its roof ---
TH = 1.0
T = [(1.58, 0.32), (2.35, 0.32), (2.35, 1.3), (1.58, 1.3)]
t.building(T, TH, M['grey_facade'], M['grey_roof'], M['rim'])
t.cylinder(2.08, 0.95, TH, TH + 0.05, 0.08, M['unit'], 24)
t.cylinder(2.08, 0.95, TH + 0.05, TH + 0.055, 0.06, M['fan'], 24)
t.roof_clutter([(1.62, 0.36, 2.31, 0.75)], TH, rng, M['unit'], M['fan'], count=3)

# --- trees: along the west verge, in the garden, and along the south and east edges ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(0.07, y) for y in (0.35, 0.95, 1.55, 2.15, 2.75)] + [(x, 0.07) for x in (0.6, 1.4, 2.0, 2.6)] +
         [(2.85, y) for y in (0.5, 1.1, 1.7)] + [(1.12, 2.65), (1.4, 2.35), (1.12, 2.0), (1.4, 1.75)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
