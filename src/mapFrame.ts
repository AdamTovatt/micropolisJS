/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 *
 * This code is released under the GNU GPL v3, with some additional terms.
 * Please see the files LICENSE and COPYING for details. Alternatively,
 * consult http://micropolisjs.graememcc.co.uk/LICENSE and
 * http://micropolisjs.graememcc.co.uk/COPYING
 *
 * The name/term "MICROPOLIS" is a registered trademark of Micropolis (https://www.micropolis.com) GmbH
 * (Micropolis Corporation, the "licensor") and is licensed here to the authors/publishers of the "Micropolis"
 * city simulation game and its source code (the project or "licensee(s)") as a courtesy of the owner.
 *
 */

import type { Tint } from "./overlayRenderer";
import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { PaintableMap, PaintableSprite } from "./paintable";
import type { Rect } from "./rect";
import { WHITE } from "./renderManifest";
import type { RenderArt } from "./renderManifest";
import { BIT_MASK } from "./tileFlags";
import { TILE_INVALID } from "./tileValues";

// What one frame of the map draws, as lists of quads the WebGL renderer draws pass by pass. Building them is pure, so
// what lands where is tested under Node; the renderer only uploads the lists and draws them.

// The floats of a quad: where it lands, in device pixels from the target's top-left (x, y, width, height); where it
// comes from, in its atlas's pixels (x, y, width, height); and the colour its texels are multiplied by, premultiplied
// (r, g, b, a)
export const QUAD_FLOATS = 12;

// The white atlas's one pixel, which the tints are drawn from
const WHITE_PIXEL: Rect = {x: 0, y: 0, width: 1, height: 1};

// The quads drawn from one atlas, in the order they were added
export class QuadRun {
  data = new Float32Array(QUAD_FLOATS * 64);
  count = 0;

  constructor(public atlas: string) {}

  // A quad landing at (x, y), width by height device pixels, from the source in the atlas's pixels, its texels
  // multiplied by the colour
  add(x: number, y: number, width: number, height: number, source: Rect, r: number, g: number, b: number,
      a: number): void {
    if ((this.count + 1) * QUAD_FLOATS > this.data.length) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
    }

    const data = this.data;
    const at = this.count * QUAD_FLOATS;
    data[at] = x;
    data[at + 1] = y;
    data[at + 2] = width;
    data[at + 3] = height;
    data[at + 4] = source.x;
    data[at + 5] = source.y;
    data[at + 6] = source.width;
    data[at + 7] = source.height;
    data[at + 8] = r;
    data[at + 9] = g;
    data[at + 10] = b;
    data[at + 11] = a;
    this.count++;
  }

  // The floats of the quads added
  get floats(): Float32Array {
    return this.data.subarray(0, this.count * QUAD_FLOATS);
  }
}

// A pass's quads, grouped into runs by atlas. In an ordered list, where quads overlap, each run is drawn in the order
// its quads were added, and a new run starts each time the atlas changes. In an unordered one, whose quads never
// overlap or merge in an order that doesn't matter, each atlas has one run, so the pass is one draw per atlas. Runs
// are kept from frame to frame, so their buffers grow once.
export class QuadList {
  private readonly kept: QuadRun[] = [];
  private used = 0;

  constructor(private readonly ordered: boolean) {}

  // The runs added since the last clear, in the order they are drawn
  get runs(): readonly QuadRun[] {
    return this.kept.slice(0, this.used);
  }

  // The number of quads added since the last clear
  get count(): number {
    let count = 0;
    for (let i = 0; i < this.used; i++) {
      count += this.kept[i].count;
    }
    return count;
  }

  clear(): void {
    for (const run of this.kept) {
      run.count = 0;
    }
    this.used = 0;
  }

  // A quad from the atlas, as QuadRun's add takes it, opaque unless a colour is given
  add(atlas: string, x: number, y: number, width: number, height: number, source: Rect, r = 1, g = 1, b = 1,
      a = 1): void {
    this.runFor(atlas).add(x, y, width, height, source, r, g, b, a);
  }

  private runFor(atlas: string): QuadRun {
    if (this.ordered) {
      const last = this.used > 0 ? this.kept[this.used - 1] : null;
      if (last !== null && last.atlas === atlas) {
        return last;
      }
    } else {
      for (let i = 0; i < this.used; i++) {
        if (this.kept[i].atlas === atlas) {
          return this.kept[i];
        }
      }
    }

    // A kept run, perhaps of another atlas last frame, is reused under this one's name
    if (this.used === this.kept.length) {
      this.kept.push(new QuadRun(atlas));
    } else {
      this.kept[this.used].atlas = atlas;
    }

    return this.kept[this.used++];
  }
}

// The quads of each pass: every tile's ground; every anchor's shadow, merged by the darkest; every tile's objects; the
// overlay's tints, over the objects; then the sprites
export class MapFrame {
  readonly ground = new QuadList(false);
  readonly shadows = new QuadList(false);
  readonly objects = new QuadList(false);
  readonly tints = new QuadList(false);
  readonly sprites = new QuadList(true);

