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

# Parks, tiles 40 to 43: the park tool lays one of the four at random on each tile it covers
# (src/parkTool.js), whatever is beside it, so each is a small garden complete in itself on a
# mown lawn that runs to every edge, and a stretch of park reads as one lawn.

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402

TREES = ['plant-01', 'plant-03', 'plant-06', 'plant-09', 'plant-11', 'plant-13']
FLOWERING = ['plant-14', 'plant-16', 'plant-18']
BUSHES = ['plant-22', 'plant-24', 'plant-25', 'plant-27', 'plant-28']
FLOWERS = ['plant-32', 'plant-35', 'plant-37']


def materials():
    return {
        'lawn': ts.material('lawn', lambda: t.textured('lawn', 'lawn-grass.png', 0.25, 0.25, tint='d8ffb0', shade=1.3)),
        'path': ts.material('gravel_path', lambda: t.textured('gravel_path', 'play-sand.png', 0.2, 0.2,
                                                              tint='f0e0c8', shade=1.1)),
        'soil': ts.material('bed', lambda: t.textured('bed', 'bare-soil.png', 0.3, 0.3, tint='a08060', shade=0.8)),
        'bench': ts.material('bench', lambda: t.plain('bench', '7a5232', 0.8)),
        'water': ts.water_material(),
    }


def lawn(m):
    t.box(0, 0, -0.1, 1, 1, 0.001, m['lawn'], name='lawn')


def bed(m, rng, cx, cy, rx, ry):
    # a flower bed: dug soil with small plants in it
    outline = t.patch(cx, cy, rx, ry, rng, wobble=0.12)
    t.prism(outline, 0, 0.003, m['soil'], name='bed')
    for _ in range(int(40 * rx * ry / 0.01) + 3):
        a, r = rng.uniform(0, 2 * math.pi), math.sqrt(rng.random()) * 0.8
        x, y = cx + r * rx * math.cos(a), cy + r * ry * math.sin(a)
        size = rng.uniform(0.04, 0.06)
        t.shrub(rng.choice(FLOWERS), x, y, size, 0.012, rng.choice((0, 90, 180, 270)))


def tree(rng, name, x, y, size):
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=1)
    t.tree(name, x, y, size, rng.choice((0, 90, 180, 270)))


def bench(m, x, y, along):
    w, d = (0.07, 0.022) if along == 'x' else (0.022, 0.07)
    t.box(x - w / 2, y - d / 2, 0.01, x + w / 2, y + d / 2, 0.018, m['bench'], name='bench')


def park_40():
    # a large tree over a bench, and a flower bed
    rng, m = random.Random(40), materials()
    lawn(m)
    bed(m, rng, 0.7, 0.3, 0.14, 0.1)
    tree(rng, 'plant-03', 0.32, 0.42, 0.46)
    bench(m, 0.62, 0.58, 'x')
    for x, y in ((0.18, 0.82), (0.85, 0.12)):
        t.shrub(rng.choice(BUSHES), x, y, 0.1, 0.035, rng.choice((0, 90)))


def park_41():
    # a ring of gravel path round a flower bed, and trees in two corners
    rng, m = random.Random(41), materials()
    lawn(m)
    ring = t.circle(0.5, 0.45, 0.22, 48)
    hole = t.circle(0.5, 0.45, 0.15, 48)
    t.prism(ring, 0, 0.0015, m['path'], name='path')
    t.prism(hole, 0, 0.0025, m['lawn'], name='lawn_inside')
    bed(m, rng, 0.5, 0.45, 0.1, 0.1)
    tree(rng, 'plant-14', 0.13, 0.82, 0.24)
    tree(rng, 'plant-11', 0.82, 0.12, 0.3)
    bench(m, 0.5, 0.15, 'x')


def park_42():
    # a small pond with bushes round it and a flowering tree
    rng, m = random.Random(42), materials()
    lawn(m)
    pond = t.patch(0.45, 0.5, 0.24, 0.17, rng, wobble=0.15)
    t.prism(t.patch(0.45, 0.5, 0.27, 0.2, random.Random(4200), wobble=0.12), 0, 0.002, m['path'], name='pond_edge')
    t.prism(pond, 0, 0.003, m['water'], name='pond')
    for a in (0.6, 1.9, 3.3, 4.6):
        t.shrub(rng.choice(BUSHES), 0.45 + 0.31 * math.cos(a), 0.5 + 0.23 * math.sin(a), 0.09, 0.03, 0)
    tree(rng, 'plant-16', 0.82, 0.78, 0.26)


def park_43():
    # two rows of flower beds by a bench, and small trees
    rng, m = random.Random(43), materials()
    lawn(m)
    for y in (0.3, 0.66):
        bed(m, rng, 0.42, y, 0.22, 0.07)
    bench(m, 0.78, 0.48, 'y')
    tree(rng, 'plant-13', 0.85, 0.15, 0.24)
    tree(rng, 'plant-18', 0.12, 0.84, 0.22)


t.render_tiles(__file__, {40: park_40, 41: park_41, 42: park_42, 43: park_43})
