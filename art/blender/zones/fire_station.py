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

# The fire station, tiles 761 to 769, a 3x3 zone: a red brick station with FD on its roof, as the
# original's, three engine bays opening onto the forecourt where two engines stand, a drill
# tower, and lawns.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(761)

M = {
    'lawn': t.textured('lawn', 'lawn-grass.png', 0.25, 0.25, tint='d8ffb0', shade=1.3),
    'yard': t.concrete_yard(),
    'facade': t.textured('facade', 'brick-facade.png', 0.85, 0.85, tint='ff8c78', shade=2.0),
    'roof': t.mottled('roof', 'b8382c', '9c2e24', 14),
    'rim': t.plain('rim', 'd8d4cc', 0.7),
    'door': t.plain('door', 'd8d4cc', 0.5, 0.2),
    'yellow_paint': t.plain('yellow_paint', 'f0c828', 0.7),
    'engine': t.plain('engine', 'c8201c', 0.4),
    'ladder': t.plain('ladder', 'd8d8d4', 0.4, 0.5),
    'brick': t.textured('brick', 'brick-wall.png', 0.3, 0.3, tint='ff8c78', shade=1.8),
    'line': t.plain('line', 'ecebe6', 0.8),
}

# --- ground: lawns round the forecourt ---
t.box(0, 0, -0.05, 3, 3, 0, M['lawn'], name='lawn')
t.box(0.3, 0.05, 0, 2.7, 1.25, 0.002, M['yard'], name='forecourt')
t.box(0.2, 2.6, 0, 2.8, 2.9, 0.002, M['yard'], name='back_yard')

# --- the station, its bays, its letters and the drill tower ---
t.building([(0.3, 1.25), (2.7, 1.25), (2.7, 2.6), (0.3, 2.6)], 0.2, M['facade'], M['roof'], M['rim'])
for i in range(3):
    x = 0.75 + i * 0.6
    t.box(x - 0.2, 1.235, 0, x + 0.2, 1.25, 0.14, M['door'], name='bay_door')
    t.box(x - 0.006, 0.25, 0.002, x + 0.006, 1.2, 0.003, M['line'], name='bay_line')
t.zone_letter('F', 1.25, 1.92, 0.2, 0.5, M['yellow_paint'])
t.zone_letter('D', 1.75, 1.92, 0.2, 0.5, M['yellow_paint'])
t.box(2.2, 2.3, 0, 2.46, 2.56, 0.42, M['brick'], M['roof'], name='drill_tower')

# --- two engines out on the forecourt ---
for x in (0.75, 1.95):
    t.lorry(x, 0.68, 180, M['engine'], length=0.5)
    t.box(x - 0.02, 0.5, 0.125, x + 0.02, 0.86, 0.135, M['ladder'], name='ladder')

# --- shrubs along the lawns ---
for x, y in ((0.12, 0.3), (0.12, 1.0), (0.12, 1.8), (2.88, 0.4), (2.88, 1.6), (0.15, 2.85)):
    t.shrub(rng.choice(['plant-22', 'plant-24', 'plant-26', 'plant-28']), x, y, 0.12, 0.04, rng.choice((0, 90)))

t.render(scene, t.out_dir(__file__), tiles=3)
