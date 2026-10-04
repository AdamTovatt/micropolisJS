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

// The origin (x, y) held within the viewport's limits. Where the limits cross, as on a view wider than the map that
// can't scroll off it, the minimum wins.
function heldOrigin(x: number, y: number, view: Viewport): TilePoint {
  return {x: Math.max(view.minX, Math.min(view.maxX, x)), y: Math.max(view.minY, Math.min(view.maxY, y))};
}

// The origin that puts the tile at (x, y) in the middle of the view, held within the origin's limits
function centredOrigin(x: number, y: number, view: Viewport): TilePoint {
  return heldOrigin(Math.floor(x) - Math.ceil(view.wholeTilesInViewX / 2),
                    Math.floor(y) - Math.ceil(view.wholeTilesInViewY / 2), view);
}

// The zoom steps, in CSS pixels a tile is drawn on the canvas, from the farthest out. The view opens at the first.
const ZOOM_STEPS: readonly number[] = [16, 32, 64];

// The zoom step steps in (a positive steps) or out (a negative one) from the zoom given, held at the first and last
function steppedZoom(zoom: number, steps: number): number {
  const index = ZOOM_STEPS.indexOf(zoom);
  if (index === -1) {
    throw new Error(`${zoom} is not a zoom step`);
  }

  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + steps))];
}

// The origin that keeps the tile under a point of the canvas, in CSS pixels, under it as the zoom changes from one tile
// width to another, with the origin on whole tiles and held within the new viewport's limits
function zoomedOrigin(origin: TilePoint, point: PixelPoint, from: number, to: number, view: Viewport): TilePoint {
  return heldOrigin(origin.x + Math.floor(point.x / from) - Math.floor(point.x / to),
                    origin.y + Math.floor(point.y / from) - Math.floor(point.y / to), view);
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

  // The tile width changed from one zoom step to another, to the viewport given: the tile under the point of the
  // canvas, in CSS pixels, stays under it as far as the limits allow
  zoom(view: Viewport, point: PixelPoint, from: number, to: number): void {
    const origin = zoomedOrigin(this.origin, point, from, to, view);
    this.view = view;
    this.originX = origin.x;
    this.originY = origin.y;
  }
}

export { ViewPosition, ZOOM_STEPS, canvasPointToTile, centredOrigin, steppedZoom, viewport, zoomedOrigin };
export type { OriginLimits, PixelPoint, TilePoint, Viewport };
