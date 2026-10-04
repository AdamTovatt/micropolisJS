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
import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { PaintableMap, PaintableSprite } from "./paintable";
import { PaintRecord } from "./paintRecord";
import type { TileRect } from "./paintRecord";
import { fallbackSpriteRect } from "./renderManifest";
import type { TileSet } from "./tileSet";
import { TILE_INVALID } from "./tileValues";
import { ViewPosition, viewport } from "./viewPosition";
import type { TilePoint } from "./viewPosition";

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

// Paints the map's tiles and the sprites from the 16 px sheets with Canvas 2D, on a canvas that fills its container
// and keeps to the map: the monster TV's view. It repaints only the tiles that changed since the last paint, or that a
// sprite drew over. Issue #66 keeps the monster TV on its 2D drawing, out of the WebGL renderer's scope, so it shows
// the 16 px art whatever rendered art the map draws.
class TileCanvas {
  private readonly canvas: HTMLCanvasElement;
  private readonly record = new PaintRecord();
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

  // Last time we painted, the canvas was this wide and tall in pixels
  private lastCanvasWidth = -1;
  private lastCanvasHeight = -1;

  // Creates the canvas in the container with the given id, replacing an element of the canvas' id there. The container
  // must be shown, so it can be measured.
  constructor(parentId: string, id: string) {
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

  // The map pixels the view shows across and down: tiles are drawn at 16 pixels, as sprites are positioned
  get mapPixelWidth(): number {
    return this.width;
  }

  get mapPixelHeight(): number {
    return this.height;
  }

  // The canvas's container must be shown
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

    // Order is important here. ready must be set before the call to centreOn below
    this.ready = true;
    this.centreOn(Math.floor(map.width / 2), Math.floor(map.height / 2));

    this.paint(null);
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

  paint(sprites: ReadonlyArray<PaintableSprite> | null, isPaused?: boolean): void {
    this.requireReady();

    const ctx = this.canvas.getContext("2d")!;

    if (mustRepaintAll(this.width, this.height, this.lastCanvasWidth, this.lastCanvasHeight)) {
      ctx.clearRect(0, 0, this.width, this.height);
      this.record.repaintAll();
    }

    const origin = this.position.origin;
    const paintWidth = this.position.viewport.totalTilesInViewX;
    const paintHeight = this.position.viewport.totalTilesInViewY;

    // Fill an array with the values we need to paint, adjusted for animations
    const tileValues = this.map.getTileValuesForPainting(origin.x, origin.y, paintWidth, paintHeight,
                                                         this.record.buffer);
    this.animationManager.getTiles(tileValues, origin.x, origin.y, paintWidth, paintHeight, isPaused);

    this.record.paint(tileValues, paintWidth, paintHeight,
                      (tileValue, x, y) => this.paintOne(ctx, tileValue, x, y, origin.x + x, origin.y + y));
    this.lastCanvasWidth = this.width;
    this.lastCanvasHeight = this.height;

    // What the sprites draw over is repainted next time
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

  // The view keeps to the map, so its origin's limits leave no margin past the map's edges
  private calculateDimensions(): void {
    // The canvas is assumed to fill its container on-screen
    const parentNode = this.canvas.parentNode as HTMLElement;
    const canvasWidth = this.width = parentNode.clientWidth;
    const canvasHeight = this.height = parentNode.clientHeight;

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    this.position = new ViewPosition(viewport(canvasWidth, canvasHeight, this.tileSet.tileWidth, this.map.width,
                                              this.map.height, false));
  }

  private paintSprite(ctx: CanvasRenderingContext2D, sprite: PaintableSprite, origin: TilePoint): void {
    try {
      const cell = fallbackSpriteRect(sprite.type, sprite.frame);
      if (cell === null) {
        throw new Error("The sprite sheet has no cell for it");
      }

      ctx.drawImage(this.spriteSheet, cell.x, cell.y, cell.width, cell.height,
                    sprite.x - origin.x * SPRITE_PIXELS_PER_TILE, sprite.y - origin.y * SPRITE_PIXELS_PER_TILE,
                    sprite.width, sprite.width);
    } catch (e) {
      throw new Error(`Failed to draw sprite ${sprite.type} frame ${sprite.frame} at ${sprite.x}, ${sprite.y}`,
                      {cause: e});
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

export { TileCanvas, mustRepaintAll, spriteDamage };
