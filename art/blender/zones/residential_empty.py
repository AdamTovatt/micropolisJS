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

# A 3x3 residential zone before anything is built: a rough meadow with trees and bushes, and the
# zone's letter laid in pale stone on a worn patch in the middle.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(41)

M = {
    'meadow': t.textured('meadow', 'wild-meadow.png', 1.4, 1.4, tint='c8f08c', shade=1.15),
    'soil': t.weathered(t.textured('soil', 'bare-soil.png', 0.9, 0.9, shade=1.1), dirt=0.15),
    'stone': t.textured('stone', 'paving-slabs.png', 0.25, 0.25, tint='fff4e0', shade=1.6),
}

# --- ground: meadow, a worn patch of soil, the letter laid flat on it, all low enough to be ground ---
t.box(0, 0, -0.05, 3, 3, 0, M['meadow'], name='meadow')
t.prism(t.patch(1.4, 1.6, 0.8, 0.95, rng), 0, 0.002, M['soil'], name='worn_patch')
t.zone_letter('R', 1.42, 1.55, 0.002, 0.72, M['stone'], thickness=0.005)

# --- trees and bushes, more to the edges than the middle ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13', 'plant-04']
bushes = ['plant-22', 'plant-23', 'plant-24', 'plant-26', 'plant-28', 'plant-29', 'plant-30', 'plant-33']
for i in range(30):
    while True:
        x, y = rng.uniform(0.1, 2.9), rng.uniform(0.1, 2.9)
        if ((x - 1.4) / 0.85) ** 2 + ((y - 1.6) / 1.0) ** 2 > 1:
            break
    if i % 3 == 0:
        t.shrub(rng.choice(bushes), x, y, rng.uniform(0.1, 0.15), 0.04, rng.choice((0, 90, 180, 270)))
    else:
        size = rng.uniform(0.24, 0.38)
        x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
        t.tree(rng.choice(trees), x, y, size, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
