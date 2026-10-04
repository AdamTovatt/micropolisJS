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

# Shared building blocks for rendering tile art in Blender: materials, shapes, and the
# render itself. A scene script builds its zone in world units, one unit per tile, with
# the zone's south-west corner at the origin, x east and y north; render() does the rest.
#
# The view matches the game's: straight down, with height sheared up and to the right,
# so the ground grid stays square and the west and south walls show.

import json
import math
import os

import bmesh
import bpy
from mathutils import Vector

TILE_PX = 64     # pixels per tile in the finished image
SHEAR = 0.45     # how far one unit of height moves up and to the right
TEXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'textures')
CUTOUTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cutouts')
LETTER_FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fonts', 'Tomorrow-ExtraBold.ttf')


def out_dir(script):
    # where a zone script renders its layers: the directory after `--` on the command line,
    # or art/blender/out/<script name>
    import sys
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1]
    name = os.path.splitext(os.path.basename(script))[0]
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', name)


def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def srgb(hex_colour):
    c = [int(hex_colour[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


# --- materials ---

def _bsdf(m):
    return m.node_tree.nodes['Principled BSDF']


def plain(name, hex_colour, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = _bsdf(m)
    b.inputs['Base Color'].default_value = (*srgb(hex_colour), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    return m


def mottled(name, hex_a, hex_b, scale=12, rough=0.9):
    # two tones blended by noise, for small surfaces with no texture of their own
    m = plain(name, hex_a, rough)
    nt = m.node_tree
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = scale
    noise.inputs['Detail'].default_value = 8
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*srgb(hex_a), 1)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (*srgb(hex_b), 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], _bsdf(m).inputs['Base Color'])
    return m


def textured(name, file, width, height, rough=0.9, shade=1.0, tint='ffffff', hue=0.0):
    # an image from art/textures spanning width x height world units, repeating beyond.
    # Its hue turns by `hue`, a fraction of the colour wheel, so blue glass can become green
    # without losing its brightness; then it is multiplied by tint and by shade, so a grey
    # texture can be coloured and darkened
    m = plain(name, '808080', rough)
    nt = m.node_tree
    uv = nt.nodes.new('ShaderNodeTexCoord')
    span = nt.nodes.new('ShaderNodeMapping')
    span.inputs['Scale'].default_value = (1 / width, 1 / height, 1)
    nt.links.new(uv.outputs['UV'], span.inputs['Vector'])
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(os.path.join(TEXTURES, file), check_existing=True)
    nt.links.new(span.outputs[0], img.inputs['Vector'])
    colour = img.outputs['Color']
    if hue:
        turn = nt.nodes.new('ShaderNodeHueSaturation')
        turn.inputs['Hue'].default_value = (0.5 + hue) % 1.0
        nt.links.new(colour, turn.inputs['Color'])
        colour = turn.outputs['Color']
    dim = nt.nodes.new('ShaderNodeMix')
    dim.data_type = 'RGBA'
    dim.blend_type = 'MULTIPLY'
    dim.inputs['Factor'].default_value = 1
    dim.inputs['B'].default_value = (*(c * shade for c in srgb(tint)), 1)
    nt.links.new(colour, dim.inputs['A'])
    nt.links.new(dim.outputs['Result'], _bsdf(m).inputs['Base Color'])
    return m


def tiling_noise(nt, scale, period=1.0, detail=6):
    # A noise texture's Fac that repeats every `period` world units in x and y, read from the UVs
    # (world units on the top faces), so tiles drawn side by side join without a seam: the plane
    # is wrapped onto a torus in four dimensions, which the noise samples. scale is about the
    # number of features across one period.
    def node(kind, *inputs, op=None):
        n = nt.nodes.new(kind)
        if op:
            n.operation = op
        for i, value in enumerate(inputs):
            if isinstance(value, (int, float)):
                n.inputs[i].default_value = value
            else:
                nt.links.new(value, n.inputs[i])
        return n
    uv = nt.nodes.new('ShaderNodeTexCoord')
    xyz = node('ShaderNodeSeparateXYZ', uv.outputs['UV'])
    radius = scale / (2 * math.pi)
    ring = []
    for axis in ('X', 'Y'):
        angle = node('ShaderNodeMath', xyz.outputs[axis], 2 * math.pi / period, op='MULTIPLY').outputs[0]
        for op in ('COSINE', 'SINE'):
            wave = node('ShaderNodeMath', angle, op=op).outputs[0]
            ring.append(node('ShaderNodeMath', wave, radius, op='MULTIPLY').outputs[0])
    point = node('ShaderNodeCombineXYZ', ring[0], ring[1], ring[2])
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.noise_dimensions = '4D'
    noise.inputs['Scale'].default_value = 1
    noise.inputs['Detail'].default_value = detail
    nt.links.new(point.outputs[0], noise.inputs['Vector'])
    nt.links.new(ring[3], noise.inputs['W'])
    return noise.outputs['Fac']


def tiling_mottle(m, hex_colour, amount, scale=6, period=1.0, low=0.35, high=0.65):
    # Blend a material's colour toward hex_colour in soft patches of tiling_noise, so a ground
    # that repeats every tile varies within it without a seam: amount is the most it blends
    nt = m.node_tree
    base = _bsdf(m).inputs['Base Color']
    src = base.links[0].from_socket if base.links else None
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = low
    ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    ramp.color_ramp.elements[1].position = high
    ramp.color_ramp.elements[1].color = (amount, amount, amount, 1)
    nt.links.new(tiling_noise(nt, scale, period), ramp.inputs['Fac'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(ramp.outputs['Color'], mix.inputs['Factor'])
    if src is not None:
        nt.links.new(src, mix.inputs['A'])
    else:
        mix.inputs['A'].default_value = base.default_value
    mix.inputs['B'].default_value = (*srgb(hex_colour), 1)
    nt.links.new(mix.outputs['Result'], base)
    return m


def weathered(m, dirt=0.3, dirt_scale=4, specks=0.0, speck_hex='2a2824'):
    # darken a material in broad stains, and optionally scatter small specks over it
    nt = m.node_tree
    base = _bsdf(m).inputs['Base Color']
    src = base.links[0].from_socket
    stain = nt.nodes.new('ShaderNodeTexNoise')
    stain.inputs['Scale'].default_value = dirt_scale
    stain.inputs['Detail'].default_value = 6
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.4
    ramp.color_ramp.elements[0].color = (1 - dirt, 1 - dirt, 1 - dirt * 1.1, 1)
    ramp.color_ramp.elements[1].position = 0.7
    nt.links.new(stain.outputs['Fac'], ramp.inputs['Fac'])
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1
    nt.links.new(src, mul.inputs['A'])
    nt.links.new(ramp.outputs['Color'], mul.inputs['B'])
    out = mul.outputs['Result']
    if specks:
        speck = nt.nodes.new('ShaderNodeTexNoise')
        speck.inputs['Scale'].default_value = 260
        speck.inputs['Detail'].default_value = 1
        mask = nt.nodes.new('ShaderNodeValToRGB')
        mask.color_ramp.interpolation = 'CONSTANT'
        mask.color_ramp.elements[0].color = (0, 0, 0, 1)
        mask.color_ramp.elements[1].position = 1 - specks * 3
        nt.links.new(speck.outputs['Fac'], mask.inputs['Fac'])
        dots = nt.nodes.new('ShaderNodeMix')
        dots.data_type = 'RGBA'
        nt.links.new(mask.outputs['Color'], dots.inputs['Factor'])
        nt.links.new(out, dots.inputs['A'])
        dots.inputs['B'].default_value = (*srgb(speck_hex), 1)
        out = dots.outputs['Result']
    nt.links.new(out, base)
    return m


# --- shapes ---

def _link(name, bm, materials):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    for m in materials:
        ob.data.materials.append(m)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def box(x0, y0, z0, x1, y1, z1, side, top=None, name='box'):
    # an axis-aligned box; its top can take its own material. UVs are world units on each
    # face: x and y on top, and along the wall and up it on the sides
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0),
                       (y0 + y1) / 2 + v.co.y * (y1 - y0),
                       (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    uvs = bm.loops.layers.uv.new()
    for f in bm.faces:
        n = f.normal
        f.material_index = 1 if (top is not None and n.z > 0.5) else 0
        for loop in f.loops:
            c = loop.vert.co
            if abs(n.z) > 0.5:
                loop[uvs].uv = (c.x, c.y)
            elif abs(n.x) > 0.5:
                loop[uvs].uv = (c.y, c.z)
            else:
                loop[uvs].uv = (c.x, c.z)
    return _link(name, bm, [side] + ([top] if top is not None else []))


def cylinder(x, y, z0, z1, r, material, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2))
    bpy.context.object.data.materials.append(material)


def keep_inside(x, y, reach, height, tiles, margin=0.02):
    # move a point in so that something reaching `reach` from it at `height` stays inside
    # the zone once sheared: the shear carries its top up and to the right
    lift = SHEAR * height
    x = min(max(x, reach - lift + margin), tiles - reach - lift - margin)
    y = min(max(y, reach - lift + margin), tiles - reach - lift - margin)
    return x, y


def _cutout_size(cutout, length):
    # the card's width and depth for a cutout whose longer side is `length` world units
    image = bpy.data.images.load(os.path.join(CUTOUTS, cutout), check_existing=True)
    w, h = image.size
    return image, length * w / max(w, h), length * h / max(w, h)


def _shadow_only(ob):
    # the object casts shadows but the camera never sees it, nor its reflection
    ob.visible_camera = False
    ob.visible_glossy = False
    ob.visible_transmission = False
    return ob


def _rotated_rect(x, y, width, depth, turn):
    a = math.radians(turn)
    return [(x + u * width / 2 * math.cos(a) - v * depth / 2 * math.sin(a),
             y + u * width / 2 * math.sin(a) + v * depth / 2 * math.cos(a))
            for (u, v) in [(-1, -1), (1, -1), (1, 1), (-1, 1)]]


def _card(cutout, x, y, height, length, turn=0):
    # A cutout from art/cutouts, seen from above: a transparent card centred on (x, y),
    # lying flat at the object's height. length is the cutout's longer side in world units;
    # turn rotates it anticlockwise, in degrees. A card alone floats: its shadow lies apart
    # from the ground under it, so car(), tree() and shrub() give it a body below.
    image, sx, sy = _cutout_size(cutout, length)
    m = bpy.data.materials.get(cutout)
    if m is None:
        m = plain(cutout, '808080', 0.85)
        nt = m.node_tree
        img = nt.nodes.new('ShaderNodeTexImage')
        img.image = image
        img.extension = 'CLIP'
        nt.links.new(img.outputs['Color'], _bsdf(m).inputs['Base Color'])
        nt.links.new(img.outputs['Alpha'], _bsdf(m).inputs['Alpha'])
        # a flat card catches less of a low sun than the rounded thing it stands for,
        # so it glows faintly in its own colours to keep the cutout's brightness
        nt.links.new(img.outputs['Color'], _bsdf(m).inputs['Emission Color'])
        _bsdf(m).inputs['Emission Strength'].default_value = 0.7
    bm = bmesh.new()
    uvs = bm.loops.layers.uv.new()
    corners = [(-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)]
    a = math.radians(turn)
    verts = []
    for (u, v) in corners:
        px, py = u * sx, v * sy
        verts.append(bm.verts.new((x + px * math.cos(a) - py * math.sin(a),
                                   y + px * math.sin(a) + py * math.cos(a), height)))
    face = bm.faces.new(verts)
    for loop, (u, v) in zip(face.loops, corners):
        loop[uvs].uv = (u + 0.5, v + 0.5)
    return _link(cutout, bm, [m])


CAR_SCALE = 0.26 / 330    # world units per pixel of a car cutout, so vans come out longer than cars
VANS = {'car-06', 'car-07', 'car-13', 'car-14', 'car-20', 'car-21'}


def car_size(name):
    # a car's height and its card's width and depth, nose north, in world units
    cutout = f'cars/{name}.png'
    image = bpy.data.images.load(os.path.join(CUTOUTS, cutout), check_existing=True)
    _, w, d = _cutout_size(cutout, CAR_SCALE * max(image.size))
    return (0.07 if name in VANS else 0.05), w, d


def car(name, x, y, turn, base=0.0):
    # a car from cutouts/cars centred on (x, y), standing on ground at height base, such as a
    # bridge's deck; turn 0 points its nose north. Under the card is a body only the sun sees,
    # so the car's shadow starts at the ground
    cutout = f'cars/{name}.png'
    height, w, d = car_size(name)
    _card(cutout, x, y, base + height, max(w, d), turn)
    body = prism(_rotated_rect(x, y, w * 0.85, d * 0.92, turn), base, base + height - 0.002,
                 _shadow_material(), name='car_body')
    _shadow_only(body)


def tree(name, x, y, size, turn=0):
    # a tree from cutouts/plants: its crown, `size` across, on a trunk from the ground. Returns
    # the crown and the trunk
    height = 0.8 * size
    crown = _card(f'plants/{name}.png', x, y, height, size, turn)
    trunk = bpy.data.materials.get('trunk') or plain('trunk', '4a3522', 0.9)
    cylinder(x, y, 0, height - 0.002, 0.016, trunk, 8)
    return crown, bpy.context.object


def neighbours_shade(ob):
    # Make an object stand in for one in a neighbouring tile, such as a tree in the woods next
    # door, so that it shades this tile's objects as the neighbour's would: the camera never
    # sees it, and render() leaves it out of the shadow layer, where the neighbour casts its own.
    # Without it, the trees along a tile's sunny edges would be lit brighter than the rest,
    # marking out the grid.
    ob['neighbours_shade'] = True
    ob.visible_camera = False
    ob.visible_diffuse = False
    ob.visible_glossy = False
    ob.visible_transmission = False
    return ob


def shrub(name, x, y, size, height, turn=0):
    # a low plant from cutouts/plants, `size` across: under the card is a mound only the sun
    # sees, so its shadow starts at the ground
    _card(f'plants/{name}.png', x, y, height, size, turn)
    _, w, d = _cutout_size(f'plants/{name}.png', size)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=(x, y, 0))
    mound = bpy.context.object
    mound.scale = (w * 0.42, d * 0.42, height - 0.002)
    mound.rotation_euler = (0, 0, math.radians(turn))
    mound.data.materials.append(_shadow_material())
    _shadow_only(mound)


def _shadow_material():
    return bpy.data.materials.get('shadow_body') or plain('shadow_body', '303030', 0.9)


def parking_row(x, y, count, along, out, cars, line, rng=None, bay=0.18, depth=0.3):
    # A row of `count` bays side by side, starting at (x, y) on the aisle's edge and running
    # along 'x' or 'y'; out is +1 or -1, the way from the aisle into the bays. cars names a
    # car for each bay, or None for an empty one. Each car stands inside its bay, nose in,
    # or tail in when rng says so.
    for i in range(count + 1):
        p = i * bay
        if along == 'y':
            x0, x1 = sorted((x, x + out * depth))
            box(x0, y + p - 0.005, 0.004, x1, y + p + 0.005, 0.006, line, name='bay_line')
        else:
            y0, y1 = sorted((y, y + out * depth))
            box(x + p - 0.005, y0, 0.004, x + p + 0.005, y1, 0.006, line, name='bay_line')
    for i, name in enumerate(cars[:count]):
        if name is None:
            continue
        nose_in = not (rng and rng.random() < 0.3)
        sign = out if nose_in else -out
        if along == 'y':
            car(name, x + out * depth / 2, y + (i + 0.5) * bay, 270 if sign > 0 else 90)
        else:
            car(name, x + (i + 0.5) * bay, y + out * depth / 2, 0 if sign > 0 else 180)


def _counterclockwise(points):
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1]))
    return points if area > 0 else list(reversed(points))


