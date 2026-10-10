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

"""The world grass the game draws under bare land, and the surfaces it draws over the grass from the map, the canopy and
the water, and the walkways over the ground (docs/render-assets.md): two sets of corner Wang tiles cut from the
paintings in art/painted/raw/grass, a set for each surface cut from its own painting, the hash and noise that pick a
tile, mix the grass's sets and wobble the surfaces' edges by map position, and the walkways' looks, drawn in the
straw's strokes. The grass is the base the others are drawn over and share their machinery with, which is why one
module holds them all.

    python art/tools/grass.py --vectors

writes conformance/grass.json, the vectors the client's hash and noise are held to. The atlas build (atlas.py) builds
the sets and writes them, with CONSTANTS, into the manifest's grass section, the canopy's set, with CANOPY, into its
canopy section, and the water's, with WATER, into its water section, and writes WALKWAY into its walkway section.

A set is colours ** 4 tiles. Each corner of the map's tile lattice takes a colour from an integer hash of its position,
and a map tile draws the tile of its four corners' colours: edges always meet, since only an edge's two corners reach
it, and nothing repeats on a period. A tile is the variance-preserving blend (Heitz and Neyret) of the patches round its
four corners, one per colour, and a centre patch of its own, each cut from the painting at a random place. Everything
the client computes from CONSTANTS, it computes with the same arithmetic here, + - * / and floor, so both give the same
numbers to the last bit; CONSTANTS carries the gradients and turns as numbers rather than angles for that reason. Needs
Pillow, NumPy and SciPy.
"""

import argparse
import hashlib
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '..', 'painted', 'raw')
VECTORS = os.path.join(HERE, '..', '..', 'conformance', 'grass.json')
RULE_CONSTANTS = os.path.join(HERE, '..', '..', 'conformance', 'ruleConstants.json')

PX = 64                        # the art's pixels a tile
# the map's tiles, which the baked field covers, as the fixture tool writes them from the rules
with open(RULE_CONSTANTS) as _f:
    _MAP_SIZE = json.load(_f)['mapSize']
MAP_WIDTH, MAP_HEIGHT = _MAP_SIZE['width'], _MAP_SIZE['height']

# What the client computes the grass from, written into the manifest as they are
CONSTANTS = {
    # corner colours: each lattice point's colour is its hash, by this seed, modulo the colours
    'colours': 3,
    'corners': {'seed': 0x6A11},
    # the share of straw at a map position: two octaves of gradient noise, each on a lattice `cell` tiles apart turned
    # by (cos, sin), summed by weight, then handed over from lush to straw by smootherstep across `width` of the noise
    # about `centre`, so straw covers about 70% of the land
    'mask': {
        'octaves': [{'cell': 9.0, 'seed': 0x2001, 'weight': 0.75, 'turn': [0.819648, 0.572867]},
                    {'cell': 3.33, 'seed': 0x2002, 'weight': 0.3, 'turn': [0.908966, -0.416871]}],
        'gradients': [[1.0, 0.0], [0.92388, 0.382683], [0.707107, 0.707107], [0.382683, 0.92388],
                      [0.0, 1.0], [-0.382683, 0.92388], [-0.707107, 0.707107], [-0.92388, 0.382683],
                      [-1.0, 0.0], [-0.92388, -0.382683], [-0.707107, -0.707107], [-0.382683, -0.92388],
                      [0.0, -1.0], [0.382683, -0.92388], [0.707107, -0.707107], [0.92388, -0.382683]],
        'centre': -0.095,
        'width': 0.42,
    },
    # the tint at a map position, from 0 to 1: two octaves of value noise summed by weight. The shader brightens by
    # brightness * (tint - 0.5), and warms toward `warm` by warmth * the tint's excess over 0.45, doubled, at most 1
    'tint': {
        'octaves': [{'cell': 7.0, 'seed': 0x1001, 'weight': 0.65},
                    {'cell': 2.5, 'seed': 0x1002, 'weight': 0.35}],
        'brightness': 0.16,
        'warmth': 0.35,
        'warm': [1.1, 1.03, 0.8],
    },
    # the texels a tile of the baked field of mask, tint and the canopy's wobble, which the client samples linearly
    'texelsPerTile': 8,
}

