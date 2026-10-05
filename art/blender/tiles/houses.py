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

# The single-tile houses, 249 to 260, which a residential zone grows round its middle before it
# fills with a block, and falls back to when it empties. The zone picks a house by the land's
# value (PlaceResidential in the C# rules' Residential): three houses for each of four values, from
# worn bungalows on bare yards (249 to 251) through plain houses on lawns (252 to 254) and larger
# houses in gardens (255 to 257) to villas with pools (258 to 260). Each stands alone on its
# tile, with its yard and drive inside it, since its neighbours may be anything.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402

TREES = ['plant-01', 'plant-03', 'plant-06', 'plant-09', 'plant-11', 'plant-13']
SMALL_TREES = ['plant-12', 'plant-14', 'plant-16', 'plant-17', 'plant-18']
BUSHES = ['plant-22', 'plant-23', 'plant-24', 'plant-26', 'plant-28', 'plant-29']
HEDGES = ['plant-20', 'plant-21']


def materials():
    mat = ts.material
    return {
        'lawn': mat('lawn', lambda: t.textured('lawn', 'lawn-grass.png', 0.25, 0.25, tint='d8ffb0', shade=1.3)),
        'yard': mat('yard', lambda: t.textured('yard', 'bare-soil.png', 0.5, 0.5, shade=1.1)),
        'paving': mat('paving', lambda: t.textured('paving', 'paving-slabs.png', 0.1, 0.1, tint='fff4e4', shade=1.5)),
        'drive': mat('drive', lambda: t.weathered(t.textured('drive', 'asphalt.png', 0.25, 0.25, shade=1.2), dirt=0.1)),
        'white': mat('white_walls', lambda: t.textured('white_walls', 'white-facade.png', 0.7, 0.7, shade=1.25)),
        'cream': mat('cream_walls', lambda: t.textured('cream_walls', 'white-facade.png', 0.7, 0.7,
                                                       tint='ffe8b8', shade=1.3)),
        'blue': mat('blue_walls', lambda: t.textured('blue_walls', 'white-facade.png', 0.7, 0.7, tint='a8c0f0',
                                                     shade=1.3)),
        'brick': mat('brick_walls', lambda: t.textured('brick_walls', 'brick-facade.png', 0.7, 0.7, tint='ff8c78',
                                                       shade=2.0)),
        'grey': mat('grey_walls', lambda: t.weathered(t.textured('grey_walls', 'concrete-facade.png', 0.7, 0.7,
                                                                 shade=0.95), dirt=0.3)),
        'red_tiles': mat('red_tiles', lambda: t.textured('red_tiles', 'slate-roof.png', 0.2, 0.2, tint='ff7a5c',
                                                         shade=2.2)),
        'grey_slate': mat('grey_slate', lambda: t.textured('grey_slate', 'slate-roof.png', 0.2, 0.2, shade=1.4)),
        'brown_tiles': mat('brown_tiles', lambda: t.textured('brown_tiles', 'slate-roof.png', 0.2, 0.2,
                                                             tint='c89068', shade=1.8)),
        'rust': mat('rust', lambda: t.weathered(t.textured('rust', 'slate-roof.png', 0.15, 0.15, tint='d08858',
                                                           shade=1.4), dirt=0.35, dirt_scale=8)),
        'flat': mat('flat_roof', lambda: t.mottled('flat_roof', 'ecebe6', 'd8d6d0', 20)),
        'timber': mat('timber', lambda: t.plain('timber', '8a6a48', 0.9)),
        'fence': mat('fence', lambda: t.plain('fence', 'e8e4da', 0.7)),
        'pool': mat('pool', lambda: t.plain('pool', '3cb4e0', 0.08)),
        'glass': mat('conservatory', lambda: t.textured('conservatory', 'glass-curtain-wall.png', 0.4, 0.4,
                                                        rough=0.15, shade=0.7)),
    }


def ground(m, name):
    t.box(0, 0, -0.1, 1, 1, 0.001, m[name], name='ground')


def patch(m, name, x0, y0, x1, y1, z=0.002):
    t.box(x0, y0, 0, x1, y1, z, m[name], name=name)


def fence(m, x0, y0, x1, y1, height=0.018):
    # a low fence round the rectangle, inside the tile
    for a, b in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        ts.strip([a, b], 0.006, 0, height, m['fence'], name='fence')


