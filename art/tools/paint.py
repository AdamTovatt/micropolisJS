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

"""Repaint rendered assets as oil paintings, in the render's three layers. The process, the prompts
and what to check are in the art-painting skill (.claude/skills/art-painting/SKILL.md).

    python art/tools/paint.py prep industrial_brick_factory
    python art/tools/paint.py paint industrial_brick_factory
    python art/tools/paint.py build industrial_brick_factory

A job is an asset rendered into art/blender/out/<asset>, or a set named in SETS, laid out in a grid
and painted as one canvas. prep writes the model inputs, paint paints them through generate.py
(--only repaints some, --paving names the job's surfaces), and build writes the painted layers to
art/painted/out/<asset>. The inputs and paintings stay in art/painted/raw/<job>, which git ignores.
paint reads the API key as generate.py does. Needs Pillow, NumPy and SciPy.
"""

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..')
RENDERS = os.path.join(ART, 'blender', 'out')
PAINTED = os.path.join(ART, 'painted', 'out')
RAW = os.path.join(ART, 'painted', 'raw')
sys.path.insert(0, HERE)
from generate import MODEL  # noqa: E402

LAYERS = ('full', 'ground', 'shadow')
SIZE = 1024                    # the side of every model input
BORDER = 0.5                   # tiles round every cell, so no footprint meets the canvas's edge, where the model
                               # paints borders
GRASS = (86, 118, 52)          # the lawn outside an asset's footprint, as preview.py draws it
SHADOW_FLOOR = 48              # a shadow alpha below this everywhere is the sky's faint shading, not worth painting
WATER = (59, 112, 147)         # the open water a ship's frames are painted on, as water.py renders it
THIN = 2                       # pixels: a part of an object or shadow narrower than twice this, such as a wire,
                               # a pole or a crossing's gate, keeps the render's pixels (thick())


def _tile_sets():
    # The single tiles, four to a canvas, so each is painted at about the scale of a zone and the
    # members of a canvas come out alike. An animated tile's frames share a canvas, so they are
    # one painting and don't flicker: a road piece's four frames of light traffic, then of heavy
    # (art/blender/tiles/roads.py), the explosion's eight in two.
    def tiles(name, ids):
        return [f'{name}/{t:04d}' for t in ids]

    def fours(name, ids):
        ids = list(ids)
        return {f'{name}-{k // 4 + 1}': tiles(name, ids[k:k + 4]) for k in range(0, len(ids), 4)}

    sets = {}
    sets.update(fours('houses', range(249, 261)))
    sets.update(fours('land', [0]))
    sets.update(fours('water', range(2, 21)))
    sets.update(fours('woods', range(21, 38)))
    sets.update(fours('parks', [40, 41, 42, 43]))
    sets['parks-fountain'] = tiles('parks', [840])
    sets.update(fours('rubble', range(44, 48)))
    sets.update({f'rubble-explosion-{k + 1}': tiles('rubble', range(860 + 4 * k, 864 + 4 * k)) for k in range(2)})
    sets.update(fours('roads', list(range(64, 79)) + [239]))
    for piece in range(64, 79):
        for density, first in (('light', 16), ('heavy', 80)):
            sets[f'roads-{piece}-{density}'] = tiles('roads', range(piece + first, piece + first + 64, 16))
    sets.update({f'roads-drawbridge-{k + 1}': tiles('roads', ids) for k, ids in
                 enumerate((range(828, 832), range(948, 952)))})
    sets['roads-open-water'] = tiles('roads', range(79, 208, 16))
    # every frame of a vehicle on one canvas, so its turns and climbs are one painting of one vehicle
    for vehicle, frames in (('train', 5), ('helicopter', 8), ('airplane', 11), ('ship', 8)):
        sets[vehicle] = [f'{vehicle}/{k:02d}' for k in range(frames)]
    sets.update(fours('power', list(range(208, 221)) + [827]))
    sets.update(fours('rail', [221, 222] + list(range(224, 239))))
    return sets


SETS = _tile_sets()


def ground_painted(job):
    # a traffic frame's ground is wholly its road piece's, and an open drawbridge's middle is open
    # water, which join() gives them, and a vehicle has no ground, so they are not painted
    return not re.fullmatch(r'roads-(\d+-(light|heavy)|open-water)|train|helicopter|airplane|ship', job)


# Tiles whose painting of a layer every other tile takes wherever its render of that layer is the
# same as theirs, in this order, so the surfaces the tiles share come from one painting and two
# tiles side by side join as their renders do (join()). Each is wrapped first along the axes its
# surface runs on, so it joins itself: land and water every way, a straight road, rail, wire or
# bridge along its length. Then every road piece gives its traffic frames its ground.
DONORS = ([('land/0000', 'xy', ('ground',)), ('water/0002', 'xy', ('ground',)), ('woods/0037', 'xy', ('ground',)),
           ('roads/0066', 'x', ('ground',)), ('roads/0067', 'y', ('ground',)),
           ('roads/0064', 'x', ('objects',)), ('roads/0065', 'y', ('objects',)),
           ('rail/0226', 'x', ('ground', 'objects')), ('rail/0227', 'y', ('ground', 'objects')),
           ('rail/0224', 'x', ('objects',)), ('rail/0225', 'y', ('objects',)),
           ('power/0210', 'x', ('objects',)), ('power/0211', 'y', ('objects',)),
           ('power/0208', 'x', ('objects',)), ('power/0209', 'y', ('objects',))]
          + [(f'roads/{t:04d}', '', ('ground',)) for t in range(64, 79)])
