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

"""shootmix.py <atlas render dir> <lush dir> <straw dir> <out prefix> [details dir]: hospitalTown with the two sets blended under every
masked ground at 16 px and two 64 px crops; open land at 64 and 16 px; the whole 120 x 100 map of open land at
4 px a tile, with its region mask beside it"""
import sys
sys.path.insert(0, sys.path[0])
from mapcomp import composite, Art
from wang import world_mixed
from PIL import Image
render, lush, straw, label = sys.argv[1:5]
dirs = [lush, straw]
# an optional fifth argument: a directory of cut details (details.py) to scatter as layer 3
from details import load as load_decals
D = load_decals(sys.argv[5]) if len(sys.argv) > 5 else None
img = composite('conformance/saves/hospitalTown.run.json', 6, 6, 44, 18, Art(render),
                world=lambda x, y, w, h: world_mixed(dirs, x, y, w, h, decals=D))
img.resize((44 * 16, 18 * 16), Image.LANCZOS).save(f'{label}-open-16px.png')
px = 64
img.crop((10 * px, 2 * px, 22 * px, 10 * px)).save(f'{label}-close-64px.png')
img.crop((0, 8 * px, 12 * px, 18 * px)).save(f'{label}-close2-64px.png')
field = world_mixed(dirs, 60, 60, 40, 24, decals=D)
field.resize((40 * 16, 24 * 16), Image.LANCZOS).save(f'{label}-field-16px.png')
field.crop((0, 0, 12 * px, 8 * px)).save(f'{label}-field-64px.png')
# the whole map at 4 px a tile, made in strips of 20 rows to keep memory down
far = Image.new('RGB', (120 * 4, 100 * 4))
for y in range(0, 100, 20):
    far.paste(world_mixed(dirs, 0, y, 120, 20, decals=D).resize((120 * 4, 20 * 4), Image.LANCZOS), (0, y * 4))
mask = Image.new('L', (120 * 4, 100 * 4))
for y in range(0, 100, 20):
    mask.paste(world_mixed(dirs, 0, y, 120, 20, show_mask=True).resize((120 * 4, 20 * 4), Image.LANCZOS), (0, y * 4))
both = Image.new('RGB', (120 * 8 + 8, 100 * 4), (255, 255, 255))
both.paste(far, (0, 0))
both.paste(mask.convert('RGB'), (120 * 4 + 8, 0))
both.save(f'{label}-map-4px.png')
