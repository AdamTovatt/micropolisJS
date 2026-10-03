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

import { AnimationManager } from "./animationManager";
import { placeCanvas } from "./canvasPlacement";
import { drawMouseBox } from "./mouseBox";
import { CanvasOverlay } from "./overlayRenderer";
import type { OverlayView } from "./overlayRenderer";
import type { TileSet } from "./tileSet";
import { TILE_INVALID } from "./tileValues";

interface Point {
  x: number;
  y: number;
}

// A position in tiles, on the map or from the view's origin
type TilePoint = Point;

// A position in canvas pixels
type PixelPoint = Point;

// What the canvas reads of the map
interface PaintableMap {
  readonly width: number;
  readonly height: number;
  testBounds(x: number, y: number): boolean;
  getTileValue(x: number, y: number): number;
  // Fills result, row by row, with the raw values of the w by h tiles from (x, y), TILE_INVALID off the map
  getTileValuesForPainting(x: number, y: number, w: number, h: number, result: number[]): number[];
}

// What the canvas reads of a sprite. Positions are map pixels; frame and type count from 1.
interface PaintableSprite {
  readonly type: number;
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  readonly xOffset: number;
  readonly yOffset: number;
  readonly width: number;
  readonly height: number;
}

// A tool's outline. x and y are the tile under the mouse, in tile offsets from the view's origin: the top-left of a
// tool up to 2x2, and one tile in from the top-left of a bigger one. width and height are tiles.
interface MouseOutline {
  x: number;
  y: number;
  width: number;
  height: number;
  colour: string;
}

// An area of the view in tile offsets from its origin: x and y inclusive, xBound and yBound exclusive
interface TileRect {
  x: number;
  xBound: number;
  y: number;
  yBound: number;
}

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

// Where a tool's outline is drawn, or null if it is off the map, and the tiles it covers
interface MouseOutlineLayout {
  box: {pos: PixelPoint, width: number, height: number} | null;
  damage: TileRect;
}

// A value no tile has, written over the tiles last painted to force their repaint. TILE_INVALID would not do: it is
// the black void.
const REPAINT = -2;

// The pixels each sprite takes on the sprite sheet, in each direction: a sheet row per type, a column per frame
const SPRITE_CELL = 48;

