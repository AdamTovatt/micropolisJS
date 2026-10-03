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
import { placeNewCanvas, requiredElement } from "./domElements";
import { drawMouseBox } from "./mouseBox";
import { CanvasOverlay } from "./overlayRenderer";
import type { OverlayView } from "./overlayRenderer";
import { PaintRecord } from "./paintRecord";
import type { TileRect } from "./paintRecord";
import type { SpriteView } from "./protocol";
import type { TileSet } from "./tileSet";
import { TILE_INVALID } from "./tileValues";
import { ViewPosition, canvasPointToTile, viewport } from "./viewPosition";
import type { PixelPoint, TilePoint } from "./viewPosition";

// What the canvas reads of the map
interface PaintableMap {
  readonly width: number;
  readonly height: number;
  testBounds(x: number, y: number): boolean;
  getTileValue(x: number, y: number): number;
  // Fills result, row by row, with the raw values of the w by h tiles from (x, y), TILE_INVALID off the map
  getTileValuesForPainting(x: number, y: number, w: number, h: number, result: number[]): number[];
}

// What the canvas reads of a sprite: the square it is drawn in, width map pixels a side from map pixel (x, y), and its
// type and frame, which count from 1, as a sprites message gives them
type PaintableSprite = Readonly<SpriteView>;

// A tool's outline. x and y are the tile under the mouse, in tile offsets from the view's origin: the top-left of a
// tool up to 2x2, and one tile in from the top-left of a bigger one. width and height are tiles.
interface MouseOutline {
  x: number;
  y: number;
  width: number;
  height: number;
  colour: string;
}

// Where a tool's outline is drawn, or null if it is off the map, and the tiles it covers
interface MouseOutlineLayout {
  box: {pos: PixelPoint, width: number, height: number} | null;
  damage: TileRect;
}

// The pixels each sprite takes on the sprite sheet, in each direction: a sheet row per type, a column per frame
const SPRITE_CELL = 48;

// Sprites are positioned in map pixels, at 16 a tile whatever the tileset's width
const SPRITE_PIXELS_PER_TILE = 16;

// Whether a paint must clear the canvas and repaint every tile: the canvas changed size since the last paint
function mustRepaintAll(width: number, height: number, lastWidth: number, lastHeight: number): boolean {
  return width !== lastWidth || height !== lastHeight;
}

// The tiles a sprite drawn with the view's origin at (originX, originY) covers, so they are repainted next time
function spriteDamage(sprite: PaintableSprite, originX: number, originY: number, tileWidth: number): TileRect {
  const left = sprite.x - originX * SPRITE_PIXELS_PER_TILE;
  const top = sprite.y - originY * SPRITE_PIXELS_PER_TILE;

  return {
    x: Math.floor(left / tileWidth),
    xBound: Math.ceil((left + sprite.width) / tileWidth),
    y: Math.floor(top / tileWidth),
    yBound: Math.ceil((top + sprite.width) / tileWidth),
  };
}

