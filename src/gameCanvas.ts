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
import { FrameRecord, MapFrame, buildMapFrame } from "./mapFrame";
import type { FrameTiles } from "./mapFrame";
import { drawBoxLabel, drawMouseBox } from "./mouseBox";
import type { OverlayView } from "./overlayRenderer";
import { SPRITE_PIXELS_PER_TILE } from "./paintable";
import type { PaintableMap, PaintableSprite } from "./paintable";
import type { MapArt } from "./renderAssets";
import type { RenderArt } from "./renderManifest";
import { BIT_MASK } from "./tileFlags";
import { ViewPosition, ZOOM_STEPS, canvasPointToTile, steppedZoom, viewport } from "./viewPosition";
import type { OriginLimits, PixelPoint, TilePoint, Viewport } from "./viewPosition";
import { WebGLRenderer } from "./webglRenderer";

// A tool's outline. x and y are the tile under the mouse, in tile offsets from the view's origin: the top-left of a
// tool up to 2x2, and one tile in from the top-left of a bigger one. width and height are tiles. label is the name of
// the player whose outline it is, written beside it on a tag of the label's colour, a "#rrggbb", or null for this
// player's own.
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

// Where the outline is drawn, at tileWidth CSS pixels a tile, or null for an outline of no tiles or off the map, which
// draws nothing

