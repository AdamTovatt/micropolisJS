/* micropolisJS, continued by Adam Tovatt from Graeme McCutcheon's micropolisJS.
 * Copyright (C) 2026 Adam Tovatt
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
import type { Rect } from "./rect";
import type { PixelPoint } from "./viewPosition";

// Which part of the map's view a frame draws again: what differs from the frame drawn last, in square blocks of tiles.
// A frame drawn on software WebGL costs the GPU's threads time in proportion to the pixels it draws, and the page waits
// for it before drawing another.

// Where a frame is drawn: the view's origin as the map is drawn from it, in device pixels (drawnOrigin), the device
// pixels a tile is drawn, and the target's size in device pixels
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

// The part of the map's layer a frame draws again: all of it, or the rectangles of tiles from the first tile in view,
// which don't overlap
export type Damage = "all" | readonly Rect[];

// The layer is drawn again in square blocks of this many tiles a side, the blocks of a row that touch as one rectangle
export const DAMAGE_BLOCK = 8;
// A frame that would draw more than this share of the view's blocks draws all of it
const DAMAGE_ALL_SHARE = 0.5;

// The device pixels of the view the rectangles of tiles cover, tilePixels a tile, with the view's top-left the offset,
// in device pixels, into the first tile in view (FrameTiles), each rounded out to whole pixels. Where a tile's edge
// falls inside a device pixel, at 1.1 device pixels to the CSS pixel say, the pixel is drawn again with the tile.
// Rectangles that touch may then share a row or column of pixels.
export function damagedPixels(damage: readonly Rect[], tilePixels: number, offset: PixelPoint): Rect[] {
  return damage.map(({x, y, width, height}) => {
    const left = Math.floor(x * tilePixels - offset.x);
    const top = Math.floor(y * tilePixels - offset.y);
    return {x: left, y: top, width: Math.ceil((x + width) * tilePixels - offset.x) - left,
            height: Math.ceil((y + height) * tilePixels - offset.y) - top};
  });
}

// The view's blocks a frame draws again, as units from the view's top-left are marked: tiles from the first tile in
// view, or device pixels
class DamagedBlocks {
  private readonly across: number;
  private readonly down: number;
  private readonly marked: Uint8Array;
  private count = 0;

  // A view of width by height units, in blocks of block units a side
  constructor(private readonly width: number, private readonly height: number, private readonly block: number) {
    this.across = Math.ceil(width / block);
    this.down = Math.ceil(height / block);
    this.marked = new Uint8Array(this.across * this.down);
  }

  // Marks the blocks of the units from (left, top) to (right, bottom), inclusive, that are in view
  mark(left: number, top: number, right: number, bottom: number): void {
    this.visit(left, top, right, bottom, (index) => {
      if (this.marked[index] === 0) {
        this.marked[index] = 1;
        this.count++;
      }
      return false;
    });
  }

  // Whether any block of the units from (left, top) to (right, bottom), inclusive, that are in view is marked
  touches(left: number, top: number, right: number, bottom: number): boolean {
    return this.visit(left, top, right, bottom, (index) => this.marked[index] === 1);
  }

  // Calls the visitor with the index of each block of the units given that are in view, until it returns true, and
  // returns whether it did
  private visit(left: number, top: number, right: number, bottom: number, visitor: (index: number) => boolean): boolean {
    const fromX = Math.max(left, 0);
    const fromY = Math.max(top, 0);
    const toX = Math.min(right, this.width - 1);
    const toY = Math.min(bottom, this.height - 1);
    const block = this.block;
    for (let y = Math.floor(fromY / block); y <= Math.floor(toY / block) && fromY <= toY; y++) {
      for (let x = Math.floor(fromX / block); x <= Math.floor(toX / block) && fromX <= toX; x++) {
        if (visitor(y * this.across + x)) {
          return true;
        }
      }
    }
    return false;
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
        const left = x * this.block;
        const top = y * this.block;
        rects.push({x: left, y: top, width: Math.min((end + 1) * this.block, this.width) - left,
                    height: Math.min(top + this.block, this.height) - top});
        x = end;
      }
    }

    return rects;
  }
}

// What the map's layer was last drawn from, so a paint draws again only the part of the layer whose picture would
// differ from it. The cars and the sprites are no part of the layer: they are drawn over it.
export class FrameRecord {
  private view: FrameView | null = null;
  private values: number[] = [];
  private frames: number[] = [];

  // The part of the view a layer drawn of the view and the tiles would draw differently from the last one recorded, or
  // null for none; the layer is recorded as the last. A tile whose value changed may have changed its shadow, which
  // reaches no farther than the tiles' margin.
  damage(view: FrameView, tiles: FrameTiles): Damage | null {
    const count = tiles.width * tiles.height;
    const {margin} = tiles;
    let damage: Damage | null = "all";

    if (this.view !== null && sameView(view, this.view) && this.values.length === count) {
      const blocks = new DamagedBlocks(tiles.width - 2 * margin, tiles.height - 2 * margin, DAMAGE_BLOCK);
      for (let i = 0; i < count; i++) {
        // From the first tile in view
        const column = i % tiles.width - margin;
        const row = Math.floor(i / tiles.width) - margin;
        if (tiles.values[i] !== this.values[i]) {
          blocks.mark(column - margin, row - margin, column + margin, row + margin);
        } else if (tiles.frames[i] !== this.frames[i]) {
          blocks.mark(column, row, column, row);
        }
      }

      damage = blocks.damage();
    }

    if (damage === null) {
      return null;
    }

    this.view = {...view};
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

// A car or a sprite as a frame draws it over the map's layer: the drawing, what it draws as text, and the device pixels
// of the view its square covers, rounded out to whole pixels, from (left, top) to (right, bottom) inclusive
export interface DrawnSquare<T> {
  drawing: T;
  key: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// What a frame composites on the canvas: the layer copied over the areas, in device pixels from the view's top-left, or
// over all of it for null; then the drawings of the squares drawn over it, in the order they were given
export interface Composite<T> {
  areas: readonly Rect[] | null;
  drawn: readonly T[];
}

// The canvas is composited in square cells of this many device pixels a side, the cells of a row that touch as one
// rectangle
export const COMPOSITE_CELL = 32;

// What the canvas was last composited with, so a frame copies the layer only over the cells whose picture would differ
// and draws only the cars and the sprites there. The layer is copied over where the layer was drawn again, and where a
// car or a sprite that changed was and is; then over the whole square of every car and sprite that reaches into those
// cells, until none reaches out of them, since each is drawn whole: one drawn over a part of the canvas the layer
// wasn't copied over would be drawn twice there.
export class CompositeRecord<T> {
  private drawn: readonly DrawnSquare<T>[] = [];

  // What a frame of the view, width by height device pixels, composites, given the areas of the layer drawn again,
  // null for all of it, and the cars' and the sprites' squares in the order they are drawn, or null where it would
  // composite nothing, which records nothing; otherwise the squares are recorded as the last composited. A layer drawn whole is copied whole, every car and sprite over it.
  composite(width: number, height: number, layer: readonly Rect[] | null,
            squares: readonly DrawnSquare<T>[]): Composite<T> | null {
    const every = () => squares.map(({drawing}) => drawing);
    if (layer === null) {
      this.drawn = squares;
      return {areas: null, drawn: every()};
    }

    const cells = new DamagedBlocks(width, height, COMPOSITE_CELL);
    for (const {x, y, width: areaWidth, height: areaHeight} of layer) {
      cells.mark(x, y, x + areaWidth - 1, y + areaHeight - 1);
    }

    // The squares drawn last that are drawn the same again, by how many of each; the rest changed
    const kept = new Map<string, number>();
    for (const {key} of this.drawn) {
      kept.set(key, (kept.get(key) ?? 0) + 1);
    }
    const included = squares.map(({key}) => {
      const count = kept.get(key) ?? 0;
      if (count === 0) {
        return true;
      }
      kept.set(key, count - 1);
      return false;
    });
    for (const square of this.drawn) {
      const count = kept.get(square.key) ?? 0;
      if (count > 0) {
        // Gone, or moved or changed: where it was
        kept.set(square.key, count - 1);
        cells.mark(square.left, square.top, square.right, square.bottom);
      }
    }
    squares.forEach((square, index) => {
      if (included[index]) {
        cells.mark(square.left, square.top, square.right, square.bottom);
      }
    });

    // Every square reaching into the cells, until none is left that reaches out of them
    for (let grew = true; grew;) {
      grew = false;
      squares.forEach((square, index) => {
        if (!included[index] && cells.touches(square.left, square.top, square.right, square.bottom)) {
          included[index] = true;
          cells.mark(square.left, square.top, square.right, square.bottom);
          grew = true;
        }
      });
    }

    const areas = cells.damage();
    if (areas === null) {
      return null;
    }

    this.drawn = squares;
    return areas === "all" ? {areas: null, drawn: every()}
                           : {areas, drawn: squares.filter((_, index) => included[index]).map(({drawing}) => drawing)};
  }
}
