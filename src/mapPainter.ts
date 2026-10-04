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
import { FrameRecord, damagedPixels } from "./mapDamage";
import { MapFrame, buildMapFrame, buildWholeMapFrame } from "./mapFrame";
import type { FrameTiles } from "./mapFrame";
import type { Tint } from "./overlayRenderer";
import type { PaintableMap, PaintableSprite } from "./paintable";
import type { MapArt } from "./renderAssets";
import type { RenderArt } from "./renderManifest";
import type { TilePoint, ViewPosition } from "./viewPosition";
import { WebGLRenderer } from "./webglRenderer";

// The part of the map a painter draws: the view's top-left tile, the tiles it shows across and down, the last of each
// perhaps only in part, and the device pixels a tile is drawn
export interface PaintedView {
  origin: TilePoint;
  across: number;
  down: number;
  tilePixels: number;
}

// The part of the map a view at the position shows, tilePixels device pixels a tile
export function paintedView(position: ViewPosition, tilePixels: number): PaintedView {
  const {totalTilesInViewX, totalTilesInViewY} = position.viewport;
  return {origin: position.origin, across: totalTilesInViewX, down: totalTilesInViewY, tilePixels};
}

// What a painter draws its frames with: the WebGL renderer, as webglRenderer.ts describes each
export type FrameRenderer = Pick<WebGLRenderer, "busy" | "draw" | "drawOffscreen" | "release">;

// Where a painter draws: the size of the drawing buffer, in device pixels
interface Target {
  readonly width: number;
  readonly height: number;
}

// Draws views of the map from the map's art: the map's own view and the monster TV's. Each paint draws only the part
// of the view whose picture would differ from the frame drawn last, and nothing while the GPU is still drawing that
// frame.
export class MapPainter {
  private readonly frame = new MapFrame();
  // What the target was last drawn from
  private readonly drawn = new FrameRecord();
  // The painter's own: the manager remembers what this view painted last
  private readonly animationManager: AnimationManager;
  // Whether the last paint left the target as it was, the GPU still drawing the frame before
  private behind = false;

  // The raw values of the tiles a paint reads, and the tile ids it draws, kept from paint to paint
  private readonly values: number[] = [];
  private readonly frames: number[] = [];

  // Draws on the target with the renderer, which keeps the target's drawing buffer, so a paint draws over what the
  // last one drew
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

  // Draws the view, its tiles animated unless the city is paused, each tinted as tint gives it, and the sprites over
  // them, as far as it differs from the frame drawn last. Returns whether it drew a frame.
  paint(view: PaintedView, tint: (x: number, y: number) => Tint | null, sprites: readonly PaintableSprite[],
        isPaused?: boolean): boolean {
    this.behind = this.renderer.busy;
    if (this.behind) {
      return false;
    }

    const tiles = this.readTiles(view, isPaused);
    const {tilePixels} = view;
    const drawnView = {originX: view.origin.x, originY: view.origin.y, tilePixels, width: this.target.width,
                       height: this.target.height};
    const damage = this.drawn.damage(drawnView, tiles, sprites);
    if (damage === null) {
      return false;
    }

    const areas = damage === "all" ? null : damagedPixels(damage, tilePixels);
    buildMapFrame(this.frame, this.art, tiles, tilePixels, tint, sprites, areas);
    this.renderer.draw(this.frame, areas);
    return true;
  }

  // Forgets the frame drawn last, so the next paint draws all of the view: for a change the painter doesn't see, such
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

  // The tiles in view, and a margin around them as wide as the farthest shadow reaches, whose anchors' shadows may
  // reach into the view
  private readTiles({origin, across, down}: PaintedView, isPaused?: boolean): FrameTiles {
    const margin = this.art.shadowReach;
    const x = origin.x - margin;
    const y = origin.y - margin;
    const width = across + 2 * margin;
    const height = down + 2 * margin;

    const values = this.map.getTileValuesForPainting(x, y, width, height, this.values);
    const frames = this.frames;
    for (let i = 0; i < width * height; i++) {
      frames[i] = values[i];
    }
    this.animationManager.getTiles(frames, x, y, width, height, isPaused);

    return {x, y, width, height, margin, values, frames};
  }
}
