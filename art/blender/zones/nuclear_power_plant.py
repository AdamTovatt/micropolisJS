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

# The nuclear power plant, tiles 811 to 826, a 4x4 zone: two cooling towers along the north, the
# reactor with the atom on its roof, as the original's, a turbine hall to the east and a
# switchyard to the west. The atom stands in the tile animated as the plant's swirl (820,
# cycling through 952 to 955). Three orbits sixty degrees apart look the same again after a
# sixty-degree turn, so each frame turns them fifteen degrees and the fourth runs on into the
# first.

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

REACTOR = (1.45, 1.42)


def materials():
    return {
        'yard': t.concrete_yard(),
        'grass': t.textured('grass', 'lawn-grass.png', 0.5, 0.5, tint='c8e8a0', shade=1.1),
        'tower': t.weathered(t.mottled('tower', 'd4d2cc', 'bab8b2', 12), dirt=0.2),
        'tower_inside': t.plain('tower_inside', '3a3a3a', 0.9),
        'containment': t.mottled('containment', 'e4e2dc', 'd0cec8', 12),
        'grey_facade': t.textured('grey_facade', 'concrete-facade.png', 0.85, 0.85, shade=1.0),
        'roof': t.weathered(t.mottled('roof', '8c8c88', '72726e', 14), dirt=0.2),
        'rim': t.plain('rim', '8c8a84', 0.8),
        'atom': t.plain('atom', 'e8c030', 0.5),
        'core': t.plain('core', 'd83020', 0.5),
        'steel': t.plain('steel', '7a8088', 0.5, 0.5),
        'transformer': t.plain('transformer', '6a7a6a', 0.6, 0.3),
        'gravel': t.textured('gravel', 'track-ballast.png', 0.3, 0.3, tint='e0dcd4', shade=1.1),
        'steam': t.haze('steam', 'f4f4f2', 'dcdcda'),
    }


def cooling_tower(x, y, m):
    # a hyperboloid shell, turned from a few tapering sections, with its dark open top and a
    # little steam over it
    profile = [(0.0, 0.56), (0.25, 0.46), (0.48, 0.41), (0.62, 0.42), (0.7, 0.45)]
    for (z0, r0), (z1, r1) in zip(profile, profile[1:]):
        t.frustum(x, y, z0, z1, r0, r1, m['tower'], 48)
    t.cylinder(x, y, 0.66, 0.67, 0.42, m['tower_inside'], 48)
    for k, (dx, dy, r) in enumerate(((0.0, 0.0, 0.2), (0.09, 0.06, 0.15), (-0.08, 0.07, 0.13))):
        t.sphere(x + dx, y + dy, 0.74 + k * 0.03, r, m['steam'], shadow=False)


def build(frame):
    rng, m = random.Random(811), materials()
    t.box(0, 0, -0.05, 4, 4, 0, m['yard'], name='yard')
    for x0, y0, x1, y1 in ((0.1, 2.3, 0.7, 3.9), (3.45, 2.3, 3.9, 3.9)):
        t.box(x0, y0, 0, x1, y1, 0.001, m['grass'], name='lawn')

    # --- the cooling towers ---
    for x in (1.4, 2.78):
        cooling_tower(x, 2.95, m)

    # --- the reactor, its atom and the turbine hall ---
    x, y = REACTOR
    t.cylinder(x, y, 0, 0.2, 0.38, m['containment'], 64)
    t.cylinder(x, y, 0.2, 0.215, 0.34, m['containment'], 64)
    z = 0.215
    turn = 0 if frame is None else frame * 15
    for k in range(3):
        a = math.radians(turn + k * 60)
        pts = [(x + 0.24 * math.cos(s) * math.cos(a) - 0.08 * math.sin(s) * math.sin(a),
                y + 0.24 * math.cos(s) * math.sin(a) + 0.08 * math.sin(s) * math.cos(a))
               for s in (i * 2 * math.pi / 24 for i in range(25))]
        for p, q in zip(pts, pts[1:]):
            t.mark(t.strut((p[0], p[1], z + 0.004 + k * 0.002), (q[0], q[1], z + 0.004 + k * 0.002), 0.008,
                           m['atom']), 'atom')
    t.mark(t.cylinder(x, y, z, z + 0.012, 0.04, m['core'], 20), 'atom_core')
    t.building([(2.2, 0.4), (3.8, 0.4), (3.8, 1.95), (2.2, 1.95)], 0.2, m['grey_facade'], m['roof'], m['rim'])
    t.strut((1.83, 1.42, 0.1), (2.2, 1.42, 0.1), 0.04, m['steel'])

    # --- the switchyard ---
    t.box(0.15, 0.2, 0, 0.9, 2.2, 0.001, m['gravel'], name='switchyard')
    for j in range(4):
        y0 = 0.45 + j * 0.45
        t.box(0.35, y0 - 0.07, 0, 0.55, y0 + 0.07, 0.08, m['transformer'], name='transformer')
        t.cylinder(0.72, y0, 0, 0.2, 0.012, m['steel'], 8)


t.render_animated(__file__, build, 4, tiles=4)
