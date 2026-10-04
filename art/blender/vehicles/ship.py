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

# The cargo ship, sprite 4, in its eight frames: 0 heading north and each next frame an eighth of
# a turn clockwise (src/boatSprite.js). A hull with a pointed bow, hatches along its deck, the
# bridge and funnel at the stern, and its wake on the water behind it and at its bow.

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

LENGTH, BEAM = 1.9, 0.3


def ship(turn):
    def build():
        m = {
            'hull': t.plain('hull', '2a2a30', 0.6),
            'boot': t.plain('boot', 'a8302a', 0.6),
            'deck': t.plain('deck', 'a87a5a', 0.8),
            'hatch': t.plain('hatch', '3a5a8a', 0.6),
            'white': t.plain('white', 'eeeeea', 0.5),
            'glass': t.plain('glass', '1c2228', 0.15),
            'funnel': t.plain('funnel', 'd8a830', 0.5),
            'soot': t.plain('soot', '2a2624', 0.9),
            'foam': t.haze('foam', 'f4f8fa', 'dce6ea'),
        }
        a = math.radians(turn)
        ux, uy = -math.sin(a), math.cos(a)        # forward
        h, b = LENGTH / 2, BEAM / 2

        def at(s, w):
            return (1.5 + ux * s + uy * w, 1.5 + uy * s - ux * w)

        def part(outline, z0, z1, material, name):
            return t.prism([at(s, w) for s, w in outline], z0, z1, material, name=name)

        hull = [(h, 0), (h - 0.25, -b), (-h + 0.08, -b), (-h, -b * 0.6), (-h, b * 0.6), (-h + 0.08, b), (h - 0.25, b)]
        part(hull, 0, 0.012, m['boot'], 'boot_topping')
        part(hull, 0.012, 0.06, m['hull'], 'hull')
        deck = [(s * 0.97, w * 0.85) for s, w in hull]
        part(deck, 0.06, 0.064, m['deck'], 'deck')
        for k in range(5):
            s0 = h - 0.32 - k * 0.24
            part([(s0, -b * 0.62), (s0, b * 0.62), (s0 - 0.19, b * 0.62), (s0 - 0.19, -b * 0.62)], 0.064, 0.08,
                 m['hatch'], 'hatch')
        part([(-h + 0.32, -b * 0.8), (-h + 0.32, b * 0.8), (-h + 0.1, b * 0.8), (-h + 0.1, -b * 0.8)], 0.064, 0.15,
             m['white'], 'bridge')
        part([(-h + 0.33, -b * 0.95), (-h + 0.33, b * 0.95), (-h + 0.28, b * 0.95), (-h + 0.28, -b * 0.95)], 0.12,
             0.145, m['glass'], 'bridge_windows')
        fx, fy = at(-h + 0.18, 0)
        t.cylinder(fx, fy, 0.15, 0.22, 0.04, m['funnel'], 16)
        t.cylinder(fx, fy, 0.22, 0.224, 0.03, m['soot'], 16)

        # the wake: a widening V of foam astern and a curl at either side of the bow
        for side in (-1, 1):
            part([(-h, side * b * 0.7), (-h - 0.42, side * b * 1.9), (-h - 0.42, side * b * 1.3),
                  (-h - 0.05, side * b * 0.2)], 0, 0.002, m['foam'], 'wake')
            part([(h - 0.05, side * 0.02), (h - 0.4, side * (b + 0.06)), (h - 0.5, side * (b + 0.03)),
                  (h - 0.25, side * b)], 0, 0.002, m['foam'], 'bow_wave')
    return build


builders = {k: ship(-45 * k % 360) for k in range(8)}
t.render_sprites(__file__, builders)