# Each set: its painting, how many map tiles across the painting is read as, the mean colour its tiles are moved to,
# how its patches may turn, any of the eight ways ('all'), only half round, for strokes that run one way ('half'), or
# not at all, for light that falls from one side ('none'), whether its broad light and dark patches are taken out, and
# the seed of its patches' places and turns. Straw keeps its chaotic brushwork whole; lush, from the empty residential
# zone's lawn, is moved halfway to straw's colour so its patches read as variation, not another lawn.
SETS = {
    'lush': {'painting': os.path.join(RAW, 'grass', 'lush.png'), 'tiles': 4, 'mean': (92, 112, 29), 'turns': 'all',
             'flatten': True, 'seed': 7},
    'straw': {'painting': os.path.join(RAW, 'grass', 'straw.png'), 'tiles': 6, 'mean': (103, 116, 39),
              'turns': 'half', 'flatten': False, 'seed': 7},
}

# The canopy, which the game draws over the grass from where the map's woods lie: a set built as the grass's are, from
# the painting in art/painted/raw/woods, its crowns lit from the upper left, so never turned, and darker than the grass
# so the woods read as standing above it, though warm enough to sit with straw
CANOPY_SET = {'painting': os.path.join(RAW, 'woods', 'canopy.png'), 'tiles': 8, 'mean': (74, 88, 34),
              'turns': 'none', 'flatten': False, 'seed': 11}
# What the client draws the canopy with, written into the manifest's canopy section as they are: its corners' seed;
# where its edge falls on the surface the woods make, from 0 off the woods to 1 within them, and over how much of that
# surface it fades into the grass; and the wobble of its edge, two octaves of gradient noise on the grass mask's
# gradients, summed by weight, in the units of that surface, baked into the grass's field from -1 to 1; and the shadow
# it casts right and down, away from the sun the renders are lit by, as the zones' shadows fall: how far, in tiles,
# how dark where the canopy casts it whole, and over how much of the surface it fades
CANOPY = {
    'corners': {'seed': 0x4001},
    'cut': 0.5,
    'feather': 0.12,
    'edge': {
        'octaves': [{'cell': 0.9, 'seed': 0x6001, 'weight': 1.2, 'turn': [0.819648, 0.572867]},
                    {'cell': 0.35, 'seed': 0x6002, 'weight': 0.8, 'turn': [0.572867, 0.819648]}],
    },
    'shadow': {'offset': 0.3, 'darkness': 0.5, 'feather': 0.35},
}
# The water, which the game draws over the grass from where the map's water lies: a set built as the grass's are, from
# the painting in art/painted/raw/water, its ripples running one way, so turned only half round, and its broad light
# and dark taken out, so open water reads as one surface
WATER_SET = {'painting': os.path.join(RAW, 'water', 'water.png'), 'tiles': 8, 'mean': (54, 107, 143),
             'turns': 'half', 'flatten': True, 'seed': 7}
