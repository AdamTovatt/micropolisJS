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
import { MapFrame, buildMapFrame } from "./mapFrame";
import type { FrameTiles } from "./mapFrame";
import type { Tint } from "./overlayRenderer";
import type { PaintableMap, PaintableSprite } from "./paintable";
import type { MapArt } from "./renderAssets";
import type { RenderArt } from "./renderManifest";
import type { TilePoint } from "./viewPosition";
import { WebGLRenderer } from "./webglRenderer";

// The part of the map a painter draws: the view's top-left tile, the tiles it shows across and down, the last of each
// perhaps only in part, and the device pixels a tile is drawn
export interface PaintedView {
  origin: TilePoint;
  across: number;
  down: number;
  tilePixels: number;
}

// Draws a view of the map with the WebGL renderer on a canvas, from the map's art, as the map's own view draws it: the
// monster TV's. Each paint draws only the part of the view whose picture would differ from the frame drawn last, and
// nothing while the GPU is still drawing that frame.
export class MapPainter {
  private readonly renderer: WebGLRenderer;
  private readonly art: RenderArt;
  private readonly frame = new MapFrame();
  // What the canvas was last drawn from
  private readonly drawn = new FrameRecord();
  // The painter's own: the manager remembers what this view painted last
  private readonly animationManager: AnimationManager;
  // Whether the last paint left the canvas as it was, the GPU still drawing the frame before
  private behind = false;

  // The raw values of the tiles a paint reads, and the tile ids it draws, kept from paint to paint
  private readonly values: number[] = [];
  private readonly frames: number[] = [];

  // Draws on the canvas, whose drawing buffer the painter keeps, so a paint draws over what the last one drew
  constructor(private readonly canvas: HTMLCanvasElement, private readonly map: PaintableMap, {art, atlases}: MapArt) {
    this.art = art;
    this.renderer = new WebGLRenderer(canvas, atlases, () => this.drawn.invalidate());
    this.animationManager = new AnimationManager(map);
  }

  // Whether the canvas shows what the last paint read, drawn to the end: the last paint drew it, or found it drawn
  // already, and the GPU has finished drawing it
  get current(): boolean {
    return !this.behind && !this.renderer.busy;
  }

  // Draws the view, its tiles animated unless the city is paused, each tinted as tint gives it, and the sprites over
  // them, as far as it differs from the frame drawn last
  paint(view: PaintedView, tint: (x: number, y: number) => Tint | null, sprites: readonly PaintableSprite[],
        isPaused?: boolean): void {
    this.behind = this.renderer.busy;
    if (this.behind) {
      return;
    }

    const tiles = this.readTiles(view, isPaused);
    const {tilePixels} = view;
    const drawnView = {originX: view.origin.x, originY: view.origin.y, tilePixels, width: this.canvas.width,
                       height: this.canvas.height};
    const damage = this.drawn.damage(drawnView, tiles, sprites);
    if (damage === null) {
      return;
    }

    const areas = damage === "all" ? null : damagedPixels(damage, tilePixels);
    buildMapFrame(this.frame, this.art, tiles, tilePixels, tint, sprites, areas);
    this.renderer.draw(this.frame, areas);
  }

  // Lets go of the canvas's context and everything it holds, after which the painter draws nothing
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