def pool(m, x0, y0, x1, y1):
    patch(m, 'paving', x0 - 0.04, y0 - 0.04, x1 + 0.04, y1 + 0.04, 0.002)
    patch(m, 'pool', x0, y0, x1, y1, 0.003)


def tree(rng, names, x, y, size):
    x, y = t.keep_inside(x, y, size / 2, size * 0.8, tiles=1)
    t.tree(rng.choice(names), x, y, size, rng.choice((0, 90, 180, 270)))


def bush(rng, x, y, size=0.08):
    x, y = t.keep_inside(x, y, size / 2, 0.03, tiles=1)
    t.shrub(rng.choice(BUSHES), x, y, size, 0.03, rng.choice((0, 90, 180, 270)))


def hedge(rng, x0, y, x1):
    # a row of hedge pieces along x
    n = max(1, round((x1 - x0) / 0.1))
    for i in range(n):
        t.shrub(rng.choice(HEDGES), x0 + (i + 0.5) * (x1 - x0) / n, y, (x1 - x0) / n * 1.1, 0.03)


# --- low value: worn bungalows on bare yards ---

def house_249():
    rng, m = random.Random(249), materials()
    ground(m, 'yard')
    t.house(0.12, 0.16, 0.5, 0.44, 0.08, 0.06, m['grey'], m['rust'])
    t.house(0.6, 0.52, 0.78, 0.66, 0.06, 0.03, m['timber'], m['rust'], ridge='y')
    t.car('car-14', 0.72, 0.24, 20)
    for x, y in ((0.2, 0.8), (0.85, 0.85)):
        bush(rng, x, y, 0.1)


def house_250():
    rng, m = random.Random(250), materials()
    ground(m, 'yard')
    patch(m, 'lawn', 0.05, 0.6, 0.6, 0.95)
    t.house(0.1, 0.12, 0.42, 0.36, 0.07, 0.05, m['cream'], m['brown_tiles'], ridge='y')
    t.house(0.5, 0.18, 0.76, 0.38, 0.07, 0.05, m['grey'], m['rust'])
    t.car('car-08', 0.3, 0.52, 90)
    tree(rng, TREES, 0.75, 0.66, 0.26)


def house_251():
    rng, m = random.Random(251), materials()
    ground(m, 'yard')
    t.house(0.1, 0.14, 0.66, 0.38, 0.08, 0.06, m['brick'], m['grey_slate'])
    patch(m, 'lawn', 0.08, 0.5, 0.55, 0.9)
    fence(m, 0.06, 0.48, 0.58, 0.92)
    bush(rng, 0.2, 0.7)
    bush(rng, 0.42, 0.78)
    t.car('car-17', 0.8, 0.28, 0)


# --- middle value: plain houses on lawns ---

def house_252():
    rng, m = random.Random(252), materials()
    ground(m, 'lawn')
    t.house(0.14, 0.4, 0.56, 0.72, 0.1, 0.08, m['white'], m['red_tiles'])
    patch(m, 'drive', 0.66, 0.06, 0.86, 0.6, 0.003)
    t.car('car-03', 0.76, 0.3, 0)
    patch(m, 'paving', 0.3, 0.06, 0.38, 0.4)
    hedge(rng, 0.06, 0.06, 0.26)
    tree(rng, SMALL_TREES, 0.2, 0.82, 0.2)


def house_253():
    rng, m = random.Random(253), materials()
    ground(m, 'lawn')
    t.house(0.12, 0.16, 0.48, 0.56, 0.1, 0.08, m['blue'], m['grey_slate'], ridge='y')
    patch(m, 'drive', 0.56, 0.12, 0.76, 0.5, 0.003)
    t.car('car-10', 0.66, 0.3, 0)
    tree(rng, TREES, 0.72, 0.72, 0.3)
    bush(rng, 0.2, 0.75)
    bush(rng, 0.38, 0.84)


def house_254():
    rng, m = random.Random(254), materials()
    ground(m, 'lawn')
    t.house(0.1, 0.38, 0.56, 0.64, 0.1, 0.07, m['cream'], m['brown_tiles'])
    t.house(0.1, 0.12, 0.32, 0.38, 0.1, 0.07, m['cream'], m['brown_tiles'], ridge='y')
    patch(m, 'paving', 0.38, 0.12, 0.62, 0.3)
    t.car('car-05', 0.75, 0.25, 90)
    fence(m, 0.04, 0.04, 0.96, 0.96)
    tree(rng, SMALL_TREES, 0.76, 0.76, 0.22)


