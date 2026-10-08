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

"""Composite a save's map region from a manifest + atlases, as the game's passes do:
ground, shadows merged by max, objects. Optional hooks let prototypes change the ground pass.

python mapcomp.py <save.json> <x0> <y0> <w> <h> <out.png> [--render DIR] [--px 64]
"""
import argparse, json, os
import numpy as np
from PIL import Image

ROADBASE, LTRFBASE, BRWXXX7 = 64, 80, 207


def plain_road(t):
    if LTRFBASE <= t <= BRWXXX7 and (t - ROADBASE) % 16 != 15:
        return ROADBASE + (t - ROADBASE) % 16
    return t


class Art:
    def __init__(self, render_dir):
        self.dir = render_dir
        self.m = json.load(open(os.path.join(render_dir, 'manifest.json')))
        self.atlases = {k: Image.open(os.path.join(render_dir, v)).convert('RGBA') for k, v in self.m['atlases'].items()}
        self.cache = {}

    def rect(self, r):
        key = (r['atlas'], r['x'], r['y'], r['width'], r['height'])
        if key not in self.cache:
            self.cache[key] = self.atlases[r['atlas']].crop((r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height']))
        return self.cache[key]

    def entry(self, t):
        return self.m['tiles'].get(str(t))


def load_map(save):
    d = json.load(open(save))
    m = d['map']
    w, h = m['width'], m['height']
    raw = np.array(m['tiles']).reshape(w, h).T if False else np.array(m['tiles'])
    return d, w, h, raw


def tile_at(raw, w, h, x, y):
    # saves are column-major (x * height + y) in micropolis; detect by trying
    return int(raw[x + y * w])


def composite(save, x0, y0, tw, th, art, px=64, ground_hook=None, margin=4, world=None):
    d, W, H, raw = load_map(save)
    ZONEBIT = 1 << 10  # placeholder: shadow is on anchor entries only, so we just use the entry's shadow key
    gx0, gy0 = x0 - margin, y0 - margin
    gw, gh = tw + 2 * margin, th + 2 * margin
    ground = Image.new('RGBA', (gw * px, gh * px), (0, 0, 0, 255))
    if callable(world):
        # a grass layer made for this region, such as Wang tiles picked by map position
        ground.paste(world(gx0, gy0, gw, gh).convert('RGBA'), (0, 0))
    elif world is not None:
        # one grass texture laid in map space under every tile, as a shader sampling it by world position would
        ww, wh = world.size
        ox, oy = (gx0 * px) % ww, (gy0 * px) % wh
        for yy in range(-oy, gh * px, wh):
            for xx in range(-ox, gw * px, ww):
                ground.paste(world.convert('RGBA'), (xx, yy))
    shadow = np.zeros((gh * px, gw * px), np.uint8)
    objects = Image.new('RGBA', (gw * px, gh * px), (0, 0, 0, 0))
    ids = np.zeros((gh, gw), int)
    for j in range(gh):
        for i in range(gw):
            x, y = gx0 + i, gy0 + j
            if not (0 <= x < W and 0 <= y < H):
                continue
            v = tile_at(raw, W, H, x, y)
            t = plain_road(v & 1023)
            ids[j, i] = t
            e = art.entry(t)
            if e is None:
                continue
            g = art.rect(e['ground'])
            if g.size != (px, px):
                g = g.resize((px, px), Image.LANCZOS)
            ground.alpha_composite(g, (i * px, j * px))
            if 'objects' in e:
                o = art.rect(e['objects'])
                if o.size != (px, px):
                    o = o.resize((px, px), Image.LANCZOS)
                objects.alpha_composite(o, (i * px, j * px))
            # shadows: only on the anchor (ZONEBIT); the original's ZONEBIT is bit 10 of the raw value
            if 'shadow' in e and (v & (1 << 10)):
                s = e['shadow']
                r = s['reach']
                a = np.asarray(art.rect(s).getchannel('A'))
                sx, sy = (i - r['left']) * px, (j - r['top']) * px
                ys, xs = max(0, -sy), max(0, -sx)
                ye, xe = min(a.shape[0], shadow.shape[0] - sy), min(a.shape[1], shadow.shape[1] - sx)
                if ye > ys and xe > xs:
                    sub = shadow[sy + ys:sy + ye, sx + xs:sx + xe]
                    np.maximum(sub, a[ys:ye, xs:xe], out=sub)
    if ground_hook:
        ground = ground_hook(ground, ids, gx0, gy0, px)
    dark = Image.new('RGBA', ground.size, (0, 0, 0, 255))
    dark.putalpha(Image.fromarray(shadow))
    ground.alpha_composite(dark)
    ground.alpha_composite(objects)
    img = ground.convert('RGB').crop((margin * px, margin * px, (margin + tw) * px, (margin + th) * px))
    return img


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('save'); p.add_argument('x0', type=int); p.add_argument('y0', type=int)
    p.add_argument('w', type=int); p.add_argument('h', type=int); p.add_argument('out')
    p.add_argument('--render', default='images/render')
    p.add_argument('--small', type=int, default=0, help='also write a copy at this many px a tile')
    a = p.parse_args()
    img = composite(a.save, a.x0, a.y0, a.w, a.h, Art(a.render))
    img.save(a.out)
    if a.small:
        stem, ext = os.path.splitext(a.out)
        img.resize((a.w * a.small, a.h * a.small), Image.LANCZOS).save(f'{stem}-{a.small}px{ext}')
