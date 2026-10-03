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

# A 3x3 commercial zone: a green glass office tower filling a paved plaza, with trees round
# the edge and a café in the south-east corner.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(21)

M = {
    'roof': t.textured('roof', 'roof-membrane.png', 1.0, 1.0, shade=1.15),
    'pavers': t.weathered(t.textured('pavers', 'paving-slabs.png', 0.3, 0.3), dirt=0.2, dirt_scale=3),
    'grass': t.textured('grass', 'lawn-grass.png', 0.3, 0.3, shade=1.2),
    'green_glass': t.textured('green_glass', 'glass-curtain-wall.png', 0.62, 0.62, rough=0.25, shade=0.75,
                              hue=-0.2),
    'parapet': t.plain('parapet', 'd8d6cf', 0.6),
    'paint': t.plain('paint', 'd2cbbb', 0.9),
    'unit': t.plain('unit', 'c9c9c4', 0.5, 0.3),
    'fan': t.plain('fan', '2e3033', 0.6, 0.4),
    'kiosk': t.plain('kiosk', 'd9d4c8', 0.7),
    'red_parasol': t.plain('red_parasol', 'b83a2e', 0.6),
    'blue_parasol': t.plain('blue_parasol', '3a64a8', 0.6),
}

# --- ground: a paved plaza with a lawn strip along the west edge ---
t.box(0, 0, -0.05, 3, 3, 0, M['pavers'], name='plaza')
t.box(0.0, 0.45, 0, 0.12, 1.55, 0.004, M['grass'], name='verge_west')

# --- the tower ---
TX0, TY0, TX1, TY1, TH = 0.54, 0.48, 1.95, 1.97, 1.8
t.box(TX0, TY0, 0, TX1, TY1, TH, M['green_glass'], M['roof'], name='tower')
E = 0.012
for (cx, cy) in [(TX0, TY0), (TX1, TY0), (TX0, TY1)]:
    t.box(cx - E, cy - E, 0, cx + E, cy + E, TH, M['parapet'], name='corner_trim')
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


# a row of four units along the north edge, three along the south, and a tall one beside each
for i in range(4):
    ac_unit(0.31 + i * 0.095, 0.77, 0.39 + i * 0.095, 0.86, 1)
for i in range(3):
    ac_unit(0.33 + i * 0.1, 0.12, 0.42 + i * 0.1, 0.22, 1)
ac_unit(0.75, 0.69, 0.81, 0.84, 1, 0.05)
x, y = on_roof(0.8, 0.2)
t.cylinder(x, y, TH, TH + 0.05, 0.05, M['unit'], 20)
for fy in (0.4, 0.5, 0.6, 0.68):
    x, y = on_roof(0.16, fy)
    t.cylinder(x, y, TH, TH + 0.018, 0.012, M['unit'], 10)
t.zone_letter('C', *on_roof(0.52, 0.5), TH + 0.002, 0.44, M['paint'])

# --- a café in the south-east corner: a kiosk and parasols ---
t.box(2.4, 0.5, 0, 2.62, 0.72, 0.09, M['kiosk'], name='cafe')
for (x, y, m) in [(2.3, 0.3, 'red_parasol'), (2.55, 0.25, 'blue_parasol'), (2.75, 0.45, 'red_parasol')]:
    t.cylinder(x, y, 0, 0.06, 0.006, M['unit'], 8)
    t.cylinder(x, y, 0.06, 0.068, 0.07, M[m], 16)

# --- planting: trees round the plaza, a hedge along the tower's south front ---
trees = ['plant-01', 'plant-02', 'plant-06', 'plant-09', 'plant-03', 'plant-07', 'plant-13']
spots = [(0.25, 2.78), (0.62, 2.82), (0.32, 2.38), (0.28, 1.75), (0.28, 0.22), (0.62, 0.18),
         (2.85, 2.55), (2.85, 2.05), (2.85, 1.2)]
for i, (x, y) in enumerate(spots):
    size = rng.uniform(0.24, 0.3)
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=3)
    t.tree(trees[i % len(trees)], x, y, size, rng.choice((0, 90, 180, 270)))
for i in range(6):
    t.shrub('plant-21', 0.75 + i * 0.2, 0.38, 0.17, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
