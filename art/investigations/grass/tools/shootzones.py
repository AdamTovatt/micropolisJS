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

"""shootzones.py <atlas render dir> <lush dir> <straw dir> <details dir> <out prefix> [lawn dir]: hospitalTown with the
world grass under every masked ground, zones' lawns included when the atlas masks them; details on bare land only;
with a lawn dir, zone tiles take that set instead of the mix. Writes the town at 16 px, the two 64 px crops, and
close-ups of paving and path edges at 64 px enlarged 3x, for halos."""
import sys
sys.path.insert(0, sys.path[0])
import numpy as np
from mapcomp import composite, Art, load_map
from wang import world_mixed
from details import load as load_decals
from PIL import Image

render, lush, straw, decal_dir, prefix = sys.argv[1:6]
lawn = sys.argv[6] if len(sys.argv) > 6 else None
SAVE = 'conformance/saves/hospitalTown.run.json'
_, W, H, raw = load_map(SAVE)
ids = (np.array(raw) & 1023).reshape(H, W)


def tile(x, y):
    return int(ids[y, x]) if 0 <= x < W and 0 <= y < H else 0


D = load_decals(decal_dir)
img = composite(SAVE, 6, 6, 44, 18, Art(render),
                world=lambda x, y, w, h: world_mixed([lush, straw], x, y, w, h, decals=D,
                                                     decal_ok=lambda a, b: tile(a, b) == 0, lawn=lawn,
                                                     lawn_tile=lambda a, b: tile(a, b) >= 240))
img.resize((44 * 16, 18 * 16), Image.LANCZOS).save(f'{prefix}-open-16px.png')
px = 64
img.crop((10 * px, 2 * px, 22 * px, 10 * px)).save(f'{prefix}-close-64px.png')
img.crop((0, 8 * px, 12 * px, 18 * px)).save(f'{prefix}-close2-64px.png')
# halos: crops at 64 px a tile, enlarged 3x nearest: an apartment zone's paths and paving, and a commercial zone's
for name, (x, y) in {'houses': (10, 5), 'apartments': (11, 7), 'commercial': (9, 11), 'commercial2': (13, 11)}.items():
    img.crop((x * px, y * px, (x + 4) * px, (y + 2) * px)).resize((4 * px * 3, 2 * px * 3), Image.NEAREST) \
        .save(f'{prefix}-edges-{name}-x3.png')