// The sprites any part of whose square shows in the view whose top-left tile is (originX, originY), pixelWidth by
// pixelHeight map pixels, as the original's sprite manager chose the sprites to draw
function spritesInView(sprites: readonly PaintableSprite[], originX: number, originY: number, pixelWidth: number,
                       pixelHeight: number): PaintableSprite[] {
  const startX = originX * SPRITE_PIXELS_PER_TILE;
  const startY = originY * SPRITE_PIXELS_PER_TILE;
  const lastX = startX + pixelWidth;
  const lastY = startY + pixelHeight;
  const inX = (x: number) => x >= startX && x < lastX;
  const inY = (y: number) => y >= startY && y < lastY;

  return sprites.filter((sprite) => (inX(sprite.x) || inX(sprite.x + sprite.width)) &&
                                    (inY(sprite.y) || inY(sprite.y + sprite.width)));
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

// Paints the map's tiles, the sprites and a tool's outline on a canvas that fills its container. It repaints only the
// tiles that changed since the last paint, or that a sprite or the outline drew over.
class GameCanvas {
  static readonly DEFAULT_ID = "MicropolisCanvas";

  private readonly canvas: HTMLCanvasElement;
  private readonly record = new PaintRecord();
  // The map overlay tinting each tile as it is painted, under the sprites
  private readonly overlay = new CanvasOverlay();
  private ready = false;

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

  // Has the window been resized since the last paint?
  private pendingDimensionChange = false;

  // Creates the canvas in the container with the given id, replacing an element of the canvas' id there
  constructor(parentId: string, id: string = GameCanvas.DEFAULT_ID) {
    const parentNode = requiredElement(parentId);

    // The canvas is assumed to fill its container on-screen. The container is measured before the canvas joins it, as
    // the canvas could change its size.
    const rect = parentNode.getBoundingClientRect();
    this.canvas = placeNewCanvas(parentNode, id);
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.margin = "0";
    this.canvas.style.padding = "0";
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
        this.paintOne(ctx, this.map.getTileValue(x, y), x, y, x, y);
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
    if (this.pendingDimensionChange) {
      this.calculateDimensions();
      this.pendingDimensionChange = false;
    }

    if (mustRepaintAll(this.width, this.height, this.lastCanvasWidth, this.lastCanvasHeight)) {
      ctx.clearRect(0, 0, this.width, this.height);
      this.record.repaintAll();
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
  }

  private paintSprite(ctx: CanvasRenderingContext2D, sprite: PaintableSprite, origin: TilePoint): void {
    try {
      ctx.drawImage(this.spriteSheet,
                    (sprite.frame - 1) * SPRITE_CELL,
                    (sprite.type - 1) * SPRITE_CELL,
                    sprite.width,
                    sprite.width,
                    sprite.x - origin.x * SPRITE_PIXELS_PER_TILE,
                    sprite.y - origin.y * SPRITE_PIXELS_PER_TILE,
                    sprite.width,
                    sprite.width);
    } catch (e) {
      throw new Error(`Failed to draw sprite ${sprite.type} frame ${sprite.frame} at ${sprite.x}, ${sprite.y}`,
                      {cause: e});
    }
  }

  // A tile of the view, at (x, y) from the view's origin, with the overlay's tint
  private paintViewTile(ctx: CanvasRenderingContext2D, tileValue: number, x: number, y: number,
                        origin: TilePoint): void {
    const mapX = origin.x + x;
    const mapY = origin.y + y;
    this.paintOne(ctx, tileValue, x, y, mapX, mapY);

    if (tileValue !== TILE_INVALID) {
      const w = this.tileSet.tileWidth;
      this.overlay.paintTile(ctx, mapX, mapY, x * w, y * w, w);
    }
  }

  // Paints the tile at (x, y) in tiles on the canvas, from the map's tile at (mapX, mapY), which a failure names
  private paintOne(ctx: CanvasRenderingContext2D, tileValue: number, x: number, y: number, mapX: number,
                   mapY: number): void {
    const w = this.tileSet.tileWidth;

    if (tileValue === TILE_INVALID) {
      ctx.fillStyle = "black";
      ctx.fillRect(x * w, y * w, w, w);
      return;
    }

    try {
      ctx.drawImage(this.tileSet.tile(tileValue), x * w, y * w);
    } catch (e) {
      const mapTile = this.map.testBounds(mapX, mapY) ? this.map.getTileValue(mapX, mapY) : "?? (Out of bounds)";
      throw new Error(`Failed to draw tile ${tileValue} at ${x}, ${y} (map ${mapX}, ${mapY} tile ${mapTile})`,
                      {cause: e});
    }
  }
}

export { GameCanvas, SPRITE_PIXELS_PER_TILE, mouseOutlineLayout, mustRepaintAll, spriteDamage, spritesInView };
export type { MouseOutline, PaintableMap, PaintableSprite };
