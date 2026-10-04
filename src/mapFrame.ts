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
import type { PaintableSprite } from "./paintable";
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

// Where a quad comes from, in its atlas's pixels: an atlas rectangle is one
interface Source {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const WHITE_PIXEL: Source = {x: 0, y: 0, width: 1, height: 1};

// The quads drawn from one atlas, in the order they were added
export class QuadRun {
  data = new Float32Array(QUAD_FLOATS * 64);
  count = 0;

  constructor(public atlas: string) {}

  // A quad landing at (x, y), width by height device pixels, from the source, its texels multiplied by the colour
  add(x: number, y: number, width: number, height: number, source: Source, r: number, g: number, b: number,
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
  add(atlas: string, x: number, y: number, width: number, height: number, source: Source, r = 1, g = 1, b = 1,
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

// Where a frame is drawn: the view's origin, the device pixels a tile is drawn, and the target's size in device pixels
export interface FrameView {
  originX: number;
  originY: number;
  tilePixels: number;
  width: number;
  height: number;
}

function sameView(a: FrameView, b: FrameView): boolean {
  return a.originX === b.originX && a.originY === b.originY && a.tilePixels === b.tilePixels && a.width === b.width &&
         a.height === b.height;
}

// A rectangle of the view's tiles, in tiles from its origin
export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The part of the view a frame draws: all of it, or the tiles in the rectangles, which don't overlap
export type Damage = "all" | readonly TileRect[];

// The tiles a sprite's square covers, from the view's origin at map pixel (originX, originY), inclusive
function spriteTiles(sprite: PaintableSprite, originX: number,
                     originY: number): {left: number, top: number, right: number, bottom: number} {
  return {
    left: Math.floor((sprite.x - originX) / SPRITE_PIXELS_PER_TILE),
    top: Math.floor((sprite.y - originY) / SPRITE_PIXELS_PER_TILE),
    right: Math.floor((sprite.x + sprite.width - 1 - originX) / SPRITE_PIXELS_PER_TILE),
    bottom: Math.floor((sprite.y + sprite.width - 1 - originY) / SPRITE_PIXELS_PER_TILE),
  };
}

// The view is drawn again in square blocks of this many tiles a side, the blocks of a row that touch as one rectangle
export const DAMAGE_BLOCK = 8;
// A frame that would draw more than this share of the view's blocks draws all of it
const DAMAGE_ALL_SHARE = 0.5;

// The view's blocks a frame draws again, as tiles from the view's origin are marked
class DamagedBlocks {
  private readonly across: number;
  private readonly down: number;
  private readonly marked: Uint8Array;
  private count = 0;

  // A view of width by height tiles
  constructor(private readonly width: number, private readonly height: number) {
    this.across = Math.ceil(width / DAMAGE_BLOCK);
    this.down = Math.ceil(height / DAMAGE_BLOCK);
    this.marked = new Uint8Array(this.across * this.down);
  }

  // Marks the blocks of the tiles from (left, top) to (right, bottom), inclusive, that are in view
  mark(left: number, top: number, right: number, bottom: number): void {
    const fromX = Math.max(left, 0);
    const fromY = Math.max(top, 0);
    const toX = Math.min(right, this.width - 1);
    const toY = Math.min(bottom, this.height - 1);
    for (let y = Math.floor(fromY / DAMAGE_BLOCK); y <= Math.floor(toY / DAMAGE_BLOCK) && fromY <= toY; y++) {
      for (let x = Math.floor(fromX / DAMAGE_BLOCK); x <= Math.floor(toX / DAMAGE_BLOCK) && fromX <= toX; x++) {
        if (this.marked[y * this.across + x] === 0) {
          this.marked[y * this.across + x] = 1;
          this.count++;
        }
      }
    }
  }

  // The damage: none, all of the view past the share, or a rectangle for each run of marked blocks along a row
  damage(): Damage | null {
    if (this.count === 0) {
      return null;
    }
    if (this.count > DAMAGE_ALL_SHARE * this.marked.length) {
      return "all";
    }

    const rects: TileRect[] = [];
    for (let y = 0; y < this.down; y++) {
      for (let x = 0; x < this.across; x++) {
        if (this.marked[y * this.across + x] === 0) {
          continue;
        }

        let end = x;
        while (end + 1 < this.across && this.marked[y * this.across + end + 1] === 1) {
          end++;
        }
        const left = x * DAMAGE_BLOCK;
        const top = y * DAMAGE_BLOCK;
        rects.push({x: left, y: top, width: Math.min((end + 1) * DAMAGE_BLOCK, this.width) - left,
                    height: Math.min(top + DAMAGE_BLOCK, this.height) - top});
        x = end;
      }
    }

    return rects;
  }
}

// What the last frame drawn was built from, so a paint draws only the part of the view whose picture would differ
// from it. A frame drawn on software WebGL costs the GPU's threads time in proportion to the pixels it draws, and the
// page waits for it before drawing another.
export class FrameRecord {
  private view: FrameView | null = null;
  private values: number[] = [];
  private frames: number[] = [];
  private sprites: PaintableSprite[] = [];
  private spriteText = "";

  // The part of the view a frame of the view, the tiles and the sprites would draw differently from the last one
  // recorded, or null for none; the frame is recorded as the last. A tile whose value changed may have changed its
  // shadow, which reaches no farther than the tiles' margin; a sprite that changed is drawn again where it was and
  // where it is.
  damage(view: FrameView, tiles: FrameTiles, sprites: readonly PaintableSprite[]): Damage | null {
    const count = tiles.width * tiles.height;
    const spriteText = JSON.stringify(sprites);
    const {margin} = tiles;
    let damage: Damage | null = "all";

    if (this.view !== null && sameView(view, this.view) && this.values.length === count) {
      const blocks = new DamagedBlocks(tiles.width - 2 * margin, tiles.height - 2 * margin);
      for (let i = 0; i < count; i++) {
        // From the view's origin
        const column = i % tiles.width - margin;
        const row = Math.floor(i / tiles.width) - margin;
        if (tiles.values[i] !== this.values[i]) {
          blocks.mark(column - margin, row - margin, column + margin, row + margin);
        } else if (tiles.frames[i] !== this.frames[i]) {
          blocks.mark(column, row, column, row);
        }
      }

      if (spriteText !== this.spriteText) {
        const originX = (tiles.x + margin) * SPRITE_PIXELS_PER_TILE;
        const originY = (tiles.y + margin) * SPRITE_PIXELS_PER_TILE;
        for (const sprite of this.sprites.concat(sprites)) {
          const {left, top, right, bottom} = spriteTiles(sprite, originX, originY);
          blocks.mark(left, top, right, bottom);
        }
      }

      damage = blocks.damage();
    }

    if (damage === null) {
      return null;
    }

    this.view = {...view};
    this.sprites = sprites.map((sprite) => ({...sprite}));
    this.spriteText = spriteText;
    this.values = tiles.values.slice(0, count);
    this.frames = tiles.frames.slice(0, count);
    return damage;
  }

  // Forgets the last frame, so the next differs from it: for a change the record doesn't hold, such as the overlay
  // shown, or a canvas whose drawing was lost
  invalidate(): void {
    this.view = null;
  }
}

// Fills the frame with the quads that draw the area's tiles, tilePixels device pixels a side, with the view's origin
// margin tiles in from the area's top-left; then the tints of the tiles in view; then the sprites given. Of the
// damage's rectangles, only the quads that reach into one are added: the renderer draws no further than they reach.
//
// A shadow comes from its anchor's raw value, not from the frame the animation manager chose: an unpowered zone's centre
// blinks to the lightning bolt, and its shadow would blink with it.
export function buildMapFrame(frame: MapFrame, art: RenderArt, tiles: FrameTiles, tilePixels: number,
                              tint: (x: number, y: number) => Tint | null,
                              sprites: readonly PaintableSprite[], damage: Damage = "all"): void {
  frame.clear();
  const {margin, width, height} = tiles;

  // Whether the tiles from (left, top) to (right, bottom), inclusive, from the view's origin, reach into the damage
  const damaged = (left: number, top: number, right: number, bottom: number) => damage === "all" ||
    damage.some((rect) => left < rect.x + rect.width && right >= rect.x && top < rect.y + rect.height &&
                          bottom >= rect.y);

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
        if (damaged(column - margin - left, row - margin - top, column - margin + right, row - margin + bottom)) {
          frame.shadows.add(shadow.atlas, x - left * tilePixels, y - top * tilePixels,
                            (left + 1 + right) * tilePixels, (top + 1 + bottom) * tilePixels, shadow);
        }
      }

      const inView = column >= margin && column < width - margin && row >= margin && row < height - margin;
      if (!inView || !damaged(column - margin, row - margin, column - margin, row - margin)) {
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

    const {left, top, right, bottom} = spriteTiles(sprite, originX, originY);
    if (!damaged(left, top, right, bottom)) {
      continue;
    }

    frame.sprites.add(rect.atlas, (sprite.x - originX) * scale, (sprite.y - originY) * scale, sprite.width * scale,
                      sprite.width * scale, rect);
  }
}