WRAP_BAND = 12                 # pixels from a donor's edge over which it fades into its half-shifted copy
FLATTEN = 2                    # pixels: the blur that finds a surface donor's broad patches (flattened())

# what each asset is, by the start of its name, for the prompts
SUBJECTS = [
    ('houses', 'a sheet of small suburban houses, each on its own square plot of land'),
    ('land', 'a square of open grassy land'),
    ('water', 'a river: open water and pieces of its grassy banks'),
    ('woods', 'pieces of woodland and the grassy land at its edges'),
    ('parks', 'small square parks on mown lawns'),
    ('rubble', 'rubble where buildings were knocked down'),
    ('roads', 'pieces of road, with their junctions, bridges and traffic, on grassy land'),
    ('power', 'power lines on wooden poles over grassy land and water'),
    ('rail', 'pieces of railway track, with its junctions, bridges and crossings, on grassy land'),
    ('train', 'one light grey railcar with a pale grey roof, seen from directly above, in each of the directions '
              'it runs, on plain grass'),
    ('helicopter', 'one white and grey traffic helicopter with a dark cockpit and a red tail, flying, seen from '
                   'directly above, in each of the directions it heads, with its shadow on the plain grass below'),
    ('airplane', 'one pale grey airliner with blue engines and tail tips, flying low, seen from directly above, in '
                 'each of the directions it heads, with its shadow on the plain grass below'),
    ('ship', 'one cargo ship with a brown hull and blue containers, at sea, seen from directly above, in each of '
             'the directions it heads, on plain open water'),
    ('residential', 'a residential city zone'),
    ('commercial', 'a commercial city zone'),
    ('industrial', 'an industrial city zone'),
    ('hospital', 'a city hospital'),
    ('seaport', "a city's seaport"),
    ('airport', 'a city airport'),
    ('coal_power_plant', 'a coal power plant'),
    ('nuclear_power_plant', 'a nuclear power plant'),
    ('fire_station', 'a fire station'),
    ('police_station', 'a police station'),
    ('stadium', 'a football stadium'),
]

STYLE = ('as a cosy oil painting of a lovely summer day: visible brushstrokes and soft impasto texture, painterly but '
         'clear, warm soft daylight, rich but natural colours, lush summer greens.')
KEEP = ('Keep the exact composition: every shape, every tree and every boundary between paving and grass in the same '
        'position, size and outline, the same straight-down camera angle. Keep every big letter on a roof or on the '
        'ground, such as a green R, C or I, exactly as it is: the same letter, shape, size and colour, crisp and '
        'flat, never turned into a sign, a helipad or another letter. Do not add trees, bushes, sky or anything '
        'else. No other text, no borders.')
PAVING = ('Every paved surface, such as concrete, asphalt, car parks, paths and gravel, stays that same paving in its '
          'own colour, and water stays water; only what is green grass in the render is summer grass. Plain areas '
          'stay plain: no new roads, kerbs, paths or markings.')
SHADOW = ('This shows only the shadows cast on the ground by buildings, as dark grey shapes on a pure white '
          'background. Repaint the shadows as soft, dark, painterly oil-paint brushstrokes in neutral grey, matching a '
          'cosy oil painting of a summer day. Keep the background pure flat white and keep every shadow shape in the '
          'same place and outline, with no buildings, objects, colour or ground. No text, no borders.')


def members(job):
    return SETS.get(job, [job])


FRAMES = '-frames'             # a zone's animation frames, as the job <zone>-frames (prep_frames())
MARK_MARGIN = 3                # pixels round a moving mark that change with it, from the painted surface (build_frames())


def subject(job):
    for start, words in SUBJECTS:
        if job.startswith(start):
            return words
    sys.exit(f'no subject for {job}: add one to SUBJECTS')


def prompts(job, paving, style_from_full=False):
    # style_from_full: the ground is painted with the job's full painting as a second reference,
    # whose ground's brushwork and colours it copies; a plain yard otherwise comes back barely
    # painted, or with lawns and roads it never had
    what = subject(job)
    ground = (f'This is the bare ground of {what} seen from directly above: its lawns, paths and paved areas, with '
              f'no buildings and no shadows. Repaint it {STYLE} {paving} Paint only the ground: no buildings, '
              f'objects or shadows. {KEEP}')
    if style_from_full:
        ground = (f'The second image is the same place already painted, with its buildings. Paint the ground in '
                  f'exactly the brushwork, texture and colours of the ground in that painting, with strong visible '
                  f'brushstrokes. {ground}')
    full = f'Repaint this top-down render of {what} {STYLE} {paving} {KEEP}'
    if job.endswith(FRAMES):
        full = (f'The first image is a grid of the frames of an animation of part of {what}, seen from directly '
                f'above, rendered. The second image is the same grid with the same place already painted, standing '
                f'still, {STYLE} Repaint the first image cell by cell in exactly the style, brushwork and colours '
                f'of the second: whatever is the same in a cell of the two images stays exactly as the second paints '
                f'it, and only what moves between the frames, such as smoke, a turning aerial, a spinning sign or '
                f'the players and the ball, is painted where and as the first image shows it. {paving} Keep the '
                f'grid, every cell, every shape and the camera. No text, no borders.')
    return {'full': full, 'ground': ground, 'shadow': SHADOW}


