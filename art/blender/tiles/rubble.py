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

# Rubble, tiles 44 to 47, what is left where a building is knocked down or burns, and the small
# explosion the bulldozer sets off on each tile it clears (860 to 867). The explosion's frames
# play once and hold the last (src/animationManager.ts), until the simulation turns the tile to
# rubble, so the last frame is rubble with the dust settling. A demolished zone is a block of
# rubble tiles side by side, so the dusty ground runs to every edge.

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402
import tilesets as ts  # noqa: E402


def materials():
    return {
        'dust': ts.material('dust', lambda: t.textured('dust', 'bare-soil.png', 0.5, 0.5, tint='e8dcc8', shade=1.15)),
        'concrete': ts.material('broken_concrete', lambda: t.mottled('broken_concrete', 'b4b0a8', '8c8880', 30)),
        'brick': ts.material('broken_brick', lambda: t.textured('broken_brick', 'brick-wall.png', 0.15, 0.15,
                                                               shade=1.2)),
        'char': ts.material('char', lambda: t.mottled('char', '3a3430', '24201c', 30)),
        'timber': ts.material('timber', lambda: t.plain('timber', '8a6a48', 0.9)),
        'scorch': ts.material('scorch', lambda: t.textured('scorch', 'bare-soil.png', 0.5, 0.5, tint='a89280',
                                                           shade=0.7)),
        'smoke': ts.material('smoke', lambda: t.haze('smoke', 'c8c2ba', 'a29c94')),
        'dark_smoke': ts.material('dark_smoke', lambda: t.haze('dark_smoke', '6a6460', '4a4440')),
    }


