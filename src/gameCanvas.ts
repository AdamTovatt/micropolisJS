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

import type { PaintableCar } from "./cars";
import { placeNewCanvas, requiredElement, screenPixelRatio, sizeCanvas } from "./domElements";
import { MapPainter, paintedView } from "./mapPainter";
import { drawBoxLabel, drawMouseBox } from "./mouseBox";
import type { OverlayView } from "./overlayRenderer";
import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { PaintableMap, PaintableSprite } from "./paintable";
import type { MapArt } from "./renderAssets";
import {
  ViewPosition, ZOOM_STEPS, drawnOrigin, steppedZoom, tileOnCanvasUnderPoint, tileUnderPoint, viewport,
} from "./viewPosition";
import type { OriginLimits, PixelPoint, TilePoint, Viewport } from "./viewPosition";

// A tool's outline. x and y are the map tile under the mouse: the top-left of a tool up to 2x2, and one tile in from
// the top-left of a bigger one. width and height are tiles. label is the name of the player whose outline it is,
// written beside it on a tag of the label's colour, a "#rrggbb", or null for this player's own.
interface MouseOutline {
  x: number;
  y: number;
  width: number;
  height: number;
  colour: string;
  label: {name: string, colour: string} | null;
}

// Where a tool's outline is drawn, in CSS pixels from the canvas's top-left
interface MouseOutlineBox {
  pos: PixelPoint;
  width: number;
  height: number;
}

// Where the outline is drawn on a view from the origin, at tileWidth CSS pixels a tile and pixelRatio device pixels to
// the CSS pixel, over the tiles as the map draws them (drawnOrigin), or null for an outline of no tiles or off the map,
// which draws nothing
function mouseOutlineLayout(mouse: MouseOutline, origin: TilePoint, pixelRatio: number, mapWidth: number,
                            mapHeight: number, tileWidth: number): MouseOutlineBox | null {
  if (mouse.width === 0 || mouse.height === 0) {
    return null;
  }

  // For outlines bigger than 2x2 (in either dimension) assume the mouse is offset by one tile
  const mouseX = mouse.width > 2 ? mouse.x - 1 : mouse.x;
  const mouseY = mouse.height > 2 ? mouse.y - 1 : mouse.y;

  const offMap = mouseX + mouse.width <= 0 || mouseY + mouse.height <= 0 || mouseX >= mapWidth || mouseY >= mapHeight;
  if (offMap) {
    return null;
  }

  const tilePixels = tileWidth * pixelRatio;
  const drawn = drawnOrigin(origin, tilePixels);
  return {
    pos: {x: (mouseX * tilePixels - drawn.x) / pixelRatio, y: (mouseY * tilePixels - drawn.y) / pixelRatio},
    width: mouse.width * tileWidth,
    height: mouse.height * tileWidth,
  };
}

// The tile width of the Screenshot window's picture of the whole map, in its pixels
const SCREENSHOT_TILE_PIXELS = 16;

// A canvas laid over the container's top-left corner, before the child given, so the children after it show over it,
// or in place of an element of the id there
function placeLayer(parent: HTMLElement, id: string, before: Node | null): HTMLCanvasElement {
  const canvas = placeNewCanvas(parent, id, before);
  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.margin = "0";
  canvas.style.padding = "0";
  return canvas;
}

// Draws the map with WebGL on a canvas that fills its container, zoomed to one of the zoom steps, with a 2D canvas over
// it for the marks the player's interface draws: the tools' outlines, other players' named. Each canvas's backing
// store has devicePixelRatio pixels for each CSS pixel, so the art is sharp on a dense screen, while positions on the
// canvas, the tile width and the zoom are CSS pixels.
class GameCanvas {
  static readonly DEFAULT_ID = "MicropolisCanvas";
  static readonly MARKS_ID = "MicropolisMarks";

  // The map, drawn with WebGL, which takes the pointer's events
  private readonly canvas: HTMLCanvasElement;
  // The marks, drawn with Canvas 2D over the map, which the pointer's events pass through
  private readonly marks: HTMLCanvasElement;
  private readonly painter: MapPainter;
  // The map overlay tinting each tile, under the sprites
  private overlay: OverlayView | null = null;
  // The overlay of the last frame drawn, and who hears of each new one
  private overlayDrawn: OverlayView | null = null;
  private readonly overlayDrawnListeners: ((view: OverlayView | null) => void)[] = [];
  // What the marks were last drawn from, so a paint that would draw the same again doesn't
  private marksDrawn = "";
  // The frames the painter has drawn
  private painted = 0;

