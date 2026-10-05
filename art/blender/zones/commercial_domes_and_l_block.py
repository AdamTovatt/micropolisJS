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

# A 3x3 commercial zone: a stone L block across the north and down the east side, with a great grey
# dome over its west end, a low glass hall and a small orange-roofed pavilion in front of it, and a
# blue globe in a garden in the south-west.

import os
import random
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(26)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.25, 0.25), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'facade': t.textured('facade', 'concrete-facade.png', 0.8, 0.8, tint='e0d8c8', shade=1.2),
    'roof': t.textured('roof', 'roof-membrane.png', 0.9, 0.9, shade=1.2),
    'glass': t.textured('glass', 'glass-curtain-wall.png', 0.3, 0.3, rough=0.25, shade=0.5),
    'orange_roof': t.textured('orange_roof', 'roof-membrane.png', 0.5, 0.5, tint='ffa040', shade=1.8),
    'dome': t.mottled('dome', 'b4b8bc', '8c9094', scale=10, rough=0.4),
    'globe': t.plain('globe', '3f72b8', 0.3, 0.3),
    'rim': t.plain('rim', 'e2ddd2', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'paint': t.plain('paint', 'ece8de', 0.9),
}


def sphere(x, y, z, r, material, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=segments // 2, radius=r, location=(x, y, z))
    bpy.context.object.data.materials.append(material)
    bpy.ops.object.shade_smooth()


# --- ground: a plaza, lawn verges, the garden in the south-west ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.0, 0, 0.14, 3.0, 0.004, M['grass'], name='verge_west')
t.box(2.75, 0.0, 0, 3.0, 3.0, 0.004, M['grass'], name='verge_east')
t.box(0.14, 2.75, 0, 2.75, 3.0, 0.004, M['grass'], name='verge_north')
t.box(0.2, 0.15, 0, 1.4, 0.95, 0.004, M['grass'], name='garden')
t.prism(t.circle(0.8, 0.55, 0.27), 0, 0.006, M['pavers'], name='globe_plaza')

# --- the L block ---
H = 0.4
L = [(1.64, 0.25), (2.46, 0.25), (2.46, 2.4), (0.3, 2.4), (0.3, 1.45), (1.64, 1.45)]
t.building(L, H, M['facade'], M['roof'], M['rim'])
t.zone_letter('C', 2.05, 1.2, H + 0.002, 0.44, M['paint'])
t.roof_clutter([(1.68, 0.3, 2.42, 0.95)], H, rng, M['unit'], M['fan'], count=4)
t.roof_clutter([(1.25, 1.5, 2.42, 2.36)], H, rng, M['unit'], M['fan'], count=4)

# --- the dome over its west end, on a drum ---
t.cylinder(0.75, 1.92, H, H + 0.08, 0.4, M['facade'], 48)
sphere(0.75, 1.92, H + 0.08, 0.37, M['dome'])
t.cylinder(0.75, 1.92, H + 0.43, H + 0.48, 0.06, M['dome'], 16)

# --- the glass hall and the pavilion in front of the block ---
t.box(0.3, 1.08, 0, 1.25, 1.45, 0.14, M['facade'], M['glass'], name='glass_hall')
t.box(1.3, 1.05, 0, 1.6, 1.32, 0.12, M['facade'], M['orange_roof'], name='pavilion')

# --- the globe on a low plinth ---
t.cylinder(0.8, 0.55, 0.006, 0.04, 0.12, M['rim'], 24)
sphere(0.8, 0.55, 0.2, 0.17, M['globe'])

# --- trees in the garden and on the verges ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(0.07, y) for y in (0.35, 0.95, 1.55, 2.15, 2.75)] + [(x, 2.88) for x in (0.6, 1.3, 2.0, 2.6)] +
         [(2.88, y) for y in (0.35, 0.95, 1.55, 2.15)] + [(0.35, 0.3), (1.25, 0.3), (1.3, 0.8), (0.35, 0.85)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