def render(asset):
    # an asset's layers.json and layers. A vehicle's frame has no ground and no shadow margin: it
    # is given the plain ground it travels over, which is painted round it but never written
    d = os.path.join(RENDERS, asset)
    with open(os.path.join(d, 'layers.json')) as f:
        info = json.load(f)
    info.setdefault('shadow_margin', {'left': 0, 'right': 0, 'top': 0, 'bottom': 0})
    layers = {k: Image.open(os.path.join(d, k + '.png')).convert('RGBA')
              for k in ('ground', 'shadow', 'objects') if os.path.exists(os.path.join(d, k + '.png'))}
    if 'ground' not in layers:
        size = info['tiles'] * info['tile_px']
        layers['ground'] = Image.new('RGBA', (size, size), (*(WATER if asset.startswith('ship') else GRASS), 255))
        info['vehicle'] = True
    return info, layers


def cell_tiles(info):
    # an asset's square cell: room for its footprint and its shadow on every side
    n, m = info['tiles'], info['shadow_margin']
    return max(n + m['left'] + m['right'], n + m['top'] + m['bottom'])


def extended(ground, left, top, side):
    # the footprint's ground mirrored outward to fill a square of `side` with the footprint at
    # (left, top): painted on its own, the ground then runs on past the footprint's edge, where
    # against plain grass the model paints a kerb
    g = np.asarray(ground.convert('RGB'))
    n = g.shape[0]
    pad = ((top, side - top - n), (left, side - left - n), (0, 0))
    return Image.fromarray(np.pad(g, pad, mode='symmetric')).convert('RGBA')


