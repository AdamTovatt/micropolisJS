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

# The traffic helicopter, sprite 2, in its eight frames: 0 heading north and each next frame an
# eighth of a turn clockwise (src/copterSprite.js). It flies HEIGHT above the ground it is over,
# so its shadow falls away from it by that height and it reads as flying. It is drawn SIZE times
# its modelled size, as small and as low as it must be for it and its shadow to stay inside the
# middle two tiles of the frame: the game draws a helicopter into a square of two tiles, as the
# original's 32 px sprite, and the atlas build crops each frame to it (docs/render-assets.md).

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

HEIGHT = 0.06
SIZE = 0.95


def helicopter(turn):
    def build():
        m = {
            'body': t.plain('body', 'f0ece0', 0.4, 0.1),
            'stripe': t.plain('stripe', 'c8302a', 0.5),
            'glass': t.plain('glass', '22303a', 0.1),
            'skid': t.plain('skid', '3a3a3c', 0.6, 0.4),
            'rotor': t.haze('rotor', '5a5a5c', '3a3a3c', alpha=0.15),
        }
        a = math.radians(turn)
        ux, uy = -math.sin(a), math.cos(a)        # forward

        def at(s, w):
            return (1.5 + (ux * s + uy * w) * SIZE, 1.5 + (uy * s - ux * w) * SIZE)

        def z(h):
            return HEIGHT + h * SIZE

        def part(outline, z0, z1, material, name):
            return t.prism([at(s, w) for s, w in outline], z(z0), z(z1), material, name=name)

        cabin = [(0.3, 0), (0.27, -0.06), (0.18, -0.09), (-0.12, -0.09), (-0.2, -0.05), (-0.2, 0.05), (-0.12, 0.09),
                 (0.18, 0.09), (0.27, 0.06)]
        part(cabin, 0.02, 0.12, m['body'], 'cabin')
        part([(0.3, 0), (0.27, -0.06), (0.16, -0.085), (0.16, 0.085), (0.27, 0.06)], 0.06, 0.122, m['glass'],
             'canopy')
        part([(-0.2, -0.025), (-0.68, -0.012), (-0.68, 0.012), (-0.2, 0.025)], 0.07, 0.1, m['body'], 'boom')
        part([(-0.2, -0.026), (-0.5, -0.014), (-0.5, 0.014), (-0.2, 0.026)], 0.1, 0.104, m['stripe'], 'boom_stripe')
        part([(-0.62, -0.006), (-0.62, 0.006), (-0.72, 0.006), (-0.72, -0.006)], 0.07, 0.17, m['stripe'], 'fin')
        for w in (-0.1, 0.1):
            p, q = at(0.2, w), at(-0.15, w)
            t.strut((p[0], p[1], HEIGHT), (q[0], q[1], HEIGHT), 0.008 * SIZE, m['skid'])
        cx, cy = at(0.02, 0)
        t.cylinder(cx, cy, z(0.12), z(0.15), 0.025 * SIZE, m['skid'], 12)
        t.cylinder(cx, cy, z(0.15), z(0.155), 0.46 * SIZE, m['rotor'], 48)
        for k in range(2):
            b = a + k * math.pi / 2 + math.pi / 4
            t.prism(t.rotated_rect(cx, cy, 0.03 * SIZE, 0.9 * SIZE, math.degrees(b)), z(0.155), z(0.16), m['skid'],
                    name='blade')
    return build


builders = {k: helicopter(-45 * k % 360) for k in range(8)}
t.render_sprites(__file__, builders)
