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

# A 3x3 residential zone of white modern blocks: two in the north, a low wing roofed in solar panels
# down the west side, a wide block round a glass-roofed court in the middle, and a row of three white
# terraced houses with gable roofs along the south edge.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(35)

M = {
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.25, 0.25, tint='f0ece4', shade=1.1),
                          dirt=0.15, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'facade': t.textured('facade', 'white-facade.png', 0.8, 0.8, shade=1.25),
    'roof': t.mottled('roof', 'dcdcd8', 'b8b8b4', scale=14),
    'white_roof': t.mottled('white_roof', 'f0f0ee', 'd4d4d2', scale=30, rough=0.6),
    'skylight': t.textured('skylight', 'glass-curtain-wall.png', 0.25, 0.25, rough=0.2, shade=0.9,
                           tint='9cc0ff'),
    'solar': t.plain('solar', '27324a', 0.25, 0.3),
    'rim': t.plain('rim', 'f0eee8', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

# --- ground: pale paving, lawn strips with trees down the west and east edges ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.0, 0, 0.2, 3.0, 0.004, M['grass'], name='verge_west')
t.box(2.8, 0.0, 0, 3.0, 3.0, 0.004, M['grass'], name='verge_east')
t.box(0.25, 0.7, 0, 0.55, 1.2, 0.004, M['grass'], name='garden')

# --- the north blocks, and a low wing of solar panels down the west side ---
t.building([(0.41, 2.05), (1.11, 2.05), (1.11, 2.76), (0.41, 2.76)], 0.4, M['facade'], M['roof'], M['rim'])
t.roof_clutter([(0.45, 2.3, 1.07, 2.72)], 0.4, rng, M['unit'], M['fan'], count=3)
t.building([(0.25, 1.25), (0.6, 1.25), (0.6, 2.05), (0.25, 2.05)], 0.18, M['facade'], M['roof'], M['rim'])
for i in range(9):
    y = 1.3 + i * 0.08
    t.box(0.3, y, 0.18, 0.55, y + 0.055, 0.2, M['solar'], name='solar_panels')
t.building([(1.52, 2.2), (2.55, 2.2), (2.55, 2.76), (1.52, 2.76)], 0.38, M['facade'], M['roof'], M['rim'])
t.roof_clutter([(1.56, 2.24, 2.51, 2.72)], 0.38, rng, M['unit'], M['fan'], count=4)

# --- the wide block round its glass-roofed court ---
H = 0.34
C = [(0.6, 0.72), (2.6, 0.72), (2.6, 1.98), (1.55, 1.98), (1.55, 1.3), (1.05, 1.3), (1.05, 1.98), (0.6, 1.98)]
t.building(C, H, M['facade'], M['roof'], M['rim'])
t.box(1.05, 1.3, 0, 1.55, 1.98, 0.14, M['facade'], M['skylight'], name='court_roof')
t.zone_letter('R', 2.1, 1.45, H + 0.002, 0.42, M['green_paint'])
t.roof_clutter([(0.65, 0.77, 1.5, 1.25)], H, rng, M['unit'], M['fan'], count=3)
t.roof_clutter([(1.6, 1.75, 2.55, 1.94)], H, rng, M['unit'], M['fan'], count=2)

# --- the terraced houses along the south edge ---
for x0 in (0.35, 1.07, 1.79):
    t.house(x0, 0.16, x0 + 0.6, 0.56, 0.14, 0.12, M['facade'], M['white_roof'], ridge='x')

# --- trees on the verges and in the garden ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-13']
spots = ([(0.09, y) for y in (0.3, 0.85, 1.4, 1.95, 2.5)] + [(2.9, y) for y in (0.3, 0.85, 1.4, 1.95)] +
         [(0.4, 0.85), (0.42, 1.08), (1.3, 2.85), (2.6, 0.35)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.2, 0.27)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
