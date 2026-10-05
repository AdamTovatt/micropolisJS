/* micropolisJS. Adapted by Graeme McCutcheon from Micropolis.
 * Modified in Adam Tovatt's continuation of micropolisJS. Copyright (C) 2026 Adam Tovatt
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
  // The tiles the canvas shows across and down, a fraction where a tile at its edge shows in part
  tilesInViewX: number;
  tilesInViewY: number;
  // The whole tiles that fit across and down, which a view centred on a tile is centred by
  wholeTilesInViewX: number;
  wholeTilesInViewY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// How far the origin may move each way
type OriginLimits = Pick<Viewport, "minX" | "maxX" | "minY" | "maxY">;

// The origin's limits along one axis, for a view of the tiles given of a map the length given: the origin moves until
// the middle of the map's first or last tile is at the middle of the view, so any tile, a corner's included, can be
// seen in the middle, with the void beyond the map around it. A map shorter than the view along the axis follows the
// same rule.
function axisLimits(viewTiles: number, mapLength: number): {min: number, max: number} {
  return {min: 0.5 - viewTiles / 2, max: mapLength - 0.5 - viewTiles / 2};
}

function viewport(canvasWidth: number, canvasHeight: number, tileWidth: number, mapWidth: number,
                  mapHeight: number): Viewport {
  const tilesInViewX = canvasWidth / tileWidth;
  const tilesInViewY = canvasHeight / tileWidth;
  const x = axisLimits(tilesInViewX, mapWidth);
  const y = axisLimits(tilesInViewY, mapHeight);

  return {
    tilesInViewX, tilesInViewY,
    wholeTilesInViewX: Math.floor(tilesInViewX), wholeTilesInViewY: Math.floor(tilesInViewY),
    minX: x.min, maxX: x.max, minY: y.min, maxY: y.max,
  };
}

// The origin (x, y) held within the viewport's limits
function heldOrigin(x: number, y: number, view: Viewport): TilePoint {
  return {x: Math.max(view.minX, Math.min(view.maxX, x)), y: Math.max(view.minY, Math.min(view.maxY, y))};
}

// The origin, on whole tiles, that puts the tile at (x, y) in the middle of the view, held within the origin's limits.
// By whole tiles a tile lands up to half a tile off the view's exact middle, while at a limit an edge tile's middle is
// on it exactly: centring stays on whole tiles, as the view opens and jumps on, and only the limit reaches past them.
function centredOrigin(x: number, y: number, view: Viewport): TilePoint {
  return heldOrigin(Math.floor(x) - Math.ceil(view.wholeTilesInViewX / 2),
                    Math.floor(y) - Math.ceil(view.wholeTilesInViewY / 2), view);
}

// The origin along an axis after a scroll of the whole tiles given, negative for back: the first tile of the scroll
// takes an origin between tiles to the next whole tile its way, so from 3.4 a tile forward is 4 and a tile back is 3
function scrolledAxis(origin: number, tiles: number): number {
  if (tiles === 0) {
    return origin;
  }

  return tiles > 0 ? Math.floor(origin) + tiles : Math.ceil(origin) + tiles;
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

// The origin that keeps the point of the map under a point of the canvas, in CSS pixels, under it as the zoom changes
// from one tile width to another, held within the new viewport's limits
function zoomedOrigin(origin: TilePoint, point: PixelPoint, from: number, to: number, view: Viewport): TilePoint {
  return heldOrigin(origin.x + point.x / from - point.x / to, origin.y + point.y / from - point.y / to, view);
}

// The origin that keeps the point of the map the pointer grabbed at one point of the canvas, in CSS pixels, under it at
// another, tileWidth CSS pixels a tile, before it is held within the limits
function pannedOrigin(grabbed: TilePoint, from: PixelPoint, to: PixelPoint, tileWidth: number): TilePoint {
  return {x: grabbed.x - (to.x - from.x) / tileWidth, y: grabbed.y - (to.y - from.y) / tileWidth};
}

// Where the map is drawn: the device pixel of the map, tilePixels device pixels a tile from its top-left corner, that
// lands at the canvas's top-left. It is the origin snapped to whole device pixels, so tiles stay crisp and a pan
// doesn't shimmer, and everything that places tiles on the canvas, or finds the tile under a point of it, places them
// from it.
function drawnOrigin(origin: TilePoint, tilePixels: number): PixelPoint {
  return {x: Math.round(origin.x * tilePixels), y: Math.round(origin.y * tilePixels)};
}

// The map tile under a point of the canvas, in CSS pixels, as the map is drawn from the origin at tileWidth CSS pixels
// a tile and pixelRatio device pixels to the CSS pixel; it may lie off the map
function tileUnderPoint(x: number, y: number, origin: TilePoint, tileWidth: number, pixelRatio: number): TilePoint {
  const tilePixels = tileWidth * pixelRatio;
  const drawn = drawnOrigin(origin, tilePixels);
  return {x: Math.floor((drawn.x + x * pixelRatio) / tilePixels),
          y: Math.floor((drawn.y + y * pixelRatio) / tilePixels)};
}

// The map tile under a point of the canvas, as tileUnderPoint finds it, or null past the canvas' right or bottom edge
function tileOnCanvasUnderPoint(x: number, y: number, origin: TilePoint, tileWidth: number, pixelRatio: number,
                                canvasWidth: number, canvasHeight: number): TilePoint | null {
  if (x >= canvasWidth || y >= canvasHeight) {
    return null;
  }

  return tileUnderPoint(x, y, origin, tileWidth, pixelRatio);
}

// Where a pan took hold: the origin then, the point of the canvas the pointer pressed, in CSS pixels, and the tile
// width then
interface Grip {
  origin: TilePoint;
  point: PixelPoint;
  tileWidth: number;
}

// Where the view's origin is, which moves within the viewport's limits. It may lie between tiles.
class ViewPosition {
  private originX = 0;
  private originY = 0;
  // The pan under way, or null for none
  private grip: Grip | null = null;

  constructor(private view: Viewport) {}

  get origin(): TilePoint {
    return {x: this.originX, y: this.originY};
  }

  // The last tile in view, partly or whole
  get maxTile(): TilePoint {
    return {x: Math.ceil(this.originX + this.view.tilesInViewX) - 1,
            y: Math.ceil(this.originY + this.view.tilesInViewY) - 1};
  }

  get viewport(): Viewport {
    return this.view;
  }

  // The canvas changed size: the origin stays where it is, held within the new limits
  set viewport(view: Viewport) {
    this.view = view;
    this.moveTo(this.origin);
  }

  // Moves the origin the whole tiles given across and down, the first of them to the next whole tile, as
  // scrolledAxis moves it, held within the limits
  scrollBy(tilesX: number, tilesY: number): void {
    this.moveTo({x: scrolledAxis(this.originX, tilesX), y: scrolledAxis(this.originY, tilesY)});
  }

  centreOn(x: number, y: number): void {
    this.moveTo(centredOrigin(x, y, this.view));
  }

  // The tile width changed from one zoom step to another, to the viewport given: the point of the map under the point
  // of the canvas, in CSS pixels, stays under it as far as the limits allow
  zoom(view: Viewport, point: PixelPoint, from: number, to: number): void {
    const origin = zoomedOrigin(this.origin, point, from, to, view);
    this.view = view;
    this.moveTo(origin);
  }

  // Takes hold of the map at a point of the canvas, in CSS pixels, tileWidth CSS pixels a tile, for a pan
  grab(point: PixelPoint, tileWidth: number): void {
    this.grip = {origin: this.origin, point, tileWidth};
  }

  // Moves the point of the map grabbed under a point of the canvas, as far as the limits allow: at a limit the view
  // stops, and the map comes back under the pointer as the pointer comes back
  pan(point: PixelPoint): void {
    if (this.grip !== null) {
      this.moveTo(pannedOrigin(this.grip.origin, this.grip.point, point, this.grip.tileWidth));
    }
  }

  // Lets go of the map, the view left where the pan took it
  release(): void {
    this.grip = null;
  }

  // The one place the origin moves, held within the limits
  private moveTo(origin: TilePoint): void {
    const held = heldOrigin(origin.x, origin.y, this.view);
    this.originX = held.x;
    this.originY = held.y;
  }
}

export {
  ViewPosition, ZOOM_STEPS, centredOrigin, drawnOrigin, pannedOrigin, scrolledAxis, steppedZoom, tileOnCanvasUnderPoint,
  tileUnderPoint, viewport, zoomedOrigin,
};
export type { OriginLimits, PixelPoint, TilePoint, Viewport };