def prep(job):
    # Lay the job's assets out in a grid of equal square cells, each footprint at its shadow margin
    # and the border from its cell's corner, and write the three model inputs and the layout. Each
    # member's x and y are where its shadow.png starts on the canvas
    if job.endswith(FRAMES):
        return prep_frames(job)
    renders =[(a, *render(a)) for a in members(job)]
    px = renders[0][1]['tile_px']
    border = int(BORDER * px)
    cell = max(cell_tiles(info) for _, info, _ in renders) * px + 2 * border
    cols = math.ceil(math.sqrt(len(renders)))
    side = cols * cell
    full = Image.new('RGBA', (side, side), (*GRASS, 255))
    ground = Image.new('RGBA', (side, side), (*GRASS, 255))
    shadow = Image.new('L', (side, side), 0)
    objects = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    layout = []
    for i, (asset, info, layers) in enumerate(renders):
        cx, cy = (i % cols) * cell, (i // cols) * cell
        x, y = cx + border, cy + border
        m = info['shadow_margin']
        fx, fy = x + m['left'] * px, y + m['top'] * px
        full.alpha_composite(layers['ground'], (fx, fy))
        ground.alpha_composite(extended(layers['ground'], fx - cx, fy - cy, cell), (cx, cy))
        objects.alpha_composite(layers['objects'], (fx, fy))
        a = Image.new('L', (side, side), 0)
        a.paste(layers['shadow'].getchannel('A'), (x, y))
        shadow = Image.fromarray(np.maximum(np.asarray(shadow), np.asarray(a)))
        layout.append({'asset': asset, 'x': x, 'y': y})
    dark = Image.new('RGBA', (side, side), (0, 0, 0, 255))
    dark.putalpha(shadow)
    full.alpha_composite(dark)
    full.alpha_composite(objects)
    pack = None
    vehicle = all(info.get('vehicle') for _, info, _ in renders)
    if vehicle:
        # A vehicle stands in the middle of its frame, so its frames go to the model cut down to
        # the box that holds whatever is painted in any of them, and the model paints it larger:
        # at the frame's size it paints a railcar with strokes as wide as the car
        content = (np.asarray(objects.getchannel('A')) > 0) | (np.asarray(shadow) >= SHADOW_FLOOR)
        local = np.zeros((cell, cell), bool)
        for i in range(cols * cols):
            cx, cy = (i % cols) * cell, (i // cols) * cell
            local |= content[cy:cy + cell, cx:cx + cell]
        ys, xs = np.nonzero(local)
        size = min(cell, max(xs.max() - xs.min(), ys.max() - ys.min()) + 1 + border)
        bx = min(max((xs.min() + xs.max() + 1) // 2 - size // 2, 0), cell - size)
        by = min(max((ys.min() + ys.max() + 1) // 2 - size // 2, 0), cell - size)
        pack = {'cell': cell, 'cols': cols, 'box': [int(bx), int(by), int(size)]}
    out = os.path.join(RAW, job)
    os.makedirs(out, exist_ok=True)
    for name, im in (('full', full), ('ground', ground), ('shadow', Image.eval(shadow, lambda v: 255 - v))):
        packed(im.convert('RGB'), pack).resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, f'in-{name}.png'))
    # the paintings the job needs: none of the objects where nothing stands, none of the shadow
    # where nothing casts one, and none of the ground where another tile's gives it all. Nor a
    # vehicle's shadow: a small silhouette that moves over everything, which painting only roughens,
    # and the model paints a helicopter's faint rotor disc as dark as its body
    needs = [layer for layer, wanted in (('full', np.asarray(objects.getchannel('A')).max() > 0),
                                         ('ground', ground_painted(job)),
                                         ('shadow', not vehicle and np.asarray(shadow).max() >= SHADOW_FLOOR))
             if wanted]
    with open(os.path.join(out, 'canvas.json'), 'w') as f:
        json.dump({'side': side, 'tile_px': px, 'members': layout, 'paint': needs, 'pack': pack}, f, indent=2)
    print(f'{job}: {len(layout)} asset(s) on a canvas of {side // px} tiles, painting {", ".join(needs)}')


def _boxes(pack):
    # each cell's packed box: where it is on the canvas, and where on the packed canvas
    cell, cols, (bx, by, size) = pack['cell'], pack['cols'], pack['box']
    for i in range(cols * cols):
        cx, cy = (i % cols) * cell + bx, (i // cols) * cell + by
        yield (cx, cy, cx + size, cy + size), ((i % cols) * size, (i // cols) * size)


def packed(image, pack):
    # the canvas with each cell cut down to its packed box (prep()), the boxes in the same grid
    if pack is None:
        return image
    side = pack['cols'] * pack['box'][2]
    out = Image.new(image.mode, (side, side))
    for box, at in _boxes(pack):
        out.paste(image.crop(box), at)
    return out


def unpacked(painting, pack, side):
    # a painting of a packed canvas laid back over a canvas of `side`, white round the boxes,
    # where nothing is painted: no objects stand there, and white is no shadow
    small = painting.resize((pack['cols'] * pack['box'][2],) * 2, Image.LANCZOS)
    out = Image.new('RGB', (side, side), (255, 255, 255))
    for (x0, y0, x1, y1), (px, py) in _boxes(pack):
        out.paste(small.crop((px, py, px + x1 - x0, py + y1 - y0)), (x0, y0))
    return out


def paint(job, only, paving, model, style_from_full=False):
    # Paint the chosen inputs at once, each through generate.py, keeping any earlier painting
    # as out-<layer>-<n>.png. A painting is replaced only once its successor exists: the model
    # refuses some prompts outright, and a refused retry leaves the job as it was
    out = os.path.join(RAW, job)
    if only is None:
        with open(os.path.join(out, 'canvas.json')) as f:
            only = json.load(f)['paint']
    record_path = os.path.join(out, 'prompts.json')
    record = json.load(open(record_path)) if os.path.exists(record_path) else {}
    texts = prompts(job, paving or record.get('paving') or PAVING, style_from_full)
    full = os.path.join(out, 'out-full.png')
    if style_from_full and ('full' in only or not os.path.exists(full)):
        sys.exit(f'{job}: --style-from-full paints the ground from a finished full painting; paint full first')
    runs = []
    for layer in only:
        command = [sys.executable, os.path.join(HERE, 'generate.py'), os.path.join(out, f'new-{layer}.png'), texts[layer],
                   '--reference', os.path.join(out, f'in-{layer}.png'), '--model', model]
        if style_from_full and layer == 'ground':
            command += ['--reference', full]
        if job.endswith(FRAMES):
            command += ['--reference', os.path.join(out, 'ref-full.png')]
        runs.append((layer, subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)))
    failed = []
    for layer, run in runs:
        said = run.communicate()[0].strip()
        print(f'{job} {layer}: {said}')
        if run.returncode:
            failed.append(layer)
            continue
        target = os.path.join(out, f'out-{layer}.png')
        if os.path.exists(target):
            n = 1
            while os.path.exists(os.path.join(out, f'out-{layer}-{n}.png')):
                n += 1
            shutil.move(target, os.path.join(out, f'out-{layer}-{n}.png'))
        shutil.move(os.path.join(out, f'new-{layer}.png'), target)
        references = ([f'in-{layer}'] + (['out-full'] if style_from_full and layer == 'ground' else [])
                      + (['ref-full'] if job.endswith(FRAMES) else []))
        record[layer] = {'prompt': texts[layer], 'model': model, 'references': references}
    if paving and len(failed) < len(runs):
        record['paving'] = paving
    with open(record_path, 'w') as f:
        json.dump(record, f, indent=2)
    if failed:
        sys.exit(f'{job}: {", ".join(failed)} failed')


def is_grass(rgb):
    # green enough to be lawn: hue between yellow-green and blue-green, neither grey nor black
    hsv = np.asarray(Image.fromarray(rgb).convert('HSV')).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255, hsv[..., 2] / 255
    return ndimage.median_filter((h >= 50) & (h <= 170) & (s > 0.25) & (v > 0.12), size=3)


def materials(rgb, count=3, rounds=12):
    # Sort pixels into `count` colours by k-means, starting from the darkest, middle and lightest:
    # the surfaces of a ground other than its grass, such as concrete, brick paving and water
    pixels = rgb.reshape(-1, 3).astype(np.float32)
    brightness = pixels.sum(axis=1)
    order = np.argsort(brightness)
    centres = pixels[order[np.linspace(0, len(order) - 1, count).astype(int)]]
    for _ in range(rounds):
        labels = ((pixels[:, None, :] - centres[None]) ** 2).sum(axis=2).argmin(axis=1)
        centres = np.array([pixels[labels == k].mean(axis=0) if (labels == k).any() else centres[k]
                            for k in range(count)])
    return labels


def hold_ground(painted, blender):
    # Hold the painted ground to Blender's grass and paving. Wherever the painting has grass where
    # the render has none, or none where it has grass, take the colour of the nearest painted pixel
    # that agrees with the render. Then move each surface to the render's average colour of it,
    # keeping the painting's brushwork round it: the grass, and each of the colours the rest falls
    # into, so brick paving and the concrete strips across it each keep their own. The model drifts
    # concrete toward sand, and every asset's lawn has to meet its neighbour's in one green.
    # Returns the ground and the share of pixels whose kind it replaced.
    p, b = np.asarray(painted.convert('RGB')), np.asarray(blender.convert('RGB'))
    pg, bg = is_grass(p), is_grass(b)
    result = p.astype(np.float32)
    surface = np.full(bg.shape, -1)
    if (~bg).any():
        surface[~bg] = materials(b[~bg][None])
    for grass in (True, False):
        kind = bg == grass
        wrong, right = kind & (pg != grass), kind & (pg == grass)
        if wrong.any() and right.any():
            _, (iy, ix) = ndimage.distance_transform_edt(~right, return_indices=True)
            result[wrong] = p[iy[wrong], ix[wrong]]
    for region in [bg] + [surface == k for k in range(3)]:
        if region.any():
            result[region] += b[region].mean(axis=0) - result[region].mean(axis=0)
    return Image.fromarray(np.clip(result, 0, 255).round().astype(np.uint8)), float((pg != bg).mean())


def with_letters(painted, rendered, asset, layer):
    # the layer with the render's own pixels wherever its <layer>-letters.png or <layer>-marks.png
    # mask shows a zone letter or a mark, which render() in tileart writes for every layer that
    # holds one
    for kind in ('letters', 'marks'):
        path = os.path.join(RENDERS, asset, f'{layer}-{kind}.png')
        if os.path.exists(path):
            painted = Image.composite(rendered, painted, Image.open(path).getchannel('A'))
    return painted


def thick(mask):
    # The parts of a mask at least 2 * THIN pixels across, grown by a pixel to take in their soft
    # rims. The model cannot keep a stroke a pixel or two wide: it paints a wire, a pole or a
    # gate's arm, or its shadow, as a dark smear or as whatever lies behind it, so everything
    # outside these parts is taken from the render.
    disk = ndimage.generate_binary_structure(2, 1)
    return ndimage.binary_dilation(ndimage.binary_opening(mask, disk, iterations=THIN), disk)


def _marks(asset, shape):
    # where the render's objects-marks.png shows a mark, or nowhere if it has none
    path = os.path.join(RENDERS, asset, 'objects-marks.png')
    if not os.path.exists(path):
        return np.zeros(shape, bool)
    return np.asarray(Image.open(path).getchannel('A')) > 0


def match(values, target):
    # histogram-match values to target: the same ranks, target's values
    order = np.argsort(values, axis=None)
    matched = np.empty(values.size, np.float32)
    matched[order] = np.sort(target, axis=None)
    return matched.reshape(values.shape)


def build(job):
    if job.endswith(FRAMES):
        return build_frames(job)
    raw = os.path.join(RAW, job)
    with open(os.path.join(raw, 'canvas.json')) as f:
        canvas = json.load(f)
    record_path = os.path.join(raw, 'prompts.json')
    record = json.load(open(record_path)) if os.path.exists(record_path) else {}    # a job that paints nothing
    side, px = canvas['side'], canvas['tile_px']
    # the paintings the job needs and has (a job laid out before prep listed them has all three)
    painted = [layer for layer in canvas.get('paint', LAYERS) if os.path.exists(os.path.join(raw, f'out-{layer}.png'))]

    def painting(layer):
        # a layer the job did not paint is taken from the render, as preview.py would draw it
        if layer not in painted:
            return None
        image = Image.open(os.path.join(raw, f'out-{layer}.png')).convert('RGB')
        if canvas.get('pack'):
            return unpacked(image, canvas['pack'], side)
        return image.resize((side, side), Image.LANCZOS)

    full, ground = painting('full'), painting('ground')
    renders = {m['asset']: render(m['asset']) for m in canvas['members']}
    # the shadow over the whole canvas: the painting's darkness with the strength of Blender's,
    # matched over the ground that shows. Under a building Blender's shadow is full and hidden,
    # and the model paints a cast shadow as dark as it: matched with it, a soft shadow turns black.
    # Only Blender's thick shadow is painted: the model smears a wire's or a car's thin shadow
    # where nothing casts one, and where Blender has none the painting's darkness is a smudge
    blender = np.zeros((side, side), np.float32)
    covered = np.zeros((side, side), bool)
    for m in canvas['members']:
        info, layers = renders[m['asset']]
        a = np.asarray(layers['shadow'].getchannel('A')).astype(np.float32)
        h, w = min(a.shape[0], side - m['y']), min(a.shape[1], side - m['x'])
        region = blender[m['y']:m['y'] + h, m['x']:m['x'] + w]
        np.maximum(region, a[:h, :w], out=region)
        fx, fy, n = m['x'] + info['shadow_margin']['left'] * px, m['y'] + info['shadow_margin']['top'] * px, \
            info['tiles'] * px
        covered[fy:fy + n, fx:fx + n] |= np.asarray(layers['objects'].getchannel('A')) >= 128
    shadow = None
    if 'shadow' in painted:
        darkness = 255 - np.asarray(painting('shadow').convert('L')).astype(np.float32)
        region = thick(blender >= SHADOW_FLOOR) & ~covered
        matched = blender.copy()
        if region.any():
            matched[region] = match(darkness[region], blender[region])
        # faded into Blender's over a pixel or two at the region's edge, so it has no hard rim
        weight = ndimage.gaussian_filter(region.astype(np.float32), 1)
        matched = blender + weight * (matched - blender)
        shadow = Image.fromarray(np.clip(matched, 0, 255).round().astype(np.uint8))

    for m in canvas['members']:
        info, layers = renders[m['asset']]
        margin, size = info['shadow_margin'], info['tiles'] * px
        fx, fy = m['x'] + margin['left'] * px, m['y'] + margin['top'] * px
        box = (fx, fy, fx + size, fy + size)
        out = os.path.join(PAINTED, m['asset'])
        os.makedirs(out, exist_ok=True)
        replaced = 0.0
        if ground is not None:
            g, replaced = hold_ground(ground.crop(box), layers['ground'])
        else:
            g = layers['ground'].convert('RGB')
        o = layers['objects'].copy()
        if full is not None:
            alpha = layers['objects'].getchannel('A')
            painted_part = thick(np.asarray(alpha) >= 128)
            o = Image.composite(full.crop(box).convert('RGBA'), o, Image.fromarray(painted_part.astype(np.uint8) * 255))
            o.putalpha(alpha)
        # the zone letters come from the render: the model turns an I into an H or an R, or bends
        # it, however the prompt asks, and a letter is how a player tells the zones apart
        g = with_letters(g.convert('RGBA'), layers['ground'], m['asset'], 'ground')
        o = with_letters(o, layers['objects'], m['asset'], 'objects')
        if not info.get('vehicle'):
            g.convert('RGB').save(os.path.join(out, 'ground.png'))
        o.save(os.path.join(out, 'objects.png'))
        if shadow is not None:
            w, h = layers['shadow'].size
            s = Image.new('RGBA', (w, h), (0, 0, 0, 255))
            s.putalpha(shadow.crop((m['x'], m['y'], m['x'] + w, m['y'] + h)))
        else:
            s = layers['shadow']
        s.save(os.path.join(out, 'shadow.png'))
        shutil.copy(os.path.join(RENDERS, m['asset'], 'layers.json'), os.path.join(out, 'layers.json'))
        with open(os.path.join(out, 'painting.json'), 'w') as f:
            json.dump({'job': job, 'paintings': {k: record[k] for k in painted}}, f, indent=2)
            f.write('\n')
        if '/' in m['asset'] and not info.get('vehicle'):
            # a single tile's: join() works from these, so it can run again without wrapping a donor twice
            kept = os.path.join(RAW, 'built', m['asset'])
            os.makedirs(kept, exist_ok=True)
            for layer in ('ground', 'objects'):
                shutil.copy(os.path.join(out, f'{layer}.png'), os.path.join(kept, f'{layer}.png'))
        print(f'{m["asset"]}: ground held to the render at {replaced:.1%} of its pixels')


def wrapped(image, axes):
    # The image faded, over WRAP_BAND pixels at each edge along each of `axes` ('x', 'y'), into
    # itself shifted by half its size: at its edges it then shows the two sides of its middle,
    # which meet, so it runs on into a copy of itself without a seam, and away from them it is
    # untouched, where blending it all with the shifted copy would double its markings
    a = np.asarray(image).astype(np.float32)
    h, w = a.shape[:2]
    for axis in axes:
        n = w if axis == 'x' else h
        k = np.arange(n, dtype=np.float32)
        weight = np.minimum(1.0, np.minimum(k, n - 1 - k) / WRAP_BAND)
        shifted = np.roll(a, n // 2, axis=1 if axis == 'x' else 0)
        weight = weight[None, :, None] if axis == 'x' else weight[:, None, None]
        a = a * weight + shifted * (1 - weight)
    return Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8), image.mode)


def flattened(image):
    # A surface donor without its broad light and dark patches, keeping its brushwork: every tile
    # of land or water on the map is the same image, so a patch the model painted, such as a dark
    # tuft, stands in the same place on every tile and marks out the grid. The image runs on into
    # itself, as wrapped() leaves it, so the blur wraps too.
    a = np.asarray(image).astype(np.float32)
    broad = ndimage.gaussian_filter(a, (FLATTEN, FLATTEN, 0), mode='wrap')
    a = a - broad + broad.mean(axis=(0, 1))
    return Image.fromarray(np.clip(a, 0, 255).round().astype(np.uint8), image.mode)


def join(tolerance=3):
    # Give every painted single tile its donors' paintings wherever its render is the donor's to
    # within `tolerance`: the ground everywhere it is, and the objects where both are opaque.
    # Blender's tiles join because the surfaces they share are one texture laid the same way on
    # every tile; this makes the painted surfaces one painting in the same way, so painted tiles
    # join where their renders do. Works from the built layers build() keeps, so it can run again.
    kept = os.path.join(RAW, 'built')
    tiles = sorted(f'{s}/{t}' for s in os.listdir(kept) for t in os.listdir(os.path.join(kept, s)))
    donors = []
    for asset, axes, layers in DONORS:
        if asset not in tiles:
            print(f'{asset}: not painted yet, so no donor')
            continue
        for layer in layers:
            blender = np.asarray(Image.open(os.path.join(RENDERS, asset, f'{layer}.png')).convert('RGBA')).astype(int)
            painted = wrapped(Image.open(os.path.join(kept, asset, f'{layer}.png')).convert('RGBA'), axes)
            if axes == 'xy':
                painted = flattened(painted)
            donors.append((layer, blender, np.asarray(painted)))
    for asset in tiles:
        out = os.path.join(PAINTED, asset)
        shares = []
        for layer in ('ground', 'objects'):
            mine = np.asarray(Image.open(os.path.join(RENDERS, asset, f'{layer}.png')).convert('RGBA')).astype(int)
            result = np.asarray(Image.open(os.path.join(kept, asset, f'{layer}.png')).convert('RGBA')).copy()
            free = np.ones(mine.shape[:2], bool)
            for given, blender, painted in donors:
                if given != layer:
                    continue
                same = np.abs(mine[..., :3] - blender[..., :3]).max(axis=-1) <= tolerance
                if layer == 'objects':
                    same &= (mine[..., 3] == 255) & (blender[..., 3] == 255)
                take = same & free
                result[take, :3] = painted[take, :3]
                free &= ~take
            shares.append(float((~free).mean()))
            image = Image.fromarray(result, 'RGBA')
            (image.convert('RGB') if layer == 'ground' else image).save(os.path.join(out, f'{layer}.png'))
        print(f'{asset}: {shares[0]:.0%} of the ground and {shares[1]:.0%} of the objects from donors')


def _frame_dirs(zone):
    d = os.path.join(RENDERS, zone)
    return sorted((int(f.split('-')[1]), f) for f in os.listdir(d) if f.startswith('frame-'))


def _composite(ground, shadow, objects, margin, px):
    # a zone's footprint as the game draws it: its ground, its own shadow over it, its objects
    image = ground.convert('RGBA').copy()
    a = Image.new('L', image.size, 0)
    a.paste(shadow.getchannel('A'), (-margin['left'] * px, -margin['top'] * px))
    dark = Image.new('RGBA', image.size, (0, 0, 0, 255))
    dark.putalpha(a)
    image.alpha_composite(dark)
    image.alpha_composite(objects)
    return image


def _moving(zone):
    # where any frame's objects differ from the still zone's, the render's pixels: the smoke, the
    # aerial, the players
    still = np.asarray(render(zone)[1]['objects']).astype(int)
    moving = np.zeros(still.shape[:2], bool)
    frames = {}
    for k, d in _frame_dirs(zone):
        frames[k] = render(f'{zone}/{d}')
        moving |= np.abs(np.asarray(frames[k][1]['objects']).astype(int) - still).max(axis=-1) > 6
    return still, frames, moving


def prep_frames(job):
    # A zone's animation: every frame's region that moves, cut from the frame as the game draws it,
    # laid out in a grid as the first model input, and the same grid of the painted still zone as
    # the second, so the painting changes only what moves and the frames don't flicker
    zone = job[:-len(FRAMES)]
    info, layers = render(zone)
    px, n = info['tile_px'], info['tiles'] * info['tile_px']
    _, frames, moving = _moving(zone)
    ys, xs = np.nonzero(moving)
    pad = px // 4
    box = [max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad), min(n, int(xs.max()) + 1 + pad),
           min(n, int(ys.max()) + 1 + pad)]
    painted_dir = os.path.join(PAINTED, zone)
    painted = _composite(*(Image.open(os.path.join(painted_dir, f'{k}.png')).convert('RGBA')
                           for k in ('ground', 'shadow', 'objects')), info['shadow_margin'], px).crop(box)
    w, h = box[2] - box[0], box[3] - box[1]
    gap = px // 8
    cell = max(w, h) + gap
    cols = math.ceil(math.sqrt(len(frames)))
    side = cols * cell
    first = Image.new('RGBA', (side, side), (*GRASS, 255))
    second = first.copy()
    for i, (k, (finfo, flayers)) in enumerate(sorted(frames.items())):
        x, y = (i % cols) * cell + gap // 2, (i // cols) * cell + gap // 2
        first.paste(_composite(flayers['ground'], flayers['shadow'], flayers['objects'], finfo['shadow_margin'],
                               px).crop(box), (x, y))
        second.paste(painted, (x, y))
    out = os.path.join(RAW, job)
    os.makedirs(out, exist_ok=True)
    first.convert('RGB').resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, 'in-full.png'))
    second.convert('RGB').resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, 'ref-full.png'))
    with open(os.path.join(out, 'canvas.json'), 'w') as f:
        json.dump({'side': side, 'tile_px': px, 'box': box, 'cell': cell, 'gap': gap, 'cols': cols,
                   'frames': sorted(frames), 'paint': ['full']}, f, indent=2)
    print(f'{job}: {len(frames)} frames of a {w} x {h} px region')


