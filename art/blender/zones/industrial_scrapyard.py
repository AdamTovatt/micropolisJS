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

# A scrapyard, industrial (1, 3): heaps of rusty scrap in the corners of a bare earth yard, two
# excavators and a loader working them, a baler fed by a conveyor, a skip of sorted scrap, and
# the zone's letter painted on the ground.

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(630)

M = {
    'earth': t.weathered(t.textured('earth', 'bare-soil.png', 1.0, 1.0, tint='d8ccb8', shade=1.05), dirt=0.25),
    'gravel': t.textured('gravel', 'track-ballast.png', 0.5, 0.5, tint='e0dcd4', shade=1.2),
    'yellow': t.plain('yellow', 'e0a820', 0.5),
    'red': t.plain('red', 'a8442c', 0.6),
    'machine': t.plain('machine', '5a646e', 0.5, 0.4),
    'skip': t.plain('skip', '34383c', 0.6),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}
SCRAP = [t.plain(f'scrap_{i}', hex_colour, 0.7, metal)
         for i, (hex_colour, metal) in enumerate((('8a4a2a', 0.2), ('6a3a22', 0.2), ('9a5a32', 0.2), ('7a7c80', 0.5), ('5e3420', 0.2),
                                                  ('4a4c50', 0.5), ('7c5236', 0.2), ('a8a8a4', 0.3),
                                                  ('7a4430', 0.2)))]


def heap(cx, cy, rx, ry, height, count):
    # a mound of scrap: flat pieces at random turns, piled higher toward the middle, each kept
    # in from the edge so that, sheared, it stays inside the zone
    for _ in range(count):
        a, r = rng.uniform(0, 2 * math.pi), math.sqrt(rng.random())
        x, y = cx + r * rx * math.cos(a), cy + r * ry * math.sin(a)
        top = height * (1 - r * r) * rng.uniform(0.6, 1.0) + 0.01
        w, d = rng.uniform(0.04, 0.12), rng.uniform(0.03, 0.08)
        reach = math.hypot(w, d) / 2
        x = min(max(x, reach + 0.02), 3 - reach - t.SHEAR * top - 0.02)
        y = min(max(y, reach + 0.02), 3 - reach - t.SHEAR * top - 0.02)
        t.prism(t.rotated_rect(x, y, w, d, rng.uniform(0, 180)), max(0.0, top - rng.uniform(0.01, 0.03)), top,
                rng.choice(SCRAP), name='scrap')


# --- ground: bare earth, gravel under the baler, the letter painted flat ---
t.box(0, 0, -0.05, 3, 3, 0, M['earth'], name='earth')
t.prism(t.patch(2.2, 1.15, 0.6, 0.35, rng, wobble=0.2), 0, 0.001, M['gravel'], name='gravel')
t.zone_letter('I', 1.48, 1.55, 0.001, 0.6, M['green_paint'], thickness=0.004)

# --- the heaps ---
heap(0.72, 2.45, 0.62, 0.46, 0.12, 260)
heap(2.32, 2.48, 0.56, 0.4, 0.11, 220)
heap(0.78, 0.6, 0.66, 0.48, 0.12, 260)
heap(2.52, 0.38, 0.38, 0.3, 0.08, 110)

# --- the machines: two excavators and a loader at the heaps, the baler and its feed ---
t.excavator(0.55, 1.62, 300, M['yellow'], reach=0.55, size=1.9)
t.excavator(1.72, 2.12, 45, M['yellow'], reach=0.4, size=1.4)
t.excavator(1.2, 0.98, 150, M['yellow'], reach=0.3, size=1.2)
t.box(1.92, 1.0, 0, 2.2, 1.42, 0.06, M['red'], name='hopper')
heap(2.06, 1.21, 0.1, 0.16, 0.07, 30)
t.box(2.42, 0.98, 0, 2.84, 1.38, 0.1, M['machine'], name='baler')
t.strut((2.2, 1.2, 0.07), (2.42, 1.18, 0.12), 0.03, M['machine'])
t.box(1.98, 1.76, 0, 2.38, 2.08, 0.05, M['skip'], name='skip')
heap(2.18, 1.92, 0.16, 0.12, 0.09, 30)

t.render(scene, t.out_dir(__file__), tiles=3)
