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

# A 3x3 residential zone round a white hall with a blue dome: a red-roofed house and a long blue
# block in the north, a long blue block and a small tan one in the south, car parks either side of
# the hall, and the zone's letter standing on the lawn. The reference's crossroads becomes the
# car parks' paved drives, which stop short of the zone's edges.

import os
import random
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(62)

M = {
    'grass': t.weathered(t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2), dirt=0.25, dirt_scale=2),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.2, 0.2), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'blue_facade': t.textured('blue_facade', 'white-facade.png', 0.45, 0.45, tint='9ab0e8', shade=1.4),
    'white_facade': t.textured('white_facade', 'white-facade.png', 0.4, 0.4, shade=1.25),
    'tan_facade': t.textured('tan_facade', 'white-facade.png', 0.45, 0.45, tint='d8b48c', shade=1.2),
    'red_tiles': t.textured('red_tiles', 'slate-roof.png', 0.3, 0.3, tint='ff7a5c', shade=2.2),
    'blue_roof': t.textured('blue_roof', 'roof-membrane.png', 0.8, 0.8, tint='9cb4e8', shade=1.4),
    'tan_roof': t.textured('tan_roof', 'roof-membrane.png', 0.8, 0.8, tint='f0d8b8', shade=1.9),
    'pale_roof': t.textured('pale_roof', 'roof-membrane.png', 0.8, 0.8, tint='f0e4cc', shade=2.1),
    'dome': t.plain('dome', '3f6fc4', 0.35, 0.2),
    'rim': t.plain('rim', 'dcd8ce', 0.6),
    'navy_rim': t.plain('navy_rim', '2c3f78', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'white_line': t.plain('white_line', 'ecebe6', 0.8),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: lawn, the car parks either side of the hall, and the drives between them ---
t.box(0, 0, -0.05, 3, 3, 0, M['grass'], name='ground')
t.prism([(0.2, 0.95), (2.8, 0.95), (2.8, 1.1), (1.6, 1.1), (1.6, 2.05), (2.8, 2.05), (2.8, 2.18), (0.2, 2.18),
         (0.2, 2.05), (1.0, 2.05), (1.0, 1.1), (0.2, 1.1)], 0, 0.003, M['pavers'], name='drives')
parked = random.Random(12)
t.box(0.3, 1.15, 0, 0.95, 2.0, 0.004, M['asphalt'], name='car_park_west')
t.parking_row(0.32, 1.18, 4, 'y', +1, ['car-03', 'car-10', None, 'car-17'], M['white_line'], parked, bay=0.2,
              depth=0.27)
t.parking_row(0.93, 1.18, 4, 'y', -1, [None, 'car-06', 'car-01', None], M['white_line'], parked, bay=0.2,
              depth=0.27)
t.box(2.2, 1.15, 0, 2.75, 2.0, 0.004, M['asphalt'], name='car_park_east')
t.parking_row(2.47, 1.18, 4, 'y', +1, ['car-09', None, 'car-14', 'car-12'], M['white_line'], parked, bay=0.2,
              depth=0.27)

# --- the hall: white walls, a pale roof, and a blue dome ---
HH = 0.3
t.building([(1.08, 1.2), (1.55, 1.2), (1.55, 1.95), (1.08, 1.95)], HH, M['white_facade'], M['pale_roof'], M['rim'])
t.cylinder(1.315, 1.575, HH, HH + 0.04, 0.19, M['white_facade'], 32)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.17, location=(1.315, 1.575, HH + 0.04))
bpy.context.object.data.materials.append(M['dome'])
bpy.ops.object.shade_smooth()
t.cylinder(1.315, 1.575, HH + 0.2, HH + 0.26, 0.012, M['rim'], 8)
t.zone_letter('R', 1.95, 1.58, 0.003, 0.42, M['green_paint'], thickness=0.05)

# --- the north buildings: the red-roofed house and the long blue block ---
t.house(0.3, 2.3, 0.95, 2.78, 0.22, 0.16, M['tan_facade'], M['red_tiles'], hip=True)
NB = [(1.15, 2.3), (2.5, 2.3), (2.5, 2.78), (1.15, 2.78)]
t.prism(NB, 0, 0.26, M['blue_facade'], M['blue_roof'])
t.parapet(NB, 0.26, M['navy_rim'])
t.roof_clutter([(1.2, 2.34, 2.46, 2.74)], 0.26, rng, M['unit'], M['fan'], count=4)

# --- the south buildings: the long blue block and the small tan one ---
SB = [(0.32, 0.25), (1.8, 0.25), (1.8, 0.75), (0.32, 0.75)]
t.prism(SB, 0, 0.26, M['blue_facade'], M['blue_roof'])
t.parapet(SB, 0.26, M['navy_rim'])
t.roof_clutter([(0.36, 0.29, 1.76, 0.71)], 0.26, rng, M['unit'], M['fan'], count=4)
t.building([(2.1, 0.25), (2.58, 0.25), (2.58, 0.78), (2.1, 0.78)], 0.24, M['tan_facade'], M['tan_roof'], M['rim'])
t.roof_clutter([(2.14, 0.29, 2.54, 0.74)], 0.24, rng, M['unit'], M['fan'], count=1)

# --- hedges and trees ---
for (x, y) in [(1.2, 1.05), (1.45, 1.05), (1.75, 1.3), (1.75, 1.85)]:
    t.shrub('plant-' + str(rng.choice((22, 23, 24, 26))), x, y, 0.13, 0.04)
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(0.07, y) for y in (0.35, 0.85, 1.4, 1.95, 2.5)] + [(x, 2.9) for x in (0.35, 1.05, 1.7, 2.35)] +
         [(2.9, y) for y in (0.4, 1.3, 1.9, 2.6)] + [(x, 0.08) for x in (0.6, 1.3, 2.0)] +
         [(1.95, 0.5), (2.0, 2.65), (1.05, 2.55)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.31)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
