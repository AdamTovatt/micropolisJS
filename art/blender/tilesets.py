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

# What the single-tile sets in tiles/ share: the land and the water every map is made of, and
# the shapes that must meet where two tiles touch. A tile is drawn beside any other, so whatever
# reaches a tile's edge (land, water, a shore, a road) meets it at the same place and height in
# every tile, and every texture repeats a whole number of times across a tile.
#
# The game's map is y down; these scenes are y up, as tileart's are, so the game's north
# neighbour (y - 1) is the one past the top edge here.

import math
import random

import bmesh
import bpy

import tileart as t

WATER_Z = -0.025     # the water's surface, below the land so the banks slope down to it
SHORE = 0.25         # how far into a water tile the land reaches along a shore
BANK = 0.11          # how far a bank slopes out from the land's edge into the water
PAST = 0.08          # how far below-ground shapes run past the tile, which the shear pulls in


def material(name, make):
    # the scene's material called name, made by make() the first time it is asked for
    return bpy.data.materials.get(name) or make()


def land_material():
    # the bare land of tile 0, which every other set's land matches
    return material('land', lambda: t.textured('land', 'land-grass.png', 1.0, 1.0, tint='c4f0a0', shade=1.4))


def water_material():
    return material('water', lambda: t.textured('water', 'river-water.png', 1.0, 1.0, rough=0.4,
                                                tint='b8dcff', shade=1.0))


def bank_material():
    return material('bank', lambda: t.textured('bank', 'riverbank.png', 0.25, 0.25, shade=1.25))


def land(material=None, top=0.0):
    # the whole tile as land
    return t.box(0, 0, top - 0.1, 1, 1, top, material or land_material(), name='land')


def water(material=None):
    # the whole tile as water, run past the tile so the shear leaves no gap at its edges
    return t.box(-PAST, -PAST, WATER_Z - 0.1, 1 + PAST, 1 + PAST, WATER_Z, material or water_material(), name='water')


# --- orientation ---
# A shape is drawn once, for one side, and turned to the others: TURNS maps a side to the
# number of quarter turns, anticlockwise about the tile's middle, from the north side.

TURNS = {'N': 0, 'W': 1, 'S': 2, 'E': 3}


def turn_side(side, quarters):
    # the side that `side` becomes after `quarters` quarter turns anticlockwise
    order = 'NWSE'
    return order[(order.index(side) + quarters) % 4]


def turn(points, quarters):
    out = []
    for x, y in points:
        for _ in range(quarters % 4):
            x, y = 1 - y, x
        out.append((x, y))
    return out


