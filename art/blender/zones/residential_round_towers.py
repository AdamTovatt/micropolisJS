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

# A 3x3 residential zone: two round apartment towers in a park, with footpaths between them,
# a small blue-roofed building, and a fenced yard of tanks in the north-east corner.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(34)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.2, dirt_scale=2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2, shade=1.05), dirt=0.2, dirt_scale=3),
    'concrete': t.weathered(t.mottled('concrete', 'b9b5ac', 'a9a59c', 25), dirt=0.15),
    'tower_wall': t.textured('tower_wall', 'concrete-facade.png', 1.0, 0.85, tint='f2efe8', shade=1.35),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.5),
    'blue_roof': t.plain('blue_roof', '3d64a8', 0.5),
    'white_wall': t.plain('white_wall', 'e4e0d6', 0.7),
    'rim': t.plain('rim', 'e8e5de', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'tank': t.plain('tank', 'b8bcbf', 0.35, 0.6),
    'fence': t.plain('fence', '8a8d8f', 0.5, 0.5),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: a lawn, with footpaths (each at its own height, so crossings show no seam) ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='lawn')
t.box(0.15, 0.88, 0, 1.05, 0.98, 0.003, M['pavers'], name='path_west')
t.box(0.95, 0.35, 0, 1.05, 1.6, 0.004, M['pavers'], name='path_middle')
t.box(1.05, 1.5, 0, 1.75, 1.6, 0.003, M['pavers'], name='path_to_hall')
t.box(1.75, 1.5, 0, 1.85, 2.1, 0.004, M['pavers'], name='path_north')
t.box(2.25, 0.9, 0, 2.35, 1.95, 0.003, M['pavers'], name='path_east')

# --- the towers: the north-west one plain on top, the south-east one with the zone's letter ---
H = 1.6
R = 0.4
WEST = (0.65, 1.86)
EAST = (1.72, 0.6)
t.round_building(*WEST, R, H, M['tower_wall'], M['roof'], M['rim'])
t.round_building(*EAST, R, H, M['tower_wall'], M['roof'], M['rim'])
s = R * 0.55  # the square inside each roof that its plant can sit in
t.roof_clutter([(WEST[0] - s, WEST[1] - s, WEST[0] + s, WEST[1] + s)], H, rng, M['unit'], M['fan'], count=5)
t.cylinder(*WEST, H, H + 0.03, 0.09, M['unit'], 24)
t.zone_letter('R', EAST[0], EAST[1] + 0.02, H + 0.002, 0.34, M['green_paint'])
t.roof_clutter([(EAST[0] - s, EAST[1] - s, EAST[0] + s, EAST[1] - 0.2)], H, rng, M['unit'], M['fan'], count=2)

# --- a small hall with a blue roof, and the tank yard ---
t.box(1.5, 1.85, 0, 1.8, 2.2, 0.16, M['white_wall'], M['blue_roof'], name='hall')
t.box(1.95, 2.3, 0, 2.5, 2.88, 0.004, M['concrete'], name='tank_yard')
for (x0, y0, x1, y1) in [(1.95, 2.3, 2.5, 2.31), (1.95, 2.87, 2.5, 2.88), (1.95, 2.3, 1.96, 2.88),
                         (2.49, 2.3, 2.5, 2.88)]:
    t.box(x0, y0, 0, x1, y1, 0.03, M['fence'], name='fence')
for (x, y) in [(2.09, 2.45), (2.35, 2.45), (2.09, 2.72), (2.35, 2.72)]:
    t.cylinder(x, y, 0, 0.07, 0.09, M['tank'], 24)

# --- trees through the park, and shrubs along the paths ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = [(0.3, 2.75), (0.9, 2.82), (0.15, 2.3), (1.45, 2.65), (0.15, 1.3), (0.35, 0.5), (0.2, 0.15),
         (0.75, 0.3), (1.25, 1.2), (1.3, 0.25), (2.7, 0.2), (2.75, 1.0), (2.75, 1.55), (2.8, 2.1),
         (2.75, 2.75), (2.05, 1.7)]
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.32)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
bushes = ['plant-22', 'plant-26', 'plant-29', 'plant-23', 'plant-24', 'plant-28', 'plant-16', 'plant-14']
for i, (x, y) in enumerate([(0.5, 1.08), (0.75, 1.08), (1.15, 0.6), (1.15, 1.75), (2.15, 1.2),
                            (2.15, 1.5), (1.4, 1.4), (0.65, 0.78)]):
    t.shrub(bushes[i], x, y, 0.11, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
