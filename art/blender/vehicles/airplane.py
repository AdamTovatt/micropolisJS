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

# The airliner, sprite 3 (AirplaneSprite in the C# rules): frames 0 to 7 fly at CRUISE, 0 heading north and
# each next frame an eighth of a turn clockwise; 8 to 10 take off eastward, 10 on the runway and 9
# and 8 climbing, which the game shows from 10 down to 8 before the plane flies on as frame 2. Its
# shadow falls away from it by its height, so it reads as flying.

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

LENGTH = 1.6
CRUISE = 0.15
TAKEOFF = {10: 0.0, 9: 0.05, 8: 0.1}    # each take-off frame's height


def airliner(turn, height):
    def build():
        body = t.plain('body', 'f0f0ee', 0.35, 0.1)
        trim = t.plain('trim', '2f5fae', 0.5)
        t.plane(1.5, 1.5, turn, body, trim, length=LENGTH, base=height)
    return build


builders = {k: airliner(-45 * k % 360, CRUISE) for k in range(8)}
for frame, height in TAKEOFF.items():
    builders[frame] = airliner(270, height)
t.render_sprites(__file__, builders)
