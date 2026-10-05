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

# The train, sprite 1: one railcar, as the original's, in the frames the game shows it in
# (TrainSprite in the C# rules): 0 running north-south, 1 east-west, 2 north-west to south-east, 3
# north-east to south-west, and 4 under water, where nothing of it shows.

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

LENGTH, WIDTH = 1.3, 0.2


def railcar(turn):
    def build():
        m = {
            'body': t.plain('body', 'e4e4e0', 0.4, 0.1),
            'stripe': t.plain('stripe', 'c8302a', 0.5),
            'glass': t.plain('glass', '1c2228', 0.15),
            'roof': t.plain('roof', 'dcdee0', 0.6, 0.3),
            'bogie': t.plain('bogie', '2a2a2c', 0.8),
            'unit': t.plain('unit', '9a9ea4', 0.5, 0.4),
        }

        def part(s0, s1, width, z0, z1, material, name):
            # a block from s0 to s1 along the car, centred across it
            return t.prism(t.along_rect(1.5, 1.5, s0, s1, width, turn), z0, z1, material, name=name)

        half = LENGTH / 2
        for s in (-half * 0.7, half * 0.7):
            part(s - 0.1, s + 0.1, WIDTH * 0.8, 0, 0.02, m['bogie'], 'bogie')
        part(-half, half, WIDTH, 0.02, 0.05, m['body'], 'body')
        part(-half, half, WIDTH, 0.05, 0.062, m['stripe'], 'stripe')
        # a band of windows along the car between its two cabs
        part(-half + 0.08, half - 0.08, WIDTH, 0.062, 0.1, m['glass'], 'windows')
        part(-half, -half + 0.08, WIDTH, 0.062, 0.1, m['body'], 'cab')
        part(half - 0.08, half, WIDTH, 0.062, 0.1, m['body'], 'cab')
        part(-half + 0.015, half - 0.015, WIDTH * 0.92, 0.1, 0.112, m['roof'], 'roof')
        for s in (-0.3, 0.0, 0.3):
            part(s - 0.06, s + 0.06, WIDTH * 0.5, 0.112, 0.125, m['unit'], 'roof_unit')
    return build


builders = {0: railcar(0), 1: railcar(90), 2: railcar(45), 3: railcar(315), 4: lambda: None}
t.render_sprites(__file__, builders)