# What the client draws the water with, written into the manifest's water section as they are: its corners' seed;
# where the shore falls on the surface the water makes, from 0 off the water to 1 within it, and over how much of that
# surface it fades into the sand; the wobble of the shore, as the canopy's edge's, small enough that the shore keeps
# close to the tiles' edges, so land still reads as land and water as water; and the sand along the shore: how far
# under the cut on that surface it reaches, its colour, and how much of the straw's light and dark it keeps
WATER = {
    'corners': {'seed': 0x3001},
    'cut': 0.5,
    'feather': 0.04,
    'edge': {
        'octaves': [{'cell': 1.1, 'seed': 0x5001, 'weight': 0.22, 'turn': [0.819648, 0.572867]},
                    {'cell': 0.45, 'seed': 0x5002, 'weight': 0.12, 'turn': [0.572867, 0.819648]}],
    },
    'sand': {'band': 0.2, 'mean': [190, 164, 116], 'contrast': 0.8},
}
# What the client draws the walkways with, written into the manifest's walkway section as they are: where a path's edge
# falls on the surface its ninths make, from 0 off them to 1 within them, and over how much of that surface it fades,
# the two together keeping a path within its own ninths; how far the water's wobble eats into its edge, so it never
# runs straight; the gravel of paths on open land and in parks, a warm sand in the straw's brushwork as the sand along
# the shore is, and the grey paving of sidewalks and of paths on road and rail, each a colour and how much of the
# straw's light and dark it keeps; and a crossing's stripes over a road, their colour and how many of each to a ninth
WALKWAY = {
    'cut': 0.62,
    'feather': 0.2,
    'edge': 0.35,
    'gravel': {'mean': [196, 168, 118], 'contrast': 0.9},
    'paving': {'mean': [152, 150, 144], 'contrast': 0.45},
    'crossing': {'colour': [236, 234, 224], 'stripes': 3},
}
BAND = 14                      # pixels in from a tile's edge over which its centre patch takes over from its corners


# The hash, on uint32 arrays: Chris Wellons' lowbias32
def lowbias32(x):
    x = np.asarray(x, dtype=np.uint32)
    x = x ^ (x >> np.uint32(16))
    x = (x.astype(np.uint64) * np.uint64(0x7FEB352D) & np.uint64(0xFFFFFFFF)).astype(np.uint32)
    x = x ^ (x >> np.uint32(15))
    x = (x.astype(np.uint64) * np.uint64(0x846CA68B) & np.uint64(0xFFFFFFFF)).astype(np.uint32)
    return x ^ (x >> np.uint32(16))


def lattice_hash(x, y, seed):
    # the hash of a lattice point, whole numbers, negative ones taken modulo 2 ** 32 as the client's >>> 0 takes them
    x = (np.asarray(x, dtype=np.int64) & 0xFFFFFFFF).astype(np.uint32)
    y = (np.asarray(y, dtype=np.int64) & 0xFFFFFFFF).astype(np.uint32)
    return lowbias32(x ^ lowbias32(y ^ np.uint32(seed)))


def wang_tile(x, y, constants=CONSTANTS):
    # the tile of the map tile at (x, y), y down: its corners' colours as digits, north-west first, then north-east,
    # south-west and south-east
    c, seed = constants['colours'], constants['corners']['seed']

    def colour(cx, cy):
        return (lattice_hash(cx, cy, seed) % np.uint32(c)).astype(np.int64)
    return colour(x, y) + colour(x + 1, y) * c + colour(x, y + 1) * c * c + colour(x + 1, y + 1) * c * c * c


def gradient_noise(x, y, octave, gradients):
    # Perlin-style gradient noise, on the octave's lattice turned off the map's axes, with a quintic fade
    cos, sin = octave['turn']
    gx = (cos * x - sin * y) / octave['cell']
    gy = (sin * x + cos * y) / octave['cell']
    x0, y0 = np.floor(gx), np.floor(gy)
    fx, fy = gx - x0, gy - y0
    table = np.asarray(gradients)

    def dot(lx, ly, dx, dy):
        g = table[(lattice_hash(lx, ly, octave['seed']) & np.uint32(15)).astype(np.int64)]
        return g[..., 0] * dx + g[..., 1] * dy

    def fade(t):
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
    a = dot(x0, y0, fx, fy)
    b = dot(x0 + 1, y0, fx - 1.0, fy)
    c = dot(x0, y0 + 1, fx, fy - 1.0)
    d = dot(x0 + 1, y0 + 1, fx - 1.0, fy - 1.0)
    ux, uy = fade(fx), fade(fy)
    return (a * (1.0 - ux) + b * ux) * (1.0 - uy) + (c * (1.0 - ux) + d * ux) * uy