def prism(points, z0, z1, side, top=None, name='prism'):
    # a building block: the outline `points` (x, y), any simple polygon, raised from z0 to z1.
    # UVs are world units: along the outline and up it on the walls, x and y on top
    points = _counterclockwise(points)
    bm = bmesh.new()
    uvs = bm.loops.layers.uv.new()
    low = [bm.verts.new((x, y, z0)) for x, y in points]
    high = [bm.verts.new((x, y, z1)) for x, y in points]
    along = 0.0
    for i in range(len(points)):
        j = (i + 1) % len(points)
        length = math.dist(points[i], points[j])
        f = bm.faces.new([low[i], low[j], high[j], high[i]])
        f.material_index = 0
        for loop, uv in zip(f.loops, [(along, z0), (along + length, z0), (along + length, z1), (along, z1)]):
            loop[uvs].uv = uv
        along += length
    f = bm.faces.new(high)
    f.material_index = 1 if top is not None else 0
    for loop in f.loops:
        loop[uvs].uv = (loop.vert.co.x, loop.vert.co.y)
    return _link(name, bm, [side] + ([top] if top is not None else []))


def parapet(points, z, material, width=0.03, height=0.025):
    # a low wall around the inside edge of a roof with outline `points`
    points = _counterclockwise(points)
    for a, b in zip(points, points[1:] + points[:1]):
        d = Vector((b[0] - a[0], b[1] - a[1])).normalized()
        inward = Vector((-d.y, d.x)) * width
        prism([a, b, (b[0] + inward.x, b[1] + inward.y), (a[0] + inward.x, a[1] + inward.y)],
              z, z + height, material, name='parapet')


