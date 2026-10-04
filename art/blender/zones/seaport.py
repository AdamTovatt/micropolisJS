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

# The seaport, tiles 693 to 708, a 4x4 zone: a concrete quay with a dock basin along its west and
# south sides, two gantry cranes over the basin, stacks of containers, a warehouse with an
# anchor painted on its roof, as the original's has, and the harbour office.

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402

scene = t.new_scene()
rng = random.Random(693)

M = {
    'yard': t.concrete_yard(),
    'quay': t.plain('quay', '9a968e', 0.8),
    'water': ts.water_material(),
    'walls': t.textured('walls', 'corrugated-steel.png', 0.5, 0.5, tint='e0e4e8', shade=1.15),
    'roof': t.weathered(t.mottled('roof', '9a9c9e', '84868a', 14), dirt=0.2),
    'rim': t.plain('rim', '8c8a84', 0.8),
    'office': t.textured('office', 'white-facade.png', 0.85, 0.85, shade=1.3),
    'office_roof': t.mottled('office_roof', 'd8d6d0', 'c4c2bc', 14),
    'crane': t.plain('crane', 'e09028', 0.5, 0.2),
    'anchor': t.plain('anchor', '2f5fae', 0.7),
    'line': t.plain('line', 'ecebe6', 0.8),
    'bollard': t.plain('bollard', '2a2a2a', 0.6),
    'white': t.plain('white', 'e8e8e4', 0.5),
    'blue': t.plain('blue', '2f5fae', 0.5),
    'red': t.plain('red', 'c03a30', 0.5),
}
CONTAINERS = [t.plain(f'container_{i}', c, 0.6, 0.2)
              for i, c in enumerate(('b83a2a', '2a5a9a', '3a7a46', 'd07a20', '8a8c90', '6a3a7a'))]

# --- ground: the basin along the west and south, the quay above it ---
t.box(-0.1, -0.1, -0.2, 4, 4, -0.03, M['water'], name='basin')
t.box(0.32, 0.3, -0.2, 4, 4, 0, M['quay'], M['yard'], name='quay')
for i in range(12):
    t.cylinder(0.38, 0.4 + i * 0.3, 0, 0.02, 0.012, M['bollard'], 8)
    t.cylinder(0.45 + i * 0.3, 0.36, 0, 0.02, 0.012, M['bollard'], 8)

# --- two gantry cranes on rails along the west quay, their booms out over the basin ---
for y in (1.25, 2.65):
    for x in (0.45, 0.95):
        for dy in (-0.12, 0.12):
            t.strut((x, y + dy, 0), (x, y + dy, 0.34), 0.012, M['crane'])
    for dy in (-0.12, 0.12):
        t.box(0.08, y + dy - 0.012, 0.34, 1.05, y + dy + 0.012, 0.37, M['crane'], name='boom')
    t.box(0.85, y - 0.14, 0.37, 1.02, y + 0.14, 0.42, M['crane'], name='machinery')
    t.box(0.22, y - 0.04, 0.27, 0.3, y + 0.04, 0.34, M['crane'], name='spreader')

# --- stacks of containers on the quay, in rows with lanes between ---
for row_x in (1.25, 1.55, 1.85, 2.15):
    for j in range(9):
        y = 0.7 + j * 0.3
        if rng.random() < 0.15:
            continue
        for level in range(rng.choice((1, 2, 2, 3))):
            z = level * 0.055
            t.box(row_x - 0.06, y - 0.13, z, row_x + 0.06, y + 0.13, z + 0.052, rng.choice(CONTAINERS),
                  name='container')

# --- the warehouse with its anchor, and the harbour office ---
t.building([(2.5, 1.8), (3.75, 1.8), (3.75, 3.6), (2.5, 3.6)], 0.2, M['walls'], M['roof'], M['rim'])
z = 0.2
cx, cy = 3.12, 2.72
t.box(cx - 0.03, cy - 0.42, z, cx + 0.03, cy + 0.4, z + 0.005, M['anchor'], name='shank')
t.box(cx - 0.2, cy + 0.22, z, cx + 0.2, cy + 0.27, z + 0.005, M['anchor'], name='stock')
t.cylinder(cx, cy + 0.46, z, z + 0.005, 0.07, M['anchor'], 24)
t.cylinder(cx, cy + 0.46, z + 0.005, z + 0.007, 0.035, M['roof'], 24)
# the arms: half an ellipse under the shank, with a fluke rising at each end
arm = [(cx - 0.36 * math.cos(i * math.pi / 10), cy - 0.18 - 0.3 * math.sin(i * math.pi / 10)) for i in range(11)]
t.strut((arm[0][0], arm[0][1], z + 0.003), (arm[0][0], arm[0][1] + 0.1, z + 0.003), 0.025, M['anchor'])
for p, q in zip(arm, arm[1:]):
    t.strut((p[0], p[1], z + 0.003), (q[0], q[1], z + 0.003), 0.025, M['anchor'])
t.strut((arm[-1][0], arm[-1][1], z + 0.003), (arm[-1][0], arm[-1][1] + 0.1, z + 0.003), 0.025, M['anchor'])
t.building([(2.75, 0.5), (3.75, 0.5), (3.75, 1.3), (2.75, 1.3)], 0.16, M['office'], M['office_roof'], M['rim'])

# --- lorries waiting for containers ---
t.lorry(2.48, 1.1, 0, M['blue'], CONTAINERS[0])
t.lorry(2.48, 0.62, 270, M['red'], CONTAINERS[3], length=0.5)

t.render(scene, t.out_dir(__file__), tiles=4)
