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

# A 3x3 commercial zone being built: a great spherical tank on a ring of steel legs, its cladding
# not yet finished, on a site of bare earth, with a site cabin, a lorry, a crawler crane with its
# boom laid down along the east side, stacks of materials, and the zone's letter laid on the ground.

import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import tileart as t  # noqa: E402

scene = t.new_scene()
rng = random.Random(13)

M = {
    'soil': t.weathered(t.textured('soil', 'bare-soil.png', 0.9, 0.9, shade=1.15), dirt=0.25, dirt_scale=2),
    'meadow': t.textured('meadow', 'wild-meadow.png', 1.4, 1.4, tint='c8f08c', shade=1.15),
    'gravel': t.weathered(t.textured('gravel', 'paving-slabs.png', 0.35, 0.35, tint='d8d0c0', shade=1.0),
                          dirt=0.4, dirt_scale=2),
    'cladding': t.mottled('cladding', 'e4e1da', 'b8b4ac', scale=18, rough=0.5),
    'steel': t.plain('steel', '5a3a2a', 0.5, 0.5),
    'cabin': t.plain('cabin', '4a4f55', 0.6),
    'cabin_roof': t.plain('cabin_roof', '8a8f94', 0.5, 0.3),
    'lorry_red': t.plain('lorry_red', 'b8352a', 0.4, 0.2),
    'lorry_box': t.plain('lorry_box', 'e4e2dc', 0.6),
    'crane': t.plain('crane', '8ea4c8', 0.4, 0.4),
    'crane_dark': t.plain('crane_dark', '3a3d42', 0.6),
    'timber': t.plain('timber', 'b48a5a', 0.8),
    'pipe': t.plain('pipe', '9a9c9e', 0.4, 0.6),
    'tarp': t.plain('tarp', '3a66b0', 0.6),
    'paint': t.plain('paint', 'e8e4da', 0.9),
}

# --- ground: bare earth over the site, a little meadow left at its corners, a gravel yard ---
t.box(0, 0, -0.05, 3, 3, 0, M['soil'], name='site')
for (cx, cy, rx, ry) in [(0.3, 0.3, 0.2, 0.15), (2.7, 0.25, 0.2, 0.14), (1.6, 2.75, 0.3, 0.15)]:
    t.prism(t.patch(cx, cy, rx, ry, rng), 0, 0.002, M['meadow'], name='grass_left')
t.box(0.08, 1.95, 0, 0.6, 2.85, 0.003, M['gravel'], name='yard')
t.zone_letter('C', 0.72, 0.62, 0.002, 0.34, M['paint'], thickness=0.005)

# --- the tank: a faceted sphere of cladding panels, some still open, on legs to the ground ---
CX, CY, CZ, R = 1.42, 1.5, 1.05, 0.56
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=R, location=(CX, CY, CZ))
tank = bpy.context.object
tank.data.materials.append(M['cladding'])
tank.data.materials.append(M['steel'])
# a few panels on the side the view sees are not yet hung, leaving the steel frame bare
for poly in tank.data.polygons:
    c = poly.center
    bearing = math.degrees(math.atan2(c.y, c.x)) % 360
    if 0.2 * R < c.z < 0.65 * R and 220 < bearing < 275:
        poly.material_index = 1
for k in range(8):
    a = 2 * math.pi * (k + 0.5) / 8
    top = (CX + 0.8 * R * math.cos(a), CY + 0.8 * R * math.sin(a), CZ - 0.25 * R)
    foot = (CX + 1.0 * R * math.cos(a), CY + 1.0 * R * math.sin(a), 0)
    t.strut(foot, top, 0.022, M['steel'])
    t.box(foot[0] - 0.035, foot[1] - 0.035, 0, foot[0] + 0.035, foot[1] + 0.035, 0.03, M['gravel'], name='footing')
    b = 2 * math.pi * (k + 1.5) / 8
    nxt = (CX + 0.92 * R * math.cos(b), CY + 0.92 * R * math.sin(b), 0.45)
    t.strut((foot[0] * 0.08 + top[0] * 0.92, foot[1] * 0.08 + top[1] * 0.92, 0.45), nxt, 0.008, M['steel'], 6)
t.strut((CX, CY, 0), (CX, CY, CZ - R + 0.02), 0.05, M['steel'], 12)

# --- the site cabin and the lorry ---
t.box(0.15, 2.2, 0, 0.45, 2.72, 0.12, M['cabin'], M['cabin_roof'], name='cabin')
t.box(0.12, 1.0, 0, 0.3, 1.14, 0.08, M['lorry_red'], name='lorry_cab')
t.box(0.12, 1.16, 0, 0.3, 1.55, 0.1, M['lorry_box'], name='lorry_box')

# --- the crane: its tracks and cab in the north-east, the boom laid down to the south ---
t.box(2.58, 2.15, 0, 2.66, 2.55, 0.05, M['crane_dark'], name='track_west')
t.box(2.8, 2.15, 0, 2.88, 2.55, 0.05, M['crane_dark'], name='track_east')
t.box(2.6, 2.22, 0.05, 2.86, 2.5, 0.14, M['crane'], name='crane_body')
t.box(2.62, 2.42, 0.14, 2.72, 2.5, 0.2, M['crane'], name='crane_cab')
for dx in (-0.03, 0.03):
    t.strut((2.73 + dx, 2.25, 0.12), (2.73 + dx, 0.55, 0.05), 0.012, M['crane'])
for i in range(12):
    y = 2.2 - i * 0.14
    t.strut((2.70, y, 0.12 - i * 0.006), (2.76, y - 0.07, 0.115 - i * 0.006), 0.005, M['crane'], 6)
t.box(2.6, 0.32, 0, 2.86, 0.52, 0.06, M['crane'], name='boom_rest')

# --- stacks of timber, pipes and tarpaulins about the site ---
for (x, y) in [(0.75, 2.6), (1.05, 2.72), (2.2, 0.35), (0.45, 0.25), (2.35, 2.75)]:
    w, d = rng.uniform(0.1, 0.18), rng.uniform(0.08, 0.12)
    t.box(x, y, 0, x + w, y + d, rng.uniform(0.03, 0.05), M['timber'], name='timber_stack')
for (x, y, n) in [(0.6, 1.95, 4), (1.95, 0.2, 3)]:
    for i in range(n):
        t.strut((x, y + i * 0.03, 0.012), (x + 0.3, y + i * 0.03, 0.012), 0.012, M['pipe'], 10)
for (x, y) in [(0.25, 0.55), (1.4, 0.22), (1.15, 2.85)]:
    t.box(x, y, 0, x + 0.12, y + 0.09, 0.03, M['tarp'], name='tarp')
for i in range(25):
    x, y = rng.uniform(0.2, 2.5), rng.uniform(0.15, 2.85)
    if math.dist((x, y), (CX, CY)) > R + 0.1:
        s = rng.uniform(0.02, 0.04)
        t.box(x, y, 0, x + s, y + s * 1.4, rng.uniform(0.012, 0.025), rng.choice([M['timber'], M['pipe']]),
              name='debris')

# --- a few trees and bushes left standing at the corners ---
t.tree('plant-03', 0.9, 0.2, 0.22, 90)
t.shrub('plant-24', 0.95, 0.42, 0.12, 0.04)
for (x, y) in [(2.9, 0.12), (0.1, 0.1)]:
    t.shrub('plant-' + str(rng.choice((22, 23, 26))), x, y, 0.12, 0.04)

t.render(scene, t.out_dir(__file__), tiles=3)