def building(points, height, walls, roof, rim):
    # a flat-roofed building with a parapet
    prism(points, 0, height, walls, roof, name='building')
    parapet(points, height, rim)


def pitched_roof(x0, y0, x1, y1, z, rise, material, ridge='x', hip=False, overhang=0.03):
    # A roof over the rectangle (x0, y0)-(x1, y1) standing on walls of height z: a gable roof
    # whose ridge runs along x or y, or with hip=True a hipped roof, sloping on all four sides,
    # whose ridge is shortened by the roof's depth (a pyramid on a square). UVs are the top view.
    x0, y0, x1, y1 = x0 - overhang, y0 - overhang, x1 + overhang, y1 + overhang
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    if ridge == 'x':
        inset = min((y1 - y0) / 2, (x1 - x0) / 2) if hip else 0.0
        a, b = (x0 + inset, ym, z + rise), (x1 - inset, ym, z + rise)
    else:
        inset = min((x1 - x0) / 2, (y1 - y0) / 2) if hip else 0.0
        a, b = (xm, y0 + inset, z + rise), (xm, y1 - inset, z + rise)
    bm = bmesh.new()
    uvs = bm.loops.layers.uv.new()
    sw, se, ne, nw = [bm.verts.new(c) for c in [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]]
    ra = bm.verts.new(a)
    # a hipped roof on a square has a single apex, where the two ridge ends meet
    rb = ra if math.dist(a, b) < 1e-6 else bm.verts.new(b)
    if ridge == 'x':
        faces = [(sw, se, rb, ra), (ne, nw, ra, rb), (nw, sw, ra), (se, ne, rb)]
    else:
        faces = [(se, ne, rb, ra), (nw, sw, ra, rb), (sw, se, ra), (ne, nw, rb)]
    for verts in faces:
        f = bm.faces.new(list(dict.fromkeys(verts)))  # a quad with one apex is a triangle
        for loop in f.loops:
            loop[uvs].uv = (loop.vert.co.x, loop.vert.co.y)
    bm.faces.new([sw, nw, ne, se])  # the underside, so the roof is a closed solid
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _link('roof', bm, [material])