def build_frames(job):
    # Each frame of the zone: the painted still zone, but where the frame's objects differ from the
    # still's, the painting of that frame; the shadow the still's painted one wherever the frame's
    # rendered shadow is the still's, and the render's where something moving changes it
    zone = job[:-len(FRAMES)]
    raw = os.path.join(RAW, job)
    with open(os.path.join(raw, 'canvas.json')) as f:
        canvas = json.load(f)
    with open(os.path.join(raw, 'prompts.json')) as f:
        record = json.load(f)
    info, layers = render(zone)
    px, box, cell, gap, cols = canvas['tile_px'], canvas['box'], canvas['cell'], canvas['gap'], canvas['cols']
    w, h = box[2] - box[0], box[3] - box[1]
    painting = Image.open(os.path.join(raw, 'out-full.png')).convert('RGB').resize((canvas['side'],) * 2,
                                                                                      Image.LANCZOS)
    painted_dir = os.path.join(PAINTED, zone)
    painted = {k: Image.open(os.path.join(painted_dir, f'{k}.png')).convert('RGBA')
               for k in ('ground', 'shadow', 'objects')}
    still, frames, _ = _moving(zone)
    still_shadow = np.asarray(layers['shadow'].getchannel('A')).astype(int)
    painted_shadow = np.asarray(painted['shadow'].getchannel('A'))
    sm = info['shadow_margin']
    # A mark that moves, such as the nuclear plant's turning atom, comes from each frame's render
    # as a letter does: painted, it changes shape from frame to frame. Where the still's mark
    # stood and the frame's doesn't, the frame shows the surface under it, the nearest painted
    # pixel that isn't the mark
    still_marks = _marks(zone, still.shape[:2])
    surface = np.asarray(painted['objects']).copy()
    if still_marks.any():
        _, (iy, ix) = ndimage.distance_transform_edt(ndimage.binary_dilation(still_marks, iterations=MARK_MARGIN),
                                                     return_indices=True)
        surface[..., :3] = surface[iy, ix, :3]
    for i, k in enumerate(canvas['frames']):
        finfo, flayers = frames[k]
        x, y = (i % cols) * cell + gap // 2, (i // cols) * cell + gap // 2
        crop = np.asarray(painting.crop((x, y, x + w, y + h)))
        mine = np.asarray(flayers['objects']).astype(int)
        moves = ndimage.binary_dilation(np.abs(mine - still).max(axis=-1) > 6)
        # with the pixels round them, where the mark's own small shadows move with it
        marked = ndimage.binary_dilation(still_marks | _marks(f'{zone}/frame-{k}', still.shape[:2]),
                                         iterations=MARK_MARGIN)
        objects = np.asarray(painted['objects']).copy()
        objects[marked, :3] = surface[marked, :3]
        region = objects[box[1]:box[3], box[0]:box[2]]
        inside = (moves & ~marked)[box[1]:box[3], box[0]:box[2]]
        region[inside, :3] = crop[inside]
        objects[..., 3] = mine[..., 3]
        objects = np.asarray(with_letters(Image.fromarray(objects, 'RGBA'), flayers['objects'],
                                          f'{zone}/frame-{k}', 'objects'))
        # the frame's shadow, pixel by pixel against the still's, lined up by their margins
        fm = finfo['shadow_margin']
        frame_shadow = np.asarray(flayers['shadow'].getchannel('A')).astype(int)
        shadow = frame_shadow.copy()
        dy, dx = (sm['top'] - fm['top']) * px, (sm['left'] - fm['left']) * px
        fh, fw = frame_shadow.shape
        yy, xx = np.mgrid[0:fh, 0:fw]
        sy, sx = yy + dy, xx + dx
        inside = (sy >= 0) & (sy < still_shadow.shape[0]) & (sx >= 0) & (sx < still_shadow.shape[1])
        same = np.zeros_like(inside)
        same[inside] = np.abs(frame_shadow[inside] - still_shadow[sy[inside], sx[inside]]) <= 4
        shadow[same] = painted_shadow[sy[same], sx[same]]
        out = os.path.join(PAINTED, zone, f'frame-{k}')
        os.makedirs(out, exist_ok=True)
        painted['ground'].convert('RGB').save(os.path.join(out, 'ground.png'))
        Image.fromarray(objects, 'RGBA').save(os.path.join(out, 'objects.png'))
        s = Image.new('RGBA', (fw, fh), (0, 0, 0, 255))
        s.putalpha(Image.fromarray(shadow.astype(np.uint8)))
        s.save(os.path.join(out, 'shadow.png'))
        shutil.copy(os.path.join(RENDERS, zone, f'frame-{k}', 'layers.json'), os.path.join(out, 'layers.json'))
        with open(os.path.join(out, 'painting.json'), 'w') as f:
            json.dump({'job': job, 'still': zone, 'paintings': {'full': record['full']}}, f, indent=2)
            f.write('\n')
        print(f'{zone}/frame-{k}: {(moves & ~marked).mean():.1%} of the zone from the frames\' painting, '
              f'{marked.mean():.1%} from its marks')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('step', choices=('prep', 'paint', 'build', 'join'))
    p.add_argument('jobs', nargs='*', help='asset names under art/blender/out, or sets named in SETS; join takes '
                                           'none, and joins every painted single tile')
    p.add_argument('--only', help='paint: the inputs to paint, comma-separated; by default those prep found the '
                                  'job needs')
    p.add_argument('--paving', help="paint: the sentence naming what the job's ground is made of, or for a frames "
                                    "job, how what moves looks")
    p.add_argument('--model', default=MODEL)
    p.add_argument('--style-from-full', action='store_true',
                   help="paint: give the ground the job's full painting as a second reference, to copy its brushwork")
    a = p.parse_args()
    if a.step == 'join':
        join()
    for job in a.jobs:
        if a.step == 'prep':
            prep(job)
        elif a.step == 'paint':
            paint(job, a.only.split(',') if a.only else None, a.paving, a.model, a.style_from_full)
        elif a.step == 'build':
            build(job)
