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

"""Corner Wang grass: colours ** 4 tiles cut from one painting, picked per map tile by an integer hash of its four corners'
lattice points, with a world-space value noise colour variation over them.

  wang.py build <painting.png> <tiles> <r,g,b> <outdir>   cut the 16 tiles (tile-NN.png, sheet.png) from the painting,
                                                          read as <tiles> map tiles across
The tiles' index bits: 1 north-west, 2 north-east, 4 south-west, 8 south-east corner colour. A tile is the
variance-preserving blend (Heitz & Neyret) of the two corner-colour patches round its corners and its own centre
patch, weighted so that only the two corners of an edge reach it and in the same proportions from both sides:
edges are continuous by construction, whatever tiles meet.
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

PX = 64
SEED = 0x6A11


def lowbias32(x):
    # Chris Wellons' lowbias32, on uint32 arrays; the shader's is the same integer arithmetic
    x = np.asarray(x, dtype=np.uint32)
    x = x ^ (x >> np.uint32(16))
    x = (x * np.uint32(0x7FEB352D)).astype(np.uint32)
    x = x ^ (x >> np.uint32(15))
    x = (x * np.uint32(0x846CA68B)).astype(np.uint32)
    x = x ^ (x >> np.uint32(16))
    return x


def lattice_hash(X, Y, seed):
    X = np.asarray(X).astype(np.uint32)
    Y = np.asarray(Y).astype(np.uint32)
    return lowbias32(X ^ lowbias32(Y ^ np.uint32(seed)))


def corner_colour(X, Y, colours):
    return (lattice_hash(X, Y, SEED) % np.uint32(colours)).astype(int)


def tile_index(x, y, colours=2):
    # the Wang tile of the map tile at (x, y): its corners are lattice points (x, y) .. (x + 1, y + 1), y down,
    # as digits base `colours`: north-west, north-east, south-west, south-east
    c = colours
    return (corner_colour(x, y, c) + corner_colour(x + 1, y, c) * c + corner_colour(x, y + 1, c) * c * c
            + corner_colour(x + 1, y + 1, c) * c ** 3)


def value_noise(wx, wy, cell, seed):
    # smooth value noise in [0, 1] at world positions in tiles, on a lattice `cell` tiles apart
    gx, gy = wx / cell, wy / cell
    X0, Y0 = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    fx, fy = gx - X0, gy - Y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)

    def v(X, Y):
        return lattice_hash(X, Y, seed).astype(np.float64) / 4294967295.0
    a, b = v(X0, Y0), v(X0 + 1, Y0)
    c, d = v(X0, Y0 + 1), v(X0 + 1, Y0 + 1)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def tint(rgb, wx, wy):
    # layer 2: broad brightness and warmth over several tiles, as the shader would apply it
    n1 = value_noise(wx, wy, 7.0, 0x1001) * 0.65 + value_noise(wx, wy, 2.5, 0x1002) * 0.35
    n2 = value_noise(wx, wy, 11.0, 0x1003)
    bright = 1.0 + 0.16 * (n1 - 0.5)
    warm = np.array([1.10, 1.03, 0.80])
    w = 0.35 * np.clip((n2 - 0.45) * 2.0, 0, 1)
    out = rgb * bright[..., None]
    return out * (1 - w[..., None]) + out * warm * w[..., None]


def dihedral(a, k):
    # one of the square's eight rotations and reflections
    a = np.rot90(a, k % 4)
    return a[:, ::-1] if k >= 4 else a


def material(paintings, tiles, target, flatten=True):
    # each painting scaled to `tiles` map tiles across, its broad patches taken out unless `flatten` is off (layer 2
    # gives the broad variation), its mean the target
    out = []
    for painting in paintings:
        n = tiles * PX
        m = np.asarray(Image.open(painting).convert('RGB').resize((n, n), Image.LANCZOS)).astype(np.float64)
        if flatten:
            broad = ndimage.gaussian_filter(m, (12, 12, 0), mode='reflect')
            m = m - broad + broad.mean(axis=(0, 1))
        out.append(m - m.reshape(-1, 3).mean(0) + target)
    return out


def build(paintings, tiles, target, out, colours=2, band=14, directional=0, flatten=1, sharpen=1, seed=7):
    # directional: the strokes run one way, so a patch is only ever turned half round, which keeps their direction
    # colours ** 4 tiles. Corner patches, two tiles square with the corner point in their middle, one per colour;
    # a centre patch per tile, a tile square, each at a random place in a random painting, turned or mirrored at
    # random. The centre takes over `band` pixels in from the edges, so a tile's edges are its corners' and the
    # rest is its own
    rng = np.random.default_rng(seed)
    mats = material(paintings, tiles, target, bool(flatten))
    mu = np.concatenate([m.reshape(-1, 3) for m in mats]).mean(0)

    def patch(side):
        m = mats[rng.integers(len(mats))]
        y, x = rng.integers(0, m.shape[0] - side + 1, 2)
        p = m[y:y + side, x:x + side]
        # each patch levelled to the set's mean, so tiles cut from lighter and darker parts of the painting don't
        # checker; the strokes inside it are untouched
        # and its tilt: a plane fitted to each channel taken out, which otherwise stripes the map once a tile row
        yy, xx = np.mgrid[0:side, 0:side] / side - 0.5
        A = np.stack([xx.ravel(), yy.ravel(), np.ones(side * side)], axis=1)
        coef, *_ = np.linalg.lstsq(A, p.reshape(-1, 3), rcond=None)
        p = p - (A @ coef).reshape(side, side, 3) + mu
        return dihedral(p, 2 * int(rng.integers(2)) if directional else int(rng.integers(8)))
    S = [patch(2 * PX) for _ in range(colours)]
    count = colours ** 4
    k = (np.arange(PX) + 0.5) / PX
    s = k * k * (3 - 2 * k)
    u, v = np.meshgrid(s, s)
    px = np.arange(PX) + 0.5
    d = np.minimum.outer(np.minimum(px, PX - px), np.minimum(px, PX - px))
    e = np.clip(d / band, 0, 1)
    wc = 0.97 * e * e * (3 - 2 * e)
    os.makedirs(out, exist_ok=True)
    cols = int(np.ceil(np.sqrt(count)))
    sheet = Image.new('RGB', (cols * (PX + 4), cols * (PX + 4)), (255, 255, 255))
    made = []
    for t in range(count):
        nw, ne, sw, se = t % colours, t // colours % colours, t // colours ** 2 % colours, t // colours ** 3
        # each corner patch read relative to its corner point: the patch's middle is the corner
        parts = [(S[nw][PX:, PX:], (1 - u) * (1 - v)), (S[ne][PX:, :PX], u * (1 - v)),
                 (S[sw][:PX, PX:], (1 - u) * v), (S[se][:PX, :PX], u * v)]
        parts = [(p, w * (1 - wc)) for p, w in parts] + [(patch(PX), wc)]
        if sharpen != 1:
            # sharper hand-overs between sources, so each pixel keeps mostly one source's strokes; the same function
            # of the same weights on both sides of an edge, so edges still meet
            total = sum(w ** sharpen for _, w in parts)
            parts = [(p, w ** sharpen / total) for p, w in parts]
        acc = sum(w[..., None] * (p - mu) for p, w in parts)
        norm = np.sqrt(sum(w ** 2 for _, w in parts))
        made.append(mu + acc / norm[..., None])
    # Every tile's edges are its corner patches' and its middle its own, so whatever sets the corner patches apart on
    # average, such as a darker streak through their middles, would show as a line along every tile edge. Take out
    # the tiles' mean profile down and across, the same for every tile, smoothed round the tile so it wraps
    stack = np.stack(made)
    rows = ndimage.gaussian_filter1d(stack.mean(axis=(0, 2)), 3, axis=0, mode='wrap')
    columns = ndimage.gaussian_filter1d(stack.mean(axis=(0, 1)), 3, axis=0, mode='wrap')
    stack = stack - (rows - rows.mean(0))[None, :, None] - (columns - columns.mean(0))[None, None, :]
    for t in range(count):
        im = Image.fromarray(np.clip(stack[t], 0, 255).round().astype(np.uint8))
        im.save(os.path.join(out, f'tile-{t:03d}.png'))
        sheet.paste(im, ((t % cols) * (PX + 4), (t // cols) * (PX + 4)))
    sheet.save(os.path.join(out, 'sheet.png'))
    with open(os.path.join(out, 'colours'), 'w') as f:
        f.write(str(colours))


MIX_CELL = 9.0      # tiles between the region mask's lattice points
MIX_SEED = 0x2001


GRADIENTS = np.array([(np.cos(a), np.sin(a)) for a in np.arange(16) * 2 * np.pi / 16])   # a table: exact in a shader


def gradient_noise(wx, wy, cell, seed, angle):
    # Perlin-style gradient noise, about -0.7..0.7, on a lattice `cell` tiles apart turned by `angle`, so no lattice
    # axis lines up with the map's; each lattice point's gradient one of 16 directions by its hash; quintic fade
    c, s = np.cos(angle), np.sin(angle)
    gx, gy = (c * wx - s * wy) / cell, (s * wx + c * wy) / cell
    X0, Y0 = np.floor(gx).astype(np.int64), np.floor(gy).astype(np.int64)
    fx, fy = gx - X0, gy - Y0

    def fade(t):
        return t * t * t * (t * (t * 6 - 15) + 10)

    def dot(X, Y, dx, dy):
        g = GRADIENTS[(lattice_hash(X, Y, seed) & np.uint32(15)).astype(int)]
        return g[..., 0] * dx + g[..., 1] * dy
    ux, uy = fade(fx), fade(fy)
    a, b = dot(X0, Y0, fx, fy), dot(X0 + 1, Y0, fx - 1, fy)
    cc, d = dot(X0, Y0 + 1, fx, fy - 1), dot(X0 + 1, Y0 + 1, fx - 1, fy - 1)
    return (a * (1 - ux) + b * ux) * (1 - uy) + (cc * (1 - ux) + d * ux) * uy


MIX_CENTRE = -0.095  # near the noise's 30th percentile, so the second set, straw, covers about 70% of the land
MIX_WIDTH = 0.42     # the noise's span over which one set hands over to the other


def region_mask(wx, wy):
    # the share of the second set at world positions: gradient noise over two octaves at different turns, handed
    # over by smootherstep across a wide band, so lush patches fade in and out over several tiles
    n = (gradient_noise(wx, wy, MIX_CELL, MIX_SEED, 0.61) * 0.75
         + gradient_noise(wx, wy, MIX_CELL / 2.7, MIX_SEED + 1, -0.43) * 0.3)
    e = np.clip((n - MIX_CENTRE) / MIX_WIDTH + 0.5, 0, 1)
    return e * e * e * (e * (e * 6 - 15) + 10)


def world_mixed(dirs, gx0, gy0, gw, gh, noise=True, show_mask=False, decals=None):
    # two sets blended by region_mask, variance-preserving so the change between them keeps its contrast, then
    # layer 3's details (details.py), then layer 2's tint over both
    a = np.asarray(world(dirs[0], gx0, gy0, gw, gh, False)).astype(np.float64)
    b = np.asarray(world(dirs[1], gx0, gy0, gw, gh, False)).astype(np.float64)
    ys, xs = np.mgrid[0:gh * PX, 0:gw * PX]
    wx, wy = gx0 + (xs + 0.5) / PX, gy0 + (ys + 0.5) / PX
    t = region_mask(wx, wy)
    if show_mask:
        return Image.fromarray((t * 255).round().astype(np.uint8))
    ma, mb = mean_of(dirs[0]), mean_of(dirs[1])
    mu = ma * (1 - t[..., None]) + mb * t[..., None]
    norm = np.sqrt((1 - t) ** 2 + t ** 2)[..., None]
    img = mu + ((1 - t)[..., None] * (a - ma) + t[..., None] * (b - mb)) / norm
    if decals is not None:
        from details import scatter
        img = scatter(img, decals, gx0, gy0, gw, gh, region_mask)
    if noise:
        img = tint(img, wx, wy)
    return Image.fromarray(np.clip(img, 0, 255).round().astype(np.uint8))


def mean_of(tiledir):
    colours = int(open(os.path.join(tiledir, 'colours')).read())
    return np.mean([np.asarray(Image.open(os.path.join(tiledir, f'tile-{t:03d}.png')).convert('RGB')).reshape(-1, 3)
                    .mean(0) for t in range(colours ** 4)], axis=0)


def world(tiledir, gx0, gy0, gw, gh, noise=True):
    # the grass under a region of the map, gx0..gx0+gw tiles: each tile's Wang tile, then layer 2's tint
    colours = int(open(os.path.join(tiledir, 'colours')).read())
    T = [np.asarray(Image.open(os.path.join(tiledir, f'tile-{t:03d}.png')).convert('RGB')).astype(np.float64)
         for t in range(colours ** 4)]
    img = np.zeros((gh * PX, gw * PX, 3))
    for j in range(gh):
        for i in range(gw):
            img[j * PX:(j + 1) * PX, i * PX:(i + 1) * PX] = T[int(tile_index(gx0 + i, gy0 + j, colours))]
    if noise:
        ys, xs = np.mgrid[0:gh * PX, 0:gw * PX]
        img = tint(img, gx0 + (xs + 0.5) / PX, gy0 + (ys + 0.5) / PX)
    return Image.fromarray(np.clip(img, 0, 255).round().astype(np.uint8))


if __name__ == '__main__':
    # build <painting,painting,...> <tiles> <r,g,b> <outdir> [colours] [band]
    if sys.argv[1] == 'build':
        build(sys.argv[2].split(','), int(sys.argv[3]), np.array([float(v) for v in sys.argv[4].split(',')]),
              sys.argv[5], *(int(a) for a in sys.argv[6:11]))
