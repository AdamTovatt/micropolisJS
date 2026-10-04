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

import type { FrameTiles } from "./mapFrame";
import { spriteTiles } from "./paintable";
import type { PaintableSprite } from "./paintable";
import type { Rect } from "./rect";

// Which part of the map's view a frame draws again: what differs from the frame drawn last, in square blocks of tiles.
// A frame drawn on software WebGL costs the GPU's threads time in proportion to the pixels it draws, and the page waits
// for it before drawing another.

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

// The part of the view a frame draws: all of it, or the rectangles of tiles from the view's origin, which don't overlap
export type Damage = "all" | readonly Rect[];

// The view is drawn again in square blocks of this many tiles a side, the blocks of a row that touch as one rectangle
export const DAMAGE_BLOCK = 8;
// A frame that would draw more than this share of the view's blocks draws all of it
const DAMAGE_ALL_SHARE = 0.5;

// The device pixels the rectangles of tiles cover, tilePixels a tile, each rounded out to whole pixels. Where a tile's
// edge falls inside a device pixel, at 1.1 device pixels to the CSS pixel say, the pixel is drawn again with the tile.
// Rectangles that touch may then share a row or column of pixels.
export function damagedPixels(damage: readonly Rect[], tilePixels: number): Rect[] {
  return damage.map(({x, y, width, height}) => {
    const left = Math.floor(x * tilePixels);
    const top = Math.floor(y * tilePixels);
    return {x: left, y: top, width: Math.ceil((x + width) * tilePixels) - left,
            height: Math.ceil((y + height) * tilePixels) - top};
  });
}

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

    const rects: Rect[] = [];
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
// from it
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
        for (const sprite of this.sprites.concat(sprites)) {
          const {x, xBound, y, yBound} = spriteTiles(sprite, tiles.x + margin, tiles.y + margin);
          blocks.mark(x, y, xBound - 1, yBound - 1);
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
