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

# A 3x3 commercial zone before anything is built: cleared ground, mostly bare earth with grass at
# its edges and a few trees, and the zone's letter laid in pale stone in the middle.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(43)

M = {
    'meadow': t.textured('meadow', 'wild-meadow.png', 1.4, 1.4, tint='c8f08c', shade=1.15),
    'soil': t.weathered(t.textured('soil', 'bare-soil.png', 0.9, 0.9, shade=1.15), dirt=0.2, dirt_scale=2),
    'stone': t.textured('stone', 'paving-slabs.png', 0.25, 0.25, tint='fff4e0', shade=1.6),
}

# --- ground: cleared soil over most of the zone, meadow left at its edges, the letter laid on it ---
t.box(0, 0, -0.05, 3, 3, 0, M['meadow'], name='meadow')
t.prism(t.patch(1.5, 1.5, 1.3, 1.25, rng, wobble=0.18), 0, 0.002, M['soil'], name='cleared_ground')
for (cx, cy, r) in [(0.9, 0.9, 0.2), (2.15, 2.1, 0.25), (2.2, 0.85, 0.15)]:
    t.prism(t.patch(cx, cy, r, r * 0.8, rng), 0, 0.003, M['meadow'], name='grass_left')
t.zone_letter('C', 1.45, 1.5, 0.003, 0.72, M['stone'], thickness=0.005)

# --- trees and bushes round the cleared ground, and a few weeds on it ---
trees = ['plant-01', 'plant-02', 'plant-03', 'plant-06', 'plant-09', 'plant-07', 'plant-10', 'plant-13', 'plant-04']
bushes = ['plant-22', 'plant-23', 'plant-24', 'plant-26', 'plant-28', 'plant-29', 'plant-30', 'plant-33']
edge = ([(x, 0.15) for x in (0.25, 1.0, 1.9, 2.75)] + [(x, 2.85) for x in (0.3, 1.2, 2.1, 2.8)] +
        [(0.15, y) for y in (0.9, 1.7, 2.4)] + [(2.85, y) for y in (0.8, 1.6, 2.3)])
for (x, y) in edge:
    size = rng.uniform(0.22, 0.3)
    x, y = t.keep_inside(x + rng.uniform(-0.08, 0.08), y + rng.uniform(-0.06, 0.06), size / 2, size * 0.8, tiles=3)
    t.tree(rng.choice(trees), x, y, size, rng.choice((0, 90, 180, 270)))
for (x, y) in [(0.7, 0.75), (2.3, 0.7), (2.35, 2.2), (0.75, 2.3), (1.0, 1.0), (2.1, 1.6)]:
    t.shrub(rng.choice(bushes), x, y, rng.uniform(0.08, 0.12), 0.03, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