def house(x0, y0, x1, y1, height, rise, walls, roof, ridge='x', hip=False):
    # a building with a pitched roof
    box(x0, y0, 0, x1, y1, height, walls, name='house')
    pitched_roof(x0, y0, x1, y1, height, rise, roof, ridge, hip)


def mansard_roof(x0, y0, x1, y1, z, rise, inset, slope, top=None, overhang=0.03):
    # A roof over the rectangle (x0, y0)-(x1, y1) standing on walls of height z: four slopes rising
    # `rise` as they come in by `inset`, to a flat top, which can take its own material.
    # UVs are the top view.
    x0, y0, x1, y1 = x0 - overhang, y0 - overhang, x1 + overhang, y1 + overhang
    bm = bmesh.new()
    uvs = bm.loops.layers.uv.new()
    low = [bm.verts.new(c) for c in [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]]
    high = [bm.verts.new(c) for c in [(x0 + inset, y0 + inset, z + rise), (x1 - inset, y0 + inset, z + rise),
                                      (x1 - inset, y1 - inset, z + rise), (x0 + inset, y1 - inset, z + rise)]]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new([low[i], low[j], high[j], high[i]]).material_index = 0
    bm.faces.new(high).material_index = 1 if top is not None else 0
    bm.faces.new(list(reversed(low)))  # the underside, so the roof is a closed solid
    for f in bm.faces:
        for loop in f.loops:
            loop[uvs].uv = (loop.vert.co.x, loop.vert.co.y)
    return _link('roof', bm, [slope] + ([top] if top is not None else []))


