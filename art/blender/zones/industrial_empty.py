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

# A 3x3 industrial zone before anything is built, industrial (1, 1): packed bare earth with
# patches of gravel and a few weeds, and the zone's letter laid in pale concrete in the middle.

import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(612)

M = {
    'earth': t.weathered(t.textured('earth', 'bare-soil.png', 1.2, 1.2, tint='dcdcc4', shade=1.25), dirt=0.12),
    'gravel': t.textured('gravel', 'track-ballast.png', 0.3, 0.3, tint='f4e4cc', shade=0.95),
    'grass': t.textured('grass', 'wild-meadow.png', 1.0, 1.0, tint='bcd890', shade=0.95),
    'concrete': t.textured('concrete', 'paving-slabs.png', 0.25, 0.25, tint='fff8ec', shade=1.7),
}

# --- ground: earth, a few gravel patches, rough grass creeping in at the edges, the letter laid
# flat, all low enough to be ground ---
t.box(0, 0, -0.05, 3, 3, 0, M['earth'], name='earth')
for i, (x, y, rx, ry) in enumerate(((0.9, 2.2, 0.22, 0.16), (2.1, 1.0, 0.2, 0.24), (1.1, 0.4, 0.18, 0.14))):
    t.prism(t.patch(x, y, rx, ry, rng, wobble=0.3), 0, 0.001 + 0.0003 * i, M['gravel'], name='gravel')
for i, (x, y, rx, ry) in enumerate(((0.1, 2.7, 0.28, 0.3), (2.9, 2.5, 0.22, 0.32), (2.75, 0.2, 0.3, 0.22),
                                    (0.2, 0.25, 0.3, 0.26), (0.06, 1.3, 0.14, 0.24), (1.6, 2.95, 0.3, 0.1))):
    outline = [(min(max(px, 0), 3), min(max(py, 0), 3)) for px, py in t.patch(x, y, rx, ry, rng, wobble=0.35)]
    t.prism(outline, 0, 0.002 + 0.0003 * i, M['grass'], name='grass')
t.zone_letter('I', 1.5, 1.5, 0.003, 0.72, M['concrete'], thickness=0.005)

# --- weeds and a few scrubby bushes, mostly along the edges ---
weeds = ['plant-30', 'plant-31', 'plant-33', 'plant-35', 'plant-38', 'plant-39']
bushes = ['plant-22', 'plant-24', 'plant-26', 'plant-29']
for i in range(70):
    while True:
        x, y = rng.uniform(0.08, 2.92), rng.uniform(0.08, 2.92)
        if abs(x - 1.5) > 0.45 or abs(y - 1.5) > 0.55:
            break
    if i % 6 == 0:
        t.shrub(rng.choice(bushes), x, y, rng.uniform(0.09, 0.13), 0.035, rng.choice((0, 90, 180, 270)))
    else:
        t.shrub(rng.choice(weeds), x, y, rng.uniform(0.05, 0.08), 0.015, rng.choice((0, 90, 180, 270)))

t.render(scene, t.out_dir(__file__), tiles=3)