  clear(): void {
    this.ground.clear();
    this.shadows.clear();
    this.objects.clear();
    this.tints.clear();
    this.sprites.clear();
  }
}

// The tiles a frame reads: an area of the map margin tiles wider on every side than the view, from map tile (x, y),
// width by height tiles, row by row. values are the tiles' raw values, TILE_INVALID off the map, and frames are the
// tile ids to draw, as the animation manager chose them from the values.
export interface FrameTiles {
  x: number;
  y: number;
  width: number;
  height: number;
  margin: number;
  values: readonly number[];
  frames: readonly number[];
}

// The whole map as a frame reads it, with no margin, since no tile lies past the map's edges: each tile's own value,
// unanimated
export function wholeMapTiles(map: Pick<PaintableMap, "width" | "height" | "getTileValuesForPainting">): FrameTiles {
  const {width, height} = map;
  const values = map.getTileValuesForPainting(0, 0, width, height, []);
  return {x: 0, y: 0, width, height, margin: 0, values, frames: values.map((value) => value & BIT_MASK)};
}

// Fills the frame with the quads that draw the whole map, tilePixels device pixels a tile, each tile's own value
// unanimated, with no tints or sprites
export function buildWholeMapFrame(frame: MapFrame, art: RenderArt,
                                   map: Pick<PaintableMap, "width" | "height" | "getTileValuesForPainting">,
                                   tilePixels: number): void {
  buildMapFrame(frame, art, wholeMapTiles(map), tilePixels, () => null, []);
}

// Fills the frame with the quads that draw the area's tiles, tilePixels device pixels a side, with the view's origin
// margin tiles in from the area's top-left; then the tints of the tiles in view; then the sprites given. Given areas
// of the view, in device pixels from its top-left, only the quads that reach into one are added: the renderer draws no
// further than they reach. Without, every quad is.
//
// A shadow comes from its anchor's raw value, not from the frame the animation manager chose: an unpowered zone's centre
// blinks to the lightning bolt, and its shadow would blink with it.
export function buildMapFrame(frame: MapFrame, art: RenderArt, tiles: FrameTiles, tilePixels: number,
                              tint: (x: number, y: number) => Tint | null,
                              sprites: readonly PaintableSprite[], areas: readonly Rect[] | null = null): void {
  frame.clear();
  const {margin, width, height} = tiles;

  // Whether a quad landing at (x, y), width by height device pixels, reaches into an area
  const reaches = (x: number, y: number, quadWidth: number, quadHeight: number) => areas === null ||
    areas.some((area) => x < area.x + area.width && x + quadWidth > area.x && y < area.y + area.height &&
                         y + quadHeight > area.y);

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = row * width + column;
      const value = tiles.values[index];
      if (value === TILE_INVALID) {
        continue;
      }

      // From the view's origin, in device pixels
      const x = (column - margin) * tilePixels;
      const y = (row - margin) * tilePixels;

      const shadow = art.tile(value & BIT_MASK).shadow;
      if (shadow !== null) {
        const {left, top, right, bottom} = shadow.reach;
        const shadowX = x - left * tilePixels;
        const shadowY = y - top * tilePixels;
        const shadowWidth = (left + 1 + right) * tilePixels;
        const shadowHeight = (top + 1 + bottom) * tilePixels;
        if (reaches(shadowX, shadowY, shadowWidth, shadowHeight)) {
          frame.shadows.add(shadow.atlas, shadowX, shadowY, shadowWidth, shadowHeight, shadow);
        }
      }

      const inView = column >= margin && column < width - margin && row >= margin && row < height - margin;
      if (!inView || !reaches(x, y, tilePixels, tilePixels)) {
        continue;
      }

      const tileArt = art.tile(tiles.frames[index]);
      frame.ground.add(tileArt.ground.atlas, x, y, tilePixels, tilePixels, tileArt.ground);
      if (tileArt.objects !== null) {
        frame.objects.add(tileArt.objects.atlas, x, y, tilePixels, tilePixels, tileArt.objects);
      }

      const colour = tint(tiles.x + column, tiles.y + row);
      if (colour !== null) {
        const {r, g, b, a} = colour;
        frame.tints.add(WHITE, x, y, tilePixels, tilePixels, WHITE_PIXEL, r / 255 * a, g / 255 * a, b / 255 * a, a);
      }
    }
  }

  // The view's origin, in map pixels
  const originX = (tiles.x + margin) * SPRITE_PIXELS_PER_TILE;
  const originY = (tiles.y + margin) * SPRITE_PIXELS_PER_TILE;
  const scale = tilePixels / SPRITE_PIXELS_PER_TILE;

  for (const sprite of sprites) {
    const rect = art.sprite(sprite.type, sprite.frame);
    if (rect === null) {
      throw new Error(`No art draws sprite ${sprite.type} frame ${sprite.frame}`);
    }

    const x = (sprite.x - originX) * scale;
    const y = (sprite.y - originY) * scale;
    const side = sprite.width * scale;
    if (reaches(x, y, side, side)) {
      frame.sprites.add(rect.atlas, x, y, side, side, rect);
    }
  }
}