def strut(p, q, r, material, verts=8):
    # a round bar from the point p to the point q, (x, y, z) each: a leg, a brace or a boom
    p, q = Vector(p), Vector(q)
    d = q - p
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(p + q) / 2)
    ob = bpy.context.object
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    ob.data.materials.append(material)
    return ob


def circle(cx, cy, r, sides=40):
    # the outline of a circle as a polygon, for round buildings and their roofs
    return [(cx + r * math.cos(2 * math.pi * i / sides), cy + r * math.sin(2 * math.pi * i / sides))
            for i in range(sides)]


def patch(cx, cy, rx, ry, rng, wobble=0.3, sides=28):
    # an irregular blob round (cx, cy), about rx by ry, for worn ground and clearings: each point's
    # radius strays by up to `wobble` of itself, smoothed with its neighbours so the edge stays soft
    raw = [1 + rng.uniform(-wobble, wobble) for _ in range(sides)]
    smooth = [(raw[i - 1] + 2 * raw[i] + raw[(i + 1) % sides]) / 4 for i in range(sides)]
    return [(cx + rx * s * math.cos(2 * math.pi * i / sides), cy + ry * s * math.sin(2 * math.pi * i / sides))
            for i, s in enumerate(smooth)]


def round_building(cx, cy, r, height, walls, roof, rim):
    # a flat-roofed round tower with a parapet; its walls' texture wraps round it
    building(circle(cx, cy, r), height, walls, roof, rim)


