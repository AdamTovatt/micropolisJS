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

# A 3x3 commercial zone: a blue glass office tower on a paved plaza, with parking on the west side.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()

M = {
    'roof': t.textured('roof', 'roof-membrane.png', 1.0, 1.0),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.3, 0.3), dirt=0.2, dirt_scale=3),
    'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.45, 0.45), dirt=0.15),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3),
    'tower_glass': t.textured('tower_glass', 'glass-curtain-wall.png', 0.48, 0.48, rough=0.25, shade=0.6),
    'lobby_glass': t.textured('lobby_glass', 'glass-curtain-wall.png', 0.3, 0.3, rough=0.25, shade=0.5),
    'soil': t.mottled('soil', '6e5536', '5a4329', 20),
    'sign': t.weathered(t.mottled('sign', '3b4a5c', '8a9bb0', 90, 0.5),
                        dirt=0.2, dirt_scale=20, specks=0.08, speck_hex='e0ddd4'),
    'parapet': t.plain('parapet', 'd8d6cf', 0.6),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'blue_roof': t.plain('blue_roof', '2f63b8', 0.5),
    'kiosk': t.plain('kiosk', 'd9d4c8', 0.7),
    'line': t.plain('line', 'ecebe6', 0.8),
}

# --- ground ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.05, 0.08, 0, 0.42, 2.95, 0.003, M['asphalt'], name='parking')
t.box(0.0, 0.0, 0, 0.05, 3, 0.004, M['grass'], name='verge_left')
t.box(0.42, 0.08, 0, 0.58, 2.3, 0.004, M['grass'], name='strip')
t.box(2.9, 0.0, 0, 3.0, 3.0, 0.005, M['grass'], name='verge_right')
t.box(1.38, 0.38, 0, 2.4, 0.56, 0.004, M['soil'], name='bed')

# --- the tower ---
TX0, TY0, TX1, TY1, TH = 0.6, 0.62, 2.03, 2.12, 1.78
t.box(TX0, TY0, 0, TX1, TY1, TH, M['tower_glass'], M['roof'], name='tower')
# light metal trim down the corners and in a band around the top of the glass
E = 0.012
for (cx, cy) in [(TX0, TY0), (TX1, TY0), (TX0, TY1)]:
    t.box(cx - E, cy - E, 0, cx + E, cy + E, TH, M['parapet'], name='corner_trim')
B = 0.006
for (x0, y0, x1, y1) in [(TX0 - B, TY0 - B, TX1 + B, TY0), (TX0 - B, TY1, TX1 + B, TY1 + B),
                         (TX0 - B, TY0, TX0, TY1), (TX1, TY0, TX1 + B, TY1)]:
    t.box(x0, y0, TH - 0.035, x1, y1, TH, M['parapet'], name='top_band')
P = 0.03
for (x0, y0, x1, y1) in [(TX0, TY0, TX1, TY0 + P), (TX0, TY1 - P, TX1, TY1),
                         (TX0, TY0, TX0 + P, TY1), (TX1 - P, TY0, TX1, TY1)]:
    t.box(x0, y0, TH, x1, y1, TH + 0.025, M['parapet'], name='parapet')


def on_roof(fx, fy):
    # a point on the roof, given as fractions of its width and depth from the south-west corner
    return TX0 + fx * (TX1 - TX0), TY0 + fy * (TY1 - TY0)


def ac_unit(fx0, fy0, fx1, fy1, fans, h=0.04):
    (x0, y0), (x1, y1) = on_roof(fx0, fy0), on_roof(fx1, fy1)
    t.box(x0, y0, TH, x1, y1, TH + h, M['unit'], name='ac_unit')
    w = x1 - x0
    for i in range(fans):
        cx = x0 + (i + 0.5) * w / fans
        t.cylinder(cx, (y0 + y1) / 2, TH + h, TH + h + 0.004, min(w / fans, y1 - y0) * 0.36, M['fan'])


ac_unit(0.11, 0.769, 0.249, 0.877, 2)
ac_unit(0.114, 0.192, 0.249, 0.346, 2)
for fy0 in (0.569, 0.492, 0.415):
    ac_unit(0.11, fy0, 0.192, fy0 + 0.058, 1, 0.03)
for (fx0, fy0, fx1, fy1) in [(0.816, 0.819, 0.898, 0.877), (0.824, 0.415, 0.906, 0.492),
                             (0.429, 0.877, 0.478, 0.915), (0.673, 0.858, 0.714, 0.888)]:
    ac_unit(fx0, fy0, fx1, fy1, 1, 0.025)
(px0, py0), (px1, py1) = on_roof(0.857, 0.492), on_roof(0.873, 0.819)
t.box(px0, py0, TH, px1, py1, TH + 0.012, M['unit'], name='pipe')
for (fx, fy) in [(0.265, 0.915), (0.347, 0.223), (0.714, 0.146), (0.898, 0.069),
                 (0.265, 0.05), (0.592, 0.242), (0.959, 0.608)]:
    x, y = on_roof(fx, fy)
    t.cylinder(x, y, TH, TH + 0.018, 0.009, M['unit'], 10)
t.zone_letter('C', *on_roof(0.518, 0.515), TH + 0.002, 0.42, M['paint'])

# --- entrance pavilion at the tower's south-west corner, with a billboard lying on its roof ---
t.box(0.88, 0.2, 0, 1.32, 0.62, 0.3, M['lobby_glass'], M['parapet'], name='lobby')
t.box(0.96, 0.28, 0.3, 1.24, 0.56, 0.318, M['parapet'], name='billboard_frame')
t.box(0.98, 0.3, 0.318, 1.22, 0.54, 0.321, M['sign'], name='billboard')

# --- vehicles and a kiosk ---
t.parking_row(0.07, 0.15, 14, 'y', +1, ['car-03', 'car-12', None, 'car-21', 'car-09', 'car-17', None, 'car-01',
                                          None, 'car-10', 'car-19', None, 'car-13', 'car-05'],
              M['line'], random.Random(2), bay=0.19, depth=0.31)
t.car('car-07', 0.72, 2.79, 90)
t.box(0.57, 2.41, 0, 0.74, 2.7, 0.1, M['kiosk'], M['blue_roof'], name='kiosk')

# --- planting: trees on the plaza, a hedge in the bed, shrubs on the verges ---
t.tree('plant-03', 0.62, 0.3, 0.26)
t.tree('plant-09', 2.62, 0.25, 0.24)
for i in range(4):
    t.shrub('plant-20', 1.53 + i * 0.24, 0.47, 0.25, 0.05)
bushes = ['plant-22', 'plant-26', 'plant-29', 'plant-23', 'plant-24', 'plant-28', 'plant-25', 'plant-27']
for i, y in enumerate((0.15, 0.55, 0.95, 1.35, 1.75, 2.15, 2.55, 2.9)):
    t.shrub(bushes[i], 2.89, y, 0.13, 0.05)
small = ['plant-30', 'plant-33', 'plant-26', 'plant-35', 'plant-31', 'plant-37', 'plant-23', 'plant-39',
         'plant-32', 'plant-29']
for i, y in enumerate([0.22 + k * 0.21 for k in range(10)]):
    t.shrub(small[i], 0.5, y, 0.15, 0.04)
for (x, y, plant) in [(2.35, 0.2, 'plant-32'), (1.6, 0.15, 'plant-38')]:
    t.shrub(plant, x, y, 0.08, 0.02)

t.render(scene, t.out_dir(__file__), tiles=3)
