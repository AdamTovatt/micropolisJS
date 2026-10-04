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

# A 3x3 residential zone, newly built: a grey block along the north and a grey wing south of its east
# end, on rough ground still bare to the west, with a small playground among the trees.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(12)

M = {
    'meadow': t.textured('meadow', 'wild-meadow.png', 1.4, 1.4, tint='c8f08c', shade=1.15),
    'soil': t.weathered(t.textured('soil', 'bare-soil.png', 0.9, 0.9, shade=1.1), dirt=0.15),
    'sand': t.textured('sand', 'play-sand.png', 0.3, 0.3),
    'grey_facade': t.textured('grey_facade', 'concrete-facade.png', 0.55, 0.5, shade=0.95),
    'roof': t.textured('roof', 'roof-membrane.png', 0.8, 0.8, shade=1.2),
    'rim': t.plain('rim', 'cfccc4', 0.6),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
    'play_red': t.plain('play_red', 'c8432f', 0.5),
    'play_yellow': t.plain('play_yellow', 'e0a22a', 0.5),
}

# --- ground: meadow, with the building site's bare earth over the west and middle ---
t.box(0, 0, -0.05, 3, 3, 0, M['meadow'], name='meadow')
t.prism(t.patch(1.0, 1.55, 0.85, 1.25, rng, wobble=0.2), 0, 0.002, M['soil'], name='bare_ground')
t.box(1.05, 0.6, 0, 1.45, 0.95, 0.004, M['sand'], name='sandpit')
t.box(1.15, 0.7, 0.004, 1.27, 0.76, 0.06, M['play_yellow'], name='slide')
t.box(1.34, 0.78, 0.004, 1.38, 0.9, 0.07, M['play_red'], name='swing_frame')

# --- the blocks ---
t.building([(0.95, 1.55), (2.6, 1.55), (2.6, 2.5), (0.95, 2.5)], 0.42, M['grey_facade'], M['roof'], M['rim'])
t.building([(1.8, 0.5), (2.55, 0.5), (2.55, 1.55), (1.8, 1.55)], 0.42, M['grey_facade'], M['roof'], M['rim'])
t.zone_letter('R', 2.17, 1.05, 0.422, 0.4, M['green_paint'])
t.roof_clutter([(0.99, 1.95, 2.56, 2.46)], 0.42, rng, M['unit'], M['fan'], count=5)

# --- trees round the edge and on the bare ground, bushes by the playground ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13']
spots = ([(0.15, y) for y in (0.4, 1.0, 1.6, 2.2, 2.8)] + [(0.55, 2.85), (0.5, 2.3)] +
         [(x, 0.1) for x in (0.4, 0.9, 1.5, 2.0, 2.6)] + [(2.85, y) for y in (0.5, 1.1, 1.7, 2.3)] +
         [(0.65, 0.55), (1.6, 1.25), (0.55, 1.4)])
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.22, 0.32)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
for i, (x, y) in enumerate([(0.95, 0.5), (1.55, 0.55), (0.85, 1.0)]):
    t.shrub(['plant-22', 'plant-26', 'plant-24'][i], x, y, 0.11, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