def roof_clutter(areas, z, rng, unit, fan, count=6, avoid=()):
    # air-conditioning units and vents scattered over roof rectangles (x0, y0, x1, y1),
    # kept apart from each other and out of the `avoid` rectangles
    taken = list(avoid)
    for (x0, y0, x1, y1) in areas:
        placed = 0
        for _ in range(count * 30):
            if placed == count:
                break
            w, d = rng.uniform(0.06, 0.15), rng.uniform(0.05, 0.1)
            if rng.random() < 0.5:
                w, d = d, w
            if x1 - x0 < w + 0.08 or y1 - y0 < d + 0.08:
                break
            ux, uy = rng.uniform(x0 + 0.04, x1 - 0.04 - w), rng.uniform(y0 + 0.04, y1 - 0.04 - d)
            if any(ux < b[2] + 0.03 and ux + w > b[0] - 0.03 and uy < b[3] + 0.03 and uy + d > b[1] - 0.03
                   for b in taken):
                continue
            taken.append((ux, uy, ux + w, uy + d))
            h = rng.uniform(0.025, 0.045)
            box(ux, uy, z, ux + w, uy + d, z + h, unit, name='ac_unit')
            fans = 2 if max(w, d) > 0.1 else 1
            for i in range(fans):
                if w >= d:
                    cx, cy = ux + (i + 0.5) * w / fans, uy + d / 2
                else:
                    cx, cy = ux + w / 2, uy + (i + 0.5) * d / fans
                cylinder(cx, cy, z + h, z + h + 0.004, min(w, d) * 0.36, fan)
            placed += 1
        for _ in range(count):
            vx, vy = rng.uniform(x0 + 0.05, x1 - 0.05), rng.uniform(y0 + 0.05, y1 - 0.05)
            if not any(b[0] - 0.02 < vx < b[2] + 0.02 and b[1] - 0.02 < vy < b[3] + 0.02 for b in taken):
                cylinder(vx, vy, z, z + 0.018, 0.009, unit, 10)


def zone_letter(letter, cx, cy, z, height, material, thickness=0.03):
    # A zone's letter in LETTER_FONT, `height` tall and centred on (cx, cy), standing
    # `thickness` proud of a roof or the ground at z so it casts a shadow
    curve = bpy.data.curves.new('letter_' + letter, 'FONT')
    curve.body = letter
    curve.font = bpy.data.fonts.load(LETTER_FONT, check_existing=True)
    curve.extrude = thickness / 2  # extruded both ways, from -thickness/2 to +thickness/2
    ob = bpy.data.objects.new('letter_' + letter, curve)
    bpy.context.scene.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    scale = height / (max(ys) - min(ys))
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    for v in ob.data.vertices:
        v.co = ((v.co.x - mx) * scale + cx, (v.co.y - my) * scale + cy, v.co.z + thickness / 2 + z)
    # a mesh made from text keeps the font's own UVs, in glyph units, so a textured material would
    # stretch a speck of its image over the letter: replace them with the top view, in world units,
    # as every other shape has
    while ob.data.uv_layers:
        ob.data.uv_layers.remove(ob.data.uv_layers[0])
    uvs = ob.data.uv_layers.new(name='UVMap')
    for loop in ob.data.loops:
        co = ob.data.vertices[loop.vertex_index].co
        uvs.data[loop.index].uv = (co.x, co.y)
    ob.data.materials.append(material)
    return ob