  // The CSS pixels a tile is drawn
  private zoom = ZOOM_STEPS[0];

  // The canvas' size in CSS pixels, and its backing store's pixels for each, as of the last change of dimensions
  private width = 0;
  private height = 0;
  private pixelRatio = 1;

  private readonly position: ViewPosition;

  // Has the window been resized since the last paint?
  private pendingDimensionChange = false;

  // Creates the canvases in the container with the given id, replacing elements of the canvases' ids there, and draws
  // the map on them from the art, centred
  constructor(parentId: string, private readonly map: PaintableMap, mapArt: MapArt) {
    const parentNode = requiredElement(parentId);
    this.canvas = placeLayer(parentNode, GameCanvas.DEFAULT_ID, parentNode.firstChild);
    this.marks = placeLayer(parentNode, GameCanvas.MARKS_ID, this.canvas.nextSibling);
    this.marks.style.pointerEvents = "none";

    this.painter = MapPainter.onCanvas(this.canvas, map, mapArt);

    this.fitContainer();
    this.position = new ViewPosition(this.viewportAt(this.zoom));
    window.addEventListener("resize", () => {
      this.pendingDimensionChange = true;
    }, false);

    this.centreOn(Math.floor(map.width / 2), Math.floor(map.height / 2));
    this.paint([], [], []);
  }

  // The CSS pixels a tile is drawn, at the zoom the view is at
  get tileWidth(): number {
    return this.zoom;
  }

  // Whether the map shows what the last paint read, drawn to the end: the last paint drew it, or found it drawn
  // already, and the GPU has finished drawing it
  get mapCurrent(): boolean {
    return this.painter.current;
  }

  // The frames the map's painter has drawn since the canvas was made
  get framesPainted(): number {
    return this.painted;
  }

  // The tiles the view shows across and down, a fraction where a tile at either edge shows in part
  get tilesInView(): TilePoint {
    return {x: this.width / this.zoom, y: this.height / this.zoom};
  }

  // The map pixels the view shows across and down, at 16 a tile, as sprites are positioned
  get mapPixelWidth(): number {
    return this.width * SPRITE_PIXELS_PER_TILE / this.zoom;
  }

  get mapPixelHeight(): number {
    return this.height * SPRITE_PIXELS_PER_TILE / this.zoom;
  }

  // Moves the view the tiles given across and down, a fraction of a tile included, as far as its limits
  scrollBy(tilesX: number, tilesY: number): void {
    this.position.scrollBy(tilesX, tilesY);
  }

  // Takes hold of the map at a point of the canvas, in CSS pixels, to pan it: until release, panTo keeps the point of
  // the map under the pointer, as far as the view's limits allow
  grab(point: PixelPoint): void {
    this.position.grab(point, this.zoom);
  }

  panTo(point: PixelPoint): void {
    this.position.pan(point);
  }

  release(): void {
    this.position.release();
  }

  centreOn(x: number, y: number): void {
    this.position.centreOn(x, y);
  }

  // Zooms in (a positive steps) or out (a negative one) through the zoom steps, keeping the tile under a point of the
  // canvas, in CSS pixels, under it: the pointer, or the middle of the view when it is null
  zoomBy(steps: number, point: PixelPoint | null): void {
    const zoom = steppedZoom(this.zoom, steps);
    if (zoom === this.zoom) {
      return;
    }

    const around = point ?? {x: Math.floor(this.width / 2), y: Math.floor(this.height / 2)};
    this.position.zoom(this.viewportAt(zoom), around, this.zoom, zoom);
    this.zoom = zoom;
  }

  getTileOrigin(): TilePoint {
    return this.position.origin;
  }

  getOriginLimits(): OriginLimits {
    const {minX, maxX, minY, maxY} = this.position.viewport;
    return {minX, maxX, minY, maxY};
  }

  // The map tile drawn under a point of the canvas, in CSS pixels, which may lie off the map or past the canvas' edges
  tileUnder(x: number, y: number): TilePoint {
    return tileUnderPoint(x, y, this.position.origin, this.zoom, this.pixelRatio);
  }

  // The map tile drawn under a point of the canvas, or null past the canvas' right or bottom edge
  tileOnCanvasUnder(x: number, y: number): TilePoint | null {
    return tileOnCanvasUnderPoint(x, y, this.position.origin, this.zoom, this.pixelRatio, this.width, this.height);
  }

