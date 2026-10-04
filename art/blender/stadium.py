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

# What the two stadium scenes share, zones/stadium_empty.py and zones/stadium_full.py, a 4x4 zone
# laid out as the original's: an oval of stands round a running track and a pitch, filling the
# east three columns, and a car park down the west column. The full stadium seats a crowd and
# plays a game, in the two tiles the game animates (801 and 805, the middle of the pitch).

import math
import random

import tileart as t

CX, CY = 2.45, 2.0              # the oval's middle
OUTER = (1.38, 1.82)            # the stands' outer radii, east-west and north-south
INNER = (0.9, 1.3)              # the stands' inner radii, round the track
TIERS = 5
SEGMENTS = 56
PITCH = (0.54, 0.9)             # the pitch's half-width and half-length


def crowd_material():
    # people in the stands: a fine scatter of shirts in many colours over the seats
    m = t.plain('crowd', '808080', 0.9)
    nt = m.node_tree
    # read from the UVs, world units on the tiers' tops, so a shirt is about a pixel wherever it sits
    uv = nt.nodes.new('ShaderNodeTexCoord')
    noise = nt.nodes.new('ShaderNodeTexNoise')
    nt.links.new(uv.outputs['UV'], noise.inputs['Vector'])
    noise.inputs['Scale'].default_value = 50
    noise.inputs['Detail'].default_value = 0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    colours = ['3a4a8a', 'c83a30', 'e8e4dc', 'e8c030', '2a2a2a', '3a8a4a', 'd87a9a', '6a6a70']
    elements = ramp.color_ramp.elements
    elements[0].color = (*t.srgb(colours[0]), 1)
    elements[1].position = 1.0
    elements[1].color = (*t.srgb(colours[-1]), 1)
    for i, c in enumerate(colours[1:-1], start=1):
        e = elements.new(0.3 + 0.4 * i / len(colours))
        e.color = (*t.srgb(c), 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    return m


def _ring(rx0, ry0, rx1, ry1, z0, z1, material, name):
    # a band of the oval between two ellipses, as quads round it
    for i in range(SEGMENTS):
        a0, a1 = 2 * math.pi * i / SEGMENTS, 2 * math.pi * (i + 1) / SEGMENTS
        quad = [(CX + rx0 * math.cos(a0), CY + ry0 * math.sin(a0)), (CX + rx1 * math.cos(a0), CY + ry1 * math.sin(a0)),
                (CX + rx1 * math.cos(a1), CY + ry1 * math.sin(a1)), (CX + rx0 * math.cos(a1), CY + ry0 * math.sin(a1))]
        t.prism(quad, z0, z1, material, name=name)


def stadium(full):
    # the whole zone but the game: ground, car park, track, pitch and stands, with a crowd and a
    # full car park when full
    rng = random.Random(779)
    m = {
        'lawn': t.textured('lawn', 'lawn-grass.png', 0.25, 0.25, tint='d8ffb0', shade=1.3),
        'yard': t.concrete_yard(),
        'asphalt': t.weathered(t.textured('asphalt', 'asphalt.png', 0.25, 0.25, shade=1.1), dirt=0.12),
        'track': t.mottled('track', 'b85a3e', 'a04e36', 20),
        'pitch': t.textured('pitch', 'lawn-grass.png', 0.2, 0.2, tint='a8f080', shade=1.25),
        'stripe': t.textured('stripe', 'lawn-grass.png', 0.2, 0.2, tint='88d068', shade=1.15),
        'line': t.plain('line', 'f0efe8', 0.6),
        'seats': t.mottled('seats', '4a6aa8', '3e5a90', 30),
        'concrete': t.plain('concrete', 'b8b4ac', 0.8),
        'roof': t.mottled('roof', 'dedcd6', 'c8c6c0', 14),
        'crowd': crowd_material(),
    }
    t.box(0, 0, -0.05, 4, 4, 0, m['yard'], name='plaza')
    t.box(0.1, 0.1, 0, 0.98, 3.9, 0.002, m['asphalt'], name='car_park')
    cars = [f'car-{i:02d}' for i in range(1, 22) if f'car-{i:02d}' not in t.VANS]
    for x, out in ((0.12, 1), (0.96, -1)):
        bays = [rng.choice(cars) if full or rng.random() < 0.12 else None for _ in range(20)]
        t.parking_row(x, 0.2, 20, 'y', out, bays, m['line'], rng, bay=0.18, depth=0.3)

    _ring(0, 0, INNER[0], INNER[1], 0, 0.001, m['track'], 'track')
    t.box(CX - PITCH[0], CY - PITCH[1], 0, CX + PITCH[0], CY + PITCH[1], 0.002, m['pitch'], name='pitch')
    for k in range(0, 8, 2):
        y0 = CY - PITCH[1] + k * PITCH[1] / 4
        t.box(CX - PITCH[0], y0, 0.002, CX + PITCH[0], y0 + PITCH[1] / 4, 0.0025, m['stripe'], name='stripe')
    w = 0.008
    for x0, y0, x1, y1 in ((CX - PITCH[0], CY - PITCH[1], CX + PITCH[0], CY - PITCH[1] + w),
                           (CX - PITCH[0], CY + PITCH[1] - w, CX + PITCH[0], CY + PITCH[1]),
                           (CX - PITCH[0], CY - PITCH[1], CX - PITCH[0] + w, CY + PITCH[1]),
                           (CX + PITCH[0] - w, CY - PITCH[1], CX + PITCH[0], CY + PITCH[1]),
                           (CX - PITCH[0], CY - w / 2, CX + PITCH[0], CY + w / 2)):
        t.box(x0, y0, 0.0025, x1, y1, 0.003, m['line'], name='pitch_line')
    for i in range(TIERS):
        f0, f1 = i / TIERS, (i + 1) / TIERS
        rx0, ry0 = INNER[0] + (OUTER[0] - INNER[0]) * f0, INNER[1] + (OUTER[1] - INNER[1]) * f0
        rx1, ry1 = INNER[0] + (OUTER[0] - INNER[0]) * f1, INNER[1] + (OUTER[1] - INNER[1]) * f1
        _ring(rx0, ry0, rx1, ry1, 0, 0.03 + 0.028 * i, m['crowd'] if full else m['seats'], 'stand')
    _ring(OUTER[0] - 0.06, OUTER[1] - 0.06, OUTER[0], OUTER[1], 0, 0.19, m['roof'], 'stand_rim')


def game(frame, frames):
    # the players and the ball, in one of the game's frames: each player runs a small loop round
    # their place, a step of it each frame, and the ball passes between them; all within the two
    # middle tiles of the pitch's column, x from 2 to 3. They are drawn several times their true
    # size, as the original draws them, or a player would be under a pixel across
    red = t.plain('red_kit', 'e83a2a', 0.6)
    yellow = t.plain('yellow_kit', 'f0d020', 0.6)
    ball = t.plain('ball', 'f8f8f4', 0.4)
    rng = random.Random(801)
    a = 2 * math.pi * frame / frames
    places = [(rng.uniform(2.15, 2.75), rng.uniform(1.35, 2.65), rng.uniform(0, 2 * math.pi)) for _ in range(14)]
    for i, (px, py, phase) in enumerate(places):
        x, y = px + 0.07 * math.cos(a + phase), py + 0.07 * math.sin(a + phase)
        t.cylinder(x, y, 0.003, 0.06, 0.028, red if i % 2 else yellow, 12)
    bx, by = CX + 0.25 * math.sin(a), CY + 0.45 * math.sin(2 * a)
    t.sphere(bx, by, 0.02, 0.018, ball)
