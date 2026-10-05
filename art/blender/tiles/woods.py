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

# Woods, tiles 21 to 37. The map generator gives a woods tile one of nine shapes by which of its
# four neighbours are woods too (TreeTable in the C# rules' MapGenerator): woods all round (37), open
# land on one side (29, 31, 33, 35), or on two sides that meet (30, 32, 34, 36). Each shape but 37
# has a second tile, eight below it, for the tiles of odd x + y, so two of a kind side by side
# differ.
#
# Where a neighbour is woods, the forest floor runs to the edge and the crowns are packed up to
# it, so two woods tiles read as one forest; every trunk stays inside its tile, so no crown is
# cut off where the neighbour is later cleared. Where a side is open, the floor gives way to land
# in a ragged edge that leaves every corner on the floor, so it meets the neighbours' floors, and
# bushes stand along it.

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402

TREES = ['plant-01', 'plant-02', 'plant-03', 'plant-04', 'plant-06', 'plant-07', 'plant-08', 'plant-09',
         'plant-10', 'plant-11', 'plant-13', 'plant-17']
AUTUMN = ['plant-05', 'plant-19']
BUSHES = ['plant-22', 'plant-23', 'plant-24', 'plant-26', 'plant-28', 'plant-29']

# each tile's open sides, as quarter turns of the canonical shape: one open side is the north,
# two are the north and east
ONE_OPEN = {29: 0, 35: 1, 33: 2, 31: 3}
TWO_OPEN = {30: 0, 36: 1, 34: 2, 32: 3}


def _edge(rng, setback, steps=32):
    # the floor's edge along an open north side, from the north-east corner to the north-west
    # one: in from the side by up to `setback`, ragged, and at the corners on the side itself
    phases = [rng.uniform(0, 2 * math.pi) for _ in range(3)]
    points = []
    for i in range(steps + 1):
        s = 1 - i / steps
        depth = setback * math.sin(math.pi * s) ** 0.6 * (1 + 0.25 * sum(
            math.sin(2 * math.pi * (k + 2) * s + p) / (k + 1) for k, p in enumerate(phases)))
        points.append((s, 1 - depth))
    return points


def _corner_edge(rng, reach, steps=32):
    # the floor's edge with the north and east sides open, from the south-east corner round to
    # the north-west one: a ragged quarter circle about the south-west corner, `reach` from it
    # at the middle and through both corners
    phases = [rng.uniform(0, 2 * math.pi) for _ in range(3)]
    points = []
    for i in range(steps + 1):
        a = math.pi / 2 * i / steps
        bulge = math.sin(2 * a)
        r = 1 - (1 - reach) * bulge ** 0.6 * (1 + 0.25 * sum(
            math.sin((k + 3) * 2 * a + p) / (k + 1) for k, p in enumerate(phases)))
        points.append((r * math.cos(a), r * math.sin(a)))
    return points


def floor_material():
    # the low leaves under the crowns: what shows between them, in their shade, reads as more of
    # the forest rather than as holes in it, along the tile's edges as much as anywhere
    return t.textured('forest_floor', 'foliage-leaves.png', 0.25, 0.25, shade=1.3)


