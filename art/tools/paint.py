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

# sets painted together on one canvas, so their members come out alike: four houses to a canvas,
# so each is painted at about the scale of a zone
SETS = {f'houses-{k + 1}': [f'houses/{t:04d}' for t in range(249 + 4 * k, 253 + 4 * k)] for k in range(3)}

# what each asset is, by the start of its name, for the prompts
SUBJECTS = [
    ('houses', 'a sheet of small suburban houses, each on its own square plot of land'),
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
    return {
        'full': f'Repaint this top-down render of {what} {STYLE} {paving} {KEEP}',
        'ground': ground,
        'shadow': SHADOW,
    }


def render(asset):
    d = os.path.join(RENDERS, asset)
    with open(os.path.join(d, 'layers.json')) as f:
        info = json.load(f)
    layers = {k: Image.open(os.path.join(d, k + '.png')).convert('RGBA') for k in ('ground', 'shadow', 'objects')}
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
    renders = [(a, *render(a)) for a in members(job)]
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
    out = os.path.join(RAW, job)
    os.makedirs(out, exist_ok=True)
    for name, im in (('full', full), ('ground', ground), ('shadow', Image.eval(shadow, lambda v: 255 - v))):
        im.convert('RGB').resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(out, f'in-{name}.png'))
    with open(os.path.join(out, 'canvas.json'), 'w') as f:
        json.dump({'side': side, 'tile_px': px, 'members': layout}, f, indent=2)
    print(f'{job}: {len(layout)} asset(s) on a canvas of {side // px} tiles')


def paint(job, only, paving, model, style_from_full=False):
    # Paint the chosen inputs at once, each through generate.py, keeping any earlier painting
    # as out-<layer>-<n>.png
    out = os.path.join(RAW, job)
    record_path = os.path.join(out, 'prompts.json')
    record = json.load(open(record_path)) if os.path.exists(record_path) else {}
    texts = prompts(job, paving or record.get('paving') or PAVING, style_from_full)
    full = os.path.join(out, 'out-full.png')
    if style_from_full and ('full' in only or not os.path.exists(full)):
        sys.exit(f'{job}: --style-from-full paints the ground from a finished full painting; paint full first')
    runs = []
    for layer in only:
        target = os.path.join(out, f'out-{layer}.png')
        if os.path.exists(target):
            n = 1
            while os.path.exists(os.path.join(out, f'out-{layer}-{n}.png')):
                n += 1
            shutil.move(target, os.path.join(out, f'out-{layer}-{n}.png'))
        command = [sys.executable, os.path.join(HERE, 'generate.py'), target, texts[layer],
                   '--reference', os.path.join(out, f'in-{layer}.png'), '--model', model]
        if style_from_full and layer == 'ground':
            command += ['--reference', full]
        runs.append((layer, subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)))
    failed = []
    for layer, run in runs:
        said = run.communicate()[0].strip()
        print(f'{job} {layer}: {said}')
        if run.returncode:
            failed.append(layer)
        else:
            references = [f'in-{layer}'] + (['out-full'] if style_from_full and layer == 'ground' else [])
            record[layer] = {'prompt': texts[layer], 'model': model, 'references': references}
    if paving:
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
    # the layer with the render's own pixels wherever its <layer>-letters.png mask shows a zone
    # letter, which render() in tileart writes for every layer that holds one
    path = os.path.join(RENDERS, asset, f'{layer}-letters.png')
    if not os.path.exists(path):
        return painted
    return Image.composite(rendered, painted, Image.open(path).getchannel('A'))


def match(values, target):
    # histogram-match values to target: the same ranks, target's values
    order = np.argsort(values, axis=None)
    matched = np.empty(values.size, np.float32)
    matched[order] = np.sort(target, axis=None)
    return matched.reshape(values.shape)


def build(job):
    raw = os.path.join(RAW, job)
    with open(os.path.join(raw, 'canvas.json')) as f:
        canvas = json.load(f)
    with open(os.path.join(raw, 'prompts.json')) as f:
        record = json.load(f)
    side, px = canvas['side'], canvas['tile_px']

    def painting(layer):
        return Image.open(os.path.join(raw, f'out-{layer}.png')).convert('RGB').resize((side, side), Image.LANCZOS)

    full, ground = painting('full'), painting('ground')
    renders = {m['asset']: render(m['asset']) for m in canvas['members']}
    # the shadow over the whole canvas: the painting's darkness with the strength of Blender's
    blender = np.zeros((side, side), np.float32)
    for m in canvas['members']:
        a = np.asarray(renders[m['asset']][1]['shadow'].getchannel('A')).astype(np.float32)
        h, w = min(a.shape[0], side - m['y']), min(a.shape[1], side - m['x'])
        region = blender[m['y']:m['y'] + h, m['x']:m['x'] + w]
        np.maximum(region, a[:h, :w], out=region)
    darkness = 255 - np.asarray(painting('shadow').convert('L')).astype(np.float32)
    shadow = Image.fromarray(np.clip(match(darkness, blender), 0, 255).astype(np.uint8))

    for m in canvas['members']:
        info, layers = renders[m['asset']]
        margin, size = info['shadow_margin'], info['tiles'] * px
        fx, fy = m['x'] + margin['left'] * px, m['y'] + margin['top'] * px
        box = (fx, fy, fx + size, fy + size)
        out = os.path.join(PAINTED, m['asset'])
        os.makedirs(out, exist_ok=True)
        g, replaced = hold_ground(ground.crop(box), layers['ground'])
        o = full.crop(box).convert('RGBA')
        o.putalpha(layers['objects'].getchannel('A'))
        # the zone letters come from the render: the model turns an I into an H or an R, or bends
        # it, however the prompt asks, and a letter is how a player tells the zones apart
        g = with_letters(g.convert('RGBA'), layers['ground'], m['asset'], 'ground')
        o = with_letters(o, layers['objects'], m['asset'], 'objects')
        g.convert('RGB').save(os.path.join(out, 'ground.png'))
        o.save(os.path.join(out, 'objects.png'))
        w, h = layers['shadow'].size
        s = Image.new('RGBA', (w, h), (0, 0, 0, 255))
        s.putalpha(shadow.crop((m['x'], m['y'], m['x'] + w, m['y'] + h)))
        s.save(os.path.join(out, 'shadow.png'))
        shutil.copy(os.path.join(RENDERS, m['asset'], 'layers.json'), os.path.join(out, 'layers.json'))
        with open(os.path.join(out, 'painting.json'), 'w') as f:
            json.dump({'job': job, 'paintings': {k: record[k] for k in LAYERS}}, f, indent=2)
            f.write('\n')
        print(f'{m["asset"]}: ground held to the render at {replaced:.1%} of its pixels')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    p.add_argument('step', choices=('prep', 'paint', 'build'))
    p.add_argument('jobs', nargs='+', help='asset names under art/blender/out, or sets named in SETS')
    p.add_argument('--only', default=','.join(LAYERS), help='paint: the inputs to paint, comma-separated')
    p.add_argument('--paving', help="paint: the sentence naming what the job's ground is made of")
    p.add_argument('--model', default=MODEL)
    p.add_argument('--style-from-full', action='store_true',
                   help="paint: give the ground the job's full painting as a second reference, to copy its brushwork")
    a = p.parse_args()
    for job in a.jobs:
        if a.step == 'prep':
            prep(job)
        elif a.step == 'paint':
            paint(job, a.only.split(','), a.paving, a.model, a.style_from_full)
        else:
            build(job)