def value_noise(x, y, octave):
    # smooth value noise from 0 to 1, on the octave's lattice
    gx, gy = x / octave['cell'], y / octave['cell']
    x0, y0 = np.floor(gx), np.floor(gy)
    fx, fy = gx - x0, gy - y0
    sx, sy = fx * fx * (3.0 - 2.0 * fx), fy * fy * (3.0 - 2.0 * fy)

    def v(lx, ly):
        return lattice_hash(lx, ly, octave['seed']).astype(np.float64) / 4294967295.0
    return ((v(x0, y0) * (1.0 - sx) + v(x0 + 1, y0) * sx) * (1.0 - sy)
            + (v(x0, y0 + 1) * (1.0 - sx) + v(x0 + 1, y0 + 1) * sx) * sy)


def octaves(noise, x, y, layers, *extra):
    # the layers' octaves summed by weight, in order
    total = 0.0
    for octave in layers['octaves']:
        total = total + octave['weight'] * noise(x, y, octave, *extra)
    return total


def straw_share(x, y, constants=CONSTANTS):
    # the share of straw at map positions, in tiles
    mask = constants['mask']
    n = octaves(gradient_noise, x, y, mask, mask['gradients'])
    e = np.clip((n - mask['centre']) / mask['width'] + 0.5, 0.0, 1.0)
    return e * e * e * (e * (e * 6.0 - 15.0) + 10.0)


def tint(x, y, constants=CONSTANTS):
    # the tint at map positions, in tiles, from 0 to 1
    return octaves(value_noise, x, y, constants['tint'])


def edge(x, y, constants=CONSTANTS, surface=CANOPY):
    # the wobble of the edge of a surface the map draws, the canopy's or the water's, at map positions, in tiles
    return octaves(gradient_noise, x, y, surface['edge'], constants['mask']['gradients'])


def field(constants=CONSTANTS, canopy=CANOPY, water=WATER, width=MAP_WIDTH, height=MAP_HEIGHT):
    # The baked field the client samples: texelsPerTile texels a tile, each the straw share, the tint, the canopy's
    # wobble and the shore's at its centre, each wobble from -1 to 1 as 0 to 1 and held there, as bytes rounded half up,
    # an array of rows of (share, tint, canopy's wobble, shore's)
    k = constants['texelsPerTile']
    ys, xs = np.mgrid[0:height * k, 0:width * k].astype(np.float64)
    x, y = (xs + 0.5) / k, (ys + 0.5) / k

    def wobble(surface):
        return np.floor((np.clip(edge(x, y, constants, surface), -1.0, 1.0) + 1.0) / 2.0 * 255.0 + 0.5)
    return np.stack([np.floor(straw_share(x, y, constants) * 255.0 + 0.5),
                     np.floor(tint(x, y, constants) * 255.0 + 0.5),
                     wobble(canopy), wobble(water)],
                    axis=-1).astype(np.uint8)


def _dihedral(a, k):
    a = np.rot90(a, k % 4)
    return a[:, ::-1] if k >= 4 else a


def _levelled(p, mean):
    # a patch with its own mean and tilt taken out and the set's mean put in: tiles cut from lighter and darker parts of
    # a painting would checker, and a patch's tilt would stripe the map once a tile row; the strokes stay as painted
    side = p.shape[0]
    yy, xx = (np.mgrid[0:side, 0:side] + 0.5) / side - 0.5
    flat = p.reshape(-1, 3)
    xs, ys = xx.reshape(-1, 1), yy.reshape(-1, 1)
    slope_x = (xs * flat).sum(axis=0) / (xs * xs).sum()
    slope_y = (ys * flat).sum(axis=0) / (ys * ys).sum()
    return p - flat.mean(axis=0) - xx[..., None] * slope_x - yy[..., None] * slope_y + mean


