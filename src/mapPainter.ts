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

import { AnimationManager } from "./animationManager";
import type { PaintableCar } from "./cars";
import { CompositeRecord, FrameRecord, damagedPixels } from "./mapDamage";
import type { DrawnSquare } from "./mapDamage";
import { MapFrame, buildMapFrame, buildWholeMapFrame, squareOnView } from "./mapFrame";
import type { FrameTiles } from "./mapFrame";
import type { Tint } from "./overlayRenderer";
import type { PaintableMap, PaintableSprite } from "./paintable";
import type { MapArt } from "./renderAssets";
import type { RenderArt } from "./renderManifest";
import { drawnOrigin } from "./viewPosition";
import type { PixelPoint, TilePoint, ViewPosition } from "./viewPosition";
import { WebGLRenderer } from "./webglRenderer";

// The part of the map a painter draws: the view's origin, the point of the map at its top-left in tiles, which may lie
// between tiles; the tiles it shows across and down, the first and last of each perhaps only in part; and the device
// pixels a tile is drawn. The map is drawn from the origin snapped to whole device pixels (drawnOrigin).
export interface PaintedView {
  origin: TilePoint;
  across: number;
  down: number;
  tilePixels: number;
}

// The part of the map a view at the position shows, tilePixels device pixels a tile
export function paintedView(position: ViewPosition, tilePixels: number): PaintedView {
  const {tilesInViewX, tilesInViewY} = position.viewport;
  return {origin: position.origin, across: tilesInViewX, down: tilesInViewY, tilePixels};
}

// What a painter draws its frames with: the WebGL renderer, as webglRenderer.ts describes each
export type FrameRenderer = Pick<WebGLRenderer, "busy" | "needsWholeLayer" | "draw" | "drawOffscreen" | "release">;

// Where a painter draws: the size of the drawing buffer, in device pixels
interface Target {
  readonly width: number;
  readonly height: number;
}

// A car or a sprite, drawn over the map's layer
type OverLayer = {kind: "car", square: PaintableCar} | {kind: "sprite", square: PaintableSprite};

// A car's or a sprite's square on the view, as the frame draws it (squareOnView), rounded out to whole device pixels,
// with what it draws as text, its kind first, so a car and a sprite never share it
function drawnSquare(drawing: OverLayer, tiles: FrameTiles, tilePixels: number): DrawnSquare<OverLayer> {
  const {x, y, side} = squareOnView(drawing.square, tiles, tilePixels);
  return {drawing, key: `${drawing.kind}${JSON.stringify(drawing.square)}`, left: Math.floor(x), top: Math.floor(y),
          right: Math.ceil(x + side) - 1, bottom: Math.ceil(y + side) - 1};
}

// Draws views of the map from the map's art: the map's own view and the monster TV's. The renderer keeps the map in a
// layer of its own, which each paint draws again only where its picture would differ from the layer drawn last; a
// paint then composites the target where its picture would differ from the last composited (CompositeRecord): the
// layer copied over it, and the cars and the sprites there over that. It draws nothing while the GPU is still drawing
// the frame before.
export class MapPainter {
  private readonly frame = new MapFrame();
  // What the map's layer was last drawn from
  private readonly drawn = new FrameRecord();
  // What the target was last composited with
  private readonly composited = new CompositeRecord<OverLayer>();
  // The painter's own: the manager remembers what this view painted last
  private readonly animationManager: AnimationManager;
  // Whether the last paint left the target as it was, the GPU still drawing the frame before
  private behind = false;

  // The raw values of the tiles a paint reads, the tile ids it draws and their walkways, kept from paint to paint
  private readonly values: number[] = [];
  private readonly frames: number[] = [];
  private readonly walkways: number[] = [];

  // Draws on the target with the renderer, which keeps the map's layer from paint to paint
  constructor(private readonly target: Target, private readonly map: PaintableMap, private readonly art: RenderArt,
              private readonly renderer: FrameRenderer) {
    this.animationManager = new AnimationManager(map);
  }

  // A painter on the canvas, drawing with WebGL, which draws the whole view again once a context the browser lost is
  // restored
  static onCanvas(canvas: HTMLCanvasElement, map: PaintableMap, {art, atlases}: MapArt): MapPainter {
    // The renderer calls back only on a restore, an event that comes long after the painter is made
    const renderer = new WebGLRenderer(canvas, atlases, () => painter.invalidate());
    const painter = new MapPainter(canvas, map, art, renderer);
    return painter;
  }