  // Shows an overlay view, or none, from the next frame drawn
  setOverlay(view: OverlayView | null): void {
    this.overlay = view;
    this.painter.invalidate();
  }

  // Calls the listener with the overlay of each frame drawn with another overlay than the frame before, null for none
  onOverlayDrawn(listener: (view: OverlayView | null) => void): void {
    this.overlayDrawnListeners.push(listener);
  }

  // The whole map at 16 pixels a tile, as a PNG's data URI: each tile's own value, unanimated, with no sprites or
  // overlay, drawn offscreen
  screenshotMap(): string {
    const drawn = this.painter.drawWholeMap(SCREENSHOT_TILE_PIXELS);
    if (drawn === null) {
      throw new Error("The map can't be drawn while the browser has lost its WebGL context");
    }

    const {pixels, width, height} = drawn;
    const picture = document.createElement("canvas");
    picture.width = width;
    picture.height = height;
    picture.getContext("2d")!.putImageData(new ImageData(pixels, width, height), 0, 0);
    return picture.toDataURL();
  }

  // The view as it shows, the marks over the map, at the zoom and the backing store's pixels, as a PNG's data URI
  screenshotVisible(): string {
    const picture = document.createElement("canvas");
    picture.width = this.canvas.width;
    picture.height = this.canvas.height;

    // The map's drawing buffer is kept from frame to frame, so it holds the map as it shows
    const ctx = picture.getContext("2d")!;
    ctx.drawImage(this.canvas, 0, 0);
    ctx.drawImage(this.marks, 0, 0);
    return picture.toDataURL();
  }

  // Paints the map, with the cars and then the sprites over it, then the outlines in order, each over the last
  paint(outlines: readonly MouseOutline[], cars: readonly PaintableCar[], sprites: readonly PaintableSprite[],
        isPaused?: boolean): void {
    // Recompute our dimensions if there has been a resize since last paint. The origin stays where it is, as far as the
    // new size's limits allow.
    if (this.pendingDimensionChange) {
      this.fitContainer();
      this.position.viewport = this.viewportAt(this.zoom);
      this.pendingDimensionChange = false;
      // Sizing a canvas clears it, at the same size too
      this.painter.invalidate();
      this.marksDrawn = "";
    }

    const origin = this.position.origin;
    const overlay = this.overlay;
    const drew = this.painter.paint(paintedView(this.position, this.zoom * this.pixelRatio),
                                    overlay === null ? () => null : (x, y) => overlay.tileTint(x, y), cars,
                                    sprites, isPaused);
    if (drew) {
      this.painted++;
    }

    // Setting the overlay forgets the frame drawn, so the first frame drawn after it is drawn whole, with it. While the
    // WebGL context is lost the renderer draws nothing and this still reports the overlay, but the map is blank then,
    // so no other layer's tint shows under the legend, and the restored context's first frame draws the map whole with
    // the overlay reported
    if (drew && overlay !== this.overlayDrawn) {
      this.overlayDrawn = overlay;
      this.overlayDrawnListeners.forEach((listener) => listener(overlay));
    }

    const boxes = outlines.map((outline) => ({
      outline,
      box: mouseOutlineLayout(outline, origin, this.pixelRatio, this.map.width, this.map.height, this.zoom),
    }));
    const marks = JSON.stringify([this.marks.width, this.marks.height, boxes]);
    if (marks === this.marksDrawn) {
      return;
    }
    this.marksDrawn = marks;

    const ctx = this.marks.getContext("2d")!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.marks.width, this.marks.height);
    // The marks are drawn in CSS pixels
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);

    for (const {outline, box} of boxes) {
      if (box === null) {
        continue;
      }

      drawMouseBox(this.marks, box.pos, box.width, box.height, outline.colour);
      if (outline.label !== null) {
        drawBoxLabel(this.marks, {x: box.pos.x + box.width, y: box.pos.y}, outline.label.name, outline.label.colour);
      }
    }
  }

  private viewportAt(zoom: number): Viewport {
    return viewport(this.width, this.height, zoom, this.map.width, this.map.height);
  }

  // Sizes the canvases to fill their container on-screen
  private fitContainer(): void {
    const parentNode = this.canvas.parentNode as HTMLElement;
    this.width = parentNode.clientWidth;
    this.height = parentNode.clientHeight;
    this.pixelRatio = screenPixelRatio();

    for (const canvas of [this.canvas, this.marks]) {
      sizeCanvas(canvas, this.width, this.height, this.pixelRatio);
    }
  }
}

export { GameCanvas, mouseOutlineLayout };
export type { MouseOutline };