def blend_weights(u, v, band=BAND):
    # The weights of a tile's four corner patches and its centre patch at its pixels (u, v), from 0 to 1 across it:
    # north-west, north-east, south-west, south-east, centre. On an edge only that edge's two corners weigh anything,
    # in proportions of the position along it alone, so two tiles that share an edge's corners agree on it exactly.
    su, sv = u * u * (3.0 - 2.0 * u), v * v * (3.0 - 2.0 * v)
    d = np.minimum(np.minimum(u, 1.0 - u), np.minimum(v, 1.0 - v)) * PX
    e = np.clip(d / band, 0.0, 1.0)
    centre = 0.97 * e * e * (3.0 - 2.0 * e)
    corners = [(1 - su) * (1 - sv), su * (1 - sv), (1 - su) * sv, su * sv]
    return [w * (1 - centre) for w in corners] + [centre]


def build_set(spec, constants=CONSTANTS):
    # The set's tiles, colours ** 4 of them, each PX square, as uint8 RGB arrays indexed by wang_tile's number
    colours = constants['colours']
    n = spec['tiles'] * PX
    m = np.asarray(Image.open(spec['painting']).convert('RGB').resize((n, n), Image.LANCZOS))
    m = m.astype(np.float64)
    if spec['flatten']:
        broad = ndimage.gaussian_filter(m, (12, 12, 0), mode='reflect')
        m = m - broad + broad.mean(axis=(0, 1))
    mean = np.asarray(spec['mean'], dtype=np.float64)
    m = m - m.reshape(-1, 3).mean(axis=0) + mean
    rng = np.random.default_rng(spec['seed'])

    def patch(side):
        y, x = rng.integers(0, n - side + 1, 2)
        if spec['turns'] == 'all':
            turn = int(rng.integers(8))
        elif spec['turns'] == 'half':
            turn = 2 * int(rng.integers(2))
        else:
            turn = 0
        return _dihedral(_levelled(m[y:y + side, x:x + side], mean), turn)
    corner_patches = [patch(2 * PX) for _ in range(colours)]
    k = (np.arange(PX) + 0.5) / PX
    u, v = np.meshgrid(k, k)
    weights = blend_weights(u, v)
    norm = np.sqrt(sum(w * w for w in weights))[..., None]
    made = []
    for t in range(colours ** 4):
        nw, ne, sw, se = t % colours, t // colours % colours, t // colours ** 2 % colours, t // colours ** 3
        # each corner patch read from its middle, which is the corner
        parts = [corner_patches[nw][PX:, PX:], corner_patches[ne][PX:, :PX], corner_patches[sw][:PX, PX:],
                 corner_patches[se][:PX, :PX], patch(PX)]
        made.append(mean + sum(w[..., None] * (p - mean) for p, w in zip(parts, weights)) / norm)
    # Every tile's edges are its corner patches' and its middle its own, so whatever sets the corner patches apart on
    # average would show as a line along every tile edge: take out the tiles' mean profile down and across, the same
    # for every tile, smoothed round the tile so it wraps
    stack = np.stack(made)
    rows = ndimage.gaussian_filter1d(stack.mean(axis=(0, 2)), 3, axis=0, mode='wrap')
    columns = ndimage.gaussian_filter1d(stack.mean(axis=(0, 1)), 3, axis=0, mode='wrap')
    stack = stack - (rows - rows.mean(axis=0))[None, :, None] - (columns - columns.mean(axis=0))[None, None, :]
    return [np.clip(np.floor(t + 0.5), 0, 255).astype(np.uint8) for t in stack]


