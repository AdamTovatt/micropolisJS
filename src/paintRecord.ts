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

// An area of the view in tile offsets from its origin: x and y inclusive, xBound and yBound exclusive
interface TileRect {
  x: number;
  xBound: number;
  y: number;
  yBound: number;
}

// A value no tile has, written over the tiles last painted to force their repaint. TILE_INVALID would not do: it is
// the black void.
const REPAINT = -2;

// Calls paint for each tile of a width by height view that differs from what was painted there last, given the tiles
// last painted, lastWidth by lastHeight, or for every tile on a first paint
function forEachTileToPaint(lastPainted: ReadonlyArray<number> | null, lastWidth: number, lastHeight: number,
                            tiles: ReadonlyArray<number>, width: number, height: number,
                            paint: (tileValue: number, x: number, y: number) => void): void {
  if (lastPainted === null) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        paint(tiles[y * width + x], x, y);
      }
    }
    return;
  }

  // The canvas may be the same size as last time, or have grown or shrunk. Compare the area painted both times
  // against what was there last time.
  const xBound = Math.min(lastWidth, width);
  const yBound = Math.min(lastHeight, height);

  for (let y = 0; y < yBound; y++) {
    for (let x = 0; x < xBound; x++) {
      const tile = tiles[y * width + x];
      if (lastPainted[y * lastWidth + x] !== tile) {
        paint(tile, x, y);
      }
    }
  }

  // Paint any extra width and height
  if (width > lastWidth) {
    for (let y = 0; y < height; y++) {
      for (let x = lastWidth; x < width; x++) {
        paint(tiles[y * width + x], x, y);
      }
    }
  }

  if (height > lastHeight) {
    for (let y = lastHeight; y < height; y++) {
      for (let x = 0; x < width; x++) {
        paint(tiles[y * width + x], x, y);
      }
    }
  }
}

// Marks the area's tiles in a width by height view's last painted tiles for repaint, clipped to the view
function markAreaForRepaint(lastPainted: number[], area: TileRect, width: number, height: number): void {
  for (let y = Math.max(0, area.y), yBound = Math.min(height, area.yBound); y < yBound; y++) {
    for (let x = Math.max(0, area.x), xBound = Math.min(width, area.xBound); x < xBound; x++) {
      lastPainted[y * width + x] = REPAINT;
    }
  }
}

// What a view painted last, so the next paint repaints only the tiles that changed, or that something drew over
class PaintRecord {
  // The tiles last painted, by tile offset, and the array the next paint's tiles are written into: the two are
  // swapped each paint
  private lastPainted: number[] | null = null;
  private spare: number[] = [];
  private lastWidth = -1;
  private lastHeight = -1;

  // The array to write the next paint's tiles into
  get buffer(): number[] {
    return this.spare;
  }

  // Calls paintTile for each of the width by height tiles that differs from what was painted last, then records the
  // tiles as painted
  paint(tiles: number[], width: number, height: number,
        paintTile: (tileValue: number, x: number, y: number) => void): void {
    forEachTileToPaint(this.lastPainted, this.lastWidth, this.lastHeight, tiles, width, height, paintTile);

    this.spare = this.lastPainted ?? [];
    this.lastPainted = tiles;
    this.lastWidth = width;
    this.lastHeight = height;
  }

  // The area was drawn over since it was painted, so its tiles are repainted next time
  markForRepaint(area: TileRect): void {
    if (this.lastPainted !== null) {
      markAreaForRepaint(this.lastPainted, area, this.lastWidth, this.lastHeight);
    }
  }

  // Every tile is repainted next time
  repaintAll(): void {
    if (this.lastPainted !== null) {
      this.lastPainted.fill(REPAINT);
    }
  }

  // The next paint paints every tile, as the first did
  forget(): void {
    this.lastPainted = null;
  }
}

export { PaintRecord, REPAINT, forEachTileToPaint, markAreaForRepaint };
export type { TileRect };