def dashes(x0, y0, x1, y1, material, dash=0.08, gap=0.06, width=0.012, z=0.006):
    # a dashed line, along x or along y, such as a road's centre line
    horizontal = abs(x1 - x0) >= abs(y1 - y0)
    start, end = (x0, x1) if horizontal else (y0, y1)
    p = start
    while p < end:
        q = min(p + dash, end)
        if horizontal:
            box(p, y0 - width / 2, z - 0.002, q, y0 + width / 2, z, material, name='dash')
        else:
            box(x0 - width / 2, p, z - 0.002, x0 + width / 2, q, z, material, name='dash')
        p = q + gap


# --- rendering ---

FIT_TOLERANCE = 0.003  # how far a sheared point may stray past the edge: a flat ground layer's rim


def spans_edge(ob):
    # Mark an object that crosses a tile's edge by design, running on into the neighbouring tile
    # that continues it: a power line's wire, a bridge's deck. The fit check passes it. The scene
    # builds it past the edge by at least its sheared lift, so that where the frame cuts it off,
    # the neighbour's copy of it, built the same way, takes over without a gap.
    ob['spans_edge'] = True
    return ob


def _shear_scene(scene, tiles):
    # Shear every point up and to the right by its height, then fail if anything the camera
    # sees stands past the zone's edge: the game draws each tile on its own, so it would be cut off.
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    outside = set()
    for ob in scene.objects:
        if ob.type != 'MESH':
            continue
        for v in ob.data.vertices:
            v.co.x += SHEAR * v.co.z
            v.co.y += SHEAR * v.co.z
            if ob.visible_camera and not ob.get('spans_edge') and v.co.z >= 0 and not (
                    -FIT_TOLERANCE <= v.co.x <= tiles + FIT_TOLERANCE and
                    -FIT_TOLERANCE <= v.co.y <= tiles + FIT_TOLERANCE):
                outside.add(ob.name)
    if outside:
        raise ValueError('past the edge of the zone: ' + ', '.join(sorted(outside)))


def _sun(scene, azimuth, elevation, colour, strength):
    # Shadows survive the shear exactly if the light's direction is sheared with the scene,
    # since a shear maps straight shadow rays to straight shadow rays.
    az, el = math.radians(azimuth), math.radians(elevation)
    to_sun = Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))
    travel = -to_sun
    travel = Vector((travel.x + SHEAR * travel.z, travel.y + SHEAR * travel.z, travel.z)).normalized()
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = strength
    sun.data.color = colour
    sun.data.angle = math.radians(1.5)
    sun.rotation_euler = travel.to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(sun)


def _sky(scene, sun_elevation, strength):
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    sky = world.node_tree.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_disc = False
    sky.sun_elevation = math.radians(sun_elevation)
    background = world.node_tree.nodes['Background']
    background.inputs['Strength'].default_value = strength
    world.node_tree.links.new(sky.outputs['Color'], background.inputs['Color'])
    scene.world = world


GROUND_TOP = 0.01  # an object no taller than this lies on the ground: lawn, paving, markings


def _top(ob):
    return max((v.co.z for v in ob.data.vertices), default=0.0)


def _frame(scene, cam, x0, y0, x1, y1):
    # point the camera at the world rectangle (x0, y0)-(x1, y1), rendered at twice TILE_PX
    cam.data.ortho_scale = max(x1 - x0, y1 - y0)
    cam.location = ((x0 + x1) / 2, (y0 + y1) / 2, 20)
    scene.render.resolution_x = round(2 * TILE_PX * (x1 - x0))
    scene.render.resolution_y = round(2 * TILE_PX * (y1 - y0))