# --- higher value: larger houses in gardens ---

def house_255():
    rng, m = random.Random(255), materials()
    ground(m, 'lawn')
    t.house(0.1, 0.36, 0.6, 0.66, 0.12, 0.08, m['brick'], m['grey_slate'])
    t.house(0.6, 0.36, 0.8, 0.56, 0.08, 0.05, m['brick'], m['grey_slate'], ridge='y')
    patch(m, 'drive', 0.62, 0.06, 0.8, 0.36, 0.003)
    t.car('car-01', 0.71, 0.2, 0)
    patch(m, 'paving', 0.14, 0.18, 0.48, 0.34)
    for x in (0.18, 0.44):
        bush(rng, x, 0.1, 0.07)
    tree(rng, TREES, 0.2, 0.84, 0.3)
    tree(rng, SMALL_TREES, 0.6, 0.84, 0.22)


def house_256():
    rng, m = random.Random(256), materials()
    ground(m, 'lawn')
    t.house(0.12, 0.2, 0.56, 0.58, 0.12, 0.08, m['white'], m['red_tiles'], hip=True)
    patch(m, 'paving', 0.62, 0.08, 0.72, 0.6)
    for y in (0.7, 0.82):
        for x in (0.15, 0.3, 0.45):
            t.shrub(rng.choice(['plant-32', 'plant-35', 'plant-37']), x, y, 0.06, 0.012)
    tree(rng, TREES, 0.82, 0.7, 0.3)
    tree(rng, SMALL_TREES, 0.82, 0.24, 0.2)


def house_257():
    rng, m = random.Random(257), materials()
    ground(m, 'lawn')
    t.house(0.1, 0.12, 0.34, 0.62, 0.12, 0.08, m['cream'], m['red_tiles'], ridge='y')
    t.house(0.34, 0.42, 0.66, 0.62, 0.12, 0.08, m['cream'], m['red_tiles'])
    t.box(0.4, 0.26, 0, 0.6, 0.42, 0.07, m['glass'], name='conservatory')
    patch(m, 'paving', 0.4, 0.12, 0.66, 0.26)
    hedge(rng, 0.74, 0.08, 0.94)
    tree(rng, TREES, 0.8, 0.6, 0.3)
    bush(rng, 0.2, 0.82)


# --- high value: villas with pools ---

def house_258():
    rng, m = random.Random(258), materials()
    ground(m, 'lawn')
    t.house(0.1, 0.42, 0.62, 0.74, 0.12, 0.09, m['white'], m['red_tiles'], hip=True)
    pool(m, 0.18, 0.12, 0.5, 0.28)
    hedge(rng, 0.06, 0.92, 0.6)
    tree(rng, TREES, 0.8, 0.7, 0.32)
    tree(rng, SMALL_TREES, 0.78, 0.22, 0.22)


def house_259():
    rng, m = random.Random(259), materials()
    ground(m, 'lawn')
    t.building([(0.1, 0.4), (0.66, 0.4), (0.66, 0.66), (0.1, 0.66)], 0.13, m['white'], m['flat'], m['fence'])
    t.building([(0.1, 0.18), (0.32, 0.18), (0.32, 0.4), (0.1, 0.4)], 0.09, m['white'], m['flat'], m['fence'])
    pool(m, 0.42, 0.12, 0.74, 0.28)
    tree(rng, SMALL_TREES, 0.82, 0.8, 0.24)
    tree(rng, SMALL_TREES, 0.2, 0.86, 0.22)
    bush(rng, 0.86, 0.46)


def house_260():
    rng, m = random.Random(260), materials()
    ground(m, 'lawn')
    t.house(0.1, 0.52, 0.66, 0.74, 0.12, 0.08, m['cream'], m['brown_tiles'])
    t.house(0.1, 0.14, 0.3, 0.52, 0.12, 0.08, m['cream'], m['brown_tiles'], ridge='y')
    pool(m, 0.42, 0.18, 0.66, 0.38)
    for x, y in ((0.82, 0.2), (0.84, 0.5)):
        tree(rng, TREES, x, y, 0.26)
    hedge(rng, 0.06, 0.92, 0.66)


t.render_tiles(__file__, {249: house_249, 250: house_250, 251: house_251, 252: house_252, 253: house_253,
                          254: house_254, 255: house_255, 256: house_256, 257: house_257, 258: house_258,
                          259: house_259, 260: house_260})