def woods(quarters, open_sides, seed):
    def build():
        rng = random.Random(seed)
        ts.land()
        # the floor, which the trunks stand on, and the fringe of bushes beyond it on the land
        if open_sides == 0:
            floor = [(0, 0), (1, 0), (1, 1), (0, 1)]
            fringe = floor
        elif open_sides == 1:
            state = rng.getstate()
            floor = [(0, 0), (1, 0)] + _edge(rng, 0.3)
            rng.setstate(state)
            fringe = [(0, 0), (1, 0)] + _edge(rng, 0.14)
        else:
            state = rng.getstate()
            floor = [(0, 0)] + _corner_edge(rng, 0.66)
            rng.setstate(state)
            fringe = [(0, 0)] + _corner_edge(rng, 0.82)
        floor, fringe = ts.turn(floor, quarters), ts.turn(fringe, quarters)
        t.prism(floor, -0.1, 0.001, floor_material(), name='forest_floor')

        # Crowns packed over the floor, placed by where each shows once sheared, so they fill the
        # tile evenly up to every edge: the largest first, then smaller and smaller trees in the
        # holes left between them. Each crown overlaps its neighbours a little, stays in the tile,
        # and stands on a trunk on the floor. A tile of woods all round repeats across a whole
        # forest, so it keeps to green trees: a coloured one would mark out the grid.
        crowns = []
        tries = 8000
        for i in range(tries):
            size = 0.36 - 0.24 * i / tries
            lift = t.SHEAR * 0.8 * size
            cx = rng.uniform(max(size / 2, lift + 0.02) + 0.005, 1 - size / 2 - 0.005)
            cy = rng.uniform(max(size / 2, lift + 0.02) + 0.005, 1 - size / 2 - 0.005)
            if not ts.inside(floor, cx - lift, cy - lift):
                continue
            if any(math.hypot(cx - px, cy - py) < 0.7 * (size + ps) / 2 for px, py, ps in crowns):
                continue
            crowns.append((cx, cy, size))
        # low bushes in whatever holes the crowns still leave, so the floor shows only in specks
        undergrowth = []
        for _ in range(3000):
            size = rng.uniform(0.08, 0.13)
            cx = rng.uniform(size / 2 + 0.03, 1 - size / 2 - 0.005)
            cy = rng.uniform(size / 2 + 0.03, 1 - size / 2 - 0.005)
            if not ts.inside(floor, cx, cy):
                continue
            if any(math.hypot(cx - px, cy - py) < 0.75 * (size + ps) / 2 for px, py, ps in crowns + undergrowth):
                continue
            undergrowth.append((cx, cy, size))
        trees = []
        for cx, cy, size in crowns:
            lift = t.SHEAR * 0.8 * size
            name = rng.choice(AUTUMN) if open_sides and rng.random() < 0.05 else rng.choice(TREES)
            trees.append((name, cx - lift, cy - lift, size, rng.choice((0, 90, 180, 270))))
        for tree in trees:
            t.tree(*tree)
        placed = [(x, y, size) for _, x, y, size, _ in trees]
        for cx, cy, size in undergrowth:
            lift = t.SHEAR * 0.05
            t.shrub(rng.choice(BUSHES), cx - lift, cy - lift, size, 0.05, rng.choice((0, 90, 180, 270)))
            placed.append((cx - lift, cy - lift, size))

        # the woods to the west and north, where the sun comes from, shade this tile's trees as
        # they would their own: this tile's trees again, standing in for theirs
        opened = {ts.turn_side(side, quarters) for side in ('N', 'E')[:open_sides]}
        shifts = []
        if 'W' not in opened:
            shifts.append((-1, 0))
        if 'N' not in opened:
            shifts.append((0, 1))
        if len(shifts) == 2:
            shifts.append((-1, 1))
        for dx, dy in shifts:
            for name, x, y, size, turn in trees:
                for ob in t.tree(name, x + dx, y + dy, size, turn):
                    t.neighbours_shade(ob)

        # bushes along the open edge, on the land beyond the floor
        if open_sides:
            for _ in range(400):
                size = rng.uniform(0.08, 0.13)
                x, y = t.keep_inside(rng.uniform(0, 1), rng.uniform(0, 1), size / 2, 0.04, tiles=1)
                if not ts.inside(fringe, x, y) or ts.inside(floor, x, y):
                    continue
                if any(math.hypot(x - px, y - py) < 0.5 * (size + ps) for px, py, ps in placed):
                    continue
                placed.append((x, y, size))
                t.shrub(rng.choice(BUSHES), x, y, size, 0.04, rng.choice((0, 90, 180, 270)))
    return build


builders = {37: woods(0, 0, 37)}
for tile, quarters in ONE_OPEN.items():
    builders[tile] = woods(quarters, 1, tile)
    builders[tile - 8] = woods(quarters, 1, tile + 100)
for tile, quarters in TWO_OPEN.items():
    builders[tile] = woods(quarters, 2, tile)
    builders[tile - 8] = woods(quarters, 2, tile + 100)

t.render_tiles(__file__, builders)