def flame(name, hex_a, hex_b, strength):
    # Fire: black to the sun, so that only its own light colours it, glowing in licks of hex_a and
    # hex_b. Strong light washes out to white in the render's tone mapping, so it glows only a few
    # times brighter than the sunlit ground.
    m = t.plain(name, '000000')
    nt = m.node_tree
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 40
    noise.inputs['Detail'].default_value = 6
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*t.srgb(hex_a), 1)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (*t.srgb(hex_b), 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    b = nt.nodes['Principled BSDF']
    nt.links.new(ramp.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = strength
    return m


def chunk(rng, m, x, y, size, height, kind):
    # a broken piece: an irregular block turned at random, kept inside the tile once sheared
    x, y = t.keep_inside(x, y, size * 0.75, height, tiles=1)
    a = rng.uniform(0, math.pi)
    sides = rng.randint(4, 6)
    outline = [(x + size * rng.uniform(0.5, 0.8) * math.cos(a + 2 * math.pi * k / sides),
                y + size * rng.uniform(0.5, 0.8) * math.sin(a + 2 * math.pi * k / sides)) for k in range(sides)]
    t.prism(outline, 0, height, m[kind], name='chunk')


def debris(rng, m, count, spread=1.0, centre=(0.5, 0.5)):
    # broken concrete, brick, charred timber and planks strewn over the tile, larger pieces
    # fewer; spread below 1 keeps them toward the centre
    for _ in range(count):
        r = spread * math.sqrt(rng.random()) * 0.55
        a = rng.uniform(0, 2 * math.pi)
        x, y = centre[0] + r * math.cos(a), centre[1] + r * math.sin(a)
        size = rng.choice((0.015, 0.02, 0.025, 0.03, 0.04, 0.055))
        height = min(0.035, size * rng.uniform(0.3, 0.7))
        kind = rng.choices(('concrete', 'brick', 'char'), (5, 3, 1))[0]
        chunk(rng, m, x, y, size, height, kind)
    for _ in range(count // 8):
        x, y = rng.uniform(0.15, 0.8), rng.uniform(0.15, 0.8)
        a, n = rng.uniform(0, math.pi), rng.uniform(0.06, 0.12)
        p, q = (x - n / 2 * math.cos(a), y - n / 2 * math.sin(a)), (x + n / 2 * math.cos(a), y + n / 2 * math.sin(a))
        ts.strip([p, q], 0.012, 0, 0.012, m['timber'], name='plank')


def rubble(seed):
    def build():
        rng, m = random.Random(seed), materials()
        t.box(0, 0, -0.1, 1, 1, 0.001, m['dust'], name='dust')
        for i in range(2):  # scorched patches, each at its own height where they overlap
            t.prism(t.patch(rng.uniform(0.25, 0.75), rng.uniform(0.25, 0.75), rng.uniform(0.12, 0.2),
                            rng.uniform(0.1, 0.18), rng), 0, 0.002 + 0.0004 * i, m['scorch'], name='scorch')
        debris(rng, m, 90)
    return build


# the explosion over its eight frames: the fireball's radius, the smoke's spread and the number
# of puffs, how far the debris has flown, and whether it has come down
FIREBALL = [0.05, 0.09, 0.15, 0.2, 0.17, 0.09, 0.0, 0.0]
SMOKE = [(0.0, 0), (0.0, 0), (0.08, 3), (0.14, 6), (0.2, 9), (0.24, 10), (0.26, 8), (0.28, 5)]
FLYING = [0.0, 0.0, 0.1, 0.2, 0.3, 0.38, 0.0, 0.0]


def explosion(frame):
    def build():
        rng, m = random.Random(860), materials()
        hot = flame('fire', 'd01800', 'ff5800', 2.2)
        core = flame('fire_core', 'ff6a00', 'ffb000', 2.0)
        ts.land()
        if frame >= 2:
            # the scorched ground, and while the fireball burns, its glow on it
            reach = min(0.12 + 0.06 * frame, 0.36)
            t.prism(t.patch(0.5, 0.5, reach, reach * 0.9, random.Random(8600)), 0, 0.002, m['scorch'], name='scorch')
        if FIREBALL[frame]:
            glow = flame('glow', 'c03000', 'ff6000', 0.6)
            t.prism(t.circle(0.5, 0.5, FIREBALL[frame] * 1.6, 32), 0, 0.003, glow, name='glow')
            r = FIREBALL[frame]
            # orange lobes round a yellow heart that shows through at the top. Fire and smoke
            # cast no shadow, as neither does much in the light it gives off or lets through
            for a, k in ((0.3, 0.7), (1.5, 0.62), (2.6, 0.72), (3.8, 0.6), (5.0, 0.68)):
                rr = r * k
                t.sphere(0.5 + 0.42 * r * math.cos(a), 0.5 + 0.42 * r * math.sin(a), rr * 0.8, rr, hot, shadow=False)
            t.sphere(0.5, 0.5, r * 0.95, r * 0.5, core, shadow=False)
        spread, puffs = SMOKE[frame]
        prng = random.Random(8601)
        for i in range(10):
            a, d = prng.uniform(0, 2 * math.pi), prng.uniform(0.3, 1.0)
            size = prng.uniform(0.05, 0.09) * (1 + frame * 0.12)
            if i >= puffs:
                continue
            x, y = 0.5 + spread * d * math.cos(a), 0.5 + spread * d * math.sin(a)
            z = size * (1.2 + 0.25 * frame)
            x, y = ball_inside(x, y, size, z)
            # a puff is a lumpy cluster of smaller balls inside the ball it was given
            for _ in range(5):
                rr = size * prng.uniform(0.45, 0.65)
                jx, jy, jz = (prng.uniform(-1, 1) * (size - rr) for _ in range(3))
                t.sphere(x + jx, y + jy, z + jz, rr, m['dark_smoke'] if frame < 5 and i % 2 else m['smoke'],
                         shadow=False)
        if FLYING[frame]:
            frng = random.Random(8602)
            for _ in range(14):
                a = frng.uniform(0, 2 * math.pi)
                d = FLYING[frame] * frng.uniform(0.6, 1.0)
                height = 0.04 + 0.5 * FLYING[frame] * (1 - FLYING[frame] / 0.45) * frng.uniform(0.5, 1)
                x, y = t.keep_inside(0.5 + d * math.cos(a), 0.5 + d * math.sin(a), 0.02, height + 0.01, tiles=1)
                t.box(x - 0.008, y - 0.008, height, x + 0.008, y + 0.008, height + 0.012,
                      m[frng.choice(('concrete', 'brick', 'char'))], name='flying')
        if frame >= 6:
            debris(rng, m, 50 if frame == 6 else 80, spread=0.8)
    return build


def ball_inside(x, y, r, z, margin=0.01):
    # move a ball of radius r centred at height z in so that, sheared, all of it stays in the tile:
    # its top is carried furthest up and right, and no part of it less far than its bottom
    low, high = r - t.SHEAR * (z - r) + margin, 1 - r - t.SHEAR * (z + r) - margin
    return min(max(x, low), high), min(max(y, low), high)


builders = {44 + i: rubble(44 + i) for i in range(4)}
for frame in range(8):
    builders[860 + frame] = explosion(frame)

t.render_tiles(__file__, builders)