// Sprites are positioned in map pixels, at 16 a tile whatever the tileset's width
const SPRITE_PIXELS_PER_TILE = 16;

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
  // against what was there last time. Both arrays are read xBound wide, which places the tiles right unless the view
  // grew wider.
  const xBound = Math.min(lastWidth, width);
  const yBound = Math.min(lastHeight, height);

  for (let y = 0; y < yBound; y++) {
    for (let x = 0; x < xBound; x++) {
      const index = y * xBound + x;
      if (lastPainted[index] !== tiles[index]) {
        paint(tiles[index], x, y);
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

// The tiles a sprite drawn with the view's origin at (originX, originY) covers, so they are repainted next time
function spriteDamage(sprite: PaintableSprite, originX: number, originY: number, tileWidth: number): TileRect {
  const left = sprite.x + sprite.xOffset - originX * SPRITE_PIXELS_PER_TILE;
  const top = sprite.y + sprite.yOffset - originY * SPRITE_PIXELS_PER_TILE;

  return {
    x: Math.floor(left / tileWidth),
    xBound: Math.ceil((left + sprite.width) / tileWidth),
    y: Math.floor(top / tileWidth),
    yBound: Math.ceil((top + sprite.height) / tileWidth),
  };
}

// The layout of the outline, or null for an outline of no tiles, which draws nothing
function mouseOutlineLayout(mouse: MouseOutline, originX: number, originY: number, mapWidth: number,
                            mapHeight: number, tileWidth: number): MouseOutlineLayout | null {
  if (mouse.width === 0 || mouse.height === 0) {
    return null;
  }

  // For outlines bigger than 2x2 (in either dimension) assume the mouse is offset by one tile
  const mouseX = mouse.width > 2 ? mouse.x - 1 : mouse.x;
  const mouseY = mouse.height > 2 ? mouse.y - 1 : mouse.y;

  const offMap = (originX + mouseX < 0 && originX + mouseX + mouse.width <= 0) ||
                 (originY + mouseY < 0 && originY + mouseY + mouse.height <= 0) ||
                 originX + mouseX >= mapWidth || originY + mouseY >= mapHeight;

  if (offMap) {
    return {box: null, damage: {x: mouseX, xBound: mouseX, y: mouseY, yBound: mouseY}};
  }

  return {
    box: {
      pos: {x: mouseX * tileWidth, y: mouseY * tileWidth},
      width: mouse.width * tileWidth,
      height: mouse.height * tileWidth,
    },
    // The outline runs outside the tiles, so a tile either side is damaged too
    damage: {x: mouseX - 1, xBound: mouseX + mouse.width + 2, y: mouseY - 1, yBound: mouseY + mouse.height + 2},
  };
}

// Marks the area's tiles in a width by height view's last painted tiles for repaint, clipped to the view
function markForRepaint(lastPainted: number[], area: TileRect, width: number, height: number): void {
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
      markForRepaint(this.lastPainted, area, this.lastWidth, this.lastHeight);
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

// Paints the map's tiles, the sprites and a tool's outline on a canvas that fills its container. It repaints only the
// tiles that changed since the last paint, or that a sprite or the outline drew over.
class GameCanvas {
  static readonly DEFAULT_ID = "MicropolisCanvas";

  private readonly canvas: HTMLCanvasElement;
  private readonly record = new PaintRecord();
  // The map overlay tinting each tile as it is painted, under the sprites
  private readonly overlay = new CanvasOverlay();
  private ready = false;
  private pendingTileSet: TileSet | null = null;

  // The canvas' size in pixels, as of the last change of dimensions
  private width = 0;
  private height = 0;

  // Set by init, before which ready is false and nothing reads them
  private map!: PaintableMap;
  private tileSet!: TileSet;
  private spriteSheet!: HTMLImageElement;
  private animationManager!: AnimationManager;
  private position!: ViewPosition;

  // Whether to allow off-map scrolling
  private allowOffMap = true;

  // Last time we painted, the canvas was this wide and tall in pixels
  private lastCanvasWidth = -1;
  private lastCanvasHeight = -1;

  // Have the dimensions changed since the last paint?
  private pendingDimensionChange = false;

  // Creates the canvas in the container with the given id, replacing an element of the canvas' id there
  constructor(parentId: string, id: string = GameCanvas.DEFAULT_ID) {
    const parentNode = document.getElementById(parentId);
    if (parentNode === null) {
      throw new Error(`Node ${parentId} not found`);
    }

    this.canvas = document.createElement("canvas");
    this.canvas.id = id;

    // The canvas is assumed to fill its container on-screen
    const rect = parentNode.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.margin = "0";
    this.canvas.style.padding = "0";

    placeCanvas(parentNode, this.canvas);
  }

  get canvasWidth(): number {
    return this.width;
  }

  get canvasHeight(): number {
    return this.height;
  }

  init(map: PaintableMap, tileSet: TileSet, spriteSheet: HTMLImageElement): void {
    if (!tileSet.isValid) {
      throw new Error("TileSet not ready!");
    }

    this.spriteSheet = spriteSheet;
    this.tileSet = tileSet;
    this.map = map;
    // Each canvas has its own: the manager remembers what this view painted last
    this.animationManager = new AnimationManager(map);

    const w = tileSet.tileWidth;
    if (this.canvas.width < w || this.canvas.height < w) {
      throw new Error("Canvas too small!");
    }

    this.calculateDimensions();
    this.pendingDimensionChange = false;

    // Recompute canvas dimensions on resize
    window.addEventListener("resize", () => {
      this.pendingDimensionChange = true;
    }, false);

    // Order is important here. ready must be set before the call to centreOn below
    this.ready = true;
    this.centreOn(Math.floor(map.width / 2), Math.floor(map.height / 2));

    this.paint(null, null);
  }

  // NOTE: Canvas must be visible when this is called
  disallowOffMap(): void {
    this.allowOffMap = false;
    this.record.forget();
    this.calculateDimensions(true);
  }

  moveNorth(): void {
    this.requireReady();
    this.position.moveNorth();
  }

  moveEast(): void {
    this.requireReady();
    this.position.moveEast();
  }

  moveSouth(): void {
    this.requireReady();
    this.position.moveSouth();
  }

  moveWest(): void {
    this.requireReady();
    this.position.moveWest();
  }

  centreOn(x: number, y: number): void {
    this.requireReady();
    this.position.centreOn(x, y);
  }

  getTileOrigin(): TilePoint {
    this.requireReady();
    return this.position.origin;
  }

  getMaxTile(): TilePoint {
    this.requireReady();
    return this.position.maxTile;
  }

  canvasCoordinateToTileOffset(x: number, y: number): TilePoint {
    this.requireReady();
    return {x: Math.floor(x / this.tileSet.tileWidth), y: Math.floor(y / this.tileSet.tileWidth)};
  }

  canvasCoordinateToTileCoordinate(x: number, y: number): TilePoint | null {
    this.requireReady();
    return canvasPointToTile(x, y, this.position.origin, this.tileSet.tileWidth, this.width, this.height);
  }

  changeTileSet(tileSet: TileSet): void {
    this.requireReady();

    if (!tileSet.isValid) {
      throw new Error("new tileset not loaded");
    }

    this.pendingTileSet = tileSet;
  }

  // Shows an overlay view, or none
  setOverlay(view: OverlayView | null): void {
    this.overlay.show(view);
  }

  screenshotMap(): string {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = this.map.width * this.tileSet.tileWidth;
    tempCanvas.height = this.map.height * this.tileSet.tileWidth;
    const ctx = tempCanvas.getContext("2d")!;

    for (let x = 0; x < this.map.width; x++) {
      for (let y = 0; y < this.map.height; y++) {
        this.paintOne(ctx, this.map.getTileValue(x, y), x, y);
      }
    }
    return tempCanvas.toDataURL();
  }

  screenshotVisible(): string {
    return this.canvas.toDataURL();
  }

  paint(mouse: MouseOutline | null, sprites: ReadonlyArray<PaintableSprite> | null, isPaused?: boolean): void {
    this.requireReady();

    const ctx = this.canvas.getContext("2d")!;

    // Recompute our dimensions if there has been a resize since last paint
    if (this.pendingDimensionChange || this.pendingTileSet) {
      this.calculateDimensions();
      this.pendingDimensionChange = false;

      // Change tileSet if necessary
      if (this.pendingTileSet !== null) {
        this.tileSet = this.pendingTileSet;
      }

      // If the dimensions or tileset has changed, force a repaint of every tile
      if (this.pendingTileSet || this.width !== this.lastCanvasWidth || this.height !== this.lastCanvasHeight) {
        ctx.clearRect(0, 0, this.width, this.height);
        this.record.repaintAll();
      }

      this.pendingTileSet = null;
    }

    const origin = this.position.origin;
    if (this.overlay.needsFullRepaint(origin.x, origin.y)) {
      this.record.repaintAll();
    }

    const paintWidth = this.position.viewport.totalTilesInViewX;
    const paintHeight = this.position.viewport.totalTilesInViewY;

    // Fill an array with the values we need to paint, adjusted for animations
    const tileValues = this.map.getTileValuesForPainting(origin.x, origin.y, paintWidth, paintHeight,
                                                         this.record.buffer);
    this.animationManager.getTiles(tileValues, origin.x, origin.y, paintWidth, paintHeight, isPaused);

    this.record.paint(tileValues, paintWidth, paintHeight,
                      (tileValue, x, y) => this.paintViewTile(ctx, tileValue, x, y, origin));
    this.lastCanvasWidth = this.width;
    this.lastCanvasHeight = this.height;

    // What the outline and the sprites draw over is repainted next time
    if (mouse) {
      const layout = mouseOutlineLayout(mouse, origin.x, origin.y, this.map.width, this.map.height,
                                        this.tileSet.tileWidth);
      if (layout !== null) {
        if (layout.box !== null) {
          drawMouseBox(this.canvas, layout.box.pos, layout.box.width, layout.box.height, mouse.colour);
        }
        this.record.markForRepaint(layout.damage);
      }
    }

    if (sprites) {
      for (const sprite of sprites) {
        this.paintSprite(ctx, sprite, origin);
        this.record.markForRepaint(spriteDamage(sprite, origin.x, origin.y, this.tileSet.tileWidth));
      }
    }
  }

  private requireReady(): void {
    if (!this.ready) {
      throw new Error("Not ready!");
    }
  }

  private calculateDimensions(force = false): void {
    // The canvas is assumed to fill its container on-screen
    const parentNode = this.canvas.parentNode as HTMLElement;
    const canvasWidth = this.width = parentNode.clientWidth;
    const canvasHeight = this.height = parentNode.clientHeight;

    if (canvasHeight === this.lastCanvasHeight && canvasWidth === this.lastCanvasWidth && !force) {
      return;
    }

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    const view = viewport(canvasWidth, canvasHeight, this.tileSet.tileWidth, this.map.width, this.map.height,
                          this.allowOffMap);
    if (this.position === undefined) {
      this.position = new ViewPosition(view);
    } else {
      this.position.viewport = view;
    }

    this.pendingDimensionChange = true;
  }

  private paintSprite(ctx: CanvasRenderingContext2D, sprite: PaintableSprite, origin: TilePoint): void {
    try {
      ctx.drawImage(this.spriteSheet,
                    (sprite.frame - 1) * SPRITE_CELL,
                    (sprite.type - 1) * SPRITE_CELL,
                    sprite.width,
                    sprite.height,
                    sprite.x + sprite.xOffset - origin.x * SPRITE_PIXELS_PER_TILE,
                    sprite.y + sprite.yOffset - origin.y * SPRITE_PIXELS_PER_TILE,
                    sprite.width,
                    sprite.height);
    } catch (e) {
      throw new Error(`Failed to draw sprite ${sprite.type} frame ${sprite.frame} at ${sprite.x}, ${sprite.y}`,
                      {cause: e});
    }
  }

  // A tile of the view, at (x, y) from the view's origin, with the overlay's tint
  private paintViewTile(ctx: CanvasRenderingContext2D, tileValue: number, x: number, y: number,
                        origin: TilePoint): void {
    this.paintOne(ctx, tileValue, x, y);

    if (tileValue !== TILE_INVALID) {
      const w = this.tileSet.tileWidth;
      this.overlay.paintTile(ctx, origin.x + x, origin.y + y, x * w, y * w, w);
    }
  }

  private paintOne(ctx: CanvasRenderingContext2D, tileValue: number, x: number, y: number): void {
    const w = this.tileSet.tileWidth;

    if (tileValue === TILE_INVALID) {
      ctx.fillStyle = "black";
      ctx.fillRect(x * w, y * w, w, w);
      return;
    }

    try {
      ctx.drawImage(this.tileSet.tile(tileValue), x * w, y * w);
    } catch (e) {
      const origin = this.position.origin;
      const mapX = origin.x + x;
      const mapY = origin.y + y;
      const mapTile = this.map.testBounds(mapX, mapY) ? this.map.getTileValue(mapX, mapY) : "?? (Out of bounds)";
      throw new Error(`Failed to draw tile ${tileValue} at ${x}, ${y} (map ${mapX}, ${mapY} tile ${mapTile})`,
                      {cause: e});
    }
  }
}

export { GameCanvas, PaintRecord, REPAINT, ViewPosition, canvasPointToTile, centredOrigin, forEachTileToPaint,
         markForRepaint, mouseOutlineLayout, spriteDamage, viewport };
export type { MouseOutline, PaintableMap, PaintableSprite, PixelPoint, TilePoint, TileRect, Viewport };
