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

"""Each painted asset's mean grass colour beside its render's, run from the repository root."""
import os, sys, glob
import numpy as np
from PIL import Image
sys.path.insert(0, 'art/tools')
from paint import is_grass
rows = []
for d in sorted(glob.glob('art/painted/out/*/ground.png')) + sorted(glob.glob('art/painted/out/*/*/ground.png')):
    if '/frame-' in d: continue
    p = np.asarray(Image.open(d).convert('RGB'))
    g = is_grass(p)
    if g.mean() < 0.05: continue
    r = os.path.relpath(d, 'art/painted/out').replace('/ground.png', '')
    rd = d.replace('art/painted/out', 'art/blender/out')
    b = np.asarray(Image.open(rd).convert('RGB')) if os.path.exists(rd) else None
    pm = p[g].mean(0); ps = p[g].std(0)
    bm = b[is_grass(b)].mean(0) if b is not None and is_grass(b).any() else [0,0,0]
    rows.append((r, g.mean(), pm, ps, bm))
for r, share, pm, ps, bm in rows:
    print(f'{r:45s} grass {share:4.0%}  painted {pm.round().astype(int)} sd {ps.round().astype(int)}  render {np.round(bm).astype(int)}')
