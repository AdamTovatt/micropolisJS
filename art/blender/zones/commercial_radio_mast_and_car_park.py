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

# A 3x3 commercial zone: a red and white lattice radio mast on rough ground in the north-west, an
# office block with a grid of skylights in the south-west, a blue store in the north-east, and a
# car park with the zone's letter painted large across it.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(21)

M = {
    'soil': t.weathered(t.textured('soil', 'bare-soil.png', 0.9, 0.9, shade=1.15), dirt=0.2, dirt_scale=2),
    'meadow': t.textured('meadow', 'wild-meadow.png', 1.4, 1.4, tint='c8f08c', shade=1.15),
    'concrete': t.weathered(t.textured('concrete', 'paving-slabs.png', 0.35, 0.35, shade=1.1), dirt=0.2, dirt_scale=3),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'office_facade': t.textured('office_facade', 'white-facade.png', 0.4, 0.4, tint='ece4d4', shade=1.2),
    'blue_facade': t.textured('blue_facade', 'white-facade.png', 0.45, 0.45, tint='6f8ee0', shade=1.1),
    'roof': t.textured('roof', 'roof-membrane.png', 0.9, 0.9, shade=1.3),
    'dark_roof': t.textured('dark_roof', 'roof-membrane.png', 0.8, 0.8, shade=0.7),
    'skylight': t.textured('skylight', 'glass-curtain-wall.png', 0.15, 0.15, rough=0.2, shade=0.7),
    'rim': t.plain('rim', 'dedad0', 0.6),
    'blue_rim': t.plain('blue_rim', '2f56b8', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'paint': t.plain('paint', 'e8e6e0', 0.9),
    'mast_red': t.plain('mast_red', 'c23a2c', 0.5, 0.4),
    'mast_white': t.plain('mast_white', 'e8e6e2', 0.5, 0.4),
    'dish': t.plain('dish', 'dcdcd8', 0.4, 0.2),
}

# --- ground: rough ground in the north-west, paving and the car park in the south and east ---
t.box(0, 0, -0.05, 3, 3, 0, M['soil'], name='soil')
for (cx, cy, rx, ry) in [(1.2, 2.68, 0.35, 0.2), (2.68, 2.2, 0.2, 0.45), (0.25, 1.75, 0.15, 0.12)]:
    t.prism(t.patch(cx, cy, rx, ry, rng), 0, 0.002, M['meadow'], name='grass_left')
t.box(0.1, 0.1, 0, 2.9, 1.65, 0.003, M['pavers'], name='paving')
t.box(1.38, 0.18, 0, 2.86, 1.6, 0.004, M['concrete'], name='car_park')
t.zone_letter('C', 2.05, 0.98, 0.004, 0.62, M['paint'], thickness=0.004)
parked = random.Random(5)
t.parking_row(1.45, 0.2, 7, 'x', +1, ['car-04', 'car-11', None, 'car-16', 'car-02', None, 'car-08'],
              M['white_line'], parked, depth=0.27)
t.parking_row(2.84, 0.6, 5, 'y', -1, ['car-13', None, 'car-07', 'car-01', None], M['white_line'], parked,
              depth=0.27)
t.box(0.12, 0.15, 0, 0.42, 1.55, 0.005, M['asphalt'], name='parking_west')
t.parking_row(0.14, 0.2, 7, 'y', +1, [None, 'car-18', 'car-05', None, 'car-09', 'car-15', None],
              M['white_line'], parked, depth=0.26)

# --- the office block, its roof a grid of skylights ---
OH = 0.6
O = [(0.5, 0.25), (1.25, 0.25), (1.25, 1.35), (0.5, 1.35)]
t.building(O, OH, M['office_facade'], M['roof'], M['rim'])
for i in range(3):
    for j in range(5):
        x, y = 0.6 + i * 0.21, 0.36 + j * 0.2
        t.box(x, y, OH, x + 0.13, y + 0.12, OH + 0.025, M['rim'], M['skylight'], name='skylight')

# --- the blue store, with the letter on its dark roof ---
SH = 0.26
S = [(1.55, 2.05), (2.55, 2.05), (2.55, 2.68), (1.55, 2.68)]
t.prism(S, 0, SH, M['blue_facade'], M['dark_roof'])
t.parapet(S, SH, M['blue_rim'])
t.zone_letter('C', 2.05, 2.37, SH + 0.002, 0.4, M['paint'])
t.box(1.3, 1.95, 0, 1.52, 2.75, 0.003, M['asphalt'], name='store_bays')
t.parking_row(1.3, 2.0, 4, 'y', +1, ['car-21', 'car-06', None, 'car-14'], M['white_line'], parked, depth=0.22)

# --- the radio mast: four legs tapering to a point, braced, in red and white bands ---
MX, MY, MH, BASE, BANDS = 0.45, 2.0, 1.35, 0.17, 7
corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]


def leg_point(k, f):
    half = BASE * (1 - 0.8 * f)
    return (MX + corners[k][0] * half, MY + corners[k][1] * half, MH * f)


for b in range(BANDS):
    f0, f1 = b / BANDS, (b + 1) / BANDS
    paint = M['mast_red'] if b % 2 == 0 else M['mast_white']
    for k in range(4):
        t.strut(leg_point(k, f0), leg_point(k, f1), 0.009, paint)
        n = (k + 1) % 4
        t.strut(leg_point(k, f0), leg_point(n, f1), 0.004, paint, 6)
        t.strut(leg_point(n, f0), leg_point(k, f1), 0.004, paint, 6)
        t.strut(leg_point(k, f1), leg_point(n, f1), 0.004, paint, 6)
t.strut((MX, MY, MH * 0.98), (MX, MY, MH + 0.12), 0.006, M['mast_white'])
for (f, dx, dy) in [(0.62, 1, 0), (0.62, 0, -1), (0.8, -1, 0), (0.8, 0, 1)]:
    half = BASE * (1 - 0.8 * f)
    cx, cy = MX + dx * (half + 0.03), MY + dy * (half + 0.03)
    t.strut((cx - dx * 0.012, cy - dy * 0.012, MH * f), (cx + dx * 0.012, cy + dy * 0.012, MH * f), 0.045,
            M['dish'], 20)
t.box(0.8, 1.88, 0, 1.02, 2.1, 0.1, M['office_facade'], M['roof'], name='equipment_hut')

# --- bushes on the rough ground, trees along the north edge ---
for (x, y) in [(0.2, 2.6), (1.15, 2.6), (0.25, 1.95), (1.05, 2.3)]:
    t.shrub('plant-' + str(rng.choice((22, 23, 24, 26, 28))), x, y, rng.uniform(0.1, 0.14), 0.04)
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
for i, (x, y) in enumerate([(1.85, 2.9), (2.45, 2.9), (2.9, 2.6), (2.9, 2.0), (0.15, 2.9), (2.9, 1.75)]):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