def build_sets():
    # every set's tiles, and each set's mean colour as its tiles have it
    sets = {name: build_set(spec) for name, spec in SETS.items()}
    means = {name: [round(float(c), 3) for c in np.mean([t.reshape(-1, 3).mean(axis=0) for t in tiles], axis=0)]
             for name, tiles in sets.items()}
    return sets, means


def mean_colour(means, constants=CONSTANTS):
    # The grass's mean colour over the map, as the shader mixes and tints it, worked out at the baked field's texels
    baked = field(constants).astype(np.float64) / 255.0
    t, n = baked[..., 0:1], baked[..., 1:2]
    lush, straw = np.asarray(means['lush']), np.asarray(means['straw'])
    tinted = (lush * (1 - t) + straw * t) * (1 + constants['tint']['brightness'] * (n - 0.5))
    w = constants['tint']['warmth'] * np.clip((n - 0.45) * 2.0, 0, 1)
    return (tinted * (1 - w) + tinted * np.asarray(constants['tint']['warm']) * w).reshape(-1, 3).mean(axis=0)


def sample(sets, means, side=4, constants=CONSTANTS):
    # A square of grass `side` tiles a side that wraps: the straw set on a lattice whose corners repeat every `side`
    # tiles, moved to the grass's mean colour over the map. The page background, and the 16 px sheet's land, are cut
    # from it.
    colours = constants['colours']
    image = np.zeros((side * PX, side * PX, 3))
    for y in range(side):
        for x in range(side):
            c = [int(lattice_hash(cx % side, cy % side, constants['corners']['seed']) % colours)
                 for cx, cy in ((x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1))]
            t = c[0] + c[1] * colours + c[2] * colours ** 2 + c[3] * colours ** 3
            image[y * PX:(y + 1) * PX, x * PX:(x + 1) * PX] = sets['straw'][t]
    image = image - image.reshape(-1, 3).mean(axis=0) + mean_colour(means, constants)
    return Image.fromarray(np.clip(np.floor(image + 0.5), 0, 255).astype(np.uint8))


def vectors():
    # The vectors conformance/grass.json holds: the hash, the tile picked and the noise at map positions, and the
    # SHA-256 of the baked field's bytes, row by row, share, tint and the two wobbles
    positions = [(0, 0), (1, 0), (0, 1), (7, 3), (119, 99), (120, 100), (-1, -1), (-37, 54), (65535, 2), (12345, 67890)]
    hashes = [{'x': x, 'y': y, 'seed': s, 'hash': int(lattice_hash(x, y, s))}
              for x, y in positions for s in (0, CONSTANTS['corners']['seed'])]
    tiles = [{'x': x, 'y': y, 'tile': int(wang_tile(x, y))} for x, y in positions]
    points = [(0.0, 0.0), (0.0625, 0.0625), (3.5, 7.25), (59.9375, 49.0625), (119.9375, 99.9375), (-4.5, 2.25),
              (200.5, 300.125)]
    noise = [{'x': x, 'y': y, 'straw': float(straw_share(np.float64(x), np.float64(y))),
              'tint': float(tint(np.float64(x), np.float64(y))), 'edge': float(edge(np.float64(x), np.float64(y))),
              'shore': float(edge(np.float64(x), np.float64(y), surface=WATER))}
             for x, y in points]
    baked = field()
    return {'lowbias32': [{'in': v, 'out': int(lowbias32(v))} for v in (0, 1, 0x6A11, 0xDEADBEEF, 0xFFFFFFFF)],
            'hashes': hashes, 'tiles': tiles, 'noise': noise,
            'field': {'width': baked.shape[1], 'height': baked.shape[0],
                      'sha256': hashlib.sha256(baked.tobytes()).hexdigest()}}


def write_vectors(path=VECTORS):
    with open(path, 'w') as f:
        json.dump(vectors(), f, indent=1)
        f.write('\n')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('--vectors', action='store_true', help='write conformance/grass.json')
    a = p.parse_args()
    if a.vectors:
        write_vectors()
