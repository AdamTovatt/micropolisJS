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

# The stadium during a game, tiles 795 to 810: a crowd in the stands and a full car park. The game
# on the pitch plays in the two tiles the game animates (801 and 805, cycling through 932 to 939
# and 940 to 947), in eight frames.

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import stadium  # noqa: E402
import tileart as t  # noqa: E402

FRAMES = 8


def build(frame):
    stadium.stadium(full=True)
    if frame is not None:
        stadium.game(frame, FRAMES)


t.render_animated(__file__, build, FRAMES, tiles=4)
