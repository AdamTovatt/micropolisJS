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

# A chemical works, industrial (2, 3): three large storage tanks to the west, three tall silos in
# the north-east corner, process columns and vessels in the middle, two sheds along the south,
# and pipes running between them all.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(666)

M = {
    'yard': t.concrete_yard(),
    'tank': t.weathered(t.mottled('tank', 'e2e0da', 'c8c6c0', 10), dirt=0.15),
    'steel': t.plain('steel', 'c4c8cc', 0.35, 0.6),
    'pipe': t.plain('pipe', 'b4b8bc', 0.4, 0.5),
    'yellow': t.plain('yellow', 'd8a830', 0.5),
    'walls': t.textured('walls', 'corrugated-steel.png', 0.5, 0.5, shade=1.1),
    'brick': t.textured('brick', 'brick-wall.png', 0.3, 0.3, tint='ff8c78', shade=1.8),
    'roof': t.weathered(t.textured('roof', 'corrugated-steel.png', 0.5, 0.5, tint='e8ecf0', shade=1.3), dirt=0.2),
    'roof_turned': t.textured('roof_turned', 'corrugated-steel.png', 0.5, 0.5, shade=1.2, turned=True),
    'concrete': t.plain('concrete', 'a8a49c'),
    'pad': t.weathered(t.mottled('pad', '8a8680', '6e6a64', 6), dirt=0.3),
    'grating': t.plain('grating', '6a6e72', 0.6, 0.4),
    'green_paint': t.plain('green_paint', '5f9e4f', 0.9),
}

t.box(0, 0, -0.05, 3, 3, 0, M['yard'], name='yard')

# --- pipes along the ground between the parts of the works, on low supports ---
z = 0.025
runs = [((0.12, 2.05), (1.95, 2.05)), ((0.12, 1.15), (2.0, 1.15)), ((0.95, 1.15), (0.95, 2.9)),
        ((1.95, 1.15), (1.95, 2.85)), ((1.95, 2.35), (2.9, 2.35)), ((0.12, 1.08), (2.9, 1.08)),
        ((1.4, 0.15), (1.4, 1.08)), ((2.9, 1.08), (2.9, 2.35)), ((0.95, 0.12), (2.0, 0.12))]
for (x0, y0), (x1, y1) in runs:
    for dz in (0, 0.02):
        t.strut((x0, y0, z + dz), (x1, y1, z + dz), 0.008, M['pipe'])

# --- the storage tanks, each with its rim and the walkway to the middle of its roof ---
for cx, cy in ((0.5, 2.48), (1.5, 2.48), (0.5, 1.6)):
    r, h = 0.31, 0.17
    t.cylinder(cx, cy, 0, h, r, M['tank'], 48)
    t.cylinder(cx, cy, h, h + 0.012, r * 0.94, M['tank'], 48)
    t.cylinder(cx, cy, h + 0.012, h + 0.02, 0.03, M['steel'], 12)
    t.box(cx, cy - 0.012, h + 0.012, cx + r, cy + 0.012, h + 0.018, M['yellow'], name='walkway')

# --- the silos in the north-east corner, and two round pressure vessels below them ---
for x in (2.2, 2.46, 2.72):
    t.cylinder(x, 2.6, 0, 0.26, 0.095, M['steel'], 24)
    t.cylinder(x, 2.6, 0.26, 0.275, 0.06, M['steel'], 24)
for x, y in ((2.3, 2.16), (2.72, 2.12)):
    t.sphere(x, y, 0.09, 0.08, M['tank'])

# --- the process plant on its stained pad: columns, vessels, a steel frame and pipe racks ---
t.box(1.12, 1.18, 0, 2.86, 2.0, 0.0015, M['pad'], name='pad')
for x, y, h, r in ((1.62, 1.84, 0.3, 0.045), (1.86, 1.76, 0.36, 0.05), (2.12, 1.86, 0.26, 0.04),
                   (2.4, 1.8, 0.33, 0.045), (2.64, 1.64, 0.24, 0.04), (2.2, 1.5, 0.3, 0.05),
                   (2.46, 1.42, 0.22, 0.035), (1.74, 1.5, 0.2, 0.035)):
    t.cylinder(x, y, 0, h, r, M['steel'], 20)
    t.sphere(x, y, h, r, M['steel'])
    t.cylinder(x, y, h * 0.55, h * 0.55 + 0.008, r + 0.012, M['yellow'], 20)
for x, y, r in ((1.34, 1.84, 0.06), (2.7, 1.32, 0.055)):
    t.sphere(x, y, r + 0.01, r, M['tank'])
for x0, x1, y, r in ((1.2, 1.52, 1.4, 0.045), (1.22, 1.54, 1.58, 0.045), (1.96, 2.3, 1.26, 0.04),
                     (2.5, 2.8, 1.92, 0.035)):
    t.strut((x0, y, r + 0.02), (x1, y, r + 0.02), r, M['tank'])
t.box(1.62, 1.22, 0, 1.94, 1.42, 0.1, M['concrete'], M['steel'], name='pump_house')
for x in (1.5, 1.98, 2.3):
    for y in (1.68, 1.98):
        t.strut((x, y, 0), (x, y, 0.15), 0.006, M['yellow'])
t.box(1.5, 1.66, 0.14, 2.3, 2.0, 0.15, M['grating'], name='frame_deck')
for y in (1.66, 1.72, 1.78):
    t.strut((1.2, y, 0.11), (2.82, y, 0.11), 0.007, M['pipe'])
for x in (1.45, 2.05, 2.55):
    t.strut((x, 1.2, 0.09), (x, 2.0, 0.09), 0.007, M['pipe'])

# --- the sheds along the south: an office with the letter on its roof, and a workshop ---
t.box(0.17, 0.25, 0, 1.28, 0.86, 0.13, M['brick'], M['roof'], name='office')
t.zone_letter('I', 0.72, 0.55, 0.13, 0.4, M['green_paint'])
t.house(2.17, 0.25, 2.72, 1.0, 0.13, 0.05, M['brick'], M['roof_turned'], ridge='y')

t.render(scene, t.out_dir(__file__), tiles=3)