  // Whether the target shows what the last paint read, drawn to the end: the last paint drew it, or found it drawn
  // already, and the GPU has finished drawing it
  get current(): boolean {
    return !this.behind && !this.renderer.busy;
  }

  // Draws the view, its tiles animated unless the city is paused, each tinted as tint gives it, and the cars and then
  // the sprites over them, unless it would draw the frame drawn last. Returns whether it drew a frame.
  paint(view: PaintedView, tint: (x: number, y: number) => Tint | null, cars: readonly PaintableCar[],
        sprites: readonly PaintableSprite[], isPaused?: boolean): boolean {
    this.behind = this.renderer.busy;
    if (this.behind) {
      return false;
    }

    const {tilePixels} = view;
    const origin = drawnOrigin(view.origin, tilePixels);
    const tiles = this.readTiles(view, origin, isPaused);
    const drawnView = {originX: origin.x, originY: origin.y, tilePixels, width: this.target.width,
                       height: this.target.height};
    if (this.renderer.needsWholeLayer) {
      this.drawn.invalidate();
    }
    const damage = this.drawn.damage(drawnView, tiles);
    const areas = damage === null ? [] : damage === "all" ? null : damagedPixels(damage, tilePixels, tiles.offset);
    const squares = [...cars.map((square) => drawnSquare({kind: "car", square}, tiles, tilePixels)),
                     ...sprites.map((square) => drawnSquare({kind: "sprite", square}, tiles, tilePixels))];
    const composite = this.composited.composite(this.target.width, this.target.height, areas, squares);
    if (composite === null) {
      return false;
    }

    // The cars and the sprites the composite draws, each in its order
    const drawnCars = composite.drawn.flatMap((drawing) => drawing.kind === "car" ? [drawing.square] : []);
    const drawnSprites = composite.drawn.flatMap((drawing) => drawing.kind === "sprite" ? [drawing.square] : []);
    buildMapFrame(this.frame, this.art, tiles, tilePixels, tint, drawnCars, drawnSprites, areas);
    this.renderer.draw(this.frame, areas, composite.areas);
    return true;
  }

  // Forgets the layer drawn last, so the next paint draws all of the view: for a change the painter doesn't see, such
  // as the overlay shown, or a target sized again, which clears it
  invalidate(): void {
    this.drawn.invalidate();
  }

  // The whole map, tilePixels a tile, each tile's own value unanimated, with no sprites or tints, drawn offscreen: its
  // pixels, RGBA from the top row down, and its size, or null while the context is lost
  drawWholeMap(tilePixels: number): {pixels: Uint8ClampedArray, width: number, height: number} | null {
    const frame = new MapFrame();
    buildWholeMapFrame(frame, this.art, this.map, tilePixels);
    const width = this.map.width * tilePixels;
    const height = this.map.height * tilePixels;
    const pixels = this.renderer.drawOffscreen(frame, width, height);
    return pixels === null ? null : {pixels, width, height};
  }

  // Lets go of the context and everything it holds, after which the painter draws nothing
  release(): void {
    this.renderer.release();
  }

  // The tiles in view, from the drawn origin, in device pixels, and a margin around them as wide as a tile's look
  // reaches, whose anchors' shadows may reach into the view and whose woods the canopy of a tile in view is drawn from
  private readTiles({across, down, tilePixels}: PaintedView, origin: PixelPoint, isPaused?: boolean): FrameTiles {
    const margin = this.art.reach;
    // The tile at the view's top-left, and how far into it the view starts
    const first = {x: Math.floor(origin.x / tilePixels), y: Math.floor(origin.y / tilePixels)};
    const offset = {x: origin.x - first.x * tilePixels, y: origin.y - first.y * tilePixels};
    const x = first.x - margin;
    const y = first.y - margin;
    const width = Math.ceil((offset.x + across * tilePixels) / tilePixels) + 2 * margin;
    const height = Math.ceil((offset.y + down * tilePixels) / tilePixels) + 2 * margin;

    const values = this.map.getTileValuesForPainting(x, y, width, height, this.values);
    const frames = this.frames;
    for (let i = 0; i < width * height; i++) {
      frames[i] = values[i];
    }
    this.animationManager.getTiles(frames, x, y, width, height, isPaused);

    const walkways = this.map.getWalkwaysForPainting(x, y, width, height, this.walkways);
    return {x, y, width, height, margin, offset, values, frames, walkways};
  }
}