def inside(polygon, x, y):
    # whether (x, y) is inside the simple polygon, by counting the edges a ray east crosses
    hit = False
    for (x0, y0), (x1, y1) in zip(polygon, polygon[1:] + polygon[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


# --- shores ---

def _wiggle(rng, amplitude, waves=2):
    # a smooth wobble along a shore, from 0 to 1, that is zero and level at both ends, so the
    # shore meets its neighbour's straight on
    phases = [rng.uniform(0, 2 * math.pi) for _ in range(waves)]
    sizes = [rng.uniform(0.4, 1.0) * amplitude / (k + 1) for k in range(waves)]

    def f(s):
        envelope = math.sin(math.pi * s) ** 2
        return envelope * sum(a * math.sin(2 * math.pi * (k + 1) * s + p) for k, (a, p) in enumerate(zip(sizes, phases)))
    return f


def straight_shore(rng, steps=40):
    # land along the north side: the shore runs west to east SHORE in from the top edge
    f = _wiggle(rng, 0.05)
    return [(i / steps, 1 - SHORE + f(i / steps)) for i in range(steps + 1)]


def corner_shore(rng, steps=40):
    # water in the south-west corner, land along the north and east sides: the shore is a
    # quarter circle round the south-west corner from the west edge to the south edge, which
    # meets each edge square on, where the straight shores beside it do
    f = _wiggle(rng, 0.06)
    r = 1 - SHORE
    return [((r + f(i / steps)) * math.sin(math.pi / 2 * i / steps), (r + f(i / steps)) * math.cos(math.pi / 2 * i / steps))
            for i in range(steps + 1)]


def _extend(points):
    # run a shore on past the edges it starts and ends on, square to them
    def past(p):
        x, y = p
        if x < 0.001:
            return (-PAST, y)
        if x > 0.999:
            return (1 + PAST, y)
        if y < 0.001:
            return (x, -PAST)
        return (x, 1 + PAST)
    return [past(points[0])] + points + [past(points[-1])]


def shore(points, land_corners, land_m, bank_m):
    # Land on one side of the shore `points` (from edge to edge, with the land on its left),
    # with a bank sloping from the land's edge down under the water, which water() lays.
    # land_corners are the tile's corners on the land side, in order from the shore's end
    # round to its start.
    t.prism(points + land_corners, -0.1, 0, land_m, name='land')
    ext = _extend(points)
    outer = []
    for i, (x, y) in enumerate(ext):
        a, b = ext[max(i - 1, 0)], ext[min(i + 1, len(ext) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy)
        outer.append((x + dy / n * BANK, y - dx / n * BANK))  # to the right, into the water
    bm = bmesh.new()
    uvs = bm.loops.layers.uv.new()
    # only the bank's foot, under the water, runs past the tile: its top stays on the edge, where
    # the land's does
    top = [bm.verts.new((x, y, 0.0)) for x, y in [points[0]] + points + [points[-1]]]
    low = [bm.verts.new((x, y, WATER_Z - 0.012)) for x, y in outer]
    for i in range(len(ext) - 1):
        f = bm.faces.new([top[i], low[i], low[i + 1], top[i + 1]])
        for loop in f.loops:
            loop[uvs].uv = (loop.vert.co.x, loop.vert.co.y)
    t._link('bank', bm, [bank_m])


# --- transport ---
# Roads, rails and power lines run down the middle of a tile to the middle of each side they
# connect to: a straight piece, a bend round the corner between two sides, a T or a crossing.
# A piece names the sides it reaches, from 'NESW'. Seen across a tile's edge, every piece that
# reaches it has the same width, markings and height there, so any two meet.

SIDES = {'N': (0, 1), 'E': (1, 0), 'S': (0, -1), 'W': (-1, 0)}
ORDER = 'NESW'   # clockwise

ROAD = 0.2       # half the asphalt's width: two lanes, each wide enough for a car and a half
KERB = 0.018     # the kerbstones along the asphalt's edges
WALK = 0.1       # the pavement beyond them; the verge beyond that is land
FILLET = 0.15    # the radius of the asphalt's corner where two arms of a junction meet
LANE = 0.1       # a lane's middle, from the road's
LINE = 0.016     # the width of a painted line
PERIOD, DASH = 0.125, 0.07   # a centre line's dashes, eight to a tile, centred in each eighth
DECK_Z = 0.016   # the top of a bridge's deck: just above the ground, so it shades the water
                 # below it but casts next to nothing on the land where it ends
DECK_TOP = DECK_Z + 0.018  # the top of its railings


def deck_past(side):
    # How far a bridge's deck runs past the tile's edge on `side`. The shear carries what stands
    # up and to the right, so past the west and south edges the deck must run on far enough that
    # its sheared top still reaches the frame; past the east and north edges, whatever ran on
    # would show only in the shadow it cast on the land beyond the bridge's end, so it stops.
    return t.SHEAR * DECK_TOP + 0.005 if side in 'WS' else 0.0


def is_bend(sides):
    return len(sides) == 2 and set(sides) not in ({'N', 'S'}, {'E', 'W'})


def corner_of(a, b):
    # the tile's corner between two neighbouring sides
    (ax, ay), (bx, by) = SIDES[a], SIDES[b]
    return ((1 + ax + bx) / 2, (1 + ay + by) / 2)


def arms_outline(sides, half, fillet, steps=8):
    # The outline, clockwise, of a band `half` either side of the tile's middle toward each of
    # `sides`, joined in the middle. Where two arms meet at a right angle their inside corner is
    # rounded with radius `fillet`.
    points = []
    for i, s in enumerate(ORDER):
        n = ORDER[(i + 1) % 4]
        (dx, dy), (nx, ny) = SIDES[s], SIDES[n]
        if s in sides:
            px, py = dy, -dx  # along the edge, clockwise
            cx, cy = 0.5 + dx / 2, 0.5 + dy / 2
            points += [(cx - px * half, cy - py * half), (cx + px * half, cy + py * half)]
        corner = (0.5 + (dx + nx) * half, 0.5 + (dy + ny) * half)
        if s in sides and n in sides:
            centre = (corner[0] + (dx + nx) * fillet, corner[1] + (dy + ny) * fillet)
            a0, a1 = math.atan2(-ny, -nx), math.atan2(-dy, -dx)
            sweep = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
            points += [(centre[0] + fillet * math.cos(a0 + sweep * k / steps),
                        centre[1] + fillet * math.sin(a0 + sweep * k / steps)) for k in range(steps + 1)]
        else:
            points.append(corner)
    return points


def _bend_angles(sides):
    # a bend's corner, and the angles from it of the two edges it runs between
    cx, cy = corner_of(*sides)
    a0, a1 = math.atan2(0, 1 - 2 * cx), math.atan2(1 - 2 * cy, 0)
    sweep = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
    return (cx, cy), a0, sweep


def bend_band(sides, r0, r1, steps=24):
    # the band between radii r0 and r1 round the corner between a bend's two sides
    (cx, cy), a0, sweep = _bend_angles(sides)
    outer = [(cx + r1 * math.cos(a0 + sweep * k / steps), cy + r1 * math.sin(a0 + sweep * k / steps))
             for k in range(steps + 1)]
    inner = [(cx + r0 * math.cos(a0 + sweep * k / steps), cy + r0 * math.sin(a0 + sweep * k / steps))
             for k in reversed(range(steps + 1))]
    return outer + inner


def bend_arc(sides, r, steps=24):
    # the line at radius r round a bend's corner, from one edge to the other
    (cx, cy), a0, sweep = _bend_angles(sides)
    return [(cx + r * math.cos(a0 + sweep * k / steps), cy + r * math.sin(a0 + sweep * k / steps))
            for k in range(steps + 1)]


def _directions(points):
    # the unit direction of the line `points` at each point: between its neighbours in the
    # middle, and at the ends a second-order estimate, so a line that bends, such as an arc,
    # still ends square to the edge it meets rather than along its first chord
    out = []
    for i in range(len(points)):
        if len(points) < 3 or 0 < i < len(points) - 1:
            a, b = points[max(i - 1, 0)], points[min(i + 1, len(points) - 1)]
            dx, dy = b[0] - a[0], b[1] - a[1]
        else:
            p0, p1, p2 = (points[0], points[1], points[2]) if i == 0 else (points[-1], points[-2], points[-3])
            sign = 1 if i == 0 else -1
            dx = sign * (-3 * p0[0] + 4 * p1[0] - p2[0])
            dy = sign * (-3 * p0[1] + 4 * p1[1] - p2[1])
        n = math.hypot(dx, dy)
        out.append((dx / n, dy / n))
    return out


def strip(points, width, z0, z1, m, name='line'):
    # a band `width` wide along the line `points`, such as a painted line or a rail
    left, right = [], []
    for (x, y), (dx, dy) in zip(points, _directions(points)):
        ox, oy = -dy * width / 2, dx * width / 2
        left.append((x + ox, y + oy))
        right.append((x - ox, y - oy))
    return t.prism(left + list(reversed(right)), z0, z1, m, name=name)


def along(points, s):
    # the point and direction at distance s along the line `points`
    for a, b in zip(points, points[1:]):
        step = math.dist(a, b)
        if s <= step or b is points[-1]:
            f = s / step
            return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f), ((b[0] - a[0]) / step, (b[1] - a[1]) / step)
        s -= step


def length(points):
    return sum(math.dist(a, b) for a, b in zip(points, points[1:]))


def dashed(points, m, z, width=LINE, period=PERIOD, dash=DASH):
    # a dashed line along `points`, its dashes centred in each `period` from its start; a line
    # whose length is no whole number of periods spreads them to fit, so a dash sits the same
    # way at each end, as on the straight pieces it joins
    total = length(points)
    count = max(1, round(total / period))
    period = total / count
    dash = dash * period / PERIOD
    for k in range(count):
        s0 = k * period + (period - dash) / 2
        pts = [along(points, s0 + dash * j / 4)[0] for j in range(5)]
        strip(pts, width, z - 0.001, z, m, name='dash')


def road_materials():
    return {
        'asphalt': material('asphalt', lambda: t.weathered(
            t.textured('asphalt', 'asphalt.png', 0.25, 0.25, shade=1.1), dirt=0.12, dirt_scale=3)),
        'pavement': material('pavement', lambda: t.textured('pavement', 'paving-slabs.png', 0.125, 0.125,
                                                           tint='fff8ec', shade=1.5)),
        'kerb': material('kerb', lambda: t.plain('kerb', 'c9c5bc')),
        'paint': material('paint', lambda: t.plain('paint', 'f0efe8', 0.6)),
    }


def road(sides, base=0.0):
    # The pavements, kerbs, asphalt and centre line of a road piece reaching `sides`, laid on
    # ground at height base. The line runs down the middle of a straight or a bend, and of a
    # T's through road; a crossing's arms leave the middle clear.
    m = road_materials()
    layers = [(ROAD + WALK, m['pavement'], 0.0015), (ROAD + KERB, m['kerb'], 0.002), (ROAD, m['asphalt'], 0.0025)]
    if is_bend(sides):
        for half, mat, z in layers:
            t.prism(bend_band(sides, 0.5 - half, 0.5 + half), base, base + z, mat, name='road')
        dashed(bend_arc(sides, 0.5), m['paint'], base + 0.0035)
        return
    for half, mat, z in layers:
        t.prism(arms_outline(sides, half, max(FILLET - (half - ROAD), 0.01)), base, base + z, mat, name='road')
    through = [s for s in ('N', 'E') if s in sides and _opposite(s) in sides]
    if len(sides) <= 3:
        for s in through:
            dx, dy = SIDES[s]
            dashed([(0.5 - dx / 2, 0.5 - dy / 2), (0.5 + dx / 2, 0.5 + dy / 2)], m['paint'], base + 0.0035)


def _opposite(s):
    return ORDER[(ORDER.index(s) + 2) % 4]


def _mid(s):
    dx, dy = SIDES[s]
    return (0.5 + dx / 2, 0.5 + dy / 2)


def lanes(sides):
    # Each lane of a road piece that traffic moves along, as a line from the edge it enters by
    # to the edge it leaves by, on the right of the road: both ways along a straight or round a
    # bend, and along the through road of a T or, at a crossing, the east-west one.
    if is_bend(sides):
        pairs = [tuple(sides), tuple(reversed(sides))]
    else:
        through = [s for s in ('E', 'N') if s in sides and _opposite(s) in sides][0]
        pairs = [(through, _opposite(through)), (_opposite(through), through)]
    paths = []
    for a, b in pairs:
        tx, ty = -SIDES[a][0], -SIDES[a][1]
        entry = (_mid(a)[0] + ty * LANE, _mid(a)[1] - tx * LANE)
        if is_bend(sides):
            (cx, cy), _, _ = _bend_angles(sides)
            arc = bend_arc(sides, math.dist(entry, (cx, cy)))
            paths.append(arc if a in 'NS' else list(reversed(arc)))
        else:
            paths.append([entry, (entry[0] + tx, entry[1] + ty)])
    return paths


# a power line's wires: three to a run, the north-south runs a little higher than the east-west
# ones so that where they meet at a pole they pass rather than touch
WIRE_Z = {'NS': 0.55, 'EW': 0.51}
ARM = 0.085      # a crossarm's half-length, the outer wires' distance from the middle
WIRE_R = 0.005


def power_materials():
    return {
        'pole': material('pole', lambda: t.mottled('pole', '6e5640', '54412f', scale=40)),
        'wire': material('wire', lambda: t.plain('wire', '2c2c2c', 0.5, 0.6)),
        'insulator': material('insulator', lambda: t.plain('insulator', 'd8d4c8', 0.4)),
    }


def power_line(sides, pole=True, base=0.0):
    # A power line reaching `sides`, its wires at WIRE_Z above ground at height base. With a pole,
    # each wire runs from the pole's crossarm out to the edge; without one, as where the line
    # crosses a road, it runs straight across the tile. Each runs on past the edge by its sheared
    # lift, where the next tile's copy takes over (tileart.spans_edge).
    m = power_materials()
    runs = {axis: [s for s in sides if s in axis] for axis in WIRE_Z}
    for axis, ends in runs.items():
        if not ends:
            continue
        z = base + WIRE_Z[axis]
        past = t.SHEAR * z + 0.05
        across = (1, 0) if axis == 'NS' else (0, 1)  # the crossarm's direction
        for offset in (-ARM, 0.0, ARM):
            ox, oy = across[0] * offset, across[1] * offset
            if pole:
                for s in ends:
                    dx, dy = SIDES[s]
                    p = (0.5 + ox, 0.5 + oy, z)
                    q = (0.5 + ox + dx * (0.5 + past), 0.5 + oy + dy * (0.5 + past), z)
                    t.spans_edge(t.strut(p, q, WIRE_R, m['wire'], 6))
            else:
                dx, dy = SIDES[ends[0]]
                p = (0.5 + ox - dx * (0.5 + past), 0.5 + oy - dy * (0.5 + past), z)
                q = (0.5 + ox + dx * (0.5 + past), 0.5 + oy + dy * (0.5 + past), z)
                t.spans_edge(t.strut(p, q, WIRE_R, m['wire'], 6))
        if pole:
            ax, ay = across[0] * (ARM + 0.015), across[1] * (ARM + 0.015)
            t.strut((0.5 - ax, 0.5 - ay, z - 0.012), (0.5 + ax, 0.5 + ay, z - 0.012), 0.008, m['pole'], 6)
            for offset in (-ARM, 0.0, ARM):
                cx, cy = 0.5 + across[0] * offset, 0.5 + across[1] * offset
                t.cylinder(cx, cy, z - 0.006, z, 0.007, m['insulator'], 8)
    if pole:
        top = base + max(WIRE_Z[axis] for axis, ends in runs.items() if ends) + 0.03
        t.cylinder(0.5, 0.5, base, top, 0.012, m['pole'], 10)


# A railway is one track: ballast under sleepers under two rails. It all lies low enough to be
# ground, the bed and the sleepers below a road's pavement and the rails above its asphalt, so
# that where a road crosses the track it covers the bed and the rails show through it.
BALLAST = 0.12          # half the bed's width
GAUGE = 0.045           # a rail's distance from the track's middle
SLEEPER_HALF = 0.075    # half a sleeper's length, across the track
SLEEPER_STEP = 0.0625   # sixteen sleepers to a tile
BED_Z, SLEEPER_Z, RAIL_Z = 0.001, 0.0013, 0.004


def rail_materials():
    return {
        'ballast': material('ballast', lambda: t.textured('ballast', 'track-ballast.png', 0.125, 0.125,
                                                          tint='e4e0d8', shade=1.25)),
        'sleeper': material('sleeper', lambda: t.plain('sleeper', '3a2a1e', 0.9)),
        # polished steel, but not so metallic that it mirrors the dim sky and goes dark
        'rail': material('rail', lambda: t.plain('rail', 'd8d8d4', 0.3, 0.3)),
    }


def track_lines(sides):
    # the middle line of each track a rail piece lays: one along a straight or round a bend; a T's
    # through track, and a bend from its third side into each end of it; a crossing's two tracks
    if is_bend(sides):
        return [bend_arc(sides, 0.5)]
    lines = [[_mid(s), _mid(_opposite(s))] for s in ('E', 'N') if s in sides and _opposite(s) in sides]
    if len(sides) == 3:
        branch = [s for s in sides if _opposite(s) not in sides][0]
        lines += [bend_arc((branch, s), 0.5) for s in sides if s != branch]
    return lines


def offset(points, d):
    # the line `points` moved sideways by d, to its left
    return [(x - dy * d, y + dx * d) for (x, y), (dx, dy) in zip(points, _directions(points))]


def _run_on(line, past):
    # a straight line from edge to edge, run on past each edge by past(side) of that edge
    (x0, y0), (x1, y1) = line
    n = math.dist(line[0], line[1])
    dx, dy = (x1 - x0) / n, (y1 - y0) / n
    start_side = next(s for s, v in SIDES.items() if v == (round(-dx), round(-dy)))
    end_side = next(s for s, v in SIDES.items() if v == (round(dx), round(dy)))
    a, b = past(start_side), past(end_side)
    return [(x0 - dx * a, y0 - dy * a), (x1 + dx * b, y1 + dy * b)]


def track(sides, base=0.0, past=None):
    # The track of a rail piece reaching `sides`, laid on ground at height base. A track on a
    # bridge's deck stands, so its straight runs on past the edges by past(side) and crosses them
    # by design (tileart.spans_edge).
    m = rail_materials()
    for i, line in enumerate(track_lines(sides)):
        dz = i * 0.0001  # crossing tracks at slightly different heights, never coplanar
        run = _run_on(line, past) if past else line
        parts = [strip(run, 2 * BALLAST, base, base + BED_Z + dz, m['ballast'], name='ballast')]
        count = max(1, round(length(line) / SLEEPER_STEP))
        for k in range(count):
            (x, y), (dx, dy) = along(line, (k + 0.5) * length(line) / count)
            ends = [(x + dy * SLEEPER_HALF, y - dx * SLEEPER_HALF), (x - dy * SLEEPER_HALF, y + dx * SLEEPER_HALF)]
            strip(ends, 0.022, base, base + SLEEPER_Z + dz, m['sleeper'], name='sleeper')
        for side in (-1, 1):
            parts.append(strip(offset(run, side * GAUGE), 0.012, base, base + RAIL_Z + dz, m['rail'], name='rail'))
        if past:
            for p in parts:
                t.spans_edge(p)


CARS = [f'car-{i:02d}' for i in range(1, 22) if f'car-{i:02d}' not in t.VANS]
TRAFFIC = {'light': (1, 0.0, 0.1), 'heavy': (2, 0.3, 0.05)}  # cars to a lane, their spacing, a frame's step


def _heading(direction):
    return math.degrees(math.atan2(-direction[0], direction[1]))


def _car_fits(name, point, direction, base):
    h, w, d = t.car_size(name)
    a = math.radians(_heading(direction))
    lift = t.SHEAR * (base + h)
    for u, v in [(-1, -1), (1, -1), (1, 1), (-1, 1)]:
        x = point[0] + u * w / 2 * math.cos(a) - v * d / 2 * math.sin(a) + lift
        y = point[1] + u * w / 2 * math.sin(a) + v * d / 2 * math.cos(a) + lift
        if not (0.004 <= x <= 0.996 and 0.004 <= y <= 0.996):
            return False
    return True


def traffic(paths, density, frame, seed, base=0.0):
    # The cars of one of a road's four traffic frames, on ground at height base: in each lane, as
    # many as `density` gives, which move on by a step each frame and are back where they began
    # after the fourth, the way the game cycles the frames. Every car stays inside the tile in
    # every frame. The cars and where they start come from seed alone, so all four frames show
    # the same cars.
    rng = random.Random(seed)
    count, spacing, step = TRAFFIC[density]
    for path in paths:
        names = rng.sample(CARS, count)
        total = length(path)
        for n in range(count, 0, -1):
            starts = [i / 100 for i in range(101)
                      if all(i / 100 + j * spacing + k * step <= total and
                             _car_fits(names[j], *along(path, i / 100 + j * spacing + k * step), base)
                             for j in range(n) for k in range(4))]
            if starts:
                break
        if not starts:
            continue
        s0 = rng.choice(starts)
        for j in range(n):
            point, direction = along(path, s0 + j * spacing + frame * step)
            t.car(names[j], point[0], point[1], _heading(direction), base=base)

