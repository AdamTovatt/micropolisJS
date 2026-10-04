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

// The origin's limits along one axis, for a view of the tiles given, whole and in all, of a map the length given: the
// origin moves so far that every map tile can be seen whole, and no whole tile of void shows beyond the map. A view
// longer than the map along the axis centres it, which leaves the origin no room to move.
function axisLimits(wholeTiles: number, viewTiles: number, mapLength: number): {min: number, max: number} {
  if (wholeTiles <= mapLength) {
    return {min: 0, max: mapLength - wholeTiles};
  }

  const centred = Math.round((mapLength - viewTiles) / 2);
  return {min: centred, max: centred};
}

function viewport(canvasWidth: number, canvasHeight: number, tileWidth: number, mapWidth: number,
                  mapHeight: number): Viewport {
  // How many tiles fit?
  const wholeTilesInViewX = Math.floor(canvasWidth / tileWidth);
  const wholeTilesInViewY = Math.floor(canvasHeight / tileWidth);
  const totalTilesInViewX = Math.ceil(canvasWidth / tileWidth);
  const totalTilesInViewY = Math.ceil(canvasHeight / tileWidth);
  const x = axisLimits(wholeTilesInViewX, canvasWidth / tileWidth, mapWidth);
  const y = axisLimits(wholeTilesInViewY, canvasHeight / tileWidth, mapHeight);

  return {
    wholeTilesInViewX, wholeTilesInViewY, totalTilesInViewX, totalTilesInViewY,
    minX: x.min, maxX: x.max, minY: y.min, maxY: y.max,
  };
}

// The origin (x, y) held within the viewport's limits
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

  // The canvas changed size: the origin stays where it is, held within the new limits
  set viewport(view: Viewport) {
    this.view = view;
    this.moveTo(this.origin);
  }

  // Moves the origin the whole tiles given across and down, held within the limits
  scrollBy(tilesX: number, tilesY: number): void {
    this.moveTo({x: this.originX + tilesX, y: this.originY + tilesY});
  }

  centreOn(x: number, y: number): void {
    this.moveTo(centredOrigin(x, y, this.view));
  }

  // The tile width changed from one zoom step to another, to the viewport given: the tile under the point of the
  // canvas, in CSS pixels, stays under it as far as the limits allow
  zoom(view: Viewport, point: PixelPoint, from: number, to: number): void {
    const origin = zoomedOrigin(this.origin, point, from, to, view);
    this.view = view;
    this.moveTo(origin);
  }

  // The one place the origin moves, held within the limits
  private moveTo(origin: TilePoint): void {
    const held = heldOrigin(origin.x, origin.y, this.view);
    this.originX = held.x;
    this.originY = held.y;
  }
}

export { ViewPosition, ZOOM_STEPS, canvasPointToTile, centredOrigin, steppedZoom, viewport, zoomedOrigin };
export type { OriginLimits, PixelPoint, TilePoint, Viewport };