def _render_to(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    final = bpy.data.images.load(path)
    final.scale(scene.render.resolution_x // 2, scene.render.resolution_y // 2)
    final.save()


def render(scene, out_dir, tiles, samples=192,
           sun_azimuth=300, sun_elevation=35, sun_colour=(1.0, 0.88, 0.72), sun_strength=5.5,
           sky_strength=0.17):
    # Shear the finished scene, light it, and render a zone `tiles` tiles square into out_dir
    # as three layers at TILE_PX pixels per tile, each rendered at twice that and scaled down:
    #   ground.png   the ground, with no shadow on it
    #   shadow.png   black whose alpha is the shadow everything casts onto flat ground. It
    #                reaches past the zone wherever the shadows do, by whole tiles, as
    #                layers.json records
    #   objects.png  buildings, trees and cars over transparency, with the shadows the zone
    #                casts on its own objects
    # The game draws every zone's ground, then the shadows merged by their darkest, then
    # every zone's objects, so a shadow falls across neighbouring ground but never on a roof.
    # The sun's azimuth is the compass bearing it shines from: 0 north, 270 west.
    _shear_scene(scene, tiles)
    meshes = [ob for ob in scene.objects if ob.type == 'MESH']
    ground = [ob for ob in meshes if _top(ob) <= GROUND_TOP]
    standing = [ob for ob in meshes if _top(ob) > GROUND_TOP]
    tallest = max((_top(ob) for ob in standing), default=0.0)

    cam = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    cam.data.type = 'ORTHO'
    cam.data.clip_end = 100
    scene.collection.objects.link(cam)
    scene.camera = cam
    _sun(scene, sun_azimuth, sun_elevation, sun_colour, sun_strength)
    _sky(scene, sun_elevation, sky_strength)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    # each pixel samples only its own square: the default filter, wider than a pixel, reaches
    # past the frame's edge, where nothing of the zone is, and darkens its outermost pixels, a
    # faint line where it meets its neighbour. Rendering at twice the size smooths edges instead.
    scene.cycles.filter_width = 1.0
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    os.makedirs(out_dir, exist_ok=True)

    # the ground, with nothing standing on it to cast a shadow
    for ob in standing:
        ob.hide_render = True
    _frame(scene, cam, 0, 0, tiles, tiles)
    scene.render.film_transparent = False
    _render_to(scene, os.path.join(out_dir, 'ground.png'))
    for ob in standing:
        ob.hide_render = False

    # the objects, over transparency where the ground shows
    seen = {ob.name: ob.visible_camera for ob in meshes}
    for ob in ground:
        ob.visible_camera = False
    scene.render.film_transparent = True
    _render_to(scene, os.path.join(out_dir, 'objects.png'))

    # the shadows, caught on a flat ground that reaches as far as the longest shadow
    for ob in ground:
        ob.hide_render = True
    for ob in standing:
        ob.visible_camera = False
        if ob.get('neighbours_shade'):
            ob.hide_render = True
    reach = tallest / math.tan(math.radians(sun_elevation)) + 0.05
    away = math.radians(sun_azimuth + 180)
    dx, dy = math.sin(away) * reach, math.cos(away) * reach
    margin = {'left': math.ceil(max(-dx, 0)), 'right': math.ceil(max(dx, 0)),
              'bottom': math.ceil(max(-dy, 0)), 'top': math.ceil(max(dy, 0))}
    x0, y0 = -margin['left'], -margin['bottom']
    x1, y1 = tiles + margin['right'], tiles + margin['top']
    catcher = box(x0 - 1, y0 - 1, -0.01, x1 + 1, y1 + 1, 0.0, plain('catcher', '808080'), name='catcher')
    catcher.is_shadow_catcher = True
    _frame(scene, cam, x0, y0, x1, y1)
    _render_to(scene, os.path.join(out_dir, 'shadow.png'))
    bpy.data.objects.remove(catcher)
    for ob in meshes:
        ob.hide_render = False
        ob.visible_camera = seen[ob.name]

    with open(os.path.join(out_dir, 'layers.json'), 'w') as f:
        json.dump({'tiles': tiles, 'tile_px': TILE_PX, 'shadow_margin': margin}, f, indent=2)
        f.write('\n')


def render_tiles(script, builders, **render_args):
    # Render a set of single tiles, such as every road piece: builders maps a tile id, as
    # src/tileValues.ts numbers them, to a function that builds that tile's scene, from nothing,
    # with the tile's south-west corner at the origin. Each renders as a zone of one tile into
    # <out>/<id, four digits>, where <out> is out_dir(script). Ids after the directory on the
    # command line (`-- <directory> 66,70-75`) render only those.
    import sys
    out = out_dir(script)
    wanted = None
    if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 2:
        wanted = set()
        for part in sys.argv[sys.argv.index('--') + 2].split(','):
            first, _, last = part.partition('-')
            wanted.update(range(int(first), int(last or first) + 1))
    for tile, build in sorted(builders.items()):
        if wanted is not None and tile not in wanted:
            continue
        scene = new_scene()
        build()
        render(scene, os.path.join(out, f'{tile:04d}'), tiles=1, **render_args)