function mouseOutlineLayout(mouse: MouseOutline, originX: number, originY: number, mapWidth: number,
                            mapHeight: number, tileWidth: number): MouseOutlineBox | null {
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
    return null;
  }

  return {
    pos: {x: mouseX * tileWidth, y: mouseY * tileWidth},
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
  private readonly frame = new MapFrame();
  // The map overlay tinting each tile, under the sprites
  private overlay: OverlayView | null = null;
  // What the map and the marks were last drawn from, so a paint that would draw the same again doesn't
  private readonly drawn = new FrameRecord();
  private marksDrawn = "";
  // Whether the last paint left the map as it was, the GPU still drawing the frame before
  private mapBehind = false;

  // The CSS pixels a tile is drawn
  private zoom = ZOOM_STEPS[0];

  // The canvas' size in CSS pixels, and its backing store's pixels for each, as of the last change of dimensions
  private width = 0;
  private height = 0;
  private pixelRatio = 1;

  // The raw values of the tiles a paint reads, and the tile ids it draws, kept from paint to paint
  private readonly values: number[] = [];
  private readonly frames: number[] = [];

  private readonly art: RenderArt;
  private readonly renderer: WebGLRenderer;
  // The canvas's own: the manager remembers what this view painted last
  private readonly animationManager: AnimationManager;
  private readonly position: ViewPosition;

  // Has the window been resized since the last paint?
  private pendingDimensionChange = false;

  // Creates the canvases in the container with the given id, replacing elements of the canvases' ids there, and draws
  // the map on them from the art, centred
  constructor(parentId: string, private readonly map: PaintableMap, {art, atlases}: MapArt) {
    const parentNode = requiredElement(parentId);
    this.canvas = placeLayer(parentNode, GameCanvas.DEFAULT_ID, parentNode.firstChild);
    this.marks = placeLayer(parentNode, GameCanvas.MARKS_ID, this.canvas.nextSibling);
    this.marks.style.pointerEvents = "none";

    this.art = art;
    this.renderer = new WebGLRenderer(this.canvas, atlases, () => this.drawn.invalidate());
    this.animationManager = new AnimationManager(map);

    this.fitContainer();
    this.position = new ViewPosition(this.viewportAt(this.zoom));
    window.addEventListener("resize", () => {
      this.pendingDimensionChange = true;
    }, false);

    this.centreOn(Math.floor(map.width / 2), Math.floor(map.height / 2));
    this.paint([], null);
  }

  // The CSS pixels a tile is drawn, at the zoom the view is at
  get tileWidth(): number {
    return this.zoom;
  }

  // Whether the map shows what the last paint read, drawn to the end: the last paint drew it, or found it drawn
  // already, and the GPU has finished drawing it
  get mapCurrent(): boolean {
    return !this.mapBehind && !this.renderer.busy;
  }

  // The map pixels the view shows across and down, at 16 a tile, as sprites are positioned
  get mapPixelWidth(): number {
    return this.width * SPRITE_PIXELS_PER_TILE / this.zoom;
  }

  get mapPixelHeight(): number {
    return this.height * SPRITE_PIXELS_PER_TILE / this.zoom;
  }

  moveNorth(): void {
    this.position.moveNorth();
  }

  moveEast(): void {
    this.position.moveEast();
  }

  moveSouth(): void {
    this.position.moveSouth();
  }

  moveWest(): void {
    this.position.moveWest();
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

  getMaxTile(): TilePoint {
    return this.position.maxTile;
  }

  getOriginLimits(): OriginLimits {
    const {minX, maxX, minY, maxY} = this.position.viewport;
    return {minX, maxX, minY, maxY};
  }

  canvasCoordinateToTileOffset(x: number, y: number): TilePoint {
    return {x: Math.floor(x / this.zoom), y: Math.floor(y / this.zoom)};
  }

  canvasCoordinateToTileCoordinate(x: number, y: number): TilePoint | null {
    return canvasPointToTile(x, y, this.position.origin, this.zoom, this.width, this.height);
  }

  // Shows an overlay view, or none
  setOverlay(view: OverlayView | null): void {
    this.overlay = view;
    this.drawn.invalidate();
  }

  // The whole map at 16 pixels a tile, as a PNG's data URI: each tile's own value, unanimated, with no sprites or
  // overlay, drawn offscreen
  screenshotMap(): string {
    const {width, height} = this.map;
    const values = this.map.getTileValuesForPainting(0, 0, width, height, []);
    const tiles: FrameTiles = {x: 0, y: 0, width, height, margin: 0, values, frames: values.map((value) => value & BIT_MASK)};

    const frame = new MapFrame();
    buildMapFrame(frame, this.art, tiles, SCREENSHOT_TILE_PIXELS, () => null, []);
    const pixelWidth = width * SCREENSHOT_TILE_PIXELS;
    const pixelHeight = height * SCREENSHOT_TILE_PIXELS;
    const pixels = this.renderer.drawOffscreen(frame, pixelWidth, pixelHeight);
    if (pixels === null) {
      throw new Error("The map can't be drawn while the browser has lost its WebGL context");
    }

    const picture = document.createElement("canvas");
    picture.width = pixelWidth;
    picture.height = pixelHeight;
    picture.getContext("2d")!.putImageData(new ImageData(pixels, pixelWidth, pixelHeight), 0, 0);
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

  // Paints the map, then the outlines in order, each over the last, then the sprites
  paint(outlines: readonly MouseOutline[], sprites: ReadonlyArray<PaintableSprite> | null, isPaused?: boolean): void {
    // Recompute our dimensions if there has been a resize since last paint. The origin stays where it is until it next
    // moves.
    if (this.pendingDimensionChange) {
      this.fitContainer();
      this.position.viewport = this.viewportAt(this.zoom);
      this.pendingDimensionChange = false;
      // Sizing a canvas clears it, at the same size too
      this.drawn.invalidate();
      this.marksDrawn = "";
    }

    // While the GPU is still drawing the last frame, the map is left as it is, and the paint after it catches up
    const origin = this.position.origin;
    this.mapBehind = this.renderer.busy;
    if (!this.mapBehind) {
      const tiles = this.readTiles(origin, isPaused);
      const overlay = this.overlay;
      const view = {originX: origin.x, originY: origin.y, tilePixels: this.zoom * this.pixelRatio,
                    width: this.canvas.width, height: this.canvas.height};
      const damage = this.drawn.damage(view, tiles, sprites ?? []);
      if (damage !== null) {
        const pixels = view.tilePixels;
        buildMapFrame(this.frame, this.art, tiles, pixels,
                      overlay === null ? () => null : (x, y) => overlay.tileTint(x, y), sprites ?? [], damage);
        this.renderer.draw(this.frame, damage === "all" ? null : damage.map(({x, y, width, height}) => ({
          x: x * pixels, y: y * pixels, width: width * pixels, height: height * pixels,
        })));
      }
    }

    const boxes = outlines.map((outline) => ({
      outline, box: mouseOutlineLayout(outline, origin.x, origin.y, this.map.width, this.map.height, this.zoom),
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

  // The tiles in view, and a margin around them as wide as the farthest shadow reaches, whose anchors' shadows may
  // reach into the view
  private readTiles(origin: TilePoint, isPaused?: boolean): FrameTiles {
    const margin = this.art.shadowReach;
    const x = origin.x - margin;
    const y = origin.y - margin;
    const width = this.position.viewport.totalTilesInViewX + 2 * margin;
    const height = this.position.viewport.totalTilesInViewY + 2 * margin;

    const values = this.map.getTileValuesForPainting(x, y, width, height, this.values);
    const frames = this.frames;
    for (let i = 0; i < width * height; i++) {
      frames[i] = values[i];
    }
    this.animationManager.getTiles(frames, x, y, width, height, isPaused);

    return {x, y, width, height, margin, values, frames};
  }

  private viewportAt(zoom: number): Viewport {
    return viewport(this.width, this.height, zoom, this.map.width, this.map.height, true);
  }

  // Sizes the canvases to fill their container on-screen
  private fitContainer(): void {
    const parentNode = this.canvas.parentNode as HTMLElement;
    this.width = parentNode.clientWidth;
    this.height = parentNode.clientHeight;
    this.pixelRatio = window.devicePixelRatio || 1;

    for (const canvas of [this.canvas, this.marks]) {
      canvas.width = Math.round(this.width * this.pixelRatio);
      canvas.height = Math.round(this.height * this.pixelRatio);
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
    }
  }
}

export { GameCanvas, mouseOutlineLayout };
export type { MouseOutline };
