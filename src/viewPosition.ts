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

interface Point {
  x: number;
  y: number;
}

// A position in tiles, on the map or from the view's origin
type TilePoint = Point;

// A position in canvas pixels
type PixelPoint = Point;

// How many tiles the canvas shows, and how far its origin may move
interface Viewport {
  wholeTilesInViewX: number;
  wholeTilesInViewY: number;
  totalTilesInViewX: number;
  totalTilesInViewY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// How far the origin may move each way
type OriginLimits = Pick<Viewport, "minX" | "maxX" | "minY" | "maxY">;

function viewport(canvasWidth: number, canvasHeight: number, tileWidth: number, mapWidth: number, mapHeight: number,
                  allowOffMap: boolean): Viewport {
  // How many tiles fit?
  const wholeTilesInViewX = Math.floor(canvasWidth / tileWidth);
  const wholeTilesInViewY = Math.floor(canvasHeight / tileWidth);
  const totalTilesInViewX = Math.ceil(canvasWidth / tileWidth);
  const totalTilesInViewY = Math.ceil(canvasHeight / tileWidth);
  const tiles = {wholeTilesInViewX, wholeTilesInViewY, totalTilesInViewX, totalTilesInViewY};

  if (allowOffMap) {
    // The map should be visible in at least half the canvas
    return {
      ...tiles,
      minX: 0 - Math.ceil(wholeTilesInViewX / 2),
      maxX: (mapWidth - 1) - Math.ceil(wholeTilesInViewX / 2),
      minY: 0 - Math.ceil(wholeTilesInViewY / 2),
      maxY: (mapHeight - 1) - Math.ceil(wholeTilesInViewY / 2),
    };
  }

  return {
    ...tiles,
    minX: 0,
    maxX: mapWidth - totalTilesInViewX,
    minY: 0,
    maxY: mapHeight - totalTilesInViewY,
  };
}

// The origin that puts the tile at (x, y) in the middle of the view, held within the origin's limits. Where the limits
// cross, as on a view wider than the map that can't scroll off it, the minimum wins.
function centredOrigin(x: number, y: number, view: Viewport): TilePoint {
  let originX = Math.floor(x) - Math.ceil(view.wholeTilesInViewX / 2);
  let originY = Math.floor(y) - Math.ceil(view.wholeTilesInViewY / 2);

  if (originX > view.maxX) {
    originX = view.maxX;
  }
  if (originX < view.minX) {
    originX = view.minX;
  }
  if (originY > view.maxY) {
    originY = view.maxY;
  }
  if (originY < view.minY) {
    originY = view.minY;
  }

  return {x: originX, y: originY};
}

// The map tile under a point of the canvas, or null past the canvas' right or bottom edge
function canvasPointToTile(x: number, y: number, origin: TilePoint, tileWidth: number, canvasWidth: number,
                           canvasHeight: number): TilePoint | null {
  if (x >= canvasWidth || y >= canvasHeight) {
    return null;
  }

  return {x: origin.x + Math.floor(x / tileWidth), y: origin.y + Math.floor(y / tileWidth)};
}

// Where the view's origin is, which moves within the viewport's limits
class ViewPosition {
  private originX = 0;
  private originY = 0;

  constructor(private view: Viewport) {}

  get origin(): TilePoint {
    return {x: this.originX, y: this.originY};
  }

  // The last tile in view, partly or whole
  get maxTile(): TilePoint {
    return {x: this.originX + this.view.totalTilesInViewX - 1, y: this.originY + this.view.totalTilesInViewY - 1};
  }

  get viewport(): Viewport {
    return this.view;
  }

  // The canvas changed size. The origin stays where it is until it next moves.
  set viewport(view: Viewport) {
    this.view = view;
  }

  moveNorth(): void {
    if (this.originY > this.view.minY) {
      this.originY--;
    }
  }

  moveEast(): void {
    if (this.originX < this.view.maxX) {
      this.originX++;
    }
  }

  moveSouth(): void {
    if (this.originY < this.view.maxY) {
      this.originY++;
    }
  }

  moveWest(): void {
    if (this.originX > this.view.minX) {
      this.originX--;
    }
  }

  centreOn(x: number, y: number): void {
    const origin = centredOrigin(x, y, this.view);
    this.originX = origin.x;
    this.originY = origin.y;
  }
}

export { ViewPosition, canvasPointToTile, centredOrigin, viewport };
export type { OriginLimits, PixelPoint, TilePoint, Viewport };
