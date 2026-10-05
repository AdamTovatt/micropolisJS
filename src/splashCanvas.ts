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

import { placeNewCanvas, requiredElement, screenPixelRatio, sizeCanvas } from "./domElements";
import { MapFrame, buildWholeMapFrame } from "./mapFrame";
import type { PaintableMap } from "./paintable";
import type { MapArt } from "./renderAssets";
import type { RenderArt } from "./renderManifest";
import { WebGLRenderer } from "./webglRenderer";
import type { AtlasImage } from "./webglRenderer";

// What the preview reads of the map
type PreviewMap = Pick<PaintableMap, "width" | "height" | "getTileValuesForPainting">;

// Each tile is drawn this many CSS pixels square
const PREVIEW_TILE_SIZE = 3;

const CANVAS_ID = "SplashCanvas";

// The atlases the preview draws from: the 16 px sheets are filtered as the rendered art is. At the preview's few pixels
// a tile, nearest-neighbour would draw each tile as the few of its texels that happen to land on a pixel.
function previewAtlases(atlases: ReadonlyMap<string, AtlasImage>): Map<string, AtlasImage> {
  const filtered = new Map<string, AtlasImage>();
  atlases.forEach((atlas, name) => filtered.set(name, {...atlas, crisp: false}));
  return filtered;
}

// Paints the minimap the player sees when choosing a map to play on, from the map's art with the map's renderer: the
// whole map, painted once, and again whenever the player generates a new one, or the browser restores a context it
// lost. The canvas's backing store has devicePixelRatio pixels for each CSS pixel, as the map's does.
class SplashCanvas {
  static readonly DEFAULT_WIDTH = 360;
  static readonly DEFAULT_HEIGHT = 300;

  private readonly art: RenderArt;
  private readonly renderer: WebGLRenderer;
  private readonly frame = new MapFrame();
  private readonly pixelRatio: number;
  // The map last asked for, or null before the first
  private map: PreviewMap | null = null;

  // Creates the canvas in the container with the given id, replacing an earlier preview's canvas there. It paints
  // nothing until asked to paint a map.
  constructor(parentId: string, {art, atlases}: MapArt) {
    const canvas = placeNewCanvas(requiredElement(parentId), CANVAS_ID);
    this.pixelRatio = screenPixelRatio();
    sizeCanvas(canvas, SplashCanvas.DEFAULT_WIDTH, SplashCanvas.DEFAULT_HEIGHT, this.pixelRatio);

    this.art = art;
    this.renderer = new WebGLRenderer(canvas, previewAtlases(atlases), () => this.draw());
  }

  paint(map: PreviewMap): void {
    this.map = map;
    this.draw();
  }

  // Lets go of the context and the textures it holds, after which the preview paints nothing: for when the splash
  // screen closes, before the map's own context is made
  release(): void {
    this.renderer.release();
  }

  private draw(): void {
    if (this.map === null) {
      return;
    }

    buildWholeMapFrame(this.frame, this.art, this.map, PREVIEW_TILE_SIZE * this.pixelRatio);
    this.renderer.draw(this.frame, null);
  }
}

export { PREVIEW_TILE_SIZE, SplashCanvas, previewAtlases };
export type { PreviewMap };
